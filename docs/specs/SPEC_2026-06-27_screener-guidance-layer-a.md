# SPEC: スクリーナー「決算速報ハイブリッド」Layer A 本命化 — 会社ガイダンス vs アナリストコンセンサス比（イベント駆動・PIT）

- **作成**: 2026-06-27 / **改訂 v2**: 2026-06-27（6体合議 verdict 反映）
- **役割**: 既存 SPEC §14（`SPEC_2026-06-27_screener-earnings-flash-row.md` の §14-C Layer A/B ハイブリッド）の **Layer A を本命化**する差分 SPEC。残タスク4（handover v279）の正式設計。
- **状態**: gate 1（user 最終承認）待ち。6体合議は全員「条件付賛成・反対0」。本 v2 は全 reviewer の必須修正を反映済み。

---

## §0. 6体合議 verdict（着手前ゲート・2026-06-27）

3軸全 active（§38/金商法・Trust Cliff・新 backend schema+cron+LLM cost）→ 6体合議実施。**全員 条件付賛成・反対 0**。本 v2 で反映した致命/主要修正:

1. **🔴【致命・金融+設計一致】consensus vintage = point-in-time 必須**: 現在 consensus との比較は washout（§5 で PIT へ全面差替）。既存 `classify_pit_consensus`（guidance_history.py:342）を再利用。
2. **🔴 SPEC 事実誤認の訂正**: ①現 guidance universe は「pilot 5」でなく「保有∪WL 全件・上限なし」（`_build_guidance_universe` main.py:18374）。②`classify_guidance_vs_consensus` の%は既に共用済（`_compute_forward_outlook` が呼ぶ）→ 新設は「符号付き%返し純関数1本」のみ。③`last_report_date` は FMP `/stable/earnings` date で 8-K filed_at と突合ロジック無し。
3. **🟡 timing 罠**（§5-4）/ **range 幅ガード**（§4-3）/ **basis 一致**（§4-4）/ **売上 ADR ガード流用**（§4-5）/ **stale 降格**（§5-3）/ **cost ログ機構新規**（§9 Sprint2）/ **classify unit test 先行追加**（§9 Sprint1・現状ゼロ）/ **UI「買いシグナル」排除 + dot+tooltip マーカー**（§6）/ **tool schema %/mid 追加禁止**（§8）。

---

## §1. 背景・なぜやるか（5原則・ブランド世界観）

### 現状の Trust Cliff（解消対象）
スクリーナー「決算合格」結果テーブル（v12「決算の通信簿」）の**来期2列見出しは「来期売上ガイダンス比 / 来期EPSガイダンス比」**、凡例は「会社の来期ガイダンスのアナリスト・コンセンサス比＝会社が示した見通しの転記」と表示。しかし backend は `guidance_*_surprise_pct` を一切算出しておらず（残タスク4 未実装）、`?? next_q_*_yoy_pct` が常時発動 → **全行が「来期コンセンサスYoY」(Layer B)**。＝**出典表示が事実と食い違う §38/景表法 honesty 問題**。

### なぜ「データを見出しに合わせる」（Layer A 本命化）か
user 指示（2026-06-27）: 見出しを honest 化（コンセンサスYoY へ戻す）でなく、**中身を本物のガイダンス比にする**。根拠は KB（じっちゃま）の核心 — **会社ガイダンスがアナリストコンセンサスを上回ったとき＝重要な買いシグナル**（§2）。来期コンセンサスYoY (Layer B) より一段価値が高い情報で、screener と銘柄詳細の両方で投資家の手作業を代替する。

### 5原則紐付け
- **原則4「人力の代替」（北極星）**: 投資家・機関投資家が決算後に 8-K とリサーチを手照合する作業を肩代わり。三拍子③そのもの。**最強の採否根拠**（マーケ verdict: 情報の非対称性解消＝質的に強い機能）。
- **原則2「毎日開きたくなる」/ 原則1「読み手に負担をかけない」/ 原則5「図解で認知コストを下げろ」**（Pane3 再利用時）。

### ブランド世界観
「洗練さ」— 機関投資家しか持たない guidance-vs-consensus シグナルを、静かに（マーカーは控えめ・主役の視線を妨げない）上品に提示。

### 再利用基盤（user 要望）
将来 **銘柄詳細 Pane3 に「会社ガイダンスがコンセンサスを上回った（事実）」**として表示（§7）。共通基盤（%返し純関数 + screener_fundamentals カラム + guidance/consensus 抽出経路）として設計。

---

## §2. KB（じっちゃま原典）由来の判定規律

investment-knowledge-base より抽出（出典 `knowledge_base/by_domain/trading.md` 複数・`derived/kb_snapshot.json`）。

1. **三拍子**: EPS・売上・**ガイダンス**の3つ全てが事前アナリスト・コンセンサスを上回る＝好決算（ウォール街の定義）。ガイダンスは条件③。
2. **判定は二値**（上回る/下回る）。**KB に明示閾値なし** → 暫定 tolerance 3%（既存 `classify_guidance_vs_consensus` と一致）。【要 user 確認】
3. **売上・EPS ガイダンスは KB 上で等並び**。実務（金融 verdict）では**売上ガイダンスが株価インパクト大**（EPS は buyback/税率で操作余地・成長株は売上 re-rating 主因）→ **表示は来期売上を左(primary)・EPS を右**。
4. **方向性**: 引き上げ→買い / 引き下げ→売り。**ガイダンス非開示企業（GOOGL/META）は EPS+売上の2条件で判定**＝guidance null（「—」）。
5. 🔑 **TSM 型 nuance**: actual がコンセンサス未達でも会社ガイダンスを超えれば「悪いのはアナリスト」。**PIT consensus を使って初めて拾える**（現在 consensus だと washout で消える＝§5）。Pane3 再利用の核心価値。

---

## §3. Feasibility（既存資産・制約）— 実装の足場【v2 訂正済】

### 既存（再利用可）
| 資産 | 場所 | 用途 |
|---|---|---|
| `guidance_snapshots` テーブル | migration `docs/migrations/2026-06-11_guidance_snapshots.sql` | eps_low/high+`eps_basis`・rev_low/high+`rev_basis`・`source_url`(8-K)・`source_accession`・`filed_at`・`period_end_date`・`period_type` |
| `cron_guidance_snapshot` | main.py:18326 | guidance 抽出 cron。**現 scope = 保有∪WL 全件・上限なし**（`_build_guidance_universe` main.py:18374）※「pilot 5」は誤記訂正 |
| `_fetch_sec_guidance_structured` | main.py:5799 | SEC 8-K EX-99.1 + Claude Haiku 抽出。**ephemeral cache 3 breakpoint 済**（sec_guidance.py:609-643）・Tool schema・NEGATIVE_EXAMPLES(BAD-5/6)・**retry なし(例外→None)** |
| `extract_accession` / `GUIDANCE_CONFLICT_KEYS` | guidance_history.py:40 | `ticker,period_end_date,period_type,source_accession` の on_conflict＝**per-filing idempotency 既存**（accession 失敗時 source_url 代理 fallback 済 guidance_history.py:188） |
| **`classify_pit_consensus`** | **guidance_history.py:342** | **🔑 filed_at より前の consensus_snapshots で PIT 比較（正しい設計・LIVE）。`stale` flag（snapshot が発表 10 日超古い→降格）まで実装済** |
| cron 内 PIT block | main.py:18304-18322 | `consensus_snapshots` を `.lt("snapshot_date", filed_at)` で未来側を SQL 排除（二重防御） |
| `consensus_snapshots` テーブル | migration `docs/migrations/2026-06-06_consensus_snapshots.sql` | FMP analyst_estimates の**時系列**（unique に `snapshot_date`・retention 90日）。**universe ~500銘柄**（保有∪WL∪RS90∪Cup・`_build_consensus_universe` main.py:18011） |
| `classify_guidance_vs_consensus` | visualizer/calc.py:190 | **内部で `pct=(g-c)/abs(c)*100` を計算済・tolerance 3%**。`_compute_forward_outlook`(main.py:7290/7300) が**既に呼ぶ＝label 経路は共用化済** |
| `next_q_*_yoy_pct` 算出 | main.py:23117-23164 | 現 Layer B fallback（来期コンセンサスYoY・nightly per-ticker・FMP `ae-q::{ticker}` cache） |
| `last_report_date` カラム | screener_fundamentals | FMP `/stable/earnings` date（main.py:22393→23196）。**8-K filed_at との突合ロジックは backend に無い**（§5-4 で対処） |

### 制約（最重要）
- **FMP は会社の forward guidance を構造化提供しない** → SEC 8-K EX-99.1 + LLM 抽出が唯一。universe nightly は cost 不可 → **イベント駆動**で bound。
- **PIT consensus は consensus_snapshots（~500銘柄）にしか無い**。Layer A 成立 = （guidance 抽出済）∩（filed_at 前の consensus_snapshot 存在・非stale）。**それ以外は Layer B fallback / 「—」**（§5-3）。→ **Layer A coverage は本質的に部分的**。これがハイブリッド+マーカー設計（§6）の正当化。
- **8-K guidance coverage limit**（memory）: EX-99.1 に guidance 記載なし企業は「記載なし」が正 → null（「—」）。

---

## §4. データ設計（新規）

### 4-1. 新カラム（screener_fundamentals・additive migration）
| カラム | 型 | 内容 |
|---|---|---|
| `guidance_rev_surprise_pct` | numeric NULL | 来期売上ガイダンス中値 vs **PIT** コンセンサス売上の符号付き%。`0.0`（一致）は有効値（`if val is not None` で書込） |
| `guidance_eps_surprise_pct` | numeric NULL | 来期EPSガイダンス中値 vs PIT コンセンサスEPSの符号付き%（ADR 非USD 抑止） |
| `guidance_source` | text NULL | Layer 判別。`'8k'`（Layer A・PIT 比較成立）/ null（Layer B fallback）。**空文字 `''` を入れる経路を作らない**（frontend は `source==='8k'` 厳格比較） |

- None-preserve・optional_cols fallback（main.py:22023 の error-string heuristic・`if value is not None` パターン）に3カラム追記。additive・deploy 順序非依存・rollback 無害。

### 4-2. 符号付き%返し純関数（新設は1本のみ）【v2 scope 縮小】
`classify_guidance_vs_consensus`（label・内部に%計算あり）の**%部分を符号付き float で返す純関数**を calc.py に切り出す（例 `guidance_vs_consensus_pct(guidance_mid, consensus) -> float|None`）。`classify_*` は本関数を呼ぶ形に refactor（tolerance 3% 境界を1箇所に一元化）。
- `consensus==0/None → None`・`guidance_mid==None → None`（既存 label 経路の挙動を完全保存）。
- **YoY 式（`(cons-ya)/abs(ya)*100`）の共用化は別 backlog**（`_compute_one`/`_compute_forward_outlook` でガード群が微妙に異なり、安易な統合は §5 trust cliff ガードを溶かす）。本 SPEC では触らない。

### 4-3. range 幅ガード【金融 verdict】
ガイダンスはレンジ(low/high)で出る。mid 比較で `low < consensus < high`（consensus がレンジ内）なら mid が±3%外でも **inline に丸める**（幅広ガイダンスの過大評価防止）。`guidance_mid=(low+high)/2`。**片側欠損（low or high のみ）は None**（保守）＋抽出ログに残す。

### 4-4. basis 一致チェック【金融 verdict・Refinitiv 級 Trust Cliff】
guidance（`eps_basis`/`rev_basis`）と consensus（FMP estimate＝通常 adjusted/non-GAAP）の basis 一致を検証。**不一致なら Layer A を出さず降格（Layer B/「—」）**。GAAP guidance vs adjusted consensus の偽 surprise を物理排除。

### 4-5. ADR ガード（guidance に流用）【金融 verdict】
- **EPS**: `_guard_eps_currency_mismatch` 条件（**非USD reporter かつ |surprise|≥70%**）を guidance EPS にも適用 → null 抑止。rev は比率ゆえ算出。
- **売上**: sector 別 `_REV_BASIS_MISMATCH_PCT`（銀行0/与信18/他40）を guidance rev にも流用（偽売上 surprise 防止）。

### 4-6. tri_verdict 結線 = 本 SPEC では不変【user 確定: 別 sprint】
既存 `tri_verdict`（main.py:23166-23177）の算出式は**変更しない**（blast radius 限定）。guidance_beat を三拍子③へ昇格は coverage 充実後の別 sprint。

---

## §5. イベント駆動 cron 設計【v2: PIT 全面差替・timing 罠対処】

### 5-1. 抽出 universe の拡張 + 繰越
`cron_guidance_snapshot` の universe を「保有∪WL 全件」→「**直近決算報告銘柄**」へ拡張:
- **トリガーキー**: `last_report_date` が過去 N 日以内（暫定 **N=14**・§5-5）かつ screener universe 内。
- **accession-skip**: 既存 `extract_accession`+`GUIDANCE_CONFLICT_KEYS` で当 ticker の最新 8-K accession を既抽出なら skip（1報告1回）。
- **日次上限 cap**（新規実装・現 cron は Semaphore(3) のみで cap 無し）: 1 実行あたり抽出件数を hard cap（暫定 200）。
- **繰越 = 暗黙**: 別状態テーブル不要。「窓内かつ未 skip（未抽出 or 空振り）」を翌日 cron が再走査して拾う。

### 5-2. consensus 供給 = PIT（consensus_snapshots）【v2 致命修正】
**現在 consensus 流用を破棄**。会社ガイダンスの `filed_at` **直前**の consensus_snapshot を引く（`classify_pit_consensus` / cron PIT block main.py:18304-18322 の `snapshot_date < filed_at` を再利用）。
- 現在 consensus はガイダンス織り込み済 → washout（最大シグナルほど消える）ため不可。
- **追加 FMP call はゼロ**（consensus_snapshots は既存 nightly consensus cron が populate）。ただし **per-ticker DB query が増える**（FMP call 増ではない）。
- **coverage 制約**: consensus_snapshots は ~500銘柄（§3）。Layer A は「filed_at 前 snapshot あり」の ticker のみ。無ければ Layer B/「—」。**将来 coverage 拡大は別 backlog**（§5-6）。

### 5-3. stale 降格【金融 verdict】
filed_at 直前 snapshot が古すぎる（発表 10 日超前・既存 `stale` flag）→ ガイダンス織り込み前/後の判別が不確実 → **Layer A を出さず Layer B/「—」降格**。stale を `guidance_source` に反映（stale は `'8k'` にしない）。

### 5-4. timing 罠の明文化【設計 verdict・最重要詰め】
- **8-K 提出ラグ**: FMP earnings date（PR 日）の数時間〜数日後に 8-K が EDGAR に出る。PR 当日朝の cron は 8-K 未提出で空振り。→ **空振り（accession 未取得）は skip 対象にせず、N 窓内で翌日再試行**。
- **恒久null vs 一時null の区別**: 「guidance 記載なし(恒久)」と「8-K 未提出(一時)」を区別する手段を持つ。暫定: **last_report_date から M 日（3〜5日）グレース**で再試行し続け、M 日経過後に記載なしと確定。試行履歴の最小記録（最終試行日）を持つか、M 窓で代替。

### 5-5. 抽出窓 N 日【金融 verdict で根拠変更】
**N=14**。根拠は「織り込み速度」でなく「**PIT 比較が成立する窓**」: consensus_snapshots は日次蓄積なので、発表が retention 内かつ filed_at 直前 snapshot が存在する窓に限る。株価織り込みは決算翌日〜数日で大半完了するため鮮度は 7 日でも十分だが、accession-skip があるため 14 日は安全側。【要 user 確認: 7 か 14 か】

### 5-6. 算出フロー（nightly）
1. 当 ticker が「直近報告 & guidance_snapshots に当 accession あり & filed_at 前 consensus_snapshot あり（非stale）& basis 一致」:
   - guidance_mid（rev/eps）× PIT consensus → `guidance_vs_consensus_pct` で % → range幅/ADR ガード適用 → `guidance_*_surprise_pct`、`guidance_source='8k'`。
2. 上記不成立（guidance なし / PIT snapshot なし / stale / basis 不一致 / ADR 抑止）→ `guidance_*_surprise_pct=None`、`guidance_source=None`（frontend が next_q fallback）。
- **将来 coverage 拡大（別 backlog）**: consensus_snapshots universe を earnings-calendar 駆動で「**まもなく決算の銘柄**」へ pre-load → 発表前 snapshot を増やし Layer A coverage 向上。本 SPEC scope 外。

---

## §6. Frontend 接続（screener）【v2: dot+tooltip・「買いシグナル」排除】

- `normalizeItem` に `guidanceSource: it.guidance_source ?? null` 追加。`ScreenerGridRow` 分割代入に `guidanceSource` 追加。`FutureCell` に `source` prop 追加（default null = Layer B・MOCK_ROWS 変更不要）。`source==='8k'` 厳格比較。
- **Layer A/B マーカー = dot + tooltip**【UI+マーケ 一致】:
  - Layer A（`source==='8k'`）: 値の前に小 dot（`●` 3px・**色は `--text-secondary`/`--text-muted` のみ・gold 厳禁**＝gold=✓ continuity 保護）+ `title`/tooltip「会社が来期ガイダンスを開示・発表直前のアナリスト予想との差を算出」。
  - Layer B（fallback）: 無印。
  - 「G」superscript 案は不採用（8px は暗背景で視認不足・意味不明・tabular-nums 崩れ）。【最終視覚は Sprint4 dogfood で確認・70px セル幅に収まるか snap】
- **凡例更新**（`.disc` 先頭）: 「**● 付き＝会社ガイダンスとアナリスト予想の比 / 無印＝来期コンセンサスYoY（ガイダンス未取得）。いずれも当社の予測・推奨ではありません。買い推奨ではありません。**」※「コンセンサス比」→「アナリスト予想の比」と平易化。
- **§38**: Layer A/B いずれも**絶対中立色**。マーカーは色でなく字形/dot 位置で区別。**UI 文言に「買いシグナル」を出さない**【Anthropic verdict】＝「会社ガイダンスがコンセンサスを上回った（事実）」表記。「買いシグナル」は内部名のみ。
- **ADR「—」と Layer B「無印」の混同防止**: 来期EPS が「—」（ADR 非算出）の理由を `aria-label`/`title`（例「非USD ADR：来期EPS非算出」）に明記。
- ADR 非USD は来期EPS「—」（既存挙動）。

---

## §7. Pane3 再利用（将来拡張・本 SPEC は基盤整備のみ）

- §4-2 の符号付き%純関数を `_compute_forward_outlook`（main.py:7129・Pane3 on-demand）も共用（label は既に `classify_guidance_vs_consensus` 共用済）。
- Pane3 UI 表示（「会社ガイダンスがコンセンサスを上回った（事実）」・**「買いシグナル」表記は不可**）は**別 sprint/SPEC**。
- **screener(nightly) vs Pane3(on-demand) の時点ズレ**【マーケ verdict】: 両者の「最終更新時刻」を表示（CLAUDE.md「最終更新 X 分前」）。後付けは schema 変更リスクのため設計方針として今記載。

---

## §8. §38 / ADR / Hallucination Guard DoD【v2 追補】

- **§38**: 来期2列 絶対中立色・免責（会社開示の転記）。**UI に「買いシグナル/買い場」を出さない**。「三拍子✓」を緑/強調で出さない（中立字形 + 算出基準併記＝景表法 §5 優良誤認回避）。verdict pip が gold になる経路は過去確定 beat のみ（既存）。
- **ADR**: §4-5。guidance EPS 非USD null 抑止・売上 sector ガード。
- **Hallucination Guard 4層**（LLM 抽出 = sec_guidance・visualizer 配下で aggregator 隔離・pre-commit Check 3 既存）:
  1. **`GUIDANCE_EXTRACT_TOOL_SCHEMA` に `surprise_pct`/`guidance_mid` 等の計算 field を絶対追加しない**（LLM は 8-K からの値抽出=eps_low/high/rev_low/high のみ。schema field 追加は pre-commit で機械検出されない人的 gate）。%/mid は Python(calc.py 純関数)。
  2. 数値=Python / narration=別layer。
  3. **citation**: `source_url`+`source_accession`（NOT NULL 既存）。**疑似 accession を作らない**（解決不能時は guidance row を作らず Layer B 降格）→ Sprint5 invariant。
  4. sources schema: 欠落時 fallback/「—」。捏造で埋めない。
- **prompt cache**: Sprint2 cron は**同一 system block のまま ticker を連続 iterate**（Haiku cache 5分 TTL hit・時間分散しない）。

---

## §9. Sprint 分割（DoD / blast radius / rollback）【v2 追補】

backend（migration→%関数→抽出→算出）→ frontend → 検証 の順。

### Sprint 1: migration + 符号付き%純関数 + **classify unit test 先行追加**
- additive migration（3カラム）。`guidance_vs_consensus_pct` 切り出し + `classify_guidance_vs_consensus` refactor。
- **DoD**: 🔴 **`classify_guidance_vs_consensus` の unit test を先行追加**（現状ゼロ・既存 7 呼出をカバー: `pct=3.0→above`/`2.99→inline`/`c=0→None`/`g=None→None`）→ refactor 後も同一ラベル（regression 検知網）。migration 適用・optional_cols 無傷・build/lint。
- **blast radius**: DB additive + 純関数 refactor。frontend 無影響。**rollback**: revert 可。

### Sprint 2: guidance 抽出のイベント駆動化 + cost ログ機構
- `cron_guidance_snapshot` を last_report_date 駆動へ + accession-skip + 日次 cap + 暗黙繰越 + timing グレース（§5-4）。
- 🔴 **cost ログ機構を新規実装**（現状ドル換算ログ無し・cache token のみ sec_guidance.py:791）: 抽出件数 × 推定単価 × 累計。
- **DoD**: 直近報告 ticker で guidance_snapshots 増・accession-skip で再実行 増分ゼロ・日次 cap 動作・空振り翌日再試行・**cost 実測ログ**（本番 cron 1 サイクル）。同一 system block 連続 iterate で cache hit。
- **blast radius**: cron scope 拡大（LLM call 増・cap で bound）。既存 保有∪WL guidance 維持。**rollback**: universe を元へ戻す。

### Sprint 3: PIT %算出 + universe payload merge + ADR/basis/range ガード
- `_compute_one` で guidance_mid × **PIT consensus**（§5-2）→ range幅/basis/ADR ガード → `guidance_*_surprise_pct`+`guidance_source` 算出・upsert・payload merge。
- **DoD**: `/api/scanner/universe` curl で Layer A 行に値・guidance/PIT/basis 不成立は null・**BABA(ADR) eps guidance null・TSM(正常 ADR) は eps_beat 出るが guidance は basis/PIT 次第**・stale 降格・実データ裏取り（DB freshness+curl）。既存 16 テストが guidance_snapshots 空 fixture でも通る（None fallback・KeyError 無し）。
- **blast radius**: payload 増（frontend は §6 まで読まない）。**rollback**: 算出 block no-op。

### Sprint 4: frontend Layer A 接続 + dot+tooltip マーカー + 凡例
- §6 実装。見出しと中身一致（Trust Cliff 解消）。
- **DoD**: build + test:unit + standalone snap（dot マーカー描画・70px 収まり）+ 本番 `?screener_v2=1` 目視（Layer A/B 混在・dot/tooltip 可読・§38 中立・ADR「—」aria-label）。design token のみ（hex 直書きなし）。
- **blast radius**: screener_v2 default OFF。**rollback**: マーカー削除で Layer B 表示へ。

### Sprint 5: invariant + null率/coverage + citation invariant
- invariant 拡張: `guidance_source ∈ {'8k', null}`・**Layer A 行は rev 非null（eps は ADR 非USD で null 許容）**・BABA/TSM fixture・**citation 疑似 accession を作らない（解決不能は row 無し）**。
- null率 + **Layer A coverage 計測**（直近30日報告銘柄の Layer A 率）。
- **DoD**: test 緑・coverage レポート・default ON 再判断材料。

---

## §10. コスト見積り【v2: ログ無し前提を訂正】
- 抽出単価 ≈ $0.001–0.005（Haiku + cache）。イベント駆動 + accession-skip で日次数〜数十件・cap 200。**月平均 $10 未満**。
- consensus は consensus_snapshots（既存 cron）流用＝**FMP 追加 call ゼロ**（PIT は DB query 増のみ）。
- ⚠️ 現 `_fetch_sec_guidance_structured` は **retry なし(例外→None)**・**ドル換算 cost ログ無し** → Sprint2 で cost ログ新規。空振り翌日再試行で同 ticker 複数日 call しうる → cost ログで月次累計監視。

---

## §11. 多面レビュー判定（実施済）
3軸全 active → **6体合議実施済（§0）。全員 条件付賛成・反対0**。本 v2 で必須修正反映。実装段階レビューは不要（user 方針: 計画通りの作業）。

---

## §12. 要 user 判断リスト（gate 1 で確定）【v2 更新】
1. **閾値**: 3% tolerance（+ §4-3 range幅ガード）でよいか。→ 推奨: 3%+range幅ガード。
2. **N 日窓**: 7 か 14 か（PIT 成立窓・§5-5）。→ 推奨: 14（安全側）。
3. **マーカー視覚**: dot+tooltip（gold 禁止）。→ 推奨: 採用・最終は Sprint4 dogfood。
4. **default ON gate**: 【マーケ verdict】**直近30日報告銘柄の Layer A coverage 60%+** を Sprint5 DoD の定量基準に。→ 推奨: 60% + GA4 離脱率併用。
5. **consensus coverage 拡大**（§5-6 earnings-calendar pre-load）: 本 SPEC scope 外（別 backlog）でよいか。→ 推奨: 別 backlog。
6. **timing グレース M 日**: 3〜5日（§5-4）。→ 推奨: 5日。

---

## §13. danger zone（不触）
- 件数 SSOT（`PRESET_PREDICATES`）不触＝承認 gate。Layer A はデータ表示のみ。
- sticky 検索バー / 発光 `.panel-card`・`.bs-panel`・`.surface-card` / legacy screener 行 / aggregator への LLM import（pre-commit Check 3）。
- screener_v2 default OFF 維持。
