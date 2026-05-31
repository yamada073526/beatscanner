/**
 * ForwardOutlookSection.jsx — 前方視界 (来期コンセンサス YoY) v146
 *
 * じっちゃまプロトコル条件4「来期コンセンサスが前年同期比を超えているか / 前方は視界良好か」を補う。
 * 「ガイダンス進捗 (直近=過去のバックミラー)」の直下に置き、過去 → 未来の視線誘導をする。
 *
 * 6 体合議 (2026-06-01) verdict 反映:
 *   - §38: verdict ラベル (強気/弱気/視界良好) を一切出さない。来期 YoY は **色なし** (緑/赤を塗らない、
 *     将来への着色 = 我々の評価 = 断定的判断とみなされうる)。方向は ▲▼ + 中立トーンの予測棒のみ。
 *   - backend (guidance/basic の `forward`) の数値・flag を **読むだけ** (frontend 再計算禁止、
 *     売上ミスマッチガードすり抜け防止 = Anthropic/frontend verdict)。
 *   - §5 免責文言を常時表示 + 出典 (FMP analyst-estimates) + アナリスト数を明示 (citation)。
 *   - coverage 欠落・near-zero・赤字ベースは backend で None 化済 → 「—」/ 注記で graceful。
 *
 * 独立 component (GuidanceCard 無改変、 発光系 card を新規追加しない = frontend verdict)。
 */

import React from 'react';

// ── 数値フォーマッタ (Python backend の数値をそのまま表示、 再計算しない) ──
function fmtMoney(v, currency = 'USD') {
  if (v == null || !Number.isFinite(v)) return '—';
  const sym = currency === 'USD' || !currency ? '$' : '';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}${sym}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(0)}M`;
  return `${sign}${sym}${Math.round(abs).toLocaleString()}`;
}

function fmtEps(v, currency = 'USD') {
  if (v == null || !Number.isFinite(v)) return '—';
  const sym = currency === 'USD' || !currency ? '$' : '';
  return `${v < 0 ? '-' : ''}${sym}${Math.abs(v).toFixed(2)}`;
}

// 前年同期比バッジ — ▲▼ + 絶対値 (色なし: 緑/赤を使わず neutral 単色、 §38)
function YoYInline({ pct }) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const up = pct >= 0;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
      <span aria-hidden style={{ fontSize: 10 }}>{up ? '▲' : '▼'}</span>
      <strong style={{ fontSize: 13, fontWeight: 700 }}>{Math.abs(pct).toFixed(1)}%</strong>
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>前年同期比</span>
    </span>
  );
}

// 予測棒: 前年同期 (baseline) と 来期予想 を中立トーンで対比 (色なし、 長さの差で成長を視覚化)
function ForecastBars({ yearAgo, consensus, yearAgoLabel, consensusLabel }) {
  if (yearAgo == null || consensus == null || !Number.isFinite(yearAgo) || !Number.isFinite(consensus)) return null;
  const maxv = Math.max(Math.abs(yearAgo), Math.abs(consensus)) || 1;
  const wYa = Math.max(2, (Math.abs(yearAgo) / maxv) * 100);
  const wCon = Math.max(2, (Math.abs(consensus) / maxv) * 100);
  const Row = ({ label, value, w, strong }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 64, flexShrink: 0, fontSize: 10, color: 'var(--text-muted)' }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-pill, 999px)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${w}%`,
            height: '100%',
            // 色なし: 緑/赤/シアンを使わず neutral ink tone (来期予想をやや強めに)
            background: strong ? 'var(--text-secondary)' : 'var(--text-muted)',
            opacity: strong ? 0.85 : 0.45,
            borderRadius: 'var(--radius-pill, 999px)',
            transition: 'width 0.5s ease',
          }}
        />
      </div>
      <span style={{ width: 64, flexShrink: 0, fontSize: 11, fontWeight: 600, textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
  return (
    <div style={{ display: 'grid', gap: 5, marginTop: 8 }}>
      <Row label="前年同期" value={yearAgoLabel} w={wYa} strong={false} />
      <Row label="来期予想" value={consensusLabel} w={wCon} strong={true} />
    </div>
  );
}

function MetricBlock({ label, consensus, yoyPct, yearAgo, isMoney, currency, unreliable, turnaround, count }) {
  const fmt = isMoney ? fmtMoney : fmtEps;
  const hasConsensus = consensus != null && Number.isFinite(consensus);
  return (
    <div data-testid={`forward-metric-${isMoney ? 'revenue' : 'eps'}`} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
        {!hasConsensus ? (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>アナリストカバレッジなし</span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(consensus, currency)}</span>
            {turnaround ? (
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>前年赤字 → 来期黒字予想</span>
            ) : unreliable ? (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>比較基準が相違するため前年同期比は非表示</span>
            ) : (
              <YoYInline pct={yoyPct} />
            )}
          </span>
        )}
      </div>
      {hasConsensus && !unreliable && !turnaround && yearAgo != null && Number.isFinite(yearAgo) && (
        <ForecastBars
          yearAgo={yearAgo}
          consensus={consensus}
          yearAgoLabel={fmt(yearAgo, currency)}
          consensusLabel={fmt(consensus, currency)}
        />
      )}
      {hasConsensus && Number.isFinite(count) && (
        <div style={{ marginTop: 4, fontSize: 9, color: 'var(--text-muted)' }}>アナリスト {count} 社平均</div>
      )}
    </div>
  );
}

/**
 * @param {object} props
 * @param {object|null} props.forward - guidance.forward (backend 計算済、 frontend 再計算しない)
 * @param {string} [props.currency]
 */
export default function ForwardOutlookSection({ forward, currency = 'USD' }) {
  // static gate: backend が forward=null を返したら (コンセンサス取得不可) 何も描画しない。
  if (!forward || !forward.next_q) return null;
  const nq = forward.next_q;
  const period = nq.period_label || '来期';
  const countEps = nq.analyst_count_eps;
  const countRev = nq.analyst_count_revenue;

  return (
    <section
      data-testid="forward-outlook"
      style={{
        marginTop: 'var(--space-3, 12px)',
        padding: 'var(--space-4, 16px)',
        borderRadius: 'var(--radius-md, 12px)',
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        minHeight: 120, // CLS envelope
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>前方視界 — 来期見通し</h4>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{period}</span>
      </div>
      <p style={{ margin: '0 0 4px', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
        来期のアナリストコンセンサスと前年同期実績の比較 (事実値)
      </p>

      <MetricBlock
        label="売上"
        consensus={nq.consensus_revenue}
        yoyPct={nq.rev_yoy_pct}
        yearAgo={nq.year_ago_revenue}
        isMoney
        currency={currency}
        unreliable={nq.rev_compare_unreliable}
        turnaround={false}
        count={countRev}
      />
      <MetricBlock
        label="EPS"
        consensus={nq.consensus_eps}
        yoyPct={nq.eps_yoy_pct}
        yearAgo={nq.year_ago_eps}
        isMoney={false}
        currency={currency}
        unreliable={false}
        turnaround={nq.eps_turnaround}
        count={countEps}
      />

      {/* 出典 (citation) + §5 免責 (常時表示・折りたたみ不可) */}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          出典: {forward.source || 'FMP analyst-estimates'}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          ※来期予想はアナリスト各社の見通しの平均値であり、当社の予測ではありません。実績と乖離する場合があります。投資判断はご自身の責任で行ってください。
        </span>
      </div>
    </section>
  );
}
