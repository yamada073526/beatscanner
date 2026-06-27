# SPEC 2026-06-27: スクリーナー Layer A consensus pre-load（§5-6 正式設計化）

> **位置づけ**: 既存 `docs/specs/SPEC_2026-06-27_screener-guidance-layer-a.md` の **§5-6「将来 coverage 拡大（別 backlog）」を正式設計化**する。
> Layer A 本体（来期2列 = 会社ガイダンス vs 発表直前コンセンサス比）は S1-5 まで LIVE。本 SPEC は **その実データ coverage を実データで上げる backend cron 拡張のみ**を扱う（frontend / schema / LLM は一切触らない）。
> **planner 起票**（PGE 3 体ループ 仕様設計層）。下流 Generator は「どう作るか」を担う。本 SPEC は「何を / なぜ / どの順で」に限定する。

---

## 1. Context

### user prompt 原文
> スクリーナー Layer A の実データ coverage（現状 0/140=0%）を上げるため、会社が 8-K ガイダンスを filed する「前」の consensus_snapshot を確保する backend cron 拡張。

### なぜ今やるか（handover / 実査からの根拠）
- **Layer A 本体は完成済だが「空回り」状態**: `_compute_layer_a_surprise`（main.py:22239）+ batch pre-load `_build_layer_a_maps`（main.py:22183）が LIVE（PR #47/#48/#49/#50、本番 commit `81c4a032149c`）。純関数も frontend dot+tooltip も全部動く。**しかし実データが 0 件**。
- **0% の真因（handover v281 §🔴 de-risk・DB 実査で確定）**: Layer A 成立条件 = guidance の `filed_at` **直前**の consensus_snapshot（PIT = point-in-time）が存在し非 stale。`classify_pit_consensus`（aggregator/guidance_history.py）が `snapshot_date < filed_at` で判定。consensus_snapshots は cron 始動が **2026-06-06** と新しく時系列が浅い + universe が「まもなく決算」銘柄を含まないため、企業が報告した時点で filed_at 前の snapshot が無い → 直近30日報告 **140 件中 Layer A 0 件（coverage 0%）**。
- **default ON gate（既存 SPEC §12-4）= 直近30日報告銘柄の Layer A coverage 60%+**。現状 0% で HOLD。screener_v2 flag の default ON 昇格（funnel-cro gate）がこの coverage に block されている。
- **PIT 設計そのものは正しく機能している**（washout 回避）。問題は「発表前 snapshot のストック不足」という時系列・運用の問題であり、本 SPEC が直す対象はそこ。

### 期待される成果（5 原則への貢献）
- **原則 4「1 クリックを減らせ（北極星: 人力の代替）」**: 「会社ガイダンス vs 発表直前のアナリスト予想」を投資家が手作業で（IR ページ + Bloomberg/FactSet で）照合する手間を、Layer A が肩代わりする。その肩代わりが「実データで成立する」状態を作るのが本 SPEC。**これは情報の足し算でなく人力作業の代替**（CLAUDE.md 原則 4 北極星の 1 問 = Yes）。
- **原則 1「読み手に負担をかけない」**: 来期2列が「—」ばかりで意味を成さない現状を、実データ充足で「2 秒で会社の自信度がわかる」状態へ近づける。
- **間接的に原則 2「毎日開きたくなる」**: coverage 充足 → screener_v2 default ON 昇格 → スクリーナーの情報密度向上。

### 関連 memory（Generator 必読指定）
- `project_screener_earnings_flash_row.md`（Layer A 節 + Sprint3 deploy + de-risk 記録・本機能の最上位 SSOT）
- `project_guidance_history_foundation.md`（PIT consensus の構造的限界・§38 境界・consensus は現在値のみで PIT API なし）
- `reference_fmp_api_patterns.md`（FMP 落とし穴 SSOT）/ `fmp_plan_naming.md`（Ultimate $149/月・/stable）
- `feedback_llm_calc_separation.md`（数値=Python / narration=LLM 物理分離）
- 既存 SPEC `SPEC_2026-06-27_screener-guidance-layer-a.md`（§5 イベント駆動 cron 設計・§5-6 backlog 記述）

---

## 2. ブランド世界観（Aman / Ritz-Carlton 級）への適合根拠

本 SPEC は **backend cron 拡張のみで UI を一切変えない**ため、視覚的世界観への直接の効きは無い。ただし間接的に **「驚き（surprise）」と「洗練さ（sophistication）」** に効く。

「最高級ホテルのロビー」の比喩で言えば、Layer A は「コンシェルジュが客（投資家）の代わりに事前に下調べを済ませて差し出す一枚のメモ」。今はそのメモが白紙（「—」）で出てくる = コンシェルジュが仕事をしていない状態。本 SPEC は **コンシェルジュが客の到着前（= 決算発表前）に下調べ（consensus snapshot 確保）を済ませる仕込み**にあたる。客が来てから慌てて調べる（事後 consensus）のは「発表後にアナリストが織り込んだ後の washout 値」=不正確で、ロビーの品格に反する。**「発表前に静かに準備が完了している洗練さ」** がこの仕込みの世界観的価値。

`feedback_brand_aspiration.md` の修正禁止 anchor は本 SPEC では一切触れない（UI 文言・色・修飾語の変更ゼロ）。

---

## 3. Trust Cliff チェックリスト

LP / UI 訴求文言との整合を 3 項目以上で確認する。本 SPEC は backend のみだが、coverage が上がると frontend で実 Layer A 行が出始めるため、**最終的に見える文言**との整合を planner 段階で固定する。

1. **「会社ガイダンスがコンセンサスを上回った（事実）」表記との整合**: Layer A の tooltip/値は「会社が来期ガイダンスを開示・発表直前のアナリスト予想との差を算出」という**事実の転記**。本 SPEC で確保する snapshot は **発表直前の予想 avg/high/low + アナリスト数の事実のみ**（narration なし）。文言と中身が 1:1 で一致する → 整合 OK。
2. **「買いシグナル」を出さない（§38）との整合**: 本 SPEC は数値物理層の snapshot を増やすだけで、UI に新しい断定文言・色を一切追加しない。Layer A dot は `--text-secondary`（絶対中立色・gold/緑/赤厳禁、既存確定）。**coverage が上がっても色・文言は不変** → §38 違反の新規発生なし。
3. **「来期2列ガイダンス比」見出しと中身の一致（既存 Trust Cliff 解消の維持）**: 既存 frontend は「ガイダンスあり→ガイダンス比 / なし→Layer B fallback / 両なし→『—』」のハイブリッド。本 SPEC で Layer A 行が増えると、見出し「ガイダンス比」に対し**実際にガイダンス比の値が入る行が増える** = 見出しと中身の乖離が**縮小する方向**（Trust Cliff 改善）。新たな乖離は生まない。
4. **「無料お試し / 登録不要 / 3 銘柄/日」系の LP 訴求**: 本 SPEC は demo / rate limit / 課金境界に一切触れない → **N/A: 該当なし**。

---

## 4. Hallucination Guard 適合

- **LLM 呼び出しを含むか**: **No**。
- **根拠**: 本 SPEC が拡張する `cron_consensus_snapshot`（main.py:18109）は FMP `analyst-estimates` を取得して `consensus_snapshots` に upsert する**数値物理層**。`aggregator/consensus_history.py`（`@no-llm`）経由で、LLM SDK import は pre-commit Check 3 で物理 BLOCK 済。本 SPEC で増えるのは「予想 avg/high/low + アナリスト数」という**検証可能な事実 row のみ**。narration は一切生成しない。
- **「LLM 不要、静的 dictionary / Python 計算で完結」と明記**: そのとおり。snapshot は FMP の数値をそのまま格納するだけ。Layer A の % 算出も既存 `_compute_layer_a_surprise`（純関数・LIVE）が担い、本 SPEC は **入力データ（PIT snapshot）の充足のみ**を行う。
- **§38 厳守**: 蓄積する snapshot に action 示唆・将来予測・最上級表現を一切持たせない（既存 cron の docstring §38 注記を継承）。

---

## 5. スプリント分割（上限 6・本番運用済プロダクトのため小さく）

> **設計の中核判断（universe 取得方式）を Sprint 1 で先に確定**してから cron を拡張する。動画原典の「Planner が誤った前提を下流へ伝播させる」教訓を回避するため、**FMP call 数・確実性の trade-off を Sprint 1 の調査で ground-truth 化**してから実装に入る。

### 【最重要設計制約・全 Sprint に inject】FMP /earnings-calendar range fetch の欠落罠
- **罠**: `FMPClient.earning_calendar`（fmp_client.py:64）の range fetch は **~4000 件/range 上限**で、決算ピーク期（7-8 月）に **range 後半の日付の銘柄が欠落する既知の罠**（main.py:1565 付近コメント、v172 で holdings-meta を per-ticker `/stable/earnings`=`earnings_surprises` に置換して解消済）。
- **本 SPEC への影響**: 「まもなく決算」universe をこの range fetch で作ると **同じ欠落が起きる** → 欠落した銘柄は pre-load されず Layer A が成立しない（**coverage を上げるはずが silent 歯抜けを作る = 本末転倒**）。
- **2 つの既存方式**（コード実査済、Sprint 1 で trade-off を確定する）:
  - **方式 A: range fetch（`earning_calendar`）** — 1 回の call で全銘柄。罠 = ピーク期欠落。main.py:14085 で実使用中（100 日窓 + client-side filter）。
  - **方式 B: per-ticker `/stable/earnings`（`earnings_surprises`、main.py:1596 `next_earnings`）** — 罠回避済（v172 で確立）。欠点 = call 数が universe サイズ分かかる。
  - **方式 C: 既存 `screener_fundamentals` に next earnings 情報があるか調査** — あれば追加 FMP call ゼロで「まもなく決算」を絞れる（Sprint 1 で grep + DB 実査）。
- **planner の暫定推奨**（Sprint 1 で覆りうる）: **方式 C を最優先で調査 → 無ければ方式 B（per-ticker、罠回避確実）を「まもなく決算 universe の絞り込み」だけに使い、件数を bound してから consensus fetch**。方式 A は欠落罠のため非推奨。**最終決定は Sprint 1 の ground-truth に従う**。

---

### Sprint 1: universe 取得方式の確定（調査 + 設計判断のみ・コード変更最小）
- **目的**: 「まもなく決算」universe をどの方式で作るか、**FMP call 数・確実性・コストの trade-off を ground-truth で確定**する。実装の前提を固める最重要 Sprint。
- **触るファイル**: なし（調査主体）。判断結果を本 SPEC に追記（§5 末尾に「確定方式」セクション）。
- **呼ぶ既存 skill**: `fmp-api-retry`（FMP fallback / plan 上限 / `/stable/` base URL の SSOT）/ `screener`（screener_fundamentals の SSOT）。
- **調査項目**:
  1. `screener_fundamentals` に next earnings date 系カラムがあるか（grep `next_earnings` + DB 実査 = 方式 C 可否）。なければ `last_report_date` から「四半期サイクル + 90 日」で次回決算を**推定**できるか検討。
  2. 方式 B の per-ticker `/stable/earnings` で next earnings date が確実に取れるか（main.py:1596 `next_earnings` の実装を確認、空率を実測）。
  3. 「まもなく決算」窓を N 日とした時の対象件数見積もり（screener universe ~2500 のうち N=7 で何件、N=14 で何件か）。
- **完了判定基準**: 方式 A/B/C のいずれかを **call 数・確実性・月コスト見積もり付きで確定**し、本 SPEC §5 に「確定方式 = X、理由 = …」を追記。user 承認（gate）。
- **blast radius**: なし（調査のみ）。**rollback**: 不要。

### Sprint 2: 「まもなく決算」universe を consensus cron へ追加（5 番目の source）
- **目的**: `_build_consensus_universe`（main.py:18011）の 4 source 和集合（保有∪WL∪RS≥90∪Cup-Handle）に **5 番目の source「まもなく決算（次回決算まで N 日以内）」を追加**し、発表前 snapshot のストックを開始する。
- **触るファイル**: `backend/app/main.py`（`_build_consensus_universe` に 5 番目の独立 try/except source を追加・既存 4 source は不触）。Sprint 1 で方式 B/C なら FMP client は既存メソッド再利用。
- **呼ぶ既存 skill**: `fmp-api-retry`（新 source 追加時の fallback）/ `screener`。
- **設計判断**:
  - **窓 N 日**: 報告の filed_at 前に snapshot を持つには、決算予定日の数日前〜当日に snapshot 済が必要。**暫定 N=7**（次回決算まで 7 日以内）。nightly cron 頻度で「決算 7 日前〜前日」に最低 1 回は snapshot される。Sprint 1 の件数見積もりで N=7/14 を最終確定。
  - **cron 頻度**: nightly（既存 `nightly_consensus.yml` 23:40 UTC）で十分か判断。N=7 窓 + nightly = 決算前に 7 回の snapshot 機会 → 1 回でも成功すれば filed_at 前 snapshot 成立。**nightly のまま据え置きを暫定推奨**（新 cron 追加は blast radius 増・cold start 懸念）。
  - **件数 bound**: 5 番目 source は「まもなく決算」で絞るため、screener universe ~2500 全件でなく N 日窓で数十〜数百件に bound（コスト制御）。
- **完了判定基準**: GitHub Actions `nightly_consensus.yml` の `dry_run=true` workflow_dispatch で **`by_source` に「upcoming_earnings: M」（M>0）が出現**し、universe_size が増えること。supabase MCP で「まもなく決算」銘柄が実際に絞り込まれているか件数照合。
- **blast radius**: consensus cron の universe 拡大 = FMP analyst-estimates call 増（N 日窓分）。既存 4 source / retention / upsert / Semaphore は不触。**rollback**: 5 番目 source の追加 block を no-op（既存 4 source に戻すだけ）= `git revert` 1 commit。

### Sprint 3: 蓄積検証 + coverage 計測の足場 + DoD 即時指標化
- **目的**: pre-load が実際に「まもなく決算」銘柄の snapshot を増やしているかを検証し、**coverage 60% を待たずに即時検証可能な DoD 指標**を確立する。
- **触るファイル**: なし（検証主体）。必要なら検証スクリプト（`backend/tests/` の既存 test 拡張 or supabase MCP query）。
- **呼ぶ既存 skill**: `screener`（coverage query SSOT）/ `pge-loop-debugger`（検証規律）。
- **検証**:
  - canonical coverage query（既確立）で `reported_30d` / `layer_a_30d` を継続計測（実データ蓄積は forward 決算待ちで時間がかかるため、**60% 自体は時間経過後の再判断**とする）。
  - **即時検証可能な DoD 指標**（本 SPEC の真の完了基準）:
    1. **pre-load universe が「まもなく決算」銘柄を正しく含むこと**（dry_run の `by_source` で upcoming_earnings>0 + 実銘柄が決算 N 日以内であることを supabase MCP で抽出照合）。
    2. **consensus_snapshots の行数が pre-load 分だけ増えること**（cron 実行前後の count 差分が「まもなく決算」件数とおおむね一致）。
    3. **次に決算を迎える銘柄が、決算日より前の snapshot_date を持つこと**（= filed_at 前 PIT が将来成立する前提が満たされる）。
- **完了判定基準**: 上記 3 指標が PASS。coverage 60% は「forward 決算が数件成立した後に再計測 → user に再判断材料を提示」と明記して **時間軸を分離**（虚偽の「coverage 達成」報告を避ける = CLAUDE.md 正直さ規律）。
- **blast radius**: なし（検証のみ）。**rollback**: 不要。

> **Sprint 上限内で完結**（3 Sprint）。frontend / schema / LLM を一切触らないため、Sprint 4-6 は不要。coverage 60% 達成後の screener_v2 default ON 昇格は **別 SPEC（funnel-cro gate）** に委ねる。

---

### 【確定方式】Sprint 1 ground-truth 結果（2026-06-27・supabase MCP 実査）

**結論 = 方式 C（last_report_date からの推定窓）を単独採用。方式 A / B は不採用。**

#### 実査値（latest calc_date・screener_fundamentals 全 2393 行）
- `last_report_date` は **2393/2393 = 100% populated**（推定の前提が全行で成立）。
- next earnings 系カラムは screener_fundamentals に**存在しない**（backend grep 0 件）→ 方式 C は「保存済の next earnings」でなく **`last_report_date` + 四半期サイクルからの推定**で実現する。
- 「まもなく決算」候補件数（次回決算 ≈ `last_report_date + 91日` を基準）:

  | 窓の定義 | 件数/night |
  |---|---|
  | 推定+91日 が今日〜+7日 | 8 |
  | 推定+91日 が今日〜+14日 | 21 |
  | 報告後 77-98 日経過（推定±1週） | 25 |
  | **報告後 70-98 日経過（推定±3週）** | **76** |

#### 3 方式の trade-off（確定）
| 方式 | candidate 識別の FMP call | range-fetch 欠落罠 | 確実性 | 判定 |
|---|---|---|---|---|
| A: `earning_calendar`(range) | 1 call | **該当（ピーク期欠落）** | 低（silent 歯抜け） | ✗ 不採用 |
| B: per-ticker `/stable/earnings` 全件 | **~2393 calls/night**（識別だけで） | 回避済 | 高 | ✗ 過大コスト |
| **C: `last_report_date` 推定窓** | **0 call**（DB のみ） | **完全回避**（earning_calendar 不使用） | 中（推定誤差は窓幅で吸収） | **✓ 採用** |

#### 確定パラメータ
- **candidate 条件 = 報告後 70-98 日経過**（`CURRENT_DATE - last_report_date::date BETWEEN 70 AND 98`）。= 次回決算が概ね「今日〜+3週」= 推定誤差を吸収した「まもなく決算」。**実測 76 件/night**。
  - N=7（8 件）は狭すぎ、推定誤差（不規則スケジュール企業）で filed_at 前 snapshot を miss するリスク高。**広めの 70-98 窓 + nightly 反復**で「決算前に最低 1 回は snapshot」を担保する設計。
- **FMP コスト**: candidate 識別 = **追加 call ゼロ**（screener_fundamentals は既に nightly populate 済の DB）。consensus fetch のみ candidate 件数 × 2（quarter+annual）= **~152 calls/night 増**。既存 universe（数百〜千件規模）に対し小。月コスト増は analyst-estimates 単価 × ~152 × 30 で**無視できる水準**（既存 consensus cron と同 FMP plan・Ultimate）。
- **方式 B の補助利用は Sprint 2 では行わない**: 推定窓で十分。Sprint 3 検証で「決算前 snapshot 成立率」が低い場合のみ、candidate(~76)に限定して `/stable/earnings` で next earnings を確認し窓を精緻化する（+76 calls・将来 backlog）。
- **冪等性**: 同一 candidate が複数夜 universe に入っても、consensus upsert は `SNAPSHOT_CONFLICT_KEYS` で idempotent（snapshot_date 単位で refresh）→ PIT 粒度が増えるだけで無害。

> Sprint 2 はこの確定方式（報告後 70-98 日窓・DB のみで candidate 識別）で `_build_consensus_universe` に 5 番目 source `upcoming_earnings` を追加する。

---

## 6. 触ってはいけないファイル一覧（Generator への禁止指示）

| ファイル / 領域 | 本 SPEC での扱い |
|---|---|
| `frontend/src/components/CustomScreenerPanel.jsx` の `PRESET_PREDICATES`（L616・**件数 SSOT**） | **不触＝承認 gate**。本 SPEC は backend cron のみ、件数定義に一切触れない |
| `backend/app/aggregator/*.py` への LLM SDK import（pre-commit Check 3） | **禁止**。consensus は数値物理層。`consensus_history.py` は `@no-llm` 維持 |
| `backend/app/visualizer/prompt.py`（Hallucination Guard pre-commit Check 1） | **本 SPEC では触らない**（LLM 不要） |
| `backend/app/visualizer/prompt_negatives.py`（法務 anchor） | **本 SPEC では触らない** |
| `frontend/src/lib/blocklist.js` の `BLOCKLIST_REGEX` | **本 SPEC では触らない**（frontend 変更ゼロ） |
| 既存 consensus cron の **retention 90 日**（`_delete_consensus_snapshots_before` main.py:18090） | **据え置き**。窓 90 日で filed_at 前 snapshot が自然に retention 内に残る（§最重要設計制約 4 で確認済 → 壊さない） |
| **upsert 競合キー** `SNAPSHOT_CONFLICT_KEYS`（consensus_history.py:36 = `ticker,snapshot_date,fiscal_date,period_type`） | **不変**。5 番目 source 追加でも同一 upsert path を通す |
| 既存 4 source（保有∪WL∪RS≥90∪Cup-Handle）の `_build_consensus_universe` ロジック | **不触**。5 番目 source を**独立 try/except で追加するのみ**（1 source 落ちても他継続の既存方針を踏襲） |
| `migrations/*.sql`（DB schema） | **本 SPEC では新規 migration 不要**（consensus_snapshots は既存・カラム追加なし）。万一必要なら user gate |
| `.github/workflows/nightly_consensus.yml` の cron 起動時刻（23:40 UTC） | **据え置き推奨**（Sprint 2 で頻度変更が必要と判断したら user gate） |
| `railway.toml` cron 定義 | **不触** |
| `handover_*.md`（read-only reference） | **read-only** |
| `frontend/src/App.jsx` の sticky 検索 div（8 回試行錯誤の安定領域） | **本 SPEC と無関係・不触**（定型記載） |
| `.panel-card / .bs-panel / .surface-card` 系 CSS（発光バグ高リスク） | **本 SPEC と無関係・不触**（定型記載） |
| legacy screener 行（A-1 物理隔離） | **本 SPEC と無関係・不触**（定型記載） |
| `.claude/launch.json`（人間用） | **不触** |

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」3 軸を本 SPEC に適用する:

| 軸 | active か | 根拠 |
|---|---|---|
| 1. LLM 出力品質（景表法 / 金商法 / hallucination risk） | **非 active** | LLM を一切呼ばない。数値物理層の snapshot 充足のみ。§38 は既存 cron の事実-only 方針を継承 |
| 2. Trust Cliff（LP 訴求 vs 実装の整合） | **半 active** | UI 文言・色は不変だが、coverage 充足で「ガイダンス比」見出しと中身の整合が**改善する方向**。新たな乖離は生まない（§3 で確認済） |
| 3. 新 backend endpoint + RLS / 認証境界 + cache 設計 | **非 active** | 新 endpoint なし。既存 `cron_consensus_snapshot` の universe source 追加のみ。RLS / 認証境界 / cache 設計の変更なし（CRON_SECRET 認証も既存再利用） |

**判定: 3 体合議で十分**（active 軸が 2 未満 = 6 体不要）。
- **根拠 1 行**: 新 endpoint / 新 schema / LLM なし、既存 cron の universe source 1 個追加に scope が縮小済（Explore 縮小済の典型）。
- **推奨構成**: 金融 verdict（FMP call 数・PIT 窓設計の妥当性）+ frontend-architect（backend cron 設計・blast radius）+ qa-dogfooder（dry_run 検証・coverage 計測の正直さ）の 3 体。
- **任意**: Sprint 1 の universe 取得方式の trade-off（方式 A/B/C）に user が迷う場合のみ、金融 1 体を Opus 指定で深掘り（cost 設計の精度優先）。

---

## 8. 想定リスク + roll-back plan

| リスク | 内容 | 検知 | roll-back |
|---|---|---|---|
| **FMP call 数 spike** | 5 番目 source「まもなく決算」が想定より多く絞り込まれず、consensus cron の FMP analyst-estimates call が急増 → FMP rate limit / 月コスト超過 | dry_run の `universe_size` 急増 / `[GUIDANCE_COST]` 系 cost log / FMP 429 | 5 番目 source 追加 block を no-op 化（`git revert` 1 commit）。N 日窓を縮小（7→3）して件数再 bound |
| **silent 歯抜け（range fetch 罠）** | 方式 A を誤って採用 / 方式 B でも next earnings 取得が空 → 「まもなく決算」銘柄が pre-load されず coverage が上がらない | dry_run の `by_source` で upcoming_earnings が想定件数に届かない / supabase MCP で決算 N 日以内なのに snapshot 無い銘柄を抽出 | Sprint 1 の方式選定に立ち戻る。方式 C/B のうち取得確実な方へ切替 |
| **既存 4 source の巻き込み** | 5 番目 source 追加時に `_build_consensus_universe` の既存ロジックを誤って改変 → consensus drift 機能が degrade | 既存 consensus drift の universe_size 縮小 / `universe_degrade_warning` | `git revert`。既存 4 source は独立 try/except のため、5 番目だけ削れば原状復帰 |
| **retention 90 日との競合** | pre-load した snapshot が決算前に retention(90 日) で消える | snapshot_date が決算日の 90 日以上前になるケースを supabase MCP で確認 | N 日窓（7-14 日）≪ 90 日なので構造的に競合しない（§最重要設計制約 4 で確認済）。万一は retention 延長を user gate |
| **coverage が時間内に上がらない** | forward 決算待ちのため、本 SPEC deploy 後すぐには 60% に届かない（数週間〜数ヶ月） | canonical coverage query | **これはリスクでなく仕様**（§5 Sprint 3 で「coverage 60% は時間軸分離」と明記）。DoD は即時指標（pre-load 充足・snapshot 増加）で判定し、虚偽の達成報告を避ける |

### 緊急 roll-back 手順
1. **本番反映済の場合**: `git revert <commit>` → `git push origin main`（Railway auto-deploy、~30s 反映）。`/health` の commit hash で確認。
2. **PR 段階の場合**: PR を merge しない / close するだけ（本番無影響）。
3. **deploy は PR 経由必須**（main 直 push 禁止）・`git add` は明示パスのみ（並行セッション commit 巻き込み防止）。

---

## 9. 検証規律（Generator / main 必読）

- **backend テスト**: `.venv` の python3.12 を使う（`source backend/.venv/bin/activate`）。system python3.8 は zoneinfo 無しで main import 不可。
- **DB 実査**: supabase MCP（CRON_SECRET / service-role キーは local .env に無い → standalone DB 接続不可）。
- **cron 動作確認**: GitHub Actions `nightly_consensus.yml` の workflow_dispatch（`dry_run=true`）。upsert/delete を skip して universe 構築のみ確認できる（既存 cron の dry_run 対応を活用）。
- **canonical coverage query**（既確立）:
  ```sql
  WITH latest AS (SELECT max(calc_date) AS d FROM screener_fundamentals)
  SELECT
    count(*) FILTER (WHERE last_report_date::date >= CURRENT_DATE - 30) AS reported_30d,
    count(*) FILTER (WHERE last_report_date::date >= CURRENT_DATE - 30 AND guidance_source='8k') AS layer_a_30d
  FROM screener_fundamentals
  WHERE calc_date = (SELECT d FROM latest);
  ```
- **正直さ規律（CLAUDE.md 最上位）**: 「coverage 60% 達成」を時間経過前に報告しない。本 SPEC の DoD は **即時検証可能な指標**（pre-load universe が「まもなく決算」を含む + snapshot が増える）に置き、coverage 60% は forward 決算成立後の **別途再計測**とする。grep ヒット / dry_run 応答 = 「存在」であり「機能」ではない（universe に出た ≠ filed_at 前 PIT が将来成立する、は supabase MCP の銘柄抽出で裏取り）。
