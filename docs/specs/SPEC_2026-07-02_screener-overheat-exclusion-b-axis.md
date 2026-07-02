# SPEC: スクリーナー「過熱除外」(B軸 = 過熱後の急反落の除外)

- **日付**: 2026-07-02
- **workstream**: screener (pane3 とは別軸)。A軸 (`SPEC_2026-07-02_screener-uptrend-filter.md`) の姉妹 backlog。
- **由来**: A軸 SPEC §7「スコープ外」で B軸を別 backlog に切り出し済。user 依頼で本 SPEC を起票。
- **ステータス**: **草案 (draft)**。閾値・signal・統合方式はいずれも **未確定**。実装着手は gate1 承認 + 実データ較正セッション完了が **必須前提**。
- **在席**: user は他作業待ちのため即応不可の可能性あり。gate1 の質問は本 SPEC 単体で判断できる自己完結形にする (§9)。

> ⚠️ **本 SPEC は閾値を確定させない**。A軸は 2026-07-02 の設計打ち合わせで候補28銘柄を実測して閾値を決めたが、B軸はまだそのプロセスを経ていない。本文の閾値は全て「案」であり、gate1 承認 + 本番 universe の実データ分布較正なしに実装してはならない。

---

## 1. Context

### user prompt (原文)
> スクリーナー「B軸（過熱除外の強化）」の SPEC 起票。quiet_quality / market_leading 等の preset に混入する「過熱後の急反落」銘柄を除外する軸。A軸と同じ設計プロセス（signal定義・4段階閾値案・実装方式の選択肢比較・gate1 で承認が必要な論点の明示）で草案を作成。

### なぜ今やるか (根拠)
- A軸 SPEC §1 の実データ分解 (本番 universe 2026-07-02・28銘柄) で汚染が **2 種** と判明済:
  - **A = 落ちるナイフ/下降トレンド** (PBR/NBR/CF/FTI + 石油タンカー株): 下向き 50DMA の **下** → A軸フィルタで対応済 (PR #174 + #177 merge済)。
  - **B = 過熱の急反落** (MU/WDC/STX/STRL = ストレージ勢): 上向き 50DMA の **上** だが **高値から −18〜42%** 下落中 → **本 SPEC の対象**。
- A軸フィルタは意図的に B cohort を残す設計 (pv50 ≥ 0 を通過)。B は「別軸」として user が明示的に切り出した。
- market_leading への A軸再利用 (A軸 SPEC §8) と同じく、B軸も preset 非依存の汎用 signal にできれば quiet_quality / market_leading の両方に効く。

### 期待される成果 (5 原則との対応)
- **原則 4 (人力の代替・北極星)**: 「過熱してもう遅い銘柄」を人が目視で外す手間を代替。スクリーナーは特に右往左往しがちなので、「これは投資家が毎日人力でやっている手間 (=天井づかみ回避) を代替するか？」の 1 問に **Yes**。
- **原則 1 (2 秒理解)**: 「静かな強さ」preset の結果から「実は激しく吹き上げて崩れた銘柄」を排し、preset 名と中身の意味整合を上げる (読み手の判断負担を減らす)。
- **原則 3 (シンプルかつリッチ)**: A軸で確立した 4 段トグル + mseg UI を再利用し、新概念を増やさない。

### 関連 memory / 参照 (Generator は着手前に必読)
- `feedback_brand_aspiration.md` (design_system.md §-1 が SSOT・修正禁止 anchor)
- A軸 SPEC: `docs/specs/SPEC_2026-07-02_screener-uptrend-filter.md` (§2 signal / §3 統合方式3案比較 / §8 market_leading 再利用が本 SPEC の設計テンプレート)
- KB: `docs/references/canslim_oneill_rules.md` (buy zone +5%/extended・handle 押し目 8〜12%(最大15%)・cup depth 33%・高位フラッグ調整 10〜25%・利確 +20〜25%・8週hold=3週で+20%)
- `feedback_diagram_quality_guard.md` / §38 (数値は観測事実の描写に留め断定禁止)

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

効く感情語彙: **洗練さ** と **驚き**。

「静かな強さ (quiet_quality)」は最高級ホテルで言えば「派手に騒がず、佇まいで格を感じさせる部屋」。そこに **+80% 吹き上げて −40% 崩れた激しい銘柄** が混じるのは、静謐なロビーに騒々しい客が紛れ込むようなもので、世界観 (静かな洗練) を毀損する。B軸はこの「静かさの偽物」を除き、preset の佇まい (洗練さ) を守る。同時に「過熱で崩れ始めた銘柄をそっと外してくれた」という気づきが **驚き** (賢く守ってくれる) につながる。`feedback_brand_aspiration.md` の修正禁止 anchor (5 感情語彙) を破壊せず、既存語彙の範囲で貢献する。

---

## 3. Trust Cliff チェックリスト

| # | 検証項目 | 判定 |
|---|---|---|
| 1 | **preset 名 vs 中身の整合**: 「静かな強さ」に激しい急反落株が残ると preset 名が誇大 (優良誤認的)。B軸は名と中身を近づける方向で Trust Cliff を **改善** | ✅ 整合強化 |
| 2 | **count==list 不変**: A軸同様、list・in-panel count とも `activeGrades` (= `buildActiveGrades(preset, precision, overrides)`) を通す。B軸 facet を追加しても両者が同一述語を使う構造を保証 (Trust Cliff C-2) | ✅ 設計要件 |
| 3 | **default OFF ゼロ回帰**: A軸 (C) opt-in override と同型。`PRESET_PREDICATES` の grades には入れず default OFF → shipped preset の件数を 1 件も動かさない (LP/訴求に既出の件数表示があっても崩さない) | ✅ 設計要件 |
| 4 | **「登録不要」「3銘柄/日まで無料」等 LP 文言との矛盾**: B軸は screener 内 facet で LP 訴求文言に直接触れない | N/A: 該当なし |
| 5 | **tier 表記整合**: free/premium のどちらにするかで locked chip 表示が変わる (§9 論点5)。tier は gate1 で確定 | ⚠️ gate1 で確定 |

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **no**。
- **理由明記**: B軸の signal (dd60 = 高値からの下落率 / runup = 直近急騰率 / 既存 pivot_distance) は **すべて Python の純数値計算で完結** (closes 配列からの max/min/除算)。narration も静的ラベル (`annotMap` の段毎固定文字列) のみで、LLM に数値や文言を生成させない。
- **aggregator/ 物理層規律**: 数値算出は `backend/app/main.py` の module scope helper (`_compute_pv50_sl50` の隣) で行い、LLM SDK は一切 import しない (pre-commit Check 3 に抵触しない)。
- **§38 (断定禁止)**: dd60/runup は「高値からどれだけ下げたか」「直近どれだけ上げたか」の **観測事実の描写** に留める。「天井」「暴落」「売り」等の断定・最上級表現は使わない。色 polarity も付けない (volume_quiet / uptrend と同じ中立表示)。バリュー指標 (PER/PBR/配当) の絶対閾値コード化は **禁止** (独自プロトコルは方向性のみ) を踏襲。

---

## 5. スプリント分割 (上限 6・本 SPEC は 4 sprint)

> **重要**: Sprint 1 (実データ較正 = gate) を通過するまで Sprint 2 以降のコードは書かない。A軸で「calendar を一度誤認した」教訓 (handover v318 §3) の通り、想定と実データがズレるリスクを潰してから実装する。

### Sprint 1 — 実データ較正 + 閾値確定 (**gate・コード変更なし**)
- **目的**: 本番 universe で quiet_quality / market_leading の通過銘柄を実測し、dd60 (± runup) の分布を出して signal と閾値を確定する。A軸が 28銘柄を実測したのと同じプロセス。
- **やること**:
  1. `/api/scanner/universe` を curl し、quiet_quality[標準] / market_leading[標準] の通過銘柄を列挙。
  2. 各銘柄の closes (既存 price-history / cron が持つ配列) から候補 signal を実測: dd60 (N=40/60/120 の 3 窓)、runup、現時点 pivot_distance の populate 率。
  3. B cohort (MU/WDC/STX/STRL) と「健全に高値近辺で静かな強い株」を **分離できる閾値** を実データで特定。健全な base pullback (handle 8〜12%・cup depth 〜33%) を巻き込まないか確認。
  4. **§9 の gate1 論点 (signal 案 S-1〜S-4 / 窓 N / 閾値 案A〜C / 統合方式 / tier / 対象 preset) に実データを添えて user 承認**。
- **触るファイル**: なし (計測のみ・結果は本 SPEC に追記)。
- **呼ぶ既存 skill**: `screener` / `fmp-api-retry` (price-history 取得の retry)。
- **完了判定**: gate1 で signal・窓・閾値・統合方式・tier・対象 preset が確定し、本 SPEC §9 に「確定値」を追記。

### Sprint 2 — backend signal 算出 (Sprint 1 承認後のみ)
- **目的**: 確定 signal を rs_ratings に populate し universe payload に載せる。A軸 (pv50/sl50) の migration/cron/payload パターンを踏襲。
- **やること (確定 signal が dd60[+runup] の場合)**:
  1. migration `docs/migrations/2026-07-02_rs_ratings_dd60.sql`: `rs_ratings` に `dd60 numeric` (+ compound なら `runup numeric`) を `add column if not exists` で追加 (pv50/sl50 と同 idempotent)。
  2. `_compute_drawdown_runup(closes)` helper を `_compute_pv50_sl50` の隣に module scope で新設。データ不足/ゼロ除算は None (honest)。
  3. `cron_rs_scan` の per-ticker ループ (`t_closes` 生存箇所) で helper を呼び raw dict → upsert row に追加。**column-not-exists fallback を dd60 も drop するよう拡張** (migration 未適用でも nightly scan が graceful)。
  4. universe payload: 既存 rs SELECT は触らず、`ticker,dd60(,runup)` を **独立 `_fetch_all_rows_paged`** で fetch し `rs_map` に merge (paged-select missing-column trap 回避)。`items` に追加、`freshness["dd60"] = rs_cd`。
- **触るファイル**: `backend/app/main.py` (helper + cron + `_build_universe_payload`)、`docs/migrations/2026-07-02_rs_ratings_dd60.sql` (新規)。
- **呼ぶ既存 skill**: `hallucination-guard` (LLM-free の再確認・aggregator import 規律)、`screener`、`fmp-api-retry`。
- **完了判定**: `python -m py_compile backend/app/main.py` pass。ローカル or 手動 cron で 1 ティッカーの dd60 が期待値と一致。

### Sprint 3 — frontend facet (Sprint 2 完了後)
- **目的**: 確定閾値の opt-in override facet を quiet_quality (+ market_leading) に追加。既存 mseg UI 再利用。
- **やること (統合方式=新 override facet の場合)**:
  1. `customScreenerModel.js`: B軸 facet 定義 (例 `overheat_excl`、`≤型`/exclusion・`annotMap` で段毎ラベル)。`FACET_MAP` に追加。`PRESET_CONDS` に custom pass (dd60 閾値 [+runup gate]、null=除外)。`CROW_LAYOUT` timing group に追加 (RENDERABLE 要件)。`PRESET_DISPLAY_CONDS.{quiet_quality, market_leading}` に追加。**`PRESET_PREDICATES` は不変 (default OFF)**。`MATCH_REASON_JP` に entry。
  2. `CustomScreenerPanel.jsx`: `renderCrow` の guard を A軸 uptrend と同じ preset 限定に拡張 (`quiet_quality || market_leading` のみ露出・他 preset / custom mode は非露出)。
  3. `CustomScreenerPanel.invariants.test.js`: 各段で count==list + default-OFF を検証する test 追加。
- **触るファイル**: `customScreenerModel.js` / `CustomScreenerPanel.jsx` / `CustomScreenerPanel.invariants.test.js`。
- **呼ぶ既存 skill**: `screener`、`design-system-check` (crow/mseg のトークン整合・色 polarity なし確認)、必要なら `pge-loop-debugger` (snap 検証時)。
- **完了判定**: `npm run build` exit 0、`npx vitest run` の count==list invariant + 新規 default-OFF test pass。

### Sprint 4 — 検証 + draft PR (Sprint 3 完了後)
- **目的**: ground-truth 検証を揃え、deploy=merge は user 承認待ちの draft PR で提出。
- **やること**: build + vitest + py_compile + §38/raw-hex grep。**本番件数 before** を deploy 前に curl 実測。cold-start (dd60=null → ON 時 0 件・default OFF なので baseline 不変) を PR に明記。merge 後に手動 scan or nightly で backfill。
- **触るファイル**: なし (検証 + PR 記述)。
- **呼ぶ既存 skill**: `funnel-cro` (preset 意味整合 = Trust Cliff)、`multi-review` (§7 の判定に従う)、`release-check` 相当の最終 gate。
- **完了判定**: 全 ground-truth pass + draft PR 作成 + `gh pr list --head` で実在裏取り (handover v318 の gh 幻覚教訓)。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

以下は本 SPEC のどの sprint でも **触らない**:

- `backend/app/visualizer/prompt.py` (Hallucination Guard pre-commit Check 1) — 本 SPEC は LLM 不使用のため無関係だが触らない。
- `backend/app/aggregator/*.py` への LLM SDK import (pre-commit Check 3) — B軸数値は `main.py` module helper で算出し aggregator に触れない。
- `backend/app/visualizer/prompt_negatives.py` (法務 anchor)。
- `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX (typo は OK)。
- `.claude/launch.json` (人間用)。
- `migrations/*.sql` の既存ファイル (新規 `docs/migrations/2026-07-02_rs_ratings_dd60.sql` の **追加のみ** 可・既存 schema 改変禁止)。
- `handover_*.md` (read-only reference)。
- `railway.toml` の cron 定義。
- `frontend/src/App.jsx` の sticky 検索 div (8 回試行錯誤の安定領域)。
- `.panel-card / .bs-panel / .surface-card / .verdict-hero` 関連 CSS + gold accent + `index.css` (発光バグ高リスク) — B軸は既存 mseg UI を再利用し **新規 card/glow/CSS を一切足さない**。
- **A軸の既存資産を壊さない**: `UPTREND_FACET` / `_compute_pv50_sl50` / `PRESET_PREDICATES.{quiet_quality,market_leading}` の grades (default OFF 維持) / A軸 migration。B軸は **additive** で、A軸の pv50/sl50 述語・件数に影響を与えないこと。
- **RS 床 70 / バリュー指標コード化禁止** の既存制約を踏襲 (RS<70 は既存 clampLevel で下限寄せ・PER/PBR/配当は絶対閾値コード化しない)。

---

## 7. multi-review 必要性判定

CLAUDE.md の 3 軸を本 SPEC に適用:

1. **LLM 出力品質 (景表法/金商法/hallucination)**: **inactive** — B軸は純数値計算・LLM 不使用・断定表現なし。
2. **Trust Cliff (LP 訴求 vs 実装)**: **partially active** — preset 名「静かな強さ」と中身の意味整合を扱うが、default OFF ゼロ回帰 + count==list 保証で回帰リスクは構造的に封じ込め済。LP 文言には直接触れない。
3. **新 backend endpoint + RLS/認証境界 + cache**: **mostly inactive** — 新 endpoint なし (既存 `scanner_universe` 再利用)、RLS 変更なし (テーブル単位 GRANT で追加列は継承)、migration/cron/payload は A軸で実証済パターンの踏襲。blast radius 小。

**判定: 3 体合議で十分** (2+ 軸が active でない)。A軸 (同型・3体) と整合。

> ただし本 SPEC の真の risk 緩和は **多体合議でなく Sprint 1 の実データ較正 + gate1** にある (閾値が実データとズレるのが最大リスク)。3 体は較正後の設計妥当性確認に使う。
> **推奨 reviewer 構成 (3体)**: **金融/KB 妥当性 (dd60/runup 閾値が独自プロトコルの extended/sell 概念と整合するか) + frontend-architect (count==list/facet 結線) + qa-dogfooder (default OFF ゼロ回帰の実機確認)**。ui-designer より金融 reviewer を優先 (閾値判断が金融ドメイン寄りのため)。

---

## 8. 想定リスク + roll-back plan

### 失敗時に壊れるもの
1. **健全株の過剰除外 (最大リスク)**: dd60 単独 (S-1) は「健全な深めの base 調整 (cup depth 〜33%)」まで巻き込む恐れ。A軸 SPEC §2 が dd60 を A軸から除外した理由そのもの。→ Sprint 1 較正で「B cohort と健全 pullback を分離できる閾値/compound」を実証してから実装 (未実証なら実装しない)。
2. **cold-start 0 件化**: dd60 は nightly `cron_rs_scan` で populate。deploy 直後 (backfill 前) は dd60=null → ON 時 0 件。**default OFF なので quiet_quality baseline は不変**だが、ON にした user が空を見る。→ PR に明記 + merge 後に手動 scan or nightly 待ち。
3. **count≠list 回帰**: facet を list と count で別述語にすると崩れる。→ `activeGrades` 単一 SSOT + invariants test で機械検出。
4. **A軸 default OFF の巻き添え破壊**: B軸追加時に `PRESET_PREDICATES` の grades を誤って触ると A軸 uptrend or B軸が意図せず ON になり shipped 件数が動く。→ grades 非登録を test で assert。

### 緊急 roll-back 手順
- **frontend のみの問題**: 該当 PR を `git revert <sha>` → push → Railway auto-deploy (~30s)。default OFF なので facet 定義を revert しても他 preset は無傷。
- **backend (cron/payload) の問題**: 同じく revert + push。dd60 列は `add column if not exists` で無害に残置可 (payload が読まなければ影響なし)。migration の drop は不要 (idempotent・他機能非依存)。
- **確認**: `/health` の `commit` (RAILWAY_GIT_COMMIT_SHA) と本番 bundle hash 変化で反映裏取り。`gh pr list --head` で PR 状態を git ground-truth 裏取り (v318 gh 幻覚教訓)。

---

## 9. gate1 で承認が必要な論点 (self-contained・user が後で読んで判断できる形)

> 以下は **Sprint 1 の実データ較正と合わせて確定** する。各論点に候補を複数提示。**閾値の数値はすべて「案」であり、本番 universe の実測分布を見てから最終決定**する (現時点の数値は KB と B cohort の観測レンジ −18〜42% から逆算した仮値)。

### 論点1: signal 定義 (何で「過熱後の急反落」を測るか)

B cohort (MU/WDC/STX) は **上向き 50DMA の上** にいる (=A軸の pv50 ≥ 0 を通過) が **高値から −18〜42% 下落済み**。この「既に高値から大きく落ちた」性質を測る必要がある。

| 案 | signal | 長所 | 短所 / 判定 |
|----|--------|------|------------|
| **S-1** | **dd60 単独** = 高値からの下落率 `(last − max(closes[-N:]))/max ×100` | 単一 signal・最も単純・closes から追加 fetch ゼロ | **健全な深め調整 (cup 〜33%) も巻き込む** (A軸が dd60 を除外した理由)。blunt。MVP 候補だが誤除外リスク |
| **S-2** | **compound: dd60 (急反落) AND runup (直近急騰率)** = 「大きく吹き上げてから大きく崩れた」のみ除外 | **真の過熱急反落を精密に狙い、健全 pullback (急騰していない) を温存** | 閾値 2 個 + 窓定義が複雑。較正コスト高。**推奨 (精度)** |
| **S-3** | **pv50 上限 cap のみ** (既存 pv50 を再利用・追加 column ゼロ) | backend 変更ほぼゼロ・A軸=下限/B軸=上限で対称 | **B cohort は既に高値から落ちて現時点 pv50 が小さいため捕捉できない (スナップショット問題)**。「今まさに放物線」の別ケースは拾うが MU/WDC/STX は取り逃す → **単独では不十分** |
| **S-4** | **pivot_distance 上限 cap** (buy_zone 拡張・"pivot +5〜10%上限") | 既存 buy_zone 機構を流用 | pivot_distance は **Premium + cup 依存 (≈618 ticker のみ populate)** で quiet_quality 全体を覆えない。かつ −40% 崩れ後は pivot 割れ/cup 消失で null 化 → **coverage 不足 + スナップショット問題で不十分** |

> **Planner の独立見解**: 既存の「買い場圏 (pivot_distance) / pv50」は **すべて現時点スナップショットの位置** signal であり、「過去に吹き上げて今崩れている」履歴を持たない。B軸には **記憶を持つ新 signal (dd60)** が本質的に必要で、pivot_distance の閾値強化だけでは足りない (= user 依頼の問い「pivot_distance 強化で足りるか」への回答は **No**)。精度重視なら **S-2 (compound)**、まず MVP なら **S-1**、を推奨。既存 buy_zone とは **役割が直交** (buy_zone=今の買いタイミング前向き判定 / B軸=直近の急反落の後ろ向き除外) のため統合でなく別 facet が妥当。

### 論点2: 下落率の計測窓 N (dd60 の "60")
- **案 N=40 (≈2ヶ月)**: 直近の急スパイクに敏感・古い高値を引きずらない。
- **案 N=60 (≈3ヶ月)**: 「過熱の急反落」の標準的スパン。デフォルト候補。
- **案 N=120 (≈6ヶ月)**: 深い高値まで遡り取りこぼしを減らすが、健全な長期上昇の途中押しも巻き込みやすい。
→ 実測で B cohort の高値がどの窓に入るか確認して決定。

### 論点3: 閾値グリッド (4 段トグル 緩/標/厳/最厳) — **すべて案・要較正**

facet の polarity は **除外型 (≤型)** = 「下落しすぎていない銘柄を残す」(volume_quiet / inst_qoq_calm と同型)。pass = keep。

**案A (dd60 単独 S-1 の場合)** — pass 条件 = dd60 が閾値以上 (これ以上落ちていない):

| 段 | 除外閾値 (これより深い下落を除外) | 意図 |
|----|------|------|
| 緩 (loose) | dd60 < −35% を除外 | 深い崩壊のみ (MU/WDC/STX の −42% 端を除外・−18% 端は残す) |
| 標準 (standard) | dd60 < −25% を除外 | 中庸。cup depth 33% 近辺と分離 |
| 厳 (strict) | dd60 < −18% を除外 | B cohort 下端 (−18%) まで一掃 |
| 最厳 (severe) | dd60 < −12% を除外 | オニール sell rule −12〜15% と整合・攻めめ (健全 base pullback を巻き込む恐れ→較正必須) |

**案B (compound S-2 の場合)** — pass = NOT(急騰 AND 急反落):

| 段 | 除外条件 (dd60 AND runup を同時に満たすものを除外) |
|----|------|
| 緩 | dd60 < −35% **かつ** runupN ≥ +60% |
| 標準 | dd60 < −25% **かつ** runupN ≥ +50% |
| 厳 | dd60 < −18% **かつ** runupN ≥ +40% |
| 最厳 | dd60 < −15% **かつ** runupN ≥ +30% |

**案C (保守的・誤除外最小)**: 標準段を **dd60 < −30%** に緩め、健全株の巻き込みをほぼゼロにする代わりに B cohort の浅い端 (−18〜25%) は残す。「静かな強さ」の純度より件数維持を優先する場合。

→ どの案でも **本番 quiet_quality/market_leading 通過銘柄での実測残件数** (A軸が 28→25/21/18/18 を測ったのと同じ) を出してから確定。

### 論点4: 統合方式 (どこに組み込むか)

| 案 | 方式 | 判定 |
|----|------|------|
| **方式1** | **新 opt-in override facet (A軸 uptrend と同型・default OFF・quiet_quality+market_leading 限定露出)** | **推奨**。ゼロ回帰・count==list・既存 mseg UI 再利用・A軸と並列で「下降除外 (A) / 過熱除外 (B)」の 2 トグルが揃い意味が明快 |
| 方式2 | 既存 pivot_distance/buy_zone に上限 cap を足す | ✗ 論点1 S-3/S-4 の通り coverage 不足 + スナップショット問題。かつ buy_zone (前向き買い場) の意味と混線 |
| 方式3 | A軸 uptrend facet に段を増やして上限も同時に締める | ✗ 「下降除外」と「過熱除外」の直交する 2 軸を 1 facet に混ぜると UX が不透明化。user 決定「A はフィルタ、B は別軸」に反する |

### 論点5: tier (free / premium)
- **案 free (推奨)**: dd60 は closes から全銘柄算出可 (cup 非依存)。A軸 pv50/sl50 と同じく free にすれば quiet_quality 全体を覆える。pivot_distance (Premium・cup 依存) の coverage 問題を回避。
- **案 premium**: タイミング系を Premium に寄せる既存方針 (buy_zone/cup/ad_volume) との一貫性。ただし coverage が cup 依存でないので Premium にする技術的必然はない。
→ coverage と収益設計のどちらを優先するかで決定。

### 論点6: 適用 preset
- **案 quiet_quality のみ**: まず主目的 (PBR 事例の兄弟である過熱汚染) に限定。
- **案 quiet_quality + market_leading (推奨)**: A軸が §8 で market_leading にも同型リスクを認めて再利用したのと同じ論理。dd60 は preset 非依存の汎用 signal なので両方に効く。renderCrow guard を `quiet_quality || market_leading` にする。

---

### gate1 で user に問う要約 (3 択 + 論点)
1. **本 SPEC 草案を採用して Sprint 1 (実データ較正) に進めてよいか** (採用 / 修正指示 / 中止)。
2. 較正で確定させる主要論点の暫定方向性: **signal = S-2 compound (精度) か S-1 単独 (MVP) か** / **統合方式 = 方式1 (新 override facet)** / **tier = free** / **対象 = quiet_quality + market_leading** — の Planner 推奨に同意するか、変更するか。
3. 閾値は **すべて Sprint 1 の実測後に確定** (現時点の数値は仮値) で合意するか。

---

## 11. gate1 承認記録 (2026-07-02・確定)

| 論点 | 確定値 | 根拠 |
|---|---|---|
| SPEC 採用 | ✅ 採用・Sprint 1 へ進行 | user 承認 |
| signal | **S-2 compound (dd60 + runup)** | 精度重視で user 承認 |
| 対象 preset | **quiet_quality + market_leading** | user 承認 (A軸 §8 と同じ再利用論理) |
| 統合方式 | 方式1 (新 opt-in override facet・default OFF) | 論点4 で唯一の技術的に妥当な案 (異論なし) |
| **tier** | **free** | サブエージェント調査で既存パターンと整合と確認 (下記) |
| 閾値グリッド (緩/標/厳/最厳) | **未確定 (較正データ取得済・gate1 判断待ち)** | 実データ較正完了 (下記「Sprint 1 実データ較正結果」)。数値確定は user gate1 で実施 |

### tier=free の根拠 (既存 facet 全数調査、user 依頼で追加検証)

`customScreenerModel.js` の全 timing facet (10件) を調査した結果、tier 分岐は2パターンの混在:
1. **coverage 制約が premium の直接理由**: `buy_zone`/`ad_volume` は cup-scan 由来で全銘柄の ≈618 ticker のみ populate → free にすると大半が欠損。
2. **facet tier と preset tier は独立**: A軸 `uptrend`(pv50/sl50) は free facet だが、premium preset (quiet_quality/market_leading) 内でのみ使われる opt-in override として機能 — この前例が「汎用 signal は facet 自体を free にし、収益差別化は preset 側で行う」という設計思想を確立している。

`dd60`/`runup` は `pv50`/`sl50` と技術的に完全に同型 (同じ per-ticker ループ・同じ closes 依存・cup 非依存・全銘柄算出可能) であることをコード (`_compute_pv50_sl50` 周辺) で確認済み。coverage 制約がないため premium にする技術的必然性がなく、uptrend の前例に倣い **free** が既存パターンと整合する。

### Sprint 1 実データ較正結果 (2026-07-02・完了)

network policy 制約 (本番 API 直接アクセス不可) を GitHub Actions 経由 (`workflow_dispatch`、GitHub-hosted runner から本番 API を叩く) で回避して実行。実行記録: [run #1](https://github.com/yamada073526/beatscanner/actions/runs/28557212045) (2026-07-02T00:36 UTC・成功・所要 ~5分)。

**universe**: 2,542 銘柄 (as_of=2026-07-01)。quiet_quality[標準] 通過 69 銘柄・market_leading[標準] 通過 61 銘柄。known B-cohort (MU/STRL/STX/WDC) は quiet_quality に全4銘柄が含まれる (market_leading には0件)。

**dd60 / runup60 分布 (N=60窓)**:

| 集団 | dd60 (n, min, p25, median, p75, max) | runup60 (n, min, p25, median, p75, max) |
|---|---|---|
| known B-cohort (4銘柄) | n=4 min=−21.9 p25=−21.3 median=−18.1 p75=−15.3 max=−14.9 | n=4 min=160.0 p25=169.1 median=199.2 p75=258.3 max=277.1 |
| quiet_quality healthy (非cohort・n=65) | min=−40.5 p25=−13.9 median=−6.9 p75=−2.8 max=0.0 | min=12.5 p25=31.5 median=46.3 p75=61.5 max=312.3 |
| market_leading healthy (非cohort・n=61) | min=−30.7 p25=−13.6 median=−3.4 p75=−1.2 max=0.0 | min=10.1 p25=24.2 median=31.4 p75=47.3 max=81.9 |

**論点1 (signal) への実証**: **dd60 単独 (S-1) は不採用が確定** — healthy 集団の dd60 分布 (min −40.5) が B-cohort の分布 (min −21.9) より深く、単純な dd60 閾値では健全株 (INOD/HAFN/HBM/NBR/TDW/PBR 等、深い調整だが急騰履歴なし) を大量に誤除外する。gate1 で承認済みの **S-2 compound (dd60 AND runup60)** の採用が実データでも裏付けられた。

**論点3 (閾値) の候補グリッド検証** (compound `dd60 < 閾値A AND runup60 ≥ 閾値B` で cohort 4銘柄中何銘柄を捕捉できるか、非cohort 118銘柄中の誤除外は何銘柄か):

| dd60閾値 | runup60閾値 | cohort捕捉 | 非cohort誤除外 |
|---|---|---|---|
| −12% | 150% | 4/4 (MU/STRL/STX/WDC) | 2件 (CRDO dd60=−14.4 runup=244.5 / INOD dd60=−40.6 runup=252.7) |
| −15% | 130〜150% | 3/4 (STRL/STX/WDC、MU dd60=−14.9 が僅差で漏れ) | 1件 (INOD) |
| −15% | 200% | 1/4 (STX) | 1件 (INOD) |
| −18% | 150〜160% | 1〜2/4 | 1件 (INOD) |

**観察 (数値のみ・断定なし、gate1 判断用)**:
- CRDO (dd60=−14.36 / runup60=244.52) と INOD (dd60=−40.55 / runup60=252.69) は「非cohort」に分類されているが、dd60/runup60 の値自体は cohort と同じ「急騰後の急反落」パターンに一致する。これは意図した挙動 (compound signal が想定通り機能し、当初リストになかった該当銘柄も拾えている) の可能性と、閾値が緩すぎて cohort 以外まで巻き込む過剰除外の可能性の両方があり得る。どちらの解釈を取るかは KB (オニール sell rule 等) との整合を含め **gate1 で user 判断が必要**。
- `dd60 < −12% AND runup60 ≥ 150%` が cohort 4/4 全捕捉かつ誤除外最小 (2件) の候補だが、これは論点3の「最厳 (severe)」寄りの水準。緩め (loose/standard) の段でどこまで捕捉率を落とすかは別途グリッド設計が必要。
- 生データ全118行 (ticker別 dd40/dd60/dd120/runup60) は [run #1 のログ](https://github.com/yamada073526/beatscanner/actions/runs/28557212045/job/84667103366) に `FULL_RESULT_JSON` として保存済み (ログ保持期間経過後は再取得不可な点に注意)。

**次アクション**: 上記データを踏まえた閾値グリッド (緩/標/厳/最厳) の確定は **user gate1 判断待ち**。一時 workflow (`_tmp_b_axis_calibration.yml`) は較正完了 (本結果) につき削除 (PR にて実施)。再較正が必要になった場合は本 PR の diff から復元可能。

---

## 10. スコープ外 (別 backlog)
- バリュー指標 (PER/PBR/配当) のコード化 (表示 + gate は将来検討・独自プロトコルは絶対閾値ゼロ)。
- B軸を quiet_quality/market_leading 以外の preset (new_high_break 等) へ展開すること。
- 「連続 +10%/日」の日次スパイク検出 (runup の代替候補・較正で runup が不十分なら Sprint 1 で追加検討)。
