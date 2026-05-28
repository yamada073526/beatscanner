/**
 * EarningsReactionPanel — Pane 3 章 4 (テクニカル) 過去 8Q 決算反応 (handover v100 SPEC 打ち手 5)
 *
 * 過去 8 Q の決算発表日 ±5 営業日の累積リターンを表示、 「Beat 後 / Miss 後の平均」 summary 付き。
 * LLM 経由しない (Hallucination Guard §1 自動 PASS)、 純数値表示。
 *
 * 機関投資家 idiom (event study) を個人投資家向けに圧縮表示。
 *
 * memory anchors:
 *   - feedback_llm_calc_separation.md (数値 backend、 narration は frontend static)
 *   - SPEC_2026-05-23_fmp-premium-features.md §3
 */
import { useEffect, useState } from 'react';

const VERDICT_COLOR = {
  beat: 'var(--color-gain)',
  miss: 'var(--color-loss)',
  'in-line': 'var(--color-warning)',
  unknown: 'var(--text-muted)',
};

const VERDICT_LABEL = {
  beat: 'BEAT',
  miss: 'MISS',
  'in-line': 'In-line',
  unknown: '?',
};

const fmtPct = (v) => {
  if (!Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
};

export default function EarningsReactionPanel({ ticker }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/earnings-reaction/${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  // v125 P7-3: data-testid を全 state (loading/error/empty/main) に統一付与
  if (loading) {
    return (
      <div data-testid="earnings-reaction-panel" style={{ padding: 'var(--space-4, 16px)', color: 'var(--text-muted)', fontSize: 13 }}>
        過去 8Q 決算反応を取得中…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div data-testid="earnings-reaction-panel" style={{ padding: 'var(--space-4, 16px)', color: 'var(--text-muted)', fontSize: 13 }}>
        過去 8Q 決算反応データを取得できませんでした
      </div>
    );
  }

  const quarters = Array.isArray(data.quarters) ? data.quarters : [];
  const summary = data.summary || {};

  if (quarters.length === 0) {
    return (
      <div data-testid="earnings-reaction-panel" style={{ padding: 'var(--space-4, 16px)', color: 'var(--text-muted)', fontSize: 13 }}>
        過去 8Q の決算発表データはまだありません
      </div>
    );
  }

  return (
    <div data-testid="earnings-reaction-panel" style={{ padding: 'var(--space-4, 16px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5, 20px)' }}>
      {/* Summary: Beat / Miss 平均リターン */}
      <section>
        <header style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            過去 8Q 決算反応サマリー
          </h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            (t-1 → t+5 累積リターン平均)
          </span>
        </header>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 'var(--space-3, 12px)',
        }}>
          {[
            { label: 'Beat 後 平均', value: summary.avg_beat_return_pct, count: summary.beat_count, tone: VERDICT_COLOR.beat },
            { label: 'Miss 後 平均', value: summary.avg_miss_return_pct, count: summary.miss_count, tone: VERDICT_COLOR.miss },
            { label: 'In-line 後 平均', value: summary.avg_inline_return_pct, count: summary.inline_count, tone: VERDICT_COLOR['in-line'] },
          ].map((card) => (
            <div key={card.label} style={{
              padding: 'var(--space-3, 12px)',
              background: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-md, 12px)',
              borderLeft: `3px solid ${card.tone}`,
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                {card.label}
              </div>
              <div style={{
                fontSize: 18,
                fontWeight: 700,
                color: card.tone,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {fmtPct(card.value)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                {card.count} 回
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quarter list */}
      <section>
        <header style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            各 Q の反応
          </h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            直近 {quarters.length} 件 (新→古)
          </span>
        </header>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {quarters.map((q) => {
            const tone = VERDICT_COLOR[q.verdict] || VERDICT_COLOR.unknown;
            const label = VERDICT_LABEL[q.verdict] || '?';
            return (
              <li key={q.earnings_date} style={{
                display: 'grid',
                gridTemplateColumns: 'auto auto 1fr auto',
                gap: 'var(--space-3, 12px)',
                fontSize: 12,
                color: 'var(--text-secondary)',
                alignItems: 'baseline',
                padding: '6px 8px',
                borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
              }}>
                <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {q.earnings_date}
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: tone,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: `color-mix(in srgb, ${tone} 12%, transparent)`,
                  letterSpacing: '0.05em',
                }}>
                  {label}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  サプライズ {fmtPct(q.surprise_pct)}
                </span>
                <span style={{
                  fontWeight: 700,
                  color: q.cumulative_return_pct > 0 ? 'var(--color-gain)' :
                         q.cumulative_return_pct < 0 ? 'var(--color-loss)' :
                         'var(--text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {fmtPct(q.cumulative_return_pct)}
                </span>
              </li>
            );
          })}
        </ul>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
          ※ 過去実績、 将来の値動きを保証するものではありません。 「t-1 close → t+5 close」 で 5 営業日 累積リターン算出。
        </div>
      </section>
    </div>
  );
}
