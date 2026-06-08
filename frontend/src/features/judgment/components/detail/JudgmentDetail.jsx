import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { FileBarChart2, FileText } from 'lucide-react';
// P3.7: Pane 3 → 関連記事 link 用 hook
import { useRelatedArticle } from '../../../articles/useRelatedArticle.js';
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
// SPEC 2026-05-28 Sprint 4 + 6 (pillar 2 technical): Chart 直下に hero card 2 つを並列配置
import AnalystTargetCard from '../../../../components/AnalystTargetCard.jsx';
// v187 (3体合議 ui/金融/qa 全員一致): テクニカル章の横並び売買目安カードを統合する価格 ladder (縦の数直線)。
import PriceLadder from '../../../../components/PriceLadder.jsx';
import SellZoneCard from '../../../../components/SellZoneCard.jsx';
// v127 R16-3 (R12-1 Phase 1 R2): IBD Distribution Day カウンター (機関の売り圧力目安)
import DistributionDaysCard from '../../../../components/DistributionDaysCard.jsx';
// v126 R8-3 Phase 2: MarketSurge 互換 Cup-Handle pivot narration (state=formation 時のみ表示)
import CupPivotCard from '../../../../components/CupPivotCard.jsx';
// v126 R8-3 Phase 3: 直近 breakout = support level narration (last_breakout 取得時のみ表示)
import BuyZoneCard from '../../../../components/BuyZoneCard.jsx';
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

// v125 P8-2 Sprint A: section 3 component 抽出 (描画順序不変)。
// Sprint B で順序入替時にこれら component を新位置に移動するだけで diff 「移動」 のみ。
import FundamentalsAccordion from './sections/FundamentalsAccordion.jsx';
import MarketEvalSection from './sections/MarketEvalSection.jsx';
import ContextSection from './sections/ContextSection.jsx';
// Sprint 2 (CAN-SLIM Phase 1 UX): テクニカル章のライター憲法サマリーブロック
import TechnicalChapterSummary from './sections/TechnicalChapterSummary.jsx';
// v125 P8-3 Sprint B: 図解 sticky accordion (default OFF、 案 B 新順序の section 2)。
// DiagramCard 物理 mount 維持は本 sprint では deferred (DetailReport.jsx vizData lift up が必要)、
// wrapper のみ実装で AI 詳細レポートへの anchor link を提供 ([[feedback-diagram-card-remount-cache]] は次 phase)。
import StickyDiagramAccordion from './sections/StickyDiagramAccordion.jsx';

// v144 Task B: 解説記事 link の相対日付 (「いつのニュースか」 をクリック前に提示)。
// 「最終更新 X 分前」 と同系の鮮度表示 (CLAUDE.md「動的データには最終更新を併記」)。
function formatRelativeDate(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return '';
  const day = 86400000;
  if (diffMs < day) return '今日';
  const days = Math.floor(diffMs / day);
  if (days < 7) return `${days}日前`;
  if (days < 30) return `${Math.floor(days / 7)}週間前`;
  if (days < 365) return `${Math.floor(days / 30)}ヶ月前`;
  return `${Math.floor(days / 365)}年前`;
}

// v97 G-2 sub-agent verdict 案 B 軽量版: 章境界 軽量強化
// user dogfood「H2 Chapter Break は subtle すぎる、 言われないと気付かない」
// sub-agent 推奨: 章タイトル のみ (番号なし) + cyan accent uppercase 11px + hairline 1px
// 工数 S、 Aman 級「ホテルメニューの章立て」 idiom 維持、 教科書感を回避。
// v125 P8-2 Sprint A: sections/ 配下の 3 component から再利用するため named export 化。
export function ChapterHeader({ label, isChapterStart = false }) {
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
// v125 P8-3 Sprint B: Pane 3 案 B 新順序 (StickyDiagramAccordion + Chart + Target+Zone + 5 条件 accordion 外維持 + ファンダ accordion + その他)。
// v126 R10-1 (2026-05-29 user 確認後): default ON 昇格 (user 承認済「OK なら ON 化」 + R9-1 scroll fix verified)。
// URL ?pane3_v4=0 で kill switch (revert 容易性のため残置)、 ?pane3_v4=1 / localStorage は明示的にも動作。
function isPane3V4() {
  if (typeof window === 'undefined') return true;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('pane3_v4');
    if (urlParam === '0') return false;
    return true;
  } catch {
    return true;
  }
}

// v184 grill-me (2026-06-07): Pane3 入れ子章再編 (ファンダ/テクニカル親章化 + 新 5 ブロック構成)。
// 6 体合議 (全員条件付賛成) verdict で「新 flag default OFF → user 朝 dogfood → default ON 昇格」 確定
// (isV4 が v125→v126 で辿った経路。無監視 autopilot で全 PC ユーザーの主画面を即時変更するのを回避し、
//  isV4 全体を切り戻す ?pane3_v4=0 より細い切り戻し粒度を確保する)。
// isV4 が true のときのみ上位 opt-in として評価。?pane3_v5=1 / =0 or localStorage 'pane3_v5'='1'。
function isPane3V5() {
  if (typeof window === 'undefined') return false;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('pane3_v5');
    if (urlParam === '1') return true;
    if (urlParam === '0') return false;
    return window.localStorage?.getItem('pane3_v5') === '1';
  } catch {
    return false;
  }
}

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
// v125 P8-2 Sprint A: DetailReportAccordionContent は sections/ContextSection.jsx 内に移動。

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
      // B3 (handover v141、 user 判定 2026-05-31): 空 placeholder は bs-panel だが
      // useArrivalSpotlight が全 .bs-panel を監視 → 短くスクロールしない pane center が常時 band 内に入り
      // is-arriving (cyan glow 中段) が固定点灯していた (= no-baseline-cyan が禁じる「常時強発光」症状)。
      // data-spotlight-skip="1" で spotlight 監視対象外にして baseline neutral (gray border / no glow) に戻す。
      // glow CSS (高リスク zone) は無改変、 hook の既存 opt-out 機構のみ利用。
      <div
        className="bs-panel"
        data-spotlight-skip="1"
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
  const guidanceSecLoading = detail?.guidanceSecLoading ?? false;
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
    // v120 hotfix (user dogfood Bug 6): detail.changePct は 1日% (= 前日比) であり YTD ではない。
    // 旧表示「+12.34% YTD」 = 1 日比を YTD label で表示する致命的 mislabel (Trust Cliff)。
    // label を「前日比」 に修正 + suffix「% YTD」 を「%」 に変更。 真の YTD は ReturnGrid 側で表示。
    const pct = (detail.changePct * 100).toFixed(2);
    kpis.push({
      value: `${detail.changePct > 0 ? '+' : ''}${pct}%`,
      label: '前日比',
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
  // v138.6 R3 (2026-05-30): 旧 code は result.epsBeatPct を読んでいたが、 backend には
  // この field が存在せず常に undefined → EPS BEAT 全銘柄「—」 regression。
  // R2 backend fix で guidance.eps.surprise_pct (= +6.3% beat 等) は取得済のため、
  // guidance 経由に source 切替。 guidance.eps.actual/estimated 両方ある時のみ表示。
  const _eps_surprise = guidance?.eps?.surprise_pct;
  const _eps_actual = guidance?.eps?.actual;
  const _eps_est = guidance?.eps?.estimated;
  const _eps_beat_available = (
    _eps_surprise != null && Number.isFinite(_eps_surprise) &&
    _eps_actual != null && _eps_est != null
  );
  kpis.push({
    value: _eps_beat_available
      ? `${_eps_surprise > 0 ? '+' : ''}${_eps_surprise.toFixed(1)}%`
      : '—',
    label: 'EPS Beat',
    verdict: !_eps_beat_available
      ? 'unknown'
      : (_eps_surprise > 0 ? 'beat' : 'miss'),
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
  // v125 P8-3 Sprint B: Pane 3 案 B 新順序 flag (default OFF、 URL ?pane3_v4=1 で先行 dogfood)。
  const isV4 = isPane3V4();
  // v184 grill-me: 入れ子章再編。isV4 上位の opt-in、default OFF (?pane3_v5=1 で試用)。
  const isV5 = isV4 && isPane3V5();
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
      {/* v184 grill-me: v5 (入れ子章再編) では階層1を独立 render せず、下の block IIFE で
          ①ティッカー章にまとめて再配置する。!isV5 (既存 v4/v2/legacy) は従来どおり常時 render。 */}
      {!isV5 && (() => {
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
          /* v160 D2 Sprint 2: ウォッチ追加ボタン用に detailContext から watchlist + addToWatchlist を pass。 */
          watchlist={detailContext?.watchlist}
          onAddToWatchlist={detailContext?.onAddToWatchlist}
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
            guidanceSecLoading={guidanceSecLoading}
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
          auto runAnalyze が fire 中 (loading) は非表示。
          v138.6 R7-D (2026-05-30): user dogfood「分析データを取得中... が永遠に表示」 → 真因は
          loading=false + result=null の「取得失敗 / rate limit」 状態を「取得中」 と現在進行表現で
          誤誘導していた。 detail.error (rate limit 等) を読んで honest 表現に切替:
            - error あり → 「分析データの取得に失敗しました」 + error 内容を small hint
            - error なし (cold start / cache miss) → 「分析データを取得中...」 維持 (legitimate progress)。
          retry button は両 case で残置 (1 クリック復旧)。 */}
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
          <span style={{
            color: detail?.error ? 'var(--color-loss)' : 'var(--text-muted)',
            fontSize: 13,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}>
            <span>
              {detail?.error ? '分析データの取得に失敗しました' : '分析データを取得中...'}
            </span>
            {detail?.error && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                {String(detail.error).slice(0, 120)}
              </span>
            )}
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
              flexShrink: 0,
            }}
          >
            再試行
          </button>
        </div>
      )}

      {/* === v125 P8-3 Sprint B: 章 ① 数値 + 章 II 市場評価 + 章 ② テクニカル + 章 ③ リファレンス を順序入替 ===
          isV4 (= URL ?pane3_v4=1 or localStorage 'pane3_v4'='1') ON 時に案 B 新順序を適用、
          OFF 時は既存順序 (Sprint A 完了状態) を維持。 各 block を inline-in-component fragment に切り出し、
          render 順序で表現することで diff が「移動」 のみに局所化される (SPEC §11-B-5 アトミック XL refactor NG 教訓)。
          階層 1 (判定 + 5 条件) は両 mode で同位置に維持 (5 条件 accordion 外維持 = 案 B 確定)。 */}
      {(() => {
        // 章 ① 数値 (FundamentalsAccordion 抽出、 Sprint A 着地点)
        const fundamentalsBlock = (
          <FundamentalsAccordion
            key="fundamentals"
            hideChapterHeader={isV5}
            selectedTicker={selectedTicker}
            result={result}
            guidance={guidance}
            plan={plan}
            detail={detail}
            detailContext={detailContext}
            isV2={isV2}
            isV3={isV3}
            isScrollV1={isScrollV1}
            expandedSections={expandedSections}
            ch2Tab={ch2Tab}
            setCh2Tab={setCh2Tab}
            onAnalyze={onAnalyze}
          />
        );

        // 章 II 市場評価 (MarketEvalSection 抽出、 Sprint A 着地点)
        const marketEvalBlock = (
          <MarketEvalSection
            key="market-eval"
            selectedTicker={selectedTicker}
            plan={plan}
            detail={detail}
            detailContext={detailContext}
            isV2={isV2}
            isV3={isV3}
            isScrollV1={isScrollV1}
            expandedSections={expandedSections}
            ch3Tab={ch3Tab}
            setCh3Tab={setCh3Tab}
            analystHaloTriggerRef={analystHaloTriggerRef}
            qhistoryHaloTriggerRef={qhistoryHaloTriggerRef}
            haloFiredSetRef={haloFiredSetRef}
          />
        );

        // 章 ② テクニカル の header (legacy 順では Chart の前に配置、 isV4 では削除)
        // Sprint 2: technicalHeader + TechnicalChapterSummary + testid wrapper を 1 block に統合。
        // technical-section wrapper は feedback_testid_all_render_paths に準拠、
        // loading/errored/empty/main 全 state でも testid 取得可能。
        const technicalHeader = (
          <div
            key="technical-section-wrapper"
            data-testid="technical-section"
            data-state={selectedTicker ? 'main' : 'empty'}
          >
            {isV2 ? (
              <ChapterSection chapterNumber="②" chapterTitle="テクニカル" headerOnly tier="sub" />
            ) : (
              <ChapterHeader label="テクニカル" isChapterStart />
            )}
            {/* Sprint 2: ライター憲法サマリーブロック (章扉直後) */}
            <TechnicalChapterSummary
              selectedTicker={selectedTicker}
              isLoading={!selectedTicker}
              hasError={false}
            />
          </div>
        );

        const chartBlock = selectedTicker ? (
          <SectionFade key="chart" id="sec-chart" staggerIndex={3}>
            <StockPriceChart ticker={selectedTicker} isPremiumUser={plan === 'premium'} onUpgrade={detailContext.onUpgrade} hideTitle={isV5} />
          </SectionFade>
        ) : null;

        const targetZoneBlock = selectedTicker ? (
          <SectionFade key="target-zone" id="sec-target-and-zone" staggerIndex={3}>
            <div className="atc-szc-grid">
              <AnalystTargetCard ticker={selectedTicker} />
              {/* v138.6 R7-B 🔴 P0 Trust Cliff (2026-05-30): SellZoneCard は Premium 限定 (50DMA
                  extension narration、 「機関の売却圧力」 sign)。 user dogfood で非ログイン demo
                  で leak 露出 → CLAUDE.md「Trust Cliff (信頼の崖) は最重要バグカテゴリ」 違反。
                  plan === 'premium' でのみ render、 free/未ログインは非表示。 */}
              {plan === 'premium' && <SellZoneCard ticker={selectedTicker} />}
            </div>
            {/* v138.6 R7-B 🔴 P0 Trust Cliff: 以下 3 card は全て Premium 限定 (Cup-Handle pivot
                narration / 損切り目安 / Distribution Days)。 非 premium 露出は Trust Cliff 重大違反、
                conditional render で完全 gate。 marketing 配慮の ProTeaser placeholder は
                R7 後続 sprint で個別追加 (今は P0 leak 止めを優先)。 */}
            {plan === 'premium' && <CupPivotCard ticker={selectedTicker} />}
            {plan === 'premium' && <BuyZoneCard ticker={selectedTicker} />}
            {plan === 'premium' && <DistributionDaysCard ticker={selectedTicker} />}
          </SectionFade>
        ) : null;

        // v138.6 R7-H 🟠 P1 (2026-05-30): 過去 8Q 決算反応 (EarningsReactionPanel) を Pro 限定化。
        // user dogfood「ガイダンス進捗 直近8Q は Pro 限定なのに、 過去 8Q 決算反応 は未ログインで見える、
        // Trust Cliff 整合性なし」。 PremiumLock で wrap、 free user は blur + minimal CTA D 案表示。
        const earningsReactionBlock = selectedTicker ? (
          isScrollV1 ? (
            <PremiumLock
              key="earnings-reaction"
              feature="earnings_8q"
              plan={plan}
              label="過去 8Q の決算 → 5 営業日累積リターンを一覧で"
              onUpgrade={detailContext.onUpgrade}
            >
              <div id="sec-earnings-reaction">
                <EarningsReactionPanel ticker={selectedTicker} />
              </div>
            </PremiumLock>
          ) : (
            <AccordionSection
              key="earnings-reaction"
              id="sec-earnings-reaction"
              title="過去 8Q 決算反応"
              label="PRO"
              tier={2}
              defaultOpen={false}
              controlledOpen={expandedSections.has('earnings-reaction') || undefined}
            >
              <PremiumLock
                feature="earnings_8q"
                plan={plan}
                label="過去 8Q の決算 → 5 営業日累積リターンを一覧で"
                onUpgrade={detailContext.onUpgrade}
              >
                <div id="sec-earnings-reaction-inner">
                  <EarningsReactionPanel ticker={selectedTicker} />
                </div>
              </PremiumLock>
            </AccordionSection>
          )
        ) : null;

        const insiderBlock = selectedTicker ? (
          isScrollV1 ? (
            <PremiumLock
              key="insider"
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
                <InsiderPanel ticker={selectedTicker} />
              </SimpleSection>
            </PremiumLock>
          ) : (
            <AccordionSection
              key="insider"
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
                <div id="sec-insider-inner">
                  <InsiderPanel ticker={selectedTicker} />
                </div>
              </PremiumLock>
            </AccordionSection>
          )
        ) : null;

        const contextBlock = (
          <ContextSection
            key="context"
            selectedTicker={selectedTicker}
            result={result}
            guidance={guidance}
            plan={plan}
            detailContext={detailContext}
            isV2={isV2}
            isScrollV1={isScrollV1}
            useWorkspaceReader={useWorkspaceReader}
            expandedSections={expandedSections}
            // v138.6 R7-K (2026-05-30): v4 mode で 図解 (StickyDiagramAccordion) を Pane 3 上部に
            // mount したため、 末尾 AI 詳細レポート (DetailReport) は重複。 isV4 を渡し ContextSection
            // で AI 詳細レポート の render を skip (legacy mode のみ表示維持で BC 担保)。
            isV4={isV4}
          />
        );

        if (isV4) {
          if (isV5) {
            // === v184 grill-me: 入れ子章再編 (新 5 ブロック構成、6 体合議 verdict 反映) ===
            // ①ティッカー ②図解 ③ファンダ章 ④テクニカル章 ⑤その他。
            // 階層1要素 (hero/summary/kpi/triage/5条件/ttm/eps) は !isV5 階層1 とは別記述で
            // ①③に再配置 (既存 v4/v2/legacy を不変に保つための複製。DRY 化は default ON 昇格後)。
            // ⚠️ Sprint 1 は骨格のみ: 章サマリー静的拡張 (Sprint 3) と 3軸3段階判定 (Sprint 4, §38 gate)
            // は別 sprint。章内の厳密順序 (会社概要↔5条件) は Sprint 3 で FundamentalsAccordion と調整。
            const tickerHeaderBlock = (
              <>
                <VerdictHero verdict={verdict}>
                  <Hero
                    ticker={selectedTicker}
                    companyName={result?.companyName}
                    verdict={verdict}
                    period={result?.latestPeriod ? `FY${result.latestPeriod}` : null}
                    nextEarningsDays={detail?.nextEarningsDays}
                    nextEarningsDate={detail?.nextEarningsDate}
                    watchlist={detailContext?.watchlist}
                    onAddToWatchlist={detailContext?.onAddToWatchlist}
                  />
                  {/* v184 Sprint 1: SummaryBrief は本 sprint では残置 (廃止は Sprint 3 で各章サマリーへ一本化)。 */}
                  {result && (
                    <SummaryBrief
                      analysis={result}
                      guidance={guidance}
                      guidanceSecLoading={guidanceSecLoading}
                    />
                  )}
                </VerdictHero>
                <KpiStrip stats={kpis} />
                {/* grill 決定 2: トリアージは保有時のみ最上位 (非保有は TriageBanner 内部で非表示)。 */}
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
                    />
                  </SectionFade>
                )}
              </>
            );

            // ② 図解 (free = ぼかしプレビュー化は Sprint 2 で funnel-cro 委譲、本 sprint は既存 Pro/free 分岐を流用)
            const diagramNode = (plan === 'pro' || plan === 'premium') ? (
              <StickyDiagramAccordion
                ticker={selectedTicker}
                analysis={result}
                guidance={guidance}
              />
            ) : (
              <PremiumLock
                feature="ai_diagram"
                plan={plan}
                label="図解で 5 条件・ビジネスを 2 秒で理解"
                onUpgrade={detailContext.onUpgrade}
              >
                <div
                  aria-hidden="true"
                  style={{
                    height: 64,
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(56, 189, 248, 0.04)',
                    border: '1px solid rgba(56, 189, 248, 0.10)',
                  }}
                />
              </PremiumLock>
            );

            const fiveConditionsNode = (
              <FiveConditionsCard
                conditions={conditions}
                passedCount={result?.passedCount}
                totalCount={result?.totalCount}
                isPro={detailContext.isPro}
                onUpgrade={detailContext.onUpgrade}
                onConditionPulse={(idx) => {
                  setPulsingConditionIndex(idx === 4 ? 'all_steps' : idx);
                }}
              />
            );
            // v5 polish (user dogfood 2026-06-08): 名称は専門用語「TTM」を外し「バリュエーション」へ (sub に「直近4四半期合算」が残る)。
            // v189 (3体合議 ui/frontend/qa): ファンダ章「枠なし hairline」 pilot のため inline 枠 (border+radius+bg) を撤去し、
            //   frameless のまま下の fundamentalsChapterBlock の hairline セクションに載せる。frameless でも出典 footer は保持。
            const ttmNode = (result && selectedTicker && valuationExtras) ? (
              <TtmValuationPanel
                ticker={selectedTicker}
                valuationExtras={valuationExtras}
                sectionLabel="バリュエーション"
              />
            ) : null;
            // EPS Beat Streak は決算タブ「今期」と内容重複のため v5 ファンダ章から除外 (user dogfood 2026-06-08)。
            // v185 E (2026-06-08): v5 テクニカル章では短期/長期を hairline 区切りで 2 段表示 (splitByTerm)。
            const returnGridNode = (result && selectedTicker) ? (
              <ReturnGrid ticker={selectedTicker} frameless={true} testId="judgment-return-grid" splitByTerm />
            ) : null;

            // ③ ファンダ章 (章扉① + 5条件 + 決算 + バリュエーション + 会社概要)
            // v185 A (2026-06-08、 user 確定): 章内順序を「5条件 → 決算 → TTM → 会社概要」 に再配置。
            // v189 (2026-06-08、 3体合議 ui/frontend/qa 全員賛成): 「枠なし hairline + 余白」 pilot。
            //   不満 = 継ぎ接ぎ・バラバラ感 (枠 4-5 種混在) + 密度高い・圧迫 → 解は枠を減らして連続面化。
            //   面の引き算: コンテナは背景なし、 5条件カード (fiveConditionsNode) のみ発光カードのまま「主役」 として浮かせ、
            //   従属3セクション (決算/バリュエーション/会社概要) を border-top 1px var(--border) の hairline + space-8 余白で区切る。
            //   発光系 class (.panel-card/.surface-card) は新規追加ゼロ、 wrapper は inline token のみ (glow バグ領域回避)。
            //   各 FundamentalsAccordion は共有 component を prop で制御 (v4/legacy は renderSection 省略で完全不変)。
            const hairlineSectionStyle = {
              marginTop: 'var(--space-8)',
              borderTop: '1px solid var(--border)',
              paddingTop: 'var(--space-8)',
            };
            // v190 (3体合議 ui/frontend/qa、user dogfood 受け): セクション L2 見出しの統一外観。
            //   L1 章扉(gold/扉) > L2 セクション冠(これ) > L3 サブ > L4 値。装飾は付けず、
            //   色(primary)・weight(700)・uppercase で L3(muted/500/小文字) と階層を出す (枠なし面で最も効く)。
            //   TtmValuationPanel の SectionLabel(13/700/0.08em/uppercase/primary) と同 token = 3セクション冠が揃う。
            const sectionHeadingL2Style = {
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-primary)',
              marginBottom: 'var(--space-2)',
            };
            const fundamentalsChapterBlock = (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {/* v192 (3体合議 B-2): v5 章扉 (L1) を emphasized で強調し L2 セクション冠と区別 (gold hairline 60% + primary/700)。 */}
                <ChapterSection chapterNumber="①" chapterTitle="ファンダメンタル" headerOnly tier="sub" emphasized />
                {fiveConditionsNode}
                <div style={hairlineSectionStyle}>
                  {/* v190: 「決算」 L2 セクション冠 (今期/来期コンセンサスを傘下に束ねる、user dogfood ②)。
                      外観は下のバリュエーション/会社概要と統一。 */}
                  <div style={sectionHeadingL2Style}>決算</div>
                  <FundamentalsAccordion
                    key="funda-earnings"
                    renderSection="earnings"
                    hideChapterHeader
                    selectedTicker={selectedTicker}
                    result={result}
                    guidance={guidance}
                    plan={plan}
                    detail={detail}
                    detailContext={detailContext}
                    isV2={isV2}
                    isV3={isV3}
                    isScrollV1={isScrollV1}
                    expandedSections={expandedSections}
                    ch2Tab={ch2Tab}
                    setCh2Tab={setCh2Tab}
                    onAnalyze={onAnalyze}
                  />
                </div>
                {ttmNode && <div style={hairlineSectionStyle}>{ttmNode}</div>}
                <div style={hairlineSectionStyle}>
                  <FundamentalsAccordion
                    key="funda-profile"
                    renderSection="profile"
                    sectionHeadingStyle={sectionHeadingL2Style}
                    selectedTicker={selectedTicker}
                    result={result}
                    guidance={guidance}
                    plan={plan}
                    detail={detail}
                    detailContext={detailContext}
                    isV2={isV2}
                    isV3={isV3}
                    isScrollV1={isScrollV1}
                    expandedSections={expandedSections}
                    ch2Tab={ch2Tab}
                    setCh2Tab={setCh2Tab}
                    onAnalyze={onAnalyze}
                  />
                </div>
              </div>
            );
            // ④ テクニカル章の売買目安 — v187 (2026-06-08、3体合議 ui/金融/qa 全員一致):
            //   横並び売買目安カード5枚 (アナリスト目標/CupPivot/BuyZone/SellZone/Distribution) の「並列が見辛い」 を根治。
            //   PriceLadder (価格6レベルを現在価格中心の縦の数直線) に統合。チャート水平ラインと同一 API・同一値で 1:1 mirror、
            //   二重表示 (チャートのライン群とカードの数値) を ladder に一本化。
            //   premium = PriceLadder。free = AnalystTargetCard のみ (pivot/支持/損切りは premium 情報のため ladder は gate)。
            //   Distribution Days は地合い指標 (市場全体) で価格 ladder と性質が違うため当面 ladder 下に残す
            //     (Phase 2 で章ヘッダーの地合いバッジに格下げ + §38 状態サマリー1行を予定)。
            //   §38: ladder は価格+現在価格からの距離%のみ (行動指示・将来予測・矢印なし)、色は中立 gray + 現在価格行 hero (緑/赤なし)。
            //   ⚠️ CupPivot/BuyZone/SellZone は v5 で render されなくなるが、v4 (targetZoneBlock) で使用継続のため import 維持。
            const technicalTargetGrid = selectedTicker ? (
              <SectionFade id="sec-target-and-zone-v5" staggerIndex={3}>
                {plan === 'premium' ? (
                  <PriceLadder ticker={selectedTicker} />
                ) : (
                  <AnalystTargetCard ticker={selectedTicker} compact variant="unified" />
                )}
              </SectionFade>
            ) : null;
            const technicalChapterBlock = (
              <>
                <ChapterSection chapterNumber="②" chapterTitle="テクニカル" headerOnly tier="sub" />
                {chartBlock}
                {returnGridNode}
                {technicalTargetGrid}
              </>
            );
            // ⑤ その他 (市場評価 + 8Q決算反応 + Insider + リファレンス)
            const miscChapterBlock = (
              <>
                {marketEvalBlock}
                {earningsReactionBlock}
                {insiderBlock}
                {contextBlock}
              </>
            );

            // 並び順は宣言的 config 配列で定義 (frontend-architect verdict: key は安定文字列、index 禁止)。
            const BLOCK_ORDER_V5 = [
              { id: 'ticker', testid: 'pane3-ch-ticker', node: tickerHeaderBlock },
              { id: 'diagram', testid: 'pane3-ch-diagram', node: diagramNode },
              { id: 'fundamentals', testid: 'pane3-ch-fundamentals', node: fundamentalsChapterBlock },
              { id: 'technical', testid: 'pane3-ch-technical', node: technicalChapterBlock },
              { id: 'misc', testid: 'pane3-ch-misc', node: miscChapterBlock },
            ];
            return (
              <>
                {BLOCK_ORDER_V5.filter((b) => b.node != null).map(({ id, testid, node }) => (
                  <div key={id} data-testid={testid} data-state={selectedTicker ? 'main' : 'empty'}>
                    {node}
                  </div>
                ))}
              </>
            );
          }
          // === 案 B 新順序 (v125 P8-3 Sprint B、 user gate 3 確定) ===
          // 階層 1 (判定 + 5 条件) は既に上で render 済 → 続く順序:
          // 1. StickyDiagramAccordion (default OFF、 sticky top:0) — v138.6 R7-G Pro 限定
          // 2. Chart (技術 header なしで直接 chart、 案 B シンプル化)
          // 3. 目標 + 売り card 並列
          // 4. ファンダ accordion (FundamentalsAccordion 旧 章 ①)
          // 5. 市場評価 (MarketEvalSection 旧 章 II)
          // 6. その他 (EarningsReaction + Insider)
          // 7. リファレンス (ContextSection 旧 章 ③)
          return (
            <>
              {/* v138.6 R7-L (2026-05-30): 図解 = Pro 機能。
                  R7-G で完全 hide だったが、 user dogfood「以前の AI 詳細レポート は未ログインでも消さず
                  Premium 解放の課金画面を表示していた、 今の図解 button でも同じほうが良いか?」 + 3 体合議
                  D 案 (header に PRO badge 1 個 + 小 CTA) で「存在を匂わせるが押し付けない」 質感確定。
                  Pro/Premium は render、 free は PremiumLock (minimal D 案、 blur preview なしで小 CTA のみ)。
                  StickyDiagramAccordion は banner click で展開 = それ自体が affordance、 banner だけ
                  blur で見せて click 時に CTA modal が起動する pattern。 */}
              {(plan === 'pro' || plan === 'premium') ? (
                <StickyDiagramAccordion
                  key="sticky-diagram"
                  ticker={selectedTicker}
                  analysis={result}
                  guidance={guidance}
                />
              ) : (
                // v138.7 (2026-05-30、 3 体合議): 図解 placeholder の feature を専用 key `ai_diagram`
                // (Pro) に。 旧 earnings_8q 流用は UpgradeModal が「過去 8Q 決算反応」 と誤表示する
                // bug の元 (user dogfood 12 巡目)。 図解 = Pro 確定 (3 体合議全員一致)、 色は cyan 維持。
                // Premium tier (Cup-Handle 等) は Phase 2 で LP Premium 列追加と同時に公開予定。
                <PremiumLock
                  key="sticky-diagram-locked"
                  feature="ai_diagram"
                  plan={plan}
                  label="図解で 5 条件・ビジネスを 2 秒で理解"
                  onUpgrade={detailContext.onUpgrade}
                >
                  {/* placeholder: 高さ確保のための ghost banner、 中身は blur で「何かある」 だけ伝える */}
                  <div
                    aria-hidden="true"
                    style={{
                      height: 64,
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(56, 189, 248, 0.04)',
                      border: '1px solid rgba(56, 189, 248, 0.10)',
                    }}
                  />
                </PremiumLock>
              )}
              {chartBlock}
              {targetZoneBlock}
              {fundamentalsBlock}
              {marketEvalBlock}
              {earningsReactionBlock}
              {insiderBlock}
              {contextBlock}
            </>
          );
        }

        // === legacy 既存順序 (Sprint A 完了状態) ===
        return (
          <>
            {fundamentalsBlock}
            {marketEvalBlock}
            {technicalHeader}
            {chartBlock}
            {targetZoneBlock}
            {earningsReactionBlock}
            {insiderBlock}
            {contextBlock}
          </>
        );
      })()}

      {/* P3.7 / v144 Task B: Pane 3 → 関連記事 link (conditional render — 記事がある時だけ表示)。
          user dogfood (2026-05-31): ① 新タブで開く ② クリック前に「いつ・何の記事か」 がわかるよう
          記事タイトル + 相対日付 (鮮度) を提示。 デイリーニュース由来で鮮度が落ちるため、 日付可視化で
          user 自身が clicking 前に判断できるようにする (撤去は 1 行 revert で可能)。
          外部リンク慣習 (IRLinksPanel / TenK と統一): target=_blank + rel=noopener + ↗ arrow。
          token のみ使用 (raw hex 禁止)、 isScrollV1 (classic SPA) でも表示。 */}
      {relatedArticle && (
        <div
          className="pane3-related-article"
          data-testid="pane3-related-article-link"
        >
          <a
            href={`/articles/${relatedArticle.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="pane3-related-article__card"
            aria-label={`${selectedTicker} の解説記事を新しいタブで開く${relatedArticle.title ? ` — ${relatedArticle.title}` : ''}`}
          >
            <span className="pane3-related-article__icon" aria-hidden="true">
              <FileText size={15} strokeWidth={1.5} />
            </span>
            <span className="pane3-related-article__body">
              <span className="pane3-related-article__title">
                {relatedArticle.title || `${selectedTicker} の解説記事`}
              </span>
              <span className="pane3-related-article__meta">
                {(() => {
                  const rel = formatRelativeDate(relatedArticle.published_at);
                  return rel ? `解説記事 · ${rel}` : '解説記事';
                })()}
              </span>
            </span>
            <span className="pane3-related-article__arrow" aria-hidden="true">↗</span>
          </a>
        </div>
      )}
    </div>
    </MotionProvider>
  );
}
