/**
 * RowSparkline — JudgmentRow 用の小型 1Y 株価推移 SVG (60×16).
 *
 * v62 WS-4 改善希望⑤「watchlist で 5 期間 sparkline (差別化、競合にない)」の
 * 1Y 版実装. WS-Phase2 で 1D/1W/1M/6M/1Y 期間切替に拡張予定.
 *
 * 既存 components/Sparkline.jsx (recharts、80px) は別用途. これは
 * 純 SVG・軽量・列幅 60px で JudgmentRow に納まる用.
 *
 * 設計:
 *   - module-level Map cache で同 ticker の重複 fetch を dedupe
 *   - 上昇/下落で色分け (期初 vs 期末、CLAUDE.md 投資業界の色ルール)
 *   - 取得失敗 / データ不足は薄い skeleton 表示
 *   - SVG 1-path polyline (パフォーマンス、外部ライブラリなし)
 *   - Pane 2 watchlist は通常 5-20 ticker 想定 → IntersectionObserver lazy fetch は不要
 */
import { useEffect, useState } from 'react';
import { fetchPriceHistory } from '../../../../api.js';

// ticker:period → { promise, prices } の module-level cache
const cache = new Map();

function getOrFetch(ticker, period) {
  const key = `${ticker}:${period}`;
  if (cache.has(key)) return cache.get(key);
  const entry = {
    prices: null,
    promise: fetchPriceHistory(ticker, period)
      .then((d) => {
        const prices = Array.isArray(d?.prices)
          ? d.prices
              .map((p) => Number(p.close))
              .filter((n) => Number.isFinite(n))
          : [];
        entry.prices = prices;
        return prices;
      })
      .catch(() => {
        entry.prices = [];
        return [];
      }),
  };
  cache.set(key, entry);
  return entry;
}

/** 1Y price-history を fetch して prices 配列を返す */
export function useRowSparkline(ticker, period = '1y') {
  const [prices, setPrices] = useState(() => {
    if (!ticker) return null;
    const c = cache.get(`${ticker}:${period}`);
    return c?.prices ?? null;
  });

  useEffect(() => {
    if (!ticker) {
      setPrices(null);
      return;
    }
    let cancelled = false;
    const entry = getOrFetch(ticker, period);
    if (entry.prices != null) {
      setPrices(entry.prices);
    } else {
      entry.promise.then((p) => {
        if (!cancelled) setPrices(p);
      });
    }
    return () => { cancelled = true; };
  }, [ticker, period]);

  return prices;
}

/**
 * @param {object} props
 * @param {string} props.ticker
 * @param {string} [props.period='1y']
 * @param {number} [props.width=60]
 * @param {number} [props.height=16]
 */
export default function RowSparkline({ ticker, period = '1y', width = 60, height = 16 }) {
  const prices = useRowSparkline(ticker, period);

  if (!Array.isArray(prices) || prices.length < 2) {
    return (
      <div
        aria-hidden
        style={{
          width,
          height,
          background: 'var(--bg-subtle, rgba(0,0,0,0.04))',
          borderRadius: 2,
          flexShrink: 0,
        }}
      />
    );
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const stepX = width / (prices.length - 1);
  const points = prices.map((p, i) => {
    const x = i * stepX;
    const y = height - ((p - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const isUp = prices[prices.length - 1] >= prices[0];
  const stroke = isUp ? 'var(--color-gain)' : 'var(--color-loss)';
  const fill = isUp ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)';
  const periodPct = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;

  return (
    <svg
      role="img"
      aria-label={`${ticker} 1年トレンド ${isUp ? 'プラス' : 'マイナス'}${Math.abs(periodPct).toFixed(1)}パーセント`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <polygon
        points={`0,${height} ${points.join(' ')} ${width},${height}`}
        fill={fill}
        stroke="none"
      />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
