import { getFmpKey } from './lib/fmpKey.js';

function fmpHeaders() {
  const key = getFmpKey();
  return key ? { 'X-FMP-Api-Key': key } : {};
}

export async function analyze(ticker) {
  const r = await fetch(`/api/analyze/${encodeURIComponent(ticker)}`, {
    headers: fmpHeaders(),
  });
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

export async function fetchMarketIndices() {
  const r = await fetch('/api/market-indices', {
    headers: fmpHeaders(),
  });
  if (!r.ok) return [];
  return r.json();
}

export async function fetchIRLinks(ticker) {
  const r = await fetch(`/api/ir-links/${encodeURIComponent(ticker)}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) return null;
  return r.json();
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
  const r = await fetch(`/api/demo/analyze/${encodeURIComponent(ticker)}`);
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
