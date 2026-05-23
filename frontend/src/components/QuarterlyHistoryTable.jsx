import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { fetchQuarterlyHistory } from '../api.js';
// Phase 2.7 Sprint 1 #1': Tier M halo sweep (1 回限り) — useHaloSweepOnce 共通 hook
import { useHaloSweepOnce } from '../hooks/useHaloSweepOnce.js';

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
    // #7-b: qh-cell-surprise で fw600 + accent tint 縦帯強調
    cellClass: (r) => `qh-num qh-cell-surprise qh-${statusFromVerdict(r.eps_verdict)}`,
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
    // #7-a: qh-rev-start で EPS group との境界に 1px 縦罫を付与
    headerClass: 'qh-num qh-rev-start qh-hide-mobile',
    cellClass: 'qh-num qh-rev-start qh-hide-mobile',
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
    // #7-a/#7-c: mobile では revenue_actual/estimated が非表示のため
    //           revenue_surprise に qh-rev-start を付与して divider を維持
    headerClass: 'qh-num qh-rev-start-mobile',
    // #7-b: qh-cell-surprise で fw600 + accent tint 縦帯強調
    cellClass: (r) => `qh-num qh-cell-surprise qh-rev-start-mobile qh-${statusFromVerdict(r.revenue_verdict)}`,
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
  // Phase 2.9 Sprint D #8q-history-phase1 + Sprint G2 文字壁解消:
  // CFPS / CF マージン は PC でも qh-hide-mobile で非表示 (情報は健全性 ✓× で代替表示可)
  // user 「文字壁、 健全性が一番重要」 → 列を絞って健全性 emphasize
  cfps_actual: {
    header: 'CFPS',
    headerClass: 'qh-num qh-hide-mobile',
    cellClass: 'qh-num qh-hide-mobile',
    render: (r) => fmtEPS(r.cfps_actual),
  },
  // 5 条件 #1 CF マージン (CF/売上)、 15% 線で gain/loss tint
  op_cf_margin: {
    header: 'CF マージン',
    headerClass: 'qh-num qh-hide-mobile',
    cellClass: (r) => {
      const v = r.op_cf_margin;
      if (!Number.isFinite(v)) return 'qh-num qh-hide-mobile';
      // 5 条件 #1 基準: 15% 以上を健全とする
      return `qh-num qh-hide-mobile qh-${v >= 0.15 ? 'gain' : 'loss'}`;
    },
    render: (r) => {
      const v = r.op_cf_margin;
      if (!Number.isFinite(v)) return '—';
      return `${(v * 100).toFixed(1)}%`;
    },
  },
  // Phase 2.9 Sprint G2 #健全性強調 (ui-designer + 金融 UX verdict 採用):
  // 5 条件 #5 CFPS > EPS 健全性 (粉飾リスク判定) を「最重要 signal」 として強調
  //   - 列を 2 列目 (期 の隣) に配置 (DEFAULT_COLUMNS で reorder)
  //   - ✓×テキスト → Lucide CheckCircle2 (gain) / XCircle (loss) icon
  //   - セル背景に 4% color-mix tint (gain/loss)
  //   - bold + 短ラベル「CF良好 / 要確認」 で 2 秒理解
  cfps_gt_eps: {
    header: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--color-accent)', fontWeight: 700 }}>★</span>
        健全性
      </span>
    ),
    headerClass: 'qh-num',
    cellClass: (r) => {
      if (r.cfps_gt_eps === null || r.cfps_gt_eps === undefined) return 'qh-num qh-health-cell';
      return `qh-num qh-health-cell qh-health-${r.cfps_gt_eps ? 'ok' : 'warn'}`;
    },
    render: (r) => {
      if (r.cfps_gt_eps === null || r.cfps_gt_eps === undefined) {
        return <span style={{ color: 'var(--text-muted)' }}>—</span>;
      }
      const Icon = r.cfps_gt_eps ? CheckCircle2 : XCircle;
      const label = r.cfps_gt_eps ? 'CF良好' : '要確認';
      const colorVar = r.cfps_gt_eps ? 'var(--color-gain)' : 'var(--color-loss)';
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontWeight: 600,
          color: colorVar,
        }}>
          <Icon size={14} strokeWidth={2} />
          <span>{label}</span>
        </span>
      );
    },
  },
};

const DEFAULT_COLUMNS = [
  'period',
  // Phase 2.9 Sprint G2 #健全性強調: 健全性を 2 列目 (期 の隣) に移動、
  // user 最初に見る位置で「最重要 signal」 を pop。 5 原則 §1 「2 秒理解」 直撃。
  'cfps_gt_eps',
  'eps_actual',
  'eps_estimated',
  'eps_surprise',
  'revenue_actual',
  'revenue_estimated',
  'revenue_surprise',
  // CFPS / CF マージン は qh-hide-mobile で PC でも非表示 (情報は健全性 ✓ で代替)
  'cfps_actual',
  'op_cf_margin',
];

// ── 本体 ────────────────────────────────────────────────
// Phase 2.8 Sprint 1 #3: haloTriggerRef prop — AccordionSection 内にある場合に使用
// 親が haloTriggerRef (useRef) を渡し、onOpenChange(id, true) 時に
// haloTriggerRef.current?.() を呼ぶことで accordion 展開時に halo を 1 回発火。
export default function QuarterlyHistoryTable({ ticker, limit = 8, columns, haloTriggerRef = null, triggerOnMount = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Phase 2.7 Sprint 1 #1': Tier M halo sweep ref (1 回限り)
  const haloRef = useRef(null);
  // Phase 2.9 Sprint 2 #Bug2: haloTriggerRef あり (accordion-controlled) なら IO skip
  // v108 multi-review verdict (議題 1): triggerOnMount=true (ChapterTabs 内) でも IO skip + mount 時 manual trigger
  const { triggerOnAccordionOpen } = useHaloSweepOnce(haloRef, { skipIO: !!haloTriggerRef || triggerOnMount });

  // Phase 2.8 Sprint 1 #3: haloTriggerRef に trigger 関数を register
  useEffect(() => {
    if (haloTriggerRef && typeof haloTriggerRef === 'object') {
      haloTriggerRef.current = triggerOnAccordionOpen;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [haloTriggerRef]);

  // v108 multi-review verdict (議題 1): ChapterTabs の「直近 8Q」 tab 切替 mount 時に halo 1 回発火。
  //   data-halo-fired guard で 2 回目発火防止 (既存 hook の仕様)。
  useEffect(() => {
    if (triggerOnMount) {
      triggerOnAccordionOpen?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerOnMount]);

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

  // handover v82 Phase 5: 8Q streak visual (multi-review 6 体合議 verdict)。
  // 各 Q の EPS Beat + Revenue Beat の組合せで 4 段階 strength を判定:
  //   strong = EPS Beat + Revenue Beat (2 軸両方)
  //   medium = EPS Beat OR Revenue Beat (片方)
  //   weak   = どちらも in-line / unknown
  //   miss   = どちらか miss
  // Aggregate 表記「直近 8Q で X 回 strong (= 両方 Beat)」 を提示。
  const streakStrength = (r) => {
    const epsBeat = r.eps_verdict === 'beat';
    const revBeat = r.revenue_verdict === 'beat';
    const epsMiss = r.eps_verdict === 'miss';
    const revMiss = r.revenue_verdict === 'miss';
    if (epsMiss || revMiss) return 'miss';
    if (epsBeat && revBeat) return 'strong';
    if (epsBeat || revBeat) return 'medium';
    return 'weak';
  };
  const streakCells = rows.slice(0, 8).map((r) => ({
    period: r.fiscal_period || (r.date || '').slice(0, 7),
    strength: streakStrength(r),
  }));
  const strongCount = streakCells.filter((c) => c.strength === 'strong').length;
  const totalCells = streakCells.length;

  return (
    // Phase 2.7 Sprint 1 #1': tier-m-glow wrapper で halo sweep を適用
    // qhistory-wrap は内側に維持 (入れ子 surface-card 禁止教訓遵守)
    <div
      ref={haloRef}
      className="tier-m-glow qhistory-wrap"
      data-testid="quarterly-history-table-wrapper"
      data-spotlight="card"
    >
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

      {/* #7-d: 凡例 + 金商法 §38 配慮文言 (文言一字一句変更禁止) */}
      <div className="qh-legend">
        Beat ≥ +3% / In-line ±3% / Miss ≤ -3%
        <span className="qh-legend-disclaimer">
          （過去実績ベース、将来予測を含みません）
        </span>
      </div>

      {/* handover v82 Phase 5: 8Q streak grid (4 段階 strength + Aggregate 表記) */}
      {totalCells > 0 && (
        <div className="qhistory-streak">
          <div className="qhistory-streak-label">
            直近 {totalCells}Q で <strong>{strongCount}</strong> 回 EPS+売上 両方 Beat
          </div>
          <div className="qhistory-streak-grid" role="img" aria-label={`直近 ${totalCells} 四半期の Beat/Miss strength`}>
            {streakCells.map((c, i) => (
              <span
                key={`${c.period}-${i}`}
                className={`qh-streak-cell qh-streak-${c.strength}`}
                title={`${c.period}: ${c.strength === 'strong' ? 'EPS + 売上 両方 Beat' : c.strength === 'medium' ? '片方 Beat' : c.strength === 'miss' ? 'Miss' : '中立'}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── テーブル ── */}
      {(() => {
        const colIds = (Array.isArray(columns) && columns.length > 0)
          ? columns.filter((id) => COLUMN_DEFS[id])
          : DEFAULT_COLUMNS;
        return (
          <div className="qhistory-table-wrap">
            <table className="qhistory-table">
              {/* #7-a: EPS group / 売上 group の colgroup divider */}
              <colgroup span="1" />
              <colgroup span="3" className="qh-group-eps" />
              <colgroup span="3" className="qh-group-rev" />
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
