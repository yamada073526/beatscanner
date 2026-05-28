import React from 'react';
import { BookOpen, ArrowRight, Sparkles } from 'lucide-react';
import { useWorkspaceStore } from '../../../../../state/workspaceStore.js';

/**
 * v125 P8-3 Sprint B + R6-2/R7-2/R8-2/R9 (user dogfood feedback 2026-05-28〜29):
 *   sticky 撤去 + 小型 chip button → Aman 級 banner (R7-2) → R9-1 scroll fix + R8-2 text + R9-2 halo upgrade。
 *
 * 修正履歴:
 *   - R6-2: sticky 撤去、 user「画面が狭くなる」 反映
 *   - R7-2: Chip primitive → dedicated banner、 大型 icon + 2 行 text + arrow
 *   - R8-2: text を「業績・ビジネス・強みを図解」 + 「7 セクションで銘柄の全体像を視覚化」 に置換
 *     (user feedback「AI を主張しすぎ、 click したら何がわかるかが重要」 + 3 体合議統合最終案)
 *   - R9-1: scroll target を内部 scrollable ancestor に対して container.scrollTo()
 *     (PaneContainer overflow-y:auto で window.scrollTo が silent fail していた)
 *   - R9-2: hover halo を旧 SPA UI 風 panel-card / tier-m-glow idiom upgrade
 */
export default function StickyDiagramAccordion() {
  const expandSection = useWorkspaceStore((s) => s.expandSection);

  const handleJumpToDiagram = () => {
    // R9-1 scroll fix: PaneContainer (内部 scrollable container) 対応で container.scrollTo に切替。
    try { expandSection('detail-report'); } catch { /* noop */ }
    setTimeout(() => {
      const candidates = [
        () => document.getElementById('acc-header-sec-report'),
        () => document.getElementById('sec-report'),
        () => document.querySelector('[data-testid="library-report-wrapper"]'),
        () => document.querySelector('[data-testid="chapter-section-③"]'),
      ];
      let el = null;
      for (const find of candidates) {
        try { el = find(); if (el) break; } catch { /* noop */ }
      }
      if (!el) {
        // eslint-disable-next-line no-console
        console.warn('[StickyDiagramAccordion] jump target not found');
        return;
      }
      // 最近接の scrollable ancestor を探す
      let container = el.parentElement;
      while (container) {
        const sty = window.getComputedStyle(container);
        if ((sty.overflowY === 'auto' || sty.overflowY === 'scroll')
            && container.scrollHeight > container.clientHeight + 4) break;
        container = container.parentElement;
      }
      const rect = el.getBoundingClientRect();
      if (!container) {
        const offsetTop = window.pageYOffset + rect.top - 72;
        window.scrollTo({ top: offsetTop, behavior: 'smooth' });
      } else {
        const cRect = container.getBoundingClientRect();
        const offsetTop = container.scrollTop + (rect.top - cRect.top) - 24;
        container.scrollTo({ top: offsetTop, behavior: 'smooth' });
      }
    }, 100);
  };

  return (
    <button
      type="button"
      className="diagram-banner"
      onClick={handleJumpToDiagram}
      data-testid="sticky-diagram-accordion"
      aria-label="銘柄の全体像を図解で見る"
    >
      <span className="diagram-banner__icon-wrap" aria-hidden="true">
        <BookOpen size={18} strokeWidth={1.5} />
        <Sparkles size={10} strokeWidth={1.5} className="diagram-banner__sparkle" />
      </span>
      <span className="diagram-banner__text">
        <span className="diagram-banner__title">業績・ビジネス・強みを図解</span>
        <span className="diagram-banner__sub">7 セクションで銘柄の全体像を視覚化</span>
      </span>
      <span className="diagram-banner__arrow" aria-hidden="true">
        <ArrowRight size={14} strokeWidth={1.5} />
      </span>
    </button>
  );
}
