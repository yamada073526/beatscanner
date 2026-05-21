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

export async function searchTickers(q) {
  if (!q.trim()) return [];
  const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchGuidance(ticker) {
  const r = await fetch(`/api/guidance/${encodeURIComponent(ticker)}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) return null;
  return r.json();
}

export async function fetchGuidanceBasic(ticker) {
  const r = await fetch(`/api/guidance/${encodeURIComponent(ticker)}/basic`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) return null;
  return r.json();
}

export function prefetchGuidance(ticker) {
  fetch(`/api/guidance/${encodeURIComponent(ticker)}`, {
    headers: fmpHeaders(),
  }).catch(() => {});
}

export function prefetchAll(ticker) {
  const t = encodeURIComponent(ticker);
  // Judgment タブ上部 (analyze + ガイダンス用)
  fetch(`/api/guidance/${t}/basic`, { headers: fmpHeaders() }).catch(() => {});
  // チャート系
  fetch(`/api/chart/${t}/summary`).catch(() => {});
  fetch(`/api/price-history/${t}?period=1y`, { headers: fmpHeaders() }).catch(() => {});
  // 市場の声 (cold 時 60 秒かかるため最優先)
  fetch(`/api/insights/${t}`).catch(() => {});
  // v40+: Judgment タブの残りパネル用 (news / ir-links / analyst) を先取り。
  //   各 panel が mount 後に個別 fetch していたものを並列化。
  //   合計プリフェッチ 7 endpoints — fire-and-forget なので帯域以外のコストなし。
  fetch(`/api/news/${t}?limit=10`, { headers: fmpHeaders() }).catch(() => {});
  fetch(`/api/ir-links/${t}`, { headers: fmpHeaders() }).catch(() => {});
  fetch(`/api/analyst/${t}`).catch(() => {});
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
  const r = await fetch(`/api/price-history/${encodeURIComponent(ticker)}?period=${period}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) return { prices: [], earnings: [] };
  return r.json();
}

// Cup-with-Handle Phase 1 (handover v75、 6 体合議 2026-05-17 B 案):
// テクニカル指標 (Cup-Handle / SMA 50/200 / RS) bulk 取得。
// 失敗時は空 overlays を返してチャート描画は継続 (graceful degrade)。
export async function fetchTechnical(ticker, patterns = 'cup_handle,sma_50,sma_200') {
  const r = await fetch(`/api/technical/${encodeURIComponent(ticker)}?patterns=${patterns}&period=1y`);
  if (!r.ok) return { overlays: [], patterns: {} };
  return r.json();
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
  const r = await fetch(`/api/news/${encodeURIComponent(ticker)}?limit=${limit}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) return [];
  return r.json();
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

export async function translateTexts(texts) {
  const r = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
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

// 四半期決算履歴を取得 (Pro 同梱機能)。
// 戻り値: { ticker, history: [{ date, fiscal_period, eps_actual, eps_estimated,
//   eps_surprise_pct, eps_verdict, revenue_actual, revenue_estimated,
//   revenue_surprise_pct, revenue_verdict }, ...] }
export async function fetchQuarterlyHistory(ticker, limit = 8) {
  const t = (ticker || '').toUpperCase();
  if (!t) return null;
  const params = new URLSearchParams({ limit: String(limit) });
  const r = await fetch(`/api/guidance/${encodeURIComponent(t)}/quarterly-history?${params.toString()}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) return null;
  return r.json();
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
  const r = await fetch(`/api/ir-links/${encodeURIComponent(ticker)}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) return null;
  return r.json();
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
  const r = await fetch(`/api/profile-extended/${encodeURIComponent(ticker)}`, {
    headers: fmpHeaders(),
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
  try {
    const r = await fetch(`/api/profile-summary/${t}${qs}`, {
      headers: fmpHeaders(),
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
  const r = await fetch(`/api/analyst/${encodeURIComponent(ticker)}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) return null;
  return r.json();
}
