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
- [ ] Phase 1 filed_at 解決 (main.py 最小 diff + test) ← **設計見直し中** (backfill 経路でなく nightly 行に filed_at)。
- [ ] period_end_date ↔ consensus.fiscal_date の正規化/tolerance (新規・de-risk で発見した未想定バグ)。
- [ ] Phase 2 backfill + universe で guidance_source='8k' > 0 + snap ●確認 + §38 verify。
- [ ] 実装 gate: main.py 編集前に multi-review (Hallucination Guard + §38 + main.py blast radius)。

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
