import { useEffect, useMemo, useRef } from 'react';
import type { ResultadoValidacion, TipoError } from '../lib/validador.ts';

const ETIQUETA: Record<TipoError, string> = {
  sintaxis: 'Sintaxis',
  estructura: 'Estructura',
  esquema: 'Esquema XSD',
  xsd: 'Validación XSD',
};

interface Props {
  resultado: ResultadoValidacion;
  nombreXml: string;
  xml: string;
}

/** Simplifica el mensaje de libxml2 quitando el prefijo repetitivo. */
const limpiar = (m: string) => m.replace(/^Schemas validity error\s*:\s*/i, '');

export function Resultado({ resultado, nombreXml, xml }: Props) {
  const lineasError = useMemo(() => new Set(resultado.errores.map((e) => e.linea).filter((l): l is number => !!l)), [resultado]);
  const visor = useRef<HTMLDivElement>(null);
  const lineas = useMemo(() => xml.split(/\r?\n/), [xml]);

  const irALinea = (linea: number) => {
    const el = visor.current?.querySelector<HTMLElement>(`[data-linea="${linea}"]`);
    if (el && visor.current) visor.current.scrollTop = el.offsetTop - visor.current.clientHeight / 3;
  };

  // Al mostrar un resultado, desplaza el visor al primer error (o al inicio de la addenda)
  useEffect(() => {
    const primera = resultado.errores.find((e) => e.linea)?.linea ?? resultado.elementos[0]?.linea;
    if (primera) irALinea(primera);
  }, [resultado]);

  const enAddenda = (n: number) => resultado.elementos.some((el) => n >= el.linea && n <= el.lineaFin);

  return (
    <section className={`resultado ${resultado.valido ? 'ok' : 'mal'}`} aria-live="polite">
      <header className="resultado-encabezado">
        <span className="resultado-icono" aria-hidden>
          {resultado.valido ? '✓' : '✕'}
        </span>
        <div>
          <h2>{resultado.valido ? 'Addenda válida' : 'Addenda inválida'}</h2>
          <p>
            {nombreXml}
            {resultado.xsdPrincipal && <> · validado contra <strong>{resultado.xsdPrincipal}</strong></>}
            {!resultado.valido && (
              <>
                {' '}
                · {resultado.errores.length} error{resultado.errores.length === 1 ? '' : 'es'}
              </>
            )}
          </p>
        </div>
      </header>

      {resultado.avisos.map((a) => (
        <p key={a} className="aviso">
          {a}
        </p>
      ))}

      {resultado.errores.length > 0 && (
        <ol className="errores">
          {resultado.errores.map((e, i) => (
            <li key={i}>
              <div className="error-meta">
                <span className={`chip chip-${e.tipo}`}>{ETIQUETA[e.tipo]}</span>
                {e.linea ? (
                  <button type="button" className="btn-linea" onClick={() => irALinea(e.linea!)}>
                    Línea {e.linea}
                  </button>
                ) : null}
              </div>
              <p className="error-mensaje">{limpiar(e.mensaje)}</p>
            </li>
          ))}
        </ol>
      )}

      {resultado.elementos.length > 0 && (
        <p className="detalle">
          Elementos validados:{' '}
          {resultado.elementos.map((el) => (
            <code key={el.elemento + el.linea}>
              {el.elemento} (línea {el.linea})
            </code>
          ))}
        </p>
      )}

      {xml && (
        <div className="visor" ref={visor}>
          <pre>
            {lineas.map((texto, i) => {
              const n = i + 1;
              const clase = lineasError.has(n) ? 'linea error' : enAddenda(n) ? 'linea addenda' : 'linea';
              return (
                <span key={n} className={clase} data-linea={n}>
                  <span className="num">{n}</span>
                  {texto || ' '}
                  {'\n'}
                </span>
              );
            })}
          </pre>
        </div>
      )}
    </section>
  );
}
