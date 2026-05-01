/**
 * DiagramCard — React DOM-based visualization panel.
 * Replaces VizPanel's dangerouslySetInnerHTML SVG rendering with proper React elements.
 * Business model flow uses CSS flexbox; charts use inline JSX SVG (no string templates).
 */
import { useState, useEffect, useRef } from 'react';

function VizSectionLabel({ text }) {
  return (
    <div style={{
      fontSize: '13px', fontWeight: '700', letterSpacing: '0.5px',
      color: '#38BDF8', marginBottom: '10px', marginTop: '32px',  // 20→32px
    }}>
      {text}
    </div>
  );
}

function FlowBox({ step }) {
  const label  = step.label  || '';
  const detail = step.detail || step.sub || '';
  return (
    <div style={{
      flex: '0 0 auto', width: '120px',
      padding: '10px 8px', backgroundColor: '#38BDF8',
      borderRadius: '10px', textAlign: 'center',
    }}>
      <div style={{
        fontSize: '14px', fontWeight: '800', color: '#0F172A',
        marginBottom: detail ? '4px' : 0, lineHeight: 1.3,
        wordBreak: 'keep-all', overflowWrap: 'anywhere',
      }}>
        {label}
      </div>
      {detail && (
        <div style={{
          fontSize: '11px', color: '#1E3A5F', lineHeight: 1.4,
          wordBreak: 'keep-all', overflowWrap: 'anywhere',
        }}>
          {detail}
        </div>
      )}
    </div>
  );
}

// ── Segment row (e.g. Intelligent Cloud / P&BP / MPC) ─────────────────────
function SegmentBar({ seg }) {
  const yoyColor = (seg.yoy_pct ?? 0) >= 0 ? '#10B981' : '#ef4444';
  const displayName = String(seg.name || '')
    .replace('Intelligent Cloud', '☁️ Intelligent Cloud')
    .replace('Productivity and Business Processes', '📊 Productivity & BP')
    .replace('More Personal Computing', '💻 More Personal Computing');
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
      padding: '7px 10px',
      borderRadius: '6px',
      background: 'var(--bg-subtle)',
      border: '1px solid var(--border)',
      gap: '8px',
    }}>
      <div style={{
        fontSize: '11px', color: 'var(--text-muted)',
        flex: '1 1 0', minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {displayName}
      </div>
      <div style={{
        fontSize: '13px', fontWeight: '700',
        color: 'var(--text-primary)', flexShrink: 0,
      }}>
        ${seg.value_b}B
      </div>
      {seg.yoy_pct !== undefined && (
        <div style={{
          fontSize: '11px', fontWeight: '700',
          color: yoyColor,
          background: `${yoyColor}18`,
          padding: '2px 7px', borderRadius: '4px',
          flexShrink: 0,
        }}>
          {seg.yoy_pct >= 0 ? '+' : ''}{seg.yoy_pct}%
        </div>
      )}
    </div>
  );
}

function BarChartPanel({ trend, operatingMargins }) {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, value: null, period: null, yoy: null, beat: null, beatMargin: null });

  if (!trend?.data?.length) return null;
  const pts = (trend.data || []).filter(d => d.value != null);
  if (!pts.length) return null;

  const vals   = pts.map(d => d.value);
  const maxV   = Math.max(...vals);
  const minV   = Math.min(0, Math.min(...vals));
  const range  = maxV - minV || 1;

  const n            = pts.length;
  const BAR_W        = n >= 5 ? 32 : n >= 4 ? 38 : 44;
  const SPACING      = n >= 5 ? 12 : n >= 4 ? 16 : 20;
  const LEFT_PAD     = 40;
  const RIGHT_PAD    = 10;
  const YOY_AREA_TOP = 32;   // YoY label clamp ceiling
  const BAR_AREA_TOP = 54;   // bars start here (leaves room for YoY labels above)
  const BAR_CHART_H  = 120;
  const AXIS_Y       = BAR_AREA_TOP + BAR_CHART_H;  // 174
  const XLAB_Y       = AXIS_Y + 20;                  // 194
  const BEAT_Y       = XLAB_Y + 18;                  // 212
  const SVG_W        = LEFT_PAD + n * BAR_W + (n - 1) * SPACING + RIGHT_PAD;
  const SVG_H        = BEAT_Y + 14;                  // ≒ 226（vs Est 副ラベル廃止に伴い縮小）

  const bxArr = pts.map((_, i) => LEFT_PAD + i * (BAR_W + SPACING));
  const cxArr = bxArr.map(bx => bx + BAR_W / 2);

  const isRevenue = trend.metric === '売上高';
  const mData     = isRevenue && operatingMargins
    ? operatingMargins.filter(d => d.value != null).slice(0, pts.length)
    : [];
  const hasMargin = mData.length >= 2;

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {/* Y-axis max label */}
      <text x={LEFT_PAD - 4} y={BAR_AREA_TOP + 8} textAnchor="end" fontSize="10" fontWeight="600" fill="#9ca3af">
        {maxV}
      </text>
      {/* ── Y軸グリッドライン（3本）と目盛りラベル ── */}
      {[0.25, 0.5, 0.75].map(ratio => {
        const gridY = AXIS_Y - BAR_CHART_H * ratio;
        const gridV = minV + range * ratio;
        return (
          <g key={ratio}>
            <line
              x1={LEFT_PAD} y1={gridY}
              x2={SVG_W - RIGHT_PAD} y2={gridY}
              stroke="#334155" strokeWidth="0.5" strokeDasharray="3,3"
            />
            <text
              x={LEFT_PAD - 4} y={gridY + 4}
              textAnchor="end" fontSize="9" fill="#475569"
            >
              {gridV >= 1000 ? `${(gridV / 1000).toFixed(0)}k`
                : gridV >= 1 ? gridV.toFixed(0)
                : gridV.toFixed(2)}
            </text>
          </g>
        );
      })}
      {/* Axis line */}
      <line x1={LEFT_PAD} y1={AXIS_Y} x2={SVG_W - RIGHT_PAD} y2={AXIS_Y} stroke="#e2e8f0" strokeWidth="1" />

      {/* ── パス1：バー（rect）+ ホバーイベント ── */}
      {pts.map((d, i) => {
        const barH     = Math.max(4, Math.round(((d.value - minV) / range) * BAR_CHART_H));
        const bx       = bxArr[i];
        const by       = AXIS_Y - barH;
        const isLatest = i === pts.length - 1;
        const fill     = isLatest ? '#38BDF8' : '#64748b';
        const prev     = i > 0 ? pts[i - 1] : null;
        const yoy      = prev?.value ? ((d.value - prev.value) / Math.abs(prev.value) * 100) : null;
        return (
          <rect
            key={`bar-${i}`}
            x={bx} y={by} width={BAR_W} height={barH} rx="3" fill={fill}
            style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = '0.75';
              setTooltip({ visible: true, x: bxArr[i] + BAR_W / 2, y: by, value: d.value, period: d.period, yoy, beat: d.beat, beatMargin: d.beatMargin });
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = '1';
              setTooltip(prev => ({ ...prev, visible: false }));
            }}
          />
        );
      })}

      {/* ── パス2：全ラベル（前面） ── */}
      {pts.map((d, i) => {
        const barH     = Math.max(4, Math.round(((d.value - minV) / range) * BAR_CHART_H));
        const by       = AXIS_Y - barH;
        const cx       = cxArr[i];
        const isLatest = i === pts.length - 1;

        const prev      = i > 0 ? pts[i - 1] : null;
        const yoy       = prev?.value ? ((d.value - prev.value) / Math.abs(prev.value) * 100) : null;
        const beatLabel = d.beat === true ? '▲BEAT' : d.beat === false ? '▼MISS' : null;
        const beatFill  = d.beat === true ? '#10B981' : '#ef4444';

        // ── YoY label placement (常にバー外側上部・BarChartWithMargin と統一) ──
        const insideBar = false;
        const yoyFill   = '#38BDF8';
        const yoyY      = yoy !== null
          ? Math.max(YOY_AREA_TOP, by - 18)
          : null;

        // ── Value label placement ──
        // 値は常にバー内部下寄せ（高さが十分な場合）またはバー外側上部
        const valInside = barH >= 22;
        const valY = valInside
          ? AXIS_Y - 8   // バー内部の最下部付近
          : by - 4;      // バー外側上部
        const valFill = valInside ? 'white' : (isLatest ? '#38BDF8' : '#94a3b8');

        return (
          <g key={`label-${i}`}>
            {/* YoY（2行） */}
            {yoyY !== null && (
              <text x={cx} y={yoyY} textAnchor="middle" fontWeight="700" fill={yoyFill}>
                <tspan x={cx} dy="0" fontSize={n >= 5 ? 9 : 11}>
                  {yoy >= 0 ? '+' : ''}{yoy.toFixed(1)}%
                </tspan>
                <tspan x={cx} dy="12" fontSize="9" fontWeight="500" opacity="0.8">
                  YoY
                </tspan>
              </text>
            )}
            {/* 絶対値 */}
            <text x={cx} y={valY} textAnchor="middle" fontSize="11" fontWeight="700" fill={valFill}>
              {d.value}
            </text>
            {/* 期間ラベル */}
            <text x={cx} y={XLAB_Y} textAnchor="middle" fontSize={n >= 5 ? 10 : 12} fontWeight="600" fill="#6b7280">
              {String(d.period).replace('FY', '')}
            </text>
            {/* BEAT/MISS（乖離率があれば併記） */}
            {beatLabel && (
              <>
                <text x={cx} y={BEAT_Y} textAnchor="middle" fontSize="11" fontWeight="700" fill={beatFill}>
                  {beatLabel}
                </text>
                {/* 「vs Est」副ラベルは横方向の重なりが避けられないため、
                    バー直下のSVGテキスト描画を廃止し、ホバーツールチップに集約 */}
              </>
            )}
          </g>
        );
      })}

      {/* ── ツールチップ ── */}
      {tooltip.visible && (
        <foreignObject
          x={Math.min(Math.max(tooltip.x - 60, LEFT_PAD), SVG_W - 125)}
          y={Math.max(tooltip.y - 72, 0)}
          width="120" height="80"
          style={{ pointerEvents: 'none', overflow: 'visible' }}
        >
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '7px',
            padding: '6px 10px',
            fontSize: '11px',
            color: '#e2e8f0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
          }}>
            <div style={{ fontWeight: '700', color: '#38BDF8', marginBottom: '2px' }}>
              {String(tooltip.period).replace('FY', '')}
            </div>
            <div style={{ marginBottom: '2px' }}>
              {tooltip.value}{trend.unit || ''}
            </div>
            {tooltip.yoy !== null && (
              <div style={{ color: tooltip.yoy >= 0 ? '#10B981' : '#ef4444', marginBottom: '2px' }}>
                YoY {tooltip.yoy >= 0 ? '+' : ''}{tooltip.yoy.toFixed(1)}%
              </div>
            )}
            {tooltip.beatMargin != null && (
              <div style={{ color: tooltip.beat ? '#10B981' : '#ef4444', fontSize: '10px' }}>
                {tooltip.beat ? '▲BEAT' : '▼MISS'} {tooltip.beatMargin > 0 ? '+' : ''}{tooltip.beatMargin.toFixed(1)}% vs Est
              </div>
            )}
          </div>
        </foreignObject>
      )}
    </svg>
  );
}

/**
 * BarChartWithMargin — revenue chart with operating margin sparkline overlay.
 *
 * Vertical layout (Y positions):
 *   Y=28        : 「営業利益率▶」legend  (MARGIN_LABEL_Y)
 *   Y=[38, 62]  : margin sparkline band  (OP_AREA_TOP / OP_AREA_BTM)
 *                 dots scaled by opToY(); labels at dotY - 6
 *   Y=62+       : YoY labels  (by - 10, min = BAR_AREA_TOP - 10 = 62 → touches band bottom, no overlap)
 *   Y=72        : bar area starts  (BAR_AREA_TOP)
 *   Y=182       : axis line  (BAR_AREA_TOP + BAR_CHART_H)
 *   Y=196       : period labels
 *   Y=210       : BEAT/MISS labels
 */
function BarChartWithMargin({ trend, operatingMargins }) {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, value: null, period: null, yoy: null, beat: null, beatMargin: null });

  if (!trend?.data?.length) return null;
  const pts = (trend.data || []).filter(d => d.value != null);
  if (!pts.length) return null;

  const vals  = pts.map(d => d.value);
  const maxV  = Math.max(...vals);
  const minV  = Math.min(0, Math.min(...vals));
  const range = maxV - minV || 1;

  const n            = pts.length;
  const BAR_W        = n >= 5 ? 32 : n >= 4 ? 38 : 44;
  const SPACING      = n >= 5 ? 12 : n >= 4 ? 16 : 20;
  const LEFT_PAD     = 40;
  const RIGHT_PAD    = 10;
  const MARGIN_LABEL_Y = 32;   // 「営業利益率▶」legend
  const OP_AREA_TOP    = 46;   // sparkline band top
  const OP_AREA_BTM    = 72;   // sparkline band bottom
  const BAR_AREA_TOP   = 86;   // bars start (gap above = 86-72 = 14px; YoY at by-10, min=76 > 72 ✓)
  const BAR_CHART_H    = 120;
  const AXIS_Y         = BAR_AREA_TOP + BAR_CHART_H;  // 206
  const XLAB_Y         = AXIS_Y + 20;                  // 226
  const BEAT_Y         = XLAB_Y + 18;                  // 244
  const SVG_W          = LEFT_PAD + n * BAR_W + (n - 1) * SPACING + RIGHT_PAD;
  const SVG_H          = BEAT_Y + 14;                  // ≒ 258（vs Est 副ラベル廃止）

  const bxArr = pts.map((_, i) => LEFT_PAD + i * (BAR_W + SPACING));
  const cxArr = bxArr.map(bx => bx + BAR_W / 2);

  const mData     = (operatingMargins || []).filter(d => d.value != null).slice(0, pts.length);
  const hasMargin = mData.length >= 2;

  // Build opToY scale from actual margin values (±5% padding so line isn't flat-edge)
  let opToY = null;
  if (hasMargin) {
    const mVals   = mData.map(d => d.value);
    const opMin   = Math.min(...mVals) * 0.95;
    const opMax   = Math.max(...mVals) * 1.05;
    const opRange = Math.max(opMax - opMin, 0.01);
    opToY = v => OP_AREA_BTM - ((v - opMin) / opRange) * (OP_AREA_BTM - OP_AREA_TOP);
  }

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {/* Y-axis max label */}
      <text x={LEFT_PAD - 4} y={BAR_AREA_TOP + 8} textAnchor="end" fontSize="10" fontWeight="600" fill="#9ca3af">
        {maxV}
      </text>
      {/* ── Y軸グリッドライン（3本）と目盛りラベル ── */}
      {[0.25, 0.5, 0.75].map(ratio => {
        const gridY = AXIS_Y - BAR_CHART_H * ratio;
        const gridV = minV + range * ratio;
        return (
          <g key={ratio}>
            <line
              x1={LEFT_PAD} y1={gridY}
              x2={SVG_W - RIGHT_PAD} y2={gridY}
              stroke="#334155" strokeWidth="0.5" strokeDasharray="3,3"
            />
            <text
              x={LEFT_PAD - 4} y={gridY + 4}
              textAnchor="end" fontSize="9" fill="#475569"
            >
              {gridV >= 1000 ? `${(gridV / 1000).toFixed(0)}k`
                : gridV >= 1 ? gridV.toFixed(0)
                : gridV.toFixed(2)}
            </text>
          </g>
        );
      })}
      {/* Axis line */}
      <line x1={LEFT_PAD} y1={AXIS_Y} x2={SVG_W - RIGHT_PAD} y2={AXIS_Y} stroke="#e2e8f0" strokeWidth="1" />

      {/* ── Operating margin sparkline band y=[38, 62] ── */}
      {hasMargin && opToY && (
        <g>
          {/* Legend with dashed-line sample (TASK 3) */}
          <line
            x1={LEFT_PAD} y1={MARGIN_LABEL_Y - 3}
            x2={LEFT_PAD + 14} y2={MARGIN_LABEL_Y - 3}
            stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="4,3"
          />
          <text x={LEFT_PAD + 17} y={MARGIN_LABEL_Y}
            textAnchor="start" fontSize="10" fontWeight="700" fill="#F59E0B">
            営業利益率
          </text>
          {/* Dashed polyline — scaled by opToY so line tilts with actual margin changes */}
          <polyline
            points={mData.map((d, i) => `${cxArr[i].toFixed(1)},${opToY(d.value).toFixed(1)}`).join(' ')}
            stroke="#F59E0B" strokeWidth="1.5" fill="none" strokeDasharray="4,3" />
          {/* Dot + value label for each period */}
          {mData.map((d, i) => {
            const dy = opToY(d.value);
            return (
              <g key={i}>
                <circle cx={cxArr[i]} cy={dy} r="3.5"
                  fill="#F59E0B" stroke="white" strokeWidth="1" />
                <text x={cxArr[i]} y={dy - 6}
                  textAnchor="middle" fontSize="10" fontWeight="700" fill="#F59E0B">
                  {d.value}%
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* ── パス1：バー（rect）+ ホバーイベント ── */}
      {pts.map((d, i) => {
        const barH     = Math.max(4, Math.round(((d.value - minV) / range) * BAR_CHART_H));
        const bx       = bxArr[i];
        const by       = AXIS_Y - barH;
        const isLatest = i === pts.length - 1;
        const fill     = isLatest ? '#38BDF8' : '#64748b';
        const prev     = i > 0 ? pts[i - 1] : null;
        const yoy      = prev?.value ? ((d.value - prev.value) / Math.abs(prev.value) * 100) : null;
        return (
          <rect
            key={`bar-${i}`}
            x={bx} y={by} width={BAR_W} height={barH} rx="3" fill={fill}
            style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = '0.75';
              setTooltip({ visible: true, x: bxArr[i] + BAR_W / 2, y: by, value: d.value, period: d.period, yoy, beat: d.beat, beatMargin: d.beatMargin });
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = '1';
              setTooltip(prev => ({ ...prev, visible: false }));
            }}
          />
        );
      })}

      {/* ── パス2：全ラベル（前面） ── */}
      {pts.map((d, i) => {
        const barH     = Math.max(4, Math.round(((d.value - minV) / range) * BAR_CHART_H));
        const by       = AXIS_Y - barH;
        const cx       = cxArr[i];
        const isLatest = i === pts.length - 1;

        const prev      = i > 0 ? pts[i - 1] : null;
        const yoy       = prev?.value ? ((d.value - prev.value) / Math.abs(prev.value) * 100) : null;
        const beatLabel = d.beat === true ? '▲BEAT' : d.beat === false ? '▼MISS' : null;
        const beatFill  = d.beat === true ? '#10B981' : '#ef4444';

        // ── YoY label placement (mobile-safe) ──
        const insideBar = barH >= 36;
        const yoyFill   = insideBar ? 'rgba(255,255,255,0.9)' : '#38BDF8';
        const yoyBaseY  = yoy !== null
          ? (insideBar ? by + 16 : Math.max(BAR_AREA_TOP - 4, by - 18))
          : null;

        // ── Value label placement ──
        const valInside = barH >= 22;
        const valY = valInside
          ? by + (insideBar ? barH - 8 : Math.min(14, barH - 6))
          : by - 4;
        const valFill = valInside ? 'white' : (isLatest ? '#38BDF8' : '#94a3b8');

        return (
          <g key={`label-${i}`}>
            {/* YoY（2行） */}
            {yoyBaseY !== null && (
              <text x={cx} y={yoyBaseY} textAnchor="middle" fontWeight="700" fill={yoyFill}>
                <tspan x={cx} dy="0" fontSize={n >= 5 ? 9 : 11}>
                  {yoy >= 0 ? '+' : ''}{yoy.toFixed(1)}%
                </tspan>
                <tspan x={cx} dy="12" fontSize="9" fontWeight="500" opacity="0.8">
                  YoY
                </tspan>
              </text>
            )}
            {/* 絶対値 */}
            <text x={cx} y={valY} textAnchor="middle" fontSize="11" fontWeight="700" fill={valFill}>
              {d.value}
            </text>
            {/* 期間ラベル */}
            <text x={cx} y={XLAB_Y} textAnchor="middle" fontSize={n >= 5 ? 10 : 12} fontWeight="600" fill="#6b7280">
              {String(d.period).replace('FY', '')}
            </text>
            {/* BEAT/MISS（乖離率があれば併記） */}
            {beatLabel && (
              <>
                <text x={cx} y={BEAT_Y} textAnchor="middle" fontSize="11" fontWeight="700" fill={beatFill}>
                  {beatLabel}
                </text>
                {/* 「vs Est」副ラベルは横方向の重なりが避けられないため、
                    バー直下のSVGテキスト描画を廃止し、ホバーツールチップに集約 */}
              </>
            )}
          </g>
        );
      })}

      {/* ── ツールチップ ── */}
      {tooltip.visible && (
        <foreignObject
          x={Math.min(Math.max(tooltip.x - 60, LEFT_PAD), SVG_W - 125)}
          y={Math.max(tooltip.y - 72, 0)}
          width="120" height="80"
          style={{ pointerEvents: 'none', overflow: 'visible' }}
        >
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '7px',
            padding: '6px 10px',
            fontSize: '11px',
            color: '#e2e8f0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
          }}>
            <div style={{ fontWeight: '700', color: '#38BDF8', marginBottom: '2px' }}>
              {String(tooltip.period).replace('FY', '')}
            </div>
            <div style={{ marginBottom: '2px' }}>
              {tooltip.value}{trend.unit || ''}
            </div>
            {tooltip.yoy !== null && (
              <div style={{ color: tooltip.yoy >= 0 ? '#10B981' : '#ef4444', marginBottom: '2px' }}>
                YoY {tooltip.yoy >= 0 ? '+' : ''}{tooltip.yoy.toFixed(1)}%
              </div>
            )}
            {tooltip.beatMargin != null && (
              <div style={{ color: tooltip.beat ? '#10B981' : '#ef4444', fontSize: '10px' }}>
                {tooltip.beat ? '▲BEAT' : '▼MISS'} {tooltip.beatMargin > 0 ? '+' : ''}{tooltip.beatMargin.toFixed(1)}% vs Est
              </div>
            )}
          </div>
        </foreignObject>
      )}
    </svg>
  );
}

// ── Valuation tooltip card ──────────────────────────────────────────────────
const VALUATION_CRITERIA = {
  PER: {
    low: '15x以下', high: '30x以上',
    note: '同業種平均と比較。成長株は高め。',
    basis: 'S&P500 IT平均 ≒ 28x（2025年）',
    industryAvg: 28,
  },
  PBR: {
    low: '1x以下',  high: '4x以上',
    note: '純資産対比。1x割れは解散価値以下。',
    basis: 'S&P500 IT平均 ≒ 8x（2025年）',
    industryAvg: 8,
  },
  PSR: {
    low: '2x以下',  high: '8x以上',
    note: '売上高対比。SaaS等は高め許容。',
    basis: 'S&P500 IT平均 ≒ 5x（2025年）',
    industryAvg: 5,
  },
  'EV/EBITDA': {
    low: '8x以下',  high: '18x以上',
    note: '企業価値対営業利益（償却前）。買収妥当性の代理指標。',
    basis: 'S&P500 IT平均 ≒ 16x（2025年）',
    industryAvg: 16,
  },
  PEG: {
    low: '1x以下',  high: '2x以上',
    note: 'PER ÷ EPS成長率。1x以下は成長を考慮すると割安。',
    basis: 'PEG = PER ÷ EPS成長率（Non-GAAP・NTMベース）',
    industryAvg: 1.5,
  },
};

function ValuationCard({ label, value, judge, dynamicBasis }) {
  const [showTip, setShowTip] = useState(false);
  // フォールバック（中立・やや高/割高 など）はニュートラルグレーに統一。
  // 青色だと PASS / Beat の系統色と混同されやすいため、
  // バリュエーションは Beat/Miss 判定とは別軸であることをカラー的にも示す。
  const judgeColor = judge === '割安' ? '#10B981' : judge === '割高' ? '#F87171' : '#94a3b8';
  // グレー帯の場合は「中立」を必ず明示（壊れている表示と誤認されないため）。
  // judge が空文字 / null / undefined のときは「中立」単独で表示し、
  // 既存ラベル（高 / やや割高 等）があればその横に補足タグを置く。
  const isNeutral = judge !== '割安' && judge !== '割高';
  const displayJudge = judge || '中立';
  const showNeutralTag = isNeutral && judge && judge !== '中立';
  const crit = VALUATION_CRITERIA[label];
  return (
    <div
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      style={{
        flex: '1 1 72px', borderRadius: '8px',
        border: '1px solid var(--border)', padding: '10px 8px',
        textAlign: 'center', background: 'var(--bg-subtle)',
        position: 'relative', cursor: 'help',
      }}
    >
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
        {label}
        <span style={{
          marginLeft: '4px',
          fontSize: '11px',
          color: '#38BDF8',
          opacity: 0.8,
          fontWeight: '600',
          cursor: 'help',
        }}>ⓘ</span>
      </div>
      <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
        {value}x
      </div>
      <div style={{
        fontSize: '10px', fontWeight: '700', color: judgeColor,
        background: `${judgeColor}22`, borderRadius: '4px',
        padding: '2px 6px', display: 'inline-flex',
        alignItems: 'center', gap: '4px',
      }}>
        <span>{displayJudge}</span>
        {showNeutralTag && (
          <span style={{ fontSize: '9px', fontWeight: 500, opacity: 0.75 }}>
            （中立）
          </span>
        )}
      </div>
      {showTip && crit && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '6px', zIndex: 10,
          background: '#1e293b', border: '1px solid #334155',
          borderRadius: '8px', padding: '8px 10px',
          width: '160px', textAlign: 'left',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: '#38BDF8', marginBottom: '4px' }}>
            {label} 判断基準
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: 1.6 }}>
            <span style={{ color: '#10B981' }}>割安：</span>{crit.low}<br/>
            <span style={{ color: '#F87171' }}>割高：</span>{crit.high}<br/>
            <span style={{ color: '#64748b' }}>{crit.note}</span>
            {crit.basis && (
              <>
                <br/>
                <span style={{ color: '#475569', fontSize: '9px' }}>
                  参考：{crit.basis}
                </span>
              </>
            )}
            {dynamicBasis && (
              <>
                <br/>
                <span style={{ color: '#38BDF8', fontSize: '9px', fontWeight: '600' }}>
                  実値：{dynamicBasis}
                </span>
              </>
            )}
            {crit.industryAvg != null && value != null && (() => {
              const numVal = parseFloat(value);
              if (isNaN(numVal)) return null;
              const diff = ((numVal - crit.industryAvg) / crit.industryAvg * 100).toFixed(0);
              const isAbove = numVal > crit.industryAvg;
              const color = isAbove ? '#F87171' : '#10B981';
              return (
                <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #334155' }}>
                  <span style={{
                    fontSize: '10px', fontWeight: '700',
                    color: color,
                    background: `${color}22`,
                    padding: '2px 6px', borderRadius: '3px',
                  }}>
                    IT平均比 {isAbove ? '+' : ''}{diff}%
                  </span>
                  <span style={{ fontSize: '9px', color: '#64748b', marginLeft: '4px' }}>
                    (平均 {crit.industryAvg}x)
                  </span>
                </div>
              );
            })()}
            {/* Beat/Miss 判定との切り分け注記 */}
            <div style={{
              marginTop: '6px', paddingTop: '6px',
              borderTop: '1px solid #334155',
              fontSize: '9px', color: '#64748b', lineHeight: 1.5,
            }}>
              ※ バリュエーションはアナリスト予想との Beat/Miss 判定とは別軸の評価です。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dividend yield card with hover tooltip ─────────────────────────────────
function DividendCard({ dividend }) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      style={{
        flex: '1 1 72px', borderRadius: '8px',
        border: '1px solid var(--border)', padding: '10px 8px',
        textAlign: 'center', background: 'var(--bg-subtle)',
        position: 'relative', cursor: 'help',
      }}
    >
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
        配当利回り
        <span style={{
          marginLeft: '4px',
          fontSize: '11px',
          color: '#38BDF8',
          opacity: 0.8,
          fontWeight: '600',
          cursor: 'help',
        }}>ⓘ</span>
      </div>
      <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
        {dividend.yield}%
      </div>
      {dividend.buyback && (
        <div style={{ fontSize: '10px', color: '#38BDF8' }}>🔄 自社株買い</div>
      )}
      {showTip && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '6px', zIndex: 10,
          background: '#1e293b', border: '1px solid #334155',
          borderRadius: '8px', padding: '8px 10px',
          width: '160px', textAlign: 'left',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: '#38BDF8', marginBottom: '4px' }}>
            配当利回り
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: 1.6 }}>
            <span style={{ color: '#10B981' }}>高め：</span>3%以上<br/>
            <span style={{ color: '#F87171' }}>低め：</span>0.5%未満<br/>
            <span style={{ color: '#64748b' }}>株価÷年間配当額。高配当≠割安に注意。</span>
            {dividend.buyback && (
              <>
                <br/>
                <span style={{ color: '#38BDF8' }}>自社株買いと合算した株主還元利回りも確認推奨。</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Accordion header ─────────────────────────────────────────────────────────
function AccordionHeader({ label, isOpen, onToggle }) {
  return (
    <div
      onClick={onToggle}
      onMouseEnter={e => {
        e.currentTarget.style.backgroundColor = 'rgba(56,189,248,0.08)';
        e.currentTarget.style.borderColor = 'rgba(56,189,248,0.40)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.backgroundColor = 'var(--bg-subtle)';
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
      style={{
        cursor: 'pointer',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '9px 14px',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        background: 'var(--bg-subtle)',
        marginBottom: isOpen ? '8px' : '0',
        transition: 'background-color 0.15s, border-color 0.15s',
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span style={{
        fontSize: '11px', color: 'var(--text-muted)',
        transition: 'transform 0.2s',
        display: 'inline-block',
        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
      }}>
        ▼
      </span>
    </div>
  );
}

export default function DiagramCard({
  data, ticker, onDownload, onYearsChange, selectedYears = 3,
  showCoach = false,         // R2v3: 年セレクター直上の吹き出し表示 ON/OFF（HomeTab 制御・初回のみ）
  onSelectorVisible,         // R2v2: 年セレクターが80%可視になった時に1度だけ呼ばれる
}) {
  if (!data) return null;

  const isGenerating = data?._phase === 'instant';  // Phase1中（narrative生成待ち）

  // R4: verdict が 'unknown' / 未設定 + overallPass も無い場合は「判定不可」扱い
  const isVerdictUnknown = data.verdict === 'unknown'
    || (data.verdict == null && data.overallPass == null);

  const passColor = isVerdictUnknown
    ? '#94a3b8'
    : (data.overallPass ? '#22c55e' : '#ef4444');
  const passBg = isVerdictUnknown
    ? 'rgba(148,163,184,0.08)'
    : (data.overallPass ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)');

  const steps     = data.businessFlowSteps || [];
  const trends    = data.trends            || [];
  const strengths = data.strengths         || [];
  const risks     = data.risks             || [];
  const bullCase  = data.bullCase          || [];
  const bearCase  = data.bearCase          || [];
  const valuation = data.valuation         || null;
  const dividend  = data.dividend          || null;

  // Build flow items as a flat array so keys work cleanly
  const flowItems = steps.flatMap((step, i) => {
    const items = [<FlowBox key={`box-${i}`} step={step} />];
    if (i < steps.length - 1) {
      items.push(
        <span key={`arrow-${i}`} style={{ color: '#94a3b8', fontSize: '20px', lineHeight: 1, flexShrink: 0 }}>→</span>
      );
    }
    return items;
  });

  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 480
  );
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 480);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [openSections, setOpenSections] = useState({ strengths: false, bullbear: false });
  const toggleSection = (key) =>
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const [showConditions, setShowConditions] = useState(false);
  const [showUnknownTip, setShowUnknownTip] = useState(false);  // R4: 判定不可バッジのツールチップ

  // R3拡張: アコーディオン展開時の共通フェードインスタイル
  // 各アイテムを 40ms ずつスタガードして 150ms かけて opacity 0→1 + Y 6→0
  const fadeInStyle = (index) => ({
    animation: 'condition-fade-in 150ms ease-out both',
    animationDelay: `${index * 40}ms`,
  });

  // ── 年切替時のフラッシュ演出（300ms シアン outline）
  const [flashTrigger, setFlashTrigger] = useState(0);
  const flashRef = useRef(null);
  useEffect(() => {
    if (flashTrigger === 0) return;
    const el = flashRef.current;
    if (!el) return;
    el.classList.remove('section-flash');
    // reflow を強制してアニメーションを再起動
    void el.offsetWidth;
    el.classList.add('section-flash');
    const tid = setTimeout(() => {
      if (flashRef.current) flashRef.current.classList.remove('section-flash');
    }, 350);
    return () => clearTimeout(tid);
  }, [flashTrigger]);

  // R2v2: 年セレクターが80%可視になったら一度だけ onSelectorVisible を呼ぶ
  const selectorRef = useRef(null);
  const observerFiredRef = useRef(false);
  useEffect(() => {
    if (!onSelectorVisible) return;
    const el = selectorRef.current;
    if (!el) return;
    if (observerFiredRef.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      // フォールバック（古環境）：即座に発火
      observerFiredRef.current = true;
      onSelectorVisible();
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !observerFiredRef.current) {
          observerFiredRef.current = true;
          onSelectorVisible();
          observer.disconnect();
        }
      },
      { threshold: 0.8 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onSelectorVisible]);

  // R2v2: アクティブボタンのスケールパルス（手動・自動どちらでも発火）
  const [pulseY, setPulseY] = useState(null);
  useEffect(() => {
    if (selectedYears == null) return;
    setPulseY(selectedYears);
    const t = setTimeout(() => setPulseY(null), 240);
    return () => clearTimeout(t);
  }, [selectedYears]);

  const handleYearsChange = (y) => {
    onYearsChange?.(y);
    setFlashTrigger(k => k + 1);
    // 手動クリックで現状と同じ年を押した場合も視覚フィードバックを出すため、
    // 強制的に pulseY を再セット（useEffect は selectedYears 変化のみ追うので）
    setPulseY(null);
    requestAnimationFrame(() => setPulseY(y));
    setTimeout(() => setPulseY(null), 240);
  };

  return (
    <div style={{
      position: 'relative',
      borderRadius: '12px', border: '1px solid var(--border)',
      background: 'var(--bg-primary)', marginTop: '16px', overflow: 'hidden',
    }}>
      {/* スケルトンアニメーション定義（shimmer） */}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        @keyframes fade-in-narrative {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .skeleton {
          background: linear-gradient(
            90deg,
            rgba(148,163,184,0.08) 0%,
            rgba(148,163,184,0.18) 40%,
            rgba(148,163,184,0.08) 80%
          );
          background-size: 800px 100%;
          animation: shimmer 1.6s ease-in-out infinite;
          border-radius: 6px;
        }
        .narrative-appear {
          animation: fade-in-narrative 0.5s ease-out;
        }
        @keyframes section-flash {
          0%   { outline: 2px solid #38BDF8; outline-offset: 4px; }
          100% { outline: 2px solid transparent; outline-offset: 4px; }
        }
        .section-flash {
          animation: section-flash 320ms ease-out;
          border-radius: 8px;
        }
        @keyframes btn-pulse {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.18); }
          100% { transform: scale(1); }
        }
        .btn-pulse {
          animation: btn-pulse 220ms ease-out;
        }
        @keyframes hint-fade {
          0%   { opacity: 0; }
          15%  { opacity: 1; }
          70%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes coach-fade-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes condition-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 10px', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
            ビジュアル分析
          </span>
          {/* SAMPLE バッジ（デモデータ時のみ）— ヘッダー左内のインラインバッジ */}
          {data._isDemo && (
            <span
              aria-hidden="true"
              style={{
                background: 'rgba(148,163,184,0.15)',
                border: '1px solid #475569',
                fontSize: '10px',
                fontWeight: 700,
                color: '#94a3b8',
                padding: '1px 6px',
                borderRadius: '4px',
                letterSpacing: '0.05em',
                lineHeight: 1.4,
              }}
            >
              SAMPLE
            </span>
          )}
        </div>
        {/* レンジセレクターは Growth Story セクション直上に移動した */}
        {onDownload && (
          <button
            onClick={onDownload}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(56,189,248,0.08)';
              e.currentTarget.style.borderColor = '#38BDF8';
              e.currentTarget.style.color = '#38BDF8';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '5px 10px', borderRadius: '6px',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600',
              cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            SVG保存
          </button>
        )}
      </div>

      <div style={{ padding: '4px 16px 20px' }}>

        {/* ── Section 1: Headline ── */}
        <div style={{
          position: 'relative',
          margin: '16px 0 4px', padding: '18px 20px',
          borderRadius: '10px', background: passBg, textAlign: 'center',
        }}>
          {/* X (Twitter) シェアボタン — narrative 完成後のみ表示 */}
          {!isGenerating && data.headline && (
            <button
              onClick={() => {
                const decision = isVerdictUnknown
                  ? 'UNKNOWN'
                  : (data.overallPass ? 'PASS' : 'FAIL');
                const url = `https://beatscanner-production.up.railway.app/?t=${ticker}`;
                const text =
                  `$${ticker}「${data.headline}」\n` +
                  `decision: ${decision}\n` +
                  `${url}\n` +
                  `#beatscanner`;
                const intentUrl =
                  `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
                window.open(intentUrl, '_blank', 'noopener,noreferrer');
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#1f1f1f'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#000'; }}
              title="X(Twitter)でシェア"
              aria-label="X(Twitter)でシェア"
              style={{
                position: 'absolute', top: '10px', right: '10px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '30px', height: '30px',
                borderRadius: '6px',
                background: '#000', color: '#fff',
                border: 'none', cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </button>
          )}
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            {data.companyName} · {data.period}
          </div>
          {isGenerating ? (
            <div className="skeleton" style={{ height: '28px', width: '55%', margin: '0 auto 12px' }} />
          ) : (
            data.headline && (
              <div className="narrative-appear" style={{
                fontSize: 'clamp(18px, 5vw, 28px)',
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
                lineHeight: 1.2,
                marginBottom: '8px',
              }}>
                {data.headline}
              </div>
            )
          )}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            {isVerdictUnknown ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <span
                  onMouseEnter={() => setShowUnknownTip(true)}
                  onMouseLeave={() => setShowUnknownTip(false)}
                  onClick={() => setShowUnknownTip(v => !v)}
                  style={{
                    background: '#4b5563', color: '#d1d5db',
                    fontSize: '13px', fontWeight: '800',
                    padding: '3px 10px', borderRadius: '6px',
                    cursor: 'help', userSelect: 'none',
                  }}
                >
                  判定不可
                </span>
                {showUnknownTip && (
                  <div
                    role="tooltip"
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 8px)',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: '#0f172a',
                      color: '#f1f5f9',
                      fontSize: '12px',
                      lineHeight: 1.6,
                      padding: '8px 12px',
                      borderRadius: '8px',
                      whiteSpace: 'nowrap',
                      zIndex: 10,
                      boxShadow: '0 4px 12px rgba(15,23,42,0.30)',
                      pointerEvents: 'none',
                      textAlign: 'left',
                    }}
                  >
                    アナリスト予想データが取得できないため<br />
                    Beat / Miss の判定ができません。<br />
                    <span style={{ color: '#38BDF8' }}>
                      FMP有料プランで解決できます。
                    </span>
                    {/* 下向き三角 */}
                    <div style={{
                      position: 'absolute',
                      bottom: '-6px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 0,
                      height: 0,
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderTop: '6px solid #0f172a',
                    }} />
                  </div>
                )}
              </div>
            ) : (
              <span style={{
                fontSize: '13px', fontWeight: '800', color: passColor,
                background: `${passColor}1a`, borderRadius: '6px', padding: '3px 10px',
              }}>
                {data.overallPass ? 'PASS' : 'FAIL'}
              </span>
            )}
            <button
              onClick={() => setShowConditions(v => !v)}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'rgba(56,189,248,0.15)';
                e.currentTarget.style.borderColor = '#38BDF8';
                e.currentTarget.style.color = '#38BDF8';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'rgba(56,189,248,0.08)';
                e.currentTarget.style.borderColor = 'rgba(56,189,248,0.40)';
                e.currentTarget.style.color = '#38BDF8';
              }}
              style={{
                background: 'rgba(56,189,248,0.08)',
                border: '1px solid rgba(56,189,248,0.40)',
                borderRadius: '6px',
                cursor: 'pointer',
                padding: '3px 10px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#38BDF8',
                transition: 'background-color 0.15s, border-color 0.15s',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {data.passCount}/{data.totalCount} 条件クリア
              <span style={{
                fontSize: '10px',
                transition: 'transform 0.2s',
                display: 'inline-block',
                transform: showConditions ? 'rotate(180deg)' : 'rotate(0deg)',
              }}>▼</span>
            </button>
          </div>

          {/* ── 条件一覧の展開 ── */}
          {showConditions && data.conditions?.length > 0 && (
            <div style={{
              marginTop: '10px', textAlign: 'left',
              background: 'var(--bg-primary)', borderRadius: '8px',
              border: '1px solid var(--border)', padding: '10px 12px',
            }}>
              {data.conditions.map((c, i) => (
                <div
                  key={`cond-${showConditions}-${i}`}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '8px',
                    fontSize: '12px', color: 'var(--text-primary)',
                    lineHeight: 1.6, marginBottom: i < data.conditions.length - 1 ? '6px' : 0,
                    ...fadeInStyle(i),
                  }}
                >
                  <span aria-hidden="true" style={{ flexShrink: 0, fontSize: '13px', lineHeight: 1.4 }}>
                    {c.pass ? '✅' : '❌'}
                  </span>
                  <span>
                    <span style={{ fontWeight: 600 }}>{c.name || c.label}</span>
                    {c.detail && (
                      <>
                        <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>:</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                          {c.detail}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {isGenerating ? (
            <div className="skeleton" style={{ height: '12px', width: '75%', margin: '8px auto 0' }} />
          ) : (
            data.summary && (
              <div className="narrative-appear" style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                {data.summary}
              </div>
            )
          )}
        </div>

        {/* ── Section 2: Valuation + Dividend ── */}
        {(valuation || dividend) && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '20px', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', letterSpacing: '0.5px', color: '#38BDF8' }}>
                バリュエーション
              </span>
              {valuation?.dataSource && (() => {
                const isFmp = valuation.dataSource === 'FMP TTM';
                return (
                  <span style={{
                    fontSize: '9px',
                    fontWeight: '600',
                    color: isFmp ? '#10b981' : '#94a3b8',
                    background: isFmp ? 'rgba(16,185,129,0.10)' : 'rgba(148,163,184,0.12)',
                    border: isFmp
                      ? '1px solid rgba(16,185,129,0.25)'
                      : '1px solid rgba(148,163,184,0.25)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    letterSpacing: '0.02em',
                  }}>
                    {isFmp ? 'FMP実データ' : 'LLM推定'}
                  </span>
                );
              })()}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {valuation && [
                { label: 'PER',       value: valuation.per,       judge: valuation.perJudge },
                { label: 'PBR',       value: valuation.pbr,       judge: valuation.pbrJudge },
                { label: 'PSR',       value: valuation.psr,       judge: valuation.psrJudge },
                { label: 'EV/EBITDA', value: valuation.evEbitda,  judge: valuation.evEbitdaJudge },
                {
                  label: 'PEG',
                  value: valuation.peg,
                  judge: valuation.pegJudge,
                  // PEG = PER ÷ EPS成長率 → 実数表示で算出根拠を明示
                  dynamicBasis: (valuation.per != null && valuation.peg)
                    ? `PER(${valuation.per}x) ÷ EPS成長率(${(valuation.per / valuation.peg).toFixed(1)}%)`
                    : null,
                },
              ].filter(item => item.value != null).map(item => (
                <ValuationCard key={item.label} {...item} />
              ))}
              {dividend?.yield != null && (
                <DividendCard dividend={dividend} />
              )}
            </div>
          </>
        )}

        {/* ── Section 3: Business Model ── */}
        {isGenerating ? (
          <>
            <VizSectionLabel text="ビジネスモデル" />
            <div style={{
              display: 'flex', gap: '8px', padding: '14px 12px',
              background: 'var(--bg-subtle)', borderRadius: '8px',
              alignItems: 'center', overflowX: 'auto',
            }}>
              {[120, 100, 110, 105].flatMap((w, i) => {
                const items = [
                  <div key={`box-${i}`} className="skeleton" style={{
                    width: `${w}px`, height: '72px',
                    borderRadius: '10px', flexShrink: 0,
                  }} />
                ];
                if (i < 3) {
                  items.push(
                    <span key={`arr-${i}`} style={{ color: 'rgba(148,163,184,0.2)', fontSize: '18px', flexShrink: 0 }}>→</span>
                  );
                }
                return items;
              })}
            </div>
          </>
        ) : flowItems.length > 0 && (
          <div className="narrative-appear">
            <VizSectionLabel text="ビジネスモデル" />
            {isMobile && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                ← スクロールして全体を確認
              </div>
            )}
            <div style={{
              overflowX: 'auto', WebkitOverflowScrolling: 'touch',
              borderRadius: '8px', background: 'var(--bg-subtle)', padding: '14px 12px',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', flexWrap: 'nowrap',
                gap: '8px', width: 'fit-content', margin: '0 auto',
              }}>
                {flowItems}
              </div>
            </div>
          </div>
        )}

        {/* ── Section 3.5: セグメント別売上 ── */}
        {data.segmentSummary?.segments?.length > 0 && (
          <>
            <VizSectionLabel text="セグメント別売上" />
            <div style={{
              fontSize: '10px', color: 'var(--text-muted)',
              marginBottom: '8px',
            }}>
              直近四半期 {data.segmentSummary.date} ／ 前年同期比
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {data.segmentSummary.segments.map((seg, i) => (
                <SegmentBar key={i} seg={seg} />
              ))}
            </div>
          </>
        )}

        {/* ── Section 4: Growth Story ── */}
        {trends.length > 0 && (
          <div ref={flashRef}>
            {/* レンジセレクター（カード右上から移動：操作と結果を視覚的に近接させる）*/}
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', flexWrap: 'wrap',
              gap: '8px', marginTop: '24px', marginBottom: '6px',
            }}>
              <div style={{
                fontSize: '11px', color: 'var(--text-muted)',
                fontWeight: 600, letterSpacing: '0.02em',
              }}>
                📅 表示期間
              </div>
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'flex-end', gap: '2px',
              }}>
                {/* R2v3: コーチマーク（初回ユーザーのみ・ボタン直上に吹き出し）*/}
                {showCoach && (
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'relative',
                      marginBottom: '8px',
                      display: 'flex',
                      justifyContent: 'center',
                      animation: 'coach-fade-in 0.3s ease forwards',
                      pointerEvents: 'none',
                    }}
                  >
                    <div style={{
                      background: '#0f172a',
                      color: '#f1f5f9',
                      fontSize: '12px',
                      lineHeight: 1.6,
                      padding: '8px 14px',
                      borderRadius: '8px',
                      whiteSpace: 'nowrap',
                      position: 'relative',
                      boxShadow: '0 4px 12px rgba(15,23,42,0.30)',
                    }}>
                      📅 期間を切り替えると、グラフが連動して変わります
                      {/* 下向き三角 */}
                      <div style={{
                        position: 'absolute',
                        bottom: '-6px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 0,
                        height: 0,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderTop: '6px solid #0f172a',
                      }} />
                    </div>
                  </div>
                )}
                <div
                  ref={selectorRef}
                  style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
                >
                  {[1, 3, 5].map(y => (
                  <button
                    key={y}
                    className={pulseY === y ? 'btn-pulse' : undefined}
                    onClick={() => handleYearsChange(y)}
                    onMouseEnter={e => {
                      if (selectedYears !== y) {
                        e.currentTarget.style.borderColor = 'rgba(56,189,248,0.5)';
                        e.currentTarget.style.color = '#38BDF8';
                      }
                    }}
                    onMouseLeave={e => {
                      if (selectedYears !== y) {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.color = 'var(--text-muted)';
                      }
                    }}
                    style={{
                      padding: '3px 10px',
                      borderRadius: '5px',
                      border: selectedYears === y
                        ? '1px solid #38BDF8'
                        : '1px solid var(--border)',
                      background: selectedYears === y
                        ? 'rgba(56,189,248,0.15)'
                        : 'transparent',
                      color: selectedYears === y ? '#38BDF8' : 'var(--text-muted)',
                      fontSize: '12px', fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s, background-color 0.15s, color 0.15s',
                    }}
                  >
                    {y}Y
                  </button>
                  ))}
                </div>
              </div>
            </div>
            <VizSectionLabel text="数字で見る成長ストーリー" />
            {data.partialPeriod && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 10px', marginBottom: '8px',
                borderRadius: '6px',
                background: 'rgba(239,159,39,0.10)',
                border: '1px solid rgba(239,159,39,0.30)',
                fontSize: '11px', color: '#854F0B',
              }}>
                <span style={{ fontSize: '13px' }}>⚠️</span>
                <span>
                  <strong>{data.partialPeriod.period}</strong> は通期未完了のため年次比較から除外しています
                  （{data.partialPeriod.note}）
                </span>
              </div>
            )}
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              <span style={{ color: '#10B981', fontWeight: '700' }}>▲BEAT</span>
              {' / '}
              <span style={{ color: '#ef4444', fontWeight: '700' }}>▼MISS</span>
              {' = Wall Street アナリスト予想比'}
              {data.consensusSource && (
                <span style={{
                  marginLeft: '6px', fontSize: '10px',
                  color: '#475569', background: 'rgba(71,85,105,0.15)',
                  padding: '1px 6px', borderRadius: '3px',
                }}>
                  Source: {data.consensusSource}
                </span>
              )}
            </div>
            {isMobile && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                ← スクロールして全体を確認
              </div>
            )}
            {selectedYears === 1 ? (
              /* ★ 1Y時はKPIカード表示（YoY%・前年値付き） */
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                {trends.slice(0, 4).map((trend, i) => {
                  const pts = trend.data || [];
                  const latest = pts[pts.length - 1];
                  const prev   = pts.length >= 2 ? pts[pts.length - 2] : null;
                  if (!latest) return null;

                  const yoy = (latest.value != null && prev?.value != null && prev.value !== 0)
                    ? ((latest.value - prev.value) / Math.abs(prev.value) * 100)
                    : null;
                  const yoyColor = yoy == null ? '#94a3b8' : yoy >= 0 ? '#10B981' : '#ef4444';
                  const beatColor = latest.beat === true ? '#10B981' : latest.beat === false ? '#ef4444' : null;

                  return (
                    <div key={i} style={{
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      padding: '14px 12px',
                      background: 'var(--bg-subtle)',
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: '600' }}>
                        {trend.metric || ''}
                        {trend.unit && <span style={{ fontSize: '9px', marginLeft: '3px' }}>({trend.unit})</span>}
                      </div>
                      {/* 主値 */}
                      <div style={{ fontSize: '24px', fontWeight: '800', color: '#38BDF8', marginBottom: '4px' }}>
                        {latest.value}
                      </div>
                      {/* YoY */}
                      {yoy != null && (
                        <div style={{ fontSize: '12px', fontWeight: '700', color: yoyColor, marginBottom: '4px' }}>
                          {yoy >= 0 ? '+' : ''}{yoy.toFixed(1)}% <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '400' }}>YoY</span>
                        </div>
                      )}
                      {/* 前年値 */}
                      {prev?.value != null && (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          前年: {prev.value}
                        </div>
                      )}
                      {/* Beat/Miss */}
                      {beatColor && latest.beatMargin != null && (
                        <div style={{ fontSize: '11px', fontWeight: '700', color: beatColor, marginTop: '4px' }}>
                          {latest.beat ? '▲BEAT' : '▼MISS'} {latest.beatMargin > 0 ? '+' : ''}{latest.beatMargin.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
              {trends.slice(0, 4).map((trend, i) => (
                <div key={i} style={{
                  borderRadius: '8px', border: '1px solid var(--border)',
                  padding: '12px 10px', background: 'var(--bg-subtle)',
                }}>
                  <div style={{
                    fontSize: '13px', fontWeight: '700', color: '#38BDF8',
                    marginBottom: '6px', textAlign: 'center',
                  }}>
                    {(() => {
                      const m = trend.metric || '';
                      const unit = trend.unit
                        || (m.includes('売上') ? '$B'
                          : m.includes('CFPS') ? '$'
                          : m.includes('EPS') ? '$'
                          : m.includes('営業CF') || m.includes('CF') ? '$B'
                          : null);
                      return (
                        <>
                          {m}
                          {unit && (
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px', fontWeight: '400' }}>
                              ({unit})
                            </span>
                          )}
                          {trend.epsType && (
                            <span style={{
                              fontSize: '9px', color: '#64748b', marginLeft: '4px',
                              background: 'rgba(100,116,139,0.15)', padding: '1px 5px', borderRadius: '3px',
                              fontWeight: '600',
                            }}>
                              {trend.epsType}
                            </span>
                          )}
                          {(trend.metric || '').includes('EPS') && !trend.epsType && (
                            <span style={{
                              fontSize: '9px', color: '#94a3b8', marginLeft: '4px',
                              background: 'rgba(148,163,184,0.12)', padding: '1px 5px', borderRadius: '3px',
                              fontWeight: '600',
                            }}>
                              Non-GAAP
                            </span>
                          )}
                          {(trend.metric || '').includes('EPS') && data.epsSourceNote === 'GAAP' && (
                            <span style={{
                              fontSize: '9px', color: '#854F0B',
                              background: 'rgba(239,159,39,0.15)',
                              padding: '1px 5px', borderRadius: '3px',
                              marginLeft: '4px', fontWeight: '600',
                            }}>
                              GAAP(yf)
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  {i === 0
                    ? <BarChartWithMargin trend={trend} operatingMargins={data.operatingMargins} />
                    : <BarChartPanel trend={trend} operatingMargins={null} />
                  }
                  {(trend.metric || '').includes('EPS') && (
                    <>
                      <div style={{
                        fontSize: '9px', color: '#64748b',
                        marginTop: '6px', textAlign: 'center',
                        lineHeight: 1.5,
                      }}>
                        ※ Non-GAAP EPS（SBC等を除く調整後）
                        <br />
                        GAAP EPSとは$1〜2/株程度乖離する場合があります
                      </div>

                      {/* ★ GAAP/Non-GAAP調整テーブル */}
                      {data.gaapAdjustment && (
                        <div style={{
                          marginTop: '10px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          overflow: 'hidden',
                          fontSize: '11px',
                        }}>
                          <div style={{
                            background: 'var(--bg-subtle)',
                            padding: '5px 10px',
                            fontWeight: '700',
                            color: 'var(--text-muted)',
                            borderBottom: '1px solid var(--border)',
                            fontSize: '10px',
                            letterSpacing: '0.3px',
                          }}>
                            GAAP / Non-GAAP 調整（直近四半期）
                            <span style={{
                              fontSize: '9px', color: 'var(--text-muted)',
                              marginLeft: '6px', fontWeight: '400',
                            }}>
                              ※ 年次EPSとは単位が異なります
                            </span>
                          </div>
                          {[
                            {
                              label: 'Non-GAAP EPS',
                              value: data.gaapAdjustment.nonGaapEps,
                              color: '#38BDF8',
                              prefix: '+',
                            },
                            {
                              label: 'SBC調整',
                              value: data.gaapAdjustment.sbcAdjustment,
                              color: '#ef4444',
                              prefix: '',
                            },
                            {
                              label: 'その他調整',
                              value: data.gaapAdjustment.otherAdjustment,
                              color: '#94a3b8',
                              prefix: '',
                            },
                            {
                              label: 'GAAP EPS',
                              value: data.gaapAdjustment.gaapEps,
                              color: 'var(--text-primary)',
                              prefix: '',
                            },
                          ]
                            .filter(row => row.value !== null && row.value !== undefined)
                            .map((row, idx, arr) => (
                              <div key={row.label} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '5px 10px',
                                borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none',
                              }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                  {row.label}
                                </span>
                                <span style={{ fontWeight: '700', color: row.color, fontSize: '12px' }}>
                                  {typeof row.value === 'number'
                                    ? `${row.value > 0 && row.prefix === '+' ? '+' : ''}$${Math.abs(row.value).toFixed(2)}`
                                    : row.value
                                  }
                                </span>
                              </div>
                            ))
                          }
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {/* ── Section 4.5: FCF・CapEx ── */}
        {/* データあり → 表示 / フラグだけある（false）→ N/A表示 / どちらもなし → 非表示 */}
        {(data.fcfTrend?.length > 0 || data.capexTrend?.length > 0 || data.fcfDataAvailable === false) && (
          <>
            <VizSectionLabel text="FCF・設備投資（CapEx）" />
            {!(data.fcfTrend?.length > 0 || data.capexTrend?.length > 0) ? (
              <div style={{
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-subtle)',
                fontSize: '12px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '4px',
              }}>
                <span style={{ fontSize: '14px' }}>⚠️</span>
                <span>
                  FCF・CapExデータは現在準備中です
                  <span style={{
                    marginLeft: '8px', fontSize: '10px',
                    background: 'rgba(100,116,139,0.15)',
                    padding: '1px 6px', borderRadius: '3px',
                    color: 'var(--text-muted)',
                  }}>
                    FMP有料プランで取得可能
                  </span>
                </span>
              </div>
            ) : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
              {/* FCF */}
              {data.fcfTrend?.length > 0 && (
                <div style={{
                  flex: '1 1 140px', borderRadius: '8px',
                  border: '1px solid var(--border)', padding: '10px 12px',
                  background: 'var(--bg-subtle)',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#38BDF8', marginBottom: '6px' }}>
                    FCF <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: '400' }}>($B)</span>
                  </div>
                  {data.fcfTrend.map((d, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: '12px', color: 'var(--text-primary)',
                      padding: '2px 0',
                      borderBottom: i < data.fcfTrend.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {String(d.period).replace('FY', '')}
                      </span>
                      <span style={{ fontWeight: '700' }}>${d.value}B</span>
                    </div>
                  ))}
                </div>
              )}
              {/* CapEx */}
              {data.capexTrend?.length > 0 && (
                <div style={{
                  flex: '1 1 140px', borderRadius: '8px',
                  border: '1px solid rgba(251,146,60,0.4)', padding: '10px 12px',
                  background: 'rgba(251,146,60,0.06)',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#fb923c', marginBottom: '6px' }}>
                    CapEx <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: '400' }}>($B・AIインフラ投資)</span>
                  </div>
                  {data.capexTrend.map((d, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: '12px', color: 'var(--text-primary)',
                      padding: '2px 0',
                      borderBottom: i < data.capexTrend.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {String(d.period).replace('FY', '')}
                      </span>
                      <span style={{ fontWeight: '700', color: '#fb923c' }}>${d.value}B</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}
            {/* FCFマージン + FCF利回り（データ取得成功時のみ） */}
            {data.fcfTrend?.length > 0 && (() => {
              const latestFcf = data.fcfTrend[data.fcfTrend.length - 1]?.value;
              const latestRev = data.trends?.find(t => t.metric === '売上高')?.data?.slice(-1)[0]?.value;
              const fcfMargin = (latestFcf && latestRev)
                ? ((latestFcf / latestRev) * 100).toFixed(1)
                : null;
              const fcfYield = data.fcfYield;
              if (fcfMargin == null && fcfYield == null) return null;
              return (
                <div style={{
                  display: 'flex', gap: '16px', flexWrap: 'wrap',
                  fontSize: '11px', color: 'var(--text-muted)',
                  marginTop: '6px',
                }}>
                  {fcfMargin != null && (
                    <span>
                      FCFマージン（直近）：
                      <span style={{ color: '#38BDF8', fontWeight: '700' }}>{fcfMargin}%</span>
                    </span>
                  )}
                  {fcfYield != null && (
                    <span>
                      FCF利回り：
                      <span style={{ color: '#38BDF8', fontWeight: '700' }}>{fcfYield}%</span>
                      <span style={{ fontSize: '10px', marginLeft: '3px', opacity: 0.6 }}>(FCF÷時価総額)</span>
                    </span>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {/* ── Section 5: Strengths / Risks ── */}
        {isGenerating ? (
          <>
            <VizSectionLabel text="強み・リスク対比" />
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
              {[
                { color: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.15)', label: '強み',   widths: [85, 70, 78], dot: 'rgba(34,197,94,0.25)', text: 'rgba(34,197,94,0.5)' },
                { color: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.15)', label: 'リスク', widths: [80, 90, 65], dot: 'rgba(239,68,68,0.25)', text: 'rgba(239,68,68,0.5)' },
              ].map((side, si) => (
                <div key={si} style={{
                  borderRadius: '8px', padding: '12px',
                  background: side.color,
                  border: `1px solid ${side.border}`,
                }}>
                  <div style={{
                    fontSize: '11px', fontWeight: '700',
                    color: side.text, marginBottom: '10px',
                  }}>
                    {side.label}
                  </div>
                  {side.widths.map((w, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: '6px',
                      marginBottom: i < 2 ? '8px' : 0, alignItems: 'center',
                    }}>
                      <div style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: side.dot, flexShrink: 0,
                      }} />
                      <div className="skeleton" style={{ height: '11px', width: `${w}%`, flex: 1 }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        ) : (strengths.length > 0 || risks.length > 0) && (
          <div className="narrative-appear">
            <VizSectionLabel text="強み・リスク対比" />
            <AccordionHeader
              label={`強み ${strengths.length}件 / リスク ${risks.length}件`}
              isOpen={openSections.strengths}
              onToggle={() => toggleSection('strengths')}
            />
            {openSections.strengths && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '4px' }}>
                <div style={{
                  borderRadius: '8px', background: 'rgba(34,197,94,0.12)',
                  border: '1px solid rgba(34,197,94,0.30)', padding: '12px',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#16a34a', marginBottom: '8px' }}>💪 強み</div>
                  {strengths.map((s, i) => (
                    <div
                      key={`str-${openSections.strengths}-${i}`}
                      style={{
                        fontSize: '12px', color: 'var(--text-primary)',
                        lineHeight: 1.6, display: 'flex', gap: '5px',
                        ...fadeInStyle(i),
                      }}
                    >
                      <span style={{ color: '#22c55e', flexShrink: 0 }}>•</span>
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
                <div style={{
                  borderRadius: '8px', background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.30)', padding: '12px',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#dc2626', marginBottom: '8px' }}>⚠️ リスク</div>
                  {risks.map((r, i) => (
                    <div
                      key={`risk-${openSections.strengths}-${i}`}
                      style={{
                        fontSize: '12px', color: 'var(--text-primary)',
                        lineHeight: 1.6, display: 'flex', gap: '5px',
                        ...fadeInStyle(i),
                      }}
                    >
                      <span style={{ color: '#ef4444', flexShrink: 0 }}>•</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Section 6: Investor Question + Bull/Bear ── */}
        {isGenerating ? (
          <>
            <VizSectionLabel text="投資家への問い" />
            <div style={{
              borderRadius: '8px', padding: '14px 16px',
              background: 'var(--bg-subtle)', border: '1px solid var(--border)',
              borderLeft: '3px solid rgba(56,189,248,0.2)',
            }}>
              {[88, 95, 72].map((w, i) => (
                <div key={i} className="skeleton" style={{
                  height: '12px', width: `${w}%`,
                  marginBottom: i < 2 ? '8px' : 0,
                }} />
              ))}
            </div>
          </>
        ) : (data.investorQuestion || bullCase.length > 0 || bearCase.length > 0) && (
          <div className="narrative-appear">
            <VizSectionLabel text="投資家への問い" />
            {data.investorQuestion && (
              <div style={{
                borderRadius: '8px', background: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
                padding: '14px 16px', fontSize: '13px',
                color: 'var(--text-primary)', lineHeight: 1.8,
                borderLeft: '3px solid #38BDF8', marginBottom: '10px',
              }}>
                {data.investorQuestion}
              </div>
            )}
            {(bullCase.length > 0 || bearCase.length > 0) && (
              <>
                <AccordionHeader
                  label={`ブル/ベア対比（ブル ${bullCase.length}件 / ベア ${bearCase.length}件）`}
                  isOpen={openSections.bullbear}
                  onToggle={() => toggleSection('bullbear')}
                />
                {openSections.bullbear && (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
                    {bullCase.length > 0 && (
                      <div style={{
                        borderRadius: '8px', background: 'rgba(34,197,94,0.12)',
                        border: '1px solid rgba(34,197,94,0.30)', padding: '12px',
                      }}>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#16a34a', marginBottom: '8px' }}>
                          🐂 ブル派の根拠
                        </div>
                        {bullCase.map((s, i) => (
                          <div
                            key={`bull-${openSections.bullbear}-${i}`}
                            style={{
                              fontSize: '12px', color: 'var(--text-primary)',
                              lineHeight: 1.6, display: 'flex', gap: '5px',
                              ...fadeInStyle(i),
                            }}
                          >
                            <span style={{ color: '#22c55e', flexShrink: 0 }}>•</span>
                            <span>{s}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {bearCase.length > 0 && (
                      <div style={{
                        borderRadius: '8px', background: 'rgba(239,68,68,0.12)',
                        border: '1px solid rgba(239,68,68,0.30)', padding: '12px',
                      }}>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#dc2626', marginBottom: '8px' }}>
                          🐻 ベア派の根拠
                        </div>
                        {bearCase.map((r, i) => (
                          <div
                            key={`bear-${openSections.bullbear}-${i}`}
                            style={{
                              fontSize: '12px', color: 'var(--text-primary)',
                              lineHeight: 1.6, display: 'flex', gap: '5px',
                              ...fadeInStyle(i),
                            }}
                          >
                            <span style={{ color: '#ef4444', flexShrink: 0 }}>•</span>
                            <span>{r}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
