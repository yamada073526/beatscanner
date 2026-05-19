import { Component, useState, useEffect, useMemo } from 'react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot, ReferenceArea,
} from 'recharts';
import { LineChart as LineChartIcon, CandlestickChart as CandlestickChartIcon } from 'lucide-react';
import { fetchPriceHistory, fetchTechnical } from '../api.js';
import Chip from './ui/Chip.jsx';

// v86 chart hybrid Sprint 2: localStorage key for 折れ線/candle toggle persist
const CHART_STYLE_KEY = 'pane3_chart_style_v1';

// v86 chart hybrid Sprint 2: Recharts custom shape for candlestick
// props: x, y, width, height (bar bbox)、 payload (data point with open/high/low/close)
// 緑 = close >= open (上昇)、 赤 = close < open (下落) — 投資業界色ルール遵守
// Number.isFinite guard で Chart Overlay Safety 4 層防御継承
function CandleShape(props) {
  const { x, y, width, height, payload } = props;
  if (!payload || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  const { open, high, low, close } = payload;
  if (![open, high, low, close].every((v) => Number.isFinite(v))) return null;
  // y / height は [low, high] range (Bar が yAxis range で計算済)
  // 計算: high → y、 low → y + height
  // open / close の Y 座標は線形補間で求める
  const range = high - low;
  if (range <= 0) {
    // doji 等の極端値: 1px の横線として描画
    return <line x1={x} x2={x + width} y1={y + height / 2} y2={y + height / 2} stroke="var(--text-muted)" strokeWidth={1} />;
  }
  const yHigh = y;
  const yLow = y + height;
  const yOpen = yHigh + ((high - open) / range) * height;
  const yClose = yHigh + ((high - close) / range) * height;
  const isUp = close >= open;
  const color = isUp ? 'var(--color-gain)' : 'var(--color-loss)';
  const bodyTop = Math.min(yOpen, yClose);
  const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
  const cx = x + width / 2;
  const bodyWidth = Math.max(2, width * 0.7);
  const bodyX = cx - bodyWidth / 2;
  return (
    <g>
      {/* wick: low → high の縦線 */}
      <line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={color} strokeWidth={1} />
      {/* body: open → close の rectangle */}
      <rect
        x={bodyX}
        y={bodyTop}
        width={bodyWidth}
        height={bodyHeight}
        fill={isUp ? color : color}
        fillOpacity={isUp ? 0.85 : 1}
        stroke={color}
        strokeWidth={1}
      />
    </g>
  );
}

// SMA overlay 色 (design_system.md §1-A2 で token 登録済、 ALLOWED-HEX whitelist 適合)
const SMA_50_COLOR  = '#f59e0b'; // amber (短期 trend)
const SMA_200_COLOR = '#a78bfa'; // purple (長期 trend、 ファンダ協調指標 #1)
// Cup overlay 色: v76 dogfood で price line cyan と同化 → UI/UX subagent verdict で neutral slate に変更。
// 哲学的整合: cup は「形成中 = neutral / 未確定」、 投資業界色ルール (緑=上昇/赤=下落/amber=警告/cyan=ブランド)
// のどれにも属さない観察対象 → 彩色 hue を持たない。 breakout 確定時に green ReferenceDot が前面で対比演出。
const CUP_COLOR     = 'rgba(148, 163, 184, 0.85)'; // slate-400、 両モード neutral
const BREAKOUT_COLOR = '#22c55e'; // green-500 (breakout confirmed marker、 「形成中 → 確定」 ドラマ強化)

// 2 段保護 (handover v75 真っ白事故 fix): 万一 Recharts overlay で crash しても
// chart 部分だけ blank で Pane 3 全体は保護。 親 (JudgmentDetail) は影響受けない。
class StockChartErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error('[StockPriceChart] chart render error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <section className="panel-card rounded-2xl p-6 shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h3 className="section-heading" style={{ marginBottom: 12 }}>株価チャート</h3>
          <div className="flex h-64 items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
            チャートの表示に失敗しました。 ページを再読み込みしてください。
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}

const PERIODS = [
  { label: '1ヶ月', value: '1m' },
  { label: '3ヶ月', value: '3m' },
  { label: '1年',   value: '1y' },
  { label: '3年',   value: '3y' },
];

// Recharts は CSS var を直接受けないため固定 RGB. 両モードで視認できる中庸値.
const VERDICT_COLOR = {
  beat:    'rgb(34, 197, 94)',     // green-500 — 両モードでバランス
  miss:    'rgb(248, 113, 113)',   // red-400 — 両モードでバランス
  inline:  'rgba(148, 163, 184, 0.85)', // slate-400 alpha
  unknown: 'rgba(148, 163, 184, 0.6)',
};

// チャート軸・グリッド・ツールチップ共通色 (両モード対応の neutral)
const CHART_GRID   = 'rgba(148, 163, 184, 0.25)';
const CHART_AXIS   = 'rgba(148, 163, 184, 0.7)';
const CHART_CURSOR = 'rgba(148, 163, 184, 0.5)';
const CHART_PRICE  = 'rgb(56, 189, 248)'; // brand cyan (sky-400)

const VERDICT_LABEL = {
  beat:    '▲ Beat',
  miss:    '▼ Miss',
  inline:  '▬ In-line',
  unknown: '— 不明',
};

/** Return nearest price date within ±4 days; null if not found. */
function nearestDate(target, dateSet) {
  if (!target) return null;
  const base = new Date(target + 'T00:00:00Z');
  if (isNaN(base.getTime())) return null;
  if (dateSet.has(target)) return target;
  for (let i = 1; i <= 4; i++) {
    for (const delta of [i, -i]) {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + delta);
      const s = d.toISOString().slice(0, 10);
      if (dateSet.has(s)) return s;
    }
  }
  return null;
}

/** Short quarter label from reporting date string (approximation). */
function quarterLabel(dateStr) {
  const y = dateStr.slice(0, 4);
  const m = parseInt(dateStr.slice(5, 7), 10);
  const q = m <= 3 ? 'Q1' : m <= 6 ? 'Q2' : m <= 9 ? 'Q3' : 'Q4';
  return `FY${y} ${q}`;
}

/** Marker label shown above the reference line. */
function surpriseLabel(e) {
  const sym = e.verdict === 'beat' ? '▲' : e.verdict === 'miss' ? '▼' : '▬';
  if (e.surprise_pct === null || e.surprise_pct === undefined) return sym;
  const sign = e.surprise_pct > 0 ? '+' : '';
  return `${sym} ${sign}${e.surprise_pct}%`;
}

// ---------------------------------------------------------------------------
// Custom tooltip — shows earnings details when hovering on an earnings date
// ---------------------------------------------------------------------------
function EarningsTooltip({ active, payload, label, earningsMap }) {
  if (!active || !payload?.length) return null;

  const price = payload.find((p) => p.dataKey === 'close')?.value;
  const e = earningsMap?.[label];

  return (
    <div className="min-w-[180px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-lg">
      <p className="mb-1 font-medium text-slate-500">{label}</p>

      {price != null && (
        <p style={{ color: 'var(--text-secondary)' }}>
          終値:{' '}
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            ${Number(price).toFixed(2)}
          </span>
        </p>
      )}

      {e && (
        <div
          className="mt-2 border-t pt-2"
          style={{
            borderColor:
              e.verdict === 'beat' ? 'rgba(34, 197, 94, 0.35)'
              : e.verdict === 'miss' ? 'rgba(248, 113, 113, 0.35)'
              : 'rgba(245, 158, 11, 0.35)',
          }}
        >
          {/* Verdict badge */}
          <p
            className="font-bold"
            style={{ color: VERDICT_COLOR[e.verdict] ?? VERDICT_COLOR.unknown }}
          >
            {VERDICT_LABEL[e.verdict] ?? '—'}
            {e.surprise_pct !== null && e.surprise_pct !== undefined && (
              <span className="ml-1">
                {e.surprise_pct > 0 ? '+' : ''}{e.surprise_pct}%
              </span>
            )}
          </p>

          {/* EPS line */}
          {e.epsActual != null && (
            <p className="mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {quarterLabel(e.date)} EPS:{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                ${e.epsActual.toFixed(2)}
              </strong>
              {e.epsEstimated != null && (
                <span style={{ color: 'var(--text-muted)' }}>（予想: ${e.epsEstimated.toFixed(2)}）</span>
              )}
            </p>
          )}

          {/* verdict_reason — unknown 時のみ理由テキストを追記 */}
          {e.verdict === 'unknown' && e.verdict_reason && (
            <p className="mt-1 text-[11px] italic" style={{ color: 'var(--text-muted)' }}>
              {e.verdict_reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StockPriceChartInner({ ticker, isPremiumUser = false }) {
  const [period, setPeriod] = useState('1y');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  // SMA overlay state (handover v75 Phase 1 Session 1 safer 再追加)
  const [technical, setTechnical] = useState(null);
  // v86 chart hybrid Sprint 2: 折れ線 ⇄ candle toggle (localStorage persist)
  // 'line' (default、 UI/UX 観点 Aman 級世界観) / 'candle' (玄人 user 向け Webull 戦略)
  const [chartStyle, setChartStyle] = useState(() => {
    try {
      const saved = localStorage.getItem(CHART_STYLE_KEY);
      return saved === 'candle' ? 'candle' : 'line';
    } catch {
      return 'line';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(CHART_STYLE_KEY, chartStyle);
    } catch { /* localStorage 不可な環境 (Safari private 等) では silent */ }
  }, [chartStyle]);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    fetchPriceHistory(ticker, period)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker, period]);

  // Technical overlays fetch (period 非依存、 ticker 単位)。
  // overlay 1 件以上 OR Cup-Handle detected の時のみ setTechnical
  // (handover v75 真っ白事故 fix: 全 null Line が Recharts で crash した可能性、
  //  ここで早期 filter して conditional render 側でも 2 段防御)。
  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setTechnical(null);  // ticker 切替時に古い state をクリア
    fetchTechnical(ticker, 'cup_handle,sma_50,sma_200,rs,dma_cross')
      .then((t) => {
        if (cancelled) return;
        const hasOverlay = t && Array.isArray(t.overlays) && t.overlays.length > 0;
        const hasCupDetected = t?.patterns?.cup_handle?.detected === true;
        const hasRsValue = typeof t?.patterns?.rs?.rs_vs_spy_pct === 'number';
        const hasDmaDetected = t?.patterns?.dma_cross?.detected === true;
        if (hasOverlay || hasCupDetected || hasRsValue || hasDmaDetected) {
          setTechnical(t);
        }
      })
      .catch(() => { /* graceful: technical 抜きで chart 表示 */ });
    return () => { cancelled = true; };
  }, [ticker]);

  // SMA date → value lookup (technical が null なら全 empty)
  const smaMap = useMemo(() => {
    const m = { sma_50: {}, sma_200: {} };
    if (!technical?.overlays) return m;
    for (const ov of technical.overlays) {
      if ((ov.key === 'sma_50' || ov.key === 'sma_200') && Array.isArray(ov.data)) {
        for (const p of ov.data) {
          if (p && p.time != null && typeof p.value === 'number') {
            m[ov.key][p.time] = p.value;
          }
        }
      }
    }
    return m;
  }, [technical]);

  const hasSma50 = useMemo(() => Object.keys(smaMap.sma_50).length > 0, [smaMap]);
  const hasSma200 = useMemo(() => Object.keys(smaMap.sma_200).length > 0, [smaMap]);

  // Cup-with-Handle pattern 抽出 + 4 層防御 (handover v75 真っ白事故 SSOT 継承)
  // 1) ErrorBoundary wrap (default export 側)、 2) conditional render (hasCup gate)、
  // 3) Number.isFinite guard、 4) isAnimationActive={false}
  const cupHandle = technical?.patterns?.cup_handle || null;
  const hasCup = useMemo(() => {
    if (!cupHandle?.detected) return false;
    if (!cupHandle.cup || !cupHandle.pivot) return false;
    const pivotPrice = cupHandle.pivot.price;
    const leftRim = cupHandle.cup.left_rim_price;
    const cupLow = cupHandle.cup.cup_low_price;
    const rightRim = cupHandle.cup.right_rim_price;
    return [pivotPrice, leftRim, cupLow, rightRim].every(
      (v) => typeof v === 'number' && Number.isFinite(v)
    );
  }, [cupHandle]);

  // Cup の 3-4 点 (left rim → cup low → right rim [→ handle low]) を date → value lookup map で保持。
  // chartData merge 時に cup_value field を該当 date のみ埋め、 connectNulls で結ぶ。
  // handover v76 dogfood 教訓: 別 data array (data={cupShape}) を Line に渡すと
  // ComposedChart の x 軸 domain が overlay の date 範囲に絞られて、 price line / SMA line が消える。
  // v86 R2 Cup polish: handle.low_date が backend で返っていれば 4 点目として追加
  const cupValueMap = useMemo(() => {
    if (!hasCup) return null;
    const map = {
      [cupHandle.cup.left_rim_date]:  cupHandle.cup.left_rim_price,
      [cupHandle.cup.cup_low_date]:   cupHandle.cup.cup_low_price,
      [cupHandle.cup.right_rim_date]: cupHandle.cup.right_rim_price,
    };
    if (cupHandle.handle?.low_date && Number.isFinite(cupHandle.handle?.low_price)) {
      map[cupHandle.handle.low_date] = cupHandle.handle.low_price;
    }
    return map;
  }, [hasCup, cupHandle]);

  // v86 R2 Cup polish: ReferenceArea / ReferenceDot 用に派生 props を抽出 (Number.isFinite guard 込)
  const cupArea = useMemo(() => {
    if (!hasCup) return null;
    const { left_rim_date, right_rim_date, cup_low_price } = cupHandle.cup;
    const pivotPrice = cupHandle.pivot.price;
    if (!left_rim_date || !right_rim_date) return null;
    if (![cup_low_price, pivotPrice].every((v) => Number.isFinite(v))) return null;
    return { x1: left_rim_date, x2: right_rim_date, y1: cup_low_price, y2: pivotPrice };
  }, [hasCup, cupHandle]);

  const handleArea = useMemo(() => {
    if (!hasCup || !cupHandle.handle) return null;
    const { right_rim_date } = cupHandle.cup;
    const { low_date, low_price } = cupHandle.handle;
    const pivotPrice = cupHandle.pivot.price;
    if (!right_rim_date || !low_date) return null;
    if (![low_price, pivotPrice].every((v) => Number.isFinite(v))) return null;
    // 取っ手範囲: right_rim_date → 最後の close date (data の右端)。 handle.low_date は area 内に含まれる。
    const lastDate = data?.prices?.length ? data.prices[data.prices.length - 1].date : low_date;
    return { x1: right_rim_date, x2: lastDate, y1: low_price, y2: pivotPrice };
  }, [hasCup, cupHandle, data]);

  // v86 R2 Cup polish: Pivot ラベル + 現在価格との残距離 (金融アナリスト 2-B)
  // user dogfood 「右端見切れ」 fix: 「・ あと」 削減で string を短縮、 ASCII のみで描画幅を抑制
  // 上昇余地 (need-to-rise): "Pivot $XXX.XX (+X.X%)"  (現在価格が pivot 未満、 形成中の典型)
  // 既に超過: "Pivot $XXX.XX (達)"  (pivot 突破済、 breakout 検知中 or 直後)
  const pivotLabelText = useMemo(() => {
    if (!hasCup) return '';
    const pivot = cupHandle.pivot.price;
    const lastClose = data?.prices?.length ? Number(data.prices[data.prices.length - 1].close) : null;
    const remainingPct = Number.isFinite(lastClose) && lastClose > 0
      ? ((pivot - lastClose) / lastClose) * 100
      : null;
    const remainingStr = Number.isFinite(remainingPct)
      ? (remainingPct >= 0 ? ` (+${remainingPct.toFixed(1)}%)` : ' (達)')
      : '';
    return `Pivot $${pivot.toFixed(2)}${remainingStr}`;
  }, [hasCup, cupHandle, data]);

  // chip tone は market_context と state の 2 軸直交で決定 (6 体合議 Web 設計案):
  //   market_weak → muted (市場待機)
  //   breakout_confirmed → gain (緑)
  //   breakout_pending → warning (amber) + pulse keyframe
  //   formation → muted (cyan border)
  const cupChipTone = useMemo(() => {
    if (!hasCup) return 'muted';
    if (cupHandle.state === 'formation_market_weak') return 'muted';
    if (cupHandle.state === 'breakout_confirmed') return 'gain';
    if (cupHandle.state === 'breakout_pending') return 'warning';
    return 'muted';
  }, [hasCup, cupHandle]);

  const cupChipLabel = useMemo(() => {
    if (!hasCup) return '';
    switch (cupHandle.state) {
      case 'breakout_confirmed': return 'breakout 確定';
      case 'breakout_pending':   return 'breakout 待ち';
      case 'formation_market_weak': return '形成中 ・市場待機';
      case 'formation':
      default:                   return '形成中';
    }
  }, [hasCup, cupHandle]);

  // Session 3: RS (vs SPY 6m ratio + 自己 252 日 percentile)
  const rsData = technical?.patterns?.rs || null;
  const hasRs = useMemo(() => {
    if (!rsData) return false;
    const v = rsData.rs_vs_spy_pct;
    return typeof v === 'number' && Number.isFinite(v);
  }, [rsData]);
  // RS tone: extreme (percentile ≥ 95 / ≤ 5) = elite (gold) / 上位 (≥75) = gain / 下位 (≤25) = loss / 中位 = muted
  // handover v79 (2026-05-17、 UI/UX + マーケ 2 体 verdict): elite tone で希少性視覚化
  const rsIsElite = useMemo(() => {
    if (!hasRs) return false;
    const pct = rsData.self_percentile;
    if (typeof pct !== 'number') return false;
    return pct >= 95 || pct <= 5;
  }, [hasRs, rsData]);
  const rsTone = useMemo(() => {
    if (!hasRs) return 'muted';
    const pct = rsData.self_percentile;
    if (typeof pct !== 'number') return 'muted';
    if (rsIsElite) return 'elite';
    if (pct >= 75) return 'gain';
    if (pct <= 25) return 'loss';
    return 'muted';
  }, [hasRs, rsData, rsIsElite]);

  // Session 3: DMA Cross (golden cross 直近 60 日内)
  const dmaCross = technical?.patterns?.dma_cross || null;
  const hasDmaCross = useMemo(() => {
    if (!dmaCross?.detected) return false;
    if (dmaCross.kind !== 'golden') return false;
    return typeof dmaCross.days_ago === 'number' && Number.isFinite(dmaCross.days_ago);
  }, [dmaCross]);
  // handover v79: fresh signal hook = ≤ 14 日内のクロスは gain tone 濃化 (data-fresh 属性)
  const dmaIsFresh = useMemo(() => {
    if (!hasDmaCross) return false;
    return dmaCross.days_ago <= 14;
  }, [hasDmaCross, dmaCross]);

  // Pro tier gate (handover v78 Session 4): Supabase subscription.tier === 'premium' で本判定。
  // 6 体合議 verdict (Session 3 → 4): Cup-Handle は Premium tier (¥1,800/月) 限定、 DMA/RS は Free 表示。
  // 既存 v60 で Stripe + webhook + 4 SKU + Customer Portal + 30s polling 全て稼働中、 useSubscription
  // で subscription.tier を取れる (Pro = ¥980、 Premium = ¥1,800)。
  // dev override: import.meta.env.DEV のみ localStorage('bs_pro')='1' で強制 unlock (production bundle では
  // tree-shake で消える、 dogfood 用 + Stripe test card 不要)。
  const isPremiumUnlocked = useMemo(() => {
    if (isPremiumUser) return true;
    if (import.meta.env?.DEV && typeof window !== 'undefined') {
      try {
        return window.localStorage.getItem('bs_pro') === '1';
      } catch {
        return false;
      }
    }
    return false;
  }, [isPremiumUser, ticker]);
  // Cup-Handle は Premium 限定 (DMA/RS は Free 表示で送客)。 chip 自体は表示するが overlay/詳細は blur。
  const cupRequiresPro = hasCup && !isPremiumUnlocked;

  // SMA/Cup がある時のみ price データに merge (何もなければ元 data そのまま = 旧挙動と同じ)
  const chartData = useMemo(() => {
    if (!data?.prices) return [];
    if (!hasSma50 && !hasSma200 && !hasCup) return data.prices;
    return data.prices.map((p) => {
      const entry = { ...p };
      if (hasSma50) {
        const v50 = smaMap.sma_50[p.date];
        if (typeof v50 === 'number') entry.sma_50 = v50;
      }
      if (hasSma200) {
        const v200 = smaMap.sma_200[p.date];
        if (typeof v200 === 'number') entry.sma_200 = v200;
      }
      if (hasCup && cupValueMap) {
        const vc = cupValueMap[p.date];
        if (typeof vc === 'number' && Number.isFinite(vc)) entry.cup_value = vc;
      }
      return entry;
    });
  }, [data, smaMap, hasSma50, hasSma200, hasCup, cupValueMap]);

  const dateSet = useMemo(
    () => new Set((data?.prices ?? []).map((p) => p.date)),
    [data],
  );

  // price-history の earnings を使用（AV+FMP で期間分をカバー済み）
  const earnings = useMemo(() => {
    return (data?.earnings ?? [])
      .map((e) => ({ ...e, chartDate: nearestDate(e.date, dateSet) }))
      .filter((e) => e.chartDate);
  }, [data, dateSet]);

  // Index by chartDate for O(1) lookup in the tooltip
  const earningsMap = useMemo(() => {
    const m = {};
    earnings.forEach((e) => { m[e.chartDate] = e; });
    return m;
  }, [earnings]);

  if (!ticker) return null;

  return (
    <section className="panel-card rounded-2xl p-6 shadow-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="section-heading" style={{ marginBottom: 0 }}>株価チャート</h3>
          {/* Cup-Handle chip (Session 2 着地): Pro tier 限定機能 (Session 3 で blur 対象)。
              free user にも chip 自体は表示 → 「価値を見せて Pro へ」 (マーケター verdict)。
              click で Coming Soon modal (Stripe 連動は Session 4 で実装予定)。 */}
          {hasCup && (
            <Chip
              size="xs"
              variant="display"
              tone={cupChipTone}
              data-cup-state={cupHandle.state}
              title={
                cupRequiresPro
                  ? `取っ手付きカップ (Cup-with-Handle)\n${cupChipLabel}\n深さ ${cupHandle.cup.depth_pct}% / ${cupHandle.cup.weeks}週\n［Premium で全データ解放］`
                  : `取っ手付きカップ (Cup-with-Handle)\n${cupChipLabel}\n深さ ${cupHandle.cup.depth_pct}% / ${cupHandle.cup.weeks}週\nPivot $${cupHandle.pivot.price.toFixed(2)}`
              }
              onClick={cupRequiresPro ? () => {
                window.alert('「取っ手付きカップ」 形状検出は Premium 限定機能です。\n\n・ファンダ 5 条件 PASS × Cup-Handle 形成 の AND スキャナー\n・全 500-1000 銘柄の nightly スキャン\n・形成 → breakout 確定の push 通知\n\nPremium tier (¥1,800/月) で全データ解放されます。');
              } : undefined}
            >
              ☕ {cupChipLabel}{cupRequiresPro ? ' 🔒' : ''}
            </Chip>
          )}
          {/* Session 3: DMA Cross chip (golden cross 直近 60 日内検出時のみ、 Free 表示)
              handover v79: fresh signal (≤14 日) なら data-fresh で tone gain 濃化 */}
          {hasDmaCross && (
            <Chip
              size="xs"
              variant="display"
              tone="gain"
              data-fresh={dmaIsFresh ? 'true' : undefined}
              title={`50DMA × 200DMA ゴールデンクロス成立 (${dmaCross.cross_date}、 ${dmaCross.days_ago} 日前)`}
            >
              ✦ ゴールデンクロス {dmaCross.days_ago}日前
            </Chip>
          )}
          {/* Session 3: RS chip (vs SPY 6 ヶ月 + 自己 252 日 percentile、 Free 表示)
              handover v79: extreme value (percentile ≥95 / ≤5) は elite tone (gold) + percentile 先頭 strong */}
          {hasRs && (
            <Chip
              size="xs"
              variant="display"
              tone={rsTone}
              title={`相対強度 (Relative Strength): 過去 6 ヶ月の対 SPY リターン差${rsData.ranking_label ? `、 自己 1 年比 ${rsData.ranking_label}` : ''}`}
            >
              {rsIsElite && rsData.ranking_label ? (
                <>
                  <strong>{rsData.ranking_label}</strong>
                  <span style={{ marginLeft: 4, opacity: 0.75, fontSize: '0.9em' }}>
                    · RS {rsData.rs_vs_spy_pct > 0 ? '+' : ''}{rsData.rs_vs_spy_pct}%
                  </span>
                </>
              ) : (
                <>
                  RS {rsData.rs_vs_spy_pct > 0 ? '+' : ''}{rsData.rs_vs_spy_pct}%
                  {rsData.ranking_label && (
                    <span style={{ marginLeft: 4, opacity: 0.75, fontSize: '0.85em' }}>
                      {rsData.ranking_label}
                    </span>
                  )}
                </>
              )}
            </Chip>
          )}
        </div>
        <div className="flex gap-1 items-center flex-wrap">
          {/* v86 chart hybrid Sprint 2 + R2: 折れ線 / candle toggle (icon 化、 TradingView 流)
              - default: 折れ線 (Aman 級 UI、 リテール初見 2 秒理解)
              - candle: 玄人 user 向け (localStorage persist)
              - icon ベース: text label は読解負荷を生む (user feedback)、 lucide-react で統一
              - aria-label / title でアクセシビリティ担保
              - Pro lock は v2 で追加予定 */}
          <div
            role="group"
            aria-label="チャート形式"
            style={{
              display: 'inline-flex',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm, 6px)',
              overflow: 'hidden',
              marginRight: 8,
            }}
          >
            <button
              type="button"
              onClick={() => setChartStyle('line')}
              aria-pressed={chartStyle === 'line'}
              aria-label="折れ線"
              title="折れ線"
              style={{
                appearance: 'none',
                border: 'none',
                background: chartStyle === 'line' ? 'var(--color-accent)' : 'transparent',
                color: chartStyle === 'line' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                padding: '5px 10px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                lineHeight: 0,
              }}
            >
              <LineChartIcon size={14} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setChartStyle('candle')}
              aria-pressed={chartStyle === 'candle'}
              aria-label="ローソク足"
              title="ローソク足"
              style={{
                appearance: 'none',
                border: 'none',
                background: chartStyle === 'candle' ? 'var(--color-accent)' : 'transparent',
                color: chartStyle === 'candle' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                padding: '5px 10px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                lineHeight: 0,
              }}
            >
              <CandlestickChartIcon size={14} strokeWidth={1.75} />
            </button>
          </div>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`chart-period-btn${period === p.value ? ' active' : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div
          className="flex h-64 items-center justify-center text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          読み込み中...
        </div>
      )}

      {/* Chart */}
      {!loading && data && data.prices.length > 0 && (
        <>
          <div
            className="h-72 relative"
            data-cup-locked={cupRequiresPro ? 'true' : undefined}
          >
            {/* Pro tier teaser: Cup-Handle 検出済 + Free user 時に chart 全体を軽く blur + CTA overlay。
                pointer-events:none で chart の hover を殺さない (4 層防御継承)。
                blur 強度 4px = 「形だけ見える、 詳細は不明」 演出 (8px は強すぎ、 業界標準 4-6px)。 */}
            {cupRequiresPro && (
              <div
                aria-hidden="true"
                className="absolute inset-0 z-10 flex items-end justify-center pointer-events-none"
                style={{ paddingBottom: 12 }}
              >
                <div
                  className="rounded-full px-3 py-1 text-[11px] font-medium"
                  style={{
                    background: 'rgba(15, 23, 42, 0.72)',
                    color: 'rgb(241, 245, 249)',
                    border: '1px solid rgba(56, 189, 248, 0.45)',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  🔒 Cup-Handle overlay は Premium で全データ解放
                </div>
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 36, right: 120, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => d.slice(0, 7)}
                  interval="preserveStartEnd"
                  stroke={CHART_AXIS}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  stroke={CHART_AXIS}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `$${v}`}
                  width={58}
                />

                {/* Custom tooltip with earnings hover info */}
                <Tooltip
                  content={<EarningsTooltip earningsMap={earningsMap} />}
                  cursor={{ stroke: CHART_CURSOR, strokeWidth: 1, strokeDasharray: '4 2' }}
                />

                {/* SMA 200 (長期 trend、 ファンダ協調指標 #1、 conditional render で初期 mount 時の crash 回避) */}
                {hasSma200 && (
                  <Line
                    key="sma_200"
                    type="monotone"
                    dataKey="sma_200"
                    stroke={SMA_200_COLOR}
                    strokeWidth={1}
                    strokeOpacity={0.7}
                    dot={false}
                    activeDot={false}
                    connectNulls
                    name="SMA 200"
                    isAnimationActive={false}
                  />
                )}
                {/* SMA 50 (短期 trend) */}
                {hasSma50 && (
                  <Line
                    key="sma_50"
                    type="monotone"
                    dataKey="sma_50"
                    stroke={SMA_50_COLOR}
                    strokeWidth={1}
                    strokeOpacity={0.7}
                    dot={false}
                    activeDot={false}
                    connectNulls
                    name="SMA 50"
                    isAnimationActive={false}
                  />
                )}
                {/* Price 表示: chartStyle === 'line' → Line / 'candle' → Bar + custom shape
                    v86 chart hybrid Sprint 2 (Webull 戦略、 デフォルト折れ線維持) */}
                {chartStyle === 'line' ? (
                  <Line
                    type="monotone"
                    dataKey="close"
                    stroke={CHART_PRICE}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: CHART_PRICE }}
                    name="終値"
                  />
                ) : (
                  <Bar
                    dataKey={(entry) => {
                      // Number.isFinite guard (Chart Overlay Safety 4 層防御継承)
                      const lo = Number(entry?.low);
                      const hi = Number(entry?.high);
                      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 0];
                      return [lo, hi];
                    }}
                    shape={<CandleShape />}
                    isAnimationActive={false}
                    name="ローソク足"
                  />
                )}

                {/* Cup-with-Handle overlay (取っ手付きカップ、 v86 R2 polish):
                    2 体合議 (金融アナリスト + UI/UX デザイナー、 2026-05-20):
                    - ReferenceArea で cup 期間を slate area fill (面性、 highlighter idiom)
                    - 取っ手期間に amber area fill (金融重点情報: handle = pattern 心臓部)
                    - Pivot ReferenceLine: solid 1.25px + 多段ラベル「Pivot + あと X.X%」
                    - 既存 cup_value dashed line は薄く維持 (subtle 輪郭ガイド)
                    - handle_low ReferenceDot を 4 点目として追加 (金融 4-C)
                    - 4 層防御: ErrorBoundary / conditional render (hasCup) / Number.isFinite / isAnimationActive=false
                    - v76 教訓: data={cupShape} で別 array 渡すと x 軸 domain 縮む。 cup_value merge 方式維持。
                */}
                {/* MVP #1: ReferenceArea で cup 期間を slate area fill (主役、 highlighter 効果) */}
                {hasCup && !cupRequiresPro && cupArea && (
                  <ReferenceArea
                    x1={cupArea.x1}
                    x2={cupArea.x2}
                    y1={cupArea.y1}
                    y2={cupArea.y2}
                    fill={CUP_COLOR}
                    fillOpacity={cupHandle.state === 'formation_market_weak' ? 0.06 : 0.10}
                    stroke="none"
                    ifOverflow="extendDomain"
                    isFront={false}
                  />
                )}
                {/* MVP #4: 取っ手 (handle) 期間を amber area fill で 2 段強調 (金融アナリスト 4-B) */}
                {hasCup && !cupRequiresPro && handleArea && (
                  <ReferenceArea
                    x1={handleArea.x1}
                    x2={handleArea.x2}
                    y1={handleArea.y1}
                    y2={handleArea.y2}
                    fill={SMA_50_COLOR}
                    fillOpacity={cupHandle.state === 'formation_market_weak' ? 0.05 : 0.08}
                    stroke="none"
                    ifOverflow="extendDomain"
                    isFront={false}
                  />
                )}
                {/* MVP #3: 既存 dashed line を薄く維持 (subtle 輪郭ガイド、 area との 2 層構造) */}
                {hasCup && !cupRequiresPro && (
                  <Line
                    key="cup_shape"
                    type="monotone"
                    dataKey="cup_value"
                    stroke={CUP_COLOR}
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    strokeOpacity={cupHandle.state === 'formation_market_weak' ? 0.35 : 0.55}
                    dot={{ r: 2.5, fill: CUP_COLOR, fillOpacity: 0.7 }}
                    activeDot={false}
                    connectNulls
                    name="取っ手付きカップ"
                    legendType="none"
                    isAnimationActive={false}
                  />
                )}
                {/* MVP #5: handle_low ReferenceDot (cup の 4 点目、 取っ手の底を視覚化) */}
                {hasCup && !cupRequiresPro && cupHandle.handle?.low_date && Number.isFinite(cupHandle.handle?.low_price) && (
                  <ReferenceDot
                    x={cupHandle.handle.low_date}
                    y={cupHandle.handle.low_price}
                    r={3}
                    fill={SMA_50_COLOR}
                    stroke={SMA_50_COLOR}
                    strokeWidth={1.5}
                    fillOpacity={0.85}
                    isFront
                    isAnimationActive={false}
                  />
                )}
                {/* MVP #2: Pivot ReferenceLine solid + 多段ラベル (金融アナリスト 2-B) */}
                {hasCup && !cupRequiresPro && (
                  <ReferenceLine
                    y={cupHandle.pivot.price}
                    stroke={CUP_COLOR}
                    strokeWidth={1.25}
                    strokeDasharray={cupHandle.state === 'breakout_confirmed' ? null : '6 3'}
                    strokeOpacity={cupHandle.state === 'formation_market_weak' ? 0.55 : 0.9}
                    label={{
                      value: pivotLabelText,
                      fill: CUP_COLOR,
                      fontSize: 10,
                      position: 'right',
                      offset: 4,
                    }}
                    ifOverflow="extendDomain"
                    isFront={false}
                  />
                )}
                {hasCup && !cupRequiresPro && cupHandle.state === 'breakout_confirmed' && cupHandle.breakout?.confirmed_date && (
                  <ReferenceDot
                    x={cupHandle.breakout.confirmed_date}
                    y={cupHandle.pivot.price}
                    r={6}
                    fill={BREAKOUT_COLOR}
                    stroke="#fff"
                    strokeWidth={2}
                    isFront
                    isAnimationActive={false}
                  />
                )}
                {/* Free user 用の cup overlay (blur 化、 形状は見えるが pivot 値や date は曖昧) */}
                {hasCup && cupRequiresPro && (
                  <Line
                    key="cup_shape_locked"
                    type="monotone"
                    dataKey="cup_value"
                    stroke={CUP_COLOR}
                    strokeWidth={3}
                    strokeDasharray="4 4"
                    strokeOpacity={0.3}
                    dot={false}
                    activeDot={false}
                    connectNulls
                    name="取っ手付きカップ (Premium)"
                    legendType="none"
                    isAnimationActive={false}
                  />
                )}

                {/* Earnings markers — dashed vertical line + label above */}
                {earnings.map((e) => {
                  const color = VERDICT_COLOR[e.verdict] ?? VERDICT_COLOR.unknown;
                  return (
                    <ReferenceLine
                      key={e.date}
                      x={e.chartDate}
                      stroke={color}
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      label={{
                        value: surpriseLabel(e),
                        fill: color,
                        fontSize: 10,
                        fontWeight: 'bold',
                        position: 'top',
                      }}
                      ifOverflow="extendDomain"
                    />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Legend — 2 行構造 (テクニカル / 決算判定) + 末尾 ⓘ tooltip 縮約
              handover v76 dogfood + UI/UX subagent verdict (Aman 級 シンプルかつリッチ + 5 原則 #1 読み手負担減)。
              Miller 認知 chunk 3-4 上限を尊重、 Bloomberg / Linear 流の group label prefix 構造。 */}
          {(hasSma50 || hasSma200 || hasCup || earnings.length > 0) && (
            <div className="mt-3 flex flex-col gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              {/* Row 1: テクニカル指標 (連続描画 line 系) */}
              {(hasSma50 || hasSma200 || hasCup) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-medium" style={{ color: 'var(--text-secondary)', minWidth: 64 }}>
                    テクニカル
                  </span>
                  {hasSma50 && (
                    <span className="flex items-center gap-1.5">
                      <span style={{ display: 'inline-block', width: 14, height: 2, background: SMA_50_COLOR, opacity: 0.7 }} />
                      SMA 50（短期）
                    </span>
                  )}
                  {hasSma200 && (
                    <span className="flex items-center gap-1.5">
                      <span style={{ display: 'inline-block', width: 14, height: 2, background: SMA_200_COLOR, opacity: 0.7 }} />
                      SMA 200（長期）
                    </span>
                  )}
                  {hasCup && !cupRequiresPro && (
                    <span className="flex items-center gap-1.5">
                      <span style={{ display: 'inline-block', width: 14, height: 0, borderTop: `2px dashed ${CUP_COLOR}` }} />
                      取っ手付きカップ（pivot ${cupHandle.pivot.price.toFixed(2)}）
                    </span>
                  )}
                  {hasCup && cupRequiresPro && (
                    <span className="flex items-center gap-1.5" style={{ opacity: 0.7 }}>
                      <span style={{ display: 'inline-block', width: 14, height: 0, borderTop: `2px dashed ${CUP_COLOR}`, opacity: 0.5 }} />
                      取っ手付きカップ 🔒 (Premium で pivot 価格解放)
                    </span>
                  )}
                </div>
              )}
              {/* Row 2: 決算判定 (離散 event marker) */}
              {earnings.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-medium" style={{ color: 'var(--text-secondary)', minWidth: 64 }}>
                    決算判定
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="font-bold" style={{ color: VERDICT_COLOR.beat }}>▲</span>
                    Beat（+3%超）
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="font-bold" style={{ color: VERDICT_COLOR.inline }}>▬</span>
                    In-line（±3%以内）
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="font-bold" style={{ color: VERDICT_COLOR.miss }}>▼</span>
                    Miss（−3%超）
                  </span>
                  <span
                    className="ml-auto cursor-help"
                    title="四半期 GAAP EPS vs アナリスト予想比較 / 決算日にホバーで詳細表示"
                    style={{ opacity: 0.7 }}
                  >
                    ⓘ
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!loading && data && data.prices.length === 0 && (
        <div
          className="flex h-64 items-center justify-center text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          株価データが見つかりません
        </div>
      )}
    </section>
  );
}

// default export: ErrorBoundary で wrap して、 chart 内部 crash 時も Pane 3 全体は保護
// props: { ticker: string, isPremiumUser?: boolean (handover v78 Session 4 で追加) }
export default function StockPriceChart(props) {
  return (
    <StockChartErrorBoundary>
      <StockPriceChartInner {...props} />
    </StockChartErrorBoundary>
  );
}
