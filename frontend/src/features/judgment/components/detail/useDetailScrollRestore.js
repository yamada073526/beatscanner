/**
 * useDetailScrollRestore — C-3 競合ナビ Sprint 1b (scroll 復元のみ)
 * パンくずで祖先 ticker に戻ったとき、スクロール位置を復元する hook。
 *
 * 設計 (SPEC 2026-06-09 §5 Sprint 1b):
 *   - scroll container 特定: .ds-judgment-detail の parentElement を辿り
 *     overflowY === 'auto' | 'scroll' かつ scrollHeight > clientHeight の最初の祖先。
 *   - 保存タイミング: ticker を離れる直前 (= useEffect の cleanup)。
 *   - 復元タイミング: cache hit で detail が描画された後 (rAF 2 回で gate)。
 *   - sessionStorage キー: `bs:c3:detail:<TICKER>` (ticker 別に分離)。
 *   - スクロール復元は behavior:'instant' (smooth は酔い防止のため不使用)。
 *
 * Trust Cliff 防止: 描画完了前の scrollTo は 0 に戻る罠 → rAF 2 回で gate (SPEC §8 リスク)。
 *
 * ⚠️ accordion 開閉復元は本 Phase では DEFER (autopilot v194 判断):
 *   AccordionSection の controlledOpen/onOpenChange を detail 全 section (ChapterSection /
 *   FundamentalsAccordion 等のサブコンポーネント経由で分散) に配線する必要があり、
 *   既存 expandedSections (Sprint 5 condition-click auto-expand) / halo sweep と絡む
 *   blast-radius 中の変更。authed chart は headless 検証不可のため無監視 ship を避け、
 *   user レビュー後に別途実装する (handover DEFER-SPEC 参照)。
 *
 * @param {string|null} ticker   — 現在表示中の ticker (selectedTicker)
 * @param {React.RefObject} detailRef — .ds-judgment-detail の DOM ref
 */
import { useEffect } from 'react';

const STORAGE_PREFIX = 'bs:c3:detail:';

/** sessionStorage から ticker の保存スクロール位置を読む。なければ null */
function loadSavedScrollTop(ticker) {
  if (!ticker) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + ticker.toUpperCase());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.scrollTop === 'number' ? parsed.scrollTop : null;
  } catch {
    return null;
  }
}

/** sessionStorage に ticker の現在スクロール位置を書く */
function saveScrollTop(ticker, scrollTop) {
  if (!ticker) return;
  try {
    sessionStorage.setItem(
      STORAGE_PREFIX + ticker.toUpperCase(),
      JSON.stringify({ scrollTop })
    );
  } catch {
    // sessionStorage が使えない環境 (private mode など) はサイレント無視
  }
}

/**
 * .ds-judgment-detail から上方向に辿り、
 * scroll container (overflowY: auto|scroll かつ scrollHeight > clientHeight) を探す。
 * 見つからなければ document.documentElement にフォールバック。
 *
 * @param {HTMLElement} detailEl
 * @returns {HTMLElement}
 */
function findScrollContainer(detailEl) {
  if (!detailEl) return document.documentElement;
  let el = detailEl.parentElement;
  while (el && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    const oy = style.overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) {
      return el;
    }
    el = el.parentElement;
  }
  return document.documentElement;
}

export function useDetailScrollRestore(ticker, detailRef) {
  // 保存タイミング: ticker が変わる直前 (useEffect の cleanup)
  // 復元タイミング: ticker が変わった後に rAF 2 回で gate
  useEffect(() => {
    if (!ticker) return;

    const currentTicker = ticker;
    const savedScrollTop = loadSavedScrollTop(currentTicker);

    // スクロール復元 (rAF 2 回 gate: 描画完了後に scrollTo)
    let raf1, raf2;
    if (typeof savedScrollTop === 'number' && savedScrollTop > 0) {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          if (!detailRef.current) return;
          const container = findScrollContainer(detailRef.current);
          // cache miss (10分 TTL 切れ) 時は skeleton 描画段階で本 effect が発火し、
          // 本体高さに満たない container へ scrollTo すると先頭付近に飛ぶ (3 体合議 frontend/qa 指摘)。
          // savedScrollTop に到達可能な高さがある (= 本体描画済み = ほぼ cache hit) ときのみ復元する。
          const maxScroll = container.scrollHeight - container.clientHeight;
          if (maxScroll >= savedScrollTop) {
            container.scrollTo({ top: savedScrollTop, behavior: 'instant' });
          }
        });
      });
    }

    // cleanup: 次の ticker に移る直前に現在スクロール位置を保存
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (currentTicker && detailRef.current) {
        const container = findScrollContainer(detailRef.current);
        saveScrollTop(currentTicker, container.scrollTop);
      }
    };
  }, [ticker, detailRef]);
}
