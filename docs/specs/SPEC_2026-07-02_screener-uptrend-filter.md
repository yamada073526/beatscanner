# SPEC: スクリーナー「上昇トレンドフィルタ」(A軸 = 下降トレンド除外)

- **日付**: 2026-07-02
- **workstream**: screener (pane3 とは別軸)
- **由来**: handover v317 (`handover_2026-07-02_v317_screener-uptrend-filter.md`) で設計確定済。閾値は設計セッションで user 承認済 (gate1 済)。
- **在席**: 不在 / default 自律 → 確定設計に沿って実装し draft PR で提出 (deploy=merge は user 承認待ち)。

## 1. 問題

「静かな強さ」(`quiet_quality`) preset に PBR (ペトロブラス) 等が混入。真因 = **RS 高止まり**。PBR は原油高で急騰→反落中だが RS=80・出来高 surge 沈静・機関 QoQ 静か・OCF/ROE 良で quiet_quality の全条件を通過 (= post-spike falling knife が「静かな強さ」に化ける)。

実データ (本番 universe 2026-07-02・28銘柄分解) で汚染は 2 種:
- **A = 落ちるナイフ/下降トレンド** (PBR/NBR/CF/FTI + 石油タンカー株 APA/EOG/FRO/DHT/LPG/INSW/TDW/VAL): 株価が **下向き 50DMA の下**。
- **B = 過熱の急反落** (MU/WDC/STX/STRL = ストレージ勢): 上向き 50DMA の上だが高値から −18〜42%。

**user 決定: 「A はフィルタ、B は別軸で」** — 本 SPEC は **A のみ** (下降トレンド軸)。B (過熱除外の強化) は別 backlog。

## 2. 確定設計 (A 専用 = 下降トレンド軸のみ)

### signal
- `pv50` = 価格の 50DMA 乖離% = `(last_close - sma50[-1]) / sma50[-1] * 100`
- `sl50` = 50DMA の傾き% (21 営業日) = `(sma50[-1] - sma50[-22]) / sma50[-22] * 100`
- **高値からの下落率 (dd60) は使わない** — それは B (過熱軸) の指標で、健全な強い株の一時調整まで巻き込むため。

### 4 段階トグル (緩/標/厳/最厳)
| 段 | 条件 | 実測残件数 (quiet_quality[標準]=28 を base) |
|----|------|------|
| 緩 (loose) | pv50 ≥ −8% | 25 |
| 標準 (standard) | pv50 ≥ −3% | 21 |
| 厳 (strict) | pv50 ≥ 0 かつ sl50 ≥ −2 | 18 |
| 最厳 (severe) | pv50 ≥ 0 かつ sl50 ≥ +1 | 18 |

- PBR は **全段で除外**。B 勢 (MU/WDC/STX) は意図通り残留 (A フィルタは B を狙わない)。
- quiet_quality[緩]=98 件では標準で石油タンカーコホート丸ごと 21 件除外 (PBR 単体を超えた一般化を実証)。

### KB 根拠 (独自プロトコル・trading.md)
「価格 ≥ 50DMA / ブレイク pivot」必須 AND / 50DMA + トレンドライン重視 / オニール最高値 −12〜15% 超で売り。RS 床は **70** (RS70=市場平均、70 切る銘柄は避ける)。

### コード化しない指標 (Trust Cliff 回避)
バリュー指標 (PER/PBR/配当) は **コード化禁止** — 独自プロトコルは絶対閾値ゼロ (方向性のみ) → 指標表示 + user gate のみ。

## 3. アーキ決定 (frontend 統合方式)

handover は「quiet_quality の PRESET_PREDICATES に組込 **or** 独立 facet」を提示。以下 3 案を比較し **(C) opt-in override** を採用:

| 案 | cold-start (pv50 未 populate 時) | grid / danger zone | 実測再現 | 判定 |
|----|------|------|------|------|
| (A) 新 preset 7枚目 | 0 件表示 (新規なので許容) | **3+3+1 で grid orphan → index.css (danger zone)** | ○ | ✗ danger zone |
| (B) quiet_quality を in-place 改変 | **shipped preset が 0 件化 = Trust Cliff** | 影響なし | 緩/厳の再導出が必要 (本番データなしで不可) | ✗ 回帰 + 未検証 |
| **(C) quiet_quality 内 opt-in override facet (default OFF)** | **default OFF → 適用されず = ゼロ回帰・安全** | 影響なし | ○ (実測完全再現) | **採用** |

### (C) の設計
- `uptrend` を **compound grade facet** として追加 (grades: pv50 閾値 `{loose:-8, standard:-3, strict:0, severe:0}` + custom pass で strict/severe に sl50 gate)。
- `CROW_LAYOUT` + `PRESET_DISPLAY_CONDS.quiet_quality` に追加するが **`PRESET_PREDICATES.quiet_quality.grades` には入れない** → default OFF → `activeGrades[uptrend]` undefined → 未適用 = ゼロ回帰・cold-start 安全。
- user がスイッチで ON → override 経由で `activeGrades` に算入。既存の per-facet mseg (緩/標/厳/最厳) UI をそのまま再利用。
- **count==list**: list も in-panel count も `activeGrades` (= `buildActiveGrades(preset, precision, overrides)`) を通すため構造保証 (Trust Cliff C-2)。
- `renderCrow` guard で **quiet_quality 以外 (custom mode 含む) には非露出** (volume_quiet / inst_qoq_calm と同型・他 preset 誤露出防止)。
- null (pv50 測定外) = **AND 除外 (honest)**。ON 時のみ適用のため cold-start でも既存挙動に影響なし。

## 4. backend 実装

1. **migration** `docs/migrations/2026-07-02_rs_ratings_pv50_sl50.sql`: `rs_ratings` に `pv50 numeric`, `sl50 numeric` を `add column if not exists` で追加 (delta_1d と同 idempotent パターン)。GRANT/RLS はテーブル単位のため追加不要。
2. **`_compute_pv50_sl50(closes)` helper** (`_compute_sma` の隣に module scope 定義): pv50/sl50 を算出。データ不足/ゼロ除算は None (honest)。
3. **`cron_rs_scan`**: 並列 (`_score_one`) / sequential 両パスの per-ticker ループ (t_closes が生存) で `_compute_pv50_sl50` を呼び `raw_rs` dict に格納 → upsert row dict に `pv50`/`sl50` 追加。**column-not-exists fallback を pv50/sl50 も drop するよう拡張** (migration 未適用でも nightly scan が graceful に既存カラムのみ upsert)。
4. **universe payload** (`_build_universe_payload`): 既存 rs SELECT は**触らず**、`ticker,pv50,sl50` を**独立 `_fetch_all_rows_paged`** で fetch し `rs_map` に merge (migration 未適用でも既存 rs field 無傷 = `feedback_paged_select_missing_column_trap` 回避)。`items` dict に `pv50`/`sl50` 追加、`freshness["pv50"] = rs_cd`。endpoint (`scanner_universe`) 本体は変更不要 (tier mask 対象外 = free 相当)。

## 5. frontend 実装

1. `customScreenerModel.js`:
   - `UPTREND_FACET` 定義 (compound、annotMap で段毎の honest ラベル)。`FACET_MAP` に追加。
   - `PRESET_CONDS` に `uptrend` (custom compound pass: pv50 閾値 + strict/severe の sl50 gate、null=除外)。
   - `CROW_LAYOUT` の timing group に `uptrend` 追加 (RENDERABLE 要件)。
   - `PRESET_DISPLAY_CONDS.quiet_quality` に `uptrend` 追加 (crow パネル表示)。**`PRESET_PREDICATES` は不変** (default OFF)。
   - `gradeAnnot` に `annotMap` サポート追記 (段毎の distinct ラベル・既存 facet 無影響の additive)。
   - `MATCH_REASON_JP` に uptrend エントリ (合致理由バッジ)。
2. `CustomScreenerPanel.jsx`: `renderCrow` の quiet_quality 専用 guard (line 693 付近) に `uptrend` を追加 (1 行)。
3. `CustomScreenerPanel.invariants.test.js`: quiet_quality + uptrend override 各段で count==list を検証する test 追加。

## 6. 検証 (ground-truth)

- `python -m py_compile backend/app/main.py`
- `cd frontend && npm run build` (構文)
- `cd frontend && npx vitest run` (count==list invariant + normalize)
- **本番件数 before**: deploy 前に `/api/scanner/universe` を curl して quiet_quality baseline を実測 (after は deploy + nightly scan 後に検証)。
- ⚠️ **cold-start**: pv50/sl50 は nightly `cron_rs_scan` が populate。deploy + migration apply 後、次の nightly scan (or 手動 `cron_rs_scan` 起動) までは pv50=null → uptrend ON 時 0 件。default OFF なので quiet_quality baseline (28) は影響なし。PR にこの旨明記し、merge 後に手動 scan 起動 or nightly 待ちで backfill。

## 7. スコープ外 (別 backlog)

- **B 軸 (過熱除外の強化)**: 連続 +10%/日、pivot +5〜10% 上限。別 SPEC。
- バリュー指標 (PER/PBR/配当) のコード化。表示 + gate は将来検討。

## 8. 追記 (2026-07-02): market_leading への再利用 (PR #174 merge 後・user 指摘)

PR #174 merge 後、user から「`market_leading`（市場をリードし始めた銘柄）にも同型の混入リスクがあるのでは」と指摘。検討の結果、**同一リスク構造**と判断し `uptrend` facet を再利用。

### リスク分析

`market_leading` の条件（`rs_mid_band` = RS中位帯45-75 / `vs_spy` = 直近6ヶ月の対SPY超過リターン ≥5〜8pt）は、いずれも**トレーリング（過去参照）指標**。quiet_quality の PBR 汚染（RS 高止まりで post-spike falling knife を通過）と同じ穴があり、「数ヶ月前に急騰しその後下降トレンドに転じた銘柄」が 6 ヶ月窓の超過リターンがプラスのまま残ることで通過し得る。

`pv50`/`sl50`（銘柄自身の直近 50日線位置・傾き）は preset 非依存（backend で全銘柄に populate 済）の汎用シグナルのため、**同一 facet 定義をそのまま opt-in override として market_leading にも追加**。

### 実装（バックエンド変更なし・フロントエンド追加のみ）

- `customScreenerModel.js`: `PRESET_DISPLAY_CONDS.market_leading` に `uptrend` 追加。`PRESET_PREDICATES.market_leading.grades` は不変（default OFF 維持）。
- `CustomScreenerPanel.jsx`: `renderCrow` の uptrend guard を quiet_quality 単独から `quiet_quality || market_leading` に拡張。
- test: `PRESET_DISPLAY_CONDS.market_leading` の厳密 assertion 更新 + market_leading 専用の count==list / default-OFF test 追加。

検証: `vitest` 157 pass（新規2件含む）/ `npm run build` exit 0。閾値（緩−8/標−3/厳0+sl50≥−2/最厳0+sl50≥+1）は quiet_quality と共通のものを流用（market_leading 専用の実データ較正は未実施・default OFF のため件数リスクなし）。
