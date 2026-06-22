# SPEC: スクリーナー「戦略プリセット」層（じっちゃま流 5 シナリオの 1 クリック化）

> **status**: draft（**DEFER-SPEC = 提案のみ・コード未変更**。実装は user 承認後）
> **作成**: 2026-06-22
> **scope**: スクリーナータブのプリセット層 + 数 field の precompute 拡張。既存 Group A-G 蛇口 / PRESET_TABLE / master-detail は再利用（破壊変更なし）。
> **親 SPEC**: `SPEC_2026-06-18_screener-pane2-3-redesign_draft.md`（蛇口モデル Group A-G / loose-standard-strict / tier 境界）
> **依頼**: user 2026-06-22「KB を参照し screener の改善案（追加指標 + スクリーニング条件プリセット）」+ 他 AI 提示の叩き台 5 パターン
> **北極星**: 原則4「人力の代替」── 投資家が毎朝 7 個の蛇口を手で設定する代わりに、**覚えやすい戦略名を 1 クリック**で「じっちゃま流の鉄板スクリーン」が走る状態。

---

## 0. 中核リフレーミング（最重要）

他 AI の 5 パターンは **新しい条件ではない**。その大半は親 SPEC の **Group A-G 蛇口に既に存在する**。
→ 提案は「新条件の追加」ではなく、**Group A-G の蛇口を投資家が認識できる名前で束ねる『戦略プリセット』層**を、既存の `loose/standard/strict` 強度プリセットの **上**に 1 段追加すること。

```
[戦略プリセット]  ← 新規（本SPEC）: パーフェクト・ゲーム / 新波動入り / …  = Group A-G の束 + 強度既定
        ↓ 展開
[強度プリセット]  ← 既存: 緩い / 標準 / 厳しい
        ↓ 上書き
[Group A-G 蛇口]  ← 既存: 個別 tap の off/緩い/標準/厳しい
```

戦略プリセットを選ぶと `{ preset, overrides }` state に **対応する overrides 束**が流し込まれるだけ。**backend の filter 評価ロジックは不変**（既存 field を AND するのみ）。data 拡張が要るのは一部 field のみ（§3）。

これが原則4 の最短路: 「毎朝の見回り」を、強度ダイヤルを覚えなくても **戦略名 1 クリック**で代替する。

---

## 1. 5 パターン × 条件の 3 分類

凡例: ✅ **即実装可**（既存 field）/ 🟡 **data 拡張要**（precompute field 追加・FMP コスト §3）/ ⛔ **算出不可**（FMP に標準 field なし・LLM 抽出は hallucination risk で見送り）

### P1. パーフェクト・ゲーム（鉄板ファンダ）
| 元条件 | 分類 | 対応 |
|---|---|---|
| 良い決算（EPS+売上+ガイダンス全コンセンサス超） | ✅ | Group C `funda_pass` / EPS Beat / 売上 Beat / ガイダンス上方修正（※決算駆動 sparse） |
| 過去3年 EPS 毎年増 | ✅近似 / 🟡厳密 | `eps_cagr_3y≥25%` で近似。"毎年増(monotonic)" 厳密版は新 field `eps_3y_rising`（0 call） |
| 過去3年 売上 毎年増 | 🟡 | 新 field `rev_3y_rising` / `rev_cagr_3y`（0 call、既存 annual fetch 再利用） |
| 過去3年 CFPS 毎年増 | 🟡 | 新 field `cfps` + `cfps_3y_rising`（0 call、helper 既存 main.py:3953） |
| 営業CFマージン ≥15%（理想35%） | ✅ | `ocf_margin_pct`（**本番 LIVE 済**） |
| CFPS > EPS（粉飾回避） | ✅ | `ocf_gt_netincome`（**本番 LIVE 済**） |
**判定**: ほぼ既存 + 0-call 拡張のみ。**最有力**（じっちゃまプロトコルの中核そのもの・最安・北極星最強）。

### P2. 新波動入り（ブレイクアウト）
| 元条件 | 分類 | 対応 |
|---|---|---|
| Cup-with-Handle 上放れ | ✅ | Group E `cup_state=breakout_confirmed`（Premium tier） |
| 52週高値更新直後 | ✅ | Group F `is_new_52w_high` |
| ブレイク時出来高急増 | ✅ | Group F `breakout_state` + 1.5x volume + `ad_volume_ratio` |
| 直近決算良 | ✅ | `funda_pass`（sparse） |
**判定**: **全条件が既存 field**。束ねて名前を付けるだけ。**最有力**（Premium 価値・実装ほぼゼロ）。

### P3. 次世代の主役（IPO サバイバー）
| 元条件 | 分類 | 対応 |
|---|---|---|
| IPO後初〜2連続決算良 | 🟡 | profile の `ipoDate`（0 call）+ 決算回数カウントの新ロジック |
| 希薄化後株数 安定/減少 | 🟡 | 新 field `shares_yoy_pct`（0 call、quarterly income 再利用） |
| 売上成長 加速 | 🟡 | 新 field `rev_qoq_accel`（income quarter limit 4→8、追加 call なし） |
| PSR が成長対比で過熱でない | 🟡 | 新 field `psr`（+1 call ratios-ttm、§3） |
**判定**: 全て 🟡。差別化は高いがニッチ。**中優先**（PSR の +1 call と IPO 起点ロジックが必要）。

### P4. 高効率 SaaS（ルール・オブ・40）
| 元条件 | 分類 | 対応 |
|---|---|---|
| 売上成長率 + 営業利益マージン > 40 | 🟡 | 新 field `operating_margin_pct` + `rule_of_40`（0 call、income quarter 再利用） |
| FCF 潤沢 | ✅ | `fcf_margin_pct` |
| サブスク比率 高 | ⛔ | FMP 標準 field なし。transcript LLM 抽出は BAD-3 数値捏造 risk → **見送り** |
| リテンション 高 | ⛔ | 同上 → **見送り** |
**判定**: Rule of 40 の定量核は 0-call で算出可だが、SaaS らしさ（サブスク/リテンション）は ⛔。**中優先**・**Tech/Software へ sector-gate** + 「Rule of 40 の定量版」と正直に表記。

### P5. 全天候型ブルーチップ（守りの NISA）
| 元条件 | 分類 | 対応 |
|---|---|---|
| 業界リーダー | ✅近似 | `mcap_band ∈ {Mega,Large}`（近似） |
| 配当利回り 3-5% | 🟡 | 新 field `dividend_yield`（ratios-ttm に同梱、§3） |
| 低 β | 🟡 | 新 field `beta`（0 call、profile 再利用） |
| 10年以上 増配 | 🟡 | 新 field `consecutive_dividend_years`（+1 call dividend-history、10年 parse） |
**判定**: 全て 🟡。**ただし戦略が成長系じっちゃまプロトコルから乖離**（ディフェンシブ/インカム = オニール CAN-SLIM の対極）。**要 user 判断**（§7）。BeatScanner が NISA/インカム層も狙うなら広い訴求、protocol 純度優先なら見送り。

---

## 2. 即実装可プリセットの具体設計（P1 / P2）

state は親 SPEC の `{ preset, overrides }`。戦略プリセット選択 = 下記 overrides 束 + 既定強度を流し込む。

### P1「パーフェクト・ゲーム」overrides 束（既定強度 = 標準）
```
A.ocf_margin     = 標準(≥15%)
A.continuity     = 厳しい(3期連続増＋加速)  ← EPS/CFPS/売上 連続増
A.cfps_gt_eps    = on（死守）
B.eps_yoy        = 標準(+25%)
B.eps_cagr       = 標準(+25%/年)
B.roe            = 標準(≥17%, sector guard)
B.rev_yoy        = 標準(+20%)
C.eps_beat       = on
C.rev_beat       = on
C.guidance       = raised+maintained
```
- 想定ヒット数: 標準強度で数銘柄〜十数銘柄（親 SPEC 較正レンジ）。決算駆動 Group C を含むため谷間は少数化（仕様）。
- 🟡 依存: `cfps_3y_rising` / `rev_3y_rising`（monotonic 厳密版）。無くても `*_cagr` 近似で **MVP 出荷可**（フォールバック明記）。

### P2「新波動入り」overrides 束（既定強度 = 標準）
```
E.cup            = ブレイク確定(breakout_confirmed)
F.new_high       = confirmed＋52週高値
F.breakout_pos   = ピボット+5%以内（高値づかみ回避）
D.rs_rating      = ≥80
C.eps_beat       = on（直近決算良）
```
- 全 field 既存。**data 拡張ゼロ**。Premium tier（cup/breakout 物理除去の既存境界を踏襲）。
- 高値づかみ回避に `pivot_distance_pct ≤ +5%`（既存 field）を既定で同梱 = 親 SPEC Phase1 #3 の buy-zone を活かす。

> **§38/§5**: プリセット名は事実/比喩のみ（「鉄板」「新波動」は断定的買い推奨でない）。解説に「必ず上がる/今が好機/絶好の買い場」を出さない。色は 上昇=緑 / 過熱=amber / buy-zone=neutral。

---

## 3. data 拡張要 field 一覧 + FMP コスト + 優先度

母集団 ≈3000（Russell3000）。nightly `canslim-scan` の `_compute_one` に追記。FMP Ultimate 750 req/min。

| field | 取得元 | 追加 FMP call | 使うパターン | 優先 |
|---|---|---|---|---|
| `eps_3y_rising` / `rev_3y_rising` / `rev_cagr_3y` | 既存 income annual(limit 4→6) | **0** | P1 | ★★★ |
| `cfps` / `cfps_3y_rising` | 既存 OCF + dilutedShares（helper 済） | **0** | P1 | ★★★ |
| `beta` | 既存 profile の `beta` | **0** | P5 | ★★ |
| `shares_yoy_pct`（希薄化） | 既存 income quarter `weightedAverageShsOutDil` | **0** | P3 + UI② | ★★ |
| `operating_margin_pct` / `rule_of_40` | 既存 income quarter `operatingIncome` | **0** | P4 | ★★ |
| `rev_qoq_accel` | income quarter limit 4→8 | **0** | P3 | ★ |
| `psr`(+per/pbr/peg) | **ratios-ttm を追加**（1 call で 4-5 指標） | **+1/銘柄** ≈+3000/night | P3 + UI③ | ★★ |
| `dividend_yield` | ratios-ttm に同梱 | 上と共用(0) | P5 | ★ |
| `consecutive_dividend_years` | **dividend-history を追加** | **+1/銘柄** ≈+3000/night | P5 のみ | ☆ |
| `ipo_date`/`quarters_since_ipo` | 既存 profile `ipoDate` | **0** | P3 | ★ |

**コスト総括**: P1/P2/P4 と希薄化警告は **追加 FMP call ゼロ**（既存 fetch のデータ再利用のみ）。PSR 系で **+1 call/銘柄（4-5 指標同時取得で高効率）**。連続増配のみ専用 +1 call（P5 を採る場合だけ）。3000×1 call ≈ 4 分、GHA 45min timeout に余裕。

---

## 4. UI 解説 3 案 + §38/§5 評価

| 案 | 内容 | 実装 | §38/§5 評価 | 優先 |
|---|---|---|---|---|
| **① 合否「理由」自動生成** | 各条件の pass/fail を文章化（"営業CFマージン 22% で基準 ≥15% を満たす" 等） | **静的 dict テンプレ**（条件結果→固定文。LLM 数値計算/narration 禁止 = STATE_LABEL_JP 方式） | ✅ 安全（事実の言い換えのみ。「買い」断定を出さない限り §38 抵触なし） | ★★★（原則5 認知コスト減・P1 と対） |
| **② 希薄化警告** | `shares_yoy_pct` 急増を amber chip で「発行済株式数 前年比 +X%」 | 0-call field + chip primitive | ✅ 安全（純事実・予測なし） | ★★（P3 と対・単独でも価値） |
| **③ マルチプル過熱（「満員の映画館」）** | PSR/PER の対履歴 or 対 sector percentile を「過熱圏(上位X%)」amber 表示 | `psr` field + percentile 算出 | ⚠️ 注意（"過熱" は事実表現で可。**比喩"満員の映画館"は UI 非表示・内部のみ**。買い/売り断定にしない・最上級回避 §5） | ★★（P3/valuation と対） |

> ①は LLM 不使用が肝（近道で LLM narration を入れると必ず Trust Cliff。Hallucination Guard 静的 dict + sanitize layer のみで出す）。

---

## 5. tier 配置（親 SPEC 境界を踏襲）
- **Free**: P1 強度プリセット（Group A/B/D）+ UI① 合否理由。件数は表示・銘柄名 blur で訴求。
- **Pro**: P1 完全版（Group C 決算駆動）+ P4 Rule of 40 + UI②希薄化。
- **Premium**: P2 新波動入り（cup/breakout）+ P3 + UI③過熱（PSR）。
- P5 は tier 未定（§7 の採否判断後）。

---

## 6. 推奨ロードマップ（sprint 分割案）
1. **Sprint A（最安・最強）**: 戦略プリセット層の UI 骨格 + **P1 + P2**（P2 は 0 拡張、P1 は 0-call field `eps/rev/cfps_3y_rising` + cagr フォールバック）+ **UI① 合否理由（静的）**。← ここだけで北極星の大半を回収。
2. **Sprint B**: ratios-ttm 追加（PSR/PER/PBR/PEG/配当を 1 call で）→ **P3 + UI②希薄化 + UI③過熱**。
3. **Sprint C（採否次第）**: **P4** Rule of 40（Tech sector-gate）。
4. **Sprint D（要 user 判断）**: **P5** 全天候型（連続増配 +1 call）。protocol 乖離の戦略決定後のみ。

---

## 7. 未決事項（user 判断が要る点）
1. **P5（守りの NISA/インカム）を採るか**: 成長系じっちゃまプロトコルから戦略的に乖離。BeatScanner の対象投資家を広げる判断（採るなら連続増配 +1 call を許容）。
2. **戦略プリセットの初期搭載数**: Sprint A の P1/P2 のみ先行か、P1-P4 を一括設計か。
3. **P1 の monotonic 厳密版（`*_3y_rising`）を MVP に入れるか**、cagr 近似で出荷して後追いか。
4. **UI③ の「過熱」基準**: 対履歴 percentile か対 sector か（PSR の比較基準）。
5. 出力先: 本 draft を **planner skill で正式 SPEC 化**するか、この draft を直接 gate に乗せるか。

---

## 参考（本 SPEC が依拠した既存資産）
- 既存 22 field と FMP 取得元 / nightly batch 構成（4 cron・Supabase 4 table・3000 universe）は本セッション調査で確認済。
- 親 SPEC: Group A-G 蛇口 / PRESET_TABLE 3 段 / tier 境界 / master-detail。
- じっちゃま 2 段フィルタ（上流=常時鮮度の候補プール / 下流=決算駆動 funda_pass）。sector guard（銀行/REIT/保険/ADR で ROE・CF マージン・売上 Beat を NULL 化）は全 field 共通で踏襲。
