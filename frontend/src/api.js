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

export async function generateVisualization(ticker, analysisData) {
  const response = await fetch(`/api/visualize/${ticker}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis_data: analysisData }),
  });
  const json = await response.json();

  const passColor = json.overallPass ? "#16a34a" : "#dc2626";
  const passBg = json.overallPass ? "#f0fdf4" : "#fef2f2";
  const passLabel = json.overallPass ? "PASS" : "FAIL";

  const conditionCards = (json.conditions || []).map(c => `
    <div style="background:${c.pass ? "#f0fdf4" : "#fef2f2"};border:1px solid ${c.pass ? "#bbf7d0" : "#fecaca"};border-radius:10px;padding:14px;min-width:0;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
        <span style="font-size:18px">${c.pass ? "✅" : "❌"}</span>
        <span style="font-size:12px;font-weight:700;color:#374151">${c.name}</span>
      </div>
      <div style="font-size:20px;font-weight:800;color:${c.pass ? "#16a34a" : "#dc2626"}">${c.value || "-"}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px">${c.detail || ""}</div>
    </div>
  `).join("");

  const trendSections = (json.trends || []).map(t => {
    const bars = (t.data || []).map((d, i, arr) => {
      const values = arr.map(x => x.value);
      const minVal = Math.min(...values);
      const maxVal = Math.max(...values);
      const range = maxVal - minVal || 1;
      const pct = Math.round(((d.value - minVal) / range) * 70) + 10;
      const isUp = i === 0 || d.value >= arr[i-1]?.value;
      const estimateLabel = d.estimate != null
        ? `<div style="font-size:10px;color:#6b7280;margin-top:1px">予想: ${d.estimate}${t.unit}</div>`
        : '';
      const beatBadge = d.beat === true
        ? `${estimateLabel}<div style="font-size:10px;color:#16a34a;font-weight:700;margin-top:1px">▲BEAT</div>`
        : d.beat === false
        ? `${estimateLabel}<div style="font-size:10px;color:#dc2626;font-weight:700;margin-top:1px">▼MISS</div>`
        : '';
      return `
        <div style="flex:1;text-align:center">
          <div style="font-size:11px;color:#9ca3af;margin-bottom:4px">${d.period}</div>
          <div style="height:60px;display:flex;align-items:flex-end;justify-content:center;margin-bottom:4px">
            <div style="width:36px;height:${pct}%;background:${isUp ? "#22c55e" : "#ef4444"};border-radius:4px 4px 0 0;transition:height 0.3s"></div>
          </div>
          <div style="font-size:13px;font-weight:700;color:#111827">${d.value != null ? d.value : 'N/A'}${d.value != null ? t.unit : ''}</div>
          ${beatBadge}
        </div>`;
    }).join('<div style="display:flex;align-items:center;color:#9ca3af;font-size:18px;padding-bottom:20px">→</div>');
    return `
      <div style="margin-bottom:20px">
        <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:10px">${t.metric}</div>
        <div style="display:flex;align-items:flex-end;gap:4px">${bars}</div>
      </div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${json.ticker} | beatscanner</title>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#111827}
  .container{max-width:800px;margin:0 auto;padding:24px 16px}
  h2{margin:0 0 4px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px}
  .card{background:#fff;border-radius:14px;padding:20px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
</style>
</head>
<body>
<div class="container">
  <div class="card" style="text-align:center;background:${passBg};border:2px solid ${passColor}33">
    <div style="font-size:13px;color:#6b7280;margin-bottom:4px">${json.companyName} · ${json.period}</div>
    <div style="font-size:64px;font-weight:900;color:${passColor};line-height:1">${passLabel}</div>
    <div style="font-size:16px;color:#374151;margin:8px 0 4px;font-weight:600">${json.passCount} / ${json.totalCount} 条件クリア</div>
    <div style="font-size:13px;color:#6b7280">${json.summary || ""}</div>
  </div>

  <div class="card">
    <h2>判定スコアカード</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:14px">
      ${conditionCards}
    </div>
  </div>

  <div class="card">
    <h2>主要指標トレンド</h2>
    <div style="margin-top:14px">${trendSections}</div>
  </div>
</div>
</body>
</html>`;

  const newWin = window.open("", "_blank");
  if (newWin) {
    newWin.document.open();
    newWin.document.write(html);
    newWin.document.close();
  }
}

export const fetchAnalystData = async (ticker) => {
  const res = await fetch(`/api/analyst/${ticker}`);
  if (!res.ok) return null;
  return await res.json();
};
