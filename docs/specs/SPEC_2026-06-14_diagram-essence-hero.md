# SPEC 2026-06-14: Pane3 図解(DiagramCard)最上段「一言で言うと」L1 essence hero 追加

> **Planner 起票 (PGE 3 体ループ仕様設計層)**。 下流 Generator は本 SPEC の sprint 1 → (承認後) sprint 2 の順で実装する。 「どう作るか」 の細部は Generator に委ねるが、 §6 触禁ファイル / §制約 / pge-loop 落とし穴は **絶対遵守**。

---

## 1. Context

### user prompt 原文
> Pane3 図解(DiagramCard)の最上段に「一言で言うと」hero(L1 essence ブロック)を追加する。
> 中身 = この会社は〔何を/誰に〕売って稼ぐか + 今期決算の出来(Beat/Miss=事実の色)を 2 秒で掴ませる短い視覚ブロック。
> データは既存由来(business flow step1 + セグメント首位 + 既存 guidance verdict)。 flag `?diagram_essence=1` で default OFF・完全可逆。 1-2 sprint。

### なぜ今やるか (根拠)
- **handover v212 確定事項**: BACKLOG 全 39 項目取捨選択の結果、**B7(Pane3 図解)** が「3 つの太い塊」の 1 つとして残課題に確定。 方向性は「**(C) 累進開示** = 初心者の 2 秒理解を最上段に固定し、 上級者向け深掘り(成長ストーリー/アナリスト予想/強み/ブルベア)は下層に畳む」 で精査済。 **本 SPEC はその第一手 = L1 essence hero の追加のみ**。 L3 の畳み込み(`<details>` 化)は第二手で本 SPEC スコープ外。
- **D2 状態コンパス(v212 着地)との関係**: 同セッションで「状態コンパス」(初心者の『で、買いですか?』に §38-safe に答える信号機 UI、 `?pane3_compass=1`)が着地済。 essence hero はその思想の **双子**(2 秒理解の最上段固定) だが、 **layer が違う** — コンパスは「決算/会社/価格の 3 信号 = 判断材料の状態」、 essence は「**そもそもこの会社は何で、 今期どうだったか** = 物語の入口」。 essence が物語の冒頭、 コンパスが判断の冒頭。
- **既存図解の課題**: 現行 DiagramCard 冒頭は `headline`(LLM 生成キャッチコピー)から始まり、 「**何の会社か**」 が headline の文章を読まないと掴めない。 初心者は 1 行目で「何を売る会社か」 を視覚で掴みたい(原則 1)。

### 期待される成果 (5 原則のどれに貢献するか)
- **原則 1「読み手に負担をかけない (2 秒理解)」** ← 主軸。 「何を売る会社か × 今期の出来」 を最上段の 1 ブロックで視覚提示。
- **原則 5「図解で認知コストを下げろ」** ← 長文 headline を読ませる前に、 アイコン + 短語 + 事実の色で骨子を提示。
- **原則 3「シンプルかつリッチ」** ← 構造は中学生でもわかる(誰に何を売る + Beat/Miss)。 装飾は token のみのリッチ表現。

### 必読 memory anchor (Generator は実装前に必ず Read)
- **`feedback_section38_buy_signal_boundary.md`** ★最重要。 §38/§5 境界の SSOT。 「事実の色信号 OK / 買い場・勝てる・断定 NG / 第三者手法は描写し推奨しない / 個人名 UI 禁止」。 essence 文の正当性はここで判定。
- `feedback_diagram_quality_guard.md` (BAD 1-6 + Trust Cliff DoD)
- `feedback_llm_calc_separation.md` (数値=Python / narration=LLM 物理分離)
- `feedback_condition_pulse_pattern.md` (静的 mapping + schema 不変 で機能追加した先例)
- `feedback_feature_flag_dual_mode.md` (URL param 一時 + localStorage 永続、 URL 優先)
- `feedback_testid_all_render_paths.md` (loading/error/empty/main 全 state に testid)
- `glow_elevation_postmortem.md` / `feedback_glow_active_pattern.md` (card CSS 触る前 必読)

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

essence hero が効く感情語彙は **「驚き(surprise)」と「洗練さ(sophistication)」**。 最高級ホテルのロビーに入った瞬間「ここは○○のためのホテルだ」 と一目で伝わる入口サイン — それの投資版が essence hero。 現状は LLM が綴る headline 文を読ませて初めて会社像が立ち上がるが、 essence hero は「**誰に・何を売る会社で、 今期はこうだった**」 を入場 0.5 秒で視覚提示し、 そこから下の 7 セクション(事業フロー → セグメント → 成長ストーリー → アナリスト → 強み/リスク)へ滑らかに導く「ロビー → 各部屋への導線」 を作る。 色は事実の polarity(Beat=緑/Miss=赤/判定不可=neutral)のみに限定し、 シアンは brand emphasis 専用を堅持 — これが「洗練さ」 の柱(色の方向性逸脱を起こさない)。 `feedback_brand_aspiration.md` の anchor(修正禁止 5 感情語彙)は一切破壊しない。 新規修飾語の追加もしない。

---

## 3. Trust Cliff チェックリスト

essence hero は **ログイン後の判定タブ内部** UI(LP 訴求文言の直接対象ではない)。 ただし以下 3 項目で LP・既存訴求との整合を確認する:

1. **「2 秒で決算の出来がわかる」 系の LP 訴求と矛盾しないか** → essence hero はむしろこの訴求を **強化**(2 秒理解を最上段に固定)。 矛盾なし。 OK。
2. **Beat/Miss 表記が既存図解 headline / 状態コンパス / 5 条件カードと食い違わないか** → essence の Beat/Miss は **既存 `data.verdict` / `data.overallPass` / guidance surprise_pct の事実 mirror**。 独自再計算しない(食い違いは Trust Cliff)。 同一 source を参照することで 1:1 整合を保証。 OK。
3. **「推定値なし(unknown)」 の扱いが既存と一致するか** → 既存 headline section は `isVerdictUnknown` 時に「推定値なし」 バッジ + tooltip を出す。 essence hero も **同じ判定ロジック(`data.verdict === 'unknown' || (verdict==null && overallPass==null)`)を再利用**し、 unknown 時は Beat/Miss を出さず neutral で「判定材料待ち」 を示す。 緑/赤の誤発火ゼロ。 OK。

> 補足: 状態コンパス(D2)で撤去した「5 条件のみで Beat/Miss を出す二値 verdict(AMZN/GOOG しか緑にならない名前負け)」 の轍を踏まないこと。 essence の Beat/Miss は **guidance(アナリスト予想比 ±3%)の verdict** を mirror し、 5 条件 passedCount を Beat/Miss に流用しない。

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **No(新規 LLM 呼び出しなし)**。
- essence hero の本文は **自由文 LLM 生成を避け、 既存構造化フィールドを Python(backend)/ JS(frontend)で静的整形して組む**:
  - 「何を/誰に」 = `data.businessFlowSteps[0].label`(主力事業、 既存 LLM 出力だが **既に sanitize/citation 済の確定フィールドを参照するだけ**)+ `data.segmentSummary` 首位セグメント名(最大ウェイト、 既存数値)。
  - 「今期の出来」 = `data.verdict` / `data.overallPass` / guidance `surprise_pct`(±3% Beat/Miss、 既存 Python 判定の mirror)。
- **適用する防御層**: 新規 LLM endpoint ではないため 4 層フルではなく、 **静的整形 + sanitize layer**(condition pulse pattern の `STATE_LABEL_JP` / 状態コンパス `stateCompassText.js` と同型)。 具体的には:
  - essence の固定ラベル(「今期決算」「主力事業」「Beat」「Miss」「判定材料待ち」 等)は **静的 dictionary**(JS 定数 or 既存 label 流用)で持つ。 LLM に文を綴らせない。
  - 既存フィールド(step1.label 等)を表示する箇所は、 表示前に **既存の `sanitizeText` / BLOCKLIST_REGEX を通す**(既存図解と同じ sanitize 経路)。
  - 数値(surprise_pct / segment weight)は Python/既存配線由来をそのまま参照。 frontend で再計算しない(数値=Python 堅持)。
  - **citation 維持**: essence が参照する元フィールドの出典(guidance source_url 等)は既存セクションで既に表示済。 essence は要約 mirror なので二重表示は不要だが、 essence 内に新たな数値/固有名詞を「生成」しない(参照のみ)ことで citation 要件を満たす。
- **aggregator/ への LLM import 禁止** = 本 SPEC は backend を原則触らない(後述 §5)。 もし step1/segment 整形を backend 側で行う必要が出た場合も **visualizer/ 層(数値物理層 aggregator/ ではない)で、 既存確定フィールドの再整形のみ**。 新規 LLM call は追加しない。

> 静的 dictionary 一択。 「ちょっとだけ LLM に一言サマリーを綴らせる」 は **必ず Trust Cliff バグ**(CLAUDE.md / Refinitiv 前例)。 essence は既存フィールドの視覚的再配置に徹する。

---

## 5. スプリント分割 (1 sprint = 1 機能、 上限 6 / 本件は 2 sprint)

可逆・小さく始める方針。 **sprint 1 で完成形 MVP、 sprint 2 は dogfood verify + 磨き込み**。 Generator は sprint 1 完了 → commit → user gate 後に sprint 2 へ。

### Sprint 1 — essence hero MVP(flag OFF・frontend 完結)
- **目的**: `?diagram_essence=1` で DiagramCard 最上段に essence hero を 1 ブロック描画。 default OFF・完全可逆。
- **触るファイル**:
  - `frontend/src/lib/featureFlags.js` — `?diagram_essence=1` 用 hook `useDiagramEssence()` + `getDiagramEssenceFlag()` を **既存 pane3_v2 パターンの完全コピーで追加**(新規関数追加のみ、 既存 export は不変)。 URL param 最優先 + sessionStorage persist。 必要なら localStorage 併用は Generator 判断(`feedback_feature_flag_dual_mode`)。
  - `frontend/src/components/DiagramCard.jsx` — **挿入点 = 行2194 `<div style={{ padding: '4px 16px 20px' }}>` の直後、 Section 1 Headline(行2197 `data-testid="diagram-section-story"`)の直前**。 essence hero ブロックを `{isDiagramEssence && (...)}` で gate。 既存 headline section / verdict chip / 7 セクションは **一切変更しない**(essence は上に積むだけ)。
  - essence 構成データの導出ヘルパー(`buildEssence(data)` 等)は DiagramCard.jsx 内 or 新規 `frontend/src/components/diagram/essence.js` のような小ファイル。 中身は **既存フィールド参照 + 静的ラベル mapping のみ**(LLM なし)。
  - 静的ラベル dictionary(「今期決算」「主力事業」「Beat」「Miss」「判定材料待ち」 等)は新規小ファイル or 既存定数流用。 個人名・断定・最上級を含めない。
- **呼ぶ既存 skill** (Generator が実装中に必ず通す):
  - `pge-loop-debugger` — 着手前(selector 幻覚 / sprint 累積 / ESM return / infinite anim の 4 落とし穴回避)。
  - `hallucination-guard` — essence 文の §38/§5・BAD 1-6 適合 self-check(LLM なしでも「断定/最上級/個人名」 の混入を blocklist 観点で確認)。
  - `designing-workspace-ui` — workspace mode 内 component の token/レイアウト規律。
  - `design-system-check` — raw hex / shadow / token 違反の機械チェック(essence の色は `--color-gain`/`--color-loss`/`--color-warning`/neutral token のみ、 シアンを上昇の意味で使わない)。
  - (発光系 card CSS を触る場合のみ)着手前に `design_recipes.md §C-1〜C-4` を Read。 ただし essence は **既存 card の中に積む inner ブロックで、 新規 glow host(`.surface-card`/`.bs-panel`/`.panel-card`)を作らない** 方針 → 発光 compound 4 セット問題を回避できる(後述 §制約 4)。
- **完了判定基準**:
  1. `cd frontend && npm run build` が pass(構文 OK)。
  2. `?diagram_essence=1` 付き本番 URL で essence hero が headline の **上** に描画される。 flag なし(default)では **DOM に一切現れない**(完全 OFF・可逆)。
  3. essence hero に `data-testid="diagram-essence-hero"` が付与され、 **loading / error / empty(step/segment/verdict 欠落)/ main の全 render path** で testid が存在(欠落時は neutral fallback、 緑/赤誤発火なし)。
  4. Beat/Miss/unknown の色が既存 headline verdict と 1:1 一致(食い違いゼロ)。 unknown 時に緑/赤を出さない。
  5. essence 文に断定的将来予測 / 最上級 / 売買示唆 / 個人名が含まれない(`hallucination-guard` self-check pass)。

### Sprint 2 — dogfood verify + 磨き込み(承認後)
- **目的**: 複数 ticker で essence の見え方を検証し、 視覚品質(2 秒理解・aman 軸)を仕上げる。 sprint 1 と **同一 file(DiagramCard.jsx)を再度触るため、 sprint 1 を必ず commit してから着手**(pge-loop sprint 累積防止)。
- **触るファイル**: sprint 1 と同じ(DiagramCard.jsx の essence ブロックの polish)+ 必要なら `frontend/scripts/snap-diagram-essence.mjs`(検証 harness、 visual harness 例外 4 条件遵守、 検証後削除可)。
- **呼ぶ既存 skill**: `vision-eval`(essence hero の 2 秒理解スコア)/ `pge-loop-debugger`(harness の ESM/timeout/anim 罠)/ `design-system-check`。 必要なら `auth-harness-vision-eval`(Premium gate 内 ticker の場合)。
- **完了判定基準**:
  1. AAPL / NVDA / 非主力多事業企業(例 AMZN)/ guidance unknown 銘柄 の 4 ケースで essence が崩れず 2 秒理解できる。
  2. segment 首位が leveraged ETF 等で汚染されない(銘柄の場合は equity 前提、 `isNonEquityTicker` は essence 出さない or 簡略)。
  3. vision-eval 3 run mean で「最上段で会社像 + 今期出来が掴める」 が基準クリア。
  4. flag OFF で完全に消えること(可逆性)を本番 bundle grep で再確認。

> **多 review 不要 / multi-review 起動も sprint 完了時の任意**。 §7 の判定参照。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

以下は本 SPEC のどの sprint でも **触らない**(該当しない場合も明示):

- `backend/app/visualizer/prompt.py` — **触らない**(LLM 数値計算指示 BLOCK / pre-commit Check 1)。 essence は既存フィールド参照のみ、 prompt 変更不要。
- `backend/app/aggregator/*.py` への LLM SDK import — **追加しない**(pre-commit Check 3、 数値物理層)。 本件 backend 原則ノータッチ。
- `backend/app/visualizer/prompt_negatives.py` — **触らない**(法務 anchor BAD 1-6)。
- `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` — **ロジック変更しない**(typo 修正のみ可)。 essence は既存 sanitize を **呼ぶ**側で、 regex 本体は不変。
- `.claude/launch.json` — **触らない**(人間用)。
- `migrations/*.sql` — **触らない**(DB schema、 本件 DB 変更なし)。
- `handover_*.md` — **read-only**(参照のみ、 編集禁止)。
- `railway.toml` cron 定義 — **触らない**(本件 cron 無関係)。
- `frontend/src/App.jsx` の sticky 検索 div(`.sticky-search-band`)— **触らない**(8 回試行錯誤の安定領域)。
- `.panel-card / .bs-panel / .surface-card` 関連 CSS — **新規追加・既存変更しない**(発光バグ高リスク)。 essence は **これら glow host を新規に作らず**、 既存 `diagram-card-wrapper` の内側に inner ブロックとして積む(後述 §制約 4)。
- 加えて本件固有の触禁:
  - `frontend/src/features/judgment/constants/stateCompassText.js` — **触らない**(状態コンパスの §38 手動維持 SSOT、 別機能)。
  - 既存 7 セクション(`diagram-section-story` / `-business-flow` / `-yearly` / `-strengths-risks` / `-bullbear` 等)の **render ロジック・testid** — essence は **上に積むだけ**、 既存セクションは変更しない。
  - `frontend/src/features/judgment/components/detail/sections/StickyDiagramAccordion.jsx` の mount 配線 — 原則不変(DiagramCard に props 追加が必要な場合のみ最小限、 ただし essence は `data` 既存フィールドで完結する想定なので props 追加も不要が理想)。

---

## 7. multi-review 必要性判定

CLAUDE.md「6 体 vs 3 体」 3 軸を本 SPEC に適用:

1. **LLM 出力品質(景表法/金商法/hallucination)**: **△(間接的)** — 新規 LLM call なし。 既存確定フィールドの静的 mirror。 §38 境界の遵守は必要だが、 SSOT(`feedback_section38_buy_signal_boundary`)が確立済で `hallucination-guard` skill の self-check で担保可。 **active とまでは言えない**。
2. **Trust Cliff(LP 訴求 vs 実装)**: **△(限定的)** — ログイン後内部 UI、 Beat/Miss は既存 verdict mirror で食い違いを設計で排除済。 §3 で 3 項目クリア。 LP 訴求文言の直接改変なし。 **active でない**。
3. **新 backend endpoint + RLS/認証境界 + cache**: **No** — backend ノータッチ、 frontend 局所(DiagramCard.jsx + featureFlags.js)、 既存 schema/cache 維持。 flag OFF で完全可逆。 **非該当**。

→ **3 軸のうち 2+ が active = 該当せず**(全て △/No)。 加えて「LLM prompt 不変 + 既存 schema 維持 + frontend 局所修正のみ + scope 縮小済(1-2 sprint・flag OFF)」 = **3 体合議で十分の条件に合致**。

**判定: 3 体合議で十分(起動は任意)**。
- 根拠: 新規 LLM なし・既存 verdict mirror・frontend 局所・完全可逆 flag のため blast radius 最小。 sprint 2 完了時に視覚品質を確認したい場合のみ **ui-designer + frontend-architect + qa-dogfooder の 3 体**(全 Sonnet 並列)を 1 メッセージで起動。 sprint 1 段階は `vision-eval` + `hallucination-guard` self-check で代替可、 multi-review 省略も可。

---

## 8. 想定リスク + roll-back plan

### このスプリントが失敗したとき何が壊れるか
- essence hero は **flag OFF が default** のため、 万一描画が崩れても **通常ユーザーには一切露出しない**(`?diagram_essence=1` を付けた dogfood 時のみ表示)。 blast radius は flag 内に完全閉じる。
- 想定 failure mode:
  1. **essence の Beat/Miss が既存 verdict と食い違う**(Trust Cliff) → §3-2 の「同一 source mirror」 設計で予防。 検証は既存 headline verdict と目視 + testid 比較。
  2. **step/segment/verdict 欠落で空ブロック or 緑赤誤発火**(`feedback_testid_all_render_paths` / 状態コンパス名前負けの轍) → empty/unknown 時は neutral fallback、 全 render path に testid。
  3. **発光バグ**(`.surface-card` 入れ子等) → essence は新規 glow host を作らない方針で構造的に回避。 万一 card CSS を触ったら `design_recipes §C` 必読。
  4. **flag が OFF にできない(可逆性破綻)** → featureFlags は既存 pane3_v2 パターンの完全コピーで、 `?diagram_essence=0` / param 削除で即 OFF を保証。

### 緊急 roll-back 手順
1. **即時(コード変更なし)**: 通常ユーザーは default OFF のため影響なし。 dogfood URL から `?diagram_essence=1` を外せば即座に旧表示。
2. **本番から完全撤去が必要な場合**: 当該 sprint の commit を `git revert <hash>` → `git push origin main`(Railway auto-deploy ~30s)→ `/health` の commit 一致確認 → 本番 bundle を `curl` + `grep diagram-essence-hero` で **不在** 確認。
3. essence は **追加コードのみで既存挙動を変えない**(headline/7 セクション不変)ため、 revert は essence ブロック追加分の単純除去で完結。 既存図解への副作用なし。
4. sprint 1 commit を sprint 2 着手前に必ず分離しておくこと(pge-loop sprint 累積防止)→ sprint 2 が失敗しても sprint 1 だけ残す/戻すが容易。

---

## 付録: pge-loop 落とし穴 inject (Generator 必読)

handover v86 + `feedback_pge_loop_pitfalls` の 5 落とし穴を本件向けに具体化:

1. **sprint 間 commit 必須**: sprint 1 と sprint 2 は **同一 file(DiagramCard.jsx)を複数回触る**。 worktree は sprint を自動累積しないため、 **sprint 1 完了 → commit → sprint 2 着手**を厳守。 未 commit のまま sprint 2 を始めると sprint 1 の変更を失う/混在する。
2. **selector は data-testid を primary に**: 検証 selector は `[data-testid="diagram-essence-hero"]`。 CSS class やテキスト一致で selector を「幻覚」 しない。
3. **snap-*.mjs を作るなら(sprint 2)**:
   - ES module の **top-level return 禁止**(ESM はトップレベル return 不可、 即 SyntaxError)。 必ず `async function main(){...}` で包む。
   - animation 待ちは **try/catch** で包む(essence に entrance animation を付ける場合、 無限ループ animation を `await` すると 60s timeout で落ちる)。
   - `chromium.launch({ headless: true })` 固定、 単一実行 **60 秒以内**、 `setTimeout(()=>process.exit(2), 55000)` で hard timeout、 `finally { await browser.close() }`、 出力は `frontend/.visual/` に PNG/JSON のみ、 **HTTP/preview server を一切起動しない**(本番 URL or `file://dist/index.html`)。 検証後スクリプトは削除可。
4. **main 誤記憶 revert 禁止**: 「前はこうだった」 という記憶で既存セクションを巻き戻さない。 essence は **純粋な add-only**。

---

## 9. user dogfood feedback (2026-06-14、後続タスク後の「総合改善」でまとめて反映)

sprint 1 essence hero を本番 (`?diagram_essence=1`, NVDA) で dogfood した user feedback。**今は個別 polish せず、次タスクを進めてから図解全体を総合的に改善する方針** (user 判断: 「まだ内容が簡潔すぎてツッコむのも難しい」)。

1. **見出しの視覚的区別がない**: 「一言で言うと」 は見出しのはずだが本文と視覚的に区別がつかない → 見出し格を立てる (size/weight/色/letter-spacing/位置 で hierarchy を作る)。
2. **内容が簡潔すぎる**: 「主力事業: データセンター」「今期の決算: EPS Beat 売上 Beat」 が terse すぎて評価しづらい → 中身を richer に (何を/誰に + 一言補足、決算の数値や文脈など)。ただし **§38-safe + @no-llm (既存確定フィールドの mirror)** 制約は維持。
3. (Claude 観測) essence の Beat/Miss (決算サプライズ) と headline の 5条件 FAIL が併存し、初心者に「Beat なのに FAIL?」 と見える可能性 → 2 信号の役割を区別する極小ラベル (例: 「決算サプライズ」/「ファンダ5条件」) を総合改善で検討。

> deploy 済 commit (B7 第一手 + 配線修正): `229862c` (essence hero) / `40b7051` (flag localStorage 永続化) / `662ca03` (backend OGP redirect の flag param 保持)。全て本番 live・Chrome 実機で end-to-end 検証済。
