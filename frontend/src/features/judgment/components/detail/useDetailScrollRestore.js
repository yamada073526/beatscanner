/**
 * useDetailScrollRestore — C-3 競合ナビ Sprint 1b (scroll 復元のみ)
 * パンくずで祖先 ticker に戻ったとき、スクロール位置を復元する hook。
 *
 * 設計 (SPEC 2026-06-09 §5 Sprint 1b、v194-3 で保存方式を作り直し):
 *   - scroll container 特定: .ds-judgment-detail の祖先で overflowY: auto|scroll の最初の要素。
 *     (旧版は scrollHeight>clientHeight も条件にしていたが、遅延ロードで mount 時に content が短いと
 *      false になり document.documentElement に誤フォールバックするため overflow ベースに緩和。)
 *   - 保存タイミング: ★在席中に scroll するたび連続保存 (debounce 120ms)。
 *     旧版は cleanup (ticker を離れる時) に保存していたが、cleanup は「DOM が次 ticker に swap +
 *     ナビ時のトップ scroll 済」の後に走るため scrollTop=0 を保存し、戻ると先頭に飛んでいた
 *     (user dogfood 2026-06-09 の真因)。→ 在席中に連続保存して「離れる前の本当の位置」を確保し、
 *     ナビ時の 0-scroll は cleanup で listener 除去 + pending timer clear して保存させない。
 *   - 復元タイミング: rAF ループで container 高さが savedScrollTop に届くまで毎フレーム再補正 (最大 ~1.8s)。
 *     authed 詳細は遅延ロード (チャート/Premium/lazy section) で描画後も height が伸びるため、
 *     height が伸びる過程を追従して目標位置まで段階的に scroll する。
 *   - sessionStorage キー: `bs:c3:detail:<TICKER>` (ticker 別に分離、F5/タブ閉じで消える)。
 *   - スクロール復元は behavior:'instant' (smooth は酔い防止のため不使用)。
 *
 * ⚠️ accordion 開閉復元は本 Phase では DEFER (autopilot v194 判断、handover DEFER-SPEC 参照)。
 *
 * @param {string|null} ticker   — 現在表示中の ticker (selectedTicker)
 * @param {React.RefObject} detailRef — .ds-judgment-detail の DOM ref
 */
import { useEffect } from 'react';

const STORAGE_PREFIX = 'bs:c3:detail:';
const SAVE_DEBOUNCE_MS = 120;
const RESTORE_MAX_FRAMES = 110; // ~1.8s @60fps (遅延ロード完了を待つ上限、無限ループ防止)

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
 * .ds-judgment-detail から上方向に辿り、scroll container を探す。
 * overflowY: auto|scroll の最初の祖先を採用する。実際に scroll している (scrollHeight>clientHeight)
 * 要素を優先しつつ、遅延ロードでまだ短い場合も overflow 親を返す (mount 時の誤フォールバック防止)。
 * 見つからなければ document.documentElement。
 *
 * @param {HTMLElement} detailEl
 * @returns {HTMLElement}
 */
function findScrollContainer(detailEl) {
  if (!detailEl) return document.documentElement;
  let el = detailEl.parentElement;
  let firstOverflow = null;
  while (el && el !== document.documentElement) {
    const oy = window.getComputedStyle(el).overflowY;
    if (oy === 'auto' || oy === 'scroll') {
      if (!firstOverflow) firstOverflow = el;
      if (el.scrollHeight > el.clientHeight) return el; // 実際に scroll している container を優先
    }
    el = el.parentElement;
  }
  return firstOverflow || document.documentElement;
}

export function useDetailScrollRestore(ticker, detailRef) {
  useEffect(() => {
    if (!ticker || !detailRef.current) return undefined;

    const currentTicker = ticker;
    const container = findScrollContainer(detailRef.current);
    const savedScrollTop = loadSavedScrollTop(currentTicker);

    let cancelled = false;
    let rafId;
    let saveTimer;
    // 復元中は scroll 保存を抑制 (復元途中の partial 値で正解を上書きしないため)。
    let restoring = typeof savedScrollTop === 'number' && savedScrollTop > 0;

    // --- 継続保存: 在席中に scroll するたび現在位置を保存 (debounce) ---
    const onScroll = () => {
      if (restoring) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveScrollTop(currentTicker, container.scrollTop), SAVE_DEBOUNCE_MS);
    };
    container.addEventListener('scroll', onScroll, { passive: true });

    // --- 復元: 遅延ロードで height が伸びる過程を追従し savedScrollTop に届くまで再補正 ---
    if (restoring) {
      let frames = 0;
      const correct = () => {
        if (cancelled) return;
        const maxScroll = container.scrollHeight - container.clientHeight;
        const target = Math.min(savedScrollTop, Math.max(0, maxScroll));
        if (Math.abs(container.scrollTop - target) > 2) {
          container.scrollTo({ top: target, behavior: 'instant' });
        }
        frames += 1;
        if (frames < RESTORE_MAX_FRAMES && maxScroll < savedScrollTop) {
          rafId = requestAnimationFrame(correct);
        } else {
          restoring = false; // 復元完了 (or 上限) → 以後の user scroll を保存再開
        }
      };
      rafId = requestAnimationFrame(correct);
    }

    // cleanup: listener 除去 + pending 保存 cancel (ナビ時のトップ scroll(0) を保存させない) + rAF 停止
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      clearTimeout(saveTimer);
      container.removeEventListener('scroll', onScroll);
    };
  }, [ticker, detailRef]);
}
