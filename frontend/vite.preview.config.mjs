/**
 * vite.preview.config.mjs — AI 図解 (DiagramCard) 視覚検証ハーネス専用ビルド設定。
 *
 * ## 本番ビルド (vite.config.js) とは独立
 * - base: './'   → 出力 asset を相対パスにする。 file:// で開いた preview.html から
 *                  ./assets/*.js を解決できるようにするため (絶対 /assets/ だと file:// で 404)。
 * - input: preview.html → 本番 index.html ではなくハーネス entry のみを build。
 * - outDir: .preview-dist → 本番 dist/ を汚さない (gitignore 済)。
 *
 * ## 使い方
 *   cd frontend && npx vite build --config vite.preview.config.mjs
 *   → .preview-dist/preview.html を file:// で開く (snap-diagram.mjs が自動化)
 *
 * CLAUDE.md「Visual Diagnostic Harness Exception」準拠: preview server / dev server は起動しない。
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // file:// で開くため相対パス。 本番 (base:'/') は vite.config.js 側で維持。
  base: './',
  build: {
    outDir: '.preview-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'preview.html'),
    },
    // ハーネスは単一 entry なので chunk 分割不要。 warning も抑制。
    chunkSizeWarningLimit: 4000,
  },
});
