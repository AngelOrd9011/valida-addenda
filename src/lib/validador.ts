import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { Document, Element, Node } from '@xmldom/xmldom';
import { validateXML } from 'xmllint-wasm';

/* ------------------------------------------------------------------ */
/* Tipos públicos                                                      */
/* ------------------------------------------------------------------ */

export interface ArchivoTexto {
  nombre: string;
  contenido: string;
}

export type TipoError = 'sintaxis' | 'estructura' | 'esquema' | 'xsd';

export interface ErrorValidacion {
  tipo: TipoError;
  mensaje: string;
  /** Línea en el archivo CFDI original (null si no aplica). */
  linea: number | null;
  elemento?: string;
}

export interface ResultadoElemento {
  elemento: string;
  namespace: string | null;
  linea: number;
  /** Última línea (aproximada) que ocupa el elemento en el CFDI. */
  lineaFin: number;
  valido: boolean;
  errores: ErrorValidacion[];
}

export interface ResultadoValidacion {
  valido: boolean;
  errores: ErrorValidacion[];
  avisos: string[];
  /** Elementos de la addenda que se validaron contra el XSD. */
  elementos: ResultadoElemento[];
  /** XSD tomado como principal (los demás se cargan como include/import). */
  xsdPrincipal: string | null;
  /** Elementos globales que declara el XSD, en notación {namespace}nombre. */
  elementosDeclarados: string[];
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const NS_CFDI = ['http://www.sat.gob.mx/cfd/4', 'http://www.sat.gob.mx/cfd/3'];
const NS_XSD = 'http://www.w3.org/2001/XMLSchema';
const NS_XMLNS = 'http://www.w3.org/2000/xmlns/';
const NOMBRE_FRAGMENTO = 'addenda.xml';

const sinBom = (t: string) => t.replace(/^﻿/, '');
const qname = (ns: string | null, local: string) => (ns ? `{${ns}}${local}` : local);

function parsear(texto: string): { doc: Document | null; errores: string[] } {
  const errores: string[] = [];
  let doc: Document | null = null;
  try {
    doc = new DOMParser({
      onError: (nivel, mensaje) => {
        if (nivel !== 'warning') errores.push(String(mensaje).trim());
      },
    }).parseFromString(sinBom(texto), 'text/xml');
  } catch (e) {
    errores.push(e instanceof Error ? e.message : String(e));
  }
  return { doc, errores };
}

function hijos(nodo: Node): Element[] {
  const res: Element[] = [];
  for (let n = nodo.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1) res.push(n as Element);
  }
  return res;
}

/** Elige el XSD principal: el que no es referenciado por ningún otro. */
function elegirPrincipal(esquemas: ArchivoTexto[]): ArchivoTexto {
  const referenciados = new Set<string>();
  for (const e of esquemas) {
    for (const m of e.contenido.matchAll(/schemaLocation\s*=\s*["']([^"']+)["']/g)) {
      referenciados.add(m[1].split(/[\\/]/).pop()!.toLowerCase());
    }
  }
  return esquemas.find((e) => !referenciados.has(e.nombre.toLowerCase())) ?? esquemas[0];
}

/** Lista los elementos globales (hijos directos de xs:schema) de todos los XSD. */
function elementosGlobales(esquemas: ArchivoTexto[], nsPrincipal: string | null) {
  const res: { ns: string | null; nombre: string }[] = [];
  for (const e of esquemas) {
    const raiz = parsear(e.contenido).doc?.documentElement;
    if (!raiz) continue;
    // Un XSD sin targetNamespace incluido adopta el del principal ("chameleon include")
    const ns = raiz.getAttribute('targetNamespace') || nsPrincipal;
    for (const el of hijos(raiz)) {
      if (el.namespaceURI === NS_XSD && el.localName === 'element' && el.getAttribute('name')) {
        res.push({ ns, nombre: el.getAttribute('name')! });
      }
    }
  }
  return res;
}

/** Busca dentro del subárbol los elementos que coincidan con una declaración global. */
function buscarCoincidencias(nodo: Element, declarados: Set<string>, acc: Element[] = []): Element[] {
  if (declarados.has(qname(nodo.namespaceURI, nodo.localName!))) {
    acc.push(nodo);
    return acc;
  }
  for (const h of hijos(nodo)) buscarCoincidencias(h, declarados, acc);
  return acc;
}

/** Copia un elemento cambiando el namespace `de` por `a` (en él y sus descendientes). */
function clonarConNamespace(doc: Document, nodo: Node, de: string, a: string): Node | null {
  if (nodo.nodeType === 3 || nodo.nodeType === 4) return doc.createTextNode(nodo.nodeValue ?? '');
  if (nodo.nodeType !== 1) return null;
  const el = nodo as Element;
  const ns = el.namespaceURI === de ? a : el.namespaceURI;
  const copia = doc.createElementNS(ns, el.tagName);
  for (let i = 0; i < el.attributes.length; i++) {
    const at = el.attributes.item(i)!;
    if (at.namespaceURI === NS_XMLNS) {
      if (at.value === de) continue; // la declaración vieja la regenera el serializador
      copia.setAttributeNS(NS_XMLNS, at.name, at.value);
    } else {
      copia.setAttributeNS(at.namespaceURI, at.name, at.value);
    }
  }
  for (let h = el.firstChild; h; h = h.nextSibling) {
    const c = clonarConNamespace(doc, h, de, a);
    if (c) copia.appendChild(c);
  }
  return copia;
}

/* ------------------------------------------------------------------ */
/* Validación                                                          */
/* ------------------------------------------------------------------ */

/**
 * Valida la addenda de un CFDI contra uno o varios XSD.
 * Si se pasan varios XSD, el principal es el que no es referenciado por los demás.
 */
export async function validarAddenda(xml: string, esquemas: ArchivoTexto[]): Promise<ResultadoValidacion> {
  const r: ResultadoValidacion = {
    valido: false,
    errores: [],
    avisos: [],
    elementos: [],
    xsdPrincipal: null,
    elementosDeclarados: [],
  };
  const fallar = (tipo: TipoError, mensaje: string, linea: number | null = null) => {
    r.errores.push({ tipo, mensaje, linea });
    return r;
  };

  if (!esquemas.length) return fallar('esquema', 'No se proporcionó ningún archivo XSD');

  // 1. XSD
  const principal = elegirPrincipal(esquemas);
  r.xsdPrincipal = principal.nombre;
  const xsd = parsear(principal.contenido);
  if (!xsd.doc?.documentElement || xsd.errores.length) {
    return fallar('esquema', `El XSD "${principal.nombre}" no es un XML válido: ${xsd.errores.join('; ')}`);
  }
  const nsDestino = xsd.doc.documentElement.getAttribute('targetNamespace') || null;
  const globales = elementosGlobales(esquemas, nsDestino);
  r.elementosDeclarados = globales.map((g) => qname(g.ns, g.nombre));
  if (!globales.length) return fallar('esquema', 'El XSD no declara ningún elemento global');

  // 2. CFDI bien formado
  const { doc, errores } = parsear(xml);
  if (!doc?.documentElement || errores.length) {
    for (const e of errores.length ? errores : ['No se pudo leer el XML']) {
      const m = /line:\s*(\d+)/i.exec(e);
      fallar('sintaxis', e, m ? Number(m[1]) : null);
    }
    return r;
  }

  // 3. Nodo raíz y cfdi:Addenda
  const raiz = doc.documentElement;
  if (raiz.localName !== 'Comprobante' || !NS_CFDI.includes(raiz.namespaceURI ?? '')) {
    return fallar(
      'estructura',
      `El nodo raíz no es cfdi:Comprobante (se encontró ${qname(raiz.namespaceURI, raiz.localName!)})`,
      raiz.lineNumber ?? null,
    );
  }
  const addenda = hijos(raiz).find((n) => n.localName === 'Addenda' && n.namespaceURI === raiz.namespaceURI);
  if (!addenda) return fallar('estructura', 'El CFDI no contiene el nodo cfdi:Addenda');
  if (!hijos(addenda).length && !addenda.textContent?.trim()) {
    return fallar('estructura', 'El nodo cfdi:Addenda está vacío', addenda.lineNumber ?? null);
  }

  // 4. Determinar qué validar
  const declarados = new Set(r.elementosDeclarados);
  let objetivos: { elemento: Element; nodo: Node }[] = buscarCoincidencias(addenda, declarados).map((e) => ({
    elemento: e,
    nodo: e,
  }));

  if (!objetivos.length) {
    // El XSD declara su propio nodo "Addenda" en otro namespace: se valida cfdi:Addenda
    // tratándolo como si estuviera en el namespace del XSD.
    const declaraAddenda = globales.find((g) => g.nombre === 'Addenda');
    if (declaraAddenda && declaraAddenda.ns !== addenda.namespaceURI) {
      objetivos = [
        { elemento: addenda, nodo: clonarConNamespace(doc, addenda, addenda.namespaceURI!, declaraAddenda.ns ?? '')! },
      ];
      r.avisos.push(
        `El XSD declara ${qname(declaraAddenda.ns, 'Addenda')}; se validó el nodo cfdi:Addenda ` +
          `cambiando su namespace de "${addenda.namespaceURI}" a "${declaraAddenda.ns ?? '(sin namespace)'}".`,
      );
    } else {
      const encontrados = hijos(addenda).map((h) => qname(h.namespaceURI, h.localName!));
      return fallar(
        'estructura',
        `Dentro de cfdi:Addenda no hay ningún elemento declarado en el XSD. ` +
          `Esperado: ${r.elementosDeclarados.join(', ')}. Encontrado: ${encontrados.join(', ') || '(solo texto)'}`,
        addenda.lineNumber ?? null,
      );
    }
  }

  // 5. Validar cada elemento con libxml2
  const serializador = new XMLSerializer();
  const otros = esquemas.filter((e) => e !== principal).map((e) => ({ fileName: e.nombre, contents: sinBom(e.contenido) }));

  for (const { elemento, nodo } of objetivos) {
    const lineaBase = elemento.lineNumber ?? 1;
    // Se rellenan saltos de línea para que los números de línea coincidan con el CFDI
    const fragmento = '\n'.repeat(lineaBase - 1) + serializador.serializeToString(nodo);
    const res = await validateXML({
      xml: { fileName: NOMBRE_FRAGMENTO, contents: fragmento },
      schema: { fileName: principal.nombre, contents: sinBom(principal.contenido) },
      preload: otros,
    });

    const errs: ErrorValidacion[] = res.errors.map((e) => {
      const enXml = !e.loc || e.loc.fileName === NOMBRE_FRAGMENTO;
      return {
        tipo: enXml ? 'xsd' : 'esquema',
        linea: enXml && e.loc ? e.loc.lineNumber : null,
        mensaje: (enXml ? '' : `[${e.loc!.fileName}:${e.loc!.lineNumber}] `) + e.message.trim(),
        elemento: elemento.tagName,
      };
    });
    if (!res.valid && !errs.length) {
      errs.push({ tipo: 'xsd', linea: null, mensaje: res.rawOutput.trim() || 'Error de validación', elemento: elemento.tagName });
    }
    r.elementos.push({
      elemento: elemento.tagName,
      namespace: elemento.namespaceURI,
      linea: lineaBase,
      lineaFin: fragmento.split('\n').length,
      valido: res.valid,
      errores: errs,
    });
    r.errores.push(...errs);
  }

  r.valido = r.elementos.every((e) => e.valido);
  return r;
}
