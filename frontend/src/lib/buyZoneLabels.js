/**
 * buyZoneLabels.js — MarketSurge 互換 buy zone (Cup-Handle pivot + 過去 breakout support) の静的 dictionary.
 *
 * SPEC v126 R8-3 (MarketSurge 互換テクニカルシグナル):
 *   - 既存 cup_handle_signals テーブル (pivot.price) + StockPriceChart の pivot ReferenceLine 連動
 *   - 静的 dictionary narration (LLM 不使用、 SellZoneCard と同 idiom)
 *   - 金商法 §38 (断定的判断提供) / 景表法 §5 (優良誤認) safe
 *   - 金融アナリスト Opus verdict (2026-05-29): user 原文「上抜けたら買い」 「これ以上下がらない」 BAN、
 *     「目安」 「IBD ルールでは」 「support level の目安」 等の客観表現のみ
 *
 * Zone 判定基準 (Phase 2 frontend):
 *   - cup_pivot: cup_handle_signals.state === 'formation' (カップ形成中、 まだ breakout してない)
 *     → narration「IBD ルールの pivot price 目安」 + 「上抜けが新たな base breakout の目安として紹介」
 *   - breakout_support: cup_handle_signals.state === 'breakout_confirmed' (過去 breakout 完了済)
 *     → narration「直前 breakout price の support 目安」 (Phase 3 で backend 拡張後)
 *   - unknown: pivot.price / breakout.price が取得不可
 *
 * memory anchors:
 *   - feedback_sell_zone_static_dict.md (sell zone narration 静的 dict、 LLM 拡張永久 BAN)
 *   - feedback_llm_calc_separation.md (narration 静的、 数値 Python aggregator)
 *   - feedback_citation_required.md (出典 IBD / O'Neil 著 必須)
 *   - project_cup_handle_design.md (cup-handle SSOT)
 */

export const BUY_ZONE_LABEL_JP = {
  cup_pivot:         'Cup-Handle pivot 目安',
  breakout_support:  '直前 breakout support 目安',
  unknown:           '判定不可',
};

/**
 * narration 2 field 構造 (SellZoneCard と同 idiom、 R5 hotfix で確立):
 *   conclusion: 結論 (visual anchor、 font 13.5px 600)
 *   detail: 理由 + 出典を 1 行 muted (text-muted 11px)
 */
export const BUY_ZONE_DESC_JP = {
  cup_pivot: {
    conclusion: 'IBD ルールの pivot price 目安です。',
    detail: 'O\'Neil 著では Cup-with-Handle の pivot price (= カップ完成水準) 上抜けが新たな base breakout の目安として紹介されています。 出来高 40%+ 増加を伴う上抜けが confirmation 条件とされています。',
  },
  breakout_support: {
    conclusion: '直前 breakout price の support 目安です。',
    detail: 'IBD ルールでは前回の base breakout price が次回の support level の目安として知られています。 ただし support 割れは pattern failure の signal にもなり得るため、 出来高 + 終値ベースの確認が必要とされています。',
  },
  unknown: {
    conclusion: 'pivot / support の判定を保留しています。',
    detail: 'Cup-Handle pattern が検出されていない、 または pivot price が取得できません。',
  },
};

/**
 * Cup-Handle pattern state から buy zone type を分類.
 * @param {string} state - 'formation' | 'breakout_confirmed' | 'failed' | null
 * @returns {'cup_pivot'|'breakout_support'|'unknown'}
 */
export function classifyBuyZone(state) {
  if (state === 'formation') return 'cup_pivot';
  if (state === 'breakout_confirmed') return 'breakout_support';
  return 'unknown';
}

/**
 * 強制 footer 文 (金融アナリスト Opus verdict、 Hallucination Guard citation_required 遵守).
 * BuyZoneCard 内で 必ず render する。
 */
export const BUY_ZONE_FOOTER = {
  source: '出典: IBD / William O\'Neil 著 "How to Make Money in Stocks"',
  disclaimer: '※ テクニカル分析は将来の値動きを保証するものではありません',
};
