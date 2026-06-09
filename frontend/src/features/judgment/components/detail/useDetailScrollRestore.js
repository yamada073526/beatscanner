/**
 * useDetailScrollRestore — C-3 競合ナビ Sprint 1b (scroll 復元のみ)
 * パンくずで祖先 ticker に戻ったとき、スクロール位置を復元する hook。
 *
 * 設計の変遷 (user dogfood 2026-06-09):
 *   v1: cleanup で scrollTop 保存 → cleanup は DOM swap + ナビ時トップ scroll 後に走り 0 を保存(先頭に飛ぶ)。
 *   v2: 在席中に scroll 連続保存 → が、effect が loading skeleton 段階(detailRef 未mount)で early-return し
 *       listener が一生 attach されず保存ゼロ。→ div mount まで rAF で待って attach。
 *   v3 (本実装): ★ピクセル scrollTop でなく「ビューポート上端にあった section 要素」をアンカーとして保存し、
 *       戻った時にそのアンカーが同じ viewport offset に来るよう合わせ続ける。
 *       理由: 戻ると遅延ロード section が未ロードに戻り上部の高さが縮むため、同じ scrollTop が
 *       「より下」を指して若干下にズレる (user 指摘: 戻ると来期コンセンサスゲージが scroll-up で再発火)。
 *       アンカー要素は高さ変化に対して安定なので、遅延ロードで上が伸びても追従して正確に復元できる。
 *
 * アンカー = detail 全体に常時描画される `[id^="sec-"]` wrapper (sec-profile/chart/target-and-zone/
 *   earnings-reaction/insider/news/ir/10k/report 等)。content が lazy/collapsed でも wrapper は存在。
 *
 * - 保存: 在席中の scroll ごと (debounce)。viewport 上端に最も近い sec-* の id + offset を保存。
 *   ナビ時のトップ scroll(0) は cleanup で listener 除去 + pending timer clear して保存させない。
 * - 復元: rAF ループでアンカーを同じ offset に合わせ続ける (遅延ロードで上が伸びる過程を追従)。
 *   安定 8 frame or 上限 110 frame(~1.8s) で停止。アンカーが見つからなければ scrollTop fallback。
 * - sessionStorage キー: `bs:c3:detail:<TICKER>` (F5/タブ閉じで消える)。behavior:'instant'。
 *
 * ⚠️ accordion 開閉復元は DEFER (autopilot v194 判断、handover DEFER-SPEC 参照)。
 *
 * @param {string|null} ticker   — 現在表示中の ticker (selectedTicker)
 * @param {React.RefObject} detailRef — .ds-judgment-detail の DOM ref
 */
import { useEffect } from 'react';

const STORAGE_PREFIX = 'bs:c3:detail:';
const RESTORE_MAX_FRAMES = 110; // ~1.8s @60fps (遅延ロード完了を待つ上限、無限ループ防止)
const STABLE_FRAMES = 8;        // diff~0 がこの frame 数続いたら復元完了とみなす

/** sessionStorage から ticker の保存状態 {scrollTop, anchorId, anchorDelta} を読む。なければ null */
function loadSavedState(ticker) {
  if (!ticker) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + ticker.toUpperCase());
    if (!raw) return null;
    const p = JSON.parse(raw);
    return typeof p?.scrollTop === 'number' ? p : null;
  } catch {
    return null;
  }
}

/** sessionStorage に ticker の現在状態を書く */
function saveState(ticker, state) {
  if (!ticker) return;
  try {
    sessionStorage.setItem(STORAGE_PREFIX + ticker.toUpperCase(), JSON.stringify(state));
  } catch {
    // private mode 等はサイレント無視
  }
}

/**
 * .ds-judgment-detail から上方向に辿り scroll container を探す。
 * overflowY: auto|scroll の最初の祖先 (scroll している要素を優先、遅延で短い場合も overflow 親を返す)。
 */
function findScrollContainer(detailEl) {
  if (!detailEl) return document.documentElement;
  let el = detailEl.parentElement;
  let firstOverflow = null;
  while (el && el !== document.documentElement) {
    const oy = window.getComputedStyle(el).overflowY;
    if (oy === 'auto' || oy === 'scroll') {
      if (!firstOverflow) firstOverflow = el;
      if (el.scrollHeight > el.clientHeight) return el;
    }
    el = el.parentElement;
  }
  return firstOverflow || document.documentElement;
}

/** container の viewport 上端に最も近い [id^="sec-"] アンカーの {id, delta} を返す。なければ null */
function captureAnchor(container) {
  const containerTop = container.getBoundingClientRect().top;
  let best = null;
  container.querySelectorAll('[id^="sec-"]').forEach((el) => {
    if (!el.id) return;
    const top = el.getBoundingClientRect().top - containerTop;
    const score = Math.abs(top);
    if (!best || score < best.score) best = { id: el.id, delta: top, score };
  });
  return best ? { anchorId: best.id, anchorDelta: best.delta } : { anchorId: null, anchorDelta: 0 };
}

export function useDetailScrollRestore(ticker, detailRef) {
  useEffect(() => {
    if (!ticker) return undefined;

    const currentTicker = ticker;
    const saved = loadSavedState(currentTicker);

    let cancelled = false;
    let rafId;
    let mountRafId;
    let saveInterval;
    // 復元中は保存を抑制 (復元途中の partial 値で正解を上書きしないため)。
    let restoring = !!saved && (saved.scrollTop > 0 || !!saved.anchorId);
    let lastSavedTop = -1;

    // container は「掴んだ後に遅延ロードで scrollable 化する / 別要素になる」flakiness があるため
    // 毎回 detailRef から解決し直す (mount 時 1 回 capture だと listener が別要素に付き保存ゼロになる、
    // user dogfood 2026-06-09 4th で headless 実測した真因)。
    const getContainer = () => (detailRef.current ? findScrollContainer(detailRef.current) : null);

    // div が mount するまで rAF で待つ (loading skeleton 中は detailRef 未mount、上限 ~5s)
    let mountFrames = 0;
    const MOUNT_MAX_FRAMES = 300;

    const start = () => {
      if (cancelled) return;
      if (!detailRef.current) {
        if (mountFrames++ < MOUNT_MAX_FRAMES) mountRafId = requestAnimationFrame(start);
        return;
      }

      // --- 継続保存: scroll イベント依存をやめ interval で container を解決し直して保存 (堅牢化) ---
      saveInterval = setInterval(() => {
        if (restoring || cancelled) return;
        const c = getContainer();
        if (!c) return;
        const st = c.scrollTop;
        if (st === lastSavedTop) return; // 変化なしは skip
        lastSavedTop = st;
        saveState(currentTicker, { scrollTop: st, ...captureAnchor(c) });
      }, 250);

      // --- 復元: アンカーを同じ offset に合わせ続ける (遅延ロードで上が伸びる過程を追従) ---
      if (restoring) {
        let frames = 0;
        let stable = 0;
        const correct = () => {
          if (cancelled) return;
          const container = getContainer();
          if (!container) { rafId = requestAnimationFrame(correct); return; }
          let diff = null;
          // アンカー優先: 保存した sec-* が同じ viewport offset に来るよう合わせる
          if (saved.anchorId) {
            const el = document.getElementById(saved.anchorId);
            if (el) {
              const containerTop = container.getBoundingClientRect().top;
              const currentTop = el.getBoundingClientRect().top - containerTop;
              diff = currentTop - saved.anchorDelta;
              if (Math.abs(diff) > 2) container.scrollTop += diff;
            }
          }
          // fallback: アンカー未発見なら pixel scrollTop で復元
          if (diff === null) {
            const maxScroll = container.scrollHeight - container.clientHeight;
            const target = Math.min(saved.scrollTop, Math.max(0, maxScroll));
            diff = container.scrollTop - target;
            if (Math.abs(diff) > 2) container.scrollTo({ top: target, behavior: 'instant' });
          }
          frames += 1;
          stable = Math.abs(diff) <= 2 ? stable + 1 : 0;
          if (stable < STABLE_FRAMES && frames < RESTORE_MAX_FRAMES) {
            rafId = requestAnimationFrame(correct);
          } else {
            restoring = false; // 復元完了 (or 上限) → 以後 interval 保存を再開
          }
        };
        rafId = requestAnimationFrame(correct);
      }
    };
    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(mountRafId);
      clearInterval(saveInterval);
    };
  }, [ticker, detailRef]);
}
