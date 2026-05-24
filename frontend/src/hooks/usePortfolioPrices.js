import { useEffect, useRef, useState } from 'react';
import { fetchQuotes } from '../api.js';

/**
 * 指定 ticker 群の現在価格を一括 fetch + 自動再取得 (Holdings 損益バッジ用)
 * - 市場開場時 60s 毎、閉場時 900s 毎で再取得
 * - tickers が変わったら即時再 fetch
 * - 戻り値: { prices: { [SYMBOL]: { price, change_pct, ... } }, marketOpen, loading, error, refetch }
 *
 * v112-3: 2 つの UX 課題 fix
 *   1) setPrices(map) → setPrices(prev=>{...prev,...map}) で merge 化:
 *      - 銘柄切替で ticker list 変動 → 再 fetch 中、 旧 setPrices(map) は空 map で
 *        既存 prices 全消し → Pane 2 で全銘柄一瞬 dash 戻り bug。
 *      - merge 化で fetch 中も既存 price 維持、 新 fetch 結果のみ上書き。
 *      - fetch 失敗時は既存 setPrices 呼ばれない (try/catch 内のみ更新) ので stale 永続 risk なし。
 *   2) priorityTicker 引数追加:
 *      - selectedTicker (Pane 3 中央表示中) を別 path で先行単独 fetch (1-2 秒)、
 *        full batch fetch (5 秒) と並行。 株価 chip 体感 5s → 1-2s。
 *      - 既に prices にあれば fetch skip (cache 活用)。
 */
export function usePortfolioPrices(tickers, priorityTicker) {
  const [prices, setPrices] = useState({});
  const [marketOpen, setMarketOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // tickers の安定化 (配列参照変動で無限ループしないように key 化)
  const key = Array.isArray(tickers) && tickers.length
    ? [...tickers].map((t) => String(t).toUpperCase()).sort().join(',')
    : '';

  const lastFetchAt = useRef(0);
  // v112-3: priority fetch の重複防止用、 prices state を ref で参照 (effect deps に prices 入れず race 回避)
  const pricesRef = useRef({});
  useEffect(() => {
    pricesRef.current = prices;
  }, [prices]);

  useEffect(() => {
    if (!key) {
      setPrices({});
      return;
    }

    let cancelled = false;
    let timer = null;

    async function fetchOnce() {
      setLoading(true);
      try {
        const list = key.split(',');
        const data = await fetchQuotes(list);
        if (cancelled) return;
        const map = {};
        for (const q of data.quotes || []) {
          if (q && q.symbol) map[q.symbol] = q;
        }
        // v112-3: merge 化 — 既存 prices を維持しつつ新 fetch 結果で上書き
        setPrices((prev) => ({ ...prev, ...map }));
        setMarketOpen(!!data.market_open);
        setError(null);
        lastFetchAt.current = Date.now();
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchOnce();

    // 自動再 fetch: 開場 60s / 閉場 900s で setTimeout を都度更新
    function schedule() {
      if (cancelled) return;
      const ttl = marketOpen ? 60_000 : 900_000;
      timer = setTimeout(async () => {
        await fetchOnce();
        schedule();
      }, ttl);
    }
    schedule();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // marketOpen は fetchOnce 内で更新するが、その時点で再 setTimeout される設計で
    // 依存に入れるとスケジュールが重複する。意図的に key のみ依存。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // v112-3: priorityTicker (selectedTicker) を full batch と並行で単独先行 fetch
  //   - 既に prices にあれば skip (cache 活用)
  //   - 1-2 秒で priority 銘柄の price が KpiStrip に到達、 体感 5s → 1-2s
  useEffect(() => {
    if (!priorityTicker) return;
    const upper = String(priorityTicker).trim().toUpperCase();
    if (!upper) return;
    if (pricesRef.current[upper]) return; // 既知 → skip
    let cancelled = false;
    fetchQuotes([upper])
      .then((data) => {
        if (cancelled) return;
        const map = {};
        for (const q of data.quotes || []) {
          if (q && q.symbol) map[q.symbol] = q;
        }
        setPrices((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {
        // priority fetch 失敗は silent (full batch fetch が後追い完了する)
      });
    return () => {
      cancelled = true;
    };
  }, [priorityTicker]);

  const refetch = async () => {
    if (!key) return;
    const list = key.split(',');
    setLoading(true);
    try {
      const data = await fetchQuotes(list);
      const map = {};
      for (const q of data.quotes || []) if (q && q.symbol) map[q.symbol] = q;
      // v112-3: refetch も merge 化 (手動更新で他銘柄消えないように)
      setPrices((prev) => ({ ...prev, ...map }));
      setMarketOpen(!!data.market_open);
      setError(null);
      lastFetchAt.current = Date.now();
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  return { prices, marketOpen, loading, error, refetch };
}
