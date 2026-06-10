# SPEC 2026-06-11: ガイダンス履歴基盤 (真の上方/下方修正判定 + 発表時比サプライズ)

> slug: `guidance-history-foundation`
> 起票: planner subagent (2026-06-11、 user 着手 GO 済)
> 想定工数: 2-4 人日 (user 伝達済) / 上限 6 sprint
> 関連 handover: v199 (決算ハイライト default ON / Phase 2 着手可否のみ残)

---

## 1. Context

### user prompt 原文 (2026-06-11 確定)
1. **真の上方/下方修正判定**: 会社ガイダンスを「前回の会社ガイダンス」と比較し raised / maintained / lowered を表示。投資家の重要な買い・売り要因 (user 明言)。
2. **発表時点コンセンサス比のガイダンスサプライズ**: 決算発表時点のコンセンサスと会社新ガイダンスを比較 (じっちゃまライブ「コンセンサス13.7億に対し新ガイダンス14.15〜14.20億 = 強い」)。現状 FMP コンセンサスは現在値のみで時点ミックス誤読が発生 (SNOW 実例: 発表後にアナリストが引き上げ → 会社ガイダンスが「下」に見える)。v200 で時点明示の暫定対応済 (「現コンセンサス…(発表時)」+ 判定記号なし)。本基盤完成後に正確な「発表時比」判定を復活させる。

### なぜ今やるか (根拠)
- **handover v199**: 決算ハイライト (EarningsFlashSummary) が default ON に昇格し、来期行に「会社ガイダンス vs コンセンサス」を出している。だが現状の `guidance_vs_consensus_eps/rev` は **現コンセンサス比** (時点ミックス) で、SNOW 型の誤読を user が実体験 → v200 で判定記号を一旦外した暫定対応中。**「正しい判定の復活」が宿題として確定している**。
- **既存資産が予想以上に揃っている (本 SPEC の最重要発見)**: コンセンサス snapshot 基盤は **既に稼働中**。
  - table: `consensus_snapshots` (`docs/migrations/2026-06-06_consensus_snapshots.sql` + `_grants.sql`)
  - 整形純粋関数: `backend/app/aggregator/consensus_history.py` (`build_snapshot_rows` / `fetch_and_build_snapshot`)
  - nightly cron: `.github/workflows/nightly_consensus.yml` (POST `/api/cron/consensus-snapshot`、X-Cron-Secret 認証、08:40 JST)
  - → **コンセンサス時点蓄積は新規実装不要**。本 SPEC は「ガイダンス snapshot を sibling として追加」+「両者を会計期で join して判定」に集中できる。
- **8-K backfill が可能**: 過去の会社ガイダンスは SEC EDGAR 8-K (EX-99.1) に永久保存。既存 LLM 抽出 pipeline (`backend/app/visualizer/sec_guidance.py`、Hallucination Guard 4 層通過済) を backfill に転用できる。

### 期待される成果 (5 原則のどれに貢献するか)
- **原則 4 (人力の代替 = 北極星)**: 投資家が毎日手作業でやる「前回ガイダンスとの照合」「発表時コンセンサスとの突合せ」を BeatScanner が肩代わり。じっちゃまライブで人間が口頭でやっている判定そのものの自動化 = 原則 4 の核心。
- **原則 1 (2 秒理解)**: 「上方修正 ↑」「会社ガイダンスは発表時予想を上回る」を 1 行で。長文の決算読み込み不要。
- **原則 5 (図解で認知コスト低減)**: 前回→今回ガイダンスのレンジ移動を ↑↓ 記号 + 帰属 caption で視覚化。

### 必読 memory anchor (Generator は着手前に Read)
- `feedback_supabase_grant_bug.md` — 新規 table の service_role GRANT 抜け silent fail (Sprint 1 必読)
- `feedback_railway_native_cron.md` — Railway cron 停止 → GitHub Actions + CRON_SECRET (Sprint 1/2)
- `feedback_sec_guidance_8k_coverage_limit.md` — 8-K に無い企業 (AAPL 等口頭ガイダンス) は「記載なし」が正、欠損 graceful (Sprint 2)
- `feedback_diagram_quality_guard.md` / `feedback_llm_calc_separation.md` — 数値=Python / narration=LLM 物理分離 (全 sprint)
- `feedback_forward_visibility.md` (project_forward_visibility) — 条件4 来期コンセンサス YoY の既存配線 (Sprint 3/4)
- `feedback_transcript_guidance_38_guards.md` — guidance 抽出の §38 ガード集 (Sprint 2)

---

## 2. ブランド世界観 (Aman / Ritz-Carlton 級) への適合根拠

効く感情語彙は **「興奮 (excitement)」** と **「洗練さ (sophistication)」**。最高級ホテルのコンシェルジュ比喩で言えば、現状の「現コンセンサス比」表示は「昨日の天気を今日の天気として案内してしまうコンシェルジュ」= 時点を取り違えた案内で信頼を損なう状態。本基盤は「**いつ時点の情報か** を正確に把握した上で、前回からの変化 (上方修正) と発表時予想からの距離 (サプライズ) を、過不足なく 1 行で差し出す」洗練された案内に変える。会社が自ら数字を引き上げた事実 (上方修正) を ↑ で淡々と提示することは、騒がしい煽り (緑赤の濫用 / 「絶好調」) を避けつつ、投資家の意思決定に効く「興奮の core」を静かに伝える = §-1 の「動を 1 / 静を 2」「洗練さ」に合致。

- `feedback_brand_aspiration.md` の修正禁止 anchor を破壊しない。新規修飾語の追加もしない。
- 色運用: 上方/下方修正は **色なし (neutral 単色) + ↑↓ 記号** を維持 (v200 確定。緑赤は方向性に濫用しない / §38)。シアンはブランド色専用で方向に使わない。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言との整合 (3 項目以上):

1. **「登録不要 / 3 銘柄/日まで無料」**: 本基盤は backend データ層 + 既存表示 component の精度向上のみ。新規の登録要求モーダル / ホワイトリスト導入は **一切しない**。demo 経路 (`handleLPTickerClick`) で見える銘柄でも、ガイダンス判定が出る/出ないは銘柄のデータ有無で決まる (rate limit と無関係) → 矛盾なし。
2. **「決算速報をプロの視点で」系の訴求 (じっちゃまプロトコル代替)**: 本基盤はむしろ訴求を**強化**する (発表時比の正しい判定はライブで人間がやっている判定の core)。ただし **誇大表現にしない** — 「必ず上がる」等の断定は §38 NO-GO (§4 参照)。
3. **時点の正直さ (本 SPEC 固有の Trust Cliff)**: 「発表時コンセンサス比」と銘打つなら、実際に **発表日に最も近い snapshot** を使うこと。snapshot が無い報告済み四半期で現在値を「発表時」と偽装表示したら、それ自体が Trust Cliff (SNOW 誤読の再来)。**snapshot 不在時は「発表時比」判定を出さず、現コンセンサス比は時点明示 caption 付き (v200 の暫定表示) のまま据え置く** = データの正直さを死守。

> 結論: 既存 LP 文言と矛盾しない。ただし §3-3 の「時点を偽装しない」は本基盤の **最重要 DoD**。Generator は snapshot 不在を欠損として正しく扱い、誤った「発表時比」を捏造しないこと。

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか: yes (一部 sprint のみ)**

- **数値の比較判定 (上方/下方修正、発表時比サプライズ) は 100% Python 計算** — `aggregator/` (数値物理層) で完結。LLM SDK import 禁止 (pre-commit Check 3)。raised/maintained/lowered の分類も Python の閾値比較 (前回ガイダンスレンジ中点 vs 今回中点)。
- **LLM を使うのは Sprint 2 の 8-K backfill のみ** — 既存 `backend/app/visualizer/sec_guidance.py` の `extract_guidance` を**そのまま転用** (新規 prompt を書かない)。これは既に 4 層防御通過済:
  1. **pre-commit hook**: aggregator への LLM import BLOCK (Check 3) / prompt.py への数値計算指示 BLOCK (Check 1)。backfill batch は visualizer/ 側で LLM 抽出 → 数値は aggregator/ 側で比較、と層を分離。
  2. **NEGATIVE_EXAMPLES**: sec_guidance.py の既存 BAD pattern (英語混在 / 数値捏造 / §38 断定的将来予測 / §5 最上級) をそのまま継承。新規 prompt を足さないので新 BAD 追加不要。
  3. **frontend sanitize**: 表示は既存 EarningsFlashSummary / ForwardOutlookSection 経由 → BLOCKLIST_REGEX を既に通る。
  4. **sources schema**: ガイダンス snapshot に `source_url` (8-K filing URL) を必須保持。出典欠落 row は判定から除外 (signal_quality 降格)。

> **§38 / §5 の最重要設計判断 (Generator 必読)**:
> - **「上方修正 / 下方修正」の語は、前回会社ガイダンス比なら事実として OK** (会社が自ら数値を修正した客観的事実 = 断定的将来予測でない)。**現コンセンサス比では NO-GO** (既決)。
> - **表示語 dict の置き場所**: 上方/下方修正の表示語は `frontend/src/features/judgment/constants/earningsFlashTemplates.js` (= flash 系 SSOT) に **新規 key** として追加し、`GUIDANCE_STATE_JP` (ForwardOutlookSection、現コンセンサス比専用) とは **別 dict** として分離する。理由: 「修正判定 (前回ガイダンス比 = OK)」と「サプライズ判定 (発表時コンセンサス比)」と「現コンセンサス比 (記号なし暫定)」の 3 文脈が混ざると、誤って現コンセンサス比に「上方修正」を出す事故 (= Trust Cliff + §38) を起こす。
> - **pre-commit Check 7 の negation 設計 (本 SPEC で更新が必要)**: 現在 Check 7 は flash 系 file (`EarningsFlashSummary` / `earningsFlashTemplates`) への「上方修正」を **無条件 BLOCK** している (handover v199、§38 過剰防御)。本基盤では **前回会社ガイダンス比に限り「上方修正/下方修正」を許可**したい。Generator は Check 7 を「前回ガイダンス比の文脈でのみ許可」に **限定緩和**する必要がある。緩和方法は §9 確認 1 で user に推奨案を提示 (安全側: コメント注釈 `// @company-guidance-revision` がある行のみ許可、等)。**Generator が独断で Check 7 を全面解除してはならない** (現コンセンサス比への漏れ = §38 抵触の再来)。

---

## 5. スプリント分割 (1 sprint = 1 機能、上限 6)

> 設計方針: コンセンサス snapshot 基盤 (`consensus_snapshots` + `consensus_history.py` + `nightly_consensus.yml`) は **既に稼働中**。本 SPEC はこれを参照しつつ **ガイダンス snapshot を sibling として追加**し、両者を会計期で join する。車輪の再発明をしない。

### Sprint 1: ガイダンス snapshot schema + nightly 収集の足場 (早く始めるほど将来判定が早く可能に)
- **目的**: 会社ガイダンス (8-K / transcript 抽出済の構造化値) を会計期ごとに永続化する `guidance_snapshots` table を新設し、nightly cron で「今後の決算」分から自動蓄積を開始する。**蓄積は時間がかかる資産なので最優先で着手** (snapshot が 2 点揃って初めて raised/lowered が出るため、収集開始を 1 日でも早める)。
- **触るファイル**:
  - 新規 `docs/migrations/2026-06-11_guidance_snapshots.sql` + `_grants.sql` (table + unique 制約 + **service_role への明示 GRANT**)
  - 新規 or 既存 `backend/app/aggregator/consensus_history.py` の sibling として `guidance_history.py` (`build_guidance_rows` 純粋関数 + `fetch_and_build_guidance` 足場、整形のみ。upsert は cron 側)
  - `backend/app/main.py` (cron endpoint `/api/cron/guidance-snapshot` を consensus-snapshot と同パターンで追加、X-Cron-Secret 認証)
  - 新規 `.github/workflows/nightly_guidance.yml` (`nightly_consensus.yml` を template に、CRON_SECRET 共用)
- **呼ぶ既存 skill**: `hallucination-guard` (aggregator への LLM import 禁止確認) / `fmp-api-retry` 思想は不要 (snapshot は既存抽出値の永続化)
- **完了判定**:
  - migration + grants の確認 SQL で service_role に SELECT/INSERT/UPDATE/DELETE が付与済 (7 行)
  - cron endpoint を curl (X-Cron-Secret 付き) で叩き 200 + 1 銘柄 row が upsert される
  - aggregator への LLM SDK import が無い (pre-commit Check 3 pass)

### Sprint 2: SEC 8-K backfill (rate limit / cost 設計)
- **目的**: 報告済み四半期の過去会社ガイダンスを SEC EDGAR 過去 8-K から backfill し、`guidance_snapshots` を埋める (= 即座に raised/lowered 判定が可能な銘柄を増やす)。
- **触るファイル**:
  - 新規 `backend/scripts/backfill_guidance.py` (1 回限り or 手動再実行 batch。**SEC EDGAR rate limit = 10 req/s 厳守**、User-Agent 必須、sleep 挿入)
  - 既存 `backend/app/visualizer/sec_guidance.py` の `extract_guidance` を **転用** (新規 prompt を書かない)
  - 既存 `backend/app/sec_edgar.py` (8-K filing 取得 helper を流用)
- **呼ぶ既存 skill**: `hallucination-guard` (8-K 抽出が 4 層通過確認) / `prompt-cache-optimizer` (backfill で同一 system block を反復 → cache hit で cost 死守)
- **コスト設計 (SPEC で明示、Generator 遵守)**:
  - 8-K 抽出は既存 `_MODEL_8K = claude-haiku-4-5` (Haiku、低コスト)。
  - backfill 対象は **WL / 保有 / screener 上位の銘柄に限定** (全 universe 45k を回さない)。1 銘柄あたり過去 4-8 Q を上限。
  - cache_control で system block を ephemeral cache (反復で 80%+ hit)。
  - **8-K に無い企業 (AAPL 等口頭ガイダンス) は「記載なし」を正常値として記録** (`feedback_sec_guidance_8k_coverage_limit`)。欠損で batch を止めない (graceful skip + log)。
- **完了判定**: WL の数銘柄で過去 2+ Q 分の guidance_snapshots が source_url 付きで埋まる / rate limit エラー 0 / 「記載なし」企業が skip されて batch 完走

### Sprint 3: 比較判定ロジック (Python 数値層) + API field
- **目的**: ① 前回ガイダンス vs 今回ガイダンス → raised/maintained/lowered。② 発表時コンセンサス snapshot vs 今回ガイダンス → above/inline/below (発表時比サプライズ)。両者を `forward.next_q` に新 field として配線。**全て Python 計算、LLM 不使用**。
- **触るファイル**:
  - `backend/app/visualizer/calc.py` (既存 `classify_guidance_vs_consensus` の sibling として `classify_guidance_revision` (前回比) + `classify_guidance_vs_pit_consensus` (発表時比) を新設。閾値はレンジ中点比較)
  - `backend/app/aggregator/` (guidance_snapshots / consensus_snapshots を会計期 join して calc に渡す純粋層)
  - `backend/app/main.py` (forward レスポンスに `guidance_revision_eps/rev` + `guidance_vs_pit_consensus_eps/rev` + 各 `*_as_of` / `*_source_url` を追加)
- **呼ぶ既存 skill**: `hallucination-guard` (数値=Python / narration=LLM 分離確認) / `pge-loop-debugger` (Generator 起動前に落とし穴確認)
- **設計ガード (SPEC で明示)**:
  - **join key は会計期 (fiscal_date / period)**。発表時 snapshot は「決算発表日に最も近い (発表日以前で最新) の consensus_snapshot」を選ぶ (発表後にアナリストが引き上げた値を掴まない = SNOW 誤読の根治)。
  - **snapshot 不在時は `guidance_vs_pit_consensus = "unknown"` + 既存の現コンセンサス比 (記号なし暫定) を据え置く** (§3-3、捏造しない)。
  - 銀行/与信の偽売上サプライズ guard (`feedback_revenue_basis_mismatch`) を sector 別閾値で継承。
- **完了判定**: SNOW で「発表後にアナリストが引き上げ」のケースで、発表時 snapshot を使うと正しく「発表時予想を上回る (above)」が出る (現コンセンサス比の誤った below が解消) / 前回ガイダンスがある銘柄で raised/maintained/lowered が出る / snapshot 不在銘柄は unknown で graceful

### Sprint 4: frontend 表示 (修正判定 + 発表時比サプライズ)
- **目的**: Sprint 3 の新 field を 決算ハイライト (EarningsFlashSummary) 来期行 + 前方視界 (ForwardOutlookSection) に表示。v200 で外した判定記号を **正しいデータ源で復活**。
- **触るファイル**:
  - `frontend/src/features/judgment/constants/earningsFlashTemplates.js` (上方/下方修正の **新規表示語 dict** を追加。`GUIDANCE_STATE_JP` とは別 key。§4 の SSOT)
  - `frontend/src/features/judgment/components/detail/sections/EarningsFlashSummary.jsx` (来期行に「会社ガイダンスは発表時予想を上回る ↑」+「前回ガイダンスから上方修正 ↑」を 1 行で。色なし neutral + ↑↓)
  - `frontend/src/components/ForwardOutlookSection.jsx` (発表時比サプライズの記号復活 + as_of 帰属 caption。現コンセンサス比は時点明示のまま据え置き)
  - `scripts/pre-commit-hook.sh` (Check 7 を「前回ガイダンス比の文脈に限り上方修正/下方修正を許可」に **限定緩和**。§9 確認 1 の user 決定に従う)
- **呼ぶ既存 skill**: `designing-workspace-ui` (表示の 2 秒理解 / 色運用) / `funnel-cro` は不要 (LP 訴求文言・課金 UI を触らないため。ただし表示語が誇大にならないかは hallucination-guard で確認)
- **設計ガード**:
  - 方向記号は **↑↓** (v200 確定、▲▼ は会計の ▲=マイナス衝突で廃止)。
  - 「発表時比」と「前回比」を **別の行 / 別の文脈**として明示 (混在で「どの基準か」が曖昧になると Trust Cliff)。
  - snapshot 不在時は判定行を出さず、現コンセンサス比 caption (v200 暫定) のみ表示。
  - 「速報」「絶好調」等の語を出さない (Check 7 / 表示テキストポリシー)。
- **完了判定**: AAPL (8-K に数値ガイダンス無し) で判定行が graceful に非表示 / snapshot のある銘柄で「発表時予想を上回る ↑」+「上方修正 ↑」が表示 / snap-flash-summary.mjs 系の headless 検証 PASS / pageErrors 0
- **user 追加要件 (2026-06-11 gate 1 時、6体合議で設計判定)**:
  1. **時系列の 2 秒理解**: 「会社ガイダンス提示 (発表時) → 好材料 → アナリストが上方改定 (現在)」 の時間の流れがパッと見でわかる表現にする。v200 round3 で文言を時系列順 (発表時 → 現在) に暫定変更済 (`16752a6`)。Sprint 4 では snapshot 時系列を使った「発表時コンセンサス → 会社ガイダンス → 現コンセンサス」 の 3 点表現 (ミニ時系列 / 矢印連鎖等) を設計する。
  2. **材料の提示**: 「なぜ現コンセンサスが会社ガイダンスより高いのか / なぜ大幅上方改定されたのか」 の材料が見えない (user 指摘)。§38 セーフな候補: (a) コンセンサス推移の**事実文** (consensus_snapshots 時系列から「発表後 N 日でコンセンサス +X% 改定 (アナリスト M 社)」 — 数値は Python 計算) (b) 既存ニュース (NewsPanel) / カンファレンスコール分析への**導線リンク** (LLM 生成なし) (c) LLM narration で理由を要約する案は 4 重防御フル適用が必須のため、採否自体を 6体合議で判定 (近道禁止)。

> **Sprint 5/6 は確保せず 4 sprint で完結**。本番運用済プロダクトの blast radius 制限 (動画原典 10 sprint より少なめ)。Phase 2 (セグメント別売上 + グロスマージン、handover v199 §3) は **本 SPEC のスコープ外**、別 SPEC。

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| ファイル / 領域 | 禁止理由 | 本 SPEC での扱い |
|---|---|---|
| `backend/app/visualizer/prompt.py` | Hallucination Guard pre-commit Check 1 (LLM 数値計算指示 BLOCK) | 触らない。8-K 抽出は既存 sec_guidance.py を転用 |
| `backend/app/aggregator/*.py` への LLM SDK import | pre-commit Check 3 (数値物理層に LLM 禁止) | **新設する guidance_history.py / calc 配線は数値のみ、LLM import 厳禁** |
| `backend/app/visualizer/prompt_negatives.py` | 法務 anchor (BAD 1-6 / §38 / §5) | 触らない。新規 BAD 追加不要 (既存抽出を転用) |
| `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX | 法務 sanitize の正本 (typo 修正以外不可) | 触らない |
| `.claude/launch.json` | 人間用、AI 使用禁止 | 触らない |
| 既存 `docs/migrations/*.sql` (consensus_snapshots 含む) | DB schema 既存。改変は破壊的 | **新規 guidance_snapshots.sql を別ファイルで追加**。既存は read-only 参照のみ |
| `handover_*.md` | read-only reference | 参照のみ、編集しない |
| `railway.toml` cron 定義 | 運用 | 触らない (cron は GitHub Actions 側) |
| `frontend/src/App.jsx` の sticky 検索 div / `.sticky-search-band` | 8 回試行錯誤の安定領域 | **本 SPEC では触らない** (表示先は EarningsFlashSummary / ForwardOutlookSection のみ) |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS | 発光バグ高リスク (v54-v59 6 セッション) | **本 SPEC では新規 card / 発光 CSS を一切追加しない** (既存 component 内のテキスト行追加のみ) |
| `frontend/src/components/ForwardOutlookSection.jsx` の `fmtMoney/fmtEps/GUIDANCE_STATE_JP` export | EarningsFlashSummary と 1:1 mirror (v199 金融条件) | export 構造を壊さない。**新規修正語 dict は earningsFlashTemplates.js 側に追加** (GUIDANCE_STATE_JP に混ぜない) |

> **pre-commit-hook.sh の Check 7** のみ例外的に **触る** (Sprint 4、§38 限定緩和)。ただし全面解除は禁止、§9 確認 1 の user 決定に従い「前回ガイダンス比の文脈に限定」する。

---

## 7. multi-review 必要性判定

CLAUDE.md 3 軸を本 SPEC に適用:

| 軸 | active か | 根拠 |
|---|---|---|
| 1. LLM 出力品質 (景表法/金商法/hallucination) | **active** | 「上方修正/下方修正」の §38 境界 (前回比 OK / 現コンセンサス比 NO-GO) + Check 7 緩和 + 8-K backfill 抽出の citation。判定誤りは Trust Cliff |
| 2. Trust Cliff (LP 訴求 vs 実装) | **active** | 「発表時比」を名乗るなら発表時 snapshot を使う正直さ (§3-3)。snapshot 不在の捏造禁止。SNOW 誤読の根治が core |
| 3. 新 backend endpoint + RLS/認証 + cache 設計 | **active** | 新 table `guidance_snapshots` + service_role GRANT + 新 cron endpoint `/api/cron/guidance-snapshot` (X-Cron-Secret) + 8-K backfill の cache/rate limit |

**3 軸すべて active → 6 体合議推奨**。

- 推奨構成 (cost mixed model、CLAUDE.md コスト運用準拠):
  - Opus 2-3 体: 金融 verdict (§38 上方修正の境界 / 発表時比の正当性) / Anthropic engineer (8-K backfill の cache・rate limit・cost) / マーケ (Trust Cliff = 発表時比の訴求正当化)
  - Sonnet 3 体: ui-designer (↑↓ + caption の 2 秒理解) / frontend-architect (forward field 配線 / EarningsFlashSummary 表示) / qa-dogfooder (AAPL graceful / SNOW 誤読解消の dogfood)
- **gate のタイミング**: Sprint 1 着手前 (schema + §38 境界 + 発表時 join の設計判断が固まる地点) に 6 体を 1 回。実装中盤 (Sprint 3 の判定ロジック確定後) に必要なら 3 体で再確認。

> 末尾判定: **6 体合議 (3 軸全 active)**。

---

## 8. 想定リスク + roll-back plan

| リスク | 壊れるもの | roll-back |
|---|---|---|
| **新 table GRANT 抜け** | backend が service_role で SELECT 拒否 → 空配列 silent fail (cup-notify 事件の再来) | `_grants.sql` の確認 SQL で 7 行検証。fix は `grant select,insert,update,delete on public.guidance_snapshots to service_role;` を migration 本体に追記 |
| **§38 違反 (現コンセンサス比に「上方修正」漏れ)** | 景表法/金商法抵触 risk + brand 信頼毀損 | Check 7 緩和を「前回比文脈限定」で実装。漏れたら `scripts/pre-commit-hook.sh` を git revert で全面 BLOCK に即戻し |
| **発表時 snapshot 捏造 (不在を現在値で偽装)** | Trust Cliff (SNOW 誤読の再来) | Sprint 3 で unknown graceful を DoD 化。万一出たら frontend feature flag (`?guidance_pit=0`) で判定行を即非表示 → 現コンセンサス比 caption に戻す |
| **8-K backfill の cost spike / SEC rate limit ban** | Anthropic 課金 spike / SEC IP block | backfill は WL 限定 + Haiku + cache。1 回限り batch なので走らせなければ影響なし。billing alert (日次 $5) で 24h 検知 |
| **frontend 表示崩れ (発光/card)** | EarningsFlashSummary / ForwardOutlookSection の visual regression | 本 SPEC は **新規 card / 発光 CSS 追加なし** (テキスト行のみ)。崩れたら該当 commit を git revert |

### 緊急 roll-back 手順
1. **frontend 表示の問題**: feature flag (`?guidance_pit=1` opt-in にしておけば default で旧表示) で即無効化 → 影響ゼロ化。
2. **backend 判定の問題**: 該当 commit を `git revert <hash>` → `git push origin main` (Railway auto-deploy ~30s)。forward の新 field は追加なので、frontend が optional chaining で読めば旧表示にフォールバック。
3. **cron の問題**: GitHub Actions workflow を `.github/workflows/nightly_guidance.yml` の `on.schedule` 削除 or workflow disable で蓄積停止 (既存 consensus snapshot には影響なし、独立)。
4. **table の問題**: `guidance_snapshots` は consensus_snapshots と独立。drop しても既存機能は無傷。

> 全体方針: **default は v200 の現状表示 (記号なし暫定) のまま**、新判定は feature flag opt-in で dogfood → user OK 後に default ON 昇格 (決算ハイライトと同じ昇格 path)。これで本番リスクを最小化。

---

## 9. user 確認事項 (main session が user に提示 / planner 推奨案 + 代替案)

> AskUserQuestion は使わず、main session がこの §9 を user に提示する。各項に推奨案 (P=Pro / D=Con) + 代替案。

### 確認 1: pre-commit Check 7 の §38 限定緩和 方法
現在 Check 7 は flash 系 file への「上方修正/下方修正」を無条件 BLOCK。前回ガイダンス比に限り許可したい。
- **推奨案 A: 行注釈ホワイトリスト** — `// @company-guidance-revision` コメントがある行でのみ「上方修正/下方修正」を許可。P=誤許可の範囲が行単位で最小、grep で監査可。D=注釈付け忘れで false BLOCK の手間。
- 代替案 B: 専用 dict ファイル (`guidanceRevisionTemplates.js` 等) を新設し、そのファイル名のみ Check 7 から除外。P=ファイル分離が明快。D=ファイルが増える、現コンセンサス比への漏れ検出が file 名頼みで弱い。
- 代替案 C: 緩和せず「上方修正」の語自体を使わず「会社が見通しを引き上げ ↑」等の言い換えで Check 7 を回避。P=Check 改変ゼロで最も安全。D=user 要望の「上方修正」表現と乖離。

### 確認 2: 発表時 snapshot が無い報告済み四半期の backfill 近似
FMP は point-in-time コンセンサス API 無し。報告済み Q の「発表時予想」は FMP earnings の凍結 estimate (発表時の予想値) で近似 backfill 検討可。
- **推奨案 A: FMP 凍結 estimate で近似 backfill (注記付き)** — 報告済み Q は FMP の発表時 estimate を「発表時比」近似として使い、`as_of` caption に「(FMP 発表時予想)」と出典明示。P=過去四半期も即判定可能、SNOW 誤読の過去分も救済。D=FMP 凍結値が真の発表時コンセンサスと完全一致しない近似誤差。
- 代替案 B: 近似せず、今後の nightly snapshot 分のみ「発表時比」判定 → 過去 Q は現コンセンサス比 caption のまま。P=データの厳密さ最優先、近似誤差ゼロ。D=判定が出る銘柄が当面少ない (snapshot 2 点蓄積待ち)。

### 確認 3: 8-K backfill の対象範囲
- **推奨案 A: WL + 保有 + screener 上位に限定、1 銘柄 4-8 Q** — P=cost/rate limit を抑制、dogfood に十分。D=対象外銘柄は当面 unknown。
- 代替案 B: 主要 universe (S&P500 等) まで拡大。P=カバレッジ広い。D=cost/rate limit リスク増、release 前に不要。

### 確認 4: release 戦略 (feature flag)
- **推奨案 A: feature flag opt-in (`?guidance_pit=1`) で dogfood → user OK 後 default ON 昇格** (決算ハイライトと同じ path)。P=本番リスク最小、roll-back 容易。D=昇格まで 1 step 増える。
- 代替案 B: 最初から default ON。P=即体験。D=snapshot 蓄積が浅い段階で「unknown 多発」を user が見る = 体験が薄い。

### 確認 5: Phase 2 (セグメント別売上 + グロスマージン) との順序
handover v199 §3 の Phase 2 は本 SPEC スコープ外。着手順序の確認。
- **推奨案 A: 本ガイダンス履歴基盤を先行** (Sprint 1 の snapshot 収集を 1 日でも早く開始 = 将来判定が早まる)。P=蓄積資産は時間が価値、早期着手の ROI 高。D=Phase 2 が後ろ倒し。
- 代替案 B: Phase 2 先行。P=handover の流れ的に連続。D=ガイダンス snapshot 収集開始が遅れ、判定可能になる時期が遠のく。

---

## 付録: 既存資産マップ (Generator の起点)

| 役割 | 既存ファイル | 本 SPEC での使い方 |
|---|---|---|
| コンセンサス snapshot table | `docs/migrations/2026-06-06_consensus_snapshots.sql` (+ `_grants.sql`) | template として参照、guidance_snapshots を sibling 新設 |
| コンセンサス整形純粋関数 | `backend/app/aggregator/consensus_history.py` | template として参照、guidance_history.py を sibling 新設 |
| コンセンサス cron | `.github/workflows/nightly_consensus.yml` | template として参照、nightly_guidance.yml を sibling 新設 |
| 8-K ガイダンス LLM 抽出 | `backend/app/visualizer/sec_guidance.py` (`extract_guidance`、4 層通過済) | backfill で**そのまま転用** (新規 prompt 不可) |
| 8-K filing 取得 | `backend/app/sec_edgar.py` | backfill で流用 |
| 現コンセンサス比判定 | `backend/app/visualizer/calc.py` (`classify_guidance_vs_consensus` L190) | sibling として revision / pit_consensus 判定を新設 |
| forward レスポンス配線 | `backend/app/main.py` | next_q に新 field 追加 |
| 表示 (来期行) | `frontend/src/features/judgment/components/detail/sections/EarningsFlashSummary.jsx` | 行追加 (新規 card なし) |
| 表示 (前方視界) | `frontend/src/components/ForwardOutlookSection.jsx` | 記号復活 + caption |
| 修正語 dict SSOT | `frontend/src/features/judgment/constants/earningsFlashTemplates.js` | 上方/下方修正の新 key 追加 |
| §38 BLOCK | `scripts/pre-commit-hook.sh` Check 6/7 | Check 7 を前回比文脈に限定緩和 |

---

## 10. 6体合議 verdict (2026-06-11、6/6 条件付賛成 = 実装 GO)

構成: 金融 + Anthropic = Opus / ui + 設計 + qa + マーケ = Sonnet。以下は Generator が DoD として扱う **必須条件**:

1. **Check 7 緩和 = 案 A 行注釈ホワイトリスト**: negation pipe に `@company-guidance-revision` を追加。修正語 dict は earningsFlashTemplates.js に **1 行 1 エントリ + 行末注釈**。`GUIDANCE_STATE_JP` には絶対付与しない (全員一致)
2. **LLM 理由要約 (材料 c) は本 SPEC スコープ外** (全員一致)。材料提示 = (b) NewsPanel/CC コール分析への導線リンク先行 + (a) コンセンサス改定の事実文 (Python 計算) は後続 enhancement
3. **basis 必須カラム化 + 前回↔今回 basis 不一致は unknown** (見かけ修正 artifact 防止、金融/Anthropic)
4. **join key = (ticker, period_end_date[date], period_type)**。同一 period の再修正のみ raised/lowered、次 Q 新ガイダンスは比較対象外。fiscal_period 文字列一致に頼らない (金融/Anthropic/設計)
5. **発表時 snapshot 選択 = `snapshot_date < announcement_date` (同日除外優先、未来側は絶対採らない、無ければ unknown)** + 乖離 7 営業日超は stale 降格。SQL 実装 (Python メモリフィルタ禁止)。Sprint 3 DoD + SNOW 型 fixture pytest 必須 (金融/設計/qa)
6. **unique 制約 = (ticker, period_end_date, fiscal_period) の idempotent upsert** (snapshot_date を含めない)。amend 8-K (accession 末尾 -A / filed_at 新) の上書き policy を Sprint 2 に明示 (設計/Anthropic)
7. **8-K 次 Q の fiscal_date 解決 helper** (filing 日 + 会計カレンダー → 期末日確定) を Sprint 2/3 タスクに追加 — join 成立の前提 (Anthropic、致命欠落の指摘)
8. **cron return schema は consensus cron と 1:1 mirror** + per-ticker try/except continue + CRON_SECRET 流用 (Anthropic)
9. **feature flag = default OFF / `?guidance_pit=1` opt-in** を 1 箇所固定 (Anthropic)
10. **§9 確認 2 (FMP 凍結 estimate 近似 backfill) は厳格化 A' で着地**: 採用するが **近似値には判定記号 (↑↓/above 等) を出さず参考表示層に隔離**、caption は `(FMP 発表時予想 / YYYY-MM-DD・近似値)` + 注記常設 (金融の条件と マーケの代替案 B 懸念の両立。真の snapshot が揃ったら上書き優先)
11. **dogfood 前に WL/保有限定 backfill を完走** (opt-in 時に 1 銘柄以上埋まっている状態)。Sprint 2 に --dry-run mode (qa)
12. **8-K 非開示企業 (AAPL 等) には「※ガイダンス非開示のため判定なし」caption** (「壊れてる」誤解防止、qa)
13. **tolerance = ±2% + 絶対額フロア (EPS ±$0.01) の AND**、low/high 両端移動の補助フラグ保持 (金融推奨)
14. **tier gate は当面なし** (前回比判定は無料の磁石。発表時比の Pro gate は snapshot 安定後に再検討、マーケ)
15. **UI 設計 (ui-designer 案 A)**: 矢印連鎖 1 行 (発表時予想 → 会社ガイダンス → 現コンセンサス) + 判定バッジ 2 個 (前回比/発表時比、10px neutral、混同防止のラベル明示)。改定社数は実改定社数で (field 数の人数誤表記 pitfall 禁止)
