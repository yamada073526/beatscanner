/**
 * useHaloSweepOnce — Tier M halo sweep の共通 hook (Phase 2.7 Sprint 1 #1')
 *
 * IntersectionObserver で ref 要素が viewport に入ったとき、
 * data-halo-ready='1' を付与して CSS の halo sweep animation を 1 回だけ発火させる。
 * 920ms 後に data-halo-ready を除去し data-halo-fired='1' を立てて二度目発火を防ぐ。
 *
 * 安全パターン (glow_elevation_postmortem.md / feedback_glow_active_pattern.md 準拠):
 *   - loop animation 禁止 (1 回限り、data-halo-fired guard)
 *   - stagger は IO entry タイミングの自然差 (明示 setTimeout 不要)
 *   - is-arriving / useArrivalSpotlight には一切干渉しない (独立 layer)
 *   - SEC gamification risk 対策: confetti / 派手 burst / 色相変更 禁止
 *   - 5 section 上限 (FiveConditions / Guidance / EarningsHistory / Analyst / QuarterlyHistory)
 *
 * 使用方法:
 *   const ref = useRef(null);
 *   useHaloSweepOnce(ref);
 *   return <div ref={ref} className="panel-card tier-m-glow" ... />;
 *
 * CSS 側で data-halo-ready が付いたとき animation を発火:
 *   .tier-m-glow[data-halo-ready='1'] { ... }  (index.css §tier-m-glow ブロックに定義済)
 */
import { useEffect } from 'react';

// halo sweep animation の継続時間 (CSS animation-duration と一致させること)
// index.css §tier-m-glow: --halo-duration: 920ms
const HALO_DURATION_MS = 920;

/**
 * @param {React.RefObject<HTMLElement>} ref - halo を適用する wrapper 要素の ref
 */
export function useHaloSweepOnce(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 既に 1 回発火済み (例: Strict Mode double-invoke / re-mount) → skip
    if (el.dataset.haloFired === '1') return;

    let timer = null;

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
        timer = setTimeout(() => {
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
      if (timer !== null) clearTimeout(timer);
    };
  // ref.current は mount 時 1 回のみ評価 (deps = [] で意図的)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
