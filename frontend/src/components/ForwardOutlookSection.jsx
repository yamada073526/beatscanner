/**
 * ForwardOutlookSection.jsx — 前方視界 (来期コンセンサス YoY) v146 + ガイダンスサプライズ v172
 *
 * じっちゃまプロトコル条件4「来期コンセンサスが前年同期比を超えているか / 前方は視界良好か」を補う。
 * 「ガイダンス進捗 (直近=過去のバックミラー)」の直下に置き、過去 → 未来の視線誘導をする。
 *
 * 6 体合議 (2026-06-01) verdict 反映:
 *   - §38: verdict ラベル (強気/弱気/視界良好) を一切出さない。来期 YoY は **色なし** (緑/赤を塗らない、
 *     将来への着色 = 我々の評価 = 断定的判断とみなされうる)。方向は ↑↓ + 中立トーンの予測棒のみ (v200 で ▲▼→↑↓)。
 *   - backend (guidance/basic の `forward`) の数値・flag を **読むだけ** (frontend 再計算禁止、
 *     売上ミスマッチガードすり抜け防止 = Anthropic/frontend verdict)。
 *   - §5 免責文言を常時表示 + 出典 (FMP analyst-estimates) + アナリスト数を明示 (citation)。
 *   - coverage 欠落・near-zero・赤字ベースは backend で None 化済 → 「—」/ 注記で graceful。
 *
 * 案B v172 ガイダンスサプライズ (会社ガイダンス vs consensus、 じっちゃま速報の主役 = 来期 EPS):
 *   - 会社 8-K ガイダンス (q_eps/q_revenue) は SEC fetch (cold 5-15s) を含むため guidance/basic を律速しない。
 *     → ticker 指定時に `?with_guidance=1` を **非ブロック lazy fetch** し、surprise 行を後追い描画。
 *   - §38: above/inline/below を **色なし** ↑—↓ + 静的 dict (LLM narration ゼロ)。差分 % は出さない。
 *   - 会社 guidance basis=GAAP は consensus(non-GAAP baseline) と基準ミスマッチで backend が unknown 抑止済。
 *   - 金融セクターの売上比較は backend で抑止 (総収益 vs 純収益ミスマッチ、 v146 gate 流用)。
 *
 * 独立 component (GuidanceCard 無改変、 発光系 card を新規追加しない = frontend verdict)。
 */

import React, { useState, useEffect } from 'react';
import { ChevronRight, CalendarRange, Info, BookOpen, Lightbulb, AlertTriangle } from 'lucide-react';
import { fetchGuidanceSurprise } from '../api.js';
import { useCountUp, COUNT_UP_MS } from '../hooks/useCountUp.js';
import { useInViewOnce } from '../hooks/useInViewOnce.js';
import InfoModal from './InfoModal.jsx';

// ── 会社の次期見通し (sec_guidance_text) の md → JSX レンダラ。 改善3 (2026-06-06) で GuidanceCard から移植。
//    sec_guidance_text は SEC 8-K の会社ガイダンスを Hallucination Guard 4 層 (BAD-5/6 + source_quote 逐語 +
//    blocklist sanitize) で通した安全テキスト。 重複していた GuidanceCard「次期見通し」 を前方視界に集約。 ──
const renderBold = (line) => {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
};

const renderGuidanceText = (text) => {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return null;
    if (/^[・•\-]/.test(line.trim())) {
      return (
        <li key={i} style={{ marginBottom: '6px', lineHeight: '1.6', fontSize: '0.9em', listStyle: 'none', paddingLeft: '0', display: 'flex', gap: '6px' }}>
          <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>・</span>
          <span>{renderBold(line.replace(/^[・•\-]\s*/, ''))}</span>
        </li>
      );
    }
    if (/[：:]\s*$/.test(line.trim())) {
      return (
        <p key={i} style={{ fontWeight: 'bold', marginTop: '10px', marginBottom: '4px', fontSize: '0.9em' }}>
          {renderBold(line)}
        </p>
      );
    }
    return (
      <p key={i} style={{ fontSize: '0.9em', lineHeight: '1.6' }}>
        {renderBold(line)}
      </p>
    );
  }).filter(Boolean);
};

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
  // v200 (user 要望 2026-06-11): $10B 以上も小数 1 桁 (1094.6億ドル)。 旧整数丸め (1095億ドル) は
  // 決算速報 note の粒度 (1094.6) と不一致だった。 大型株のレンジ分離にも 1 桁で十分。
  if (oku >= 100) return `${sign}${oku.toFixed(1)}億ドル`;
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
// v199 flash summary (6体合議 金融/マーケ条件): EarningsFlashSummary が import 流用 (同一 formatter =
// サマリーと決算タブの数値表記が構造的に一致する single source、 Trust Cliff 防止)。
export function fmtMoney(v, currency = 'USD') {
  return fmtMoneyImpl(v, currency, 1);
}

// 会社ガイダンスのレンジ用 (2 桁): 14.36〜14.42億ドル (レンジを潰さない)
function fmtMoneyRange(v, currency = 'USD') {
  return fmtMoneyImpl(v, currency, 2);
}

// v199 flash summary: fmtMoney と同じく export (EarningsFlashSummary と 1:1 mirror)。
export function fmtEps(v, currency = 'USD') {
  if (v == null || !Number.isFinite(v)) return '—';
  const sym = currency === 'USD' || !currency ? '$' : '';
  return `${v < 0 ? '-' : ''}${sym}${Math.abs(v).toFixed(2)}`;
}

// 前年同期比バッジ — ↑↓ + 絶対値 (色なし: 緑/赤を使わず neutral 単色、 §38)。
// v200 (user 指摘 2026-06-11): ▲▼ → ↑↓ に変更。日本の会計表記では ▲=マイナスのため、決算文脈で
// ▲=上 として使うと誤読リスク (Trust Cliff)。チャート tooltip の ↑↓ idiom と統一。
// user dogfood (2026-06-06):「前年比 % がこのセクションで一番重要 (CRWD/SNOW が買われた理由 = 来期成長率)」
// → 4 体合議で前年比を主役化。 §38 で色は使えないため size + weight + neutral ink のみで強調
// (% を 19px/800 + neutral primary)。 qa verdict: 独立行昇格はせず inline 強調に留める
// (抑止箇所 = 金融売上 / 通期EPS / 低カバレッジ で pct=null → null return される既存挙動を維持し空欄崩れを防ぐ)。
function YoYInline({ pct }) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const up = pct >= 0;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
      <span aria-hidden style={{ fontSize: 13, fontWeight: 700 }}>{up ? '↑' : '↓'}</span>
      <strong style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>{Math.abs(pct).toFixed(1)}%</strong>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400 }}>前年比</span>
    </span>
  );
}

// 予測棒: 前年同期 (baseline) と 来期予想 を中立トーンで対比 (色なし、 長さの差で成長を視覚化)
// 予測棒の 1 行 (module-level)。 ★inline 関数にすると ForecastBars 再 render 毎に React が remount し、
//   width transition (0→w%) が走らず grow しない (v173.6 dogfood で発覚)。 必ず module-level に置くこと。
function ForecastBarRow({ label, value, w, strong, delay = 0, inView }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 64, flexShrink: 0, fontSize: 10, color: 'var(--text-muted)' }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-pill, 999px)', overflow: 'hidden' }}>
        <div
          style={{
            // user (2026-06-06): view 内入場でバーが 0 → 最終幅へ「伸びる」 アニメ (グラフが伸びるのが面白い)。
            //   §38: 色なし neutral ink のまま。 reduced-motion は index.css global 抑止 (§11-E v51) で吸収。
            width: inView ? `${w}%` : '0%',
            height: '100%',
            background: strong ? 'var(--text-secondary)' : 'var(--text-muted)',
            opacity: strong ? 0.85 : 0.45,
            borderRadius: 'var(--radius-pill, 999px)',
            transition: 'width 1s cubic-bezier(0.22, 1, 0.36, 1)',
            transitionDelay: `${delay}ms`,
          }}
        />
      </div>
      <span style={{ width: 64, flexShrink: 0, fontSize: 11, fontWeight: 600, textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function ForecastBars({ yearAgo, consensus, yearAgoLabel, consensusLabel, yearAgoRowLabel = '前年同期', inView }) {
  if (yearAgo == null || consensus == null || !Number.isFinite(yearAgo) || !Number.isFinite(consensus)) return null;
  const maxv = Math.max(Math.abs(yearAgo), Math.abs(consensus)) || 1;
  const wYa = Math.max(2, (Math.abs(yearAgo) / maxv) * 100);
  const wCon = Math.max(2, (Math.abs(consensus) / maxv) * 100);
  return (
    <div style={{ display: 'grid', gap: 5, marginTop: 8 }}>
      <ForecastBarRow label={yearAgoRowLabel} value={yearAgoLabel} w={wYa} strong={false} delay={0} inView={inView} />
      <ForecastBarRow label="来期予想" value={consensusLabel} w={wCon} strong={true} delay={140} inView={inView} />
    </div>
  );
}

// ── 案B v172: 会社ガイダンスサプライズ行 (§38 色なし中立、 静的 dict、 LLM narration ゼロ) ──
// 「上方修正/上振れ/強気/視界良好」 は NO-GO (A=vs consensus では会社は consensus を修正していない = 事実誤り)。
// 文字壁改善 (2026-06-06、 4体合議): 「コンセンサスを上回る水準」→「予想を上回る」 に圧縮。 金融 verdict
// 「会社ガイダンスは一次情報なので削除不可・圧縮のみ可」 を踏襲し、 意味 (会社 vs 市場予想の方向) は保持。
// v199 flash summary (6体合議 金融必須条件): export して EarningsFlashSummary が import 流用。
// 文言を 2 箇所で別管理すると drift して「同じ状態に別の言い回し」 = Trust Cliff になるため dict を single source 化。
// v200 (user 指摘 2026-06-11): sym を ▲▼ → ↑↓ に変更 (会計表記の ▲=マイナスとの衝突回避)。
export const GUIDANCE_STATE_JP = {
  above: { sym: '↑', label: '会社ガイダンスは予想を上回る' },
  inline: { sym: '—', label: '会社ガイダンスは予想と同水準' },
  below: { sym: '↓', label: '会社ガイダンスは予想を下回る' },
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
      {/* ↑—↓ は方向記号のみ (色なし: neutral ink、 緑/赤/amber/cyan を将来予測に塗らない = §38) */}
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

function MetricBlock({ label, consensus, yoyPct, yearAgo, isMoney, currency, unreliable, turnaround, count, guidanceState, companyLow, companyHigh, yearAgoEstimate, inView }) {
  const fmt = isMoney ? fmtMoney : fmtEps;
  // 会社ガイダンスのレンジは Money のみ 2 桁 (14.36〜14.42億ドル)。 EPS は fmtEps が既に 2 桁。
  const fmtRange = isMoney ? fmtMoneyRange : fmtEps;
  // カウントアップ (3体合議 2026-06-06): 来期 consensus メイン数値のみ。 §38 で来期=将来予測のため
  //   duration 400ms (今期ゲージ 700ms より短く「現れる」 寄りの演出)、 中立色維持。 前年比%・会社ガイダンス・
  //   予測棒ラベルは静的 (二次情報のうるささ回避 + マイナス値/null 点滅回避 = ui/qa verdict)。 null は即固定。
  const animConsensus = useCountUp(inView ? consensus : null, { duration: COUNT_UP_MS, digits: isMoney ? 0 : 2, forceFromZero: true });
  const hasConsensus = consensus != null && Number.isFinite(consensus);
  return (
    <div data-testid={`forward-metric-${isMoney ? 'revenue' : 'eps'}`} style={{ padding: '10px 0 10px 10px', borderTop: '1px solid var(--border)', borderLeft: '3px solid color-mix(in srgb, var(--color-gold) 35%, var(--border))' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
        {!hasConsensus ? (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>アナリストカバレッジなし</span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(inView ? animConsensus : 0, currency)}</span>
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
          yearAgoRowLabel={yearAgoEstimate ? '前年(予想)' : '前年同期'}
          inView={inView}
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
// ── 「来期 コンセンサスとは」 説明モーダル (2026-06-12 user 要望: 旧 GuidanceInfoModal にあった
//    「ガイダンスとは何か / なぜ注目されるか」 を将来見通しの本来の置き場であるこちらへ移設)。
//    §38 ガード: 旧文言の断定 (「株価の上昇を決定づける」「株価上昇に直結」) は使わない —
//    「〜することがあります / 〜と考えられています」 の事実・一般論 hedge + 免責で丸める。
//    「上方修正/下方修正」 の語も使わない (consensus 文脈、CONSENSUS_DRIFT_JP と同じ「引き上げ/引き下げ」 語彙)。
//    section marker は lucide outline (絵文字は使わない、icon 規則 2026-06-12)。
function ForwardOutlookInfoModal({ onClose }) {
  const headStyle = 'mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400';
  return (
    <InfoModal title="来期 コンセンサスとは" onClose={onClose}>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className={headStyle}><Info size={13} strokeWidth={2} aria-hidden="true" /> 概要</p>
        <p className="text-sm leading-relaxed text-slate-700">
          このセクションは、来四半期・来年通期について、<strong>アナリスト各社の予想の平均（コンセンサス）</strong>と、<strong style={{ color: 'rgb(56, 189, 248)' }}>会社自身が公表した業績見通し（ガイダンス）</strong>を表示します。いずれも将来に関する予想であり、確定した実績ではありません。
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className={headStyle}><BookOpen size={13} strokeWidth={2} aria-hidden="true" /> ガイダンスとは</p>
        <p className="text-sm leading-relaxed text-slate-700">
          ガイダンスとは、企業が決算発表などの場で公式に示す、来期や通期の「売上高」「EPS（一株当たり利益）」の見通しです。自社の事業を最もよく知る経営陣が示す数字として、決算発表で特に注目される項目のひとつです。一般に、達成を見込める水準として保守的に提示される傾向があるとされます。
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className={headStyle}><Lightbulb size={13} strokeWidth={2} aria-hidden="true" /> なぜ注目されるか</p>
        <p className="text-sm leading-relaxed text-slate-700">
          アナリストは、会社のガイダンスを重要な手がかりとして自らの予想を更新します。ガイダンスがコンセンサスを上回る（あるいは下回る）と、アナリスト予想の引き上げ・引き下げにつながることがあり、こうした<strong>コンセンサスの変化は株価の変動要因のひとつと考えられています</strong>。だからこそ、足元の実績（今期の Beat / Miss）とあわせて、来期の見通しを確認する価値があります。
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className={headStyle}><AlertTriangle size={13} strokeWidth={2} aria-hidden="true" /> ご注意</p>
        <p className="text-sm leading-relaxed text-slate-700">
          表示される来期予想はアナリスト各社の見通しの平均値であり、当社の予測ではありません。実績と大きく乖離する場合があります。投資判断はご自身の責任で行ってください。
        </p>
      </div>
    </InfoModal>
  );
}

// Phase 1a (来期拡充 SPEC §7): 会社の粗利率ガイダンス行。会社公表値 (8-K 逐語 verify 済) の転記のみで
// consensus 比較はせず、全中立色 (§38: 将来見通し)。type(gross/operating/net) → label は LLM 生成でなく
// 静的 dict で和訳 (条件1: BAD-1 英語混在/§38 の新穴を塞ぐ)。欠損 (low/high なし) は非表示で捏造しない。
const FORWARD_MARGIN_TYPE_JP = { gross: '粗利率', operating: '営業利益率', net: '純利益率' };
function GuidanceMarginRow({ low, high, type }) {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  const label = FORWARD_MARGIN_TYPE_JP[type] || '粗利率';
  const rangeStr = low === high ? `${low.toFixed(1)}%` : `${low.toFixed(1)}〜${high.toFixed(1)}%`;
  return (
    <div
      data-testid="forward-margin-guidance"
      style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}
    >
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
        {label} <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>会社見通し</span>
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{rangeStr}</span>
    </div>
  );
}

export default function ForwardOutlookSection({ forward, currency = 'USD', ticker, secNarrativeText, secNarrativeSource, headingVariant = 'l2' }) {
  // v191 (3体合議 B): v5 ファンダ章「決算」 L2 冠の傘下で「来期 コンセンサス」 を L3 サブ見出しに降格 (今期と同格、反復原則 design_recipes §C-11)。
  //   §38 免責・将来予測ガード・数値ロジックは不触。headingVariant 省略時 'l2' で v4/legacy 完全不変。
  const isL3 = headingVariant === 'l3';
  // 案B v172: 会社ガイダンスサプライズ (with_guidance=1) を非ブロック lazy fetch。
  //   forward (consensus) は即描画、 surprise 行は会社 8-K guidance 到着後に後追いで現れる。
  const [surpriseNq, setSurpriseNq] = useState(null);
  const [secOpen, setSecOpen] = useState(false); // 改善3: 会社の次期見通し (sec_guidance_text) 折りたたみ
  const [secHover, setSecHover] = useState(false); // v192 (A-2 user dogfood): 次期見通しトグルの hover feedback (クリック可を示す)
  const [showInfo, setShowInfo] = useState(false); // 2026-06-12: 「来期 コンセンサスとは」 説明モーダル (？ボタン)
  const [surpriseFy, setSurpriseFy] = useState(null); // v173 通期の会社ガイダンスサプライズ (lazy)
  // カウントアップ view 内発火 (dogfood 2026-06-06: mount 時発火だと scroll 前に完了して見えない → IO で入場時発火)
  // count-up / バー grow の view 内入場トリガー (v173.5 検証済 callback ref パターンを共通 hook 化)
  const [sectionRef, inView] = useInViewOnce();
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
      ref={sectionRef}
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
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <h4 style={isL3 ? { margin: 0, fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' } : { margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>来期 コンセンサス</h4>
          {/* 「？」 = セクション解説モーダル (GuidanceCard ？ idiom 流用、2026-06-12 user 要望で新設) */}
          <button
            onClick={() => setShowInfo(true)}
            className="inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-[9px] font-bold transition-colors"
            style={{
              background: 'rgba(34,211,238,0.15)',
              color: 'rgb(56, 189, 248)',
              border: '1px solid rgba(34,211,238,0.4)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34,211,238,0.30)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(34,211,238,0.15)'; }}
            aria-label="来期コンセンサスの説明を表示"
          >
            ？
          </button>
        </span>
        {hasFyData && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>次の四半期 + 通期</span>}
      </div>
      {showInfo && <ForwardOutlookInfoModal onClose={() => setShowInfo(false)} />}
      {/* 文字壁改善 (2026-06-06): サブタイトル「アナリストコンセンサスと前年同期実績の比較」 は削除。
          各 YoYInline の「前年比」 ラベル + ForecastBars の「前年同期/来期予想」 ラベル + 末尾の出典/免責で
          文脈は十分担保される (qa verdict: 削除可テキスト)。 */}
      {/* v192 (B-1a): 次の四半期/通期 の中間見出しを 11px/600/muted/uppercase のキャプションに格下げ
          (今期ラベルと文字語彙統一、構成の非対称解消)。
          v193 fix: v192 の replace_all がインデント差で「次の四半期」 側を取りこぼし「2027年通期」 のみ格下げ済の
          非対称になっていた (user dogfood 2026-06-09) → 両者を同一スタイルに揃え対称化。 */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 8, marginBottom: 1 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>次の四半期</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{period}</span>
      </div>
      <div>
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
          inView={inView}
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
          inView={inView}
        />
        {/* Phase 1a: 会社の粗利率ガイダンス (lazy fetch の surpriseNq から、欠損は非表示)。§38 中立色。 */}
        <GuidanceMarginRow
          low={surpriseNq?.company_q_margin_low_pct}
          high={surpriseNq?.company_q_margin_high_pct}
          type={surpriseNq?.company_q_margin_type}
        />
      </div>

      {/* v173: 通期 FY 見通し (next_fy がある時のみ)。 改善4: グループ間を marginTop 18 + 1px border で
          分離 (太さでなく空白で区別 = Aman 調)、 見出しを 13px/700/primary で次Qと対称に。 §38 ガード
          (色なし / 静的 dict / basis mismatch / 金融抑止 / アナリスト数) は backend で next_q と同条件適用済み。 */}
      {hasFyData && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{nfy.period_label || '通期'}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>通期見通し</span>
          </div>
          <div>
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
              inView={inView}
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
              yearAgoEstimate={nfy.year_ago_eps_is_estimate}
              inView={inView}
            />
          </div>
        </div>
      )}

      {/* 改善3 (2026-06-06): 会社の次期見通し (SEC 8-K 自然文) を GuidanceCard から移植・集約 (重複解消)。
          sec_guidance_text は HG 4 層通過済みで §38 安全。 折りたたみで「会社が何と言ったか」 全文を保持
          (マージン/ARR 等 構造化されていない情報も含む)。 GuidanceCard 側の重複「次期見通し」 は削除。 */}
      {secNarrativeText && (
        // v202 (2026-06-11 user feedback): ① 主張強化 — bare bg だと素通りされるため 1px 枠で resting lift +
        //   hover で bg-hover + cyan(brand=中立、§38) 枠を強め、クリック可を明確化。② 右端「展開で全文/閉じる」
        //   テキストは chevron 回転と冗長のため削除。③ secNarrativeSource (SEC 8-K 出典) は常時表示が
        //   やかましいため展開部内へ移設。④ 改名「会社の次期見通し」→「会社の見通し（原文）」(展開=原文 を予見)。
        <div
          onMouseEnter={() => setSecHover(true)}
          onMouseLeave={() => setSecHover(false)}
          style={{
            marginTop: 14,
            background: secHover ? 'var(--bg-hover, var(--bg-card))' : 'var(--bg-subtle)',
            border: `1px solid ${secHover ? 'color-mix(in srgb, var(--color-accent) 50%, var(--border))' : 'var(--border)'}`,
            borderRadius: 8,
            padding: '12px 16px',
            transition: 'background 160ms ease, border-color 160ms ease',
          }}
        >
          <button
            type="button"
            onClick={() => setSecOpen((v) => !v)}
            aria-expanded={secOpen}
            data-testid="sec-guidance-summary"
            style={{ cursor: 'pointer', width: '100%', background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none', textAlign: 'left' }}
          >
            <CalendarRange size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              会社の見通し（原文）
            </span>
            <ChevronRight size={14} strokeWidth={2} aria-hidden="true" style={{ marginLeft: 'auto', color: 'var(--text-muted)', flexShrink: 0, transition: 'transform 0.3s var(--ws-ease-standard, cubic-bezier(0.22, 1, 0.36, 1))', transform: secOpen ? 'rotate(90deg)' : 'rotate(0deg)' }} />
          </button>
          <div style={{ display: 'grid', gridTemplateRows: secOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.32s var(--ws-ease-standard, cubic-bezier(0.22, 1, 0.36, 1))' }}>
            <div style={{ overflow: 'hidden' }}>
              <div className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)', paddingTop: 12, maxHeight: 280, overflowY: 'auto' }}>
                <ul style={{ paddingLeft: 0, margin: 0 }}>
                  {renderGuidanceText(secNarrativeText)}
                </ul>
                {secNarrativeSource && (
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)', marginTop: 10, letterSpacing: '0.04em' }}>{secNarrativeSource}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 出典 (citation) + §5 免責 (常時表示・折りたたみ不可) */}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          出典: {forward.source || 'FMP analyst-estimates'}
          {hasGuidanceSurprise ? ' / 会社ガイダンス: SEC 8-K (EX-99.1)' : ''}
        </span>
        {nfy?.year_ago_eps_is_estimate && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            ※通期EPSの「前年(予想)」はアナリストコンセンサス (実績収束値) で、 報告 EPS とは確定状況が異なります。
          </span>
        )}
        <span style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          ※来期予想はアナリスト各社の見通しの平均値であり、当社の予測ではありません。実績と乖離する場合があります。投資判断はご自身の責任で行ってください。
        </span>
      </div>
    </section>
  );
}
