/**
 * ScreenerPane — Pane 1「スクリーナー」 tab の専用 view (Phase 4-A Sprint 4-A-2/3)
 *
 * SPEC 2026-05-28 Phase 4-A §11-A patch (6 体合議 verdict):
 *   - Hero「スクリーニング結果 3 セクション × top 5」 (Leader+Breakout+CWH 交差 / RS 急上昇 / 新規 Cup-Handle)
 *   - Explorer (テーブル + chip filter) = 既存 CustomScreenerPanel 流用
 *   - default OFF feature flag (isPillar2Pane1())、 user gate 3 後に default ON 化
 *
 * Sprint 4-A-3 着地 (本 file):
 *   - Hero 3 セクション の実 fetch 実装 (frontend Promise.all 並列 + ticker intersection)
 *   - 「Leader+Breakout+CWH 交差」 = /api/scanner/rs?min_percentile=80 ∩ /api/scanner/cup-handle?filter=cup
 *   - 「RS 急上昇」 = /api/scanner/rs?sort=delta&min_delta=10&limit=5 (Sprint 2.5 backend)
 *   - 「新規 Cup-Handle」 = /api/scanner/cup-handle?filter=cup → frontend で signal_date >= today-1 filter
 *   - section 間 ticker exclusion (S1 → S2 → S3、 「同じ 5 銘柄」 退屈回避、 qa-dogfooder verdict)
 *   - 各 section ticker click で activeTicker setter + home tab 遷移
 *   - migration 未適用時 (delta column 不在) は「データ準備中」 表示
 *   - 「推奨ではありません」 文言を各 section 説明に明記 (金商法 §38 / 景表法 §5 safe)
 *
 * Phase 4-A Sprint 4-A-4 残作業 (本 Sprint で着手しない):
 *   - chip filter active highlight (Hero 上部の [Leader] [RS 急] [CWH] chip)
 *   - sticky filter bar
 *   - demo モード blur + ProTeaser overlay
 *
 * memory anchor: [[feedback-screener-hero-3sections]] / [[feedback-oneill-screener-frontend-intersection]]
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Crown, Hourglass, Target, TrendingUp } from 'lucide-react';
import { useWorkspaceStore } from '../../state/workspaceStore.js';
import { useHaloSweepOnce } from '../../hooks/useHaloSweepOnce.js';
import { useCountUp } from '../../hooks/useCountUp.js';
import Chip, { ChipGroup } from '../../components/ui/Chip.jsx';
import { supabase } from '../../lib/supabase.js';


// Sprint 5 frontend: 新高値ブレイクスクリーナー用 feature flag。
// 2026-06-18 user promote: **default ON** に昇格 (検証済 / headless 目視済)。
//   kill-switch: `?breakout_screener=0` または localStorage `breakout_screener='0'` で OFF (緊急 revert 用、redesign 前の保険)。
//   URL 優先 (即 revert)、localStorage が永続。([[feedback_feature_flag_dual_mode]] URL優先パターン)
//   ⚠️ screener タブは全面 redesign 予定 (user 2026-06-18)。本 section の最終 UX は redesign で再設計される。
function isBreakoutScreenerEnabled() {
  if (typeof window === 'undefined') return true;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('breakout_screener');
    if (urlParam === '1') return true;
    if (urlParam === '0') return false;
    return window.localStorage?.getItem('breakout_screener') !== '0';  // default ON
  } catch {
    return true;
  }
}

// Sprint 5 frontend: 新高値ブレイク(bo_*) 専用ラベル。CUP_STATE_LABEL_JP とは物理分離。
// SPEC §6.4 ✅LOCKED (F⑥, 2026-06-17): 語頭「新高値」で cup「ブレイク確定」と 2 秒即識別。
// §38 回避: 事実記述のみ、「買い場」「上昇」「強い」等の断定・行動指示は禁止。
const BREAKOUT_STATE_LABEL_JP = {
  bo_confirmed: '新高値ブレイク',
  bo_pending:   '高値圏トライ中',
  bo_extended:  '新高値圏(過延伸)',
  bo_soft:      '新高値ブレイク(出来高薄)',
};

// v147 (user dogfood AAPL): cup-handle scanner の state badge を日本語ラベルに。
//   旧版は raw state 文字列 (例「breakout_extended」) をそのまま表示していた (英語混在 + 意味不明)。
//   StockPriceChart の cupChipLabel + extended chip と文言を一致させる。
//   breakout_extended (= AAPL 型「定義通りでない高値圏ブレイク」) も識別可能に。§38 回避で事実記述。
const CUP_STATE_LABEL_JP = {
  breakout_confirmed: 'ブレイク確定',
  breakout_pending: 'ブレイク待機',
  pullback_to_support: '押し目接近',
  formation: '形成中',
  cup_completing: 'カップ完成間近',
  // v148 ⑦ (SPEC extended_screener): screener badge は「高値圏突破」 (2 秒理解・和語的)。
  // v228 (3 体合議・金融§38 + UX): 「高値圏突破」 のみは肯定語に寄り「買い」 と誤読され得るため
  // 「(過延伸)」 を補い chase 禁止規律を事実として直伝 (chart chip 「過延伸・押し目待ち」 と整合)。
  breakout_extended: '高値圏突破(過延伸)',
  formation_market_weak: '形成中・市場待機',
};

// v175 B-Top2 / Sprint 3 共有化: FtdRegimeBanner は FtdRegimeBanner.jsx (SSOT) から import。
// ScreenerPane / CustomScreenerPanel 両方で同一 component を使い、二重定義を防ぐ。
// (module-level hoist 済、[[feedback_pane_error_boundary]] 要件を FtdRegimeBanner.jsx 側で満たす)

// v148 ⑦: extended badge に 50DMA 乖離数値を併記 (§38/§5: price action 記述 + 乖離数値、 action 断定禁止)。
// masked item は top-level sma50_deviation_pct、 premium item は payload.sma50_deviation_pct。
function extendedBadge(item) {
  // masked item は top-level sma50_deviation_pct、 premium item は payload.sma50_deviation_pct
  // (旧 signal 互換で payload.extended_gate.sma50_deviation_pct も fallback、 backend mask と対称)。
  const dev = item?.sma50_deviation_pct
    ?? item?.payload?.sma50_deviation_pct
    ?? item?.payload?.extended_gate?.sma50_deviation_pct;
  if (dev == null || Number.isNaN(Number(dev))) return '高値圏突破(過延伸)';
  const n = Number(dev);
  return `高値圏突破(過延伸) · 50DMA ${n >= 0 ? '+' : ''}${n}%`;
}

// ── fetcher: backend /api/scanner/rs (Leader + delta sort 両用) ──
async function fetchRsLeader({ limit = 20 } = {}) {
  try {
    const r = await fetch(`/api/scanner/rs?min_percentile=80&limit=${limit}`);
    if (!r.ok) return { items: [], error: `HTTP ${r.status}` };
    return await r.json();
  } catch (e) {
    return { items: [], error: String(e) };
  }
}

async function fetchRsDelta({ minDelta = 10, limit = 5 } = {}) {
  try {
    const r = await fetch(`/api/scanner/rs?sort=delta&min_delta=${minDelta}&limit=${limit}&min_percentile=1`);
    if (!r.ok) return { items: [], error: `HTTP ${r.status}` };
    return await r.json();
  } catch (e) {
    return { items: [], error: String(e) };
  }
}

// ── fetcher: backend /api/scanner/cup-handle (cup-only mode) ──
async function fetchCupHandle({ limit = 20 } = {}) {
  try {
    const r = await fetch(`/api/scanner/cup-handle?filter=cup`);
    if (!r.ok) return { items: [], error: `HTTP ${r.status}` };
    const data = await r.json();
    // items は state priority sorted、 必要な数だけ slice
    return { ...data, items: (data.items || []).slice(0, limit) };
  } catch (e) {
    return { items: [], error: String(e) };
  }
}

// ── fetcher: backend /api/scanner/retest (Task#4 A先行: 旧レジスタンス・リテスト接近) ──
// 6体合議 default filter (vs_SPY>0 + dBHi<=10% + rsSelf>=40) は backend default なので param 省略可。
// §38: backend が買い水準を返さない teaser。items は vs_SPY 降順 (backend sort 済)。
async function fetchRetest({ limit = 20 } = {}) {
  try {
    const r = await fetch(`/api/scanner/retest?limit=${limit}`);
    if (!r.ok) return { items: [], error: `HTTP ${r.status}` };
    return await r.json();
  } catch (e) {
    return { items: [], error: String(e) };
  }
}

// ── fetcher: backend /api/scanner/breakout (Sprint 5: 新高値ブレイク) ──
// Authorization header 必須: Premium 判定は backend が Bearer token で行う。
//   非 Premium → items:[], locked:true, count_locked:N (backend 物理除去済)。
//   Premium → items 入り, locked:false。
// §38: items の事実数値のみ surface (universe_percentile / vmult / breakout_pct / is_new_52w_high)。
//   「買い場」「上昇」「強い」等の断定・行動指示は render 側でも禁止。
async function fetchBreakout({ limit = 20 } = {}) {
  try {
    // supabase.auth.getSession() で現セッション token を取得 (client-side, non-blocking)。
    // token がない場合 (未ログイン) は Authorization ヘッダなしで送信 → backend が locked:true を返す。
    const { data: { session } } = await supabase.auth.getSession();
    const headers = session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
    const r = await fetch(`/api/scanner/breakout?limit=${limit}`, { headers });
    if (!r.ok) return { items: [], locked: false, count_locked: 0, error: `HTTP ${r.status}` };
    return await r.json();
  } catch (e) {
    return { items: [], locked: false, count_locked: 0, error: String(e) };
  }
}

// ── fetcher: backend /api/holdings-meta (B-Top1: RS leaders の次回決算日を交差、 追加 backend なし) ──
async function fetchEarningsMeta(symbols) {
  if (!symbols || symbols.length === 0) return { meta: {} };
  try {
    const q = encodeURIComponent(symbols.join(','));
    const r = await fetch(`/api/holdings-meta?symbols=${q}`);
    if (!r.ok) return { meta: {} };
    return await r.json();
  } catch {
    return { meta: {} };
  }
}

// 決算日 badge: 本日/明日/M/D 決算 (§38 中立 = 日付は事実値)
function fmtEarnDay(dateStr, days) {
  if (days === 0) return '本日決算';
  if (days === 1) return '明日決算';
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return `${d.getMonth() + 1}/${d.getDate()} 決算`;
  } catch {
    /* noop */
  }
  return `${days}日後決算`;
}

// SPEC screener-animation 案1: 数値カウントアップ。 clean な数値バッジ (section1「RS NN」/ section2「+Npt」)
// のみ count-up 対象に抽出 (section3 の state ラベル「ブレイク確定」「高値圏突破 · 50DMA +X%」 等は静的)。
// 50DMA 等の「ラベル内数字」 を誤 count-up しないよう pattern 厳密 match に限定。
function parseCountableBadge(badge) {
  // section1: "RS 88" / "RS 88 ✦ GC"
  let m = badge.match(/^(RS )(\d+)( ✦ GC)?$/);
  if (m) return { prefix: m[1], num: Number(m[2]), suffix: m[3] || '' };
  // section2: "+12pt"
  m = badge.match(/^\+(\d+)pt$/);
  if (m) return { prefix: '+', num: Number(m[1]), suffix: 'pt' };
  return null; // それ以外 (state ラベル等) は count-up しない
}

// 数値部のみ rAF count-up (useCountUp、 reduced-motion 即値・forceFromZero で 0→target)。 prefix/suffix は静的。
function CountUpStat({ prefix, num, suffix }) {
  const v = useCountUp(num, { duration: 800, digits: 0, forceFromZero: true });
  return <>{prefix}{v == null ? num : v}{suffix}</>;
}

// SPEC screener-animation 洗練 polish (multi-review ui-designer #1 lever): choreography 時間軸。
// section 見出し (revealBaseDelay) が着地し始めてから row が cascade する「先頭 anchor → 連鎖」 で、
// 「全要素 mount 時同時発火」 (= 動いてるが洗練に見えない) を一本の物語に変える。 rank pop も同 delay 同期。
// ROW_REVEAL_LEAD/STEP は体感で tune 可 (lead↑ で more deliberate、 step↑ で cascade ゆっくり)。
const ROW_REVEAL_LEAD = 240; // ms: 見出し着地を待って row 入場を開始 (v166 印象強化で +40)
const ROW_REVEAL_STEP = 64;  // ms: row 間 stagger (v166: 48→64 で順次感を明確に)
function rowRevealDelay(baseDelay, idx) {
  return baseDelay + ROW_REVEAL_LEAD + idx * ROW_REVEAL_STEP;
}

// S1 チャンク化: 複数リストを ticker 重複なし(先勝ち)で結合するユーティリティ。
// module-level で定義し HeroSection より前に置く。
function dedupeByTicker(...lists) {
  const seen = new Set();
  const result = [];
  for (const list of lists) {
    for (const item of list) {
      if (!seen.has(item.ticker)) {
        seen.add(item.ticker);
        result.push(item);
      }
    }
  }
  return result;
}

/**
 * Hero section card (実 fetch result 表示)
 * @param {object} props
 * @param {string} props.eyebrow - A-1: 連番 eyebrow (例 "01")
 * @param {string} props.title
 * @param {string} props.testId
 * @param {string} props.description - 「推奨ではありません」 含む objective 説明
 * @param {Array<object>} props.tickers - [{ticker, badge?: string}]
 * @param {boolean} props.loading
 * @param {string} props.emptyMessage - tickers 0 件時の文言
 * @param {Function} props.onSelect
 * @param {React.Ref<HTMLDivElement>} props.sectionRef - chip click scroll-to 用 ref
 * @param {boolean} props.active - chip filter active 時 highlight
 * @param {boolean} props.demoMode - true なら top 1 visible + 残 blur + ProTeaser overlay (v125 P5-2)
 * @param {Function} props.onUpgrade - ProTeaser CTA で呼び出し (Pro 訴求 modal 起動)
 * @param {string|null} props.error - P6-2: per-source partial failure 文言 (null なら error UI 非表示)
 * @param {Function} props.onRetry - P6-2: retry button click handler
 * @param {boolean} props.featured - A-4: 最希少 setup (交差) のみ主役化 (padding↑ + Crown gold)
 * @param {number} props.revealBaseDelay - A-3: stagger 入場の section base delay (ms)
 */
function HeroSection({ eyebrow, title, testId, description, tickers, loading, emptyMessage, onSelect, sectionRef, active = false, demoMode = false, onUpgrade, error = null, onRetry, featured = false, revealBaseDelay = 0, columns = false, icon = null, collapsedCount = null }) {
  // v125 P5-2: demo モード時は top 1 visible + 残り blur (marketer 6 体合議 verdict)
  const visibleCount = demoMode ? 1 : tickers.length;
  const blurredCount = demoMode ? Math.max(0, tickers.length - 1) : 0;
  // 案1 (SPEC screener-richness-v2): home Pane3 と同じ tier-m-glow halo sweep を section カードに 1 回流す。
  //   useHaloSweepOnce が IO 進入で data-halo-ready→fired を制御 (proven pattern、 loop 禁止・二度発火 guard)。
  const haloRef = useRef(null);
  useHaloSweepOnce(haloRef);
  // S1 チャンク化: collapsedCount で top N のみ表示 + すべて見る toggle。
  //   demo モードは既存の top1+blur を優先するため canCollapse=false (二重制御を避ける)。
  const [expanded, setExpanded] = useState(false);
  const canCollapse = !demoMode && collapsedCount != null && tickers.length > collapsedCount;
  const shownTickers = canCollapse && !expanded ? tickers.slice(0, collapsedCount) : tickers;
  return (
    <div
      // sectionRef (chip scroll-to) と haloRef (halo) を同一要素に merge
      ref={(el) => {
        if (sectionRef) sectionRef.current = el;
        haloRef.current = el;
      }}
      className="tier-m-glow"
      data-testid={testId}
      data-active={active ? 'true' : 'false'}
      style={{
        flex: 1,
        minHeight: 220,
        // A-4: featured (交差) のみ padding を一段広げて「ご褒美の間」。 ただし dogfood 指摘 (01 のみ
        //   仕切り線がズレる) 対策で top は他列と同じ --space-4 に固定し、 横/下のみ広げる。
        //   → 3 列の eyebrow / 見出し / gold hairline の y が一致する。
        padding: featured
          ? 'var(--space-4, 16px) var(--space-5, 20px) var(--space-5, 20px)'
          : 'var(--space-4, 16px)',
        border: active
          ? '1px solid var(--color-accent)'
          : '1px solid var(--border)',
        // inline radius (8px) が tier-m-glow class の 16px に勝つ。 halo ::after は border-radius:inherit で 8px 追従。
        borderRadius: 'var(--radius-md, 8px)',
        // ③-b polish (user dogfood「Pane3 と同じく中身が白みがかる発光感を」): base bg は CSS
        //   (.screener-pane-ambient .tier-m-glow) に移譲し、 :hover で background-color を lighten 可能に
        //   (inline bg だと :hover の bg 変化を潰すため)。
        // Sprint6 shadow ゼロ統一 (SPEC §Sprint5): active ring (box-shadow) 廃止。
        //   active は inline border (accent、上記 border 三項) で表現し shadow に頼らない。
        boxShadow: undefined,
        // ③-b polish: transform(lift) + bg を ease-standard でゆっくり (Pane3 .panel-card:hover の「ふわっと」 に揃える)。
        transition: 'transform 0.4s var(--ws-ease-standard, cubic-bezier(0.22, 1, 0.36, 1)), border-color 0.3s ease, background-color 0.3s ease',
      }}
    >
      {/* A-1: 見出しに格 — 連番 eyebrow + 18px/fw500 見出し + gold hairline。 A-3 stagger は heading block 単位。 */}
      <div className="screener-reveal" style={{ animationDelay: `${revealBaseDelay}ms` }}>
        {/* 案2 (SPEC screener-richness): home ds-section-header と同じ L字 gold frame (左 3px gold bar + 下 hairline)。
            eyebrow + h4 を枠内に入れ section に「格」 を付与 (description / rows は枠外 full-width = home 同様)。 raw hex なし。 */}
        <div style={{ borderLeft: '3px solid var(--color-gold)', paddingLeft: 'var(--space-3, 12px)', marginBottom: 'var(--space-3, 12px)' }}>
        {eyebrow && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
              fontVariantNumeric: 'tabular-nums',
              marginBottom: 2,
            }}
          >
            {eyebrow}
          </div>
        )}
        <h4
          title={title}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--space-2, 8px)',
            fontSize: 'var(--text-h2, 18px)',
            fontWeight: 500,
            lineHeight: 1.25,
            letterSpacing: '-0.01em',
            margin: 0, /* 案2: 下 margin は L字 frame div の marginBottom が担う */
            paddingBottom: 'var(--space-2, 8px)',
            // 3体合議 (qa #2 + ui) + dogfood 2回目 (実測): 見出し未 clamp だと長い title (交差) が 2 行折返し →
            //   3 列の hairline がズレる。 ★box-sizing: border-box のため minHeight は padding-bottom(8px)+
            //   border(1px) を含む → 旧 2.5em(45px) では 2 行 heading(content 45px) が 54px に成長し 1 行(45px)
            //   と 9px ズレた。 2 行の総高 = 2.5em + 8px + 1px = 54px に min-height を合わせ、 全行数で総高を統一。
            minHeight: 'calc(2.5em + var(--space-2, 8px) + 1px)',
            // A-1: gold hairline (SectionHeader idiom 流用)。 3体合議 (ui P1): 既存 ds-section-header 40%/35% に対し
            //   18% は「ほぼ見えず」 vision-eval 不検知 → 32% に引上げて Aman 真鍮感を揃える。 raw hex なし。
            borderBottom: '1px solid color-mix(in srgb, var(--color-gold) 32%, transparent)',
            color: 'var(--text-primary)',
          }}
        >
          {/* A-4: featured (交差) のみ Crown gold で「最希少」 を格調シンボルで明示 ([[feedback_icon_brand_consistency]])。 */}
          {featured ? (
            <Crown size={16} strokeWidth={1.75} aria-hidden style={{ color: 'var(--color-gold)', flexShrink: 0, marginTop: 2 }} />
          ) : icon ? (
            // S1: chunk 見出しの lucide icon (中立 = text-muted、featured の gold Crown とは別格)。
            <span aria-hidden style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 2, display: 'inline-flex' }}>{icon}</span>
          ) : null}
          {/* 2 行 clamp (それ以上は ellipsis + title hover で全文)。 全列の見出し高さを揃える。 */}
          <span
            style={{
              minWidth: 0,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title}
          </span>
        </h4>
        </div>{/* end 案2 L字 gold frame */}
        <p
          title={description}
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            margin: '0 0 12px',
            lineHeight: 1.4,
            // v159 user dogfood: 3 列で description 行数が異なり chip 開始 y がズレる (CNH vs CCJ 不揃い)。
            // 2 行に clamp + min-height で全列のヘッダ高さを揃え、 銘柄チップを左右水平に整列。 全文は title hover。
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: 28,
          }}
        >
          {description}
        </p>
      </div>
      {loading ? (
        /* Sprint4 skeleton: 読み込み中テキストを形状一致 shimmer に置換 (feedback_cls_envelope_pattern)
           既存 skel-base + skel-text-line を流用、新規 keyframe なし、background-position アニメで CLS 安全 */
        <div
          data-testid={`${testId}-loading`}
          style={{ padding: 'var(--space-3, 12px)', minHeight: 96 }}
          aria-busy="true"
          aria-label="読み込み中"
        >
          <div className="skel-base skel-text-line" style={{ width: '75%', marginBottom: 8 }} />
          <div className="skel-base skel-text-line" style={{ width: '55%', marginBottom: 8 }} />
          <div className="skel-base skel-text-line" style={{ width: '65%', marginBottom: 8 }} />
          <div className="skel-base skel-text-line" style={{ width: '45%' }} />
        </div>
      ) : error ? (
        // P6-2: per-source partial failure UI (「該当銘柄なし」 vs「データ取得失敗」 を明示)
        <div
          data-testid={`${testId}-error`}
          style={{
            display: 'grid',
            gap: 6,
            fontSize: 11,
            color: 'var(--color-warning)',
            textAlign: 'center',
            padding: 'var(--space-3, 12px)',
            border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
            borderRadius: 'var(--radius-sm, 4px)',
            background: 'color-mix(in srgb, var(--color-warning) 6%, transparent)',
          }}
        >
          <span>{error}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              style={{
                padding: '4px 10px',
                fontSize: 10,
                fontWeight: 600,
                border: '1px solid var(--color-warning)',
                borderRadius: 'var(--radius-sm, 4px)',
                background: 'transparent',
                color: 'var(--color-warning)',
                cursor: 'pointer',
                justifySelf: 'center',
              }}
            >
              再取得
            </button>
          )}
        </div>
      ) : tickers.length === 0 ? (
        // 案3 (SPEC screener-richness): 空 section を「設計された沈黙」 に。 Hourglass (格調シンボル、 待機の間) +
        //   事実文言 (emptyMessage 不変、 §38 safe) + breathing room で「壊れてる?」 でなく「本日は条件外・待機中」 と伝える。
        <div data-testid={`${testId}-empty`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2, 8px)', color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-5, 20px) var(--space-3, 12px)' }}>
          <Hourglass size={18} strokeWidth={1.5} aria-hidden style={{ opacity: 0.55 }} />
          <span style={{ fontSize: 11, lineHeight: 1.5 }}>{emptyMessage || '該当銘柄なし'}</span>
        </div>
      ) : (
        <ul
          data-testid={`${testId}-results`}
          style={
            columns
              // full-width 版 (相対強度ランキング): user dogfood「横並びが違和感、上の section と同じ縦並びに」
              //   → column-flow + 5 行固定 = rank 1-5 が縦に積まれた列を 3 つ横に並べる (各列が上の section と同じ縦リスト)。
              //   row 順 (1,2,3 横) でなく column 順 (1,2,3,4,5 縦→次列) で読める。
              ? { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateRows: 'repeat(5, auto)', gridAutoFlow: 'column', gridAutoColumns: 'minmax(0, 1fr)', gap: 'var(--space-1, 4px) var(--space-4, 16px)' }
              : { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1, 4px)' }
          }
        >
          {shownTickers.map((t, idx) => {
            // v125 P5-2: demo モード時は idx === 0 のみ visible、 残りは blur
            const isBlurred = demoMode && idx >= visibleCount;
            const rank = idx + 1;
            // A-2: ランク circle = 上位 3 gold / 4-5 accent (RsScannerResults idiom 移植)。 希少性の gold pop。
            const rankBg = rank <= 3
              ? 'color-mix(in srgb, var(--color-gold) 18%, transparent)'
              : 'color-mix(in srgb, var(--color-accent) 14%, transparent)';
            const rankColor = rank <= 3 ? 'var(--color-gold)' : 'var(--color-accent)';
            return (
              <li
                key={t.ticker}
                // A-3: 銘柄 row の stagger 入場 (section base + 40ms × index)。 wrapper に置くことで
                //   button の hover transform と forwards fill が干渉しない。
                className="screener-reveal"
                style={{ animationDelay: `${rowRevealDelay(revealBaseDelay, idx)}ms` }}
              >
                <button
                  type="button"
                  className="screener-hero-row"
                  onClick={isBlurred ? onUpgrade : () => onSelect(t.ticker)}
                  data-testid={`screener-hero-ticker-${isBlurred ? 'blurred' : t.ticker}`}
                  data-blurred={isBlurred ? 'true' : 'false'}
                  aria-label={isBlurred ? 'Premium プランで全銘柄を解放' : `${t.ticker} の詳細を表示`}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    textAlign: 'left',
                    // 案3 redesign: base の bg / border は .screener-hero-row class に移譲 (inline だと
                    //   :hover の bg / border / glow を override できないため)。 borderRadius は inline 維持。
                    borderRadius: 'var(--radius-sm, 4px)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2, 8px)',
                    filter: isBlurred ? 'blur(4px)' : 'none',
                    opacity: isBlurred ? 0.5 : 1,
                    pointerEvents: isBlurred ? 'none' : 'auto',
                  }}
                >
                  {/* A-2 左: ランク circle (順位を 2 秒視認、 上位 gold で希少性 pop) */}
                  {/* SPEC screener-animation 案2: row stagger と同 delay で circle が spring pop
                      (scale 0.55→1.1→1)。 .screener-rank-pop は transform のみ = CLS 0、 hover transform を
                      持たない装飾要素なので forwards fill 罠と無縁 ([[feedback_press_feedback_delta]])。 */}
                  <span
                    aria-hidden
                    // P1 fix (multi-review qa): blur row (demo) は pop させない。 ぼかした行が弾くと
                    //   pointerEvents:none と相まって「ちぐはぐ」 (Aman の細部一貫性に反する)。
                    className={isBlurred ? undefined : 'screener-rank-pop'}
                    style={{
                      flexShrink: 0,
                      width: 24,
                      height: 24,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                      fontSize: 11,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      background: rankBg,
                      color: rankColor,
                      animationDelay: `${rowRevealDelay(revealBaseDelay, idx)}ms`,
                    }}
                  >
                    {rank}
                  </span>
                  {/* A-2 中央: ticker (mono / fw700 = 視線 anchor)。 hover accent (user dogfood「もう少し
                      アクセント」): .screener-hero-row:hover で ticker を cyan にシフト (news-list-card idiom)。 */}
                  <span className="screener-hero-ticker" style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono, monospace)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t.ticker}
                  </span>
                  {/* A-2 右: stat badge を fw400 muted → fw700 secondary に格上げ (数値主役化、 §7-B Stat contrast)。
                      3体合議 (qa #1 + ui): 長い state label (例「高値圏突破 · 50DMA +X% ✦ GC」) が narrow 列で
                      折返すと row 高さが不揃いになるため nowrap + ellipsis、 全文は title hover。 主役の state 名は先頭で生存。 */}
                  {t.badge && (
                    <span title={t.badge} style={{ flexShrink: 0, maxWidth: '56%', textAlign: 'right', fontSize: 11, fontWeight: 700, color: t.isExtended ? 'var(--color-warning)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {(() => {
                        // 案1 + 洗練 polish (multi-review ui-designer #2 lever): count-up は featured (section1
                        //   = 最希少の交差 hero) のみに集中。 全 section で数字が同時に動くと視線が定まらず
                        //   「静寂 → 動」 のコントラストが消える ([[feedback_minimalism_over_additive]])。
                        //   section2/3 のバッジは静的表示にして hero の数字だけを主役の motion に。
                        const p = featured ? parseCountableBadge(t.badge) : null;
                        return p ? <CountUpStat prefix={p.prefix} num={p.num} suffix={p.suffix} /> : t.badge;
                      })()}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* S1: すべて見る toggle (collapsedCount 設定時 + 非 demo + 超過時のみ)。発光系 class 不使用、token のみ。 */}
      {canCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          data-testid={`${testId}-showall`}
          style={{
            marginTop: 'var(--space-2, 8px)',
            width: '100%',
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 600,
            textAlign: 'center',
            border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
            borderRadius: 'var(--radius-sm, 4px)',
            background: 'transparent',
            color: 'var(--color-accent)',
            cursor: 'pointer',
            transition: 'background 0.2s ease',
          }}
        >
          {expanded ? '閉じる' : `すべて見る (${tickers.length})`}
        </button>
      )}

      {/* v125 P5-2: demo モード時の ProTeaser overlay (marketer 6 体合議 verdict)
          「Premium で全 N 銘柄」 文言で具体性 + LP「3 銘柄/日まで無料試用」 整合 */}
      {demoMode && blurredCount > 0 && (
        <button
          type="button"
          onClick={onUpgrade}
          data-testid={`screener-hero-proteaser-${testId}`}
          style={{
            marginTop: 'var(--space-2, 8px)',
            width: '100%',
            padding: '8px 12px',
            fontSize: 11,
            fontWeight: 600,
            textAlign: 'center',
            border: '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)',
            borderRadius: 'var(--radius-sm, 4px)',
            background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
            color: 'var(--color-accent)',
            cursor: 'pointer',
            transition: 'background 0.2s ease',
          }}
        >
          Premium で残り {blurredCount} 銘柄を解放
        </button>
      )}
    </div>
  );
}

// D2 残 minor (handover v163): 銘柄選択→deselect で Pane3 が JudgmentDetail↔ScreenerPane を
// 切替え、 ScreenerPane が unmount→remount すると Hero 3 fetch が再走し loading flicker が出る。
// module-scope cache (TTL 5 分、 RS/Cup scanner は nightly batch で intra-day 不変) に最後の結果を
// 保持し、 remount 時は即 hydrate + refetch skip で flicker を解消。 ([[feedback_diagram_card_remount_cache]]
// と同 pattern。 Workspace の isScreener 分岐=master-detail 心臓部 は触らず ScreenerPane 内に閉じる安全策。
// retry / TTL 超過時は通常どおり fetch。)
const HERO_CACHE_TTL_MS = 5 * 60 * 1000;
let _heroCache = null; // { ts, leaderCwh, rsRising, newCwh, retest, rsLeaders, earningsThisWeek, breakout }
function heroCacheFresh() {
  return !!_heroCache && (Date.now() - _heroCache.ts) < HERO_CACHE_TTL_MS;
}

/**
 * ScreenerPane
 * @param {object} props
 * @param {object} props.detailContext - { user, isPro, onUpgrade, onSignIn }
 * @param {boolean} props.isProUser
 * @param {Function} props.handleUpgradeRequest
 */
export default function ScreenerPane({ detailContext = {}, isProUser = false, handleUpgradeRequest }) {
  const setActiveTicker = useWorkspaceStore((s) => s.setActiveTicker);

  // v125 P5-2: demo モード判定 (未ログイン + 非 Pro)。
  // marketer 6 体合議 verdict: demo user に「top 1 visible + 残り blur」 で訴求、
  // LP「3 銘柄/日まで無料試用」 と整合 (各 Hero section top 1 = 3 銘柄/日 換算)
  const demoMode = !detailContext?.user || !isProUser;

  // 3 Hero section の state (P6-2: error flag を追加で「該当銘柄なし」 vs「データ取得失敗」 区別)
  // D2 flicker fix: remount 時 cache fresh なら即 hydrate (loading flicker 回避)、 stale/初回は loading から。
  const [leaderCwh, setLeaderCwh] = useState(() => (heroCacheFresh() ? _heroCache.leaderCwh : { tickers: [], loading: true, error: null }));
  const [rsRising, setRsRising] = useState(() => (heroCacheFresh() ? _heroCache.rsRising : { tickers: [], loading: true, migrationPending: false, error: null }));
  const [newCwh, setNewCwh] = useState(() => (heroCacheFresh() ? _heroCache.newCwh : { tickers: [], loading: true, error: null }));
  // Task#4 A先行: 旧レジスタンス・リテスト接近 (vs_SPY 降順、 backend default filter で絞り込み済)
  const [retest, setRetest] = useState(() => (heroCacheFresh() && _heroCache.retest ? _heroCache.retest : { tickers: [], loading: true, error: null }));
  // dogfood 2026-06-05「Pane3 下部 60% が空」: 3 section 下の void を RS≥80 leaders ランキングで埋める。
  //   rsLeader.items は section1 (交差) の fetch 元として既に取得済 = 追加 fetch ゼロの副産物。
  const [rsLeaders, setRsLeaders] = useState(() => (heroCacheFresh() && _heroCache.rsLeaders ? _heroCache.rsLeaders : { tickers: [], loading: true, error: null }));
  // B-Top1: RS≥80 leaders の今週決算予定 (rsLeader.items × holdings-meta 交差)
  const [earningsThisWeek, setEarningsThisWeek] = useState(() => (heroCacheFresh() && _heroCache.earningsThisWeek ? _heroCache.earningsThisWeek : { tickers: [], loading: true, error: null }));
  // Sprint 5: 新高値ブレイクスクリーナー (feature flag: isBreakoutScreenerEnabled() で ON/OFF)。
  //   locked:true 時は items 空 + count_locked で ProTeaser 訴求。
  //   flag OFF 時は state を初期化せず no-op (既存 screener に影響ゼロ)。
  const [breakoutData, setBreakoutData] = useState(() => {
    if (!isBreakoutScreenerEnabled()) return { tickers: [], loading: false, locked: false, count_locked: 0, error: null };
    return heroCacheFresh() && _heroCache.breakout
      ? _heroCache.breakout
      : { tickers: [], loading: true, locked: false, count_locked: 0, error: null };
  });
  // P6-2: fetch retry trigger
  const [retryNonce, setRetryNonce] = useState(0);
  const handleRetry = () => setRetryNonce((n) => n + 1);

  // Sprint 4-A-4: chip filter active state + scroll-to refs
  // activeChip: null = all visible (default) / 'leader' / 'rising' / 'new-cwh' のいずれかで該当 section を highlight
  const [activeChip, setActiveChip] = useState(null);
  const breakoutRef = useRef(null); // 新高値ブレイク chunk
  // S1 チャンク化: 勢い/仕掛かり の chunk ref。探索 chip は 3 chunk へ jump。
  const momentumRef = useRef(null);
  const setupRef = useRef(null);
  const chipRefMap = { momentum: momentumRef, setup: setupRef, breakout: breakoutRef };

  const handleChipClick = (chipKey) => {
    // 同 chip を再 click で全 highlight 解除 (toggle、 Linear 流)
    const next = activeChip === chipKey ? null : chipKey;
    setActiveChip(next);
    // scroll-into-view (smooth、 nearest = scroll 最小化)
    if (next) {
      chipRefMap[next]?.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  };

  useEffect(() => {
    let cancelled = false;

    // D2 flicker fix: remount かつ cache fresh かつ retry でない → state は cache から hydrate 済 →
    // refetch を skip して loading flicker を回避。 retry / 初回 / TTL 超過時のみ下の fetch に進む。
    if (retryNonce === 0 && heroCacheFresh()) {
      return;
    }

    // P6-2: retry 時の loading state 初期化
    setLeaderCwh({ tickers: [], loading: true, error: null });
    setRsRising({ tickers: [], loading: true, migrationPending: false, error: null });
    setNewCwh({ tickers: [], loading: true, error: null });
    setRetest({ tickers: [], loading: true, error: null });
    setRsLeaders({ tickers: [], loading: true, error: null });
    setEarningsThisWeek({ tickers: [], loading: true, error: null });
    // Sprint 5: flag ON 時のみ breakout も loading 状態にリセット
    if (isBreakoutScreenerEnabled()) {
      setBreakoutData({ tickers: [], loading: true, locked: false, count_locked: 0, error: null });
    }

    (async () => {
      // 5 fetch 並列起動 (Sprint 5: breakout を 5 本目に追加。flag OFF 時は null resolve で Promise.all を乱さない)
      const [rsLeader, rsDelta, cup, retestRes, breakoutRes] = await Promise.all([
        fetchRsLeader({ limit: 30 }),
        fetchRsDelta({ minDelta: 10, limit: 30 }),
        fetchCupHandle({ limit: 30 }),
        fetchRetest({ limit: 20 }),
        isBreakoutScreenerEnabled() ? fetchBreakout({ limit: 20 }) : Promise.resolve(null),
      ]);
      if (cancelled) return;

      // P6-2: per-source error 判定 (fetcher は error field 返却で graceful、 ここで「該当銘柄なし」 と区別)
      const rsLeaderFailed = !!rsLeader.error;
      const rsDeltaFailed = !!rsDelta.error;
      const cupFailed = !!cup.error;

      // section 06: リテスト接近 (backend が vs_SPY 降順 + default filter 済、 frontend は表示整形のみ)。
      // §38: approach ラベル (deep=リテスト接近 / shallow=到達途上) で表示し、 押し戻し% の数値誤読を避ける。
      // 他 section の usedTickers 除外はしない (リテストは独立 signal)。
      const retestResult = {
        tickers: (retestRes.items || []).map((it) => ({
          ticker: it.ticker,
          badge: it.approach_level === 'deep' ? 'リテスト接近' : '到達途上',
        })),
        loading: false,
        error: retestRes.error ? 'リテスト取得失敗' : null,
      };
      setRetest(retestResult);

      // section 1: Leader + Breakout + CWH 交差 = RS >= 80 ∩ Cup-Handle 検出
      // v133 方針 #12 Option A: cup item の gc_confirmed lookup map で Cup-Handle カードに GC badge 強化
      // v148 ⑦ (3 体合議 qa-dogfooder MAJOR-A / frontend MINOR): breakout_extended は正統 cup-handle
      // ではないため section ① (disclaimer なし) から除外。 extended は section ③ (高値圏突破 badge +
      // disclaimer) のみで露出させ、 §5 優良誤認 (extended を「CWH 交差」 と誤認) を防ぐ。
      const cupItemsForSection1 = (cup.items || []).filter((c) => c.state !== 'breakout_extended');
      const cupTickers = new Set(cupItemsForSection1.map((c) => c.ticker));
      const gcByTicker = new Map();
      for (const c of cupItemsForSection1) {
        if (c.gc_confirmed) gcByTicker.set(c.ticker, true);
      }
      const intersection = [];
      for (const item of (rsLeader.items || [])) {
        if (cupTickers.has(item.ticker)) {
          const gc = gcByTicker.get(item.ticker);
          intersection.push({
            ticker: item.ticker,
            badge: gc ? `RS ${item.universe_percentile} / 上位${100 - item.universe_percentile}% ✦ GC` : `RS ${item.universe_percentile} / 上位${100 - item.universe_percentile}%`,
          });
          if (intersection.length >= 5) break;
        }
      }
      // section 1 は RS + Cup 両方が必要、 どちらか失敗で error 表示
      const leaderResult = {
        tickers: intersection,
        loading: false,
        error: (rsLeaderFailed || cupFailed) ? (rsLeaderFailed && cupFailed ? '両 source 取得失敗' : rsLeaderFailed ? 'RS 取得失敗' : 'Cup-Handle 取得失敗') : null,
      };
      setLeaderCwh(leaderResult);

      // section 2: RS 急上昇 = sort=delta items (section 1 で使われた ticker は除外、 qa-dogfooder verdict)
      const usedTickers = new Set(intersection.map((t) => t.ticker));
      const migrationPending = rsDelta?.sources?.delta_1d_percentile === 'empty_migration_pending';
      const risingItems = [];
      for (const item of (rsDelta.items || [])) {
        if (usedTickers.has(item.ticker)) continue;
        risingItems.push({
          ticker: item.ticker,
          badge: item.delta_1d_percentile != null ? `+${item.delta_1d_percentile}pt` : 'RS '.concat(item.universe_percentile ?? ''),
        });
        usedTickers.add(item.ticker);
        if (risingItems.length >= 5) break;
      }
      const risingResult = {
        tickers: risingItems,
        loading: false,
        migrationPending,
        error: rsDeltaFailed ? 'RS scanner 取得失敗' : null,
      };
      setRsRising(risingResult);

      // section 3: 新規 Cup-Handle 検出 (last 24h は signal_date でなく state=breakout_confirmed/pending を優先)
      // section 1/2 で使われた ticker を除外、 v133 方針 #12: GC 確認済 ticker は badge に ✦ GC を追加
      const newCwhItems = [];
      for (const item of (cup.items || [])) {
        if (usedTickers.has(item.ticker)) continue;
        // v148 ⑦: extended は「高値圏突破 · 50DMA +X%」、 cup 系は既存ラベル
        const baseBadge = item.state === 'breakout_extended'
          ? extendedBadge(item)
          : (CUP_STATE_LABEL_JP[item.state] || item.state || '形成中');
        newCwhItems.push({
          ticker: item.ticker,
          badge: item.gc_confirmed ? `${baseBadge} ✦ GC` : baseBadge,
          // v229 (qa-dogfooder 案): extended (過延伸・押し目待ち) を amber 表示し clean cup と視覚区切り
          //   (per-ticker extended chip の tone="warning" と一貫)。chase 禁止規律を色でも直伝。
          isExtended: item.state === 'breakout_extended',
        });
        usedTickers.add(item.ticker);
        if (newCwhItems.length >= 5) break;
      }
      const newResult = {
        tickers: newCwhItems,
        loading: false,
        error: cupFailed ? 'Cup-Handle scanner 取得失敗' : null,
      };
      setNewCwh(newResult);

      // dogfood「Pane3 下部 void」: RS≥80 leaders ランキング (上位 15)。 rsLeader.items を流用 (追加 fetch なし)。
      //   section1 (交差) は top5 のみ使い残りを破棄していた full list を ranking として surface。
      //   badge は RS percentile (数値=Python 物理層、 §38 中立)。 demo は HeroSection 側で top1+blur。
      const leaderRankItems = (rsLeader.items || []).slice(0, 15).map((item) => ({
        ticker: item.ticker,
        badge: item.universe_percentile != null ? `RS ${item.universe_percentile} / 上位${100 - item.universe_percentile}%` : 'RS',
      }));
      const rsLeadersResult = {
        tickers: leaderRankItems,
        loading: false,
        error: rsLeaderFailed ? 'RS 取得失敗' : null,
      };
      setRsLeaders(rsLeadersResult);

      // B-Top1: RS≥80 leaders の今週決算 (days_to_earnings 0-7) を holdings-meta で交差 (追加 backend なし)。
      //   「RS が強い銘柄で今週決算」 = 投資家が毎日人力でやる『今週の決算チェック』を代替 (原則4 人力代替)。
      let earningsThisWeekResult = { tickers: [], loading: false, error: null };
      try {
        const leaderTickers = (rsLeader.items || []).slice(0, 30).map((i) => i.ticker);
        if (leaderTickers.length > 0 && !rsLeaderFailed) {
          const hm = await fetchEarningsMeta(leaderTickers);
          if (!cancelled) {
            const meta = hm?.meta || {};
            const raw = [];
            for (const item of (rsLeader.items || [])) {
              const m = meta[item.ticker];
              if (m && m.days_to_earnings != null && m.days_to_earnings >= 0 && m.days_to_earnings <= 90) {
                raw.push({
                  ticker: item.ticker,
                  days: m.days_to_earnings,
                  date: m.next_earnings_date,
                  rs: item.universe_percentile,
                });
              }
            }
            raw.sort((a, b) => a.days - b.days); // 直近決算順
            earningsThisWeekResult = {
              tickers: raw.slice(0, 10).map((x) => ({
                ticker: x.ticker,
                badge: `${fmtEarnDay(x.date, x.days)} · RS ${x.rs}`,
              })),
              loading: false,
              error: null,
            };
          }
        }
      } catch {
        earningsThisWeekResult = { tickers: [], loading: false, error: null };
      }
      if (!cancelled) setEarningsThisWeek(earningsThisWeekResult);

      // Sprint 5: 新高値ブレイク section の結果処理 (flag ON かつ fetch 結果あり時のみ)。
      //   §38: BREAKOUT_STATE_LABEL_JP の事実ラベルのみ。badge に「買い場」「上昇」等は含めない。
      //   locked:true → items 空のまま count_locked を保持 (ProTeaser 訴求用)。
      //   locked:false → items を BREAKOUT_STATE_LABEL_JP でラベリングして表示。
      let breakoutResult = { tickers: [], loading: false, locked: false, count_locked: 0, error: null };
      if (isBreakoutScreenerEnabled() && breakoutRes != null) {
        if (breakoutRes.error) {
          breakoutResult = { tickers: [], loading: false, locked: false, count_locked: 0, error: 'ブレイクアウト取得失敗' };
        } else if (breakoutRes.locked) {
          // 非 Premium: items 空 + count_locked で ProTeaser 訴求
          breakoutResult = {
            tickers: [],
            loading: false,
            locked: true,
            count_locked: breakoutRes.count_locked ?? 0,
            error: null,
          };
        } else {
          // Premium: items を事実ラベルに変換
          const boItems = (breakoutRes.items || []).map((it) => {
            // badge 構築: state ラベル (事実) + is_new_52w_high / universe_percentile (§38 事実値)
            const stateLabel = BREAKOUT_STATE_LABEL_JP[it.state] || it.state || '新高値';
            const parts = [stateLabel];
            if (it.is_new_52w_high) parts.push('52週高値');
            if (it.universe_percentile != null) parts.push(`RS上位${100 - it.universe_percentile}%`);
            return { ticker: it.ticker, badge: parts.join(' · ') };
          });
          breakoutResult = {
            tickers: boItems,
            loading: false,
            locked: false,
            count_locked: 0,
            error: null,
          };
        }
        if (!cancelled) setBreakoutData(breakoutResult);
      }

      // D2 flicker fix: 結果を module cache に保存 → 次の remount (deselect 復帰) で hydrate して flicker 回避。
      _heroCache = { ts: Date.now(), leaderCwh: leaderResult, rsRising: risingResult, newCwh: newResult, retest: retestResult, rsLeaders: rsLeadersResult, earningsThisWeek: earningsThisWeekResult, breakout: breakoutResult };
    })();

    return () => { cancelled = true; };
  }, [retryNonce]);

  const handleSelect = (sym) => {
    // v160 D2 (master-detail): tab を離脱せず activeTicker のみ更新。
    // → Pane 3 が Hero → JudgmentDetail に切替、 Pane 2 の Explorer (絞り込み結果) は残る。
    // ⚠️案7 (withViewTransition cross-fade) は user dogfood で「銘柄分析ページの scroll が固まる」 P0 回帰を
    //   誘発したため revert。 master-detail swap + View Transition + PaneDetailView の contain:layout の
    //   相互作用が scroll lock の疑い。 加えて cross-fade の体感差は「わからない」 で benefit ゼロ。
    //   → v160 までの proven な直接 setActiveTicker に戻す。
    setActiveTicker(sym);
  };

  // S1 チャンク化: 既存 state から 3 chunk を派生 (追加 fetch なし)。
  //   勢い = RS急上昇 + RS≥80 ランキング (先勝ち dedupe)。仕掛かり = 新規Cup + リテスト接近。
  const momentum = {
    tickers: dedupeByTicker(rsRising.tickers, rsLeaders.tickers),
    loading: rsRising.loading || rsLeaders.loading,
    error: rsRising.error && rsLeaders.error ? '勢いデータ取得失敗' : null,
  };
  const setup = {
    tickers: dedupeByTicker(newCwh.tickers, retest.tickers),
    loading: newCwh.loading || retest.loading,
    error: newCwh.error && retest.error ? '仕掛かりデータ取得失敗' : null,
  };

  return (
    <div
      data-testid="screener-pane"
      // 案A (user dogfood「全体感で寂しい」): ambient depth layer (.screener-pane-ambient::before)。
      //   position:relative + content を z-index:1 に持ち上げ、 背面に超低速 breathe の radial cyan。
      className="screener-pane-ambient"
      style={{ padding: 'var(--space-4, 16px)', height: '100%', overflowY: 'auto' }}
    >
      {/* v160 D2: master-detail 化で WIP banner 撤去 (user gate 通過、 本実装が gate 後の正式版)。
          Hero (今注目 3 セクション) は Pane 3 の idle 状態、 銘柄選択で JudgmentDetail に切替。 */}

      {/* v175→S2: 市場局面 FTD バナーは Pane 2 (CustomScreenerPanel) に集約し重複排除 (user 2026-06-18)。
          Pane 2 は銘柄選択後も常駐するため地合いが常に見える。Pane 3 はヘッドラインを最上部に。 */}

      {/* A-6: chip filter を「探索メニュー」 化 (ChipGroup prefix=探索)。 active のみ accent
          ([[feedback_no_baseline_cyan]]: 非 active は muted で baseline cyan を出さない)。 */}
      {/* S1 チャンク化: 探索 chip を 3 chunk (勢い/仕掛かり/ブレイク) への jump に簡素化。 */}
      <div data-testid="screener-chip-filter" style={{ marginBottom: 'var(--space-3, 12px)' }}>
        <ChipGroup prefix="探索" gap="normal" ariaLabel="スクリーナー chunk へ jump">
          <Chip
            variant="filter"
            size="sm"
            tone={activeChip === 'momentum' ? 'accent' : 'muted'}
            pressed={activeChip === 'momentum'}
            onClick={() => handleChipClick('momentum')}
            ariaLabel="勢い chunk に jump"
          >
            勢い
          </Chip>
          <Chip
            variant="filter"
            size="sm"
            tone={activeChip === 'setup' ? 'accent' : 'muted'}
            pressed={activeChip === 'setup'}
            onClick={() => handleChipClick('setup')}
            ariaLabel="仕掛かり chunk に jump"
          >
            仕掛かり
          </Chip>
          {/* Sprint 5: 新高値ブレイク chunk (flag ON 時のみ表示。flag OFF で null = DOM に出ない) */}
          {isBreakoutScreenerEnabled() && (
            <Chip
              variant="filter"
              size="sm"
              tone={activeChip === 'breakout' ? 'accent' : 'muted'}
              pressed={activeChip === 'breakout'}
              onClick={() => handleChipClick('breakout')}
              ariaLabel="ブレイク chunk に jump"
            >
              ブレイク
            </Chip>
          )}
        </ChipGroup>
      </div>

      {/* S1: Layer0 ヘッドライン (交差 top3 を full-width 前出し = 2 秒で「今日の筆頭」)。 */}
      <HeroSection
        eyebrow="今日の注目"
        featured
        revealBaseDelay={0}
        title="RS上位 × ブレイク × Cup交差"
        testId="screener-headline"
        description="RS percentile ≥ 80 ∩ Cup-Handle 検出済（投資の推奨ではありません）"
        tickers={leaderCwh.tickers.slice(0, 3)}
        loading={leaderCwh.loading}
        error={leaderCwh.error}
        emptyMessage="本日は交差銘柄が少ない状況です"
        onSelect={handleSelect}
        demoMode={demoMode}
        onUpgrade={handleUpgradeRequest}
        onRetry={handleRetry}
      />
      {/* S1: 0件フォールバック (交差が空の日に「壊れてる?」 を避け、下の chunk へ誘導)。 */}
      {leaderCwh.tickers.length === 0 && !leaderCwh.loading && !leaderCwh.error && (
        <p data-testid="screener-zero-fallback" style={{ fontSize: 11, color: 'var(--text-muted)', margin: 'var(--space-2, 8px) 0 0', lineHeight: 1.5 }}>
          本日は交差が少ない状況です。下の「勢い」「仕掛かり」「ブレイク」をご覧ください。
        </p>
      )}

      {/* S1: 3 チャンク (勢い / 仕掛かり / ブレイク) を縦スタック。各 top5 + すべて見る。 */}
      <div style={{ marginTop: 'var(--space-4, 16px)' }}>
        <HeroSection
          icon={<TrendingUp size={16} strokeWidth={1.75} />}
          revealBaseDelay={120}
          title="勢い（RS上位・急騰）"
          testId="screener-chunk-momentum"
          description="RS percentile 上位・前日比で急上昇した銘柄。投資の推奨ではありません。"
          tickers={momentum.tickers}
          loading={momentum.loading}
          error={momentum.error}
          emptyMessage="該当銘柄なし"
          collapsedCount={5}
          onSelect={handleSelect}
          sectionRef={momentumRef}
          active={activeChip === 'momentum'}
          demoMode={demoMode}
          onUpgrade={handleUpgradeRequest}
          onRetry={handleRetry}
        />
      </div>
      <div style={{ marginTop: 'var(--space-4, 16px)' }}>
        <HeroSection
          icon={<Target size={16} strokeWidth={1.75} />}
          revealBaseDelay={240}
          title="仕掛かり（新規Cup・リテスト接近）"
          testId="screener-chunk-setup"
          description="ベース形成中・旧抵抗の支持転換に接近した銘柄。投資の推奨ではありません。"
          tickers={setup.tickers}
          loading={setup.loading}
          error={setup.error}
          emptyMessage="該当銘柄なし"
          collapsedCount={5}
          onSelect={handleSelect}
          sectionRef={setupRef}
          active={activeChip === 'setup'}
          demoMode={demoMode}
          onUpgrade={handleUpgradeRequest}
          onRetry={handleRetry}
        />
      </div>

      {/* S1 チャンク化で個別 section 廃止:
          04 相対強度ランキング(rsLeaders) → 「勢い」chunk に統合 / 06 リテスト接近(retest) → 「仕掛かり」chunk に統合 /
          05 今後の決算×RS(earningsThisWeek) → 後続 sprint で詳細条件へ (state/fetch は残置)。 */}

      {/* Sprint 5: 新高値ブレイク section (feature flag ON 時のみ render。 flag OFF で完全 no-op)。
          §38: BREAKOUT_STATE_LABEL_JP の事実ラベル + 事実数値のみ。「買い場」「上昇」「強い」等の断定禁止。
          locked:true → ProTeaser「Premiumで{count_locked}件の新高値ブレイク」訴求 (items 空=銘柄出さない)。
          locked:false & items 空 → graceful 「本日の新高値ブレイクなし」。
          locked:false & items あり → 一覧表示。 */}
      {isBreakoutScreenerEnabled() && (
        <div style={{ marginTop: 'var(--space-4, 16px)' }}>
          {breakoutData.locked ? (
            /* locked 分岐: ProTeaser (items 空なので銘柄は一切出さない) */
            <div
              ref={breakoutRef}
              data-testid="screener-hero-breakout-locked"
              className="tier-m-glow"
              style={{
                padding: 'var(--space-3, 12px) var(--space-4, 16px)',
                borderRadius: 'var(--radius-md, 8px)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2, 8px)', marginBottom: 'var(--space-2, 8px)' }}>
                <Crown size={14} style={{ color: 'var(--color-accent)' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  新高値ブレイク
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0, marginBottom: 'var(--space-3, 12px)' }}>
                52週高値を更新した銘柄を自動検出（投資の推奨ではありません）
              </p>
              {breakoutData.count_locked > 0 ? (
                <button
                  type="button"
                  onClick={handleUpgradeRequest}
                  data-testid="screener-hero-breakout-proteaser"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    textAlign: 'center',
                    border: '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)',
                    borderRadius: 'var(--radius-sm, 4px)',
                    background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                    color: 'var(--color-accent)',
                    cursor: 'pointer',
                    transition: 'background 0.2s ease',
                  }}
                >
                  Premium で {breakoutData.count_locked} 件の新高値ブレイクを確認
                </button>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0, textAlign: 'center' }}>
                  本日の新高値ブレイクなし
                </p>
              )}
            </div>
          ) : (
            /* unlock 済 (Premium) または empty 分岐: HeroSection で統一描画 (S1: chunk 化、icon + すべて見る) */
            <HeroSection
              icon={<ArrowUpRight size={16} strokeWidth={1.75} />}
              title="ブレイク（新高値）"
              testId="screener-chunk-breakout"
              description="52週高値を更新した銘柄（出来高倍率・RS上位%を併記）。投資の推奨ではありません。"
              tickers={breakoutData.tickers}
              loading={breakoutData.loading}
              error={breakoutData.error}
              emptyMessage="本日の新高値ブレイクなし"
              collapsedCount={5}
              onSelect={handleSelect}
              sectionRef={breakoutRef}
              active={activeChip === 'breakout'}
              demoMode={false}
              onUpgrade={handleUpgradeRequest}
              onRetry={handleRetry}
            />
          )}
        </div>
      )}

      {/* v160 D2: Explorer (CustomScreenerPanel) は Pane 2 に移設 (master-detail)。
          本コンポーネントは Pane 3 の idle 時 Hero (今注目) を担う。 */}
    </div>
  );
}
