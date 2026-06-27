import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 検証専用スタンドアロン build (base './' で file:// 直開き可)。app 本番 build とは独立。
export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, '../../.visual/grid-preview'),
    emptyOutDir: true,
  },
});
