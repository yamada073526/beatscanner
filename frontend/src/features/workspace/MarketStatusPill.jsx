/**
 * MarketStatusPill — NYSE 開閉状態を Header に 1 行表示.
 *
 * v65 §B Step 2 (Anthropic engineer 推奨設計):
 *   - React.memo で WorkspaceHeader の re-render 連鎖から isolate
 *   - 内部で 60s tick (local interval)、5 分毎に /api/market-status を refetch
 *   - phase: 'pre' | 'open' | 'after' | 'closed' (+ 'unknown')
 *
 * Display:
 *   - open    → 緑 dot + "Market Open · Closes 3h 42m"
 *   - pre     → amber dot + "Pre-Market · Opens in 1h 12m"
 *   - after   → amber dot + "After Hours · Opens in 13h"
 *   - closed  → muted dot + "Closed · Opens Mon 9:30"
 */
import { memo, useEffect, useState } from 'react';
import { fetchMarketStatus } from '../../api.js';

function fmtDuration(secs) {
  if (!Number.isFinite(secs) || secs <= 0) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const hr = h % 24;
    return hr > 0 ? `${d}d ${hr}h` : `${d}d`;
  }
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function fmtNextOpen(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    // ET の曜日と時刻を取得 (toLocaleString で tz 指定)
    const wd = d.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
    return `${wd} 9:30`;
  } catch {
    return '';
  }
}

function phaseStyle(phase) {
  switch (phase) {
    case 'open':   return { dot: 'rgb(34,197,94)',  text: 'var(--text-secondary)', label: 'Market Open' };
    case 'pre':    return { dot: 'rgb(245,158,11)', text: 'var(--text-secondary)', label: 'Pre-Market' };
    case 'after':  return { dot: 'rgb(245,158,11)', text: 'var(--text-secondary)', label: 'After Hours' };
    case 'closed': return { dot: 'var(--text-muted)', text: 'var(--text-muted)',   label: 'Closed' };
    default:       return { dot: 'var(--text-muted)', text: 'var(--text-muted)',   label: '—' };
  }
}

const MarketStatusPill = memo(function MarketStatusPill() {
  const [status, setStatus] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const s = await fetchMarketStatus();
        if (!cancelled && s) setStatus(s);
      } catch { /* noop */ }
    };
    load();
    const refetch = setInterval(load, 5 * 60_000);
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => { cancelled = true; clearInterval(refetch); clearInterval(tick); };
  }, []);

  if (!status || !status.phase) return null;

  const nextMs = status.next_event ? Date.parse(status.next_event) : 0;
  const secondsLeft = nextMs > 0 ? Math.max(0, Math.floor((nextMs - now) / 1000)) : (status.seconds_to_next || 0);
  const { dot, text, label } = phaseStyle(status.phase);

  let suffix;
  if (status.phase === 'open') {
    suffix = `Closes in ${fmtDuration(secondsLeft)}`;
  } else if (status.phase === 'pre' || status.phase === 'after') {
    suffix = `Opens in ${fmtDuration(secondsLeft)}`;
  } else {
    suffix = `Opens ${fmtNextOpen(status.next_event)}`;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      title={`NYSE ${label} — ${suffix}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 24,
        padding: '0 10px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-pill, 9999px)',
        background: 'var(--bg-card)',
        fontSize: 11,
        color: text,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: dot,
          flexShrink: 0,
          boxShadow: status.phase === 'open' ? `0 0 6px ${dot}` : 'none',
        }}
      />
      <span style={{ fontWeight: 500 }}>{label}</span>
      <span style={{ color: 'var(--text-muted)' }}>·</span>
      <span>{suffix}</span>
    </div>
  );
});

export default MarketStatusPill;
