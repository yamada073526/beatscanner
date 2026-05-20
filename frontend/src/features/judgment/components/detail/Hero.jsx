import React from 'react';
import Card from '../../primitives/Card.jsx';
import Chip from '../../../../components/ui/Chip.jsx';
import EarningsRing from '../../../../components/EarningsRing.jsx';
import CompanyLogo from '../../../../components/CompanyLogo.jsx';

// v86 R4 #3: 補助情報 chip スタイル (Hero 中央密度 anchor、 tabular-nums)
const heroFactChipStyle = {
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  background: 'var(--bg-subtle)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm, 6px)',
  padding: '3px 8px',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};
const heroFactChipAccent = {
  ...heroFactChipStyle,
  color: 'var(--color-accent)',
  borderColor: 'color-mix(in srgb, var(--color-accent) 35%, var(--border))',
  fontWeight: 600,
};

/**
 * Hero section. design_system.md §B-2 Display tier 28-32px, fw600, -0.02em, lh1.1.
 * Verdict chip = beat/miss/in-line/unknown (§1-A).
 *
 * handover v82 Phase 5: EarningsRing を verdict chip の左隣 (small 40px) に mount。
 * planGating earnings_countdown_ring = FREE (マーケ verdict、 LP 訴求 hook)。
 *
 * SPEC 2026-05-19 Sprint 1 Item 3: verdict='unknown' の label を「判定待ち」に変更。
 *   Trust Cliff 解消: 「Unknown」(意味不明) → 「判定待ち」(決算発表前の状態を明示)。
 *   tooltip: 「最新四半期の決算がまだ発表されていません」(Chip primitive の title prop)。
 *   tone は muted 維持 (緑/赤/amber/cyan 使わない、投資業界色ルール遵守)。
 *
 * SPEC 2026-05-19 Sprint 2 Item 1: Hero 企業ロゴ併記 (brand-aspiration priority 1)。
 *   ticker 左に 48-56px 角丸 logo (CompanyLogo shape='rounded' monoFallback)。
 *   border-radius: var(--radius-md) token 経由。
 *   fallback: TV → FMP → neutral gray 頭文字円 (投資業界色ルール遵守)。
 *   fade-in: logo load 後 opacity 0→1 / 200ms ease-out (prefers-reduced-motion: none 時)。
 */
export default function Hero({ ticker, companyName, verdict = 'unknown', period, nextEarningsDays, nextEarningsDate }) {
  const tone =
    verdict === 'beat' ? 'gain' : verdict === 'miss' ? 'loss' : verdict === 'in-line' ? 'muted' : 'muted';
  const verdictLabel =
    verdict === 'beat'
      ? 'Beat'
      : verdict === 'miss'
        ? 'Miss'
        : verdict === 'in-line'
          ? 'In-line'
          : '判定待ち';
  // verdict='unknown' 時: tooltip で「決算発表前」を明示 (Trust Cliff 解消)。
  const verdictTooltip =
    verdict !== 'beat' && verdict !== 'miss' && verdict !== 'in-line'
      ? '決算発表前のため判定保留中'
      : undefined;

  return (
    <Card data-testid="pane3-hero">
      {/* v86 R3 Vision 改善 #4: Hero 右上 LIVE pulse dot (motion_timing 静止フレーム anchor)
          位置: card 右上 12px offset、 8px cyan dot、 1.4s ease-in-out infinite pulse。
          aria-hidden: 装飾要素、 screen reader には伝えない (情報は他で取得)。
          prefers-reduced-motion: アニメーション無効化 (CSS 側で対応)。 */}
      <span className="hero-live-pulse" aria-hidden="true" />
      <div
        style={{
          // v86 R5 C: Aman / Ritz 入場感のため padding を --space-6 (24px) → --space-8 (32px) に
          // 一段「ロビー」 感が出る breathing room (token は 4/8/12/16/24/32/48 のみ、 7 は無し)。
          // Vision aman 70 → 75+ 狙い、 既存 token を使用 (design system 整合)。
          padding: 'var(--space-8, 32px)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--space-8, 32px)',
          flexWrap: 'wrap',
        }}
      >
        {/* ticker 左側: ロゴ + テキスト情報 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3, 12px)', minWidth: 0, flex: 1 }}>
          {/* Sprint 2: 企業ロゴ (48px / 角丸 / neutral gray fallback / fade-in 200ms)
              fadeIn=true: logo load 時に opacity 0→1 / 200ms ease-out
              monoFallback=true: fallback 頭文字円を neutral gray（投資業界色ルール遵守）
              shape='rounded': border-radius = var(--radius-md, 12px) */}
          <div style={{ flexShrink: 0, marginTop: 4 }}>
            <CompanyLogo
              ticker={ticker}
              size={48}
              shape="rounded"
              monoFallback
              fadeIn
            />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            判定
          </div>
          <h1
            style={{
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
              margin: '4px 0 4px',
              color: 'var(--text-primary)',
            }}
          >
            {ticker}
          </h1>
          {companyName && (
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                lineHeight: 1.3,
              }}
            >
              {companyName}
            </div>
          )}
          {/* v86 R4 #3: 補助情報行 — 中央空白帯を意味のある密度で埋める
              (Vision Round 2,3 共通指摘「中央の AAPL と右側 D-XX リングの間に空白帯」 解消)
              chip 形式で 3 fact (期間 / 次回決算日 / D-XX) を並べる */}
          {(period || nextEarningsDate || Number.isFinite(nextEarningsDays)) && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-2, 8px)',
                marginTop: 'var(--space-2, 8px)',
                alignItems: 'center',
              }}
            >
              {period && (
                <span style={heroFactChipStyle}>{period}</span>
              )}
              {nextEarningsDate && (
                <span style={heroFactChipStyle}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginRight: 4 }}>次回</span>
                  {nextEarningsDate}
                </span>
              )}
              {Number.isFinite(nextEarningsDays) && nextEarningsDays > 0 && (
                <span style={heroFactChipAccent}>D-{nextEarningsDays}</span>
              )}
            </div>
          )}
          </div>{/* end: テキスト情報 div */}
        </div>{/* end: ロゴ + テキスト flex div */}
        {/* Sprint 3: EarningsRing が wrapper(ring + 下ラベル) を返すため flex-start に変更 */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3, 12px)' }}>
          {Number.isFinite(nextEarningsDays) && (
            <EarningsRing
              daysToEarnings={nextEarningsDays}
              earningsDate={nextEarningsDate}
              size={44}
            />
          )}
          <Chip size="md" variant="display" tone={tone} title={verdictTooltip}>{verdictLabel}</Chip>
        </div>
      </div>
    </Card>
  );
}
