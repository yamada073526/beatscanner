/**
 * useDetailScrollRestore — C-3 競合ナビ Sprint 1b (scroll 復元のみ)
 * パンくずで祖先 ticker に戻ったとき、スクロール位置を復元する hook。
 *
 * 設計 (SPEC 2026-06-09 §5 Sprint 1b):
 *   - scroll container 特定: .ds-judgment-detail の parentElement を辿り
 *     overflowY === 'auto' | 'scroll' かつ scrollHeight > clientHeight の最初の祖先。
 *   - 保存タイミング: ticker を離れる直前 (= useEffect の cleanup)。
 *   - 復元タイミング: rAF ループで container 高さが savedScrollTop に届くまで毎フレーム再補正 (最大 ~1.8s)。
 *   - sessionStorage キー: `bs:c3:detail:<TICKER>` (ticker 別に分離)。
 *   - スクロール復元は behavior:'instant' (smooth は酔い防止のため不使用)。
 *
 * Trust Cliff 防止: authed 詳細は遅延ロード (チャート/Premium/lazy section) で描画後も height が伸びる。
 *   rAF 2 回 gate では「まだ低い」段階で scrollTo して先頭に飛ぶ (user dogfood 2026-06-09)。
 *   → height が届くまで再補正し続ける rAF ループで追従する (上限 110 frames で無限ループ防止)。
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

    // スクロール復元: authed 詳細は遅延ロード (株価チャート / Premium card / lazy section) で
    // 描画完了後も container の高さが伸び続ける。rAF 2 回 gate だと「まだ低い」段階で scrollTo して
    // 先頭に飛ぶ (user dogfood 2026-06-09)。→ rAF ループで「高さが savedScrollTop に届くまで / 最大 ~1.8s」
    // 毎フレーム scrollTo を再補正し続け、届いたら停止する (遅延ロードで height が伸びる過程を追従)。
    let rafId;
    let cancelled = false;
    if (typeof savedScrollTop === 'number' && savedScrollTop > 0) {
      let frames = 0;
      const MAX_FRAMES = 110; // ~1.8s @60fps (遅延ロード完了を待つ上限、無限ループ防止)
      const correct = () => {
        if (cancelled || !detailRef.current) return;
        const container = findScrollContainer(detailRef.current);
        const maxScroll = container.scrollHeight - container.clientHeight;
        const target = Math.min(savedScrollTop, Math.max(0, maxScroll));
        if (Math.abs(container.scrollTop - target) > 2) {
          container.scrollTo({ top: target, behavior: 'instant' });
        }
        frames += 1;
        // 本体がまだ savedScrollTop に届いていない (= 遅延ロード中) なら次フレームで再補正。
        // 届いた or 上限到達で停止。
        if (frames < MAX_FRAMES && maxScroll < savedScrollTop) {
          rafId = requestAnimationFrame(correct);
        }
      };
      rafId = requestAnimationFrame(correct);
    }

    // cleanup: 次の ticker に移る直前に現在スクロール位置を保存
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (currentTicker && detailRef.current) {
        const container = findScrollContainer(detailRef.current);
        saveScrollTop(currentTicker, container.scrollTop);
      }
    };
  }, [ticker, detailRef]);
}
