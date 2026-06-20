# SPEC 2026-06-20: スクリーナー タブ master-detail 一本化再設計

> 起票: planner subagent (effort xhigh / Phase gate)
> 確定骨格 SSOT: [`docs/references/screener_redesign_reference.md`](../references/screener_redesign_reference.md) Part 5 (9原理 + 生 token 実数値 + 適用方針)
> backlog SSOT: `memory/project_screener_tab_redesign.md`「骨格確定 (2026-06-20)」
> 関連 memory(必読): [[feedback_polish_iteration_roi_decay]] / [[feedback_minimalism_over_additive]] / [[glow_elevation_postmortem]] / [[feedback_pge_loop_pitfalls]] / [[feedback_testid_all_render_paths]] / [[feedback_screener_hero_3sections]] / [[project_jijima_oneil_divergence]] / [[feedback_chip_role_separation]]

---

## 0. ⚠️ v3 改訂 (2026-06-20) — read first: additive アーキへの転換 (§5 を supersede)

**経緯**: Sprint 1 着地後、Sprint 2 着手時の Explore 調査で **実装と SPEC 前提の不整合**が判明。`CustomScreenerPanel` の primary フィルタは `activeFilter`(単一値) の **single-select モード切替**(各 chip = 別 endpoint fetch・別 universe)であり、SPEC §5 / 骨格が前提とした **additive 多 facet (1 universe を複数 chip で AND 絞り込み) ではなかった**。この single-select 構造こそ「使いづらさ」の根本原因。

**user 判断 (2026-06-20)**: 「SPEC が前提としたフィルタモデル(additive faceting)へ合わせよ。現状は非常に使いづらいので現状に合わせる必要は一切ない。工数を問わず計画を優先せよ」。→ **gate1「backend 不変」を破棄**し、additive を成立させる backend を新設する。

**技術的帰結**: 正確な per-chip 件数を well-defined な universe 上で出す (Trust Cliff 回避) には、各シグナルを ticker 単位で束ねた **統合 universe が必須**。backend データ層調査 (Explore) で **実現可能 (条件付き Yes)** を確認:
- 5 テーブルすべて `ticker` キーで join 可能: `rs_ratings` / `screener_fundamentals` / `pattern_signals`(cup_handle, breakout) / `earnings_evaluation`。
- nightly precompute 済 (GHA `.github/workflows/nightly_scan.yml` UTC 23:07、universe=russell3000/3000、各テーブル `calc_date`/`signal_date`)。
- 母集団 = `_fetch_market_cap_top_n(3000)` (FMP company-screener、NASDAQ+NYSE、mcap>5億・株価>5・出来高>20万、main.py:3832)。`companyName` を含むため name は追加コストなし。logo は frontend 解決 ([[logo_sources]] TV→FMP→頭文字円)。

### 0-1. 新 backend endpoint 設計 (統合 universe)

`GET /api/scanner/universe?universe_size=3000` (`Authorization: Bearer <JWT>` 任意)

> ⚠️ 以下は **6体合議 (全員 条件付き採用) の必須条件を反映済**。reviewer 帰属を [ ] で示す。

- **join (Supabase は SQL JOIN 不可)** [設計B/開発]: PostgREST のためテーブル単位 fetch + Python in-memory join。base universe (company-screener ~3000) を軸に、各テーブルの最新 valid `calc_date`/`signal_date` を `_latest_valid_calc_date` で 1 回解決 → その date で全行取得 → ticker→dict map を作り base list を軸に O(N) merge (定数回 query ~5)。⚠️ **Supabase 暗黙 1000 行上限**: screener_fundamentals/rs_ratings は 3000 universe で 1000 行超 → `.range()` ページング必須 (取りこぼし=サイレント欠落=Trust Cliff)。**Sprint 2 DoD に明記**。
- **返却 + payload** [設計B]: ticker 単位 1 行に全シグナル + sector/mcap_band + name。logo は含めない (frontend 解決)。数値は小数 1-2 桁に丸める + `GZipMiddleware` で圧縮 (3000×16 field ≒ raw 0.6-1MB / gzip 80-150KB)。ページング不可 (faceting に全件要)。
- **NULL = 第3状態「測定外」** [金融A]: ある ticker が facet の universe 外 (例 canslim default 500 外で eps_yoy=NULL) のとき、`false` (基準未達) と区別し「測定外」として扱う。AND 絞り込みで silent false negative にしない ([[project_inner_quality_completeness_ledger]] 沈黙の欠落)。frontend は「未測定 N 件を除外」を inline 注記、件数は**分母併記**「34 / 2847 件中」。※GHA は canslim-scan へ既に `universe_size=3000` 投入済 (default 500 は CLI 既定) のため実 gap は小。判別契約: facet が `locked_facets` に在る=tier ロック (鍵 UI)、無くて値 null=その ticker は測定外 (per-row)。
- **tier gate (backend 集約・base cache 後の per-request mask)** [設計B/金融A/マーケ]: `subscriptions.tier` を解決し、free=ファンダ(C/A/S/I)+RS+sector/mcap 実値、**Premium 限定**(cup_state/breakout/both/oneill) + **Pro 限定**(near_high) は **null + `locked_facets` に列挙**。⚠️ **locked と「0件 disabled」を schema で物理分離**: locked_facets の facet は frontend で必ず鍵 UI に分岐 (0件 disabled と別 path)。null 共用で「0件」誤表示=Trust Cliff。`_fetch_premium_status_from_auth` (main.py:19228) を tier 解決へ拡張。
- **freshness (per-facet + headline=max)** [金融A/設計B/Anthropic]: `freshness: {rs, funda, cup, breakout, funda_pass}` (facet ごと calc_date) を返し、headline `as_of` = その**最大値 (最新 refresh = nightly scan 鮮度)**。⚠️ 当初 min を採ったが、lagging facet (funda_pass は決算イベント依存で数十日 stale) に引きずられ新鮮な rs/cup を過小表示する (Sprint 2 検証で as_of=05-15 誤認を確認、§0-6) → **max に修正**。frontend は as_of を「最終更新」表示 + 鮮度が割れる行は ⓘ で per-facet 開示し「同一スナップショット」誤認を防ぐ。
- **cache (base 1 本 + per-request tier mask)** [設計B]: join 結果は tier 不変 → `universe_size` キーで base cache を 1 本 (nightly TTL 12-24h、既存 universe-meta 24h cache パターン main.py:18437)。tier gate は cache 後の cheap な mask 関数を毎 request 適用 (tier 別 3 分割 cache は二重浪費のため不採用)。warmup cron に追加 (free 共有 base cache を温める)、prefetchAll への追加は不要 (tab open 時 1 回 fire)。
- **既存 7 endpoint は add (置換しない)** [設計B]: `/api/scanner/*` は nightly freshness gate (yml) + roll-back (`?screener_legacy=1`) が依存 → 温存。役割明文化「7 endpoint=legacy 退避専用に温存、新規呼び出しは universe endpoint に集約」(v229 役割取り違え再発防止)。§6「/api/scanner/* 不変」と整合 (新 endpoint は add で抵触せず)。
- **既存 suppression guard の伝播検証** [金融A]: revenue basis mismatch (銀行 gross revenue artifact) / 外貨 ADR EPS suppression (BABA -91% 偽 miss) が precompute 値 (screener_fundamentals) に伝播していることを **Sprint 2 DoD で curl 検証**。inst_holders_qoq は 45 日遅延ラベル、breakout pending=終値未確定の非 buy 状態を保持。
- **LLM 非使用**: aggregator/ 数値物理層 (institutional.py 等) を **DB 読み出しで再利用**。runtime 重計算 (13F 5Q gather 等) は endpoint 内で実行しない (§4 Hallucination Guard 維持)。

レスポンス schema (draft):
```json
{
  "as_of": "2026-06-20",                                  // headline=最新 refresh (max of freshness、最終更新 semantics)
  "freshness": {"rs":"2026-06-20","funda":"2026-06-19","cup":"2026-06-20","breakout":"2026-06-20","funda_pass":"2026-05-15"},
  "tier": "free", "count": 2847,
  "locked_facets": ["cup","breakout","both","oneill","near_high"],  // 鍵 UI 分岐 (0件 disabled と別 path)
  "items": [
    {"ticker":"NVDA","name":"NVIDIA Corp","sector":"Technology","mcap_band":"mega",
     "rs_percentile":92,"rs_vs_spy_pct":18.4,
     "funda_pass":true,"eps_yoy_pct":45.2,"eps_cagr_3y":38.0,"roe":0.62,
     "buyback_yield_pct":1.2,"volume_surge_pct":140,"inst_holders_qoq_pct":3.1,
     "near_high_pct_scaled":null,                         // Pro locked (locked_facets 参照) ≠ 測定外
     "cup_state":null,"breakout_state":null,"is_new_52w_high":null}  // Premium locked
  ]
}
// 判別: facet ∈ locked_facets → tier ロック (鍵)。facet ∉ locked_facets かつ値 null → その ticker は測定外 (per-row)。
```

### 0-2. 改訂後 sprint 構成 (6 sprint、Sprint 1 は着地済)

| sprint | 内容 | 主対象 | 状態 |
|---|---|---|---|
| 1 | master シェル + preset⇄custom トグル + modal 廃止 + CSS 基盤 | ScreenerMaster.jsx 等 | ✅ 着地 (76ca027) |
| **2 (新)** | **統合 universe backend endpoint** `/api/scanner/universe` (5 テーブル LEFT JOIN + tier gate + cache + as_of) | backend/app/main.py (+ aggregator/ 再利用) | 未 |
| **3** | **frontend additive faceting 全面書換**: single-select → `activeFilters`(Set) 多 facet。per-chip 件数「急騰(34)」/ 上位5-10既定表示+折りたたみ廃止 / 適用中 chip+個別x+clear all / `useMemo([universe,activeFilters])` 一本算出 / Premium・Pro 鍵先出し(件数非表示) / Chip disabled prop (C-14) | CustomScreenerPanel.jsx, Chip.jsx, index.css | 未 |
| **4** | リスト密度: 固定 5 列モジュール行 (統合 universe 由来) + 上位強調・下位後退 + ヒット理由バッジ(§38 中立) | CustomScreenerPanel.jsx, ScreenerPane.jsx, index.css | 未 |
| **5** | 決断支援: ヒーロー TOP3/N ヒット(件数整合) + watchlist 一括 + 行クリック Pane3 直行 + staleness(as_of) | ScreenerMaster/ScreenerPane, Workspace.jsx | 未 |
| **6** | 視覚言語 最終寄せ(shadow ゼロ) + authed dogfood(vision-eval 再利用) + feature flag 昇格判断 (C-16) | index.css, snap-*.mjs | 未 |

旧 §5 Sprint 2-5 (frontend-only・backend 不変前提) は **本 §0 が supersede**。条件 C-1〜C-17 は引き続き有効 (対応 sprint 番号のみ上記へ読み替え。例: C-2 件数整合=新 Sprint 3、C-3 §38=新 Sprint 4、C-15 staleness=新 Sprint 5、C-5/C-6/C-16=新 Sprint 6)。

### 0-3. 難所への決定 (Explore 報告 top3)

1. **logo/name 未 precompute**: name=company-screener の `companyName`、logo=frontend 解決 → endpoint に含めない (追加コスト 0)。
2. **universe 乖離** (canslim default 500 vs cup/rs 3000): NULL=facet 非該当 (正しい faceting・嘘件数化しない)。GHA は全 scan へ 3000 投入済。facet 別 coverage 差は許容し、件数は「実データ充足分のみ」で honest 表示。
3. **near_high tier gate が frontend のみ**: 統合 endpoint で backend 集約 (Pro 未満は null + locked_facets)。frontend-only gate を廃し設計統一。

### 0-4. v2 からの review 軸の変化

- **新 backend endpoint + tier gate + cache** = blast radius 大。CLAUDE.md 上 **6体合議 + effort max** 領域。**Sprint 2 着手前に backend 設計の 6体合議を推奨** (3 軸: 新 endpoint/RLS/cache + Trust Cliff + §38 = 全 active)。
- §3 Trust Cliff: tier gate を backend 集約することで「無料に見えて課金」を構造的に阻止 (C-1 を物理層で担保)。
- §4 Hallucination Guard: 統合 endpoint も LLM 非使用を維持 (aggregator/ 数値物理層のみ)。

### 0-5. 6体合議 verdict (6/6 条件付き採用) + 残条件の sprint 割当

> 2026-06-20 実施 (UI/設計/開発/金融/Anthropic/マーケ)。全員 **条件付き採用**、否決 0。アーキの方向性 (master-detail + additive + 統合 universe) は validate 済。backend (Sprint 2) 必須条件は §0-1 に反映済。以下は frontend/UI/process の必須・推奨。

**Sprint 3 (frontend additive faceting)**
- **faceted count** [開発/金融]: 各 chip 件数 = 「他 active facet 適用後にこの facet だけ追加した件数」。**1 useMemo で全 chip 件数 + 結果件数を同一 predicate から算出** (predicate drift 厳禁、C-2 の核)。
- **Chip.jsx disabled** [開発/UI/Anthropic]: HTML `disabled` 属性不可 (onClick 死ぬ) → `data-disabled="true"` + CSS (opacity 0.35 + cursor not-allowed) + onClick 早期 return。tone 上書き代用禁止。animation 不使用 (落とし穴4)。
- **移行手順** [開発]: `activeFilter/cupData/rsData/oneillData` を即削除せず、universe fetch + additive を**並走実装→動作確認→git diff/grep 無参照確認後に物理削除**。
- **MetaFilterPanel 再利用** [開発]: `useMetaFilter` hook (facet count + clearFilters 実装済) を sector/mcap 次元の土台に流用。
- **empty state** [UI]: AND で 0 件頻発 → 「直前フィルタを外すと N 件」サジェスト (useMemo 分岐)。
- **testid 命名統一** [Anthropic]: `filter-chip-{key}` の key はアンダースコア統一 (`rs_percentile`)、ハイフン混在禁止。

**Sprint 3-4 (UI polish)**
- **適用中 chip group prefix** [UI]: 「ファンダ: EPS↑」等グループ文脈を薄く併記 or 左端 2px グループ色ボーダー。
- **鍵 chip = muted accent** [UI]: グレー (壁感) でなく `--color-accent` 系淡背景 + 鍵 (入口感)、ラベル「Premium で解錠」。
- **filter UI collapse** [UI]: `max-height` でなく `display:none` + `opacity` fade (jitter/LazyMotion scope 罠回避、C-17 改訂)。
- **行クリック visual** [UI]: 行全体 cursor pointer + hover bg、watchlist ボタンは opacity 0→hover 1 (Linear 方式)。
- **§38 抜け穴** [金融]: 上位強調・スコア TOP は色 polarity 不使用 (weight/opacity のみ)。「スコア」は「条件充足 N/5」と明示・緑禁止 (C-3/C-4 強化)。

**Sprint 5 (決断支援)**
- **Hero 免責** [マーケ]: 「screening 結果であり推奨ではない」1 行 + 測定軸明示 ([[feedback_screener_hero_3sections]] 継承)。
- **staleness 文言** [UI/マーケ]: 「最終更新 X 分前」より「毎朝更新 (nightly)」系サイクル文言 (nightly precompute の鮮度印象対策)。
- **GA4 baseline** [マーケ]: 旧構造の行クリック率/watchlist 追加率を**切替前に計測** (C-16 比較基準)。

**Sprint 6 / Trust Cliff (§3 追記)** [マーケ]
- 鍵 facet click 先に **UpgradeModal Premium 列が存在すること** (Stripe Premium 配線が前提、未配線なら dead-end funnel)。
- 非ログイン時の鍵 facet/行 click → UpgradeModal でなく**ログインモーダル**へ。
- C-1 に「facet chip=件数非表示 / 結果行=blur+件数 OK」のレイヤ分離を明記 (Generator 取り違え防止)。
- `screener_v2` default ON 昇格は **C-16 pass 後**。それまで `?screener_v2=1` opt-in dogfood (現状 opt-in 実装済 ✅)。

**process (全 sprint)** [Anthropic]
- Sprint 2 Generator prompt に「**main.py 全文 Read=abort**」を L1 明記 + Explore 2 段委譲 (signature 抽出→実装)。
- Sprint 3 = **1 Generator=1 Pass の 3 Pass 構成** (3a rename / 3b facet engine / 3c UI 整理)、Pass 間 commit (1916 行一括=崩壊確定)。
- Sprint 3-4 は **3体合議で十分** (backend schema 確定済、frontend 局所)。
- Sprint 2 DoD に **backend curl smoke** (TOKEN+curl+jq で as_of/freshness/tier/count/locked_facets/keys 検証) + memory 更新を末尾に。

**backlog (本 SPEC 外)** [マーケ]: Pro tier 価値が near_high 1 facet のみで薄い → Pro 限定 facet 追加 (RS 急上昇 delta 等) を別途検討。

### 0-6. Sprint 2 本番検証 findings (2026-06-20、commit d53ca0c/477c202)

`GET /api/scanner/universe` 本番 LIVE・検証済 (HTTP 200 / 964KB / 5.4s、free tier count=2603)。構造・per-facet freshness・free tier gating (cup/breakout/near_high=null) 全て PASS。検証で 2 件の data 由来課題を発見:

1. **funda_pass が疎** (data 実態、 bug でない): `earnings_evaluation` は `max_eval_date=2026-05-15`・全期間 `all_passed=true` 25 件・**95日窓 0 passers** (5 条件は pass 率 0.7%、決算シーズン谷間)。既存 `cup-handle` scanner も同依存で現在 0 件。→ funda_pass を tri-state 化済 (477c202)。**設計論点 (Sprint 3)**: universe-wide で常時新鮮な「ファンダ」次元は CAN-SLIM 数値 (screener_fundamentals, 06-19 新鮮) 側。じっちゃま 5 条件 binary は決算イベント依存の sparse facet として「最新決算で5条件達成」と明示するか、CAN-SLIM 数値 facet を主にするか要決定。
2. **ADR/銀行 EPS guard 未伝播** (Trust Cliff、task #13): BABA `eps_yoy_pct=-94.8` (外貨 ADR EPS 単位ミスマッチ偽 miss、[[feedback_foreign_currency_adr_guards]])。銀行 (JPM/BAC) は roe=null で guard 痕跡あり。screener_fundamentals (canslim-scan) に guard 未適用 = 既存 canslim screener にも存在。**修正候補**: canslim-scan precompute で guard (SSOT) or frontend 表示抑止 (Sprint 3-4)。reporter currency metadata が screener_fundamentals に無いのが難所。

### 0-7. Sprint 3 詳細: 段階閾値 (grade) 統合 — SPEC_2026-06-18 蛇口カタログを additive に統合

**経緯**: user (2026-06-20) が「ファンダ各条件を数値閾値×期間で柔軟に絞る (EPS成長 25/50/100% × 3期/3年/5年、売上・EPS毎期成長だが CFPS<15% 等)」を要望。これは既存 [[project_screener_fundamental_threshold_grading]] (`docs/specs/SPEC_2026-06-18_screener-pane2-3-redesign_draft.md` v2、6体合議 6/6 条件付賛成) の段階閾値構想と同一。**本 additive master-detail の Sprint 3 = SPEC_2026-06-18 の蛇口カタログ + プリセット + grade を additive faceting に統合**する (SPEC_2026-06-18 が threshold 設計の SSOT、本 §0-7 が統合方針)。

**統合する設計 (SPEC_2026-06-18 SSOT)**:
- **state = `{preset, overrides}`**: preset='loose'|'standard'|'strict'、実効 level = `overrides[key] ?? PRESET_TABLE[preset][key]` (焼かない)、preset 再選択で overrides リセット。additive chip = この override UI。
- **3 プリセット** + ライブ件数 (active pill「標準 (12)」)。較正: 緩い≈55 / 標準8-15 / 厳しい2-5 (universe 2451)。
- **詳細展開**: ファンダ(A-C)/テクニカル(D-G) 2タブ accordion、各 metric on/off + grade。スライダー回避 (segmented 2-5択)、AbortController+300ms debounce (0件 flash 回避)。
- **grade 閾値 (O'Neil 原典 §7)**: EPS YoY 床+20/良+25/最良+50-100% / RS ≥70(絶対床・70未満ハードゲート禁止)/80/90 / ROE ≥17/17/25% / 出来高 +25/40/50% / cup 形成中/取っ手/ブレイク確定。
- **tier**: プリセット3段は全 tier 操作可、tier は蛇口の種類で切る。Free=Group A-B+RS / Pro=Group C / Premium=Group E-F (§0-1 locked_facets と整合)。件数・種類は無料、銘柄名のみ blur。
- **§38**: grade は「絞り込む度合い」事実表現。「最良/本命/今が好機」禁止 (blocklist + bundle grep)。

**Sprint 3 で使える指標 (統合 universe endpoint で precompute 済・6条件先行)**: eps_yoy_pct(C) / eps_cagr_3y(A) / roe(A) / buyback_yield_pct / volume_surge_pct(S) / inst_holders_qoq_pct(I、45日遅延ラベル) / rs_percentile(L) / cup_state(E,Premium) / breakout_state(F,Premium) / near_high(N,Pro) / sector / mcap_band。

**(b) Sprint 3 着手前に確定 (要調整)**:
- funda 主軸 = **CAN-SLIM 数値 (常時新鮮)**、じっちゃま5条件 binary は「最新決算で5条件達成」明示の sparse facet (user hybrid 確定)。
- 標準プリセット eps_cagr 閾値 = curl 再較正で 8-15 件レンジ着地 (≥15% 目安)。
- CF系・Beat・ガイダンス・patterns は (c) で未 precompute → Sprint 3 では「利用可能化予定」表示 or off 固定。
- ADR/銀行 guard (task #13) は facet 化で偽件数に反映 → canslim-scan precompute or frontend 抑止を先行/並行。

**(c) data 拡張が前提 (後続 data 拡張 sprint、user 要望の一部)**: 営業CFマージン / CFPS>EPS / 3期連続性 / 売上高成長YoY / EPS 5年・3期 quarterly continuity / EPS・売上 Beat / ガイダンス上方修正 / 来期YoY / 平底・ダブルボトム。→ nightly batch 精算追加 ([[feedback_revenue_basis_mismatch]] sector guard 必須)。**user 例の「売上毎期成長・CFPS<15%・EPS 5年」はここ**。

**移行**: SPEC_2026-06-18 の S2 (6条件先行・facet backend) は本 SPEC の Sprint 2 (統合 universe endpoint) が代替・完了。旧 S3 (詳細 accordion) = 本 Sprint 3 に統合。旧 S5 (patterns)/S6 (mobile)/S7 (M ゲート) は後続。

---

## 1. Context

**user prompt 原文**: 「screener tab を『シンプルかつリッチ』に master-detail 一本化で再設計する SPEC を起票してほしい」(2026-06-20)

**なぜ今やるか (根拠)**:
- 発端 (2026-06-20 user): screener tab のデザインが「すごく使いづらい」。`memory/project_screener_tab_redesign.md` で backlog 化、Claude が proactive に提案するタイミングと定義済。
- **タイミング 3 条件が揃った**:
  1. screener 機能 workstream が一段落 (gradual cup 反映 v229 / extended amber / breakout screener)。「器より中身が先」の中身が固まった。
  2. **view 構造の複雑さが混乱の温床**と判明 (v229 手順5 で ScreenerPane↔CustomScreenerPanel の役割を取り違え判断が二転三転)。
  3. 小 polish の ROI 減衰 ([[feedback_polish_iteration_roi_decay]]): 「使いづらい」は色/余白の小修正では消えない構造問題。extended amber 実装が「構造的にほぼ非表示で効かなかった」のが実例。
- 骨格は effort max / ultrathink / deep-research (109 agent 出典付き 3票合議) + PDF 模範 3 枚 + pain point 5 軸 で **user 承認済**。本 SPEC はその骨格を実装可能 sprint に展開する。

**root cause (確定)**: 「絞る面 (Pane2 Explorer = CustomScreenerPanel)」と「眺める面 (Pane3 Hero = ScreenerPane)」+「modal (WorkspaceScreenerModal)」の **3 入口が並置**。さらに master が 2 つ並ぶため視線が分断する。

**実装現状の重要な発見 (本 SPEC で調査済、骨格の前提を補正)**:
- `frontend/src/features/workspace/Workspace.jsx` には **既に `v160 D2 (master-detail)` の partial 実装が存在**する (line 982-1024 Pane2=CustomScreenerPanel 常駐 / line 1051-1123 Pane3=ScreenerPane idle ⇄ JudgmentDetail 詳細)。つまり「Pane2 master / Pane3 detail」の骨は既にある。
- **未実装の核**: ① preset⇄custom の単一トグル統合 (今は ScreenerPane=preset と CustomScreenerPanel=custom が別 pane に分離したまま) ② 件数併記 ③ 適用中条件 chip 常時可視 + clear all ④ 観点別カラムプリセット ⑤ watchlist 一括追加 ⑥ shadow ゼロ + border/tinted-bg 視覚言語への寄せ。
- **第3入口 `WorkspaceScreenerModal`** (Workspace.jsx 1147-1156、WorkspaceHeader「スクリーナー」 button 起動) が CustomScreenerPanel を portal で重複 mount しており、これが廃止対象。
- backend は `/api/custom-screener` `/api/scanner/{rs,cup-handle,breakout,retest,canslim}` `/api/screener` `/api/screener/universe-meta` が既に揃う。**本再設計は frontend 統合が主、backend は原則不変** (件数併記の Open Q2 のみ backend 拡張が論点)。
- testid は `feedback_testid_all_render_paths` 規律で loading/error/empty/main 全 path に既に付与済 (良い基盤、新規モジュールも同規律を継承する)。
- `ScreenerPanel.jsx` (旧 `/api/screener` gainers) は CustomScreenerPanel とは別の legacy component。本再設計の対象外 (触らない)。

**期待される成果 (5 原則への貢献)**:
- **原則 3「シンプルかつリッチ」(主目標)**: 3 入口 → master 1 + detail 1 に統合。「構造は中学生でもわかる」シンプルさを構造から達成。
- **原則 1「読み手に負担をかけない」**: 件数併記 + 適用中 chip 常時可視で「今何が効いているか」を 2 秒で把握。
- **原則 2「毎日開きたくなる」**: ヒーロー「本日の TOP3 / N 銘柄ヒット」で「で、どれ見ればいい?」に即答。
- **原則 4「1 クリックを減らせ (人力代替)」**: 行クリックで Pane3 直行 + watchlist 一括追加。「毎日人力でやっている銘柄スクリーニング」の代替を強化 (= Yes、見送りでなく強い機能)。

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

効く感情: **洗練さ (sophistication)** が主、副次的に **心地よさ / 一目惚れ**。

最高級ホテルの比喩で言えば、現状は「フロント (preset Hero) と別棟のクローク (custom Explorer) と裏口 (modal) の 3 つに同じ案内係が立っていて、客が『どこで頼めばいいの?』と迷う」状態。再設計は「**1 つのコンシェルジュデスク (master) に立ち、客の視線の先にゲストルーム (detail) が静かに開く**」master-detail の動線に整える。視覚言語は骨格 5-4 の「**shadow ゼロ + border/tinted-bg elevation**」を採り、装飾でなく**余白の寛大さと構造の一貫性で上質さ**を出す (PDF 原理 3「余白の寛大さ＝上質さ」)。これは発光バグ ([[glow_elevation_postmortem]] v54-v59 6 セッション) が**原理的に起きない引き算哲学**で、世界観の柱「洗練さ」と安全性を同時に満たす。

`feedback_brand_aspiration.md` の修正禁止 anchor (§-1 / §-1-A の 5 感情語彙) は破壊しない。新規修飾語の追加もしない。**§-1 の cyan は方向性 (上昇/下落) に使わずブランド emphasis 専用**を厳守し、accent は 1 色 opacity 変調 (`/5`〜`/30`) に限定する (骨格 5-4)。

⚠️ 留意: 既存 BeatScanner には発光 recipe ([[feedback_glow_active_pattern]]) も存在する。本 SPEC は **screener 面に限り「shadow ゼロ哲学」を採る** (骨格 5-4 の確定方針)。他面 (home / Pane3 判定詳細) の発光 recipe は不変。screener 内の **新規 card/モジュールに `.panel-card / .bs-panel / .surface-card` を新たに付けない** = 発光系の高リスク CSS を触らずに済む (§6 禁止事項と整合)。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言・既存 tier gate との整合 (3 項目以上):

1. **「3 銘柄/日まで無料」 / 登録不要**: master の preset リスト・行クリック → Pane3 直行は、demo/非ログインでも既存の rate limit (3 req/IP/day) と `handleLPTickerClick` 経路を維持する。新しい行クリック導線が `runAnalyze` を直接呼ばないこと (CLAUDE.md「LP → 銘柄クリックは必ず `handleLPTickerClick`」)。**screener の行クリックは既存 `setActiveTicker` を維持** (Workspace.jsx 内 master-detail 経路、tab 離脱しないため demo モード判定はそのまま)。
2. **Pro/Premium tier gate**: 現状 CustomScreenerPanel のテクニカル条件 (cup/breakout/rs/near_high/inst_holders) と複合条件 (both/oneill) は **Premium 限定**、ScreenerPane の一部 Hero section は **demo blur + ProTeaser**。統合後も**この gate を 1:1 で維持**する。preset/custom トグルで gate 対象条件が「無料に見えて押すと課金モーダル」になる Trust Cliff を作らない。Premium 条件 chip は **gate を視覚的に明示** (鍵アイコン or ProTeaser blur) してから押させる。
3. **件数併記の数値整合 (Facet Filter Count Integrity)**: chip の件数「急騰(34)」が、実際に絞り込んだ結果リストの件数と**完全一致**すること ([[feedback_facet_filter_count_integrity]]: count と filter predicate を同一集計に。ズレ自体が Trust Cliff)。preset の「本日 N 銘柄ヒット」も同様。
4. **§38 / §5 (色で買い断定不可)**: master の状態バッジ・スコア・行モジュールで**色によって「買い」を断定しない**。色は事実状態 (cup state / Beat/Miss / 出来高) のみ。最上級表現 (「最強」「絶対」) を chip/見出し/empty 文言に出さない (骨格 5-6)。

該当しない項目: なし (上記 4 項目で網羅)。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか: NO。**

本再設計は **frontend の view 統合 + 既存 backend endpoint の再配線**が主で、**新規 LLM 呼び出しを一切追加しない**。
- master リスト・件数・状態バッジ・カラムプリセットは全て backend の数値物理層 (`/api/scanner/*` `/api/custom-screener`、aggregator/ 由来の計算値) を表示するのみ。
- preset/custom の説明文言・状態ラベル・empty メッセージは **静的 dictionary** で出す (Phase 5.5 `STATE_LABEL_JP` パターン)。「ちょっとだけ LLM に narration を生成させたい」近道は **禁止** (CLAUDE.md「必ず Trust Cliff バグを生む」)。
- detail 面 (Pane3 = JudgmentDetail) は既存 LLM endpoint を使うが**本 SPEC で内部を触らない** (心臓部回避、§6)。

結論: **LLM 不要、静的 dictionary / Python 計算で完結**。4 重防御の新規適用は不要。ただし既存の frontend sanitize layer (`blocklist.js`) を**経由する detail 面はそのまま維持** (迂回しない)。

---

## 5. スプリント分割 (master-detail 一本化、上限 6 / 本 SPEC は 5 sprint)

> 🛑 **DEPRECATED (v3): 以下 §5 の Sprint 2-5 は §0「v3 改訂」が supersede。** §5 は frontend-only・backend 不変前提で書かれており、additive アーキ転換後の**正 sprint 構成は §0-2 の表**。Sprint 1 (§5 本文) のみ着地済で有効。**Generator は §0-2 を正とし、§5 Sprint 2-5 の本文を実装対象にしないこと。** 条件 C-1〜C-17 (本 §5 各所) は §0-2 の注記どおり sprint 番号を読み替えて引き続き有効。

> ⚠️ **PGE 落とし穴 1 対策 (全 sprint 共通・最重要)**: 本再設計は Workspace.jsx / ScreenerPane.jsx / CustomScreenerPanel.jsx / index.css を**複数 sprint で横断して触る**。worktree は sprint 間で累積しないため、**各 sprint 完了時に必ず commit する** ([[feedback_pge_loop_pitfalls]] 落とし穴1)。次 sprint は前 sprint の commit を base に着手。sprint 跨ぎで「前の変更が消えた」事故を防ぐ。
> ⚠️ **PGE 落とし穴 2 対策 (全 sprint 共通)**: 新規モジュール/chip の primary selector は **必ず data-testid** (既存 `screener-pane` / `screener-chunk-setup` / `CupResultCard` / `data-cup-state` と整合)。**loading / error / empty / main の全 render path に付与** ([[feedback_testid_all_render_paths]])。selector を実装前に hallucinate しない (落とし穴2)。
> ⚠️ **C-7 (DoD 強化・全 sprint 共通)**: 各 sprint 完了判定に「production bundle (`/assets/index-*.js`) を `curl+grep` して新 testid 文字列の存在を確認する」を **L3 検証** として必ず追加する (PGE 落とし穴2の核心)。
> ⚠️ **C-8 (context-safety・全 sprint 共通)**: 大ファイル (CustomScreenerPanel.jsx 1916行 / ScreenerPane.jsx 1129行) を Generator が main context に全文取り込まない。`offset+limit` による部分 Read 、または `git diff -- <path>` + 限定 grep で編集・確認すること。

### Sprint 1: master シェル + preset⇄custom 単一トグル統合

- **目的**: 3 入口 → master 1 つに統合する骨格を立てる。Pane2 に「**preset (今日の注目) ⇄ custom (自分で絞る)**」の単一トグルを置き、同じ master リスト面に preset 結果 / custom 結果を出し分ける。WorkspaceScreenerModal を廃止 (第3入口除去)。
- **触るファイル**: `frontend/src/features/workspace/Workspace.jsx` (isScreener の Pane2/Pane3 配線 982-1156、modal 1147-1156 削除)、`frontend/src/features/workspace/WorkspaceScreenerModal.jsx` (削除 or 参照解除)、`frontend/src/features/workspace/WorkspaceHeader.jsx` (「スクリーナー」 button → modal open を撤去 or master tab へ誘導)、新規 master シェル component (例 `features/workspace/ScreenerMaster.jsx`)。
- **呼ぶ既存 skill**: `designing-workspace-ui` (Workspace 3-pane / store 配線の SSOT)、`screener` (screener 機能の既存仕様)、`pge-loop-debugger` (sprint 着手前)。
- **C-9 (一気書き換え回避)**: `ScreenerMaster.jsx` シェルを**新設し**、既存 component (CustomScreenerPanel / ScreenerPane) を Props で内部再利用する。一気書き換えしない。WorkspaceScreenerModal の廃止は `screenerOpen` state + WorkspaceHeader「スクリーナー」 button + import の**全 3 点を同時削除**し、`grep WorkspaceScreenerModal` が 0 件になることを必須ゲートとする。
- **C-11 (CSS 基盤先行)**: shadow ゼロ + border/tinted-bg token + 3 段余白の CSS 基盤変数を Sprint 1 **冒頭**で確定する。`.screener-master` スコープに限定 (`:where(.screener-master)` で specificity を上げない、または `[data-testid='screener-master']` スコープ)。既存 `.panel-card / .bs-panel / .surface-card` 発光系との衝突を回避する。
- **C-12 (state 管理)**: preset/custom モード・activeFilters・columnPreset は `workspaceStore` (persist/migrate 対象) に入れず、`ScreenerMaster.jsx` local state または新規 `useScreenerState` hook で管理する (既存 localStorage を壊さない)。precomputedUniverse は `useRef` + `useMemo` で保持。
- **C-17 (UI/UX: preset 時 filter UI 非表示)**: preset モードではフィルタ UI を物理非表示 (`max-height:0`) とする。適用中 chip の常時表示は **custom モード限定**。preset⇄custom セグメントトグルのラベルは 2-4 字 (例: 「注目」「絞り込み」) で master ヘッダー右寄せに配置する。
- **gate 1 確定**: トグルの視覚表現 = **セグメントトグル** (shadow ゼロ + border/tinted-bg で境界、決定済み)。
- **完了判定基準**:
  - screener tab で master 上段にトグルが表示され、preset/custom を切替えると同じ master 面で結果が入れ替わる。
  - WorkspaceHeader「スクリーナー」 button から modal が開かなくなる (第3入口消滅)。`grep WorkspaceScreenerModal` が 0 件。
  - testid: `screener-master` / `screener-mode-toggle` / `screener-mode-preset` / `screener-mode-custom` が全 render path に存在。
  - production bundle を `curl+grep` して上記 testid 文字列の存在を確認 (C-7 L3 検証)。
  - `cd frontend && npm run build` が通る。**commit する**。

### Sprint 2: フィルタ操作 (件数併記 + 上位5-10表示 + 適用中chip常時可視 + clear all)

- **目的**: custom モードのフィルタ操作を骨格 5-2 に整える。全隠し折りたたみを廃止し、利用頻度順に上位 5-10 条件を既定表示。各 chip に件数併記「急騰(34)」。適用中条件を chip 列で常時可視 + 個別 x + clear all。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` (FilterPillarSection 154-211、defaultOpen / 折りたたみロジック、chip 件数、適用中 chip 列の新設)、`frontend/src/index.css` (chip 列 / 件数 badge の CSS、§Chip primitive 経由)。
- **呼ぶ既存 skill**: `screener`、`design-system-check` (token 経由 / raw hex 禁止確認)、`pge-loop-debugger`。
- **gate 1 確定**: 件数計算 = **frontend 集計 + 0件 chip は薄 grey disabled** (backend 不変)。
- **C-1 (Trust Cliff / Premium gate)**: 無料ユーザーには Premium chip の**件数を表示しない**。鍵アイコン + 「Premium」ラベルを表示し、件数はロック解除後のみ見せる (「12件あると見えたのに押すと課金」を構造的に防ぐ)。
- **C-2 (件数整合)**: ヒーロー件数・chip 件数・リスト件数を `useMemo([universe, activeFilters])` **一本**で算出する。同一 predicate・同一 universe スナップショットを必ず使用すること ([[feedback_facet_filter_count_integrity]])。
- **C-14 (Chip disabled 実装)**: `Chip.jsx` に `disabled` prop (または `aria-disabled=true` + `tabIndex=-1` + `cursor-not-allowed` を `index.css §Chip` に追加) を実装してから 0件 disabled chip を作る。tone 上書きのみで代用しない。件数 badge「急騰(34)」は `tabular-nums` + `min-w-0` で幅崩れを回避する。
- **完了判定基準**:
  - 上位 5-10 条件が既定表示、残りのみ折りたたみ (全隠しでない)。
  - 各 chip に件数併記、件数が結果リスト件数と一致 ([[feedback_facet_filter_count_integrity]])。
  - Premium chip は件数非表示 + 鍵アイコン + 「Premium」ラベルで先出し (C-1)。
  - 適用中条件が chip 列で常時可視 (custom モード)、個別 x と clear all が動作。
  - Chip primitive (`Chip.jsx`) を使用、inline chip 禁止。disabled prop 実装済み (C-14)。
  - testid: `filter-chip-{key}` / `filter-chip-{key}-count` / `applied-filters-bar` / `applied-filter-{key}` / `applied-filters-clear` に `preset-` / `custom-` プレフィックスを付与して selector 衝突を回避 (C-13)。
  - production bundle を `curl+grep` して上記 testid 文字列の存在を確認 (C-7 L3 検証)。
  - `npm run build` 通過。**commit する**。

### Sprint 3: リスト密度 (固定モジュール行 + 上位強調・下位後退)

- **目的**: master の銘柄行を骨格 5-3 に整える。**デフォルト固定 5 列** `ロゴ｜銘柄+ticker｜条件バッジ｜スコア｜状態` に簡素化 (B-1 確定)。「詳細展開」ボタン 1 つのみ。過多情報 (条件ドット5 + CAN-SLIM5) は detail へ送る。密度の交互律「上位強調・下位後退」。
- **B-1 (カラム簡素化・確定)**: デフォルトは固定 5 列のみ。観点別カラムプリセット切替 (急騰/ファンダ/cup 観点の複数切替) は**backlog 送り** (§9 に記載)。
- **触るファイル**: `frontend/src/components/CustomScreenerPanel.jsx` (ResultCard / CupResultCard 1012-1141、行モジュール再設計、ConditionDots5 / CAN-SLIM バッジの detail 送り)、`frontend/src/features/workspace/ScreenerPane.jsx` (preset 行を同じ固定モジュールに揃える 256-583)、`frontend/src/index.css` (行モジュール の CSS)。
- **呼ぶ既存 skill**: `screener`、`design-system-check`、`pge-loop-debugger`。
- **C-3 (§38 バッジ・スコア・色)**: スコアは**事実カウント (N/5 充足数) のみ**に限定し、総合点・おすすめ度の名称を使わない。スコア色は中立 (緑禁止)。cup state バッジも緑禁止・状態事実ラベルのみ (Beat/Miss の緑赤は過去事実なので可)。**過延伸 (breakout_extended) chip** の主ラベルは「過延伸/ピボット乖離」(事実記述)。「押し目待ち」等の推奨は補足 ⓘ に限定。custom モードでも `_STATE_PRIORITY` 順を維持し extended は下位後退・amber 表示。
- **C-10 (ヒット理由バッジ・B-1 統合)**: 固定 5 列の「条件バッジ」列が**ヒット理由 (最大 2-3 個、§38 中立色)** を兼ねる。ConditionDots5 / CAN-SLIM5 等の詳細は detail (Pane3) に送ること (so what 即答 = 人力代替の説得力)。
- **設計留意**: 状態バッジは [[feedback_chip_role_separation]] / 方向記号 ↑↓ 統一 ([[feedback_chart_hover_direction_symbol]]) を遵守。
- **完了判定基準**:
  - preset / custom 両方の行が同一固定 5 列モジュール (1 行目で読み方を学習)。
  - 条件バッジ列がヒット理由 (最大 2-3 個) を表示し、§38 中立色準拠 (C-3)。
  - ResultCard の過多情報 (条件ドット5等) が行から消え detail に移動。
  - testid: `screener-row-{ticker}` を全 path に付与。既存 testid (`data-cup-state` 等) 維持。
  - production bundle を `curl+grep` して `screener-row-` testid を確認 (C-7 L3 検証)。
  - `npm run build` 通過。**commit する**。

### Sprint 4: 決断支援 (ヒーロー TOP3 / N ヒット + watchlist 一括追加 + 行クリック Pane3 直行)

- **目的**: 骨格 5-5 の結果→行動 2 経路。master 上段ヒーローに「本日の TOP3 / N 銘柄ヒット」。複数選択で watchlist 一括追加 (新規)。行クリックで Pane3 直行 (既存 setActiveTicker 維持・確認のみ)。
- **触るファイル**: `frontend/src/features/workspace/ScreenerMaster.jsx` (ヒーロー)、`frontend/src/components/CustomScreenerPanel.jsx` (複数選択 + 一括追加 UI)、watchlist 追加 API は既存 (`api.js` の watchlist 関数を再利用、新規 backend なし)。
- **呼ぶ既存 skill**: `screener`、`design-system-check`、`pge-loop-debugger`。`funnel-cro` (watchlist / tier 導線が CVR に絡むため確認)。
- **C-1 + B-2 (Premium gate の鍵先出し)**: preset「今日の注目」には cup 完成等の Premium 由来銘柄も含めるが、無料ユーザーには**行に鍵アイコン + 「詳細はPremium」を先に明示**する (押す前に分かる)。preset でも custom でも Premium は鍵+「Premium」先出しで統一。
- **C-4 (§5 ヒーロー TOP3)**: ヒーロー「TOP3」には**測定軸を必ず明示** (例「急騰TOP3」「スコアTOP3」)。軸なし「TOP3」は優良誤認リスク (景表法§5) のため禁止。preset「今日の注目」の選定基準は ⓘ アイコンで開示する。
- **C-15 (staleness 表示)**: preset ヒーローに「最終更新 X 分前」を併記する (`epoch 自動判定: input < 1e12 ? input * 1000 : input`、1 分毎 `setInterval` 再レンダー)。
- **C-16 (昇格ゲート数値化)**: `screener_v2` を default ON に昇格する判断軸 = `vision-eval` (Aman 軸 3 run mean) pass + Trust Cliff 4 項目の手動 pass + 行クリック率/watchlist 追加率が旧構造を下回らない。**GA4/Clarity の比較 event** (行クリック率・watchlist 一括追加率) を Sprint 4 で仕込む。
- **完了判定基準**:
  - master 上段に「急騰TOP3 (等、軸明示)」+「N 銘柄ヒット」がヒーロー表示 (件数は Sprint2 の集計と整合、C-2)。「最終更新 X 分前」併記 (C-15)。
  - Premium 銘柄行は鍵アイコン + 「詳細はPremium」先出し (C-1 + B-2)。
  - 複数選択 → watchlist 一括追加が動作 (optimistic UI、`.is-pending` lighter ring)。
  - 行クリック → Pane3 (JudgmentDetail) 直行が維持 (回帰なし)。demo/非ログインで `handleLPTickerClick` 経路が壊れていない。
  - GA4/Clarity の比較 event 仕込み確認 (C-16)。
  - testid: `screener-hero-summary` / `screener-bulk-watchlist` / `screener-row-select-{ticker}` を全 path に付与。
  - production bundle を `curl+grep` して上記 testid を確認 (C-7 L3 検証)。
  - `npm run build` 通過。**commit する**。

### Sprint 5: 視覚言語の最終寄せ (shadow ゼロ + border/tinted-bg) + authed dogfood verify

- **目的**: 骨格 5-4 の視覚言語に screener 面全体を寄せる仕上げ。shadow ゼロ / border + tinted-bg elevation / accent 1 色 opacity 変調 / weight 3 段 / 余白 3 段 (section/block/item)。最後に headless authed dogfood で master-detail 全フローを vision-eval。
- **触るファイル**: `frontend/src/index.css` (screener scope の elevation / spacing / weight トークン適用)。
- **呼ぶ既存 skill**: `design-system-check` (raw hex / shadow whitelist 照合)、`vision-eval` (Aman 軸は 3 run mean、[[feedback_vision_api_noise]])、`pge-loop-debugger`。
- **C-6 (dogfood 既存 script 再利用)**: dogfood は**新規 snap script を作成しない**。既存の `frontend/scripts/snap-screener-vision.mjs` + `frontend/scripts/lib/auth-helper.mjs` を再利用する (`--runs 1` を `×3` bash loop で 55s timeout 回避 / `--label baseline` と `after` の Δ で判定)。新規 script が必要な場合のみ: ESM top-level return 禁止 (関数で wrap) + `getAnimations().finish()` を try/catch + `node --check` + visual harness 4 条件 (`snap-*.mjs` 命名 / headless / 60s timeout + finally close / `.visual/` 出力・HTTP server 不起動) を全て適用。
- **C-5 (feature flag 2 層)**: `?screener_v2` (構造新旧切替) と `isPillar2Pane1()` (tab 可視 ON/OFF) を**独立 2 層**として明記する。`screener_v2` はデフォルト ON とし、`?screener_legacy=1` を旧構造 kill switch に反転 (旧来の `?screener_v2=1` フラグ案を逆転)。Evaluator が両 flag を verify する手順を DoD 化する。
- **完了判定基準**:
  - screener 面に raw hex / raw shadow が無い (`design-system-check` pass)。`.panel-card / .bs-panel / .surface-card` を screener 新規モジュールに付けていない。
  - section 64-80 / block 32 / item 8-16px の 3 段余白、weight 3 段が適用。
  - authed dogfood: preset⇄custom トグル → 件数 chip → 行クリック Pane3 → 戻る、の全フローが vision-eval pass (Aman 軸 3 run mean)。`?screener_legacy=1` で旧構造に退避できることを確認 (C-5)。
  - production bundle を `curl+grep` で最終確認 (C-7 L3 検証)。
  - `npm run build` 通過。**commit する**。最終 push は user 明示依頼時のみ。

> **sprint 数**: 5 (上限 6 以内)。blast radius が大きい (Workspace.jsx 心臓部周辺) ため、各 sprint を「動く 1 機能」に絞り commit 区切りを徹底。Sprint 1 が最高リスク (master-detail 配線変更 + modal 廃止) のため、Sprint 1 着地後に一度 user 中間確認を挟むことを推奨。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

以下は本 SPEC のどの sprint でも**触らない**。該当する sprint がある場合も「触らない」を明示遵守:

- `backend/app/visualizer/prompt.py` — Hallucination Guard pre-commit Check 1 (本 SPEC は LLM 不使用、触る理由なし)
- `backend/app/aggregator/*.py` への LLM SDK import — pre-commit Check 3 (本 SPEC は backend 原則不変、件数の Open Q2 で backend 拡張する場合も aggregator は数値物理層のまま、LLM import しない)
- `backend/app/visualizer/prompt_negatives.py` — 法務 anchor (BAD-1〜6)
- `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` — typo 修正以外は触らない (detail 面 sanitize は維持)
- `.claude/launch.json` — 人間用
- `migrations/*.sql` — DB schema (本 SPEC は migration 不要、watchlist 一括追加も既存テーブル/RLS を再利用)
- `handover_*.md` — read-only reference
- `railway.toml` の cron 定義 — nightly cup-scan / precompute は不変 (precompute 済結果を frontend で表示するだけ)
- **`frontend/src/App.jsx` の sticky 検索 div / `.sticky-search-band`** — 8 回試行錯誤の安定領域 ([[design_recipes.md §C-6]])。screener master シェルを App.jsx の sticky 帯に挿し込まない。
- **`.panel-card / .bs-panel / .surface-card` 関連 CSS** — 発光バグ高リスク ([[glow_elevation_postmortem]] §C-1〜C-4)。screener 新規モジュールにこれらを**新規付与しない** (骨格 5-4 の shadow ゼロ哲学で回避)。既存 compound 4 セットの CSS にも触らない。
- **`frontend/src/components/ScreenerPanel.jsx`** (legacy `/api/screener` gainers) — CustomScreenerPanel とは別物。本再設計の対象外、触らない。
- **`JudgmentDetail` の内部 (detail = Pane3 の心臓部)** — master-detail の detail 面は既存 JudgmentDetail をそのまま再利用。breadcrumb wrap (Workspace.jsx 1065-1114) の scroll 構造も触らない (v165/v166 で scroll lock を 2 回踏んだ領域)。
- `backend/app/visualizer/` / `backend/app/agents/` — LLM 層、本 SPEC は不関与。

---

## 7. multi-review 必要性判定

3 軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法/金商法/hallucination)**: **やや active** — 新規 LLM は無し (§4) だが、master の状態バッジ・件数・empty 文言で **§38 (色で買い断定不可) / §5 (最上級不可)** の static 文言整合が必要。色運用 (cyan を上昇に使わない) と状態バッジの言語が法務 anchor に触れる。
2. **Trust Cliff (LP 訴求 vs 実装)**: **active** — preset/custom トグルの tier gate (Premium 条件が「無料に見えて課金」にならないか)、件数併記の数値整合 ([[feedback_facet_filter_count_integrity]])、demo/非ログイン経路の維持。§3 の 4 項目が全て Trust Cliff。
3. **新 backend endpoint + RLS/認証境界 + cache 設計**: **限定的** — backend は原則不変 (frontend 統合主)。watchlist 一括追加は既存テーブル/RLS 再利用。件数 Open Q2 で backend 拡張する場合のみ部分 active。

**判定: 6 体合議** — 3 軸のうち 1 (LLM 品質) が「やや active」+ 2 (Trust Cliff) が「active」= 2+ が active。加えて **Workspace.jsx 心臓部の構造変更 + 3 入口廃止という blast radius の大きさ**、骨格が effort max Phase gate で起票された重要設計判断であることから、**6 体合議を起動する**。

> 推奨 mixed model 構成 (CLAUDE.md コスト規律): Opus 2-3 体 (金融 verdict §38/§5 + マーケ Trust Cliff/tier gate + Anthropic engineer 構造設計) / Sonnet 3-4 体 (ui-designer + frontend-architect + qa-dogfooder)。

---

## 8. 想定リスク + roll-back plan

**このスプリントが失敗したとき何が壊れるか**:
- **最高リスク = Sprint 1** (master-detail 配線 + modal 廃止)。Workspace.jsx の isScreener 分岐 (982-1156) は home/indices の Pane2/Pane3 配線と同一 return 内に共存するため、編集ミスで **screener 以外のタブ (home/judgment/indices) の 3-pane が壊れる** 可能性。PaneErrorBoundary が catch するが、構造崩壊は boundary を超える。
- WorkspaceScreenerModal 廃止で WorkspaceHeader「スクリーナー」 button が dead link 化する回帰。
- 件数併記 (Sprint 2) のズレで Trust Cliff (chip 件数 ≠ 結果件数)。
- detail 面 (JudgmentDetail) の scroll lock 再発 (v165/v166 で 2 回踏んだ)。breadcrumb wrap を触らない限り発生しないが、master シェル挿入で親 flex/overflow が変わると再発しうる。
- watchlist 一括追加 (Sprint 4) の RLS / 認証境界で silent fail ([[feedback_supabase_grant_bug]]) — 既存関数再利用なら低リスク。

**緊急 roll-back の手順**:
1. **sprint 単位 revert**: 各 sprint で commit 済 (落とし穴1対策)。問題 sprint の commit を `git revert <hash>` → `git push origin main` (Railway auto-deploy ~30s)。`/health` の commit SHA で反映確認。
2. **screener tab 自体の kill switch**: `isPillar2Pane1()` は `?pillar2_pane1=0` で default OFF に倒せる (kill switch、Workspace.jsx 909)。再設計が本番で破綻した場合、URL param で旧 screener (legacy 経路) に即時退避できる。本 SPEC では**この kill switch を壊さない** (Sprint 1 で isScreener 分岐を再設計する際も `isPillar2Pane1()` gate を維持)。
3. **feature flag 2 層 (C-5 確定)**: `?screener_v2` (構造新旧切替) と `isPillar2Pane1()` (tab 可視) を独立 2 層とする。**`screener_v2` はデフォルト ON とし、`?screener_legacy=1` を旧構造 kill switch に反転**する ([[feedback_feature_flag_dual_mode]])。URL param (一時) + localStorage (永続)、URL 優先。昇格判断軸は C-16 (vision-eval pass + Trust Cliff 4 項目 + 行クリック率比較) で数値化済み。Evaluator は両 flag を verify する手順を DoD 化する。
4. 全面失敗時: 該当 commit 群を一括 revert → push。backend/migration は不触のため DB roll-back は不要。

---

## 付録 A: Open Questions → gate 1 確定済み (2026-06-20)

> **gate 1 確定: 以下の全項目が user 方針確定済みとなった (2026-06-20)。**

| # | 論点 | 確定値 |
|---|---|---|
| Q1 | apply 挙動 | **即時反映** (重い custom 交差のみ debounce 300ms) |
| Q2 | 件数計算 / 0件 chip | **frontend 集計 + 0件 chip は薄 grey disabled** (backend 不変) |
| Q3 | preset⇄custom 視覚区切り | **セグメントトグル** (shadow ゼロ + border/tinted-bg で境界) |
| Q4 | 過延伸の見せ方 | **custom cup 観点に独立 chip 常設** (§38 amber 注意、Sprint 3) |
| Q5 | 段階移行方法 | **feature flag 2 層** (`screener_v2` default ON / `?screener_legacy=1` kill switch、C-5) |
| Q6 | カラムプリセット | **デフォルト固定 5 列のみ** (B-1、複数切替は backlog §9 送り) |

詳細根拠は各 Sprint の本文および §8 roll-back plan の feature flag 記述を参照。

---

## 付録 B: backlog (本 SPEC 外・将来実装候補)

> §5 Sprint 3 B-1 で削除したカラムプリセット切替、および gate 1 以降に積み残した拡張を記録する。

- **観点別カラムプリセット切替** (急騰/ファンダ/cup 観点): Sprint 3 から削除。固定 5 列で dogfood し、ユーザーフィードバック確認後に追加を検討する。
- **件数の backend facet count 化**: 現在は frontend 集計。スケールで重くなった場合に `/api/screener/universe-meta` を拡張して解決候補。
- **過延伸 chip の amber アニメーション**: 現在は静的 amber。§38 範囲内で pulse 等を検討候補。
- **screener_v2 default ON 昇格の GA4 判断**: C-16 の行クリック率/watchlist 追加率が旧構造を上回った後に正式昇格。

---

## 改訂履歴

### v2 (2026-06-20): gate1 + 6体合議17必須条件 + user方針2点を反映

- **Open Questions を全確定**: Q1-Q6 を §付録 A の確定テーブルに移動、本文から「要 user 承認」を削除
- **B-1 (カラム簡素化)**: Sprint 3 から観点別カラムプリセット切替を削除し固定 5 列に簡素化、backlog §9 に記載
- **B-2 (Premium 鍵先出し)**: Sprint 4 に「preset でも Custom でも Premium 行は鍵+「詳細はPremium」先出し」を明記
- **C-1 (Trust Cliff Premium 件数非表示)**: Sprint 2 完了判定に Premium chip 件数非表示・鍵ラベルを追加
- **C-2 (件数整合 useMemo 一本化)**: Sprint 2 に useMemo([universe, activeFilters]) 一本算出を明記
- **C-3 (§38 スコア・バッジ・amber)**: Sprint 3 に事実カウント限定・緑禁止・過延伸ラベル規則を追加
- **C-4 (§5 ヒーロー測定軸明示)**: Sprint 4 に「軸なし TOP3 禁止」+ 選定基準 ⓘ 開示を追加
- **C-5 (feature flag 2 層)**: Sprint 5 + §8 に screener_v2 default ON / ?screener_legacy=1 kill switch 反転を明記
- **C-6 (dogfood 既存 script 再利用)**: Sprint 5 に snap-screener-vision.mjs 再利用を明記
- **C-7 (production bundle grep DoD 強化)**: 全 sprint 共通 DoD に L3 検証追加
- **C-8 (大ファイル context-safety)**: 全 sprint 共通に CustomScreenerPanel 1916行等の全文取込禁止を追加
- **C-9 (一気書き換え回避)**: Sprint 1 に ScreenerMaster.jsx 新設 + 全 3 点同時削除 + grep 0件 gate を追加
- **C-10 (ヒット理由バッジ B-1 統合)**: Sprint 3 に条件バッジ列がヒット理由を兼ねる設計を明記
- **C-11 (CSS 基盤先行)**: Sprint 1 冒頭で .screener-master スコープ CSS を確定する手順を追加
- **C-12 (state 管理 workspaceStore 非混入)**: Sprint 1 に useScreenerState hook 分離方針を追加
- **C-13 (testid 命名 preset-/custom- プレフィックス)**: Sprint 2 完了判定にプレフィックス衝突回避を追加
- **C-14 (Chip disabled prop)**: Sprint 2 に Chip.jsx disabled 実装を必須追加
- **C-15 (staleness 最終更新 X 分前)**: Sprint 4 ヒーローに staleness 表示を追加
- **C-16 (昇格ゲート数値化)**: Sprint 4 に GA4/Clarity 比較 event + 昇格判断軸を追記
- **C-17 (preset 時 filter UI 非表示 + トグルラベル)**: Sprint 1 に filter UI 物理非表示と 2-4 字ラベル右寄せを追加
- **§8 roll-back plan 更新**: feature flag を C-5 確定値 (screener_legacy=1) に更新
- **backlog §付録 B 追加**: 削除したカラムプリセット切替等を記録
