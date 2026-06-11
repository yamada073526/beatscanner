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
  segment: '部門別',
  grossMargin: '粗利率',
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

/**
 * 四半期グロスマージン (粗利率) の表示文字列 (backend 計算済 gross_margin_pct を読むだけ)。
 * backend で sector gate (金融/REIT/保険) + 妥当域 0<ratio<1.0 済 → ここは整形のみ (frontend 再計算禁止)。
 * 決算ハイライト Phase2 (?flash_gm=1 opt-in)。事実の実値のみ (判断語なし、§38/§5)。
 * @param {number|null} pct
 * @returns {string|null}
 */
export function fmtGrossMargin(pct) {
  if (pct == null || !Number.isFinite(pct)) return null;
  return `${pct.toFixed(1)}%`;
}

/**
 * ガイダンス履歴基盤 Sprint 4 (6体合議 §10 条件1/15): 前回会社ガイダンス比の修正判定バッジ。
 * 「会社が自らガイダンス数値を変更した客観的事実」 の分類のみ — §38 はこの文脈に限り
 * 修正語を許可 (pre-commit Check 7 の行末注釈ホワイトリスト)。
 * ⚠️ この dict を現コンセンサス比 (GUIDANCE_STATE_JP) の表示に流用してはならない (事実誤りになる)。
 */
export const GUIDANCE_REVISION_JP = {
  raised: { sym: '↑', label: '前回比 上方修正' }, // @company-guidance-revision
  maintained: { sym: '—', label: '前回比 据え置き' }, // @company-guidance-revision
  lowered: { sym: '↓', label: '前回比 下方修正' }, // @company-guidance-revision
};

/**
 * 発表時点コンセンサス比サプライズ (snapshot join、時点ミックス誤読の根治)。
 * 語彙は GUIDANCE_STATE_JP (上回る/同水準/下回る) と統一、「修正」 語は使わない (会社は
 * consensus を修正していない)。stale snapshot (発表から 10 日超) は backend flag で非表示。
 */
export const GUIDANCE_PIT_CONSENSUS_JP = {
  above: { sym: '↑', label: '発表時予想を上回る' },
  inline: { sym: '—', label: '発表時予想と同水準' },
  below: { sym: '↓', label: '発表時予想を下回る' },
};

/**
 * 来期売上ガイダンスの並置行 (決算速報 note 形式: 「現コンセンサス +9.3% に対し会社ガイダンス +14.0〜17.0% (発表時)」)。
 * 全て backend 計算済値 (rev_yoy_pct / company_q_rev_yoy_low_pct / high) を読むだけ。
 * §38: コンセンサスと会社提示の事実並置のみ。「上方修正」 等の評価語は使わない
 * (consensus 比は会社が consensus を修正した事実ではない、ForwardOutlookSection NO-GO 判定踏襲)。
 * v200 時点明示 (user 確定 2026-06-11): FMP コンセンサスは現在値・会社ガイダンスは発表時点の値で
 * **時点が異なる** (決算後にアナリストが引き上げると会社側が低く見える、SNOW で実例)。
 * 「現コンセンサス」「(発表時)」 で時点を明示し、上回る/下回るの判定記号は付けない
 * (発表時点コンセンサスの snapshot 蓄積基盤が完成したら正確な「発表時比」 で判定を復活させる)。
 * @returns {string|null} 3 値のいずれか欠落で null (行ごと非表示、捏造しない)
 */
export function fmtGuidanceRevLine(consYoyPct, lowPct, highPct) {
  if ([consYoyPct, lowPct, highPct].some((v) => v == null || !Number.isFinite(v))) return null;
  const s = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
  const range = lowPct === highPct ? s(lowPct) : `${s(lowPct)}〜${s(highPct)}`;
  // v200 round3 (user 指摘「時系列がパッと見でわかりづらい」): 時系列順 (発表時 → 現在) に並べ、
  // 「→」 で時間の流れを示す (上段の「予想 → 結果」 と同じ読み方)。 本格的な時系列表現は
  // ガイダンス履歴基盤 Sprint 4 で再設計 (6体合議 gate)。
  return `売上ガイダンス ${range} (発表時) → 現コンセンサス ${s(consYoyPct)}`;
}
