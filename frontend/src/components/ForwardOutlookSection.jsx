/**
 * ForwardOutlookSection.jsx — 前方視界 (来期コンセンサス YoY) v146 + ガイダンスサプライズ v172
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
 * 案B v172 ガイダンスサプライズ (会社ガイダンス vs consensus、 じっちゃま速報の主役 = 来期 EPS):
 *   - 会社 8-K ガイダンス (q_eps/q_revenue) は SEC fetch (cold 5-15s) を含むため guidance/basic を律速しない。
 *     → ticker 指定時に `?with_guidance=1` を **非ブロック lazy fetch** し、surprise 行を後追い描画。
 *   - §38: above/inline/below を **色なし** ▲—▼ + 静的 dict (LLM narration ゼロ)。差分 % は出さない。
 *   - 会社 guidance basis=GAAP は consensus(non-GAAP baseline) と基準ミスマッチで backend が unknown 抑止済。
 *   - 金融セクターの売上比較は backend で抑止 (総収益 vs 純収益ミスマッチ、 v146 gate 流用)。
 *
 * 独立 component (GuidanceCard 無改変、 発光系 card を新規追加しない = frontend verdict)。
 */

import React, { useState, useEffect } from 'react';
import { fetchGuidanceSurprise } from '../api.js';

// ── 数値フォーマッタ (Python backend の数値をそのまま表示、 再計算しない) ──
// 売上は「億ドル」表記 (じっちゃま速報準拠、 2026-06-06 user 要望)。 旧 $1.4B (B 単位 1 桁) では
// 会社ガイダンスのレンジ ($1.436B〜$1.442B) が「$1.4B〜$1.4B」 と潰れて情報量ゼロになるため、
// USD は億ドル単位 (1 億ドル = 1e8) で出してレンジを分離する。 粒度はじっちゃま速報と一致させる:
//   - メイン数値・予測棒 (fmtMoney): 小数点 1 桁 (14.3億ドル) … コンセンサスは概数なので 1 桁
//   - 会社ガイダンスのレンジ (fmtMoneyRange): 小数点 2 桁 (14.36〜14.42億ドル) … レンジを潰さない
//   - $10B 以上 (500億ドル〜) は整数、 $1T 以上は兆ドルで冗長な .00 を回避
// 非 USD (日本株等) は従来の $B/M 表記を維持 (億ドルは USD 専用表記)。
function fmtOkuUsd(abs, sign, digits) {
  const oku = abs / 1e8; // 1 億ドル = 1e8
  if (oku >= 10000) return `${sign}${(oku / 10000).toFixed(2)}兆ドル`; // $1T 以上
  if (oku >= 100) return `${sign}${oku.toFixed(0)}億ドル`; // $10B 以上は整数 (500億ドル)
  return `${sign}${oku.toFixed(digits)}億ドル`; // $10B 未満は digits 桁 (14.36億ドル)
}

function fmtMoneyImpl(v, currency, digits) {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (currency === 'USD' || !currency) {
    if (abs >= 1e8) return fmtOkuUsd(abs, sign, digits); // 1 億ドル以上は億ドル/兆ドル表記
    return `${sign}$${(abs / 1e6).toFixed(0)}M`; // 1 億ドル未満は百万ドル ($340M 等)
  }
  // 非 USD は従来 $B/M 表記 (レンジ用は 2 桁、 メインは 1 桁)
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(digits >= 2 ? 2 : 1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)}M`;
  return `${sign}${Math.round(abs).toLocaleString()}`;
}

// メイン数値・予測棒用 (1 桁): 14.3億ドル
function fmtMoney(v, currency = 'USD') {
  return fmtMoneyImpl(v, currency, 1);
}

// 会社ガイダンスのレンジ用 (2 桁): 14.36〜14.42億ドル (レンジを潰さない)
function fmtMoneyRange(v, currency = 'USD') {
  return fmtMoneyImpl(v, currency, 2);
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

// ── 案B v172: 会社ガイダンスサプライズ行 (§38 色なし中立、 静的 dict、 LLM narration ゼロ) ──
// 「上方修正/上振れ/強気/視界良好」 は NO-GO (A=vs consensus では会社は consensus を修正していない = 事実誤り)。
const GUIDANCE_STATE_JP = {
  above: { sym: '▲', label: '会社ガイダンスはコンセンサスを上回る水準' },
  inline: { sym: '—', label: '会社ガイダンスはコンセンサスとおおむね同水準' },
  below: { sym: '▼', label: '会社ガイダンスはコンセンサスを下回る水準' },
};

function GuidanceSurpriseRow({ state, companyLow, companyHigh, consensus, fmt, fmtRange, currency }) {
  const meta = GUIDANCE_STATE_JP[state];
  if (!meta) return null; // unknown / null / undefined (lazy fetch 未達 or 抑止) → 非表示
  // レンジ・予想は 2 桁フォーマッタで揃える (14.36〜14.42 / 予想 14.30 が同粒度で並ぶ)。 fmtRange 未指定なら fmt fallback。
  const fmtR = fmtRange || fmt;
  const hasRange =
    companyLow != null && Number.isFinite(companyLow) && companyHigh != null && Number.isFinite(companyHigh);
  const companyStr = hasRange
    ? companyLow === companyHigh
      ? fmtR(companyLow, currency)
      : `${fmtR(companyLow, currency)}〜${fmtR(companyHigh, currency)}`
    : null;
  const consensusStr = consensus != null && Number.isFinite(consensus) ? fmtR(consensus, currency) : null;
  return (
    <div
      data-testid="guidance-surprise-row"
      style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)', display: 'flex', alignItems: 'baseline', gap: 6 }}
    >
      {/* ▲—▼ は方向記号のみ (色なし: neutral ink、 緑/赤/amber/cyan を将来予測に塗らない = §38) */}
      <span aria-hidden style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{meta.sym}</span>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
        {meta.label}
        {companyStr && consensusStr && (
          <span style={{ color: 'var(--text-muted)', marginLeft: 5, fontVariantNumeric: 'tabular-nums' }}>
            (会社 {companyStr} / 予想 {consensusStr})
          </span>
        )}
      </span>
    </div>
  );
}

function MetricBlock({ label, consensus, yoyPct, yearAgo, isMoney, currency, unreliable, turnaround, count, guidanceState, companyLow, companyHigh }) {
  const fmt = isMoney ? fmtMoney : fmtEps;
  // 会社ガイダンスのレンジは Money のみ 2 桁 (14.36〜14.42億ドル)。 EPS は fmtEps が既に 2 桁。
  const fmtRange = isMoney ? fmtMoneyRange : fmtEps;
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
      {/* 案B v172: 会社ガイダンスサプライズ (ForecastBars 直後、 独立行・破線 separator)。
          guidanceState が above/inline/below の時のみ表示 (unknown/抑止/lazy 未達は GuidanceSurpriseRow が null) */}
      {hasConsensus && (
        <GuidanceSurpriseRow
          state={guidanceState}
          companyLow={companyLow}
          companyHigh={companyHigh}
          consensus={consensus}
          fmt={fmt}
          fmtRange={fmtRange}
          currency={currency}
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
 * @param {string} [props.ticker] - 案B: 会社ガイダンスサプライズの lazy fetch 用 (未指定なら surprise 非表示)
 */
export default function ForwardOutlookSection({ forward, currency = 'USD', ticker }) {
  // 案B v172: 会社ガイダンスサプライズ (with_guidance=1) を非ブロック lazy fetch。
  //   forward (consensus) は即描画、 surprise 行は会社 8-K guidance 到着後に後追いで現れる。
  const [surpriseNq, setSurpriseNq] = useState(null);
  const [surpriseFy, setSurpriseFy] = useState(null); // v173 通期の会社ガイダンスサプライズ (lazy)
  const periodEnd = forward?.next_q?.period_end_date;
  const fyPeriodEnd = forward?.next_fy?.period_end_date;
  useEffect(() => {
    if (!ticker || (!periodEnd && !fyPeriodEnd)) {
      setSurpriseNq(null);
      setSurpriseFy(null);
      return;
    }
    let cancelled = false;
    fetchGuidanceSurprise(ticker)
      .then((g) => {
        if (cancelled) return;
        const nq = g?.forward?.next_q;
        // period が一致する時のみ採用 (lazy fetch 中の ticker / 期 切替えによる stale 表示を防止)
        if (nq && periodEnd && nq.period_end_date === periodEnd) setSurpriseNq(nq);
        else setSurpriseNq(null);
        // v173: 通期も同一 fetch から period 一致で採用 (next_fy の会社 FY ガイダンス)
        const nfy = g?.forward?.next_fy;
        if (nfy && fyPeriodEnd && nfy.period_end_date === fyPeriodEnd) setSurpriseFy(nfy);
        else setSurpriseFy(null);
      })
      .catch(() => {
        if (!cancelled) {
          setSurpriseNq(null);
          setSurpriseFy(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, periodEnd, fyPeriodEnd]);

  // static gate: backend が forward=null を返したら (コンセンサス取得不可) 何も描画しない。
  if (!forward || !forward.next_q) return null;
  const nq = forward.next_q;
  const nfy = forward.next_fy; // v173 通期 (null = 通期コンセンサス取得不可で非表示)
  const period = nq.period_label || '来期';
  const countEps = nq.analyst_count_eps;
  const countRev = nq.analyst_count_revenue;
  const hasFyData = nfy && (nfy.consensus_revenue != null || nfy.consensus_eps != null);
  // 会社ガイダンスサプライズが 1 つでも出ている時のみ citation に SEC 8-K を追記 (出ない時は誤出典回避)
  const _surpriseHasGuidance = (s) =>
    s && (GUIDANCE_STATE_JP[s.guidance_vs_consensus_eps] || GUIDANCE_STATE_JP[s.guidance_vs_consensus_rev]);
  const hasGuidanceSurprise = _surpriseHasGuidance(surpriseNq) || _surpriseHasGuidance(surpriseFy);

  return (
    <section
      data-testid="forward-outlook"
      // dogfood (2026-06-05): GuidanceCard (直上 sibling) は .panel-card で scroll arrival 発光 + hover 発光が
      // 効くが、 本 section は v146 で「発光系 card を新規追加しない」 方針で素 div だったため演出が欠落し
      // 「ここだけ後付け感」 と user 指摘。 → .panel-card 化で Pane3 標準の発光 idiom (useArrivalSpotlight が
      // .panel-card を自動 observe → .is-arriving scroll glow + .panel-card:hover glow) に統一。 §38/citation 等の
      // content ロジックは無改変 (発光は CSS class のみ、 数値・narration は触らない)。 design_recipes §C-1 準拠
      // (自前 border-radius 所有・overflow:hidden なし・入れ子 glow host なし)。
      className="panel-card"
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
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>前方視界 — 見通し</h4>
        {hasFyData && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>次の四半期 + 通期</span>}
      </div>
      <p style={{ margin: '0 0 4px', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
        アナリストコンセンサスと前年同期実績の比較 (事実値)
      </p>

      {/* 次の四半期 (period をサブ見出しに移動。 通期が下に続く時の主従を明確化) */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>次の四半期</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{period}</span>
      </div>
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
        guidanceState={surpriseNq?.guidance_vs_consensus_rev}
        companyLow={surpriseNq?.company_q_rev_low}
        companyHigh={surpriseNq?.company_q_rev_high}
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
        guidanceState={surpriseNq?.guidance_vs_consensus_eps}
        companyLow={surpriseNq?.company_q_eps_low}
        companyHigh={surpriseNq?.company_q_eps_high}
      />

      {/* v173: 通期 FY 見通し (next_fy がある時のみ、 next_q と同じ MetricBlock + 会社ガイダンス行を流用)。
          §38 ガード (色なし / 静的 dict / basis mismatch / 金融抑止 / アナリスト数) は backend で next_q と同条件適用済み。 */}
      {hasFyData && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '2px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>{nfy.period_label || '通期'}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>通期見通し</span>
          </div>
          <MetricBlock
            label="売上"
            consensus={nfy.consensus_revenue}
            yoyPct={nfy.rev_yoy_pct}
            yearAgo={nfy.year_ago_revenue}
            isMoney
            currency={currency}
            unreliable={nfy.rev_compare_unreliable}
            turnaround={false}
            count={nfy.analyst_count_revenue}
            guidanceState={surpriseFy?.guidance_vs_consensus_rev}
            companyLow={surpriseFy?.company_q_rev_low}
            companyHigh={surpriseFy?.company_q_rev_high}
          />
          <MetricBlock
            label="EPS"
            consensus={nfy.consensus_eps}
            yoyPct={nfy.eps_yoy_pct}
            yearAgo={nfy.year_ago_eps}
            isMoney={false}
            currency={currency}
            unreliable={false}
            turnaround={nfy.eps_turnaround}
            count={nfy.analyst_count_eps}
            guidanceState={surpriseFy?.guidance_vs_consensus_eps}
            companyLow={surpriseFy?.company_q_eps_low}
            companyHigh={surpriseFy?.company_q_eps_high}
          />
        </div>
      )}

      {/* 出典 (citation) + §5 免責 (常時表示・折りたたみ不可) */}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          出典: {forward.source || 'FMP analyst-estimates'}
          {hasGuidanceSurprise ? ' / 会社ガイダンス: SEC 8-K (EX-99.1)' : ''}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          ※来期予想はアナリスト各社の見通しの平均値であり、当社の予測ではありません。実績と乖離する場合があります。投資判断はご自身の責任で行ってください。
        </span>
      </div>
    </section>
  );
}
