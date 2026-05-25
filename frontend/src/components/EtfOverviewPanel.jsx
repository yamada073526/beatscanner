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
import ReturnGrid from '../features/judgment/primitives/ReturnGrid.jsx';
import SectorDonut from '../features/judgment/primitives/SectorDonut.jsx';
import StockPriceChart from './StockPriceChart.jsx';

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
  // R9.4 bug fix: FMP /etf/info `expenseRatio` は既に % 単位で返る
  //   SPY=0.09 → 0.09%、 VOO=0.03 → 0.03%、 ARKK=0.75 → 0.75%
  //   旧 logic (>0.05 で raw、 else *100) は VOO 0.03 → 3.00% と誤表示していた。
  //   sanity: 100% 超は明らかに invalid (経費率は通常 0.01-1.5% range)
  if (expenseRatio > 100) return '—';
  return `${expenseRatio.toFixed(2)}%`;
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
  // R9.4: FMP は "Large Cap Equity" 等の組合せ値も返すため、 完全一致 + 部分一致で 2 段判定
  const map = {
    'Equity': '株式',
    'Large Cap Equity': '大型株',
    'Mid Cap Equity': '中型株',
    'Small Cap Equity': '小型株',
    'Total Market': '市場全体',
    'Bond': '債券',
    'Aggregate Bond': '総合債券',
    'Treasury Bond': '国債',
    'Corporate Bond': '社債',
    'High Yield Bond': 'ハイイールド債',
    'Commodity': '商品',
    'Gold': '金',
    'Real Estate': '不動産',
    'Currency': '通貨',
    'Multi-Asset': 'マルチアセット',
    'Mixed': 'バランス型',
  };
  if (map[v]) return map[v];
  // 部分一致 (例: "International Equity" → "株式")
  if (v.includes('Equity')) return '株式';
  if (v.includes('Bond')) return '債券';
  if (v.includes('Real Estate')) return '不動産';
  return v;
}

// v118 ETF Phase 2: SECTOR_LABEL_JP は SectorDonut.jsx 内に移管済、 本 file からは削除。

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

// v118 ETF Phase 2: SectorBar (横棒) は SectorDonut (PieChart) に置換、 本 file から削除。

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
          {/* R9.4: ポジティブ転換 (UI/UX agent verdict、 Aman ホテル receptionist 比喩)。
              旧文言「ETF / 投資信託のため、 ファンダメンタル 5 条件の判定対象外です」 は
              否定文 first impression → brand 品格毀損のため削除。 */}
          ETF 専用の主要指標をお届けします。 構成銘柄の分散状況がひと目でわかります。
        </p>
      </div>

      {/* Row 1: AUM / TER / 設定日 — 1Y Return は ReturnGrid に統合済のため削除 (Sprint 4) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 'var(--space-3, 12px)',
        }}
      >
        <MetricChip label="AUM" value={_formatAum(ov.aum)} hint="運用資産総額" />
        <MetricChip label="TER" value={_formatTer(ov.expense_ratio)} hint="経費率 (年率)" />
        <MetricChip label="設定日" value={_formatDate(ov.inception_date)} hint="運用開始" />
        {/* R9.4: 「籍」 chip 削除 (BeatScanner user は US 上場 ETF 前提で自明、 余白を活かす)。
            domicile データは backend response に残し、 将来 international ETF (FXI 等) で
            US 以外の値が頻出するなら再度表示検討。 */}
      </div>

      {/* ReturnGrid: 8 期間 (1W/1M/3M/6M/1Y/3Y/5Y/10Y) — Sprint 4 mount。
          1Y Return chip を Row 1 から削除して ReturnGrid に統合 (information density 改善)。
          feedback_cls_envelope_pattern.md: minHeight 80 は ReturnGrid 内部で適用済。 */}
      <ReturnGrid ticker={ticker} frameless={true} testId="etf-return-grid" />

      {/* Row 2: 運用会社 / 保有銘柄数 / 平均出来高 / 資産クラス */}
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

      {/* v118 ETF Phase 2: SectorBar 横棒 → SectorDonut PieChart 差替。
          11 sector の縦長 list が donut + legend で「2 秒理解」 強化、
          section 高さ も削減。 SectorBar component は dead code、
          legacy 参照確認後に削除予定。 */}
      {sectors.length > 0 && (
        <SectorDonut sectors={sectors} sectionLabel="セクター構成" />
      )}

      {/* StockPriceChart: セクター構成直後 (= panel 末尾) — Sprint 4 mount。
          ETF は Pro feature 不要のため isPremiumUser=false 固定。
          既存 component を流用、 新規 logic なし。 */}
      {ticker && (
        <StockPriceChart ticker={ticker} isPremiumUser={false} />
      )}
    </section>
  );
}
