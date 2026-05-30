import React from 'react';
import { canUse, requiredPlan, PLAN } from '../../../../lib/planGating.js';

/**
 * Section-level premium lock (Spotify 流 blur + glass CTA).
 *
 * design_recipes.md §C-7 「Modern Pattern Mandate」.
 * 解放されていない feature は children を blur 越しに見せ、中央に
 * - feature 説明 (bullets)
 * - tier ラベル
 * - upgrade CTA ボタン
 * を重ねる.
 *
 * @param {object} props
 * @param {string} props.feature - FEATURE_GATES のキー
 * @param {string} props.plan - 'free' | 'pro' | 'premium'
 * @param {React.ReactNode} props.children
 * @param {string} [props.label] - メインの誘導コピー
 * @param {string[]} [props.bullets] - 解放時に得られる箇条書き (3 件まで推奨)
 * @param {() => void} [props.onUpgrade] - CTA クリック時のコールバック
 */
export default function PremiumLock({
  feature,
  plan,
  children,
  label,
  bullets = [],
  onUpgrade,
}) {
  const allowed = canUse(feature, plan);
  if (allowed) return children;

  const need = requiredPlan(feature);
  const isPremium = need === PLAN.PREMIUM;
  const tierLabel = isPremium ? 'Premium' : 'Pro';
  const tierColor = isPremium ? 'var(--color-warning)' : 'rgb(56, 189, 248)';
  const ctaText = isPremium ? 'Premium で解放' : 'Pro で解放';

  // gradient: brand 色を 8% → ページ背景 90% へ
  const gradientStops = isPremium
    ? 'rgba(245, 158, 11, 0.08) 0%, rgba(var(--page-bg-rgb), 0.85) 60%'
    : 'rgba(56, 189, 248, 0.08) 0%, rgba(var(--page-bg-rgb), 0.85) 60%';

  // v138.6 R7-J + R7-L (2026-05-30): 3 体合議 verdict (ui-designer + funnel-cro + qa-dogfooder
  // 全 3 体一致で Option D = header に PRO badge 1 個 + 小 CTA、 「PRO 限定」 chip + bullets 削除)
  // → 旧「chip 上 + 説明文 + 大 CTA」 三重表記 (user dogfood「しつこい、 品格損なう」) を minimal 化。
  // header の PRO badge は section header (caller 側) に配置、 PremiumLock は blur preview +
  // 小 CTA chip のみ render。 R7-I fix: onClick が event object を upgrade.open に渡す bug を
  // arrow wrap で阻止 (string featureName のみ受け付け)。
  return (
    <div
      className="ds-premium-lock"
      style={{
        position: 'relative',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        minHeight: 160,
      }}
    >
      {/* 背景: blur した children. inert で内部要素を tab order からも除外 (a11y) */}
      <div
        aria-hidden="true"
        inert=""
        style={{
          filter: 'blur(8px)',
          opacity: 0.35,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {children}
      </div>

      {/* 前面: minimal CTA (D 案) — header badge は caller 側で render */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-2, 8px)',
          padding: 'var(--space-5, 20px)',
          background: `radial-gradient(ellipse at center, ${gradientStops})`,
          backdropFilter: 'saturate(160%) blur(2px)',
          WebkitBackdropFilter: 'saturate(160%) blur(2px)',
        }}
      >
        {label && (
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              lineHeight: 1.4,
              color: 'var(--text-secondary)',
              textAlign: 'center',
              maxWidth: 280,
            }}
          >
            {label}
          </div>
        )}

        {/* 小 CTA chip (pill、 button でなく link 感、 Aman 級「主張せず存在感」) */}
        {onUpgrade ? (
          <button
            type="button"
            onClick={() => {
              try { onUpgrade(feature); } catch { onUpgrade(); }
            }}
            style={{
              padding: '4px 14px',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.02em',
              color: tierColor,
              background: 'transparent',
              border: `1px solid ${tierColor}`,
              borderRadius: 'var(--radius-pill, 9999px)',
              cursor: 'pointer',
              transition: 'background var(--motion-fast, 120ms) ease, color var(--motion-fast, 120ms) ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = tierColor;
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = tierColor;
            }}
          >
            {ctaText} →
          </button>
        ) : (
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--text-muted)',
            }}
          >
            {ctaText}
          </div>
        )}
      </div>
    </div>
  );
}
