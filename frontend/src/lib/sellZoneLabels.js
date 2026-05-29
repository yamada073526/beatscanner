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
  // v126 R13-4 R1: 50DMA Break with Heavy Volume zone (IBD/O'Neil S5)
  dma_break: '50DMA break',
  // v127 R16-3 (R6): 200DMA Break zone (IBD/O'Neil、 長期トレンド break = 最重大)
  dma200_break: '200DMA break',
  unknown:  '判定不可',
};

/**
 * narration 2 field 構造 (v125 P8-5 R5 hotfix、 3 体合議統合推奨案):
 *   conclusion: 結論 (1 番目に表示、 visual anchor として font 13-14px 600)
 *   detail: 理由 + 出典を 1 行 muted で merge (`50DMA から +15% 未満 (IBD / O'Neil 著)` 形式)
 *
 * 旧 3 field (conclusion / reason / source) を 2 field に圧縮することで段数を減らし、
 * 「壁感」 を解消 (user dogfood feedback「R4-2 後もパッと見読みづらい」)。
 * 出典は括弧内に inline して文脈維持 (Trust Cliff: 決算アプリ内のテクニカル補助として O'Neil 根拠を保持)。
 * climax の長い narration は 28 字程度に短縮 (mobile 折返し対策、 qa-dogfooder critical)。
 */
export const SELL_ZONE_DESC_JP = {
  normal: {
    conclusion: '急いだ利確は不要とされる範囲です。',
    detail: '50DMA から +15% 未満 (IBD / O\'Neil 著)。',
  },
  extended: {
    conclusion: '段階利確を検討する領域です。',
    detail: '50DMA から +15% 以上 +25% 未満、 IBD ルールでは過熱の目安 (William O\'Neil 著)。',
  },
  climax: {
    conclusion: '短期 reversion 事例が報告されています (将来保証なし)。',
    detail: '50DMA から +25% 以上、 IBD/O\'Neil 著の climax top criteria に該当。',
  },
  stop_hit: {
    conclusion: '保有銘柄の利確検討の参考表示です。',
    detail: '過去最高値から -8% (Chandelier Exit 方式)、 IBD/O\'Neil 著の universal stop loss とは別指標。',
  },
  // v126 R13-4 R1 (5/29 sub-agent verdict、 user 承認): 50DMA Break + Heavy Volume detection。
  // IBD/O'Neil 7 sell rules の S5 (50DMA Break with Heavy Volume) 目安。 frontend で動的 inject。
  dma_break: {
    conclusion: '50DMA 下抜けが報告されています。',
    detail: '50DMA を高出来高で下抜けると pattern failure の signal とされる事例があります (IBD ルール、 W. O\'Neil 著)。 再奪取で持ち直すケースも紹介されています。',
  },
  // v127 R16-3 (R6): 200DMA Break。長期 (約 1 年) 移動平均割れ = 長期トレンド転換の目安。
  // 50DMA break より重大とされるため classifyZone で最優先。 非断定 (§38) / IBD 出典。
  dma200_break: {
    conclusion: '長期トレンドの目安 200DMA を下抜けています。',
    detail: '200DMA (長期移動平均) 割れは長期上昇トレンドの転換目安とされる事例があります (IBD/O\'Neil 著)。 再び上抜けて持ち直すケースも紹介されています。',
  },
  unknown: {
    conclusion: 'zone 判定を保留しています。',
    detail: '50DMA の値が取得できません (IPO < 50 日の銘柄等で発生)。',
  },
};

/**
 * extension % から zone を分類.
 * @param {number} extensionPct - (currentPrice / sma50 - 1) * 100
 * @param {object} [extra] - 追加 detection 用 input
 * @param {boolean} [extra.dmaBreak] - 50DMA を high volume で下抜けたか (R13-4 R1)
 * @param {boolean} [extra.dma200Break] - 200DMA を下抜けたか (R6、 長期トレンド break)
 * @returns {'normal'|'extended'|'climax'|'dma_break'|'dma200_break'|'unknown'}
 */
export function classifyZone(extensionPct, extra = {}) {
  // v127 R16-3 (R6): 200DMA break = 長期トレンド転換、 最重大 → 最優先 (extension の有無に関わらず)。
  if (extra.dma200Break) return 'dma200_break';
  if (!Number.isFinite(extensionPct)) return 'unknown';
  // v126 R13-4 R1: 50DMA Break (extension < 0) + high volume の場合は別 zone 優先
  if (extensionPct < 0 && extra.dmaBreak) return 'dma_break';
  if (extensionPct >= 25) return 'climax';
  if (extensionPct >= 15) return 'extended';
  return 'normal';
}

/**
 * v126 R14-6 (sub-agent verdict、 景表法 §5 対称性): SellZoneCard 強制 footer 文.
 * buyZoneLabels.js BUY_ZONE_FOOTER と対称、 「テクニカル分析は将来の値動きを保証しません」 を
 * sell side でも必ず表示することで「50DMA break = 売り確定」 等の誤認を防ぐ。
 */
export const SELL_ZONE_FOOTER = {
  source: '出典: IBD / William O\'Neil 著 "How to Make Money in Stocks"',
  disclaimer: '※ テクニカル分析は将来の値動きを保証するものではありません',
};
