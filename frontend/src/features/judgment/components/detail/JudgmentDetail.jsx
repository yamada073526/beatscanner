import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { FileBarChart2, FileText } from 'lucide-react';
// P3.7: Pane 3 → 関連記事 link 用 hook + Chip primitive
import { useRelatedArticle } from '../../../articles/useRelatedArticle.js';
import Chip from '../../../../components/ui/Chip.jsx';
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
// v100 user dogfood (handover §100点 multi-review): Pane 3 Insider 取引 section の中身実装
import InsiderPanel from '../../../../components/InsiderPanel.jsx';
// v100 (handover §SPEC FMP Premium 打ち手 5): 過去 8Q 決算 ±5 日 価格反応 (event study)
import EarningsReactionPanel from '../../../../components/EarningsReactionPanel.jsx';
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
// Sprint 3 (return-grid-primitive): ReturnGrid を primitives/index.js から追加
// institutional-ttm-panel Sprint 3: TtmValuationPanel を primitives/index.js から追加
import { AccordionSection, useIntersectionLazy, ReturnGrid, TtmValuationPanel } from '../../primitives/index.js';
// Sprint 4 (Phase 2): 案1 section in-view fade-in — 主要セクション wrapper
import SectionFade from '../../primitives/SectionFade.jsx';
// Sprint 0 (Phase 2): MotionProvider — LazyMotion + domAnimation (framer-motion subset)。
// Pane 3 全体を wrap することで Sprint 4 以降の m.* motion component を有効化する。
// framer-motion chunk は vite.config.js manualChunks で react-vendor から分離済 (20KB 以下目標)。
import MotionProvider from '../../../../components/MotionProvider.jsx';
// Phase G Phase 1 (handover v98 §0-B): UnifiedJudgmentSection — 章 1「判定」 4 components 統合 wrapper。
// feature flag `pane3_v2=1` で URL parameter / localStorage 切替 (default off)。
import UnifiedJudgmentSection from './UnifiedJudgmentSection.jsx';
// v104 release MVP: EPS Beat Streak chip — 章 1 verdict anchor、 過去 N 期 Beat の retention 訴求。
//   QuarterlyHistoryTable が accordion collapsed default で見えない問題を chip 前出しで解消。
import EpsBeatStreakChip from './EpsBeatStreakChip.jsx';
// v108 議題 5A (multi-review 5/5 verdict「release 前 mandatory」):
// Forward P/E / PEG / 配当性向 / Buyback比率 を KpiStrip に追加するための fetcher。
// 金商法 §38 / 景表法 §5 配慮で narration / 警告 chip なし、 数値のみ。
import { fetchValuationExtras } from '../../../../api.js';
// v104 release MVP: 10-K (年次報告書) — リファレンス章 5 で SEC EDGAR 直 fetch。
import TenKLinksPanel from '../../../../components/TenKLinksPanel.jsx';
// v104 Phase G Phase 4: 章 2 (基本財務) を 3 tab (Guidance / 過去業績 / 直近 8Q) に reorg。
//   feature flag pane3_v3='1' で gated、 default 既存維持 (dogfood revert 安全)。
import ChapterTabs from '../../primitives/ChapterTabs.jsx';
// Phase G Phase 3 (handover v99 §0-D): ChapterSection — 章 2-5 用 generic 章扉 (Noto Serif JP / gold hairline)。
// headerOnly mode で content 再配置せず brand 一貫性 ([[feedback-gold-accent-continuity]]) を実現。
import ChapterSection from './ChapterSection.jsx';
// v118 ETF MVP: ETF 入力時は 5 条件適用外 → EtfOverviewPanel を render (Trust Cliff 防止)。
import EtfOverviewPanel from '../../../../components/EtfOverviewPanel.jsx';

// DetailReport は重量級 (36 KB gzip) のため lazy load
const DetailReport = lazy(() => import('../../../../components/DetailReport.jsx'));

// v97 G-2 sub-agent verdict 案 B 軽量版: 章境界 軽量強化
// user dogfood「H2 Chapter Break は subtle すぎる、 言われないと気付かない」
// sub-agent 推奨: 章タイトル のみ (番号なし) + cyan accent uppercase 11px + hairline 1px
// 工数 S、 Aman 級「ホテルメニューの章立て」 idiom 維持、 教科書感を回避。
function ChapterHeader({ label, isChapterStart = false }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3, 12px)',
        marginBottom: 'var(--space-4, 16px)',
      }}
      data-chapter-header="true"
      data-chapter-start={isChapterStart ? 'true' : undefined}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--color-accent)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 1,
          background: 'color-mix(in srgb, var(--color-accent) 30%, var(--border))',
        }}
        aria-hidden="true"
      />
    </div>
  );
}

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

// Phase G Phase 1 (handover v98 §0-B): pane3_v2='1' で章 1「判定」 を unified section に統合。
// v100 (handover v99 §0-A): user dogfood 7 round で 8/8 OK 達成 (verdict 68/100) のため
// default ON に昇格。 `?pane3_v2=0` で明示 revert、 localStorage で永続切替も維持。
function isPane3V2() {
  try {
    if (typeof window === 'undefined') return true;
    // URL parameter (明示 revert / 試用)
    const urlParam = new URLSearchParams(window.location.search).get('pane3_v2');
    if (urlParam === '0') return false;
    if (urlParam === '1') return true;
    // localStorage (永続 revert)
    if (window.localStorage?.getItem('pane3_v2') === '0') return false;
    return true;
  } catch {
    return true;
  }
}

// v104 Phase G Phase 4 (handover v100/103 §release MVP item 2):
// pane3_v3='1' で章 2「基本財務」 を 3 tab 切替に統合 (Guidance / 過去業績 / 直近 8Q)。
// v107 dogfood OK 後 (handover v106 / user 確認 2026-05-24) default ON 昇格、
// ?pane3_v3=0 で明示 revert 可、 localStorage で永続。
// Bloomberg / Refinitiv 流の「同カテゴリ複数 viewport」 idiom、 章 2 + 章 3 両方を 1 flag で制御。
function isPane3V3() {
  try {
    if (typeof window === 'undefined') return true;
    const urlParam = new URLSearchParams(window.location.search).get('pane3_v3');
    if (urlParam === '0') return false;
    if (urlParam === '1') return true;
    // localStorage (永続 revert)
    if (window.localStorage?.getItem('pane3_v3') === '0') return false;
    return true;
  } catch {
    return true;
  }
}

// Phase G Phase 2 (handover v99 §0-B): pane3_v2_frameless='1' で sub-component frameless 化。
// Phase 2 vision-eval verdict は Phase 1 比 regression (AAPL -1.73 / MSFT -1.47) のため
// 単独 flag で opt-in に変更。 ?pane3_v2=1 単独では frameless 無効、 ?pane3_v2=1&pane3_v2_frameless=1
// で初めて Phase 2 frameless が有効。
function isPane3V2Frameless() {
  try {
    if (typeof window === 'undefined') return false;
    const urlParam = new URLSearchParams(window.location.search).get('pane3_v2_frameless');
    if (urlParam === '1') return true;
    if (urlParam === '0') return false;
    return window.localStorage?.getItem('pane3_v2_frameless') === '1';
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
  // P3.7: Pane 3 → 関連記事 link (Supabase から ticker 一致 published 記事を 1 件 fetch)。
  // 記事がない場合は null → Chip 非表示 (conditional render)。
  // Rules of Hooks: early return より前に必ず呼ぶ (v107 hotfix 同 category)。
  const { article: relatedArticle } = useRelatedArticle(selectedTicker);

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

  // Phase 2.8 Sprint 1 #3: accordion 内 section の halo trigger refs
  // AccordionSection の onOpenChange(id, true) 時に haloTriggerRef.current?.() を呼んで
  // AnalystPanel / QuarterlyHistoryTable の halo を 1 回発火させる。
  const analystHaloTriggerRef = useRef(null);   // AnalystPanel から register される
  const qhistoryHaloTriggerRef = useRef(null);  // QuarterlyHistoryTable から register される

  // Phase 2.9 Sprint 2 #Bug2 fix: 再閉じ + 再展開で 2 回目発火する真因
  // 真因: data-halo-fired は DOM dataset で、 accordion close で children unmount →
  // re-open で新規 mount → fresh element の dataset=null → guard 突破で 2 回目発火。
  // 解決: parent (JudgmentDetail) に Set で fired 状態を persistent 保持、 child re-mount でも維持。
  // ticker 切替 時は Set.clear() で reset (別銘柄では halo 再発火が望ましい)。
  const haloFiredSetRef = useRef(new Set());
  useEffect(() => {
    // ticker 切替時に halo fired 状態を reset (別銘柄では halo を再演出)
    haloFiredSetRef.current.clear();
  }, [selectedTicker]);

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
    try {
      onAnalyze(selectedTicker);
    } catch (err) {
      // v106 release-check audit: console.warn は error 系列で保持 (production trace 用)
      console.warn('[analyze] auto runAnalyze failed:', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicker]); // selectedTicker 変更時のみ re-run (onAnalyze / detailFor は安定参照)

  // v108 議題 5A (multi-review 5/5 verdict): Forward P/E / PEG / 配当性向 / Buyback 比率
  //   を KpiStrip に注入するため backend /api/valuation-extras/{ticker} を fetch。
  //   selectedTicker 変化時に再 fetch、 unmount / 切替時は cancelled flag で stale set 防止。
  //   v107 hotfix と同じく early return 前に hooks 配置 (Rules of Hooks 違反防止)。
  const [valuationExtras, setValuationExtras] = useState(null);
  useEffect(() => {
    if (!selectedTicker) {
      setValuationExtras(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchValuationExtras(selectedTicker);
        if (cancelled) return;
        if (data && !data._error) {
          setValuationExtras(data);
        } else {
          setValuationExtras(null);
        }
      } catch {
        if (!cancelled) setValuationExtras(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedTicker]);

  // v107 hotfix (React #310 fix): ch2Tab / ch3Tab useState は ALL early returns の前に置く必要。
  //   v105/v106 で JSX return 直前に置いていたが、 L338 `if (!selectedTicker)` early return より後ろのため
  //   初回 (selectedTicker=undefined) は hooks 2 個 skip、 2 回目 (set) で 2 個追加 → Rules of Hooks 違反。
  //   memory anchor: feedback_chart_overlay_safety.md / handover v75 真っ白事故 同 category。
  const [ch2Tab, setCh2TabRaw] = useState(() => {
    try {
      if (typeof window === 'undefined') return 'guidance';
      const p = new URLSearchParams(window.location.search).get('ch2tab');
      if (p === 'history' || p === 'quarterly' || p === 'guidance') return p;
    } catch { /* localStorage / URL 利用不可環境 */ }
    return 'guidance';
  });
  const setCh2Tab = (key) => {
    setCh2TabRaw(key);
    try {
      if (typeof window === 'undefined') return;
      const u = new URL(window.location.href);
      if (key === 'guidance') {
        u.searchParams.delete('ch2tab');
      } else {
        u.searchParams.set('ch2tab', key);
      }
      window.history.replaceState({}, '', u.toString());
    } catch { /* noop */ }
  };
  const [ch3Tab, setCh3TabRaw] = useState(() => {
    try {
      if (typeof window === 'undefined') return 'analyst';
      const p = new URLSearchParams(window.location.search).get('ch3tab');
      if (p === 'analyst' || p === 'insights') return p;
    } catch { /* noop */ }
    return 'analyst';
  });
  const setCh3Tab = (key) => {
    setCh3TabRaw(key);
    try {
      if (typeof window === 'undefined') return;
      const u = new URL(window.location.href);
      if (key === 'analyst') {
        u.searchParams.delete('ch3tab');
      } else {
        u.searchParams.set('ch3tab', key);
      }
      window.history.replaceState({}, '', u.toString());
    } catch { /* noop */ }
  };

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
  // v118 ETF MVP: ETF 判定 (5 条件結果なし + etfInfo あり) → EtfOverviewPanel のみ表示。
  //   useJudgmentResult が ETF error catch 時に fetchEtfInfo して cache に保存、
  //   detailFor が cache.etfInfo を返す。 Trust Cliff 防止 (空白 / generic error 回避)。
  if (selectedTicker && !result && detail?.etfInfo) {
    return <EtfOverviewPanel etfInfo={detail.etfInfo} />;
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
      // v112 multi-review 4 体合議 議題 B (全員一致 B3): 「現在値」 → 「株価」
      //   2 文字最短で「2 秒理解」 最大化、 日経電子版 / SBI / 楽天証券 標準。
      //   「現在値」 は ETF/債券にも使う generic term で株式専用 context では冗長。
      label: '株価',
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
  // v99 dogfood feedback C (2 巡目): 旧 hint「予想は更新待ち」 が EPS BEAT cell のみ表示で
  // 他 3 cell との height 不揃い + grid stretch → 「下半分空欄」 体感の主因。 hint 削除で
  // 全 cell 均一 height、 「—」 が「データ無し」 を honest に語る (Bloomberg idiom)。
  kpis.push({
    value: result?.epsBeatPct != null
      ? `${result.epsBeatPct > 0 ? '+' : ''}${(result.epsBeatPct * 100).toFixed(1)}%`
      : '—',
    label: 'EPS Beat',
    verdict: result?.epsBeatPct == null ? 'unknown' : result.epsBeatPct > 0 ? 'beat' : 'miss',
    // hint: 削除 (全 cell 均一 height のため)
  });

  // v108 議題 5A (multi-review 5/5 verdict「release 前 mandatory」):
  //   じっちゃまプロトコル「配当増 = 成長余力低下 sign」 を 4 数値で提示。
  //   金商法 §38 (断定的判断提供禁止) / 景表法 §5 (優良誤認) 配慮で **narration / 警告
  //   chip / amber tint 一切なし、 純数値のみ**、 trend / verdict は付与しない (中立 neutral)。
  //   欠損 (sources timeout / FMP plan 不足) は「—」 で honest fallback (Bloomberg idiom)。
  //   KpiStrip 内 grid auto-fit (minmax 140px) で 4 → 8 chip でも自然に折返し。
  const _ve = valuationExtras;
  // Forward P/E
  kpis.push({
    value: _ve?.forwardPE != null && Number.isFinite(_ve.forwardPE)
      ? _ve.forwardPE.toFixed(1)
      : '—',
    label: 'Forward P/E',
    trend: 'neutral',
  });
  // v112 multi-review 4 体合議 議題 A: PEG chip 削除 (7 → 6 chip)。
  //   真因: workspace mode で Pane 3 width 500-700px、 7 chip × minmax(130px) で折返し継続。
  //   PEG は個人投資家認知度低 + valuation は Forward P/E で担保、 金融 verdict 「削除可」 (Forward P/E + PEG 統合は業界 idiom 違反、 PEG 単独削除が正解)。
  //   6 chip × 130 = 780px で Pane 3 600-700px でも 3+3 安定折返し。
  // 配当性向 (Payout Ratio): 利益の何% を配当に回したか
  kpis.push({
    value: _ve?.payoutRatio != null && Number.isFinite(_ve.payoutRatio)
      ? `${(_ve.payoutRatio * 100).toFixed(1)}%`
      : '—',
    label: '配当性向',
    trend: 'neutral',
  });
  // Buyback 比率: 株主還元のうち自社株買いが占める割合 = buyback / (div + buyback)
  // backend response の dividendBuybackRatio は div の割合なので 1 - x で buyback 割合化。
  // dividend + buyback の両方が 0 なら還元なし → 「—」 表示。
  const buybackProportion = (() => {
    if (!_ve) return null;
    const div = Number.isFinite(_ve.dividendYield) ? _ve.dividendYield : null;
    const buy = Number.isFinite(_ve.buybackYield) ? _ve.buybackYield : null;
    if (div == null || buy == null) return null;
    const denom = div + buy;
    if (!(denom > 0)) return null;
    return buy / denom;
  })();
  kpis.push({
    value: buybackProportion != null
      ? `${(buybackProportion * 100).toFixed(0)}%`
      : '—',
    // v111 UI/UX 1 体合議 verdict (議題 1): 「Buyback比率」 (英 8 文字) で改行発生 → 「自社株買い」
    //   (日 5 文字、 視覚幅 30% 短縮) に変更。 Bloomberg JP / 日経の標準語、 「2 秒理解」 5 原則整合。
    label: '自社株買い',
    trend: 'neutral',
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
  // Phase G Phase 3 (handover v99 §0-D): pane3_v2 で章 2-5 全章扉に gold 章扉 (Noto Serif JP)
  // を投入。 isPane3V2() を component スコープに hoist し、 章扉 conditional swap に利用。
  const isV2 = isPane3V2();
  // v104 Phase G Phase 4: 章 2 tab interface 切替 flag
  const isV3 = isPane3V3();
  // ch2Tab / ch3Tab の useState は v107 hotfix で early return より前 (L320 周辺) に移動済。
  // 本位置に置くと Rules of Hooks 違反 (React #310 Rendered more hooks than during the previous render)。

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
          Hero 自身が入場感を持つため、前置 divider は不要。

          Phase G Phase 1 (handover v98 §0-B):
          isPane3V2() の場合、 Hero + SummaryBrief + KpiStrip + TriageBanner +
          FiveConditionsCard 4 ブロックを UnifiedJudgmentSection で「章 1 判定」 として
          1 つの unified section に統合する (default off、 ?pane3_v2=1 で試用可)。 */}
      {(() => {
        const v2 = isV2; // hoisted from component scope (Phase G Phase 3)
        const v2Frameless = v2 && isPane3V2Frameless(); // Phase 2 は v2 mode 内で opt-in
        const innerVerdictBlock = (
          <>
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
          frameless={v2Frameless}
          /* v99 dogfood feedback ① / ③: 章扉「I. 判定」 + EarningsRing「次の決算まで D-XX」
             との二重表示防止 (v2 mode 時) */
          hideEyebrow={v2}
          hideCountdownChip={v2}
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
            frameless={v2Frameless}
          />
        )}
      </VerdictHero>

      {/* Sprint 3: KpiStrip — grid 密着配置は KpiStrip.jsx 内部に依存。
          JudgmentDetail レベルでは gap 短縮で上部スカスカを解消。
          Phase G Phase 2: v2 mode で frameless (sticky / bg / border 抑制) */}
      <KpiStrip stats={kpis} frameless={v2Frameless} />

      {/* Sprint 3 (return-grid-primitive): 各期間 cumulative return % chip grid (1W〜10Y)。
          KpiStrip 直後に mount。 result && selectedTicker guard で ETF / loading 中は非表示。
          frameless=true で外枠なし (KpiStrip と同じ密着配置)。
          CLS envelope は ReturnGrid 内部 minHeight:80px で吸収
          (feedback_cls_envelope_pattern.md 適用)。
          「年率」 表記なし (SPEC §5 Sprint 2/3 禁止事項、ReturnGrid 内で cumulative hint のみ)。
          raw hex / !important / 発光系クラス 一切なし。 */}
      {result && selectedTicker && (
        <ReturnGrid
          ticker={selectedTicker}
          frameless={true}
          testId="judgment-return-grid"
        />
      )}

      {/* institutional-ttm-panel Sprint 3: TTM バリュエーション panel mount。
          ReturnGrid 直後、 EpsBeatStreakChip 直前。
          ETF は valuationExtras=null (fetchValuationExtras で etfInfo あり時は null 返却)
          → condition 非通過のため panel 非表示 (Trust Cliff 防止)。
          valuationExtras=null (fetch 失敗 / loading 中) も非表示 (空 panel 出さない)。
          frameless は v2Frameless と同期 (KpiStrip / ReturnGrid と同 idiom)。
          CLS envelope は TtmValuationPanel 内部 min-height で吸収
          (feedback_cls_envelope_pattern.md 適用)。 */}
      {result && selectedTicker && valuationExtras && (
        <TtmValuationPanel
          ticker={selectedTicker}
          valuationExtras={valuationExtras}
          frameless={v2Frameless}
          sectionLabel="TTM バリュエーション"
        />
      )}

      {/* v104 release MVP: EPS Beat Streak chip — 章 1 verdict anchor、 streak >= 2 のみ表示。
          QuarterlyHistoryTable (章 3 accordion collapsed default) の streak 情報を前出しで anchor 強化。 */}
      {selectedTicker && <EpsBeatStreakChip ticker={selectedTicker} />}

      {/* handover v82 Phase 5: 三層トリアージ banner (UI/UX 6 体合議 B 案、 ConditionGrid 直前 hint 1 行)。
          保有 × 5 条件 × Cup-Handle を 1 行で示し、 「他 N 件」 click で Pane 2 ヒートマップへ jump。
          v84 hotfix 6 段階で確立済 (hasFatal 条件)、accordion 化対象外 (SPEC §6)。
          Sprint 5: currentPrice (含み損益計算用) + onOpenAddTransaction (新規買付 button) を追加。
          Sprint 4: SectionFade で section in-view fade-in (案1) */}
      {selectedTicker && (
        <SectionFade staggerIndex={0}>
        <TriageBanner
          ticker={selectedTicker}
          user={detailContext.user}
          plan={plan}
          onUpgrade={detailContext.onUpgrade}
          onJumpToScanner={detailContext.onJumpToScanner}
          currentPrice={Number.isFinite(detail?.price) ? Number(detail.price) : null}
          onOpenAddTransaction={detailContext.onOpenAddTransaction}
          frameless={v2Frameless}
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
          frameless={v2Frameless}
          onConditionPulse={(idx) => {
            // condition 4 (営業利益増、 0-indexed) は全 step 該当 → toast fallback (DiagramCard 側で処理)。
            // 0-3 は個別 step pulse。 'all_steps' 文字列を sentinel として store に保存。
            setPulsingConditionIndex(idx === 4 ? 'all_steps' : idx);
          }}
        />
      )}
          </>
        );
        return v2 ? (
          <UnifiedJudgmentSection>{innerVerdictBlock}</UnifiedJudgmentSection>
        ) : (
          innerVerdictBlock
        );
      })()}

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
              // v106 release-check audit: debug log 削除 (retry button は user action なので trace 不要)
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

      {/* === 章 2: 基本財務 (H2 Chapter Break + v97 G-2 軽量強化) ===
          v97 G-2 sub-agent verdict: SectionDivider expandedLabel を「数値の根拠」 に変更、
          より「機関投資家向け 投資判断 anchor」 idiom 表現。 */}
      {/* Phase G Phase 3 + v99 dogfood 3 体合議 verdict (2+3 構成):
          - v2 mode: 副柱 (II. 数値) = sans 13px + muted (主柱 III と差別化)
          - default: 既存 SectionDivider「数値の根拠」 維持 (revert 安全) */}
      {/* v99 dogfood feedback A (3 体合議 verdict): 親子誤読防止のため副柱は丸数字 ① ② ③、
          主柱はローマ数字 I II で別系統 marker、 「並列だが格差」 を視覚的に表現 */}
      {isV2 ? (
        <ChapterSection chapterNumber="①" chapterTitle="数値" headerOnly tier="sub" />
      ) : (
        <div data-chapter-start="true">
          <SectionDivider expandedLabel="数値の根拠" />
        </div>
      )}

      {/* === Sprint 3: ProfileCard → AccordionSection wrap (collapsed) ===
          Phase 2.6 5-4: onNavigateTicker で競合 chip click → 銘柄 navigate
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

      {/* v104 Phase G Phase 4 (handover v100/103 §release MVP item 2):
          Guidance + 過去 5 年 EarningsHistory + 直近 8Q を 1 tab interface に統合。
          feature flag pane3_v3='1' で gated、 default 既存 (縦並び) 維持で dogfood revert 安全。
          Bloomberg / Refinitiv 流「同カテゴリ複数 viewport」 idiom、
          章 3 (市場評価) の QuarterlyHistoryTable は isV3 ON 時にここに統合される。 */}
      {isV3 ? (
        (() => {
          // v115 user feedback: 過去 5 年 タブが 3 年分しか表示されない → label を data 件数で動的化
          // FMP free tier 等で 3 年分のみ返ることがあるため、 実 years 件数を honest 表示
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
                // v108 multi-review verdict (議題 1): tab 切替 mount 時に halo 強制発火
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
                    {/* v108 multi-review verdict (議題 1): tab 切替 mount 時に halo 強制発火 */}
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
          {/* GuidanceCard: expanded 固定 (今期/来期 EPS = 投資判断の直接 input)
              Sprint 4: SectionFade で section in-view fade-in (案1)
              v97 CLS fix: `{guidance && (...)}` を撤去し常時 mount (skeleton で min-height 確保)。 */}
          <SectionFade id="sec-guidance" staggerIndex={1}>
            <GuidanceCard
              guidance={guidance}
              isLoading={!guidance && detail?.isLoading !== false}
              isSecLoading={false}
              nextEarningsDays={detail?.nextEarningsDays ?? null}
            />
          </SectionFade>

          {/* === Sprint 3: EarningsHistoryChart (旧 EarningsBars + HistoryChart 統合、expanded 固定) ===
              v100 QA #1 章扉 skeleton CLS fix: 旧 `{periods?.length > 0 && ...}` 撤去し常時 mount。
              EarningsHistoryChart 自身が minHeight 360 envelope を持つため CLS なし。
              [[feedback-cls-envelope-pattern]] と整合。 */}
          <SectionFade id="sec-earnings-history" staggerIndex={2}>
            <EarningsHistoryChart
              periods={result?.periods ?? []}
              currency={result?.currency}
              isLoading={!result?.periods && detail?.isLoading !== false}
            />
          </SectionFade>
        </>
      )}

      {/* === 章 3: 市場評価 (H2 Chapter Break + v97 G-2 軽量強化) ===
          ChapterHeader「市場評価」 で章扉感強化、 data-chapter-start で 48px breathing room。
          AnalystPanel 起点 (旧 data-chapter-start を ChapterHeader に移譲)。 */}
      {/* Phase G Phase 3 + v99 dogfood A: 主柱「II. 市場評価」 (ローマ数字 連番 I→II)、
          副柱とは別系統 marker で親子誤読防止 */}
      {isV2 ? (
        <ChapterSection chapterNumber="II" chapterTitle="市場評価" headerOnly tier="main" />
      ) : (
        <ChapterHeader label="市場評価" isChapterStart />
      )}
      {/* v105 Phase G Phase 5: 章 3 (市場評価) を 2 tab interface に統合 (isV3 ON 時)。
          Tab 1: アナリスト視点 (AnalystPanel)、 Tab 2: 市場の声 (InsightsPanel)。
          QuarterlyHistoryTable は章 2 ChapterTabs に統合済 (Phase G Phase 4)。
          ch3tab URL state で permalink shareable (?ch3tab=insights)、 default 'analyst'。
          halo sweep は tab 切替時の mount 動作と等価のため初期 active=analyst で発火されるが、
          haloTriggerRef は accordion 専用のため tab 内では渡さない (v1 簡素化、 v2 で trigger 化検討)。 */}
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
              // Phase 2.9 Sprint 1 #3: setTimeout 500ms で mount + useEffect 完了を待つ
              // Phase 2.9 Sprint 2 #Bug2 fix: haloFiredSetRef で 2 回目発火を防止 (re-mount でも persist)
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
          PremiumLock は AccordionSection の外 (Premium lock 表示を header で見せるため)。
          v104 Phase G Phase 4: isV3 ON 時は章 2 ChapterTabs の「直近 8Q」 tab に統合されるため、
          ここでは render しない (二重表示防止)。 */}
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
              // Phase 2.9 Sprint 1 #3 + Phase 2.9 Sprint 2 #Bug2: 詳細は AnalystPanel 側 comment 参照
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

      {/* === Sprint 3: InsightsPanel → AccordionSection wrap (collapsed)
          SPEC §5 Sprint 3 #3: header に「市場の声」表示。
          N 件カウントは InsightsPanel 内部データ (外部アクセス不可) のため、
          accordion header は title="市場の声" のみ。
          v105 Phase G Phase 5: isV3 ON 時は章 3 ChapterTabs の「市場の声」 tab に統合済、
          ここでは render しない (二重表示防止)。 === */}
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

      {/* === 章 4: チャート (H2 Chapter Break + v97 G-2 軽量強化) ===
          ChapterHeader「テクニカル」、 StockPriceChart 起点。
          user override 1「株価チャートは常に展開」 維持。 */}
      {/* Phase G Phase 3 + v99 dogfood A: 副柱「② テクニカル」 (丸数字、 別系統 marker) */}
      {isV2 ? (
        <ChapterSection chapterNumber="②" chapterTitle="テクニカル" headerOnly tier="sub" />
      ) : (
        <ChapterHeader label="テクニカル" isChapterStart />
      )}
      {selectedTicker && (
        <SectionFade id="sec-chart" staggerIndex={3}>
          <StockPriceChart ticker={selectedTicker} isPremiumUser={plan === 'premium'} />
        </SectionFade>
      )}

      {/* v100 (handover §SPEC FMP Premium 打ち手 5): 過去 8Q 決算 ±5 日 価格反応 (event study)。
          章 4 テクニカル子に統合、 「判定 PASS → どう動くか」 期待値可視化。 LLM 不要、 純数値計算。 */}
      {selectedTicker && (
        isScrollV1 ? (
          <div id="sec-earnings-reaction">
            <EarningsReactionPanel ticker={selectedTicker} />
          </div>
        ) : (
          <AccordionSection
            id="sec-earnings-reaction"
            title="過去 8Q 決算反応"
            tier={2}
            defaultOpen={false}
            controlledOpen={expandedSections.has('earnings-reaction') || undefined}
          >
            <div id="sec-earnings-reaction-inner">
              <EarningsReactionPanel ticker={selectedTicker} />
            </div>
          </AccordionSection>
        )
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
              {/* v100 user dogfood (handover §100点 multi-review): backend /api/insider/{T} 実装に伴い
                  placeholder → InsiderPanel (FMP Premium /stable/insider-trading + /stable/institutional-ownership) */}
              <InsiderPanel ticker={selectedTicker} />
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
              {/* v100 user dogfood (handover §100点 multi-review): InsiderPanel 実装に置換 */}
              <div id="sec-insider-inner">
                <InsiderPanel ticker={selectedTicker} />
              </div>
            </PremiumLock>
          </AccordionSection>
        )
      )}

      {/* === 章 5: リファレンス (H2 Chapter Break + v97 G-2 軽量強化) ===
          ChapterHeader「リファレンス」、 News / IR / DetailReport で「補足資料」 章扉感。
          Sprint 3 (Phase 2): Tier L glow — hover 時の hairline border tint のみ、発光なし。 */}
      {/* Phase G Phase 3 + v99 dogfood A: 副柱「③ リファレンス」 (丸数字、 別系統 marker) */}
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
              {/* v100 user dogfood (handover §100点 multi-review): リファレンス章 3 子の hover 発光
                  左右クリッピング fix。 子 component (NewsPanel row 等) の border が父境界に張り付き、
                  hover 時 cyan tint が「左右切れた」 体感を発生。 inner div 左右 padding で breathing
                  room を担保し、 panel-card hover halo + border tint が viewport で切れないようにする。 */}
              <div id="sec-news-inner" style={{ padding: '0 var(--space-3, 12px)' }}>
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
              tier={2}
              defaultOpen={false}
              controlledOpen={expandedSections.has('ir-links') || undefined}
            >
              {/* v100 リファレンス章 hover クリッピング fix: 同 §sec-news-inner */}
              <div id="sec-ir-inner" style={{ padding: '0 var(--space-3, 12px)' }}>
                {/* Phase 2.7 Sprint 1 #2': workspace mode は AccordionSection header で見出し表示済 → 内部 h3 hide */}
                <IRLinksPanel ticker={selectedTicker} hideHeading={!isScrollV1} />
              </div>
            </AccordionSection>
          </div>
        )
      )}

      {/* v104 release MVP: 10-K (年次報告書) AccordionSection — IR Links と DetailReport の間に挿入。
          SEC EDGAR 直 fetch (無料、 US 上場のみ)、 free user 開放。 isScrollV1 (classic) では出さない。 */}
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
              tier={2}
              defaultOpen={false}
              controlledOpen={expandedSections.has('detail-report') || undefined}
            >
              {/* v100 リファレンス章 hover クリッピング fix: 同 §sec-news-inner */}
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

      {/* P3.7: Pane 3 → 関連記事 link (conditional render — 記事がある時だけ表示)
          5 原則 §4「1 クリックを減らせ」: 記事存在時に 1 タップで /articles/<slug> に到達。
          5 原則 §1「2 秒でわかる」: 末尾 Chip 1 個、Pane 3 構造を阻害しない最小配置。
          chip primitive ([[chip-primitive-canonical]]) 流用。variant='display' でクリッカブル。
          inline style 禁止 (CLAUDE.md §Chip primitive canonical)、className 経由で spacing。
          isScrollV1 (classic SPA mode) でも表示する (Pane 3 link は workspace/SPA 両方で有効)。 */}
      {relatedArticle && (
        <div
          className="pane3-related-article"
          data-testid="pane3-related-article-link"
        >
          <a
            href={`/articles/${relatedArticle.slug}`}
            className="pane3-related-article__link"
            aria-label={`${selectedTicker} の解説記事を読む — ${relatedArticle.title || ''}`}
          >
            <Chip
              variant="display"
              tone="accent"
              size="sm"
              icon={<FileText size={13} strokeWidth={1.5} />}
            >
              {selectedTicker} の解説記事を読む
            </Chip>
          </a>
        </div>
      )}
    </div>
    </MotionProvider>
  );
}
