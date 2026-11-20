import test from 'node:test';
import assert from 'node:assert';
import { validarAddenda } from '../src/lib/validador.ts';

// XSD que declara su propio nodo Addenda (en un namespace distinto al del CFDI)
const xsdAddenda = [
  {
    nombre: 'addenda.xsd',
    contenido: `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:addenda"
      xmlns="urn:addenda" elementFormDefault="qualified">
      <xs:element name="Addenda"><xs:complexType><xs:sequence>
        <xs:element name="correoProveedor" type="xs:string"/>
        <xs:element name="correoCliente" type="xs:string"/>
        <xs:element name="conceptos"><xs:complexType><xs:sequence>
          <xs:element name="concepto" maxOccurs="unbounded"><xs:complexType><xs:sequence>
            <xs:element name="pedido" type="xs:string"/>
            <xs:element name="numEntrega" type="xs:string" minOccurs="0"/>
          </xs:sequence></xs:complexType></xs:element>
        </xs:sequence></xs:complexType></xs:element>
      </xs:sequence></xs:complexType></xs:element>
    </xs:schema>`,
  },
];
const cfdiAddenda = (cuerpo: string) => `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0">
  <cfdi:Emisor Rfc="EKU9003173C9"/>
  <cfdi:Addenda xmlns="urn:addenda">
${cuerpo}
  </cfdi:Addenda>
</cfdi:Comprobante>`;
const addendaValida = `    <correoProveedor>a@proveedor.mx</correoProveedor>
    <correoCliente>b@cliente.mx</correoCliente>
    <conceptos><concepto><pedido>4500012345</pedido></concepto></conceptos>`;
// Falta correoCliente (línea 6) y el concepto no tiene pedido
const addendaInvalida = `    <correoProveedor>a@proveedor.mx</correoProveedor>
    <conceptos><concepto><numEntrega>1</numEntrega></concepto></conceptos>`;

// XSD que declara un elemento propio que va DENTRO de cfdi:Addenda
const xsdHijo = [
  {
    nombre: 'comercial.xsd',
    contenido: `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:comercial"
      xmlns:c="urn:comercial" elementFormDefault="qualified">
      <xs:element name="Comercial"><xs:complexType>
        <xs:attribute name="Proveedor" use="required"><xs:simpleType>
          <xs:restriction base="xs:string"><xs:pattern value="[0-9]{6}"/></xs:restriction>
        </xs:simpleType></xs:attribute>
      </xs:complexType></xs:element></xs:schema>`,
  },
];
const cfdi = (addenda: string) => `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0">
  <cfdi:Addenda>
    ${addenda}
  </cfdi:Addenda>
</cfdi:Comprobante>`;

test('XSD que declara Addenda: CFDI válido', async () => {
  const r = await validarAddenda(cfdiAddenda(addendaValida), xsdAddenda);
  assert.deepStrictEqual(r.errores, []);
  assert.strictEqual(r.valido, true);
  assert.strictEqual(r.avisos.length, 1);
});

test('XSD que declara Addenda: CFDI inválido reporta líneas del archivo original', async () => {
  const r = await validarAddenda(cfdiAddenda(addendaInvalida), xsdAddenda);
  assert.strictEqual(r.valido, false);
  assert.strictEqual(r.errores[0].linea, 6);
  assert.match(r.errores[0].mensaje, /Expected is \( \{urn:addenda\}correoCliente \)/);
});

test('XSD que declara un elemento hijo de la addenda', async () => {
  const ok = await validarAddenda(cfdi('<c:Comercial xmlns:c="urn:comercial" Proveedor="123456"/>'), xsdHijo);
  assert.strictEqual(ok.valido, true);
  const mal = await validarAddenda(cfdi('<c:Comercial xmlns:c="urn:comercial" Proveedor="12AB"/>'), xsdHijo);
  assert.strictEqual(mal.valido, false);
  assert.strictEqual(mal.errores[0].linea, 3);
});

test('Addenda con elementos que el XSD no declara', async () => {
  const r = await validarAddenda(cfdi('<otra:Cosa xmlns:otra="urn:otra"/>'), xsdHijo);
  assert.strictEqual(r.valido, false);
  assert.match(r.errores[0].mensaje, /no hay ningún elemento declarado/);
});

test('XML mal formado', async () => {
  const r = await validarAddenda('<a><b></a>', xsdAddenda);
  assert.strictEqual(r.errores[0].tipo, 'sintaxis');
});

test('CFDI sin addenda', async () => {
  const r = await validarAddenda('<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"/>', xsdAddenda);
  assert.match(r.errores[0].mensaje, /no contiene el nodo cfdi:Addenda/);
});

test('XSD con include: se elige el principal automáticamente', async () => {
  const tipos = {
    nombre: 'tipos.xsd',
    contenido: `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:comercial">
      <xs:simpleType name="TProv"><xs:restriction base="xs:string"><xs:pattern value="[0-9]{6}"/></xs:restriction></xs:simpleType>
    </xs:schema>`,
  };
  const principal = {
    nombre: 'principal.xsd',
    contenido: `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:comercial"
      xmlns:c="urn:comercial" elementFormDefault="qualified">
      <xs:include schemaLocation="tipos.xsd"/>
      <xs:element name="Comercial"><xs:complexType>
        <xs:attribute name="Proveedor" type="c:TProv" use="required"/>
      </xs:complexType></xs:element></xs:schema>`,
  };
  const r = await validarAddenda(cfdi('<c:Comercial xmlns:c="urn:comercial" Proveedor="12AB"/>'), [tipos, principal]);
  assert.strictEqual(r.xsdPrincipal, 'principal.xsd');
  assert.strictEqual(r.valido, false);
  assert.match(r.errores[0].mensaje, /pattern/);
});
