/**
 * useNewsFeeds — Pane 4 マクロ + 個別銘柄 ニュース取得 hook (v102 Sprint B-D)
 *
 * 抽出元: Pane4Inspector.jsx L35-67, L82-104, L154-161
 *
 * 機能:
 *   - マクロニュース fetch (fetchMacroNews) + 5min polling
 *   - 個別銘柄ニュース bulk fetch (fetchNewsBulk、 v65 §C-2) + 5min polling
 *   - 銘柄 ticker 集約 (holdings + watch、 max 30)
 *   - latestPublished 算出 (header の 「最終更新 X 分前」)
 *
 * 返り値:
 *   { news, tickerNews, loading, latestPublished, holdingItems, watchItems, myTickers }
 */
import { useEffect, useMemo, useState } from 'react';
import { fetchMacroNews, fetchNewsBulk } from '../../../api.js';

export function useNewsFeeds(items = []) {
  const [news, setNews] = useState([]);
  const [tickerNews, setTickerNews] = useState([]);
  const [loading, setLoading] = useState(true);

  const holdingItems = useMemo(() => items.filter((it) => it.isHolding), [items]);
  const watchItems = useMemo(
    () => items.filter((it) => !it.isHolding && it.isWatchlist),
    [items]
  );

  const myTickers = useMemo(
    () => [...holdingItems, ...watchItems].map((it) => it.ticker).filter(Boolean).slice(0, 30),
    [holdingItems, watchItems]
  );
  const myTickersKey = myTickers.join(',');

  // ── マクロニュース取得 ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const d = await fetchMacroNews();
        if (cancelled) return;
        if (Array.isArray(d?.items)) setNews(d.items);
      } catch { /* noop */ }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // ── 個別銘柄ニュース集約 (v65 §C-2 bulk endpoint) ──
  useEffect(() => {
    if (!myTickersKey) { setTickerNews([]); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const arr = myTickersKey.split(',');
        const res = await fetchNewsBulk(arr, 5);
        if (cancelled) return;
        const flat = [];
        for (const r of res?.items || []) {
          if (r.status !== 'ok' || !Array.isArray(r.articles)) continue;
          for (const n of r.articles) {
            flat.push({ ...n, _sourceTicker: r.ticker });
          }
        }
        setTickerNews(flat);
      } catch { /* noop */ }
    };
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [myTickersKey]);

  const latestPublished = useMemo(() => {
    let max = 0;
    for (const n of news) {
      const t = n.published ? Date.parse(n.published) : 0;
      if (Number.isFinite(t) && t > max) max = t;
    }
    return max > 0 ? new Date(max).toISOString() : null;
  }, [news]);

  return { news, tickerNews, loading, latestPublished, holdingItems, watchItems, myTickers };
}
