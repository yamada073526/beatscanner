import { useEffect, useRef, useState } from 'react';
import { fetchQuotes } from '../api.js';

/**
 * 指定 ticker 群の現在価格を一括 fetch + 自動再取得 (Holdings 損益バッジ用)
 * - 市場開場時 60s 毎、閉場時 900s 毎で再取得
 * - tickers が変わったら即時再 fetch
 * - 戻り値: { prices: { [SYMBOL]: { price, change_pct, ... } }, marketOpen, loading, error, refetch }
 */
export function usePortfolioPrices(tickers) {
  const [prices, setPrices] = useState({});
  const [marketOpen, setMarketOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // tickers の安定化 (配列参照変動で無限ループしないように key 化)
  const key = Array.isArray(tickers) && tickers.length
    ? [...tickers].map((t) => String(t).toUpperCase()).sort().join(',')
    : '';

  const lastFetchAt = useRef(0);

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
        setPrices(map);
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

  const refetch = async () => {
    if (!key) return;
    const list = key.split(',');
    setLoading(true);
    try {
      const data = await fetchQuotes(list);
      const map = {};
      for (const q of data.quotes || []) if (q && q.symbol) map[q.symbol] = q;
      setPrices(map);
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
