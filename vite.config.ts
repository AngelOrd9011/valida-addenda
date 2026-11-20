import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // xmllint-wasm carga su Web Worker y el .wasm con `new URL(..., import.meta.url)`;
  // si Vite lo pre-empaqueta, esas rutas se rompen en modo desarrollo.
  optimizeDeps: { exclude: ['xmllint-wasm'] },
  worker: { format: 'es' },
})
