/**
 * DiagramCitation — handover v82 Phase 4 (出典 footer + degraded_mode banner)
 *
 * @no-llm — このコンポーネントは Anthropic SDK / Claude API を一切呼ばない。
 *
 * multi-review 6 体合議 (2026-05-17) verdict:
 * - chip は hybrid: load-bearing 数値のみ inline superscript、 文脈数値は footer 集約 (UI/UX + 金融 + マーケ 一致)
 * - 「Cited from N sources」 Linear 流 footer (UI/UX)
 * - degraded_mode (source_url 欠損 / material_facts < 3 件) で banner 表示 (Web 設計 + 金融)
 * - 重複出典は dedupe して unique sources のみ表示
 *
 * Aman 級 brand 整合:
 * - cyan accent 流用禁止 (neutral border + transparent bg)
 * - chip 密集は dedupe + 「Cited from N」 形式で軽減
 *
 * memory:
 *   - feedback_citation_required.md (sources field で出典明示)
 *   - feedback_data_completeness_guard.md (degraded_mode UI rule、 Phase 3 SSOT)
 *   - feedback_brand_aspiration.md (Aman/Ritz-Carlton 級世界観)
 */
import CitationChip from './CitationChip.jsx';

/**
 * @param {object} props
 * @param {Array<{fact?: string, source_url?: string, confidence?: 'high'|'medium'|'low'}>} props.materialFacts
 * @param {boolean} [props.degradedMode=false] - 一部 source_url 欠落で degraded
 * @param {object} [props.signalQuality] - /api/visualize の signal_quality envelope
 */
export default function DiagramCitation({
  materialFacts = [],
  degradedMode = false,
  signalQuality = null,
}) {
  const facts = Array.isArray(materialFacts) ? materialFacts : [];

  // unique sources: source_url で dedupe (同一 URL は 1 件表示)
  const seenUrls = new Set();
  const uniqueSources = [];
  for (const mf of facts) {
    if (!mf || typeof mf !== 'object') continue;
    const url = (mf.source_url || '').trim();
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    uniqueSources.push(mf);
  }

  const isEmpty = uniqueSources.length === 0;
  // v127 R16 (user dogfood): banner trigger から `signalQuality.confidence === 'low'` を除外。
  // 理由: material_facts (出典付き fact) はこのアプリの visualize 経路で未配線のため confidence が
  // 常時 'low' → 全図解で「データ源取得失敗・数値降格」 banner が誤発火する Trust Cliff だった。
  // 表示数値 (trends / valuation) は FMP/Python (precomputed_metrics) 由来で confidence とは独立に信頼でき、
  // material_facts=0 は「narration の外部出典が無い」 ことのみを意味する (数値の不正ではない)。
  // 真の data source 失敗は backend が degraded_mode=true を立てたときのみ banner を出す。
  // (signalQuality は将来 material_facts pipeline を配線したとき再活用するため prop は維持)
  const shouldShowDegradedBanner = degradedMode === true;

  if (isEmpty && !shouldShowDegradedBanner) {
    // 出典 chip も degraded banner も無い = footer disclaimer のみ表示 (通常状態)
    return (
      <div className="diagram-citation-footer">
        <div className="diagram-citation-disclaimer">
          本表示は情報提供のみを目的とし、 投資勧誘ではありません。 最終判断はご自身でお願いします。
        </div>
      </div>
    );
  }

  return (
    <div className="diagram-citation-footer">
      {shouldShowDegradedBanner && (
        <div className="diagram-citation-banner" role="status">
          <span aria-hidden="true">⚠</span>
          {/* v127 R16: 「表示数値が降格」 という数値不信を招く旧文言を是正。
              数値 (trends/valuation) は財務データ由来で信頼でき、 ここで欠けたのは外部出典の参照情報のみ。 */}
          <span>一部の参照データ（外部出典）を取得できませんでした。 表示中の数値は財務データに基づきます。</span>
        </div>
      )}
      {!isEmpty && (
        <>
          <div className="diagram-citation-label">
            Cited from {uniqueSources.length} source{uniqueSources.length !== 1 ? 's' : ''}
          </div>
          <div className="diagram-citation-chips">
            {uniqueSources.map((mf, i) => (
              <CitationChip
                key={`${mf.source_url}-${i}`}
                sourceUrl={mf.source_url}
                slot="footer"
              />
            ))}
          </div>
        </>
      )}
      <div className="diagram-citation-disclaimer">
        本表示は情報提供のみを目的とし、 投資勧誘ではありません。 最終判断はご自身でお願いします。
      </div>
    </div>
  );
}
