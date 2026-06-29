import { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * SparkBars — 単一系列の bar mini-chart（正本 mockup pane3-full-v4 の .sp2 / .hist bars 準拠）。
 *
 * - data は古→新（直近=右、株価チャートと同方向）。直近バーを brightness/saturate で強調。
 * - bar 高さは min-max 正規化 + floor（小さな変動も見えるように。mockup: floor% + 正規化*(100-floor)%）。
 * - 各バー hover で portal tooltip（期ラベル + 値）。createPortal + position:fixed で親 accordion の
 *   overflow:hidden を escape（EarningsGrowthSpark / QuarterlyHistoryTable と同 idiom）。viewport 端は内側補正。
 *
 * 発光系不触（bar は token 色のみ）。tooltip は inline rgba/rgb（新規 raw hex なし）。
 *
 * @param {object} props
 * @param {Array<number|null>} props.data - 古→新の数値（null 可）
 * @param {string} [props.color] - bar 色（CSS var 推奨）
 * @param {string[]} [props.labels] - 各点の期ラベル（tooltip / aria）
 * @param {(v:number)=>string} [props.valueFormatter] - tooltip / aria の値整形
 * @param {number} [props.height] - コンテナ高さ px
 * @param {number} [props.floorPct] - 最小バー高さ %（基線）
 */
export default function SparkBars({
  data,
  color = 'var(--color-gain)',
  labels,
  valueFormatter,
  height = 48,
  floorPct = 22,
}) {
  const [tip, setTip] = useState(null); // { label, value, x, y } | null

  const vals = Array.isArray(data) ? data : [];
  const finite = vals.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;

  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  const range = hi - lo || 1;
  // 最新の有値 index（直近バー強調用）。
  let lastFiniteIdx = -1;
  for (let i = vals.length - 1; i >= 0; i--) {
    if (Number.isFinite(vals[i])) { lastFiniteIdx = i; break; }
  }

  const fmt = (v) => (valueFormatter ? valueFormatter(v) : String(v));

  const show = (i, e) => {
    const v = vals[i];
    if (!Number.isFinite(v)) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({
      label: labels?.[i] ?? '',
      value: fmt(v),
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top),
    });
  };
  const hide = () => setTip(null);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height, width: '100%' }}>
      {vals.map((v, i) => {
        const finiteV = Number.isFinite(v);
        const hPct = finiteV ? floorPct + Math.round(((v - lo) / range) * (100 - floorPct)) : floorPct;
        const isLatest = i === lastFiniteIdx;
        return (
          <div
            key={i}
            role={finiteV ? 'img' : undefined}
            aria-label={finiteV ? `${labels?.[i] ? `${labels[i]} ` : ''}${fmt(v)}` : undefined}
            onMouseEnter={(e) => show(i, e)}
            onMouseLeave={hide}
            style={{ flex: 1, display: 'flex', alignItems: 'flex-end', height: '100%', minWidth: 0 }}
          >
            <div
              style={{
                width: '100%',
                height: `${hPct}%`,
                minHeight: 3,
                borderRadius: '2px 2px 0 0',
                background: finiteV ? color : 'var(--bg-subtle)',
                opacity: finiteV ? 1 : 0.3,
                filter: isLatest ? 'brightness(1.15) saturate(1.25)' : 'none',
              }}
            />
          </div>
        );
      })}
      {tip && <BarsTooltip tip={tip} />}
    </div>
  );
}

export function BarsTooltip({ tip }) {
  const ref = useRef(null);
  const { label, value, x, y } = tip;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const m = 8;
    let dx = 0;
    if (r.right > window.innerWidth - m) dx = window.innerWidth - m - r.right;
    if (r.left + dx < m) dx = m - r.left;
    if (dx !== 0) el.style.left = `${x + dx}px`;
  }, [x, y]);

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        transform: 'translate(-50%, calc(-100% - 8px))',
        background: 'rgb(30, 41, 59)', // .qh-tip と同色 (slate-800)
        border: '1px solid var(--border-strong)',
        borderRadius: 6,
        padding: '4px 9px',
        fontSize: 10.5,
        lineHeight: 1.45,
        color: 'var(--text-secondary)',
        textAlign: 'left',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: 2000,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
        animation: 'qh-tip-in 0.12s ease-out',
      }}
    >
      {label && <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>{label}: </span>}
      <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{value}</span>
    </div>,
    document.body,
  );
}

// HeatmapTooltip — §② 5条件ヒートマップ用の 2 行 tooltip (上段=条件名・期 / 下段=実数値 + 判定バッジ)。
// BarsTooltip と同じ portal + viewport 端補正。1 行詰め込みを避けて被り解消、数値を強調。
// 判定色は投資業界色ルール (充足=gain緑 / 未充足=loss赤 / データ無=muted)。
const HEATMAP_BADGE = {
  true: { label: '充足', color: 'var(--color-gain)' },
  false: { label: '未充足', color: 'var(--color-loss)' },
  null: { label: 'データ無', color: 'var(--text-muted)' },
};
export function HeatmapTooltip({ tip }) {
  const ref = useRef(null);
  const { condNum, condShort, period, metric, passed, x, y } = tip;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const m = 8;
    let dx = 0;
    if (r.right > window.innerWidth - m) dx = window.innerWidth - m - r.right;
    if (r.left + dx < m) dx = m - r.left;
    if (dx !== 0) el.style.left = `${x + dx}px`;
  }, [x, y]);
  const badge = HEATMAP_BADGE[String(passed)] || HEATMAP_BADGE.null;
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        transform: 'translate(-50%, calc(-100% - 10px))',
        background: 'rgb(30, 41, 59)', // .qh-tip と同色 (slate-800)、BarsTooltip と統一
        border: '1px solid var(--border-strong)',
        borderRadius: 8,
        padding: '6px 10px',
        minWidth: 132,
        pointerEvents: 'none',
        zIndex: 2000,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
        animation: 'qh-tip-in 0.12s ease-out',
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, whiteSpace: 'nowrap' }}>
        {condNum}{condShort}{period ? ` · ${period}` : ''}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {metric
          ? <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{metric}</span>
          : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>}
        <span style={{
          fontSize: 10, fontWeight: 600,
          color: badge.color,
          background: `color-mix(in srgb, ${badge.color} 15%, transparent)`,
          borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap',
        }}>
          {badge.label}
        </span>
      </div>
    </div>,
    document.body,
  );
}
