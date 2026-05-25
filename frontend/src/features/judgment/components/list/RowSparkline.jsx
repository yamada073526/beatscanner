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
import { useEffect, useMemo, useState } from 'react';
import { fetchPriceHistory, fetchPriceIntraday } from '../../../../api.js';

// ticker:period → { promise, prices } の module-level cache
const cache = new Map();

// v65 §4-B-3: '1d' は intraday 5 分足 endpoint、それ以外は通常の日次 endpoint
function getOrFetch(ticker, period) {
  const key = `${ticker}:${period}`;
  if (cache.has(key)) return cache.get(key);
  const fetcher = period === '1d'
    ? () => fetchPriceIntraday(ticker)
    : () => fetchPriceHistory(ticker, period);
  const entry = {
    prices: null,
    promise: fetcher()
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

/** v62 WS-Phase2: 期間 → 直近営業日数 (handover §15-3 推奨計算).
 *  backend は常に 1Y (250 営業日) 返すため frontend で slice する設計.
 *  §dogfood-round11: '1d' を追加 (= 末尾 2 日で簡易表示、視覚的にはほぼ点) */
const PERIOD_DAYS = {
  '1d': 2,
  '1w': 5,
  '1m': 21,
  '6m': 126,
  '1y': 252,
};

/**
 * v117 R8 g2 (multi-review verdict): default size 60x16 → 80x28、 stroke 1→1.5px
 * user 指摘「sparkline 細い + 小さい」 → 視認性向上、 stroke 1.5px で trend 明確化
 *
 * @param {object} props
 * @param {string} props.ticker
 * @param {string} [props.period='1y']  - '1w' | '1m' | '6m' | '1y'
 * @param {number} [props.width=80]
 * @param {number} [props.height=28]
 */
export default function RowSparkline({ ticker, period = '1y', width = 80, height = 28 }) {
  // v65 §4-B-3: '1d' は intraday 5 分足 endpoint (~78 点)、それ以外は日次 1Y を slice.
  // 旧実装は period 無視で常に '1y' fetch → '1d' は末尾 2 日 slice で直線化していた.
  const fetchPeriod = period === '1d' ? '1d' : '1y';
  const fullPrices = useRowSparkline(ticker, fetchPeriod);

  // 末尾から period 分だけ slice (intraday は slice しない)
  const prices = useMemo(() => {
    if (!Array.isArray(fullPrices) || fullPrices.length === 0) return [];
    if (period === '1d') return fullPrices; // intraday: 当日 5 分足を全て描画
    const days = PERIOD_DAYS[period] ?? PERIOD_DAYS['1y'];
    return days >= fullPrices.length ? fullPrices : fullPrices.slice(-days);
  }, [fullPrices, period]);

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
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
