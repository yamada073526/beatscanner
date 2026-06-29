# SPEC: Pane3 判定タブ Phase2 — PriceLadder 案A×G2 gate (task 3) + §② カード枠統一 (task 4)

> 2026-06-29 autopilot セッション生成。正本 = `docs/specs/mockups/pane3-full-v5.html`（user 承認済み）。
> **status: DEFER-SPEC（user gate 待ち）**。tasks 1-2 は同 feature branch `claude/pane3-phase2-impl` で実装・コミット済み。
> tasks 3-4 は **視覚/操作 component の blind 検証不可** + **未解決の情報設計の穴** + **glow danger zone** のため、
> autopilot では実装せず本 SPEC 化。次セッションで **preview/dogfood ループありの実装**を推奨。

---

## なぜ実装せず SPEC 化したか（autopilot 判断記録）

| 理由 | 詳細 |
|---|---|
| blind 検証不可 | PriceLadder / §② は authed 個別株 detail（`?detail=t:TICKER`）= login 必須で headless 描画不可。両 task とも本質が「視覚 + 操作（hover/click/chart 連動）」で、build/eslint だけでは正しさを担保できない。 |
| 情報設計の穴（task 3） | 買い目安 Pivot・支持線目安は `cup_handle` pattern 由来で **null になりうる**。無料時にロック行を「常に出す（構造ティーザー）」か「データある時だけ出す（誠実）」かは user 判断必須（CLAUDE.md / autopilot 3d「情報設計の穴 → コードを書かず質問」）。 |
| Trust Cliff 落とし穴（task 3） | distill 後も `pivot`・`support` は `CHART_LINKED` に残る → ロック行を hover すると chart に点線ガイド + `data-pl-hl` でロック価格が**漏洩**する。gate と同時に coupling も無効化が必須（下記実装手順 C）。 |
| glow danger zone（task 4） | §② カード枠 = `.panel-card/.bs-panel/.surface-card` 系 = v54-v59 で 6 セッション溶けた最大 danger。`AccordionSection.module.css` は「`.root` を glow host にしない（no bg/box-shadow）」が設計原則。glow 回帰は dogfood でも検知しづらい。handover も「approach を designing-workspace-ui で詰める」と未確定扱い。 |

---

## task 3: §③ PriceLadder = 案A 垂直プライスアクシス × G2 gate

### 対象 file
- `frontend/src/components/PriceLadder.jsx`（719 行）
- mount gate: `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` L786-788

### 現状（再導出不要の確定事実）
- **levels useMemo（L253-355）が現在 11 レベルを生成**: `high52 / target / ext25 / ext15 / pivot / current / sma50 / sma200 / support / low52 / stop`（`Number.isFinite(price)` で filter → price 降順 sort）。
- **chip/状態行は既に spine 外**（L402-453: stateText の status dot + 地合い Chip + 出来高 Chip）。→ 「chip/状態行を spine 外へ」は**実装済み・追加作業不要**。
- **2 つの render モード**:
  - 等間隔（`scaleMode=false`、現行 default）: 上値/下値の `groupLabel` + `prevSeen`（前回比）行あり。
  - 縮尺（`scaleMode=true`）: 行間 = 価格差の sqrt 比例（L655-666）、group label/prevSeen なし。
- **toggle**（L619-625 `.pl-scale-toggle`）で 2 モード切替。
- `CHART_LINKED = {target, pivot, support, sma50, sma200, ext15, ext25}`（L59）。hover で `data-pl-hl` + `pl-hover-price` CustomEvent、click で `flashChart`。
- count-up 係数 `pf`（`fmtUsd(l.price * pf)` / `fmtPct(dist * pf)`）。
- `PriceLadder({ ticker })` — 現在 **plan prop を受けていない**。mount 側で `plan === 'premium'` gate（L786）。

### target（mockup v5 = 正本）
- **レベル 11→7 に蒸留**（DOM 上→下）。`tier` = free / premium-locked:

  | # | key | label | tier | chart-linked? |
  |---|---|---|---|---|
  | 1 | `target` | アナリスト目標 | **free** | yes |
  | 2 | `pivot` | 買い目安 Pivot（cup-handle） | **premium 🔒** | yes ⚠️漏洩注意 |
  | 3 | `high52` | 52週高値 | **free** | no |
  | 4 | `current` | 現在価格 | **free**（現在値マーカー） | no |
  | 5 | `stop` | リスク確認 −8% | **premium 🔒** | no |
  | 6 | `support` | 支持線目安（box support） | **premium 🔒** | yes ⚠️漏洩注意 |
  | 7 | `sma50` | 50日移動平均 | **free** | yes |

  - **落とすレベル（4）**: `ext25 / ext15 / sma200 / low52`。
  - 無料で見える値（4）: target / high52 / current / sma50。
  - Premium 固有でロックする値（3）: pivot / stop / support → 値を `• • •` + 🔒 表示。
- **縮尺固定**（toggle 廃止）。mockup は「価格を縦軸に実高さ配置」= 縮尺モード相当。等間隔モード（group label + prevSeen）は撤去。
- **G2 gate**: 現行 premium-only mount を廃し、**無料に構造（形 + 現在位置 + 無料4レベルの値）を見せ、Premium 固有3レベルの値だけロック + ティーザー**。
- **ティーザー文言**（mockup `.pl-teaser`、spine 下、無料時のみ）:
  > 🔒 **買い目安 Pivot・支持線・リスク確認 −8%** は Premium で開放。取っ手付きカップの買い点と損切り基準を数値で。 ［Premium を見る］
  - `.pl-teaser` = `border:1px dashed var(--color-gold)` / `border-radius:var(--radius-sm)` / `background: color-mix(accent gold 6%相当)` / CTA = gold 背景・bg-primary 文字。

### 実装手順
- **A. levels useMemo（L302-316）**:
  - `raw` から `ext25 / ext15 / sma200 / low52` の 4 エントリを削除。
  - `pivot / support / stop` に `premium: true` を付与。
  - （`Number.isFinite(price)` filter は維持 → **未解決Q1** 参照。null の premium レベルが消える挙動の可否を user 判断。）
- **B. props**: `PriceLadder({ ticker, plan, onUpgrade })` に拡張。`const locked = (l) => !!l.premium && plan !== 'premium';`
- **C. levelRow / currentRow の gate**:
  - `locked(l)` のとき: 値を `fmtUsd(...)` でなく `• • •`（`letter-spacing:.12em` / `var(--text-muted)`）+ 🔒（`var(--color-gold)` 9px）。距離% も非表示（`—`）。`opacity:.6`。
  - **Trust Cliff 必須**: `locked(l)` のとき `onMouseEnter` の `setChartHl` を呼ばない・`onClick` の `flashChart` を無効化・`cursor` を pointer にしない。
    （pivot/support は CHART_LINKED に残るため、これを怠ると hover で chart にロック価格が漏洩する。）
  - count-up `pf` はロック値には適用不可（値自体出さない）。
- **D. toggle 撤去**: L619-625 の `.pl-scale-toggle` div 削除。L648 の `scaleMode ? (...) : (...)` 三項を縮尺ブランチ（L655-666）一本へ。`scaleMode` state / L218-225 の逆連動 effect の `scaleMode` 依存も整理。等間隔専用の `groupLabel` / `upper`/`lower`/`prevSeen` 表示は撤去（縮尺モードは元々出さない）。
  - ⚠️ **未解決Q3**: 縮尺固定にすると「上値/下値」見出しと「前回チェック時から ±$X」行が消える。user 確認。
- **E. ティーザー**: 無料 + ロック対象が1つ以上存在するとき、spine 下に `.pl-teaser`（上記文言）。`onUpgrade` を CTA に配線。
- **F. mount gate（JudgmentDetail L786-788）**:
  ```jsx
  {selectedTicker && (
    <PriceLadder ticker={selectedTicker} plan={plan} onUpgrade={detailContext.onUpgrade} />
  )}
  ```
  （`plan === 'premium' &&` を除去。PriceLadder 内部で gate。）

### 未解決 Q（user 判断が必要）
- **Q1（情報設計の穴・最重要）**: 買い目安 Pivot / 支持線目安は `cup_handle` 由来で **データ無し（null）になりうる**。無料時:
  - 案a「常に3行ロック表示（構造ティーザー優先）」→ データ無い銘柄でも「Premium に何かある」と訴求。ただし**存在しない値を匂わせる**懸念（Trust Cliff 逆作用の可能性）。
  - 案b「premium データが実在する行だけロック表示（誠実優先）」→ 無料ユーザーが見る行数が銘柄で変動。訴求は弱まるが honest。
  - **推奨: 案b（誠実）**。BeatScanner の「正直さ＝機能の根幹」と Trust Cliff 規律に整合。ただし funnel-cro 観点で案a 希望なら要再検討。
- **Q2**: `stop`（リスク確認 −8%）= `current × 0.92` で**無料ユーザーも現在値から自明に計算可能**。これをロックする意味は薄い（mockup はロック）。→ stop だけ無料開放も選択肢。user 判断。
- **Q3**: 縮尺固定で「上値/下値」見出し + 「前回比」行が消える。OK か。

### 検証計画（次セッション）
- build / eslint / vitest / design-system-check（特に `[glow]` と box-shadow）。
- **視覚 dogfood（必須・2 plan）**: 無料 plan（ロック3行 + ティーザー + 漏洩しないこと＝ロック行 hover で chart に点線が出ないこと）と premium plan（7行フル値）。auth harness（`feedback_auth_harness_vision_eval.md`）か手動 login。
- 複数 ticker: cup_handle あり（NVDA/META 等）と無し（Q1 案b の挙動確認）。

---

## task 4: §② 品質・継続性 カード枠統一（danger zone）

### 対象 file
- `frontend/src/features/judgment/components/detail/sections/L3QualityFold.jsx`（§② 本体）+ その wrapper
- `frontend/src/features/judgment/primitives/AccordionSection.module.css`

### 現状（確定事実）
- §② = `L3QualityFold`（7 入れ子 AccordionSection、summary 常時 + sparkline/heatmap 展開時）。内容は Phase2 で**不変**（3体合議で案B fold 維持確定）。
- `AccordionSection.module.css` `.root`（L21-29）= **意図的に glow host にしない**: no background, no box-shadow, no border-radius override, **border-top の gold hairline のみ**（`1px solid color-mix(gold 25%, border)` / dark は 20%）。
- `.root.contextTier`（L37-39）= `border-radius:var(--radius-md,12px)`（既に角丸あり、contextTier 限定）。
- 設計原則（同 css L7-9 コメント）: 「`.root` に bs-panel/surface-card/panel-card を付与しない・box-shadow 付与しない」。

### target（mockup v5）
- 全 chapter（§①〜⑤）を**共通カード枠（上端 gold + border + radius）**で統一。§② にもカード枠付与（内容は不変）。

### 実装方針（glow を増やさず実現）
- **box-shadow（glow host 化）は付与しない**。border + border-radius のみで「カード枠」を表現する。
- 現状 `.root` の `border-top` gold hairline を、§② wrapper では**4辺 border + radius + 上端 gold 強調**に拡張する CSS module class を新設（例 `.cardFrame`）。`.root.contextTier` の `border-radius:12px` idiom を踏襲。
- 上端 gold = `border-top: 2px solid color-mix(in srgb, var(--color-gold) 30%, var(--border))`（mockup 行24 と同値）。他3辺 = `1px solid var(--border)`。`border-radius: var(--radius-md, 12px)`。背景は付けない（または `var(--bg-subtle)` を要検討 = 入れ子 card との層が増える懸念）。
- **入れ子注意**: §② 内部の `FiveConditionsCard` 等が既に card 感（panel-card 由来）。外側に枠を足すと**入れ子 surface-card**（design_recipes §C 禁止）にならないか要確認。角丸階層ルール（親 R ≧ 子 R）も維持。

### 未解決 Q（user 判断 + designing-workspace-ui）
- **Q4**: カード枠を付ける単位 = §② 全体（L3QualityFold 全体を1枠）か、各 chapter（§①〜⑤ それぞれ）か。design判断 #5「全 chapter を共通カード枠」= 各 chapter 個別枠の解釈。→ `AccordionSection.module.css .root` 自体を拡張すると全 section に波及（screener が触る index.css ではないので安全だが、§③/§④ 等の見え方も変わる）。スコープを user 確認。
- **Q5**: 背景の有無（透明 vs `bg-subtle`）。入れ子 card との層数が増えると「面の足し算」= ブランド世界観の густ さ回帰リスク。
- **Q6**: `.root.contextTier` の既存 radius と衝突しないか（contextTier が付く section と付かない section の差）。

### 検証計画（次セッション）
- **design-system-check 必須**（`[glow]`: contain:paint / :has(.is-arriving) / surface-card overflow / box-shadow 増殖）。
- 視覚 dogfood: §①〜⑤ のカード枠が**一貫**して見えること（Gold Accent Continuity: 1 chapter だけだと noise）。入れ子 card が二重枠で густ くないこと。
- `glow_elevation_postmortem.md` の症状別 quick reference を事前読了。

---

## 参照
- 正本 mockup: `docs/specs/mockups/pane3-full-v5.html`（feature branch にコミット済み）
- PriceLadder 案比較: `docs/specs/mockups/pane3-ws3-priceladder-options-v1.html`
- handover: `handover_2026-06-29_v277.md`（本セッション更新）
- memory: `feedback_section38_buy_signal_boundary.md` / `glow_elevation_postmortem.md` / `feedback_auth_harness_vision_eval.md`
