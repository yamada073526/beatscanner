/**
 * Frontend BLOCKLIST sanitize — handover v82 Phase 4.5
 *
 * @no-llm — このモジュールは LLM SDK を一切呼ばない pure-function。
 *
 * backend `backend/app/visualizer/prompt_negatives.py:BLOCKLIST_REGEX` の JS mirror。
 * Phase 4 dogfood (2026-05-17) で NVDA 「確実な」 1 件 hit が観察され、 NEGATIVE_EXAMPLES
 * での 100% 抑制は LLM 確率挙動で不可能と判明したため frontend 表示前防御層として導入。
 *
 * 違反パターン:
 * - BAD-5 断定的将来予測 (金商法 §38): 確実 / 必ず / 絶対 + 動詞
 * - BAD-6 最上級表現 (景表法 §5): 世界 No.1 / 業界最強 / 圧倒
 *
 * sanitizeText() は違反を含むセンテンス全体を削除する (LLM 出力の自然性を維持するため
 * 単語置換でなくセンテンス単位削除を採用、 multi-review 金融 + マーケ verdict)。
 *
 * memory:
 *   - feedback_diagram_quality_guard.md (BAD 1-6 + Trust Cliff DoD SSOT)
 *   - feedback_citation_required.md (景表法/金商法 risk anchor)
 */

// BAD-5 + BAD-6 patterns — backend prompt_negatives.py:BLOCKLIST_REGEX と 1:1 整合
const BLOCKLIST_PATTERNS = [
  // BAD-5: 断定的将来予測
  /確実(です|に|な)?/g,
  /必ず(達成|到達|実現)?/g,
  /絶対(に|的)?(勝|成功|達成)/g,
  // BAD-6: 最上級表現
  /世界\s*(一|No\.?\s*1|首位|最大)/g,
  /業界\s*(最強|トップ|首位|No\.?\s*1)/g,
  /(圧倒的|圧倒)(な|して|的)?/g,
  /他社を圧倒/g,
  /最強の/g,
  // ─── Phase B grey zone (must-fix #2): BAD-6 系 景表法 §5 強化 ──────────────
  // SPEC_2026-05-22 §4 Layer 3 記載の 7-10 表現。 backend prompt_negatives.py と 1:1 mirror。
  // 既存 anchor は編集しない (追加のみ許可)
  /圧倒的シェア|圧倒的優位|圧倒的な/g,
  /他の追随を許さない|追随を許さない/g,
  /群を抜く|群を抜いて/g,
  /\b(leading|dominant|first-mover|market\s*leader)\b/gi,
  /市場リーダー|業界リーダー/g,
  // ─── Phase B grey zone (must-fix #2): BAD-5 系 金商法 §38 強化 ──────────────
  /成長見込み|成長が見込まれる|成長が期待/g,
  /拡大基調|拡大が続く|拡大傾向/g,
  // v124 hotfix (user dogfood 2026-05-28、 TSLA tsla-202605272023 で発覚): 単独「追い風」
  // match は過剰削除 (例: 「~を押し上げる追い風でもあります」 = BAD ではない文脈) を生むため
  // 削除。 断定的表現「追い風となる」 「追い風が吹く」 のみ残す。 backend prompt_negatives.py
  // と 1:1 mirror なので同 修正必要 (本 commit と同時)。
  /追い風となる|追い風が吹く/g,
  /中長期的に有望|中長期的な成長|長期的に有望/g,
];

/**
 * text 中の blocklist violations を返す.
 * @param {string} text
 * @returns {string[]} 検出された違反文字列のリスト (デバッグ / log 用)
 */
export function findBlocklistHits(text) {
  if (!text || typeof text !== 'string') return [];
  const hits = [];
  for (const pattern of BLOCKLIST_PATTERNS) {
    // global flag を持つ regex は呼出ごとに lastIndex が進むため、 毎回 .matchAll を使用
    const matches = text.matchAll(new RegExp(pattern.source, 'g'));
    for (const m of matches) {
      hits.push(m[0]);
    }
  }
  return hits;
}

/**
 * text が違反を含むか判定 (boolean).
 * @param {string} text
 * @returns {boolean}
 */
export function hasBlocklistViolation(text) {
  if (!text || typeof text !== 'string') return false;
  return BLOCKLIST_PATTERNS.some((p) =>
    new RegExp(p.source).test(text),
  );
}

/**
 * 違反を含むセンテンスを削除して安全な text を返す.
 * 句点 「。」 で区切られたセンテンス単位で処理。
 * 削除後の文字列が空なら null を返す (呼出側は該当 array entry を skip 可能)。
 *
 * @param {string} text
 * @returns {string|null}
 */
export function sanitizeText(text) {
  if (!text || typeof text !== 'string') return text;
  // 違反がないなら原文返却 (速度優先 short-circuit)
  if (!hasBlocklistViolation(text)) return text;
  // 句点・改行で sentence 分割、 違反文を drop
  const sentences = text.split(/([。\n])/);
  const kept = [];
  for (let i = 0; i < sentences.length; i += 2) {
    const sentence = sentences[i];
    const delimiter = sentences[i + 1] || '';
    if (sentence && !hasBlocklistViolation(sentence)) {
      kept.push(sentence + delimiter);
    } else if (sentence) {
      // 違反 sentence: 削除 (delimiter も落とす)
      // log は呼出側で findBlocklistHits を使う想定
    }
  }
  const result = kept.join('').trim();
  return result || null;
}

/**
 * 文字列配列を sanitize し、 null になった entry は配列から除外して返す.
 * strengths / risks / bullCase / bearCase 用。
 *
 * @param {string[]|null|undefined} arr
 * @returns {string[]}
 */
export function sanitizeStringArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((s) => sanitizeText(s))
    .filter((s) => s != null && s.length > 0);
}

/**
 * DiagramCard data オブジェクト全体を sanitize。
 * 影響を受けるフィールド: headline / summary / strengths / risks / bullCase /
 * bearCase / investorQuestion / conditions[].detail。
 *
 * 元 data を mutate せず新オブジェクトを返す (immutable)。
 * sanitize 結果として有意な変更があった場合 `_sanitized: true` flag を attach。
 *
 * @param {object|null} data - /api/visualize response
 * @returns {object|null}
 */
export function sanitizeDiagramData(data) {
  if (!data || typeof data !== 'object') return data;

  // 「実際に違反が検出されたか」 を直接判定 (JSON.stringify 比較は
  // undefined → [] 変換等を「変更」 と誤検出するため使わない、 multi-review 開発 verdict 修正後)。
  const checkFields = [
    data.headline,
    data.summary,
    data.investorQuestion,
    ...(Array.isArray(data.strengths) ? data.strengths : []),
    ...(Array.isArray(data.risks) ? data.risks : []),
    ...(Array.isArray(data.bullCase) ? data.bullCase : []),
    ...(Array.isArray(data.bearCase) ? data.bearCase : []),
    ...(Array.isArray(data.conditions)
      ? data.conditions.map((c) => (c && typeof c === 'object' ? c.detail : null))
      : []),
  ];
  const wasViolated = checkFields.some(
    (s) => typeof s === 'string' && hasBlocklistViolation(s),
  );

  const next = { ...data };
  if (typeof next.headline === 'string') {
    next.headline = sanitizeText(next.headline) || next.headline;
  }
  if (typeof next.summary === 'string') {
    next.summary = sanitizeText(next.summary) || next.summary;
  }
  if (Array.isArray(next.strengths)) next.strengths = sanitizeStringArray(next.strengths);
  if (Array.isArray(next.risks)) next.risks = sanitizeStringArray(next.risks);
  if (Array.isArray(next.bullCase)) next.bullCase = sanitizeStringArray(next.bullCase);
  if (Array.isArray(next.bearCase)) next.bearCase = sanitizeStringArray(next.bearCase);
  if (typeof next.investorQuestion === 'string') {
    next.investorQuestion = sanitizeText(next.investorQuestion) || next.investorQuestion;
  }
  if (Array.isArray(next.conditions)) {
    next.conditions = next.conditions.map((c) => {
      if (!c || typeof c !== 'object') return c;
      return {
        ...c,
        detail: typeof c.detail === 'string'
          ? (sanitizeText(c.detail) || c.detail)
          : c.detail,
      };
    });
  }

  if (wasViolated) {
    next._sanitized = true;
  }
  return next;
}
