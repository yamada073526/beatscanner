import React, { useState, useCallback, useId } from 'react';
import styles from './AccordionSection.module.css';

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
 *   children: ReactNode    — 展開時に表示するコンテンツ
 */
export default function AccordionSection({
  id,
  title,
  label,
  badge = null,
  defaultOpen = false,
  controlledOpen,
  onOpenChange,
  tier = 2,
  children,
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

  // isControlled: Sprint 5 で workspaceStore が controlledOpen を渡す想定
  const isControlled = typeof controlledOpen === 'boolean';
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = isControlled ? controlledOpen : internalOpen;

  // View Transitions API サポート検出
  const supportsVT = typeof document !== 'undefined' && 'startViewTransition' in document;

  // 開閉トグル
  const toggle = useCallback(() => {
    const next = !isOpen;

    const apply = () => {
      if (!isControlled) setInternalOpen(next);
      if (onOpenChange) onOpenChange(id, next);
    };

    if (supportsVT) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
  }, [isOpen, isControlled, onOpenChange, id, supportsVT]);

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
          {/* Chevron icon — CSS rotate で open/close アニメーション */}
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
          <span className={styles.title}>{title}</span>
          {badge && <span className={styles.badge}>{badge}</span>}
        </span>

        {/* Right: label (small caps) */}
        {label && <span className={styles.label}>{label}</span>}
      </button>

      {/* ===== Accordion Panel ===== */}
      {/*
        View Transitions API が存在する場合は JS 側で startViewTransition() を呼ぶ。
        fallback (未対応 browser): clip-path transition で collapse/expand アニメーション。
        prefers-reduced-motion: reduce → CSS 側で transition: none を設定 (AccordionSection.module.css)。
      */}
      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        className={styles.panel}
        hidden={!isOpen}
      >
        <div className={styles.panelInner}>{children}</div>
      </div>
    </div>
  );
}
