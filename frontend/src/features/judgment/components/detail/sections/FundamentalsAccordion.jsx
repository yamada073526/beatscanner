import React from 'react';
import ProfileCard from '../ProfileCard.jsx';
import SectionDivider from '../SectionDivider.jsx';
import ChapterSection from '../ChapterSection.jsx';
import { ChapterHeader } from '../JudgmentDetail.jsx';
import GuidanceCard from '../../../../../components/GuidanceCard.jsx';
import ForwardOutlookSection from '../../../../../components/ForwardOutlookSection.jsx';
import EarningsHistoryChart from '../../../../../components/EarningsHistoryChart.jsx';
import QuarterlyHistoryTable from '../../../../../components/QuarterlyHistoryTable.jsx';
import PremiumLock from '../../shared/PremiumLock.jsx';
import {
  AccordionSection,
} from '../../../primitives/index.js';
import SectionFade from '../../../primitives/SectionFade.jsx';
import ChapterTabs from '../../../primitives/ChapterTabs.jsx';
// Sprint 2 (CAN-SLIM Phase 1 UX): ライター憲法サマリーブロック
import FundamentalsChapterSummary from './FundamentalsChapterSummary.jsx';

/**
 * v125 P8-2 Sprint A: 章 ① 数値 (FundamentalsAccordion) 抽出。
 *
 * 描画順序不変 (JudgmentDetail.jsx 旧 line 803-948 から完全 port)。
 * Sprint B で順序入替時にこの component を新位置に移動するだけで diff が「移動」 だけに。
 *
 * 含む:
 *   - 章扉 (ChapterSection or SectionDivider)
 *   - ProfileCard (AccordionSection wrap、 isScrollV1 OFF 時)
 *   - ChapterTabs (Guidance / EarningsHistory / QuarterlyHistory) if isV3
 *   - 個別 GuidanceCard + EarningsHistoryChart (isV3 OFF 時)
 */
export default function FundamentalsAccordion({
  selectedTicker,
  result,
  guidance,
  plan,
  detail,
  detailContext,
  isV2,
  isV3,
  isScrollV1,
  expandedSections,
  ch2Tab,
  setCh2Tab,
  onAnalyze,
  // v184 grill-me: v5 (入れ子章再編) では章扉を JudgmentDetail 側の ChapterSection で統一する
  // ため、本 component の内包章扉 (ChapterSection / SectionDivider) を非表示にする。
  hideChapterHeader = false,
}) {
  const isFundaLoading = !result && detail?.isLoading !== false;
  return (
    // Sprint 2: funda-section wrapper — feedback_testid_all_render_paths に準拠。
    // loading/errored/empty/main 全 state で testid を取得可能にする。
    // クラスなしで始める (発光バグ §C-1〜C-4 回避)。
    <div
      data-testid="funda-section"
      data-state={isFundaLoading ? 'loading' : result ? 'main' : 'empty'}
    >
      {/* === 章 2: ファンダメンタル (Sprint 2: chapterTitle「数値」→「ファンダメンタル」)
          v97 G-2 sub-agent verdict: SectionDivider expandedLabel を「数値の根拠」 に変更。
          Phase G Phase 3 + v99 dogfood 3 体合議 verdict (2+3 構成):
          - v2 mode: 副柱 (ファンダメンタル) = sans 13px + muted (主柱 III と差別化)
          - default: 既存 SectionDivider「数値の根拠」 維持 (revert 安全) */}
      {hideChapterHeader ? null : isV2 ? (
        <ChapterSection chapterNumber="①" chapterTitle="ファンダメンタル" headerOnly tier="sub" />
      ) : (
        <div data-chapter-start="true">
          <SectionDivider expandedLabel="数値の根拠" />
        </div>
      )}

      {/* Sprint 2: ライター憲法サマリーブロック (章扉直後) */}
      <FundamentalsChapterSummary
        result={result}
        guidance={guidance}
        isLoading={isFundaLoading}
        hasError={false}
      />

      {/* === Sprint 3: ProfileCard → AccordionSection wrap (collapsed) ===
          v104 Phase G Phase 4: ProfileCard は tab 外 (会社概要 anchor 維持)、 isV3 でも常時表示 */}
      {isScrollV1 ? (
        <ProfileCard
          ticker={selectedTicker}
          companyName={result?.companyName}
          dataSource={result?.dataSource}
          latestPeriod={result?.latestPeriod}
          latestDate={result?.latestDate}
          onNavigateTicker={onAnalyze}
        />
      ) : (
        <AccordionSection
          id="sec-profile"
          title="会社概要"
          tier={2}
          defaultOpen={true}
          controlledOpen={expandedSections.has('profile') || undefined}
        >
          <ProfileCard
            ticker={selectedTicker}
            companyName={result?.companyName}
            dataSource={result?.dataSource}
            latestPeriod={result?.latestPeriod}
            latestDate={result?.latestDate}
            onNavigateTicker={onAnalyze}
          />
        </AccordionSection>
      )}

      {/* v104 Phase G Phase 4: Guidance + 過去 5 年 EarningsHistory + 直近 8Q を 1 tab interface に統合 (isV3 ON)。
          isV3 OFF 時は既存 縦並びを維持 (dogfood revert 安全)。 */}
      {isV3 ? (
        (() => {
          // v115 user feedback: 過去 5 年 タブが 3 年分しか表示されない → label を data 件数で動的化
          const periodYears = new Set(
            (result?.periods ?? [])
              .map((p) => String(p?.period || '').replace(/^FY/, '').slice(0, 4))
              .filter((y) => /^\d{4}$/.test(y))
          );
          const displayYears = Math.min(periodYears.size, 5);
          const historyLabel = displayYears > 0 ? `過去 ${displayYears} 年` : '過去 5 年';
          return (
            <SectionFade id="sec-ch2-tabs" staggerIndex={1}>
              <ChapterTabs
                tabs={[
                  { key: 'guidance', label: '今期/来期' },
                  { key: 'history', label: historyLabel },
                  { key: 'quarterly', label: '直近 8Q', badge: 'PRO' },
                ]}
                activeKey={ch2Tab}
                onChange={setCh2Tab}
                ariaLabel="基本財務 — 期間別 EPS / Revenue"
              >
                {{
                  guidance: (
                    <>
                      <GuidanceCard
                        guidance={guidance}
                        isLoading={!guidance && detail?.isLoading !== false}
                        isSecLoading={false}
                        nextEarningsDays={detail?.nextEarningsDays ?? null}
                      />
                      {/* v146 前方視界: 「今期/来期」 タブの「来期」 = 来期コンセンサス YoY */}
                      <ForwardOutlookSection forward={guidance?.forward} currency={result?.currency} ticker={selectedTicker} secNarrativeText={guidance?.sec_guidance_text} secNarrativeSource={guidance?.sec_guidance_source} />
                    </>
                  ),
                  history: (
                    <EarningsHistoryChart
                      periods={result?.periods ?? []}
                      currency={result?.currency}
                      isLoading={!result?.periods && detail?.isLoading !== false}
                      triggerOnMount={ch2Tab === 'history'}
                    />
                  ),
                  quarterly: selectedTicker ? (
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
                      <div id="sec-quarterly-history-v3">
                        <QuarterlyHistoryTable
                          ticker={selectedTicker}
                          limit={8}
                          triggerOnMount={ch2Tab === 'quarterly'}
                        />
                      </div>
                    </PremiumLock>
                  ) : null,
                }}
              </ChapterTabs>
            </SectionFade>
          );
        })()
      ) : (
        <>
          {/* GuidanceCard: expanded 固定 (今期/来期 EPS = 投資判断の直接 input) */}
          <SectionFade id="sec-guidance" staggerIndex={1}>
            <GuidanceCard
              guidance={guidance}
              isLoading={!guidance && detail?.isLoading !== false}
              isSecLoading={false}
              nextEarningsDays={detail?.nextEarningsDays ?? null}
            />
            {/* v146 前方視界: 来期コンセンサス YoY (過去 → 未来の視線誘導) */}
            <ForwardOutlookSection forward={guidance?.forward} currency={result?.currency} ticker={selectedTicker} secNarrativeText={guidance?.sec_guidance_text} secNarrativeSource={guidance?.sec_guidance_source} />
          </SectionFade>

          {/* === Sprint 3: EarningsHistoryChart (旧 EarningsBars + HistoryChart 統合) === */}
          <SectionFade id="sec-earnings-history" staggerIndex={2}>
            <EarningsHistoryChart
              periods={result?.periods ?? []}
              currency={result?.currency}
              isLoading={!result?.periods && detail?.isLoading !== false}
            />
          </SectionFade>
        </>
      )}
    </div>
  );
}
