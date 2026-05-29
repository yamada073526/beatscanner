/**
 * distributionDaysLabels.js — IBD Distribution Day カウンターの静的 dictionary.
 *
 * v127 R16-3 (R12-1 Phase 1 R2、 sub-agent verdict ★★★★★ retail 必須):
 *   - Distribution Day = 直近25営業日で「前日比 -0.2% 以上の下落」 かつ「出来高が前日超」 の日 (IBD/O'Neil)。
 *     機関投資家の売り (institutional selling / distribution) の目安。
 *   - LLM narration を使わず frontend 静的 dictionary で出力 ([[feedback-sell-zone-static-dict]] 準拠)。
 *   - 「売るべき」 等の断定 BAN、 「目安」 「IBD ルールでは」 等の客観表現のみ (金商法 §38 / 景表法 §5 safe)。
 *
 * 判定基準 (IBD 標準):
 *   healthy:  0-2 日   (機関の売り圧力は限定的)
 *   caution:  3-4 日   (売り圧力が増えつつある注意領域)
 *   pressure: 5 日以上 (under pressure、 売り圧力が高い)
 */

export const DIST_DAYS_LABEL_JP = {
  healthy:  '健全圏',
  caution:  '注意領域',
  pressure: '売り圧力',
  unknown:  '判定不可',
};

/**
 * narration 2 field 構造 (SellZoneCard と統一):
 *   conclusion: 結論 (visual anchor、 font 13-14px 600)
 *   detail: 理由 + 出典を 1 行 muted で merge
 */
export const DIST_DAYS_DESC_JP = {
  healthy: {
    conclusion: '機関の売り圧力は限定的とされる範囲です。',
    detail: '直近25営業日の distribution day が 0-2 日 (IBD/O\'Neil 著の健全圏目安)。',
  },
  caution: {
    conclusion: '機関の売り圧力が増えつつある目安です。',
    detail: 'distribution day 3-4 日は IBD ルールで注意の目安とされます (W. O\'Neil 著)。',
  },
  pressure: {
    conclusion: '機関の売り圧力が高い目安です (将来保証なし)。',
    detail: 'distribution day 5 日以上は IBD/O\'Neil 著で market/銘柄が under pressure とされる criteria に該当。',
  },
  unknown: {
    conclusion: 'distribution day 判定を保留しています。',
    detail: '出来高データが取得できません (IPO 直後・低流動性銘柄等で発生)。',
  },
};

/**
 * distribution day 件数から zone を分類 (IBD 標準閾値).
 * @param {number|null} count - 直近25営業日の distribution day 数
 * @returns {'healthy'|'caution'|'pressure'|'unknown'}
 */
export function classifyDistDays(count) {
  if (!Number.isFinite(count) || count < 0) return 'unknown';
  if (count >= 5) return 'pressure';
  if (count >= 3) return 'caution';
  return 'healthy';
}

/**
 * v126 R14-6 と対称: 強制 footer (IBD 出典 + 「将来の値動きを保証しない」 disclaimer)。
 * 「distribution day = 売り確定」 等の誤認を防ぐ (Trust Cliff hedge)。
 */
export const DIST_DAYS_FOOTER = {
  source: '出典: IBD / William O\'Neil 著 "How to Make Money in Stocks"',
  disclaimer: '※ テクニカル分析は将来の値動きを保証するものではありません',
};
