import React from 'react';
import Card from '../../primitives/Card.jsx';
import Chip from '../../../../components/ui/Chip.jsx';

/**
 * Hero section. design_system.md §B-2 Display tier 28-32px, fw600, -0.02em, lh1.1.
 * Verdict chip = beat/miss/in-line/unknown (§1-A).
 */
export default function Hero({ ticker, companyName, verdict = 'unknown', period }) {
  const tone =
    verdict === 'beat' ? 'gain' : verdict === 'miss' ? 'loss' : verdict === 'in-line' ? 'muted' : 'muted';
  const verdictLabel =
    verdict === 'beat'
      ? 'Beat'
      : verdict === 'miss'
        ? 'Miss'
        : verdict === 'in-line'
          ? 'In-line'
          : 'Unknown';

  return (
    <Card>
      <div
        style={{
          padding: 'var(--space-6, 24px)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.06em',
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
        </div>
        <div style={{ flexShrink: 0 }}>
          <Chip size="md" variant="display" tone={tone}>{verdictLabel}</Chip>
        </div>
      </div>
    </Card>
  );
}
