import React, { Suspense, lazy } from 'react';
import { useJudgment } from '../../state/JudgmentContext.jsx';
import Hero from './Hero.jsx';
import KpiStrip from './KpiStrip.jsx';
import VerdictDetail from './VerdictDetail.jsx';
import FiveConditionsCard from './FiveConditionsCard.jsx';
import SimpleSection from './SimpleSection.jsx';
import SectionDivider from './SectionDivider.jsx';
import ProfileCard from './ProfileCard.jsx';
import EarningsBars from './EarningsBars.jsx';
import ConditionGrid from './ConditionGrid.jsx';
import SkeletonDetail from './SkeletonDetail.jsx';
import Card from '../../primitives/Card.jsx';
import SectionHeader from '../../primitives/SectionHeader.jsx';
import PremiumLock from '../shared/PremiumLock.jsx';
import NewsPanel from '../../../../components/NewsPanel.jsx';
import IRLinksPanel from '../../../../components/IRLinksPanel.jsx';
import InsightsPanel from '../../../../components/InsightsPanel.jsx';
import StockPriceChart from '../../../../components/StockPriceChart.jsx';
import GuidanceCard from '../../../../components/GuidanceCard.jsx';
import HistoryChart from '../../../../components/HistoryChart.jsx';
// handover v82 Phase 2: 8Q 履歴を Pane 3 に mount。 旧来は DetailReport tab だけだったが
// Pane 3 で常時可視化することで「直近 8Q の Beat/Miss streak」 を Trust signal として front 出し。
import QuarterlyHistoryTable from '../../../../components/QuarterlyHistoryTable.jsx';
// handover v82 Phase 3: AnalystPanel (目標株価 / 推奨分布 / モメンタム / timeline)。
// 階層 2 Fundamentals の HistoryChart 直後 + QuarterlyHistoryTable 直前に mount。
import AnalystPanel from '../../../../components/AnalystPanel.jsx';

// DetailReport は重量級 (36 KB gzip) のため lazy load
const DetailReport = lazy(() => import('../../../../components/DetailReport.jsx'));

// PR-2 feature flag: localStorage.pane3_v1='1' で旧 UI (VerdictDetail + ConditionGrid 二重) に切替可。
// 6 体合議 + §-1-B postmortem「撤回コスト最小化設計」の学び適用。
// デフォルト = 新 UI (FiveConditionsCard 統合)。dogfood で問題があれば DevTools で
// localStorage.setItem('pane3_v1', '1') → リロードで即旧 UI に戻る。
function isPane3V1() {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem('pane3_v1') === '1';
  } catch {
    return false;
  }
}

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
  useWorkspaceReader = false,
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

  // ticker は選択されたが結果まだ無 → skeleton 表示 (loading 中の体感改善)
  if (selectedTicker && !result && detail?.isLoading) {
    return <SkeletonDetail />;
  }
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
    <div className="ds-judgment-detail" style={{ display: 'grid', gap: 20 }}>
      {/* === 階層 1: Verdict === */}
      <SectionDivider tier={1} />
      <Hero
        ticker={selectedTicker}
        companyName={result?.companyName}
        verdict={verdict}
        period={result?.latestPeriod ? `FY${result.latestPeriod}` : null}
      />
      <KpiStrip stats={kpis} />
      {/* 2026-05-12 PR-2: VerdictDetail + ConditionGrid を FiveConditionsCard に統合。
          feature flag `localStorage.pane3_v1='1'` で旧 UI に切替可 (撤回コスト最小化、§-1-B postmortem 学び適用)。
          6 体合議 (UI/UX / 金融 / Web 設計 / Web 開発 / マーケター / Anthropic engineer) 推奨。 */}
      {isPane3V1() ? (
        <>
          <VerdictDetail
            conditions={conditions}
            passedCount={result?.passedCount}
            totalCount={result?.totalCount}
          />
          {conditions.length > 0 && (
            <ConditionGrid
              conditions={conditions}
              isPro={detailContext.isPro}
              onUpgrade={detailContext.onUpgrade}
            />
          )}
        </>
      ) : (
        conditions.length > 0 && (
          <FiveConditionsCard
            conditions={conditions}
            passedCount={result?.passedCount}
            totalCount={result?.totalCount}
            isPro={detailContext.isPro}
            onUpgrade={detailContext.onUpgrade}
          />
        )
      )}

      {/* ガイダンス (今期/来期 EPS) — GuidanceCard 自身が panel-card を持つので outer Card 不要 (二重枠回避) */}
      {guidance && (
        <div id="sec-guidance">
          <GuidanceCard guidance={guidance} isSecLoading={false} />
        </div>
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

      {/* 過去推移 — HistoryChart 自身が panel-card を持つので outer Card 不要 */}
      {result?.periods?.length > 0 && (
        <div id="sec-history-chart">
          <HistoryChart periods={result.periods} currency={result.currency} />
        </div>
      )}

      {/* アナリスト視点 (handover v82 Phase 3) — AnalystPanel 自身が panel-card を持つ。
          上段 3 view は全員可視 (見せ部分 b)、 下段 timeline は Pro でフル firm 名表示。
          現在値は detail.price から渡し、 target_upside_pct を計算可能にする。 */}
      {selectedTicker && (
        <div id="sec-analyst">
          <AnalystPanel
            ticker={selectedTicker}
            plan={plan}
            currentPrice={Number.isFinite(detail?.price) ? Number(detail.price) : null}
          />
        </div>
      )}

      {/* 直近 8Q 履歴 (Pro 限定、 handover v82 Phase 2) — QuarterlyHistoryTable 自身が
          panel-card 相当の枠を持つので outer Card 不要。 PremiumLock で Pro gating、
          選択 ticker のみ fetch。 */}
      {selectedTicker && (
        <PremiumLock
          feature="earnings_8q"
          plan={plan}
          label="直近 8Q の Beat/Miss streak を一覧で"
          bullets={[
            '過去 8 四半期の EPS / 売上 surprise %',
            '連続 Beat 期数の自動集計',
            'ピンクが直近、 直前の決算と並べて trend を可視化',
          ]}
          onUpgrade={detailContext.onUpgrade}
        >
          <div id="sec-quarterly-history">
            <QuarterlyHistoryTable ticker={selectedTicker} limit={8} />
          </div>
        </PremiumLock>
      )}

      {/* 市場の声 — InsightsPanel 自身が panel-card を持つので outer Card 不要 */}
      {selectedTicker && (
        <div id="sec-insights">
          <InsightsPanel
            ticker={selectedTicker}
            user={detailContext.user}
            isPro={detailContext.isPro}
            onUpgradeClick={detailContext.onUpgrade}
            onSignIn={detailContext.onSignIn}
          />
        </div>
      )}

      {/* 株価チャート — StockPriceChart 自身が panel-card を持つので outer Card 不要 */}
      {selectedTicker && (
        <div id="sec-chart">
          <StockPriceChart ticker={selectedTicker} isPremiumUser={plan === 'premium'} />
        </div>
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

      {/* ニュース — NewsPanel 自身が panel-card を持つので outer Card 不要 */}
      {/* §v66 §2: workspace mode (Pane 3) では Pane 5 Reading Room を開く */}
      {selectedTicker && (
        <div id="sec-news">
          <NewsPanel ticker={selectedTicker} useWorkspaceReader={useWorkspaceReader} />
        </div>
      )}

      {/* IR Links — IRLinksPanel 自身が panel-card を持つので outer Card 不要 */}
      {selectedTicker && (
        <div id="sec-ir">
          <IRLinksPanel ticker={selectedTicker} />
        </div>
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
