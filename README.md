# valida-addenda

Aplicación web (React + Vite + TypeScript) que valida la **addenda** de un CFDI (3.3 / 4.0)
contra un esquema **XSD**. Subes el XML y el XSD, das clic en **Validar addenda** y ves el
resultado con los errores y la línea exacta del CFDI donde ocurren.

La validación se hace en el navegador con libxml2 compilado a WebAssembly
(`xmllint-wasm`); los archivos no se envían a ningún servidor.

## Requisitos

Node.js 22.18 o superior.

## Uso

```bash
npm install
npm run dev        # abre http://localhost:5173
npm run build      # genera el sitio estático en dist/
npm run preview    # sirve dist/ localmente
npm test           # pruebas del validador
```

También queda una línea de comandos que usa la misma lógica:

```bash
npm run validar -- addenda.xsd factura1.xml factura2.xml
node cli/valida.ts addenda.xsd factura.xml --json
```

Código de salida: `0` válido, `1` inválido, `2` error de uso o archivo inexistente.

## Cómo se valida

1. Se verifica que el XSD y el CFDI sean XML bien formados.
2. Se verifica que la raíz sea `cfdi:Comprobante` y que exista `cfdi:Addenda`.
3. Se leen los elementos globales que declara el XSD y se busca, dentro de `cfdi:Addenda`,
   el elemento que coincida (mismo nombre y namespace). Ese elemento se valida contra el XSD.
4. Si no hay coincidencia pero el XSD declara su propio elemento `Addenda` (por ejemplo,
   con namespace `http://www.sat.gob.mx/cfdi`), se valida el nodo
   `cfdi:Addenda` cambiando su namespace al del XSD. La pantalla muestra un aviso cuando
   esto ocurre.
5. Los errores se reportan con el número de línea del CFDI original.

Si el XSD usa `xs:include` / `xs:import`, sube todos los `.xsd` juntos; el principal se
detecta solo (es el que no es referenciado por los demás).

## Estructura

```
src/
  lib/validador.ts             Lógica de validación (navegador y Node)
  components/SelectorArchivo   Zona para arrastrar / seleccionar archivos
  components/Resultado         Resultado, lista de errores y visor del XML
  App.tsx
cli/valida.ts                  Línea de comandos
test/validador.test.ts         Pruebas (node:test)
```
