/**
 * L3QualityFold — v6 IA Sprint 2-C: 品質・継続性 (L3) の fold 累進開示行
 *
 * @no-llm: backend 計算済値 (valuation-extras) の静的整形専用。LLM API 呼び出し禁止。
 *
 * mockup pane3-detail-v1.html:393-400 の L3 行のうち、valuation-extras 由来の 2 行:
 *   1. 営業CFマージン (ocfMarginPct) — サマリー「28.4%（理想帯 15–35%）· 良好」
 *   2. ROE / PER / PEG (roe / trailingPE / pegRatio)
 * (会社概要・セグメント行は FundamentalsAccordion、機関保有 QoQ 行は後続 sprint)
 *
 * §38-safe (景表法§5 / 金商法§38):
 *   - 評価語は閾値ベース静的 dict のみ (「良好」等は QuarterlyHistoryTable「CF良好」と同 idiom)。
 *   - 行動指示 (買い/売り) ・断定的将来予測・最上級は一切出さない。数値 + 中立品質ラベルのみ。
 *
 * Trust Cliff ガード:
 *   - 各値は Number.isFinite で compound check、欠落 (banks/REIT の sector guard 含む) は「—」fallback。
 *   - 捏造数値を出さない。全 valuation 値 null の行はサマリー「—」で表示 (空にせず誠実に欠落明示)。
 */
import AccordionSection from '../../../primitives/AccordionSection.jsx';

const TESTID = 'l3-quality-fold';

// 営業CFマージン §38-safe 品質ラベル (閾値ベース静的 dict)。
// O'Neil/じっちゃまは安定した本業の現金創出力を重視。理想帯 15–35%。
function ocfMarginLabel(pct) {
  if (!Number.isFinite(pct)) return null;
  if (pct >= 35) return '高水準';
  if (pct >= 15) return '良好';
  if (pct >= 5) return '標準';
  return '低水準';
}

const num = (v, digits = 1) => (Number.isFinite(v) ? v.toFixed(digits) : null);

const foldDetailStyle = {
  fontSize: 12.5,
  lineHeight: 1.6,
  color: 'var(--text-secondary)',
  display: 'grid',
  gap: 'var(--space-2, 8px)',
};
const citeStyle = { fontSize: 11, color: 'var(--text-muted)' };
const dashStyle = { color: 'var(--text-muted)', fontWeight: 400 };

/**
 * @param {object} props
 * @param {object|null} props.valuationExtras - /api/valuation-extras の result
 *   (trailingPE / roe / ocfMarginPct / pegRatio / sources)
 */
export default function L3QualityFold({ valuationExtras }) {
  const ve = valuationExtras || {};
  const sources = ve.sources || {};

  // ── 営業CFマージン ──
  const ocf = ve.ocfMarginPct;
  const ocfOk = sources.cash_flow === 'ok' && Number.isFinite(ocf);
  const ocfEval = ocfOk ? ocfMarginLabel(ocf) : null;
  const ocfSummary = ocfOk
    ? `${num(ocf)}%（理想帯 15–35%）· ${ocfEval}`
    : <span style={dashStyle}>—</span>;

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
  const rppSummary = rppParts.length > 0 ? rppParts.join(' · ') : <span style={dashStyle}>—</span>;

  return (
    <div data-testid={TESTID} style={{ display: 'grid', gap: 'var(--space-2, 8px)' }}>
      {/* 営業CFマージン */}
      <AccordionSection
        id="v6-l3-ocf-margin"
        title="営業CFマージン"
        summary={ocfSummary}
        tier={2}
        chevronPosition="right"
      >
        <div style={foldDetailStyle}>
          <div>
            営業CFマージン = 営業キャッシュフロー ÷ 売上高（直近 4Q 合計ベース）。本業がどれだけ現金を生み出すかを示し、利益の「質」を測る指標です。理想帯は 15–35%。
          </div>
          {!ocfOk && (
            <div style={citeStyle}>
              ※ 銀行・REIT・保険など売上基盤が異質な業種、またはデータ未取得時は表示されません。
            </div>
          )}
          <div style={citeStyle}>出典: FMP cash-flow-statement（TTM 4Q）</div>
        </div>
      </AccordionSection>

      {/* ROE / PER / PEG */}
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
    </div>
  );
}
