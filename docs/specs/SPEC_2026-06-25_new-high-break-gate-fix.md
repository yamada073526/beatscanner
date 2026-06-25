# SPEC: 新高値ブレイク gate 修正（0件恒常化の根治）

2026-06-25 / 状態: **設計確定・user 承認済（実装待ち）**
関連: `AUDIT_2026-06-25_screener-mockup-implementation-divergence.md`（PR #15 で着地した P0/P1）の続き。

## 1. 症状（実測 ground truth）

本番 Premium ログインで「新高値ブレイク」preset が **全精度段（緩/標/厳）で 0件**。決算合格=8件で screener 自体は稼働。市場は上昇トレンド（FTD Day 4）。

user 手動切り分け（Premium・本番）:
| 条件 | 件数 |
|---|---|
| 基礎（RS≥80 + EPS YoY≥25% + 出来高+25% + 決算ビート、両gate外す）| **35件** |
| 基礎 + 52週高値（買い場圏外す）| **0件** |
| 基礎 + 買い場圏（52週高値外す）| **0件** |

→ 35 の高モメンタム銘柄が存在するのに、52週高値・買い場圏のどちらを足しても全消滅。

## 2. 根本原因（コード確認済・断定）

調査エージェント確証（`backend/app/main.py`）:

- **`is_new_52w_high` は「price≥52週高値」ではない**。`pattern_signals(pattern_type='breakout')` の従属フィールドで、`_detect_breakout()`（main.py:13283）の多段 guard（出来高1.3倍以上で20/40日 pivot を終値ブレイク・SPY>200DMA 等）を全通過した銘柄にのみ付く（全universe で≈数十件）。**高値圏に静かに居る高RS株は「その夜にブレイク bar を出していなければ」拾われない** → 0/35 は構造的に正常。
- scan は GitHub Actions（`nightly_scan.yml` cron `7 23 * * *`）で毎晩稼働 → **stale ではない。主因は定義の狭さ**。
- **`pivot_distance_pct`（買い場圏）は cup 形成済み≈618/3000銘柄のみ非null**（main.py:20311 honest None）→ 構造的に希薄。
- tier マスク（main.py:20471-20491）: `tier != "premium"` で `is_new_52w_high` / `pivot_distance_pct` を None 強制 → **free/pro は常に0件**。

**利用可能データ**: `near_high_pct_scaled = 直近終値/52週高値×100` が**全~3000銘柄分すでに universe payload に存在**（FMP batch_quotes yearHigh 由来・main.py:21579/20359・**Pro tier**）。追加 fetch 不要。

## 3. 承認済み設計（3体合議 + user 承認）

### 3.1 概念整理（金融 Opus）
「ブレイク（出来高確定の pivot 突破＝O'Neill buy point）」と「高値圏（near high）」は別物。純 near_high 化（案A）は「ブレイク」概念を壊し優良誤認 Trust Cliff → **却下**。**段階的 OR** で、段を上げるほど「高値圏」を削ぎ「実ブレイク」に純化する。

### 3.2 確定条件（全段共通: RS + EPS YoY + 出来高 + 決算ビート）
| 段 | 52週高値条件 | 買い場圏 | 想定件数 |
|---|---|---|---|
| 緩 | `is_new_52w_high===true` **OR** `near_high_pct_scaled≥90`（高値10%以内）| 不問 | ~20-25 |
| 標 | `is_new_52w_high===true` **OR** `near_high_pct_scaled≥95`（高値5%以内）| 不問 | ~12-18 |
| 厳 | `is_new_52w_high===true`（**実ブレイクのみ**）| `pivot_distance_pct` 0〜+5% | ~3-8 |

閾値（90/95）は **deploy 後に Premium で実件数を見て微調整**（金融指摘・実 universe 依存）。

### 3.3 tier 方針（user 承認: **Premium専用維持**）
near_high は Pro データだが、preset 全体を **Premium gate**（Pro/Free にはロック+アップグレード CTA）。内部で is_new OR near_high を使うが Premium は両方保有で問題なし。

## 4. 実装設計（frontend のみ・backend 変更不要）

対象: `frontend/src/components/CustomScreenerPanel.jsx`（+ preset カード説明は `StrategyPresetBar.jsx` 等を要確認）

### 4.1 述語（count==list 自動保証のため既存 grade + 段別object 機構 S1.5 に乗せる）
- **新 grade cond `new_high_signal`**: facet `grades: {loose:90, standard:95, strict:999}`、custom pass = `is_new_52w_high===true || (near_high_pct_scaled!=null && >= grades[lvl])`（strict=999 は near 到達不可＝実ブレイクのみ）。`PRESET_PREDICATES.new_high_break.grades` に `new_high_signal: 'auto'`。
- **新 grade cond `buy_zone_g`**: facet `grades: {strict: 5}`、custom pass = `pivot 0〜5%`（lvl 無視）。`grades` に `buy_zone_g: {loose:null, standard:null, strict:'strict'}`（緩/標 非適用・S1.5 段別object）。
- `extra` から `newHigh52wOnly` / `buyZoneOnly` を削除（`beatOnly` は維持）。
- `applyStrategyImpl` の new_high_break で `setNewHigh52wOnly(true)` / `setBuyZoneOnly(true)` を削除。

**要注意の結線（ビルドだけでは検証不可・実装時に必ず確認）:**
- `FACET_MAP`（line 86）は `FUNDA_FACETS` 由来。新 facet を `buildActiveGrades` の `clampLevel(FACET_MAP[k])` で使うため **FACET_MAP に含める**必要あり。定義順序（FACET_MAP は 86行・facet は後方）に注意 → facet を前方へ移すか FACET_MAP 構築を調整。
- `FUNDA_FACETS` に入れると `activeFacets`（line 726）でグレード行としてレンダリングされる波及あり。**意図しないグレード行が増えないよう**、レンダリング経路（PRESET_DISPLAY_CONDS フィルタの有無）を実装時に確認。
- `PRESET_DISPLAY_CONDS.new_high_break`（line 345）の crow を新述語と一致させる（旧 `new_high_52w`/`buy_zone` crow と新述語の**表示/実装不一致＝Trust Cliff** を作らない）。

### 4.2 Trust Cliff 同時対応（qa 必須・同 PR）
1. **説明文から「更新」除去**: facet label `52週高値を更新`（line 175/298）→ `52週高値圏`。preset カード desc「52週高値を更新し、買い場圏(節目+5%以内)」→「52週高値圏（高値から-X%以内）の好決算銘柄」（段別出し分け推奨。緩/標は買い場圏を文言から外す or「厳しい設定で」注記）。**X% は実装値と1:1一致**。
2. **Premium gate（preset レベル）**: Pro/Free が new_high_break を選択したら「0銘柄」でなく **ロック+「Premium で N 件」CTA**（既存 ProTeaser / locked 分岐の流用を検討）。near_high が Pro でも preset を Premium に閉じる。
3. **買い場圏 crow グレーアウト**: 緩/標 で買い場圏 crow を「適用外（厳しい設定で有効）」とグレー表示（隠れフィルタ誤認防止）。
4. **0件空状態文言**: Bear相場の正当な0件を「壊れている」と誤解させない空状態テキスト。

## 5. 検証計画
- `cd frontend && npm run build`（構文）
- 合成データ sanity test（buildActiveGrades の段別解決 / count==list 全段 / 新述語の OR 挙動 / buy_zone strict-only）
- deploy 後: `screener_v2_dogfood`（B-6 件数）＋ **Premium user の本番目視で実件数確認 → 閾値 90/95 を微調整**
- non-Premium（Pro/Free）でロック表示が出るか目視（Premium gate）

## 6. 残リスク / 未決
- 閾値 90/95/(厳=実ブレイクのみ) の最終値は実 universe 件数で確定（実装→deploy→Premium目視→微調整の1ループ前提）
- preset カード説明の実ファイル（StrategyPresetBar.jsx 等）の特定が要る
- Premium gate の既存ロック UI（ProTeaser / `screener-hero-*-locked`）の流用可否は funnel-cro skill で確認
