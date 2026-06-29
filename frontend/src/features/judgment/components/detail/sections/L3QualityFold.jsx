/**
 * L3QualityFold — v6 IA Sprint 2-C: 品質・継続性 (L3) の fold 累進開示行
 *
 * @no-llm: backend 計算済値 (valuation-extras) の静的整形専用。LLM API 呼び出し禁止。
 *
 * mockup pane3-detail-v1.html:393-400 の L3 行のうち、valuation-extras 由来の 3 行:
 *   1. 営業CFマージン (ocfMarginPct) — サマリー「28.4%（理想帯 15–35%）· 良好」
 *   2. ROE / PER / PEG (roe / trailingPE / pegRatio)
 *   2.5 売上債権回転日数 DSO (daysSalesOutstanding) — Sprint 3a・サマリー「43日」(verdict ラベルなし)
 *   3. 機関投資家 保有トレンド (institutionalOwnership.latest.ownershipDeltaPt) — サマリー「QoQ +0.6pt · 緩やかに増加」
 * (会社概要・セグメント行は FundamentalsAccordion)
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
import SparkBars from '../../../../../components/SparkBars.jsx';

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

// 機関保有 QoQ §38-safe 方向ラベル (閾値ベース静的 dict)。
// 13F 報告ベースの「過去事実」の方向記述のみ。行動指示・断定的将来予測は出さない (§38)。
function ownershipTrendLabel(deltaPt) {
  if (!Number.isFinite(deltaPt)) return null;
  if (deltaPt >= 2) return '大きく増加';
  if (deltaPt >= 0.5) return '緩やかに増加';
  if (deltaPt > -0.5) return 'ほぼ横ばい';
  if (deltaPt > -2) return '緩やかに減少';
  return '大きく減少';
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
 *   (trailingPE / roe / ocfMarginPct / pegRatio / institutionalOwnership / sources)
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

  // ── 売上債権回転日数 (DSO) ── Sprint 3a。業種で適正水準が異なるため verdict ラベルなし (事実の日数のみ)。
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

  // ── 機関保有 4Q trend sparkline (Sprint 3) ──
  // backend は institutionalOwnership.trend を古→新 (チャート左→右) で返却済 (institutional.py:89)。
  // 出し分け原則: 保有比率は推移を見るべき trend 指標 → sparkline。単一値 (ROE 等) には付けない。
  const instTrend = Array.isArray(inst?.trend) ? inst.trend : [];
  const instTrendVals = instTrend.map((t) => (Number.isFinite(t?.ownershipPercent) ? t.ownershipPercent : null));
  const instTrendLabels = instTrend.map((t) => (t?.date ? String(t.date).slice(0, 7) : ''));
  // 2 点以上 valid かつ source ok のときのみ描画 (1 点では推移にならない)。
  const showInstTrend = sources.institutional === 'ok' && instTrendVals.filter((v) => Number.isFinite(v)).length >= 2;

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
                <span>保有比率の推移（直近{instTrendVals.filter((v) => Number.isFinite(v)).length}Q）</span>
                <span>過去 → 直近</span>
              </div>
              {/* 直近=右 (backend が古→新で返却)。色は accent (中立のブランド色) — 上昇/下落の意味は持たせない (§38)。
                  正本 mockup の §② sp2 bars 準拠でバー表示。hover で各Qの保有比率% (期=年月)。 */}
              <SparkBars
                data={instTrendVals}
                color="var(--color-accent)"
                labels={instTrendLabels}
                valueFormatter={(v) => `${v.toFixed(1)}%`}
                height={48}
                floorPct={20}
              />
            </div>
          )}
          <div style={citeStyle}>
            ※ 13F は四半期ごとの SEC 報告で約 45 日遅延します。機械的な集計であり、相場の予測や売買の推奨ではありません。
          </div>
          <div style={citeStyle}>出典: FMP 13F（institutional-ownership・直近 4 四半期）</div>
        </div>
      </AccordionSection>
    </div>
  );
}
