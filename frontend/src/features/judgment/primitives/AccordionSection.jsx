/**
 * AccordionSection primitive
 *
 * Sprint 4 (Phase 2): 案5 accordion expansion spring を追加。
 *   panel の height: auto を framer-motion spring (SPRING_SOFT) で 320ms animate する。
 *   内部 logic (toggle / aria / keyboard) は不変。
 *   CSS の clip-path animation (acc-expand) は framer-motion と共存。
 *   prefers-reduced-motion: useReducedMotion() true → animate 無効 (高さ即変化)。
 *
 *   feedback_motion_timing_recipes.md SPRING_SOFT preset:
 *     { type: 'spring', stiffness: 220, damping: 28 }
 *   PGE 落とし穴 4: infinite animation 禁止 → open/close で完結 → OK
 */
import React, { useState, useCallback, useEffect, useId, useRef } from 'react';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import styles from './AccordionSection.module.css';
import { useWorkspaceStore } from '../../../state/workspaceStore.js';

// ─── C-3 競合ナビ scroll 復元: accordion 開閉状態を ticker 別に保持 (user dogfood 2026-06-09) ───
//   祖先 ticker に戻った時に accordion が defaultOpen に戻り、height が変わって scroll がズレる問題の解消。
//   uncontrolled な accordion のみ対象 (controlledOpen=Sprint 5 condition-click は外部管理で不干渉)。
//   sessionStorage (F5 で残り、タブ閉じで消える)。キー: bs:c3:acc:<TICKER>:<id>。
const ACC_PREFIX = 'bs:c3:acc:';
function loadAccOpen(ticker, id) {
  if (!ticker || !id) return null;
  try {
    const v = sessionStorage.getItem(`${ACC_PREFIX}${String(ticker).toUpperCase()}:${id}`);
    return v === null ? null : v === 'true';
  } catch {
    return null;
  }
}
function saveAccOpen(ticker, id, open) {
  if (!ticker || !id) return;
  try {
    sessionStorage.setItem(`${ACC_PREFIX}${String(ticker).toUpperCase()}:${id}`, open ? 'true' : 'false');
  } catch {
    // private mode 等はサイレント無視
  }
}

/**
 * AccordionSection primitive
 *
 * Sprint 2: SPEC_2026-05-19_scroll-hierarchy.md §5 Sprint 2 で新規作成。
 * Pane 3 判定詳細の既定畳み / 1-click 展開を担う安全な wrapper component。
 *
 * 設計原則 (design_recipes.md §C-1 / §C-5):
 *   - glow host にならない: bs-panel / surface-card / panel-card クラスを自身に付与しない
 *   - children (既存 panel-card を持つ各 component) に border-radius を委ねる
 *   - SectionHeader の typography token を mimic (import / 継承禁止、同 token で実装)
 *   - accordion header に常時 cyan tint 禁止 (feedback_no_baseline_cyan.md 遵守)
 *
 * View Transitions API (design_recipes.md §C-7 Modern Pattern Mandate):
 *   - document.startViewTransition() で開閉 cross-fade (CLS 0)
 *   - 未対応 browser fallback: clip-path: inset(0 0 100% 0) → inset(0) CSS transition
 *   - prefers-reduced-motion: reduce で transition: none
 *
 * feature flag:
 *   - localStorage.pane3_scroll_v1='1' で旧 flat 配置に切替可能なインターフェースを提供
 *     (Sprint 3 の JudgmentDetail.jsx 側で切替実装を行う。本 sprint では interface のみ)
 *   - controlledOpen prop で Sprint 5 の workspaceStore と連動可能 (外部制御インターフェース)
 *
 * a11y:
 *   - aria-expanded button / keyboard Enter+Space / focus-visible gold ring (§0 基準 #5)
 *
 * Props:
 *   id: string             — section の DOM id (必須、deep link / pulse 連携用)
 *   title: string          — 折りたたみ header のタイトルテキスト (LLM narration 禁止、静的 label のみ)
 *   label: string          — 右側 small caps ラベル (例: "PREMIUM" / "PRO")
 *   badge: ReactNode       — title 右の badge (例: "(N件)" カウント chip)
 *   defaultOpen: boolean   — 既定の展開状態 (default: false = collapsed)
 *   controlledOpen: bool   — 外部制御フラグ (Sprint 5 workspaceStore 連動用)
 *   onOpenChange: fn       — 開閉変更コールバック (id, isOpen) => void
 *   tier: 1|2|3            — 階層識別 (1=Verdict, 2=Fundamentals, 3=Context)
 *                            tier=3 は context-tier クラスで border-bottom only elevation
 *   badgeColor: string     — badge background color (optional)。 渡された時のみ colored chip 表示
 *                            (white text + bg + 4px radius)、 未指定なら text-muted plain
 *   streaming: boolean     — header 右端に 「生成中...」 pulse 表示 (optional、 LLM streaming 状態用)
 *   children: ReactNode    — 展開時に表示するコンテンツ
 */
export default function AccordionSection({
  id,
  title,
  label,
  badge = null,
  badgeColor,
  streaming = false,
  defaultOpen = false,
  controlledOpen,
  onOpenChange,
  tier = 2,
  // v190 (3体合議): title を呼び出し側で上書きする style (例: v5 会社概要を L2 セクション冠の外観に統一)。
  //   省略時 undefined → AccordionSection.module.css の既定 .title スタイル (他 accordion 不変)。
  titleStyle = undefined,
  // v191 (3体合議 A1): 折りたたみ chevron の配置。'right' で headerRight に寄せ title 左端を L2 冠と揃える
  //   (整列原則、design_recipes §C-11)。ghost 表示で「畳める」 を密やかに伝える。省略時 'left' で他章 accordion 完全不変。
  chevronPosition = 'left',
  children,
  ...rest
}) {
  // feature flag: pane3_scroll_v1='1' のとき AccordionSection は透過的にレンダーする
  // (JudgmentDetail.jsx 側 wrap 条件 + 本 flag で 2 重チェック、Sprint 3 完成形)
  const isLegacyMode = (() => {
    try {
      return (
        typeof window !== 'undefined' &&
        window.localStorage?.getItem('pane3_scroll_v1') === '1'
      );
    } catch {
      return false;
    }
  })();

  // Sprint 4: prefers-reduced-motion 対応 (案5 accordion spring)
  const reduce = useReducedMotion();

  // isControlled: Sprint 5 で workspaceStore が controlledOpen を渡す想定
  const isControlled = typeof controlledOpen === 'boolean';
  // C-3: 現在 ticker (persisted 開閉状態の key)。
  const activeTicker = useWorkspaceStore((s) => s.activeTicker);
  // C-3: 初期開閉は persisted 値があればそれを、なければ defaultOpen を採用 (uncontrolled のみ)。
  const [internalOpen, setInternalOpen] = useState(() => {
    const p = loadAccOpen(activeTicker, id);
    return p == null ? defaultOpen : p;
  });
  // C-3: ticker が変わったら persisted 開閉状態を読み直す (同 instance が別 ticker を表示する場合に追従)。
  useEffect(() => {
    if (isControlled) return;
    const p = loadAccOpen(activeTicker, id);
    setInternalOpen(p == null ? defaultOpen : p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicker]);
  const isOpen = isControlled ? controlledOpen : internalOpen;

  // Phase 2.7 Sprint 1 #3: state-aware overflow — animate 中は 'hidden' を維持し jump-cut を排除
  // isAnimating=true 中は overflow:hidden → framer-motion の height 0↔auto animate が clip を担保
  // isAnimating=false かつ isOpen の場合のみ overflow:visible → tier-m-glow halo が AccordionSection 境界で clip されない
  // glow_elevation_postmortem.md §v54: contain: paint 絶対禁止維持
  const [isAnimating, setIsAnimating] = useState(false);
  // useRef は useId の前後どこでも OK だが宣言をここに集約
  const _animateRef = useRef(null); // 将来の cleanup 用予約 (現在は onAnimationStart/Complete で直接 state set)

  // View Transitions API サポート検出
  const supportsVT = typeof document !== 'undefined' && 'startViewTransition' in document;

  // 開閉トグル
  // v99 dogfood feedback F (3 巡目): 2 巡目で「open のみ VT、 close は framer-motion 単独」 にしたが
  // それでも残像残存。 真因再特定: VT は open でも snapshot を取って transition するため、
  // framer-motion の height animation と競合し残像発生。 完全 fix: open/close 両方 VT を無効化、
  // framer-motion AnimatePresence + spring に一元化。 (smooth 動きは保つ、 cross-fade 効果は失うが
  // height + opacity の同時 spring で十分 Aman 級の motion を実現)
  const toggle = useCallback(() => {
    const next = !isOpen;
    if (!isControlled) {
      setInternalOpen(next);
      saveAccOpen(activeTicker, id, next); // C-3: 開閉を ticker 別に保持 (scroll 復元の前提)
    }
    if (onOpenChange) onOpenChange(id, next);
  }, [isOpen, isControlled, onOpenChange, id, activeTicker]);

  // a11y: Enter / Space で toggle
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    },
    [toggle]
  );

  // accordion header id / panel id (useId で collision-free)
  const uid = useId();
  const headerId = `acc-header-${id || uid}`;
  const panelId = `acc-panel-${id || uid}`;

  // legacy mode: accordion なしで children をそのまま表示
  if (isLegacyMode) {
    return <>{children}</>;
  }

  return (
    <div
      className={[
        styles.root,
        isOpen ? styles.isOpen : styles.isClosed,
        tier === 3 ? styles.contextTier : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-tier={tier}
      data-open={isOpen ? 'true' : 'false'}
      {...rest}
    >
      {/* ===== Accordion Header ===== */}
      <button
        id={headerId}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={styles.header}
        onClick={toggle}
        onKeyDown={handleKeyDown}
      >
        {/* Left: title + badge */}
        <span className={styles.headerLeft}>
          {/* Chevron icon — CSS rotate で open/close アニメーション。
              v191 (A1): chevronPosition='right' 時は headerRight へ移動し title 左端を L2 冠と整列。 */}
          {chevronPosition !== 'right' && (
            <span className={styles.chevron} aria-hidden="true">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="2 4 6 8 10 4" />
              </svg>
            </span>
          )}
          <span className={styles.title} style={titleStyle}>{title}</span>
          {badge && (
            badgeColor ? (
              <span
                className={styles.badgeColored}
                style={{ background: badgeColor }}
              >
                {badge}
              </span>
            ) : (
              <span className={styles.badge}>{badge}</span>
            )
          )}
        </span>

        {/* Right cluster: streaming indicator + label (small caps) */}
        <span className={styles.headerRight}>
          {streaming && (
            <span className={styles.streamingIndicator} aria-live="polite">
              生成中...
            </span>
          )}
          {label && <span className={styles.label}>{label}</span>}
          {/* v191 (A1): chevronPosition='right' は chevron をここに ghost 表示 (L2 冠と左端整列)。 */}
          {chevronPosition === 'right' && (
            <span className={`${styles.chevron} ${styles.chevronRight}`} aria-hidden="true">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="2 4 6 8 10 4" />
              </svg>
            </span>
          )}
        </span>
      </button>

      {/* ===== Accordion Panel ===== */}
      {/*
        v99 dogfood feedback F (7 巡目): user 体感「閉じるアニメーション欲しいが残像なし」 を両立。
        前 round (6 巡目) AnimatePresence 完全削除 → close 即時 unmount で残像消えたが
        smooth close 失った。 7 巡目: AnimatePresence 復活 + height のみ transition + overflow:hidden で
        children を物理 clip = 「drawer 閉まる」 idiom (Linear / Notion 流儀):
          - height: auto → 0 を spring で smooth animate
          - overflow: hidden 常時で children を境界で clip
          - opacity は維持 (animate しない) → children は最後まで visible だが clip で見えない
          - 結果: 「箱の高さが滑らかに 0 になる、 中身は clip で見えない」 = 残像なし + smooth
      */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <m.div
            id={panelId}
            role="region"
            aria-labelledby={headerId}
            className={styles.panel}
            key={panelId}
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={
              reduce
                ? { duration: 0 }
                : { type: 'spring', stiffness: 320, damping: 32 }
            }
            style={{ overflow: 'hidden' }}
            onAnimationStart={() => setIsAnimating(true)}
            onAnimationComplete={() => setIsAnimating(false)}
          >
            <div className={styles.panelInner}>{children}</div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
