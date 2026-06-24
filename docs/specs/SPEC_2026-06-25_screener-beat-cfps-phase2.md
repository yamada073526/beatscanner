# SPEC 2026-06-25: screener 決算・収益の質条件を mockup 正本に揃えて追加 (beat/cfps Phase 2・v2)

> **status**: gate-1 承認待ち (承認は main が扱う)
> **scope**: screener_v2 限定 (`?screener_v2=1` opt-in)。legacy screener は不変
> **設計判断**: user 確定済 + 3 体合議 (ui-designer / frontend-architect / qa-dogfooder) 反映済
> **v2 改訂理由**: user 指定 mockup `docs/specs/mockups/screener-strategy-presets-v8.html` を設計正本として再設計。v1 (beat/cfps を共に earnings_pass の任意トグル) は mockup と 3 点ズレていたため 3 体合議で再構成 (下記 §1.5)。

---

## 1. Context

**user 要望**: screener_v2 に決算・収益の質条件を追加。**デザインは mockup (`screener-strategy-presets-v8.html`) 通りに、ただし実データ制約で逸脱が要る箇所は改善点として明示**。

**対象フィールド (backend に boolean で配線済・main が grep 検証)**:
| field | 意味 | 型 | items payload | 概算 true 率 |
|---|---|---|---|---|
| `latest_beat` | 直近決算で EPS が市場予想を上回ったか | bool\|None | main.py:20347 ✅ | ≈73% (null<3%) |
| `cfps_3y_rising` | CFPS (営業CF/希薄化株式数) 4 期連続増 | bool\|None | main.py:20350 ✅ | ≈28% |
| `eps_3y_rising` | EPS 連続増 | bool\|None | main.py:20343 ✅ | — |
| `rev_3y_rising` | 売上連続増 | bool\|None | main.py:20344 ✅ | — |

**なぜ今やるか**:
- handover v263 §🔴「次セッション最優先 = beat/cfps Phase 2」。前提 (全量 populate = 6/24, beat 2424/cfps 2374, null<3%) は満たされた。
- backend payload には 4 フィールド全て載っている。**隠れ blocker は freshness map の key 欠落** → frontend で crow を足しても `CustomScreenerPanel.jsx:1040` の `if (!universe?.freshness?.[meta.freshness]) return null;` で非表示になる。
- ⚠️ **現コード L332-334 の明示 defer コメント**:「cfpsgt/beat (実データ無し) は free で applied gate にすると全滅するため gate に含めない。データ整備は別 sprint」。**この「実データ無し」は populate 完了で解消済** → 本 SPEC が beat gate 化の「別 sprint」に該当。コメント更新が必須。

### 1.5 mockup 正本との照合 (3 体合議の結論)

mockup `PRESETS` (L241-264) を正本とすると、v1 SPEC は 3 点ズレていた。3 体合議 (verdict: 全員「折衷」) で以下に再構成:

| 項目 | mockup 正本 | v1 SPEC (誤) | v2 確定 (合議 + user) |
|---|---|---|---|
| **beat の配置** | `新高値ブレイク`(p2) の **gate「良」** (L250) | earnings_pass の任意トグル | **`new_high_break` に gate 必須** (全員一致 + user 推奨採用) |
| **cfps の仲間** | `決算合格`(p1) に cfps3/eps3/rev3 **3 点セット** (L244) | cfps 単独 | **eps3/rev3/cfps3 を earnings_pass に 3 点セット** (user 確定) |
| **default** | default-ON | default-OFF | **default-OFF・任意トグル** (実データ cfps≈28% で ON だと 72% 減=離脱。mockup の ON は mock data 前提。user 確定=改善点) |
| **粒度** | 3 段階グレード (直近正/3期連続増/3期+加速) | binary | **binary「達成/未達」のみ・段階 UI (mseg) は出さない** (全員一致: boolean で段階 UI = 偽の段階 = Trust Cliff)。graded 化は backend backlog |

**合議の核心**: mockup の **構造 (preset 配置・グルーピング) は忠実に踏襲**し、**粒度のみ実データ制約で逸脱** (boolean→binary)。default は mockup の ON でなく OFF (実 true 率格差を mockup が考慮していないため・改善点)。

**必読 memory anchor (Generator は着手前に Read)**:
- `feedback_facet_filter_count_integrity.md` — **C-2 SSOT** (count==list)。本件最重要。
- `feedback_edit_replace_all_drift.md` — `extra` が 9 occurrence に複製。grep で全件確認。
- `feedback_pge_loop_pitfalls.md` — 同一 file 複数 sprint 累積なし / ESM return / 順序依存。
- `project_screener_tab_redesign.md` — screener_v2 crow/preset 全体像。

**5 原則への貢献**:
- **原則4 (人力代替・北極星)**: 投資家が決算後に手作業でやる「EPS が予想を超えたか」「CF が継続的に伸びているか」「ブレイク銘柄の直近決算は良いか」を crow/gate で肩代わり。情報の足し算でなく人力スクリーニングの代替。
- **原則1 (読み手の負担)**: 既存 crow primitive を流用。段階 UI を出さないことで「押しても変わらない」混乱を回避。

---

## 2. ブランド世界観 (Aman/Ritz 級) への適合

5 感情語彙のうち「**洗練さ**」。既存 `.screener-crow` の switch / gate primitive をそのまま流用し、新 CSS・発光・色を一切持ち込まない。**偽の 3 段階 UI を出さない判断**こそ「約束を守る上質さ」= Aman/Ritz 級 (「メニューにある料理が実在する」)。`feedback_brand_aspiration.md` の修正禁止 anchor には触れない (CSS 追加ゼロ)。

---

## 3. Trust Cliff チェックリスト

| # | 項目 | 整合性 | 根拠 |
|---|---|---|---|
| 1 | 「登録不要」「3 銘柄/日無料」 | 影響なし | 4 フィールド全て free tier。課金/登録導線に触れない |
| 2 | 「Premium で解錠」表記との矛盾 | 無し | 4 フィールドに `locked` を付けない (free data)。嘘の南京錠なし |
| 3 | **件数 (count) と結果リスト (list) の一致 = C-2** | **死守** (最重要) | toggle/gate の述語を count (`countPreset`/`PRESET_PREDICATES`) と list (`applyStrategyImpl`/`itemPasses`/`extra`) の**両方に同一述語**で。`extra` 9 occurrence + 依存配列の漏れゼロ |
| 4 | 偽の段階 UI | 回避 | boolean に 3 段階 (mseg) を出さない。binary「達成/未達」のみ。段階化は backend graded 実装まで defer |
| 5 | beat gate の None 全滅 | 緩和 | `=== true` で None/false 除外。tooltip に「予想データ非公表の銘柄は対象外」注記 + empty サジェスト救済。dogfood で除外過多なら toggle 降格 (§5 Sprint 3) |
| 6 | 件数デフォルト急落 | 回避 | earnings_pass の 3 条件は **default OFF** (件数不変 SAFE)。cfps≈28% でも初期件数は変わらず、ユーザーが ON で絞る |

→ Trust Cliff 該当: 項目 3 (C-2) + 4 (偽段階) + 5 (None) が active。**本 SPEC の最重要規律**。

---

## 4. Hallucination Guard 適合

**LLM 呼び出し**: **No**。4 フィールドは backend (`screener_fundamentals`) で Python 計算済の bool|None。frontend は `item.X === true` の真偽判定のみ。LLM narration / 数値生成 / §38 / §5 違反は発生しない。静的 dictionary (`CROW_BINARY_META` の固定 label/tooltip) + bool 述語で完結 → 4 重防御の新規適用は不要。

---

## 5. スプリント分割 (3 sprint・順序依存)

> **分割根拠**: backend freshness (blocker 解除) → frontend を順序固定 (`feedback_pge_loop_pitfalls.md`)。frontend は earnings_pass トグル群 (Sprint 2) と new_high_break beat gate (Sprint 3) を分離 (gate は None/二重管理が複雑で blast radius が大きい)。**Sprint 2/3 は同一 file (CustomScreenerPanel.jsx) を触るため sprint 間 commit 必須**。

### Sprint 1: backend freshness map に 4 key 追加 (blocker 解除・先行必須)

- **触るファイル**: `backend/app/main.py` のみ。
- `_build_universe_payload` (L20160)、`freshness["funda"] = sf_cd` (**L20171**) の直後に 4 行追加 (全て funda と同源 calc_date `sf_cd`):
  ```python
  freshness["latest_beat"] = sf_cd
  freshness["cfps_3y_rising"] = sf_cd
  freshness["eps_3y_rising"] = sf_cd
  freshness["rev_3y_rising"] = sf_cd
  ```
- ※ items payload の 4 フィールド (L20343/20344/20347/20350) は配線済・**不変**。
- **DoD**:
  1. `python -c "import app.main"` 相当の構文/import エラーなし。
  2. deploy 後 (commit→push)、universe payload を curl して `freshness.latest_beat`/`cfps_3y_rising`/`eps_3y_rising`/`rev_3y_rising` が非 null で grep ヒット。
  3. remote 環境で本番 curl が 403 の場合は CI dogfood (`screener_v2_dogfood.yml`) ログで確認。
- **C-2 関与**: なし (freshness は表示 gate のみ)。
- ⚠️ **sprint 間 commit 必須**: Sprint 2 着手前に commit+push+本番 freshness 確認。逆順だと crow 非表示で誤診。

### Sprint 2: earnings_pass に連続性 trio (eps3/rev3/cfps3) を任意トグル crow 追加 (C-2 死守)

- **目的**: mockup p1「決算合格」に eps3/rev3/cfps3 を **binary 任意トグル (default OFF)** で追加。段階 UI なし。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` のみ。具体行:

  **(a) `PRESET_CONDS` (L225 付近)** に 3 件 (`=== true` 厳密判定):
  ```js
  { key: 'eps_3y_rising',  kind: 'flag', flag: 'eps3RisingOnly',  pass: (item) => item.eps_3y_rising  === true },
  { key: 'rev_3y_rising',  kind: 'flag', flag: 'rev3RisingOnly',  pass: (item) => item.rev_3y_rising  === true },
  { key: 'cfps_3y_rising', kind: 'flag', flag: 'cfpsRisingOnly',  pass: (item) => item.cfps_3y_rising === true },
  ```

  **(b) `CROW_BINARY_META` (L285 付近)** に 3 件 (**`locked` 付けない**・`th: null`・段階表現なし):
  ```js
  eps_3y_rising:  { label: 'EPS 連続増',  th: null, freshness: 'eps_3y_rising',  tooltip: '<§UI 文言>' },
  rev_3y_rising:  { label: '売上 連続増', th: null, freshness: 'rev_3y_rising',  tooltip: '<§UI 文言>' },
  cfps_3y_rising: { label: 'CFPS 連続増(4期)', th: null, freshness: 'cfps_3y_rising', tooltip: '<§UI 文言>' },
  ```

  **(c) `CROW_LAYOUT` (L290 付近)**: 「品質」group に **新 sub「決算の継続性（連続増）」** を追加して trio を視覚分離 (ui-designer 推奨: grade 条件と「精度スライダー非連動」を区別)。例:
  ```js
  { group: '品質', sub: '決算の継続性（連続増）', keys: ['eps_3y_rising', 'rev_3y_rising', 'cfps_3y_rising'] },
  ```

  **(d) `PRESET_DISPLAY_CONDS.earnings_pass` (L314 付近)** の配列末尾に `'eps_3y_rising', 'rev_3y_rising', 'cfps_3y_rising'` を追加。
  → ⚠️ `new_high_break`/`sector_leader`/`hot_sector` には追加しない (sector_leader 拡張は別 sprint backlog)。

  **(e) useState 3 件 (L527 `adVolumeOnly` 付近・default false)**:
  ```js
  const [eps3RisingOnly, setEps3RisingOnly]   = useState(false);
  const [rev3RisingOnly, setRev3RisingOnly]   = useState(false);
  const [cfpsRisingOnly, setCfpsRisingOnly]   = useState(false);
  ```

  **(f) `binBindings` (L1061) に 3 件** (toggle switch 描画のため):
  ```js
  eps_3y_rising:  [eps3RisingOnly, setEps3RisingOnly],
  rev_3y_rising:  [rev3RisingOnly, setRev3RisingOnly],
  cfps_3y_rising: [cfpsRisingOnly, setCfpsRisingOnly],
  ```

  **(g) C-2 死守 — `extra` の全 occurrence + 依存配列に 3 flag 追加**:
  - `const extra = {` literal: **L648 / L718 / L732 / L753** (+ inline `itemPasses` 形 **L833 / L844 / L857 / L1248**)。L459 は別系統 (cfg.extra スプレッド) なので触らない。
  - **箇所別判断** (`replace_all` 厳禁): L857/L1248 は一部 key を意図的除外しているため、`adVolumeOnly` が含まれる occurrence にのみ trio を足す。
  - `useMemo` 依存配列 (**L650/L725/L747/L822/L837/L848/L859** = `adVolumeOnly` を含む全配列) にも 3 state を追加。

  **(h) reset 経路に 3 件**:
  - `applyStrategyImpl` reset 群 (**L566-571**) に `setEps3RisingOnly(false); setRev3RisingOnly(false); setCfpsRisingOnly(false);`
  - 「リセット」ボタン (**L1680**) の onClick chain に同上
  - empty サジェスト「外す」分岐 (**L1836-1844**) は追加任意 (件数不変を壊さなければ可)

- **段階 UI を出さない厳守**: `th: null` + binary switch のみ。アドバンスドモードの level selector (mseg) を boolean フィールドに**絶対出さない** (qa-dogfooder: 偽段階=Trust Cliff)。renderCrow が level selector を出す条件を Generator が再確認。
- **呼ぶ skill**: `screener` / `funnel-cro` (件数誠実性=軽 checklist) / `pge-loop-debugger` (起動前)。
- **DoD**:
  1. `cd frontend && npm run build` PASS。
  2. **C-2 verify (ground truth)**: `?screener_v2=1` → earnings_pass → 「EPS 連続増」「売上 連続増」「CFPS 連続増(4期)」crow が各 1 つ「決算の継続性」sub に出る。**default OFF で件数不変**、ON で件数減 + **タイル件数 = 実リスト行数 一致**。
  3. `data-cond="eps_3y_rising"`/`"rev_3y_rising"`/`"cfps_3y_rising"` + `data-testid="screener-cond-row"` 確認。段階 UI が出ていないこと。
- ⚠️ **sprint 間 commit 必須** (Sprint 3 と同一 file)。

### Sprint 3: new_high_break に beat を gate「必須」追加 (C-2 + None 死守)

- **目的**: mockup p2「新高値ブレイク」に beat を **gate 必須 (常時 ON)** で追加。テクニカル×決算の交差 (原則4)。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` のみ。具体行:

  **(a) `PRESET_CONDS`** に 1 件:
  ```js
  { key: 'latest_beat', kind: 'flag', flag: 'beatOnly', pass: (item) => item.latest_beat === true },
  ```

  **(b) `CROW_BINARY_META`** に 1 件 (**`locked` 付けない**・free data):
  ```js
  latest_beat: { label: '直近決算ビート', th: null, freshness: 'latest_beat', tooltip: '<§UI 文言・None注記入り>' },
  ```

  **(c) `PRESET_DISPLAY_CONDS.new_high_break` (L317)** の配列に `'latest_beat'` を追加。

  **(d) `PRESET_GATE_CONDS` (L335)** に新 preset entry:
  ```js
  new_high_break: ['latest_beat'],
  ```
  → これで new_high_break 選択時に beat が `is-gate` (南京錠 + 必須 pill・トグル不可) で描画される (renderCrow L1044)。

  **(e) `PRESET_PREDICATES.new_high_break` (L413)** の extra に `beatOnly: true` 追加:
  ```js
  new_high_break: { extra: { buyZoneOnly: true, newHigh52wOnly: true, beatOnly: true } },
  ```
  (countPreset が beat を算入)

  **(f) `applyStrategyImpl` の `new_high_break` 分岐 (L580-584)** に `setBeatOnly(true)`。他 preset 分岐 + reset 群 (L566-571) + リセットボタン (L1680) に `setBeatOnly(false)`。
  (list が beat で絞る・count==list)

  **(g) useState `[beatOnly, setBeatOnly] = useState(false)` (L527 付近)**。
  → ⚠️ **binBindings には追加しない** (gate はトグル switch を描画しない・isGate 経路で 必須 pill のみ)。

  **(h) C-2 — `extra` 全 occurrence + 依存配列に `beatOnly` 追加** (Sprint 2 (g) と同じ箇所群)。

  **(i) L332-334 の defer コメント更新**: 「beat は実データ無しで defer」→「beat は populate 済 (v263) のため new_high_break gate 化済 (本 SPEC)。cfpsgt 等は別途」に修正。

- **None ハンドリング (死守)**: `=== true` で None/false 除外。tooltip に「直近決算の EPS 予想が非公表の銘柄は対象外」を明記。empty サジェストが「beat を外すと N 件」を出せるか確認 (gate のため厳密には外せないが、preset 全体の救済文脈で件数提示)。
- **dogfood 検証 (重要)**: new_high_break (free vs Premium) で beat gate 追加後の件数を確認。**ブレイク銘柄が gate で過剰に消える (0 件近く) なら toggle 降格を別 SPEC で判断** (ui-designer 慎重案の保険)。
- **呼ぶ skill**: `screener` / `funnel-cro` / `pge-loop-debugger`。
- **DoD**:
  1. `npm run build` PASS。
  2. **C-2 verify**: `?screener_v2=1` → new_high_break → beat が「必須」gate (南京錠) で 1 つ出る。タイル件数 = 実リスト行数 一致。
  3. `data-cond="latest_beat"` + `data-gate="1"` 確認。
  4. None 銘柄が除外され、tooltip 注記が出る。件数が極端に減っていないか目視 (減りすぎなら報告)。

---

## 将来拡張 / backlog (今回 scope 外・明記)

- **段階グレード化 (backend)**: mockup の 3 段階 (直近正/3期連続増/3期+加速) を出すには backend で graded フィールドが必要。実装後に frontend を binary→graded 昇格。今回は binary 中段「連続増」にマップ。
- **sector_leader への trio 拡張**: dogfood 後に別途判断 (今回は earnings_pass のみ)。
- **beat gate→toggle 降格判断**: Sprint 3 dogfood で除外過多が判明したら別 SPEC。
- **🔴 mockup ↔ 実装 全体監査 (user 依頼・本実装シリーズ完了後)**: 本件のように mockup (`screener-strategy-presets-v8.html` 他) と実装が乖離している箇所を全 preset・全条件で洗い出し、リスト化 → 修正推奨 or サブエージェントレビュー。**本 Phase 2 実装完了後に実施**。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| ファイル / 領域 | 指示 |
|---|---|
| `backend/app/visualizer/` `aggregator/` への LLM SDK import | 触らない (本件 LLM 非関与) |
| `frontend/src/lib/blocklist.js` | 触らない |
| `migrations/*.sql` | 触らない (4 カラムは v263 適用済・全量 populate 済) |
| `frontend/src/App.jsx` の sticky 検索 div | 触らない (8 回試行錯誤の安定領域) |
| `.panel-card / .bs-panel / .surface-card` CSS | 触らない (発光バグ高リスク。crow は既存 `.screener-crow` DOM 行追加のみ・CSS 新規ゼロ) |
| **legacy screener (screener_v2 以外)** | 触らない (`?screener_v2=1` opt-in に閉じる) |
| **`main.py:20343/20344/20347/20350` (items payload)** | 触らない (配線済。Sprint 1 は freshness map のみ) |
| **`CROW_LAYOUT` の他 group / 他 preset の `PRESET_DISPLAY_CONDS`** | earnings_pass / new_high_break 以外に trio/beat を足さない |
| **`extra` L459 (cfg.extra スプレッド)** | 触らない (別系統。trio/beat を手で足さない) |
| **段階 UI (mseg / level selector)** | boolean フィールドに**絶対追加しない** (偽段階=Trust Cliff) |
| Dockerfile VITE_ ARG/ENV | 新 VITE_ 変数なし → 触らない |

---

## 7. multi-review 判定 (実施済)

CLAUDE.md 3 軸: ①LLM 出力品質=No ②Trust Cliff=限定 Yes (C-2/偽段階/None) ③新 endpoint/RLS=No → **3 体合議で十分**。**2026-06-25 実施済** (ui-designer + frontend-architect + qa-dogfooder)。

**verdict 統合**: 全員「折衷」一致。①beat→new_high_break gate (全員一致) ②段階 UI 出さない・binary (全員一致) ③default OFF (2/3、qa 含む) ④eps3/rev3 trio 化 (2/3) ⑤beat gate vs toggle は 2/3 gate・ui-designer 慎重 → user 推奨 gate 採用 + dogfood 保険。詳細 brief: `docs/specs/REVIEW_2026-06-25_beat-cfps-mockup-reconciliation.md`。

---

## 8. 想定リスク + roll-back

| リスク | 内容 | 対策 |
|---|---|---|
| **C-2 ズレ (最重要)** | `extra` 9 occurrence / 依存配列のどれかに trio/beat 漏れ → count≠list | grep で `adVolumeOnly` 含む全箇所確認 (§5 g/h)。dogfood で count==list を ON/OFF 両方目視 |
| **順序依存 blocker** | Sprint 2/3 を Sprint 1 前に着地 → freshness 無しで crow 非表示 → 空回り | Sprint 1 を**必ず先に** commit+push+本番 freshness 確認 |
| **偽段階 UI** | boolean に mseg を出すと「厳しい押しても変わらない」欺き | `th:null` + level selector を boolean に出さない (§5 Sprint 2) |
| **beat None 全滅** | gate で None 銘柄 (予想非公表) が無言で消える | `=== true` + tooltip 注記 + dogfood 件数確認 → 過剰なら toggle 降格 (別 SPEC) |
| **依存配列取りこぼし** | extra 更新したが useMemo 依存に未追加 → トグルしても stale | 依存配列 grep 確認 (§5 g) |
| **二重管理ズレ (beat gate)** | PRESET_PREDICATES.extra を更新したが applyStrategyImpl 分岐に setBeatOnly(true) 漏れ → count≠list | 両方を同時更新 (§5 Sprint 3 e/f) |

**roll-back**: 各 Sprint は独立 commit。問題時 `git revert <commit>` → push (Railway auto-deploy ~3 分)。DB migration 不要 (schema 不変) → revert で完結。frontend revert すれば backend freshness key は残置可 (使われない key が増えるだけ・無害)。

---

## UI 文言 (個人名禁止 / §38 / §5 準拠・事実記述のみ)

| key | label | tooltip |
|---|---|---|
| `latest_beat` | **直近決算ビート** | 「直近の決算で 1 株利益 (EPS) が市場予想を上回った銘柄。直近決算の EPS 予想が非公表の銘柄は対象外となります。」 |
| `cfps_3y_rising` | **CFPS 連続増(4期)** | 「1 株あたり営業キャッシュフロー (CFPS) が直近 4 期連続で増加した銘柄。」 |
| `eps_3y_rising` | **EPS 連続増** | 「1 株利益 (EPS) が直近 3 期連続で増加した銘柄。」 |
| `rev_3y_rising` | **売上 連続増** | 「売上高が直近 3 期連続で増加した銘柄。」 |

> いずれも「上がる」「買い」等の予測・断定語 (§38)、「最強」「最高」等の最上級 (§5) を含めない。
