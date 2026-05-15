/**
 * usePortfolioEvents — Pane 3 portfolio detail の events lane bulk fetch hook (v71 Phase 3-c).
 *
 * 1 req で複数銘柄の ex-div + 8-K filings をまとめて取得し、 ticker→list の Map で返す。
 *
 * 設計参考: useEarningsCalendar.js (module-level cache + in-flight dedup pattern)。
 * cache TTL: 30 分 (24h dividends cache + 12h filings cache は backend 側に存在)。
 *
 * 戻り値: {
 *   exDivByTicker:   Map<string, Array<{ date, amount, paymentDate, recordDate }>>,
 *   filingsByTicker: Map<string, Array<{ date, title, url }>>,
 *   loading: boolean,
 * }
 */
import { useEffect, useMemo, useState } from 'react';
import { fetchPortfolioEvents } from '../api.js';

const EMPTY_MAP = new Map();
const TTL_MS = 30 * 60 * 1000;

const _cache = new Map();      // key → { ts, exDivByTicker, filingsByTicker }
const _inFlight = new Map();   // key → Promise

function buildKey(tickers, lookbackDays) {
  if (!Array.isArray(tickers) || tickers.length === 0) return '';
  const sorted = [...tickers].map((t) => String(t).toUpperCase()).sort();
  return `${sorted.join(',')}|${lookbackDays}`;
}

function buildMaps(items) {
  const exDivByTicker = new Map();
  const filingsByTicker = new Map();
  for (const row of items || []) {
    if (!row?.ticker) continue;
    const t = String(row.ticker).toUpperCase();
    if (Array.isArray(row.ex_dividends) && row.ex_dividends.length > 0) {
      exDivByTicker.set(t, row.ex_dividends);
    }
    if (Array.isArray(row.filings_8k) && row.filings_8k.length > 0) {
      filingsByTicker.set(t, row.filings_8k);
    }
  }
  return { exDivByTicker, filingsByTicker };
}

export function usePortfolioEvents(tickers, opts = {}) {
  const lookbackDays = opts.lookbackDays ?? 30;
  const filingsLimit = opts.filingsLimit ?? 5;
  const key = useMemo(() => buildKey(tickers, lookbackDays), [tickers, lookbackDays]);

  const cached = key ? _cache.get(key) : null;
  const isFresh = cached && (Date.now() - cached.ts) < TTL_MS;

  const [state, setState] = useState(() => ({
    exDivByTicker: isFresh ? cached.exDivByTicker : EMPTY_MAP,
    filingsByTicker: isFresh ? cached.filingsByTicker : EMPTY_MAP,
    loading: !isFresh && Boolean(key),
  }));

  useEffect(() => {
    if (!key) {
      setState({ exDivByTicker: EMPTY_MAP, filingsByTicker: EMPTY_MAP, loading: false });
      return;
    }
    const c = _cache.get(key);
    if (c && (Date.now() - c.ts) < TTL_MS) {
      setState({
        exDivByTicker: c.exDivByTicker,
        filingsByTicker: c.filingsByTicker,
        loading: false,
      });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    let p = _inFlight.get(key);
    if (!p) {
      p = fetchPortfolioEvents(tickers, { lookbackDays, filingsLimit })
        .then((data) => {
          const maps = buildMaps(data?.items);
          _cache.set(key, { ts: Date.now(), ...maps });
          _inFlight.delete(key);
          return maps;
        })
        .catch(() => {
          _inFlight.delete(key);
          return { exDivByTicker: EMPTY_MAP, filingsByTicker: EMPTY_MAP };
        });
      _inFlight.set(key, p);
    }

    p.then((maps) => {
      if (cancelled) return;
      setState({
        exDivByTicker: maps.exDivByTicker,
        filingsByTicker: maps.filingsByTicker,
        loading: false,
      });
    });

    return () => { cancelled = true; };
  }, [key]);  // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
