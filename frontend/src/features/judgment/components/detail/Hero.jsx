import React from 'react';
import Card from '../../primitives/Card.jsx';
import Chip from '../../../../components/ui/Chip.jsx';
import EarningsRing from '../../../../components/EarningsRing.jsx';
import CompanyLogo from '../../../../components/CompanyLogo.jsx';

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
      <div
        style={{
          padding: 'var(--space-6, 24px)',
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
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
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
          {period && (
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-muted)',
                marginTop: 8,
              }}
            >
              対象期間: {period}
            </div>
          )}
          </div>{/* end: テキスト情報 div */}
        </div>{/* end: ロゴ + テキスト flex div */}
        {/* Sprint 3: EarningsRing が wrapper(ring + 下ラベル) を返すため flex-start に変更 */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
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
