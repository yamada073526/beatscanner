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
 * を物理削除。
 *
 * v294 backlog (見出し揃え): 旧実装は 3 panel の自前見出しを使い、NewsPanel/IRLinks は
 *   section-heading class・TenK は inline style でスタイルが不揃いだった。各 panel を
 *   hideHeading=true にして自前見出しを抑止し、ContextSection 側で L3 統一サブ見出し
 *   (SUB_HEADING_STYLE) を出して整列させる (Insider/8Q の内部 l3Headings と同格)。
 */
// 集約 fold (L2) 内の 3 source を区別する L3 サブ見出し (3 panel で完全に同一スタイル)。
const SUB_HEADING_STYLE = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  letterSpacing: '0.04em',
  margin: '0 0 var(--space-3, 12px)',
};

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
        <section>
          <h4 style={SUB_HEADING_STYLE}>最新ニュース</h4>
          <NewsPanel ticker={selectedTicker} useWorkspaceReader={useWorkspaceReader} hideHeading />
        </section>
        <section>
          <h4 style={SUB_HEADING_STYLE}>IR リソース</h4>
          <IRLinksPanel ticker={selectedTicker} hideHeading />
        </section>
        <section>
          <h4 style={SUB_HEADING_STYLE}>10-K (年次報告書)</h4>
          <TenKLinksPanel ticker={selectedTicker} hideHeading />
        </section>
      </div>
    </AccordionSection>
  );
}
