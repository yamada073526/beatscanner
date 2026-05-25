/**
 * usePeriodReturns — 銘柄の各期間 cumulative return % を取得する hook。
 *
 * /api/period-returns/{ticker} を fetch し、 8 期間 (1W/1M/3M/6M/1Y/3Y/5Y/10Y) の
 * return_pct を返す。 LLM 不使用・純数値計算 endpoint なので narration なし。
 *
 * design anchor: feedback_chart_overlay_safety.md (Number.isFinite guard)
 *               feedback_llm_calc_separation.md (数値は Python 物理層)
 *
 * cache: module-level Map, TTL 6h (backend 側 TTL に合わせる)
 * ticker 変更時に再 fetch、 null/空 では fetch をスキップ (loading=false で即返却)
 */
import { useEffect, useState } from 'react';

const _cache = new Map(); // ticker → { ts, data }
const TTL_MS = 6 * 60 * 60 * 1000; // 6h
const _inFlight = new Map(); // ticker → Promise

async function fetchPeriodReturns(ticker) {
  const url = `/api/period-returns/${encodeURIComponent(ticker)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10s timeout
  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!r.ok) {
      console.warn(`[usePeriodReturns] fetch failed: ${r.status} for ${ticker}`);
      return null;
    }
    return await r.json();
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name !== 'AbortError') {
      console.warn(`[usePeriodReturns] fetch error for ${ticker}:`, e);
    }
    return null;
  }
}

/**
 * @param {string|null} ticker
 * @returns {{ data: object|null, loading: boolean, error: Error|null }}
 */
export function usePeriodReturns(ticker) {
  const key = ticker ? ticker.toUpperCase() : null;

  // module-level cache から初期値を決定
  const cached = key ? _cache.get(key) : null;
  const fresh = cached && Date.now() - cached.ts < TTL_MS;

  const [data, setData] = useState(fresh ? cached.data : null);
  const [loading, setLoading] = useState(!!key && !fresh);
  const [error, setError] = useState(null);

  useEffect(() => {
    // ticker が null / 空の場合はスキップ
    if (!key) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    // cache hit
    const now = Date.now();
    const c = _cache.get(key);
    if (c && now - c.ts < TTL_MS) {
      setData(c.data);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    // 同 ticker の in-flight を使い回す
    let p = _inFlight.get(key);
    if (!p) {
      p = fetchPeriodReturns(key).then((d) => {
        _cache.set(key, { ts: Date.now(), data: d });
        _inFlight.delete(key);
        return d;
      }).catch((e) => {
        _inFlight.delete(key);
        throw e;
      });
      _inFlight.set(key, p);
    }

    p.then((d) => {
      if (cancelled) return;
      if (d) {
        setData(d);
        setError(null);
      } else {
        // error 時は data=null + console.warn のみ (Trust Cliff 防止: UI 側 graceful fallback)
        setData(null);
        console.warn(`[usePeriodReturns] no data returned for ${key}`);
      }
      setLoading(false);
    }).catch((e) => {
      if (cancelled) return;
      setData(null);
      setError(e);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error };
}
