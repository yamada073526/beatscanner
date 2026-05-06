import { useState } from 'react';
import { getTickerTvSlug } from '../lib/tickerSlugs.js';

// 頭文字フォールバック用の固定パレット
// hash は ticker 文字列ベースで安定（同じティッカーは常に同じ色）
const FALLBACK_GRADIENTS = [
  ['#22d3ee', '#0891b2'],
  ['#34ef81', '#059669'],
  ['#f59e0b', '#d97706'],
  ['#a78bfa', '#7c3aed'],
  ['#f472b6', '#be185d'],
  ['#60a5fa', '#1d4ed8'],
  ['#fb923c', '#c2410c'],
  ['#94a3b8', '#475569'],
];

function hashTicker(t) {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * 企業ロゴ（円形）— 3 段フォールバック
 * 1) TradingView SVG（高品質、主要 200 銘柄をマップ）
 * 2) FMP image-stock PNG（マップ外銘柄のカバー）
 * 3) 頭文字グラデ円（両方失敗時）
 *
 * @param {string} ticker - ティッカー（例: "AAPL"）
 * @param {number} size - 直径 px（デフォルト 24）
 * @param {string} variant - 'default' | 'badge'
 *   - 'badge': カラフルな bg (PASS/FAIL バナー等) で使う想定。padding 拡大 + 外周リング
 * @param {string} className - 追加クラス
 */
export default function CompanyLogo({ ticker, size = 24, variant = 'default', className = '' }) {
  const [stage, setStage] = useState(0); // 0: TV, 1: FMP, 2: fallback
  const t = (ticker || '').toUpperCase().trim();
  const tvSlug = getTickerTvSlug(t);

  const isBadge = variant === 'badge';
  const innerPadding = isBadge ? Math.max(4, Math.round(size * 0.10)) : 1;
  const boxShadow = isBadge ? '0 0 0 1px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.10)' : undefined;

  const commonImgStyle = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    boxShadow,
  };

  // Stage 0: TradingView SVG（マップに登録された主要銘柄のみ）
  if (stage === 0 && tvSlug) {
    return (
      <img
        src={`https://s3-symbol-logo.tradingview.com/${tvSlug}--big.svg`}
        alt={`${t} logo`}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setStage(1)}
        className={`company-logo ${className}`}
        style={{
          ...commonImgStyle,
          objectFit: 'contain',
          backgroundColor: '#fff',
          padding: innerPadding,
        }}
      />
    );
  }

  // Stage 1: FMP image-stock PNG（マップ外銘柄や TV 失敗時）
  if (stage <= 1 && t) {
    return (
      <img
        src={`https://financialmodelingprep.com/image-stock/${t}.png`}
        alt={`${t} logo`}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setStage(2)}
        className={`company-logo ${className}`}
        style={{
          ...commonImgStyle,
          objectFit: 'contain',
          backgroundColor: '#fff',
          padding: innerPadding,
        }}
      />
    );
  }

  // Stage 2: 頭文字グラデ円（最終フォールバック）
  const initial = t.charAt(0) || '?';
  const idx = hashTicker(t) % FALLBACK_GRADIENTS.length;
  const [from, to] = FALLBACK_GRADIENTS[idx];
  const fontSize = Math.round(size * 0.45);

  return (
    <span
      aria-label={`${t} logo`}
      className={`company-logo company-logo-fallback ${className}`}
      style={{
        ...commonImgStyle,
        background: `linear-gradient(135deg, ${from}, ${to})`,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize,
        fontWeight: 700,
        letterSpacing: '-0.02em',
        userSelect: 'none',
      }}
    >
      {initial}
    </span>
  );
}
