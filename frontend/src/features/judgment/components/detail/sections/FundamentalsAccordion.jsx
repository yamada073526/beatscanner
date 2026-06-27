import React, { useState, useEffect } from 'react';
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
// v6 Sprint 2-C 後続: 会社概要 fold ヘッダーのセグメント%サマリー (非 LLM・quarterly-history 再利用)
import { fetchQuarterlyHistory } from '../../../../../api.js';
import { buildSegmentSummaryText } from '../../../../../lib/segmentNames.js';

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
  // v185 A (2026-06-08、 user 確定): v5 章内順序「5条件→決算→TTM→会社概要」 のため章内 section を分割描画。
  //   'earnings' = 章サマリー + 決算 (ChapterTabs / 縦並び)、 'profile' = 会社概要 (ProfileCard) のみ。
  //   null (= v4/legacy) は従来順 (章サマリー → 会社概要 → 決算) で全 section 描画 (BC 担保)。
  renderSection = null,
  // v190 (3体合議): v5 会社概要 AccordionSection title を L2 セクション冠の外観に揃える style。
  //   JudgmentDetail から sectionHeadingL2Style を受け取る。省略時 (v4/legacy) は AccordionSection 既定。
  sectionHeadingStyle = undefined,
  // v6 Sprint 2-C 後続: true のとき会社概要 fold ヘッダーにセグメント%サマリー (mockup f-sum) を常時表示。
  //   JudgmentDetail の v6 経路からのみ true (flag pane3_v6 OFF default・blast 限定)。
  //   data 源は非 LLM の quarterly-history.segment_summary (prefetch 済・cost 中立)。
  segmentSummaryInHeader = false,
}) {
  const isFundaLoading = !result && detail?.isLoading !== false;
  // v185 A: renderSection で表示 section を選択。null は全 section (v4 不変)。
  const showSummaryEarnings = renderSection == null || renderSection === 'earnings';
  const showProfile = renderSection == null || renderSection === 'profile';
  // v5 で本 component を 2 回 mount するため testid を section 別に分け重複回避。
  // v4 (renderSection=null) は従来 'funda-section' を維持 (snap script / 既存参照 BC)。
  const testId = renderSection ? `funda-section-${renderSection}` : 'funda-section';

  // v6 Sprint 2-C 後続: 会社概要 fold ヘッダーのセグメント%サマリー (例「iPhone 51% · Services 26% · ほか」)。
  //   折りたたみ時も常時表示するため ProfileCard (展開時のみ mount) には依存できない → ここで非 LLM の
  //   quarterly-history.segment_summary を直接読み 1 行テキスト化する。fetchQuarterlyHistory は prefetch 済
  //   (api.js prefetchAll) + dedupGet で重複排除されるため追加 cost は実質ゼロ。§38: 売上構成比は事実数値のみ。
  const [segSummaryText, setSegSummaryText] = useState(null);
  useEffect(() => {
    if (!segmentSummaryInHeader || !selectedTicker) {
      setSegSummaryText(null);
      return undefined;
    }
    let cancelled = false;
    fetchQuarterlyHistory(selectedTicker, 8)
      .then((res) => {
        if (!cancelled) setSegSummaryText(buildSegmentSummaryText(res?.segment_summary));
      })
      .catch(() => {
        if (!cancelled) setSegSummaryText(null);
      });
    return () => {
      cancelled = true;
    };
  }, [segmentSummaryInHeader, selectedTicker]);

  return (
    // Sprint 2: funda-section wrapper — feedback_testid_all_render_paths に準拠。
    // loading/errored/empty/main 全 state で testid を取得可能にする。
    // クラスなしで始める (発光バグ §C-1〜C-4 回避)。
    <div
      data-testid={testId}
      data-state={isFundaLoading ? 'loading' : result ? 'main' : 'empty'}
    >
      {/* === 章 2: ファンダメンタル (Sprint 2: chapterTitle「数値」→「ファンダメンタル」)
          v97 G-2 sub-agent verdict: SectionDivider expandedLabel を「数値の根拠」 に変更。
          Phase G Phase 3 + v99 dogfood 3 体合議 verdict (2+3 構成):
          - v2 mode: 副柱 (ファンダメンタル) = sans 13px + muted (主柱 III と差別化)
          - default: 既存 SectionDivider「数値の根拠」 維持 (revert 安全) */}
      {(!hideChapterHeader && renderSection !== 'profile') ? (
        isV2 ? (
          <ChapterSection chapterNumber="①" chapterTitle="ファンダメンタル" headerOnly tier="sub" />
        ) : (
          <div data-chapter-start="true">
            <SectionDivider expandedLabel="数値の根拠" />
          </div>
        )
      ) : null}

      {/* Sprint 2: ライター憲法サマリーブロック (章扉直後)。v185 A: earnings section に含める。
          v190 (user dogfood ①): 「N 条件中 M クリア」 は直上の5条件カード (N/5) と重複し冗長 → v5 で非表示。
          速報スタイル (EPS/売上/セグメント/ガイダンス要点) への作り替えは別タスク
          (memory project_chapter_summary_jitchama_style、§38 6体gate)。v4/legacy (renderSection=null) は従来表示。 */}
      {showSummaryEarnings && renderSection == null && (
        <FundamentalsChapterSummary
          result={result}
          guidance={guidance}
          isLoading={isFundaLoading}
          hasError={false}
        />
      )}

      {/* === Sprint 3: ProfileCard → AccordionSection wrap (collapsed) ===
          v104 Phase G Phase 4: ProfileCard は tab 外 (会社概要 anchor 維持)、 isV3 でも常時表示。
          v185 A: profile section (v5 では章末「会社概要」) として分離。 */}
      {showProfile && (isScrollV1 ? (
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
          /* v6 Sprint 2-C 後続: 折りたたみ時もセグメント%サマリーを常時表示 (mockup f-sum)。
             v5/legacy (segmentSummaryInHeader=false) は undefined で従来不変。 */
          summary={segmentSummaryInHeader ? segSummaryText : undefined}
          /* v190 (3体合議): v5 では会社概要 title を L2 セクション冠の外観 (決算/バリュエーションと同 token) に統一。
             v4/legacy (sectionHeadingStyle 未指定) は AccordionSection 既定の title スタイル。 */
          titleStyle={renderSection === 'profile' ? sectionHeadingStyle : undefined}
          /* v191 (3体合議 A1): v5 会社概要のみ chevron を右端へ (L2 冠と左端整列、design_recipes §C-11)。 */
          chevronPosition={renderSection === 'profile' ? 'right' : 'left'}
          /* v189 (3体合議 qa verdict): v5 (renderSection==='profile') では会社概要を defaultOpen=false で
             畳む (毎日見る情報ではない、 原則① 読み手に負担をかけない)。v4/legacy (renderSection=null) は true 維持。 */
          defaultOpen={renderSection === 'profile' ? false : true}
          controlledOpen={expandedSections.has('profile') || undefined}
        >
          <ProfileCard
            ticker={selectedTicker}
            companyName={result?.companyName}
            dataSource={result?.dataSource}
            latestPeriod={result?.latestPeriod}
            latestDate={result?.latestDate}
            onNavigateTicker={onAnalyze}
            /* §C-11 C (v195): v5 (= renderSection 'profile' + sectionHeadingStyle 供給) では内部
               SectionHeader「プロフィール」 の gold frame を plain 化 (会社概要 L2 冠の傘下のため)。 */
            plainHeader={renderSection === 'profile' && !!sectionHeadingStyle}
          />
        </AccordionSection>
      ))}

      {/* v104 Phase G Phase 4: Guidance + 過去 5 年 EarningsHistory + 直近 8Q を 1 tab interface に統合 (isV3 ON)。
          isV3 OFF 時は既存 縦並びを維持 (dogfood revert 安全)。
          v185 A: 決算 (今期/来期 + 過去業績 + 直近 8Q) は earnings section に含める。 */}
      {showSummaryEarnings && (isV3 ? (
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
                        /* v191 (3体合議 B): v5 (renderSection 指定時) は「今期 決算結果」 を L3 サブ見出しに降格 */
                        headingVariant={renderSection != null ? 'l3' : 'l2'}
                      />
                      {/* v146 前方視界: 「今期/来期」 タブの「来期」 = 来期コンセンサス YoY */}
                      <ForwardOutlookSection forward={guidance?.forward} currency={result?.currency} ticker={selectedTicker} secNarrativeText={guidance?.sec_guidance_text} secNarrativeSource={guidance?.sec_guidance_source} headingVariant={renderSection != null ? 'l3' : 'l2'} />
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
              /* v191 (3体合議 B): v5 (renderSection 指定時) は「今期 決算結果」 を L3 サブ見出しに降格 */
              headingVariant={renderSection != null ? 'l3' : 'l2'}
            />
            {/* v146 前方視界: 来期コンセンサス YoY (過去 → 未来の視線誘導) */}
            <ForwardOutlookSection forward={guidance?.forward} currency={result?.currency} ticker={selectedTicker} secNarrativeText={guidance?.sec_guidance_text} secNarrativeSource={guidance?.sec_guidance_source} headingVariant={renderSection != null ? 'l3' : 'l2'} />
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
      ))}
    </div>
  );
}
