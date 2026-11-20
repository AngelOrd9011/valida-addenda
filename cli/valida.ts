// Uso: node cli/valida.ts --xsd <esquema.xsd> [otro.xsd ...] <cfdi.xml> [otro.xml ...] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { validarAddenda } from '../src/lib/validador.ts';
import type { ArchivoTexto } from '../src/lib/validador.ts';

const AYUDA = `
Uso:
  node cli/valida.ts <cfdi.xml> [...] <esquema.xsd> [...] [--json]

  Los archivos .xsd se toman como esquemas (el principal es el que no es
  referenciado por los demás) y el resto como CFDI a validar.

Código de salida: 0 = válido, 1 = inválido, 2 = error de uso / archivo.
`;

const leer = (ruta: string): ArchivoTexto => ({ nombre: path.basename(ruta), contenido: fs.readFileSync(ruta, 'utf8') });

async function main(): Promise<number> {
  const args = process.argv.slice(2).filter((a) => a !== '--xsd' && a !== '-x');
  const json = args.includes('--json');
  const archivos = args.filter((a) => !a.startsWith('-'));
  const xsds = archivos.filter((a) => a.toLowerCase().endsWith('.xsd'));
  const xmls = archivos.filter((a) => !a.toLowerCase().endsWith('.xsd'));

  if (args.includes('-h') || args.includes('--help') || !xsds.length || !xmls.length) {
    console.log(AYUDA);
    return 2;
  }
  const faltante = archivos.find((f) => !fs.existsSync(f));
  if (faltante) {
    console.error(`No existe el archivo: ${faltante}`);
    return 2;
  }

  const esquemas = xsds.map(leer);
  const resultados = [];
  for (const x of xmls) resultados.push({ archivo: x, ...(await validarAddenda(leer(x).contenido, esquemas)) });

  if (json) {
    console.log(JSON.stringify(resultados, null, 2));
  } else {
    for (const r of resultados) {
      const nombre = path.basename(r.archivo);
      console.log(r.valido ? `✔ ${nombre}: addenda válida` : `✘ ${nombre}: addenda inválida`);
      for (const a of r.avisos) console.log(`   ! ${a}`);
      for (const e of r.errores) console.log(`   - [${e.tipo}] ${e.linea ? `línea ${e.linea}: ` : ''}${e.mensaje}`);
    }
  }
  return resultados.every((r) => r.valido) ? 0 : 1;
}

main().then(
  (c) => process.exit(c),
  (e: unknown) => {
    console.error('Error:', e instanceof Error ? e.message : e);
    process.exit(2);
  },
);
