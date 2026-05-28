import React, { Suspense, lazy } from 'react';
import { FileBarChart2 } from 'lucide-react';
import ChapterSection from '../ChapterSection.jsx';
import { ChapterHeader } from '../JudgmentDetail.jsx';
import NewsPanel from '../../../../../components/NewsPanel.jsx';
import IRLinksPanel from '../../../../../components/IRLinksPanel.jsx';
import TenKLinksPanel from '../../../../../components/TenKLinksPanel.jsx';
import PremiumLock from '../../shared/PremiumLock.jsx';
import Card from '../../../primitives/Card.jsx';
import SectionHeader from '../../../primitives/SectionHeader.jsx';
import {
  AccordionSection,
  useIntersectionLazy,
} from '../../../primitives/index.js';

// DetailReport は重量級 (36 KB gzip) のため lazy load
const DetailReport = lazy(() => import('../../../../../components/DetailReport.jsx'));

/**
 * v125 P8-2 Sprint A: 章 ③ リファレンス (ContextSection) 抽出。
 *
 * 描画順序不変 (JudgmentDetail.jsx 旧 line 1233-1390 から完全 port)。
 *
 * 含む:
 *   - 章扉 (ChapterSection or ChapterHeader)
 *   - NewsPanel (AccordionSection)
 *   - IRLinksPanel (AccordionSection)
 *   - TenKLinksPanel (AccordionSection、 isScrollV1 OFF 時のみ)
 *   - DetailReport (AccordionSection、 lazy + useIntersectionLazy)
 *
 * DetailReportAccordionContent は本 file 内 named function として配置 (JudgmentDetail.jsx から移行)。
 */
function DetailReportAccordionContent({ result, guidance, detailContext }) {
  const { ref, shouldLoad } = useIntersectionLazy({
    isOpen: false,
    rootMargin: '200px',
    once: true,
  });

  return (
    <div ref={ref}>
      {shouldLoad && (
        <Suspense
          fallback={
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 'var(--space-4, 16px)' }}>
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
      )}
      {!shouldLoad && (
        <div
          style={{
            padding: 'var(--space-6, 24px)',
            color: 'var(--text-muted)',
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          セクションを展開すると AI 詳細レポートを読み込みます
        </div>
      )}
    </div>
  );
}

export default function ContextSection({
  selectedTicker,
  result,
  guidance,
  plan,
  detailContext,
  isV2,
  isScrollV1,
  useWorkspaceReader,
  expandedSections,
}) {
  return (
    <>
      {/* === 章 5: リファレンス (H2 Chapter Break + v97 G-2 軽量強化) === */}
      {isV2 ? (
        <ChapterSection chapterNumber="③" chapterTitle="リファレンス" headerOnly tier="sub" />
      ) : (
        <ChapterHeader label="リファレンス" isChapterStart />
      )}

      {selectedTicker && (
        isScrollV1 ? (
          <div id="sec-news">
            <NewsPanel ticker={selectedTicker} useWorkspaceReader={useWorkspaceReader} />
          </div>
        ) : (
          <div className="tier-l-glow" data-testid="library-news-wrapper">
            <AccordionSection
              id="sec-news"
              title="最新ニュース"
              tier={2}
              defaultOpen={false}
              controlledOpen={expandedSections.has('news') || undefined}
            >
              {/* v100 hover halo クリッピング fix: inner padding で breathing room 担保 */}
              <div id="sec-news-inner" style={{ padding: '0 var(--space-3, 12px)' }}>
                <NewsPanel ticker={selectedTicker} useWorkspaceReader={useWorkspaceReader} hideHeading={!isScrollV1} />
              </div>
            </AccordionSection>
          </div>
        )
      )}

      {/* === Sprint 3: IRLinksPanel → AccordionSection wrap (collapsed) === */}
      {selectedTicker && (
        isScrollV1 ? (
          <div id="sec-ir">
            <IRLinksPanel ticker={selectedTicker} />
          </div>
        ) : (
          <div className="tier-l-glow" data-testid="library-ir-wrapper">
            <AccordionSection
              id="sec-ir"
              title="IR Links"
              tier={2}
              defaultOpen={false}
              controlledOpen={expandedSections.has('ir-links') || undefined}
            >
              <div id="sec-ir-inner" style={{ padding: '0 var(--space-3, 12px)' }}>
                <IRLinksPanel ticker={selectedTicker} hideHeading={!isScrollV1} />
              </div>
            </AccordionSection>
          </div>
        )
      )}

      {/* v104 release MVP: 10-K (年次報告書) AccordionSection — SEC EDGAR 直 fetch、 free user 開放。 */}
      {selectedTicker && !isScrollV1 && (
        <div className="tier-l-glow" data-testid="library-10k-wrapper">
          <AccordionSection
            id="sec-10k"
            title="10-K (年次報告書)"
            tier={2}
            defaultOpen={false}
            controlledOpen={expandedSections.has('ten-k') || undefined}
          >
            <div id="sec-10k-inner" style={{ padding: '0 var(--space-3, 12px)' }}>
              <TenKLinksPanel ticker={selectedTicker} hideHeading />
            </div>
          </AccordionSection>
        </div>
      )}

      {/* === Sprint 3: DetailReport → AccordionSection wrap + useIntersectionLazy 連動 === */}
      {result && (
        isScrollV1 ? (
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
                  icon={<FileBarChart2 size={18} strokeWidth={1.5} />}
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
        ) : (
          <div className="tier-l-glow" data-testid="library-report-wrapper">
            <AccordionSection
              id="sec-report"
              title="AI 詳細レポート"
              label="PRO"
              tier={2}
              defaultOpen={false}
              controlledOpen={expandedSections.has('detail-report') || undefined}
            >
              <div style={{ padding: '0 var(--space-3, 12px)' }}>
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
                  <DetailReportAccordionContent
                    result={result}
                    guidance={guidance}
                    detailContext={detailContext}
                  />
                </PremiumLock>
              </div>
            </AccordionSection>
          </div>
        )
      )}
    </>
  );
}
