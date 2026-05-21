/**
 * useHaloSweepOnce — Tier M halo sweep の共通 hook (Phase 2.7 Sprint 1 #1')
 *
 * IntersectionObserver で ref 要素が viewport に入ったとき、
 * data-halo-ready='1' を付与して CSS の halo sweep animation を 1 回だけ発火させる。
 * 920ms 後に data-halo-ready を除去し data-halo-fired='1' を立てて二度目発火を防ぐ。
 *
 * Phase 2.8 Sprint 1 #3 追加: triggerOnAccordionOpen()
 *   accordion (AccordionSection) に閉じ込められた section は IO が発火しないため、
 *   accordion open 時に 1 回限り halo を発火させる経路を追加。
 *   data-halo-fired guard で 2 回目発火防止を維持。
 *
 * 安全パターン (glow_elevation_postmortem.md / feedback_glow_active_pattern.md 準拠):
 *   - loop animation 禁止 (1 回限り、data-halo-fired guard)
 *   - stagger は IO entry タイミングの自然差 (明示 setTimeout 不要)
 *   - is-arriving / useArrivalSpotlight には一切干渉しない (独立 layer)
 *   - SEC gamification risk 対策: confetti / 派手 burst / 色相変更 禁止
 *   - 5 section 上限 (FiveConditions / Guidance / EarningsHistory / Analyst / QuarterlyHistory)
 *   - PGE 落とし穴 #4: animation-iteration-count: 1 確認済 (halo-sweep keyframe は 1 forwards)
 *
 * 使用方法:
 *   const ref = useRef(null);
 *   const { triggerOnAccordionOpen } = useHaloSweepOnce(ref);
 *   // accordion の AccordionSection に onOpenChange 経由で渡す:
 *   // onOpenChange={(id, isOpen) => { if (isOpen) triggerOnAccordionOpen(); }}
 *
 * CSS 側で data-halo-ready が付いたとき animation を発火:
 *   .tier-m-glow[data-halo-ready='1'] { ... }  (index.css §tier-m-glow ブロックに定義済)
 */
import { useEffect, useRef, useCallback } from 'react';

// halo sweep animation の継続時間 (CSS animation-duration と一致させること)
// index.css §tier-m-glow: halo-sweep animation 900ms + 20ms buffer
const HALO_DURATION_MS = 920;

/**
 * @param {React.RefObject<HTMLElement>} ref - halo を適用する wrapper 要素の ref
 * @returns {{ triggerOnAccordionOpen: () => void }} accordion open 時の手動 trigger 関数
 */
export function useHaloSweepOnce(ref) {
  // timer ref: cleanup で clearTimeout できるよう保持 (複数 timer の安全管理)
  const timerRef = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 既に 1 回発火済み (例: Strict Mode double-invoke / re-mount) → skip
    if (el.dataset.haloFired === '1') return;

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting) return;
        // 二重発火ガード
        if (el.dataset.haloFired === '1') {
          io.disconnect();
          return;
        }
        io.disconnect();

        // CSS animation 発火
        el.dataset.haloReady = '1';

        // HALO_DURATION_MS 後に ready 除去 → fired フラグ立て
        timerRef.current = setTimeout(() => {
          el.removeAttribute('data-halo-ready');
          el.dataset.haloFired = '1';
        }, HALO_DURATION_MS);
      },
      {
        // 要素が上下 10% マージン内で 15% 以上 visible になったら発火
        rootMargin: '-10% 0px -10% 0px',
        threshold: 0.15,
      }
    );

    io.observe(el);

    // cleanup: unmount 時に observer 解除 + timer キャンセル
    return () => {
      io.disconnect();
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  // ref.current は mount 時 1 回のみ評価 (deps = [] で意図的)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Phase 2.8 Sprint 1 #3: accordion open 時に呼ぶ手動 trigger。
   * data-halo-fired='1' が既に立っている場合は何もしない (1 回限り保証)。
   * PGE 落とし穴 #4: halo-sweep keyframe は animation-iteration-count: 1 forwards のため
   * この trigger が複数回呼ばれても CSS 側で安全 (fired guard で JS 側も 1 回制限)。
   */
  const triggerOnAccordionOpen = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 既に発火済み → skip (1 回限り保証)
    if (el.dataset.haloFired === '1') return;
    // ready 中なら再発火しない
    if (el.dataset.haloReady === '1') return;

    // CSS animation 発火
    el.dataset.haloReady = '1';

    // HALO_DURATION_MS 後に ready 除去 → fired フラグ立て
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      el.removeAttribute('data-halo-ready');
      el.dataset.haloFired = '1';
      timerRef.current = null;
    }, HALO_DURATION_MS);
  // ref は stable (useRef)、timerRef も stable (useRef)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { triggerOnAccordionOpen };
}
