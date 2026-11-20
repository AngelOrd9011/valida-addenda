import { useState } from 'react';
import { SelectorArchivo } from './components/SelectorArchivo.tsx';
import { Resultado } from './components/Resultado.tsx';
import { validarAddenda } from './lib/validador.ts';
import type { ResultadoValidacion } from './lib/validador.ts';

interface Estado {
  resultado: ResultadoValidacion;
  nombreXml: string;
  xml: string;
}

export default function App() {
  const [xml, setXml] = useState<File[]>([]);
  const [xsd, setXsd] = useState<File[]>([]);
  const [validando, setValidando] = useState(false);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [falla, setFalla] = useState<string | null>(null);

  const cambiar = (set: (f: File[]) => void) => (f: File[]) => {
    set(f);
    setEstado(null);
    setFalla(null);
  };

  const validar = async () => {
    if (!xml[0] || !xsd.length) return;
    setValidando(true);
    setFalla(null);
    try {
      const textoXml = await xml[0].text();
      const esquemas = await Promise.all(xsd.map(async (f) => ({ nombre: f.name, contenido: await f.text() })));
      const resultado = await validarAddenda(textoXml, esquemas);
      setEstado({ resultado, nombreXml: xml[0].name, xml: textoXml });
    } catch (e) {
      setEstado(null);
      setFalla(e instanceof Error ? e.message : String(e));
    } finally {
      setValidando(false);
    }
  };

  const listo = xml.length > 0 && xsd.length > 0;

  return (
    <main className="app">
      <header className="cabecera">
        <h1>Validador de addenda CFDI</h1>
        <p>
          Sube el XML del CFDI y el XSD de la addenda. La validación se hace en tu navegador; los archivos no se envían
          a ningún servidor.
        </p>
      </header>

      <div className="selectores">
        <SelectorArchivo
          titulo="CFDI"
          descripcion="Comprobante con el nodo cfdi:Addenda"
          extension=".xml"
          archivos={xml}
          onCambio={cambiar(setXml)}
        />
        <SelectorArchivo
          titulo="Esquema de la addenda"
          descripcion="Puedes subir varios si el XSD usa include/import"
          extension=".xsd"
          multiple
          archivos={xsd}
          onCambio={cambiar(setXsd)}
        />
      </div>

      <div className="barra-accion">
        <button type="button" className="btn-primario" disabled={!listo || validando} onClick={validar}>
          {validando ? 'Validando…' : 'Validar addenda'}
        </button>
        {!listo && <span className="pista">Selecciona ambos archivos para continuar.</span>}
      </div>

      {falla && (
        <p className="falla" role="alert">
          No se pudo validar: {falla}
        </p>
      )}
      {estado && <Resultado {...estado} />}
    </main>
  );
}
