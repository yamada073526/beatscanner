# SPEC: スクリーナー アドバンスド（個別緩急）＋ Pro 課金ゲート（2026-06-23）

> **DEFER-SPEC（提案のみ・本番コード未変更）**。実装は user 承認後に別 commit で着手。
> 親 SPEC: [`SPEC_2026-06-22_screener-strategy-presets_draft.md`](SPEC_2026-06-22_screener-strategy-presets_draft.md) §7.7-7.9。
> 承認済 visual SSOT: [`mockups/screener-strategy-presets-v8.html`](mockups/screener-strategy-presets-v8.html)。
> 適用 skill: `funnel-cro`（Trust Cliff 7項目）/ `hallucination-guard`（§38/§5）/ `screener` / `designing-workspace-ui`。

---

## 0. これは何か（handover v252 残タスク #2）

戦略プリセット（1クリック）の下に、**各条件を個別に「緩・標・厳・最厳」で締める「アドバンスド（個別緩急）」層**を追加する。
**精度プリセット3段（緩い/標準/厳しい）は Free 100% 動作**を維持し、**個別緩急（アドバンスド）のみ Pro** とする。

### 北極星・5原則との接続（採否の根拠）
- **北極星「人力の代替」**: 投資家が毎日手で「EPS は強めに、CF は緩めに」と閾値を頭の中で調整している作業を、原典較正済みの完成形から **1クリック適用 → 個別微調整** で肩代わりする。ゼロから組む汎用スクリーナー（Finviz/TradingView）に対する**「差分編集」の効率優位**が課金動機の核。
- **原則1（読み手の負担）**: 各 mini-segment に**閾値数値を併記**（「緩 +20%」）。条件を**意味グループ化**（成長性/収益の質/モメンタム/需給）で認知負荷減。
- **原則4（1クリックを減らせ）**: 初心者＝プリセット1クリック完結、中級者＋＝個別緩急。両立。

---

## 1. スコープ（in / out を厳密に）

### ✅ in（#2 で実装）— 既存 field のみで 0-call 完結
1. **アドバンスド toggle**（「アドバンスド（個別に緩急）」+ Pro バッジ）。OFF=精度プリセットのみ（現状）、ON=各条件 mini-segmented を露出。
2. **4段ラダー（最厳）の追加**: ラダーが4段ある条件に `severe` を追加（現状 `loose/standard/strict` の3段）。
3. **閾値数値の併記**: 各 mini-segment ボタンに `+20% / +25% / +50% / +100%` 等を表示（現状ラベルのみ）。
4. **真の二値＝「必須ゲート」明示**: binary facet（CFPS>EPS / 52週高値更新 / 機関保有増 等）は緩急化せず lock アイコン + 「変更不可」表示。トグル不可。
5. **条件グループ化**: 成長性 / 収益の質 / モメンタム / 需給 のグループ見出しで区切る。
6. **「カスタム」タグ**: 精度プリセットから個別変更したら表示（状態の見える化）。
7. **Pro 課金ゲート**（本 SPEC の核・§4 で詳述）: 個別緩急のみ Pro。Free は件数ちら見せ + lockbar（アドバンスド操作時のみ）。

### ❌ out（DEFER・依存先を明記）
- **p3 旬のセクター / p4 セクター別リーダー プリセット**: backend セクター別RS集計（handover v252 #4）依存。本 SPEC では扱わない。
- **連続性条件（EPS/売上/CFPS の 3期連続増・加速）**: backend 0-call field `eps_3y_rising`/`rev_3y_rising`/`cfps_3y_rising`（monotonic、#4）依存。state ラダー（直近正/3期連続増/3期+加速）は #4 完了後。
- **カップ・ウィズ・ハンドル 状態分類トグル**（ブレイク確定/取っ手形成中/カップ形成中）: `cup_state` enum 配線（将来）。
- **保存ゲート（カスタム設定の保存＝Pro）**: Signature nightly push 前提機能。本 SPEC では UI のみ言及、永続化は別 SPEC。

---

## 2. 現行コード機構の棚卸し（差分実装の前提）

`frontend/src/components/CustomScreenerPanel.jsx` に**既に存在する**機構（=再利用、ゼロから作らない）:

| 機構 | 現状 | #2 での扱い |
|---|---|---|
| `preset` state + 精度 segmented（loose/standard/strict）| L309 / L862-868。`PRESET_LABELS={緩い/標準/厳しい}` | **Free のまま維持**（不変） |
| `overrides` state + `buildActiveGrades(preset, overrides)` | L310 / L224。preset に override をマージ | **Pro ゲート対象**。per-facet 個別緩急の心臓部 |
| `renderGradeRow`（per-facet mini-segmented `['off','loose','standard','strict']`）| L655-672 | **4段化 + 数値併記 + Pro ゲート**を付与 |
| 件数計算 `calcCount`（各 level で itemPasses 集計）| L463-484 | **件数ちら見せ**にそのまま流用（数値は実集計＝§38安全） |
| `isProUser` / `onProUpgrade` props | L295 / L292 | Pro ゲートの判定 + upgrade 導線に使用 |
| binary facets（OCF_MARGIN/OCF_GT_NI/BUY_ZONE/NEW_HIGH_52W/AD_VOLUME）| 別管理（chip） | **必須ゲート badge** 表現へ寄せる |
| `FUNDA_FACETS[].grades`（3段）| L70-75 | ラダー4段化（下表） |

### 2.1 原典較正ラダー（gate 1 解決済 — 2026-06-23 user「原典に素直に従う」）

**方針（user 確定）**: じっちゃま原典を最優先、言及がなければオニール CAN-SLIM 原典に素直に従う。
SSOT: [`jijima_protocol.md`](../references/jijima_protocol.md) / [`canslim_oneill_rules.md`](../references/canslim_oneill_rules.md) §7.1。

> ⚠️ **原典較正は mockup v8 を一部上書きする**。mockup v8 の「営業CFマージン ≥10/15/20/25 の4段ラダー」は**原典にない BeatScanner 拡張**のため**不採用**（じっちゃま原典は「15%以上」の単一条件＝必須ゲート）。原典忠実を優先する（gate 1 確定）。

#### A. 数値ラダー（オニール段階値・**個別緩急 = Pro 対象**）

| facet.key | 区分 | 緩い | 標準 | 厳しい | 最厳 | 出典 |
|---|---|---|---|---|---|---|
| `eps_yoy_pct` | C 当四半期EPS(YoY) | +20% | +25% | +50% | **+100%** | canslim §7.1 p.179-197 |
| `eps_cagr_3y` | A 年間EPS成長 | +25%/年 | +25% | +50% | — | §7.1 p.197-210（緩「3年連続増」は state＝#4依存、数値部 25/50）|
| `roe` | A ROE | **≥17%（床）** | ≥25% | ≥50% | — | §7.1 注 p.179-210（17床・理想25-50。3段）|
| `rs_percentile` | L RS Rating | **≥70（絶対床）** | ≥80 | ≥90 | — | §7.1 p.235-243 |
| `volume_surge_pct` | S ブレイク出来高 | +25% | +40% | +50% | — | §7.1 p.225-233 |

> **RS ハードフロア**: 原典 §7 注「**RS<70 は段階に関係なく禁止のハードゲート**」。緩い設定でも 70 未満は許容しない（individual override の下限を 70 にクランプ）。

#### B. 必須ゲート（じっちゃま絶対条件・**二値・変更不可**・lock 表示）

| 条件 | 閾値 | 出典 |
|---|---|---|
| 営業CFマージン | **≥15%**（単一・ラダー化しない）| じっちゃま絶対条件① |
| CFPS > EPS（粉飾防止）| 常に満たす | じっちゃま絶対条件⑤ |
| 52週高値更新 | is_new_52w_high === true | オニール N |
| EPS / 売上 / CFPS 3期連続増 | state（#4 依存・DEFER）| じっちゃま絶対条件②③④ |

#### C. 二値ゲート寄り（個別緩急になじまない）
- `inst_holders_qoq_pct`（機関保有・I）: 原典は「社数5+/10+ かつ増加」だが既存 field は QoQ% のみ。**「QoQ 増加（>0）」の二値ゲート**として扱う（社数ラダーは機関保有=未実装[13F遅延]で #I/#4 DEFER）。§7.1 p.249-257。

#### 現行コードとの差分（実装時の変更点）
- `FUNDA_FACETS[].grades`: `eps_yoy_pct` に `severe:100` 追加。`roe` を `{17,25,50}`（床17へ・現 `{10,17,25}` から変更）。`rs_percentile` を `{70,80,90}`（標準 85→80）。`eps_cagr_3y` を `{25,50}` 系へ。`volume_surge_pct` は `{25,40,50}` 据置。
- `inst_holders_qoq_pct` を数値ラダーから**二値ゲート（>0）**へ移設。
- 営業CFマージン（現 `OCF_MARGIN_FACET` binary 15%）を**必須ゲート群**に統合表示。
- ⚠️ **roe 床 10→17・rs 標準 85→80 の変更は Free 標準プリセットの結果件数を動かす**（原典忠実化の代償）。gate 1 で user 承認済（原典優先）。

---

## 3. UI 設計（mockup v8 準拠）

```
┌─ 戦略プリセット bar（#3 で画面トップへ昇格済）──────────────┐
│ [決算合格 Free] [新高値ブレイク Premium]                       │
├─ 絞り込み条件 ──────────────────────────────────────────────┤
│ 精度: (緩い)(標準)(厳しい)  ← thumb slide      [カスタム]タグ   │
│ ┌ アドバンスド（個別に緩急） [Pro] ────────────── toggle ─┐  │
│ │  ▸ 成長性                                                 │  │
│ │    当四半期EPS成長  (緩+20)(標+25)(厳+50)(最厳+100)        │  │
│ │  ▸ 収益の質                                               │  │
│ │    営業CFマージン   🔒 必須（≥15%・変更不可）             │  │
│ │    CFPS>EPS（粉飾防止） 🔒 必須（変更不可）               │  │
│ │    ROE             (緩≥17)(標≥25)(厳≥50)                  │  │
│ │  ▸ モメンタム                                             │  │
│ │    RS Rating（床70）(緩≥70)(標≥80)(厳≥90)                 │  │
│ └──────────────────────────────────────────────────────────┘  │
│ [lockbar: アドバンスド操作時のみ・Free のみ]                   │
├─ 結果（master-detail）────────────────────────────────────┤
```

### 3.1 アニメーション（親SPEC §7.8 ②・既存規律準拠）
- パネル開閉 = `grid-template-rows: 0fr ↔ 1fr`（max-height hack 後継）。**開 350ms / 閉 200ms 非対称**、easing expo `(.16,1,.3,1)`。
- segment thumb / knob = Material `(.4,0,.2,1)`。件数 pop = spring `(.34,1.56,.64,1)`。
- **`prefers-reduced-motion: reduce` で全 transition/animation 無効化**（WCAG 2.3.3）必須。
- CSS は `index.css` の `.screener-strategy-*` / `.screener-master__*` 既存スコープへ。**発光系（`.panel-card`/`.bs-panel`/`.surface-card`）非接触**、box-shadow は `var(--shadow-*)` token のみ、生 hex 禁止（gold は `--color-gold`/`--color-gold-mid`）。

### 3.2 a11y
- 精度 segmented = `role=radiogroup/radio` + `aria-checked`。アドバンスド toggle = `role=switch` + `aria-checked`。
- 必須ゲート = lock アイコン + `aria-disabled`、フォーカス可だが操作不可の旨を `aria-label` に明示。
- focus-visible gold ring。

---

## 4. Pro 課金ゲート設計（本 SPEC の核・funnel-cro 適用）

### 4.1 線引き（不変）
| 層 | tier | 根拠 |
|---|---|---|
| 戦略プリセット 1クリック適用（決算合格）| **Free** | LP「探す手間ゼロ」と整合 |
| 精度プリセット3段（緩い/標準/厳しい）| **Free 100%動作** | 同上・有料化しない |
| **個別緩急（アドバンスド per-condition override）** | **Pro** | 「差分編集」の価値・課金の核 |
| 新高値ブレイク / 旬のセクター / セクター別リーダー プリセット | Premium / Pro（別軸・既存 locked_facets 機構） | 本 SPEC では tier 表示のみ |

### 4.2 離脱でなく課金動機にする3手法（Trust Cliff 回避）
1. **件数ちら見せ**: Free がアドバンスドを開くと mini-segment は **disabled で露出**。Free が締めようとした時、`calcCount` で**実集計した件数差**を表示（「標準23銘柄 → EPS を最厳に締めると 6 銘柄」）。**銘柄リスト（master）はプリセット結果のまま**＝個別に締めた結果リストは Pro。件数は**実計算（捏造でない §38）**。
2. **設定UIちら見せ**: mini-segmented を `disabled` + 淡色で見せる（存在を示し価値を伝える）。
3. **保存ゲート（DEFER）**: カスタム設定保存＝Pro。Signature nightly push のスキャン条件に直結（原則4 最終形）。本 SPEC では UI のみ、永続化は別 SPEC。

### 4.3 lockbar（コピー・Trust Cliff 語感の撤廃）
- **表示条件**: `adv === true && plan === 'free'` **かつアドバンスドを操作した時のみ**。常駐させない（親SPEC §7.8 ④）。
- **コピー（確定・mockup v8 L302）**:
  > プリセットで **N 銘柄**に絞り込み中。条件を個別に詰めるには Pro へ（個別に締めるとさらに絞り込めます）。 [Pro を見る]
- **禁止語**: 「全件見られる」「解放」「ロック解除」等、**list 可視を約束する語感は撤廃**（QA指摘・Trust Cliff #1）。Free 価値（N銘柄に絞れている事実）を**先に肯定**してから Pro を案内。
- CTA「Pro を見る」は **`onProUpgrade`（fallback `onUpgrade`）経由**で既存 upgrade modal を開く（実装ゼロの「Pro 限定」を作らない＝checklist #4）。

### 4.4 Trust Cliff DoD（funnel-cro 7項目の本機能への適用）
| # | 項目 | 本機能での確認 |
|---|---|---|
| 1 | 訴求と実装の完全一致 | lockbar「プリセットで N 銘柄に絞り込み中」の N は**実 `calcCount`**。「精度3段 Free 100%動作」が実際に動く（Pro ゲートは個別緩急のみ） |
| 2 | 「登録不要」と登録要求の矛盾なし | 本機能は登録導線を増やさない（既存 upgrade modal のみ）。demo/Free 経路で精度3段が登録なしで動作 |
| 3 | 「N銘柄無料」と固定WLの矛盾なし | 件数は universe 実集計。固定ホワイトリストでない |
| 4 | **「Pro 限定」と実装ゼロの矛盾なし（最致命）** | 個別緩急が**実際に Pro ゲートされ**、`onProUpgrade` で Stripe フローに到達する。**未実装のまま「Pro」バッジを出さない** |
| 5-6 | Sample Pass 関連 | 本機能は非該当（screener 内・LP 非依存） |
| 7 | AI 生成短文を出さない | 本機能は **LLM 不使用**（件数・閾値は数値物理層、合否理由は #1 の静的dict）。§38/§5 抵触なし |

### 4.5 重要な安全根拠（後退でないこと）
**現状 `renderGradeRow`（per-facet override）は全 user に開放されている**が、`screener_v2` は **flag-OFF（未 launch）**。よって**個別緩急を Pro ゲート化しても、既存 Free user が持っていた機能を奪う Trust Cliff 後退にはならない**（launch 前に線引きを確定するのが正）。legacy（screener_v2=false）の挙動は**一切変えない**（物理隔離 A-1）。

---

## 5. §38 / §5 / 色ルール discipline
- **主語は常に「あなたの設定 / 手間の削減」**。「儲かる/勝てる/最強/必ず」を出さない（景表法§5 / 金商法§38）。「人力の代替」は事実ベースで可。
- 件数・閾値は **Python/JS の実集計**。LLM 数値計算なし（`[[feedback_llm_calc_separation]]`）。合否理由は #1 静的dict（着地済 `c9ccec4`）。
- 色: ブレイク/選択は **gold**（`--color-gold`）。**シアンを「上昇/方向性」に使わない**（CLAUDE.md 色ルール）。緑=gain / 赤=loss / amber=warning。

---

## 6. 実装スライス（差分・小さく刻む）

| slice | 内容 | 依存 | 規模目安 |
|---|---|---|---|
| **2-a** | ラダー4段化（`grades` に `severe` 追加）+ `renderGradeRow` を `['off','loose','standard','strict','severe']` 対応 + **各 segment に閾値数値併記** | なし（既存 field）| 中 |
| **2-b** | 条件グループ化（成長性/収益の質/モメンタム/需給 見出し）+ binary facet を「必須ゲート」badge 表現に統一（トグル不可・lock アイコン）| 2-a | 中 |
| **2-c** | アドバンスド toggle（`role=switch`）で per-facet rows を開閉（`grid-template-rows` アニメ）+ 「カスタム」タグ（`isCustom` 判定）| 2-b | 小 |
| **2-d** | **Pro ゲート**: `!isProUser` 時 mini-segment を disabled ちら見せ + 件数ちら見せ（`calcCount` 差分）+ lockbar（操作時のみ）+ `onProUpgrade` CTA | 2-c | 中（核）|
| **2-e** | a11y/motion 仕上げ（focus-visible / prefers-reduced-motion / aria）| 2-d | 小 |

> 各 slice 末で `npm run build` + `design-system-check` + flag裏 dogfood（`?screener_v2=1` ダーク）。閾値変更（2-a）は §7 gate 1 で user 投資判断を取ってから。

### DEFER（#2 完了後・別 SPEC）
- 連続性 state ラダー（eps3/rev3/cfps3）+ p3/p4 プリセット → **backend #4（0-call fields + セクターRS集計）完了後**。
- 保存ゲート永続化 → Signature nightly push SPEC。

---

## 7. user 判断ゲート（2026-06-23 解決状況）
1. **gate 1（投資ロジック）** — ✅ **解決**: user「原典に素直に従う（じっちゃま優先→オニール）」。§2.1 を原典較正で確定（CFマージンは必須ゲート化、roe 床17、rs 標準80、RS<70 ハードフロア）。Free 標準プリセットの件数変化は原典忠実の代償として許容。
2. **gate 2（課金）** — 🟡 **Claude に一任**: user「競合の機能・価格をふまえて適正を判断してよい」。→ 競合調査（Finviz/TradingView/IBD MarketSurge/Stock Rover/日本の証券会社）を実施し、§9 に価格推奨を記載。実装は MVP（個別緩急の Pro ゲート UI）先行、Stripe 課金フロー接続は別 SPEC（「Pro」バッジを出す時点で checklist #4 = 実装必須）。
3. **gate 3（scope）** — ✅ **解決（推奨採用）**: `eps_cagr_3y` は数値ラダー `{25,50}` 据置（緩「3年連続増」state は #4 DEFER）。`inst_holders_qoq_pct` は二値ゲート（QoQ>0）へ。state/社数ラダーは backend #4 完了後。

---

## 8. テスト観点（実装時 DoD）
- `data-testid`: `screener-adv-toggle` / `screener-grade-{facet}-{level}` / `screener-gate-{facet}` / `screener-lockbar` / `screener-custom-tag`。
- **件数整合（Trust Cliff C-2）**: lockbar の N と master の件数が**同一 predicate `itemPasses`**から算出されること（count と list の乖離禁止）。
- Free / Pro 両 plan で挙動確認（mockup v8 の Free/Pro 切替に相当）。flag裏 dogfood で目視。
- legacy（screener_v2=false）の per-facet override 挙動が**不変**であること（物理隔離回帰テスト）。
</content>
</invoke>

---

## 9. 価格推奨（gate 2 解決 — 競合調査 2026-06-23）

> Claude 一任（user gate 2）。Sonnet 競合調査（Finviz/TradingView/IBD/Stock Rover/Koyfin/InvestingPro + 日本の証券会社）に基づく推奨。**価格は時期で変わる**ため調査日明記。実装（Stripe 接続）は別 SPEC、本節は方向性。

### 9.1 競合価格マップ（月額 USD・2026-06-23 時点）
| 製品 | 月払い | 年払い(÷12) | 日本語 | スクリーナー特性 |
|---|---|---|---|---|
| 日本の証券会社（楽天/マネックス/SBI/松井/moomoo）| **無料**（口座付帯）| — | ◯ | 決算駆動の深掘り（beat/miss・ガイダンス較正・AI解説）が欠落 |
| Finviz Elite | $39.50 | $24.96 | ✗ | RT + バックテスト + export |
| TradingView Plus / Premium | $29.95 / $59.95 | $24.95 / $49.95 | ◯（一部英語）| Pine Screener（Premium）|
| Stock Rover Premium Plus | $27.99 | ~$20 | ✗ | 700+メトリクス・方程式 screener |
| Koyfin Plus / Premium | $39 / $79 | — | ✗ | 500-5900 フィルタ |
| InvestingPro Pro | $17.95 | ~$9.50 | ◯ | Fair Value・基本 screener |
| **IBD MarketSurge**（CAN-SLIM 本家）| **$149.99** | $1,499 | ✗ | CAN-SLIM 評価 + パターン認識 |

### 9.2 ポジショニング（BeatScanner の差別化）
競合（特に Finviz/TradingView/Stock Rover）は「フィルタを**組む**」だけで**正解の閾値（処方箋）を持たない**。CAN-SLIM 原典較正の閾値をプリセット内蔵するのは **IBD MarketSurge（$150/月）のみ**で英語・高価格。
→ BeatScanner の核 = **「勝ち筋が最初から入った日本語・決算駆動・原典内蔵スクリーナー」を IBD の 1/10 価格で**。日本の証券会社が無料な点には**「証券口座に縛られない独立性 + 決算 beat/miss 駆動 + 日本語 AI 解説」**で対抗（機能の非連続性で正当化）。

### 9.3 価格推奨
| 優先 | 価格 | 年払い | 戦略ポジション |
|---|---|---|---|
| **第1推奨** | **¥1,480/月** | ¥12,800/年（≒¥1,067/月）| 英語競合（Finviz $40 / TV $60）の 1/3〜1/4。「決算特化・日本語」で最大 CVR。親SPEC §7.7-8 のレンジ下限と一致 |
| 第2推奨 | ¥1,980/月 | ¥16,800/年 | アラート/メール通知/WL 高度化を載せた後のターゲット（$14-15 圏でグローバル競合と同価格帯）|
| ローンチ特価 | ¥980/月 | ¥9,800/年 | キャンペーン限定（音楽/動画サブスク ¥980 心理ライン）。常設は API コスト回収難で非推奨 |

**結論**: ローンチは **¥1,480/月（年 ¥12,800 = 2ヶ月無料）を第1候補**。Premium ¥2,980 / Signature ¥10k（nightly push）の既存 tier 階段と整合。実証は funnel-cro の手動 A/B（`AB-YYYYMMDD-pro-price`）で。

> ⚠️ **Trust Cliff #4**: 「Pro」価格・バッジを LP/UI に出す時点で **Stripe 課金フローの実装が必須**（「Pro 限定」表示 + 実装ゼロは最致命）。本 SPEC の #2 実装範囲は**個別緩急の Pro ゲート UI（lockbar + count peek + onProUpgrade 導線）まで**で、課金処理本体は既存 upgrade modal / 別 SPEC に委ねる。
