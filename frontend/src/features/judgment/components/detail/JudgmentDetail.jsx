import React, { Suspense, lazy } from 'react';
import { useJudgment } from '../../state/JudgmentContext.jsx';
import Hero from './Hero.jsx';
import KpiStrip from './KpiStrip.jsx';
import VerdictDetail from './VerdictDetail.jsx';
import SimpleSection from './SimpleSection.jsx';
import SectionDivider from './SectionDivider.jsx';
import ProfileCard from './ProfileCard.jsx';
import EarningsBars from './EarningsBars.jsx';
import ConditionGrid from './ConditionGrid.jsx';
import Card from '../../primitives/Card.jsx';
import SectionHeader from '../../primitives/SectionHeader.jsx';
import PremiumLock from '../shared/PremiumLock.jsx';
import NewsPanel from '../../../../components/NewsPanel.jsx';
import IRLinksPanel from '../../../../components/IRLinksPanel.jsx';
import InsightsPanel from '../../../../components/InsightsPanel.jsx';
import StockPriceChart from '../../../../components/StockPriceChart.jsx';
import GuidanceCard from '../../../../components/GuidanceCard.jsx';
import HistoryChart from '../../../../components/HistoryChart.jsx';

// DetailReport は重量級 (36 KB gzip) のため lazy load
const DetailReport = lazy(() => import('../../../../components/DetailReport.jsx'));

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
  const guidance = detail?.guidance || null;
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

      {/* 条件別 詳細 (v1 ConditionCard 流用、折り畳み式) */}
      {conditions.length > 0 && (
        <ConditionGrid
          conditions={conditions}
          isPro={detailContext.isPro}
          onUpgrade={detailContext.onUpgrade}
        />
      )}

      {/* ガイダンス (今期/来期 EPS) — v1 GuidanceCard 流用 */}
      {guidance && (
        <Card>
          <div style={{ padding: 'var(--space-6, 24px)' }}>
            <SectionHeader
              id="sec-guidance"
              title="ガイダンス"
              label="GUIDANCE"
            />
            <GuidanceCard guidance={guidance} isSecLoading={false} />
          </div>
        </Card>
      )}
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
      <ProfileCard
        ticker={selectedTicker}
        companyName={result?.companyName}
        dataSource={result?.dataSource}
        latestPeriod={result?.latestPeriod}
        latestDate={result?.latestDate}
      />
      <EarningsBars periods={result?.periods} currency={result?.currency} />

      {/* 過去推移 (売上 / EPS / CFPS) — v1 HistoryChart 流用 */}
      {result?.periods?.length > 0 && (
        <Card>
          <div style={{ padding: 'var(--space-6, 24px)' }}>
            <SectionHeader
              id="sec-history-chart"
              title="過去推移"
              label="REVENUE / EPS / CFPS"
            />
            <HistoryChart periods={result.periods} currency={result.currency} />
          </div>
        </Card>
      )}

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

      {/* Insider 取引 (Premium lock) */}
      {selectedTicker && (
        <PremiumLock
          feature="insider_trades"
          plan={plan}
          label="Insider 取引で先行情報を掴む"
          bullets={[
            'Form 4 (役員株式取引) 直近 90 日',
            '13F 機関投資家保有の Q/Q 変動',
            '大口購入時の自動アラート',
          ]}
          onUpgrade={detailContext.onUpgrade}
        >
          <SimpleSection
            id="sec-insider"
            title="Insider 取引"
            label="FORM 4 / 13F"
          >
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              (preview placeholder)
            </div>
          </SimpleSection>
        </PremiumLock>
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

      {/* AI 詳細レポート (Pro lock、lazy load) */}
      {result && (
        <PremiumLock
          feature="claude_opus_report"
          plan={plan}
          label="AI 詳細レポートで意思決定を加速"
          bullets={[
            '5 条件 + ガイダンスをまとめた決算サマリー',
            '直近ニュース/業績との相関分析',
            'Premium は Claude Opus 多面分析 (月 20 銘柄)',
          ]}
          onUpgrade={detailContext.onUpgrade}
        >
          <Card>
            <div style={{ padding: 'var(--space-6, 24px)' }}>
              <SectionHeader
                id="sec-report"
                title="AI 詳細レポート"
                label="DETAIL REPORT"
              />
              <Suspense
                fallback={
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    レポートを読み込み中...
                  </div>
                }
              >
                <DetailReport
                  analysis={result}
                  guidance={guidance}
                  onStreamingChange={() => {}}
                  isPro={detailContext.isPro}
                  onUpgrade={detailContext.onUpgrade}
                />
              </Suspense>
            </div>
          </Card>
        </PremiumLock>
      )}
    </div>
  );
}
