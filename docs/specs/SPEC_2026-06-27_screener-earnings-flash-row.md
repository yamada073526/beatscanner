# SPEC 2026-06-27: スクリーナー「決算合格」結果行 → 決算速報ハイブリッド表示

> **正本入力**: [`DECISIONS_2026-06-27_screener-earnings-flash-row.md`](DECISIONS_2026-06-27_screener-earnings-flash-row.md)（§0-12 確定済）
> **正本モックアップ**: [`mockups/screener-result-table-v10.html`](mockups/screener-result-table-v10.html)（詳細7評価列＋簡素モード・file:// で確認可）
> **本 SPEC の役割**: DECISIONS を正本に展開し、§12「planner で詰める残論点」(列並び順/backend 算出式・cache・nightly 結線/tri_verdict/in-line 色/他 preset 列/Sprint 分割・DoD・blast radius・rollback) を技術設計として確定する。
> ⚠️ **新規に要件を発明しない**。確定事項はそのまま採用、§12 のみ planner 判断で確定する。

---

## 1. Context

**user prompt**: 「スクリーナー『決算合格』結果行を、決算速報ハイブリッド表示へ刷新する」

**なぜ今やるか**:
- handover v278: Phase C 完全クローズ。残バックログは「mockup ↔ 実装 全体乖離監査」「screener_v2 default ON 昇格」のみで、新規 screener 強化に着手できる段階。
- 現状 screener_v2 行 (`ScreenerRow.jsx`) は「ロゴ+ティッカー/RS、バッジ+会社名」の 2 段レイアウトで、`earnings_pass`（決算合格）でも実質「RS と合否バッジしか出ない／薄い」。じっちゃま決算速報の核心指標（売上 YoY・EPS YoY・beat/miss・粗利率・FCF・来期ガイダンス）が結果行に無い。
- KB 原典グラウンディング済（DECISIONS §1）: 「三拍子」=EPS・売上・ガイダンスが全て vs コンセンサス beat。重視順 ①売上+YoY ②ガイダンス ③グロスマージン ④EPS(Adj) ⑤セグメント。

**必読 memory anchor（実装者は SPEC 着手前に Read）**:
- [[feedback_foreign_currency_adr_guards]] — ADR 非USD reporter の EPS 偽値（BABA -91%/+489%）抑止。本 SPEC の ADR DoD の SSOT。
- [[feedback_section38_buy_signal_boundary]] — §38「色信号 OK / 買い場断定 NG」。来期=絶対中立の根拠。
- [[reference_earnings_flash_summary]] — surpriseColor vs deltaColor の色 verdict・HeadlineGrid 構造。本 SPEC の色規律は EarningsFlashSummary と 1:1 一貫させる。
- [[feedback_facet_filter_count_integrity]] — facet count == list の整合。件数不変 DoD の根拠。
- [[feedback_pge_loop_pitfalls]] — worktree 非累積／selector 幻覚／ESM top-level return／infinite animation の 4 落とし穴。
- [[feedback_testid_all_render_paths]] — data-testid を loading/error/empty/main 全 state に付与。

**期待される成果（5 原則への貢献）**:
- 原則1（読み手に負担をかけない・2秒理解）: 「決算合格」リストを開いた瞬間、各銘柄の決算の質（売上が伸びてるか・予想を超えたか・利益の質）が見出し1回＋整列で 2 秒で読める。
- 原則4（人力の代替＝北極星）: 「決算速報の確認」という投資家が毎日人力でやっている手間を、合格リストの行そのものに肩代わりさせる。行クリック→Pane3 EarningsFlashSummary で深掘り。

---

## 2. ブランド世界観 (Aman / Ritz-Carlton 級) への適合根拠

5 感情語彙のうち **「洗練さ (sophistication)」** に最も効く。現状の「RS しか出ない薄い行」は、最高級ホテルで言えば「部屋番号だけ書かれた素っ気ない案内板」。本変更は CSS Grid + sticky 見出しで「見出し1回・値整列・欠損—・surpriseColor の控えめな方向 glyph」を実装し、Stripe Sigma / Linear Insights 級の「数値が整然と並ぶデータ体験」を作る。色は方向 glyph のみに限定し（数値本体は中立）、過度な発光を足さないことで「洗練さ」を担保する（[[feedback_minimalism_over_additive]]: 装飾の足し算でなく構造の整列で signal を作る）。`feedback_brand_aspiration.md` の修正禁止 anchor（シアン=ブランド色、方向には使わない）を破壊しない — beat/miss glyph は緑/赤/琥珀の業界色で、シアンは使わない。

---

## 3. Trust Cliff チェックリスト

LP 訴求・既存 UI 文言との整合 3 項目以上:

1. **件数 SSOT 不変**: 「決算合格」のヒット件数（`countPreset` / `PRESET_PREDICATES.earnings_pass`）は本 SPEC で**一切変えない**。表示列の追加のみで、絞り込み述語（`PRESET_PREDICATES` / `itemPasses`）は不触。リストに出る件数と表示銘柄数が完全一致を維持（隠れフィルタ禁止）。
2. **§38「買い推奨ではない」免責バンド**: 「決算合格」リストに beat の緑↑ が並ぶと「全部買い」誤認を生む。リスト上部に免責バンドを必須実装（v10 mockup `.flegend`）: 「↑予想超・↓予想未達・−予想どおり（いずれも**直近決算の過去実績**）。来期ガイダンスは中立表示。**これらは買い推奨ではありません。**」
3. **ADR 偽値非表示**: 「決算合格」に通った非USD reporter（BABA 等）で、現EPS YoY・来期EPS が share-base 混在の偽値（-91% 等）として表示されると、金融リテラシー高 user の即離脱 = Trust Cliff。EPS 由来は「—」抑止し、売上系・粗利率・FCF は比率ゆえ算出可。
4. **決算日の honest 併記**: 各行の決算指標が「いつの決算」に基づくか（`last_report_date`）を併記し、欠損時は「決算日不明」で silent に「直近」を装わない（既存 ScreenerRow §3-4 規律を継承）。
5. **seasonchip 文言は不触**: `SEASON_LABEL.earnings_pass = '対象: 主に直近の決算シーズン'` は handover v278 で「主に」除去を Trust Cliff として見送り済。本 SPEC で文言を触らない。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか**: **No**。

- 全フィールド（`rev_yoy_pct` / `eps_yoy_pct` / `rev_beat` / `eps_beat` / `gross_margin_pct` / `fcf_margin_pct` / `guidance_rev_surprise_pct` / `guidance_eps_surprise_pct` / `tri_verdict`）は **`backend/app/main.py` の数値物理層で Python 計算**（FMP income-statement / earnings_surprises / `_compute_forward_outlook` から算出）。
- **`aggregator/` への LLM SDK import 禁止**（pre-commit Check 3）。本 SPEC は `aggregator/` を触らず `main.py` の既存 nightly compute (`_compute_one`) と universe builder (`_build_universe_payload`) を拡張する。`prompt.py` も不触（pre-commit Check 1）。
- `tri_verdict` は 3 つの beat フラグの **静的 AND 集約**（LLM 不使用）。
- frontend は backend 値を**読むだけ**（再計算禁止）。表示文言（免責バンド・「決算日不明」・glyph の aria-label）は全て**静的文字列 / 静的 dict**。サプライズ verdict 語は既存 `SURPRISE_VERDICT_JP`（Beat/予想並み/Miss）を流用、簡素モードの三拍子 verdict（✓/一部未達/利益警告）は新規静的 dict（後述 §残論点3）。
- frontend sanitize layer（BLOCKLIST_REGEX）: 本 SPEC は LLM 生成文を一切表示しないため sanitize 対象なし（数値と静的 dict のみ）。

→ **結論: LLM 不要、静的 dictionary / Python 計算で完結**。

---

## 5. §12 残論点の確定結論（planner 判断）

### 残論点1: 列の並び順（KB 厳密順 vs grouped）

**確定: grouped（v10 mockup の現行配置）を採用**。識別=左／評価=右に集約し、評価内を「過去実績 → 収益の質 → 将来(§38)→モメンタム」の意味グループ順に並べる。

詳細モード8列の確定順序（左→右）:

| # | 列 | 区分 | 色規律 |
|---|---|---|---|
| 1 | 銘柄（ロゴ＋ティッカー＋決算日＋社名） | 識別 | — |
| 2 | 売上 YoY（%＋vs予想 glyph） | 過去実績 | 数値=中立 deltaColor / glyph=surpriseColor |
| 3 | EPS YoY（%＋vs予想 glyph・Adjusted） | 過去実績 | 同上（ADR 抑止対象） |
| 4 | 粗利率（%） | 収益の質 | 水準=中立（色なし） |
| 5 | FCF率（%） | 収益の質 | 水準=中立（色なし） |
| 6 | 来期売上（コンセンサス比%） | 将来(§38) | **絶対中立**＋将来ゾーン hairline 分離 |
| 7 | 来期EPS（コンセンサス比%） | 将来(§38) | 絶対中立（ADR 非USD は「—」抑止） |
| 8 | RS（数値） | モメンタム | 中立（polarity なし、既存 ScreenerRow と一貫） |

**KB 厳密順（売上→ガイダンス→粗利率→EPS）を採らない理由**: KB 厳密順だと「過去実績(売上)→将来(ガイダンス)→過去実績(粗利率)→過去実績(EPS)」と過去/将来が交互になり、§38 の「将来ゾーンを hairline で視覚分離」が成立しない（将来列が中央に挟まり分離不可能）。grouped は「過去実績まとめ（売上/EPS）→収益の質（粗利率/FCF）→将来ゾーン（来期2列を hairline で右側に隔離）」で§38 分離と両立する。KB の重視順（売上が最重要）は**列の左寄せ（売上を評価列の先頭）**で尊重する。

### 残論点2: backend 各フィールドの算出式・cache key・nightly 結線・partial_failure

**結線方針**: 全フィールドを **nightly scan（`_compute_one`）で算出 → `screener_fundamentals` に upsert → `_build_universe_payload` で universe payload に merge**。これは既存 CAN-SLIM/ファンダ指標と同一経路で、新規エンドポイント追加なし・blast radius 最小。

| フィールド | 算出式 / 出所 | 流用する既存資産 | cache / fetch | ADR | §38/sector |
|---|---|---|---|---|---|
| `rev_yoy_pct` | 直近Q売上 vs 前年同期Q売上の % | `_compute_one` 内で既に fetch 済の `income-statement?period=quarter&limit=4`（粗利率算出 block, main.py:22638）＋前年同期Q追加 fetch（`limit=8` or `limit=5` に拡張 or 既存 `_growth_pct` ロジック流用, main.py:10710/15291） | cache_key `is-q::{ticker}`（既存）を `limit` 拡張で再利用、追加 FMP call 最小化 | 比率=安全（通貨非依存） | 過去実績=色OK |
| `eps_yoy_pct` | **既存 universe フィールド**（main.py:20386）。`screener_fundamentals.eps_yoy_pct`（earnings_surprises 由来） | **ADRガード未適用が問題**。`_guard_eps_currency_mismatch`（main.py:5541）を nightly 算出経路へ適用 | 既存 | **非USD reporter かつ \|surprise\|≥70% → None**（`reportedCurrency` を income-statement 先頭から取得） | 過去実績 |
| `rev_beat` | 直近Q売上 actual vs estimate の 3 値（beat/miss/inline、±3%）。`earnings_surprises` / estimates | EarningsFlashSummary の `_verdict ±3%`（surpriseColor SSOT, EarningsFlashSummary.jsx:171-176）と同一閾値 | nightly | 安全（比率） | surpriseColor |
| `eps_beat` | 直近Q EPS actual vs estimate の 3 値（±3%） | 同上 | nightly | **ADR EPS 抑止時は null**（eps_yoy_pct が None なら eps_beat も null） | surpriseColor |
| `gross_margin_pct` | `grossProfitRatio × 100`（欠落時 `grossProfit/revenue` 補完） | EarningsFlash Phase2 の算出 block（main.py:6981-6992）＋ nightly の ROE/OCF sector guard 変数（main.py:22599 の `_roe_sector_guard`） | `is-q::{ticker}` 流用 | 比率=安全 | **sector-gate**（銀行/REIT/保険/証券/公益→null・`_roe_sector_guard` 流用） |
| `fcf_margin_pct` | **既存 universe フィールド**（main.py:20397, `screener_fundamentals.fcf_margin_pct`）。TTM FCF / TTM revenue × 100 | 既存（nightly で算出済・sector guard / 外貨 ADR guard 適用済 main.py:22601） | 既存 | 既存ADRガード | sector-gate（既存） |
| `guidance_rev_surprise_pct` | 来期売上ガイダンス vs コンセンサスの % | `_compute_forward_outlook`（main.py:7123）の `rev_yoy` / `company_q_rev_yoy_*` ロジック流用 | nightly | 比率=安全 | **絶対中立(§38)** |
| `guidance_eps_surprise_pct` | 来期EPSガイダンス vs コンセンサスの % | `_compute_forward_outlook` の `eps_yoy` | nightly | **非USD reporter → null 抑止**（forward EPS は share-base、`_apply_foreign_usd_to_forward` main.py:5578 の方針一致） | 絶対中立(§38) |
| `tri_verdict` | `rev_beat` & `eps_beat` & guidance beat の集約（後述 残論点3） | 上記3フラグの静的 AND | nightly | — | 静的判定（LLM 不使用） |

**partial_failure 時の挙動**:
- per-field None-preserve（DECISIONS §4）: 各フィールド算出失敗 / データ欠損 / guard 発動 → `None`（捏造禁止）。`_upsert_screener_fundamentals`（main.py:21828）の既存 None-preserve（`if x is not None` のみ payload 追加）＋ optional_cols graceful fallback（migration 未適用カラム除外して再 upsert）パターンを踏襲。
- universe payload では `_uni_round((sf or {}).get(...))` で欠落=測定外 null（既存パターン main.py:20386）。
- frontend は None を「—」で**整列表示**（skip-null でなく整列が誠実、見出しがあるため・DECISIONS §7）。
- **freshness 結線**: 新フィールドは全て `screener_fundamentals` calc_date 由来 → `_build_universe_payload` の `freshness["funda"] = sf_cd` 経路に key 追加（v278 の crow 非表示 blocker = freshness key 欠落の再発を防止、main.py:20227-20235 と同パターン）。

**migration**: `screener_fundamentals` に新カラム（`rev_yoy_pct` / `rev_beat` / `eps_beat` / `gross_margin_pct` / `guidance_rev_surprise_pct` / `guidance_eps_surprise_pct` / `tri_verdict`）を additive 追加（`migrations/*.sql` 新規・既存カラム不触）。deploy 順序非依存: optional_cols fallback で migration 未適用でも既存指標は無傷。

### 残論点3: `tri_verdict` の厳密判定ロジック

**確定**:
```
tri_verdict =
  'ok'   if rev_beat == 'beat' AND eps_beat == 'beat' AND guidance_beat == 'beat'   （三拍子✓）
  'bad'  if (eps_beat == 'miss') OR (利益警告 = EPS YoY が著しく負 等の利益悪化シグナル)  （利益警告）
  'part' それ以外（= 一部未達: beat が一部のみ、または欠損混在）
  None   if rev_beat / eps_beat が両方とも欠損（判定不能 → 簡素モードでバッジ非表示）
```
- `guidance_beat` = `guidance_rev_surprise_pct >= +3%`（コンセンサス比 +3% 以上を beat と判定、surpriseColor 閾値と一貫）。ガイダンス欠損時は guidance を AND から除外し「ok 判定不可」→ `part` 扱い（捏造で ok にしない）。
- **データ欠損時**: `rev_beat` / `eps_beat` の両方が null → `None`（簡素モードで verdict バッジを出さない、honest）。片方のみ欠損 → `part`（一部未達）。
- ADR で `eps_beat` が抑止された場合（null）: EPS 軸を評価不能として `part`（ok にしない・bad にもしない）。
- **LLM 不使用**: 純粋な Python 条件分岐（数値物理層）。簡素モードの表示ラベルは新規静的 dict `TRI_VERDICT_JP = { ok: '三拍子 ✓', part: '一部未達', bad: '利益警告' }`（§38/§5 OK = 分類の事実、判断語でない）。
- ⚠️ 既存 `SURPRISE_VERDICT_JP`（Beat/予想並み/Miss）とは**別 dict**（軸が違う: surprise は単一指標の vs予想、tri は三拍子集約）。混同しない。

### 残論点4: in-line(−) の色（琥珀維持 vs 中立muted）

**確定: surpriseColor の既存 SSOT に 1:1 mirror = 琥珀維持**（EarningsFlashSummary.jsx:175 と一貫）。in-line glyph「−」は `color-mix(in oklab, var(--color-warning) 85%, var(--text-primary))`。
- **コントラスト境界の対策**: in-line 琥珀は WCAG コントラスト境界 → **必ず `aria-label`（「予想どおり」）を付与**し、色だけに依存しない。glyph サイズは `var(--text-caption)`（12px・10px は最小トークン違反 = glyph 診断確定、DECISIONS §5）。
- 「全 UI で同じ in-line 色」を維持することで EarningsFlash（Pane3 深掘り先）との色一貫性を担保（行→Pane3 遷移で色が変わると Trust Cliff）。

### 残論点5: 他 preset の列セット確定値

各 preset の `PRESET_DISPLAY_CONDS` を SSOT とし、**行表示指標 ⊆ DISPLAY_CONDS** を invariant test で機械強制（隠れ表示禁止）。

| preset | 結果行の評価列（確定） | 根拠 |
|---|---|---|
| `earnings_pass` | 売上YoY / EPS YoY / 粗利率 / FCF率 / 来期売上 / 来期EPS / RS（本 SPEC の決算速報列） | DECISIONS §3 正本 |
| `hot_sector` | **earnings_pass と同じ決算速報列**（DECISIONS §8: 決算速報列） | hot_sector も決算文脈 |
| `new_high_break` | 出来高/RS 等の**技術系**（`latest_beat` / `new_high_signal` / `cup` / `volume_surge_pct` / `rs_percentile` / `eps_yoy_pct`） | 既存 `PRESET_DISPLAY_CONDS.new_high_break`（定義準拠・技術系・本 SPEC で不触） |
| `sector_leader` | RS / CF創出力(`ocf_margin_pct`) / ROE / 機関(`inst_holders_qoq_pct`) | 既存 `PRESET_DISPLAY_CONDS.sector_leader`（本 SPEC で不触） |

**確定**: 本 SPEC の決算速報列追加は **`earnings_pass` と `hot_sector` に限定**。`new_high_break` / `sector_leader` の列セットは既存値を保全し、ScreenerRow が `activePreset` に応じて表示列を切り替える（grid-template-columns を data-preset / CSS var で動的化、DECISIONS §7）。決算速報の新フィールドを `earnings_pass` / `hot_sector` の `PRESET_DISPLAY_CONDS` に追加する場合は invariant test の「DISPLAY_CONDS の全 key は有効な cond key かつ CROW_LAYOUT で描画可能」を満たす必要があるため、**新フィールドの表示は ScreenerRow の grid 列として実装し、crow パネル条件(`PRESET_CONDS`/`CROW_LAYOUT`)とは別系統**にする（表示専用 metrics であり絞り込み述語でないため crow には載せない）。この方針で既存 invariant 9 緑を維持しつつ「行表示 ⊆ 該当 preset の表示意図」を新 invariant で別途強制する（後述 §残論点6 Sprint3）。

### 残論点6: Sprint 分割・DoD・blast radius・rollback

→ **§5（スプリント分割）に詳述**。進め方は **backend（nightly populate）→ frontend（table）の順**。理由: frontend が backend 値を読むだけの設計のため、backend が先に universe payload にフィールドを供給していないと frontend の実データ snap が空振りする。ただし Sprint 1（migration+nightly）と Sprint 3（frontend grid 骨格）は依存が薄いため並行着手可（Sprint 3 は mock データで骨格、Sprint 4 で実 backend 値に接続）。

---

## 6. スプリント分割（1 sprint = 1 機能・上限6）

進め方: **backend populate を先行**。同一 file（`main.py` / `CustomScreenerPanel.jsx` / `index.css`）を複数 sprint で触るため **sprint 間 commit 必須**（worktree 非累積回避・[[feedback_pge_loop_pitfalls]] 落とし穴1）。

### Sprint 1: backend — migration + nightly populate（決算速報フィールド算出）
- **目的**: `screener_fundamentals` に決算速報7フィールドを additive 追加し、nightly `_compute_one` で算出・upsert する。
- **触るファイル**:
  - `migrations/*.sql`（新規・additive のみ）: `rev_yoy_pct` / `rev_beat` / `eps_beat` / `gross_margin_pct` / `guidance_rev_surprise_pct` / `guidance_eps_surprise_pct` / `tri_verdict` カラム追加。
  - `backend/app/main.py`: `_compute_one`（22238〜）に算出 block 追加（既存 `is-q::{ticker}` fetch / `_compute_forward_outlook` / EarningsFlash の `_verdict ±3%` を流用、新規 FMP call 最小化）。`_guard_eps_currency_mismatch`（5541）を nightly EPS 算出経路へ適用。`_upsert_screener_fundamentals`（21828）に新フィールド引数＋ optional_cols fallback 追加。
- **呼ぶ既存 skill**: `hallucination-guard`（aggregator LLM import 禁止確認・数値物理層維持）、`fmp-api-retry`（FMP fetch 流用箇所の retry/cache 確認）。
- **完了判定基準（DoD）**:
  - `screener_fundamentals` に新カラム migration 適用済（Supabase で SELECT 可）。
  - nightly scan を 1 ticker で dry-run（本番 universe の小サンプル）して各フィールドが算出される（捏造でなく数値 or honest None）。
  - **ADR 検証**: BABA 等の非USD reporter で `eps_yoy_pct` / `guidance_eps_surprise_pct` が None（抑止）、`rev_yoy_pct` / `gross_margin_pct` / `fcf_margin_pct` / `guidance_rev_surprise_pct` は算出される（比率ゆえ）。
  - **sector-gate 検証**: 銀行/REIT 銘柄で `gross_margin_pct` / `fcf_margin_pct` が None。
  - `_guard_eps_currency_mismatch` の universe 経路適用を grep で結線確認（存在≠機能: call-site が nightly 経路にあること）。
  - aggregator/ に LLM import が無い（pre-commit Check 3 緑）。
- **blast radius**: backend nightly のみ。universe payload はまだ新フィールドを返さない（Sprint 2 で配線）→ frontend 無影響。
- **rollback**: migration は additive のみ（既存カラム不触）→ `_compute_one` の算出 block を `git revert`。新カラムは NULL のまま残置（害なし）。

### Sprint 2: backend — universe payload へ merge + freshness 結線
- **目的**: `_build_universe_payload`（20208）で新7フィールドを `sf_map` から読み出し、items payload に merge。freshness map に key 追加。
- **触るファイル**: `backend/app/main.py`（`_build_universe_payload` の `screener_fundamentals` SELECT カラム拡張＋ items dict 追加＋ `freshness[...]=sf_cd` 追加）。
- **呼ぶ既存 skill**: `hallucination-guard`（per-source namespace / None-preserve 確認）。
- **完了判定基準（DoD）**:
  - `/api/scanner/universe` を Premium auth で curl（または `snap-fetch-universe.mjs` 流用）し、items に新7フィールドが含まれる（v278 環境メモの本番 fetch パターン）。
  - freshness map に新 key が存在し、headline as_of が壊れない（max 計算維持）。
  - ⚠️ **v278 教訓**: freshness key 欠落で CustomScreenerPanel が条件を非表示にする blocker（main.py:20227-20235）を再発させない → freshness key 追加を必ず含める。
  - 新フィールドは migration 未適用環境でも graceful（別 fetch で空 list、既存指標無傷）。
- **blast radius**: universe payload の payload 増加のみ。frontend は新フィールドを読まない（Sprint 4 まで）→ 既存 frontend 無影響。
- **rollback**: items dict の新フィールド追加行を `git revert`。

### Sprint 3: frontend — ScreenerRow を CSS Grid 詳細テーブルへ拡張（骨格・mock データ可）
- **目的**: `ScreenerRow.jsx` を「2段レイアウト」から「CSS Grid + sticky 見出し行」の評価テーブル行へ拡張（screener_v2 のみ・legacy 物理隔離）。詳細/簡素トグル・免責バンド・将来ゾーン hairline 分離・skeleton grid 化を実装。
- **触るファイル**:
  - `frontend/src/features/workspace/ScreenerRow.jsx`（screener_v2 branch のみ・grid セル化・glyph レンダリング・将来ゾーン hairline）。
  - `frontend/src/components/CustomScreenerPanel.jsx`（screener_v2 の render 箇所 2480〜に sticky 見出し行＋免責バンド＋詳細/簡素トグル追加・`PRESET_DISPLAY_CONDS` / grid-template-columns の data-preset 切替）。
  - `frontend/src/index.css`（`.screener-row` スコープに grid・sticky header・将来ゾーン hairline・glyph 色 CSS。**発光系 `.panel-card`/`.bs-panel`/`.surface-card` は不触**・raw hex/shadow/!important 禁止・token のみ）。
- **呼ぶ既存 skill**: `designing-workspace-ui`（grid/sticky header/token 規律）、`mockup-fidelity`（v10 mockup を正本に drift 監査）、`shadcn`（Chip / トグル primitive 流用判断）。
- **完了判定基準（DoD）**:
  - `npm run build` 緑。
  - v10 mockup と grid 列構成・見出し・免責バンド・将来ゾーン分離が fidelity 一致（mock データで `file://dist` snap）。
  - 詳細/簡素トグル動作（default 詳細）。狭幅（~360px Pane2）で簡素 fallback or 横スクロール（@container）。
  - skeleton も grid 化（CLS ゼロ・[[feedback_cls_envelope_pattern]]）。
  - data-testid を loading/error/empty/main 全 render path に付与（[[feedback_testid_all_render_paths]]）。
  - `design-system-check` 緑（raw hex/shadow/!important なし・token 厳守・発光系不触）。
- **blast radius**: screener_v2（default OFF・`?screener_v2=1` dogfood）のみ。legacy 行（一般 user）不触。
- **rollback**: ScreenerRow / CustomScreenerPanel / index.css の該当 commit を `git revert`。screener_v2 OFF で一般 user は元から無影響。

### Sprint 4: frontend — backend 実データ接続 + ADR/sector-gate「—」整列 + 色規律
- **目的**: Sprint 3 の grid に Sprint 2 の universe 実フィールドを接続。surpriseColor/deltaColor 適用・ADR 抑止「—」・sector-gate「—」・glyph aria-label を実装。
- **触るファイル**:
  - `frontend/src/components/CustomScreenerPanel.jsx`（metrics 構築箇所 2493〜で `it.rev_yoy_pct` 等を ScreenerRow に渡す・`activePreset === 'earnings_pass' || 'hot_sector'` で決算速報列）。
  - `frontend/src/features/workspace/ScreenerRow.jsx`（surpriseColor/deltaColor mirror・None→「—」・glyph aria-label・TRI_VERDICT_JP 静的 dict）。
- **呼ぶ既存 skill**: `hallucination-guard`（frontend 再計算禁止＝backend 値を読むのみの確認）、`mockup-fidelity`。
- **完了判定基準（DoD）**:
  - **file://dist + Premium 認証注入 + /api PROD proxy snap**（`snap-screener-v2-dogfood.mjs` パターン）で `earnings_pass` / `hot_sector` 行を計測: 実データで売上YoY/EPS YoY/beat glyph/粗利率/FCF/来期2列/RS が描画。
  - **ADR 銘柄（BABA 等）で現EPS YoY・来期EPS が「—」**（偽値非表示）、売上系/粗利率/FCF は算出値表示。
  - **sector-gate 銘柄（銀行/REIT）で粗利率/FCF が「—」**。
  - null 率を計測し、「—」整列が誠実（見出しと列ズレなし）。
  - 色規律: 数値本体=中立 deltaColor、glyph のみ surpriseColor（緑↑/赤↓/琥珀−）、来期2列=絶対中立、粗利率/FCF=中立（色なし）。glyph aria-label 付与（色弱/SR）。
  - frontend に再計算ロジックが無い（backend 値を読むだけ）を grep で確認。
- **blast radius**: screener_v2 の earnings_pass / hot_sector 表示のみ。
- **rollback**: 該当 commit `git revert`。Sprint 3 の grid 骨格（mock データ）に戻る。

### Sprint 5: frontend — invariant test 拡張 + 件数不変検証 + 別件 quick fix
- **目的**: 「行表示指標 ⊆ DISPLAY_CONDS」の機械 invariant 追加（既存 9 + 行表示 invariant）。件数 count==list 不変を再確認。別件 quick fix（アドバンスドトグルアニメ）を同梱。
- **触るファイル**:
  - `frontend/src/components/CustomScreenerPanel.invariants.test.js`（行表示 invariant 追加・既存 9 維持）。
  - `frontend/src/components/CustomScreenerPanel.jsx`（行表示指標の SSOT 定数 `PRESET_ROW_METRICS` 等を export・test から import）。
  - `frontend/src/index.css`（**別件 quick fix**: `.screener-adv-toggle__sw` の切替アニメ＝`.screener-refine-toggle` 系と同等の transition を付与。13950〜の `.screener-adv-toggle__sw::after` に transition 追加。**件数 SSOT 不触**）。
- **呼ぶ既存 skill**: `screener`（件数 SSOT 規律確認）。
- **完了判定基準（DoD）**:
  - `npm run test:unit` 緑（既存 invariant 9 + 新 行表示 invariant）。
  - 行表示 invariant: 各 preset の結果行に出る決算速報指標 ⊆ 当該 preset の表示意図（隠れ表示禁止を機械強制）。
  - `PRESET_PREDICATES` 不触を git diff で確認 → count==list 維持（本番 universe snapshot を fixture に `countPreset` で earnings_pass 件数が baseline と一致・v278 の実測パターン）。
  - 別件: アドバンスドトグルの切替アニメが非アドバンスド同等（`file://dist` snap で transition 確認）。
- **blast radius**: test ＋ CSS transition のみ（描画ロジック・件数不触）。
- **rollback**: 該当 commit `git revert`。

> **Sprint 上限6 のうち5使用**。Sprint 6 はバッファ（実装中に判明した狭幅 fallback の追補 / mockup drift 修正用に温存）。最初から6に割らず、必要時のみ起票。

---

## 7. 触ってはいけないファイル一覧（Generator への禁止指示）

| ファイル / 領域 | 本 SPEC での扱い |
|---|---|
| `backend/app/visualizer/prompt.py`（pre-commit Check 1） | **触らない**（本 SPEC は LLM 不使用） |
| `backend/app/aggregator/*.py` への LLM SDK import（pre-commit Check 3） | **触らない**（数値物理層は `main.py` で完結） |
| `backend/app/visualizer/prompt_negatives.py`（法務 anchor） | **触らない** |
| `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX | **触らない**（typo 修正以外） |
| `.claude/launch.json`（人間用） | **触らない** |
| `handover_*.md`（read-only） | **触らない**（参照のみ） |
| `railway.toml` cron 定義 | **触らない**（既存 nightly_scan.yml に step を足さない・既存 `_compute_one` 内に algorithm を足すだけ） |
| `frontend/src/App.jsx` の sticky 検索 div（8 回安定領域・design_recipes §C-6） | **触らない** |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS（発光バグ高リスク・design_recipes §C-1〜C-4） | **触らない**（新規 `.screener-row` grid は別スコープ・発光を足さない・`contain:paint`/`overflow:hidden`/入れ子 surface-card 禁止） |
| `.tier-m-glow`（Pane3 共有・handover v278 danger） | **触らない** |
| **件数 SSOT**: `PRESET_PREDICATES` / `itemPasses` / `buildActiveGrades` / `topSectorsByRs` / `countPreset` / `buildSectorSummary`（変更=承認 gated） | **触らない**（表示列追加のみ・述語不触で count==list 維持） |
| `SEASON_LABEL`（v278 で「主に」除去見送り確定） | **触らない** |
| legacy screener 行（screenerV2=false branch・A-1 物理隔離） | **触らない**（screener_v2 branch のみ拡張） |
| `migrations/*.sql` 既存ファイル | **触らない**（新規 additive migration のみ作成） |
| backdrop-filter のフェード境界（CSS で消さない・1px border で区切る） | **触らない** |

---

## 8. multi-review 必要性判定

3 軸を本 SPEC に適用:

1. **LLM 出力品質（景表法/金商法/hallucination）**: **active** — §38（来期=絶対中立）/ 過去 beat/miss の色規律 / 免責バンド / ADR 偽値抑止。LLM は不使用だが、数値の色付け・将来予測の中立化が §38/§5 直結。
2. **Trust Cliff（LP 訴求 vs 実装）**: **active** — 「決算合格」リストに緑↑が並ぶ「全部買い」誤認 / ADR 偽値 / 件数 count==list 整合。
3. **新 backend endpoint + RLS/認証境界 + cache 設計**: **partial** — 新エンドポイントは無いが、`screener_fundamentals` migration（DB schema）+ nightly scan 結線 + universe payload cache（blast radius は中程度）。RLS は既存 `screener_fundamentals` を継承（新規境界なし）。

→ **3 軸のうち 2 が full active（+1 partial）= 6 体合議推奨**。

**判定: 計画レビューは 6 体合議**（軸: §38/ADR/Trust Cliff/新 backend schema/レイアウト）。DECISIONS §2 の「計画レビュー(6体)→user 承認→実装（実装段階レビュー不要）」方針と整合。推奨構成: 金融 verdict + Anthropic engineer + マーケター（Opus）／ ui-designer + frontend-architect + qa-dogfooder（Sonnet）の mixed model 6 体。

---

## 9. 想定リスク + roll-back plan

| リスク | 影響 | roll-back |
|---|---|---|
| nightly `_compute_one` の追加 fetch で FMP rate limit / nightly 時間超過 | nightly scan 失敗 / 502（[[nightly_502_gateway_persist]]: 502 でも backend 完走の可能性、DB freshness で健全性判定） | 既存 `is-q::{ticker}` cache 流用で追加 call 最小化。問題時は算出 block を revert（migration カラムは NULL 残置・害なし） |
| freshness key 欠落で CustomScreenerPanel が決算速報列を silent 非表示 | 実装したのに表示されない（v278 で実際に発生した blocker） | Sprint 2 DoD で freshness key 結線を必須確認。欠落時は freshness 追加行を hotfix |
| ADR ガードの universe 経路適用漏れで BABA 偽EPS が「決算合格」に表示 | 金融リテラシー高 user の即離脱（Trust Cliff） | Sprint 1/4 DoD で BABA 実データ snap 検証を必須化。漏れ検出時は `_guard_eps_currency_mismatch` call-site を追加 |
| grid 列追加で `.screener-row` CSS が発光系 / sticky 検索バーに波及 | 発光バグ再発（v54-v59 6セッション溶けた領域） | `.screener-row` は独立スコープ・発光不触・`design-system-check` 緑を Sprint 3 DoD に。波及時は CSS commit revert |
| 件数 SSOT に意図せず干渉（`PRESET_PREDICATES` drift） | count≠list（Trust Cliff・承認 gated 違反） | Sprint 5 で `PRESET_PREDICATES` 不触を git diff 確認＋本番 universe fixture で件数 baseline 一致検証 |
| 並行セッション commit 巻き込み（[[feedback_parallel_session_commit_entanglement]]） | 意図せぬ変更が deploy | `git add` は明示 path のみ。deploy は PR 経由（main 直 push 禁止・v278 danger zone） |

**緊急 roll-back 手順**:
1. 表示の問題（frontend）: 該当 frontend commit を `git revert` → PR → Railway auto-deploy。screener_v2 は default OFF のため一般 user は元から無影響。
2. backend の問題（nightly / payload）: `_compute_one` / `_build_universe_payload` の追加 block を `git revert`。migration カラムは additive のため残置（NULL）で害なし。
3. 全面停止が必要な場合: `?screener_v2=1` flag を立てなければ legacy 行に戻る（A-1 物理隔離）。

---

## 10. 検証規律（ground truth・実装時）

- `npm run build`（構文）/ `npm run test:unit`（invariant 9 + 行表示 invariant 緑）/ `design-system-check`（token/発光規律）。
- 実データ snap: **file://dist + Premium 認証注入 + /api PROD proxy**（`snap-screener-v2-dogfood.mjs` パターン・visual harness exception 4 条件遵守: headless / 60s timeout / `.visual/` 出力 / HTTP server なし）。各 preset 行で null 率・ADR 偽EPS 非表示・「—」整列・glyph 可読を計測。
- **snap-*.mjs の落とし穴遵守**（[[feedback_pge_loop_pitfalls]] / pge-loop-debugger）: ESM **top-level return 禁止**（即時実行 async 関数で wrap）、animation 検証は **try/catch** で握る（infinite animation で hang しない）、selector は **data-testid 主**（class 名 selector 幻覚を避ける）、`setTimeout(...process.exit(2))` で hard timeout + `finally { await browser.close() }`。
- mockup-fidelity: v10 mockup を正本に drift 監査（意図的 deviation は保全・事故 drift のみ mockup 値へ）。
- backend ADR/sector-gate 検証: BABA（非USD）/ 銀行 / REIT の実データで抑止が効くことを `/api/scanner/universe` curl で裏取り（v278 の本番 fetch パターン: node `fetch` で到達・auth=`frontend/.env` の DOGFOOD_TEST_* + VITE_SUPABASE_*）。

---

## 付録: 既存資産マップ（実装者の grep 起点）

| 資産 | 場所 | 流用方法 |
|---|---|---|
| `_build_universe_payload` | main.py:20208 | items dict / freshness に新7フィールド追加 |
| `_fetch_screener_base_universe` | main.py:20071 | 不触（base universe） |
| `_compute_one`（nightly 算出） | main.py:22238 | 算出 block 追加（既存 `is-q::{ticker}` fetch 流用） |
| `_upsert_screener_fundamentals` | main.py:21828 | 新フィールド引数＋ optional_cols fallback |
| `_guard_eps_currency_mismatch` | main.py:5541 | nightly EPS 算出経路へ適用（非USD\|surprise\|≥70%→None） |
| `_compute_forward_outlook` | main.py:7123 | 来期売上/EPS ガイダンス比% 算出 |
| 粗利率算出（grossProfitRatio×100） | main.py:6981 / 22638 | gross_margin_pct 算出 |
| `fcf_margin_pct`（既存 universe フィールド） | main.py:20397 / 22638 | そのまま読む |
| `_roe_sector_guard`（sector-gate） | main.py:22599 周辺 | 銀行/REIT/保険/証券/公益→null |
| surpriseColor / deltaColor SSOT | EarningsFlashSummary.jsx:161-176 | frontend 色規律 1:1 mirror（±3% / pct>0） |
| `SURPRISE_VERDICT_JP` | earningsFlashTemplates.js:43 | Beat/予想並み/Miss（単一指標 vs予想）|
| `ScreenerRow` primitive | ScreenerRow.jsx | screener_v2 branch を grid 化 |
| `PRESET_DISPLAY_CONDS` / `PRESET_PREDICATES` | CustomScreenerPanel.jsx:406 / 615 | 表示=DISPLAY 拡張・PREDICATES 不触 |
| invariant test | CustomScreenerPanel.invariants.test.js | 行表示 invariant 追加 |
| screener_v2 render 箇所 | CustomScreenerPanel.jsx:2480-2530 | grid 見出し＋免責バンド＋トグル |
| アドバンスドトグル CSS | index.css:13931-13975 | 別件: `__sw` 切替アニメ追加 |
| 本番 universe fetch harness | scripts/snap-fetch-universe.mjs | Premium auth で `/api/scanner/universe` |

---

## 11. 6体合議 must-fix 反映（2026-06-27・全6体 条件付賛成・反対0）

実装前に本節を SPEC 本文の上書きとして適用する。各 Sprint の DoD に織り込む。

### 11-A. 金融（法令・精度・最優先）
- **M1 tri_verdict 精緻化**: `'bad' = (eps_beat=='miss') のみ`（YoY を畳み込まない＝surprise/delta 軸分離を維持）。`'ok' = rev&eps&guidance 全 beat`／`'part' = それ以外`／`None = rev_beat・eps_beat 両欠損`。**ラベル「利益警告」→「予想未達」**（profit warning は会社の下方修正発表を指す金融用語・誤用は§5 Trust Cliff）。`TRI_VERDICT_JP = { ok:'三拍子 ✓', part:'一部未達', bad:'予想未達' }`。
- **M2 EPS basis sanity bound（Refinitiv 2017 級防御・最重要）**: beat/miss は actual/estimate の **EPS basis（GAAP vs Adjusted/継続事業ベース）一致が前提**である旨を明記。**US 企業でも `非ADR かつ |eps_surprise|≥70% かつ 符号反転 → eps_beat=null`**（ADR ガードの非ADR版 sanity bound）。Adjusted EPS 担保を Sprint1 DoD に。
- **M3 ADR 抑止条件の正確化**: EPS 系抑止は **「非USD reporter かつ |surprise|≥70%」**（`_guard_eps_currency_mismatch` 本来条件）。**「非USD 一律抑止」ではない**（TSM/ASML 等の正常 surprise を over-suppress しない）。SPEC §3/DoD の「非USD 一律」表現を本条件へ修正。eps_yoy_pct/eps_beat/guidance_eps_surprise を同条件で抑止。
- **S1 §38 完全防御**: 免責に「来期数値は**会社ガイダンス／アナリスト予想の転記**であり、当社の予測・推奨ではありません」を明記。
- **S5 ✓希少性注記**: 簡素モード凡例に「三拍子✓ = 売上・EPS・ガイダンス全て予想超。ガイダンス未開示は—」を併記。

### 11-B. backend 実装（開発・設計・Anthropic）
- **`_compute_one` tuple arity（実装最大の詰まり所）**: return が19要素固定・全 early-return（`earnings_surprises_failed` 等12+箇所）に影響。**新フィールド追加時は全 return を grep で機械カウントして漏れなく更新**（Sprint1 DoD）。
- **`is-q::{ticker}` cache key 衝突**: rev_yoy_pct で前年同期Q必要（直近Q+前年同期=5Q）。**cache key を limit 別に分離（`is-q::5::{ticker}`）or nightly で limit=5 統一**（既存 TTM 4Q 計算は先頭4要素流用）。Sprint1 DoD。
- **LLM import 物理確認**: 新規算出 block（main.py、aggregator 外）に `grep -nE 'anthropic|claude' = 0` を Sprint1 DoD に追加（数値物理層維持）。
- **共有 paged SELECT 混入ガード（[[feedback_paged_select_missing_column_trap]]）**: screener_fundamentals SELECT 拡張が共有 `_fetch_all_rows_paged` か専用 fetch かを Sprint2 で確認。**新カラムは別 fetch 分離**（共有に migration 前カラム混入で全行 silent 消失の罠）。
- **ScreenerPane HeroSection への grid 漏れ防止**: ScreenerRow は ScreenerPane HeroSection（preset hero）でも使用。**grid 列は CustomScreenerPanel の screener_v2 行のみに適用、HeroSection 行は旧2段維持**を CSS スコープ（data-preset / コンテナ限定）で保証（Sprint3 DoD）。
- **optional_cols fallback**: 実在確認済（main.py:21959-21982・既存3指標で実証）。新7フィールド名を list 追記のみ。
- **Sprint2 で ADR backend 裏取り**: BABA が `eps_yoy_pct:null` を返すことを `/api/scanner/universe` curl で backend 単体確認（Sprint4 まで待たない）。

### 11-C. frontend（UI・マーケ）
- **免責バンド凡例の「−」に amber 付与**: 凡例の ↑↓ は緑/赤だが「−」が無色 → 行表示（琥珀）と不一致＝Trust Cliff。凡例「−」に `var(--color-warning)` を付ける。
- **狭幅(~360px Pane2) は横スクロールでなく簡素モード強制 fallback**（横スクロール=原則1違反・UI+マーケ consensus）。`@container` で幅閾値→COLS_SIMPLE 自動切替。Sprint3 DoD に **snap で狭幅自動切替を検証**を追記（mockup に narrow state が無いため）。`@container` 前提に Pane2 wrapper の `container-type` 設定確認。
- **「合格＝全勝」視覚誤認防止**: mockup の現実的 verdict 分布（ok/part/bad 混在）を実装データでも死守。免責バンドは sticky 位置（金融 S2）。
- **should**: 来期ゾーン `.cell.fut .v` を `--text-secondary`→`--text-muted`（将来=控えめ）／「収益の質」(粗利率/FCF)group 左に hairline で意味 group 分節。
- **glyph aria-label 必須**（title だけでは SR 不確実）。in-line 琥珀は `color-mix` muted + aria。

### 11-D. 検証規律（Anthropic）
- **各 sprint 受領時に main が独立裏取り**（`git worktree list` 実在・`git diff --stat`・build/test を **main 自身が再実行**）を §10 に明記（report≠事実・[[feedback_pge_loop_pitfalls]] 落とし穴6・捏造報告防止）。
- **DECISIONS↔SPEC dict 名統一**: 簡素モード verdict バッジ = **`TRI_VERDICT_JP`**（DECISIONS §3 の `SURPRISE_VERDICT_JP` 表記は誤り・軸が違う）。

### 11-E. 獲得（マーケ・enhancement → 採否は実装時 user 判断）
- **screener_v2 default ON 昇格の null率ゲート**: dogfood snap で earnings_pass 行の決算速報フィールド null率 < 閾値 で昇格候補（dogfood 機能で終わらせず北極星=配信へ繋ぐ定量ゲート）。
- **初回訪問のみ簡素 default → localStorage で詳細昇格**: 「使うほどリッチ」体験。獲得施策として Sprint 化を検討（採否 user 判断）。
- tri_verdict は将来 nightly push の「件名」資産（配信布石）。

> **総括**: 6体全員 条件付賛成・反対0・実装ブロッカー無し。must-fix（11-A 金融3点 / 11-B backend / 11-C frontend / 11-D 検証）を各 Sprint DoD に織り込めば実装 gate 開放可。設計の作り直しは不要。

---

## 13. 実装時確定（2026-06-27・Sprint 1 着手時・user gate 承認済）

実装着手時のデータソース調査で、SPEC §5 残論点2 の前提（来期2列＝「会社ガイダンス vs コンセンサス%」を `_compute_forward_outlook` 流用で算出）が **universe 規模で実現不可**と判明。user 判断（じっちゃまKB 参照）で来期2列の意味を確定し直した。本節が来期2列・列名・tri_verdict の SSOT（§5/§11 の `guidance_*` 表記を上書き）。

### 13-A. 判明した制約（ground truth）
- `guidance_snapshots`（会社ガイダンス・SEC 8-K + Claude 抽出）= **5銘柄のみ**（pilot 止まり）。universe を埋めるには Claude API × 数千銘柄/夜＝月 cost 目標破壊で不可。
- `consensus_snapshots`（アナリスト予想時系列）= 768銘柄・新鮮だが、screener universe **2,494銘柄**の **約25%（617銘柄）**しかカバーせず、universe 列の data source 単独では不適。
- → 来期コンセンサスは **per-ticker で analyst-estimates を nightly fetch（+1 FMP call/銘柄）**して全 universe をカバー。`rev_beat` の revenue estimate にこの call は必須で、同 call で来期コンセンサス（次Q売上/EPS）も取得 → **来期2列は相乗りで追加コストゼロ**。

### 13-B. 来期2列の意味（じっちゃまKB 原典準拠）
- KB のガイダンス観は2層: **Layer A**（三拍子③＝会社ガイダンス vs コンセンサス・取得不可）/ **Layer B**（銘柄選定条件＝「来年のコンセンサス予想が今年よりくっきりと高い株でなければダメ」markethack ch04・「成長率が落ちてきてる株は上がんない」2026-03-14 live）。
- → 来期2列 = **来期（次Q）コンセンサスの成長率（YoY%）**（Layer B 準拠・§38 中立な「予想の転記」）。
- 列名は honest 化: `guidance_rev_surprise_pct` → **`next_q_rev_yoy_pct`** / `guidance_eps_surprise_pct` → **`next_q_eps_yoy_pct`**（「ガイダンス vs consensus surprise」と誤認させない）。
- **§38**: KB調査は「加速=緑/減速=赤」の色付けを推奨したが、BeatScanner §38（金商法・将来は断定回避）が上書きし **来期2列＝絶対中立（色なし）**を厳守（KB の色提案のみ不採用）。
- ADR: `next_q_eps_yoy_pct` は forward EPS が share-base 偽値リスクのため **非USD reporter → NULL 抑止**（`next_q_rev_yoy_pct` は比率ゆえ算出）。

### 13-C. tri_verdict 第3要素（Layer B・user 承認）
- KB三拍子③（ガイダンス vs コンセンサス）取得不可のため、第3要素を **Layer B「来期コンセンサスが今期比くっきり高い」**で代替（user 承認）。
- `tri_verdict = ok`  : `rev_beat=='beat'` AND `eps_beat=='beat'` AND （来期コンセンサスがくっきり高い＝`next_q_rev_yoy_pct >= TRI_FWD_GROWTH_MIN_PCT`）
- `tri_verdict = bad` : `eps_beat=='miss'`（ラベル「予想未達」・§11-A M1 維持）
- `tri_verdict = part`: それ以外
- `tri_verdict = None`: `rev_beat` と `eps_beat` の両方が NULL（判定不能）
- 「くっきり高い」閾値 `TRI_FWD_GROWTH_MIN_PCT` は名前付き定数（初期値は保守的に設定し完了報告で user 調整可）。
- **簡素モード凡例（§11-A S5 を更新）**: 「三拍子✓ = 売上・EPS が予想超、かつ来期コンセンサスが今期比くっきり高い（会社ガイダンスは universe 規模で取得不可のため来期コンセンサス成長で代替）」と honest に明記。

### 13-D. 確定した新7フィールド（migration: `docs/migrations/2026-06-27_screener_fundamentals_earnings_flash.sql`）
`rev_yoy_pct`(num) / `rev_beat`(text) / `eps_beat`(text) / `gross_margin_pct`(num) / `next_q_rev_yoy_pct`(num) / `next_q_eps_yoy_pct`(num) / `tri_verdict`(text)。全て additive・None-preserve・optional_cols fallback 対象。

---

## 14. Sprint 3 実装確定（2026-06-27・着手前 6体合議 + 抜本デザイン再設計・user gate 承認済）

Sprint 3 着手前ゲートとして 6体合議（§11 を再走・全6体 条件付賛成・反対0）を実施し、UI が「データ表に堕ちている」指摘を受けて**抜本デザイン再設計**を行った。本節が **Sprint 3 frontend 実装の SSOT**（§5/§7 の frontend 表現・§13-B の来期2列 *表示意図* を上書き。backend フィールド §13-D は不変）。

### 14-A. デザイン視覚正本 = mockup v12「決算の通信簿」
- **正本**: [`docs/specs/mockups/screener-result-table-v12.html`](mockups/screener-result-table-v12.html)（本番トークンで描画・file:// 確認可）。
- **v10 は破棄**（§13 pivot 前の旧版・SUPERSEDED 注記済）。v11（整列のみの中間案）はドラフト止まりで**未保存**（ディスクに無い）。mockup-fidelity の drift 監査は **v12 のみを正本**とする。
- **設計哲学（"数値の一覧" → "決算の通信簿"）**: ① **verdict を行の主役に昇格**（左に verdict pip）。② **2段タイポ階層**（売上/EPS YoY=主・大／粗利/FCF/来期=副・小 muted）。③ **beat/miss = 結果チップ**（数値＋淡 tint pill・surpriseColor）。④ **将来ゾーン = ガラスの仕切り**（背景を一段沈め `--bg-future` + gold hairline で §38 中立を素材表現）。⑤ **余白＝贅沢**（行高に呼吸・罫線細く・mono 端正）。⑥ **生きた surface**（到着 stagger 45ms×n + 上質 hover）。
- **発光禁止領域（`.panel-card`/`.bs-panel`/`.surface-card`）は一切不触**。品格は影・余白・gold 一貫・タイポ階層・stagger のみで出す（v54-v59 溶融教訓）。

### 14-B. verdict pip カラーシステム（user 調整反映・最重要識別）
- `ok`(三拍子✓) = **gold**（`--gold-mid` / glyph `✓`）／ `part`(一部未達) = **中立スレート**（`#c3ccd9` 系・glyph `◐`）／ `bad`(予想未達) = **赤**（`--color-loss` / glyph `✕`）／ `None` = faint（glyph `–`）。
- **part を amber から中立スレートへ変更**（user 指摘「gold と amber が似て区別しづらい」）。これにより gold/slate/red の3色が明確分離し、**投資色ルール（amber=緊急・警告に温存）にも適合**（一部未達は警告でなく "どちらでもない"）。
- **amber（`--color-warning`）の残置先**: in-line「−」結果チップ（予想どおり）と凡例「−」のみ。verdict tier では使わない。
- gold は **✓ verdict にのみ一貫使用**（gold continuity = signal。✓行に gold 左レール + 極淡 gold wash・RS 85+ も gold）。

### 14-C. 来期2列 = 会社ガイダンス vs コンセンサス（ハイブリッド・§13-B 表示意図を改訂）
- **表示意味を Layer B（来期コンセンサスYoY）→ Layer A（会社ガイダンス vs アナリスト・コンセンサス比＝三拍子③の本命）へ変更**（user 指示・2026-06-27）。列見出し「**来期売上 ガイダンス比 / 来期EPS ガイダンス比**」。
- **★依存 = 残タスク4**（guidance-snapshot cron を「保有∪WL」→「直近決算報告銘柄（イベント駆動）」へ拡張し universe 規模の会社ガイダンスを蓄積）。それまで `guidance_snapshots` は約5銘柄のみ。
- **ハイブリッド表示ロジック**（frontend 読み順・backend 再計算しない）:
  1. 会社ガイダンスあり（残タスク4 後 `guidance_*_surprise_pct`）→ **ガイダンス比%** を表示（本命・Layer A）。
  2. なし＆来期コンセンサスあり（現 LIVE `next_q_*_yoy_pct`）→ **来期コンセンサスYoY** で fallback（Layer B・暫定）。
  3. 両方なし／ADR EPS 抑止 → **「—」** honest。
- **§38 厳守**: Layer A/B いずれも **絶対中立（色なし）**・将来ゾーン分離。免責「来期2列は会社ガイダンス／アナリスト予想の転記であり当社の予測・推奨でない」。
- **tri_verdict 第3要素**: 残タスク4 完了までは §13-C のまま（`next_q_rev_yoy_pct >= TRI_FWD_GROWTH_MIN_PCT` proxy）。**残タスク4 完了後に Layer A（会社ガイダンス beat）へ昇格**（別 gate）。

### 14-D. frontend 実装方式（6体合議 must-fix・着手前確定）
- **grid 列 SSOT 化**: `grid-template-columns` を **CSS 変数 `--screener-cols`** として header/row/skeleton の **共通祖先に一度だけ定義**し各々は参照のみ（v10/v11 の header/row 二重 inline は別 formatting context で整列破綻）。preset×mode 切替は `data-mode`/`data-preset` 属性 + CSS で `--screener-cols` を出し分け（inline style 撒き散らし回避・CLS ゼロ）。
- **sticky 見出しの overflow 祖先**: `screener-result-list` の `overflow-hidden` の**外**に出し、実スクロール祖先 **`screener-master__content`（overflowY:auto）を `top:0` 基準**に貼る（mockup の `.list{overflow:auto}` は app に存在しない・内側 overflow-hidden は sticky を無効化）。
- **@container 狭幅 fallback**: 幅専用ラッパに **`container-type: inline-size` を明示追加**（未宣言だと狭幅自動切替が無音で no-op）。`@container` で閾値 → COLS_SIMPLE 強制（横スクロール=原則1違反）。閾値は名前付き定数 `SCREENER_NARROW_BREAKPOINT`。
- **grid を screener_v2 variant にスコープ閉じ**: `.screener-row` 本体でなく **screener_v2 専用 className/`data-variant="grid"`** に限定（ScreenerRow は ScreenerPane HeroSection でも共有＝本体 grid 化で HeroSection 崩れ）。
- **skeleton も `--screener-cols` grid に載せ替え**（CLS ゼロ）。mock データは `?mock=1` フラグ + 実 payload と同型に閉じ、Sprint4 差し替えを 1 行に。`snap-fetch-universe.mjs` で同型性裏取り。

### 14-E. §38・a11y・testid（Sprint3 で担保）
- **glyph/pip/badge に `aria-label`**（Sprint3 の構造実装段階で・`title` だけでは SR 不確実）。色だけに依存しない（色弱）。
- **`tri_verdict===null` の null guard**（`vb[tri]` 直接参照禁止・未知キーは「判定中」中立バッジへ）。
- **免責バンド**: font-size 12px + `--text-secondary` + `role="note"` + 常時可視（景表法 打ち消し表示の視認性・近接性）。凡例「−」に amber。
- **data-testid を新設要素全てに**: sticky 見出し / 免責バンド / 詳細簡素トグル / empty / skeleton-grid。loading/error/empty は mock で意図発火させ snap 検証（[[feedback_testid_all_render_paths]]）。

### 14-F. Sprint 構成（再設計後も骨格不変）
- **Sprint3=構造+スタイル(mock) / Sprint4=実データ接続 / Sprint5=invariant + 別件トグルアニメ** は不変。増えるのは **Sprint3 の CSS 密度**（pip列 / 2段タイポ / 結果チップ / ガラス仕切り / stagger）。
- **Sprint3 DoD に「到着 stagger + 上質 hover の所作」を明示**（品格の核・polish が後回しで空回りした v66 教訓）。
- 残: 来期2列の Layer A 昇格は **残タスク4 完了後**（Sprint4 は §14-C ハイブリッドで配線）。

