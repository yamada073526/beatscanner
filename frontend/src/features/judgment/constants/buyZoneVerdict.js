/**
 * buyZoneVerdict.js — §③「テクニカル・買い場」章 verdict bar の静的辞書 SSOT
 *
 * @no-llm: 静的テキスト専用。LLM 生成文字列を混ぜない (Hallucination Guard)。
 *
 * 設計: 2026-06-30、3 体合議 (金融/じっちゃまO'Neil[Opus] + §38・色規律[Opus] + 認知設計[Sonnet])
 *   + user gate。正本 mockup = docs/specs/mockups/pane3-technical-buyzone-v6.html の .vbar。
 *   「2 秒で局面が分かる薄いバー」。Row1 = フェーズ語 + 価格、Row2 = state 別 短キャプション。
 *
 * §38 (断定的判断の提供) / §5 (優良誤認) ガード:
 *   - 売買指示 (買え/売れ/今が買い場/エントリー推奨) を使わない → 「〜局面/〜とされる/観察中」
 *   - 断定的将来予測 (上がる/必ず上昇/底値/天井) を使わない
 *   - 最上級・利益保証 (絶対/鉄板/安全な水準/最後のチャンス) を使わない
 *   - Row2 に動的な数値 (現在の pivot 乖離率%) を入れない = Premium 距離の逆算漏洩 BAN
 *     (一般ルール定義としての閾値も verdict bar には載せない。詳細は下の PriceLadder/BuyZoneCard に委譲)
 *   - 個人名 (じっちゃま 等) を含めない。「スピード違反(圏)」は一般語であり個人名ではない (3 体合議で確認)
 *
 * 色規律 (user gate 2026-06-30、CLAUDE.md「投資業界の色ルール」):
 *   - confirm に cyan (--color-accent) を使わない = 「ブランドが推している＝買い」の暗黙断定 (§38)
 *   - confirm = neutral (色を付けない)。色は「過熱 (amber) の警告」にだけ使い「好機」には使わない非対称設計
 *   - caution = amber (--color-warning)。watch / retest = neutral
 *   - changePct の緑赤は L0 Hero と同じ「日次変化＝事実」の彩色で、verdict ラベルの彩色とは意味論が別
 *
 * cup.state enum は stateCompassText.js COMPASS_PRICE_LABEL と同じ集合
 *   (cup_handle: cup_pivot/cup_completing/box_support/pullback_to_support/breakout_support/
 *    breakout_extended/resistance_retest、breakout namespace: bo_pending/bo_soft/bo_confirmed/bo_extended)。
 *   欠落すると tone=null に落ちて state ピルが消えるだけ (price は表示継続) = 安全側 degrade。
 */

// cup.state → verdict tone (3 値)。null/unknown は意図的に未登録 (tone=undefined → state ピル省略)。
export const VERDICT_TONE = {
  // watch (突破前・監視) — muted neutral
  cup_pivot:           'watch',
  cup_completing:      'watch',
  box_support:         'watch',
  pullback_to_support: 'watch',
  bo_pending:          'watch',
  bo_soft:             'watch',
  resistance_retest:   'watch', // user gate: amber でなく watch (支持転換の好機 ≠ 過熱警告)
  // confirm (ブレイク確認・過去の事実) — neutral 強調 (色なし)
  breakout_support:    'confirm',
  bo_confirmed:        'confirm',
  // caution (過熱・過延伸) — amber
  breakout_extended:   'caution',
  bo_extended:         'caution',
};

// Row1 フェーズ語 (tone 単位)。3 体合議: じっちゃま実語を優先。
export const VERDICT_PHASE_LABEL = {
  watch:   'ブレイク待ち',     // mockup「ブレイク待ち（監視）」の「（監視）」は冗長で削除
  confirm: 'ブレイク確認済',   // 「済」で過去完了の事実を固定 (§38)。✓ は GO サイン誤読で付けない
  caution: 'スピード違反圏',   // じっちゃま実語 (KB 4 件)。過熱の比喩で 2 秒で刺さる
};

// Row1 アイコン (tone 単位)。watch=なし(⏳はローディング誤読)、confirm=なし、caution=⚠ のみ。
export const VERDICT_PHASE_ICON = {
  watch:   '',
  confirm: '',
  caution: '⚠',
};

// Row2 短キャプション (cup.state 単位)。状態の「意味」のみ。数値・損切り・行動指示は入れない。
// 下の sum.fact / PriceLadder / BuyZoneCard との三重説明を避けるため state 名水準の 1 フレーズに留める。
export const VERDICT_CAPTION = {
  cup_pivot:           'カップ・ウィズ・ハンドル 形成局面',
  cup_completing:      'カップ・ウィズ・ハンドル 形成局面',
  box_support:         '長期レンジ上限を支持線とする局面',
  pullback_to_support: 'ブレイク後の押し目を観察する局面',
  bo_pending:          'ブレイク確認の判定待ち局面',
  bo_soft:             'ブレイク確認の判定待ち局面',
  breakout_support:    'Pivot を出来高を伴って上抜けた局面',
  bo_confirmed:        '直近 Pivot をブレイクアウト確認済み',
  breakout_extended:   'Buy Zone を超過した過熱水準とみられる',
  bo_extended:         'Buy Zone を超過した過熱水準とみられる',
  resistance_retest:   '旧抵抗が支持に転換するかを観察中', // 両面: 割れたら failure の含意は観察調で
};
