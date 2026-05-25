/**
 * EtfOverviewPanel.jsx — v118 ETF MVP (R9.3 拡充).
 *
 * ETF を入力した user に「5 条件対象外」 エラーで終わらせず、 ETF 固有指標を
 * 提示する Trust Cliff 防止 panel。
 *
 * data source: /api/etf-info/{ticker}
 *
 * 表示構成 (R9.3):
 *   Row 1: AUM / TER / 1Y Return / 設定日 / 籍
 *   Row 2: 運用会社 / 保有銘柄数 / 平均出来高 / 資産クラス
 *   Section: セクター構成 (industry / exposure bars 降順)
 *
 * R9.3 修正 (user dogfood feedback):
 *   - 「じっちゃま」 単語を UI から削除 (CLAUDE.md 表示テキストポリシー違反)
 *   - 「構成銘柄データは取得できませんでした (FMP plan...)」 文言削除
 *     (機能不足アピールで Trust Cliff、 holdings 空時は section 自体を非表示)
 *
 * design grammar:
 *   - SectionHeader + 2 row metric grid + sector breakdown bars
 *   - design token のみ (raw hex 禁止、 design-system-check 通過)
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
  const normalized = expenseRatio > 0.05 ? expenseRatio : expenseRatio * 100;
  return `${normalized.toFixed(2)}%`;
}

function _formatDate(iso) {
  if (!iso || typeof iso !== 'string') return '—';
  return iso.slice(0, 10);
}

function _formatVolume(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toLocaleString();
}

function _formatCount(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toLocaleString()} 銘柄`;
}

function _formatAssetClass(v) {
  if (!v) return '—';
  const map = { Equity: '株式', Bond: '債券', Commodity: '商品', 'Real Estate': '不動産', Currency: '通貨' };
  return map[v] || v;
}

const SECTOR_LABEL_JP = {
  'Technology': 'テクノロジー',
  'Financial Services': '金融',
  'Healthcare': 'ヘルスケア',
  'Consumer Cyclical': '消費循環',
  'Communication Services': '通信',
  'Industrials': '資本財',
  'Consumer Defensive': '生活必需品',
  'Energy': 'エネルギー',
  'Basic Materials': '素材',
  'Real Estate': '不動産',
  'Utilities': '公益',
};

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

function SectorBar({ industry, exposure, maxExposure }) {
  const width = maxExposure > 0 ? Math.max(2, (exposure / maxExposure) * 100) : 0;
  const labelJp = SECTOR_LABEL_JP[industry] || industry;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr 60px',
        gap: 'var(--space-3, 12px)',
        alignItems: 'center',
        padding: 'var(--space-1, 4px) 0',
      }}
    >
      <div
        style={{
          fontSize: 'var(--text-body-sm, 13px)',
          color: 'var(--text-primary)',
          fontWeight: 500,
        }}
      >
        {labelJp}
      </div>
      <div
        style={{
          height: 8,
          background: 'var(--surface-3, rgba(255,255,255,0.04))',
          borderRadius: 'var(--radius-pill, 999px)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${width}%`,
            height: '100%',
            background: 'linear-gradient(90deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 60%, var(--color-gold)))',
            borderRadius: 'var(--radius-pill, 999px)',
            transition: 'width 600ms ease',
          }}
        />
      </div>
      <div
        style={{
          fontSize: 'var(--text-body-sm, 13px)',
          color: 'var(--text-primary)',
          fontWeight: 700,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {exposure.toFixed(2)}%
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.etfInfo - /api/etf-info response
 */
export default function EtfOverviewPanel({ etfInfo }) {
  if (!etfInfo || typeof etfInfo !== 'object') return null;
  const ticker = etfInfo.ticker || '';
  const companyName = etfInfo.companyName || '';
  const ov = etfInfo.overview || {};
  const sectors = Array.isArray(etfInfo.sectors) ? etfInfo.sectors : [];
  const maxExposure = sectors.length > 0 ? sectors[0].exposure : 0;

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
          ETF / 投資信託のため、 ファンダメンタル 5 条件の判定対象外です。
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
        <MetricChip label="設定日" value={_formatDate(ov.inception_date)} hint="運用開始" />
        <MetricChip label="籍" value={ov.domicile || '—'} hint="ドミサイル" />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 'var(--space-3, 12px)',
        }}
      >
        <MetricChip label="運用会社" value={ov.etf_company || '—'} hint="ETF Issuer" />
        <MetricChip label="保有銘柄数" value={_formatCount(ov.holdings_count)} hint="構成銘柄数" />
        <MetricChip label="平均出来高" value={_formatVolume(ov.avg_volume)} hint="日次平均株数" />
        <MetricChip label="資産クラス" value={_formatAssetClass(ov.asset_class)} hint="Asset Class" />
      </div>

      {sectors.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              marginBottom: 'var(--space-3, 12px)',
            }}
          >
            セクター構成
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1, 4px)' }}>
            {sectors.map((s) => (
              <SectorBar
                key={s.industry}
                industry={s.industry}
                exposure={s.exposure}
                maxExposure={maxExposure}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
