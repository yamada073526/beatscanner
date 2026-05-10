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
let _cachedAt = 0;
let _inFlight = null;
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

async function fetchCalendar() {
  try {
    const r = await fetch('/api/calendar');
    if (!r.ok) return new Map();
    const d = await r.json();
    return buildMap(Array.isArray(d) ? d : []);
  } catch {
    return new Map();
  }
}

export function useEarningsCalendar() {
  const now = Date.now();
  const valid = _cached && now - _cachedAt < TTL_MS;
  const [earningsBySymbol, setEarningsBySymbol] = useState(valid ? _cached : new Map());
  const [loading, setLoading] = useState(!valid);

  useEffect(() => {
    const t = Date.now();
    if (_cached && t - _cachedAt < TTL_MS) {
      setEarningsBySymbol(_cached);
      setLoading(false);
      return;
    }
    if (!_inFlight) {
      _inFlight = fetchCalendar().then((map) => {
        _cached = map;
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
  }, []);

  return { earningsBySymbol, loading };
}
