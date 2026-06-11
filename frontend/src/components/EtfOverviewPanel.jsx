/**
 * EtfOverviewPanel.jsx — v118 ETF MVP (R9.3 拡充).
 *
 * ETF を入力した user に「5 条件対象外」 エラーで終わらせず、 ETF 固有指標を
 * 提示する Trust Cliff 防止 panel。
 *
 * data source: /api/etf-info/{ticker}
 *
 * 表示構成 (R9.3 → R9.5):
 *   Row 1: AUM / TER / 1Y Return / 設定日 / 籍
 *   Row 2: 運用会社 / 保有銘柄数 / 平均出来高 / 資産クラス
 *   Section: 組入上位銘柄 (top_holdings、 weight 降順 top 10、 行クリックで銘柄分析へ)
 *   Section: セクター構成 (industry / exposure bars 降順)
 *
 * R9.3 修正 (user dogfood feedback):
 *   - 「じっちゃま」 単語を UI から削除 (CLAUDE.md 表示テキストポリシー違反)
 *   - 「構成銘柄データは取得できませんでした (FMP plan...)」 文言削除
 *     (機能不足アピールで Trust Cliff、 holdings 空時は section 自体を非表示)
 *
 * R9.5 (2026-06-12): 組入上位銘柄 section 追加。
 *   v118 当時 FMP Premium で /etf/holdings が 402 → top_holdings 常時空で非表示だった。
 *   Ultimate 移行で開放済。EtfExposurePanel (銘柄→ETF の逆方向、v203) の行 idiom 鏡像:
 *   logo + ticker + 名称 + 組入比率 + mini gold bar、 行クリックで onNavigateTicker(symbol)
 *   → その銘柄の 5 条件分析へ (原則 4: ETF の中身を 1 銘柄ずつ検索する手間の代替)。
 *   上位 5 常時 + 残り折りたたみ。 §38/§5: 確定事実 (比率) のみ、 判断語なし、 出典明記。
 *
 * design grammar:
 *   - SectionHeader + 2 row metric grid + sector breakdown bars
 *   - design token のみ (raw hex 禁止、 design-system-check 通過)
 *   - 発光系 class 不使用 (素 div + token、 EtfExposurePanel と同じ設計境界)
 */
import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import ReturnGrid from '../features/judgment/primitives/ReturnGrid.jsx';
import SectorDonut from '../features/judgment/primitives/SectorDonut.jsx';
import StockPriceChart from './StockPriceChart.jsx';
import CompanyLogo from './CompanyLogo.jsx';

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

// ── 組入上位銘柄 (R9.5) ──
// EtfExposurePanel の EtfRow 鏡像 (ETF→構成銘柄の順方向)。発光系不使用、token のみ。
const HOLDINGS_TESTID = 'etf-top-holdings';
const HOLDINGS_ALWAYS_VISIBLE = 5; // 常時表示は上位 5、残り (6-10 位) は折りたたみ

function _fmtWeight(v) {
  if (!Number.isFinite(v)) return '—';
  return `${v.toFixed(2)}%`;
}

// 1 行 (行全体クリックでその銘柄の分析へ。spotlight = 組入 1 位の gold 6% tint)
function HoldingRow({ holding, rank, maxWeight, spotlight, onNavigateTicker }) {
  const [hover, setHover] = useState(false);
  const barPct = Number.isFinite(holding.weight_pct) && maxWeight > 0
    ? Math.max(4, Math.round((holding.weight_pct / maxWeight) * 100))
    : 0;
  const clickable = typeof onNavigateTicker === 'function';
  return (
    <div
      data-testid={`${HOLDINGS_TESTID}-row`}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onNavigateTicker(holding.symbol) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigateTicker(holding.symbol); } } : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={clickable ? `${holding.symbol} の分析を表示` : undefined}
      title={clickable ? `${holding.symbol} の分析を表示` : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: '22px 84px minmax(0,1fr) 90px',
        alignItems: 'center',
        columnGap: 'var(--space-3, 12px)',
        padding: '6px 8px',
        borderRadius: 'var(--radius-sm, 8px)',
        cursor: clickable ? 'pointer' : 'default',
        background: hover
          ? 'var(--bg-hover, var(--bg-card))'
          : spotlight
            ? 'color-mix(in srgb, var(--color-gold) 6%, transparent)'
            : 'transparent',
        transition: 'background var(--motion-fast, 160ms) ease',
      }}
    >
      {/* 順位 (muted、リスト順 = weight 降順) */}
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', justifySelf: 'end' }}>{rank}</span>
      {/* ticker (ロゴ + bold、競合チップと同じ「クリックで分析へ」 affordance) */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <CompanyLogo ticker={holding.symbol} size={16} variant="badge" />
        <span style={{ fontSize: 13, fontWeight: 700, color: hover ? 'var(--color-accent)' : 'var(--text-primary)', letterSpacing: '0.02em', transition: 'color var(--motion-fast, 160ms) ease' }}>
          {holding.symbol}
        </span>
      </span>
      {/* 名称 (muted、読まなくていい補足) */}
      <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{holding.name}</span>
      {/* 組入比率 + mini gold bar (max 正規化で差が読まずに伝わる) */}
      <span style={{ justifySelf: 'end', textAlign: 'right', width: '100%' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{_fmtWeight(holding.weight_pct)}</span>
        <span aria-hidden style={{ display: 'block', height: 3, marginTop: 3, borderRadius: 2, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
          <span style={{ display: 'block', height: '100%', width: `${barPct}%`, marginLeft: 'auto', borderRadius: 2, background: 'color-mix(in srgb, var(--color-gold) 55%, transparent)' }} />
        </span>
      </span>
    </div>
  );
}

// 組入上位銘柄 section (上位 5 常時 + 残り折りたたみ。holdings 空なら呼び出し側で非表示)
function TopHoldingsSection({ holdings, onNavigateTicker }) {
  const [showAll, setShowAll] = useState(false);
  const maxWeight = holdings[0]?.weight_pct || 0; // backend が weight 降順 sort 済
  const head = holdings.slice(0, HOLDINGS_ALWAYS_VISIBLE);
  const rest = holdings.slice(HOLDINGS_ALWAYS_VISIBLE);

  return (
    <div data-testid={HOLDINGS_TESTID}>
      {/* SectionLabel idiom (SectorDonut / ReturnGrid 踏襲) */}
      <div style={{ marginBottom: 'var(--space-3, 12px)' }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--text-primary)',
            textTransform: 'uppercase',
          }}
        >
          組入上位銘柄
        </div>
      </div>

      {/* 列見出し (組入比率のみ — 順位/ticker/名称は自明) */}
      <div style={{ display: 'grid', gridTemplateColumns: '22px 84px minmax(0,1fr) 90px', columnGap: 'var(--space-3, 12px)', padding: '0 8px', marginBottom: 2 }}>
        <span /><span /><span />
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', justifySelf: 'end' }}>組入比率</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {head.map((h, i) => (
          <HoldingRow key={h.symbol} holding={h} rank={i + 1} maxWeight={maxWeight} spotlight={i === 0} onNavigateTicker={onNavigateTicker} />
        ))}
      </div>

      {/* 残り 6-10 位 (折りたたみ、grid-rows transition = EtfExposurePanel と同 idiom) */}
      {rest.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateRows: showAll ? '1fr' : '0fr', transition: 'grid-template-rows 0.28s var(--ws-ease-standard, cubic-bezier(0.22, 1, 0.36, 1))' }}>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 2 }}>
                {rest.map((h, i) => (
                  <HoldingRow key={h.symbol} holding={h} rank={HOLDINGS_ALWAYS_VISIBLE + i + 1} maxWeight={maxWeight} spotlight={false} onNavigateTicker={onNavigateTicker} />
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            data-testid={`${HOLDINGS_TESTID}-toggle`}
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 'var(--space-2, 8px)',
              padding: '2px 8px 2px 4px',
              fontSize: 11,
              color: 'var(--text-muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <ChevronRight size={12} strokeWidth={2} aria-hidden="true" style={{ transition: 'transform 0.28s var(--ws-ease-standard, cubic-bezier(0.22, 1, 0.36, 1))', transform: showAll ? 'rotate(90deg)' : 'rotate(0deg)' }} />
            {showAll ? '折りたたむ' : `他 ${rest.length} 銘柄を表示`}
          </button>
        </>
      )}

      <div style={{ marginTop: 'var(--space-2, 8px)', fontSize: 9, color: 'var(--text-muted)', opacity: 0.75, lineHeight: 1.5 }}>
        出典: FMP ・ 組入比率 = ETF 純資産に占める各銘柄の比率。銘柄クリックでその銘柄の分析を表示します
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.etfInfo - /api/etf-info response
 * @param {(ticker: string) => void} [props.onNavigateTicker] - 組入銘柄クリック時の分析 navigate (JudgmentDetail の onAnalyze)
 */
export default function EtfOverviewPanel({ etfInfo, onNavigateTicker }) {
  if (!etfInfo || typeof etfInfo !== 'object') return null;
  const ticker = etfInfo.ticker || '';
  const companyName = etfInfo.companyName || '';
  const ov = etfInfo.overview || {};
  const sectors = Array.isArray(etfInfo.sectors) ? etfInfo.sectors : [];
  // R9.5: symbol 欠落行は除外 (logo / navigate が成立しない)。空なら section ごと非表示 (R9.3 ルール)。
  const topHoldings = (Array.isArray(etfInfo.top_holdings) ? etfInfo.top_holdings : [])
    .filter((h) => h && typeof h.symbol === 'string' && h.symbol);

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

      {/* R9.5: 組入上位銘柄 (weight 降順 top 10、上位 5 常時 + 折りたたみ)。
          「保有銘柄数」 chip (Row 2) → 具体的な top 10 → セクター構成 (抽象) の流れ。
          空 (取得失敗 / 非該当) なら section ごと非表示 (R9.3 Trust Cliff ルール継承)。 */}
      {topHoldings.length > 0 && (
        <TopHoldingsSection holdings={topHoldings} onNavigateTicker={onNavigateTicker} />
      )}

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
