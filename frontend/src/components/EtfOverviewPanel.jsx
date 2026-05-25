/**
 * EtfOverviewPanel.jsx — v118 ETF MVP (handover v118 Step 3 P1).
 *
 * ETF を入力した user に「5 条件対象外」 エラーで終わらせず、 ETF 固有 5 metric
 * (AUM / TER / 1Y / Top 5 Holdings / Inception) を提示する Trust Cliff 防止 panel。
 *
 * data source: /api/etf-info/{ticker} (Phase G の other panel と同 fetch pattern)
 *
 * design grammar:
 *   - SectionHeader + 5 metric grid (KpiStrip と同形)
 *   - Top 5 Holdings は table (weight % 降順)
 *   - Trust Cliff msg: 「ETF は 5 条件対象外、 下記は ETF 固有指標」
 *   - design token のみ (raw hex 禁止、 design-system-check 通過)
 *
 * 5 原則整合:
 *   原則 1「2 秒理解」: 5 metric を card chip で並列表示
 *   原則 5「図解で認知コストを下げろ」: holdings は table、 sector は Phase 2 で donut
 */
import React from 'react';

function _formatAum(aum) {
  if (aum == null || !Number.isFinite(aum)) return '—';
  if (aum >= 1e12) return `$${(aum / 1e12).toFixed(2)}T`;
  if (aum >= 1e9) return `$${(aum / 1e9).toFixed(2)}B`;
  if (aum >= 1e6) return `$${(aum / 1e6).toFixed(1)}M`;
  return `$${aum.toLocaleString()}`;
}

function _formatPct(v, digits = 2) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(digits)}%`;
}

function _formatTer(expenseRatio) {
  if (expenseRatio == null || !Number.isFinite(expenseRatio)) return '—';
  // FMP は 0.0945 (= 9.45%) の表記 or 0.000945 (= 0.0945%) の混在があるため正規化
  // 0.05 以下は元から %、 0.05 超は 100 倍前提
  const normalized = expenseRatio > 0.05 ? expenseRatio : expenseRatio * 100;
  return `${normalized.toFixed(2)}%`;
}

function _formatDate(iso) {
  if (!iso || typeof iso !== 'string') return '—';
  // FMP は 'YYYY-MM-DD' 形式 (タイムゾーンなし)、 そのまま表示
  return iso.slice(0, 10);
}

function MetricChip({ label, value, hint }) {
  return (
    <div
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md, 12px)',
        padding: 'var(--space-3, 12px) var(--space-4, 16px)',
        minWidth: 120,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            marginTop: 2,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function HoldingsTable({ holdings }) {
  if (!Array.isArray(holdings) || holdings.length === 0) {
    return (
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: 'var(--text-body, 14px)',
          padding: 'var(--space-3, 12px) 0',
        }}
      >
        構成銘柄データは取得できませんでした (FMP plan / API rate limit)。
      </div>
    );
  }
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 'var(--text-body, 14px)',
      }}
    >
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <th
            style={{
              textAlign: 'left',
              padding: 'var(--space-2, 8px)',
              fontWeight: 600,
              color: 'var(--text-muted)',
              fontSize: 11,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            銘柄
          </th>
          <th
            style={{
              textAlign: 'left',
              padding: 'var(--space-2, 8px)',
              fontWeight: 600,
              color: 'var(--text-muted)',
              fontSize: 11,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            名称
          </th>
          <th
            style={{
              textAlign: 'right',
              padding: 'var(--space-2, 8px)',
              fontWeight: 600,
              color: 'var(--text-muted)',
              fontSize: 11,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            構成比
          </th>
        </tr>
      </thead>
      <tbody>
        {holdings.map((h, i) => (
          <tr
            key={`${h.symbol || ''}-${i}`}
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <td
              style={{
                padding: 'var(--space-2, 8px)',
                fontWeight: 700,
                color: 'var(--color-accent)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {h.symbol || '—'}
            </td>
            <td
              style={{
                padding: 'var(--space-2, 8px)',
                color: 'var(--text-primary)',
                maxWidth: 320,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {h.name || '—'}
            </td>
            <td
              style={{
                padding: 'var(--space-2, 8px)',
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--text-primary)',
                fontWeight: 600,
              }}
            >
              {_formatPct(h.weight_pct)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * @param {object} props
 * @param {object} props.etfInfo - /api/etf-info response (ticker / companyName / overview / top_holdings / sources)
 */
export default function EtfOverviewPanel({ etfInfo }) {
  if (!etfInfo || typeof etfInfo !== 'object') return null;
  const ticker = etfInfo.ticker || '';
  const companyName = etfInfo.companyName || '';
  const ov = etfInfo.overview || {};
  const holdings = etfInfo.top_holdings || [];

  return (
    <section
      className="bs-panel"
      data-testid="etf-overview-panel"
      data-ticker={ticker}
      style={{
        padding: 'var(--space-6, 24px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5, 20px)',
      }}
    >
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: 'var(--color-gold)',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          ETF Overview
        </div>
        <h2
          style={{
            fontFamily: "'Noto Serif JP', 'Times New Roman', serif",
            fontSize: 'var(--text-h3, 20px)',
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: 0,
            lineHeight: 1.3,
          }}
        >
          {ticker} {companyName && `— ${companyName}`}
        </h2>
        <p
          style={{
            fontSize: 'var(--text-caption, 12px)',
            color: 'var(--text-muted)',
            marginTop: 'var(--space-2, 8px)',
            lineHeight: 1.6,
          }}
        >
          ETF / 投資信託のため、 じっちゃまファンダメンタル 5 条件の判定対象外です。
          下記は ETF 固有の主要指標です。
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 'var(--space-3, 12px)',
        }}
      >
        <MetricChip label="AUM" value={_formatAum(ov.aum)} hint="運用資産総額" />
        <MetricChip label="TER" value={_formatTer(ov.expense_ratio)} hint="経費率 (年率)" />
        <MetricChip
          label="1Y Return"
          value={_formatPct(ov.one_year_return_pct, 1)}
          hint="直近 1 年リターン"
        />
        <MetricChip
          label="設定日"
          value={_formatDate(ov.inception_date)}
          hint="運用開始"
        />
        <MetricChip
          label="籍"
          value={ov.domicile || '—'}
          hint="ドミサイル"
        />
      </div>

      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            marginBottom: 'var(--space-2, 8px)',
          }}
        >
          上位構成銘柄 (Top 5)
        </div>
        <HoldingsTable holdings={holdings.slice(0, 5)} />
      </div>
    </section>
  );
}
