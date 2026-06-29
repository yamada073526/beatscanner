/**
 * Pane3TOC — v6 IA: 章ジャンプ目次（sticky 上部バー + 番号付き chip + scroll-spy）
 *
 * 2026-06-30 dogfood 反映（A案 = sticky 上部バー × 番号付き chip × scroll-spy）:
 *   - 「ON THIS PAGE」ラベルを撤去（5原則① テキストを読ませない）。
 *   - 各 chip に gold ミニ番号バッジ ①〜⑤ を付け、本文の章番号 gold 円バッジと視覚言語を共有
 *     →「番号付き＝章の索引」と即伝わる（番号連続性）。
 *   - sticky 上部バー（position:sticky; top:0）でスクロール中も常時可視。
 *   - scroll-spy（IntersectionObserver）で現在表示中の章 chip を gold ハイライト
 *     →「動く＝ナビ」+「現在地」が伝わる（毎日開きたくなる）。
 *
 * 設計ルール:
 *   - active chip の文字は var(--text-primary)、gold は border/bg のみ（WCAG AA 確保。
 *     gold-dark 文字は dark 背景で AA 割れの恐れ・UI/UX review 指摘）。
 *   - native href="#id" は内側スクロールで無効 → smoothScrollToElement を使用（§5-4）。
 *   - アンカー先が fold 時は fold を auto-open してから scroll。
 *   - sticky bg は backdrop blur + 1px border-bottom（フェード境界は隠さず 1px で意図的に区切る
 *     = CLAUDE.md「触ると危険」backdrop-filter ルール）。
 *   - a11y: 現在地 chip に aria-current="location"、href="#id" で keyboard nav。
 *   - prefers-reduced-motion: transition 無効化（gold ハイライト自体は維持）。
 *   - isNonEquity 時は決算 / テクニカル章を目次から除外。
 *
 * testid: 全 render path（main のみ、空はなし）に data-testid 付与。
 */
import { useEffect, useRef, useState } from 'react';
import { smoothScrollToElement } from '../../../../../lib/smoothScroll.js';

const TESTID = 'pane3-toc';

// 目次エントリー定義（本文 §①〜⑤ 章構成に対応）。no = 章番号（本文 gold バッジと 1:1）。
// isEquityOnly: true の場合、非 equity 時は目次から除外。
const TOC_ENTRIES = [
  { id: 'v6-earnings-section',   label: '決算',              no: 1, isEquityOnly: true  },
  { id: 'v6-quality-section',    label: '品質・継続性',       no: 2, isEquityOnly: false },
  { id: 'v6-technical-section',  label: 'テクニカル・買い場', no: 3, isEquityOnly: true  },
  { id: 'v6-figure-section',     label: '図解',              no: 4, isEquityOnly: false },
  { id: 'v6-more-section',       label: 'その他',            no: 5, isEquityOnly: false },
];

const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
};

// 最寄りのスクロール祖先を返す（IntersectionObserver の root + sticky の文脈）。
// workspace Pane 3 はペイン内 scroll、SPA は window（null）。
function getScrollParent(el) {
  let p = el?.parentElement;
  while (p) {
    let oy;
    try { oy = getComputedStyle(p).overflowY; } catch { oy = ''; }
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return null; // viewport
}

// sticky 上部バー: backdrop blur + 1px border-bottom（フェード境界を 1px で意図的に区切る）。
const stickyNavStyle = {
  position: 'sticky',
  top: 0,
  zIndex: 10,
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
  alignItems: 'center',
  padding: 'var(--space-2, 8px) 0',
  background: 'color-mix(in srgb, var(--bg-primary) 85%, transparent)',
  backdropFilter: 'saturate(180%) blur(12px)',
  WebkitBackdropFilter: 'saturate(180%) blur(12px)',
  borderBottom: '1px solid var(--border)',
};

const chipBaseStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '4px 11px',
  background: 'var(--bg-subtle)',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 500,
  textDecoration: 'none',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};
const chipHoverStyle = {
  ...chipBaseStyle,
  color: 'var(--text-primary)',
  borderColor: 'var(--border-strong, rgba(255,255,255,0.14))',
};
// active: 文字は text-primary（AA 確保）、gold は border/bg のみ。
const chipActiveStyle = {
  ...chipBaseStyle,
  color: 'var(--text-primary)',
  fontWeight: 700,
  borderColor: 'color-mix(in srgb, var(--color-gold) 55%, transparent)',
  background: 'color-mix(in srgb, var(--color-gold) 16%, transparent)',
};

// 番号ミニバッジ（本文 .chapter-h .no と同 idiom の縮小版）。
const numBaseStyle = {
  display: 'inline-grid',
  placeItems: 'center',
  width: 15,
  height: 15,
  flexShrink: 0,
  borderRadius: '50%',
  fontSize: 9,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--color-gold)',
  background: 'color-mix(in srgb, var(--color-gold) 12%, transparent)',
  border: '1px solid color-mix(in srgb, var(--color-gold) 30%, transparent)',
};
const numActiveStyle = {
  ...numBaseStyle,
  background: 'color-mix(in srgb, var(--color-gold) 22%, transparent)',
  borderColor: 'color-mix(in srgb, var(--color-gold) 45%, transparent)',
};

/**
 * fold を auto-open してから scroll（SPEC §5-5）。
 * @param {Element} target
 */
function openFoldAndScroll(target) {
  if (!target) return;
  const fold = target.closest('details');
  if (fold && !fold.open) fold.open = true;
  const foldWrapper = target.closest('[data-fold-container]');
  if (foldWrapper) {
    foldWrapper.dispatchEvent(new CustomEvent('fold-open-request', { bubbles: true }));
  }
  requestAnimationFrame(() => { smoothScrollToElement(target, { offset: 80 }); });
}

/**
 * @param {object} props
 * @param {boolean} [props.isNonEquity] - 非 equity 時は決算 / テクニカル を除外
 * @param {HTMLElement|null} [props.detailRoot] - scroll / query の起点 (.ds-judgment-detail)
 */
export default function Pane3TOC({ isNonEquity = false, detailRoot = null }) {
  const entries = TOC_ENTRIES.filter(e => !isNonEquity || !e.isEquityOnly);
  const navRef = useRef(null);
  const [activeId, setActiveId] = useState(entries[0]?.id || null);
  const [hoveredId, setHoveredId] = useState(null);
  const noTransition = prefersReducedMotion();

  // query / scroll の起点（detailRoot 未指定時は自分の closest .ds-judgment-detail）。
  const rootEl = () => detailRoot || navRef.current?.closest('.ds-judgment-detail') || document;

  // scroll-spy: 表示中の章を active 化（IntersectionObserver, root = スクロール祖先）。
  useEffect(() => {
    const navEl = navRef.current;
    if (!navEl) return undefined;
    const r = rootEl();
    const ioRoot = getScrollParent(navEl); // null = viewport（SPA fallback）
    const sectionEls = entries
      .map(e => r.querySelector(`[data-testid="${e.id}"]`) || r.querySelector(`#${e.id}`))
      .filter(Boolean);
    if (sectionEls.length === 0) return undefined;
    const io = new IntersectionObserver((ents) => {
      const visible = ents.filter(en => en.isIntersecting);
      if (visible.length === 0) return;
      // 画面上部に最も近い（top が最小の）intersecting section を現在地に。
      visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      const t = visible[0].target;
      const id = t.getAttribute('data-testid') || t.id;
      if (id) setActiveId(id);
    }, { root: ioRoot, rootMargin: '-15% 0px -70% 0px', threshold: 0 });
    sectionEls.forEach(s => io.observe(s));
    return () => io.disconnect();
    // isNonEquity 変化で entries が変わるため依存に含める（detailRoot は mount 後安定）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNonEquity, detailRoot]);

  const handleClick = (e, id) => {
    e.preventDefault();
    const r = rootEl();
    const target = r.querySelector(`[data-testid="${id}"]`) || r.querySelector(`#${id}`);
    if (target) openFoldAndScroll(target);
  };

  return (
    <nav
      ref={navRef}
      data-testid={TESTID}
      aria-label="ページ内目次"
      style={stickyNavStyle}
    >
      {entries.map(({ id, label, no }) => {
        const active = id === activeId;
        const hovered = id === hoveredId && !active;
        const style = active ? chipActiveStyle : hovered ? chipHoverStyle : chipBaseStyle;
        return (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => handleClick(e, id)}
            onMouseEnter={() => setHoveredId(id)}
            onMouseLeave={() => setHoveredId(null)}
            style={noTransition ? style : { ...style, transition: 'border-color 0.15s, color 0.15s, background 0.15s' }}
            data-testid={`${TESTID}-${id}`}
            aria-label={`${label}セクションへ移動`}
            aria-current={active ? 'location' : undefined}
          >
            <span style={active ? numActiveStyle : numBaseStyle} aria-hidden="true">{no}</span>
            {label}
          </a>
        );
      })}
    </nav>
  );
}
