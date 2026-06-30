# SPEC 2026-06-29 — guidance Layer A (会社ガイダンス) 有効化

> 目的: スクリーナー「来期2列」で **Layer A = 会社ガイダンス (guidance_source='8k')** を実際に配信し、●ドット (会社ガイダンス由来) を成立させる。
> 由来: user dogfood「来期2列の●ドットが出ない」→ 調査で「pipeline 構築済だが 3 原因で本番 0件」と判明。
> 厳守: §38/景表法 (偽 surprise 禁止) / Hallucination Guard 4層 (抽出=visualizer LLM・aggregator no-LLM) / deploy=PR / main.py は高リスク (最小 diff・PR 分離)。

---

## 現状 (調査 2026-06-29・file:line 根拠)

pipeline は **構築済み**:
```
nightly_guidance (00:10 UTC) → POST /api/cron/guidance-snapshot (main.py:18619)
  → _fetch_sec_guidance_structured (main.py:5943) → SEC EDGAR 8-K EX-99.1
    → sec_guidance.extract_guidance() [Claude Haiku・visualizer層・Hallucination Guard 4層適用済]
    → (無ければ transcript fallback)
  → guidance_history.build_guidance_rows(filed_at=None で呼出) (main.py:18759) ← 原因1
  → guidance_snapshots upsert
nightly_canslim → _build_layer_a_maps (main.py:22515)
  → filed_at null 行は全スキップ (main.py:22537-22540) ← 原因1
  → consensus_snapshots で snapshot_date < filed_at を検索 (PIT) ← 原因2
  → _compute_layer_a_surprise (main.py:22571・純Python・non_usd/bank/GAAP/range ガード)
  → screener_fundamentals.guidance_* upsert (main.py:22314-22458) → universe 配信 (20930)
```

### 本番 0件の root cause (3重)
1. **filed_at=None**: nightly cron が filed_at 無しで保存 → Layer A 判定が null-filed_at 行を全スキップ (main.py:18759 / 22537)。
2. **PIT timeline**: filed_at 以前の consensus_snapshot が必要。consensus_snapshots 蓄積開始 ~2026-06-06 → それ以前の決算は永久に Layer A 不成立 (過去 backfill 不可)。
3. **universe 非対称**: guidance cron ≤200銘柄 (保有∪WL∪直近14日決算) vs screener ~2500 → 大半が対象外。

### 制約・現実
- 修正 3 点とも **main.py 内** (18759 / 22537 / backfill 18862)。25k行・deploy 直結 → 最小 diff・PR 分離。
- **coverage は部分的**: 実装後も ●が出るのは「2026-06-06 以降の決算 × 8-K に数値ガイダンス開示の大型株 (S&P500 の 6-7割)」のみ。AAPL 型 (8-K 数値ガイダンス無し) は skipped が正 ([[sec_guidance_8k_coverage_limit]])。
- LLM 抽出は §Hallucination Guard 準拠済 (BAD-5/6・source_url・NEGATIVE)。aggregator no-LLM 維持。

---

## 段階計画

### Phase 0 — 前提検証 (read-only・main.py 不触・SQL のみ)
- consensus_snapshots の最古 snapshot_date を確認 → PIT 成立可能な決算範囲を確定。
- guidance_snapshots の件数 + filed_at null率を確認。
- **実装後に何銘柄 Layer A が出るか期待値を見積り** (期待値管理: 少数なら投資対効果を再評価)。
- DoD: 「Phase1-2 完了で Layer A が出る銘柄数」の事前見積り数値。

### Phase 1 — filed_at 解決 (main.py:18759 周辺・要 main.py 編集)
- nightly guidance cron の `_one()` で 8-K filed_at を SEC EDGAR から解決し `build_guidance_rows(..., filed_at=...)` に渡す (backfill cron main.py:19021-19044 の同処理を共通化/流用)。
- graceful: filed_at 解決失敗は従来通り None (Layer B fallback)・例外で cron を落とさない。EDGAR rate (semaphore=3) 尊重。
- test: filed_at 解決の unit test (accession→filing date)。
- DoD: nightly 後 guidance_snapshots に filed_at 付き行が入る。

### Phase 2 — backfill 実行 + PIT 検証
- POST /api/cron/guidance-backfill を手動 invoke (2026-06-06 以降の決算銘柄)。
- _build_layer_a_maps が PIT snapshot を見つけ surprise% 算出 → screener_fundamentals に guidance_source='8k'。
- 検証: universe で guidance_source='8k' 件数 > 0 + 本番 snap で ●ドットが出る銘柄を確認 + §38 (偽 surprise 無し) を per-source verify。
- DoD: 来期2列に ●ドット表示 (frontend B1 が自動で dot 説明を復活)。

### Phase 3 — universe カバレッジ (任意・投資対効果次第)
- guidance cron の universe (≤200) 拡張を検討。EDGAR rate + Haiku cost とのトレードオフ。screener 全2500 毎晩は非現実的 → 「直近決算 + 主要銘柄」に絞る現設計は妥当。部分カバレッジ受容。

### Phase 4 — EPS basis 優先抽出の改善 (✅ 実装済 2026-07-01・§38 risk なし・data completeness)
> 2026-07-01 §38 per-source verify (MU/JBL/SNX/BB/CNXC・全件 PASS) で発見。memory [[feedback-sec-guidance-8k-coverage-limit]] 参照。
- **症状**: GAAP・Non-GAAP EPS guidance を両方開示する企業 (MU: GAAP $30.73±1 / NonGAAP $31.00±1、SNX: GAAP $3.40-3.90 / NonGAAP $4.25-4.75) で、`visualizer/sec_guidance.py` の Haiku が **GAAP を抽出** → eps_basis='gaap' → consensus (non-GAAP 基準) と mismatch → `_compute_layer_a_surprise` (main.py ~22781) の GAAP 抑止発動 → EPS null。
- **影響**: surprise を過小に出す方向で §38 安全 (偽 positive なし)。ただし non-GAAP guidance を優先すれば SNX は +約12%・MU ~0% の EPS signal を出せた = **data completeness 取りこぼし**。
- **改善案**: sec_guidance prompt の EPS 抽出ルールを「GAAP・Non-GAAP 両記載時は **Non-GAAP (adjusted) を優先**」へ調整 (consensus が non-GAAP 基準のため basis 一致)。BB/CRWD の non-GAAP 主流前提とも整合。
- **検証**: 両記載銘柄 (MU/SNX) で eps_basis='non_gaap' + EPS surprise 復活を確認。non-GAAP guidance vs non-GAAP consensus は basis 一致で偽 surprise risk なし。
- **優先度**: 低 (現状 §38 安全・取りこぼしのみ)。LP「ガイダンス」訴求 unlock 時にまとめて対応で可。
- **✅ 実装 (2026-07-01)**: `sec_guidance.py` の (a) `_SYSTEM_STATIC` rule 5 に「GAAP・non-GAAP 両記載時は non-GAAP のレンジを優先抽出 (basis=non_gaap)・数値の選択であって計算でない」を追記、(b) q_eps/fy_eps schema の basis description にも同旨を追記。計算ロジック (`_compute_layer_a_surprise` 等) は不変・下流の GAAP 抑止 (basis!="gaap") もそのまま (真の GAAP-only 銘柄では正しく抑止)。Layer A pytest 23 passed。
  - ⚠️ **遡及しない**: prompt 変更は**今後の抽出のみ**に効く。既存 DB 行 (MU/SNX 等) の eps_basis='gaap' は次回 guidance 再抽出 (nightly_guidance / guidance_backfill) まで残る。本番での EPS surprise 復活確認は再抽出後に持ち越し。

---

## frontend B1 (本SPRINT 実装済・即時)
ScreenerGridTable の earnings 凡例を条件化: 表示行に Layer A (guidanceSource='8k') が無ければ ●ドット説明を出さず「来期2列＝来期コンセンサスYoY(会社ガイダンス未取得)」のみ。データ配信されたら自動で dot 説明+ドット復活 (self-healing・honest)。→ 本番 (Layer A=0) で「探させない」誤解を即解消。

## リスク
- main.py 高リスク編集 (Phase1)・PR 分離 + 最小 diff + build/test。
- §38: 偽 surprise (PIT mismatch / range guidance / non-USD) → 既存ガード通過必須・実装後 per-source verify。
- coverage 期待値: 「全銘柄に出る」誤解を避ける (部分的が正)。Phase 0 で件数を事前提示。
- 投資対効果: Phase 0 の見積り次第で Phase 1-2 着手を判断 (少数なら defer も選択肢)。

## DoD (全体)
- [x] B1 frontend (honest 凡例)。
- [x] Phase 0 SQL 見積り (Layer A 期待件数) → de-risk 実測で確定 (下記「de-risk 実測結果」セクション)。
- [x] Phase 1 filed_at 解決 (nightly 行・最小 diff + test) — commit ddf0b570。
- [x] period_end_date ±20 日 tolerance + quarter 優先/annual-only ●抑止 (multi-review QA fix)。
- [x] 実装 gate: multi-review 3 体 (金融 GO / backend GO-fix / QA GO-fix) → 全 medium 対応済 (下記)。
- [ ] Phase 2: merge → deploy → nightly canslim で guidance_source='8k' > 0 + 本番 snap ●確認 + §38 per-source verify。

---

## multi-review verdict (2026-06-29・3 体合議)

| reviewer | model | verdict | 要点 |
|---|---|---|---|
| 金融/§38 | Opus | **GO** | tolerance は同一 FMP source の表記ドリフト救済のみ・隣接四半期 (≥89 日) ≫ 40 日幅で偽 surprise 物理的に不可。FDX -22.5% は verdict 語/色 polarity 無しの中立転記 + 二重 disclaimer で §38/景表法 安全。Hallucination Guard 違反なし (aggregator は docstring のみ)。 |
| backend | Sonnet | GO-with-fixes | critical 無し。medium: ① `.eq` fallback テスト → **追加済**。② 本番 fiscal_date 分布確認 → **SQL 検証済** (誤期 match 無し)。 |
| QA/UX | Sonnet | GO-with-fixes | medium: annual ガイダンスが「来期(quarter)」 列の●になりうる → **(A) quarter 優先/annual-only ●抑止で対応** (user gate)。凡例 self-healing / 件数 SSOT は問題なし。 |

### (A) 採択後の実 Layer A (本番データ・±20 window + quarter 優先で再シミュレート)
**quarter ● 確定 4 銘柄**: BB / JBL / MU / SNX (いずれも quarter ガイダンス vs PIT consensus、 ±20 window が
08-31↔08-28 / 08-28↔08-26 の規約ドリフトを救済し成立)。 FDX は annual-only のため●抑止 (来期≠通期、 honest)。
MEI/WLY は PIT 不成立 (consensus 蓄積前 / 8-K 未解決)。 → 完全一致時代の「確定 1 + coin-flip 2」 から
**確定 4 (正しい quarter ラベル)** へ改善。 forward は決算累積で自然増。

---

## de-risk 実測結果 (2026-06-29・Phase2 先行検証・本番不変更)

> 「Phase2 先行で de-risk」 (既存 backfill cron を手動 invoke して main.py を触る前に投資対効果と落とし穴を暴く) を実施。 read-only SQL + backfill 1 回で、 SPEC 当初計画の**重大な欠陥**を安価に発見した。

### Phase 0 / pre-flight (本番不変更・SQL のみ)
- consensus_snapshots 蓄積開始 = **2026-06-06** (23 日前・872 銘柄)。 これ以前に filing された決算は PIT 永久不成立。
- 既存 guidance_snapshots の filed_at は全て 2026-05-27 以前 → backfill 前は PIT 成立 0 件。
- 真の機会は 2026-06-27 nightly batch (20 銘柄・filed_at 全 null)。 `_build_layer_a_maps` の完全一致 join を SQL 再現 → pre-flight では **4 銘柄堅牢 (BB/FDX/JBL/WLY) + 最大 7 銘柄**と見積り。
- §38 ガード (gaap→EPS 抑止 / range 内→0 丸め / 欠損→Rev only) が実データで正しく発火することを確認。

### 実 backfill 後の再シミュレート (guidance_backfill.yml で 7 銘柄を filed_at 解決後)
max(filed_at) の 1 行 × consensus.fiscal_date 完全一致で判定した実測:

| ticker | max filed_at 行 | PIT 一致 | 判定 |
|---|---|---|---|
| **FDX** | annual 2027-05-31 | ✓ (pit_eps 22.57) | **Layer A 確定** (EPS mid 17.5 → **-22.5%**) |
| **BB** | annual 2027-02-28 ✓ / quarter **2026-08-31** ✗ | 部分 | **coin-flip** (同 filed_at で行選択順依存) |
| **JBL** | annual 2026-08-31 ✓ / quarter 2026-08-31 ✗ | 部分 | **coin-flip** |
| MEI | annual 2027-05-02 | ✗ (filed 06-24 < consensus 開始 06-26) | 不成立 |
| MU | quarter 2026-08-28 | ✗ (同上) | 不成立 |
| SNX | quarter 2026-08-31 | ✗ (同上) | 不成立 |
| WLY | (filed_at 未解決) | ✗ (backfill が 8-K 解決せず) | 不成立 |

→ **確定 1 銘柄 (FDX) + coin-flip 2 銘柄 (BB/JBL)**。 pre-flight の 4-7 から大きく目減り。

### de-risk が暴いた 3 つの根本問題 (SPEC 当初未想定)
1. **backfill の period 解決が consensus とズレる**: backfill の `resolve_next_period_end` (filing 日基準) が quarter を `2026-08-31` と算出するが consensus.fiscal_date は `2026-08-28`。 `_build_layer_a_maps` は**完全一致**要求のため空振り。 ⚠️ 逆に **nightly の元 period (`08-28`) は consensus と一致**していた → **「nightly 行に filed_at を付ける Phase 1」が正しく、 backfill 経路は period regression を持ち込む**。
2. **構造的 PIT 限界**: 直近決算銘柄 (MEI/MU/SNX) は来期 consensus が**報告後**にしか立たない → filed_at 以前の PIT が永久に無い。 「直近報告銘柄ほど Layer A が出にくい」 逆相関は受容するしかない (部分カバレッジが正)。
3. **exact-match の脆さ**: fiscal_date 完全一致は「月末 vs 最終営業日」 (08-31 vs 08-28) の規約差で容易に壊れる → **±N 日 tolerance か quarter-key 正規化が必須** (これも当初未想定)。

### 結論 → 真の修正の設計へ (user gate: A を選択)
- SPEC 当初の Phase1-2 計画は**不十分**。 真の修正 = **(a) nightly 行への filed_at 解決 (nightly の正しい period を保持) + (b) period_end_date ↔ fiscal_date の正規化/tolerance**。 両方 main.py 編集 + multi-review gate。
- backfill 経路 (guidance_backfill.yml) は de-risk 用として温存するが、 **durable な配信経路ではない** (period regression のため)。
- 投資対効果: 現状 yield は低い (確定 1) が、 consensus 履歴が深まる数週間で自然に PIT coverage が拡大する。 (b) 正規化で coin-flip と quarter 不一致を救えば yield は大きく改善見込み。

### 副作用メモ (要 follow-up)
- backfill が period ズレ行 (例 BB quarter 2026-08-31) + 一部重複行を guidance_snapshots に挿入済。 今晩の nightly canslim がこれらを max(filed_at) で拾い、 明朝 FDX (±BB/JBL) の● が自動で出る可能性 (汚染 period だが無害・部分的)。 正規化実装時にクリーンアップ要否を判断する。

---

## 真の修正の設計 (2026-06-29・user gate A で承認・配線調査 file:line 根拠付き)

> de-risk で判明した通り、 SPEC 当初の「backfill で配信」 は period regression を持ち込むため**配信経路として誤り**。 真の修正は **2 つの独立変更** = (1) nightly 行に filed_at を解決 + (2) Layer A join に period tolerance。 両方 main.py 編集 = **multi-review gate 必須**。

### 変更1 — Phase 1: nightly に filed_at を解決 (main.py、 最小 diff)

**配線事実 (調査済)**:
- `build_guidance_rows(ticker, cg, q_end, fy_end, filed_at=None)` は filed_at をオプション受け取り (guidance_history.py:156)。 nightly (main.py:18759) は渡さず None、 backfill (main.py:19044) は `filed_at=filed_at` を明示渡し。
- nightly の `_fetch_sec_guidance_structured`(main.py:5943) は submissions.json から `accessionNumber` を取得 (main.py:6005) するが **`filingDate` を読んでいない** (backfill の `_walk_8k_filings` は main.py:18966-18977 で読む)。 返り値 dict にも filed_at を含まない。

**設計 (最小 diff)**:
1. `_fetch_sec_guidance_structured` (main.py:5943) の submissions 解析に `dates = filings.get("filingDate", [])` を追加し、 採択した 8-K の `filing_date = dates[idx_i]` を取得 → 返り値 dict に `result["_filing_date"] = filing_date` を埋める。
2. nightly `_one()` (main.py:18755-18759) で `filing_date = cg.pop("_filing_date", None)` を取り出し、 `build_guidance_rows(..., filed_at=filing_date)` に渡す。
3. **nightly の period 解決 (`resolve_next_period_end(today_iso)`) は変更しない** — today 基準は consensus.fiscal_date と一致しやすい (de-risk で実証: nightly の 08-28 は consensus と一致、 backfill の 08-31 がズレた)。
4. graceful: filing_date 解決失敗は従来通り None (Layer B fallback)・例外で cron を落とさない。 transcript fallback 経路は filed_at 相当が無い (調査済) ため従来通り None。
5. test: `_fetch_sec_guidance_structured` が filing_date を surface する unit test (extract_guidance 自体は不変 = Hallucination Guard 無影響)。

**DoD**: nightly 後 guidance_snapshots に filed_at 付き行が入り、 period は consensus と一致する (今晩から自動・backfill 不要)。

### 変更2 — period tolerance: Layer A 完全一致 join を緩和 (main.py:22560)

**配線事実 (調査済)**:
- `_build_layer_a_maps` (main.py:22556-22562) の PIT 引きは `.eq("fiscal_date", ped).eq("period_type", ptype).lt("snapshot_date", f)`。 `ped` は guidance 行の period_end_date (resolve_next_period_end 出力)。
- 真因: FMP estimate の `date` (08-28/08-31) が consensus.fiscal_date と規約差でズレうる。 完全一致 `.eq` が空振り → これが BB/JBL の coin-flip と quarter 不一致の正体。

**設計 (最小 diff)**:
- `.eq("fiscal_date", ped)` → `.gte("fiscal_date", ped - W).lte("fiscal_date", ped + W)` (W ≈ 20 日)。 四半期は ~90 日間隔なので ±20 日は隣接四半期を跨がず**誤期 match 不可** = §38 安全。 `.eq("period_type", ptype).lt("snapshot_date", f).order("snapshot_date", desc).limit(1)` は維持。
- 効果: BB/JBL の quarter (08-31) が consensus (08-28) と match → **coin-flip 解消・両者 Layer A 確定**。 規約ドリフト全般に堅牢化。
- 補足 (任意): window 内に複数 fiscal_date があれば ped に最も近い 1 件を Python で選ぶ精緻化も可。 ただし同一四半期の consensus 値はほぼ同じため limit(1) by snapshot_date でも実害なし。
- `_compute_layer_a_surprise` (main.py:22571) / `classify_pit_consensus` は不変 (調査済) = §38 ガード (gaap/non_usd/bank/range) 全維持。

### 受容する限界 (設計判断・ドキュメント化)
- **構造的 PIT 限界**: 直近報告銘柄の来期 consensus は報告後発生 → filed_at 以前の PIT 無し → skipped が正 (MEI/MU/SNX)。 **次の決算サイクルから** その銘柄の来期 consensus に履歴が付き Layer A 成立 → coverage は四半期ごとに自然拡大。
- **transcript fallback / 8-K 未解決 (WLY 型)**: filed_at 無し → Layer B fallback。 fetch 堅牢化は別 scope。

### 修正後 yield 見積り
- 既存データ + tolerance: **FDX + BB + JBL = 3 銘柄確定** (coin-flip 解消)。
- forward: nightly が全新規 8-K に filed_at を付与 + consensus 履歴深化で四半期ごとに増加。

### multi-review gate scope (実装前・3 軸評価)
- **§38 (active・最重要)**: surprise% の per-source verify。 特に **FDX -22.5% は要検証** — FedEx FY 初期ガイダンスは保守的で consensus と乖離しやすい。 これが basis (GAAP vs adjusted) / 保守ガイダンスの artifact なら「-22.5% 下振れ」 の強調が優良誤認 risk。 実装前に FDX 8-K 原典を curl 確認。
- **Trust Cliff (active)**: ●ドットが「会社ガイダンス由来」 と表示される以上、 数値の正当性が brand 信頼に直結。
- **main.py blast radius (active)**: 変更は `_fetch_sec_guidance_structured` + `_one` + `_build_layer_a_maps` の 3 箇所に局所化。 **Phase 1 と tolerance を別 PR** に分離 (各最小 diff + build + test)。
- **Hallucination Guard (low)**: extract_guidance prompt 不変・schema 維持 → LLM 出力品質軸は非 active。
- → 3 軸中 2 軸 (§38/Trust Cliff + blast radius) active = **6 体合議推奨** (但し scope 局所のため 3 体 = 金融 verdict + backend + UI/UX でも可、 実装直前に再判定)。

### 実装ロールアウト順
1. 変更1 (Phase 1 filed_at) を実装 → local build + unit test → PR-A。
2. 変更2 (tolerance) を実装 → build + test → PR-B (or PR-A に 2 commit)。
3. multi-review (§38 + blast radius) → user gate。
4. merge → nightly が filed_at 付与 (今晩〜) + tolerance が既存救済。
5. full canslim trigger (or nightly 待ち) → guidance_source='8k' for FDX/BB/JBL 検証 + 本番 snap で●確認。
6. §38 per-source verify (FDX 原典照合含む)。

### ⚠️ 実装着手時の effort 通知 (CLAUDE.md 3層)
変更2 の §38 設計 (tolerance が偽 surprise を生まない保証) + FDX 原典検証は「重要設計の Phase gate」 に該当。 実装着手前に Claude が effort `max` 引き上げを proactive 通知する。
