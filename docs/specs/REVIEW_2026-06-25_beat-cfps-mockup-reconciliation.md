# Review brief: beat/cfps Phase 2 を mockup 正本に照らして再設計する (3 体合議用)

> 2026-06-25。user 要望「デザインは mockup (`screenerstrategypresetsv8.html`) 通りに。ただし改善点があれば指摘して。3 体合議して」。
> 本 brief は ui-designer / frontend-architect / qa-dogfooder の 3 体に共通配布する論点整理。

## 0. タスク
screener_v2 (`?screener_v2=1`) の銘柄スクリーナーに、決算・収益の質条件 (beat / cfps、必要なら eps3 / rev3) を追加する Phase 2 の設計を、**user 指定 mockup を正本**として確定する。現行 SPEC は mockup とズレているため、3 体合議で「mockup に寄せるべきか / どこは data 制約で逸脱が必要か」を判定する。

## 1. 必読ファイル (各自 Read せよ)
1. **mockup (設計の正本)**: `docs/specs/mockups/screener-strategy-presets-v8.html`
   - 特に `PRESETS` 配列 (L241-264)、`cond()` (L240)、`eff()`/`baseLvl()` (L270-271)、`calcCount()` (L272-277)、`buildConds()` (L305-322)。
2. **現行 SPEC (mockup とズレあり・要 review)**: `docs/specs/SPEC_2026-06-25_screener-beat-cfps-phase2.md`
3. **現行実装**: `frontend/src/components/CustomScreenerPanel.jsx`
   - `PRESET_CONDS` (grade / binary / flag の 3 種述語)、`CROW_BINARY_META`、`CROW_LAYOUT`、`PRESET_DISPLAY_CONDS`、grade 条件の activeGrades 経路 vs binary/flag トグル vs gate(`is-gate`/必須 pill)。

## 2. 確定事実 (main が grep 検証済・前提にせよ)
- **backend データは BOOLEAN のみ**: `latest_beat`(直近決算 EPS beat, bool|None)、`cfps_3y_rising`(CFPS 4期連続増, bool|None)、`eps_3y_rising`、`rev_3y_rising`(いずれも bool|None)。全て items payload に配線済 (main.py:20347 付近)。**3 段階グレードのデータは存在しない**。
- 概算 true 率 (handover v263): beat ≈ 73%、cfps ≈ 28%。
- **現 `earnings_pass` の display conds** = `eps_yoy_pct`(grade) / `eps_cagr_3y`(grade) / `ocf_margin_pct`(grade) / `ocf_gt_netincome`(**gate**) / `roe`(grade) / `rs_percentile`(grade)。← 既に「grade 条件 + gate」paradigm。
- **現 `new_high_break` display conds** = `buy_zone` / `new_high_52w` / `cup`(Premium lock crow) / `volume_surge_pct` / `rs_percentile`。**Premium tier preset**。
- beat / cfps / eps3 / rev3 は **現状 frontend 未実装** (grep ゼロヒット)。
- **mockup の paradigm**: 条件は **default ON** (`cond()` の `on:true`)。各非 gate 条件は switch + 精度レベル (緩/標/厳、`eff()`)。preset は「これらの条件を満たす銘柄」として **default で全条件 ON**。条件を OFF にすると緩む (件数増)。← SPEC の「default OFF・additive」とは逆。

## 3. main が発見した SPEC ↔ mockup の 3 ズレ
- **ズレ1 (beat の配置)**: SPEC は beat を `earnings_pass` に「任意トグル」。mockup は beat を **`新高値ブレイク`(p2) に gate「必須・良」** で置く (L250)。決算合格には beat は無い。
- **ズレ2 (cfps の paradigm と仲間)**: SPEC は cfps を `earnings_pass` に default-OFF 単独トグル。mockup は `cfps3` を **`決算合格`(p1) 収益の質に default-ON の段階条件**として、**`eps3`(成長性) / `rev3`(成長性) と 3 点セット**で置く (L244)。
- **ズレ3 (粒度)**: mockup の連続性条件は **3 段階グレード** (直近正 / 3期連続増 / 3期+加速)。backend は **boolean 1 段階のみ**。

## 4. review 核心論点 (各自の専門レンズで回答)
- **A. mockup 忠実度**: 上記 3 ズレは「mockup に寄せる」べきか? SPEC の simpler 案 (earnings_pass に default-OFF トグル) を保つ正当理由はあるか?
- **B. 粒度ギャップ (最重要改善点)**: boolean データで mockup の 3 段階グレードを出すと「機能しない偽の段階 UI」= Trust Cliff。どう解くべきか?
  - 案① binary「達成/未達」で出し、mockup の中段「3期連続増」にマップ。グレード化は backend backlog として明記。
  - 案② 連続性 trio は graded backend 実装まで **defer** (今は出さない)。
  - 案③ その他 (提案せよ)。
- **C. default-ON の件数影響**: mockup paradigm (条件 default-ON) にすると `earnings_pass` の **現行 default 件数が変わる (絞られる)**。C-2 (count==list) は述語同一なら保てるが、SPEC の売りだった「件数デフォルト不変 SAFE」は失う。許容か? それとも default-OFF 折衷か?
- **D. beat を gate 必須にする影響**: `latest_beat` は bool|None。gate にすると **None (直近決算/予想なし) 銘柄が除外**される。free-data の beat gate を **Premium preset (新高値ブレイク)** に足す妥当性 + None ハンドリング (None を「未達」扱いで除外? それとも測定外として gate 対象外?)。

## 5. 各自の出力フォーマット (構造化・日本語)
```
## verdict: <mockup に寄せる / SPEC 維持 / 折衷 (どこを寄せどこを逸脱)>
## 論点 A 回答:
## 論点 B 回答 (粒度ギャップの推奨解・①②③ どれか + 理由):
## 論点 C 回答:
## 論点 D 回答:
## 具体推奨 (表形式): 条件 | どの preset | 形式(grade/toggle/gate) | default ON/OFF | 根拠
## リスク top3:
## この設計が BeatScanner 5 原則 (特に原則1 読み手の負担 / 原則4 人力代替) とブランド世界観に適合するか:
```

## 6. 規律 (全員遵守)
- 投資色ルール (上昇=緑 / 下落=赤 / 緊急=amber / cyan=ブランド色)。
- Trust Cliff (count==list の C-2、偽の段階/南京錠回避) が最重要バグカテゴリ。
- screener_v2 scope に閉じる (legacy 不変・`?screener_v2=1` opt-in)。
- 発光系 (`.panel-card/.bs-panel/.surface-card`) に触れない。
- UI 文字列に個人名 (「じっちゃま」) を出さない。
