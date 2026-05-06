import { useEffect, useState } from 'react';
import { fetchQuarterlyHistory } from '../api.js';

// ── フォーマット ────────────────────────────────────────
function fmtEPS(v) {
  if (!Number.isFinite(v)) return '—';
  return `$${v.toFixed(2)}`;
}
function fmtRevenue(v) {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
function fmtSurprisePct(v) {
  if (!Number.isFinite(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}
function statusFromVerdict(verdict) {
  if (verdict === 'beat') return 'gain';
  if (verdict === 'miss') return 'loss';
  if (verdict === 'in-line') return 'neutral';
  return 'unknown';
}
function verdictLabel(verdict) {
  if (verdict === 'beat') return 'Beat';
  if (verdict === 'miss') return 'Miss';
  if (verdict === 'in-line') return 'In-line';
  return '—';
}

// ── ロード中 / 非 Pro 用のゴースト行 ─────────────────────
export function QuarterlyHistoryGhost() {
  return (
    <div className="qhistory-ghost">
      {[78, 64, 86, 70, 82, 68, 76, 72].map((w, i) => (
        <div key={i} className="qhistory-ghost-row" aria-hidden="true">
          <div className="ghost-bar" style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

// ── 本体 ────────────────────────────────────────────────
export default function QuarterlyHistoryTable({ ticker, limit = 8 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchQuarterlyHistory(ticker, limit);
        if (cancelled) return;
        if (!res || !Array.isArray(res.history) || res.history.length === 0) {
          setError('履歴データが見つかりませんでした');
          setData(null);
        } else {
          setData(res);
        }
      } catch {
        if (!cancelled) {
          setError('データ取得に失敗しました');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ticker, limit]);

  if (loading && !data) return <QuarterlyHistoryGhost />;
  if (error || !data) {
    return (
      <p className="qhistory-empty">
        {error || '履歴データはまだありません'}
      </p>
    );
  }

  const rows = data.history;

  // Beat/Miss 連勝などの集計サマリー (リテンション要素 ②)
  const beatStreak = (() => {
    let n = 0;
    for (const r of rows) {
      if (r.eps_verdict === 'beat') n += 1;
      else break;
    }
    return n;
  })();
  const beatCount = rows.filter((r) => r.eps_verdict === 'beat').length;
  const missCount = rows.filter((r) => r.eps_verdict === 'miss').length;

  return (
    <div className="qhistory-wrap">
      {/* ── サマリー帯 (Beat/Miss 比率) ── */}
      <div className="qhistory-summary">
        <div className="qhistory-stat">
          <span className="qhistory-stat-label">EPS Beat</span>
          <span className="qhistory-stat-value qhistory-stat-gain">
            {beatCount} / {rows.length}
          </span>
        </div>
        <div className="qhistory-stat">
          <span className="qhistory-stat-label">EPS Miss</span>
          <span className="qhistory-stat-value qhistory-stat-loss">
            {missCount}
          </span>
        </div>
        {beatStreak >= 2 && (
          <div className="qhistory-stat qhistory-stat-streak">
            <span className="qhistory-stat-label">連続 Beat</span>
            <span className="qhistory-stat-value qhistory-stat-gain">
              {beatStreak} 期
            </span>
          </div>
        )}
      </div>

      {/* ── テーブル ── */}
      <div className="qhistory-table-wrap">
        <table className="qhistory-table">
          <thead>
            <tr>
              <th>期</th>
              <th className="qh-num">EPS 実績</th>
              <th className="qh-num qh-hide-mobile">EPS 予想</th>
              <th className="qh-num">サプライズ</th>
              <th className="qh-num qh-hide-mobile">売上 実績</th>
              <th className="qh-num qh-hide-mobile">売上 予想</th>
              <th className="qh-num">売上 サプライズ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const epsCls = statusFromVerdict(r.eps_verdict);
              const revCls = statusFromVerdict(r.revenue_verdict);
              const period = r.fiscal_period || (r.date || '').slice(0, 7);
              return (
                <tr key={`${r.date || idx}`}>
                  <td className="qh-period">
                    <div className="qh-period-name">{period}</div>
                    {r.date && <div className="qh-period-date">{r.date}</div>}
                  </td>
                  <td className="qh-num">{fmtEPS(r.eps_actual)}</td>
                  <td className="qh-num qh-hide-mobile">{fmtEPS(r.eps_estimated)}</td>
                  <td className={`qh-num qh-${epsCls}`}>
                    <div className="qh-verdict-line">
                      <span className={`qh-verdict-badge qh-${epsCls}`}>{verdictLabel(r.eps_verdict)}</span>
                      <span className="qh-surprise">{fmtSurprisePct(r.eps_surprise_pct)}</span>
                    </div>
                  </td>
                  <td className="qh-num qh-hide-mobile">{fmtRevenue(r.revenue_actual)}</td>
                  <td className="qh-num qh-hide-mobile">{fmtRevenue(r.revenue_estimated)}</td>
                  <td className={`qh-num qh-${revCls}`}>
                    <div className="qh-verdict-line">
                      <span className={`qh-verdict-badge qh-${revCls}`}>{verdictLabel(r.revenue_verdict)}</span>
                      <span className="qh-surprise">{fmtSurprisePct(r.revenue_surprise_pct)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
