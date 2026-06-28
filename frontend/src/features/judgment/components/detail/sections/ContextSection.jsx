import NewsPanel from '../../../../../components/NewsPanel.jsx';
import IRLinksPanel from '../../../../../components/IRLinksPanel.jsx';
import TenKLinksPanel from '../../../../../components/TenKLinksPanel.jsx';
import { AccordionSection } from '../../../primitives/index.js';

/**
 * L6「その他」fold 群の末尾 1 fold =「ニュース · IR · 10-K」(一次ソースへのリンク)。
 * 正本 mockup: docs/specs/mockups/pane3-detail-v1.html の L6 fold #5。
 *
 * v294 第2弾 (§1+§2 統合): v6 単一経路へ純化。旧 v2-v5 の
 *   - 章扉 (ChapterSection「リファレンス」③/④) → JudgmentDetail の「その他」⑤ に統合済で撤去
 *   - 最新ニュース / IR / 10-K の 3 AccordionSection → mockup の 1 fold に集約
 *   - DetailReport fold → 図解が Pane 3 上部 mount 済で重複のため撤去 (旧 isV4=true 経路を default 化)
 *   - tier-l-glow 発光 host → L6 fold は全て非発光で統一 (mockup 忠実 + 装飾は重要 section 限定)
 *   - isV2 / isScrollV1 / isV4 / isV5 分岐 → 撤去
 * を物理削除。各 panel は自前見出しで「ニュース / IR / 10-K」を区別。
 */
export default function ContextSection({
  selectedTicker,
  useWorkspaceReader,
  expandedSections,
}) {
  if (!selectedTicker) return null;
  return (
    <AccordionSection
      id="sec-references"
      title="ニュース · IR · 10-K"
      tier={2}
      defaultOpen={false}
      summary="一次ソースへのリンク"
      controlledOpen={expandedSections.has('references') || undefined}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6, 24px)',
          padding: '0 var(--space-3, 12px)',
        }}
      >
        <NewsPanel ticker={selectedTicker} useWorkspaceReader={useWorkspaceReader} />
        <IRLinksPanel ticker={selectedTicker} />
        <TenKLinksPanel ticker={selectedTicker} />
      </div>
    </AccordionSection>
  );
}
