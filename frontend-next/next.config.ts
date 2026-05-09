import type { NextConfig } from "next";

// BeatScanner Next.js 16 設定
// - 画像: TradingView ロゴ / FMP ロゴ / 頭文字円 fallback の 3 段で運用
//   (memory: logo_sources.md。Clearbit は廃止対応済)
// - env: VITE_* ではなく NEXT_PUBLIC_* に統一 (Next.js 規約)
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // TradingView の銘柄ロゴ (1st choice)
      { protocol: "https", hostname: "s3-symbol-logo.tradingview.com" },
      // FMP のロゴ (2nd choice)
      { protocol: "https", hostname: "financialmodelingprep.com" },
    ],
  },
  // 既存 frontend/ と同じ backend を呼ぶ。Phase 9 で本格 wiring。
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "",
  },
};

export default nextConfig;
