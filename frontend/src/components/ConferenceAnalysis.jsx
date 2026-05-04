import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { fetchConferenceAnalysis, streamConferenceText, fetchAnalystData } from '../api.js';
import LockedSection, { ConferenceGhost, AnalystGhost } from './LockedSection.jsx';

const mdComponents = {
  h2: ({ children }) => (
    <h2 className="text-sm font-bold text-slate-700 bg-slate-100 rounded px-3 py-1.5 mt-8 mb-2">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-bold text-slate-800 mt-4 mb-1">{children}</h3>
  ),
  p: ({ children }) => {
    const text = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : '';
    // v40+: 旧 ①②③④⑤ 番号と新 【...】見出しの両方をハイライト
    const isSection = /^[①②③④⑤]/.test(text) || /^【.+】/.test(text);
    if (isSection) {
      return (
        <p className="text-sm font-bold text-slate-700 bg-slate-100 rounded px-3 py-1.5 mt-6 mb-2">
          {children}
        </p>
      );
    }
    return <p className="text-sm text-slate-700 mb-3 leading-relaxed">{children}</p>;
  },
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900">{children}</strong>
  ),
  ul: ({ children }) => (
    <ul className="text-sm text-slate-700 mb-3 pl-4 space-y-1 list-disc">{children}</ul>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
};

/* ─── アコーディオン（DetailReport.jsx と同じ実装） ─── */
function AccordionSection({ title, badge, badgeColor = '#1e293b', children, streaming = false }) {
  const [open, setOpen] = useState(false);

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
        onClick={() => setOpen((v) => !v)}
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

/* ─── ConferenceCard（内部コンテンツのみ） ─── */
function ConferenceCard({ ticker, onStreamingChange }) {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    const controller = new AbortController();
    setStreaming(true);
    setDone(false);
    setError(null);
    setText('');
    onStreamingChange?.(true);

    streamConferenceText(ticker, (chunk) => {
      setText((prev) => prev + chunk);
    }, controller.signal)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setStreaming(false);
          setDone(true);
          onStreamingChange?.(false);
        }
      });

    return () => {
      controller.abort();
      onStreamingChange?.(false);
    };
  }, [ticker]);

  return (
    <>
      {streaming && !text && <p className="text-sm text-slate-500 animate-pulse">カンファレンスコール分析を生成中...</p>}
      {error && <p className="text-sm text-red-500">データ取得に失敗しました: {error}</p>}
      {streaming && text && <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{text}</p>}
      {done && text && <ReactMarkdown components={mdComponents}>{text}</ReactMarkdown>}
    </>
  );
}

/* ─── AnalystCard（内部コンテンツのみ） ─── */

// 決算発表日 (YYYY-MM-DD) を「FY2024 Q3」のような会計四半期ラベルに変換。
// 米国企業は四半期決算日が当該四半期終了後 4-6 週間で発表される慣習に基づく簡易ロジック:
//   1-2月 → 前年Q4 / 3-5月 → Q1 / 6-8月 → Q2 / 9-11月 → Q3 / 12月 → Q4
function formatFiscalQuarter(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  let q, fy;
  if (month <= 2)       { q = 4; fy = year - 1; }
  else if (month <= 5)  { q = 1; fy = year; }
  else if (month <= 8)  { q = 2; fy = year; }
  else if (month <= 11) { q = 3; fy = year; }
  else                  { q = 4; fy = year; }
  return `${fy} Q${q}`;
}

// 数値の整形 (符号付き / 小数2桁) — null 安全
function fmtEps(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return n.toFixed(2);
}

function fmtSurprisePct(actual, estimated) {
  if (actual === null || actual === undefined || estimated === null || estimated === undefined) return null;
  const a = Number(actual), e = Number(estimated);
  if (Number.isNaN(a) || Number.isNaN(e) || e === 0) return null;
  return ((a - e) / Math.abs(e)) * 100;
}

function AnalystCard({ analyst, analystData }) {
  const history  = analyst?.history     || [];
  const beat     = analyst?.beat_count  ?? 0;
  const miss     = analyst?.miss_count  ?? 0;
  const total    = beat + miss;
  const beatRate = total > 0 ? Math.round((beat / total) * 100) : null;

  return (
    <>
      {total > 0 && (
        <>
          {/* Beat / Miss / Beat率 サマリー */}
          <div className="mb-4 flex items-center gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{beat}</div>
              <div className="text-xs text-slate-500">Beat</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-500">{miss}</div>
              <div className="text-xs text-slate-500">Miss</div>
            </div>
            {beatRate !== null && (
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-700">{beatRate}%</div>
                <div className="text-xs text-slate-500">Beat率（直近{total}期）</div>
              </div>
            )}
          </div>

          {/* 4列乖離テーブル: 四半期 / 予想EPS / 実績EPS / サプライズ% */}
          <div style={{
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            overflow: 'hidden',
          }}>
            {/* ヘッダー */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 1.1fr',
              gap: 8,
              padding: '10px 14px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-muted)',
              letterSpacing: '0.04em',
              background: 'var(--bg-subtle)',
              borderBottom: '1px solid var(--border)',
            }}>
              <div>四半期</div>
              <div style={{ textAlign: 'right' }}>予想EPS</div>
              <div style={{ textAlign: 'right' }}>実績EPS</div>
              <div style={{ textAlign: 'right' }}>サプライズ</div>
            </div>

            {/* 行 (履歴は新しい順で表示) */}
            {history.map((item, idx) => {
              const surprisePct = fmtSurprisePct(item.actual, item.estimated);
              const isBeat  = item.verdict === 'beat';
              const isMiss  = item.verdict === 'miss';
              const surpriseColor = surprisePct === null
                ? 'var(--text-muted)'
                : surprisePct >= 0 ? '#22c55e' : '#ef4444';
              return (
                <div
                  key={item.date}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr 1.1fr',
                    gap: 8,
                    padding: '10px 14px',
                    fontSize: 12.5,
                    color: 'var(--text-primary)',
                    borderBottom: idx < history.length - 1 ? '1px solid var(--border)' : 'none',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 600 }}>{formatFiscalQuarter(item.date)}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{item.date}</span>
                  </div>
                  <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                    {fmtEps(item.estimated)}
                  </div>
                  <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {fmtEps(item.actual)}
                  </div>
                  <div style={{
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 6,
                  }}>
                    {surprisePct !== null ? (
                      <>
                        <span style={{
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: surpriseColor,
                        }}>
                          {surprisePct >= 0 ? '+' : ''}{surprisePct.toFixed(1)}%
                        </span>
                        <span style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          letterSpacing: '0.04em',
                          background: isBeat ? 'rgba(34,197,94,0.14)' : isMiss ? 'rgba(239,68,68,0.14)' : 'var(--bg-subtle)',
                          color: isBeat ? '#16a34a' : isMiss ? '#dc2626' : 'var(--text-muted)',
                          border: `1px solid ${isBeat ? 'rgba(34,197,94,0.30)' : isMiss ? 'rgba(239,68,68,0.30)' : 'var(--border)'}`,
                        }}>
                          {isBeat ? 'BEAT' : isMiss ? 'MISS' : '—'}
                        </span>
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>予想なし</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {analystData && !analystData.error && (
        <div style={{ marginTop: total > 0 ? '16px' : '0' }}>
          {analystData.price_targets && (
            <div style={{ marginBottom: '12px' }}>
              <h4 className="text-sm font-semibold text-slate-700 mb-1">目標株価</h4>
              <p className="text-sm">
                平均: <strong>${analystData.price_targets.mean?.toFixed(2) ?? 'N/A'}</strong>
                {analystData.price_targets.current && analystData.price_targets.mean && (
                  <span style={{ marginLeft: '8px', color: analystData.price_targets.mean > analystData.price_targets.current ? '#22c55e' : '#ef4444' }}>
                    ({((analystData.price_targets.mean / analystData.price_targets.current - 1) * 100).toFixed(1)}%)
                  </span>
                )}
              </p>
              <p style={{ fontSize: '0.85em', color: '#888' }}>
                レンジ: ${analystData.price_targets.low?.toFixed(2)} 〜 ${analystData.price_targets.high?.toFixed(2)}
              </p>
            </div>
          )}

          {analystData.recommendations && (
            <div style={{ marginBottom: '12px' }}>
              <h4 className="text-sm font-semibold text-slate-700 mb-1">アナリスト推奨</h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { label: '強買い', key: 'strongBuy',  color: '#166534', bg: '#dcfce7' },
                  { label: '買い',   key: 'buy',         color: '#15803d', bg: '#f0fdf4' },
                  { label: '中立',   key: 'hold',        color: '#374151', bg: '#f3f4f6' },
                  { label: '売り',   key: 'sell',        color: '#c2410c', bg: '#fff7ed' },
                  { label: '強売り', key: 'strongSell',  color: '#991b1b', bg: '#fef2f2' },
                ].map(({ label, key, color, bg }) => (
                  <span key={key} style={{ padding: '4px 10px', borderRadius: '12px', background: bg, color, fontWeight: 'bold', fontSize: '0.85em' }}>
                    {label}: {analystData.recommendations[key] ?? 0}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analystData.upgrades_downgrades?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-1">直近の格付け変更</h4>
              {analystData.upgrades_downgrades.map((item, i) => (
                <p key={i} style={{ fontSize: '0.9em', margin: '4px 0' }}>
                  <span style={{ color: '#888' }}>{item.GradeDate?.split('T')[0]}</span>
                  {' '}<strong>{item.Firm}</strong>
                  {' → '}<span style={{ color: item.Action === 'up' ? '#22c55e' : item.Action === 'down' ? '#ef4444' : '#888', fontWeight: 'bold' }}>{item.ToGrade}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ─── ConferenceAnalysis（アコーディオン統合） ─── */
export default function ConferenceAnalysis({ ticker, onStreamingChange, isPro = true, onUpgrade }) {
  const [analyst,        setAnalyst]        = useState(null);
  const [analystLoading, setAnalystLoading] = useState(false);
  const [analystData,    setAnalystData]    = useState(null);
  const [confStreaming,  setConfStreaming]   = useState(false);

  // Pro のみ実データを取得 (無料ユーザーは API を叩かない)
  useEffect(() => {
    if (!ticker || !isPro) return;
    let alive = true;
    setAnalystLoading(true);
    setAnalyst(null);
    setAnalystData(null);
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000));
    Promise.race([fetchConferenceAnalysis(ticker), timeout])
      .then((d) => alive && setAnalyst(d?.analyst))
      .catch(() => alive && setAnalyst(null))
      .finally(() => alive && setAnalystLoading(false));
    fetchAnalystData(ticker).then((d) => alive && setAnalystData(d));
    return () => { alive = false; };
  }, [ticker, isPro]);

  const handleConfStreaming = (v) => {
    setConfStreaming(v);
    onStreamingChange?.(v);
  };

  return (
    <>
      <AccordionSection
        title="決算ハイライト分析"
        badge={isPro ? "AI分析" : "PRO"}
        badgeColor={isPro ? "#2563eb" : "#0e7490"}
        streaming={isPro && confStreaming}
      >
        {isPro ? (
          <ConferenceCard ticker={ticker} onStreamingChange={handleConfStreaming} />
        ) : (
          <LockedSection
            ctaLabel="ハイライトを見る"
            onUpgrade={onUpgrade}
            minHeight={300}
            hint="四半期業績・コンセンサス乖離・マージン軌道をアナリスト視点で要約"
          >
            <ConferenceGhost />
          </LockedSection>
        )}
      </AccordionSection>

      <AccordionSection
        title="アナリストの視点"
        badge={isPro ? "EPS Beat/Miss履歴" : "PRO"}
        badgeColor={isPro ? "#7c3aed" : "#0e7490"}
      >
        {isPro ? (
          analystLoading ? (
            <p className="text-sm text-slate-500 animate-pulse">Beat/Miss履歴を取得中...</p>
          ) : (
            <AnalystCard analyst={analyst} analystData={analystData} />
          )
        ) : (
          <LockedSection
            ctaLabel="履歴を見る"
            onUpgrade={onUpgrade}
            minHeight={280}
            hint="EPS Beat/Miss 履歴とアナリスト予想の乖離をテーブルで可視化"
          >
            <AnalystGhost />
          </LockedSection>
        )}
      </AccordionSection>
    </>
  );
}
