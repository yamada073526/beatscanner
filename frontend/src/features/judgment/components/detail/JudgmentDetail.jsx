import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
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
import FiveConditionsCard from './FiveConditionsCard.jsx';
import SkeletonDetail from './SkeletonDetail.jsx';
import PremiumLock from '../shared/PremiumLock.jsx';
import StockPriceChart from '../../../../components/StockPriceChart.jsx';
// SPEC 2026-05-28 Sprint 4 + 6 (pillar 2 technical): Chart 直下に hero card 2 つを並列配置
// v187 (3体合議 ui/金融/qa 全員一致): テクニカル章の横並び売買目安カードを統合する価格 ladder (縦の数直線)。
import PriceLadder from '../../../../components/PriceLadder.jsx';
// §③ 章頭の verdict bar (2秒 anchor)。3体合議 + user gate 2026-06-30。cup_handle.state を source に
//   (PriceLadder と同 source = §③ 内の局面表示が矛盾しない)。静的辞書のみ・zero-fetch。
import BuyZoneVerdictBar from './sections/BuyZoneVerdictBar.jsx';
// v127 R16-3 (R12-1 Phase 1 R2): IBD Distribution Day カウンター (機関の売り圧力目安)
// v126 R8-3 Phase 2: MarketSurge 互換 Cup-Handle pivot narration (state=formation 時のみ表示)
// v126 R8-3 Phase 3: 直近 breakout = support level narration (last_breakout 取得時のみ表示)
import BreakoutZoneCard from '../../../../components/BreakoutZoneCard.jsx';
// v100 user dogfood (handover §100点 multi-review): Pane 3 Insider 取引 section の中身実装
import InsiderPanel from '../../../../components/InsiderPanel.jsx';
// v100 (handover §SPEC FMP Premium 打ち手 5): 過去 8Q 決算 ±5 日 価格反応 (event study)
import EarningsReactionPanel from '../../../../components/EarningsReactionPanel.jsx';
// handover v82 Phase 5: TriageBanner (保有 × 5 条件 × Cup-Handle 三層)。
// ConditionGrid 直前 hint 1 行 (UI/UX 6 体合議 B 案)。
// Sprint 6 (SPEC 2026-05-19): SummaryBrief (AI 要約) を Pane 3 Hero 直下に port。
// Hallucination Guard 4 重防御 (ErrorBoundary / BLOCKLIST_REGEX / conditional render / 数値非該当)。
// brand-aspiration §-1「コンシェルジュの一言挨拶」比喩。 frontend-architect 判定: risk 最大 → 末尾 sprint で隔離。
// Sprint 2: AccordionSection primitive + useIntersectionLazy hook
// Sprint 3 (return-grid-primitive): ReturnGrid を primitives/index.js から追加
// institutional-ttm-panel Sprint 3: TtmValuationPanel を primitives/index.js から追加
import { AccordionSection, ReturnGrid } from '../../primitives/index.js';
// Sprint 4 (Phase 2): 案1 section in-view fade-in — 主要セクション wrapper
import SectionFade from '../../primitives/SectionFade.jsx';
// Sprint 0 (Phase 2): MotionProvider — LazyMotion + domAnimation (framer-motion subset)。
// Pane 3 全体を wrap することで Sprint 4 以降の m.* motion component を有効化する。
// framer-motion chunk は vite.config.js manualChunks で react-vendor から分離済 (20KB 以下目標)。
import MotionProvider from '../../../../components/MotionProvider.jsx';
import { DetailInstanceTickerContext } from '../../primitives/DetailInstanceTickerContext.js';
// Phase G Phase 1 (handover v98 §0-B): UnifiedJudgmentSection — 章 1「判定」 4 components 統合 wrapper。
// feature flag `pane3_v2=1` で URL parameter / localStorage 切替 (default off)。
// v104 release MVP: EPS Beat Streak chip — 章 1 verdict anchor、 過去 N 期 Beat の retention 訴求。
//   QuarterlyHistoryTable が accordion collapsed default で見えない問題を chip 前出しで解消。
// v108 議題 5A (multi-review 5/5 verdict「release 前 mandatory」):
// Forward P/E / PEG / 配当性向 / Buyback比率 を KpiStrip に追加するための fetcher。
// 金商法 §38 / 景表法 §5 配慮で narration / 警告 chip なし、 数値のみ。
import { fetchValuationExtras, fetchTechnical, TECHNICAL_CANONICAL_PATTERNS } from '../../../../api.js';
import { classifyBuyZone } from '../../../../lib/buyZoneLabels.js';
// Phase G Phase 3 (handover v99 §0-D): ChapterSection — 章 2-5 用 generic 章扉 (Noto Serif JP / gold hairline)。
// headerOnly mode で content 再配置せず brand 一貫性 ([[feedback-gold-accent-continuity]]) を実現。
// v118 ETF MVP: ETF 入力時は 5 条件適用外 → EtfOverviewPanel を render (Trust Cliff 防止)。
import EtfOverviewPanel from '../../../../components/EtfOverviewPanel.jsx';
// C-3 競合ナビ (SPEC 2026-06-09): パンくずバー — 発光系 class 不使用の 28px 独立バー。
import DetailBreadcrumb from '../../../workspace/DetailBreadcrumb.jsx';
// C-3 Sprint 1b: スクロール位置 + accordion 開閉復元 hook (sessionStorage ベース)。
import { useDetailScrollRestore } from './useDetailScrollRestore.js';

// v125 P8-2 Sprint A: section 3 component 抽出 (描画順序不変)。
// Sprint B で順序入替時にこれら component を新位置に移動するだけで diff 「移動」 のみ。
import FundamentalsAccordion from './sections/FundamentalsAccordion.jsx';
import L3QualityFold from './sections/L3QualityFold.jsx';
// 2026-06-28: v6 テクニカル章 冒頭の同定リボン (会社の身元 1 行・追加 LLM コストなし)
// v199: ファンダ章冒頭の決算ハイライト (flag opt-in、SPEC_2026-06-10_earnings-flash-summary + 6体合議)
import EarningsThreePoint from './sections/EarningsThreePoint.jsx';
// 完全性台帳 (coverage manifest) Sprint3: 規律の元データ取得状況を最上部1行ロールアップ + ドリルダウン監査。
import CompletenessRollupBadge from './sections/CompletenessRollupBadge.jsx';
// v6 IA 再構成 (SPEC_2026-06-27): Sprint 1 新規 components
import L1SummaryBuckets from './sections/L1SummaryBuckets.jsx';
import Pane3TOC from './sections/Pane3TOC.jsx';
import EarningsGrowthSpark from './sections/EarningsGrowthSpark.jsx';
// 完全性台帳 #4: SPY 取得失敗時にテクニカル章で「地合いデータ未取得」 を中立注記 (chartBlock 内 = 全 path 到達)。
import TechnicalSpyNote from './sections/TechnicalSpyNote.jsx';
import MarketEvalSection from './sections/MarketEvalSection.jsx';
import ContextSection from './sections/ContextSection.jsx';
// Sprint 2 (CAN-SLIM Phase 1 UX): テクニカル章のライター憲法サマリーブロック
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



// SPEC_2026-06-28 (3体合議 条件付賛成): 新高値ブレイク途上 (BreakoutZoneCard) の表示 flag。
// default OFF (dogfood OK 後 user gate で default ON 昇格、§8 昇格基準)。?bo_card=1 / localStorage 'bo_card'='1'。
function isBoCardEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('bo_card');
    if (urlParam === '1') return true;
    if (urlParam === '0') return false;
    return window.localStorage?.getItem('bo_card') === '1';
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
// §C-11 A (v195): ACCORDION_L2_TITLE_STYLE は primitives/AccordionSection.jsx に SSOT 化
// (ContextSection の 最新ニュース/IR/10-K と共用するため移動)。

export default function JudgmentDetail({
  plan = 'free',
  detailFor,
  onAnalyze,
  detailContext = {},
  useWorkspaceReader = false,
  // C-3 keep-mounted (v195、 user dogfood「戻る時に毎回ロード」): DetailStack が銘柄別に
  // JudgmentDetail を mount し続け、 visibility で表示切替するため、 各 instance の ticker を
  // context 経由でなく明示 prop で固定する。 undefined = 従来どおり context (selectedTicker) を使用、
  // null を含む明示値 = その ticker で固定 (null は空 state)。 これにより A→競合B→A 戻りで A の
  // instance は unmount されず、 全 panel が再 fetch せず DOM ごと瞬時復元される。
  tickerOverride = undefined,
}) {
  const { selectedTicker: ctxSelectedTicker } = useJudgment();
  const selectedTicker = tickerOverride === undefined ? ctxSelectedTicker : tickerOverride;

  // C-3 Sprint 1b: .ds-judgment-detail への DOM ref (scroll container 特定に使用)。
  // Rules of Hooks: early return より前に宣言 (v107 hotfix と同カテゴリ)。
  const detailDivRef = useRef(null);

  // C-3 Sprint 1b: スクロール位置復元 hook (side-effect のみ、戻り値なし)。
  // 祖先 ticker に戻ったとき cache hit 描画後に scroll 位置を復元する。
  // accordion 開閉復元は本 Phase では DEFER (autopilot v194 判断、handover DEFER-SPEC 参照)。
  useDetailScrollRestore(selectedTicker, detailDivRef);

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
  // AnalystPanel の halo を 1 回発火させる。
  const analystHaloTriggerRef = useRef(null);   // AnalystPanel から register される

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

  // 2026-06-14 user feedback: KpiStrip の「条件合致 N/5」 を撤去し RS (レラティブストレングス) に置換。
  //   technical endpoint は dedupGet coalesce 済 (StateCompass / prefetch / 各 zone card と同一 URL) のため
  //   追加 fetch は発生しない。patterns.rs = { rs_vs_spy_pct, self_percentile, ranking_label, period_months }。
  const [technicalRs, setTechnicalRs] = useState(null);
  // §③ verdict bar 用の cup_handle.state。同一 fetchTechnical (dedupGet coalesce) から抽出 = 追加 fetch 0。
  //   PriceLadder の cup = technical?.patterns?.cup_handle と同 source のため §③ 内で局面表示が矛盾しない。
  const [cupState, setCupState] = useState(null);
  useEffect(() => {
    setTechnicalRs(null); // ticker 切替時に他銘柄の RS 残骸を出さない
    setCupState(null);
    if (!selectedTicker) return undefined;
    let cancelled = false;
    fetchTechnical(selectedTicker, TECHNICAL_CANONICAL_PATTERNS)
      .then((t) => {
        if (cancelled) return;
        setTechnicalRs(t?.patterns?.rs || null);
        // raw cup_handle.state (formation/breakout_confirmed...) を classifyBuyZone で
        // 正規化 enum (cup_pivot/breakout_support...) に変換してから VERDICT_TONE に渡す。
        // raw のまま渡すと VERDICT_TONE のキーと噛み合わず verdict bar が出ない (v305 配線バグ修正)。
        const zone = classifyBuyZone(t?.patterns?.cup_handle?.state);
        setCupState(zone && zone !== 'unknown' ? zone : null);
      })
      .catch(() => { if (!cancelled) { setTechnicalRs(null); setCupState(null); } });
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
  const conditions = result?.conditions || [];

  // ticker は選択されたが結果まだ無 → skeleton 表示 (loading 中の体感改善)
  if (selectedTicker && !result && detail?.isLoading) {
    return <SkeletonDetail />;
  }
  // v118 ETF MVP: ETF 判定 (5 条件結果なし + etfInfo あり) → EtfOverviewPanel のみ表示。
  //   useJudgmentResult が ETF error catch 時に fetchEtfInfo して cache に保存、
  //   detailFor が cache.etfInfo を返す。 Trust Cliff 防止 (空白 / generic error 回避)。
  if (selectedTicker && !result && detail?.etfInfo) {
    // R9.5: 組入上位銘柄クリック → その銘柄の分析へ (競合チップと同じ onAnalyze 経路)
    return <EtfOverviewPanel etfInfo={detail.etfInfo} onNavigateTicker={onAnalyze} />;
  }

  // (kpis 候補配列は v294 第2弾で撤去: KpiStrip 未 mount で完全 dead だった。
  //  価格/前日比/RS/Forward P/E/配当性向/自社株買いの数値源 detail/technicalRs/valuationExtras
  //  自体は Hero / L3QualityFold 等で別途使用するため定義は保持。)

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
    // C-3 keep-mounted (v198): 自 instance の固定 ticker を配下の AccordionSection に伝え、
    // global activeTicker への依存を断つ (別 ticker 遷移で hidden 側 accordion が閉じ→戻りで clip するバグの真因)。
    <DetailInstanceTickerContext.Provider value={selectedTicker}>
    <MotionProvider>
    <div
      ref={detailDivRef}
      className="ds-judgment-detail"
      style={{
        // v86 R5 A: gap を --space-4 (16px) → --space-6 (24px) に拡大、 Aman 級 breathing room
        // Verdict→Fundamentals 境界は --space-8 (32px) で更に上回り、 hierarchy 保持
        // Vision spacing_ratio 73 → 78+ 狙い
        display: 'grid',
        gap: 'var(--space-6, 24px)',
      }}
    >
      {/* C-3 競合ナビ: パンくずバー (SPEC 2026-06-09)
          - ds-judgment-detail の first child として配置 (SPEC §5 確定設計)
          - detailHistory が 2 件以上のときのみ表示 (DetailBreadcrumb 内部で判定)
          - Hero の上に独立配置 (Hero 内部は変更しない)
          - 発光系 class 不使用、28px 独立バー */}
      <DetailBreadcrumb />

      {/* 完全性台帳 (CompletenessRollupBadge) は mockup v5 (2026-06-29 正本) で §③ テクニカル章カードの
          末尾へ移設した (旧 SPEC_2026-06-13 は最上部配置)。理由: quiet 化 (2026-06-29 user feedback
          「わざわざ見に行くことはほぼない」) + 「データ取得状況」 は決算/地合い・価格の元データ文脈に帰属させる方が
          自然 = §③ 末尾 footer が IA 上適切 (mockup legend「§③ 末尾に追加」)。
          実 mount は §③ CHAPTER_FRAME 末尾 (v6-technical-section 内) を参照。
          gate (!detail?.error) は移設先でも維持 = 分析取得失敗時に「取得」 と矛盾させない。 */}


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

      {/* === 銘柄詳細 本体 = v6 IA 単一経路 (SPEC_2026-06-27 / Sprint 4b で旧 v4/v5/compass 分岐を物理削除) ===
          L0 同定 / L1 判定サマリー / 目次 / L2 決算 / L3 品質 / L4 テクニカル / L5 図解 / L6 その他。
          v6 は VerdictHero を内包し全 component を自前 inline する (旧 shared block 定義・案B 順序入替は撤去済)。 */}
      {(() => {
          // isNonEquity 判定: ETF / 指数 / 先物 / 為替は決算3点・RS を非表示
          // feedback_non_equity_chart_overlays.md 準拠
          const isNonEquityV6 = (() => {
            if (!selectedTicker) return false;
            // ETF (EtfOverviewPanel の gate と同一ロジック)
            const etfPattern = /^(SPY|QQQ|IWM|DIA|GLD|SLV|USO|TLT|IEF|HYG|LQD|VTI|VOO|VEA|VWO|EEM|XL[A-Z]|SMH|SOXX|ARKK|ARKG|ARKW|ARKF|ARKQ|ARKG)$/i;
            if (etfPattern.test(selectedTicker)) return true;
            // 指数 / 先物 / 為替 (^GSPC 形式等)
            if (/^\^/.test(selectedTicker)) return true;
            return false;
          })();

          // detailDivRef は既に定義済み（L432）
          const v6DetailRoot = detailDivRef.current;

          // ── v6 章レイアウト ──
          // Sprint 1: L0 + L1 + TOC + L2（決算3点 detail + 8Q spark + 5条件）+ L3-L6（既存要素を仮配置）
          // task4 (Phase2): 全 chapter (§①〜⑤) を共通カード枠で統一 (mockup v5 .panel)。border + 上端 2px
          //   gold + radius-lg のみ・box-shadow なし = 発光 host にしない (glow_elevation_postmortem v58→v59:
          //   layout wrapper を glow host 化しない / 入れ子 glow の二重枠回避)。背景は透明 (面の足し算回避・
          //   user 判断、 境目が不明瞭なら後で薄い面を検討)。overflow は既定 visible 維持 (内側 FiveConditionsCard /
          //   analyst halo の box-shadow を clip しない)。見出し (gold 番号) は枠外 = mockup .chapter-h。
          const CHAPTER_FRAME = {
            display: 'grid',
            gap: 'var(--space-4, 16px)',
            border: '1px solid var(--border)',
            borderTop: '2px solid color-mix(in srgb, var(--color-gold) 30%, var(--border))',
            borderRadius: 'var(--radius-lg, 16px)',
            padding: 'var(--space-5, 20px)',
          };
          // task4 dogfood fix: 章番号を mockup .chapter-h .no の gold 円バッジに統一
          //   (24px 円・gold 12% bg・gold 30% border・gold 数字)。旧 = 素の gold 文字。
          const CHAPTER_NO_STYLE = {
            width: 24, height: 24, flexShrink: 0,
            borderRadius: '50%', display: 'grid', placeItems: 'center',
            fontSize: 12, fontWeight: 700, color: 'var(--color-gold)',
            background: 'color-mix(in srgb, var(--color-gold) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-gold) 30%, transparent)',
          };
          return (
            <div
              data-testid="pane3-v6-layout"
              data-state={selectedTicker ? 'main' : 'empty'}
              // 視覚 fidelity (2026-06-28): 正本 mockup body は全 top-level 間 24px (space-6) の一定 rhythm。
              //   旧実装は container gap 無しで section が密着 (「余白が詰まっている」dogfood)。hairline は
              //   この gap の中で両側 24px の breathing room を持つ (mockup .hair と同じ挙動)。
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6, 24px)' }}
            >
              {/* ─── L0 同定（既存 VerdictHero + Hero 継承・価格は「同定」= verdict 扱いを外す） ───
                  SPEC §2 L0「価格は同定 = verdict 扱いを外す」: 判定リング(EarningsRing)は非表示
                  (dogfood: data 未取得時「?/取得待ち」が壊れて見える + 同定層に判定 idiom が混入)。
                  同様に「判定」eyebrow も hideEyebrow={true} で除去 (mockup id-row は eyebrow 無し)。
                  次決算カウントダウンは D-XX pill (hideCountdownChip=false) のみで担保。 */}
              {/* 2026-06-28 dogfood: hero(ticker) の hover/arrival glow を鎮静 (is-glow-calm)。 */}
              <VerdictHero verdict="unknown" className="is-glow-calm">
                <Hero
                  ticker={selectedTicker}
                  companyName={result?.companyName}
                  verdict="unknown"
                  period={result?.latestPeriod ? `FY${result.latestPeriod}` : null}
                  nextEarningsDays={detail?.nextEarningsDays}
                  nextEarningsDate={detail?.nextEarningsDate}
                  price={detail?.price}
                  changePct={detail?.changePct}
                  sector={technicalRs?.sector}
                  watchlist={detailContext?.watchlist}
                  onAddToWatchlist={detailContext?.onAddToWatchlist}
                  hideCountdownChip={false}
                  hideVerdictChip={true}
                  hideEarningsRing={true}
                  hideEyebrow={true}
                  lastUpdatedAt={detail?.lastAnalyzedAt}
                  frameless
                />
              </VerdictHero>

              {/* ─── L1 判定サマリー（★心臓部：決算3点 named buckets）─── */}
              {!detail?.error && !isNonEquityV6 && (
                <L1SummaryBuckets
                  ticker={selectedTicker}
                  guidance={guidance}
                  isLoading={!guidance && (detail?.isLoading ?? false)}
                  result={result}
                  technicalRs={technicalRs}
                  detailRoot={v6DetailRoot}
                  isNonEquity={isNonEquityV6}
                />
              )}

              {/* ─── 章ジャンプ目次（sticky 上部バー・自前で border-bottom 保持）─── */}
              <Pane3TOC
                isNonEquity={isNonEquityV6}
                detailRoot={v6DetailRoot}
              />

              {/* ─── L2 決算（ファンダの本丸）─── */}
              {!isNonEquityV6 && (
                <section
                  data-testid="v6-earnings-section"
                  id="v6-earnings-section"
                  style={{ display: 'grid', gap: 'var(--space-3, 12px)' }}
                >
                  {/* 章ヘッダー */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={CHAPTER_NO_STYLE}>①</span>
                    <span style={{ fontSize: 17, fontWeight: 700 }}>決算</span>
                    {result?.latestPeriod && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        FY{result.latestPeriod}
                      </span>
                    )}
                  </div>

                  {/* task4: 章の内容を共通カード枠で囲う（mockup .panel・見出しは枠外） */}
                  <div style={CHAPTER_FRAME}>
                  {/* 決算3点 detail（mockup 忠実 lean 版 = EarningsThreePoint・guidance prop 流用で fetch 重複ゼロ）。
                      2026-06-28 user gate「素の3列に簡素化」: 旧 EarningsFlashSummary の部門別/粗利率/ヘッダー帯/
                      count-up を落とし mockup .earn-grid + .future-strip に。数値は L1 buckets と同 source で整合。*/}
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                    決算3点 — 対コンセンサス
                  </div>
                  <EarningsThreePoint
                    guidance={guidance}
                    isLoading={!guidance && (detail?.isLoading ?? false)}
                  />

                  {/* hairline */}
                  <hr style={{ height: 1, background: 'var(--border)', border: 0, margin: 0 }} />

                  {/* 成長トレンド 8Q（EPS/売上 YoY bar spark）*/}
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                    成長トレンド（直近 8Q）
                  </div>
                  <EarningsGrowthSpark ticker={selectedTicker} />

                  {/* hairline */}
                  <hr style={{ height: 1, background: 'var(--border)', border: 0, margin: 0 }} />

                  {/* 5条件カード（★唯一の発光・v5 発光カードを CSS 不触で継承）*/}
                  <FiveConditionsCard
                    conditions={conditions}
                    passedCount={result?.passedCount}
                    totalCount={result?.totalCount}
                    isPro={detailContext.isPro}
                    onUpgrade={detailContext.onUpgrade}
                    v5Header={true}
                    onConditionPulse={(idx) => {
                      setPulsingConditionIndex(idx === 4 ? 'all_steps' : idx);
                    }}
                  />
                  </div>
                </section>
              )}

              {/* task4: 章間 hr 撤去（カード枠が区切りを担う・mockup 準拠） */}
              {/* ─── L3 品質・継続性（Sprint 2-C: fold 累進開示・mockup 順: CFマージン→ROE/PER/PEG→会社概要）─── */}
              <section
                data-testid="v6-quality-section"
                id="v6-quality-section"
                style={{ display: 'grid', gap: 'var(--space-3, 12px)', marginTop: 'var(--space-4, 16px)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={CHAPTER_NO_STYLE}>②</span>
                  <span style={{ fontSize: 17, fontWeight: 700 }}>品質・継続性</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>儲ける力 × 伸び続ける力</span>
                </div>
                {/* task4: 章の内容を共通カード枠で囲う */}
                <div style={CHAPTER_FRAME}>
                {/* 営業CFマージン + ROE/PER/PEG + 機関保有 QoQ fold（valuation-extras 由来・非 equity は非表示）。*/}
                {!isNonEquityV6 && valuationExtras && (
                  <L3QualityFold valuationExtras={valuationExtras} ticker={selectedTicker} />
                )}
                {/* 会社概要・セグメント（既存 FundamentalsAccordion profile = 既に fold）。
                    v6 のみ折りたたみヘッダーにセグメント%サマリーを常時表示（非 LLM・quarterly-history 再利用）。*/}
                <FundamentalsAccordion
                  key="v6-funda-profile"
                  renderSection="profile"
                  segmentSummaryInHeader
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
              </section>

              {/* task4: 章間 hr 撤去（カード枠が区切りを担う・mockup 準拠） */}
              {/* ─── L4 テクニカル・買い場（チャート + PriceLadder 1ユニット + 期間別リターン降格）─── */}
              <section
                data-testid="v6-technical-section"
                id="v6-technical-section"
                style={{ display: 'grid', gap: 'var(--space-3, 12px)', marginTop: 'var(--space-4, 16px)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={CHAPTER_NO_STYLE}>③</span>
                  <span style={{ fontSize: 17, fontWeight: 700 }}>テクニカル・買い場</span>
                </div>
                {/* task4: 章の内容を共通カード枠で囲う */}
                <div style={CHAPTER_FRAME}>
                {/* verdict bar (2秒 anchor): 章頭・チャート前。mockup v6 .vbar 準拠。
                    cup_handle.state→tone 静的辞書 (buyZoneVerdict.js)。price/changePct=detail 由来。
                    §38: confirm に色を付けない (色は過熱 amber の警告のみ)・Row2 に動的数値なし。 */}
                {selectedTicker && (
                  <BuyZoneVerdictBar state={cupState} price={detail?.price} changePct={detail?.changePct} />
                )}
                {/* 同定リボン: mockup 非対応 + L0 同定層と情報重複のため撤去
                    (2026-06-28 mockup 忠実化・user gate)。 */}
                {/* チャート + PriceLadder = v5 の 1 ユニット構造を継承（mockup L4: 価格ラダー → 期間別リターン 順）*/}
                {selectedTicker && (
                  <SectionFade key="v6-chart" staggerIndex={0}>
                    <StockPriceChart ticker={selectedTicker} isPremiumUser={plan === 'premium'} onUpgrade={detailContext.onUpgrade} hideTitle />
                    <TechnicalSpyNote ticker={selectedTicker} />
                    {/* SPEC_2026-06-28: v6 独立 section 用 BreakoutZoneCard mount (chartBlock を使わない経路、
                        triple mount の3本目)。flag default OFF・内部 null return ガードは共通。 */}
                    {isBoCardEnabled() && (
                      <BreakoutZoneCard ticker={selectedTicker} plan={plan} onUpgrade={detailContext.onUpgrade} />
                    )}
                  </SectionFade>
                )}
                {/* Phase2 task3 (G2 gate): premium-only mount を廃し、 無料にも構造 (spine + 無料4レベル値) を
                    見せ、 Premium 固有レベル (pivot/support) の値だけ PriceLadder 内部でロック + ティーザー。 */}
                {selectedTicker && (
                  <PriceLadder ticker={selectedTicker} plan={plan} onUpgrade={detailContext.onUpgrade} />
                )}
                {/* 期間別リターン（Sprint2: mockup v6 .fold = 折りたたみ化で §③ de-noise・user gate 2026-06-30）。
                    AccordionSection で wrap し既定 collapsed。折りたたみ時 children unmount のため
                    period-returns fetch も fold 展開まで自然に defer（backend 無変更で遅延読込・別fetch不要）。
                    summary は中立ラベル（過去リターン数値を teaser に出さない＝§38/景表法 §5 safe）＋基準開示。
                    ReturnGrid は sectionLabel={null}（fold title と二重見出し回避）・splitByTerm で短期/長期 2 段。*/}
                {selectedTicker && (
                  <AccordionSection
                    key="v6-return-grid-fold"
                    id="sec-v6-return-grid"
                    title="期間別リターン"
                    tier={3}
                    defaultOpen={false}
                    summary="価格ベース・分配金含まず"
                  >
                    <ReturnGrid
                      ticker={selectedTicker}
                      frameless
                      splitByTerm
                      sectionLabel={null}
                      testId="v6-return-grid"
                    />
                  </AccordionSection>
                )}
                {/* buyq: mockup L4「ブレイクアウト強度（参考）」行。静的・§38-safe（参考/目安、行動指示なし）。*/}
                {selectedTicker && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 'var(--space-3, 12px)', fontSize: 12.5, color: 'var(--text-secondary)', paddingTop: 2,
                  }}>
                    <span>ブレイクアウト強度（参考）</span>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      O'Neil 基準: ブレイク時 出来高 +40% 以上が目安
                    </span>
                  </div>
                )}
                {/* 完全性台帳 quiet (mockup v5 §③ 末尾の <details class="comp"> に相当)。
                    最上部から移設。gate (!detail?.error) は旧位置と同条件で維持 = 「取得」 と
                    「分析取得失敗」 を同一画面で矛盾させない。badge 内部で empty/loading/errored/main を自己解決。 */}
                {selectedTicker && !detail?.error && (
                  <CompletenessRollupBadge ticker={selectedTicker} valuationExtras={valuationExtras} />
                )}
                </div>
              </section>

              {/* task4: 章間 hr 撤去（カード枠が区切りを担う・mockup 準拠） */}
              {/* ─── L5 図解（Pro/Premium）─── */}
              <section
                data-testid="v6-figure-section"
                id="v6-figure-section"
                style={{ display: 'grid', gap: 'var(--space-3, 12px)', marginTop: 'var(--space-4, 16px)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={CHAPTER_NO_STYLE}>④</span>
                  <span style={{ fontSize: 17, fontWeight: 700 }}>図解で理解する</span>
                  {/* mockup v5 §④ の meta Pro バッジ (章見出しで Pro gate を予告)。
                      ai_diagram = PLAN.PRO。semantic token のみで装飾 (発光・色直書きなし)。 */}
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    color: 'var(--color-gold)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    border: '1px solid color-mix(in srgb, var(--color-gold) 35%, transparent)',
                    background: 'color-mix(in srgb, var(--color-gold) 10%, transparent)',
                  }}>Pro</span>
                </div>
                {/* task4: 章の内容を共通カード枠で囲う */}
                <div style={CHAPTER_FRAME}>
                {/* DiagramCard は unmount 禁止（feedback_diagram_card_remount_cache.md）
                    Pro/Premium = render、free = PremiumLock（mount 維持・display:none は親で制御）*/}
                {(plan === 'pro' || plan === 'premium') ? (
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
                )}
                </div>
              </section>

              {/* task4: 章間 hr 撤去（カード枠が区切りを担う・mockup 準拠） */}
              {/* ─── L6 その他（目次から到達）─── */}
              <section
                data-testid="v6-more-section"
                id="v6-more-section"
                style={{ display: 'grid', gap: 'var(--space-3, 12px)', marginTop: 'var(--space-4, 16px)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={CHAPTER_NO_STYLE}>⑤</span>
                  <span style={{ fontSize: 17, fontWeight: 700 }}>その他</span>
                </div>
                {/* task4: 章の内容を共通カード枠で囲う */}
                <div style={CHAPTER_FRAME}>
                {/* L6 fold 群 (mockup pane3-detail-v1.html の「その他」#more に忠実な 5 fold フラット) */}
                {/* fold #1-2: アナリスト視点 / 市場の声 */}
                <MarketEvalSection
                  key="v6-market-eval"
                  selectedTicker={selectedTicker}
                  plan={plan}
                  detail={detail}
                  detailContext={detailContext}
                  expandedSections={expandedSections}
                  analystHaloTriggerRef={analystHaloTriggerRef}
                  haloFiredSetRef={haloFiredSetRef}
                />
                {/* fold #3: 過去 8Q 決算反応 (earnings_8q Premium gate 維持) */}
                {selectedTicker && (
                  <AccordionSection
                    key="v6-earnings-reaction"
                    id="sec-v6-earnings-reaction"
                    title="過去 8Q 決算反応"
                    tier={2}
                    defaultOpen={false}
                    summary="発表翌日の株価変化"
                  >
                    <PremiumLock
                      feature="earnings_8q"
                      plan={plan}
                      label="過去 8Q の決算 → 5 営業日累積リターンを一覧で"
                      onUpgrade={detailContext.onUpgrade}
                    >
                      <EarningsReactionPanel ticker={selectedTicker} l3Headings />
                    </PremiumLock>
                  </AccordionSection>
                )}
                {/* fold #4: Insider 取引 (Form 4 + 13F、 mockup 通り free 開放・内部で source 制限を handle) */}
                {selectedTicker && (
                  <AccordionSection
                    key="v6-insider"
                    id="sec-v6-insider"
                    title="Insider 取引"
                    tier={2}
                    defaultOpen={false}
                    summary="直近 90 日の売買"
                    controlledOpen={expandedSections.has('insider') || undefined}
                  >
                    <InsiderPanel ticker={selectedTicker} l3Headings />
                  </AccordionSection>
                )}
                {/* fold #5: ニュース · IR · 10-K (一次ソースへのリンク集約) */}
                <ContextSection
                  key="v6-context"
                  selectedTicker={selectedTicker}
                  useWorkspaceReader={useWorkspaceReader}
                  expandedSections={expandedSections}
                />
                </div>
              </section>
            </div>
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
    </DetailInstanceTickerContext.Provider>
  );
}
