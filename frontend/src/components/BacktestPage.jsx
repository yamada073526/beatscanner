/**
 * BacktestPage — シンプルな 5 つのルールで選んだ結果 (v71 Phase 1.5、 2026-05-16)。
 *
 * 5 体合議 (UI/UX + Marketer + Anthropic + Web 設計 + 金融) で確定:
 *   - Hero: 大きな % + 「100 万円 → 123 万円」 secondary (JPY 単独、 固定 150 円換算)
 *     → 「裾野広いユーザー (米国株未経験) でも買えるものイメージが湧く」
 *   - 為替の扱い: 固定レート換算 (Brinson 帰属分析: forex を return attribution から除外)
 *     → Trust Cliff 回避 (USD/JPY 変動で数値が崩れない)
 *   - Skeleton shimmer animation + useCountUp で 「動いている感」
 *   - Title 「実績証明」 → 「5 つのルールで選んだ結果」 (柔らかい言い回し)
 *   - vs SPY 勝率は depth に move、 hero KPI は 「勝率 / +α」 の 2 つに集中
 *   - PASS 銘柄に TickerBadge (企業ロゴ)
 *   - Primary CTA「自分の保有銘柄をチェック →」 (hero 下)
 *   - SPIVA 業界比較 + n=14 preliminary 表記
 *   - prefers-reduced-motion / aria-live 対応
 *
 * 内部資料 (memory anchor / CLAUDE.md): docs/references/jijima_protocol.md
 * UI 文言は「シンプルな 5 つのルール」 を使用 (CLAUDE.md 表示テキストポリシー)。
 */
import { useState, useRef } from 'react';
import { useBacktest } from '../hooks/useBacktest.js';
import { useCountUp } from '../hooks/useCountUp.js';
import TickerBadge from './ui/TickerBadge.jsx';
import ProTeaser from './ui/ProTeaser.jsx';
import { getSector, GICS_SECTOR_LABEL } from '../lib/sectorMap.js';

const HOLD_OPTIONS = [
  { key: 90,  label: '3 ヶ月' },
  { key: 180, label: '6 ヶ月' },
  { key: 365, label: '1 年' },
];

const PERIOD_OPTIONS = [
  { key: '1y', label: '過去 1 年' },
  { key: '3y', label: '過去 3 年' },
  { key: '5y', label: '過去 5 年' },
];

// 為替: 固定レート 150 円換算 (Brinson 帰属分析の業界標準で forex 影響除外)。
// 過去 5 年で USD/JPY は 110-161 円で大変動、 固定で見せることで「5 条件の効果」 を純粋に伝える。
const USDJPY_FIXED = 150;
const HERO_BASE_JPY = 1_000_000;  // 「100 万円」 hero baseline

function fmtSignedPct(n, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}
function fmtPct(n, digits = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}%`;
}
function fmtJpy(yen) {
  if (yen == null || !Number.isFinite(yen)) return '—';
  if (yen >= 100_000_000) return `${(yen / 100_000_000).toFixed(yen >= 1_000_000_000 ? 0 : 1)} 億円`;
  return `${Math.round(yen / 10_000).toLocaleString('ja-JP')} 万円`;
}

function exitToHome() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('layout');
    window.location.href = url.toString();
  } catch {
    window.location.href = '/';
  }
}

function exitToAnalyze() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('layout');
    window.location.href = url.toString();
  } catch {
    window.location.href = '/';
  }
}

// Skeleton placeholder — loading 中の「動いている感」 を担う shimmer animation
function SkeletonBar({ width = '120px', height = '1em' }) {
  return (
    <span
      className="bs-skeleton-bar"
      style={{ width, height, display: 'inline-block' }}
      aria-hidden="true"
    />
  );
}

// Phase 2.3 (handover v72、 2026-05-16): YoY breakdown — 年次成績の bar chart。
// sell_date 年で grouping、 各年の平均 return / SPY / α を mini bar 表示。
// 「毎年勝てる」 = 戦略の安定性訴求 (LP リスク分散ストーリー補完)。
// Bloomberg / Morningstar の calendar year returns pattern に準拠。
function YearBarChart({ chartData }) {
  // Phase 2.3 Round 2 (handover v72、 subagent 案 B+): TradeBarChart と同じ
  // Aman 級 dark popover (.backtest-bar-tip class 流用)、 内容は year + N trade (W-L)
  // + 大文字 平均 + SPY/α + best/worst の 5 行。 説得力強化 + Trust Cliff (loss 透明開示)。
  const [hover, setHover] = useState(null);  // { year_row, idx } | null
  const hideTimer = useRef(null);

  if (!chartData || !chartData.years || chartData.years.length < 1) return null;
  const { years, winYears, totalYears } = chartData;

  const showTooltip = (year_row, idx) => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setHover({ year_row, idx });
  };
  const hideTooltip = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHover(null), 80);
  };

  // SVG viewBox
  const W = 720;
  const H = 200;
  const PAD_L = 48;
  const PAD_R = 24;
  const PAD_T = 16;
  const PAD_B = 36;

  // Y 軸 range (5 条件 / SPY 両方 + 10% margin)
  const allValues = years.flatMap(y => [y.avgStrat, y.avgSpy]).concat([0]);
  const yMaxRaw = Math.max(...allValues);
  const yMinRaw = Math.min(...allValues);
  const range = Math.max(yMaxRaw - yMinRaw, 1);
  const yMax = yMaxRaw + range * 0.15;  // 上に余白多め (label 用)
  const yMin = yMinRaw - range * 0.10;

  // X 配置: 各年は 2 本 bar (5 条件 + SPY)
  const innerW = W - PAD_L - PAD_R;
  const slotW = innerW / years.length;
  const groupGap = slotW * 0.20;
  const barW = (slotW - groupGap) / 2 * 0.75;  // 2 本 + 中央 gap、 各 bar はそれの 75%

  const xOf = (i, sub) => PAD_L + slotW * i + groupGap / 2 + (sub === 'spy' ? barW + 2 : 0);
  const yOf = (v) => PAD_T + (H - PAD_T - PAD_B) * (1 - (v - yMin) / (yMax - yMin));
  const zeroY = yOf(0);

  return (
    <section className="backtest-yearchart" aria-label="年次別成績 chart">
      <div className="backtest-yearchart-header">
        <h2 className="backtest-yearchart-title">年次別 平均リターン (5 条件 vs S&amp;P 500)</h2>
        <span className="backtest-yearchart-meta">
          {totalYears} 年中 <strong className="backtest-yearchart-win">{winYears} 年</strong> で SPY 上回る
        </span>
      </div>

      <div className="backtest-yearchart-svg-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="backtest-yearchart-svg" preserveAspectRatio="none" aria-hidden="true">
          {/* zero line */}
          <line x1={PAD_L} x2={W - PAD_R} y1={zeroY} y2={zeroY} stroke="rgba(148, 163, 184, 0.28)" strokeWidth="1" />

          {/* 各年 2 本 bar (5 条件 緑 / SPY グレー) */}
          {years.map((y, i) => {
            const stratVal = y.avgStrat;
            const spyVal = y.avgSpy;
            const xStrat = xOf(i, 'strat');
            const xSpy = xOf(i, 'spy');
            const yStrat = stratVal >= 0 ? yOf(stratVal) : zeroY;
            const ySpy = spyVal >= 0 ? yOf(spyVal) : zeroY;
            const hStrat = Math.abs(yOf(stratVal) - zeroY);
            const hSpy = Math.abs(yOf(spyVal) - zeroY);
            const fillStrat = stratVal >= 0 ? 'var(--color-gain)' : 'var(--color-loss)';
            const fillSpy = 'rgba(148, 163, 184, 0.65)';
            const isHover = hover && hover.idx === i;
            const hoverHandlers = {
              onMouseEnter: () => showTooltip(y, i),
              onMouseLeave: hideTooltip,
              onFocus: () => showTooltip(y, i),
              onBlur: hideTooltip,
              tabIndex: 0,
              style: { cursor: 'pointer', outline: 'none' },
            };
            const ariaLabelText = `${y.year} 年: 5 条件平均 ${stratVal >= 0 ? '+' : ''}${stratVal.toFixed(2)}% (${y.wins} 勝 ${y.losses} 敗、 SPY ${spyVal >= 0 ? '+' : ''}${spyVal.toFixed(2)}%、 α ${y.avgAlpha >= 0 ? '+' : ''}${y.avgAlpha.toFixed(2)}pp)`;
            return (
              <g key={y.year}>
                <rect
                  x={xStrat.toFixed(1)}
                  y={yStrat.toFixed(1)}
                  width={barW.toFixed(1)}
                  height={Math.max(hStrat, 1).toFixed(1)}
                  rx="1.5"
                  fill={fillStrat}
                  opacity={isHover ? 1 : 0.88}
                  aria-label={ariaLabelText}
                  {...hoverHandlers}
                />
                <rect
                  x={xSpy.toFixed(1)}
                  y={ySpy.toFixed(1)}
                  width={barW.toFixed(1)}
                  height={Math.max(hSpy, 1).toFixed(1)}
                  rx="1.5"
                  fill={fillSpy}
                  opacity={isHover ? 0.95 : 0.75}
                  aria-hidden="true"
                  {...hoverHandlers}
                />
                {/* X 軸 label (年) */}
                <text
                  x={PAD_L + slotW * i + slotW / 2}
                  y={H - 14}
                  fontSize="11"
                  fill="var(--text-muted)"
                  textAnchor="middle"
                  fontVariantNumeric="tabular-nums"
                >
                  {y.year}
                </text>
                {/* 5 条件 値 label (bar 上) */}
                <text
                  x={xStrat + barW / 2}
                  y={(stratVal >= 0 ? yStrat : zeroY) - 4}
                  fontSize="9"
                  fill={stratVal >= 0 ? 'var(--color-gain)' : 'var(--color-loss)'}
                  textAnchor="middle"
                  fontWeight="700"
                  fontVariantNumeric="tabular-nums"
                >
                  {stratVal >= 0 ? '+' : ''}{stratVal.toFixed(0)}%
                </text>
              </g>
            );
          })}

          {/* Y 軸 0% label */}
          <text x={PAD_L - 6} y={zeroY + 4} fontSize="10" fill="var(--text-muted)" textAnchor="end">0%</text>
        </svg>

        {/* Phase 2.3 Round 2 (handover v72、 subagent 案 B+): 年次 popover (TradeBarChart 流用)
            5 行構成: header (年 + N trade + W-L) / 大文字 平均 / SPY/α / best / worst */}
        {hover && (() => {
          const y = hover.year_row;
          const i = hover.idx;
          // popover 中心 X = その年の slot 中央 (5 条件 bar と SPY bar の中央)
          const cx = PAD_L + slotW * i + slotW / 2;
          // popover Y = 5 条件 bar と SPY bar のうち高い方 (最小 Y) の頂点
          const topY = Math.min(yOf(y.avgStrat), yOf(y.avgSpy));
          return (
            <div
              className="backtest-bar-tip"
              role="tooltip"
              style={{
                left: `${(cx / W) * 100}%`,
                top: `${(topY / H) * 100}%`,
              }}
              onMouseEnter={() => showTooltip(y, i)}
              onMouseLeave={hideTooltip}
            >
              <div className="backtest-bar-tip-period">
                <strong style={{ color: 'var(--text-primary)', fontSize: 13, marginRight: 6 }}>
                  {y.year} 年
                </strong>
                · {y.tradeCount} trade ({y.wins}-{y.losses})
              </div>
              <div className={`backtest-bar-tip-return ${y.avgStrat >= 0 ? 'is-gain' : 'is-loss'}`}>
                {fmtSignedPct(y.avgStrat)}
              </div>
              <div className="backtest-bar-tip-meta">
                <span>SPY {fmtSignedPct(y.avgSpy)}</span>
                <span className="backtest-bar-tip-sep">·</span>
                <span className={y.avgAlpha >= 0 ? 'is-gain' : 'is-loss'}>
                  α {fmtSignedPct(y.avgAlpha)}
                </span>
              </div>
              {y.best && (
                <div className="backtest-bar-tip-meta" style={{ marginTop: 2 }}>
                  <span style={{ color: 'var(--text-muted)' }}>ベスト</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{y.best.ticker}</span>
                  <span className="is-gain">{fmtSignedPct(y.best.return_pct)}</span>
                </div>
              )}
              {y.worst && y.tradeCount > 1 && (
                <div className="backtest-bar-tip-meta">
                  <span style={{ color: 'var(--text-muted)' }}>ワースト</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{y.worst.ticker}</span>
                  <span className={(y.worst.return_pct ?? 0) >= 0 ? 'is-gain' : 'is-loss'}>
                    {fmtSignedPct(y.worst.return_pct)}
                  </span>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <div className="backtest-yearchart-legend">
        <span className="backtest-yearchart-legend-item">
          <span className="backtest-yearchart-legend-dot is-strat" />
          5 条件戦略
        </span>
        <span className="backtest-yearchart-legend-item">
          <span className="backtest-yearchart-legend-dot is-spy" />
          S&amp;P 500
        </span>
      </div>
    </section>
  );
}

// Phase 2.3 Sector breakdown (handover v72、 2026-05-16): セクター別 horizontal bar chart。
// 縦並び (sector 名) で見やすく、 各 sector の平均 return + trade 数 + 勝率を表示。
// YearBarChart と同じ popover (.backtest-bar-tip class 流用) で best ticker + worst ticker 開示。
function SectorBarChart({ chartData }) {
  const [hover, setHover] = useState(null);  // { sector_row, idx } | null
  const hideTimer = useRef(null);

  if (!chartData || !chartData.sectors || chartData.sectors.length < 1) return null;
  const { sectors } = chartData;

  const showTooltip = (sector_row, idx) => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setHover({ sector_row, idx });
  };
  const hideTooltip = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHover(null), 80);
  };

  // 横棒 chart: SVG では複雑なので Tailwind/CSS で各 row を flex layout
  // X 軸 = 平均 return %、 sector 名は左 column、 bar は中央、 値は右
  const allVals = sectors.flatMap(s => [s.avgStrat, s.avgSpy]).concat([0]);
  const yMax = Math.max(...allVals, 0);
  const yMin = Math.min(...allVals, 0);
  const range = Math.max(yMax - yMin, 1);
  // bar 位置: 0% を中央 line として、 + は右、 - は左
  const zeroPct = Math.max(0, (0 - yMin) / range * 100);

  return (
    <section className="backtest-sectorchart" aria-label="セクター別成績 chart">
      <div className="backtest-sectorchart-header">
        <h2 className="backtest-sectorchart-title">セクター別 平均リターン ({sectors.length} sector)</h2>
        <span className="backtest-yearchart-meta">
          リターン降順 · sector 分散効果可視化
        </span>
      </div>

      <div className="backtest-sectorchart-rows">
        {sectors.map((s, i) => {
          const widthStrat = Math.abs(s.avgStrat) / range * 100;
          const isPos = s.avgStrat >= 0;
          const isHover = hover && hover.idx === i;
          return (
            <div
              key={s.sector}
              className={`backtest-sectorchart-row ${isHover ? 'is-hover' : ''}`}
              tabIndex={0}
              onMouseEnter={() => showTooltip(s, i)}
              onMouseLeave={hideTooltip}
              onFocus={() => showTooltip(s, i)}
              onBlur={hideTooltip}
              aria-label={`${s.label}: 平均 ${s.avgStrat >= 0 ? '+' : ''}${s.avgStrat.toFixed(2)}% (${s.tradeCount} trade、 ${s.wins} 勝 ${s.losses} 敗)`}
            >
              <span className="backtest-sectorchart-label">
                {s.label}
                <span className="backtest-sectorchart-count">{s.tradeCount} 件</span>
              </span>
              <div className="backtest-sectorchart-track">
                {/* 0% center line */}
                <span className="backtest-sectorchart-zero" style={{ left: `${zeroPct}%` }} />
                {/* sector bar */}
                <span
                  className={`backtest-sectorchart-bar ${isPos ? 'is-gain' : 'is-loss'}`}
                  style={{
                    left: isPos ? `${zeroPct}%` : `${zeroPct - widthStrat}%`,
                    width: `${widthStrat}%`,
                  }}
                />
              </div>
              <span className={`backtest-sectorchart-value ${isPos ? 'is-gain' : 'is-loss'}`}>
                {isPos ? '+' : ''}{s.avgStrat.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Phase 2.3 Sector popover (.backtest-bar-tip 流用、 row hover で表示) */}
      {hover && (
        <div
          className="backtest-bar-tip backtest-sectorchart-tip"
          role="tooltip"
          onMouseEnter={() => showTooltip(hover.sector_row, hover.idx)}
          onMouseLeave={hideTooltip}
        >
          <div className="backtest-bar-tip-period">
            <strong style={{ color: 'var(--text-primary)', fontSize: 13, marginRight: 6 }}>
              {hover.sector_row.label}
            </strong>
            · {hover.sector_row.tradeCount} trade ({hover.sector_row.wins}-{hover.sector_row.losses})
          </div>
          <div className={`backtest-bar-tip-return ${hover.sector_row.avgStrat >= 0 ? 'is-gain' : 'is-loss'}`}>
            {fmtSignedPct(hover.sector_row.avgStrat)}
          </div>
          <div className="backtest-bar-tip-meta">
            <span>SPY {fmtSignedPct(hover.sector_row.avgSpy)}</span>
            <span className="backtest-bar-tip-sep">·</span>
            <span className={hover.sector_row.avgAlpha >= 0 ? 'is-gain' : 'is-loss'}>
              α {fmtSignedPct(hover.sector_row.avgAlpha)}
            </span>
          </div>
          {hover.sector_row.best && (
            <div className="backtest-bar-tip-meta" style={{ marginTop: 2 }}>
              <span style={{ color: 'var(--text-muted)' }}>ベスト</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{hover.sector_row.best.ticker}</span>
              <span className="is-gain">{fmtSignedPct(hover.sector_row.best.return_pct)}</span>
            </div>
          )}
          {hover.sector_row.worst && hover.sector_row.tradeCount > 1 && (
            <div className="backtest-bar-tip-meta">
              <span style={{ color: 'var(--text-muted)' }}>ワースト</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{hover.sector_row.worst.ticker}</span>
              <span className={(hover.sector_row.worst.return_pct ?? 0) >= 0 ? 'is-gain' : 'is-loss'}>
                {fmtSignedPct(hover.sector_row.worst.return_pct)}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// Phase 2.2 full (handover v73 §2-A、 2026-05-16): equity curve (時系列 portfolio 評価額)
// 月次リバランス + 同時保有上限 10 銘柄 + cash drag 込みの portfolio simulation を line chart 化。
// 「$10K → $XX,XXX (5 年間)」 という LP 訴求の裏付け図解、 SPY 100% buy & hold の灰色線と並列。
// Bloomberg / Robinhood の equity curve pattern に準拠 (X = 時間軸、 Y = 評価額 $ で line 慣習一致)。
// hover popover は TradeBarChart と同じ Aman 級 dark (.backtest-bar-tip 流用) で UI 統一。
function EquityCurveChart({ portfolio }) {
  const [hover, setHover] = useState(null);  // idx or null
  const svgRef = useRef(null);

  if (!portfolio || !portfolio.equity_curve || portfolio.equity_curve.length < 2) return null;
  const { equity_curve, spy_curve, kpis } = portfolio;
  const initial = kpis?.initial_capital ?? 10000;
  const n = equity_curve.length;

  // viewBox: 720 × 240 (responsive)
  const W = 720;
  const H = 240;
  const padL = 56;
  const padR = 20;
  const padT = 24;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // value range (5% padding above/below)
  const allV = [...equity_curve.map(p => p.value), ...spy_curve.map(p => p.value), initial];
  const minV = Math.min(...allV);
  const maxV = Math.max(...allV);
  const span = Math.max(maxV - minV, 1);
  const yMin = minV - span * 0.05;
  const yMax = maxV + span * 0.05;
  const range = yMax - yMin;

  const xAt = (i) => padL + (innerW * i) / (n - 1);
  const yAt = (v) => padT + innerH - (innerH * (v - yMin)) / range;

  // SVG path strings
  const stratPath = equity_curve
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.value).toFixed(1)}`)
    .join(' ');
  const spyPath = spy_curve
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.value).toFixed(1)}`)
    .join(' ');
  const baselineY = yAt(initial);

  // Hover via mousemove over invisible rect (Bloomberg / Robinhood pattern)
  const onMouseMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * W;
    if (x < padL || x > W - padR) {
      setHover(null);
      return;
    }
    const idx = Math.round(((x - padL) / innerW) * (n - 1));
    if (idx >= 0 && idx < n) setHover(idx);
  };
  const onMouseLeave = () => setHover(null);

  const hovered = hover != null ? equity_curve[hover] : null;
  const hoveredSpy = hover != null ? spy_curve[hover] : null;
  const hoveredX = hover != null ? xAt(hover) : null;
  const hoveredYStrat = hover != null ? yAt(equity_curve[hover].value) : null;

  // Y-axis ticks (yMin, mid, yMax)
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];
  // X-axis labels (first / mid / last)
  const xLabels = [
    { i: 0, text: equity_curve[0].date.slice(0, 7) },
    { i: Math.floor(n / 2), text: equity_curve[Math.floor(n / 2)].date.slice(0, 7) },
    { i: n - 1, text: equity_curve[n - 1].date.slice(0, 7) },
  ];

  const fmtMoney = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
  const stratDeltaPct = hovered ? (hovered.value / initial - 1) * 100 : 0;
  const spyDeltaPct = hoveredSpy ? (hoveredSpy.value / initial - 1) * 100 : 0;

  return (
    <section className="backtest-equitychart" aria-label="資産推移 - portfolio simulation">
      <div className="backtest-equitychart-header">
        <h3 className="backtest-equitychart-title">資産推移 (月次リバランス、 上限 10 銘柄)</h3>
        <div className="backtest-equitychart-legend">
          <span className="backtest-equitychart-legend-item">
            <span className="backtest-equitychart-legend-dot is-strat" /> 5 条件戦略
          </span>
          <span className="backtest-equitychart-legend-item">
            <span className="backtest-equitychart-legend-dot is-spy" /> SPY
          </span>
        </div>
      </div>
      <div className="backtest-equitychart-svg-wrap">
        <svg
          ref={svgRef}
          className="backtest-equitychart-svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          aria-hidden="true"
        >
          {/* Y grid lines */}
          {yTicks.map((v, i) => (
            <line
              key={`yg-${i}`}
              x1={padL} y1={yAt(v).toFixed(1)} x2={W - padR} y2={yAt(v).toFixed(1)}
              stroke="rgba(148, 163, 184, 0.12)" strokeWidth="1"
              strokeDasharray={i === 1 ? '2 4' : undefined}
            />
          ))}
          {/* Y axis labels */}
          {yTicks.map((v, i) => (
            <text
              key={`yt-${i}`}
              x={padL - 8} y={yAt(v) + 4}
              fontSize="10" fill="var(--text-muted)" textAnchor="end"
              fontVariantNumeric="tabular-nums"
            >
              {fmtMoney(v)}
            </text>
          ))}
          {/* Baseline at initial capital */}
          <line
            x1={padL} y1={baselineY} x2={W - padR} y2={baselineY}
            stroke="rgba(148, 163, 184, 0.28)" strokeWidth="1" strokeDasharray="3 4"
          />
          {/* SPY line (drawn first, behind strategy) */}
          <path
            d={spyPath}
            fill="none" stroke="rgba(148, 163, 184, 0.55)" strokeWidth="1.5"
            strokeLinejoin="round" strokeLinecap="round"
          />
          {/* Strategy line */}
          <path
            d={stratPath}
            fill="none" stroke="var(--color-gain)" strokeWidth="2.2"
            strokeLinejoin="round" strokeLinecap="round"
          />
          {/* X axis labels */}
          {xLabels.map((lab, i) => (
            <text
              key={`xl-${i}`}
              x={xAt(lab.i)} y={H - 8}
              fontSize="10" fill="var(--text-muted)" textAnchor="middle"
              fontVariantNumeric="tabular-nums"
            >
              {lab.text}
            </text>
          ))}
          {/* Hover indicator */}
          {hovered && hoveredX != null && (
            <g>
              <line
                x1={hoveredX} y1={padT} x2={hoveredX} y2={H - padB}
                stroke="rgba(148, 163, 184, 0.4)" strokeWidth="1" strokeDasharray="2 3"
              />
              <circle
                cx={hoveredX} cy={hoveredYStrat}
                r="4" fill="var(--color-gain)"
                stroke="rgba(15, 23, 42, 0.92)" strokeWidth="2"
              />
              <circle
                cx={hoveredX} cy={yAt(hoveredSpy.value)}
                r="3" fill="rgba(148, 163, 184, 0.85)"
                stroke="rgba(15, 23, 42, 0.92)" strokeWidth="2"
              />
            </g>
          )}
          {/* Invisible overlay for hover capture */}
          <rect
            x={padL} y={padT} width={innerW} height={innerH}
            fill="transparent"
            style={{ cursor: 'crosshair' }}
          />
        </svg>
        {hovered && hoveredX != null && (
          <div
            className="backtest-bar-tip"
            style={{
              left: `${(hoveredX / W) * 100}%`,
              top: `${(hoveredYStrat / H) * 100}%`,
            }}
          >
            <div className="backtest-bar-tip-period">{hovered.date}</div>
            <div className={`backtest-bar-tip-return ${stratDeltaPct >= 0 ? 'is-gain' : 'is-loss'}`}>
              {fmtMoney(hovered.value)}
            </div>
            <div className="backtest-bar-tip-meta">
              <span>
                初期比 <span className={stratDeltaPct >= 0 ? 'is-gain' : 'is-loss'}>
                  {stratDeltaPct >= 0 ? '+' : ''}{stratDeltaPct.toFixed(1)}%
                </span>
              </span>
              <span className="backtest-bar-tip-sep">·</span>
              <span>
                SPY {fmtMoney(hoveredSpy.value)} ({spyDeltaPct >= 0 ? '+' : ''}{spyDeltaPct.toFixed(1)}%)
              </span>
            </div>
          </div>
        )}
      </div>
      {/* Totals: CAGR / Max DD / α / 月次勝率 */}
      <div className="backtest-equitychart-totals">
        <div className="backtest-equitychart-total">
          <span className="backtest-equitychart-total-label">CAGR</span>
          <span className={`backtest-equitychart-total-value ${(kpis?.cagr_pct ?? 0) >= 0 ? 'is-gain' : 'is-loss'}`}>
            {kpis?.cagr_pct != null ? `${kpis.cagr_pct >= 0 ? '+' : ''}${kpis.cagr_pct.toFixed(1)}%` : '—'}
          </span>
        </div>
        <div className="backtest-equitychart-total">
          <span className="backtest-equitychart-total-label">Max DD</span>
          <span className={`backtest-equitychart-total-value ${(kpis?.max_drawdown_pct ?? 0) <= -10 ? 'is-loss' : 'is-neutral'}`}>
            {kpis?.max_drawdown_pct != null ? `${kpis.max_drawdown_pct.toFixed(1)}%` : '—'}
          </span>
        </div>
        <div className="backtest-equitychart-total">
          <span className="backtest-equitychart-total-label">vs SPY α</span>
          <span className={`backtest-equitychart-total-value ${(kpis?.alpha_pct ?? 0) >= 0 ? 'is-gain' : 'is-loss'}`}>
            {kpis?.alpha_pct != null ? `${kpis.alpha_pct >= 0 ? '+' : ''}${kpis.alpha_pct.toFixed(1)}pp` : '—'}
          </span>
        </div>
        <div className="backtest-equitychart-total">
          <span className="backtest-equitychart-total-label">月次勝率</span>
          <span className="backtest-equitychart-total-value is-neutral">
            {kpis?.monthly_win_rate_pct != null ? `${kpis.monthly_win_rate_pct.toFixed(0)}%` : '—'}
          </span>
        </div>
      </div>
      <p className="backtest-equitychart-caption">
        $10,000 を月次リバランスで運用した場合の評価額推移 (5 条件 PASS から 12 ヶ月以内を eligible、 同時保有上限 10 銘柄、 cash drag 計上、 transaction cost 0)。 初期 12 ヶ月は lookback warmup で cash 滞留あり。 SPY は同期間 buy & hold。
      </p>
    </section>
  );
}


// Phase 2.2 minimum viable Round 3 (handover v72、 2026-05-16、 user dogfood + subagent 案 B):
// Bar chart で 20 銘柄個別リターンを α 降順表示。 平均水平線 2 本 (5 条件 / SPY) overlay で
// 「たくさんの勝ち、 少しの負け、 平均 +32.56% (vs SPY +21.17% を 11.38pp 上回る)」 を 2 秒可視化。
// 業界 4/4 一致 (Morningstar / SeekingAlpha / Bloomberg / Robinhood) で「sample 分布 = bar」 が standard、
// 旧 line chart「累積平均」 の概念衝突 (X 軸 = 時間 vs trade index) を根本解消。
function TradeBarChart({ chartData }) {
  // Phase 2.2 Round 5 (handover v72、 user dogfood、 subagent 案 B):
  // SVG <title> native tooltip は OS default で luxury 崩壊 → React state + 外側 div で
  // Aman 級 dark popover 実装 (TickerBadge + 期間 + リターン + SPY + α)。
  // tabIndex + onFocus/Blur で keyboard a11y、 0ms show / 80ms hide で「触れた瞬間に答える」 応答性。
  const [hover, setHover] = useState(null);  // { bar, idx } | null
  const hideTimer = useRef(null);

  if (!chartData || !chartData.bars || chartData.bars.length < 2) return null;
  const { bars, avgStrat, avgSpy, avgAlpha } = chartData;
  const n = bars.length;

  const showTooltip = (bar, idx) => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setHover({ bar, idx });
  };
  const hideTooltip = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHover(null), 80);
  };

  // SVG viewBox
  // Phase 2.2 Round 6 (user dogfood): PAD_R を 56 → 88 に増やして右端の平均線 label
  // (「平均 +32.6%」 「SPY +21.2%」) の末尾 % が SVG 外で clip される問題を解消。
  const W = 720;
  const H = 260;
  const PAD_L = 48;
  const PAD_R = 88;
  const PAD_T = 24;
  const PAD_B = 36;

  // Y 軸範囲 (全 trade return + 平均線、 ±10% margin)
  const allValues = bars.flatMap(b => [b.return_pct ?? 0, b.spy_return_pct ?? 0]).concat([avgStrat, avgSpy, 0]);
  const yMaxRaw = Math.max(...allValues);
  const yMinRaw = Math.min(...allValues);
  const range = Math.max(yMaxRaw - yMinRaw, 1);
  const yMax = yMaxRaw + range * 0.10;
  const yMin = yMinRaw - range * 0.10;

  // X 配置: 各 bar は固定幅 + gap、 (W - PAD_L - PAD_R) を n 等分
  const innerW = W - PAD_L - PAD_R;
  const slotW = innerW / n;
  const barW = Math.max(slotW * 0.6, 4);  // 60% を bar、 40% を gap

  const xOf = (i) => PAD_L + slotW * i + (slotW - barW) / 2;
  const yOf = (v) => PAD_T + (H - PAD_T - PAD_B) * (1 - (v - yMin) / (yMax - yMin));

  const zeroY = yOf(0);
  const avgStratY = yOf(avgStrat);
  const avgSpyY = yOf(avgSpy);

  return (
    <section className="backtest-cumchart" aria-label="個別銘柄リターン分布 chart">
      <div className="backtest-cumchart-header">
        <h2 className="backtest-cumchart-title">個別銘柄リターン分布 ({n} 銘柄・リターン降順)</h2>
        <div className="backtest-cumchart-legend">
          <span className="backtest-cumchart-legend-item">
            <span className="backtest-cumchart-legend-dot is-strat" />
            5 条件 平均
          </span>
          <span className="backtest-cumchart-legend-item">
            <span className="backtest-cumchart-legend-dot is-spy" />
            S&amp;P 500 平均
          </span>
        </div>
      </div>

      <div className="backtest-cumchart-svg-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="backtest-cumchart-svg" preserveAspectRatio="none" aria-hidden="true">
          {/* zero line */}
          <line x1={PAD_L} x2={W - PAD_R} y1={zeroY} y2={zeroY} stroke="rgba(148, 163, 184, 0.28)" strokeWidth="1" />

          {/* 個別 20 銘柄の bar (緑 = gain / 赤 = loss)
              Phase 2.2 Round 5: SVG <title> を撤去、 React state + 外側 div の Aman 級
              dark popover に置換 (下記 hover popover)。 tabIndex で keyboard a11y。 */}
          {bars.map((b, i) => {
            const ret = b.return_pct ?? 0;
            const x = xOf(i);
            const y = ret >= 0 ? yOf(ret) : zeroY;
            const h = Math.abs(yOf(ret) - zeroY);
            const isHover = hover && hover.idx === i;
            const fill = ret >= 0 ? 'var(--color-gain)' : 'var(--color-loss)';
            return (
              <rect
                key={i}
                x={x.toFixed(1)}
                y={y.toFixed(1)}
                width={barW.toFixed(1)}
                height={Math.max(h, 1).toFixed(1)}
                rx="1.5"
                fill={fill}
                opacity={isHover ? 1 : 0.85}
                tabIndex={0}
                style={{ cursor: 'pointer', outline: 'none' }}
                onMouseEnter={() => showTooltip(b, i)}
                onMouseLeave={hideTooltip}
                onFocus={() => showTooltip(b, i)}
                onBlur={hideTooltip}
                aria-label={`${b.ticker}: ${ret >= 0 ? '+' : ''}${ret.toFixed(2)}% (期間 ${b.buy_date} 〜 ${b.sell_date}、 SPY ${(b.spy_return_pct ?? 0).toFixed(2)}%)`}
              />
            );
          })}

          {/* SPY 平均水平線 (グレー dashed) */}
          <line
            x1={PAD_L} x2={W - PAD_R}
            y1={avgSpyY} y2={avgSpyY}
            stroke="rgba(148, 163, 184, 0.85)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
          {/* 5 条件平均水平線 (緑 dashed) — 重要なので最後に描画 */}
          <line
            x1={PAD_L} x2={W - PAD_R}
            y1={avgStratY} y2={avgStratY}
            stroke="var(--color-gain)"
            strokeWidth="2"
            strokeDasharray="6 4"
          />

          {/* Y 軸 0% label */}
          <text x={PAD_L - 6} y={zeroY + 4} fontSize="10" fill="var(--text-muted)" textAnchor="end">0%</text>
          {/* Y 軸 yMax label */}
          <text x={PAD_L - 6} y={yOf(yMax) + 4} fontSize="10" fill="var(--text-muted)" textAnchor="end">+{yMax.toFixed(0)}%</text>
          {/* Y 軸 yMin label (負の領域があるとき) */}
          {yMin < -1 && (
            <text x={PAD_L - 6} y={yOf(yMin) + 4} fontSize="10" fill="var(--text-muted)" textAnchor="end">{yMin.toFixed(0)}%</text>
          )}

          {/* 5 条件平均線 label (右端) */}
          <text x={W - PAD_R + 4} y={avgStratY + 4} fontSize="10" fill="var(--color-gain)" fontWeight="700">
            平均 +{avgStrat.toFixed(1)}%
          </text>
          {/* SPY 平均線 label (右端、 5 条件と重ならないように Y で分離) */}
          <text
            x={W - PAD_R + 4}
            y={Math.abs(avgStratY - avgSpyY) < 14 ? avgSpyY + 16 : avgSpyY + 4}
            fontSize="10"
            fill="var(--text-muted)"
          >
            SPY +{avgSpy.toFixed(1)}%
          </text>

          {/* X 軸 label */}
          <text x={PAD_L} y={H - 12} fontSize="10" fill="var(--text-muted)">最高リターン</text>
          <text x={W - PAD_R} y={H - 12} fontSize="10" fill="var(--text-muted)" textAnchor="end">最低リターン</text>
        </svg>

        {/* Phase 2.2 Round 5: Aman 級 dark popover (hover/focus 時に bar 上に表示)。
            左右画面端で clamp、 fade-in animation、 mobile (pointer:coarse) は tap で表示。
            wrap div に position: relative (CSS 側)、 popover は absolute で transform-X 中央寄せ。 */}
        {hover && (
          <div
            className="backtest-bar-tip"
            role="tooltip"
            style={{
              left: `${((xOf(hover.idx) + barW / 2) / W) * 100}%`,
              top: `${(yOf(hover.bar.return_pct ?? 0) / H) * 100}%`,
            }}
            onMouseEnter={() => showTooltip(hover.bar, hover.idx)}
            onMouseLeave={hideTooltip}
          >
            {/* TickerBadge は logo + ticker テキスト両方を内包する primitive (TickerBadge.jsx:67-70)、
                追加 span は冗長で二重表示になっていた (user dogfood Round)。 size="md" で目立たせる */}
            <div className="backtest-bar-tip-header">
              <TickerBadge ticker={hover.bar.ticker} size="md" />
            </div>
            <div className="backtest-bar-tip-period">
              {hover.bar.buy_date} <span aria-hidden="true">→</span> {hover.bar.sell_date}
            </div>
            <div className={`backtest-bar-tip-return ${(hover.bar.return_pct ?? 0) >= 0 ? 'is-gain' : 'is-loss'}`}>
              {fmtSignedPct(hover.bar.return_pct)}
            </div>
            <div className="backtest-bar-tip-meta">
              <span>SPY {fmtSignedPct(hover.bar.spy_return_pct)}</span>
              <span className="backtest-bar-tip-sep">·</span>
              <span className={(hover.bar.alpha_pct ?? 0) >= 0 ? 'is-gain' : 'is-loss'}>
                α {fmtSignedPct(hover.bar.alpha_pct)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 統計 totals (chart 下、 hero と同じ font-variant-numeric) */}
      <div className="backtest-cumchart-totals">
        <div className="backtest-cumchart-total">
          <span className="backtest-cumchart-total-label">5 条件戦略 (平均)</span>
          <span className={`backtest-cumchart-total-value ${avgStrat >= 0 ? 'is-gain' : 'is-loss'}`}>
            {avgStrat >= 0 ? '+' : ''}{avgStrat.toFixed(2)}%
          </span>
        </div>
        <div className="backtest-cumchart-total">
          <span className="backtest-cumchart-total-label">S&amp;P 500 (平均)</span>
          <span className="backtest-cumchart-total-value is-neutral">
            {avgSpy >= 0 ? '+' : ''}{avgSpy.toFixed(2)}%
          </span>
        </div>
        <div className="backtest-cumchart-total">
          <span className="backtest-cumchart-total-label">α (vs SPY)</span>
          <span className={`backtest-cumchart-total-value ${avgAlpha >= 0 ? 'is-gain' : 'is-loss'}`}>
            {avgAlpha >= 0 ? '+' : ''}{avgAlpha.toFixed(2)} ポイント
          </span>
        </div>
      </div>
      <p className="backtest-cumchart-caption">
        過去 5 年間で 5/5 PASS した {n} 銘柄を個別表示 (リターン降順)。
        {bars.filter(b => (b.return_pct ?? 0) >= 0).length} 銘柄が上昇 (緑)、 {bars.filter(b => (b.return_pct ?? 0) < 0).length} 銘柄が下落 (赤)、
        平均 +{avgStrat.toFixed(2)}% (緑点線) は SPY 平均 +{avgSpy.toFixed(2)}% (グレー点線) を {avgAlpha.toFixed(2)} ポイント上回る。
        各 bar は 5/5 PASS 提出翌日終値で買い 1 年保有後 売却 — 真の時系列 portfolio rebalance simulation は Phase 2.2 full で別途実装予定。
      </p>
    </section>
  );
}

export default function BacktestPage({ user, isSubscribed, startCheckout }) {
  const [period, setPeriod] = useState('5y');
  const [holdDays, setHoldDays] = useState(365);
  const { data, loading, error } = useBacktest(period, holdDays);

  // Phase 3 Sub-3 (2026-05-16): Premium 未契約者にのみ teaser を表示。
  // ログイン状態に関係なく訴求 (LP 経由で来た未ログインユーザーにも訴求)。
  const showPremiumTeaser = !isSubscribed;
  const handlePremiumUpgrade = () => {
    if (!user) {
      // 未ログイン → ログインモーダルに誘導 (Trust Cliff 回避: 「Premium で解放する」 で
      // checkout に進む流れを期待されるが、 user 未認証ではまず login 必須)
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('layout');
        url.searchParams.set('signin', '1');
        window.location.href = url.toString();
      } catch {
        window.location.href = '/?signin=1';
      }
      return;
    }
    if (typeof startCheckout === 'function') {
      startCheckout('monthly', 'premium');
    }
  };

  const kpis = data?.kpis || {};
  const sampleSize = data?.sample_size || {};
  const trades = data?.trades || [];
  // Phase 2.2 full (handover v73 §2-A): 月次リバランス portfolio simulation 結果
  const portfolio = data?.portfolio && !data.portfolio.error ? data.portfolio : null;
  const portfolioKpis = portfolio?.kpis || {};

  // Hero は portfolio cum_return を主役 (per-trade avg は TradeBarChart で詳細表示)。
  // portfolio 取得失敗時は fallback で per-trade avg にして体験継続性を担保。
  const cumReturn = portfolioKpis.cum_return_pct;
  const spyCum = portfolioKpis.spy_cum_return_pct;
  const portfolioAlpha = portfolioKpis.alpha_pct;
  const heroNumber = cumReturn != null ? cumReturn : kpis.avg_return_pct;
  const heroSpy = spyCum != null ? spyCum : kpis.avg_spy_return_pct;
  const heroAlpha = portfolioAlpha != null ? portfolioAlpha : kpis.avg_alpha_pct;
  const isPortfolioHero = cumReturn != null;

  const avgReturn = kpis.avg_return_pct;
  // SPIVA 業界比較セクション (per-trade α 表示) で参照される per-trade KPI を保持
  const alphaTrade = kpis.avg_alpha_pct;
  const winRate = kpis.win_rate_pct;
  const winVsSpy = kpis.win_vs_spy_rate_pct;
  const eventCount = sampleSize.total_events;
  const completedTrades = sampleSize.completed_trades;
  const uniqueTickers = sampleSize.unique_tickers;
  // Phase 2.1 (handover v72): backend が返す universe size (S&P 500 top N、 default 200)。
  // 未指定 (古い backend) なら 200 を default 表示 → 「上位 200 銘柄を検証」 で安全側 fallback。
  const universeSize = sampleSize.universe_size || 200;

  const fromDate = data?.from_date;
  const toDate = data?.to_date;

  // Count-up animations (target が null なら 0 から始まる)
  const animHeroNumber = useCountUp(heroNumber, { duration: 1000, digits: 2 });
  const animHeroSpy = useCountUp(heroSpy, { duration: 800, digits: 2 });
  const animHeroAlpha = useCountUp(heroAlpha, { duration: 1000, digits: 2 });
  const animWinRate = useCountUp(winRate, { duration: 600, digits: 1 });
  const animWinVsSpy = useCountUp(winVsSpy, { duration: 600, digits: 1 });

  // 「100 万円 → 〇〇万円」 仮定法 (固定 150 円換算 = JPY return = USD return で一貫)
  // Phase 2.2 full: portfolio.cum_return を主役にすることで「5 年運用後の真の資産」 を表現。
  const futureJpy = heroNumber != null ? HERO_BASE_JPY * (1 + heroNumber / 100) : null;
  const animFutureJpy = useCountUp(futureJpy, { duration: 1000, digits: 0 });

  // Preliminary バッジ表示判定 (n < 30 は統計的に preliminary)
  const isPreliminary = completedTrades != null && completedTrades < 30;

  // Top 5 trades (α 降順) + Bottom 3 trades (α 昇順) (Phase 2.1 R2: Survivorship 開示)
  const sortedByAlphaDesc = !loading && trades.length > 0
    ? [...trades].sort((a, b) => (b.alpha_pct ?? -1e9) - (a.alpha_pct ?? -1e9))
    : [];
  const topTrades = sortedByAlphaDesc.slice(0, 5);
  // Bottom 3 (worst α): 完了取引が 8 件以上のとき表示 (top 5 と重複しない件数を確保)
  const bottomTrades = sortedByAlphaDesc.length >= 8
    ? sortedByAlphaDesc.slice(-3).reverse()
    : [];

  // Phase 2.2 minimum viable Round 3 (handover v72、 2026-05-16、 user dogfood 指摘):
  // 旧 line chart (累積平均) は line chart 慣習「X = 時間軸、 0% から始まる」 と衝突し、
  // user に「買付時点 = -57%」 と誤読された (実は「最古 trade 1 件のみの平均」 = TSLA -47% 等)。
  // 6 案レビュー結果 (subagent)、 案 B Bar chart 採用: 業界 4/4 一致 (Morningstar / SeekingAlpha /
  // Bloomberg / Robinhood) で「個別 sample 比較は bar」 が standard、 line 慣習衝突なし。
  // 20 銘柄を α 降順で並べ、 緑 (gain) / 赤 (loss) + 平均水平線 2 本 overlay で
  // 「たくさんの勝ち、 少しの負け、 平均 +32.56% (vs SPY +21.17% を 11.38pp 上回る)」 を 2 秒で。
  const barChartData = (!loading && trades.length >= 2)
    ? (() => {
        // return_pct 降順 sort (user dogfood Round 4): bar 高さが単調減少で「リターン降順」
        // という業界標準慣習 (Morningstar / SeekingAlpha bar chart) に一致、 視覚的に整然。
        // 旧 α 降順は「BeatScanner 戦略の vs SPY 効果」 強調だが return との二軸でガタガタする。
        const sorted = [...trades].sort((a, b) =>
          (b.return_pct ?? -1e9) - (a.return_pct ?? -1e9)
        );
        // KPI 値 (backend が計算済の avg を使う、 chart 平均線と一致)
        const avgStrat = kpis.avg_return_pct ?? 0;
        const avgSpy = kpis.avg_spy_return_pct ?? 0;
        const avgAlpha = kpis.avg_alpha_pct ?? (avgStrat - avgSpy);
        return {
          bars: sorted,         // 各 bar = trade (ticker, return_pct, spy_return_pct, alpha_pct)
          avgStrat,
          avgSpy,
          avgAlpha,
        };
      })()
    : null;

  // Phase 2.3 (handover v72、 2026-05-16): YoY breakdown - sell_date の年で grouping、
  // 各年の平均 return / SPY / α を年次 bar chart 化。 「毎年勝てる」 vs 「特定の年だけ大勝ち」
  // を視覚化 (Bloomberg / Morningstar の calendar year returns pattern)。
  // 5 条件戦略の年次安定性を訴求、 LP「リスク分散」 ストーリーを補完。
  const yearChartData = (!loading && trades.length >= 2)
    ? (() => {
        // sell_date 年で grouping (1 年保有後の実現リターン年)
        // Phase 2.3 Round 2 (handover v72、 user dogfood + subagent 案 B+):
        // wins / losses / best / worst を派生して年次 popover で「具体的な根拠」 表示。
        const byYear = new Map();
        trades.forEach((t) => {
          if (!t.sell_date) return;
          const year = t.sell_date.slice(0, 4);
          if (!byYear.has(year)) byYear.set(year, { strat: [], spy: [], alpha: [], trades: [] });
          const g = byYear.get(year);
          if (t.return_pct != null) g.strat.push(t.return_pct);
          if (t.spy_return_pct != null) g.spy.push(t.spy_return_pct);
          if (t.alpha_pct != null) g.alpha.push(t.alpha_pct);
          g.trades.push(t);
        });
        const years = [...byYear.keys()].sort();
        const data = years.map((y) => {
          const g = byYear.get(y);
          const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
          // wins/losses + best/worst (return_pct 降順 sort して両端取得)
          const wins = g.trades.filter(t => (t.return_pct ?? 0) >= 0).length;
          const losses = g.trades.length - wins;
          const sortedByRet = [...g.trades].sort((a, b) =>
            (b.return_pct ?? -1e9) - (a.return_pct ?? -1e9)
          );
          const best = sortedByRet[0] || null;
          const worst = sortedByRet[sortedByRet.length - 1] || null;
          return {
            year: y,
            avgStrat: avg(g.strat),
            avgSpy: avg(g.spy),
            avgAlpha: avg(g.alpha),
            tradeCount: g.strat.length,
            wins,
            losses,
            best,    // { ticker, return_pct, ... } or null
            worst,
          };
        });
        // 全年のうち win 年数 (alpha > 0)
        const winYears = data.filter(d => d.avgAlpha > 0).length;
        return { years: data, winYears, totalYears: data.length };
      })()
    : null;

  // Phase 2.3 Sector breakdown (handover v72): trade を GICS 11 sector で grouping。
  // 各 sector の平均 return / SPY / α + 勝率 + best ticker、 sector 分散効果可視化。
  // frontend/src/lib/sectorMap.js の hardcode mapping (FMP profile call 回避)。
  const sectorChartData = (!loading && trades.length >= 2)
    ? (() => {
        const bySector = new Map();
        trades.forEach((t) => {
          const sec = getSector(t.ticker);
          if (!bySector.has(sec)) bySector.set(sec, { strat: [], spy: [], alpha: [], trades: [] });
          const g = bySector.get(sec);
          if (t.return_pct != null) g.strat.push(t.return_pct);
          if (t.spy_return_pct != null) g.spy.push(t.spy_return_pct);
          if (t.alpha_pct != null) g.alpha.push(t.alpha_pct);
          g.trades.push(t);
        });
        // 平均 return 降順 sort で見栄え一致
        const sectorRows = [...bySector.entries()].map(([sec, g]) => {
          const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
          const wins = g.trades.filter(t => (t.return_pct ?? 0) >= 0).length;
          const losses = g.trades.length - wins;
          const sortedByRet = [...g.trades].sort((a, b) =>
            (b.return_pct ?? -1e9) - (a.return_pct ?? -1e9)
          );
          return {
            sector: sec,
            label: GICS_SECTOR_LABEL[sec] || sec,
            avgStrat: avg(g.strat),
            avgSpy: avg(g.spy),
            avgAlpha: avg(g.alpha),
            tradeCount: g.trades.length,
            wins,
            losses,
            best: sortedByRet[0] || null,
            worst: sortedByRet[sortedByRet.length - 1] || null,
          };
        });
        sectorRows.sort((a, b) => b.avgStrat - a.avgStrat);
        return { sectors: sectorRows };
      })()
    : null;

  return (
    <div className="backtest-page">
      <header className="backtest-page-header">
        <button
          type="button"
          className="backtest-page-back"
          onClick={exitToHome}
          aria-label="BeatScanner に戻る"
        >
          ← BeatScanner に戻る
        </button>
        <h1 className="backtest-page-title">5 つのルールで選んだ結果</h1>
        <span className="backtest-page-subtitle">
          シンプルな 5 つのルールで選んだ銘柄が、 過去どれだけ勝てたかの検証
        </span>
      </header>

      <main className="backtest-page-main">
        {/* Hero: 結論を 1 枚絵で */}
        <section
          className="backtest-hero"
          aria-busy={loading || undefined}
          aria-live="polite"
        >
          <div className="backtest-hero-eyebrow">
            {isPortfolioHero ? (
              <>過去 <strong>5 年</strong>、 <strong>月次リバランス</strong> (同時保有上限 10 銘柄) で運用した場合</>
            ) : (
              <>過去 <strong>5 年</strong>、 ルール合格銘柄を <strong>1 年保有</strong> した場合の 1 銘柄あたり平均</>
            )}
          </div>
          <div
            className={`backtest-hero-number ${
              heroNumber == null ? '' : heroNumber >= 0 ? 'is-gain' : 'is-loss'
            }`}
            aria-label={heroNumber != null ? fmtSignedPct(heroNumber) : '計算中'}
          >
            {loading || heroNumber == null ? (
              <SkeletonBar width="6ch" height="1em" />
            ) : (
              fmtSignedPct(animHeroNumber ?? heroNumber)
            )}
          </div>

          {/* Secondary: 100 万円 → XXX 万円 (米国株未経験者でも「買えるもの」 がイメージ可)
              Phase 2.2 full: portfolio.cum_return を反映 → 5 年運用後の真の資産額 */}
          <div className="backtest-hero-jpy">
            {loading || futureJpy == null ? (
              <SkeletonBar width="180px" height="1em" />
            ) : (
              <>
                <span className="backtest-hero-jpy-from">100 万円</span>
                <span className="backtest-hero-jpy-arrow" aria-hidden="true">→</span>
                <span className={`backtest-hero-jpy-to ${futureJpy >= HERO_BASE_JPY ? 'is-gain' : 'is-loss'}`}>
                  {fmtJpy(animFutureJpy ?? futureJpy)}
                </span>
              </>
            )}
          </div>

          {/* Tertiary: SPY 比較 + α */}
          <div className="backtest-hero-meta">
            {error ? (
              <span style={{ color: 'var(--color-loss)' }}>取得に失敗しました</span>
            ) : loading || heroSpy == null ? (
              <SkeletonBar width="280px" height="1em" />
            ) : (
              <>
                同期間の S&amp;P 500 (米国株全体の代表指数): <strong>{fmtSignedPct(animHeroSpy ?? heroSpy)}</strong>
                {heroAlpha != null && (
                  <span className={`backtest-hero-alpha ${heroAlpha >= 0 ? 'is-gain' : 'is-loss'}`}>
                    {' '}/ 市場を <strong>{fmtSignedPct(animHeroAlpha ?? heroAlpha)}</strong> ポイント上回る
                  </span>
                )}
              </>
            )}
          </div>

          {/* Primary CTA: 検索バーに着地 → 任意銘柄を 5 条件で即チェック (Trust Cliff 整合)
              Phase 2.1 (handover v72): 文言を遷移先 (検索バー、 任意銘柄 demo モード) と
              一致させる。 旧文言「自分の保有銘柄をチェック」 は Portfolio 機能未着地で
              CLAUDE.md「Trust Cliff」 違反だった。 */}
          <div className="backtest-hero-cta">
            <button
              type="button"
              className="backtest-cta-primary"
              onClick={exitToAnalyze}
            >
              気になる銘柄を 5 条件チェック →
            </button>
            <span className="backtest-hero-cta-meta">登録不要 / 3 銘柄まで無料</span>
          </div>
        </section>

        {/* Phase 2.2 full (handover v73 §2-A): 月次リバランス portfolio simulation の equity curve。
            「$10K → $XX,XXX」 Hero 数字の裏付け、 SPY 比較を line で並列 (Bloomberg/Robinhood pattern)。
            portfolio が無い (古い backend / error) 場合は section ごと自動非表示。 */}
        {!loading && portfolio && portfolio.equity_curve && (
          <EquityCurveChart portfolio={portfolio} />
        )}

        {/* KPI strip: 勝率 + sample size (シンプル 3 chip、 vs SPY 勝率は depth に move)
            Phase 2.1 R2 (handover v72 dogfood): PRELIMINARY バッジを 勝率タイルから外し、
            KPI 下部の foot note 行に移動。 理由: 70% という強い数字の隣に amber バッジが
            あると 「70% 自体が暫定」 と誤読される。 信頼度 (n<30) は disclaimer 側で説明し、
            タイル内の数字は純粋な計算結果として表示する。
            旧バッジ位置 (検証イベント) でも 14/12 不一致だったため、 タイル外への退避が正解。 */}
        <section className="backtest-kpis" aria-label="主要指標">
          <div className="backtest-kpi">
            <span className="backtest-kpi-label">勝率</span>
            <span className="backtest-kpi-value">
              {loading ? <SkeletonBar width="3em" /> : fmtPct(animWinRate ?? winRate)}
            </span>
            <span className="backtest-kpi-sub">
              {!loading && completedTrades != null && winRate != null
                ? `${Math.round((winRate / 100) * completedTrades)} 勝 ${completedTrades - Math.round((winRate / 100) * completedTrades)} 敗`
                : <SkeletonBar width="6em" />}
            </span>
          </div>
          <div className="backtest-kpi">
            <span className="backtest-kpi-label">検証イベント</span>
            <span className="backtest-kpi-value">
              {loading ? <SkeletonBar width="2em" /> : (eventCount ?? '—')} 件
            </span>
            <span className="backtest-kpi-sub">
              {!loading && uniqueTickers != null
                ? `${uniqueTickers} 銘柄で発生`
                : <SkeletonBar width="6em" />}
            </span>
          </div>
          <div className="backtest-kpi">
            <span className="backtest-kpi-label">検証範囲</span>
            <span className="backtest-kpi-value backtest-kpi-value-sm">
              {loading
                ? <SkeletonBar width="9em" />
                : fromDate && toDate ? `${fromDate.slice(0, 7)} 〜 ${toDate.slice(0, 7)}` : '—'}
            </span>
            <span className="backtest-kpi-sub">S&amp;P 500 上位 {universeSize} 銘柄を検証</span>
          </div>
        </section>

        {/* Preliminary note: KPI タイル外の foot row、 disclaimer の上位 hint
            5 原則 #1「2 秒で読める」 観点で、 タイル内の数字を弱化せず信頼度情報を補足 */}
        {!loading && isPreliminary && completedTrades != null && (
          <div className="backtest-prelim-note" aria-label="サンプル数注記">
            <span className="backtest-prelim-badge">preliminary</span>
            <span className="backtest-prelim-text">
              完了取引 <strong>{completedTrades} 件</strong> / 統計的に有意な n≥30 未達 (n≥30 で確定)
            </span>
          </div>
        )}

        {/* Phase 2.2 minimum viable Round 3 (handover v72、 subagent 案 B): 個別銘柄 bar chart。
            業界 4/4 一致で sample 分布は bar が standard、 line chart「累積平均」 の概念衝突
            (X 軸 = 時間 vs trade index) を根本解消。 平均水平線 2 本で「期待値プラス戦略」 を 2 秒可視化。 */}
        {!loading && barChartData && (
          <TradeBarChart chartData={barChartData} />
        )}

        {/* Phase 2.3 (handover v72): YoY 年次別成績 — 「毎年勝てる」 戦略安定性訴求。
            Bloomberg / Morningstar の calendar year returns pattern、 LP リスク分散ストーリー補完。 */}
        {!loading && yearChartData && yearChartData.totalYears >= 2 && (
          <YearBarChart chartData={yearChartData} />
        )}

        {/* Phase 2.3 Sector (handover v72): セクター別成績 — 「どのセクターで勝てるか」 訴求。
            横棒 chart で sector 分散効果可視化、 best/worst ticker で具体的根拠提示。 */}
        {!loading && sectorChartData && sectorChartData.sectors.length >= 2 && (
          <SectorBarChart chartData={sectorChartData} />
        )}

        {/* Top trades + Bottom trades (Phase 2.1 R2: Survivorship 開示 / Bloomberg 級 full disclosure)
            勝った銘柄だけ見せると「都合の良い銘柄を選んだ」 印象 → 負けた銘柄 3 件も表示で誠実性。
            Aman 級 luxury = 隠さない透明性 (ホテルでも価格表は明示する)。 */}
        {!loading && topTrades.length > 0 && (
          <section className="backtest-trades">
            <h2 className="backtest-trades-title">大きく勝った銘柄 (α 上位 5 件)</h2>
            <div className="backtest-trades-list">
              {topTrades.map((t, i) => (
                <div key={`top-${i}`} className="backtest-trade-row">
                  <TickerBadge ticker={t.ticker} size="sm" />
                  <span className="backtest-trade-period">{t.buy_date} → {t.sell_date}</span>
                  <span className={`backtest-trade-return ${t.return_pct >= 0 ? 'is-gain' : 'is-loss'}`}>
                    {fmtSignedPct(t.return_pct)}
                  </span>
                  <span className="backtest-trade-spy">SPY {fmtSignedPct(t.spy_return_pct)}</span>
                  <span className={`backtest-trade-alpha ${t.alpha_pct >= 0 ? 'is-gain' : 'is-loss'}`}>
                    α {fmtSignedPct(t.alpha_pct)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {!loading && bottomTrades.length > 0 && (
          <section className="backtest-trades backtest-trades-bottom">
            <h2 className="backtest-trades-title">負けた銘柄 (α 下位 3 件)</h2>
            <div className="backtest-trades-list">
              {bottomTrades.map((t, i) => (
                <div key={`bot-${i}`} className="backtest-trade-row is-muted">
                  <TickerBadge ticker={t.ticker} size="sm" />
                  <span className="backtest-trade-period">{t.buy_date} → {t.sell_date}</span>
                  <span className={`backtest-trade-return ${t.return_pct >= 0 ? 'is-gain' : 'is-loss'}`}>
                    {fmtSignedPct(t.return_pct)}
                  </span>
                  <span className="backtest-trade-spy">SPY {fmtSignedPct(t.spy_return_pct)}</span>
                  <span className={`backtest-trade-alpha ${t.alpha_pct >= 0 ? 'is-gain' : 'is-loss'}`}>
                    α {fmtSignedPct(t.alpha_pct)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Controls: fold below に移動 (5 体合議で「結論を hero で言い切り、 details は scroll」 流) */}
        <section className="backtest-controls">
          <div className="backtest-control-group">
            <span className="backtest-control-label">保有期間</span>
            <div className="backtest-control-chips" role="radiogroup" aria-label="保有期間">
              {HOLD_OPTIONS.map((opt) => {
                const active = holdDays === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`backtest-chip ${active ? 'is-active' : ''}`}
                    onClick={() => setHoldDays(opt.key)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="backtest-control-group">
            <span className="backtest-control-label">検証期間</span>
            <div className="backtest-control-chips" role="radiogroup" aria-label="検証期間">
              {PERIOD_OPTIONS.map((opt) => {
                const active = period === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`backtest-chip ${active ? 'is-active' : ''}`}
                    onClick={() => setPeriod(opt.key)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Methodology + 業界比較 (SPIVA)
            Phase 2.1 (handover v72): 業界比較を 4 統計連続文章 → horizontal bar 3 本図解 に変更。
            5 原則 #1 「読み手 2 秒で分かる」 / #5 「図解で認知コスト下げる」 に準拠。
            旧文章中の markdown ** 生出力 (legacy bug) も完全撤去。 */}
        <section className="backtest-methodology">
          <h2 className="backtest-methodology-title">検証方法と業界比較</h2>
          <ol className="backtest-methodology-list">
            <li>S&amp;P 500 上位 {universeSize} 銘柄について、 過去四半期決算 (10-Q) の財務データを取得</li>
            <li>各四半期で 5 つのルールを評価 (①営業 CF マージン ≥15% / ②EPS 3 期連続増加 / ③CFPS 3 期連続増加 / ④売上 3 期連続増加 / ⑤CFPS &gt; EPS)</li>
            <li>5/5 合格の銘柄を 10-Q 提出翌日終値で買い、 設定した保有期間後の終値で売却</li>
            <li>同期間の SPY パフォーマンスと比較してアウトパフォーム幅 (α) を算出</li>
            <li>円換算は USD/JPY {USDJPY_FIXED} 円の固定レート (為替変動は除外、 純粋な銘柄選定効果のみを可視化)</li>
          </ol>

          <h3 className="backtest-methodology-subtitle">業界比較 (SPIVA / Morningstar)</h3>
          <p className="backtest-methodology-para">
            S&amp;P Dow Jones の SPIVA レポートによれば、 <strong>過去 10 年で S&amp;P 500 を上回った米国大型株 active fund は 12.6% のみ</strong>。
            負け銘柄の損失を勝ち銘柄の超過リターンで補う <strong>期待値プラス戦略</strong> が本検証の根拠です。
          </p>

          {/* Horizontal bar 3 本: 業界平均 (active fund) → 本検証 vs SPY 勝率 → 5 条件勝率 の階段 */}
          <div className="backtest-industry-comparison" aria-label="業界平均との比較">
            <div className="backtest-icb-row">
              <span className="backtest-icb-label">米国大型株 active fund (SPIVA)</span>
              <div className="backtest-icb-track">
                <span className="backtest-icb-fill is-baseline" style={{ width: '12.6%' }} />
              </div>
              <span className="backtest-icb-value">12.6%</span>
            </div>
            <div className="backtest-icb-row">
              <span className="backtest-icb-label">本検証 vs SPY 勝率</span>
              <div className="backtest-icb-track">
                <span
                  className="backtest-icb-fill is-current"
                  style={{ width: `${winVsSpy != null ? Math.max(0, Math.min(100, winVsSpy)) : 0}%` }}
                />
              </div>
              <span className="backtest-icb-value">
                {!loading && winVsSpy != null ? fmtPct(winVsSpy) : '—'}
              </span>
            </div>
            <div className="backtest-icb-row">
              <span className="backtest-icb-label">5 条件勝率 (本検証)</span>
              <div className="backtest-icb-track">
                <span
                  className="backtest-icb-fill is-strategy"
                  style={{ width: `${winRate != null ? Math.max(0, Math.min(100, winRate)) : 0}%` }}
                />
              </div>
              <span className="backtest-icb-value">
                {!loading && winRate != null ? fmtPct(winRate) : '—'}
              </span>
            </div>
            {/* 平均 α を bar 群直下に「第 2 の Hero」 として格上げ (Round 2 A-2)
                理由: 検証全体の結論数字 (期待値プラスの定量根拠) を末尾埋もれさせない */}
            <div className="backtest-icb-conclusion">
              <span className="backtest-icb-conclusion-label">平均 α (vs SPY)</span>
              <span className={`backtest-icb-conclusion-value ${alphaTrade != null && alphaTrade >= 0 ? 'is-gain' : 'is-loss'}`}>
                {!loading && alphaTrade != null ? fmtSignedPct(alphaTrade) : '—'}
                <span className="backtest-icb-conclusion-unit"> ポイント</span>
              </span>
              <span className="backtest-icb-conclusion-sub">1 銘柄あたり SPY を上回る幅</span>
            </div>
          </div>
        </section>

        {/* Phase 2.4 (handover v72): Methodology PDF download — Free 全開放、 LP 訴求と整合。
            ProTeaser の Premium 機能は「カスタム期間 PDF / 月次 breakdown PDF」 等の高機能版に差別化。 */}
        <div className="backtest-pdf-download">
          <a
            href="/api/backtest/methodology.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="backtest-pdf-button"
            aria-label="バックテスト methodology PDF をダウンロード"
          >
            <span aria-hidden="true">📄</span>
            <span>PDF レポートをダウンロード</span>
            <span className="backtest-pdf-button-meta">A4 1 page · 検証根拠 + methodology + 免責</span>
          </a>
        </div>

        {/* Phase 3 Sub-3: Premium 訴求 teaser (lock UI なし、 「更に見れる」 hint card)
            未契約者にのみ表示、 ログイン状態無関係 (LP 経由の未ログイン user も訴求)
            Phase 2.4 後: 基本 PDF は Free 開放、 Premium 訴求はカスタム期間 PDF / 月次 breakdown 等に差別化。 */}
        {showPremiumTeaser && (
          <ProTeaser
            title="銘柄別 α 貢献度と高度分析"
            description="バックテストの全 trade を 1 銘柄ごとに分解、 期間カスタマイズ、 forex 込み実 P/L。 投資判断の根拠を更に深掘りできる Pro 機能群。"
            features={[
              '銘柄別 α 貢献度 chart (どの銘柄が α を生んだか可視化)',
              '期間カスタマイズ (任意日付範囲 + 10 年遡及)',
              '月次 / 四半期 / セクター別 breakdown chart',
              'CSV / Excel エクスポート (詳細データ)',
              '為替込み実 P/L (forex β を含めた円建てリターン)',
            ]}
            onUpgrade={handlePremiumUpgrade}
          />
        )}

        {/* Disclaimer */}
        <section className="backtest-disclaimer">
          <p>
            <strong>過去の実績は将来のリターンを保証しません</strong>。 本機能は教育目的の参考情報であり、 投資勧誘ではありません。
            個別銘柄の volatility は大きく、 適切な分散投資をご検討ください。
          </p>
          <ul className="backtest-disclaimer-points">
            <li><strong>完了取引 {!loading && completedTrades != null ? `${completedTrades} 件` : '—'} は preliminary</strong> — 統計的に有意となる n≥30 未達 (検証イベント {!loading && eventCount != null ? `${eventCount} 件` : '—'} のうち買-売 両方で取引が成立した件数)、 検証範囲拡大予定</li>
            <li><strong>Survivorship bias</strong>: S&amp;P 500 現存銘柄のみで検証、 +5〜10 ポイント過大評価の可能性</li>
            <li><strong>為替リスク</strong>: 円換算は USD/JPY 150 円固定、 実際の円建てリターンは為替変動で乖離します</li>
            <li><strong>取引コスト・税金未控除</strong>: 米国株配当 10% 源泉 + 日本 20.315% (二重課税控除あり)</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
