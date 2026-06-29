/**
 * L3QualityFold — v6 IA: 品質・継続性 (§②) の fold 累進開示行
 *
 * @no-llm: backend 計算済値 (valuation-extras / quarterly-history / canslim rows) の静的整形専用。
 *          LLM API 呼び出し禁止。数値は全て Python 層が確定したもの、または backend 提供の actual 同士の
 *          単純算術 (op_cf_margin×100 / CFPS÷EPS) のみ。捏造数値・将来予測・断定は出さない。
 *
 * 正本 mockup pane3-full-v4.html §② (品質グループ + 継続性 strip):
 *   品質  : 営業CFマージン(8Q spark) / 粗利率(8Q spark) / ROE(値+水準chip) / OCF>純利益(8Q比率 spark)
 *   継続性: EPS YoY・売上YoY(§① EarningsGrowthSpark) + 末尾strip(EPS CAGR 3年 pillbox ほか)
 *   (会社概要・セグメント行は FundamentalsAccordion)
 *
 * Sprint 4b (本実装) で追加した build-out:
 *   Slice1: 営業CFマージン 8Q spark (op_cf_margin は ratio → ×100) / 粗利率 fold 新規 (gross_margin_pct 8Q + YoY pp chip)
 *   Slice2: ROE 水準 chip / EPS CAGR 3年 pillbox (canslim/rows 配線、判定タブ初配線)
 *   Slice3: OCF>純利益(会計品質) fold 新規 — CFPS÷EPS 比率 8Q spark + cfps_gt_eps verdict (backend 不要)
 *
 * §38-safe (景表法§5 / 金商法§38):
 *   - 評価語は閾値ベース静的 dict のみ (「良好」「拡大」「CF良好」等)。QuarterlyHistoryTable と同 idiom。
 *   - sparkline の bar 色は中立のブランド色 (accent) を基本、品質判定は別 chip (gain/loss/warning) で分離表示。
 *     → 「シアン=上昇」 の誤解を避ける (CLAUDE.md 投資業界の色ルール)。
 *   - 行動指示 (買い/売り) ・断定的将来予測・最上級は一切出さない。数値 + 中立品質ラベルのみ。
 *
 * Trust Cliff ガード:
 *   - 各値は Number.isFinite で compound check、欠落 (banks/REIT の sector guard 含む) は「—」fallback。
 *   - OCF>純利益 比率は EPS≤0 の四半期で定義できないため非表示 (捏造しない)。
 *   - quarterly-history / canslim 未取得の追加指標 (粗利率・OCF比率・EPS CAGR) は描画自体をスキップ
 *     (空の「—」fold を常設せず、データがある時だけ出す)。
 *
 * 発光系不触: bar / chip は CSS token のみ (var(--color-*) + color-mix)。tooltip は SparkBars 内 inline rgba。
 */
import { useEffect, useState } from 'react';
import AccordionSection from '../../../primitives/AccordionSection.jsx';
import SparkBars, { BarsTooltip } from '../../../../../components/SparkBars.jsx';
import { fetchQuarterlyHistory, fetchCanslimRows, fetchEarningsEvaluation } from '../../../../../api.js';

const TESTID = 'l3-quality-fold';

// ── §38-safe 品質ラベル (閾値ベース静的 dict) ──

// 営業CFマージン (TTM)。O'Neil/独自プロトコルは安定した本業の現金創出力を重視。理想帯 15–35%。
export function ocfMarginLabel(pct) {
  if (!Number.isFinite(pct)) return null;
  if (pct >= 35) return '高水準';
  if (pct >= 15) return '良好';
  if (pct >= 5) return '標準';
  return '低水準';
}

// 機関保有 QoQ 方向ラベル。13F 報告ベースの「過去事実」の方向記述のみ (§38)。
function ownershipTrendLabel(deltaPt) {
  if (!Number.isFinite(deltaPt)) return null;
  if (deltaPt >= 2) return '大きく増加';
  if (deltaPt >= 0.5) return '緩やかに増加';
  if (deltaPt > -0.5) return 'ほぼ横ばい';
  if (deltaPt > -2) return '緩やかに減少';
  return '大きく減少';
}

// ROE 水準ラベル (O'Neil 基準 17%)。事実の閾値判定のみ、方向(↑↓)は持たせない。
export function roeLevelLabel(roe) {
  if (!Number.isFinite(roe)) return null;
  if (roe >= 17) return { label: '高水準', tone: 'gain' };
  if (roe >= 10) return { label: '良好', tone: 'gain' };
  if (roe >= 0) return { label: '標準', tone: 'muted' };
  return { label: '低水準', tone: 'warning' };
}

// 粗利率 YoY (pp 差) → 方向 chip。拡大は優良サイン (mockup「+2.1pp YoY」緑)。
export function grossMarginYoyChip(pp) {
  if (!Number.isFinite(pp)) return null;
  const sign = pp > 0 ? '+' : '';
  let tone = 'muted';
  if (pp >= 0.5) tone = 'gain';
  else if (pp <= -0.5) tone = 'warning';
  return { label: `${sign}${pp.toFixed(1)}pp YoY`, tone };
}

// 8Q 系列の傾向 (最古→最新の有値で比較)。拡大基調 / 横ばい / 縮小傾向。
export function seriesTrendChip(series, { upLabel = '拡大基調 ↗', flatLabel = '横ばい →', downLabel = '縮小傾向 ↘', delta = 1 } = {}) {
  const finite = series.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return null;
  const diff = finite[finite.length - 1] - finite[0];
  if (diff >= delta) return { label: upLabel, tone: 'gain' };
  if (diff <= -delta) return { label: downLabel, tone: 'warning' };
  return { label: flatLabel, tone: 'muted' };
}

// EPS CAGR 3年 → dot 色 (継続性 pillbox)。KB 核心の高成長閾値 25%。
export function epsCagrDotTone(cagr) {
  if (!Number.isFinite(cagr)) return 'muted';
  if (cagr >= 10) return 'gain';
  if (cagr >= 0) return 'muted';
  return 'loss';
}

const num = (v, digits = 1) => (Number.isFinite(v) ? v.toFixed(digits) : null);

// quarterly-history の四半期ラベル (tooltip / 軸用)。
export function quarterLabel(q) {
  if (q?.fiscal_period) return String(q.fiscal_period);
  if (q?.date) return String(q.date).slice(0, 7);
  return '';
}

/**
 * quarterly-history (新しい順) から §② 品質 sparkline 系列 + 最新派生値を算出する純関数。
 * @no-llm: backend actual 同士の単純算術のみ (LLM 不使用)。テストで §38/Trust Cliff 挙動を固定。
 *
 * - op_cf_margin は ratio (0–1) で格納 → ×100 して % 表示 (QuarterlyHistoryTable と同スケール)。
 * - OCF÷純利益 = 営業CFPS ÷ EPS。EPS≤0 の四半期は比率が定義できないため null (捏造しない)。
 * - 系列は古→新 (株価チャートと同方向)、最新値は history[0] から取る。
 */
export function deriveQualityFromHistory(qh) {
  const hist = Array.isArray(qh) ? qh : [];
  const rev = [...hist].reverse(); // 古→新 (直近=右)
  const ratio = (q) =>
    (Number.isFinite(q?.cfps_actual) && Number.isFinite(q?.eps_actual) && q.eps_actual > 0)
      ? q.cfps_actual / q.eps_actual
      : null;
  const latest = hist[0] || {};
  return {
    qhLabels: rev.map(quarterLabel),
    ocfMarginSeries: rev.map((q) => (Number.isFinite(q?.op_cf_margin) ? q.op_cf_margin * 100 : null)),
    grossMarginSeries: rev.map((q) => (Number.isFinite(q?.gross_margin_pct) ? q.gross_margin_pct : null)),
    ocfNiSeries: rev.map(ratio),
    gmLatest: Number.isFinite(latest.gross_margin_pct) ? latest.gross_margin_pct : null,
    gmYoyPp: Number.isFinite(latest.gross_margin_yoy_pp) ? latest.gross_margin_yoy_pp : null,
    ocfNiLatest: ratio(latest),
    cfHealth: (latest.cfps_gt_eps === true || latest.cfps_gt_eps === false) ? latest.cfps_gt_eps : null,
  };
}

// ── ファンダメンタル5条件 (judgment.py:185-252 と 1:1)。UI ラベル化は frontend 静的 dict ──
// 名称は judgment.py の ConditionResult.name と厳密一致 (Trust Cliff 回避・事実)。
// ①⑤ は閾値型 / ②③④ は「3期連続増加」要件で構造的にネックになりやすい (実 pass率 ①66 ②10 ③9 ④23 ⑤73%)。
export const FIVE_CONDITIONS = [
  { key: 'cond1_passed', num: '①', short: 'CFマージン≥15%', full: '営業CFマージン ≥ 15%' },
  { key: 'cond2_passed', num: '②', short: 'EPS連続増', full: 'EPS 連続増加' },
  { key: 'cond3_passed', num: '③', short: 'CFPS連続増', full: 'CFPS 連続増加' },
  { key: 'cond4_passed', num: '④', short: '売上連続増', full: '売上高 連続増加' },
  { key: 'cond5_passed', num: '⑤', short: 'CFPS>EPS', full: 'CFPS > EPS（直近期）' },
];

/**
 * earnings-evaluation (period_end 降順 rows) から §② 継続性 signal の派生値を算出する純関数。
 * @no-llm: cond*_passed (boolean) / passed_count の「過去事実」整形のみ。将来予測・推奨なし (§38)。
 *
 * - 系列は古→新 (sparkline/heatmap は左=過去・右=直近、他 spark と同方向)。
 * - 安定クリア = window の 75%+ かつ ≥4Q で PASS / 継続ネック = 25%- かつ ≥4Q で PASS。
 *   厳格ではなく高/低しきい値にすることで「7/8 の鉄板条件」も拾い、過大主張は避ける (§38)。
 */
export function deriveEvalContinuity(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return null;
  const asc = [...list].reverse(); // 古→新
  const passedCountSeries = asc.map((r) => (Number.isFinite(r?.passed_count) ? r.passed_count : null));
  const periodLabels = asc.map((r) => (r?.period_end ? String(r.period_end).slice(0, 7) : ''));
  const latest = list[0] || {};
  const latestPassed = Number.isFinite(latest.passed_count) ? latest.passed_count : null;
  const conditions = FIVE_CONDITIONS.map((c) => {
    const cells = asc.map((r) => (typeof r?.[c.key] === 'boolean' ? r[c.key] : null));
    const finite = cells.filter((v) => v === true || v === false);
    const passes = finite.filter((v) => v === true).length;
    const rate = finite.length > 0 ? passes / finite.length : null;
    return {
      ...c,
      cells,
      passes,
      total: finite.length,
      rate,
      latest: typeof latest[c.key] === 'boolean' ? latest[c.key] : null,
    };
  });
  const enough = (c) => c.total >= 4;
  const stable = conditions.filter((c) => enough(c) && c.rate >= 0.75);
  const neck = conditions.filter((c) => enough(c) && c.rate <= 0.25);
  return { asc, passedCountSeries, periodLabels, latestPassed, conditions, stable, neck, quarters: asc.length };
}

const foldDetailStyle = {
  fontSize: 12.5,
  lineHeight: 1.6,
  color: 'var(--text-secondary)',
  display: 'grid',
  gap: 'var(--space-2, 8px)',
};
const citeStyle = { fontSize: 11, color: 'var(--text-muted)' };
const dashStyle = { color: 'var(--text-muted)', fontWeight: 400 };

// chip / dot の tone → semantic token (raw hex なし)。bg は color-mix で theme 連動。
const TONE_COLOR = {
  gain: 'var(--color-gain)',
  loss: 'var(--color-loss)',
  warning: 'var(--color-warning)',
  muted: 'var(--text-muted)',
  gold: 'var(--color-gold)',
};

// mockup .mc .chip 準拠の micro chip (自前 div だが §②/§① 近傍の inline chip idiom に統一、token 経由)。
function MiniChip({ tone = 'muted', children }) {
  const c = TONE_COLOR[tone] || TONE_COLOR.muted;
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        borderRadius: 999,
        padding: '2px 8px',
        color: c,
        background: `color-mix(in srgb, ${c} 15%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

// mockup .strip .pillbox 準拠 (継続性 capstone)。dot + label + 太字値 + 任意 tag。
function Pillbox({ label, value, tag, tagTone = 'muted', dotTone = 'gain' }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        fontSize: 11.5,
        color: 'var(--text-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 999,
        padding: '5px 12px',
        background: 'var(--bg-subtle)',
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: TONE_COLOR[dotTone] || TONE_COLOR.gain }} />
      <span>{label}</span>
      <b style={{ color: 'var(--text-primary)' }}>{value}</b>
      {tag && <span style={{ fontSize: 10, color: TONE_COLOR[tagTone] || TONE_COLOR.muted }}>{tag}</span>}
    </span>
  );
}

// fold 詳細内の sparkline ブロック (機関保有 trend と同レイアウト)。≥2 有値でのみ描画。
function FoldSparkline({ title, series, labels, color, valueFormatter }) {
  const finiteCount = series.filter((v) => Number.isFinite(v)).length;
  if (finiteCount < 2) return null;
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10.5,
          color: 'var(--text-muted)',
          marginBottom: 2,
        }}
      >
        <span>{title}（直近{finiteCount}Q）</span>
        <span>過去 → 直近</span>
      </div>
      <SparkBars data={series} color={color} labels={labels} valueFormatter={valueFormatter} height={48} floorPct={20} />
    </div>
  );
}

// 5条件 × 8Q ヒートマップ (fold 専用)。行=条件 / 列=四半期 (左=過去・右=直近)。
// 緑=充足・赤=未充足・灰=データ無 (投資業界色ルール準拠)。各セル ~22px で hover に余裕 (Fitts則)。
// 行間 hairline で「行=1指標」の読み (どの条件が鉄板/ネックか) を補助。各セル hover で portal tooltip
// (SparkBars と同 idiom・native title は親 overflow で出ない/遅いため置換)。ラベルは全文表示 (ellipsis 撤去)。
// §38-safe: 過去の機械的 PASS/FAIL を転記するだけ。評価語・将来予測なし。
function FiveCondHeatmap({ conditions, periodLabels = [] }) {
  const [tip, setTip] = useState(null);
  const cellCount = conditions[0]?.cells?.length || 0;
  if (cellCount < 1) return null;
  const LABEL_W = 112; // 最長ラベル「①CFマージン≥15%」(~91px) を切らずに収める
  const showTip = (cond, i, v, e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const status = v === true ? '充足' : v === false ? '未充足' : 'データ無';
    const period = periodLabels[i] ? ` · ${periodLabels[i]}` : '';
    setTip({
      label: `${cond.num}${cond.short}${period}`,
      value: status,
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top),
    });
  };
  const hideTip = () => setTip(null);
  const cell = (cond, v, i) => {
    let bg = 'var(--bg-subtle)';
    let bd = 'var(--border)';
    if (v === true) { bg = 'color-mix(in srgb, var(--color-gain) 78%, transparent)'; bd = 'var(--color-gain)'; }
    else if (v === false) { bg = 'color-mix(in srgb, var(--color-loss) 70%, transparent)'; bd = 'var(--color-loss)'; }
    return (
      <span
        key={`${cond.key}-${i}`}
        onMouseEnter={(e) => showTip(cond, i, v, e)}
        onMouseLeave={hideTip}
        style={{
          width: 22, height: 18, borderRadius: 4,
          background: bg, border: `1px solid color-mix(in srgb, ${bd} 45%, transparent)`,
          flex: '0 0 auto', cursor: 'default',
        }}
      />
    );
  };
  return (
    <div style={{ display: 'grid', gap: 0, overflowX: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-muted)', paddingLeft: LABEL_W + 4, marginBottom: 4 }}>
        <span>過去</span>
        <span>直近</span>
      </div>
      {conditions.map((c, ri) => (
        <div
          key={c.key}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0',
            borderTop: ri === 0 ? 'none' : '1px solid color-mix(in srgb, var(--border) 50%, transparent)',
          }}
        >
          <span style={{ width: LABEL_W, flex: '0 0 auto', fontSize: 10.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            {c.num}{c.short}
          </span>
          {c.cells.map((v, i) => cell(c, v, i))}
        </div>
      ))}
      {tip && <BarsTooltip tip={tip} />}
    </div>
  );
}

/**
 * @param {object} props
 * @param {object|null} props.valuationExtras - /api/valuation-extras の result
 *   (trailingPE / roe / ocfMarginPct / pegRatio / institutionalOwnership / sources)
 * @param {string} [props.ticker] - 8Q sparkline / canslim 配線用 (quarterly-history + canslim/rows を取得)
 */
export default function L3QualityFold({ valuationExtras, ticker }) {
  const ve = valuationExtras || {};
  const sources = ve.sources || {};

  // ── 8Q 履歴 (quarterly-history) + canslim row の取得 ──
  // 既存 EarningsGrowthSpark / QuarterlyHistoryTable と同 URL は dedupGet で coalesce 済 (二重 fetch なし)。
  const [qh, setQh] = useState(null); // history[]、新しい順 (history[0] = 最新)
  const [canslim, setCanslim] = useState(null); // canslim/rows の当該 ticker 行
  const [evalRows, setEvalRows] = useState(null); // earnings-evaluation rows[] (period_end 降順)

  useEffect(() => {
    if (!ticker) {
      setQh(null);
      setCanslim(null);
      setEvalRows(null);
      return;
    }
    let cancelled = false;
    fetchQuarterlyHistory(ticker, 8)
      .then((res) => {
        if (cancelled) return;
        setQh(res && Array.isArray(res.history) && res.history.length > 0 ? res.history : null);
      })
      .catch(() => { if (!cancelled) setQh(null); });
    fetchCanslimRows([ticker])
      .then((res) => {
        if (cancelled) return;
        const rows = res?.rows || {};
        const key = Object.keys(rows).find((k) => k.toUpperCase() === String(ticker).toUpperCase());
        setCanslim(key ? rows[key] : null);
      })
      .catch(() => { if (!cancelled) setCanslim(null); });
    fetchEarningsEvaluation(ticker, 8)
      .then((res) => {
        if (cancelled) return;
        setEvalRows(res && Array.isArray(res.rows) && res.rows.length > 0 ? res.rows : null);
      })
      .catch(() => { if (!cancelled) setEvalRows(null); });
    return () => { cancelled = true; };
  }, [ticker]);

  // ── 営業CFマージン (TTM サマリー、valuation-extras 由来) ──
  const ocf = ve.ocfMarginPct;
  const ocfOk = sources.cash_flow === 'ok' && Number.isFinite(ocf);
  const ocfEval = ocfOk ? ocfMarginLabel(ocf) : null;

  // ── ROE / PER / PEG ──
  const roe = ve.roe;
  const per = ve.trailingPE;
  const peg = ve.pegRatio;
  const roeOk = sources.key_metrics === 'ok' && Number.isFinite(roe);
  const perOk = sources.ratios === 'ok' && Number.isFinite(per);
  const pegOk = sources.ratios === 'ok' && Number.isFinite(peg);
  const rppParts = [
    roeOk ? `ROE ${num(roe)}%${roe >= 17 ? '（基準17%↑）' : ''}` : null,
    perOk ? `PER ${num(per, 1)}` : null,
    pegOk ? `PEG ${num(peg, 2)}` : null,
  ].filter(Boolean);
  const roeLevel = roeOk ? roeLevelLabel(roe) : null;
  const rppSummary = rppParts.length > 0
    ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>{rppParts.join(' · ')}</span>
        {roeLevel && <MiniChip tone={roeLevel.tone}>{roeLevel.label}</MiniChip>}
      </span>
    )
    : <span style={dashStyle}>—</span>;

  // ── 売上債権回転日数 (DSO) ── Sprint 3a。業種で適正水準が異なるため verdict ラベルなし。
  const dso = ve.daysSalesOutstanding;
  const dsoOk = sources.key_metrics === 'ok' && Number.isFinite(dso);
  const dsoSummary = dsoOk ? `${num(dso, 0)}日` : <span style={dashStyle}>—</span>;

  // ── 機関投資家 保有トレンド (13F QoQ) ──
  const inst = ve.institutionalOwnership;
  const instLatest = inst && inst.latest ? inst.latest : {};
  const instDelta = instLatest.ownershipDeltaPt;
  const instPct = instLatest.ownershipPercent;
  const instOk = sources.institutional === 'ok' && Number.isFinite(instDelta);
  const instLabel = instOk ? ownershipTrendLabel(instDelta) : null;
  const instSign = Number.isFinite(instDelta) && instDelta > 0 ? '+' : '';
  const instSummary = instOk
    ? `QoQ ${instSign}${num(instDelta, 1)}pt · ${instLabel}`
    : <span style={dashStyle}>—</span>;
  const instDetailLead = instOk
    ? `機関投資家（13F 報告）の保有比率は前四半期比 ${instSign}${num(instDelta, 1)}pt${Number.isFinite(instPct) ? `、直近の保有比率は ${num(instPct, 1)}%` : ''}です。`
    : '機関投資家（13F 報告）の保有比率の前四半期比です。データ未取得時は表示されません。';
  const instTrend = Array.isArray(inst?.trend) ? inst.trend : [];
  const instTrendVals = instTrend.map((t) => (Number.isFinite(t?.ownershipPercent) ? t.ownershipPercent : null));
  const instTrendLabels = instTrend.map((t) => (t?.date ? String(t.date).slice(0, 7) : ''));
  const showInstTrend = sources.institutional === 'ok' && instTrendVals.filter((v) => Number.isFinite(v)).length >= 2;

  // ── 8Q 系列 + 最新派生値 (quarterly-history は新しい順 → deriveQualityFromHistory で古→新へ整列) ──
  const {
    qhLabels, ocfMarginSeries, grossMarginSeries, ocfNiSeries,
    gmLatest, gmYoyPp, ocfNiLatest, cfHealth,
  } = deriveQualityFromHistory(qh);

  // 粗利率 (最新四半期 + YoY pp)
  const gmYoyChip = grossMarginYoyChip(gmYoyPp);
  const hasGrossMargin = gmLatest != null || grossMarginSeries.some((v) => Number.isFinite(v));
  const gmSummary = gmLatest != null
    ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>{num(gmLatest)}%</span>
        {gmYoyChip && <MiniChip tone={gmYoyChip.tone}>{gmYoyChip.label}</MiniChip>}
      </span>
    )
    : <span style={dashStyle}>—</span>;

  // OCF>純利益 (会計品質): 最新比率 + cfps_gt_eps verdict (helper から取得)
  const hasOcfNi = ocfNiLatest != null || ocfNiSeries.some((v) => Number.isFinite(v));
  const ocfNiSummary = ocfNiLatest != null
    ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>{ocfNiLatest.toFixed(2)}x</span>
        {cfHealth != null && (
          <MiniChip tone={cfHealth ? 'gain' : 'loss'}>{cfHealth ? 'CF良好' : '要確認'}</MiniChip>
        )}
      </span>
    )
    : <span style={dashStyle}>—</span>;

  // 営業CFマージン 8Q の傾向 chip (拡大基調 / 横ばい / 縮小傾向)
  const ocfMarginTrend = seriesTrendChip(ocfMarginSeries);

  // EPS CAGR 3年 (canslim/rows・継続性 pillbox)
  const epsCagr3y = Number.isFinite(canslim?.eps_cagr_3y) ? canslim.eps_cagr_3y : null;

  // ── 5条件 充足の推移 (§② 継続性 signal・earnings-evaluation) ──
  const evalCont = deriveEvalContinuity(evalRows);
  // header chip: 安定クリア条件を優先、無ければ継続ネックを表示 (非空・§38 事実ラベル)
  const evalStableNums = evalCont ? evalCont.stable.map((c) => c.num).join('') : '';
  const evalNeckNums = evalCont ? evalCont.neck.map((c) => c.num).join('') : '';

  return (
    <div data-testid={TESTID} style={{ display: 'grid', gap: 'var(--space-2, 8px)' }}>
      {/* 営業CFマージン (TTM サマリー + 8Q spark) */}
      <AccordionSection
        id="v6-l3-ocf-margin"
        title="営業CFマージン"
        summary={
          ocfOk
            ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>{num(ocf)}%（理想帯 15–35%）· {ocfEval}</span>
                {ocfMarginTrend && <MiniChip tone={ocfMarginTrend.tone}>{ocfMarginTrend.label}</MiniChip>}
              </span>
            )
            : <span style={dashStyle}>—</span>
        }
        tier={2}
        chevronPosition="right"
      >
        <div style={foldDetailStyle}>
          <div>
            営業CFマージン = 営業キャッシュフロー ÷ 売上高（直近 4Q 合計ベース）。本業がどれだけ現金を生み出すかを示し、利益の「質」を測る指標です。理想帯は 15–35%、ジリジリ拡大は優良化の兆候。
          </div>
          <FoldSparkline
            title="営業CFマージンの推移"
            series={ocfMarginSeries}
            labels={qhLabels}
            color="var(--color-accent)"
            valueFormatter={(v) => `${v.toFixed(1)}%`}
          />
          {!ocfOk && (
            <div style={citeStyle}>
              ※ 銀行・REIT・保険など売上基盤が異質な業種、またはデータ未取得時は表示されません。
            </div>
          )}
          <div style={citeStyle}>出典: FMP cash-flow-statement（TTM 4Q / 各Q 推移）</div>
        </div>
      </AccordionSection>

      {/* 粗利率 (Sprint 4b 新規・gross_margin_pct 8Q + YoY pp chip) */}
      {hasGrossMargin && (
        <AccordionSection
          id="v6-l3-gross-margin"
          title="粗利率"
          summary={gmSummary}
          tier={2}
          chevronPosition="right"
        >
          <div style={foldDetailStyle}>
            <div>
              粗利率 = 売上総利益 ÷ 売上高。価格決定力・原価構造の効率を示し、継続的な拡大は優良サインです（数値は事実、評価判断はご自身で）。
            </div>
            <FoldSparkline
              title="粗利率の推移"
              series={grossMarginSeries}
              labels={qhLabels}
              color="var(--color-accent)"
              valueFormatter={(v) => `${v.toFixed(1)}%`}
            />
            <div style={citeStyle}>出典: FMP income-statement（gross margin・直近 8Q）</div>
          </div>
        </AccordionSection>
      )}

      {/* ROE / PER / PEG (Sprint 4b: ROE 水準 chip 追加) */}
      <AccordionSection
        id="v6-l3-roe-per-peg"
        title="ROE / PER / PEG"
        summary={rppSummary}
        tier={2}
        chevronPosition="right"
      >
        <div style={foldDetailStyle}>
          <div>
            ROE（自己資本利益率）は資本効率の目安で、O'Neil の基準は 17% 以上。PER（株価収益率・実績）と PEG（PER ÷ 利益成長率）は割安/割高の判断材料です（数値は事実、評価判断はご自身で）。
          </div>
          {!roeOk && (
            <div style={citeStyle}>
              ※ ROE は銀行・REIT・保険など自己資本の意味が異質な業種では表示されません。
            </div>
          )}
          <div style={citeStyle}>出典: FMP ratios-ttm / key-metrics-ttm</div>
        </div>
      </AccordionSection>

      {/* OCF > 純利益（会計品質）(Sprint 4b 新規・CFPS÷EPS 8Q 比率 + cfps_gt_eps verdict) */}
      {hasOcfNi && (
        <AccordionSection
          id="v6-l3-ocf-ni-quality"
          title="OCF > 純利益（会計品質）"
          summary={ocfNiSummary}
          tier={2}
          chevronPosition="right"
        >
          <div style={foldDetailStyle}>
            <div>
              営業CFPS ÷ EPS の比率で、利益が現金で裏付けられているか（会計品質）を示します。1.0x 以上が健全の目安（ファンダメンタル5条件 #5：営業CFPS &gt; EPS）。数値は事実、評価判断はご自身で。
            </div>
            {/* bar 色は中立 accent (比率が 1.0x を跨いでも「全バー緑＝健全」と誤読させない §38-safe)。
                健全性シグナルは summary の CF良好/要確認 verdict chip に集約。 */}
            <FoldSparkline
              title="営業CFPS ÷ EPS の推移"
              series={ocfNiSeries}
              labels={qhLabels}
              color="var(--color-accent)"
              valueFormatter={(v) => `${v.toFixed(2)}x`}
            />
            <div style={citeStyle}>※ EPS が 0 以下の四半期は比率が定義できないため非表示です。</div>
            <div style={citeStyle}>出典: FMP cash-flow / income（営業CFPS・EPS、直近 8Q）</div>
          </div>
        </AccordionSection>
      )}

      {/* 売上債権回転日数 (DSO) */}
      <AccordionSection
        id="v6-l3-dso"
        title="売上債権回転日数（DSO）"
        summary={dsoSummary}
        tier={2}
        chevronPosition="right"
      >
        <div style={foldDetailStyle}>
          <div>
            DSO（Days Sales Outstanding）= 売上債権 ÷ 売上高 × 日数（TTM ベース）。販売してから現金を回収するまでの平均日数で、短いほど資金回収が速いことを示します。適正水準は業種により大きく異なります（数値は事実、評価判断はご自身で）。
          </div>
          {!dsoOk && (
            <div style={citeStyle}>
              ※ 銀行・保険・不動産など売上債権の概念が異質な業種、またはデータ未取得時は表示されません。
            </div>
          )}
          <div style={citeStyle}>出典: FMP key-metrics-ttm（daysOfSalesOutstandingTTM）</div>
        </div>
      </AccordionSection>

      {/* 機関投資家 保有トレンド (13F QoQ) */}
      <AccordionSection
        id="v6-l3-institutional"
        title="機関投資家 保有トレンド"
        summary={instSummary}
        tier={2}
        chevronPosition="right"
      >
        <div style={foldDetailStyle}>
          <div>
            {instDetailLead}O'Neil の "I"（機関の買い集め）の目安で、機関がどう動いたかの事実を示します。
          </div>
          {showInstTrend && (
            <FoldSparkline
              title="保有比率の推移"
              series={instTrendVals}
              labels={instTrendLabels}
              color="var(--color-accent)"
              valueFormatter={(v) => `${v.toFixed(1)}%`}
            />
          )}
          <div style={citeStyle}>
            ※ 13F は四半期ごとの SEC 報告で約 45 日遅延します。機械的な集計であり、相場の予測や売買の推奨ではありません。
          </div>
          <div style={citeStyle}>出典: FMP 13F（institutional-ownership・直近 4 四半期）</div>
        </div>
      </AccordionSection>

      {/* 5条件 充足の推移 (Sprint 4c 代替・継続性 synthesis・earnings-evaluation 8Q) */}
      {evalCont && evalCont.latestPassed != null && (
        <AccordionSection
          id="v6-l3-five-cond-continuity"
          title="5条件 充足の推移"
          summary={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>充足 {evalCont.latestPassed}/5（直近）</span>
              {evalStableNums
                ? <MiniChip tone="gain">安定 {evalStableNums}</MiniChip>
                : (evalNeckNums ? <MiniChip tone="warning">ネック {evalNeckNums}</MiniChip> : null)}
            </span>
          }
          tier={2}
          chevronPosition="right"
        >
          <div style={foldDetailStyle}>
            <div>
              ファンダメンタル5条件（①営業CFマージン≥15% ②EPS連続増 ③CFPS連続増 ④売上連続増 ⑤CFPS&gt;EPS）を四半期ごとに評価した充足状況の推移です。②③④は「3期連続増加」要件のため景気や運転資本の循環で揺れやすく、全5条件の同時充足は優良企業でも構造的に稀です（数値は事実、評価判断はご自身で）。
            </div>
            <FoldSparkline
              title="充足条件数の推移"
              series={evalCont.passedCountSeries}
              labels={evalCont.periodLabels}
              color="var(--color-accent)"
              valueFormatter={(v) => `${v}/5`}
            />
            <FiveCondHeatmap conditions={evalCont.conditions} periodLabels={evalCont.periodLabels} />
            {(evalCont.stable.length > 0 || evalCont.neck.length > 0) && (
              <div style={{ display: 'grid', gap: 2 }}>
                {evalCont.stable.length > 0 && (
                  <span style={{ fontSize: 11.5 }}>
                    安定クリア（直近8Qで75%+）: {evalCont.stable.map((c) => `${c.num}${c.short}`).join('・')}
                  </span>
                )}
                {evalCont.neck.length > 0 && (
                  <span style={{ fontSize: 11.5, color: 'var(--color-warning)' }}>
                    継続ネック（直近8Qで25%-）: {evalCont.neck.map((c) => `${c.num}${c.short}`).join('・')}
                  </span>
                )}
              </div>
            )}
            <div style={citeStyle}>※ 過去の決算実績に基づく機械的判定であり、将来の株価・業績を保証するものではありません。</div>
            <div style={citeStyle}>出典: FMP 決算データに基づく5条件評価（各四半期・nightly 集計）</div>
          </div>
        </AccordionSection>
      )}

      {/* 継続性 strip — EPS CAGR 3年 pillbox (Sprint 4b 新規・canslim/rows 配線) */}
      {epsCagr3y != null && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
          <Pillbox
            label="EPS 成長 CAGR（3年）"
            value={`${epsCagr3y > 0 ? '+' : ''}${num(epsCagr3y, 0)}%`}
            tag="基準 25%↑"
            tagTone="gold"
            dotTone={epsCagrDotTone(epsCagr3y)}
          />
        </div>
      )}
    </div>
  );
}
