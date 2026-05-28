import React from 'react';
import ChapterSection from '../ChapterSection.jsx';
import { ChapterHeader } from '../JudgmentDetail.jsx';
import AnalystPanel from '../../../../../components/AnalystPanel.jsx';
import InsightsPanel from '../../../../../components/InsightsPanel.jsx';
import QuarterlyHistoryTable from '../../../../../components/QuarterlyHistoryTable.jsx';
import PremiumLock from '../../shared/PremiumLock.jsx';
import {
  AccordionSection,
} from '../../../primitives/index.js';
import ChapterTabs from '../../../primitives/ChapterTabs.jsx';

/**
 * v125 P8-2 Sprint A: 章 II 市場評価 (MarketEvalSection) 抽出。
 *
 * 描画順序不変 (JudgmentDetail.jsx 旧 line 950-1129 から完全 port)。
 *
 * 含む:
 *   - 章扉 (ChapterSection or ChapterHeader)
 *   - AnalystPanel + InsightsPanel (ChapterTabs if isV3、 個別 if isV3 OFF)
 *   - QuarterlyHistoryTable (AccordionSection、 isV3 OFF 時のみ — isV3 ON 時は章 ① ChapterTabs に統合済)
 *   - InsightsPanel (AccordionSection、 isV3 OFF 時のみ — isV3 ON 時は ChapterTabs に統合済)
 */
export default function MarketEvalSection({
  selectedTicker,
  plan,
  detail,
  detailContext,
  isV2,
  isV3,
  isScrollV1,
  expandedSections,
  ch3Tab,
  setCh3Tab,
  analystHaloTriggerRef,
  qhistoryHaloTriggerRef,
  haloFiredSetRef,
}) {
  return (
    <>
      {/* === 章 3: 市場評価 (H2 Chapter Break + v97 G-2 軽量強化) === */}
      {isV2 ? (
        <ChapterSection chapterNumber="II" chapterTitle="市場評価" headerOnly tier="main" />
      ) : (
        <ChapterHeader label="市場評価" isChapterStart />
      )}

      {/* v105 Phase G Phase 5: 章 3 を 2 tab interface に統合 (isV3 ON 時)。
          Tab 1: アナリスト視点、 Tab 2: 市場の声。 */}
      {selectedTicker && isV3 && !isScrollV1 ? (
        <ChapterTabs
          tabs={[
            { key: 'analyst', label: 'アナリスト視点' },
            { key: 'insights', label: '市場の声' },
          ]}
          activeKey={ch3Tab}
          onChange={setCh3Tab}
          ariaLabel="市場評価 — アナリスト視点 / 市場の声"
        >
          {{
            analyst: (
              <div id="sec-analyst-v3">
                <AnalystPanel
                  ticker={selectedTicker}
                  plan={plan}
                  currentPrice={Number.isFinite(detail?.price) ? Number(detail.price) : null}
                />
              </div>
            ),
            insights: (
              <div id="sec-insights-v3">
                <InsightsPanel
                  ticker={selectedTicker}
                  user={detailContext.user}
                  isPro={detailContext.isPro}
                  onUpgradeClick={detailContext.onUpgrade}
                  onSignIn={detailContext.onSignIn}
                />
              </div>
            ),
          }}
        </ChapterTabs>
      ) : selectedTicker && (
        isScrollV1 ? (
          <div id="sec-analyst">
            <AnalystPanel
              ticker={selectedTicker}
              plan={plan}
              currentPrice={Number.isFinite(detail?.price) ? Number(detail.price) : null}
            />
          </div>
        ) : (
          <AccordionSection
            id="sec-analyst"
            title="アナリスト視点"
            tier={2}
            defaultOpen={false}
            controlledOpen={expandedSections.has('analyst-panel') || undefined}
            onOpenChange={(id, isOpen) => {
              if (isOpen && !haloFiredSetRef.current.has('analyst-panel')) {
                haloFiredSetRef.current.add('analyst-panel');
                setTimeout(() => analystHaloTriggerRef.current?.(), 500);
              }
            }}
          >
            <AnalystPanel
              ticker={selectedTicker}
              plan={plan}
              currentPrice={Number.isFinite(detail?.price) ? Number(detail.price) : null}
              haloTriggerRef={analystHaloTriggerRef}
            />
          </AccordionSection>
        )
      )}

      {/* === Sprint 3: QuarterlyHistoryTable → AccordionSection wrap (collapsed) ===
          v104 Phase G Phase 4: isV3 ON 時は章 ① ChapterTabs の「直近 8Q」 tab に統合済 → render しない。 */}
      {selectedTicker && !isV3 && (
        isScrollV1 ? (
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
        ) : (
          <AccordionSection
            id="sec-quarterly-history"
            title="直近 8Q 履歴"
            label="PRO"
            tier={2}
            defaultOpen={false}
            controlledOpen={expandedSections.has('quarterly-history') || undefined}
            onOpenChange={(id, isOpen) => {
              if (isOpen && !haloFiredSetRef.current.has('quarterly-history')) {
                haloFiredSetRef.current.add('quarterly-history');
                setTimeout(() => qhistoryHaloTriggerRef.current?.(), 500);
              }
            }}
          >
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
              <div id="sec-quarterly-history-inner">
                <QuarterlyHistoryTable
                  ticker={selectedTicker}
                  limit={8}
                  haloTriggerRef={qhistoryHaloTriggerRef}
                />
              </div>
            </PremiumLock>
          </AccordionSection>
        )
      )}

      {/* === Sprint 3: InsightsPanel → AccordionSection wrap (collapsed) ===
          v105 Phase G Phase 5: isV3 ON 時は章 II ChapterTabs の「市場の声」 tab に統合済 → render しない。 */}
      {selectedTicker && !isV3 && (
        isScrollV1 ? (
          <div id="sec-insights">
            <InsightsPanel
              ticker={selectedTicker}
              user={detailContext.user}
              isPro={detailContext.isPro}
              onUpgradeClick={detailContext.onUpgrade}
              onSignIn={detailContext.onSignIn}
            />
          </div>
        ) : (
          <AccordionSection
            id="sec-insights"
            title="市場の声"
            tier={2}
            defaultOpen={false}
            controlledOpen={expandedSections.has('insights') || undefined}
          >
            <InsightsPanel
              ticker={selectedTicker}
              user={detailContext.user}
              isPro={detailContext.isPro}
              onUpgradeClick={detailContext.onUpgrade}
              onSignIn={detailContext.onSignIn}
            />
          </AccordionSection>
        )
      )}
    </>
  );
}
