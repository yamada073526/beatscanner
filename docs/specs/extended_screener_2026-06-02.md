# SPEC: 高値圏ブレイク (breakout_extended) を screener で扱う — 2026-06-02

> user 要望 ⑦ + 4 体 sub-agent review (じっちゃま戦略 Opus / 可視化 / UX / Trust Cliff) の synthesis。
> **user 承認待ち** (特に閾値 + UX 構成 + badge 文言)。 ship は承認後。

## 背景
v147 で AAPL の「ATH 直進ブレイク (= 教科書 cup でない極小 handle)」 を `breakout_extended` に再分類し、
チャートでは「高値圏ブレイク・過延伸」 chip + cup 破線非描画にした (着地済)。
user: 「この extended は cup-with-handle と**結果が似た buy signal** (新波動入りで上値が軽くなる)。screener でも
cup と同手順で拾いたい / cup の結果にまとめて表示してもいい」。 根拠にじっちゃまライブ (5/10 に既に AAPL 買付、
テクニカルは cup-with-handle しかほぼ見ない、「垂直的に上がり始め/水準訂正/素直についていく」)。

## 4 体 review の収束点
1. **同一 screener 内に出すのは妥当** (「今が旬」 の retention 価値は本物、 原則2)。 ただし **cup と「同列・無差別」 は不可**。
2. **O'Neil 正典では extended = chase 禁止** (pivot +5% 超で risk/reward 崩れる)。 **じっちゃまの extended 許容は「market が垂直初動 (M = Confirmed Uptrend)」 という条件付き**。 → **無条件に出すと「伸びすぎ天井 (climax top)」 を拾う**。
3. **誤シグナル抑制ゲートが必須** (これが無いと finance-literate user の Trust Cliff)。

## 推奨設計

### A. 誤シグナル抑制 — 3 つの数値 AND ゲート (backend、 純 Python・LLM 不要)
extended を screener に出す前に、 「初動 (乗れる)」 と「過延伸末期 (危険)」 を機械区別:
1. **50DMA 乖離率**: `(price - sma50)/sma50` が 大型株 ≤ **+30%** / 中小株 ≤ **+50%** (climax/blow-off を除外)
2. **直近ベースからの上昇率**: pivot/右リムから ≤ **+25%** (これ超は乗り遅れ chase)
3. **market gate**: SPY > SMA200(or 50) かつ 上向き (既存 `_spy_uptrend()` 流用、 じっちゃまの M 条件を体現)
→ 全て price-history + 自前 SMA で算出可 (Hallucination Guard 数値捏造 risk なし)。 通過したものだけ screener に出す。
   通過しない extended は screener から落とす (or warning badge「50DMA +XX%・押し目待ちが定石」 静的辞書)。

### B. UX — section ③ に種別 badge で混在 (UX 体 + 金融体 一致)
- 既存「新規 Cup-Handle」 section に extended を混在表示。 種別 badge で区別:
  - cup 系 → badge「カップ」/「ブレイク待機」/「ブレイク確定」 (既存 `CUP_STATE_LABEL_JP`)
  - extended → badge「**高値圏突破**」 (UX 体推奨、 「ブレイク」 より和語的・2 秒理解)
- **priority は据え置き** (extended=5)。 昇格しない。 extended が top5 に食い込むのは「自然に上位に来たとき」 だけ。
- section 説明末尾に1行「高値圏突破は正統 cup-with-handle とは形成過程が異なります。 投資の推奨ではありません」 (§38/§5)。
- **chip filter「高値圏突破」 の独立追加は将来** (section が増えてから)。 まず section ③ 拡張で MVP。

### C. §38/§5
- badge/section 名は **price action 記述 + 乖離数値併記** に徹する (「50DMA +38%」「ベースから +22%」)。
- action 断定 (「買い」「乗れ」「狙い目」)・最上級・LLM narration 禁止。 warning は静的辞書 (`STATE_LABEL_JP` 型)。
- sanitize: `blocklist.js` に extended 文脈 action 語を追加。

## user が決めるべきこと (承認 gate)
1. **3 ゲートの閾値**: 50DMA 乖離 大型+30%/中小+50%、 ベース+25%、 market gate (SPY>SMA200 上向き) で良いか。
2. **大型/中小の境界**: market cap $50B? その data source (FMP profile / 既存 cache)。
3. **badge 文言**: 「高値圏突破」 (screener) vs チャート chip「高値圏ブレイク・過延伸」 — 統一するか使い分けるか。
4. **UX**: (B) section ③ 混在 でいくか、 user 当初案の (a) 独立 chip filter にするか。
5. **過延伸末期の扱い**: screener から落とす or warning badge で出す。

## 工数・gate
- P1 backend ゲート (3 数値): 1.0-1.5 人日。 P2 frontend badge+混在+sort: 0.5-1.0 人日。
- Phase gate: 金融 + frontend + qa-dogfooder の **3 体合議** (Trust Cliff + market gate 設計、 LLM 出力なし)。
- 着手前に Cup-Handle 閾値 SSOT (`feedback_cup_handle_thresholds.md`) に extended ゲート閾値を追記。
