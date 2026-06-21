/**
 * buyHeadroomText.js — 案A「上昇余地 vs 過熱」状態コンパスの静的文言 SSOT (Phase1 S5)
 *
 * @no-llm: 静的テキスト専用。LLM 生成・テンプレ補間で本ファイルの文言を作らない (Hallucination Guard)。
 *   数値 (pivot_distance_pct / ad_volume_ratio) は backend 算出値を frontend で整形表示するのみで、
 *   ここで定義するのは「数値→事実状態ラベル」のマッピングと ⓘ モーダルの解説文 (手動維持)。
 *
 * §38 (断定的判断の提供) / §5 (優良誤認) ガード:
 *   - 「買い場」(断定) / 「今が好機」/「買い」/「絶好」/「最良」/「本命」は使わない。
 *     状態ラベルは「買い場圏 / 注意 / 過熱 / ブレイク前」「上昇引け優勢 / 下落引け優勢」等の
 *     事実状態表現に留める (買い場「圏」= pivot 近辺という位置の記述、断定の「買い場」ではない)。
 *   - 色は 過熱=amber / 注意=amber(薄) / 買い場圏=neutral(cyan ブランド色) / ブレイク前=muted。
 *     緑 (=「買い」暗示) を当てない。[[feedback_section38_buy_signal_boundary]]「価格セルは amber 固定」に倣う。
 *   - 個人名 (じっちゃま 等、クラス課題提出物のため) を含めない → 「米国成長株投資の標準的な手法では」。
 *   - 表示は blocklist.js sanitize を通過する (新規ラベルを足すときは sanitize で削除 0 を確認すること)。
 *
 * 起案: Phase1 S5 (2026-06-21)。SPEC_2026-06-21_screener-buy-quality-headroom.md §5 Sprint 5。
 * 数値しきい値の SSOT は SPEC §0-4 / [[reference_canslim_oneill_rules]] (pivot +5%/+10%、A/D >1)。
 */

import { MODAL_DISCLAIMER } from './stateCompassText.js';

// ── pivot distance → 3 区分 (+ pivot 下 = ブレイク前、null = 判定なし) ──────────────
// SPEC §0-4: 買い場圏 = 0 ≤ distance ≤ 5。pivot 下 (distance < 0) は買い場圏に含めない (別ラベル)。
// 実装都合で閾値を変えない (KB: pivot +5% 以内が好まれる / +5〜10% 超は遅いとされる)。
export const PIVOT_ZONE_BUY = 'buy_zone';
export const PIVOT_ZONE_CAUTION = 'caution';
export const PIVOT_ZONE_OVERHEATED = 'overheated';
export const PIVOT_ZONE_PRE = 'pre_breakout';
export const PIVOT_ZONE_UNKNOWN = 'unknown';

/**
 * pivot_distance_pct (= (現値 - pivot) / pivot × 100) を事実状態ゾーンに分類。
 * @param {number|null|undefined} pct
 * @returns {'buy_zone'|'caution'|'overheated'|'pre_breakout'|'unknown'}
 */
export function classifyPivotZone(pct) {
  if (pct == null || !Number.isFinite(pct)) return PIVOT_ZONE_UNKNOWN;
  if (pct < 0) return PIVOT_ZONE_PRE;
  if (pct <= 5) return PIVOT_ZONE_BUY;
  if (pct <= 10) return PIVOT_ZONE_CAUTION;
  return PIVOT_ZONE_OVERHEATED;
}

// 短語ラベル (2 秒スキャン用)。色・位置が polarity を担うため文字は最小。
export const PIVOT_ZONE_LABEL = {
  buy_zone: '買い場圏',
  caution: '注意',
  overheated: '過熱',
  pre_breakout: 'ブレイク前',
  unknown: '判定なし',
};

// 補足の一言 (sub)。事実状態の描写のみ (断定・行動指示なし)。
export const PIVOT_ZONE_SUB = {
  buy_zone: '直近の節目 (pivot) 近辺',
  caution: '節目から +5〜10% 上',
  overheated: '節目から +10% 超 上方',
  pre_breakout: '節目の下 (節目未到達)',
  unknown: '節目 (pivot) 未形成',
};

// signal トーン (StateCompass SIGNAL_COLOR と同語彙: good=緑/warn=amber/bad=赤/neutral=muted)。
// §38: 過熱・注意 = warn(amber)。買い場圏 = neutral (cyan は accent としてラベルに使うが signal 緑は使わない)。
// ブレイク前 = neutral (節目未到達は中立、損失ではないので赤にしない)。
export const PIVOT_ZONE_TONE = {
  buy_zone: 'neutral',
  caution: 'warn',
  overheated: 'warn',
  pre_breakout: 'neutral',
  unknown: 'neutral',
};

// ── A/D 出来高比 (副軸) → 事実状態ラベル ────────────────────────────────────────
// SPEC §0-2: ad_volume_ratio = 直近13週 上昇引け日の出来高合計 ÷ 下落引け日の出来高合計。
// > 1 = 上昇引け優勢 (買い優勢)。13F の機関保有比率とは別軸 (出来高の質)。§3-2 Trust Cliff: 混同しない。
export const AD_ADVANTAGE = 'advantage';      // ratio > 1
export const AD_DISADVANTAGE = 'disadvantage'; // ratio <= 1
export const AD_UNKNOWN = 'unknown';           // null (系列不足 / 下落日不足)

/**
 * @param {number|null|undefined} ratio
 * @returns {'advantage'|'disadvantage'|'unknown'}
 */
export function classifyAdVolume(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return AD_UNKNOWN;
  return ratio > 1 ? AD_ADVANTAGE : AD_DISADVANTAGE;
}

export const AD_VOLUME_LABEL = {
  advantage: '上昇引け優勢',
  disadvantage: '下落引け優勢',
  unknown: '—',
};

export const AD_VOLUME_TONE = {
  advantage: 'neutral', // §38: 緑 (=買い暗示) を当てない。出来高の質の事実状態のみ。
  disadvantage: 'neutral',
  unknown: 'neutral',
};

// ── ⓘ モーダル (CompassInfoButton と同 shape。modalSource/metaSource で読む) ──────────
// COMPASS_MODAL と同じ {modalTitle, intro, points[{heading, body, bullets, after}], summary, disclaimer}。
export const BUY_HEADROOM_MODAL = {
  // 主軸: pivot distance (上昇余地 vs 過熱)
  pivot_zone: {
    modalTitle: '上昇余地 vs 過熱の見方',
    intro:
      'この指標は、株価が直近の節目 (pivot=ベースの上限・直近高値の目安) からどれだけ上に離れているかを表します。' +
      '米国成長株投資の標準的な手法では、節目を上抜けた直後の限られた範囲が注目されやすく、節目から大きく上に離れた' +
      '局面は「伸び切り」とされ注意が必要と紹介されています。位置を 4 つの状態で示します。',
    points: [
      {
        heading: '1. 節目 (pivot) と「上昇余地」の考え方',
        body:
          '節目とは、カップ・ウィズ・ハンドルなどのベース (もみ合い) の上限にあたる水準です。' +
          'この水準を上抜けると、戻り待ちの売りが減って値動きが軽くなりやすいとされ、注目される局面とされます。',
        bullets: [
          'ブレイク前：株価がまだ節目の下にある状態。節目に未到達のため、上抜けの有無を確認してから判断する手法が紹介されます。',
          '買い場圏：節目から +5% 以内の近辺。米国成長株投資の標準的な手法では、節目近辺が好まれるとされる範囲です。',
        ],
      },
      {
        heading: '2. 「過熱」と評価されやすい局面',
        body:
          '節目から上に離れるほど、追いかけて買う (チェイス) リスクが高まるとされます。',
        bullets: [
          '注意：節目から +5〜10% 上。標準的な手法では「やや遅い」とされる範囲です。',
          '過熱：節目から +10% を超えて上方。短期的に伸び切りとされ、利益確定の目安と見なされることがある範囲です。',
        ],
        after:
          'これらは過去の値動きとチャート上の位置の「状態の記述」であり、将来の株価を予測するものでも、売買を指示するものでもありません。',
      },
      {
        heading: '3. 色について',
        body:
          '注意・過熱は注目を促す amber (アンバー) で示します。買い場圏・ブレイク前は中立色で示します。' +
          '「買い」を示す緑色は当てていません (位置は事実の状態であり、売買の合図ではないため)。',
      },
    ],
    summary:
      '節目からの距離は「まだ余地のある位置か、伸び切った位置か」を見る目安の一つです。' +
      '節目近辺が好まれ、節目から大きく離れた局面は追いかけ買いに注意するという考え方が知られています。',
    disclaimer: MODAL_DISCLAIMER,
  },

  // 副軸: A/D 出来高の質
  ad_volume: {
    modalTitle: '出来高の質 (上昇引け優勢) の見方',
    intro:
      'この指標は、直近13週 (約3か月) のうち「上昇して引けた日」の出来高合計と「下落して引けた日」の出来高合計を' +
      '比べたものです。1 を上回ると、上昇した日の方に出来高が集まっている (上昇引け優勢) とされます。' +
      '出来高を伴った値動きが重視される理由を解説します。',
    points: [
      {
        heading: '1. 出来高は「本気度」の確認材料',
        body:
          '株価の上昇に大きな出来高が伴っているかは、その動きが本物かどうかの確認材料とされます。' +
          '出来高を伴わない上昇は「騙し」の可能性が指摘され、上昇日に出来高が集まっているほど、' +
          '買い手の関与が強い局面とされます。',
      },
      {
        heading: '2. 「上昇引け優勢」と「下落引け優勢」',
        body: '上昇日と下落日のどちらに出来高が偏っているかで、需給の傾きを見ます。',
        bullets: [
          '上昇引け優勢 (比率 > 1)：上昇して引けた日に出来高が多く集まっている状態。',
          '下落引け優勢 (比率 ≤ 1)：下落して引けた日の方に出来高が多い状態。',
        ],
      },
      {
        heading: '3. 機関保有比率 (13F) とは別の指標',
        body:
          'これは出来高 (売買代金の活発さ) の偏りを見る指標であり、機関投資家の保有比率 (13F 報告) そのものとは' +
          '別の軸です。混同しないようご注意ください。保有比率の増減は別の指標で確認できます。',
      },
    ],
    summary:
      '上昇日に出来高が集まっているか (上昇引け優勢か) は、値動きの裏付けを見る目安の一つとされます。' +
      'ただし出来高の偏りだけで売買を判断するものではありません。',
    disclaimer: MODAL_DISCLAIMER,
  },
};

// モーダル各 section の視覚メタ (icon キー + cyan 強調フレーズ)。COMPASS_MODAL_META と同 shape。
// icon キーは CompassInfoButton.jsx の SECTION_ICONS で lucide に解決 (target/warn/cash/bars/trend/shield 等)。
export const BUY_HEADROOM_MODAL_META = {
  pivot_zone: [
    { icon: 'target', emphasis: '値動きが軽くなりやすい' },
    { icon: 'warn', emphasis: '伸び切り' },
    { icon: 'eye', emphasis: '売買の合図ではない' },
  ],
  ad_volume: [
    { icon: 'bars', emphasis: '本物かどうかの確認材料' },
    { icon: 'trend', emphasis: '需給の傾き' },
    { icon: 'institution', emphasis: '別の軸' },
  ],
};
