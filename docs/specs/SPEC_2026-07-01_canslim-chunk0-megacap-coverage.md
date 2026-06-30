# SPEC 2026-07-01: canslim-scan chunk-0 (top-250 mega-cap) coverage reliability 修復

> **種別**: backend reliability bug fix（非 UI / 非 LLM）
> **起票**: Planner（PGE 3 体ループ仕様設計層）
> **diff 方針**: `backend/app/main.py` 最小 diff + `.github/workflows/nightly_scan.yml` の chunk loop / freshness gate 局所修正
> **ground truth**: main が GHA run 28439276429 + live FMP 再現で裏取り済（再導出不要）

---

## 1. Context

### user prompt（原文）
> BeatScanner の backend reliability bug の修正 SPEC を作成。PR #141 (merged) が じっちゃまファンダ条件5「CFPS>EPS」を nightly canslim-scan で `screener_fundamentals.cfps_eps_ratio` に永続化する配線を追加したが、2026-06-30 calc_date で AAPL/MSFT/NVDA を含む大型株 約169件が `cfps_eps_ratio=NULL` かつ `null_reasons` にキーすら無い（= 新コードの success path を一切通っていない = 再処理されていない）。真因は canslim chunk loop の **chunk 0（offset 0-250 = 時価総額トップ250 = mega-cap 群）が universe fetch + batch pre-fetch を同じ 5min gateway 窓で背負って 502 で切られる**こと。cfps 固有でなく chunk-0 構造の reliability bug。

### なぜ今やるか（ground truth 根拠）
- **GHA run 28439276429 canslim step ログ実測**（main が裏取り済、`scratchpad/canslim_run.log` 保存）:
  - `offset=0` のみ `http=502 processed=0 upserted=0`（chunk 0 だけ失敗）
  - `offset=250..2250` は各 `http=200`、`offset=2500` で `processed=82 upserted=79`（universe 実長 ~2582）
  - total `processed=2332`（本来 ~2582 → chunk 0 の 250 が丸ごと欠落）
- **universe 順序の確定**: `_fetch_market_cap_top_n`（`main.py:3998`）+ `_merge_universe_with_anchors`（`main.py:3976`）で **market-cap 降順**。したがって **chunk 0 = AAPL/MSFT/NVDA/AMZN/GOOGL/META/AVGO… の mega-cap 群**が構造的に chunk 0 に集中する。
- **chunk 0 の追加負荷**: `cron_canslim_scan`（`main.py:22886` 付近）冒頭の universe fetch（cache miss）+ batch pre-fetch（yearHigh batch / Layer A PIT pre-load）は **offset=0 の一回限り**だが、per-ticker 処理と同じ 5min gateway 窓に同居するため、per-ticker upsert へ到達する前に Railway の ~5min 502 で切られる。
- **freshness gate の盲点**（`nightly_scan.yml` Freshness gate を main が確認）: `CAN-SLIM as_of >= 前日` でのみ判定。chunk 1-10 が persist すれば as_of は新鮮になり **PASS**。chunk 0（top mega-cap）だけ失敗しても検知不能。issue #27 の chunk 化は「全体 stale」は防ぐが「chunk 0 部分欠落」は検知しない。

### 既読指定（Generator は SPEC §2 で必読）
- 関連 memory: `reference_fmp_api_patterns.md` §「company-screener が大型株を silent に落とす（PR #130）」+「hardcode top200 fallback の落とし穴」
- 関連 memory: `feedback_paged_select_missing_column_trap.md`（PR #141 由来 sf_map merge / item-copy 罠、本 bug と別物だが同 PR 系譜）
- handover: `handover_2026-07-01_v306_screener.md`（PR #144 着地・CFPS>EPS frontend gate 本番検証済）

### 期待される成果（5 原則への貢献）
- **原則 2「毎日開きたくなる」**: 最重要 mega-cap（AAPL/MSFT/NVDA 等）の funda 鮮度が毎晩確実に更新される = 「今何が注目されているか」が正しく出る前提を守る。
- **原則 4「人力の代替」**: 投資家が毎日人力でやる「主力大型株のファンダ確認」を BeatScanner が肩代わりする土台。chunk-0 欠落はこの肩代わりに穴を空ける。
- **直接の成果**: chunk-0 が背負う全カラム（cfps だけでなく EPS surprise / RS 入力 / Layer A guidance / cup signal 等、canslim-scan が書く全フィールド）× top-250 mega-cap の nightly 更新を確実化。

---

## 2. ブランド世界観（Aman/Ritz-Carlton 級）への適合根拠

本 SPEC は backend reliability fix であり直接の visual 変更を持たないが、ブランド世界観の **「洗練さ」** に効く。最高級ホテルのロビー比喩で言えば、これは「フロントの予約台帳が VIP 客（AAPL/MSFT/NVDA = 最も見られる主力銘柄）の情報だけ毎晩抜け落ちる」状態。客（投資家）は気づかないが、いざ照会すると古い情報が出る = ロビーの完璧な振る舞いを内側から崩す欠陥。これを直すことは「画面を見ているだけで楽しい」体験の**前提となるデータ正確性**を守る。`feedback_brand_aspiration.md` の修正禁止 anchor は本 SPEC で一切触れない（UI トークン・発光・色運用に変更なし）。

---

## 3. Trust Cliff チェックリスト

本 bug は **Trust Cliff そのもの**（CLAUDE.md 最重要バグカテゴリ）。LP 訴求文言との整合を 3 項目以上で確認:

1. **「条件5 CFPS>EPS（粉飾リスク低）南京錠フィルタ」訴求 vs 実装**: PR #144 で frontend gate が live。しかし chunk-0 欠落により AAPL/MSFT/NVDA が `cfps_eps_ratio=NULL` のまま → フィルタ適用時に **mega-cap を silent 除外**。「主力大型株がスクリーナーに出ない」= LP の「優良大型株を毎日チェック」訴求と矛盾。**本 SPEC の核心的整合対象**。
2. **「毎日更新」訴求 vs nightly 更新の穴**: 動的データには「最終更新 X 分前」を併記する CLAUDE.md ルールに対し、chunk-0 銘柄は as_of が新鮮に見えて実体が stale（前回成功時の古い値を保持）。表示鮮度と実体鮮度の乖離 = Trust Cliff。
3. **「3 銘柄/日まで無料」「登録不要」**: 本 SPEC は backend scan の coverage 修復のみで、demo rate limit / 認証境界 / 課金 tier gate に一切触れない（これらの文言とは無関係・矛盾なし）。
4. **§38「で、買いですか?」境界 / 件数 SSOT**: 本 SPEC は数値の鮮度を回復するだけで、色信号ルール・件数 SSOT・断定的将来予測の境界に変更を加えない（不変）。

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **NO**。
- 本 SPEC は **canslim chunk loop の coverage 修復 + freshness gate 強化のみ**。LLM narration / 数値生成は一切追加しない。
- cfps_eps_ratio 等の数値は既存の Python 純関数（`_compute_cfps_eps_ratio_from_metrics`、PR #141 で配線済・main が live FMP で再現確認済）で算出され、本 SPEC はその純関数の **実行到達性**（chunk 0 が success path を通るか）を直すのみ。計算式・配線・純関数自体は修正対象外。
- **aggregator パッケージは数値物理層**: `backend/app/aggregator/*.py` への LLM SDK import は pre-commit Check 3 で BLOCK。本 SPEC は aggregator に LLM を一切入れない（そもそも触らない）。
- 結論: **LLM 不要、Python 計算 + GHA shell + DB upsert で完結**。Hallucination Guard 4 重防御は本 SPEC に non-applicable（既存防御を破壊しないことのみ要件）。

---

## 5. スプリント分割（推奨案ベース、上限 6 / 本 SPEC は最大 2 sprint）

### 推奨 fix の決定（§5 冒頭で trade-off を明示してから sprint 化）

候補 4 案を blast radius で評価し、**(a) chunk 0 前処理分離 を主軸、(b) chunk retry + (d) mega-cap freshness gate 強化 を併用**を推奨する。各案評価は本セクション末尾「候補 fix trade-off 分析」に詳述。

> **推奨の 1 行サマリ**: chunk-0 の重い前処理（universe fetch + batch pre-fetch）を per-ticker chunk から切り離し（案 a）、加えて canonical mega-cap（AAPL/MSFT/NVDA）の funda 鮮度を freshness gate で hard-fail 化（案 d）して **二度と silent 欠落しないようにする**。retry（案 b）は安価な保険として GHA step に追加。

---

### Sprint 1 — chunk-0 前処理分離 + 失敗 chunk retry（reliability の本丸）

**目的**: chunk 0（top-250 mega-cap）が universe fetch + batch pre-fetch を 5min 窓で背負って 502 する構造を解消し、mega-cap の per-ticker success path 到達を保証する。

**触るファイル**:
- `backend/app/main.py` — `cron_canslim_scan`（`22886` 付近）の前処理経路。**最小 diff**。Generator は「どう分離するか」を以下 2 方針から選定（前提を明記して 1 案を推奨せよ。設計詳細は Generator 裁量）:
  - 方針 A（推奨候補）: universe fetch + batch pre-fetch（yearHigh batch / Layer A PIT pre-load）を **offset 値に依存させず**、全 chunk が cache を共有する構造にして chunk 0 の固有負荷を消す。ただし cache miss コストは依然 chunk 0 に乗るため、**warmup endpoint / pre-fetch 専用呼出**で nightly 本体の前に prime する案も検討。
  - 方針 B: chunk 0 のみ batch pre-fetch を skip し、per-ticker fetch に fallback させる（pre-fetch 不在でも正しく動くなら前処理を chunk 0 から外せる）。
  - ※ どちらも **per-ticker upsert ロジック・null_reasons 不変条件（`main.py:23836-23837`）・cfps 純関数を一切変えない**こと。
- `.github/workflows/nightly_scan.yml` — canslim chunk loop（`176-194` 付近）。`http != 200` または「実 universe 範囲内なのに processed=0」の chunk を **1-2 回 retry**（特に chunk 0）。既存の「502 でも次 chunk 継続（per-ticker 増分 persist）」設計は壊さず、retry を**その上に重ねる**。

**呼ぶ既存 skill**:
- `pge-loop-debugger`（Generator 起動前の落とし穴 4 件チェック。特に「sprint 累積なし」「捏造報告」）
- `fmp-api-retry`（batch pre-fetch を触る場合の FMP retry / rate limit 規律確認）
- `hallucination-guard` は **non-applicable**（LLM なし）だが、aggregator/visualizer を**触らないこと**の確認用に Generator が 1 度 self-check。

**完了判定基準**（ground truth・LLM 不可）:
1. `pytest` 新規テスト PASS（前処理分離が per-ticker 結果を変えないことの unit test。§4 検証計画参照）
2. 小 universe（`universe_size=80` 等）or tickers 指定 scan を流し、`processed_count == 対象件数`（chunk 0 相当が 0 にならない）
3. tickers 指定 scan（AAPL/MSFT/NVDA を含む）後、Supabase で 3 銘柄の `cfps_eps_ratio` が non-null + `null_reasons` 不変条件を満たすことを **DB 直確認**
4. full nightly 相当 run で **全 chunk `http=200`**（特に offset=0）かつ `total processed ≈ universe 実長`

---

### Sprint 2 — mega-cap freshness gate 強化（chunk-0 欠落の hard-fail 化）

**目的**: chunk-0 部分欠落を二度と silent に通さない。canonical mega-cap の funda 鮮度を freshness gate で明示チェックし、欠落時は GHA job を hard-fail させる。

**触るファイル**:
- `.github/workflows/nightly_scan.yml` — Freshness gate step（`as_of >= yday` の chk 群）。canonical mega-cap（例: AAPL / MSFT / NVDA、Generator が universe top の安定銘柄から 2-3 個選定し前提明記）の cfps/funda 鮮度を read endpoint（`/api/scanner/universe` or `/api/scanner/canslim`）で取得し、**前日より古ければ `::error::` + `fail=1`** にする chk を追加。
- **backend 側に新 endpoint は原則追加しない**（既存 read endpoint の payload に mega-cap の calc_date / cfps_eps_ratio が乗っているか Generator が確認。乗っていなければ §8 で escalate、安易に新 endpoint を作らない）。

**呼ぶ既存 skill**:
- `pge-loop-debugger`（freshness gate の selector / jq path hallucination 防止）

**完了判定基準**:
1. chunk 0 を意図的に欠落させた状態（offset=0 を skip した scan を模擬 or 過去の stale 状態）で freshness gate が **fail する**ことを確認（false-negative を潰す）
2. 正常 nightly で freshness gate が **PASS**（false-positive を出さない）
3. gate の error メッセージが「どの mega-cap が stale か」を `$GITHUB_STEP_SUMMARY` に出力（人間が翌朝即原因特定できる）

> **sprint 順序**: Sprint 1（根治）→ Sprint 2（検知強化）の順。Sprint 1 だけでも mega-cap は復活するが、Sprint 2 が無いと「次に別要因で chunk 0 が落ちても気づけない」ため、両方を本 SPEC スコープとする。**Sprint 2 は Sprint 1 の DoD 確認後に着手**（PGE 落とし穴「sprint 累積なし」回避: 各 sprint を独立 PR で着地）。

---

### 候補 fix trade-off 分析（4 案 + blast radius）

| 案 | 内容 | 効果 | blast radius / リスク | 採否 |
|---|---|---|---|---|
| **(a) 前処理分離** | universe fetch + batch pre-fetch を per-ticker chunk から切り離す（warmup 呼出 or chunk 0 を pre-fetch 専用化） | **根治**。chunk 0 の固有負荷を消し、mega-cap が success path に到達 | `cron_canslim_scan` の中規模改修。per-ticker ロジックを変えなければ他 scan に無影響。設計を誤ると pre-fetch 不在で per-ticker が遅くなる risk | **推奨（主軸）** |
| **(b) 失敗 chunk retry** | GHA step 側で `http!=200` or `processed=0`（範囲内）の chunk を 1-2 回 retry | **安価な保険**。502 が一過性なら救済 | `nightly_scan.yml` 局所。wall time 増（retry 分）。根本の重さは消えないため retry も 502 し得る | **推奨（併用・保険）** |
| **(c) chunk 0 だけ小さく** | pre-fetch を背負う chunk 0 のみ CHUNK=50 等に縮小 | 簡易。chunk 0 の per-ticker 数を減らし 5min 内完走を狙う | `nightly_scan.yml` 局所。**根本未解決**（pre-fetch コスト自体は残るため依然 502 risk・universe 巨大化で再発）。chunk 境界が複雑化 | **不採用**（a の劣化版・根治せず） |
| **(d) freshness gate 強化** | canonical mega-cap の funda 鮮度を hard-fail 化 | **検知**。silent 欠落を必ず可視化 | `nightly_scan.yml` 局所。修復はしない（検知のみ）ため a/b と**併用必須** | **推奨（併用・検知層）** |

**blast radius 詳細（`_fetch_market_cap_top_n` 共有・最重要）**:
- `_fetch_market_cap_top_n`（`main.py:3998`）は **rs-scan / cup-scan / canslim-scan / earnings-annual-scan / backtest が共有**（main が grep 確認: 17190 / 18028 / 22885 / 22987 等）。
- **universe の順序（market-cap 降順）は変更しない**こと。順序を変えると:
  - RS percentile は **集合演算（universe 全体の percentile rank）なので順序無影響**。
  - **cup / canslim / earnings-annual の chunk 割当が変わる**（chunk N に入る銘柄集合が変わる）→ 別の銘柄群が chunk 境界の負荷を背負う risk。
  - したがって **推奨案 (a) は「前処理を chunk から外す」ことで負荷を消す方向**であり、**universe 順序・chunk サイズ・chunk 割当は不変**に保つ（順序変更による副作用を回避）。
- anchor union（`_merge_universe_with_anchors`、PR #130）の挙動も不変に保つ（mega-cap が chunk 0 に来る構造はそのまま、それを安全に処理できるようにするのが本 SPEC）。

---

## 6. 触ってはいけないファイル一覧（Generator への禁止指示）

以下を**変更禁止**（本 SPEC のどの sprint でも触らない）:

- `backend/app/visualizer/prompt.py`（Hallucination Guard pre-commit Check 1）— **本 SPEC では触らない**
- `backend/app/aggregator/*.py` への LLM SDK import（pre-commit Check 3）— **本 SPEC では触らない**（aggregator 自体に変更を加えない）
- `backend/app/visualizer/prompt_negatives.py`（法務 anchor）— **本 SPEC では触らない**
- `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX`（typo 修正のみ可だが本 SPEC では不要）— **触らない**
- `.claude/launch.json`（人間用）— **触らない**
- `migrations/*.sql`（DB schema）— **触らない**（cfps_eps_ratio カラムは PR #141 で migration 済。本 SPEC は coverage 修復のみで schema 不変）
- `handover_*.md`（read-only reference）— **read のみ**
- `railway.toml` cron 定義— **触らない**（nightly は GHA workflow が cron 主体。railway.toml の warm cron は別系統）
- `frontend/src/App.jsx` の sticky 検索 div（8 回試行錯誤の安定領域）— **触らない**（frontend 変更なし）
- `.panel-card / .bs-panel / .surface-card` 関連 CSS（発光バグ高リスク）— **触らない**（CSS 変更なし）

**さらに本 SPEC 固有の禁止**:
- `cron_canslim_scan` の **per-ticker upsert ロジック / null_reasons 組立 / `cfps_eps_ratio` 純関数**（PR #141 配線済・正常）— **変更禁止**。本 SPEC は「success path への到達性」だけを直す。
- `_fetch_market_cap_top_n` / `_merge_universe_with_anchors` の **universe 順序・anchor union ロジック**— **変更禁止**（共有 fetch のため blast radius 大）。
- 既存 chunk 化（issue #27 の gateway 502 対策・CHUNK=250）の**意図を壊さない**。chunk 機構自体は維持し、その上に修復を重ねる。
- §38 色ルール・件数 SSOT — **不変**。

---

## 7. multi-review 必要性判定

CLAUDE.md「6 体 vs 3 体」3 軸を本 SPEC に適用:

1. **LLM 出力品質（景表法 / 金商法 / hallucination）**: **inactive**（本 SPEC に LLM なし・数値生成なし）
2. **Trust Cliff（LP 訴求 vs 実装の整合）**: **active**（mega-cap silent 除外 = LP「優良大型株を毎日チェック」訴求と矛盾、CLAUDE.md 最重要バグカテゴリ）
3. **新 backend endpoint + RLS / 認証境界 + cache 設計 / blast radius**: **active**（`cron_canslim_scan` 前処理改修 + `_fetch_market_cap_top_n` 共有 fetch の blast radius が rs/cup/canslim/earnings/backtest に及ぶ・nightly reliability の構造変更）

→ **3 軸のうち 2 軸（Trust Cliff + blast radius）が active → 6 体合議を推奨**。

ただし本 SPEC は **LLM 不在・frontend 不変・schema 不変**で軸 1 が完全 inactive のため、6 体の構成は **backend reliability + Trust Cliff に重心**を置く:
- **Opus 指定（2 体）**: frontend-architect（backend reliability / blast radius 設計判断）+ qa-dogfooder（Trust Cliff / mega-cap silent 除外検証）
- **Sonnet 並列（残り）**: ui-designer は本件 UI 不変のため **省略可**、代わりに「FMP / universe fetch の落とし穴」観点（reference_fmp_api_patterns 精通）reviewer を 1 体。

> **判定結論**: **6 体合議を推奨**（Trust Cliff + blast radius の 2 軸 active）。ただし LLM 軸 inactive のため reviewer 構成を reliability 重心に調整（金融 verdict / マーケ 軸は薄め可）。**実装着手前の設計 gate** と **PR ship 前の最終 gate** の 2 点で multi-review を通す。

---

## 8. 想定リスク + roll-back plan

### このスプリントが失敗したとき何が壊れるか
- **Sprint 1（前処理分離）失敗時の最悪ケース**:
  - batch pre-fetch を誤って全 chunk から外すと、per-ticker fetch が増えて **全 chunk の throughput 低下** → 複数 chunk が 502（chunk 0 だけでなく全体悪化）。
  - 前処理分離が per-ticker 結果を変えると、cfps / EPS surprise / Layer A guidance の **数値が変わる**（Trust Cliff 再発）。→ pytest + DB 値突合で検出必須。
  - `_fetch_market_cap_top_n` を誤って触ると **rs/cup/earnings/backtest に波及**（共有 fetch）。
- **Sprint 2（freshness gate）失敗時**:
  - gate が false-positive で正常 nightly を fail → nightly job が毎晩落ちる（ただし scan 自体は完走するため DB は更新される・運用 alert ノイズに留まる）。
  - false-negative（chunk 0 欠落を見逃す）は元の状態に戻るだけ（退行なし）。

### 緊急 roll-back 手順
1. **PR 分離が前提**: Sprint 1 / Sprint 2 を **独立 PR** で着地（CLAUDE.md「最小 diff / PR 分離」）。問題発生時は該当 PR のみ revert。
2. **backend roll-back**: `cron_canslim_scan` の改修が問題なら `git revert <sprint1 commit>` → `git push origin main` → Railway auto-deploy（~30s）。`/health` の `commit`（RAILWAY_GIT_COMMIT_SHA）で revert 反映確認。
3. **GHA roll-back**: `nightly_scan.yml` の retry / freshness 強化が問題なら、workflow file のみ revert（backend deploy 不要・次回 nightly から旧挙動）。
4. **検証順序**: revert 後、小 universe scan を 1 回流して `processed_count` と DB 値が **PR #141 着地時点と一致**することを確認（退行ゼロの証明）。
5. **nightly が落ち続ける緊急時**: freshness gate を `continue-on-error: true` で一時 soft-fail 化（chk の `fail=1` を warning 降格）→ 翌日に根本修正。

### roll-back の安全性
- 本 SPEC は **schema 不変・frontend 不変・LLM 不変**のため、roll-back の blast radius は backend scan 経路と GHA workflow に限定。DB データは upsert（破壊的 DROP/DELETE なし）のため、revert 後も既存行は保持される（最悪でも「chunk 0 欠落の元の状態」に戻るだけ・データ消失なし）。

---

## 付録: ground truth コマンド（Generator / Evaluator の検証用）

```bash
# chunk 0 mega-cap の cfps 鮮度（修復後 non-null になるべき）
curl -s "https://beatscanner-production.up.railway.app/api/scanner/universe?universe_size=3000" \
  | jq '[.items[]|select(.ticker=="AAPL" or .ticker=="MSFT" or .ticker=="NVDA")|{t:.ticker,cfps:.cfps_eps_ratio}]'

# canslim scan の全 chunk http（GHA log・特に offset=0）
gh run view 28439276429 --log | grep -E '\[canslim\] offset='

# DB 直確認（Supabase MCP / SQL）: 2026-06-30 calc_date で cfps NULL かつ null_reasons にキー無しの mega-cap
#   SELECT ticker, cfps_eps_ratio, null_reasons->'cfps_eps_ratio'
#   FROM screener_fundamentals WHERE calc_date='2026-06-30' AND cfps_eps_ratio IS NULL;
```

---

## 厳守事項サマリ（Generator への最終 inject）

1. `backend/app/main.py` は **最小 diff**（`cron_canslim_scan` 前処理のみ・per-ticker / null_reasons / cfps 純関数 不変）
2. **PR 分離**（Sprint 1 / Sprint 2 を独立 PR で着地）
3. **multi-review gate**（6 体推奨・着手前設計 gate + ship 前最終 gate の 2 点）
4. **§38 色ルール・件数 SSOT 不変**
5. **aggregator は LLM 不可**（pre-commit Check 3・本 SPEC は aggregator を触らない）
6. **既存 chunk 化（issue #27 gateway 502 対策）の意図を壊さない**（chunk 機構維持・universe 順序不変・CHUNK 割当不変）
7. 検証は **ground truth**（pytest + 小 universe / tickers 指定 scan + Supabase DB 直確認 + 全 chunk http=200）。LLM 判定・grep ヒットを「機能した」の証拠にしない
