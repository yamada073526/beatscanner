import { useEffect } from 'react';

/**
 * §11-E Arrival Spotlight
 *
 * v52 (intersectionRatio 比較): 大型カードで「画面に少し残った状態」と
 *   「画面に少し入った状態」が両方 ratio≈0.5 になり過去セクションに発光が戻る
 * v53 (中央距離 + hysteresis 16px): hysteresis ロジックの lastDistance 比較が誤りで
 *   切り替わらないケース発生
 * v54: hysteresis 廃止、純粋な「viewport center に最近接の visible leaf」1 枚のみ。
 *      "Aman Resorts 単一スポットライト原則"
 * v62: 単一 → 帯 (band) ベースに変更。viewport 中央 ±BAND_RATIO の Y 帯に
 *      center が入る全 leaf を同時 active 化。同じ row に並ぶ複数カード
 *      (LP 今日の注目 3 チップ / 決算近い 3 件 / Features 3 列 / Pricing 2 列)
 *      で「どれか 1 つだけがランダムに光る」現象を解消。hover 強発光は CSS
 *      compound (.X.is-arriving:hover) 既存 4 セットに任せる (CSS 変更なし)。
 *
 * 設計:
 * - IO は visible 集合管理に専念 (threshold: 0、画面に 1px でも入れば追加)
 * - 帯判定は scroll/resize 駆動の rAF tick で getBoundingClientRect 計算
 * - leaf 優先 (祖先カードは visible に子孫がいれば除外)
 * - dead zone (r.bottom <= 0 || r.top >= vh で完全画面外を除外)
 * - prefers-reduced-motion で hook 自体を作らない
 * - data-spotlight-skip="1" 付き要素は selector で除外
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

    // v62: data-spotlight-skip="1" 付き要素は監視対象外
    const SELECTOR =
      '.surface-card:not([data-spotlight-skip]), .panel-card:not([data-spotlight-skip]), .bs-panel:not([data-spotlight-skip]), .ticker-row-v2.is-expanded:not([data-spotlight-skip]), [data-spotlight="card"]:not([data-spotlight-skip])';
    const visible = new Set();
    // v62: 単一 active → Set 管理 (band 内すべての leaf を同時 active 化)
    const activeSet = new Set();
    let raf = 0;

    // v62: 中央バンドの半幅 (vh 比)。card center がこの距離内なら is-arriving 付与。
    // 0.35 = ±35% = 帯 70% (Pricing 2 列・Features 3 列の row 全てが同時光るのに十分、
    // かつ off-screen 近接カードまで光らない適度な幅)。
    const BAND_RATIO = 0.35;

    const setActive = (el, on) => {
      if (on) {
        if (!activeSet.has(el)) {
          el.classList.add('is-arriving');
          if (import.meta.env?.DEV) el.setAttribute('data-spotlight-active', '1');
          activeSet.add(el);
        }
      } else {
        if (activeSet.has(el)) {
          el.classList.remove('is-arriving');
          if (import.meta.env?.DEV) el.removeAttribute('data-spotlight-active');
          activeSet.delete(el);
        }
      }
    };

    const tick = () => {
      raf = 0;

      const vh = window.innerHeight;
      const cy = vh / 2;
      const band = vh * BAND_RATIO;

      const arr = [...visible];
      // leaf 優先: visible 集合内に子孫がいる先祖は除外 (子だけ光らせる)
      const leaves = arr.filter(
        (el) => !arr.some((other) => other !== el && other.contains(el))
      );
      const leafSet = new Set(leaves);

      // 1) 帯外 / 非 leaf / 不可視 になった active を解除
      for (const el of [...activeSet]) {
        if (!leafSet.has(el)) {
          setActive(el, false);
          continue;
        }
        const r = el.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= vh || r.height < 8) {
          setActive(el, false);
          continue;
        }
        const ec = r.top + r.height / 2;
        if (Math.abs(ec - cy) > band) {
          setActive(el, false);
        }
      }

      // 2) 帯内 leaf を active 化 (重複 add は setActive で吸収)
      for (const el of leaves) {
        const r = el.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= vh) continue;
        if (r.height < 8) continue;
        const ec = r.top + r.height / 2;
        if (Math.abs(ec - cy) <= band) {
          setActive(el, true);
        }
      }
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
      // v62: activeSet 全要素から is-arriving を除去
      for (const el of activeSet) {
        el.classList.remove('is-arriving');
        if (import.meta.env?.DEV) el.removeAttribute('data-spotlight-active');
      }
      activeSet.clear();
      if (import.meta.env?.DEV) {
        document.querySelectorAll('[data-spotlight-debug]').forEach((el) =>
          el.removeAttribute('data-spotlight-debug')
        );
      }
      visible.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
