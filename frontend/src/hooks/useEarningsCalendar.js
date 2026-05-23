/**
 * useEarningsCalendar — 銘柄 → 次決算日 Map を取得する hook.
 *
 * v62 WS-Phase2 改善希望④「決算まで N 日」meta 実装で使用.
 * /api/calendar (1500+ 件) を 1 回だけ fetch、module-level cache で全 row 共有.
 *
 * 戻り値: { earningsBySymbol: Map<string, { date: string, daysUntil: number }>, loading: boolean }
 *
 * cache TTL: 30 分 (calendar は 1 日 1 回更新で十分)
 */
import { useEffect, useState } from 'react';

let _cached = null;
let _cachedKey = '';
let _cachedAt = 0;
let _inFlight = null;
let _inFlightKey = '';
const TTL_MS = 30 * 60 * 1000;

function buildMap(rawList) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const map = new Map();
  for (const it of rawList || []) {
    if (!it?.symbol || !it?.date) continue;
    try {
      const dt = new Date(`${it.date}T00:00:00`);
      const daysUntil = Math.floor((dt - today) / 86_400_000);
      // 過去決算は除外 (future-only). 既存エントリより近い日付なら更新
      if (daysUntil < 0) continue;
      const sym = String(it.symbol).toUpperCase();
      const prev = map.get(sym);
      if (!prev || daysUntil < prev.daysUntil) {
        map.set(sym, { date: it.date, daysUntil });
      }
    } catch { /* skip parse error */ }
  }
  return map;
}

// v100 user dogfood (handover §100点 multi-review、 AA / NVDA countdown 表示なし真因):
//   旧 fetch('/api/calendar') は Finnhub バルクのみで AA / NVDA 等が漏れる。
//   user の watchlist を渡すと backend が yfinance 個別取得 fallback を回し、
//   主要銘柄の next earnings date が補完される。 days=180 で 6 ヶ月先までカバー。
async function fetchCalendar(watchlist = []) {
  try {
    const params = new URLSearchParams({ days: '180' });
    if (watchlist.length) params.set('watchlist', watchlist.join(','));
    const r = await fetch(`/api/calendar?${params.toString()}`);
    if (!r.ok) return new Map();
    const d = await r.json();
    return buildMap(Array.isArray(d) ? d : []);
  } catch {
    return new Map();
  }
}

export function useEarningsCalendar(watchlist = []) {
  const now = Date.now();
  // watchlist の内容で cache key 切替 (同一 user 内では watchlist 変動少ない想定で粗 cache 維持)
  const cacheKey = watchlist.slice().sort().join(',');
  const valid = _cached && _cachedKey === cacheKey && now - _cachedAt < TTL_MS;
  const [earningsBySymbol, setEarningsBySymbol] = useState(valid ? _cached : new Map());
  const [loading, setLoading] = useState(!valid);

  useEffect(() => {
    const t = Date.now();
    if (_cached && _cachedKey === cacheKey && t - _cachedAt < TTL_MS) {
      setEarningsBySymbol(_cached);
      setLoading(false);
      return;
    }
    if (!_inFlight || _inFlightKey !== cacheKey) {
      _inFlightKey = cacheKey;
      _inFlight = fetchCalendar(watchlist).then((map) => {
        _cached = map;
        _cachedKey = cacheKey;
        _cachedAt = Date.now();
        _inFlight = null;
        return map;
      });
    }
    let cancelled = false;
    _inFlight.then((map) => {
      if (!cancelled) {
        setEarningsBySymbol(map);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [cacheKey]);

  return { earningsBySymbol, loading };
}
