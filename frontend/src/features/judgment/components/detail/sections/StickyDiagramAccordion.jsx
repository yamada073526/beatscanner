import React from 'react';
import { BookOpen } from 'lucide-react';
import Chip from '../../../../../components/ui/Chip.jsx';

/**
 * v125 P8-3 Sprint B + R6-2 (user dogfood feedback 2026-05-28):
 *   sticky 撤去 + 小型 chip button 1 個に書換。
 *
 * user 指摘 (スクショ「マコなり」 アプリ参考):
 *   - 「scroll しても常時表示するつもりはなかった、 画面が狭くなる」
 *   - 「よく見える位置に小さく図解ボタンが置いてある」
 *   - 「ふだんから対象銘柄をチェックしている人は (図解を) 開かないので圧迫感ない small button が良い」
 *
 * 設計:
 *   - sticky 撤去、 通常 inline 配置 (Pane 3 案 B 新順序の section 2、 Chart の前)
 *   - chip primitive 経由 (variant=display + size=sm + tone=accent)、 inline style ゼロ
 *   - icon: BookOpen (lucide)、 label: 「図解 — AI 解説」
 *   - click で AI 詳細レポート accordion (#sec-report) に smooth scroll
 *   - scroll で消えて OK (常時 visible 義務なし、 user 想定整合)
 *
 * NOTE: DiagramCard 物理 mount 維持 ([[feedback-diagram-card-remount-cache]]) は別 sprint で
 * DetailReport.jsx の vizData lift up が必要。 本 sprint は「user が click したら詳細レポートを開く」
 * 動線提供のみ (1 click 減 + brand 整合、 5 原則 #4)。
 */
export default function StickyDiagramAccordion() {
  const handleJumpToDiagram = () => {
    // R6-1 と同 idiom: AccordionSection の open + manual offset scroll
    setTimeout(() => {
      const el = document.getElementById('sec-report');
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const offsetTop = window.pageYOffset + rect.top - 72;
      window.scrollTo({ top: offsetTop, behavior: 'smooth' });
    }, 50);
  };

  return (
    <div
      className="sticky-diagram-button-row"
      data-testid="sticky-diagram-accordion"
    >
      <Chip
        variant="display"
        size="sm"
        tone="accent"
        icon={<BookOpen size={13} strokeWidth={1.5} />}
        onClick={handleJumpToDiagram}
        ariaLabel="AI 図解を見る"
      >
        図解 — AI 解説
      </Chip>
    </div>
  );
}
