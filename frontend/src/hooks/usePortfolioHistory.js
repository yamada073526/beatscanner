import { useEffect, useState } from 'react';
import { fetchPortfolioHistory } from '../api.js';

/**
 * ロット履歴から日次ポートフォリオ評価額の時系列を取得。
 * - lots / period が変わると再 fetch
 * - lots は [{ ticker, shares, trade_date, id }, ...] 形式
 *
 * 戻り値: { series, loading, error, period }
 */
export function usePortfolioHistory(lots, period = '1y') {
  const [series, setSeries] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // メモ化キー: lots の (ticker, shares, price, trade_date) と period
  // §11-D-Fix: price (= avg_cost) もキーに含める。価格更新で再 fetch するため。
  const key = (() => {
    if (!Array.isArray(lots) || lots.length === 0) return '';
    const items = lots
      .map((l) => `${(l.ticker || '').toUpperCase()}|${l.shares}|${l.price || ''}|${l.trade_date || ''}`)
      .filter(Boolean)
      .sort();
    return `${period}::${items.join(',')}`;
  })();

  useEffect(() => {
    if (!key) {
      setSeries([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // §11-D-Fix: payload に price (= avg_cost) と cost_basis_method を含める。
        // backend は cost_basis_method='user_input' のとき cashflow = shares × price を採用
        // (Robinhood / 楽天 / SBI 流の累積リターン基準。リスト部 含み損益 と一致)。
        const payload = lots.map((l) => ({
          ticker: (l.ticker || '').toUpperCase(),
          shares: Number(l.shares),
          price: l.price != null ? Number(l.price) : null,
          trade_date: l.trade_date,
          cost_basis_method: l.cost_basis_method || 'user_input',
          lot_id: l.id || null,
        }));
        const data = await fetchPortfolioHistory(payload, period);
        if (cancelled) return;
        setSeries(data?.series || []);
        setWarnings(Array.isArray(data?.warnings) ? data.warnings : []);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e);
          setSeries([]);
          setWarnings([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [key]);  // eslint-disable-line react-hooks/exhaustive-deps

  return { series, warnings, loading, error, period };
}

/**
 * §11-D Fix (2026-05-09): 累積リターン (Cumulative Return / Total Return) 計算
 *
 * 4 体エージェント合意で TWR を Robinhood / 楽天 / SBI 流の Total Return に変更:
 *   累積リターン % = (現在評価額 − 累積投下資本) / 累積投下資本 × 100
 *
 * cashflow = shares × user_avg_cost (cost_basis_method='user_input' のとき) で
 * backend が計算するため、リスト部の「含み損益」と必ず一致する。
 *
 * backend が series[i].total_return_pct を直接返すため、frontend では
 * 単純に index 化するだけ。
 *
 * 入力: series = [{ date, value, cashflow, invested, total_return_pct }]
 * 出力: [{ date, twrIndex, twrPct }]  (chart 互換のため旧名維持、意味は累積リターン)
 *
 * 旧 TWR 計算 (cashflow 除外の幾何連鎖) は廃止。本物の TWR は将来 Premium 機能。
 */
export function computeTWR(series) {
  if (!Array.isArray(series) || series.length < 1) return [];

  // 「最初に保有が発生した日」(invested > 0) を anchor とし、それ以降のみ構築
  const startIdx = series.findIndex(
    (p) => Number(p?.invested) > 0 || Number(p?.value) > 0 || Number(p?.cashflow) > 0
  );
  if (startIdx < 0) return [];

  const out = [];
  for (let i = startIdx; i < series.length; i++) {
    const p = series[i];
    // backend が total_return_pct を返している場合はそれを採用 (新動作)
    // 後方互換: total_return_pct が無い旧 series は invested から計算
    let pct = Number(p?.total_return_pct);
    if (!Number.isFinite(pct)) {
      const value = Number(p?.value) || 0;
      const invested = Number(p?.invested) || 0;
      pct = invested > 0 ? ((value - invested) / invested) * 100 : 0;
    }
    out.push({
      date: p.date,
      twrIndex: 100 + pct,  // 100 起点で indexed (chart Y 軸用)
      twrPct: pct,
    });
  }

  return out;
}

/**
 * SPY (or any benchmark) の price 系列を「期間開始 = 100」で indexed 化。
 * TWR と SPY を同じスケールで比較するための共通ヘルパー。
 *
 * 入力: spyPoints = [{ date, close }], anchorDate (optional, この日以降を採用)
 * 出力: [{ date, indexValue }]
 */
export function indexBenchmark(spyPoints, anchorDate) {
  if (!Array.isArray(spyPoints) || spyPoints.length < 2) return [];
  const startIdx = anchorDate
    ? Math.max(0, spyPoints.findIndex((p) => p?.date >= anchorDate))
    : 0;
  const base = Number(spyPoints[startIdx]?.close);
  if (!Number.isFinite(base) || base <= 0) return [];
  return spyPoints
    .slice(startIdx)
    .filter((p) => p && p.date && Number.isFinite(Number(p.close)))
    .map((p) => ({
      date: p.date,
      indexValue: (Number(p.close) / base) * 100,
    }));
}
