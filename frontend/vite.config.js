import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  build: {
    rollupOptions: {
      output: {
        // v40+ / §11-E v51 Phase 1 拡張: 重い deps を独立 chunk に分離
        // 初回ロードに乗らない (lazy import 経由で訪問時のみ) + 再訪時 HTTP cache HIT
        // - lightweight-charts (~200KB): PortfolioHistoryChart / ChartTab で使用
        // - recharts: 一部チャートで使用 (将来 lightweight-charts に統一予定)
        // - @dnd-kit: ChartTab のウォッチリスト並び替えで使用
        // - react-markdown: DetailReport で使用
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase': ['@supabase/supabase-js'],
          'charts': ['lightweight-charts', 'recharts'],
          'dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          'markdown': ['react-markdown'],
          // Sprint 0 (Phase 2): framer-motion を react-vendor から分離。
          // Pane 3 専用 chunk として lazy load 対応。LazyMotion + domAnimation subset で
          // バンドル 20KB 以下 (gzip) を目標とする。
          'framer-motion': ['framer-motion'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
