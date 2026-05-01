import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { streamSummaryDetail, generateVisualization, generateVisualizationInstant } from '../api.js';
import ConferenceAnalysis from './ConferenceAnalysis.jsx';
import DiagramCard from './DiagramCard.jsx';

const mdComponents = {
  h2: ({ children }) => (
    <h2 style={{
      fontSize: '13px', fontWeight: '700',
      color: 'var(--text-primary)',
      background: 'var(--bg-subtle)',
      borderRadius: '6px',
      padding: '6px 12px 6px 10px',
      marginTop: '20px', marginBottom: '8px',
      borderLeft: '3px solid #38BDF8',
    }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-bold text-slate-800 mt-4 mb-1">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-sm text-slate-700 mb-3 leading-relaxed">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900">{children}</strong>
  ),
  ul: ({ children }) => (
    <ul className="text-sm text-slate-700 mb-3 pl-4 space-y-1 list-disc">{children}</ul>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
};

/**
 * Pre-format the periods array into a clearly labelled, human-readable string
 * with explicit units and pre-computed YoY growth rates.
 *
 * This prevents the visualisation LLM from:
 *   1. Confusing `operating_cf` (absolute $, raw) with `cfps` ($/share)
 *   2. Computing identical growth rates for the two metrics
 *
 * Format per period (oldest → newest):
 *   FY2023 (2023-06-30):
 *     売上高: 211.9 B$  (YoY: -)
 *     EPS: 9.72 $/株  (YoY: -)
 *     CFPS: 11.73 $/株  (YoY: -)   ← per-share, independent from operating_cf
 *     営業CF: 87.5 B$   (YoY: -)   ← absolute, converted to B$
 */
function formatMetricsTrend(periods) {
  if (!Array.isArray(periods) || periods.length === 0) return 'データなし';

  const yoy = (curr, prev) => {
    if (curr == null || prev == null || prev === 0) return '-';
    const pct = ((curr - prev) / Math.abs(prev)) * 100;
    return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
  };

  const toB = (v) => (v != null ? (v / 1e9).toFixed(1) : null);

  return periods.map((p, i) => {
    const prev = i > 0 ? periods[i - 1] : null;
    const revB  = toB(p.revenue);
    const ocfB  = toB(p.operating_cf);
    const prevRevB  = prev ? toB(prev.revenue) : null;
    const prevOcfB  = prev ? toB(prev.operating_cf) : null;

    return [
      `FY${p.period} (${p.date}):`,
      `  売上高: ${revB != null ? revB + ' B$' : '-'}  (YoY: ${yoy(Number(revB), Number(prevRevB))})`,
      `  EPS: ${p.eps != null ? p.eps + ' $/株' : '-'}  (YoY: ${yoy(p.eps, prev?.eps)})`,
      `  CFPS: ${p.cfps != null ? p.cfps.toFixed(2) + ' $/株【1株当たり営業CF = operating_cf ÷ 希薄化株式数】' : '-'}  (YoY: ${yoy(p.cfps, prev?.cfps)})`,
      `  営業CF: ${ocfB != null ? ocfB + ' B$【営業CF絶対額、CFPSとは別指標】' : '-'}  (YoY: ${yoy(Number(ocfB), Number(prevOcfB))})`,
    ].join('\n');
  }).join('\n\n');
}

const LOADING_STEPS = [
  { text: '財務データを読み込み中...', pct: 15 },
  { text: 'データを解析中...',         pct: 40 },
  { text: '図解を構成中...',           pct: 65 },
  { text: 'レイアウトを最適化中...',   pct: 85 },
];

function BarChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6"  y1="20" x2="6"  y2="14" />
      <line x1="2"  y1="20" x2="22" y2="20" />
    </svg>
  );
}

// ── SVG helpers ──────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


function buildDownloadSVG(data, ticker) {
  const W = 800;
  const passColor = data.overallPass ? '#16a34a' : '#dc2626';
  const passBg  = data.overallPass ? '#f0fdf4' : '#fef2f2';
  let y = 0;
  const parts = [];

  // ── 1. Headline ──
  parts.push(`
    <rect x="0" y="${y}" width="${W}" height="116" rx="0" fill="${passBg}"/>
    <text x="${W / 2}" y="${y + 36}" text-anchor="middle" font-family="Hiragino Sans,sans-serif" font-size="12" fill="#6b7280">${esc(data.companyName)} · ${esc(data.period)}</text>
    <text x="${W / 2}" y="${y + 74}" text-anchor="middle" font-family="Hiragino Sans,sans-serif" font-size="26" font-weight="900" fill="${passColor}">${esc(data.headline || data.summary || '')}</text>
    <text x="${W / 2}" y="${y + 102}" text-anchor="middle" font-family="Hiragino Sans,sans-serif" font-size="12" fill="${passColor}">${data.passCount ?? '?'}/${data.totalCount ?? 5} 条件クリア</text>
  `);
  y += 130;

  // ── 2. Business Model label + flow ──
  parts.push(`<text x="24" y="${y + 20}" font-family="Hiragino Sans,sans-serif" font-size="14" font-weight="700" fill="#38BDF8">ビジネスモデル</text>`);
  y += 32;

  const steps = data.businessFlowSteps || [];
  const n = Math.min(steps.length, 5);
  if (n > 0) {
    const BOX_W = 136, BOX_H = 76, ARROW = 26;
    const totalW = n * BOX_W + (n - 1) * ARROW;
    const sx = (W - totalW) / 2;
    const sy = y + 8;
    steps.slice(0, n).forEach((s, i) => {
      const x = sx + i * (BOX_W + ARROW);
      parts.push(`
        <rect x="${x}" y="${sy}" width="${BOX_W}" height="${BOX_H}" rx="10" fill="#38BDF8"/>
        <text x="${x + BOX_W / 2}" y="${sy + 26}" text-anchor="middle" font-family="Hiragino Sans,sans-serif" font-size="14" font-weight="700" fill="white">${esc(s.label)}</text>
        <text x="${x + BOX_W / 2}" y="${sy + 48}" text-anchor="middle" font-family="Hiragino Sans,sans-serif" font-size="11" font-weight="600" fill="rgba(255,255,255,0.90)">${esc(s.detail)}</text>
      `);
      if (i < n - 1) {
        const ay = sy + BOX_H / 2;
        parts.push(`<line x1="${x + BOX_W + 2}" y1="${ay}" x2="${x + BOX_W + ARROW - 2}" y2="${ay}" stroke="#94a3b8" stroke-width="2" marker-end="url(#arw)"/>`);
      }
    });
    y += BOX_H + 24;
  }
  y += 14;

  // ── 3. Growth Story label + bars ──
  parts.push(`<text x="24" y="${y + 20}" font-family="Hiragino Sans,sans-serif" font-size="14" font-weight="700" fill="#38BDF8">数字で見る成長ストーリー</text>`);
  y += 32;

  const trends = (data.trends || []).slice(0, 4);
  if (trends.length) {
    const PANEL_W = 375, PANEL_H = 130, GAP_X = 10, GAP_Y = 14;
    const BAR_X = 42, BAR_W_AVAIL = PANEL_W - BAR_X - 12;
    const BAR_H_MAX = 62, BAR_TOP = 26;

    trends.forEach((t, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const px = GAP_X + col * (PANEL_W + GAP_X * 2);
      const py = y + row * (PANEL_H + GAP_Y);
      const tdata = (t.data || []).filter(d => d.value != null);
      if (!tdata.length) return;

      const vals = tdata.map(d => d.value);
      const maxV = Math.max(...vals);
      const minV = Math.min(0, Math.min(...vals));
      const range = maxV - minV || 1;
      const barW = Math.min(44, (BAR_W_AVAIL / tdata.length) * 0.52);
      const spacing = BAR_W_AVAIL / tdata.length;
      const axisY = py + BAR_TOP + BAR_H_MAX;

      parts.push(`
        <rect x="${px}" y="${py}" width="${PANEL_W}" height="${PANEL_H}" rx="8" fill="white" stroke="#e2e8f0" stroke-width="1"/>
        <text x="${px + PANEL_W / 2}" y="${py + 18}" text-anchor="middle" font-family="Hiragino Sans,sans-serif" font-size="14" font-weight="700" fill="#374151">${esc(t.metric)}</text>
        <line x1="${px + BAR_X}" y1="${axisY}" x2="${px + PANEL_W - 12}" y2="${axisY}" stroke="#e2e8f0" stroke-width="1"/>
        <text x="${px + BAR_X - 4}" y="${py + BAR_TOP + 8}" text-anchor="end" font-family="sans-serif" font-size="10" font-weight="600" fill="#9ca3af">${maxV}</text>
      `);

      tdata.forEach((d, i) => {
        const barH = Math.max(4, Math.round(((d.value - minV) / range) * BAR_H_MAX));
        const bx = px + BAR_X + i * spacing + (spacing - barW) / 2;
        const by = axisY - barH;
        const fill = i === tdata.length - 1 ? '#38BDF8' : '#cbd5e1';
        const beatLabel = d.beat === true ? '▲BEAT' : d.beat === false ? '▼MISS' : '';
        const beatFill = d.beat === true ? '#22c55e' : '#ef4444';
        parts.push(`
          <rect x="${bx}" y="${by}" width="${barW}" height="${barH}" rx="3" fill="${fill}"/>
          <text x="${bx + barW / 2}" y="${axisY + 15}" text-anchor="middle" font-family="Hiragino Sans,sans-serif" font-size="11" font-weight="600" fill="#6b7280">${esc(String(d.period).replace('FY', ''))}</text>
          <text x="${bx + barW / 2}" y="${by - 4}" text-anchor="middle" font-family="Hiragino Sans,sans-serif" font-size="11" font-weight="700" fill="#374151">${d.value}${esc(t.unit)}</text>
          ${beatLabel ? `<text x="${bx + barW / 2}" y="${axisY + 28}" text-anchor="middle" font-family="Hiragino Sans,sans-serif" font-size="10" font-weight="700" fill="${beatFill}">${beatLabel}</text>` : ''}
        `);
      });
    });

    const chartRows = Math.ceil(trends.length / 2);
    y += chartRows * (PANEL_H + GAP_Y) + 16;
  }
  y += 16;

  // ── 4. Pros / Cons ──
  parts.push(`<text x="24" y="${y + 20}" font-family="Hiragino Sans,sans-serif" font-size="14" font-weight="700" fill="#38BDF8">強み・リスク対比</text>`);
  y += 34;

  const strengths = data.strengths || [];
  const risks     = data.risks     || [];
  const maxItems  = Math.max(strengths.length, risks.length, 1);
  const ITEM_H    = 24;
  const COL_H     = maxItems * ITEM_H + 36;
  const COL_W     = 370;

  parts.push(`
    <rect x="20" y="${y}" width="${COL_W}" height="${COL_H}" rx="8" fill="#f0fdf4" stroke="#bbf7d0" stroke-width="1"/>
    <text x="36" y="${y + 18}" font-family="Hiragino Sans,sans-serif" font-size="11" font-weight="700" fill="#16a34a">強み</text>
  `);
  strengths.forEach((s, i) => {
    parts.push(`<text x="42" y="${y + 34 + i * ITEM_H}" font-family="Hiragino Sans,sans-serif" font-size="11" fill="#374151">• ${esc(s)}</text>`);
  });

  parts.push(`
    <rect x="${W - 20 - COL_W}" y="${y}" width="${COL_W}" height="${COL_H}" rx="8" fill="#fef2f2" stroke="#fecaca" stroke-width="1"/>
    <text x="${W - 20 - COL_W + 16}" y="${y + 18}" font-family="Hiragino Sans,sans-serif" font-size="11" font-weight="700" fill="#dc2626">リスク</text>
  `);
  risks.forEach((r, i) => {
    parts.push(`<text x="${W - 20 - COL_W + 22}" y="${y + 34 + i * ITEM_H}" font-family="Hiragino Sans,sans-serif" font-size="11" fill="#374151">• ${esc(r)}</text>`);
  });
  y += COL_H + 24;

  // ── 5. Investor question ──
  parts.push(`<text x="24" y="${y + 20}" font-family="Hiragino Sans,sans-serif" font-size="14" font-weight="700" fill="#38BDF8">投資家への問い</text>`);
  y += 34;

  const question = data.investorQuestion || '';
  const qLines = [];
  let line = '';
  for (const ch of question) {
    line += ch;
    if (line.length >= 52) { qLines.push(line); line = ''; }
  }
  if (line) qLines.push(line);

  parts.push(`<rect x="20" y="${y}" width="${W - 40}" height="${qLines.length * 22 + 24}" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>`);
  qLines.forEach((l, i) => {
    parts.push(`<text x="36" y="${y + 18 + i * 22}" font-family="Hiragino Sans,sans-serif" font-size="12" fill="#374151">${esc(l)}</text>`);
  });
  y += qLines.length * 22 + 48;

  const totalH = y + 20;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 ${W} ${totalH}" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${totalH}">
  <defs>
    <marker id="arw" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0 0L0 6L8 3z" fill="#94a3b8"/>
    </marker>
  </defs>
  <rect width="${W}" height="${totalH}" fill="white"/>
  ${parts.join('')}
</svg>`;
}

// ── AccordionSection ──────────────────────────────────────────────────────────

function AccordionSection({ title, badge, badgeColor = '#1e293b', children, streaming = false, defaultOpen = false, onOpenChange }) {
  const [open, setOpen] = useState(defaultOpen);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div
      className="panel-card"
      style={{
        borderRadius: '12px',
        border: '1px solid var(--border)',
        background: 'var(--bg-primary)',
        marginBottom: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      <button
        onClick={handleToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '14px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{
          fontSize: '13px',
          color: 'var(--text-secondary)',
          transition: 'transform 0.2s',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          display: 'inline-block',
          lineHeight: 1,
        }}>▶</span>
        <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)', flex: 1 }}>
          {title}
        </span>
        {badge && (
          <span style={{ fontSize: '11px', fontWeight: '600', color: 'white', background: badgeColor, borderRadius: '4px', padding: '2px 7px' }}>
            {badge}
          </span>
        )}
        {streaming && (
          <span style={{ fontSize: '11px', color: '#94a3b8' }} className="animate-pulse">生成中...</span>
        )}
      </button>

      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s ease' }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ padding: '0 16px 16px' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Collapsible markdown section (for AI summary "続きを読む") ─────────────
//
// Splits a completed markdown blob by H2 (`## `) headers and renders each
// section. Long sections (>200 chars or >3 lines) get truncated with a
// "▼ 続きを読む" / "▲ 閉じる" toggle. Short sections render inline.
//
// Only used after streaming completes — during streaming the live text is
// shown as a single ReactMarkdown blob so users see real-time progress.

// マークダウン記号を除去してプレーンテキストにする（プレビュー表示用）

function splitMarkdownBySections(md) {
  if (!md) return [];
  const lines = md.split('\n');
  const sections = [];
  let current = { title: null, body: [] };
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      // Push the previous section if it has content
      if (current.title || current.body.some(l => l.trim())) {
        sections.push({
          title: current.title,
          body: current.body.join('\n').trim(),
        });
      }
      current = { title: m[1].trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.title || current.body.some(l => l.trim())) {
    sections.push({
      title: current.title,
      body: current.body.join('\n').trim(),
    });
  }
  return sections;
}

function CollapsibleMarkdownSection({ title, body, expanded, onToggle }) {
  if (!body) return null;

  const paragraphs = body.split(/\n\n+/).filter(p => p.trim());
  const PREVIEW_COUNT = 2;
  const hasMore = paragraphs.length > PREVIEW_COUNT;

  const previewMd = paragraphs.slice(0, PREVIEW_COUNT).join('\n\n');
  const displayMd = expanded || !hasMore ? body : previewMd;

  return (
    <div style={{ marginBottom: '12px' }}>
      {title && (
        <h2 style={{
          fontSize: '13px', fontWeight: '700',
          color: 'var(--text-primary)',
          background: 'var(--bg-subtle)',
          borderRadius: '6px',
          padding: '6px 12px 6px 10px',
          marginTop: '20px', marginBottom: '8px',
          borderLeft: '3px solid #38BDF8',
        }}>
          {title}
        </h2>
      )}
      {/* フェードアウトラッパー */}
      <div style={{ position: 'relative' }}>
        <ReactMarkdown components={mdComponents}>{displayMd}</ReactMarkdown>
        {hasMore && !expanded && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: '52px',
            background: 'linear-gradient(to bottom, transparent, var(--bg-primary))',
            pointerEvents: 'none',
          }} />
        )}
      </div>
      {hasMore && (
        <button
          onClick={onToggle}
          onMouseEnter={e => { e.currentTarget.style.color = '#7DD3FC'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#38BDF8'; }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '13px', color: '#38BDF8',
            fontWeight: '600',
            padding: '4px 0', marginTop: '2px',
            transition: 'color 0.15s',
          }}
        >
          {expanded ? '▲ 閉じる' : '▼ 続きを読む'}
        </button>
      )}
    </div>
  );
}

// ── ReportCard ────────────────────────────────────────────────────────────────

function ReportCard({ analysis, guidance, onStreamingChange, isOpen }) {
  const [text, setText] = useState('');
  const [preparing, setPreparing] = useState(isOpen);
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const toggleTextSection = (key) =>
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const [vizState, setVizState] = useState('idle');
  const [vizData, setVizData] = useState(null);
  const [loadingStep, setLoadingStep] = useState(LOADING_STEPS[0].text);
  const [loadingPct, setLoadingPct] = useState(0);
  const stepTimerRef = useRef(null);
  const vizPanelRef = useRef(null);
  const bannerShownRef = useRef(false);
  const [selectedYears, setSelectedYears] = useState(3);

  // バックグラウンド事前生成
  const [bgVizData, setBgVizData] = useState(null);
  const [bgVizLoading, setBgVizLoading] = useState(false);
  const bgVizFetchedRef = useRef(null);
  const bgVizPromiseRef = useRef(null);  // 進行中の bg リクエスト Promise
  const [autoDisplayed, setAutoDisplayed] = useState(false);

  const fetchedForRef = useRef(null);
  const doneRef = useRef(false);

  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    const h = () => setThemeTick((n) => n + 1);
    window.addEventListener('themechange', h);
    return () => window.removeEventListener('themechange', h);
  }, []);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  const startProgressSimulation = () => {
    let idx = 0;
    setLoadingStep(LOADING_STEPS[0].text);
    setLoadingPct(LOADING_STEPS[0].pct);
    stepTimerRef.current = setInterval(() => {
      idx += 1;
      if (idx < LOADING_STEPS.length) {
        setLoadingStep(LOADING_STEPS[idx].text);
        setLoadingPct(LOADING_STEPS[idx].pct);
      }
    }, 2200);
  };

  const stopProgressSimulation = () => {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  };

  const handleGenerateViz = async (yearsArg) => {
    const safeYears = typeof yearsArg === 'number' ? yearsArg : selectedYears;

    // ★ 事前生成済みなら即座に表示
    if (bgVizData && safeYears === 3) {
      console.log('[BG_VIZ] Using pre-generated data instantly');
      setVizData(bgVizData);
      setVizState('done');
      setTimeout(() => vizPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
      return;
    }

    // ★ bg進行中 かつ years=3 → 新規リクエストを立てず bg完了を待つ
    if (bgVizLoading && bgVizPromiseRef.current && safeYears === 3) {
      console.log('[BG_VIZ] Waiting for in-progress background generation...');
      setVizState('loading');
      startProgressSimulation();
      try {
        const json = await bgVizPromiseRef.current;
        setVizData(json);
        setLoadingPct(100);
        setVizState('done');
        setTimeout(() => vizPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
      } catch (err) {
        const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
        alert('図解の生成に失敗しました: ' + msg);
        setVizState('idle');
      } finally {
        stopProgressSimulation();
      }
      return;
    }

    setVizState('loading');
    setVizData(null);
    startProgressSimulation();
    try {
      const enrichedData = {
        ticker:               analysis.ticker,
        company_name:         analysis.companyName,
        fiscal_period:        analysis.latestPeriod,
        verdict:              analysis.overallPass ? 'PASS' : 'FAIL',
        passed_conditions:    analysis.passedCount,
        conditions_detail:    JSON.stringify(analysis.conditions, null, 2),
        metrics_trend:        formatMetricsTrend(analysis.periods),
        guidance:             guidance ? JSON.stringify(guidance, null, 2) : 'データなし',
        conference_call_points: 'データなし',
        ai_summary:           '',
        beat_miss: {
          eps: {
            actual:    guidance?.eps?.actual    ?? null,
            estimated: guidance?.eps?.estimated ?? null,
            verdict:   guidance?.eps?.verdict   ?? null,
          },
          revenue: {
            actual:    guidance?.revenue?.actual    ?? null,
            estimated: guidance?.revenue?.estimated ?? null,
            verdict:   guidance?.revenue?.verdict   ?? null,
          },
        },
      };
      const json = await generateVisualization(analysis.ticker, enrichedData, safeYears);
      setVizData(json);
      setLoadingPct(100);
      setVizState('done');
      setTimeout(() => vizPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    } catch (err) {
      const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
      alert('図解の生成に失敗しました: ' + msg);
      setVizState('idle');
    } finally {
      stopProgressSimulation();
    }
  };

  useEffect(() => {
    if (!isOpen || !analysis) return;

    const key = `${analysis.ticker}|${analysis.latestDate}`;
    if (fetchedForRef.current === key) return;
    fetchedForRef.current = key;
    doneRef.current = false;

    const controller = new AbortController();
    setPreparing(true);
    setStreaming(false);
    setDone(false);
    setError(null);
    setText('');
    onStreamingChange?.(true);

    let firstChunk = true;
    streamSummaryDetail(analysis, guidance, (chunk) => {
      if (firstChunk) {
        firstChunk = false;
        setPreparing(false);
        setStreaming(true);
      }
      setText((prev) => prev + chunk);
    }, controller.signal)
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setPreparing(false);
        }
      })
      .finally(() => {
        doneRef.current = true;
        if (!controller.signal.aborted) {
          setStreaming(false);
          setDone(true);
          onStreamingChange?.(false);
        }
      });

    return () => {
      controller.abort();
      onStreamingChange?.(false);
      stopProgressSimulation();
      if (!doneRef.current) {
        fetchedForRef.current = null;
      }
    };
  }, [analysis?.ticker, analysis?.latestDate, isOpen]);

  // ── バックグラウンド事前生成（銘柄選択直後・isOpen に関係なく開始） ──
  useEffect(() => {
    if (!analysis) return;
    const bgKey = `${analysis.ticker}|${analysis.latestDate}|3`;
    if (bgVizFetchedRef.current === bgKey) return;
    bgVizFetchedRef.current = bgKey;

    const startBgViz = async () => {
      setBgVizLoading(true);
      try {
        const enrichedData = {
          ticker:                 analysis.ticker,
          company_name:           analysis.companyName,
          fiscal_period:          analysis.latestPeriod,
          verdict:                analysis.overallPass ? 'PASS' : 'FAIL',
          passed_conditions:      analysis.passedCount,
          conditions_detail:      JSON.stringify(analysis.conditions, null, 2),
          metrics_trend:          formatMetricsTrend(analysis.periods),
          guidance:               guidance ? JSON.stringify(guidance, null, 2) : 'データなし',
          conference_call_points: 'データなし',
          ai_summary:             '',
          beat_miss: {
            eps: {
              actual:    guidance?.eps?.actual    ?? null,
              estimated: guidance?.eps?.estimated ?? null,
              verdict:   guidance?.eps?.verdict   ?? null,
            },
            revenue: {
              actual:    guidance?.revenue?.actual    ?? null,
              estimated: guidance?.revenue?.estimated ?? null,
              verdict:   guidance?.revenue?.verdict   ?? null,
            },
          },
        };
        // ★ Phase1: LLMなしで数値データのみ即取得（0.3〜1秒）
        try {
          const instantJson = await generateVisualizationInstant(analysis.ticker, enrichedData, 3);
          setVizData(instantJson);
          setVizState('done');
          setAutoDisplayed(true);
          setTimeout(() => setAutoDisplayed(false), 3000);
          console.log('[BG_VIZ] Phase1 instant displayed');
        } catch (e1) {
          console.warn('[BG_VIZ] Phase1 instant failed:', e1?.message || e1);
        }

        // ★ Phase2: narrative を通常エンドポイントで取得（バックグラウンド）
        const promise = generateVisualization(analysis.ticker, enrichedData, 3);
        bgVizPromiseRef.current = promise;
        const fullJson = await promise;
        // narrative で上書き（Phase1の数値データを保持しつつテキスト系を補完）
        setVizData(prev => ({
          ...(prev || {}),
          headline:          fullJson.headline,
          summary:           fullJson.summary,
          conditions:        fullJson.conditions,
          businessFlowSteps: fullJson.businessFlowSteps,
          strengths:         fullJson.strengths,
          risks:             fullJson.risks,
          bullCase:          fullJson.bullCase,
          bearCase:          fullJson.bearCase,
          investorQuestion:  fullJson.investorQuestion,
          dividend:          fullJson.dividend,
          gaapAdjustment:    fullJson.gaapAdjustment,
          partialPeriod:     fullJson.partialPeriod,
          epsSourceNote:     fullJson.epsSourceNote,
          _phase: 'complete',
        }));
        setBgVizData(fullJson);
        console.log('[BG_VIZ] Phase2 narrative completed');
      } catch (e) {
        console.warn('[BG_VIZ] Failed:', e?.message || e);
      } finally {
        setBgVizLoading(false);
        bgVizPromiseRef.current = null;
      }
    };

    // ★ 遅延を0にして即座に開始（isOpen 不問）
    startBgViz();
  }, [analysis?.ticker, analysis?.latestDate]);

  return (
    <>
      {/* 図解生成CTA */}
      <div style={{ marginBottom: '16px', paddingTop: '4px' }}>
        {vizState === 'idle' && (
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => handleGenerateViz()}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(56,189,248,0.70)';
                e.currentTarget.style.color = 'rgb(56,189,248)';
                e.currentTarget.style.backgroundColor = 'rgba(56,189,248,0.07)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.color = 'var(--text-secondary)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '14px 20px',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1.5px solid var(--border)',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                letterSpacing: '0.02em',
                transition: 'border-color 0.15s, color 0.15s, background-color 0.15s',
              }}
            >
              <BarChartIcon />
              {bgVizLoading
                ? 'AI図解を準備中...'
                : '📊 AI図解を生成（グラフは1秒で表示）'}
            </button>
            {bgVizLoading && (
              <div style={{
                marginTop: '8px',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '8px',
              }}>
                <div style={{
                  width: '160px', height: '3px',
                  background: 'var(--border)',
                  borderRadius: '2px', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    background: '#38BDF8',
                    borderRadius: '2px',
                    animation: 'progress-indeterminate 1.5s ease-in-out infinite',
                    width: '40%',
                  }} />
                </div>
                <style>{`
                  @keyframes progress-indeterminate {
                    0%   { transform: translateX(-200%); }
                    100% { transform: translateX(500%); }
                  }
                `}</style>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  自動表示まで少々お待ちください
                </span>
              </div>
            )}
            <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '6px' }}>
              {bgVizLoading
                ? 'バックグラウンドで生成中です。完成次第自動で表示されます。'
                : 'ビジネスモデル・成長ストーリー・強みリスクを自動図解化します'}
            </p>
          </div>
        )}

        {vizState === 'loading' && (
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <span className="animate-spin" style={{ width: '16px', height: '16px', border: '2px solid #cbd5e1', borderTop: '2px solid #1a1a2e', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', flex: 1 }}>{loadingStep}</span>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600' }}>{loadingPct}%</span>
            </div>
            <div style={{ height: '6px', background: isDark ? '#2d3748' : '#e2e8f0', borderRadius: '4px', overflow: 'hidden', margin: '10px 0' }}>
              <div style={{ height: '100%', width: `${loadingPct}%`, background: isDark ? '#e2e8f0' : '#0f172a', borderRadius: '4px', transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}

        {vizState === 'done' && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>✅</span>
            <span style={{ fontSize: '13px', color: '#16a34a', fontWeight: '600' }}>生成完了</span>
            <button onClick={() => handleGenerateViz()} style={{ marginLeft: 'auto', fontSize: '12px', color: '#6b7280', background: 'white', border: '1px solid #d1d5db', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer' }}>
              再生成
            </button>
          </div>
        )}
      </div>

      {/* ★ 自動表示完了通知（3秒で消える） */}
      {autoDisplayed && (
        <div style={{
          position: 'fixed', bottom: '20px', right: '20px',
          background: '#1e293b',
          border: '1px solid #38BDF8',
          borderRadius: '10px',
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '13px', color: '#e2e8f0',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          zIndex: 1000,
          animation: 'fadeInOut 3s ease',
        }}>
          <span style={{ color: '#38BDF8', fontSize: '16px' }}>✨</span>
          <span>AI図解が完成しました — 下にスクロール</span>
          <style>{`
            @keyframes fadeInOut {
              0%   { opacity: 0; transform: translateY(10px); }
              15%  { opacity: 1; transform: translateY(0); }
              75%  { opacity: 1; }
              100% { opacity: 0; }
            }
          `}</style>
        </div>
      )}

      {/* DiagramCard — React DOM rendering (no dangerouslySetInnerHTML) */}
      {vizState === 'done' && vizData && (
        <div ref={vizPanelRef}>
          <DiagramCard
            data={vizData}
            ticker={analysis.ticker}
            selectedYears={selectedYears}
            onYearsChange={(y) => {
              setSelectedYears(y);
              handleGenerateViz(y);
            }}
            onDownload={() => {
              const svgStr = buildDownloadSVG(vizData, analysis.ticker);
              const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
              const url  = URL.createObjectURL(blob);
              const a    = document.createElement('a');
              a.href     = url;
              a.download = `${analysis.ticker}_analysis.svg`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          />
        </div>
      )}

      {/* AI詳報テキスト */}
      {error && <p className="text-sm text-red-500" style={{ marginTop: '16px' }}>詳報を生成できませんでした: {error}</p>}

      {preparing && !error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 0',
          color: 'var(--text-secondary)',
        }}>
          <span style={{
            width: 16, height: 16, borderRadius: '50%',
            border: '2px solid var(--border)',
            borderTopColor: '#64748b',
            display: 'inline-block',
            animation: 'spin 0.8s linear infinite',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 13 }}>AI分析を準備中...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* AI推計注釈バナー（テキストが何かしらある時のみ表示） */}
      {(streaming || done) && text && !bannerShownRef.current && (() => {
        bannerShownRef.current = true;
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 10px', marginBottom: '10px',
            borderRadius: '6px',
            background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.20)',
            fontSize: '11px',
          }}>
            <span style={{ fontSize: '12px' }}>⚠️</span>
            <span style={{ color: '#b45309' }}>
              本文内の数値はAI推計を含みます。バリュエーション指標はFMP実データを使用。
            </span>
          </div>
        );
      })()}

      {/* While streaming: render the live blob so users see real-time progress.
          Once done: split by H2 and render each section as a collapsible block
          with a "▼ 続きを読む" toggle for long bodies. */}
      {streaming && !done && text && (
        <ReactMarkdown components={mdComponents}>{text}</ReactMarkdown>
      )}
      {done && text && (() => {
        const sections = splitMarkdownBySections(text);
        // If we couldn't split (no H2 headers found), fallback to single blob
        if (sections.length <= 1 && !sections[0]?.title) {
          return <ReactMarkdown components={mdComponents}>{text}</ReactMarkdown>;
        }
        return sections.map((sec, i) => {
          const key = sec.title || `section-${i}`;
          return (
            <CollapsibleMarkdownSection
              key={key}
              title={sec.title}
              body={sec.body}
              expanded={!!expandedSections[key]}
              onToggle={() => toggleTextSection(key)}
            />
          );
        });
      })()}
    </>
  );
}

// ── DetailReport ──────────────────────────────────────────────────────────────

export default function DetailReport({ analysis, guidance, onStreamingChange }) {
  const [conferenceStreaming, setConferenceStreaming] = useState(false);
  const [reportStreaming, setReportStreaming] = useState(false);
  const [reportOpen, setReportOpen] = useState(true);

  useEffect(() => {
    onStreamingChange?.(reportStreaming || conferenceStreaming);
  }, [reportStreaming, conferenceStreaming]);

  const borderColor = analysis?.overallPass ? '#22c55e' : '#ef4444';

  return (
    <div>
      <AccordionSection
        title="AIによる決算詳報"
        badge="AI詳報"
        badgeColor="#1e293b"
        streaming={reportStreaming}
        defaultOpen={true}
        onOpenChange={setReportOpen}
      >
        <div style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: '12px' }}>
          <ReportCard
            analysis={analysis}
            guidance={guidance}
            onStreamingChange={setReportStreaming}
            isOpen={reportOpen}
          />
        </div>
      </AccordionSection>

      {analysis?.ticker && (
        <ConferenceAnalysis
          ticker={analysis.ticker}
          onStreamingChange={setConferenceStreaming}
        />
      )}
    </div>
  );
}
