/**
 * useBacktest — じっちゃま 5 条件のバックテスト結果を取得 (v71 Phase 1 Day 5)。
 *
 * /api/backtest endpoint を呼び出して、 period + hold_days パラメータで結果取得。
 * module-level cache で同じパラメータの 2 回目以降は instant 返却 (30 分 TTL)。
 *
 * memory anchor: project_backtest_phase1_design.md
 */
import { useEffect, useState } from 'react';

const _cache = new Map();  // `${period}|${hold_days}` → { ts, data }
const TTL_MS = 30 * 60 * 1000;
const _inFlight = new Map();

async function fetchBacktest(period, holdDays) {
  const url = `/api/backtest?strategy=jijima5&period=${encodeURIComponent(period)}&hold_days=${encodeURIComponent(holdDays)}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export function useBacktest(period = '5y', holdDays = 365) {
  const key = `${period}|${holdDays}`;
  const cached = _cache.get(key);
  const fresh = cached && (Date.now() - cached.ts) < TTL_MS;

  const [data, setData] = useState(fresh ? cached.data : null);
  const [loading, setLoading] = useState(!fresh);
  const [error, setError] = useState(null);

  useEffect(() => {
    const now = Date.now();
    const c = _cache.get(key);
    if (c && (now - c.ts) < TTL_MS) {
      setData(c.data);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    let p = _inFlight.get(key);
    if (!p) {
      p = fetchBacktest(period, holdDays).then((d) => {
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
        setError(new Error('backtest fetch failed'));
      }
      setLoading(false);
    }).catch((e) => {
      if (cancelled) return;
      setError(e);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [key]);  // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error };
}
