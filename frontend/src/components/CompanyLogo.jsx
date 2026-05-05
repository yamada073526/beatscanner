import { useState } from 'react';

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

// FMP image-stock は "BRK.B" 形式をそのまま受ける（ドット保持）
function normalizeForFmp(ticker) {
  return (ticker || '').toUpperCase().trim();
}

/**
 * 企業ロゴ（円形）
 * FMP image-stock API → 取得失敗時は頭文字グラデ円
 *
 * @param {string} ticker - ティッカー（例: "AAPL"）
 * @param {number} size - 直径 px（デフォルト 24）
 * @param {string} className - 追加クラス
 */
export default function CompanyLogo({ ticker, size = 24, className = '' }) {
  const [errored, setErrored] = useState(false);
  const t = normalizeForFmp(ticker);

  if (t && !errored) {
    return (
      <img
        src={`https://financialmodelingprep.com/image-stock/${t}.png`}
        alt={`${t} logo`}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setErrored(true)}
        className={`company-logo ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'contain',
          backgroundColor: '#fff',
          padding: 1,
          flexShrink: 0,
        }}
      />
    );
  }

  // フォールバック: 頭文字グラデ円
  const initial = t.charAt(0) || '?';
  const idx = hashTicker(t) % FALLBACK_GRADIENTS.length;
  const [from, to] = FALLBACK_GRADIENTS[idx];
  const fontSize = Math.round(size * 0.45);

  return (
    <span
      aria-label={`${t} logo`}
      className={`company-logo company-logo-fallback ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${from}, ${to})`,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize,
        fontWeight: 700,
        flexShrink: 0,
        letterSpacing: '-0.02em',
        userSelect: 'none',
      }}
    >
      {initial}
    </span>
  );
}
