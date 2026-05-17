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
  const shouldShowDegradedBanner = degradedMode || (signalQuality?.confidence === 'low');

  if (isEmpty && !shouldShowDegradedBanner) {
    // 完全に出典なし + degraded mode でもない = 何も表示しない (signal_quality high の異例ケース)
    return null;
  }

  return (
    <div className="diagram-citation-footer">
      {shouldShowDegradedBanner && (
        <div className="diagram-citation-banner" role="status">
          <span aria-hidden="true">⚠</span>
          <span>データ源の一部が取得できませんでした。 表示数値は signal_quality 降格中です。</span>
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
