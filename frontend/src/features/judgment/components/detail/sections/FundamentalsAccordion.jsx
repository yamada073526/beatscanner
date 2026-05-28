import React from 'react';
import ProfileCard from '../ProfileCard.jsx';
import SectionDivider from '../SectionDivider.jsx';
import ChapterSection from '../ChapterSection.jsx';
import { ChapterHeader } from '../JudgmentDetail.jsx';
import GuidanceCard from '../../../../../components/GuidanceCard.jsx';
import EarningsHistoryChart from '../../../../../components/EarningsHistoryChart.jsx';
import QuarterlyHistoryTable from '../../../../../components/QuarterlyHistoryTable.jsx';
import PremiumLock from '../../shared/PremiumLock.jsx';
import {
  AccordionSection,
} from '../../../primitives/index.js';
import SectionFade from '../../../primitives/SectionFade.jsx';
import ChapterTabs from '../../../primitives/ChapterTabs.jsx';

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
}) {
  return (
    <>
      {/* === 章 2: 基本財務 (H2 Chapter Break + v97 G-2 軽量強化) ===
          v97 G-2 sub-agent verdict: SectionDivider expandedLabel を「数値の根拠」 に変更。
          Phase G Phase 3 + v99 dogfood 3 体合議 verdict (2+3 構成):
          - v2 mode: 副柱 (II. 数値) = sans 13px + muted (主柱 III と差別化)
          - default: 既存 SectionDivider「数値の根拠」 維持 (revert 安全) */}
      {isV2 ? (
        <ChapterSection chapterNumber="①" chapterTitle="数値" headerOnly tier="sub" />
      ) : (
        <div data-chapter-start="true">
          <SectionDivider expandedLabel="数値の根拠" />
        </div>
      )}

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
                    <GuidanceCard
                      guidance={guidance}
                      isLoading={!guidance && detail?.isLoading !== false}
                      isSecLoading={false}
                      nextEarningsDays={detail?.nextEarningsDays ?? null}
                    />
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
    </>
  );
}
