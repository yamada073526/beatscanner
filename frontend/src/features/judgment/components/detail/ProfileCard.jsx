import React from 'react';
import Card from '../../primitives/Card.jsx';
import SectionHeader from '../../primitives/SectionHeader.jsx';
import CompanyLogo from '../../../../components/CompanyLogo.jsx';
import { Building2 } from 'lucide-react';

/**
 * Profile section. ロゴ + 会社名 + ティッカー + データソース.
 * design_system.md §B-2 (Heading 18px / fw500) に準拠.
 */
export default function ProfileCard({ ticker, companyName, dataSource, latestPeriod, latestDate }) {
  if (!ticker) return null;
  return (
    <Card>
      <div style={{ padding: 'var(--space-6, 24px)' }}>
        <SectionHeader id="sec-profile" icon={<Building2 size={18} strokeWidth={1.5} />} title="プロフィール" label="COMPANY" />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4, 16px)',
          }}
        >
          <CompanyLogo ticker={ticker} size={56} variant="badge" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {companyName || ticker}
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                lineHeight: 1.3,
                color: 'var(--text-muted)',
                marginTop: 'var(--space-1, 4px)',
                display: 'flex',
                gap: 'var(--space-3, 12px)',
                flexWrap: 'wrap',
              }}
            >
              <span>{ticker}</span>
              {latestPeriod && <span>· FY{latestPeriod}</span>}
              {latestDate && <span>· {latestDate}</span>}
              {dataSource && <span>· {dataSource}</span>}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
