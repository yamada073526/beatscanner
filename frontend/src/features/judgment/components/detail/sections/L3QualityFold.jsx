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
import SparkBars from '../../../../../components/SparkBars.jsx';
import { fetchQuarterlyHistory, fetchCanslimRows } from '../../../../../api.js';

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

// header summary 内に常時表示する compact sparkline (3 体合議 → C 採用: 図解をクリックで隠さない)。
// 幅固定で左=8Q前→右=直近、直近バー強調。各バー hover で期+値 (SparkBars の portal tooltip)。≥2 有値で描画。
function SummarySpark({ series, labels, color, valueFormatter, width = 76 }) {
  const finiteCount = series.filter((v) => Number.isFinite(v)).length;
  if (finiteCount < 2) return null;
  return (
    <span style={{ display: 'inline-flex', width, height: 26, flexShrink: 0, verticalAlign: 'middle' }}>
      <SparkBars data={series} color={color} labels={labels} valueFormatter={valueFormatter} height={26} floorPct={22} />
    </span>
  );
}

// sparkline を持つ指標の summary 共通レイアウト: 値テキスト + 常時 sparkline + 方向 chip を 1 行 (nowrap)。
// header が狭いときは title 側 (overflow:hidden) が truncate する。
function SparkSummary({ valueNode, series, labels, color, valueFormatter, chip }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
      <span>{valueNode}</span>
      <SummarySpark series={series} labels={labels} color={color} valueFormatter={valueFormatter} />
      {chip}
    </span>
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

  useEffect(() => {
    if (!ticker) {
      setQh(null);
      setCanslim(null);
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
  const instTrend = Array.isArray(inst?.trend) ? inst.trend : [];
  const instTrendVals = instTrend.map((t) => (Number.isFinite(t?.ownershipPercent) ? t.ownershipPercent : null));
  const instTrendLabels = instTrend.map((t) => (t?.date ? String(t.date).slice(0, 7) : ''));
  const showInstTrend = sources.institutional === 'ok' && instTrendVals.filter((v) => Number.isFinite(v)).length >= 2;
  const instValueText = instOk ? `QoQ ${instSign}${num(instDelta, 1)}pt · ${instLabel}` : null;
  const instSummary = !instOk
    ? <span style={dashStyle}>—</span>
    : showInstTrend
      ? (
        <SparkSummary
          valueNode={instValueText}
          series={instTrendVals}
          labels={instTrendLabels}
          color="var(--color-accent)"
          valueFormatter={(v) => `${v.toFixed(1)}%`}
        />
      )
      : instValueText;
  const instDetailLead = instOk
    ? `機関投資家（13F 報告）の保有比率は前四半期比 ${instSign}${num(instDelta, 1)}pt${Number.isFinite(instPct) ? `、直近の保有比率は ${num(instPct, 1)}%` : ''}です。`
    : '機関投資家（13F 報告）の保有比率の前四半期比です。データ未取得時は表示されません。';

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
      <SparkSummary
        valueNode={`${num(gmLatest)}%`}
        series={grossMarginSeries}
        labels={qhLabels}
        color="var(--color-accent)"
        valueFormatter={(v) => `${v.toFixed(1)}%`}
        chip={gmYoyChip && <MiniChip tone={gmYoyChip.tone}>{gmYoyChip.label}</MiniChip>}
      />
    )
    : <span style={dashStyle}>—</span>;

  // OCF>純利益 (会計品質): 最新比率 + cfps_gt_eps verdict (helper から取得)
  const hasOcfNi = ocfNiLatest != null || ocfNiSeries.some((v) => Number.isFinite(v));
  const ocfNiSummary = ocfNiLatest != null
    ? (
      <SparkSummary
        valueNode={`${ocfNiLatest.toFixed(2)}x`}
        series={ocfNiSeries}
        labels={qhLabels}
        color="var(--color-accent)"
        valueFormatter={(v) => `${v.toFixed(2)}x`}
        chip={cfHealth != null && (
          <MiniChip tone={cfHealth ? 'gain' : 'loss'}>{cfHealth ? 'CF良好' : '要確認'}</MiniChip>
        )}
      />
    )
    : <span style={dashStyle}>—</span>;

  // 営業CFマージン 8Q の傾向 chip (拡大基調 / 横ばい / 縮小傾向)
  const ocfMarginTrend = seriesTrendChip(ocfMarginSeries);

  // EPS CAGR 3年 (canslim/rows・継続性 pillbox)
  const epsCagr3y = Number.isFinite(canslim?.eps_cagr_3y) ? canslim.eps_cagr_3y : null;

  return (
    <div data-testid={TESTID} style={{ display: 'grid', gap: 'var(--space-2, 8px)' }}>
      {/* 営業CFマージン (TTM サマリー + 8Q spark) */}
      <AccordionSection
        id="v6-l3-ocf-margin"
        title="営業CFマージン"
        summary={
          ocfOk
            ? (
              <SparkSummary
                valueNode={`${num(ocf)}% · ${ocfEval}`}
                series={ocfMarginSeries}
                labels={qhLabels}
                color="var(--color-accent)"
                valueFormatter={(v) => `${v.toFixed(1)}%`}
                chip={ocfMarginTrend && <MiniChip tone={ocfMarginTrend.tone}>{ocfMarginTrend.label}</MiniChip>}
              />
            )
            : <span style={dashStyle}>—</span>
        }
        tier={2}
        chevronPosition="right"
      >
        <div style={foldDetailStyle}>
          <div>
            営業CFマージン = 営業キャッシュフロー ÷ 売上高（TTM はヘッダーの数値、推移は各 Q ベース）。本業がどれだけ現金を生み出すかを示し、利益の「質」を測る指標です。理想帯は 15–35%、ジリジリ拡大は優良化の兆候。ヘッダーの sparkline は左=8Q前→右=直近、各バー hover で各 Q の値。
          </div>
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
              粗利率 = 売上総利益 ÷ 売上高。価格決定力・原価構造の効率を示し、継続的な拡大は優良サインです（数値は事実、評価判断はご自身で）。ヘッダーの sparkline は左=8Q前→右=直近、各バー hover で各 Q の値。
            </div>
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
              営業CFPS ÷ EPS の比率で、利益が現金で裏付けられているか（会計品質）を示します。1.0x 以上が健全の目安（ファンダメンタル5条件 #5：営業CFPS &gt; EPS）。数値は事実、評価判断はご自身で。ヘッダーの sparkline は左=8Q前→右=直近（bar 色は中立 accent、健全性は CF良好/要確認 chip に集約）、各バー hover で各 Q の値。
            </div>
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
            {instDetailLead}O'Neil の "I"（機関の買い集め）の目安で、機関がどう動いたかの事実を示します。{showInstTrend ? 'ヘッダーの sparkline は保有比率の推移（左=過去→右=直近）、各バー hover で各四半期の値。' : ''}
          </div>
          <div style={citeStyle}>
            ※ 13F は四半期ごとの SEC 報告で約 45 日遅延します。機械的な集計であり、相場の予測や売買の推奨ではありません。
          </div>
          <div style={citeStyle}>出典: FMP 13F（institutional-ownership・直近 4 四半期）</div>
        </div>
      </AccordionSection>

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
