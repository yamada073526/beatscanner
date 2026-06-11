function fmpHeaders() {
  return {};
}

/**
 * Phase 2.9 Sprint 3 #Pane3-perf: AbortController + 30s timeout fetch helper
 * 真因: backend yfinance fallback (Railway IP block) で永遠にハング → frontend 永遠分析中
 * 修正: 30s で必ず timeout、 user に明示エラー表示 + 再試行可能化
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...options, signal: controller.signal });
    return r;
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`タイムアウト (${timeoutMs / 1000}秒以内に応答なし)。 ページをリロードして再試行してください。`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * v144 #Pane3-perf: GET coalescing layer.
 * 真因: prefetchAll と各 panel の component fetch が同一 URL を二重〜三重に叩いていた
 *   (guidance/basic 2x / analyst 3x / insights 2x / price-history 2x / news 2x / ir-links 2x)。
 *   frontend に in-flight / 短期 TTL の dedup が無く、 prefetch が後続 mount を加速できていなかった。
 * 修正: URL key の in-flight + 60s TTL micro-cache で 1 本化。
 *   prefetch(t=0) の結果を panel mount(t≈2-3s) が即取得 → 体感 load 短縮 + backend 負荷/FMP quota 削減。
 * 注意:
 *   - 成功時のみ cache。 失敗 (!r.ok / network) は即削除して retry 可能に保つ
 *   - consumer 間の参照共有による in-place mutation 事故を防ぐため返却時に必ず clone
 *   - timeoutMs 指定で hard timeout (insights の長時間 LLM 用に 75s 等)
 */
const _getCache = new Map(); // url -> { ts, promise(raw json) }
// v195 (C-3 competitor nav, user dogfood 2026-06-09「戻る時に毎回ロードが発生」):
//   60s → 10min に延長。 元々の目的 (prefetch t=0 → panel mount t≈2-3s の race coalesce) は 60s で足りるが、
//   パンくず back-nav (A→競合B→A に戻る) では A の panel が unmount→remount するため、 競合を読んでいる
//   間に 60s 経過すると _getCache が失効し全 panel が再 fetch (= user の言う「ロード」)。
//   判定 result は resultCacheRef (10min TTL) で既に瞬時表示されるので、 panel 側 GET cache も 10min に
//   揃えて「競合へ遷移する前の状態へロードなしで一瞬で戻る」 を実現する (両 cache の TTL 対称化)。
//   鮮度が要る explicit refresh は自前 invalidate 済 (insights=invalidateInsightsCache / profile=forceRegenerate)、
//   judgment analyze は dedupGet 非経由のため本 TTL の影響を受けない。 price hero (現在値) も別 live 経路。
const _GET_COALESCE_TTL = 600_000; // 10min: coalesce + 競合 back-nav の panel 瞬時復元 (resultCacheRef と対称)

function _cloneJson(d) {
  if (d == null || typeof d !== 'object') return d;
  try {
    return typeof structuredClone === 'function' ? structuredClone(d) : JSON.parse(JSON.stringify(d));
  } catch {
    return JSON.parse(JSON.stringify(d));
  }
}

function dedupGet(url, { headers, ttl = _GET_COALESCE_TTL, timeoutMs = 0 } = {}) {
  const now = Date.now();
  const hit = _getCache.get(url);
  if (hit && now - hit.ts < ttl) {
    return hit.promise.then(_cloneJson);
  }
  const promise = (timeoutMs > 0
    ? fetchWithTimeout(url, { headers }, timeoutMs)
    : fetch(url, { headers })
  ).then((r) => {
    if (!r.ok) {
      const e = new Error(`HTTP ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return r.json();
  });
  // 失敗した entry は cache から外して retry 可能にする (identity guard で新しい entry を clobber しない)
  promise.catch(() => {
    if (_getCache.get(url)?.promise === promise) _getCache.delete(url);
  });
  _getCache.set(url, { ts: now, promise });
  return promise.then(_cloneJson);
}

export async function analyze(ticker) {
  // Phase 2.9 Sprint 3 #Pane3-perf: 30s timeout で永遠分析中を撲滅
  const r = await fetchWithTimeout(`/api/analyze/${encodeURIComponent(ticker)}`, {
    headers: fmpHeaders(),
  }, 30000);
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

/**
 * v118 ETF MVP: ETF Overview (AUM / TER / 1Y / Top 5 / Inception).
 * 404 → null (ticker 不存在 / profile 取れない)、 422 → null。
 */
export async function fetchEtfInfo(ticker) {
  const r = await fetchWithTimeout(`/api/etf-info/${encodeURIComponent(ticker)}`, {
    headers: fmpHeaders(),
  }, 15000);
  if (!r.ok) return null;
  return r.json();
}

// ETF 組入 (個別銘柄 → 主要 US ETF への組入比率、 v202 dogfood feature ?etf_exposure=1)
export async function fetchEtfExposure(ticker) {
  const r = await fetchWithTimeout(`/api/etf-exposure/${encodeURIComponent(ticker)}`, {
    headers: fmpHeaders(),
  }, 15000);
  if (!r.ok) return null;
  return r.json();
}

export async function searchTickers(q) {
  if (!q.trim()) return [];
  const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchGuidance(ticker) {
  // v144 #Pane3-perf: dedupGet 経由 (prefetch と coalesce)
  try {
    return await dedupGet(`/api/guidance/${encodeURIComponent(ticker)}`, { headers: fmpHeaders() });
  } catch {
    return null;
  }
}

export async function fetchGuidanceBasic(ticker) {
  // v144 #Pane3-perf: dedupGet 経由。 prefetchAll と runAnalyze の二重発火 (= loading gate) を 1 本化
  try {
    return await dedupGet(`/api/guidance/${encodeURIComponent(ticker)}/basic`, { headers: fmpHeaders() });
  } catch {
    return null;
  }
}

export async function fetchGuidanceSurprise(ticker) {
  // 案B v172: 会社 8-K ガイダンス vs consensus サプライズ (`with_guidance=1`)。 SEC fetch (cold 5-15s) を
  //   含むため prefetch せず、 ForwardOutlookSection mount 後に非ブロックで lazy fetch (loading gate 非律速)。
  //   URL が basic と異なるため dedupGet の cache key も分離される。
  try {
    return await dedupGet(`/api/guidance/${encodeURIComponent(ticker)}/basic?with_guidance=1`, {
      headers: fmpHeaders(),
      timeoutMs: 30000,
    });
  } catch {
    return null;
  }
}

export async function fetchInsights(ticker) {
  // v144 #Pane3-perf: insights は cold で 24-60s (KB→Claude or on-demand RSS)。
  //   prefetchAll と InsightsPanel の二重 LLM call を coalesce + 75s hard timeout で安全網。
  return dedupGet(`/api/insights/${encodeURIComponent(ticker)}`, { timeoutMs: 75000 });
}

// 決算ハイライト: アナリストコンセンサスの修正トレンド (drift)。consensus_snapshots (nightly 蓄積) から
// 直近 N 日でアナリスト予想 (EPS/売上) が引き上げ/引き下げされたかを **事実** として返す既存 endpoint。
// §38: backend は direction (up/down/mixed/flat) のみ、narration なし。snapshot 不足は insufficient/empty。
// dedupGet で coalesce、失敗/未蓄積は graceful (frontend が行ごと非表示)。
export async function fetchConsensusDrift(ticker) {
  try {
    return await dedupGet(`/api/analyst/consensus-drift?ticker=${encodeURIComponent(ticker)}&window_days=30`, {
      headers: fmpHeaders(),
      timeoutMs: 12000,
    });
  } catch {
    return null;
  }
}

// v144 #Pane3-perf: 「もう一度分析する」(refresh) 時に coalesce cache の stale entry を破棄し、
//   refresh 後の再ナビで古い insights が返らないようにする。
export function invalidateInsightsCache(ticker) {
  _getCache.delete(`/api/insights/${encodeURIComponent(ticker)}`);
}

export function prefetchGuidance(ticker) {
  fetch(`/api/guidance/${encodeURIComponent(ticker)}`, {
    headers: fmpHeaders(),
  }).catch(() => {});
}

export function prefetchAll(ticker) {
  const t = encodeURIComponent(ticker);
  // v144 #Pane3-perf: 各 helper (dedupGet 経由) を呼ぶことで、 後続の panel mount fetch と
  //   frontend cache を共有する。 これにより prefetch が「backend cache を温める」 だけでなく
  //   「component の mount fetch を 0ms 化」 する (= 二重〜三重 fetch 解消 + 体感 load 短縮)。
  // Judgment タブ上部 (analyze + ガイダンス用) — loading gate
  fetchGuidanceBasic(ticker).catch(() => {});
  // v173.9 (#2): full guidance (8-K = sec_guidance_text) も先取り。 AI要約は #3 修正でガイダンス確定まで
  //   生成を待つため、 8-K を ticker 選択時に analyze と並列開始 (旧: Phase1 完了後に逐次) → useJudgmentResult
  //   の fetchGuidance(Phase2) が dedupGet で coalesce → Phase2 確定が前倒し → AI要約 skeleton 待ち短縮。
  fetchGuidance(ticker).catch(() => {});
  // チャート系
  fetch(`/api/chart/${t}/summary`).catch(() => {}); // classic ChartTab 用 (Pane 3 未使用、 据置)
  fetchPriceHistory(ticker, '1y').catch(() => {});
  // v144: Pane 3 chart の technical overlay も先取り (StockPriceChart と同一 patterns 文字列で URL 一致)
  fetchTechnical(ticker, 'cup_handle,sma_50,sma_200,rs,dma_cross').catch(() => {});
  // 市場の声 (cold 時 24-60 秒かかるため最優先、 InsightsPanel と coalesce)
  fetchInsights(ticker).catch(() => {});
  // v40+: 残りパネル用 (news / ir-links / analyst)。 各 panel mount fetch と coalesce。
  fetchNews(ticker, 10).catch(() => {});
  fetchIRLinks(ticker).catch(() => {});
  fetchAnalyst(ticker).catch(() => {});
  // v192 (user dogfood 2026-06-09): 会社概要 AI要約 を prefetch に追加 (旧 must-fix #4「prefetchAll 不含」 を覆す)。
  //   会社概要 accordion は v5 で defaultOpen=false のため、 クリック時に初めて LLM fetch → 5秒待ち
  //   (user「読み飛ばしたくなる」)。 銘柄選択時に backend cache を温め、 開いた時 cache hit で即表示化。
  //   コスト: backend cache で 2回目以降無料 + 会社概要はファンダ分析の基本情報で閲覧率が高いため許容。
  fetchProfileSummary(ticker).catch(() => {});
}

export async function fetchScreener(category = 'gainers') {
  const r = await fetch(`/api/screener?category=${category}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

export async function fetchPriceHistory(ticker, period = '1y') {
  // v144 #Pane3-perf: dedupGet 経由 (prefetch '1y' と StockPriceChart の mount fetch を coalesce)
  try {
    return await dedupGet(`/api/price-history/${encodeURIComponent(ticker)}?period=${period}`, { headers: fmpHeaders() });
  } catch {
    return { prices: [], earnings: [] };
  }
}

// Cup-with-Handle Phase 1 (handover v75、 6 体合議 2026-05-17 B 案):
// テクニカル指標 (Cup-Handle / SMA 50/200 / RS) bulk 取得。
// 失敗時は空 overlays を返してチャート描画は継続 (graceful degrade)。
export async function fetchTechnical(ticker, patterns = 'cup_handle,sma_50,sma_200') {
  // v144 #Pane3-perf: dedupGet 経由 (prefetch と StockPriceChart の mount fetch を coalesce)
  try {
    return await dedupGet(`/api/technical/${encodeURIComponent(ticker)}?patterns=${patterns}&period=1y`);
  } catch {
    return { overlays: [], patterns: {} };
  }
}

// v65 §4-B-3: 1D sparkline 用の intraday (5 分足) 取得.
// 当日 NYSE セッションの ~78 点を返し、Pane 2/Header sparkline が直線化するのを回避.
export async function fetchPriceIntraday(ticker) {
  const r = await fetch(`/api/price-intraday/${encodeURIComponent(ticker)}`);
  if (!r.ok) return { prices: [] };
  return r.json();
}

async function postSummary(path, analysis, guidance) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysis, guidance }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

export function fetchSummaryBrief(analysis, guidance) {
  return postSummary('/api/summary/brief', analysis, guidance);
}

export async function streamSummaryBrief(analysis, guidance, onChunk, signal) {
  const r = await fetch('/api/summary/brief/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysis, guidance }),
    signal,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${r.status}`);
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}

export function fetchSummaryDetail(analysis, guidance) {
  return postSummary('/api/summary/detail', analysis, guidance);
}

export async function streamSummaryDetail(analysis, guidance, onChunk, signal) {
  const r = await fetch('/api/summary/detail/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysis, guidance }),
    signal,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${r.status}`);
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}

export async function streamConferenceText(ticker, onChunk, signal) {
  const r = await fetch(`/api/conference/text/stream/${encodeURIComponent(ticker)}`, {
    headers: fmpHeaders(),
    signal,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${r.status}`);
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}

export async function fetchConferenceAnalysis(ticker) {
  const r = await fetch(`/api/conference/${encodeURIComponent(ticker)}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

export async function fetchCalendar(days = 90, watchlist = '') {
  const wl = watchlist ? `&watchlist=${encodeURIComponent(watchlist)}` : '';
  const r = await fetch(`/api/calendar?days=${days}${wl}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    const detail = Array.isArray(err.detail)
      ? (err.detail[0]?.msg ?? JSON.stringify(err.detail))
      : err.detail;
    throw new Error(detail || `HTTP ${r.status}`);
  }
  return r.json();
}

export async function fetchNews(ticker, limit = 10) {
  // v144 #Pane3-perf: dedupGet 経由 (prefetch と NewsPanel の mount fetch を coalesce)
  try {
    return await dedupGet(`/api/news/${encodeURIComponent(ticker)}?limit=${limit}`, { headers: fmpHeaders() });
  } catch {
    return [];
  }
}

// v41 Phase 3: マクロ・地政学的なマーケット全体ニュース (Today's Brief)
// /api/news/{ticker} との衝突を避けて /api/macro-news を使用
export async function fetchMacroNews() {
  const r = await fetch('/api/macro-news', { headers: fmpHeaders() });
  if (!r.ok) return { items: [], updated_at: null };
  return r.json();
}

// v41 Y-1: 経済指標カレンダー (FOMC / CPI / NFP 等)
// days=7 で 7 日先まで、impact='high' で重要指標のみフィルタ
export async function fetchEconomicCalendar(days = 7, impact = null) {
  const params = new URLSearchParams();
  if (days) params.set('days', String(days));
  if (impact) params.set('impact', impact);
  const r = await fetch(`/api/economic-calendar?${params.toString()}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) return { events: [], updated_at: null };
  return r.json();
}

export async function translateTexts(texts, { signal } = {}) {
  // v101 Sprint B-abort (multi-review Frontend Architect + 実装 verdict):
  //   signal を optional 引数で受け、 fetch に渡すことで AbortController による
  //   in-flight cancellation を実現。 Pane4Inspector cleanup で abort 動作するように。
  const r = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
    signal,
  });
  if (!r.ok) throw new Error('translate failed');
  const data = await r.json();
  return data.translations;
}

// SSE 翻訳: 各 (index, translation) を onItem コールバックで逐次受け取る。
// onItem(index, translation) は texts 配列における 0-indexed の位置に対応。
// 完了で resolve、エラーで reject。
export async function translateTextsStream(texts, onItem, signal) {
  const r = await fetch('/api/translate/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
    signal,
  });
  if (!r.ok || !r.body) throw new Error('translate stream failed');

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sepIdx;
    while ((sepIdx = buf.indexOf('\n\n')) !== -1) {
      const event = buf.slice(0, sepIdx);
      buf = buf.slice(sepIdx + 2);
      const line = event.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const payload = line.slice(6);
      if (payload === '[DONE]') return;
      try {
        const obj = JSON.parse(payload);
        if (obj && typeof obj.error === 'string') {
          throw new Error(obj.error);
        }
        if (obj && typeof obj.index === 'number' && typeof obj.translation === 'string') {
          onItem(obj.index, obj.translation);
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
}

// 複数銘柄の現在価格を一括取得 (Holdings 損益バッジ + ポートフォリオ用)
// 戻り値: { quotes: [{ symbol, price, change_pct, change, previous_close }, ...], market_open: bool }
export async function fetchQuotes(symbols) {
  const list = Array.isArray(symbols) ? symbols : [];
  if (list.length === 0) return { quotes: [], market_open: false };
  const params = new URLSearchParams({ symbols: list.join(',') });
  const r = await fetch(`/api/quotes?${params.toString()}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) return { quotes: [], market_open: false };
  return r.json();
}

// Y-3 Phase A: 通知のテスト送信 (実送信なし、log のみ)。
// channel: 'email' | 'line' | 'webhook'
// 戻り値: { ok, channel, status, message } | { error }
export async function sendNotificationTest(supabase, channel) {
  if (!supabase) throw new Error('Supabase client missing');
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('ログインが必要です');
  const r = await fetch('/api/notifications/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...fmpHeaders(),
    },
    body: JSON.stringify({ channel }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);
  return data;
}

// Y-3 Phase A: 直近の通知ログを取得 (テスト送信履歴の確認用)
export async function fetchRecentNotificationLog(supabase, limit = 10) {
  if (!supabase) return { logs: [] };
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { logs: [] };
  const params = new URLSearchParams({ limit: String(limit) });
  const r = await fetch(`/api/notifications/recent-log?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, ...fmpHeaders() },
  });
  if (!r.ok) return { logs: [] };
  return r.json();
}

// v104 release MVP: SEC EDGAR 10-K (年次報告書) filings リスト取得。
// 完全無料 (SEC EDGAR User-Agent のみ)、 backend 12h cache。
// 戻り値: { ticker, items: [{ date, title: "10-K", url }, ...] } | null
export async function fetchTenK(ticker, limit = 5) {
  const t = (ticker || '').toUpperCase();
  if (!t) return null;
  const params = new URLSearchParams({ limit: String(limit) });
  const r = await fetch(`/api/filings/10k/${encodeURIComponent(t)}?${params.toString()}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) return null;
  return r.json();
}

// 四半期決算履歴を取得 (Pro 同梱機能)。
// 戻り値: { ticker, history: [{ date, fiscal_period, eps_actual, eps_estimated,
//   eps_surprise_pct, eps_verdict, revenue_actual, revenue_estimated,
//   revenue_surprise_pct, revenue_verdict }, ...] }
export async function fetchQuarterlyHistory(ticker, limit = 8) {
  const t = (ticker || '').toUpperCase();
  if (!t) return null;
  const params = new URLSearchParams({ limit: String(limit) });
  // v199 flash summary (6体合議 設計/qa 条件): dedupGet 経由。 useEpsBeatStreak / QuarterlyHistoryTable /
  // EarningsFlashSummary の同 URL fetch を coalesce (旧: 素 fetch で同 view 内 二〜三重 fetch)。
  // 失敗時 null の旧シグネチャは維持 (呼出側の !res 分岐を壊さない)。
  try {
    return await dedupGet(`/api/guidance/${encodeURIComponent(t)}/quarterly-history?${params.toString()}`, {
      headers: fmpHeaders(),
    });
  } catch {
    return null;
  }
}

// ロット履歴から日次ポートフォリオ評価額の時系列を取得 (X-2-5-C HistoryChart)。
// body: { lots: [{ ticker, shares, trade_date }, ...], period: "1m"|"3m"|"6m"|"1y"|"3y" }
// 戻り値: { series: [{ date, value, cashflow }, ...], from, to, period }
// §11-D Fix: Supabase JWT を Authorization で送信 (backend で認証必須化、Web 開発 agent #4)
export async function fetchPortfolioHistory(lots, period = '1y') {
  const list = Array.isArray(lots) ? lots : [];
  if (list.length === 0) return { series: [], period };
  const headers = { 'Content-Type': 'application/json', ...fmpHeaders() };
  // 動的 import で循環依存回避 (supabase.js は ESM top-level で読み込み済み)
  try {
    const { supabase } = await import('./lib/supabase.js');
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch { /* noop: 未ログイン or supabase 未初期化時はそのまま投げる (backend で 401) */ }
  const r = await fetch('/api/portfolio-history', {
    method: 'POST',
    headers,
    body: JSON.stringify({ lots: list, period }),
  });
  if (!r.ok) return { series: [], period };
  return r.json();
}

// Phase A v69 §2: 期間連動 portfolio performance (Modified Dietz + AI 1 文サマリー)
// 戻り値: { period, from, to, start_value, end_value, net_cashflow, weighted_cashflow,
//          pnl_abs, pnl_pct, method, ai_summary, ai_summary_error, top_ticker, top_contribution }
// 認証必須 (Supabase JWT)、未ログイン or 0 transactions は呼ばない (上位で guard)
export async function fetchPortfolioPerformance(transactions, period = '1m') {
  const list = Array.isArray(transactions) ? transactions : [];
  if (list.length === 0) return null;
  const headers = { 'Content-Type': 'application/json', ...fmpHeaders() };
  try {
    const { supabase } = await import('./lib/supabase.js');
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch { /* noop: 未ログイン or supabase 未初期化時はそのまま投げる (backend で 401) */ }
  try {
    const r = await fetch('/api/portfolio-performance', {
      method: 'POST',
      headers,
      body: JSON.stringify({ transactions: list, period }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// 株式分割検出: 指定銘柄の指定日近辺における close vs adjClose の比を取得。
// 戻り値: { ticker, results: [{ date, matched_date, close, adjClose, ratio }] }
// ratio < 0.99 = 当該日以降に分割あり → lot price を ratio 倍に補正すべき。
export async function fetchSplitCheck(ticker, dates) {
  const t = (ticker || '').toUpperCase();
  const list = Array.isArray(dates) ? dates.filter(Boolean) : [];
  if (!t || list.length === 0) return { ticker: t, results: [] };
  const params = new URLSearchParams({ dates: list.join(',') });
  const r = await fetch(`/api/split-check/${encodeURIComponent(t)}?${params.toString()}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) return { ticker: t, results: [] };
  return r.json();
}

// 保有銘柄の付加メタ (次回決算日 / days_to_earnings)
// 戻り値: { meta: { [SYMBOL]: { next_earnings_date, days_to_earnings } } }
export async function fetchHoldingsMeta(symbols) {
  const list = Array.isArray(symbols) ? symbols : [];
  if (list.length === 0) return { meta: {} };
  const params = new URLSearchParams({ symbols: list.join(',') });
  const r = await fetch(`/api/holdings-meta?${params.toString()}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) return { meta: {} };
  return r.json();
}

// Phase 1.5 v68: 保有銘柄の 5 条件 PASS/FAIL 一括取得 (じっちゃまプロトコル)
// 戻り値: { verdicts: { [SYMBOL]: {overallPass, passedCount, totalCount, conditions, ...} | null }, errors: {} }
export async function fetchPortfolioJudgment(symbols) {
  const list = Array.isArray(symbols) ? symbols : [];
  if (list.length === 0) return { verdicts: {}, errors: {} };
  const params = new URLSearchParams({ symbols: list.join(',') });
  const r = await fetch(`/api/portfolio-judgment?${params.toString()}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) return { verdicts: {}, errors: {} };
  return r.json();
}

// handover v68 §2 #2: 為替レート (USD/JPY 最小実装、Stripe/Wise 方式の凍結書き込み用)
// 戻り値: { base, quote, date, rate, source } or { ..., rate: null, error }
// 6h cache (backend 側) + yfinance USDJPY=X 経由
export async function fetchForexRate(base = 'USD', quote = 'JPY', date = null) {
  const params = new URLSearchParams({ base: String(base).toUpperCase(), quote: String(quote).toUpperCase() });
  if (date) params.set('date', String(date));
  try {
    const r = await fetch(`/api/forex-rate?${params.toString()}`, { headers: fmpHeaders() });
    if (!r.ok) return { base, quote, date, rate: null, error: 'http' };
    return r.json();
  } catch {
    return { base, quote, date, rate: null, error: 'network' };
  }
}

// handover v68 §2 #1: 配当 UI auto-fill 用に銘柄の過去配当履歴を取得
// 戻り値: { ticker: "AAPL", dividends: [{date, amount, paymentDate, recordDate}, ...] }
// 24h cache (backend 側)、配当データは historical immutable なので保守的に長め
export async function fetchHistoricalDividends(ticker, options = {}) {
  const sym = String(ticker || '').trim().toUpperCase();
  if (!sym) return { ticker: '', dividends: [] };
  const params = new URLSearchParams();
  if (options.since) params.set('since', String(options.since));
  if (Number.isFinite(options.limit)) params.set('limit', String(options.limit));
  const qs = params.toString();
  const url = `/api/historical-dividends/${encodeURIComponent(sym)}${qs ? `?${qs}` : ''}`;
  try {
    const r = await fetch(url, { headers: fmpHeaders() });
    if (!r.ok) return { ticker: sym, dividends: [] };
    return r.json();
  } catch {
    return { ticker: sym, dividends: [] };
  }
}

export async function fetchMarketIndices() {
  const r = await fetch('/api/market-indices', {
    headers: fmpHeaders(),
  });
  if (!r.ok) return [];
  return r.json();
}

/**
 * v120 RS Screener Phase 1 (user 提案、 金融 sub-agent CONDITIONAL PASS verdict):
 * William O'Neil CAN SLIM の L (Leader/RS≥80) screener.
 * 既存 _compute_rs() を SP500 universe で集約、 nightly batch + Supabase 永続化。
 *
 * @param {number} [minPercentile=80] - universe_percentile の下限 (1-99)
 * @param {number} [limit=50] - 取得件数 上限
 * @returns {Promise<{universe_size, calc_date, min_percentile, items: [{ticker, rs_vs_spy_pct, universe_percentile, self_percentile, period_months}]}>}
 */
export async function fetchRsScanner(minPercentile = 80, limit = 50) {
  const url = `/api/scanner/rs?min_percentile=${minPercentile}&limit=${limit}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.json();
}

/**
 * Phase 2 Sprint 4: C 条件 (四半期 EPS YoY%) スキャナー fetch。
 * backend `/api/scanner/canslim` (DB SELECT only、 認証なし = free) を叩き、
 * 達成銘柄 `items` と 3 状態 count を返す。
 *
 * - min_pct は整数で渡す (cache key 安定: ?min_pct=18 で固定)。
 * - `items` key (cup/rs と統一済)。
 * - `note` フィールドは開発者向け内部文言のため frontend では使用しない。
 * - null 返却時: 達成 0 件 / 未達 0 件 / データなし 0 件 として graceful degradation。
 *
 * @param {number} [minPct=18] - 閾値の下限 (整数)
 * @param {string} [condition='eps_yoy'] - 条件キー。S4b で backend が全条件を read 公開:
 *        eps_yoy(C) / eps_cagr(A) / roe(A) / near_high(N) / buyback(S) / volume_surge(S)。
 *        frontend は現状 eps_yoy のみ配線 (A/N/S の UI は S5 で追加予定)。
 * @returns {Promise<{as_of, total_count, failed_count, excluded_count, uncomputable_count, unavailable_count, condition, min_pct, items}|null>}
 */
export async function fetchCanslimScanner(minPct = 18, condition = 'eps_yoy') {
  const url = `/api/scanner/canslim?condition=${encodeURIComponent(condition)}&min_pct=${Math.round(minPct)}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.json();
}

/**
 * Phase 3 Sprint 5b: rows endpoint — 結果セット ticker 群の C/A/N/S 全値 + null_reasons を 1 回で取得。
 * 単一条件 read (fetchCanslimScanner) は「達成銘柄」しか返さず per-ticker の null 理由を引けない問題を解消。
 * DB SELECT only (認証なし = free)、ticker 最大 200 件。DB に無い ticker は rows に含まれない
 * (frontend は optional chaining で graceful)。null_reasons は nightly populate 後に実値
 * (それまで null → frontend 側で「データ取得中」fallback)。
 *
 * @param {string[]} tickers - 対象 ticker 群。空配列なら fetch せず空を返す。
 * @returns {Promise<{as_of: string|null, rows: { [TICKER]: { eps_yoy_pct, eps_cagr_3y, roe, near_high_pct_scaled, buyback_yield_pct, volume_surge_pct, turnaround, null_reasons } }}>}
 */
export async function fetchCanslimRows(tickers) {
  const list = Array.isArray(tickers) ? tickers.filter(Boolean).slice(0, 200) : [];
  if (list.length === 0) return { as_of: null, rows: {} };
  const url = `/api/scanner/canslim/rows?tickers=${encodeURIComponent(list.join(','))}`;
  const r = await fetch(url);
  if (!r.ok) return { as_of: null, rows: {} };
  return r.json();
}

// v159 SPEC_2026-06-03 Part B: スクリーナ結果の client-side 絞り込み (セクター / 時価総額) 用メタ。
// universe 全銘柄の { sector, mcapBand } を 24h cache backend から 1 回取得 → map 化して ticker join。
// 返り値: { asOf: epoch, count, meta: { TICKER: { sector, mcapBand: 'mega'|'mid'|'small' } } }
export async function fetchUniverseMeta() {
  const r = await fetch('/api/screener/universe-meta');
  if (!r.ok) return { asOf: 0, count: 0, meta: {} };
  return r.json();
}

/**
 * v120 Task 3: Follow-Through Day (William O'Neil 理論) を主要 index で検出.
 * Phase 1: 主要 3 index (^GSPC / ^NDX / ^DJI)、 Pane 1 マクロ section に chip 表示.
 *
 * @param {string} index - '^GSPC' / '^NDX' / '^DJI' (URL encode 内部処理)
 * @returns {Promise<{index, label_ja, status, ftd_day_number, ftd_date, ftd_pct, rally_attempt_date, updated_at}>}
 *          status: 'ftd_confirmed' | 'watching' | 'no_attempt' | 'insufficient_data' | 'error'
 */
export async function fetchFollowThroughDay(index) {
  const encoded = encodeURIComponent(index);
  const r = await fetch(`/api/follow-through-day/${encoded}`);
  if (!r.ok) return null;
  return r.json();
}

// Workspace Home Phase 2: 注目銘柄 Top 5 (急騰/急落).
// /api/movers は { gainers: [], losers: [], updated_at } を返す。
// 各 mover: { ticker, price, pct, direction, keyword?, source_url? }
export async function fetchMovers() {
  const r = await fetch('/api/movers');
  if (!r.ok) return { gainers: [], losers: [], updated_at: null };
  return r.json();
}

export async function fetchMarketStatus() {
  const r = await fetch('/api/market-status');
  if (!r.ok) return null;
  return r.json();
}

export async function fetchNewsBulk(tickers, limitPerTicker = 5) {
  if (!Array.isArray(tickers) || tickers.length === 0) return { items: [] };
  const r = await fetch('/api/news/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...fmpHeaders() },
    body: JSON.stringify({ tickers, limit_per_ticker: limitPerTicker }),
  });
  if (!r.ok) return { items: [] };
  return r.json();
}

// v71 Phase 3-c: Pane 3 events lane の bulk fetch (ex-div + 8-K filings)
// 戻り値: { items: [{ ticker, ex_dividends: [...], filings_8k: [...] }, ...] }
export async function fetchPortfolioEvents(tickers, opts = {}) {
  if (!Array.isArray(tickers) || tickers.length === 0) return { items: [] };
  const body = {
    tickers,
    lookback_days: opts.lookbackDays ?? 30,
    filings_limit: opts.filingsLimit ?? 5,
  };
  const r = await fetch('/api/portfolio-events/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...fmpHeaders() },
    body: JSON.stringify(body),
  });
  if (!r.ok) return { items: [] };
  return r.json();
}

export async function fetchIRLinks(ticker) {
  // v144 #Pane3-perf: dedupGet 経由 (prefetch と IRLinksPanel の mount fetch を coalesce)
  try {
    return await dedupGet(`/api/ir-links/${encodeURIComponent(ticker)}`, { headers: fmpHeaders() });
  } catch {
    return null;
  }
}

/**
 * Phase A 会社概要静的拡張 (SPEC_2026-05-21 §5-4)
 * FMP /profile + /stock-peers の static data を返す。LLM 不使用。
 * @returns {{ ticker, companyName, description, image, city, state, country,
 *             fullTimeEmployees, sector, industry, mktCap, peers }} | null
 */
export async function fetchProfileExtended(ticker, { signal } = {}) {
  // Phase 2.6 Evaluator FAIL-3 hotfix: AbortController signal を fetch に伝播、
  // ProfileCard の useEffect cleanup で race condition (古い response 上書き) 防止
  // Phase 2.9 Sprint G3 真因 fix: logged-in user は Authorization header を付けて
  // backend に「demo rate limit 免除」 を伝える。 shared supabase singleton (lib/supabase.js)
  // を dynamic import (tree-shake 安全、 test 環境で supabase 未設定でも fallback)。
  let authHeader = {};
  try {
    const { supabase } = await import('./lib/supabase.js');
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) authHeader = { Authorization: `Bearer ${token}` };
    }
  } catch { /* unauthenticated / supabase 未設定 は OK、 demo 経路に fallback */ }
  const r = await fetch(`/api/profile-extended/${encodeURIComponent(ticker)}`, {
    headers: { ...authHeader, ...fmpHeaders() },
    signal,
  });
  if (!r.ok) {
    // Phase 2.9 Sprint 5 #profile-extended-fallback: rate limit / 失敗時は status + detail を expose
    // 旧: return null → ProfileCard が silent fail で全 description / metadata 消失
    // 新: { _error: { status, detail } } を返し、 UI 側で「demo 回数超過」 等の親切表示
    let detail = null;
    try { detail = (await r.json())?.detail || null; } catch { /* JSON parse fail OK */ }
    return { _error: { status: r.status, detail } };
  }
  return r.json();
}

/**
 * Phase B: LLM 和文要約 (SPEC_2026-05-22 §5 Sprint B.1)
 *
 * FMP 英文 description を Claude Haiku で和文 4 セクション要約に変換する。
 * LLM 呼び出しは backend /api/profile-summary/{ticker} 経由。
 *
 * must-fix #5: AbortController + 30s timeout 対応。
 * ProfileCard.jsx の useEffect cleanup で ac.abort() を呼ぶこと。
 *
 * must-fix #4: prefetchAll に含めない (ProfileCard mount 時に lazy fetch)。
 *
 * エラー時は { _error: { status, detail } } を返す (Sprint 5 の profile-extended pattern と同 SOP)。
 *
 * @param {string} ticker
 * @param {{ signal?: AbortSignal, forceRegenerate?: boolean }} options
 * @returns {Promise<object>}
 */
export async function fetchProfileSummary(ticker, { signal, forceRegenerate = false } = {}) {
  const t = encodeURIComponent(ticker);
  const qs = forceRegenerate ? '?force_regenerate=true' : '';
  // 30s タイムアウト (永遠ハング防止)
  const innerController = new AbortController();
  const timer = setTimeout(() => innerController.abort(), 30000);
  // Phase 2.9 Sprint G4: logged-in user は Authorization header 添付で
  // backend に「demo rate limit 免除」 を伝える (fetchProfileExtended と同 pattern)
  let authHeader = {};
  try {
    const { supabase } = await import('./lib/supabase.js');
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) authHeader = { Authorization: `Bearer ${token}` };
    }
  } catch { /* unauthenticated / supabase 未設定 は demo 経路 fallback */ }
  try {
    const r = await fetch(`/api/profile-summary/${t}${qs}`, {
      headers: { ...authHeader, ...fmpHeaders() },
      // 外部 AbortSignal (ProfileCard useEffect cleanup) を優先
      signal: signal || innerController.signal,
    });
    clearTimeout(timer);
    if (!r.ok) {
      let detail = null;
      try { detail = (await r.json())?.detail || null; } catch { /* JSON parse fail OK */ }
      return { _error: { status: r.status, detail } };
    }
    return r.json();
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      // AbortError は呼出側で無視 (race condition cleanup の正常動作)
      throw err;
    }
    return { _error: { status: 0, detail: 'ネットワークエラー' } };
  }
}

export async function fetchCustomScreener() {
  const r = await fetch('/api/custom-screener', {
    headers: fmpHeaders(),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

// v97 Phase 3 (金融 sub-agent verdict): 自社 + peer 5 銘柄の 4 指標 (YTD/GM/FCF Margin/R&D%)
// + 中央値を fetch。 Bloomberg Terminal 級競合比較 Tab 用。
// Trust Cliff: 全数値 source citation 付き、 LLM 一切介在せず純粋 FMP 数値。
export async function fetchProfilePeers(ticker, { signal } = {}) {
  let authHeader = {};
  try {
    const { supabase } = await import('./lib/supabase.js');
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) authHeader = { Authorization: `Bearer ${token}` };
    }
  } catch { /* unauthenticated OK、 demo 経路 */ }
  const r = await fetch(`/api/profile-peers/${encodeURIComponent(ticker)}`, {
    headers: { ...authHeader, ...fmpHeaders() },
    signal,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    return { _error: { status: r.status, detail: err.detail || `HTTP ${r.status}` } };
  }
  return r.json();
}

// v108 議題 5A (multi-review 5/5 verdict 「release 前 mandatory」):
// Forward P/E + PEG + 配当性向 + Buyback 比率 — 投資判断 KPI 補完。
// 純数値層 (LLM 一切介在せず)、 12h cache、 sources schema で per-source 監視。
// 金商法 §38 / 景表法 §5 配慮で narration / 警告 chip なし、 数値のみ返却。
export async function fetchValuationExtras(ticker, { signal } = {}) {
  let authHeader = {};
  try {
    const { supabase } = await import('./lib/supabase.js');
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) authHeader = { Authorization: `Bearer ${token}` };
    }
  } catch { /* unauthenticated OK */ }
  const r = await fetch(`/api/valuation-extras/${encodeURIComponent(ticker)}`, {
    headers: { ...authHeader, ...fmpHeaders() },
    signal,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    return { _error: { status: r.status, detail: err.detail || `HTTP ${r.status}` } };
  }
  return r.json();
}

// Cup-with-Handle Phase 2.4 (handover v79 後継、 multi-review verdict):
// ファンダ 5 PASS × Cup-Handle AND scanner。 Free user は backend で payload mask
// (Security verdict)、 visible_count + total_count + is_premium を返す。
export async function fetchCupHandleScanner(filter = 'both') {
  const headers = { ...fmpHeaders() };
  try {
    const { supabase } = await import('./lib/supabase.js');
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch { /* 未ログイン時は Authorization 無し = Free 扱い */ }
  const r = await fetch(`/api/scanner/cup-handle?filter=${encodeURIComponent(filter)}`, {
    headers,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

export async function validateFmpKey(apiKey) {
  const r = await fetch('/api/validate-fmp-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
  if (!r.ok) return { valid: false, error: 'リクエストに失敗しました' };
  return r.json();
}

// v142 フィードバック収集 (動画教訓 #2、 pre-release ユーザーの声)。
// ログイン時は Authorization header を付与 → backend が user_id + email を解決。
export async function submitFeedback({ category = 'other', body, page_path = null, email = null }) {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const { supabase } = await import('./lib/supabase.js');
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  } catch { /* 未ログイン時は Authorization 無し = 匿名扱い */ }
  const r = await fetch('/api/feedback', {
    method: 'POST',
    headers,
    body: JSON.stringify({ category, body, page_path, email }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

export async function demoAnalyze(ticker) {
  // Phase 2.9 Sprint 3 #Pane3-perf: demoAnalyze にも 30s timeout (analyze と同 SOP)
  const r = await fetchWithTimeout(`/api/demo/analyze/${encodeURIComponent(ticker)}`, {}, 30000);
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

export async function generateVisualization(ticker, analysisData, years = 3) {
  const response = await fetch(`/api/visualize/${ticker}?years=${years}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis_data: analysisData }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function generateVisualizationInstant(ticker, analysisData, years = 3) {
  const response = await fetch(`/api/visualize-instant/${ticker}?years=${years}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis_data: analysisData }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export const fetchAnalystData = async (ticker) => {
  const res = await fetch(`/api/analyst/${ticker}`);
  if (!res.ok) return null;
  return await res.json();
};

/**
 * handover v82 Phase 5 (三層トリアージ) 用 fetcher.
 *
 * Returns:
 *   {
 *     ticker, sources: {holdings, pattern_signals, peers},
 *     signal_quality: {source, confidence, ...},
 *     data: {
 *       holdings: {owns, shares} | null,
 *       pattern_signals: {state, state_label, signal_date} | null,
 *       peers: {passing_count} | null,
 *     },
 *   }
 *
 * Supabase session の access_token を自動取得して Authorization に attach。
 * 未ログイン user / token 取得失敗時は null を返す (frontend で banner 非表示)。
 */
export async function fetchTriage(ticker, supabaseClient, minPass = 5) {
  if (!supabaseClient) return null;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const token = session?.access_token;
    if (!token) return null;
    const r = await fetch(
      `/api/triage/${encodeURIComponent(ticker)}?min_pass=${minPass}`,
      {
        headers: {
          ...fmpHeaders(),
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

/**
 * handover v82 Phase 3 (analyst-view) 新 schema 用 fetcher.
 *
 * Returns:
 *   {
 *     ticker, sources: {analyst_estimates, grades, price_target},
 *     signal_quality: {source, confidence, freshness_days, consensus_count},
 *     precomputed_metrics: {
 *       rating_consensus, rating_distribution, target_upside_pct,
 *       target_range, recent_changes,
 *     },
 *     top_5_changes: [{date, firm, action, previous_grade, new_grade, target_price}],
 *     raw: {price_target, analyst_estimates_latest},
 *   }
 *
 * 旧 `fetchAnalystData` は deprecate (削除は別 PR で安全に)。 新 component は本 fetcher を使う。
 */
export async function fetchAnalyst(ticker) {
  // v144 #Pane3-perf: dedupGet 経由。 prefetch + AnalystPanel + StockPriceChart の三重 fetch を 1 本化
  try {
    return await dedupGet(`/api/analyst/${encodeURIComponent(ticker)}`, { headers: fmpHeaders() });
  } catch {
    return null;
  }
}
