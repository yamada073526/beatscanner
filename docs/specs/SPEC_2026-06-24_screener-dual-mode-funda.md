# SPEC: スクリーナー決算フィルタ 二系統化（四半期グロース / 年次コンパウンダー）

- 起票: 2026-06-24（funda_pass 年次是正タスクの派生・handover v256+）
- 状態: **設計確定・実装保留（deploy-gated）**。並行スクリーナーセッション（未push commit 1bc08c0 + 未コミット frontend）が push されるまで着手しない（user 指示「安全策で待つ」）。
- 由来: 3観点サブエージェントレビュー（じっちゃま原典 / backend設計 / UX・Trust Cliff）+ user 直答3問。
- メモリ: [[reference_jijima_investment_criteria]]（権威ルーリング Q1/Q2 + 本SPEC決定）/ [[feedback_oneill_screener_frontend_intersection]] / [[feedback_facet_filter_count_integrity]] / [[feedback_paged_select_missing_column_trap]] / [[feedback_supabase_grant_bug]] / [[project_jijima_contrarian_quality_pattern]]

---

## 0. 背景・動機（前提の精密化を含む）

現 `funda_pass` = 年次5条件（①営業CFマージン≥15% ②EPS ③CFPS ④売上 の年次3年連続増加 ⑤CFPS>EPS）。これは「品質コンパウンダー」を拾うが、**AI相場の高成長リーダーを取りこぼす**。

**前提の精密化（実データ検証済 2026-06-24）**: 当初「NVDAのCFPSがマイナス」という前提だったが、**NVDAのCFPSは全年プラス・急増**（FY2026 営業CF $102.7B、マージン47.6%）。NVDAが年次5条件で落ちるのは **⑤「CFPS>EPS」だけ**。理由は爆発的成長（売上+65%）で売掛金・在庫に現金が縛られ、営業CF($102.7B) < 純利益($120.1B) となり EPS(4.90) > CFPS(4.19) のため、粉飾回避用の⑤がハイパーグロース株を誤排除する（粉飾でなく運転資本効果）。

→ **二系統で両立**するのが正解。じっちゃまの「ファンダ2段活用」（上流=常時鮮度の成長 / 下流=品質）に1:1対応:
- **モードA = 上流（成長の鮮度）** = CAN-SLIM「C軸」。NVDA型主導株をここで拾う。
- **モードB = 下流（品質）** = 現 funda_pass。MSFT/GOOGL/AMZN を拾う。

---

## 1. モードA「四半期グロース」定義（user 確定）

### 条件（AND）
| 条件 | 閾値（user確定） | データ源 |
|---|---|---|
| 四半期 EPS YoY | **≥ +20%** | `screener_fundamentals.eps_yoy_pct`（実装済） |
| 四半期 売上 YoY | **≥ +25%** | `screener_fundamentals.revenue_yoy_pct_q`（**新設要**） |
| 加速度（必須教義） | 直近QのYoY ≥ 1つ前QのYoY（減速していない） | 要算出（下記） |

- **CFPS/営業CF条件は課さない**（capex先行株を一律排除しない）。ただし **CFマイナスを"優遇"もしない**（user確定: 推奨案=高成長リーダー中心）。じっちゃま2026スタンス（`trading.md:13898` AI巨額設備投資を避けFCF高margin選好）と整合。
- 原典数値根拠: EPS YoY 最低+18〜20%（`trading.md:2459,6921`）、売上≥+25%（`:2459`）、加速度必須（`:2459,678,680`）。
- **ガード必須**: 外貨ADR（[[feedback_foreign_currency_adr_guards]]）/ sector偽売上（[[feedback_revenue_basis_mismatch]]）を EPS・売上成長にも適用。`eps_yoy_pct` が NULL（赤字base/IPO1年未満/前年同期欠損）の銘柄は自動除外。

### 透明化（user 明示要望）
1. **各行に OCFマージンを compact 表示**（例「OCF 47%」緑 / 「OCF -8%」赤）。§38中立色ルール遵守（観測事実の提示、推奨でない）。
2. **見出し横に「i / ?」チップ → クリックでモーダル**。モーダルは「四半期グロースの定義」と「なぜ営業CF（CFPS）を必須から外したか」を解説。
   - ⚠️ **モーダル文面は後日 user が更新**（本SPEC ではプレースホルダ + TODO(user) を置く）。
   - 文面の骨子（user 更新前の仮）: 「四半期の売上・EPS高成長を条件とします。営業CF/CFPSは条件に含めません。理由: ハイパーグロース期は売掛金・在庫に現金が縛られ営業CFが純利益を一時的に下回るため（NVDA例: 営業CF $102.7B でも EPS>CFPS）。赤字・FCFマイナス株を含む場合があります。投資推奨ではありません。」

---

## 2. モードB「年次コンパウンダー」定義（user 確定: 厳格維持）

- 現 funda_pass = 年次5条件のまま**変更しない**（user確定: 役割分担を明確に）。
- NVDA型は モードA で拾うため、モードB の⑤緩和や Q1精緻化（調整後EPS/一時減益許容）は**本SPECに含めない**（別タスク化。先のQ1権威ルーリングは [[reference_jijima_investment_criteria]] に保存済、将来検討）。
- ただし **ラベル改名は実施**（下記 §4 Trust Cliff）。

---

## 3. Backend 設計

### 3-1. 新フィールド `revenue_yoy_pct_q`（screener_fundamentals）
- canslim-scan の `_compute_one` は既に `income_statement(quarter, limit=4)` を fetch 済（`ocf_margin_pct` 算出で使用）。**FMP 追加コール 0** で `revenue_yoy_pct_q` を算出可能（`_calc_eps_yoy_pct_from_income_q` と同ロジックを売上に適用、date照合）。
- migration:
  ```sql
  ALTER TABLE public.screener_fundamentals ADD COLUMN IF NOT EXISTS revenue_yoy_pct_q NUMERIC;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.screener_fundamentals TO service_role; -- 明示（GRANT漏れ silent fail 防止）
  CREATE INDEX IF NOT EXISTS idx_sf_rev_yoy_q ON public.screener_fundamentals(calc_date, revenue_yoy_pct_q) WHERE revenue_yoy_pct_q IS NOT NULL;
  ```
- ⚠️ **共有 paged SELECT に混ぜない**（[[feedback_paged_select_missing_column_trap]]）: migration 未適用時に全ファンダ silent 消失する。**別 fetch で merge**。
- migration 適用 → PostgREST schema reload（`NOTIFY pgrst, 'reload schema'`、過去 silent fail 実績あり）→ backend deploy の順。

### 3-2. universe payload への出し方（2-facet 並走案）
`_build_universe_payload` に以下を追加（item 単位）:
```
funda_pass        : bool|null   // 既存・年次5条件（モードB）
eps_yoy_pct       : float|null  // 既存
revenue_yoy_pct_q : float|null  // 新設
ocf_margin_pct    : float|null  // 既存（各行 OCF 表示に使用）
```
- `growth_pass`（モードA合否）は **backend で bool 化せず frontend predicate で AND**（[[feedback_oneill_screener_frontend_intersection]]）。理由: facet count を predicate と同一ロジックで集計でき（[[feedback_facet_filter_count_integrity]]）、backend が bool を持つ二重管理を避けられる。
- freshness キーは **分離**: `freshness.funda_pass`（年次 scan、~1580 coverage で stale化しやすい）と `freshness.growth_q`（screener_fundamentals=canslim scan 由来）を別表示（混在で「X日前」矛盾＝Trust Cliff 回避）。

### 3-3. coverage
- モードA（screener_fundamentals 由来）= canslim scan の coverage（russell3000 指定で ~2000-3000）。モードB（年次 ~1580）より**広い**。
- 年次 scan の 1580 上限（Railway request timeout）は別途 async/chunk 化で解消（SPEC §4.5 既知課題、本SPEC範囲外）。

---

## 4. Frontend / UX 設計

### 4-1. プリセット2枚（トグルでなく並置）
`StrategyPresetBar.jsx` の `STRATEGY_PRESETS` に追加/改名（※ file:line は agent 報告値、実装時に grep 再確認）:
- **「四半期グロース」**（新規, key=`quarterly_growth`, tier=free）。predicate: `eps_yoy_pct>=20 && revenue_yoy_pct_q>=25 && (加速度)`。
- **「年次コンパウンダー」**（既存 `決算合格` を改名, key=`earnings_pass` 不変）。

### 4-2. Trust Cliff 修正（二系統と独立・最優先）
現「決算合格」は年次品質を四半期イベント合格と誤認させる乖離。改名する（**key/backend/Supabase/GA4 は不変**、label/desc/tooltip のみ）:
- `StrategyPresetBar.jsx`（agent報告 L24）: label 決算合格→**年次コンパウンダー**、desc=「年次3年連続で利益・CF・売上が右肩上がり。構造的な利益の質。」
- `CustomScreenerPanel.jsx`（agent報告 L274/L1281/L1441）: `FACET_MAP.funda_pass.label` を「年次5条件達成（年次コンパウンダー）」、freshness 注記「最終更新 YYYY-MM-DD（nightly 年次バッチ）」。
- `ScreenerIdleHero.jsx`: HERO_LADDER の動作ロジックは**不変**（dense化しても最上位採用になるだけで正しい）が、eyebrow/バッジ文言で funda_pass を指す箇所を「年次コンパウンダー条件達成 / 年次CF品質 ✓」に統一（sparse前提の「決算3条件」連想テキストが残ると Trust Cliff）。実テキストは実装時に grep 確認。

### 4-3. 誤認ガード（§38/§5 遵守）
- 結果 header に小字「※スクリーニング結果です。投資推奨ではありません。」（[[feedback_screener_hero_3sections]] 踏襲）。
- 各行 OCFマージン表示（§1）。
- 件数バッジ配色 amber 検討は **design_system.md §1 の warning限定ルールと衝突しないか確認**してから（衝突するなら neutral 維持）。

---

## 5. フェーズ分割（deploy 解禁後）

| Phase | 内容 | backend deploy | 並行セッション依存 |
|---|---|---|---|
| 0 | Trust Cliff 改名（決算合格→年次コンパウンダー）+ idle-hero 文言 | 不要（frontend のみ） | frontend 衝突（CustomScreenerPanel/StrategyPresetBar/IdleHero）→ push 待ち |
| 1 | モードA preset（EPS YoY のみで先行可、`eps_yoy_pct` 実装済）+ 各行OCF + i/?チップ（モーダル文プレースホルダ） | 不要 | frontend 衝突 → push 待ち |
| 2 | `revenue_yoy_pct_q` 追加（migration+_compute_one+別fetch merge）→ 完全版モードA | 必要 | backend deploy gate |
| — | i/?モーダル本文 | — | **user 提供待ち** |

⚠️ Phase 0/1 は backend 不要だが、編集対象 frontend（CustomScreenerPanel.jsx 等）が**並行セッションの未コミット変更と同一ファイル**のため、結局 push 待ち。

---

## 6. 残・別タスク（本SPEC範囲外）

- **Q2「お宝候補」逆張りプリセット**: 決算ピカピカ×低RS×低PER×歴史的安値圏（[[project_jijima_contrarian_quality_pattern]]）。near_high/RS 二段構えの逆張り側。
- **モードB 精緻化**: Q1権威ルーリング（調整後EPS/一時減益許容/⑤緩和）。将来検討（user: 今回は厳格維持）。
- **オプション2**: volume_surge_pct を FMP profile→OHLCV自己計算（精度）。
- **オプション3**: earnings-annual-scan 診断（reason_counts）を tuple化して正式再導入（現 stash@{0}）。
- **全3000 coverage**: 年次 scan の async/chunk 化 or concurrency bump（現 ~1580上限）。

---

## 7. レビュー由来の要確認リスク（実装時に潰す）
1. `revenue_yoy_pct_q` を共有 SELECT に混ぜない（silent 全消失）。
2. migration で service_role GRANT 明示（silent fail）。
3. facet count は filter predicate と同一 guard（count ズレ＝Trust Cliff）。
4. ADR/sector ガードを成長率にも適用（成長率型はノイズを拾いやすい）。
5. 「四半期グロース」が売上YoY未実装のまま「売上成長」を謳うと Trust Cliff → Phase 1 は EPS のみと明示、売上は Phase 2 で。
6. agent 報告の file:line（StrategyPresetBar L24 等）は実装時に grep 再確認（行番号 hallucination 防止）。
