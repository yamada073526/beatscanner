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
 * 企業ロゴ — 3 段フォールバック
 * 1) TradingView SVG（高品質、主要 200 銘柄をマップ）
 * 2) FMP image-stock PNG（マップ外銘柄のカバー）
 * 3) 頭文字グラデ円（両方失敗時）
 *
 * @param {string} ticker - ティッカー（例: "AAPL"）
 * @param {number} size - 直径 px（デフォルト 24）
 * @param {string} variant - 'default' | 'badge'
 *   - 'badge': カラフルな bg (PASS/FAIL バナー等) で使う想定。padding 拡大 + 外周リング
 * @param {string} shape - 'circle' | 'rounded'
 *   - 'rounded': border-radius を var(--radius-md, 12px) に変更（Hero 用角丸四角形）
 *   - デフォルト 'circle' は既存動作維持（後方互換）
 * @param {boolean} monoFallback - true のとき頭文字円を neutral gray にする
 *   - false（デフォルト）は既存のカラフルグラデーション
 *   - Hero / 金融インターフェース等、投資家心理誤誘導を避けたい場合に true を指定
 * @param {boolean} fadeIn - true のとき logo load 後に opacity 0→1 / 200ms ease-out
 *   - prefers-reduced-motion: reduce 環境では transition なし（a11y 対応）
 *   - fallback（頭文字円）は即時表示（opacity: 1）
 *   - デフォルト false は既存動作維持（後方互換）
 * @param {string} className - 追加クラス
 */
export default function CompanyLogo({
  ticker,
  size = 24,
  variant = 'default',
  shape = 'circle',
  monoFallback = false,
  fadeIn = false,
  className = '',
}) {
  const [stage, setStage] = useState(0); // 0: TV, 1: FMP, 2: fallback
  // fadeIn 制御: img が load されたとき loaded=true にして CSS クラス切替
  const [imgLoaded, setImgLoaded] = useState(false);
  const t = (ticker || '').toUpperCase().trim();
  const tvSlug = getTickerTvSlug(t);

  const isBadge = variant === 'badge';
  const innerPadding = isBadge ? Math.max(4, Math.round(size * 0.10)) : 1;
  const boxShadow = isBadge ? '0 0 0 1px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.10)' : undefined;
  // shape='rounded' のときは Hero 向け角丸四角形、それ以外は既存の円形
  const borderRadiusValue = shape === 'rounded' ? 'var(--radius-md, 12px)' : '50%';

  const commonImgStyle = {
    width: size,
    height: size,
    borderRadius: borderRadiusValue,
    flexShrink: 0,
    boxShadow,
  };

  // fadeIn 用クラス計算（img タグ用）
  // stage が 0→1 に切り替わったとき imgLoaded をリセットするため、key で制御
  const fadeClass = fadeIn ? (imgLoaded ? 'hero-company-logo logo-loaded' : 'hero-company-logo') : '';

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
        onLoad={fadeIn ? () => setImgLoaded(true) : undefined}
        onError={() => { setStage(1); setImgLoaded(false); }}
        className={`company-logo ${fadeClass} ${className}`.trim()}
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
        onLoad={fadeIn ? () => setImgLoaded(true) : undefined}
        onError={() => { setStage(2); setImgLoaded(false); }}
        className={`company-logo ${fadeClass} ${className}`.trim()}
        style={{
          ...commonImgStyle,
          objectFit: 'contain',
          backgroundColor: '#fff',
          padding: innerPadding,
        }}
      />
    );
  }

  // Stage 2: 頭文字フォールバック（最終 fallback）
  // monoFallback=true: neutral gray（Hero 等、投資家心理誤誘導回避）
  // monoFallback=false: カラフルグラデーション（既存動作・後方互換）
  const initial = t.charAt(0) || '?';
  const fontSize = Math.round(size * 0.45);

  let fallbackBg;
  let fallbackFg;
  if (monoFallback) {
    fallbackBg = 'var(--bg-subtle)';
    fallbackFg = 'var(--text-secondary)';
  } else {
    const idx = hashTicker(t) % FALLBACK_GRADIENTS.length;
    const [from, to] = FALLBACK_GRADIENTS[idx];
    fallbackBg = `linear-gradient(135deg, ${from}, ${to})`;
    fallbackFg = 'var(--bg-primary, #f8fafc)'; // グラデ上の白文字: bg-primary token 経由
  }

  // fallback は即時表示（アニメーション不要）
  const fallbackFadeClass = fadeIn ? 'hero-company-logo logo-fallback' : '';

  return (
    <span
      aria-label={`${t} logo`}
      className={`company-logo company-logo-fallback ${fallbackFadeClass} ${className}`.trim()}
      style={{
        ...commonImgStyle,
        background: fallbackBg,
        color: fallbackFg,
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
