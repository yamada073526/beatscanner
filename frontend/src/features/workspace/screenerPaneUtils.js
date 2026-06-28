// ─────────────────────────────────────────────────────────────────────────────
// screenerPaneUtils.js — ScreenerPane の React 非依存ユーティリティ層。
//
// ScreenerPane.jsx から物理抽出した「feature flag / 状態ラベル map / backend fetcher /
// 日付・badge format / dedupe util / row reveal timing」。hooks/JSX/component scope 非依存。
// 唯一の外部依存は supabase (fetchBreakout の Bearer token 取得)。
// §38 ラベル規律 (事実記述のみ・断定/行動指示禁止) は移動前と不変。
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from '../../lib/supabase.js';

// Sprint 5 frontend: 新高値ブレイクスクリーナー用 feature flag。
// 2026-06-18 user promote: **default ON** に昇格 (検証済 / headless 目視済)。
//   kill-switch: `?breakout_screener=0` または localStorage `breakout_screener='0'` で OFF (緊急 revert 用、redesign 前の保険)。
//   URL 優先 (即 revert)、localStorage が永続。([[feedback_feature_flag_dual_mode]] URL優先パターン)
//   ⚠️ screener タブは全面 redesign 予定 (user 2026-06-18)。本 section の最終 UX は redesign で再設計される。
export function isBreakoutScreenerEnabled() {
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
export const BREAKOUT_STATE_LABEL_JP = {
  bo_confirmed: '新高値ブレイク',
  bo_pending:   '高値圏トライ中',
  bo_extended:  '新高値圏(過延伸)',
  bo_soft:      '新高値ブレイク(出来高薄)',
};

// v147 (user dogfood AAPL): cup-handle scanner の state badge を日本語ラベルに。
//   旧版は raw state 文字列 (例「breakout_extended」) をそのまま表示していた (英語混在 + 意味不明)。
//   StockPriceChart の cupChipLabel + extended chip と文言を一致させる。
//   breakout_extended (= AAPL 型「定義通りでない高値圏ブレイク」) も識別可能に。§38 回避で事実記述。
export const CUP_STATE_LABEL_JP = {
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
export function extendedBadge(item) {
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
export async function fetchRsLeader({ limit = 20 } = {}) {
  try {
    const r = await fetch(`/api/scanner/rs?min_percentile=80&limit=${limit}`);
    if (!r.ok) return { items: [], error: `HTTP ${r.status}` };
    return await r.json();
  } catch (e) {
    return { items: [], error: String(e) };
  }
}

export async function fetchRsDelta({ minDelta = 10, limit = 5 } = {}) {
  try {
    const r = await fetch(`/api/scanner/rs?sort=delta&min_delta=${minDelta}&limit=${limit}&min_percentile=1`);
    if (!r.ok) return { items: [], error: `HTTP ${r.status}` };
    return await r.json();
  } catch (e) {
    return { items: [], error: String(e) };
  }
}

// ── fetcher: backend /api/scanner/cup-handle (cup-only mode) ──
export async function fetchCupHandle({ limit = 20 } = {}) {
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
export async function fetchRetest({ limit = 20 } = {}) {
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
export async function fetchBreakout({ limit = 20 } = {}) {
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
export async function fetchEarningsMeta(symbols) {
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
export function fmtEarnDay(dateStr, days) {
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
export function parseCountableBadge(badge) {
  // section1: "RS 88" / "RS 88 ✦ GC"
  let m = badge.match(/^(RS )(\d+)( ✦ GC)?$/);
  if (m) return { prefix: m[1], num: Number(m[2]), suffix: m[3] || '' };
  // section2: "+12pt"
  m = badge.match(/^\+(\d+)pt$/);
  if (m) return { prefix: '+', num: Number(m[1]), suffix: 'pt' };
  return null; // それ以外 (state ラベル等) は count-up しない
}

// SPEC screener-animation 洗練 polish (multi-review ui-designer #1 lever): choreography 時間軸。
// section 見出し (revealBaseDelay) が着地し始めてから row が cascade する「先頭 anchor → 連鎖」 で、
// 「全要素 mount 時同時発火」 (= 動いてるが洗練に見えない) を一本の物語に変える。 rank pop も同 delay 同期。
// ROW_REVEAL_LEAD/STEP は体感で tune 可 (lead↑ で more deliberate、 step↑ で cascade ゆっくり)。
export const ROW_REVEAL_LEAD = 240; // ms: 見出し着地を待って row 入場を開始 (v166 印象強化で +40)
export const ROW_REVEAL_STEP = 64;  // ms: row 間 stagger (v166: 48→64 で順次感を明確に)
export function rowRevealDelay(baseDelay, idx) {
  return baseDelay + ROW_REVEAL_LEAD + idx * ROW_REVEAL_STEP;
}

// S1 チャンク化: 複数リストを ticker 重複なし(先勝ち)で結合するユーティリティ。
// module-level で定義し HeroSection より前に置く。
export function dedupeByTicker(...lists) {
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
