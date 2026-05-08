import { memo, useMemo } from 'react';

/**
 * §11-B-7-A Phase 1B: ウォッチリスト行用 Mini Sparkline (inline SVG)。
 *
 * Apple Stocks 流の「動いてる感」をミニマルに表現。60×24 デフォルト、
 * 直近 30 日の daily close から path を生成。
 * 始値 < 終値 で緑、それ以外で赤、フラットでミュート。
 *
 * 2026 BP: lightweight-charts (16KB) は overkill、inline SVG path 1 本 (~1KB) で十分。
 * Recharts ベースの既存 Sparkline (ConditionCard 用) とは別物のため別名で実装。
 */
const WatchlistSparkline = memo(function WatchlistSparkline({
  data,           // number[] 価格時系列 (古い → 新しい)
  width = 60,
  height = 24,
  strokeWidth = 1.5,
  className,
  style,
}) {
  const { pathD, color, gradientId } = useMemo(() => {
    if (!Array.isArray(data) || data.length < 2) {
      return { pathD: '', color: 'rgba(148,163,184,0.5)', gradientId: '' };
    }
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = Math.max(max - min, 0.0001); // ゼロ除算防止
    const stepX = data.length > 1 ? width / (data.length - 1) : width;
    const padY = strokeWidth + 1; // stroke 切り取り防止の余白

    const points = data.map((v, i) => {
      const x = i * stepX;
      // 縦は反転 (SVG は y 下向き)
      const y = padY + (height - 2 * padY) * (1 - (v - min) / range);
      return [x, y];
    });

    // SVG path 構築 (M start, L line)
    const pathD = points
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(' ');

    const isUp = data[data.length - 1] >= data[0];
    const color = isUp ? 'var(--color-gain)' : 'var(--color-loss)';
    const gradientId = `wl-spark-${isUp ? 'up' : 'dn'}-${Math.random().toString(36).slice(2, 7)}`;
    return { pathD, color, gradientId };
  }, [data, width, height, strokeWidth]);

  if (!pathD) {
    return (
      <div
        className={className}
        style={{ width, height, ...style }}
        aria-hidden
      />
    );
  }

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={style}
      role="img"
      aria-label="価格推移ミニチャート"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* fill 領域 (グラデ薄塗り、控えめに「動き」を強調) */}
      <path
        d={`${pathD} L${width} ${height} L0 ${height} Z`}
        fill={`url(#${gradientId})`}
        stroke="none"
      />
      {/* メイン line */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

export default WatchlistSparkline;
