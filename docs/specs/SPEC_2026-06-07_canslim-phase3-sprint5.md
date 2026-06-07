# SPEC 2026-06-07: CAN-SLIM Phase 3 Sprint 5 — frontend A/N/S 表示 + null_reason 理由併記 + N=Pro ロック

> **Planner 起票** (PGE 3 体ループ仕様設計層) / **対象 Phase**: CAN-SLIM Phase 3 Sprint 5
> **親 SPEC**: `SPEC_2026-06-07_canslim-phase3-sprint4.md` (S4 専用) / `SPEC_2026-06-07_canslim-phase3-conditions.md` (Phase3 全体)
> **memory SSOT**: `project_canslim_screener_expansion.md` (S4b 着地まで記録済)
> **直前 handover**: `handover_2026-06-07_v180.md` (S4b read endpoint 公開 + S5 DEFER-SPEC 申し送り)

---

## 1. Context

### user prompt 原文
> CAN-SLIM Phase 3 Sprint 5 (frontend A/N/S 表示 + null_reason 理由併記 + N=Pro ロック) の詳細 SPEC.md を起票。

### なぜ今やるか (根拠)
- **handover v180 §🔴 で S5 が DEFER-SPEC として明示申し送り**: read endpoint `/api/scanner/canslim` は S4b (main `ab001b0`) で本番公開済。A/N/S 全条件 (eps_cagr_3y / roe / near_high_pct_scaled / buyback_yield_pct / volume_surge_pct) を `count="exact"` で正確集計し、`as_of` / `total_count` / `failed_count` / `excluded_count` / `uncomputable_count` / `unavailable_count` / `items` を返す**素地が完成済**。残るのは frontend 表示と Trust Cliff 判断のみ。
- **v180 が S5 を autopilot で ship しなかった真因 = ①バッジ layout の design 判断 ②null_reason 色 taxonomy の新 design token 確定が必要 ③N ロック面の Trust Cliff/pricing 判断** の 3 点。**このうち②は user が本 SPEC で「neutral gray 統一・新 token 不要」と確定済**のため、v180 が「触ると危険 (新 design token)」とした懸念は解消。残る gate1 判断は **null_reason の backend 保存方式のみ** (§補足-C 参照)。
- read endpoint は uncomputable/unavailable の **2 値だけ**しか区別しない。user 確定の (c) 理由併記 (「自己資本マイナス」「業種特性」「データ取得中」「赤字決算を含む」「上場3年未満」「黒字転換」「前年同期データなし」) を出すには **per-原因の null_reason を backend が返す小改修 (S5a)** が前提。

### 期待される成果 (5 原則のどれに貢献するか)
- **原則 4「1 クリックを減らせ — 人力の代替」**: 投資家が毎日手で照合する C/A/N/S 5 条件のスクリーニングを 1 画面で代替。A/N/S 表示で「人力代替」の完成度が C 単独から 5 条件へ前進。
- **原則 1「読み手に負担をかけない (2 秒理解)」**: 結果行内バッジ列 (各柱 max4) で「この銘柄はどの柱を満たすか」を 2 秒把握。null 銘柄も「なぜ出ないか」を理由ラベルで即理解 → 「壊れている?」の不安 (Trust Cliff) を払拭。
- **原則 5「図解で認知コストを下げろ」**: 長文説明でなくバッジ + 短い理由ラベルで状態を視覚化。

### S5a で injection 必読 (Generator/main に渡す)
- `feedback_testid_all_render_paths.md` — 全 render path (loading/errored/empty/main) に data-testid 付与。
- `feedback_facet_filter_count_integrity.md` — null_reason 内訳 count は filter predicate と同一集計 (ズレ = Trust Cliff)。
- `feedback_pge_loop_pitfalls.md` — 同一 file 複数 sprint / selector 幻覚 / ESM return / infinite animation の 4 落とし穴。
- `feedback_supabase_grant_bug.md` — 新規 migration 時の明示 GRANT (②JSONB 採用時)。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

5 感情語彙のうち主に **「洗練さ (sophistication)」** と **「楽しい (joy)」** に効く。

最高級ホテルのロビーの比喩で言えば、現状の screener は「C 条件のドアだけ開いていて、A/N/S の部屋は壁で塞がれている」状態。S5 で A/N/S のバッジ列を結果行内に並べることは「各部屋の扉に上品な真鍮プレート (満たした柱) を添える」行為。さらに null 銘柄に対し「自己資本マイナスのため算出対象外」「業種特性のため対象外」と **neutral gray の落ち着いた理由ラベル**を添えることは、「空室の扉に乱暴な赤いバツ印を貼る」のではなく「上品な “準備中” の札を掛ける」ホスピタリティ — これが洗練さ。amber (警告色) を null に使わないという user 確定判断は、まさにこの「乱暴なバツ印を貼らない」品格に直結する。`feedback_brand_aspiration.md` の修正禁止 anchor を破壊しない (新 token・新色を一切増やさず、既存 `[Unknown]=--text-muted + ? glyph` の idiom を流用)。

N ロック面 (ProTeaser) は **「興奮 (excitement)」** に効く: 「無料の 3 条件はそのまま、これに 1 つ掛け合わせると景色が変わる」という上品なアップセルで「もっと見たい」を喚起する。塗り潰し blur (PremiumLock) でなく非 blur ProTeaser を使うのは、「無料と言ったのに塗り潰された」という Trust Cliff の不快感を避け、世界観の品格を守るため。

---

## 3. Trust Cliff チェックリスト (funnel-cro 7 項目を S5c で必須適用)

| # | LP 訴求文言との整合確認 | 判定 |
|---|---|---|
| 1 | **「5 条件無料」訴求 vs near_high=Pro ロック** | ✅ 整合。near_high (52週高値接近度) は LP の無料 5 条件に**含まれない**追加絞り込み軸 (CRO 確認済、user 前提に明記)。無料 5 条件 = C(eps_yoy) / A(eps_cagr+roe) / S(buyback+volume) は無料のまま。ProTeaser 説明 1 文目で「EPS成長・自社株買い・出来高の条件は無料のまま。」と太字先出しで明言し誤読を防ぐ。 |
| 2 | **「登録不要 / 3 銘柄/日まで無料」** | ✅ 整合。S5 は screener の表示拡張のみ。demo rate limit (IP ベース 3 req/IP/day) も既存スクリーナーの gate 方針 (gate なし) も変更しない。 |
| 3 | **価格表記「¥980/月」(Pro tier)** | ✅ 整合。near_high は既存 Pro tier に統一 (別格 Premium にしない = user 確定)。ProTeaser 主 CTA「Pro で解放する → ¥980/月」は既存 pricing と一致。`project_tier_pro_premium_restructure.md` の tier 設計と矛盾しないこと (Generator/main が確認)。 |
| 4 | **副リンク = 横の出口の存在** | ✅ 整合。「無料の3条件で今すぐ絞り込む」で near_high を外して即再スキャンする出口を必ず提供 (行き止まりにしない = Trust Cliff 回避)。 |
| 5 | **null_reason ラベルが「壊れている」と読まれないか** | ✅ neutral gray + 具体ラベルで「対象外/データ取得中」を明示。amber 不使用で「問題あり」誤読を回避。 |

> S5c 着地前に `funnel-cro` skill の **Trust Cliff 防止 checklist 7 項目を必ず全通過**させること (CLAUDE.md skill routing: LP 訴求文言 / Pro tier 課金 UI 編集時は funnel-cro 必須)。上記 5 項目に加え funnel-cro 固有の残り 2 項目 (CTA 経路の demo モード対応 / 「登録不要」モーダル非出現) も確認。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか: no**

- **理由**: null_reason は **静的ラベル dictionary** (原因コード → 日本語ラベルの固定 mapping)。narration 生成なし。read endpoint は S4b で「response に narration フィールドなし (Python 計算 + ticker list のみ)」を確立済 (hallucination-guard Sprint 3 確認済)。S5a の null_reason も同様に **Python 計算 + 固定 dict 引き当て**で完結。
- **静的 dictionary + sanitize layer のみ** で narration を出す (CLAUDE.md「新規 LLM endpoint は静的 dictionary で narration」パターン、Phase 5.5 `STATE_LABEL_JP` と同型)。
- **§38 (断定的将来予測) ガード**: ラベルはすべて**過去事実 / 現在状態の記述**に限定 (「赤字決算を含むため対象外」「上場3年未満」等)。将来予測語 (「上がる」「期待できる」) を含めない。「黒字転換のため前年比なし」は事実記述であり予測でない。
- **§5 (最上級表現) ガード**: ラベルに「最高」「No.1」等の最上級を含めない。
- **aggregator/ パッケージへの LLM SDK import 禁止** (pre-commit Check 3) は S5a で**該当しない** (null_reason は main.py の screener helper 内、aggregator/ を触らない)。

**確定 null_reason ラベル dict (UI 表示文字列、固有名詞・じっちゃま禁止)**:

| 柱 | 原因 | ラベル (UI 表示) |
|---|---|---|
| A (roe) | 自己資本マイナス (`_roe_equity_guard` で負 equity) | 自己資本マイナスのため算出対象外 |
| A (roe) | 業種特性 (`_roe_sector_guard`: 銀行/REIT/保険/証券/公益/与信) | 業種特性のため対象外 |
| A (roe) | key-metrics 欠損 (fetch 失敗 / returnOnEquityTTM None) | データ取得中 |
| A (eps_cagr) | 赤字決算を含む (`_calc_eps_cagr_3y`: base<=0 / ratio<=0) | 赤字決算を含むため対象外 |
| A (eps_cagr) | 上場3年未満 (annual records < 4 件) | 上場3年未満 |
| C (eps_yoy) | 黒字転換 (`turnaround=true`) | 黒字転換のため前年比なし |
| C (eps_yoy) | IPO1年未満 (前年同期データなし) | 前年同期データなし |
| N (near_high) / S (buyback/volume) | ソース欠損 | データ取得中 |

---

## 5. スプリント分割 (3 sprint、上限 6 以内)

> **PGE-loop-debugger 起動前 checklist (本 §5 に inject、4 落とし穴回避)**
> - **同一 file 複数 sprint**: `backend/app/main.py` は S5a (null_reason populate + read 集計) で触り、`frontend/src/components/CustomScreenerPanel.jsx` 等は S5b/S5c で繰り返し触る。→ **各 sprint 着地で必ず commit してから次 sprint に進む** (worktree 非累積の罠回避、`feedback_pge_loop_pitfalls.md`)。
> - **selector/className**: S5b/S5c は frontend UI を足す。→ **primary selector は data-testid**、**全 render path (loading / errored / empty / main) に testid 付与必須** (`feedback_testid_all_render_paths.md`)。className ベース selector の幻覚を避ける。
> - **snap-*.mjs**: 視覚検証する場合は **ES module top-level return 禁止** + `getAnimations().finish()` を try/catch で囲む (infinite animation で hang しない、visual harness exception 4 条件遵守)。
> - **migration**: §補足-C で ②JSONB / ①カラム群を採用する場合 migration が必要 → **Generator は autonomy hook で migration を BLOCK** するため、**main session が migration 作成 + Supabase MCP / SQL Editor で適用 (human-in-the-loop)**。Generator に migration を書かせない。

### Sprint 5a — backend: null_reason per-cause + read endpoint の内訳 count

- **目的**: populate (canslim-scan) が各 null の原因を保存し、read endpoint `/api/scanner/canslim` が per-condition の null_reason 内訳 count を返す。これで frontend が (c) 理由ラベルを引ける。
- **触るファイル**: `backend/app/main.py` (populate scan ループ 19180-19264 の各 null 分岐 + `_upsert_screener_fundamental` 18864 + read helper `_fetch_screener_fundamentals_by_condition` 16991 + endpoint `scanner_canslim` 17082)。§補足-C の保存方式が ②JSONB / ①カラム群なら `docs/migrations/2026-06-07_screener_fundamentals_null_reason.sql` を**新規追加** (main が SQL Editor 適用)。
- **呼ぶ既存 skill**: `hallucination-guard` (LLM 不使用 + 静的 dict 確認、§38/§5 ラベル監査)。`pge-loop-debugger` (同一 file 複数 sprint commit 規律)。
- **完了判定基準**:
  - read endpoint response が既存 key を**完全後方互換**で維持 (C の `total_count`/`failed_count`/`excluded_count`/`items`/`as_of` 不変、新 key は additive のみ) — pytest で回帰検出。
  - per-condition の null_reason 内訳 count の**合計 == excluded_count** (count integrity 不変条件、`feedback_facet_filter_count_integrity`)。
  - 本番 Rule5 相当: 1 条件以上で実 DB を curl して null_reason 内訳が返ることを確認 (例 roe で「業種特性」count が banking 群と整合)。⚠️ **None-preserve 検証規律** (v179/v180): 同日 re-populate の「値→None」遷移は DB 反映されない場合あり、count 変化で確認。fresh nightly (08:07 JST) の clean データで最終確認。
  - import OK / pytest 全 PASS / aggregator への LLM import なし (pre-commit Check 3 通過)。
  - **着地で commit** してから S5b へ。

### Sprint 5b — frontend: A/N/S バッジ列 + null 理由ラベル + as_of timeAgo

- **目的**: read endpoint の A/N/S を結果行内バッジ列で表示し、null 銘柄に neutral gray の理由ラベルを併記、as_of を「X日前」で表示。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` (結果行 render、290-380 付近の result row)、`frontend/src/api.js` (`fetchCanslimScanner` 674 — A/N/S condition 配線 + null_reason 内訳の受け渡し)。新 idiom は既存 `[Unknown]=--text-muted + ? glyph` を流用 (新 CSS / 新 token なし)。
- **呼ぶ既存 skill**: `designing-workspace-ui` (frontend は必ず経由、Pane 責務分離 + 角丸階層 + react hook ルール)。バッジ chip は既存 `chip_primitive_canonical` (Chip.jsx + index.css §Chip) を流用し inline 禁止。
- **完了判定基準**:
  - 各柱バッジ列が **max4** (chip 増殖しない、合議🟡 申し送り遵守)。
  - null 銘柄に §4 dict のラベルが **neutral gray (`--text-muted`)** で表示 (amber 不使用)。raw hex / 新 token を増やさない (design_system.md 不変、design-system-check 通過)。
  - as_of「X日前」timeAgo: epoch 判定 `input < 1e12 ? input * 1000 : input`、1 分毎 setInterval 再レンダーは過剰なら不要 (calc_date は日次なので分更新不要、「X日前」固定で可)。
  - **全 render path (loading / errored / empty / main) に data-testid** (`feedback_testid_all_render_paths`)。
  - 既存 C(eps_yoy) の表示後方互換を壊さない (C 単独 scan が回帰しない)。
  - frontend build OK (`cd frontend && npm run build`)。**着地で commit** してから S5c へ。

### Sprint 5c — frontend: N(near_high) = Pro ロック (ProTeaser + 確定コピー + 副リンク)

- **目的**: N(near_high) 条件を Pro(¥980) ロックにし、非 blur ProTeaser + 確定コピー + 副リンク (横の出口) を出す。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` (near_high 条件選択時に ProTeaser を出す分岐)、`frontend/src/components/ui/ProTeaser.jsx` を**流用** (props: `title` / `description` / `features` / `onUpgrade` / `variant`)。lucide `Lock` アイコン (🔒 emoji 禁止、`feedback_icon_brand_consistency` の Aman 級品格)。
- **呼ぶ既存 skill**: **`funnel-cro` (Trust Cliff 防止 7 項目 checklist 必須)** + `designing-workspace-ui`。
- **確定コピー (user 確定、再 litigate しない)**:
  - eyebrow: 「Pro 限定」 (ProTeaser 内部固定の「PRO 限定」と整合確認)
  - 見出し (title): 「新高値圏フィルター」
  - 説明 (description) 1 文目 (太字先出し): **「EPS成長・自社株買い・出来高の条件は無料のまま。」**
  - 説明 2 文目: 「これに『52週高値への接近度』を掛け合わせた絞り込みが Pro で開きます。」
  - 主 CTA: 「Pro で解放する → ¥980/月」 (`onUpgrade` = `useSubscription.startCheckout`)
  - 副リンク: 「無料の3条件で今すぐ絞り込む」 (near_high を外して**即再スキャン**する横の出口、行き止まり回避)
- **完了判定基準**:
  - `funnel-cro` Trust Cliff 7 項目 **全通過** (特に §3 表の #1「5 条件無料 vs near_high ロック」整合)。
  - 非 blur ProTeaser を使用 (PremiumLock の blur 不採用 = 「塗り潰された」感回避)。
  - 副リンク click で near_high を外した再スキャンが走る (CTA 経路は demo モード対応、行き止まりにしない)。
  - lucide `Lock` 使用 (emoji 禁止)。
  - 全 render path に data-testid。frontend build OK。**着地で commit**。

### 黒字転換 halo は今回見送り (SPEC 明記)
- 黒字転換 (turnaround) の前面 halo 訴求は **今回見送り**。理由: sp500 universe では turnaround=0 件 (handover v180 確認)。**中小型 universe 拡大後**に前面訴求する。S5b では turnaround 銘柄の null_reason ラベル「黒字転換のため前年比なし」を出すのみ (halo / 特別演出なし)。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| ファイル / 領域 | 本 SPEC での扱い |
|---|---|
| `backend/app/visualizer/prompt.py` (HG pre-commit Check 1) | **触らない** (S5 は LLM 不使用、visualizer/ 非該当) |
| `backend/app/aggregator/*.py` への LLM SDK import (pre-commit Check 3) | **触らない** (null_reason は main.py screener helper、aggregator/ を触らない) |
| `backend/app/visualizer/prompt_negatives.py` (法務 anchor) | **触らない** (該当 sprint なし) |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` | **触らない** (typo は OK だが S5 で触る必要なし) |
| `.claude/launch.json` (人間用) | **触らない** |
| `docs/migrations/*.sql` の**既存ファイル** | **既存は変更禁止**。null_reason 用 migration は**新規ファイルのみ追加** (②/① 採用時)、main が SQL Editor 適用。Generator に migration を書かせない (autonomy hook BLOCK)。 |
| `handover_*.md` (read-only reference) | **触らない** |
| `railway.toml` cron 定義 | **触らない** (canslim-scan cron スケジュール変更なし) |
| `frontend/src/App.jsx` の sticky 検索 div (8 回試行錯誤) | **触らない** |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク) | **触らない** (S5b の null ラベルは既存 `[Unknown]` idiom 流用、新 card CSS 追加なし。ProTeaser は既存 `.panel-card` を流用するだけで CSS は触らない) |
| `docs/references/design_system.md` の色 token | **触らない** (user 確定: 新 design token を増やさない、neutral gray = 既存 `--text-muted` 流用) |
| sticky 検索バー / 既存 endpoint (canslim-scan / scanner/rs / cup-scan / quarterly-history) | **触らない** (read endpoint scanner_canslim は additive 拡張のみ、既存 endpoint は不変) |

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」3 軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法 §5 / 金商法 §38 / hallucination risk)** → **partial active**: LLM は**不使用** (静的 dict)。ただし null_reason ラベルは UI に出る金融文言で §38/§5 監査が要る (「赤字決算を含む」等の事実記述に予測語が混ざらないか)。LLM 生成でないため hallucination risk は低、static label 監査のみ。
2. **Trust Cliff (LP 訴求 vs 実装の整合)** → **active**: N=Pro ロックが「5 条件無料」訴求と整合するか (§3 の核)、ProTeaser コピー / 副リンク / pricing。**funnel-cro の最重要対象**。
3. **新 backend endpoint + RLS / 認証境界 + cache 設計** → **非 active**: 新 endpoint なし (既存 scanner_canslim の additive 拡張のみ)、RLS 変更なし、認証境界変更なし。S5a migration は adding-only (既存 RLS/GRANT に包含)。

**判定: 3 体合議で十分** (Trust Cliff 1 軸が主 active、LLM 品質は静的 dict 監査で limited、backend は既存 endpoint additive で blast radius 小)。

**根拠 1 行**: LLM 不使用 (静的 dict) + 既存 endpoint additive + RLS/認証不変で、設計判断は「Trust Cliff (N ロックの訴求整合) + §38 ラベル監査 + frontend バッジ局所修正」に scope 縮小済 → 3 体で十分。

**推奨 reviewer 構成 (3 体、`feedback_multi_review_3_panel_workflow` の 1 メッセージ並列)**: **ui-designer (バッジ列 + neutral gray ラベルの洗練さ) + frontend-architect (api.js 配線 + render path testid + 後方互換) + qa-dogfooder (null 銘柄の理由ラベル誤読 + Pro ロック副リンクの行き止まり検証)**。Trust Cliff が金融文言に絡むため、qa-dogfooder に funnel-cro 観点 (5 条件無料整合) を担わせる。

> **起動タイミング**: S5c 着地後 (Pro ロック面が完成した時点) に 3 体合議。S5a/S5b は単体で commit + Evaluator で進め、最後にまとめて 3 体 review。

---

## 8. 想定リスク + roll-back plan

### このスプリントが失敗したとき何が壊れるか
- **S5a (backend)**: null_reason 内訳 count の集計ミスで `excluded_count` との不変条件が崩れる → frontend の facet count がズレて Trust Cliff。**ただし C 後方互換 key は不変** (additive のみ) のため、最悪でも null_reason 表示が出ないだけで C 単独 scan は生存。migration (②/①) 適用ミス時は graceful fallback (`_upsert_screener_fundamental` の column-not-found fallback) で C/A/N/S 値は保護される。
- **S5b (frontend)**: A/N/S バッジ / null ラベルの render bug。result row のみの局所修正のため blast radius は CustomScreenerPanel 内。発光系 CSS を触らないため発光バグ regression のリスクは低。
- **S5c (frontend)**: ProTeaser コピー誤りで Trust Cliff (「5 条件無料」と矛盾)。または副リンクの行き止まり。→ funnel-cro 7 項目で事前に潰す。

### 緊急 roll-back 手順
- **frontend (S5b/S5c)**: 各 sprint で commit 済のため `git revert <sprint commit>` → `git push origin main` で Railway auto-deploy (~30s)。バンドルハッシュ変更で反映確認。
- **backend (S5a)**: read endpoint の null_reason 内訳が additive のため、`git revert` で S4b 状態 (uncomputable/unavailable 2 値) に戻る。frontend が新 key を optional chaining で読めば revert 後も C/A/N/S 表示は生存。
- **migration (②/① 採用時)**: adding-only / `if not exists` で冪等。roll-back は不要 (新カラムが残っても既存読み取りに影響なし)。万一問題時は `alter table ... drop column if exists` を SQL Editor で実行。
- **検証**: roll-back 後に本番バンドル (`/assets/index-*.js`) を curl + grep で「null_reason ラベルが消えた」ことを確認、`/api/scanner/canslim?condition=eps_yoy` で C 後方互換を確認。

---

## 補足: user 確定済の設計判断 (gate1 で再 litigate しない)

### (a) null 表示色 = neutral gray 統一 【確定】
- null 表示色は **neutral gray (`--text-muted`)** に統一。**amber 不使用** (amber=`--color-warning` は決算カウントダウン/緊急/警告 専用 → null に使うと「問題あり」と誤読される逆 Trust Cliff + 新 design token 確定の回避)。
- 「対象外 / データなし」の区別は**色でなく理由ラベル**で行う。
- 既存 `[Unknown] = --text-muted + ? glyph` の idiom を**流用**。**新 design token を増やさない** (`design_system.md` を触らない)。
- → handover v180 が「触ると危険 (新 design token = 色 taxonomy 確定)」とした懸念は本確定で**解消**。

### (b) N(near_high) = Pro(¥980) ロック 【確定】
- 既存 screener と tier 統一 (別格 Premium にしない)。**非 blur ProTeaser を流用** (`frontend/src/components/ui/ProTeaser.jsx`)。PremiumLock の blur は「無料と言ったのに塗り潰された」感で不採用。
- lucide `Lock` アイコン (🔒 emoji 禁止)。確定コピーは §5 S5c に転記済。
- **Trust Cliff の核**: LP「5 条件無料」訴求と整合 (near_high は無料 5 条件に含まれない、CRO 確認済)。

### (c) 理由併記 【確定 — 保存方式のみ gate1 で判断】
- null の原因ごとに具体ラベルを出す。確定ラベルは §4 dict 表に転記済。
- **★ これには backend が per-原因の null_reason を返す小改修 (S5a) が必要** (現状 S4b は uncomputable/unavailable の 2 値のみで原因まで区別しない)。

---

## ★ gate1 で user に諮る唯一の残論点: null_reason の保存方式 (①②③)

> **Explore 結果** (populate コードが各 null をどこで生むか grep 済): 各 null の原因は **populate ループ (main.py 19180-19264) 内で分岐の if 文として既に判明している**が、`None` に潰されて捨てられている。
> - ROE 業種特性 → `_roe_sector_guard(sector, industry)==True` の分岐 (19206)
> - ROE 自己資本マイナス → `_roe_equity_guard` が負 equity で None (19260)
> - ROE key-metrics 欠損 → `ratios_data is None` / `roe_raw is None` (19245 付近)
> - A-CAGR 赤字 / 上場3年未満 → `_calc_eps_cagr_3y` 内で None (4971、base<=0 / records<4)
> - C 黒字転換 → `turnaround=true` (既に DB の turnaround カラムに保存済、S4b の uncomputable がこれ)
> - N/S ソース欠損 → 各 helper が source None で None

| 方式 | 内容 | Pros | Cons | Planner 推奨度 |
|---|---|---|---|---|
| **① per-column reason カラム群** | `eps_yoy_null_reason` / `eps_cagr_null_reason` / `roe_null_reason` 等を個別カラム追加 | 単純な SELECT、型安全、index 容易 | schema 肥大 (条件×reason で 6+ カラム)、migration 重い、将来条件追加で都度 alter | △ |
| **② 単一 JSONB `null_reasons` カラム** | `{"roe": "sector_guard", "eps_cagr": "loss_base", ...}` を 1 JSONB カラムに | migration 1 本、柔軟 (将来条件追加で schema 不変)、原因が populate で既知のため書き込み安価 | JSONB の count 集計は read 側でやや複雑 (但し per-condition の reason 値で GROUP BY 相当を count="exact" 反復で実現可)、index は GIN 必要 | **◎ 推奨** |
| **③ read 時に既存フラグから導出** | turnaround / sector / equity 符号を read で再取得して導出 | migration ゼロ | **populate が equity 符号 / records 件数 / sector を捨てている** → read で再 fetch = 高コスト (FMP call 復活 = read endpoint の DB-only 設計を破壊)。turnaround だけは導出可 (S4b の uncomputable) だが ROE/A-CAGR は不可 | ✗ 非推奨 |

### Planner 推奨: **方式② 単一 JSONB `null_reasons` カラム**
- **根拠**: 原因は populate ループで既知 (Explore 確認) → populate 時に拾って 1 JSONB に書くのが最安。③ は ROE/A-CAGR の原因 (equity 符号 / records 件数 / sector) を populate が捨てているため read で再 fetch = DB-only 設計 (S4b の核) を破壊し非推奨。① は schema 肥大 + 将来条件追加 (Phase4 の I 条件等) で都度 migration が痛い。② は migration 1 本 (`if not exists` adding-only)、将来条件追加で schema 不変、read 集計も per-condition の reason 値を count="exact" で取れる。
- **②採用時の S5a 作業**: (1) main が migration `2026-06-07_screener_fundamentals_null_reason.sql` (JSONB カラム + GIN index、adding-only) 作成 + SQL Editor 適用 → (2) populate ループで各 null 分岐の原因コードを `null_reasons` dict に積んで upsert → (3) read endpoint で per-condition の reason 内訳を count="exact" 反復で集計し additive key として返す。**Generator に migration は書かせない (main が human-in-the-loop で適用)**。

> **gate1 で諮るのはこの保存方式 ①②③ のみ。** (a)(b)(c) のラベル文言 / 色 / Pro ロック仕様は user 確定済のため再議論しない。
