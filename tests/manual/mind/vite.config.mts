import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: here('../../..'),
  plugins: [{ name: 'mind-fixture-transport', enforce: 'pre', resolveId(source, importer) {
    if (/data\/client$/.test(source) || (source === './client' && /\/src\/data\/[^/]+$/.test(importer?.replaceAll('\\', '/') || ''))) return here('./client.ts');
    if (/store\/authStore$/.test(source)) return here('./auth.ts');
  } }, react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5187, strictPort: true },
});
