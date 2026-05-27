/**
 * sellZoneLabels.js — IBD 50DMA extension rule + 8% trailing stop の静的 dictionary.
 *
 * SPEC 2026-05-28 Sprint 6 §4-C (pillar 2 technical):
 *   - LLM narration を使わず frontend 静的 dictionary で出力
 *   - 「売るべき」 等の断定 BAN、 「目安」 「IBD ルールでは」 「過去...確率上昇」 等の客観表現のみ
 *   - 金商法 §38 (断定的判断提供) / 景表法 §5 (優良誤認) safe
 *
 * Zone 判定基準:
 *   normal:    extension < 15%        (50DMA 近辺、 通常レンジ)
 *   extended:  15% <= extension < 25%  (IBD 過熱の目安、 段階利確検討領域)
 *   climax:    25% <= extension       (climax warning、 短期 reversion 確率上昇)
 *   stop_hit:  購入価格 から -8% 抵触  (Phase 2 で portfolio integration 後に活性化、
 *              Phase 1 は zone 判定対象外)
 */

export const SELL_ZONE_LABEL_JP = {
  normal:   '通常レンジ',
  extended: 'extension 段階',
  climax:   'climax warning',
  stop_hit: '8% stop hit',
  unknown:  '判定不可',
};

export const SELL_ZONE_DESC_JP = {
  normal:   '50DMA から +15% 未満。 IBD 公式では通常レンジ、 急いだ利確は不要とされる範囲です。',
  extended: '50DMA から +15% 以上 +25% 未満。 IBD ルールでは過熱の目安、 段階利確を検討する領域とされています。',
  climax:   '50DMA から +25% 以上。 IBD climax top criteria に該当、 過去 climax run は短期 reversion 確率が上昇する傾向と紹介されています。',
  stop_hit: 'IBD の universal stop loss は購入価格から -8%。 損切り検討領域とされています (Phase 1 では汎用説明のみ表示)。',
  unknown:  '50DMA の値が取得できないため zone 判定を保留しています。 IPO < 50 日の銘柄等で発生します。',
};

/**
 * extension % から zone を分類.
 * @param {number} extensionPct - (currentPrice / sma50 - 1) * 100
 * @returns {'normal'|'extended'|'climax'|'unknown'}
 */
export function classifyZone(extensionPct) {
  if (!Number.isFinite(extensionPct)) return 'unknown';
  if (extensionPct >= 25) return 'climax';
  if (extensionPct >= 15) return 'extended';
  return 'normal';
}
