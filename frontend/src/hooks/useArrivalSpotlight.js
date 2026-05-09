import { useEffect } from 'react';

/**
 * §11-E v54: Arrival Spotlight (Aman Resorts 単一スポットライト原則)
 *
 * v52 (intersectionRatio 比較): 大型カードで「画面に少し残った状態」と
 *   「画面に少し入った状態」が両方 ratio≈0.5 になり過去セクションに発光が戻る
 * v53 (中央距離 + hysteresis 16px): hysteresis ロジックの lastDistance 比較が誤りで
 *   切り替わらないケース発生
 * v54 (本版): hysteresis 廃止、純粋な「viewport center に最近接の visible leaf」のみ。
 *
 * 設計:
 * - IO は visible 集合管理に専念 (threshold: 0、画面に 1px でも入れば追加)
 * - active 判定は scroll/resize 駆動の rAF tick で getBoundingClientRect の中央距離計算
 * - leaf 優先 (祖先カードは visible に子孫がいれば除外)
 * - dead zone (r.bottom <= 0 || r.top >= vh で完全画面外を除外)
 * - prefers-reduced-motion で hook 自体を作らない
 * - DEV 時は data-spotlight-active="1" / data-spotlight-debug="1" 属性で可視化
 */
export function useArrivalSpotlight(deps = []) {
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const SELECTOR =
      '.surface-card, .panel-card, .bs-panel, .ticker-row-v2.is-expanded, [data-spotlight="card"]';
    const visible = new Set();
    let active = null;
    let raf = 0;

    const tick = () => {
      raf = 0;
      if (!visible.size) {
        if (active) {
          active.classList.remove('is-arriving');
          if (import.meta.env?.DEV) active.removeAttribute('data-spotlight-active');
          active = null;
        }
        return;
      }

      const vh = window.innerHeight;
      const cy = vh / 2;
      const arr = [...visible];

      // leaf 優先: visible 集合内に子孫がいる先祖は除外 (子だけ光らせる)
      const leaves = arr.filter(
        (el) => !arr.some((other) => other !== el && other.contains(el))
      );

      let best = null;
      let bestDist = Infinity;
      for (const el of leaves) {
        const r = el.getBoundingClientRect();
        // dead zone: 完全に画面外 (上に抜けた / 下に未到達) は候補外
        if (r.bottom <= 0 || r.top >= vh) continue;
        // 高さ 0 (display:none) や極小は除外
        if (r.height < 8) continue;
        const ec = r.top + r.height / 2;
        const dist = Math.abs(ec - cy);
        if (dist < bestDist) {
          bestDist = dist;
          best = el;
        }
      }

      if (best === active) return;
      if (active) {
        active.classList.remove('is-arriving');
        if (import.meta.env?.DEV) active.removeAttribute('data-spotlight-active');
      }
      if (best) {
        best.classList.add('is-arriving');
        if (import.meta.env?.DEV) best.setAttribute('data-spotlight-active', '1');
      }
      active = best;
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            visible.add(e.target);
            if (import.meta.env?.DEV) e.target.setAttribute('data-spotlight-debug', '1');
          } else {
            visible.delete(e.target);
            if (import.meta.env?.DEV) e.target.removeAttribute('data-spotlight-debug');
          }
        }
        schedule();
      },
      { rootMargin: '0px', threshold: 0 }
    );

    const observed = new WeakSet();
    const observeAll = () => {
      document.querySelectorAll(SELECTOR).forEach((el) => {
        if (observed.has(el)) return;
        observed.add(el);
        io.observe(el);
      });
    };
    observeAll();

    // タブ切替や非同期描画でカードが後から増えた場合に追従
    const mo = new MutationObserver(() => observeAll());
    mo.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    schedule(); // 初期計算

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      mo.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (active) {
        active.classList.remove('is-arriving');
        if (import.meta.env?.DEV) active.removeAttribute('data-spotlight-active');
      }
      if (import.meta.env?.DEV) {
        document.querySelectorAll('[data-spotlight-debug]').forEach((el) =>
          el.removeAttribute('data-spotlight-debug')
        );
      }
      active = null;
      visible.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
