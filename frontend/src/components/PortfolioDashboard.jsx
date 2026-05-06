import { useMemo, useState, lazy, Suspense } from 'react';
import CompanyLogo from './CompanyLogo.jsx';
import { useHoldingsMeta } from '../hooks/useHoldingsMeta.js';
import { computePnL, formatPnLPct } from '../lib/holdings.js';

// X-2-5-C: lightweight-charts を読み込むため lazy chunk 化
const PortfolioHistoryChart = lazy(() => import('./PortfolioHistoryChart.jsx'));

// ── ユーティリティ ────────────────────────────────────────
function fmtUSD(n, opts = {}) {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const compact = opts.compact ?? abs >= 100_000;
  if (compact) {
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
function fmtSignedUSD(n) {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : (n < 0 ? '-' : '');
  return `${sign}$${fmtUSD(Math.abs(n))}`;
}
function fmtSignedPct(n) {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}
function statusFromPct(pct, threshold = 0.05) {
  if (!Number.isFinite(pct)) return 'neutral';
  if (pct > threshold) return 'gain';
  if (pct < -threshold) return 'loss';
  return 'neutral';
}

// ── サマリーカード ────────────────────────────────────────
function SummaryCard({ label, value, sub, status, primary = false }) {
  const cls = `pd-card${primary ? ' pd-card-primary' : ''} pd-card-${status || 'neutral'}`;
  return (
    <div className={cls}>
      <div className="pd-card-label">{label}</div>
      <div className="pd-card-value">{value}</div>
      {sub && <div className="pd-card-sub">{sub}</div>}
    </div>
  );
}

// ── メイン ────────────────────────────────────────────────
export default function PortfolioDashboard({
  holdings = {},
  prices = {},
  lots = [],
  onSelect,
}) {
  const tickers = useMemo(() => Object.keys(holdings), [holdings]);
  const { meta } = useHoldingsMeta(tickers);

  // 「銘柄クリックでチャートを絞り込む」モード (マネーフォワード方式)。
  // 同じ銘柄を再クリック or 「全銘柄」クリックで解除。
  const [selectedTicker, setSelectedTicker] = useState(null);
  const filteredLotsForChart = useMemo(() => {
    if (!selectedTicker) return lots;
    return lots.filter((l) => (l.ticker || '').toUpperCase() === selectedTicker);
  }, [lots, selectedTicker]);

  // ── 集計: 各 holding の派生値 + ポートフォリオ全体合計 ───
  const { rows, totals } = useMemo(() => {
    let totalValue = 0;
    let totalCost = 0;
    let totalDayChange = 0; // Σ shares × change_amount
    let totalPrevValue = 0; // Σ shares × previous_close (当日変動% の分母)
    let pricedValueSum = 0; // 価格取得済み holding の Σ value

    const enriched = tickers.map((t) => {
      const h = holdings[t];
      const q = prices[t];
      const shares = Number(h?.shares) || 0;
      const avgCost = Number(h?.avg_cost) || 0;
      const price = Number(q?.price);
      const change = Number(q?.change);
      const prevClose = Number(q?.previous_close);
      const cost = shares * avgCost;
      let value = null;
      let pnlAbs = null;
      let pnlPct = null;
      let dayChangeAbs = null;
      let dayChangePct = null;
      if (Number.isFinite(price) && price > 0) {
        value = shares * price;
        const pnl = computePnL(h, price);
        pnlAbs = pnl.pnlAbs;
        pnlPct = pnl.pnlPct;
        if (Number.isFinite(change)) {
          dayChangeAbs = shares * change;
        }
        if (Number.isFinite(q?.change_pct)) {
          dayChangePct = q.change_pct;
        }
        totalValue += value;
        totalCost += cost;
        pricedValueSum += value;
        if (Number.isFinite(dayChangeAbs)) totalDayChange += dayChangeAbs;
        if (Number.isFinite(prevClose)) totalPrevValue += shares * prevClose;
      }
      return {
        ticker: t,
        shares,
        avgCost,
        price: Number.isFinite(price) ? price : null,
        value,
        pnlAbs,
        pnlPct,
        dayChangeAbs,
        dayChangePct,
        nextEarnings: meta[t]?.next_earnings_date || null,
        daysToEarnings: meta[t]?.days_to_earnings ?? null,
      };
    });

    // 構成比 (%)
    enriched.forEach((r) => {
      r.weightPct = r.value && pricedValueSum > 0 ? (r.value / pricedValueSum) * 100 : null;
    });

    // 構成比降順 → ticker 昇順
    enriched.sort((a, b) => {
      const aw = a.weightPct ?? -1;
      const bw = b.weightPct ?? -1;
      if (aw !== bw) return bw - aw;
      return a.ticker.localeCompare(b.ticker);
    });

    const totalPnlAbs = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnlAbs / totalCost) * 100 : null;
    const dayChangePct = totalPrevValue > 0 ? (totalDayChange / totalPrevValue) * 100 : null;

    return {
      rows: enriched,
      totals: {
        totalValue,
        totalCost,
        totalPnlAbs,
        totalPnlPct,
        dayChangeAbs: totalDayChange,
        dayChangePct,
        pricedCount: enriched.filter((r) => r.value != null).length,
      },
    };
  }, [tickers, holdings, prices, meta]);

  if (tickers.length === 0) return null;

  const top1 = rows[0];
  const concentrated = top1?.weightPct != null && top1.weightPct >= 30;

  const dayStatus = statusFromPct(totals.dayChangePct);
  const pnlStatus = statusFromPct(totals.totalPnlPct);

  return (
    <section className="portfolio-dashboard panel-card rounded-2xl px-6 pt-4 pb-6 shadow-sm"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <h3 className="section-heading">
        ポートフォリオ
        <span className="section-heading-count">{tickers.length} 銘柄</span>
      </h3>

      {/* ── サマリー KPI 4 枚 ─────────────────────────────── */}
      {/* レビュー指摘 (UI/UX #1): % を一次情報、$ 金額を二次に降格。
          ポートフォリオサイズに依存しない % のほうが「儲かっている／いない」
          が一目で判断できる (設計原則 ① 2 秒でわかる)。 */}
      <div className="pd-summary-grid">
        <SummaryCard
          label="当日変動"
          value={Number.isFinite(totals.dayChangePct) ? fmtSignedPct(totals.dayChangePct) : '—'}
          sub={fmtSignedUSD(totals.dayChangeAbs)}
          status={dayStatus}
          primary
        />
        <SummaryCard
          label="評価額"
          value={`$${fmtUSD(totals.totalValue)}`}
          sub={`取得 $${fmtUSD(totals.totalCost)}`}
          status="neutral"
        />
        <SummaryCard
          label="含み損益"
          value={Number.isFinite(totals.totalPnlPct) ? fmtSignedPct(totals.totalPnlPct) : '—'}
          sub={fmtSignedUSD(totals.totalPnlAbs)}
          status={pnlStatus}
        />
        <SummaryCard
          label="次回決算"
          value={(() => {
            const upcoming = rows
              .filter((r) => Number.isFinite(r.daysToEarnings) && r.daysToEarnings >= 0)
              .sort((a, b) => a.daysToEarnings - b.daysToEarnings)[0];
            if (!upcoming) return '—';
            return upcoming.daysToEarnings === 0 ? '今日' : `${upcoming.ticker} D-${upcoming.daysToEarnings}`;
          })()}
          sub="保有銘柄で最も近い"
          status={(() => {
            const upcoming = rows
              .filter((r) => Number.isFinite(r.daysToEarnings) && r.daysToEarnings >= 0)
              .sort((a, b) => a.daysToEarnings - b.daysToEarnings)[0];
            if (!upcoming) return 'neutral';
            return upcoming.daysToEarnings <= 7 ? 'amber' : 'neutral';
          })()}
        />
      </div>

      {/* ── 評価額推移チャート (X-2-5-C) ── 銘柄クリックで絞り込み */}
      {lots.length > 0 && (
        <>
          {selectedTicker && (
            <div className="pd-filter-breadcrumb" role="status">
              <span className="pd-filter-label">フィルタ:</span>
              <span className="pd-filter-chip">
                <CompanyLogo ticker={selectedTicker} size={16} />
                {selectedTicker} のみ
              </span>
              <button
                type="button"
                className="pd-filter-clear"
                onClick={() => setSelectedTicker(null)}
                aria-label="フィルタ解除"
              >
                全銘柄に戻す ×
              </button>
            </div>
          )}
          <Suspense fallback={<div className="pd-history-fallback" />}>
            <PortfolioHistoryChart lots={filteredLotsForChart} />
          </Suspense>
        </>
      )}

      {/* ── 集中リスクチップ (top1 ≥ 30%) ─────────────────── */}
      {concentrated && (
        <div className="pd-risk-chip" role="status">
          <span className="pd-risk-icon" aria-hidden="true">⚠</span>
          <span>
            集中リスク: <strong>{top1.ticker}</strong> が {top1.weightPct.toFixed(0)}% を占めています
          </span>
        </div>
      )}

      {/* ── 銘柄一覧テーブル ─────────────────────────────── */}
      <div className="pd-table-wrap">
        <table className="pd-table">
          <thead>
            <tr>
              <th>銘柄</th>
              <th className="pd-num">株数</th>
              <th className="pd-num">取得</th>
              <th className="pd-num pd-hide-mobile">現在値</th>
              <th className="pd-num">当日</th>
              <th className="pd-num">評価額</th>
              <th className="pd-num">損益</th>
              <th className="pd-num pd-hide-mobile">構成比</th>
              <th className="pd-earn">次回決算</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dayCls = statusFromPct(r.dayChangePct);
              const pnlCls = statusFromPct(r.pnlPct);
              const eDays = r.daysToEarnings;
              const earnUrgent = Number.isFinite(eDays) && eDays >= 0 && eDays <= 7;
              const isSelected = selectedTicker === r.ticker;
              const onRowClick = () => {
                // 同じ銘柄を再クリック → 解除、別銘柄 → その銘柄に絞り込み
                setSelectedTicker(isSelected ? null : r.ticker);
              };
              return (
                <tr
                  key={r.ticker}
                  className={`pd-row${isSelected ? ' is-selected' : ''}`}
                  onClick={onRowClick}
                  tabIndex={0}
                  aria-pressed={isSelected}
                  title={isSelected ? 'クリックで解除' : `${r.ticker} のみで推移を見る`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRowClick();
                    }
                  }}
                >
                  <td className="pd-tk-cell" data-label="銘柄">
                    <span className="pd-tk-logo">
                      <CompanyLogo ticker={r.ticker} size={20} />
                    </span>
                    <span className="pd-tk-text">{r.ticker}</span>
                  </td>
                  <td className="pd-num" data-label="株数">{r.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
                  <td className="pd-num" data-label="取得">${fmtUSD(r.avgCost)}</td>
                  <td className="pd-num pd-hide-mobile" data-label="現在値">{r.price != null ? `$${fmtUSD(r.price)}` : '…'}</td>
                  <td className={`pd-num pd-${dayCls}`} data-label="当日">
                    {r.dayChangePct != null ? fmtSignedPct(r.dayChangePct) : '…'}
                  </td>
                  <td className="pd-num" data-label="評価額">{r.value != null ? `$${fmtUSD(r.value)}` : '…'}</td>
                  <td className={`pd-num pd-${pnlCls}`} data-label="損益">
                    {r.pnlPct != null ? (
                      <>
                        <div>{formatPnLPct(r.pnlPct)}</div>
                        <div className="pd-sub">{fmtSignedUSD(r.pnlAbs)}</div>
                      </>
                    ) : '…'}
                  </td>
                  <td className="pd-num pd-hide-mobile" data-label="構成比">{r.weightPct != null ? `${r.weightPct.toFixed(1)}%` : '—'}</td>
                  <td className="pd-earn" data-label="次回決算">
                    {Number.isFinite(eDays) && eDays >= 0 ? (
                      <span className={`pd-earn-badge${earnUrgent ? ' pd-earn-urgent' : ''}`}
                            title={r.nextEarnings || ''}>
                        {eDays === 0 ? '今日' : `D-${eDays}`}
                      </span>
                    ) : (
                      <span className="pd-earn-empty">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
