/**
 * InsiderPanel — Pane 3 Insider 取引 section (handover v100 §100点 multi-review、 金融アナリスト verdict)
 *
 * FMP Premium /stable/insider-trading (Form 4 経営者売買) + /stable/institutional-ownership (13F 機関投資家保有)
 * を統合表示。 直近 30 件の Form 4 + 上位 20 件の機関保有変動。
 *
 * 設計:
 *   - sources schema (form4 / holders 個別 ok|empty|error|timeout): [feedback-data-completeness-guard]
 *   - 数値は LLM 経由不可 (Hallucination Guard 4 重防御 §1): 全て backend で計算済
 *   - 表示は静的、 LLM narration なし
 */
import { useEffect, useState } from 'react';

const fmtShares = (n) => {
  if (!Number.isFinite(n) || n === 0) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const fmtUSD = (v) => {
  if (!Number.isFinite(v) || v === 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};

export default function InsiderPanel({ ticker }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/insider/${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-4, 16px)', color: 'var(--text-muted)', fontSize: 13 }}>
        Insider 取引データを取得中…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div style={{ padding: 'var(--space-4, 16px)', color: 'var(--text-muted)', fontSize: 13 }}>
        Insider 取引データを取得できませんでした
      </div>
    );
  }

  const form4 = Array.isArray(data.form4) ? data.form4 : [];
  const holders = Array.isArray(data.holders) ? data.holders : [];
  const f4Status = data.sources?.form4 || 'ok';
  const hStatus = data.sources?.holders || 'ok';

  return (
    <div style={{ padding: 'var(--space-4, 16px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5, 20px)' }}>
      {/* Form 4 (経営者株式売買) */}
      <section>
        <header style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Form 4 経営者売買
          </h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            直近 {form4.length} 件
          </span>
        </header>
        {form4.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {f4Status === 'empty' ? '直近の Form 4 取引はありません' : '取得できませんでした'}
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {form4.slice(0, 10).map((r, i) => {
              const isBuy = r.type === 'P';
              const isSell = r.type === 'S';
              const tone = isBuy ? 'var(--color-gain)' : isSell ? 'var(--color-loss)' : 'var(--text-secondary)';
              return (
                <li key={`${r.date}-${i}`} style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto auto',
                  gap: 8,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  alignItems: 'baseline',
                }}>
                  <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{r.date || '—'}</span>
                  <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.name}
                  </span>
                  <span style={{ color: tone, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {isBuy ? '買' : isSell ? '売' : r.type}
                  </span>
                  <span style={{ color: tone, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtShares(r.shares)} / {fmtUSD(r.value)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 13F 機関投資家保有 */}
      <section>
        <header style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            13F 機関投資家保有
          </h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            上位 {holders.length} 件
          </span>
        </header>
        {holders.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {hStatus === 'empty' ? '13F データはありません' : '取得できませんでした'}
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {holders.slice(0, 10).map((h, i) => {
              const tone = h.change > 0 ? 'var(--color-gain)' : h.change < 0 ? 'var(--color-loss)' : 'var(--text-muted)';
              return (
                <li key={`${h.name}-${i}`} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  gap: 8,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  alignItems: 'baseline',
                }}>
                  <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.name}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtShares(h.shares)} 株
                  </span>
                  <span style={{ color: tone, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {h.change > 0 ? '+' : ''}{fmtShares(h.change)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
