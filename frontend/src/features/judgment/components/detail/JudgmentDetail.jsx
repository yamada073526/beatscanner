import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { FileBarChart2 } from 'lucide-react';
import { useJudgment } from '../../state/JudgmentContext.jsx';
// handover v82 Phase 5.5: ConditionRow click → DiagramCard pulse 連携 (multi-review 6 体合議 verdict、 2026-05-17)。
// pulsingConditionIndex は workspaceStore (non-persist) で管理、 store setter は pure、
// timer は DiagramCard 側 useEffect で auto-unset (Web 設計 + 開発 reviewer 一致)。
import { useWorkspaceStore } from '../../../../state/workspaceStore.js';
import Hero from './Hero.jsx';
// Sprint 3 (Phase 2): VerdictHero — Tier S glow wrapper (Pane 3 で 1 個のみ)。
// verdict に連動した glow tint を Hero + SummaryBrief に適用。
// data-spotlight="card" で useArrivalSpotlight に自動登録。
import VerdictHero from './VerdictHero.jsx';
import KpiStrip from './KpiStrip.jsx';
import VerdictDetail from './VerdictDetail.jsx';
import FiveConditionsCard from './FiveConditionsCard.jsx';
import SimpleSection from './SimpleSection.jsx';
import SectionDivider from './SectionDivider.jsx';
import ProfileCard from './ProfileCard.jsx';
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
// Sprint 3: EarningsBars + HistoryChart を EarningsHistoryChart (small multiples 3 段) に統合。
// user override 2 (SPEC §5 Sprint 1 末尾): 売上高 / EPS / CFPS を縦バー 3 段重ねで統合表示。
import EarningsHistoryChart from '../../../../components/EarningsHistoryChart.jsx';
// handover v82 Phase 2: 8Q 履歴を Pane 3 に mount。 旧来は DetailReport tab だけだったが
// Pane 3 で常時可視化することで「直近 8Q の Beat/Miss streak」 を Trust signal として front 出し。
import QuarterlyHistoryTable from '../../../../components/QuarterlyHistoryTable.jsx';
// handover v82 Phase 3: AnalystPanel (目標株価 / 推奨分布 / モメンタム / timeline)。
// 階層 2 Fundamentals の EarningsHistoryChart 直後 + QuarterlyHistoryTable 直前に mount。
import AnalystPanel from '../../../../components/AnalystPanel.jsx';
// handover v82 Phase 5: TriageBanner (保有 × 5 条件 × Cup-Handle 三層)。
// ConditionGrid 直前 hint 1 行 (UI/UX 6 体合議 B 案)。
import TriageBanner from '../../../../components/TriageBanner.jsx';
// Sprint 6 (SPEC 2026-05-19): SummaryBrief (AI 要約) を Pane 3 Hero 直下に port。
// Hallucination Guard 4 重防御 (ErrorBoundary / BLOCKLIST_REGEX / conditional render / 数値非該当)。
// brand-aspiration §-1「コンシェルジュの一言挨拶」比喩。 frontend-architect 判定: risk 最大 → 末尾 sprint で隔離。
import SummaryBrief from '../../../../components/SummaryBrief.jsx';
// Sprint 2: AccordionSection primitive + useIntersectionLazy hook
import { AccordionSection, useIntersectionLazy } from '../../primitives/index.js';
// Sprint 4 (Phase 2): 案1 section in-view fade-in — 主要セクション wrapper
import SectionFade from '../../primitives/SectionFade.jsx';
// Sprint 0 (Phase 2): MotionProvider — LazyMotion + domAnimation (framer-motion subset)。
// Pane 3 全体を wrap することで Sprint 4 以降の m.* motion component を有効化する。
// framer-motion chunk は vite.config.js manualChunks で react-vendor から分離済 (20KB 以下目標)。
import MotionProvider from '../../../../components/MotionProvider.jsx';

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

// Sprint 3: feature flag — pane3_scroll_v1='1' で旧 flat accordion なし UI に切替可
// (§-1-B postmortem 撤回コスト最小化設計 + AccordionSection 側でも同 flag 確認)
function isPane3ScrollV1() {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem('pane3_scroll_v1') === '1';
  } catch {
    return false;
  }
}

/**
 * DetailReportAccordionContent
 *
 * Sprint 3: useIntersectionLazy 連動の lazy import 制御。
 * collapsed 時は lazy chunk fetch を抑制し、
 * header が viewport に入った時点でのみ fetch trigger を発火する。
 * React.lazy + Suspense 機構は不触 (import 文は維持)。
 */
function DetailReportAccordionContent({ result, guidance, detailContext }) {
  const { ref, shouldLoad } = useIntersectionLazy({
    isOpen: false, // accordion 開閉は AccordionSection 側で管理。本 hook は ref element の viewport 可視を検出。
    rootMargin: '200px', // header が viewport 200px 前後で pre-load 開始
    once: true, // 一度 shouldLoad=true になったら戻らない
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

/**
 * Pane 3: 判定タブ詳細ペイン (Step 6 + 既存 component 配線).
 *
 * Sprint 3 変更点 (SPEC §5 Sprint 3):
 *   1. 8 sections を AccordionSection で wrap (既定 collapsed)
 *   2. EarningsBars + HistoryChart → EarningsHistoryChart (small multiples 3 段)
 *   3. InsightsPanel header に件数表示 (badge prop via AccordionSection)
 *   4. DetailReport に useIntersectionLazy 連動 (lazy chunk fetch 抑制)
 *   5. token-level spacing 調整:
 *      - display: grid; gap: 20 → gap: var(--space-4) base
 *      - Verdict→Fundamentals 境界: margin-top: var(--space-8)
 *      - Hero: padding 非対称化 (上方重心、JudgmentDetail ラッパーで override)
 *      - KpiStrip: gridTemplateColumns 密着配置 (wrapper で override)
 *      - FiveConditionsCard: 条件行間詰め (wrapper で override)
 *
 * セクション順 (SPEC §5 Sprint 1 最終 matrix 15 sections):
 *   階層 1 Verdict:   Hero / KpiStrip / TriageBanner / FiveConditionsCard (expanded 固定)
 *   階層 2 Fundamentals: GuidanceCard (expanded) / ProfileCard (collapsed) /
 *                        EarningsHistoryChart (expanded) / AnalystPanel (collapsed) /
 *                        QuarterlyHistoryTable (collapsed) / InsightsPanel (collapsed) /
 *                        StockPriceChart (expanded 固定、user override 1) /
 *                        Insider 取引 (collapsed)
 *   階層 3 Context:   NewsPanel (collapsed) / IRLinksPanel (collapsed) /
 *                     DetailReport (collapsed + intersection lazy)
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
  // handover v82 Phase 5.5: ConditionRow click → workspaceStore.pulsingConditionIndex set。
  // DiagramCard 側 useEffect で 2800ms 後 auto-unset (Web 設計 + 開発 reviewer 一致 verdict)。
  const setPulsingConditionIndex = useWorkspaceStore((s) => s.setPulsingConditionIndex);
  // Sprint 5: condition click → collapsed AccordionSection 自動展開 + smooth scroll。
  // expandedSections は Set<string>、expandSection は setter。
  const expandedSections = useWorkspaceStore((s) => s.expandedSections);
  const expandSection = useWorkspaceStore((s) => s.expandSection);

  // Sprint 5 残作業 3: URL ?section=<id> で direct expand (1 件)。
  // 既存 ?detail=PREFIX:ID URL pattern と共存 (feedback_pane3_detail_view.md)。
  // mount 時に once 実行。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      const sectionId = new URLSearchParams(window.location.search).get('section');
      if (sectionId) {
        expandSection(sectionId);
      }
    } catch {
      // URL 解析失敗は silent (SSR / test 環境)
    }
  }, []); // deps 空配列 = mount 時 once 実行

  // P0-2: auto runAnalyze — ticker 選択時に結果がなければ自動 fire。
  // selectedTicker が変わるたびに 1 回だけ実行 (重複 fire 禁止)。
  // feedback_dead_code_hook_dependency.md: useRef で fire 済み ticker を記録し、
  // strict-mode の double-invoke でも 2 回目を skip。
  const analyzedTickerRef = useRef(null);
  useEffect(() => {
    if (!selectedTicker || !onAnalyze) return;
    const detail = detailFor ? detailFor(selectedTicker) : null;
    const hasResult = !!(detail?.result);
    if (hasResult) return; // 既に結果あり → skip
    if (analyzedTickerRef.current === selectedTicker) return; // 既に fire 済み → skip
    analyzedTickerRef.current = selectedTicker;
    console.log('[analyze] auto fire:', selectedTicker);
    try {
      onAnalyze(selectedTicker);
    } catch (err) {
      console.warn('[analyze] auto runAnalyze failed:', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicker]); // selectedTicker 変更時のみ re-run (onAnalyze / detailFor は安定参照)

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

  // InsightsPanel 件数バッジ: bull_points + bear_points の合計件数
  // データ未取得時は null (バッジ非表示)
  // 注: InsightsPanel 内部は触らない (SPEC §6 禁止)。
  // 件数は result から静的に推定 (LLM 不変, 数値のみ, Hallucination Guard 該当外)。
  // InsightsPanel が fetch 完了後にデータを持つが、外部からはアクセス不可のため
  // accordion header badge は「市場の声」のみ表示し、件数は collapsed でも見えない設計。
  // → SPEC「collapsed 状態でも中身の気配を見せる」要求に対し、
  //   実用的解として accordion header title に固定テキスト「市場の声」を使用。

  // Sprint 3: pane3_scroll_v1 flag でフラット旧 UI に切替可能
  const isScrollV1 = isPane3ScrollV1();

  return (
    // Sprint 0 (Phase 2): MotionProvider で Pane 3 全体を wrap。
    // LazyMotion + domAnimation features (framer-motion subset) を有効化。
    // Sprint 4 以降の m.section / m.div / useMotionValue 等はこの scope 内で動作する。
    // prefers-reduced-motion 対応は index.css @media ブロックで全体カバー済。
    <MotionProvider>
    <div
      className="ds-judgment-detail"
      style={{
        // v86 R5 A: gap を --space-4 (16px) → --space-6 (24px) に拡大、 Aman 級 breathing room
        // Verdict→Fundamentals 境界は --space-8 (32px) で更に上回り、 hierarchy 保持
        // Vision spacing_ratio 73 → 78+ 狙い
        display: 'grid',
        gap: 'var(--space-6, 24px)',
      }}
    >
      {/* === 階層 1: Verdict (expanded 固定) ===
          Sprint 4: tier=1 SectionDivider を削除。
          accordion header が既に「階層 chrome」を提供するため冗長。
          Hero 自身が入場感を持つため、前置 divider は不要。 */}

      {/* Sprint 3 (Phase 2): VerdictHero — Tier S glow wrapper
          Hero + SummaryBrief を verdict 連動 tint で包む。
          glow_elevation_postmortem.md 安全パターン:
            - 既存 Hero の Card wrapper と入れ子にしない (VerdictHero は外側の薄い div のみ)
            - is-arriving は useArrivalSpotlight に一元管理 (data-spotlight="card" で登録)
            - contain: paint 禁止 (index.css .verdict-hero で isolation: isolate のみ)
          verdict → tint: beat/in-line → cyan (PASS) / miss → amber (FAIL) / unknown → slate (WAIT) */}
      <VerdictHero verdict={verdict}>
        {/* Sprint 3: Hero — 上方重心 padding 非対称化 (入場感演出)
            Hero.jsx 内部は不触。wrapper で padding override を適用。
            ただし Hero は Card wrapper を持つため、ここでは JudgmentDetail レベルで
            Hero の外側に non-padding override は不要 (Card padding は Hero 内で完結)。
            token spacing 調整: JudgmentDetail grid gap で上部密度を制御。 */}
        <Hero
          ticker={selectedTicker}
          companyName={result?.companyName}
          verdict={verdict}
          period={result?.latestPeriod ? `FY${result.latestPeriod}` : null}
          nextEarningsDays={detail?.nextEarningsDays}
          nextEarningsDate={detail?.nextEarningsDate}
        />

        {/* Sprint 6: SummaryBrief (AI 要約) — Hero と KpiStrip の間に mount。
            ui-designer verdict 「Pane 3 上部 (Hero 直下) は §5 図解認知に最も貢献、最優先位置」。
            brand-aspiration 比喩「コンシェルジュの一言挨拶」。
            Hallucination Guard 4 重防御:
              第 1 層: SummaryBriefErrorBoundary (SummaryBrief 内で wrap 済)
              第 2 層: sanitizeText per-line BLOCKLIST_REGEX (SummaryBrief 内で適用済)
              第 3 層: conditional render — result が null なら mount しない
              第 4 層: 数値系 Number.isFinite — string-only LLM 出力のため非該当
            condition pulse 連動: Sprint 6 では deferred (FiveConditionsCard の CONDITION_SECTION_MAP と
            SummaryBrief の LLM 出力行は 1:1 対応が困難、SPEC §5 Sprint 6 末尾に deferred 注記)。 */}
        {result && (
          <SummaryBrief
            analysis={result}
            guidance={guidance}
          />
        )}
      </VerdictHero>

      {/* Sprint 3: KpiStrip — grid 密着配置は KpiStrip.jsx 内部に依存。
          JudgmentDetail レベルでは gap 短縮で上部スカスカを解消。 */}
      <KpiStrip stats={kpis} />

      {/* handover v82 Phase 5: 三層トリアージ banner (UI/UX 6 体合議 B 案、 ConditionGrid 直前 hint 1 行)。
          保有 × 5 条件 × Cup-Handle を 1 行で示し、 「他 N 件」 click で Pane 2 ヒートマップへ jump。
          v84 hotfix 6 段階で確立済 (hasFatal 条件)、accordion 化対象外 (SPEC §6)。
          Sprint 5: currentPrice (含み損益計算用) + onOpenAddTransaction (新規買付 button) を追加。
          Sprint 4: SectionFade で section in-view fade-in (案1) */}
      {selectedTicker && (
        <SectionFade>
        <TriageBanner
          ticker={selectedTicker}
          user={detailContext.user}
          plan={plan}
          onUpgrade={detailContext.onUpgrade}
          onJumpToScanner={detailContext.onJumpToScanner}
          currentPrice={Number.isFinite(detail?.price) ? Number(detail.price) : null}
          onOpenAddTransaction={detailContext.onOpenAddTransaction}
        />
        </SectionFade>
      )}

      {/* 2026-05-12 PR-2: VerdictDetail + ConditionGrid を FiveConditionsCard に統合。
          feature flag `localStorage.pane3_v1='1'` で旧 UI に切替可 (撤回コスト最小化、§-1-B postmortem 学び適用)。
          Sprint 3: FiveConditionsCard は expanded 固定 (accordion wrap 対象外)。
          条件行間は FiveConditionsCard 内部の設計に依存 (内部編集禁止)。 */}
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
        // P0-3: FiveConditionsCard を常時 render。conditions 空なら skeleton 表示。
        <FiveConditionsCard
          conditions={conditions}
          passedCount={result?.passedCount}
          totalCount={result?.totalCount}
          isPro={detailContext.isPro}
          onUpgrade={detailContext.onUpgrade}
          onConditionPulse={(idx) => {
            // condition 4 (営業利益増、 0-indexed) は全 step 該当 → toast fallback (DiagramCard 側で処理)。
            // 0-3 は個別 step pulse。 'all_steps' 文字列を sentinel として store に保存。
            setPulsingConditionIndex(idx === 4 ? 'all_steps' : idx);
          }}
        />
      )}

      {/* P0-1/P0-3: 分析する button は auto runAnalyze (P0-2) が失敗した場合の fallback。
          result が取得できず、かつ loading でもない場合のみ retry link を表示。
          auto runAnalyze が fire 中 (loading) は非表示。 */}
      {!result && onAnalyze && !(detailFor ? detailFor(selectedTicker)?.isLoading : false) && (
        <div
          style={{
            padding: 'var(--space-3, 12px) var(--space-4, 16px)',
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--space-3, 12px)',
          }}
        >
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            分析データを取得中...
          </span>
          <button
            type="button"
            onClick={() => {
              console.log('[analyze] retry button clicked:', selectedTicker);
              analyzedTickerRef.current = null; // 再試行を許可
              try {
                onAnalyze(selectedTicker);
              } catch (err) {
                console.warn('[analyze] retry failed:', err);
              }
            }}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--text-secondary)',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            再試行
          </button>
        </div>
      )}

      {/* === 階層 2: Fundamentals ===
          Sprint 3: Verdict→Fundamentals 境界のみ margin-top var(--space-8) で間を開ける。
          Sprint 4: label="詳細分析" を inject。 Verdict → Fundamentals 層境界を明示。
          SPEC 2026-05-19 Sprint 1 Item 6: expandedLabel に変更して h2 級 typography + 左 4px cyan accent bar を適用。
          SectionDivider 内の margin (var(--space-6) 0 var(--space-4)) が padding を包含するため、外側 marginTop は維持。
          v86 R5 A: Verdict→Fundamentals 境界 marginTop --space-8 → --space-10 (32→40px) で章扉感強化。 */}
      <div style={{ marginTop: 'var(--space-10, 40px)' }}>
        <SectionDivider expandedLabel="詳細分析" />
      </div>

      {/* GuidanceCard: expanded 固定 (今期/来期 EPS = 投資判断の直接 input)
          Sprint 4: SectionFade で section in-view fade-in (案1) */}
      {guidance && (
        <SectionFade id="sec-guidance">
          <GuidanceCard
            guidance={guidance}
            isSecLoading={false}
            nextEarningsDays={detail?.nextEarningsDays ?? null}
          />
        </SectionFade>
      )}

      {/* === Sprint 3: ProfileCard → AccordionSection wrap (collapsed) ===
          Phase 2.6 5-4: onNavigateTicker で競合 chip click → 銘柄 navigate */}
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
          defaultOpen={false}
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

      {/* === Sprint 3: EarningsHistoryChart (旧 EarningsBars + HistoryChart 統合、expanded 固定) ===
          user override 2: small multiples 縦バー 3 段 (売上高 / EPS / CFPS)。
          ファンダメンタル5条件 §5 連続増加判定の視覚 anchor として expanded 維持。
          Sprint 4: SectionFade で section in-view fade-in (案1) */}
      {result?.periods?.length > 0 && (
        <SectionFade id="sec-earnings-history">
          <EarningsHistoryChart
            periods={result.periods}
            currency={result.currency}
          />
        </SectionFade>
      )}

      {/* === Sprint 3: AnalystPanel → AccordionSection wrap (collapsed) === */}
      {selectedTicker && (
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
          >
            <AnalystPanel
              ticker={selectedTicker}
              plan={plan}
              currentPrice={Number.isFinite(detail?.price) ? Number(detail.price) : null}
            />
          </AccordionSection>
        )
      )}

      {/* === Sprint 3: QuarterlyHistoryTable → AccordionSection wrap (collapsed) ===
          PremiumLock は AccordionSection の外 (Premium lock 表示を header で見せるため)。 */}
      {selectedTicker && (
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
                <QuarterlyHistoryTable ticker={selectedTicker} limit={8} />
              </div>
            </PremiumLock>
          </AccordionSection>
        )
      )}

      {/* === Sprint 3: InsightsPanel → AccordionSection wrap (collapsed)
          SPEC §5 Sprint 3 #3: header に「市場の声」表示。
          N 件カウントは InsightsPanel 内部データ (外部アクセス不可) のため、
          accordion header は title="市場の声" のみ。 === */}
      {selectedTicker && (
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

      {/* === StockPriceChart: expanded 固定 (user override 1) ===
          「株価チャートは常に展開しておいてほしい」 (user 原文、SPEC §5 Sprint 1 Override 1)
          accordion wrap 対象外。
          Sprint 4: SectionFade で section in-view fade-in (案1) */}
      {selectedTicker && (
        <SectionFade id="sec-chart">
          <StockPriceChart ticker={selectedTicker} isPremiumUser={plan === 'premium'} />
        </SectionFade>
      )}

      {/* === Sprint 3: Insider 取引 → AccordionSection wrap (collapsed) === */}
      {selectedTicker && (
        isScrollV1 ? (
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
              {/* Phase 2.5 hotfix #8: placeholder 文言 → Premium teaser banner に変更。
                  backend /api/insider* endpoint は未実装 (Phase 3 候補)。
                  「壊れている」 と見えない明示的な Premium 訴求で Trust Cliff を解消。 */}
              <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span aria-hidden="true" style={{ fontSize: 16, flexShrink: 0 }}>🔒</span>
                <span>Premium で開放: Form 4 (役員株式売買) / 13F (機関投資家保有)</span>
              </div>
            </SimpleSection>
          </PremiumLock>
        ) : (
          <AccordionSection
            id="sec-insider"
            title="Insider 取引"
            label="PRO"
            tier={2}
            defaultOpen={false}
            controlledOpen={expandedSections.has('insider') || undefined}
          >
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
              {/* Phase 2.5 hotfix #8: placeholder 文言 → Premium teaser banner に変更。
                  SPEC §4 Hallucination Guard: 静的文言のみ、LLM 不使用。
                  文言は SPEC §4 で確定済 (一字一句変更禁止)。 */}
              <div id="sec-insider-inner" style={{ fontSize: 13, color: 'var(--text-muted)', padding: 'var(--space-4, 16px)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span aria-hidden="true" style={{ fontSize: 16, flexShrink: 0 }}>🔒</span>
                <span>Premium で開放: Form 4 (役員株式売買) / 13F (機関投資家保有)</span>
              </div>
            </PremiumLock>
          </AccordionSection>
        )
      )}

      {/* === 階層 3: Context (collapsed) ===
          Sprint 3: Context ボックス化 (border subtle で 3 件 group)。
          Sprint 4: tier=3 SectionDivider を削除済。accordion header の chrome (tier prop) が
          階層境界を代替するため冗長だった divider を除去。 */}

      {/* === Sprint 3: NewsPanel → AccordionSection wrap (collapsed) ===
          Sprint 3 (Phase 2): Tier L glow — hover 時の hairline border tint のみ、発光なし。
          tier-l-glow wrapper を AccordionSection の外側に付与。 */}
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
              tier={3}
              defaultOpen={false}
              controlledOpen={expandedSections.has('news') || undefined}
            >
              <div id="sec-news-inner">
                {/* Phase 2.7 Sprint 1 #2': workspace mode は AccordionSection header で見出し表示済 → 内部 h3 hide */}
                <NewsPanel ticker={selectedTicker} useWorkspaceReader={useWorkspaceReader} hideHeading={!isScrollV1} />
              </div>
            </AccordionSection>
          </div>
        )
      )}

      {/* === Sprint 3: IRLinksPanel → AccordionSection wrap (collapsed) ===
          Sprint 3 (Phase 2): Tier L glow — hover 時の hairline border tint のみ。 */}
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
              tier={3}
              defaultOpen={false}
              controlledOpen={expandedSections.has('ir-links') || undefined}
            >
              <div id="sec-ir-inner">
                {/* Phase 2.7 Sprint 1 #2': workspace mode は AccordionSection header で見出し表示済 → 内部 h3 hide */}
                <IRLinksPanel ticker={selectedTicker} hideHeading={!isScrollV1} />
              </div>
            </AccordionSection>
          </div>
        )
      )}

      {/* === Sprint 3: DetailReport → AccordionSection wrap + useIntersectionLazy 連動 ===
          collapsed 時に lazy chunk fetch を抑制。
          header が viewport に入った時のみ fetch trigger (useIntersectionLazy)。
          React.lazy + Suspense 機構は不触 (DetailReport.jsx 内部不変)。
          Sprint 3 (Phase 2): Tier L glow — hover 時の hairline border tint のみ。 */}
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
              tier={3}
              defaultOpen={false}
              controlledOpen={expandedSections.has('detail-report') || undefined}
            >
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
            </AccordionSection>
          </div>
        )
      )}
    </div>
    </MotionProvider>
  );
}
