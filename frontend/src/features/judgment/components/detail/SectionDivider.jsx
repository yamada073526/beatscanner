import React from 'react';

/**
 * 3 階層 section divider (Verdict / Fundamentals / Context).
 * design_recipes.md §C-10 + handover §3 Step 6.
 *
 * Sprint 4: `expandedLabel` prop を追加。
 *   - expandedLabel が渡された場合: var(--text-secondary) color で表示 (階層境界の明示化)。
 *   - label prop (旧来) または tier から導出した tierStr を使う既存呼び出しは後方互換で動作。
 *   - 既存 styling (1px line / flex spacer / padding) は不変。
 *   - typography: text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.6875rem (Stripe Sigma 流)。
 *   - raw hex 禁止、elevation_scale.md whitelist 内 token のみ使用。
 *
 * SPEC 2026-05-19 Sprint 1 Item 6: expandedLabel 使用時の typography 強化 (Linear 流 hierarchy 明示)。
 *   - font-size: 1.125rem (var(--text-lg) 相当) / font-weight: 600 / color: var(--text-primary)
 *   - margin: var(--space-6) 0 var(--space-4) (上 24px / 下 16px)
 *   - border-left: 4px solid var(--color-accent) (cyan brand emphasis bar、 Linear 流 h2 境界)
 *   - padding-left: var(--space-3) (accent bar とテキストの間隔)
 *   - panel-card / bs-panel / surface-card CSS は不変 (発光バグ高リスク領域を回避)
 *   後方互換: label prop / tier prop のみの既存呼び出しは従来スタイル維持。
 */
export default function SectionDivider({ tier, label, expandedLabel }) {
  const tierStr =
    tier === 1 ? '判定' : tier === 2 ? 'ファンダメンタル' : tier === 3 ? 'コンテキスト' : '';

  const displayText = expandedLabel || label || tierStr;
  // expandedLabel: h2 級 typography + 左 cyan accent bar (Linear 流 hierarchy)
  // label / tierStr: 従来の Stripe Sigma 流 small caps (後方互換)
  const isMajor = Boolean(expandedLabel);

  if (isMajor) {
    // v86 R2 Vision 改善 #5: 章替わりの breathing room + gradient accent
    //  - 直前 --space-10 (40px) で「章の切り替わり」 を演出 (旧 --space-6=24px)
    //  - 縦バー 4px solid → linear-gradient (transparent → accent → transparent)
    //    accent の上下が消える「光の柱」 idiom (Aman/Ritz 流の chandelier 演出)
    return (
      <div
        role="presentation"
        data-testid="section-divider-major"
        style={{
          margin: 'var(--space-10, 40px) 0 var(--space-4, 16px)',
          paddingLeft: 'var(--space-3, 12px)',
          borderLeft: 'none',
          backgroundImage:
            'linear-gradient(180deg, transparent 0%, var(--color-accent) 22%, var(--color-accent) 78%, transparent 100%)',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '4px 100%',
          backgroundPosition: 'left center',
        }}
      >
        <span
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            letterSpacing: '-0.01em',
            lineHeight: 1.4,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            display: 'block',
          }}
        >
          {displayText}
        </span>
      </div>
    );
  }

  return (
    <div
      role="presentation"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 'var(--space-6, 24px) 0 var(--space-2, 8px)',
      }}
    >
      <span
        style={{
          fontSize: '0.6875rem',
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        {displayText}
      </span>
      <span
        aria-hidden
        style={{
          flex: 1,
          height: 1,
          background: 'var(--border)',
        }}
      />
    </div>
  );
}
