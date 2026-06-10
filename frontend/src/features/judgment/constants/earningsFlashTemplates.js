/**
 * earningsFlashTemplates.js — 決算ハイライト (EarningsFlashSummary) の静的文言 SSOT
 *
 * @no-llm: この file の文言は静的テンプレート専用。LLM 生成文字列を混ぜない (Hallucination Guard)。
 *
 * §38 (断定的判断の提供) / §5 (優良誤認) ガード:
 *   - 事実の枠 (「予想 → 結果」「前年比」) のみ。判断語・最上級・断定的将来予測は禁止
 *     (具体的 BAN 語リストは scripts/pre-commit-hook.sh Check 7 が SSOT)。
 *   - 個人名 (クラス課題提出物のため) を含めない。
 *   - pre-commit hook Check 7 がこの file への判断語 staged 追加を BLOCK する。
 *
 * 文言を component に直書きせず本 file に分離する理由 (6体合議 Anthropic verdict):
 *   §38 監査の grep 対象を 1 file に限定し、レビュー・機械検査を単純化する。
 *
 * 来期の会社ガイダンス vs コンセンサスの状態語は ForwardOutlookSection の GUIDANCE_STATE_JP を
 * import 流用すること (本 file に複製しない — 文言 drift = Trust Cliff 防止、金融 verdict)。
 */

// 行ラベル (uppercase 階層は component 側の style で付与)
export const FLASH_LABELS = {
  eps: 'EPS',
  revenue: '売上高',
  nextQ: '来期',
};

// 値の接続語 (事実の枠のみ)
export const FLASH_TERMS = {
  estimate: '予想',
  actual: '結果',
  vsEstimate: '予想比',
  yoy: '前年比',
  consensusEps: 'コンセンサス EPS',
  consensusRev: '売上',
  noData: '—(データなし)',
};

/**
 * 予実差 % の表示文字列 (backend 計算済 surprise_pct を読むだけ、frontend 再計算禁止 =
 * 銀行/与信の revenue basis mismatch ガードすり抜け防止、feedback_revenue_basis_mismatch)。
 * @param {number|null} surprisePct
 * @returns {string|null}
 */
export function fmtSurprisePct(surprisePct) {
  if (surprisePct == null || !Number.isFinite(surprisePct)) return null;
  const sign = surprisePct > 0 ? '+' : '';
  return `${FLASH_TERMS.vsEstimate} ${sign}${surprisePct.toFixed(1)}%`;
}

/**
 * 前年比 % の表示文字列 (backend 計算済 revenue_yoy_pct / rev_yoy_pct を読むだけ)。
 * @param {number|null} yoyPct
 * @returns {string|null}
 */
export function fmtYoyPct(yoyPct) {
  if (yoyPct == null || !Number.isFinite(yoyPct)) return null;
  const sign = yoyPct > 0 ? '+' : '';
  return `${FLASH_TERMS.yoy} ${sign}${yoyPct.toFixed(1)}%`;
}
