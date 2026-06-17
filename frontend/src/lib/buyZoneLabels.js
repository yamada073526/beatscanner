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
 *     → narration「IBD ルールの pivot price 目安」 + 「上抜けが新たなブレイクアウトの目安として紹介」
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
  breakout_support:  '直前ブレイクアウト支持線目安',
  // v126 R13-5 案 A (5/29): ATH 大幅更新中の breakout_extended state 用 label
  breakout_extended: 'ATH付近 pivot 目安',
  // v127 R16-3 (5/29 user dogfood、 LLY): カップ完成間近 (左 rim へ回復中・未突破) 用 label
  cup_completing:    'Cup 完成間近 pivot 目安',
  // v127 R16-3 (5/29 user dogfood、 NVDA $200): 長期ボックスレンジ支持線 (複数回 test された水平帯) 用 label
  box_support:       '長期ボックス支持線目安',
  // v134 P2 Phase 2 (SPEC v2 §6、 user gate 2 release 前着手承認): 押し目接近中の局面 label
  pullback_to_support: '押し目接近中',
  // v219 (SPEC_2026-06-15_resistance-retest、user承認): 旧レジスタンスのリテスト水準接近 label
  resistance_retest: '旧レジスタンス・リテスト水準',
  // SPEC_2026-06-16_breakout-signal §2.1-B: breakout namespace (bo_*) 専用エントリ。
  // 既存 breakout_extended / breakout_support / breakout_pending は cup_handle 文脈のまま不変。
  // classifyBreakoutZone() 経由でのみ到達する (classifyBuyZone とは独立)。
  bo_confirmed: 'ブレイクアウト確認済み',   // 終値+出来高で確定した上抜け事実
  bo_soft:      '出来高やや不足(×{VOL_RATIO})', // 終値抜けたが vmult 1.3–1.49x。{VOL_RATIO} は動的 inject
  bo_pending:   '上抜け確定待ち',            // 日中上抜け・引け失速 (終値未確認)
  bo_extended:  '高値圏突破(過熱)',          // base_rise 過熱局面
  unknown:           '判定不可',
};

/**
 * narration 2 field 構造 (SellZoneCard と同 idiom、 R5 hotfix で確立):
 *   conclusion: 結論 (visual anchor、 font 13.5px 600)
 *   detail: 理由 + 出典を 1 行 muted (text-muted 11px)
 */
export const BUY_ZONE_DESC_JP = {
  cup_pivot: {
    conclusion: '一般的なルールでの pivot price 目安です。',
    detail: '一般的なルールでは Cup-with-Handle の pivot price (= カップ完成水準) 上抜けが新たなブレイクアウトの目安として紹介されています。 出来高 40%+ 増加を伴う上抜けが confirmation 条件とされています。',
  },
  breakout_support: {
    conclusion: '直前のブレイクアウト価格の支持線目安です。',
    detail: '一般的なルールでは前回のブレイクアウト価格が次回の支持線水準の目安として知られています。 ただし支持線割れは pattern failure の signal にもなり得るため、 出来高 + 終値ベースの確認が必要とされています。',
  },
  // v126 R13-5 案 A (5/29): ATH 大幅更新中銘柄 (GE/META 型: pivot を実際に上抜けて extended) 用 narration。
  // classical Cup-Handle pattern から外れているため「目安」 + IBD extended buy point 概念引用で表現。
  breakout_extended: {
    conclusion: 'ATH付近での高値更新局面です。',
    detail: 'classical Cup-with-Handle pattern からは外れていますが、 一般的なルールでは既存 pivot から大きく上昇 (extended buy point 目安超過) した銘柄として知られています。 新規 entry より段階利確 / 押し目待ち検討の局面とされる事例が紹介されています。',
  },
  // v127 R16-3 (5/29 user dogfood、 LLY): 深い調整からカップ左側の高値 (pivot 目安) 付近まで回復・未突破の局面。
  // 旧実装は LLY を breakout_extended (= 既に上抜けた) と誤分類していたが、 現在価格は pivot 未満 = カップ完成間近が正。
  cup_completing: {
    conclusion: 'カップ右側が完成に近づいている局面です。',
    detail: '一般的なルールでは、 深い調整からカップ左側の高値水準 (pivot price 目安) 付近まで回復した段階を base 完成間近として紹介しています。 この pivot 水準の上抜けが新たなブレイクアウトの目安とされ、 出来高 40%+ 増加を伴う確認が条件とされています。 現時点では pivot 未突破の段階です。',
  },
  // v127 R16-3 (5/29 user dogfood、 NVDA $200): 長期ボックスレンジ上限 = 支持線目安。
  // {M}=touch_count / {N}=lookback_months は BuyZoneCard で数値 inject (Python 計算・JS は文字列置換のみ)。
  box_support: {
    conclusion: '長期の揉み合い (ボックスレンジ) 上限が support の目安とされる水準です。',
    detail: 'テクニカル分析では、 複数回 test された水平価格帯 (ボックスレンジ上限) が、 上抜け後に support level の目安として知られています。 この水準は過去 {N} ヶ月で {M} 回 test された価格帯です。 ただし下抜けは trend 転換の signal にもなり得るため、 終値 + 出来高ベースの確認が必要とされています。',
  },
  // v134 P2 Phase 2 (SPEC v2 §6、 6 体合議 verdict 反映、 user gate 2 確定 §4 閾値 7%/+5%/-3%):
  // 押し目接近中 = 過去 pivot 上抜け済 + 直近高値から 7%+ 押し戻し + box_support band +5% 以内接近 +
  // band_low 未割れ (3% buffer) の局面。
  // narration は金融 Opus + qa-dogfooder verdict 反映:
  //   - 「entries を取る」 (アクション推奨) → 「観察する」 (金商法 §38 safe)
  //   - 「目安」 重複削除 → 「参考水準」 + 「事例」 idiom で出典化
  //   - 末尾 免責文 必須 (qa-dogfooder verdict 4 件目)
  // {DIST_PCT} placeholder は BuyZoneCard で frontend inject (数値計算 frontend、 narration 静的)。
  pullback_to_support: {
    conclusion: '直近高値から押し戻し、 長期支持線まで残り {DIST_PCT}% の局面です。',
    detail: '米国成長株投資では、 ブレイクアウト後の押し目で支持線が機能するかを観察する手法が紹介されています。 band low を明確に下抜けた場合は pattern failure の signal として、 参考水準に band low -3% 前後が言及される事例があります。 投資判断はご自身でご確認ください。',
  },
  // v219 (SPEC_2026-06-15_resistance-retest): 旧上値抵抗→支持転換 水準まで押し戻した局面。
  // {RETRACE_PCT}=直近高値からの押し戻し率は BuyZoneCard で inject (数値 backend、 narration 静的)。
  // §38: 「割り込めば pattern failure」 の両面 + 「上昇を保証しない」 + 「ご自身で確認」 を必須。緑禁止 (amber)。
  resistance_retest: {
    conclusion: '直近高値から {RETRACE_PCT}% 押し戻し、 旧レジスタンス・リテスト水準に接近している局面です。',
    detail: 'かつての上値抵抗線がサポートに転換した水準まで株価が戻った局面として観察されています。 この水準を割り込めばパターンの不成立 (pattern failure) のサインとされ、 維持された場合でも将来の上昇を保証するものではありません。 投資判断はご自身でご確認ください。',
    shallow_note: '押し戻しは浅く、 リテスト水準への到達途上の段階です。',
  },

  // SPEC_2026-06-16_breakout-signal §2.2: breakout namespace (bo_*) 専用 narration。
  // resistance_retest / pullback_to_support の3文構造(一般ルール引用 → pattern failure 両面 → 免責)を踏襲。
  // {VMULT} / {PIVOT} / {BASE_RISE_PCT} 等は backend 物理層が計算 → frontend は文字列置換のみ。
  // classifyBreakoutZone() 経由でのみ到達する (classifyBuyZone の cup_handle 文脈 narration とは独立)。
  bo_confirmed: {
    conclusion: '直近 pivot を出来高を伴って上抜けた局面です。',
    detail: '一般的なルールでは、base 完成水準 (pivot) を出来高 50%+ の増加を伴って終値で上抜けた状態が' +
            'ブレイクアウト確認の目安として知られています。ただし上抜け後に pivot 下へ戻した場合は' +
            'pattern failure のサインともされ、維持されても将来の上昇を保証するものではありません。' +
            '投資判断はご自身でご確認ください。',
  },

  bo_soft: {
    conclusion: '直近 pivot を終値で上抜けましたが、出来高の増加は基準をやや下回る局面です。',
    detail: '一般的なルールでは出来高 50%+ 増加を伴う上抜けが確認の条件とされています。' +
            '当該局面の出来高増加は基準に届いておらず、確認が不十分な状態です。' +
            '上抜け後に pivot 下へ戻した場合は pattern failure のサインともされ、' +
            '将来の上昇を保証するものではありません。投資判断はご自身でご確認ください。',
  },

  bo_pending: {
    // Trust Cliff 殺しの核: 「日中上抜け」と「終値未確認」を同一文で明示し、点灯解除を最初から織り込む
    conclusion: '日中に pivot を上抜けていますが、終値での確定はまだの局面です。',
    detail: '一般的なルールでは、終値が pivot を上抜け、かつ出来高の増加を伴うことがブレイクアウト確認の' +
            '条件とされています。日中の一時的な上抜けは終値で割り込むと確認に至らない場合があり、' +
            '現時点は到達途上の段階です。投資判断はご自身でご確認ください。',
    intraday_note: '※ 日中値での到達であり、引け値での確定を待つ段階です。',
  },

  bo_extended: {
    // §38: 過熱の事実のみ。「売り」「買うな」断定禁止。乖離数値は backend payload から inject。
    conclusion: '直近 pivot から大きく上昇し、過熱局面とされる水準にある局面です。',
    detail: '一般的なルールでは pivot から大きく上昇 (乖離率 {BASE_RISE_PCT}%) した局面は' +
            '新規 entry より段階利確・押し目待ちが検討される事例が紹介されています。' +
            '将来の値動きを保証するものではなく、投資判断はご自身でご確認ください。',
  },

  unknown: {
    conclusion: 'pivot / support の判定を保留しています。',
    detail: 'Cup-Handle pattern が検出されていない、 または pivot price が取得できません。',
  },
};

/**
 * Cup-Handle pattern state から buy zone type を分類.
 * @param {string} state - 'formation' | 'breakout_pending' | 'breakout_confirmed' | 'failed' | null
 * @returns {'cup_pivot'|'breakout_support'|'unknown'}
 *
 * v126 R11-3 (2026-05-29 user dogfood): AAPL detected:true, state:'breakout_pending' で検出済みだが
 * 既存 'formation' のみ表示条件では catch されない問題を発見。 breakout_pending も pivot 上抜け待ち状態
 * = CupPivot 表示対象として追加 (handle 形成中、 まだ breakout 完了していない段階)。
 */
export function classifyBuyZone(state) {
  if (state === 'formation' || state === 'breakout_pending') return 'cup_pivot';
  if (state === 'breakout_confirmed') return 'breakout_support';
  // v126 R13-5 案 A (5/29): breakout_extended state を独立 buy zone type として返す
  if (state === 'breakout_extended') return 'breakout_extended';
  // v127 R16-3 (5/29): cup_completing (カップ完成間近・未突破) を独立 buy zone type として返す
  if (state === 'cup_completing') return 'cup_completing';
  // v134 P2 Phase 2 (SPEC v2): pullback_to_support (押し目接近中) を独立 buy zone type として返す
  if (state === 'pullback_to_support') return 'pullback_to_support';
  // v219 (Phase-gate 6体合議 2026-06-16 完全性クリティック発見): resistance_retest 分岐が欠落し
  // 'unknown' にフォールスルー → BUY_ZONE_DESC_JP.resistance_retest 静的辞書に到達しない経路バグを修正。
  if (state === 'resistance_retest') return 'resistance_retest';
  return 'unknown';
}

/**
 * breakout namespace (pattern_type='breakout') 専用の zone 分類関数。
 * 既存 classifyBuyZone(cup_handle.state) とは独立して呼ぶ。
 * StateCompass の priceCell は patterns.breakout?.state (bo_*) を渡す。
 * SPEC_2026-06-16_breakout-signal §2.1-A
 */
export function classifyBreakoutZone(state) {
  if (state === 'bo_confirmed') return 'bo_confirmed';
  if (state === 'bo_soft')      return 'bo_soft';
  if (state === 'bo_pending')   return 'bo_pending';
  if (state === 'bo_extended')  return 'bo_extended';
  return 'unknown';
}

/**
 * 強制 footer 文 (金融アナリスト Opus verdict、 Hallucination Guard citation_required 遵守).
 * BuyZoneCard 内で 必ず render する。
 */
export const BUY_ZONE_FOOTER = {
  source: '出典: 米国成長株投資の標準的な売買ルール',
  disclaimer: '※ テクニカル分析は将来の値動きを保証するものではありません',
};

/**
 * v126 R14-6 (5/29 user 要望、 金融アナリスト Sonnet verdict 案 A):
 *   CupPivotCard 内に buy section と並列で sell section を追加するための narration dictionary。
 *   pivot price を anchor に IBD 公式 sell rules (S1 -8% stop / S2 +20-25% Profit Take / S5 50DMA Break) を state ごとに 表現。
 *   既存 SellZoneCard (50DMA extension absolute) との役割分担:
 *     - SellZoneCard: 50DMA 絶対値 (S4 climax / S5 dma_break)
 *     - CupPivotCard sell section: pivot price 相対値 (S1 / S2)
 *   §38 / §5 safe な「目安」 idiom + IBD 公式出典明示。
 */
export const CUP_SELL_ZONE_DESC_JP = {
  formation: {
    label: '売り目安',
    conclusion: 'pivot price から -8% の水準が損切り目安として紹介されています。',
    detail: '一般的なルールでは base 形成中に pivot 下 -8% を下回った場合、 pattern failure の signal とされる事例があります。',
  },
  breakout_pending: {
    label: '売り目安',
    conclusion: 'pivot 上抜け後 +20-25% 水準が段階利確の目安として紹介されています。',
    detail: '一般的なルールではブレイクアウト後に +20-25% に到達した場合、 少なくとも一部の利確を検討する目安として知られています (段階利確の目安)。',
  },
  breakout_extended: {
    label: '売り目安',
    conclusion: '50DMA 下抜けが pattern failure の signal とされる事例があります。',
    detail: 'extended 局面では -8% stop に加え、 50DMA を高出来高で下抜けた場合に保有継続を再検討する目安として紹介されています (50DMA 割れの目安)。',
  },
  // v127 R16-3 (5/29): カップ完成間近。base 形成中なので formation と同じ pivot -8% stop idiom。
  cup_completing: {
    label: '売り目安',
    conclusion: 'pivot price から -8% の水準が損切り目安として紹介されています。',
    detail: '一般的なルールでは base 形成中に pivot 下 -8% を下回った場合、 pattern failure の signal とされる事例があります。',
  },
};
