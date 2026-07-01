# SPEC: Pane 3 v6 Sprint 3b — セクター地位の個別銘柄 detail 配線（impl-ready ドラフト）

> 作成 2026-06-28（autopilot 自律セッション・**未実装/未 ship**）。正本 SPEC = `SPEC_2026-06-27_pane3-detail-rearchitecture.md` §Sprint 3。
> 本ドラフトは「migration を要さない準備作業」として、非破壊調査 + 2体 sub-agent review の verdict を impl-ready に落としたもの。
> **user gate 待ち**: 着手前に下記「§6 user が決める点」を承認のこと。

## 1. 結論サマリー（最重要）

handover v288 は Sprint 3b を「**rs_ratings に sector 列を足す schema migration（★user gate）**が必須」と前提していたが、
調査 + review の結果 **migration 不要の Path B が技術・整合性・§38 の三点でまさる**ことが判明した。

- **Path B 採用なら migration user gate は丸ごと不要**になる（blast radius 大幅縮小）。
- ただし §38 ラベル文言 / 母集団定義 / L1 掲載可否は brand/product 判断 → **本 SPEC 承認が新しい gate**（migration gate の代替・より軽い）。

## 2. 背景（現状の事実・file:line）

> ⚠️ 下記 file:line は sub-agent 調査由来。実装着手時に main が独立裏取りすること（報告≠事実）。

- `is_sector_rs_leader` は現状 `/api/scanner/universe` の **メモリ内 post-pass**（`backend/app/main.py:20676-20730`）でのみ計算。
  各 item の `sector` と `rs_vs_spy_pct` から sector 内 RS 降順上位3位（かつ有効銘柄≥5）を leader 判定。
- sector 取得源 = `_fetch_screener_base_universe`（`main.py:20252-20314`、FMP company-screener、ticker→{name,sector,...}、**24h cache** `_UNIVERSE_BASE_CACHE`）。
  取得条件: NASDAQ/NYSE 上場・時価総額 >500M・株価 >$5・出来高 >200k・ETF/fund 除外・`limit=3000`。
- `rs_ratings` テーブル（51,844 行）に **sector 列なし**（supabase list_tables で確認＝ground truth）。
  列: id/ticker/calc_date/rs_vs_spy_pct/self_percentile/universe_percentile/period_months/scanned_at/delta_1d_percentile。
- nightly RS batch = `/api/cron/rs-scan`（`main.py:17725-17974`）。universe = `_fetch_sp500_top_n(500)` or `_fetch_market_cap_top_n(n)`。
  rs_ratings に upsert（**sector は取得していない**）。
- reader analog = `_universe_percentile_for(ticker)`（`main.py:14301`）。helpers: `_latest_valid_calc_date`（`18026`）/ `_MIN_VALID_RS_ROWS`=200（`18023`）/ `_get_supabase_service`（`15676`）。
- 個別銘柄 detail = `/api/technical/{ticker}`（`main.py:14573` で `universe_percentile` 注入済）。
- frontend: `frontend/src/features/judgment/components/detail/sections/L1SummaryBuckets.jsx:519-536` が `technicalRs`（{universe_percentile, rs_vs_spy_pct, self_percentile}）を受け RS mini 表示。

## 3. 設計分岐 — Path A vs Path B

| | Path A（migration・handover 旧案） | **Path B（migration 回避・推奨）** |
|---|---|---|
| 概要 | rs_ratings に sector + is_sector_rs_leader 列追加 → nightly batch で sector fetch + 全 universe ランキング計算して永続化 → `_sector_rs_leader_for` reader | detail endpoint で `_fetch_screener_base_universe`（24h cache）の base universe 全件に post-pass ロジックを適用し対象 ticker の結果を返す |
| 母集団 | rs_ratings の nightly universe（SP500 top500 等） | **screener base universe**（BeatScanner が実際に表示する銘柄群と一致） |
| migration | **要（★user gate）** | **不要** |
| nightly batch 変更 | 要（sector fetch + ランキング書き込み） | 不要 |
| FMP call 増 | 可能性あり | なし（24h cache 再利用） |
| Trust Cliff リスク | **高**: detail 母集団と screener 表示母集団が乖離（「screener では4位だが batch では上位3位」） | 低: 母集団が screener と一致 |
| blast radius | 大（schema + batch + reader + frontend） | 小（helper 抽出 + detail 配線 + frontend） |

### review verdict（2体・本セッション 2026-06-28）
- **backend データ整合性（general-purpose/Sonnet）**: **Path B 推奨**。母集団乖離が Trust Cliff の核心。screener universe の方が honest。
  - 重要観察（※要裏取り）: 現 post-pass の `items` は「フィルタ後」の狭い母集団で計算している疑い → detail では **フィルタ前 base universe 全件**で計算すべき。
- **金融 + §38/§5（general-purpose/Opus 相当）**: **条件付き GO**（§5 参照）。
- frontend-architect: 本環境に agent type 無く未実行。frontend 結線は L1SummaryBuckets への chip 1 個追加で低難度（Explore + backend review でカバー済）。

## 4. 推奨実装方針（Path B 具体化）

1. **post-pass ロジックを helper 化**（DRY）: `main.py:20681-20730` の sector-leader 計算を
   `_compute_sector_rs_leaders(items) -> dict[ticker, {is_leader, sector_n, sector_rank}]` 等に抽出。
   `/api/scanner/universe` は既存呼び出しを helper 経由に置換（**挙動不変を snap/curl で確認**）。
2. **detail 用 reader**: `/api/technical/{ticker}` のハンドラで `_fetch_screener_base_universe`（cache）→ **フィルタ前 base universe 全件**に helper 適用 → 対象 ticker の `is_sector_rs_leader` / `sector_n`（母集団銘柄数）/ `sector_rank` を `patterns.rs` に注入。
   - cache miss / ticker が universe 外 / sector 取得不可 → **None（frontend 非表示）**。捏造しない。
   - RS 値は **dropna / isfinite / 最小流動性フィルタ**を通す（RS NaN 伝播ガード `feedback_rs_nan_propagation_guard`）。
3. **最小有効銘柄を 5 → 10-15 に引き上げ**（§38 reviewer 指摘・「5銘柄中3位」を「上位」と呼ぶ §5 リスク回避）。閾値は §6 で user 確定。
4. **frontend**: `L1SummaryBuckets.jsx` の RS mini を「RS・セクター地位」へ拡張。
   - `technicalRs.is_sector_rs_leader === true && technicalRs.sector_n >= <閾値>` の compound check（per-source・欠落時非表示）。
   - badge 文言 = §5 推奨文言（下記）。色 **neutral**（緑禁止）。視覚は verdict より下位の chip 1 個分。

## 5. §38/§5 ガード（金融 reviewer verdict・必須遵守）

- **避ける語**: 「セクター RS leader」「セクター最強」「業界トップ」「上位3位（単独強調）」（最上級・順位断定 = §5 優良誤認 / §38 推奨示唆）。
- **推奨ラベル（事実ベース・行動指示なし）**:
  - 第一推奨: **「セクター内 相対力 上位」**（badge）
  - 数値併記推奨: **「セクター内 RS 上位（◯銘柄中 第◯位）」** ← 母集団 n を必ず併記（n なし順位は Trust Cliff）。
- **ⓘ 注記（必須・DSO/機関保有と同じ運用）**:
  > 「同セクター（◯銘柄）内で、対SPY 6ヶ月相対力（RS）が上位に位置することを示す事実指標です。相場の予測や売買の推奨ではありません。投資判断はご自身で行ってください。」
- **色**: 緑（gain）禁止。neutral / accent 帯。L1 では chip 1 個・verdict 下位の視覚階層。

## 6. user が決める点（承認 gate）

> ✅ **2026-06-28 user 承認済**（実装 = PR #73 `feat/pane3-v6-sprint3b-sector-standing`、flag pane3_v6 OFF）:
> 1. **Path B**（migration 不要）。 2. L1 に**出す**（控えめ chip 1 個・neutral・verdict 下位）。
> 3. 最小有効銘柄 **10**（n<10 のセクターは非表示）。 4/5. badge = **rank+n 併記**「セクター内 RS 上位（◯銘柄中 第◯位）」・ⓘ 必須・緑禁止。
> 実装メモ: `items` は `for tk, meta in base.items()` 構築 = base universe 全件（reviewer「フィルタ後の狭い母集団」疑いは ground truth で否定）。
> detail reader は `_UNIVERSE_FULL_CACHE` 再利用で母集団を screener と一致させた。残: merge 後 curl 突合 + dogfood snap。

1. **Path A / B どちらを採るか** — 推奨は **Path B**（migration 不要・母集団 honest）。
2. **L1 一等地に「セクター地位」を出すか** — 金融 verdict は「価値あり（CAN-SLIM の L/I・じっちゃまの強いセクターのリーダー株）」だが控えめ掲載前提。出さない選択も可。
3. **最小有効銘柄の閾値**（現 5 → 推奨 10-15）。
4. **badge 文言の最終確定**（§5 推奨文言で良いか）。
5. **sector_rank（第◯位）を出すか / is_leader boolean のみか**（rank 併記は誤認減だが順位前面化リスク）。

## 7. 検証計画（実装時・ground truth）

- backend: `/api/technical/{TICKER}` を curl し `is_sector_rs_leader` / `sector_n` / `sector_rank` を複数 ticker で確認（AAPL/NVDA = leader 期待、小型 = None or False）。
- `/api/scanner/universe` の helper 抽出後、抽出前後で `is_sector_rs_leader` が**不変**であることを curl 突合（リファクタ回帰なし）。
- build + test:unit + 本番 authed snap（`snap-pane3-v6-sprint1.mjs` に sector 地位 check 追加）+ screenshot 目視。
- §38: badge 文言 + ⓘ 注記が SPEC §5 通りか目視。

## 8. danger zone / 制約

- 件数 SSOT（PRESET_PREDICATES）不触 / screener_v2 default OFF 維持。
- `/api/scanner/universe` の post-pass helper 抽出は**挙動不変が必須**（screener 結果が変わると Trust Cliff）。
- aggregator LLM import 禁止（本変更は main.py 直・抵触なし）。
- AccordionSection 折りたたみ unmount / DiagramCard unmount 禁止 は本 sprint で非該当。
