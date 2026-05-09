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

  return (
    <div
      className="ds-premium-lock"
      style={{
        position: 'relative',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        minHeight: 200,
      }}
    >
      {/* 背景: blur した children. inert で内部要素を tab order からも除外 (a11y) */}
      <div
        aria-hidden="true"
        // @ts-ignore: HTML inert は React 19+ で標準対応、それ以前は属性として有効
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

      {/* 前面: glass CTA */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 'var(--space-6, 24px)',
          background: `radial-gradient(ellipse at top, ${gradientStops})`,
          backdropFilter: 'saturate(160%) blur(3px)',
          WebkitBackdropFilter: 'saturate(160%) blur(3px)',
        }}
      >
        {/* Tier badge with sparkle */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            borderRadius: 'var(--radius-pill)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: tierColor,
            background: isPremium
              ? 'rgba(245, 158, 11, 0.12)'
              : 'rgba(56, 189, 248, 0.12)',
            border: `1px solid ${tierColor}`,
          }}
        >
          <span aria-hidden>✦</span>
          {tierLabel} 限定
        </div>

        {label && (
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              lineHeight: 1.3,
              color: 'var(--text-primary)',
              textAlign: 'center',
              maxWidth: 340,
            }}
          >
            {label}
          </div>
        )}

        {bullets.length > 0 && (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 4,
              maxWidth: 320,
            }}
          >
            {bullets.slice(0, 3).map((b, i) => (
              <li
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  fontSize: 12,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  color: 'var(--text-secondary)',
                }}
              >
                <span aria-hidden style={{ color: tierColor, flexShrink: 0 }}>
                  ✓
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}

        {onUpgrade ? (
          <button
            type="button"
            onClick={onUpgrade}
            style={{
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              background: tierColor,
              border: 'none',
              borderRadius: 'var(--radius-pill)',
              cursor: 'pointer',
              transition: 'transform var(--motion-fast, 120ms) var(--ease-out-expo), box-shadow var(--motion-fast, 120ms) var(--ease-out-expo)',
              boxShadow: isPremium
                ? '0 4px 12px rgba(245, 158, 11, 0.3)'
                : '0 4px 12px rgba(56, 189, 248, 0.3)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            {ctaText}
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
