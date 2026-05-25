import React, { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

/**
 * SectorDonut — ETF セクター構成を recharts PieChart (donut) で表示する primitive。
 *
 * design anchor:
 *   - design_system.md §1 (color token: --color-accent / --color-gold / --text-primary / --text-muted)
 *   - design_recipes.md §C-9 (欠損は em-dash、 raw hex 禁止)
 *   - feedback_chart_overlay_safety.md (Number.isFinite guard / isAnimationActive=false / ErrorBoundary)
 *   - feedback_cls_envelope_pattern.md (minHeight envelope で CLS 防止)
 *   - ReturnGrid.jsx (SectionLabel + frameless prop + ds-stat grammar 踏襲)
 *   - SPEC 2026-05-26 §5 Sprint 1
 *
 * props:
 *   sectors       {Array<{industry: string, exposure: number}>}  exposure 降順
 *   sectionLabel  {string}   セクションヘッダ文字列 (default: 'セクター構成')
 *   ticker        {string}   中央ラベル表示用 (任意)
 *   frameless     {boolean}  true = border / background なし (default: true)
 *   testId        {string}   data-testid override (default: "etf-sector-donut")
 *
 * Sprint 1 完了判定:
 *   - <SectorDonut sectors={[...]} /> が render 可能
 *   - 11 slice すべて Cell fill が token から生成 (cyan → gold gradient 11 段補間)
 *   - Number.isFinite validation を exposure 全件に適用、 NaN/Infinity は filter out
 *   - isAnimationActive={false} 全 Pie に設定
 *   - ResponsiveContainer width="100%" + CLS envelope
 *   - npm run build 成功
 *
 * mount: Sprint 3 (EtfOverviewPanel) で SectorBar 差替予定。
 *        本 sprint は primitive 定義のみ。
 */

// ─────────────────────────────────────────────────────────────────
// セクター日本語ラベル辞書
// EtfOverviewPanel.jsx の SECTOR_LABEL_JP と同一内容 (DRY 違反を将来 Sprint で統合)
// ─────────────────────────────────────────────────────────────────
const SECTOR_LABEL_JP = {
  'Technology':             'テクノロジー',
  'Financial Services':     '金融',
  'Healthcare':             'ヘルスケア',
  'Consumer Cyclical':      '消費循環',
  'Communication Services': '通信',
  'Industrials':            '資本財',
  'Consumer Defensive':     '生活必需品',
  'Energy':                 'エネルギー',
  'Basic Materials':        '素材',
  'Real Estate':            '不動産',
  'Utilities':              '公益',
};

// ─────────────────────────────────────────────────────────────────
// 色補間ヘルパー
// CSS design token (--color-accent = cyan 系 / --color-gold = amber 系) の
// HSL 近似値を使い、 11 段階の動的グラデーションを JS 内で計算する。
//
// design_system.md §1 準拠:
//   --color-accent ≈ hsl(188, 100%, 55%)  (cyan / teal)
//   --color-gold   ≈ hsl(43,  95%,  60%)  (amber / gold)
//
// ※ recharts の Cell は fill に hex を要求するため、 token 値から動的 hex を生成。
//   「raw hex 直書き禁止」= JSX ハードコード禁止、 動的計算で生成するのは許可。
//   (elevation_scale.md ALLOWED-HEX whitelist: accent 系 / gold 系は whitelist 対象)
// ─────────────────────────────────────────────────────────────────

const ACCENT_HSL = { h: 188, s: 100, l: 55 }; // var(--color-accent) 近似
const GOLD_HSL   = { h: 43,  s: 95,  l: 60  }; // var(--color-gold)   近似

/**
 * 2 つの HSL 値を線形補間し、 hsl(h, s%, l%) 文字列を返す。
 * t=0 → from、 t=1 → to
 */
function _interpolateHsl(from, to, t) {
  const h = Math.round(from.h + (to.h - from.h) * t);
  const s = Math.round(from.s + (to.s - from.s) * t);
  const l = Math.round(from.l + (to.l - from.l) * t);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/**
 * n 個の slice に対して cyan → gold の連続色配列を生成する。
 * n=1 → cyan のみ、 n=11 → cyan から gold まで均等 11 段階。
 */
function _buildSliceColors(n) {
  if (n <= 0) return [];
  if (n === 1) return [_interpolateHsl(ACCENT_HSL, GOLD_HSL, 0)];
  return Array.from({ length: n }, (_, i) =>
    _interpolateHsl(ACCENT_HSL, GOLD_HSL, i / (n - 1))
  );
}

// ─────────────────────────────────────────────────────────────────
// ErrorBoundary — feedback_chart_overlay_safety.md 準拠
// Recharts render crash 時に SectorDonut 部分だけ blank で保護。
// 親 (EtfOverviewPanel) は影響受けない。
// ─────────────────────────────────────────────────────────────────
class SectorDonutErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error('[SectorDonut] chart render error:', error, info);
  }
  render() {
    if (this.state.hasError) return null; // チャート部分だけ非表示
    return this.props.children;
  }
}

// ─────────────────────────────────────────────────────────────────
// CustomTooltip — hover tooltip
// ─────────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const { name, value } = payload[0];
  const labelJp = SECTOR_LABEL_JP[name] || name;
  return (
    <div
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md, 10px)',
        padding: '6px 12px',
        fontSize: 12,
        color: 'var(--text-primary)',
        fontVariantNumeric: 'tabular-nums',
        pointerEvents: 'none',
      }}
    >
      <span style={{ fontWeight: 700 }}>{labelJp}</span>
      <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
        {Number.isFinite(value) ? `${value.toFixed(2)}%` : '—'}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SectionLabel — ReturnGrid.jsx 踏襲
// ─────────────────────────────────────────────────────────────────
function SectionLabel({ text }) {
  if (!text) return null;
  return (
    <div style={{ marginBottom: 'var(--space-3, 12px)' }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: 'var(--text-primary)',
          textTransform: 'uppercase',
        }}
      >
        {text}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// LegendItem — 1 行 (●  sector名  XX.XX%)
// ─────────────────────────────────────────────────────────────────
function LegendItem({ industry, exposure, color, isTop }) {
  const labelJp = SECTOR_LABEL_JP[industry] || industry;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 0',
      }}
    >
      {/* color dot */}
      <span
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      {/* sector 名 */}
      <span
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: isTop ? 700 : 500,
          color: isTop ? 'var(--text-primary)' : 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {labelJp}
      </span>
      {/* exposure % (右揃え、 tabular-nums) */}
      <span
        style={{
          fontSize: 12,
          fontWeight: isTop ? 700 : 500,
          color: isTop ? 'var(--text-primary)' : 'var(--text-muted)',
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
          minWidth: 44,
          textAlign: 'right',
        }}
      >
        {Number.isFinite(exposure) ? `${exposure.toFixed(2)}%` : '—'}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SectorDonut (main export)
// ─────────────────────────────────────────────────────────────────
export default function SectorDonut({
  sectors,
  sectionLabel = 'セクター構成',
  ticker = '',
  frameless = true,
  testId = 'etf-sector-donut',
}) {
  // ── Number.isFinite ガード: exposure が無効な sector は除外 (feedback_chart_overlay_safety.md)
  const validSectors = useMemo(() => {
    if (!Array.isArray(sectors)) return [];
    return sectors.filter(
      (s) => s && typeof s.industry === 'string' && Number.isFinite(s.exposure) && s.exposure > 0
    );
  }, [sectors]);

  // 全 sector 不正なら section 非表示 (Trust Cliff 防止)
  if (validSectors.length === 0) return null;

  // ── 色配列: cyan → gold 連続補間
  const sliceColors = _buildSliceColors(validSectors.length);

  // ── chart data: recharts Pie の data 形式に変換
  const pieData = validSectors.map((s) => ({
    name: s.industry,
    value: s.exposure,
  }));

  // ── responsive layout: CSS media query を inline style で実現できないため
  //    useMediaQuery の代わりに CSS grid / flex + レスポンシブ props を活用する。
  //    480px 判定は CSS variable を使うか、 window.matchMedia を使うか。
  //    Sprint 1 では container query 相当の CSS を style prop で設定。
  //    (実際の viewport 分岐は Sprint 4 で詳細化)

  return (
    <SectorDonutErrorBoundary>
      <div
        data-testid={testId}
        style={{
          padding: frameless ? 0 : 'var(--space-4, 16px)',
          minHeight: 280, // CLS envelope (feedback_cls_envelope_pattern.md)
        }}
      >
        <SectionLabel text={sectionLabel} />

        {/*
          レイアウト: donut 左 + legend 右 (desktop)
          480px 未満では donut 上 + legend 下 に切り替え。
          CSS は inline style で container 幅に応じた flex-direction を設定。
          実際の breakpoint は Sprint 4 でメディアクエリを追加予定。
        */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-4, 16px)',
            alignItems: 'flex-start',
          }}
        >
          {/* ── donut chart エリア (200px 固定) */}
          <div
            style={{
              flex: '0 0 200px',
              width: 200,
              height: 200,
              position: 'relative',
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                {/* CustomTooltip */}
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={false}
                />
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="60%"
                  outerRadius="90%"
                  isAnimationActive={false}
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={1}
                  label={false}
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={sliceColors[index] || sliceColors[0]}
                      stroke="none"
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            {/* donut 中央ラベル: absolute で重ねる */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none',
                lineHeight: 1.3,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {ticker || '合計'}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  marginTop: 2,
                }}
              >
                100%
              </div>
            </div>
          </div>

          {/* ── legend エリア (残り全幅、 最大高さで scroll 可) */}
          <div
            style={{
              flex: '1 1 160px',
              minWidth: 140,
              maxHeight: 220,
              overflowY: 'auto',
              overflowX: 'hidden',
              paddingRight: 4,
            }}
          >
            {validSectors.map((s, i) => (
              <LegendItem
                key={s.industry}
                industry={s.industry}
                exposure={s.exposure}
                color={sliceColors[i] || sliceColors[0]}
                isTop={i < 5}  // 上位 5 sectors を強調
              />
            ))}
          </div>
        </div>
      </div>
    </SectorDonutErrorBoundary>
  );
}
