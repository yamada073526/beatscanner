import React from 'react';
import { useJudgment } from '../../state/JudgmentContext.jsx';
import Hero from './Hero.jsx';
import KpiStrip from './KpiStrip.jsx';
import VerdictDetail from './VerdictDetail.jsx';
import SimpleSection from './SimpleSection.jsx';
import SectionDivider from './SectionDivider.jsx';
import Card from '../../primitives/Card.jsx';
import SectionHeader from '../../primitives/SectionHeader.jsx';
import PremiumLock from '../shared/PremiumLock.jsx';
import NewsPanel from '../../../../components/NewsPanel.jsx';
import IRLinksPanel from '../../../../components/IRLinksPanel.jsx';
import InsightsPanel from '../../../../components/InsightsPanel.jsx';
import StockPriceChart from '../../../../components/StockPriceChart.jsx';

/**
 * Pane 3: 判定タブ詳細ペイン (Step 6 + 既存 component 配線).
 *
 * セクション順 (handover §3 Step 6 + design_recipes.md §C-10):
 *   階層 1 Verdict:   Hero, KpiStrip, VerdictDetail
 *   階層 2 Fundamentals: Profile, Insights (analyst 強弱), StockPriceChart
 *   階層 3 Context:   News, IR
 *
 * @param {object} props
 * @param {string} [props.plan='free']
 * @param {(ticker: string) => object|null} [props.detailFor]
 * @param {(ticker: string) => void} [props.onAnalyze]
 * @param {object} [props.detailContext] - 既存 panel 用 props bundle
 *   { user, isPro, onUpgrade, onSignIn }
 */
export default function JudgmentDetail({
  plan = 'free',
  detailFor,
  onAnalyze,
  detailContext = {},
}) {
  const { selectedTicker } = useJudgment();

  if (!selectedTicker) {
    return (
      <div
        className="bs-panel"
        style={{
          padding: 'var(--space-12, 48px) var(--space-6, 24px)',
          textAlign: 'center',
          color: 'var(--text-muted)',
          minHeight: 240,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        左のリストから銘柄を選択してください
      </div>
    );
  }

  const detail = detailFor ? detailFor(selectedTicker) : null;
  const result = detail?.result || null;
  const conditions = result?.conditions || [];
  const verdict = result
    ? result.overallPass
      ? 'beat'
      : 'miss'
    : 'unknown';

  // KPI 候補
  const kpis = [];
  if (detail?.price != null) {
    kpis.push({
      value: `$${Number(detail.price).toFixed(2)}`,
      label: '現在値',
      trend: detail.changePct > 0 ? 'up' : detail.changePct < 0 ? 'down' : 'neutral',
    });
  }
  if (detail?.changePct != null) {
    const pct = (detail.changePct * 100).toFixed(2);
    kpis.push({
      value: `${detail.changePct > 0 ? '+' : ''}${pct}% YTD`,
      label: 'リターン',
      trend: detail.changePct > 0 ? 'up' : detail.changePct < 0 ? 'down' : 'neutral',
    });
  }
  if (result) {
    kpis.push({
      value: `${result.passedCount ?? 0}/${result.totalCount ?? 5}`,
      label: '条件合致',
      trend: result.overallPass ? 'up' : 'neutral',
    });
  }
  // EPS Beat: 実績はあるが予想欠損 → Unknown を honest に表示 (recipes §C-9)
  kpis.push({
    value: result?.epsBeatPct != null
      ? `${result.epsBeatPct > 0 ? '+' : ''}${(result.epsBeatPct * 100).toFixed(1)}%`
      : '—',
    label: 'EPS Beat',
    verdict: result?.epsBeatPct == null ? 'unknown' : result.epsBeatPct > 0 ? 'beat' : 'miss',
    hint: result?.epsBeatPct == null ? '予想は更新待ち' : null,
  });

  return (
    <div className="ds-judgment-detail" style={{ display: 'grid', gap: 12 }}>
      {/* === 階層 1: Verdict === */}
      <SectionDivider tier={1} />
      <Hero
        ticker={selectedTicker}
        companyName={result?.companyName}
        verdict={verdict}
        period={result?.latestPeriod ? `FY${result.latestPeriod}` : null}
      />
      <KpiStrip stats={kpis} />
      <VerdictDetail
        conditions={conditions}
        passedCount={result?.passedCount}
        totalCount={result?.totalCount}
      />
      {!result && onAnalyze && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            この銘柄はまだ分析されていません
          </span>
          <button
            type="button"
            onClick={() => onAnalyze(selectedTicker)}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              color: '#fff',
              background: 'rgb(56, 189, 248)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            分析する
          </button>
        </div>
      )}

      {/* === 階層 2: Fundamentals === */}
      <SectionDivider tier={2} />
      <SimpleSection
        id="sec-profile"
        title="Profile"
        label="COMPANY"
        empty={result?.companyName ? null : '会社情報を取得中'}
      >
        {result?.companyName && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {result.companyName}
            {result?.dataSource && (
              <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                · {result.dataSource}
              </span>
            )}
          </div>
        )}
      </SimpleSection>

      {/* Insights (アナリスト強弱) — 既存 InsightsPanel を Card に内包 */}
      {selectedTicker && (
        <Card>
          <div style={{ padding: 'var(--space-6, 24px)' }}>
            <SectionHeader
              id="sec-insights"
              title="市場の声"
              label="ANALYST INSIGHTS"
            />
            <InsightsPanel
              ticker={selectedTicker}
              user={detailContext.user}
              isPro={detailContext.isPro}
              onUpgradeClick={detailContext.onUpgrade}
              onSignIn={detailContext.onSignIn}
            />
          </div>
        </Card>
      )}

      {/* 株価チャート — 既存 StockPriceChart 流用 */}
      {selectedTicker && (
        <Card>
          <div style={{ padding: 'var(--space-6, 24px)' }}>
            <SectionHeader
              id="sec-chart"
              title="株価チャート"
              label="PRICE"
            />
            <StockPriceChart ticker={selectedTicker} />
          </div>
        </Card>
      )}

      {/* === 階層 3: Context === */}
      <SectionDivider tier={3} />

      {/* News — 既存 NewsPanel 流用 */}
      {selectedTicker && (
        <Card>
          <div style={{ padding: 'var(--space-6, 24px)' }}>
            <SectionHeader
              id="sec-news"
              title="ニュース"
              label="RECENT"
            />
            <NewsPanel ticker={selectedTicker} />
          </div>
        </Card>
      )}

      {/* IR Links — 既存 IRLinksPanel 流用 */}
      {selectedTicker && (
        <Card>
          <div style={{ padding: 'var(--space-6, 24px)' }}>
            <SectionHeader
              id="sec-ir"
              title="IR Links"
              label="REFERENCES"
            />
            <IRLinksPanel ticker={selectedTicker} />
          </div>
        </Card>
      )}
    </div>
  );
}
