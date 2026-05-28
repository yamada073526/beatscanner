import React from 'react';
import { BookOpen, ArrowRight, Sparkles } from 'lucide-react';
import { useWorkspaceStore } from '../../../../../state/workspaceStore.js';

/**
 * v125 P8-3 Sprint B + R6-2/R7-2 (user dogfood feedback 2026-05-28):
 *   sticky 撤去 + 小型 chip button 1 個 → Aman 級格調感の hero banner に格上げ (R7-2)。
 *
 * R7-2 修正背景:
 *   - user 評価: 「Chip primitive 単体は 60 点未満、 リッチさ足りない」
 *   - user 評価: 「click で何も反応しない」 → root cause: AccordionSection 内部 id `acc-header-${id}` に修正
 *
 * 設計 (R7-2 デザインリッチ化):
 *   - Chip primitive ではなく dedicated banner component (border + gradient subtle accent)
 *   - 左に large icon (BookOpen 18px) + accent tint
 *   - 右に「AI 詳細レポートで生成 →」 sub label + ArrowRight icon
 *   - hover で subtle elevation + accent border 強化、 Aman 級「ロビーの案内板」 idiom
 *   - sticky なし、 通常 inline 配置 (scroll で消えて OK)
 *   - click で AI 詳細レポート (#acc-header-sec-report) に expand + smooth scroll
 *
 * Trust Cliff: 「AI 解説」 + 「詳細レポートで生成」 で動作の明示、 click 後の挙動を予告。
 */
export default function StickyDiagramAccordion() {
  const expandSection = useWorkspaceStore((s) => s.expandSection);

  const handleJumpToDiagram = () => {
    // R7-1/R7-2 root cause fix: AccordionSection の root に id 属性は付与されない (props 分割代入で抜かれる)。
    // 内部 button に `acc-header-${id}` で id 付与されるため、 それを scroll target に。
    try { expandSection('detail-report'); } catch { /* noop */ }
    setTimeout(() => {
      const el = document.getElementById('acc-header-sec-report');
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const offsetTop = window.pageYOffset + rect.top - 72;
      window.scrollTo({ top: offsetTop, behavior: 'smooth' });
    }, 250);
  };

  return (
    <button
      type="button"
      className="diagram-banner"
      onClick={handleJumpToDiagram}
      data-testid="sticky-diagram-accordion"
      aria-label="AI 図解を見る — 詳細レポートを開いて生成"
    >
      <span className="diagram-banner__icon-wrap" aria-hidden="true">
        <BookOpen size={18} strokeWidth={1.5} />
        <Sparkles size={10} strokeWidth={1.5} className="diagram-banner__sparkle" />
      </span>
      <span className="diagram-banner__text">
        <span className="diagram-banner__title">図解 — AI 解説</span>
        <span className="diagram-banner__sub">AI 詳細レポートで自動生成</span>
      </span>
      <span className="diagram-banner__arrow" aria-hidden="true">
        <ArrowRight size={14} strokeWidth={1.5} />
      </span>
    </button>
  );
}
