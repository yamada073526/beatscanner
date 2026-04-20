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

export async function fetchCalendar(days = 14) {
  const r = await fetch(`/api/calendar?days=${days}`, {
    headers: fmpHeaders(),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${r.status}`);
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
