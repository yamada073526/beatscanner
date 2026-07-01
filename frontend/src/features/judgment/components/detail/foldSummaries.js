/**
 * foldSummaries.js — Pane 3 「その他」fold (8Q決算反応 / Insider取引) の collapsed summary 純関数。
 *
 * v313 Sprint S3 (C2、 AUDIT_pane3-L0-fidelity_2026-07-01.md §⑤ c1/d1): 折りたたみ時も右側に
 * 非LLM実績数値を表示 (mockup の f-sum 動的復元)。 JudgmentDetail.jsx から分離することで、
 * 巨大 component (StockPriceChart 等 重量 import 持ち) を import せずに node env で単体テスト可能にする。
 *
 * memory anchors:
 *   - feedback_llm_calc_separation.md (数値は backend 算出、 本ファイルは表示整形のみ)
 *   - feedback_accordion_collapsed_unmount.md (fold summary は親が prefetch 済の非LLM source を読む)
 */

/** 過去8Q決算反応 fold の summary。 データ 0 件時は null (呼び出し側で静的文言へ fallback)。 */
export function formatEarningsReactionSummary(summary) {
  if (!summary) return null;
  const beatCount = summary.beat_count || 0;
  const missCount = summary.miss_count || 0;
  if (beatCount === 0 && missCount === 0) return null;
  const fmtPct = (v) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : '—');
  const parts = [];
  if (beatCount > 0) parts.push(`Beat ${beatCount}回 平均${fmtPct(summary.avg_beat_return_pct)}`);
  if (missCount > 0) parts.push(`Miss ${missCount}回 平均${fmtPct(summary.avg_miss_return_pct)}`);
  return parts.join(' ・ ');
}

/**
 * Insider 取引 fold の summary。 直近90日の Form4 買付 (type='P') のみ集計 (非LLM)。
 * 買付が無い期間は null (呼び出し側で静的文言へ fallback、 「0件」を敢えて出して noise にしない)。
 */
export function formatInsiderSummary(form4, now = Date.now()) {
  if (!Array.isArray(form4) || form4.length === 0) return null;
  const cutoff = now - 90 * 86400000;
  let count = 0;
  let total = 0;
  for (const r of form4) {
    if (r?.type !== 'P') continue;
    const t = r?.date ? new Date(r.date).getTime() : NaN;
    if (!Number.isFinite(t) || t < cutoff) continue;
    count += 1;
    total += r.value || 0;
  }
  if (count === 0) return null;
  const fmtUSD = (v) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
    return `$${Math.round(v)}`;
  };
  return `直近90日 買付${count}件 ${fmtUSD(total)}`;
}
