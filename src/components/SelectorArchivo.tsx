import { useId, useRef, useState } from 'react';
import type { DragEvent } from 'react';

interface Props {
  titulo: string;
  descripcion: string;
  extension: '.xml' | '.xsd';
  multiple?: boolean;
  archivos: File[];
  onCambio: (archivos: File[]) => void;
}

export function SelectorArchivo({ titulo, descripcion, extension, multiple, archivos, onCambio }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const aceptar = (lista: FileList | null) => {
    const validos = Array.from(lista ?? []).filter((f) => f.name.toLowerCase().endsWith(extension));
    if (validos.length) onCambio(multiple ? validos : validos.slice(0, 1));
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    aceptar(e.dataTransfer.files);
  };

  return (
    <div
      className={`selector ${arrastrando ? 'arrastrando' : ''} ${archivos.length ? 'cargado' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={soltar}
    >
      <div className="selector-encabezado">
        <span className="selector-ext">{extension.slice(1).toUpperCase()}</span>
        <div>
          <h2>{titulo}</h2>
          <p>{descripcion}</p>
        </div>
      </div>

      <input
        ref={input}
        id={id}
        type="file"
        accept={extension}
        multiple={multiple}
        hidden
        onChange={(e) => {
          aceptar(e.target.files);
          e.target.value = '';
        }}
      />

      {archivos.length ? (
        <ul className="selector-lista">
          {archivos.map((f) => (
            <li key={f.name}>
              <span className="nombre">{f.name}</span>
              <span className="tam">{(f.size / 1024).toFixed(1)} KB</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="selector-vacio">Arrastra el archivo aquí o</p>
      )}

      <div className="selector-acciones">
        <button type="button" className="btn-secundario" onClick={() => input.current?.click()}>
          {archivos.length ? 'Cambiar' : 'Seleccionar archivo'}
          {multiple && !archivos.length ? 's' : ''}
        </button>
        {archivos.length > 0 && (
          <button type="button" className="btn-texto" onClick={() => onCambio([])}>
            Quitar
          </button>
        )}
      </div>
    </div>
  );
}
