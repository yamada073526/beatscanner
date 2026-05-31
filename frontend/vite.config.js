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
        // - lightweight-charts (~200KB): PortfolioHistoryChart / ChartTab (classic SPA) で使用、 Pane 3 不使用
        // - recharts: Pane 3 StockPriceChart 等で使用
        // - @dnd-kit: ChartTab のウォッチリスト並び替えで使用
        // - react-markdown: DetailReport で使用
        // v144 Tier3 #Pane3-perf: 旧 'charts' は両ライブラリを 1 chunk (774KB) に束ね、 Pane 3 (recharts のみ)
        //   読込時に未使用の lightweight-charts ~200KB も巻き込んでいた。 別 chunk に分離して Pane 3 初回
        //   ロードから lightweight-charts を外す (config のみ・ component 不変 = chart 描画は完全同一)。
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase': ['@supabase/supabase-js'],
          'recharts': ['recharts'],
          'lightweight-charts': ['lightweight-charts'],
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
