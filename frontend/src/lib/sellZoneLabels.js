/**
 * sellZoneLabels.js — IBD 50DMA extension rule + 8% trailing stop の静的 dictionary.
 *
 * SPEC 2026-05-28 Sprint 6 §4-C (pillar 2 technical):
 *   - LLM narration を使わず frontend 静的 dictionary で出力
 *   - 「売るべき」 等の断定 BAN、 「目安」 「IBD ルールでは」 「過去...確率上昇」 等の客観表現のみ
 *   - 金商法 §38 (断定的判断提供) / 景表法 §5 (優良誤認) safe
 *
 * v125 user dogfood hotfix (2026-05-28):
 *   narration を「結論 → 理由 → 根拠」 の 3 field 構造に変更。
 *   user は「結論を先に見たい、 根拠は灰色で控えめに」 と要望。 SellZoneCard で順次表示し、
 *   source (根拠) は灰色文字で目立たせない。
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

/**
 * narration 3 field 構造 (v125 user dogfood hotfix):
 *   conclusion: 結論 (1 番目に表示、 通常文字色)
 *   reason: 理由 (2 番目に表示、 通常文字色)
 *   source: 根拠/出典 (3 番目に表示、 灰色文字、 目立たせない)
 */
export const SELL_ZONE_DESC_JP = {
  normal: {
    conclusion: '急いだ利確は不要とされる範囲です。',
    reason: '50DMA から +15% 未満。',
    source: 'William O\'Neil 著「How to Make Money in Stocks」 で示される通常レンジ。',
  },
  extended: {
    conclusion: '段階利確を検討する領域として紹介されています。',
    reason: '50DMA から +15% 以上 +25% 未満、 IBD ルールでは過熱の目安。',
    source: 'IBD ルール (William O\'Neil 著)。',
  },
  climax: {
    conclusion: '過去の climax run では短期 reversion を示した事例が紹介されています (将来を保証するものではありません)。',
    reason: '50DMA から +25% 以上、 IBD/O\'Neil 著の climax top criteria に該当。',
    source: 'IBD 教材 (William O\'Neil 著)。',
  },
  stop_hit: {
    conclusion: '保有銘柄の利確検討の補助として参考表示しています (Phase 2 で portfolio integration 予定)。',
    reason: '過去最高値から -8% (Chandelier Exit 方式) の参考レベル。',
    source: 'IBD/O\'Neil 著の universal stop loss (購入価格から -8%) とは別の指標。',
  },
  unknown: {
    conclusion: 'zone 判定を保留しています。',
    reason: '50DMA の値が取得できません。',
    source: 'IPO < 50 日の銘柄等で発生します。',
  },
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
