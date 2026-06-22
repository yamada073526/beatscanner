# SPEC 2026-06-21: screener「買い場の質」3条件 + 「上昇余地 vs 過熱」判断ビュー (Phase 1)

> **status**: draft (multi-review 6体合議 → user 承認 gate 1 待ち) / **slug**: `screener-buy-quality-headroom`
> **前提 SSOT (Generator/reviewer は着手前に必ず Read)**:
> - 監査 SSOT: [[project_screener_condition_expansion]] (KB 全行 sed 検証済の gap 監査 + 数値しきい値 + 段階ロードマップ。Phase 1 = #1/#3/#8 + 案A)
> - 投資条件 SSOT: [[reference_jijima_investment_criteria]] / [[reference_canslim_oneill_rules]] (閾値は KB が正・実装都合で変えない)
> - KB 原典: `/Users/yamadadaiki/Projects/investment-knowledge-base/knowledge_base/by_domain/trading.md` (絶対パス参照・物理統合しない)
> - 作法の型紙: `docs/specs/SPEC_2026-06-21_jijima-funda-2stage-filter.md` (§0 確定事項 / guard 3層 / tuple arity 手順 / None-preserve の型)
> - §38 状態コンパス: [[feedback_section38_buy_signal_boundary]] (累進開示3信号 + ⓘ。本 SPEC §4 の判断ビュー設計の土台)
> **本 SPEC は LLM 不使用** (数値物理層 + 静的 dictionary のみ、§4 参照)

---

## 0. 6体合議 verdict + 確定事項 (2026-06-21、READ FIRST・SSOT)

> **6体合議 (金融/マーケ/Anthropic=Opus + UI/設計/開発=Sonnet) = 全員「条件付賛成」・否決 0** + **user gate 1 承認済**。以下 §0 が §1-§8 / 付録B の未決・矛盾を確定する SSOT。conflict 時は §0 を優先 (特に §5 Sprint 1/2 の pivot 保持場所は §0-4 が上書き)。

### 0-1. user gate 確定 (2026-06-21)
1. **tier = #1 free / #3 Premium / #8 Premium**: #1(ファンダの質)=free (ocf_margin と同列)。#3・#8(タイミング系・price 依存)=Premium (cup/breakout と同列、「質=無料/タイミング精度=Premium」の一貫物語)。**件数・facet 種類は無料、銘柄名のみ Premium blur** (ADR §0-7、既存 mask 流用・新設禁止)。**blur 状態の Premium count も itemPasses 同一 predicate で算出・null を達成扱いしない** (最大 Trust Cliff、マーケ verdict)。
2. **色運用 = neutral / amber / amber**: 買い場圏(≤+5%)=**neutral 無彩色** / 注意(+5〜10%)=薄 amber / 過熱(>+10%)=濃 amber。**green/teal/cyan/red は不使用** (CLAUDE.md「シアンを上昇で使わない」+ §38 最安全、金融 verdict)。色で「買い」を暗示せず、過熱のみ警告。

### 0-2. A/D 集計期間 = 13週(65営業日) で確定 (KB原典)
金融が KB 原文検証 (trading.md:4116「13週・50日平均出来高」/:214「週次 上昇引け週 vs 下落引け週」) → **#8 A/D は 13週(65営業日) window** で算出 (SPEC §5/付録B の「日次 50日 or 13週」曖昧二択は KB 忠実な **13週=65営業日** に倒す)。**down-volume が極小/0 の銘柄は null** (比の発散による偽「買い優勢」を防止、金融+開発)。日次 up/down day volume 合計比を 65営業日 window で計算 (週次集計は将来精緻化可)。

### 0-3. #1 OCF>純利益 (TTM + guard)
TTM(直近4Q合計) OCF > TTM netIncome の **bool** (単期は運転資本変動で偽陽性、営業CFマージンと窓を揃える)。**sector guard 必須**: 既存 `_roe_sector_guard` 流用で銀行/保険/REIT/証券/Consumer Finance/Mortgage = null。**特に REIT は減価償却で OCF≫NI が常態 → guard しないと無条件 pass=ザル化** (金融)。外貨ADR (reportedCurrency≠USD) も null。netIncome は既存 income-statement(quarter) fetch を拡張して拾う (**追加 FMP call ゼロ**、Anthropic 確認: netIncome は `_compute_one` 内で現在未利用)。

### 0-4. #3 pivot distance = precompute せず universe 都度算出 (§5 Sprint 1/2 を上書き)
設計・開発・Anthropic の3体一致。**`screener_fundamentals` に `pivot_distance_pct` 列を作らない**。理由: 現値依存の比率を nightly 永続化すると 12-24h 古い % が出る + DB値と universe計算値の二重管理。
- **S1 の migration は #1 (`ocf_gt_netincome` bool) の1列のみ** に縮小 (tuple arity は #1 分 +1 のみ)。
- **S2 で `pattern_signals.payload` から pivot price を universe item に付与** (現在 universe は cup_state のみ SELECT、pivot price 未付与 → payload parse 追加)。pivot distance % は universe endpoint で `(current_price - pivot)/pivot×100` を都度算出。universe item に current_price/close があるか Generator が grep 確認 (無ければ price merge)。
- **pivot 下 (distance<0 = ブレイク前) は「買い場圏」に含めない** (別ラベル「ブレイク前/節目下」、金融)。buy zone 定義 = `0 ≤ distance ≤ 5`。

### 0-5. #8 A/D = nightly precompute (cup 系列流用)
観測窓 (盤中変動なし) のため nightly precompute が最適 (設計)。cup_handle 検出 (`main.py:13282` 周辺) が取得済の closes/volumes を流用、**追加 FMP fetch ゼロを Generator が grep 確認** (取得系列長 < 65営業日 の銘柄は null + null率を S4 DoD に記録)。FMP price-history は降順の可能性 → index 方向を実測。

### 0-6. 案A 判断ビュー (配置・形状)
- **配置 = JudgmentDetail** (ticker 詳細、主訴=詳細を見た瞬間に判断/UI)。**二重 mount `!isV5` と `isV5` の両方に置く** (開発)、gate は `result` でなく **`detail?.error`** ([[feedback_judgmentdetail_result_gate]])。**idle hero は Phase 2** (Phase 1 対象外)。
- **形状 = 水平ゾーンバー + 三角マーカー** (現在値の位置を2秒理解、UI)。主軸=pivot distance 3ゾーン、副軸=A/D + inst_holders_qoq の小カード2列 (補強証拠、主軸を上書きしない)。実数は Stat tier(18px fw700)、ラベルは Label tier(12px fw500)。ゾーン背景 opacity 0.15-0.25 + 0.5px 細線 (太ボーダー=安っぽさ回避)。
- **UI 主ラベルは中身忠実**: A/D は「出来高の質 (上昇引け優勢)」と表記、**「機関の買い上がり」はマーケ/将来配信コピー限定** (A/D≠13F、マーケ+金融)。「上昇余地」は view 内部名で可、**UI 価格ラベルには出さない** (現在状態語へ、§38、金融)。

### 0-7. facet 情報設計 (accordion グルーピング)
#1/#3/#8 を既存 facet 末尾にフラット追加しない (破綻、UI)。**「品質(ファンダ)/タイミング(テクニカル)/需給」の3カテゴリ accordion or tab に再編**してから binary facet を追加 (#1/#3/#8 とも OCF_MARGIN_FACET 同型の独立 binary、null除外、自己排除 chip count)。

### 0-8. Hallucination Guard / 検証 (Anthropic)
- 案A の静的 dict (`buyHeadroomText.js` 等) 冒頭に **`@no-llm` JSDoc + 「動的生成・テンプレ補間禁止」コメント** (frontend は pre-commit で守られないため規律明文化、`STATE_LABEL_JP` 慣習)。
- **blocklist 誤爆検証を DoD 化**: 新規状態ラベルを blocklist 関数に通して削除 0 を assert (regex 追加は不要、「買い場圏」単独は複合 regex に非ヒット確認済)。§38 禁止語 grep は1箇所集約コマンドで (`買い場[^"']*|今が好機|買いです|絶好|最良|本命`)。
- **canslim-scan regression を DoD 化**: S1/S4 で migration 適用 + 手動 1 回 scan → 新列 **+ 既存列 (rs/eps_yoy/ocf_margin) の non-null 維持** を確認 (tuple arity 取り残しで nightly 全停止が最大 blast radius)。tuple arity assert は「最新 main ± 追加列数」(絶対値 hardcode 禁止)。

### 0-9. 実装順序 (金融 verdict)
主訴②(高値づかみ)を最速着地するため **#3 主軸の判断ビューを #8 完成を待たず先行可** (#3 は KB 整合確定で gate 不要、#8 は集計実装が重い)。SPEC の S1→S5 順序は維持しつつ、S5 案A は #3 単独でも成立する設計に (A/D 副軸は後追い可)。

---

## 1. Context

### user prompt 原文
> screener に「買い場の質」3条件 + 「上昇余地 vs 過熱」判断ビューを追加する。じっちゃま/オニール KB 監査で確定した未搭載条件のうち Phase 1 を実装する。user dogfood の主訴「機関の買い上がりが分からず、上昇余地か高値づかみか判断できない」への直接回答。

### なぜ今やるか (根拠)
- **dogfood の主訴 (2026-06-21)**: user が「**機関の買い上がりが分からず、上昇余地か高値づかみか判断できない**」+「KB にあるのに検索できない条件があるなら搭載して」と要望。監査 sub-agent が KB 全行 sed 検証で gap を洗い出し ([[project_screener_condition_expansion]] 由来)。
- **段階ロードマップで Phase 1 が「推奨first」と確定済**: 監査 SSOT の段階ロードマップが Phase 1「買い場の質」(#3 高値づかみ + #8 A/D 出来高 + #1 OCF>純利益 + 案A 判断ビュー) を「**dogfound pain 直答**・人力代替×容易性で最優先」と明記。3 条件すべて**既存 data で算出可** (追加 FMP fetch を最小化できる)。
- **直前 SPEC (営業CFマージン) で上流ファンダ基盤が着地済 (handover v240)**: `ocf_margin_pct` / `fcf_margin_pct` の nightly batch + universe + facet が本番 LIVE。本 SPEC はその基盤の隣に「買い場の質 (タイミング軸)」を足す自然な続き。残バックログ §🟡 の「②『営業CF>純利益』品質フラグ (netIncome も cf_data にあり追加 call なしで実装可、加点バッジ)」が本 SPEC の #1 に相当。
- **テーマの本命対応**: 主訴①「機関の買い上がり」= #8 A/D 出来高 + 既存 `inst_holders_qoq_pct` の組合せ。主訴②「上昇余地 vs 高値づかみ」= #3 pivot distance。両テーマを 1 SPEC で同時に閉じる。

### Phase 1 スコープの境界 (この 3 条件 + 1 ビューのみ)
本 SPEC が扱うのは監査テーブルの **#1 / #3 / #8 の 3 条件 + 案A「上昇余地 vs 過熱」判断ビュー**のみ。

| # | 条件 | KB 出典 (trading.md:行) | 提唱 | Phase 1 で実装する形 |
|---|---|---|---|---|
| **#1** | 営業CF > 純利益 (粉飾フィルタ) | 5291-5293 | じっちゃま | TTM OCF > TTM netIncome の **bool** (既存 `cf_data` 流用、追加 fetch ゼロを確認) |
| **#3** | 高値づかみ警戒 / buy zone | 178 / 1206 | オニール | pivot distance % → **3 区分** (≤+5%=買い場圏 / +5〜10%=注意 / >+10%=過熱)。pivot 無しは null |
| **#8** | A/D 出来高の質 (機関の継続買い) | 214 / 190 | オニール | 上昇引け日 volume 合計 ÷ 下落引け日 volume 合計 (**>1=買い優勢**)。集計期間は §0 で確定 |
| **案A** | 「上昇余地 vs 過熱」判断ビュー | (#3 + #8 の統合提示) | — | ticker 詳細に pivot distance を主軸 + 機関の買い (A/D + inst_qoq) を副軸にした **状態コンパス** |

> ⚠️ **本 SPEC 対象外 (Phase 2-3、別 SPEC)**: #2 EPS/売上 加速度 / #4 クライマックストップ / #5 業種グループ RS / #6 機関の質 / #7 過剰保有 / #9 損切り-7〜8% (保有監視・¥10k tier 素地) / #10 turnaround 精緻化 / #11 連続ビート。Generator はこれらに手を広げない (scope creep = blast radius 増)。

### 期待される成果 (5 原則への貢献)
- **原則 4 (人力の代替・北極星)**: じっちゃま/オニールが毎日手作業でやる「pivot から何 % 離れているか目視 → 高値づかみ回避」「上昇引け週 vs 下落引け週の出来高を数えて機関の買いを判定」を BeatScanner が常時肩代わり。dogfood 主訴への直接回答 = **「投資家が毎日人力でやっている手間の代替」に Yes**。
- **原則 1 (2 秒理解)**: 案A 判断ビューで「まだ余地があるか / 高値づかみか」が pivot distance のゾーン色 1 つで 2 秒でわかる。
- **原則 5 (図解で認知コスト)**: pivot distance を「買い場圏 / 注意 / 過熱」の 3 ゾーンの位置として視覚化 (長文の数値説明より位置で直感把握)。

### 必読 memory anchor (Generator は SPEC 着手前に Read)
- [[project_screener_condition_expansion]] (gap 監査 SSOT・#1/#3/#8 の KB 出典と閾値・段階ロードマップ)
- [[reference_jijima_investment_criteria]] / [[reference_canslim_oneill_rules]] (投資条件 SSOT・閾値)
- [[feedback_section38_buy_signal_boundary]] (案A 判断ビューの §38 境界 + 状態コンパス pattern)
- [[feedback_revenue_basis_mismatch]] / [[feedback_foreign_currency_adr_guards]] (#1/#8 の sector / 外貨 ADR guard)
- [[feedback_supabase_grant_bug]] (新規 migration は service_role に明示 GRANT)
- [[feedback_oneill_screener_frontend_intersection]] (facet 交差は frontend で評価)
- [[feedback_facet_filter_count_integrity]] (facet chip count は filter predicate と同一集計に)
- [[feedback_edit_replace_all_drift]] (tuple arity 変更時の grep 先行・replace_all 禁止)
- [[feedback_judgmentdetail_dual_mount_paths]] / [[feedback_judgmentdetail_result_gate]] (案A を JudgmentDetail に置く時の二重 mount / result gate 罠)
- [[feedback_testid_all_render_paths]] (loading/error/empty/main 全 path に testid)
- [[feedback_pge_loop_pitfalls]] (sprint 累積なし / selector 幻覚 / ESM return / infinite anim)

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

**効く感情語彙 = 「洗練さ (sophistication)」と「興奮 (excitement)」。** 最高級ホテルの比喩で言えば、案A「上昇余地 vs 過熱」判断ビューは**ソムリエが差し出す『今このワインは飲み頃か、それともまだ早いか / もう過ぎたか』のひと言**にあたる。dogfood 主訴の「高値づかみか分からない」不安は、ロビーで価値判断の拠り所がなく落ち着かない状態。pivot distance のゾーンを 1 つの洗練された視覚指標で示すことで、「今この銘柄がどの段階にあるか」が**断定でなく状態として上品に伝わる** = 洗練さ。A/D 出来高で「機関が買い上がっている / 売り抜けている」の活きた力学が見えることで、静止画でない興奮 (動いている感) が生まれる。

`feedback_brand_aspiration.md` の 5 感情語彙 (修正禁止 anchor) を破壊しない。案A は §38 を守り「買い場」と断定しない**状態ラベル**で表現するため、洗練さ (断定の押し付けがない上品さ) と完全に整合する。本 SPEC は発光・elevation・色運用の anchor には一切触れない (§6)。ゾーン色は投資業界の色ルール (緑=上昇/赤=下落/amber=警告) に従い、buy zone の「過熱」は amber、「過熱」を緑にしない (緑=買い暗示 = §38 risk、[[feedback_section38_buy_signal_boundary]] の「価格セルは amber 固定」に倣う)。

---

## 3. Trust Cliff チェックリスト

投資判断 (じっちゃま/オニール条件) と直結するため最重要。以下 4 項目を Generator は全 sprint で死守:

1. **「買い場」断定の禁止 (§38、最重要)**: #3 の ≤+5% ゾーンを「**買い場**」「今が好機」「買い」と断定的・売買推奨で表記しない。事実状態ラベル「買い場圏 (pivot 近辺)」等に留め、ⓘ で「米国成長株投資の標準的手法では pivot から +5% 以内が好まれるとされる」と第三者手法の描写 + 出典 + 免責にする ([[feedback_section38_buy_signal_boundary]])。「過熱」は事実観測語なので可だが、緑色を当てない (amber)。
2. **A/D ラベルと中身の一致**: #8 を「機関の買い」と表記する場合、A/D 比は出来高の up/down day 集計であって 13F 機関保有データそのものではないことに注意。ラベルは「**出来高の質 (上昇引け優勢)**」等、中身に忠実にする。13F 由来の機関保有は既存 `inst_holders_qoq_pct` で別軸として副に併記し、両者を混同表記しない。
3. **facet count と銘柄リストの一致 ([[feedback_facet_filter_count_integrity]])**: #1/#3/#8 の各 facet chip count は、その facet を ON にしたときに実際に表示される銘柄数と **1 件のズレもなく一致** (count は itemPasses と同一 predicate で算出)。pivot 無し銘柄 (#3 null) / cf_data 欠落 (#1 null) / price-history 不足 (#8 null) は **AND 除外** (達成扱い禁止、honest count)。直前 SPEC の `OCF_MARGIN_FACET` の自己排除パターン (frontend `CustomScreenerPanel.jsx:377-384`) を踏襲。
4. **LP/料金訴求との整合**: 本 SPEC は screener_v2 (default OFF) 限定 scope のため LP 直接訴求とは独立。将来 default ON 昇格 (B6) 時に「無料で件数・種類が見える / 銘柄名のみ Premium blur」(ADR §0-7 tier 方針) を破らない設計とする。#1/#3/#8 の tier は §0 で確定する (テクニカル系 #3/#8 は cup/breakout と同じく Premium gate になる可能性、#1 はファンダ系で free の可能性)。

> **「登録不要」「3 銘柄/日まで無料」「価格表記」との矛盾**: N/A — 本 SPEC は screener facet / ticker 詳細ビューの data・算出ロジックのみで、登録要求モーダル・課金 gate・価格表記そのものには触れない (tier gate は既存 per-request mask に乗せるのみ、新設しない)。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか: no。**

「LLM 不要、静的 dictionary / Python 計算で完結」。本 SPEC の全構成要素は数値物理層 + 静的文言:
- #1 OCF>NetIncome = TTM 合計の Python 比較 (`>`) → bool。既存 TTM 計算ブロック (`main.py:21984-` の `cf_data[:4]` 合計) の隣で netIncome も合計するのみ。
- #3 buy zone = `(today - pivot) / pivot × 100` の Python 算術 (既存式 `main.py:13044`) → 静的閾値で 3 区分。
- #8 A/D = up/down day volume の Python 集計 → 比 (`>1`) で bool。
- 案A 判断ビューの narration/ゾーンラベル = **静的 dictionary** ([[feedback_section38_buy_signal_boundary]] の `stateCompassText.js` 同型)。LLM narration は一切生成しない。

**遵守事項 (CLAUDE.md「aggregator/ パッケージは数値物理層」)**:
- `backend/app/aggregator/*.py` への LLM SDK import 禁止 (pre-commit Check 3)。本 SPEC は `main.py` の canslim-scan / universe endpoint / pattern 系を触るが LLM SDK を import しない。
- `backend/app/visualizer/prompt.py` 不触 (pre-commit Check 1)。
- §38 (断定的将来予測) / §5 (最上級表現) 抵触語を一切使わない。「買い場 (断定)」「最良」「本命」「今が好機」「絶好」禁止。状態ラベルは「買い場圏 / 注意 / 過熱」「上昇引け優勢 / 下落引け優勢」等の**事実状態表現**に留める。
- **4 重防御は不適用 (LLM 不使用のため)**。代わりに静的 dictionary の文言を sanitize layer (blocklist) が通ることを確認 (ラベル文言が偶発的に禁止語を含まないことの念押し、blocklist.js 自体は触らない)。

---

## 5. スプリント分割 (5 sprint、各 sprint「動く 1 機能」・各完了時 commit 必須)

> **PGE 起動前 checklist (pge-loop-debugger 連携、全 sprint 共通)**:
> - 本 SPEC は backend (main.py) + frontend (screener + JudgmentDetail) を**複数 sprint で横断** → **各 sprint 完了時に必ず commit** (sprint 累積バグ防止、[[feedback_pge_loop_pitfalls]])。同一 file (main.py / CustomScreenerPanel.jsx) を複数 sprint で触るため sprint 間 commit は必須。
> - frontend で testid/selector を扱う sprint → **primary selector は `data-testid`**、loading/error/empty/main **全 render path に付与** ([[feedback_testid_all_render_paths]])。
> - snap-*.mjs を編集/新設する sprint → **ES module top-level return 禁止** + animation は **try/catch** + visual harness **4 条件遵守** (headless / 60s timeout / `.visual/` 出力 / HTTP server なし)。
> - 本 SPEC は **screener_v2 scope (default OFF)** に閉じる。共有部品 (`ScreenerPane`/`CustomScreenerPanel`) を触る場合は `screenerV2` prop のように scope 限定 (一般 user 即反映を避ける、handover v240 で確立した型)。
> - **大ファイル `backend/app/main.py` (~22k 行) は offset/limit or grep で部分 Read。全文 Read = abort** (CLAUDE.md tool-call 崩壊防止)。

> ⚠️ **依存関係**: Sprint 1 (backend 算出 + migration) → Sprint 2 (universe endpoint 付与) が backend 前提。Sprint 3 (facet) と Sprint 5 (判断ビュー) は Sprint 2 完了後なら独立に進められる。Sprint 4 (A/D は集計が重いため独立 sprint に分離) は Sprint 1 と同じ backend だが算出ロジックが別種のため分割。

---

### Sprint 1: #1 OCF>NetIncome bool + #3 pivot distance % の backend 算出 + DB 列追加

**目的**: canslim-scan の precompute に「営業CF>純利益 (bool)」と「pivot distance %」を追加し `screener_fundamentals` に永続化する。**追加 FMP fetch を最小化** (#1 は既存 `cf_data` 流用、#3 は pattern_signals の pivot を流用)。

**触るファイル**:
- `migrations/*.sql` (新規 migration 1 本): `screener_fundamentals` に列追加。候補 = `ocf_gt_netincome` (bool) + `pivot_distance_pct` (float、現値が pivot から何 % か。負=pivot 下、正=pivot 上)。**adding-only / `IF NOT EXISTS` / service_role に明示 GRANT** ([[feedback_supabase_grant_bug]])。既存 migration の編集禁止、新規追加のみ。
- `backend/app/main.py`:
  - `_compute_one` (`main.py:21583`): 既存 TTM 計算ブロック (`main.py:21984-` の `cf_data[:4]` 合計) の隣で **TTM netIncome を合計** → `ocf_gt_netincome = (ttm_ocf > ttm_netincome)`。⚠️ **Generator は cf_data の各 quarter dict に `netIncome` field が存在するか確認**してから配線 (FMP `/stable/cash-flow-statement` の field 実測。無ければ TTM revenue 用に既に fetch 済の income-statement の netIncome を流用 → どちらでも**追加 fetch ゼロ**)。
  - #3 pivot distance: pattern_signals の cup_handle 結果 (`cup["pivot"]["price"]`) と現値から `(today - pivot) / pivot × 100` を算出 (既存式 `main.py:13044`)。pivot 無し (cup 未形成) は None。⚠️ **Generator は「pivot_distance を screener_fundamentals に新列で持つ / universe endpoint で cup payload から都度算出する」のどちらが整合的か確認** (cup は pattern_signals 側で日次更新、screener_fundamentals は別 scan。鮮度の二重管理を避ける設計を選ぶ)。
  - `_compute_one` の **return tuple arity 変更**: success return (`main.py:21898` 付近) / unpack / **error early-return の None path** も含め**全て arity を揃える**。grep 先行 → 個別 Edit (replace_all 禁止) → ローカルで `_compute_one(AAPL)` 直接実行し tuple 長 assert → commit ([[feedback_edit_replace_all_drift]])。
  - `_upsert_screener_fundamental` (`main.py:21306`): 引数追加 + `optional_cols` (`main.py:21421`) に新列追加 (migration 未適用時 graceful fallback)。

**sector guard (必須論点)**: #1 OCF>NetIncome は銀行/保険/与信で会計構造が異なる ([[feedback_revenue_basis_mismatch]])。**既存 `_roe_sector_guard` (`main.py:5139`) で除外される sector は #1 も null 化を検討** (営業CFマージンと同 guard 流用、null_reasons に記録)。外貨 ADR ([[feedback_foreign_currency_adr_guards]]) も同様。#3 pivot distance は通貨非依存 (同一銘柄内の比率) のため guard 不要だが、Generator が確認。

**呼ぶ既存 skill**: `screener` (canslim-scan precompute の作法・None-preserve trap)、`fmp-api-retry` (cf_data の netIncome 確認・追加 fetch しないことの確認)、`hallucination-guard` (aggregator 隣接の main.py 改変で LLM SDK 非混入を機械確認)。

**完了判定基準**:
- migration 適用後、canslim-scan 1 回走行で `screener_fundamentals.ocf_gt_netincome` / `pivot_distance_pct` が複数銘柄で non-null (本番 curl 確認)。
- AAPL/MSFT/NVDA で `ocf_gt_netincome=true` が妥当 (健全大型は OCF>純利益が通常)。
- 銀行 (JPM/BAC) で #1 sector guard が効いている (null)。
- None-preserve: cf_data 空 / pivot 無し銘柄で例外を吐かず None 保存。
- tuple arity 不一致なし (`_compute_one(AAPL)` 直接実行で長さ assert)。
- commit (例 `feat(screener): #1 OCF>純利益 bool + #3 pivot distance % の nightly batch 算出 + DB列追加`)。

---

### Sprint 2: universe endpoint への #1/#3 フィールド付与

**目的**: `GET /api/scanner/universe` の各 item に `ocf_gt_netincome` / `pivot_distance_pct` を含め、frontend が読めるようにする。

**触るファイル**:
- `backend/app/main.py`: universe item 組立 (`main.py:19985-19999` 付近、既存 `ocf_margin_pct` / `cup_state` 付与の隣) に #1/#3 フィールドを追加。既存と同経路で `screener_fundamentals` から SELECT (Sprint 1 で screener_fundamentals に持たせた場合) or cup payload から算出 (Sprint 1 の設計判断に従う)。
- per-facet freshness (`freshness` object) に #1/#3 のキーを追加 (#1 = nightly scan 鮮度、#3 = pattern_signals 鮮度。鮮度元が違う場合は別キーで開示)。headline `as_of` = max (既存 §0-6 方針、lagging に引きずられない)。
- **tier 扱いの確定**: #1 (ファンダ系) は `ocf_margin_pct` と同列で free の可能性。#3 (テクニカル系・pivot) は cup/breakout と同じ Premium gate の可能性。**Generator は ADR §0-7 tier 方針と既存 `locked_facets` ロジックに従い tier を確定** (一貫性破壊 = Trust Cliff)。

**呼ぶ既存 skill**: `screener` (universe endpoint schema)、`hallucination-guard` (数値物理層・LLM 非混入の念押し)。

**完了判定基準**:
- 本番 curl (`GET /api/scanner/universe?universe_size=3000`、authed) で item に `ocf_gt_netincome` / `pivot_distance_pct` が出る (handover の auth-helper 手順)。
- coverage (non-null 率) を実測し記録。pivot は cup 形成銘柄のみ → 低 coverage が想定 (null 多数は honest)。
- 既存 free/Premium tier gating と整合 (#1=free? / #3=Premium? を locked_facets で正しく扱う)。
- commit (例 `feat(screener): universe endpoint に #1 OCF>純利益 + #3 pivot distance 付与`)。

---

### Sprint 3: #1/#3 facet を screener の additive faceting に追加

**目的**: CustomScreenerPanel に #1 (OCF>純利益) と #3 (買い場圏: pivot+5% 以内) の facet を追加 (screener_v2 scope 限定)。

**触るファイル** (screener_v2 scope に限定):
- `frontend/src/components/CustomScreenerPanel.jsx`: 既存 `OCF_MARGIN_FACET` (`L82`) と同型の独立 binary facet を 2 つ追加。
  - **#1 facet**: `ocf_gt_netincome === true` の binary。null は AND 除外。tier は Sprint 2 確定値に従う。ラベル「営業CF>純利益」(主) + tooltip「営業キャッシュフローが純利益を上回る (KB:利益の質。満たさない銘柄は投資不適格とされる)」。
  - **#3 facet**: `pivot_distance_pct <= 5` の binary (買い場圏)。null (pivot 無し) は AND 除外。**閾値 = +5% (KB:178/1206)、実装都合で変えない**。ラベル「買い場圏 (高値から近い)」(主・断定回避) + tooltip「直近の節目 (pivot) から +5% 以内。米国成長株手法では +5〜10% 超は遅いとされる」。⚠️「買い場」単独 (断定) 禁止、「買い場圏」(状態) は可。
  - chip count は `itemPasses` と同一 predicate で算出 (自己排除パターン `L377-384` 踏襲、[[feedback_facet_filter_count_integrity]])。
  - testid を loading/empty/0件 disabled/locked 鍵 の 4 state 全 path に付与。
- **A/D (#8) facet は Sprint 4 で追加** (本 sprint は #1/#3 のみ)。

**呼ぶ既存 skill**: `screener` (facet engine の作法)、`designing-workspace-ui` (chip primitive `Chip.jsx` / facet 余白・weight)、`design-system-check` (token 遵守・raw hex 禁止)、`funnel-cro` (tier gate 整合・無料件数 Trust Cliff)。

**完了判定基準**:
- #1/#3 facet を ON にすると件数が減り、chip count = 実表示件数 (ズレ 0)。
- #3 ラベルに「買い場 (断定)」「最良」「本命」等の §38/§5 禁止語が一切ない (中身に忠実・状態表現)。
- bundle grep で禁止語が screener facet 領域に出ない。
- 共有部品変更が screener_v2 scope に閉じている (一般 user 即反映なし)。
- commit (例 `feat(screener): #1 OCF>純利益 + #3 買い場圏 facet を additive faceting に追加`)。

---

### Sprint 4: #8 A/D 出来高の質の backend 算出 + universe + facet

**目的**: price-history から「上昇引け日 volume 合計 ÷ 下落引け日 volume 合計」(A/D 比) を算出し、永続化 → universe → facet まで一気通貫 (この 1 条件で backend+frontend を完結させる縦割り sprint)。

**触るファイル**:
- `backend/app/main.py`:
  - A/D 比算出: price-history の closes/volumes (cup_handle 検出で既に取得済の系列、`main.py:13282-` 周辺) を流用し、各日について「前日比 up なら up_volume に加算 / down なら down_volume に加算」→ `ad_volume_ratio = up_volume / down_volume`。**集計期間は §0-confirm で確定** (オニール = 50日 or 13週 A/D。Generator は KB:214/190 と backend の取得済系列長を確認して 1 つに決め、user gate で承認)。
  - `_compute_one` の TTM ブロック付近 or cup_handle ブロックで算出 → screener_fundamentals に `ad_volume_ratio` 列追加 (Sprint 1 と同型の tuple arity 手順 + migration)。⚠️ **price-history の追加 fetch が必要か確認** (cup 検出が既に closes/volumes を取得済なら流用 = 追加 fetch ゼロ。Generator が実態確認)。
  - sector guard: A/D は出来高比のため通貨/sector 非依存 (比率)。guard 不要だが流動性極小銘柄 (volume ほぼ 0) の artifact を null 化する sanity check を検討 ([[feedback_revenue_basis_mismatch]] の clamp と同思想)。
  - universe item に `ad_volume_ratio` 付与 (Sprint 2 と同経路) + freshness キー追加。
- `frontend/src/components/CustomScreenerPanel.jsx`: #8 facet 追加 (`ad_volume_ratio > 1` = 買い優勢の binary)。ラベル「出来高の質 (上昇引け優勢)」(主・#8 Trust Cliff §3-2 で「機関の買い」単独表記は避ける) + tooltip「上昇引け日の出来高合計 ÷ 下落引け日の出来高合計 > 1。米国成長株手法で機関の継続買いの目安とされる」。null は AND 除外、chip count 整合。

**呼ぶ既存 skill**: `screener` (precompute + facet)、`fmp-api-retry` (price-history 取得の安全性・追加 fetch 確認)、`stock-chart` (price-history 系列の扱い・closes/volumes の整合)、`designing-workspace-ui` (facet UI)、`funnel-cro` (tier gate)。

**完了判定基準**:
- migration 適用後 canslim-scan 1 回走行で `ad_volume_ratio` が複数銘柄で non-null。
- AAPL/NVDA 等で妥当な範囲 (極端な artifact なし)。
- #8 facet ON で chip count = 実表示件数 (ズレ 0)、null は除外。
- ラベルが中身に忠実 (「出来高の質」、13F 機関保有と混同しない §3-2)。
- 追加 fetch ゼロを確認 (cup 系列流用) or 必要なら理由を記録。
- commit (例 `feat(screener): #8 A/D 出来高の質を算出 + universe + facet (買い優勢 >1)`)。

---

### Sprint 5: 案A「上昇余地 vs 過熱」判断ビュー (ticker 詳細の状態コンパス)

**目的**: ticker 詳細 (JudgmentDetail 系 / idle hero) に、pivot distance を主軸 (買い場圏 / 注意 / 過熱の 3 ゾーン) + 機関の買い (#8 A/D + 既存 `inst_holders_qoq_pct`) を副軸にした、「まだ余地があるか / 高値づかみか」が 2 秒でわかる**状態コンパス**を追加。§38 厳守。

**触るファイル**:
- `frontend/src/features/judgment/` 系 (JudgmentDetail に置く場合) or `frontend/src/features/workspace/ScreenerIdleHero.jsx` (idle hero に置く場合)。**Generator は配置先を user gate で確認** (案A の原文は「ticker 詳細 (Pane3 JudgmentDetail / idle hero)」と両方挙げている → 主訴の「銘柄を見たとき判断したい」に最も効く面を 1 つ選ぶ)。
  - ⚠️ JudgmentDetail に置く場合: **二重 mount パス** (`!isV5` と v5 で別 mount、[[feedback_judgmentdetail_dual_mount_paths]]) と **result gate 罠** (新規 section gate は `result` でなく `detail.error` で、[[feedback_judgmentdetail_result_gate]]) に注意。
- 静的文言 dictionary 新規ファイル (例 `frontend/src/features/judgment/constants/buyHeadroomText.js`、`stateCompassText.js` 同型)。§38-safe 静的・@no-llm・手動維持。
- 状態コンパス component: pivot distance のゾーン位置 (買い場圏 ≤+5% / 注意 +5〜10% / 過熱 >+10%) を視覚化 (位置インジケータ or 3 段ゲージ)。色は **過熱=amber 固定** (緑=買い暗示 §38 risk 回避、[[feedback_section38_buy_signal_boundary]])、買い場圏は neutral/cyan ブランド色 (上昇=緑を使わない)。副軸に A/D (上昇引け優勢/劣勢) + inst_qoq (機関社数 QoQ) を小さく併記。各セルに ⓘ → 静的モーダルで KB 手法の描写 + 出典 + 免責。

**§38 設計規律 (最重要、[[feedback_section38_buy_signal_boundary]] 準拠)**:
- ✅ 主語=現在の確定値 (pivot からの距離 % / A/D 比) + 述語=観測 (「+3% の位置です」「上昇引け優勢です」)。
- ✗ 断定的将来予測・売買指示 (「買い」「上がる」「今が好機」「絶好の買い場」) 禁止。
- 「上昇余地 / 過熱」は**事実状態ラベル**として使う (「まだ pivot 近辺の位置」「pivot から大きく上方=過熱圏」)。「上昇余地がある=買い」と読ませる断定にしない。
- 第三者手法 (じっちゃま/オニール) は「米国成長株投資の標準的な手法では〜とされる」と描写 + 出典 + 免責。**個人名 (じっちゃま/広瀬隆雄氏) は UI 禁止**。
- 免責は強調表示に近接 (モーダルだけでなく近接 1 行併設)。

**呼ぶ既存 skill**: `pge-loop-debugger` (selector 幻覚 / ESM return / 二重 mount 防止)、`designing-workspace-ui` (状態コンパスの視覚 hierarchy)、`funnel-cro` (文言 Trust Cliff・§38 境界)、`vision-eval` (任意、判断ビューの見栄え採点)、`hallucination-guard` (静的 dict が blocklist を通ること念押し)。

**完了判定基準**:
- ticker 詳細で pivot distance のゾーン (買い場圏/注意/過熱) が 2 秒で判別できる。
- §38 禁止語ゼロ (「買い」「上がる」「今が好機」「絶好」「最良」)。bundle grep で確認。
- 過熱ゾーンが緑でない (amber)、買い場圏が緑でない (neutral/cyan)。
- 副軸 (A/D + inst_qoq) が pivot 主軸と混同されず併記。
- 各セルに ⓘ + 免責近接。
- pivot 無し銘柄でビューが壊れない (「節目 (pivot) 未形成のため判定なし」等の honest 表示、全 render path に testid)。
- commit (例 `feat(judgment): 上昇余地 vs 過熱 判断ビュー (状態コンパス) を ticker 詳細に追加`)。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

**本 SPEC 固有の禁止 (最重要)**:
- ❌ #3 の ≤+5% ゾーンを「**買い場**」「今が好機」「買い」と**断定・売買推奨**で表記 (§38、状態ラベル「買い場圏」のみ可)。
- ❌ #8 A/D を 13F「機関保有」データそのものと混同表記 (A/D = 出来高 up/down 集計、機関保有は `inst_holders_qoq_pct` の別軸)。
- ❌ 投資条件 (閾値: OCF>NetIncome 必須 / buy zone +5% / A/D >1) を実装都合で勝手に変更 (KB が正・変更は user 承認必須)。閾値変更が要るなら user gate を立てる。
- ❌ 「過熱」ゾーン / 「買い場圏」ゾーンに **緑色** (緑=買い暗示 §38 risk、過熱=amber / 買い場圏=neutral or cyan)。
- ❌ `fetchScannerUniverse` を object 引数で呼ぶ (positional `(universeSize)` 厳守、422 回避、handover v240)。
- ❌ `ScreenerPane` / `CustomScreenerPanel` の共有部品変更を screener_v2 scope の外に漏らす (`screenerV2` prop で限定、legacy 漏れ=Trust Cliff)。
- ❌ Phase 2-3 条件 (#2/#4/#5/#6/#7/#9/#10/#11) に手を広げる (scope creep)。

**CLAUDE.md / pre-commit 由来の禁止 (該当しない sprint でも触らない)**:
- ❌ `backend/app/visualizer/prompt.py` (Hallucination Guard pre-commit Check 1) — 本 SPEC 全 sprint で触らない。
- ❌ `backend/app/aggregator/*.py` への LLM SDK import (pre-commit Check 3) — 本 SPEC は数値物理層、全 sprint で触らない。
- ❌ `backend/app/visualizer/prompt_negatives.py` (法務 anchor) — 全 sprint で触らない。
- ❌ `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` (typo 修正のみ可) — 全 sprint で触らない (静的 dict 文言が blocklist を通ることの確認はするが、blocklist 自体は編集しない)。
- ❌ `.claude/launch.json` (人間用) — 触らない。
- ❌ `migrations/*.sql` の**既存ファイル** — Sprint 1/4 は**新規 migration 追加のみ** (既存編集禁止)。
- ❌ `handover_*.md` (read-only reference) — 触らない。
- ❌ `railway.toml` cron 定義 — 触らない (canslim-scan の既存スケジュールに乗る、新規 cron 不要)。
- ❌ `frontend/src/App.jsx` の sticky 検索 div (8 回試行錯誤の安定領域) — 触らない。
- ❌ `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク) + `tier-m-glow` base — 全 sprint で触らない (状態コンパスは既存 token / Chip primitive で組む)。

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」3 軸を本 SPEC に適用:

> **6 体合議起動** (3 軸のうち 2+ active なら 6 体推奨):
> 1. **LLM 出力品質** (景表法/金商法/hallucination risk)
> 2. **Trust Cliff** (LP 訴求 vs 実装の整合)
> 3. **新 backend endpoint + RLS / 認証境界 + cache 設計**

**3 軸の適用**:
- 軸 1 (LLM 出力品質): **active** — 本 SPEC は LLM 不使用だが、案A 判断ビューと #3 buy zone の**§38 (断定的判断の提供) 境界**が核心 risk。「買い場」断定 / 売買推奨 / 緑=買い暗示は景表法 §5 / 金商法 §38 抵触。状態ラベルの事実表現遵守が brand 信頼に直結。
- 軸 2 (Trust Cliff): **active** — #3「買い場圏」ラベルと中身の一致、#8「A/D ⇄ 機関保有」の混同回避、facet count 整合、dogfood 主訴 (高値づかみ判断) への正確な回答が投資判断の信頼に直結。
- 軸 3 (backend + cache): **active** — 新規 migration (DB schema 変更 ×2 sprint) + canslim-scan precompute 拡張 + universe endpoint への新 field 付与 (#1/#3/#8) + per-facet freshness = 本番運用済 endpoint への blast radius あり。

**判定: 6 体合議推奨 (3 軸すべて active)。** 投資条件 (KB) + Trust Cliff/§38 + backend data 拡張が同時に絡む重要設計判断。dogfood 主訴への直接回答という user 価値の高さと、§38 境界の法務 risk の両面から、専門家合議で gate 1 前に妥当性検証する。

> **mixed model 構成** (CLAUDE.md コスト効率): 金融 §38 verdict + Trust Cliff/法務 reviewer の 2-3 体を Opus、残り (ui-designer / frontend-architect / qa-dogfooder) を Sonnet で並列起動。
> **起動順序 (呼び出し元への指示)**: 本 SPEC は gate 1 (採用/修正/中止) を **user に問うところまでで停止**。**Generator は自動起動しない**。gate 1 承認後、呼び出し元が **6 体合議 → PGE ループ**を編成する (handover/指示の運用に従う)。

---

## 8. 想定リスク + roll-back plan

### 失敗時に壊れるもの
- **Sprint 1 / 4 (migration + precompute)**: 列追加自体は adding-only で既存に無害。precompute の **tuple arity 変更**を片方取り残すと ([[feedback_edit_replace_all_drift]]) canslim-scan が落ち、**screener_fundamentals 全体の nightly 更新が止まる** (RS/EPS/ROE/営業CFマージン 含む)。最大 blast radius。→ Sprint 1/4 で `_compute_one(AAPL)` 直接実行の tuple 長 assert を完了判定に必須化。
- **Sprint 2 (universe endpoint)**: 本番運用済 endpoint に新 field 付与。SELECT 失敗で universe が 500 → 一般 user の screener が壊れる可能性。→ optional 列の graceful fallback (`.get()` + null) で防御。
- **Sprint 3 / 5 (frontend)**: screener_v2 scope (default OFF) のため一般 user 影響なし。共有部品 (`CustomScreenerPanel`) を scope 外に漏らすと一般 user 即反映 = Trust Cliff。Sprint 5 を JudgmentDetail に置く場合は二重 mount で **片方 mount し忘れ** ([[feedback_judgmentdetail_dual_mount_paths]]) の漏れに注意。
- **§38 risk (全 frontend sprint)**: ラベル/文言の禁止語混入 (「買い場」断定 / 緑=買い暗示) は法務 risk。→ bundle grep で禁止語ゼロを各 sprint 完了判定に必須化 + multi-review 金融 §38 verdict。

### roll-back 手順
- **frontend (Sprint 3/5)**: `git revert <commit>` → `git push origin main` (Railway auto-deploy ~60s)。screener_v2 default OFF のため revert 前でも一般 user 無影響。緊急時は feature flag (`screener_v2`) OFF 確認のみで回避可。
- **backend universe endpoint (Sprint 2)**: `git revert <commit>` → push。新 field 付与の SELECT を外せば既存 schema に戻る。
- **backend precompute (Sprint 1/4)**: `git revert <commit>` → push で計算ロジックを戻す。**migration (DB 列) は revert 不要** (adding-only `IF NOT EXISTS` + optional_cols fallback で旧コードも graceful)。canslim-scan が落ちて nightly が止まった場合は revert 後に手動 1 回 scan を再実行して freshness 復旧 ([[feedback_scheduled_task_next_day_verify]] で翌日 freshness も確認)。
- **検証規律**: 各 sprint 完了後、本番 curl (universe endpoint) + bundle hash 変更で反映確認。canslim-scan は nightly のため backend sprint は手動 1 回 scan で即検証。

### 実装後 memory 更新タスク
- [[project_screener_condition_expansion]]: #1/#3/#8 を「❌/△ → 実装済 (Phase 1)」に更新、段階ロードマップの Phase 1 を「着地」へ。案A 判断ビューも実装済に。
- [[reference_jijima_investment_criteria]] / [[reference_canslim_oneill_rules]]: #1 OCF>純利益 / #3 buy zone / #8 A/D の BeatScanner 対応を「実装済」に更新。
- 新 memory anchor 候補: 案A 状態コンパスの §38 設計 (buy zone ゾーン色 + ラベル境界) を [[feedback_section38_buy_signal_boundary]] に追記 (pivot distance ゾーンの amber/neutral 色規律)。

---

## 付録: sprint ↔ 既存 skill マトリクス (Generator 起動時の指名)

| sprint | 主 skill | 補助 skill |
|---|---|---|
| 1 (#1 OCF>純利益 + #3 pivot dist precompute + migration) | `screener` | `fmp-api-retry` / `hallucination-guard` |
| 2 (universe endpoint #1/#3 付与) | `screener` | `hallucination-guard` (数値物理層確認) |
| 3 (#1/#3 facet) | `screener` / `designing-workspace-ui` | `design-system-check` / `funnel-cro` |
| 4 (#8 A/D 縦割り: precompute + universe + facet) | `screener` | `fmp-api-retry` / `stock-chart` / `designing-workspace-ui` / `funnel-cro` |
| 5 (案A 判断ビュー 状態コンパス) | `pge-loop-debugger` / `designing-workspace-ui` | `funnel-cro` / `vision-eval` / `hallucination-guard` |
| SPEC 完成後 (gate 1 前) | `multi-review` (6 体合議) | — |

---

## 付録 B: Generator が着手前に確定すべき論点 (planner が backend 実態を確認した上で残した設計判断)

planner は backend を grep で確認し、以下を Generator/user gate で確定すべき論点として明示する (planner は実装詳細に踏み込まない):

1. **#1 netIncome の取得元 (TTM)**: FMP `/stable/cash-flow-statement` の各 quarter dict に `netIncome` field が存在するか実測 → 有れば cf_data から TTM 合計、無ければ TTM revenue 用に既に fetch 済の income-statement の netIncome を流用。**どちらでも追加 fetch ゼロ**であることを確認。
2. **#3 pivot distance の保持場所**: `screener_fundamentals` に新列で持つ vs universe endpoint で cup payload (`cup["pivot"]["price"]`) から都度算出。pattern_signals (cup) と screener_fundamentals は別 scan で鮮度元が違うため、**鮮度の二重管理を避ける設計**を選ぶ (universe で cup payload から算出する方が鮮度整合の可能性大、Generator が確認)。
3. **#8 A/D 集計期間**: オニール手法は 50日 A/D or 13週 A/D。KB:214/190 と backend が cup 検出で取得済の closes/volumes 系列長を確認し 1 つに確定 → **user gate で承認** (閾値・期間は KB が正、実装都合で決めない)。
4. **#8 price-history の追加 fetch 要否**: cup_handle 検出が既に closes/volumes を取得済なら流用 = 追加 fetch ゼロ。実態確認 (流用できない経路なら理由を記録)。
5. **tier 確定 (#1/#3/#8)**: #1 (ファンダ系) は free か / #3・#8 (テクニカル系) は cup/breakout と同じ Premium gate か。ADR §0-7 tier 方針 + 既存 `locked_facets` ロジックに従い確定 (一貫性破壊 = Trust Cliff)。
6. **案A 配置先**: JudgmentDetail (銘柄詳細を見たとき) vs idle hero (今日の筆頭)。dogfood 主訴「銘柄を見て判断したい」に最も効く 1 面を user gate で確定。
