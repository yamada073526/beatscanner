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

// ── 列定義 (handover v82 Phase 3 で columns prop 拡張) ──────────────
// 既存 7 列 = default。 caller が columns prop で順序や列追加を override 可能。
// op_margin_qoq は backend API が値を返したら自動表示、 未提供なら '—'。
const COLUMN_DEFS = {
  period: {
    header: '期',
    headerClass: '',
    cellClass: 'qh-period',
    render: (r) => {
      const period = r.fiscal_period || (r.date || '').slice(0, 7);
      return (
        <>
          <div className="qh-period-name">{period}</div>
          {r.date && <div className="qh-period-date">{r.date}</div>}
        </>
      );
    },
  },
  eps_actual: {
    header: 'EPS 実績',
    headerClass: 'qh-num',
    cellClass: 'qh-num',
    render: (r) => fmtEPS(r.eps_actual),
  },
  eps_estimated: {
    header: 'EPS 予想',
    headerClass: 'qh-num qh-hide-mobile',
    cellClass: 'qh-num qh-hide-mobile',
    render: (r) => fmtEPS(r.eps_estimated),
  },
  eps_surprise: {
    header: 'サプライズ',
    headerClass: 'qh-num',
    cellClass: (r) => `qh-num qh-${statusFromVerdict(r.eps_verdict)}`,
    render: (r) => {
      const cls = statusFromVerdict(r.eps_verdict);
      return (
        <div className="qh-verdict-line">
          <span className={`qh-verdict-badge qh-${cls}`}>{verdictLabel(r.eps_verdict)}</span>
          <span className="qh-surprise">{fmtSurprisePct(r.eps_surprise_pct)}</span>
        </div>
      );
    },
  },
  revenue_actual: {
    header: '売上 実績',
    headerClass: 'qh-num qh-hide-mobile',
    cellClass: 'qh-num qh-hide-mobile',
    render: (r) => fmtRevenue(r.revenue_actual),
  },
  revenue_estimated: {
    header: '売上 予想',
    headerClass: 'qh-num qh-hide-mobile',
    cellClass: 'qh-num qh-hide-mobile',
    render: (r) => fmtRevenue(r.revenue_estimated),
  },
  revenue_surprise: {
    header: '売上 サプライズ',
    headerClass: 'qh-num',
    cellClass: (r) => `qh-num qh-${statusFromVerdict(r.revenue_verdict)}`,
    render: (r) => {
      const cls = statusFromVerdict(r.revenue_verdict);
      return (
        <div className="qh-verdict-line">
          <span className={`qh-verdict-badge qh-${cls}`}>{verdictLabel(r.revenue_verdict)}</span>
          <span className="qh-surprise">{fmtSurprisePct(r.revenue_surprise_pct)}</span>
        </div>
      );
    },
  },
  // handover v82 Phase 3: 8 列拡張用 (AnalystPanel から指定するときのみ含める)。
  // backend `/api/guidance/{ticker}/quarterly-history` が op_margin_qoq を返したら
  // 自動表示、 未提供 (現状 default) は '—' で muted 表示。
  op_margin_qoq: {
    header: '営業利益率 QoQ',
    headerClass: 'qh-num qh-hide-mobile',
    cellClass: 'qh-num qh-hide-mobile qh-muted',
    render: (r) => {
      const v = r.op_margin_qoq;
      if (!Number.isFinite(v)) return '—';
      const sign = v > 0 ? '+' : '';
      return `${sign}${v.toFixed(1)}pp`;
    },
  },
};

const DEFAULT_COLUMNS = [
  'period',
  'eps_actual',
  'eps_estimated',
  'eps_surprise',
  'revenue_actual',
  'revenue_estimated',
  'revenue_surprise',
];

// ── 本体 ────────────────────────────────────────────────
export default function QuarterlyHistoryTable({ ticker, limit = 8, columns }) {
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
      {(() => {
        const colIds = (Array.isArray(columns) && columns.length > 0)
          ? columns.filter((id) => COLUMN_DEFS[id])
          : DEFAULT_COLUMNS;
        return (
          <div className="qhistory-table-wrap">
            <table className="qhistory-table">
              <thead>
                <tr>
                  {colIds.map((id) => {
                    const def = COLUMN_DEFS[id];
                    return (
                      <th key={id} className={def.headerClass || ''}>
                        {def.header}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={`${r.date || idx}`}>
                    {colIds.map((id) => {
                      const def = COLUMN_DEFS[id];
                      const cls = typeof def.cellClass === 'function'
                        ? def.cellClass(r)
                        : def.cellClass || '';
                      return <td key={id} className={cls}>{def.render(r)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}
