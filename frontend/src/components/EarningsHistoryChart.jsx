import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import InfoModal from './InfoModal.jsx';

/**
 * EarningsHistoryChart
 *
 * Sprint A (Phase 1.5): SPEC_2026-05-20_pane3-phase15-hotfix.md §5 Sprint A
 * user dogfood feedback「y 軸高さ小さすぎ / 3 期差視認不能」を解消。
 *
 * 設計: small multiples 縦 3 段 → **grouped bars 1 段** (年次 5 年 × 3 指標 cluster)
 *   - SPS (Sales Per Share) = revenue / shares_diluted — cyan (var(--color-accent))
 *   - EPS (Earnings Per Share)                        — teal (#0d9488)
 *   - CFPS (Cash Flow Per Share)                     — slate (rgba of #64748b)
 *   - 3 指標すべて per-share ($ 単位統一)、単一 Y 軸
 *   - YoY% は tooltip テキスト + X 軸直下 badge (var(--color-gain) / var(--color-loss))
 *   - bar 色は brand tone 固定 (投資業界色ルール: 上昇/下落は YoY badge のみ、bar 色に出さない)
 *   - DPS (配当/株) は periods に dps があれば 4 本目追加 (default 3 本固定)
 *   - Sprint 2 で追加した (CFPS - EPS) 補助線は grouped bars 構成で削除
 *     (cluster 内で CFPS bar vs EPS bar の高さ比較で自然に伝わる)
 *
 * Chart Overlay Safety 4 層防御 (feedback_chart_overlay_safety.md 準拠):
 *   1. ErrorBoundary (class component wrapper) — 削除禁止
 *   2. conditional render (data guard)
 *   3. Number.isFinite check (全数値)
 *   4. isAnimationActive=false (全 Bar / ReferenceLine)
 *
 * Props:
 *   periods: Array<{ period, revenue, eps, cfps?, shares_diluted?, dps? }>
 *   currency: string (default 'USD')
 */

// ── Chart Overlay Safety: ErrorBoundary ──────────────────────────────────────
// 削除禁止 (Chart Overlay Safety 4 層防御 1 層目)
class EarningsHistoryChartErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err, info) {
    // 静かに失敗。console は残す (debug 用)
    console.error('[EarningsHistoryChart] ErrorBoundary caught:', err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 'var(--space-6, 24px)',
            color: 'var(--text-muted)',
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          チャートの表示に失敗しました。再読み込みをお試しください。
        </div>
      );
    }
    return this.props.children;
  }
}

// ── grouped bars の brand tone palette ───────────────────────────────────────
// 投資業界色ルール: bar 色は brand tone (上昇/下落は YoY badge のみで表現)
// SPS: var(--color-accent) = cyan — brand emphasis
// EPS: teal-600 (#0d9488) — elevation_scale.md ALLOWED-HEX 追加済み
// CFPS: slate-500 rgba  — ALLOWED-HEX (#64748b ベース)
// DPS: var(--color-warning) = amber — 配当 emphasis
const BAR_COLORS = {
  sps:  'var(--color-accent)',          // cyan (brand)
  eps:  '#0d9488',                      // teal-600 (elevation_scale.md ALLOWED-HEX)
  cfps: 'rgba(100, 116, 139, 0.80)',   // slate-500 alpha
  dps:  'var(--color-warning)',         // amber (配当)
};

// ── Info modal ───────────────────────────────────────────────────────────────
function EarningsHistoryInfoModal({ onClose }) {
  return (
    <InfoModal title="過去業績推移グラフの見方" onClose={onClose}>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          概要
        </p>
        <p className="text-sm leading-relaxed text-slate-700">
          年次 5 年分の「SPS / EPS / CFPS」を 1 段の grouped bars で表示します。
          1 cluster = 1 年で、3 指標すべてが $ 単位で比較できます。
        </p>
      </div>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          3 指標 (per-share) の見方
        </p>
        <ul className="space-y-1 text-sm text-slate-700">
          <li>
            <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>■ SPS</span>
            {' '}(Sales Per Share) = 売上高 ÷ 希薄化後株式数。成長の規模を株主視点で把握。
          </li>
          <li>
            <span style={{ color: '#0d9488', fontWeight: 600 }}>■ EPS</span>
            {' '}(Earnings Per Share) = 利益 ÷ 希薄化後株式数。収益性の中核指標。
          </li>
          <li>
            <span style={{ color: 'rgba(100, 116, 139, 0.9)', fontWeight: 600 }}>■ CFPS</span>
            {' '}(Cash Flow Per Share) = 営業 CF ÷ 希薄化後株式数。会計操作を除外した実態。
          </li>
        </ul>
      </div>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          チェックポイント
        </p>
        <p className="text-sm leading-relaxed text-slate-700">
          同年の cluster で CFPS ≥ EPS であれば独自プロトコル §5 PASS です。
          EPS だけ突出して CFPS が低い年は会計操作の可能性があります。
          cluster が右肩上がり (年次増加) であれば成長継続のサインです。
        </p>
      </div>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          色の凡例
        </p>
        <ul className="space-y-1 text-sm text-slate-700">
          <li>
            <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>■ シアン</span>
            {' '}= SPS (売上/株)
          </li>
          <li>
            <span style={{ color: '#0d9488', fontWeight: 600 }}>■ ティール</span>
            {' '}= EPS (利益/株)
          </li>
          <li>
            <span style={{ color: 'rgba(100, 116, 139, 0.9)', fontWeight: 600 }}>■ スレート</span>
            {' '}= CFPS (営業 CF/株)
          </li>
          <li className="pt-1 border-t border-slate-200 mt-1">
            X 軸直下の数字 = EPS 前年比 (
            <span style={{ color: 'var(--color-gain)', fontWeight: 600 }}>緑</span>
            {' '}増加 ／{' '}
            <span style={{ color: 'var(--color-loss)', fontWeight: 600 }}>赤</span>
            {' '}減少)
          </li>
        </ul>
      </div>
    </InfoModal>
  );
}

// ── Custom grouped tooltip ────────────────────────────────────────────────────
function GroupedTooltip({ active, payload, label, yoyMap }) {
  if (!active || !payload || !payload.length) return null;

  const metaMap = {
    sps:  { label: 'SPS',  color: BAR_COLORS.sps  },
    eps:  { label: 'EPS',  color: BAR_COLORS.eps  },
    cfps: { label: 'CFPS', color: BAR_COLORS.cfps },
    dps:  { label: 'DPS',  color: BAR_COLORS.dps  },
  };

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '8px 12px',
        fontSize: 11,
        color: 'var(--text-primary)',
        boxShadow: 'var(--shadow-2)',
        pointerEvents: 'none',
        minWidth: 140,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 'var(--space-2, 8px)', color: 'var(--text-secondary)' }}>
        {label}
      </div>
      {payload.map((entry) => {
        const key = entry.dataKey;
        const meta = metaMap[key] || { label: key, color: entry.fill };
        // Chart Overlay Safety: Number.isFinite guard
        const rawVal = entry.value;
        const val = Number.isFinite(Number(rawVal)) ? Number(rawVal).toFixed(2) : '—';
        const yoy = yoyMap?.[label]?.[key];
        const yoyColor = Number(yoy) > 0
          ? 'var(--color-gain)'
          : Number(yoy) < 0
          ? 'var(--color-loss)'
          : 'var(--text-muted)';
        const yoySign = Number(yoy) > 0 ? '+' : '';
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2, 8px)', marginBottom: 'var(--space-1, 4px)' }}>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: 2,
                background: meta.color,
                flexShrink: 0,
              }}
            />
            <span style={{ color: 'var(--text-secondary)', minWidth: 36 }}>{meta.label}</span>
            {/* Sprint 1: tabular-nums で数値を等幅に (earnings-history-tooltip-value class) */}
            <span className="earnings-history-tooltip-value" style={{ color: 'var(--text-primary)' }}>${val}</span>
            {yoy != null && Number.isFinite(Number(yoy)) && (
              /* Sprint 1: YoY % も tabular-nums で桁揃え */
              <span className="earnings-history-yoy-badge" style={{ color: yoyColor, marginLeft: 2 }}>
                {yoySign}{Number(yoy).toFixed(1)}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Custom legend ─────────────────────────────────────────────────────────────
function GroupedLegend({ hasDps }) {
  const items = [
    { key: 'sps',  label: 'SPS',  color: BAR_COLORS.sps },
    { key: 'eps',  label: 'EPS',  color: BAR_COLORS.eps },
    { key: 'cfps', label: 'CFPS', color: BAR_COLORS.cfps },
    ...(hasDps ? [{ key: 'dps', label: 'DPS', color: BAR_COLORS.dps }] : []),
  ];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3, 12px)',
        flexWrap: 'wrap',
        fontSize: 10,
        color: 'var(--text-muted)',
        marginBottom: 'var(--space-2, 8px)',
      }}
    >
      {items.map((item) => (
        <span key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: 2,
              background: item.color,
              flexShrink: 0,
            }}
          />
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
function EarningsHistoryChartInner({ periods = [], currency = 'USD' }) {
  const [showModal, setShowModal] = useState(false);

  // Chart Overlay Safety: conditional render + Number.isFinite
  // Sprint A: 年次集計 (最大 5 年)。
  // periods は { period (FY2023 形式 or 2023), revenue, eps, cfps, shares_diluted } の array (古→新)。
  // 同一年 entry が複数ある場合は最後 (最新) のものを使用。
  const chartData = useMemo(() => {
    if (!Array.isArray(periods) || periods.length === 0) return null;

    // period から年を抽出 (FY2023 → 2023、2023 → 2023、2023-09-30 → 2023)
    const byYear = new Map();
    for (const p of periods) {
      const rawPeriod = String(p.period || '');
      const year = rawPeriod.replace(/^FY/, '').slice(0, 4);
      if (!year || !/^\d{4}$/.test(year)) continue;
      // 同年は最後 (最新) を優先
      byYear.set(year, p);
    }

    // 古→新 sort → 最大 5 年
    const sortedEntries = [...byYear.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-5);

    if (sortedEntries.length === 0) return null;

    return sortedEntries.map(([year, p]) => {
      const revenue = Number(p.revenue);
      const eps = Number(p.eps);
      const cfpsRaw = p.cfps != null ? Number(p.cfps) : null;
      const shares = Number(p.shares_diluted);
      const dpsRaw = p.dps != null ? Number(p.dps) : null;

      // SPS: revenue / shares_diluted (Chart Overlay Safety: Number.isFinite ガード)
      let sps = undefined;
      if (Number.isFinite(revenue) && Number.isFinite(shares) && shares > 0) {
        sps = +(revenue / shares).toFixed(2);
      }

      return {
        year: `'${year.slice(-2)}`,     // X 軸表示ラベル ('23 形式)
        yearFull: year,                  // tooltip + testid 用
        // Chart Overlay Safety: undefined は「データなし」で Bar 非表示
        sps,
        eps: Number.isFinite(eps) ? +eps.toFixed(2) : undefined,
        cfps: cfpsRaw !== null && Number.isFinite(cfpsRaw) ? +cfpsRaw.toFixed(2) : undefined,
        dps: dpsRaw !== null && Number.isFinite(dpsRaw) && dpsRaw > 0 ? +dpsRaw.toFixed(2) : undefined,
      };
    });
  }, [periods]);

  // hasCfps: CFPS が 1 件でもあれば表示
  const hasCfps = useMemo(
    () => Boolean(chartData?.some((d) => d.cfps !== undefined)),
    [chartData]
  );

  // hasDps: DPS が 1 件でもあれば 4 本目表示 (配当銘柄のみ)
  const hasDps = useMemo(
    () => Boolean(chartData?.some((d) => d.dps !== undefined)),
    [chartData]
  );

  // YoY マップ: { [yearLabel]: { sps: %, eps: %, cfps: %, dps: % } }
  const yoyMap = useMemo(() => {
    if (!chartData || chartData.length < 2) return {};
    const map = {};
    for (let i = 1; i < chartData.length; i++) {
      const curr = chartData[i];
      const prev = chartData[i - 1];
      const computeYoy = (c, p) => {
        if (c == null || p == null) return null;
        const cn = Number(c);
        const pn = Number(p);
        if (!Number.isFinite(cn) || !Number.isFinite(pn)) return null;
        if (Math.abs(pn) < 1e-9) return null;
        return ((cn - pn) / Math.abs(pn)) * 100;
      };
      map[curr.year] = {
        sps:  computeYoy(curr.sps,  prev.sps),
        eps:  computeYoy(curr.eps,  prev.eps),
        cfps: computeYoy(curr.cfps, prev.cfps),
        dps:  computeYoy(curr.dps,  prev.dps),
      };
    }
    return map;
  }, [chartData]);

  // Chart Overlay Safety: conditional render guard
  if (!chartData) {
    return (
      <section
        className="panel-card"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-6, 24px)',
        }}
      >
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          過去業績データを取得中...
        </div>
      </section>
    );
  }

  return (
    <section
      className="panel-card"
      data-testid="earnings-history-grouped-bars"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-6, 24px)',
      }}
    >
      {/* ── ヘッダー ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-3, 12px)',
          flexWrap: 'wrap',
          gap: 'var(--space-2, 8px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2, 8px)' }}>
          <h3
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
            }}
          >
            過去業績推移 (per-share)
          </h3>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-[9px] font-bold transition-colors"
            style={{
              background: 'rgba(56, 189, 248, 0.15)',
              color: 'rgb(56, 189, 248)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(56, 189, 248, 0.30)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)';
            }}
            aria-label="過去業績推移グラフの見方を表示"
          >
            ？
          </button>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          {chartData.length}Y · {currency}
        </span>
      </div>

      {/* ── 凡例 ── */}
      <GroupedLegend hasDps={hasDps} />

      {/* ── Grouped bars 1 段 ──
          Sprint A: small multiples 縦 3 段 → grouped bars 1 段。
          Bar×3 (SPS/EPS/CFPS) + オプション Bar×1 (DPS)。
          PGE 落とし穴 4 対策: isAnimationActive=false 全 Bar / ReferenceLine。
          Chart Overlay Safety: ResponsiveContainer + isAnimationActive=false */}
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            barCategoryGap="22%"
            barGap={2}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(148, 163, 184, 0.12)"
              vertical={false}
            />
            <XAxis
              dataKey="year"
              stroke="rgba(148, 163, 184, 0.5)"
              tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 600 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(148, 163, 184, 0.25)' }}
            />
            <YAxis
              stroke="transparent"
              tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={(v) => {
                // Chart Overlay Safety: Number.isFinite guard
                const n = Number(v);
                if (!Number.isFinite(n)) return '—';
                return `$${n.toFixed(0)}`;
              }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              content={<GroupedTooltip yoyMap={yoyMap} />}
            />

            {/* SPS — cyan (brand emphasis) */}
            <Bar
              dataKey="sps"
              name="SPS"
              fill={BAR_COLORS.sps}
              isAnimationActive={false}
              radius={[2, 2, 0, 0]}
              maxBarSize={22}
              data-testid="earnings-history-bar-sps"
            >
              {chartData.map((entry, index) => (
                // Chart Overlay Safety: Number.isFinite check
                <Cell
                  key={`sps-cell-${index}`}
                  fill={BAR_COLORS.sps}
                  fillOpacity={Number.isFinite(Number(entry.sps)) ? 0.90 : 0}
                  data-testid="earnings-grouped-bar-sps"
                />
              ))}
            </Bar>

            {/* EPS — teal (#0d9488, elevation_scale.md ALLOWED-HEX) */}
            <Bar
              dataKey="eps"
              name="EPS"
              fill={BAR_COLORS.eps}
              isAnimationActive={false}
              radius={[2, 2, 0, 0]}
              maxBarSize={22}
              data-testid="earnings-history-bar-eps"
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`eps-cell-${index}`}
                  fill={BAR_COLORS.eps}
                  fillOpacity={Number.isFinite(Number(entry.eps)) ? 0.90 : 0}
                  data-testid="earnings-grouped-bar-eps"
                />
              ))}
            </Bar>

            {/* CFPS — slate (条件付き表示) */}
            {hasCfps && (
              <Bar
                dataKey="cfps"
                name="CFPS"
                fill={BAR_COLORS.cfps}
                isAnimationActive={false}
                radius={[2, 2, 0, 0]}
                maxBarSize={22}
                data-testid="earnings-history-bar-cfps"
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cfps-cell-${index}`}
                    fill={BAR_COLORS.cfps}
                    fillOpacity={Number.isFinite(Number(entry.cfps)) ? 0.85 : 0}
                    data-testid="earnings-grouped-bar-cfps"
                  />
                ))}
              </Bar>
            )}

            {/* DPS — amber (配当銘柄: dps > 0 の場合のみ) */}
            {hasDps && (
              <Bar
                dataKey="dps"
                name="DPS"
                fill={BAR_COLORS.dps}
                isAnimationActive={false}
                radius={[2, 2, 0, 0]}
                maxBarSize={22}
                data-testid="earnings-history-bar-dps"
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`dps-cell-${index}`}
                    fill={BAR_COLORS.dps}
                    fillOpacity={Number.isFinite(Number(entry.dps)) ? 0.80 : 0}
                    data-testid="earnings-grouped-bar-dps"
                  />
                ))}
              </Bar>
            )}

            {/* 0 ライン強調 (負値 EPS / CFPS の視認性向上) */}
            <ReferenceLine
              y={0}
              stroke="rgba(148, 163, 184, 0.30)"
              strokeWidth={1}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* YoY badge 行 — EPS 前年比 (X 軸直下) */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          marginTop: 4,
          paddingLeft: 36,
        }}
      >
        {chartData.map((d) => {
          const yoy = yoyMap[d.year]?.eps;
          const hasYoy = yoy != null && Number.isFinite(Number(yoy));
          const yoyNum = hasYoy ? Number(yoy) : 0;
          const color = yoyNum > 0
            ? 'var(--color-gain)'
            : yoyNum < 0
            ? 'var(--color-loss)'
            : 'var(--text-muted)';
          const sign = yoyNum > 0 ? '+' : '';
          // Sprint 1: earnings-history-yoy-badge class で tabular-nums 適用
          return (
            <div
              key={d.year}
              className="earnings-history-yoy-badge"
              data-testid={`earnings-history-yoy-badge-${d.yearFull}`}
              style={{
                flex: 1,
                textAlign: 'center',
                color: hasYoy ? color : 'transparent',
                userSelect: 'none',
              }}
            >
              {hasYoy ? `${sign}${Math.round(yoyNum)}%` : '—'}
            </div>
          );
        })}
      </div>

      <p
        style={{
          marginTop: 'var(--space-3, 12px)',
          fontSize: 10,
          color: 'var(--text-muted)',
          lineHeight: 1.5,
        }}
      >
        ※ SPS = 1 株あたり売上。CFPS = 1 株あたり営業 CF（FCF とは異なります）。YoY% = EPS 前年比。
      </p>

      {/* Info modal */}
      {showModal && (
        <EarningsHistoryInfoModal onClose={() => setShowModal(false)} />
      )}
    </section>
  );
}

// Chart Overlay Safety 最外層 ErrorBoundary wrap
// Phase 3 #6: outermost wrapper div に viewTransitionName を付与。
// ErrorBoundary / Recharts / isAnimationActive は一切変更しない (4 層防御維持)。
export default function EarningsHistoryChart(props) {
  return (
    <div style={{ viewTransitionName: 'pane3-earnings-history' }}>
      <EarningsHistoryChartErrorBoundary>
        <EarningsHistoryChartInner {...props} />
      </EarningsHistoryChartErrorBoundary>
    </div>
  );
}
