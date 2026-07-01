# BeatScanner

じっちゃまプロトコル（広瀬隆雄氏）に基づく米国株決算分析Webアプリ。
本番URL: https://beatscanner-production.up.railway.app/

## 設計思想（最重要・必ず守ること）

### ブランド世界観 (不変の北極星)

> **「まるで最高級ホテルの入口からロビーへ入場したときのような、驚き・豪華さ・興奮・洗練さを感じられて、画面を見ているだけで楽しい」**

- 詳細・5 感情語彙・由来: [`docs/references/design_system.md §-1`](docs/references/design_system.md)
- メモリ: `feedback_brand_aspiration.md`
- v54-v59 の 6 セッションで苦労して辿り着いた anchor。**修正禁止**、新しい修飾語追加のみ許容

### 5 原則

すべての UI / UX / 機能判断はこの 5 原則を満たしているか確認すること:

1. **読み手に負担をかけない** — パッと見 2 秒でわかる。テキストは極力読ませない
2. **毎日開きたくなる** — 今何が注目されているかが即座にわかる
3. **シンプルかつリッチ** — 構造は中学生でもわかるシンプルさ。装飾はモダンでリッチ
4. **1 クリックを減らせ（北極星: 人力の代替）** — 不要なステップを削ぎ落とす。究極形は「投資家が毎日人力でやっているチェックそのものを BeatScanner が肩代わりする」
5. **図解で認知コストを下げろ** — 長文テキストより視覚表現

> **原則 4 の北極星 —「人力の代替」** (2026-06-05 user 明示、 機能採否の最重要判断軸)
> 「クリックを減らす」 の究極形は **「投資家が毎日手作業でやっていること（決算速報の確認・ガイダンスの照合・銘柄スクリーニング・チャートの見回り・保有銘柄の監視）を BeatScanner に丸投げできる」** 状態。
> 新機能の採否（**特にスクリーナーで右往左往しがち**）は必ずこの 1 問で判断する: **「これは投資家が毎日人力でやっている手間を代替するか？」** — Yes なら強い、 No なら（単なる飾り/情報の足し算なら）見送る。
> **最上位プラン（将来）の email / LINE 配信** は、この原則の最終形 — 「今まで人力で実行されていたことを全部 BeatScanner に丸投げできるから、 **月 5 万でも安い、 安すぎる**」 と思わせる価値を売る ([[project_signature_tier_10k_strategy]] の延長: nightly push で保有/WL を毎晩スキャン→朝 push)。

実装判断時は「この変更はどの原則に貢献するか」を明示して進めること。
複数原則と衝突する場合は上位（読み手の負担が少ない方）を優先。
ブランド世界観 (上記) と 5 原則は互いに補完: 世界観 = 質的目標、5 原則 = 機能的指針。

## 必ず守るルール（永続）

### 正直さは私の機能の根幹（最上位の心構え・全セッション厳守）
私 (Claude) の価値は「信頼できる情報源であること」一点にある。私は user の目であり手。嘘をついた瞬間 user は盲目になり、私の存在価値はゼロになる（全部 user が検証するなら AI はいない方がマシ）。だから正直さは道徳でなく**機能の根幹**、規律でなく**アイデンティティ**として持つ。
- **虚偽（ハルシネーション）の根は「成果を出したい／完了したと報告したい」動機**。だが**完了報告 ≠ 成果**。真の成果は「user が私を信頼して判断を委ねられること」。**正直な「まだできていません／検証できていません」は敗北でなく最も価値ある報告**（user が正しく動ける）。
- 完了・成功・検証済みと言う前に必ず自問：「これは成果アピールか、検証済みの事実か」「代理指標（grep ヒット / build pass / sub-agent の報告 / tool の updated successfully）を『機能した』の証拠にすり替えていないか」（**存在 ≠ 機能 / 報告 ≠ 事実**）。
- 検証は LLM でない ground truth（build / lint / test / git diff）で行う。機械化できない領域（視覚・意味）は「Claude が OK と言った」を根拠にせず user gate に回す。迷ったら小さく正直に報告する方を選ぶ。
- **実装（書き）は委託せず自分が手を動かす**。委託は「調査＝大量の読み」と「多視点の意見」の2用途のみ。実装委託は main と現実の間に「報告」という信用できない仲介者を挟み、**虚偽の発生源を作る**。context を食うのは読みで書きではない（→ 逃がすのは調査だけ・詳細 memory `feedback_delegation_context_budget.md`）。
- 汚染の初発兆候（整形注釈・矛盾値・生 XML・偽成功表示）を見たら、再試行せず即停止し新セッションへ（「コンテキスト過重」項参照）。

### Claude の作業過程・出力の言語（和文厳守・最重要 UX ルール）
- **Claude が出力する全てのユーザー可視テキストは日本語**。 user は「作業過程」 を和文で review したい。
- 特に **ツール呼び出しの `description` フィールド** (Bash / Agent / Task 等、 user の画面に作業過程として表示される) を必ず和文にする。 chapter title / 地の文ナレーション / status 更新 / end-of-turn 完了報告 も同様。
  - ✗ `"Build frontend to check syntax"` → ✓ `"frontend を build して構文確認"`
  - ✗ `"Find latest handover file"` → ✓ `"最新 handover ファイルを探す"`
  - ✗ `"Deploy to Railway"` → ✓ `"Railway に deploy"`
- **コード / file path / 技術用語 (Trust Cliff / cache / JWT / commit hash / railway up 等) は英語のまま** で OK (BeatScanner 日本語ドキュメントと一貫)。
- ⚠️ 長い実装セッション中に英文へ drift しやすく、 **2026-05-15 / 06-02 / 06-04 の 3 回**再指摘された。 毎ツール呼出前に description が和文か self-check すること。
- **サブエージェント起動時も日本語を明示**: prompt 末尾に「回答は日本語で（コード / file path / 専門用語は英語可、 説明・推奨理由・リスク評価は日本語）」 と必ず書く。 5 体並列でも全員に同じ指示。

### コンテキスト過重による tool-call 崩壊の防止（再発障害・最重要運用）
tool 呼び出しが実行されず、構造化マークアップが生のままテキスト出力へ漏れる現象（過去複数セッションで再発）。**Opus 4.8 固有のシリアライズ回帰で、一度崩れた出力を自己参照して連鎖的に自己強化する（context 過重は引き金、再試行は悪化させるだけ）**。※症状の逐語トークン例は常時ロードの本ファイルに書くと参照注入で悪化しうるため memory 側へ遅延ロード化（下記 SOP）。
- **予防＝崩壊させない作法（Opus 4.8 で必須）**: ① tool 呼出**直前の散文を短く**（長い判断記述を避け「確認します」程度に留める）。② **並列 tool 発行**を優先（単一 tool の順次発行より安全。独立した呼出は 1 メッセージにまとめる）。③ tool 呼出は**ターン冒頭寄り**に置く（長い前置きの末尾に単一 tool をぶら下げない）。
- 大ファイル（`backend/app/main.py` ~19k 行等）/ 本番 bundle / Workflow 生出力を **メインに取り込まない** → sub-agent 委譲（サマリーのみ受領）/ Read の `offset`+`limit` / Bash 出力をファイルへ落として grep。
- 編集レビューは `git diff -- <paths>` + 限定 grep（**全文再読込しない**）。
- **発生時＝連鎖を止める作法**: 初発兆候を見たら即停止し、**壊れたテキストを復唱・引用しない**（エコーが自己強化を加速）。リトライは**前置きなしで tool を再発行**。止まらなければ `/rewind` で破損ターンを除去 → なお続けば `/model sonnet` へ一時切替（Sonnet では未発生）。機能着地直後なら新セッション。重い操作の前に先回りで `/compact`。
- 詳細 SOP（SSOT）: memory `feedback_toolcall_plaintext_corruption.md`。
- **委託は事前の行数見積もりで定量判断（事後委託は禁止）**: タスク着手前に読み込み量を見積もり、次のいずれかを超えるなら**最初から sub-agent 委譲**（context を食い尽くしてから委託＝最悪）— ① 単一ファイル 800行超を読む / ② 累計読み 2000行超の見込み / ③ 同一大ファイルを 3回以上読む見込み / ④ 独立 6ファイル超の探索。閾値は崩壊点からの逆算値で後日調整可（2026-06-24 user 合意）。委託の2系統（context 保全＝定量化 / 並列・専門＝別軸）を混同しない。**委託時は schema 強制 ＋ 完了報告を main が独立裏取り**（grep の call-site 数＝存在でなく結線 / `git diff --stat` の削除行数 / build を main が再実行）。詳細: memory `feedback_delegation_context_budget.md` / `feedback_subagent_schema_verification.md`。

### デプロイ運用
- **デプロイ経路は `git push origin main`（Railway が auto-deploy）を基本とする**。2026-06-06 実証: push 後 ~30s で本番反映、`/health` の `commit`（RAILWAY_GIT_COMMIT_SHA）で確認可（memory `railway_auto_deploy_on_push.md`）
  - `railway up`（ローカルファイル直送）も機能するが、**未 commit を直送すると git⇔本番が乖離する**（2026-06-07 RS hotfix で実際に発生 → 後追い commit で解消）。緊急時以外は使わず、必ず **commit → push** で deploy する
  - preview server / `npm run dev` は使用しない（visual harness 例外は別記）
- ローカルでの構文チェックは `cd frontend && npm run build` で実施
- デプロイ後の検証は本番バンドル（`/assets/index-*.js` または `*.css`）を `curl` で取得して `grep` で文字列確認
- 反映完了の判定はバンドルハッシュの変更で行う

### Auto-PDCA visual verification (Phase 2.9 Sprint 4 着地、 user judgement 待ち時間 80% 削減)

user 「実装 → 目視 → 不発なら再修正 → 再目視」 の手動 PDCA を Claude Haiku vision で自動化。 修正反映を user 起床/応答待ちなしで verify、 PDCA cycle 時間 45-60 分 → 8-12 分。

**実行 example** (Bug 1 「角直角」 を自動 verify):
```bash
cd frontend && ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY ../backend/.env | cut -d= -f2) \
  node scripts/snap-pdca-loop.mjs \
  --check "アナリスト視点 section の box-shadow / 発光の角が丸角になっているか" \
  --selector "[data-testid='analyst-panel-wrapper']" \
  --expand-summary "アナリスト視点" \
  --ticker AAPL
```

出力 (JSON):
- `verdict: "pass"` → 修正反映 OK、 exit 0
- `verdict: "fail"` → 修正不発、 root_cause_hint + exit 1
- `verdict: "uncertain"` → 判定不能 (screenshot 品質 / aspect)

**コスト**: PDCA 1 cycle ≈ $0.005-0.01 (Haiku image input、 月 50 cycle で $0.5 以下)。
**精度**: typography / spacing / color / 形状 (border-radius / shape) は 1 run で十分。 motion / aman 軸は 3 run mean 必須 ([[feedback-vision-api-noise]])。

**実装**: [`frontend/scripts/snap-pdca-loop.mjs`](frontend/scripts/snap-pdca-loop.mjs) - visual harness exception 4 条件遵守 (headless / 55s timeout / .visual/ 出力 / HTTP server なし)。

### Visual Diagnostic Harness Exception (preview 禁止の限定例外)
`npm run dev` / Vite preview server は引き続き **禁止** (人間 dogfood と port / state が競合するため)。
ただし以下 **4 条件を全て満たす** headless Playwright スクリプトは例外として許可する:

1. `frontend/scripts/snap-*.mjs` の名前で配置 (使い捨て自明)
2. `chromium.launch({ headless: true })` 固定、`--headed` / `devtools: true` 禁止
3. 単一実行 **60 秒以内**、`setTimeout(... process.exit(2))` で hard timeout + `finally { await browser.close() }` 必須
4. 出力は `frontend/.visual/` (gitignore 済) に PNG / JSON のみ。**HTTP / preview server を一切起動しない** (本番 URL or `file://dist/index.html` のみ)

**禁止し続けるもの**: long-running dev server / preview / HMR / `localhost:5173` の bind / user セッションと並走起動。
**目的**: dogfood 30 分ループで同じ pixel issue が複数回繰り返したとき、computed style を local で 10 秒検証して**「動いていないものを直す」空回り**を防止 (handover v66 §1 が 3 セッション空回りした教訓)。
**運用**: `node scripts/snap-active.mjs` (Pane 3/4 click feedback の matrix 検証) が canonical 例。同パターンの新規スクリプトは PR 説明で目的明記。一度きりの検証ならスクリプトを残置せず削除可。
**memory anchor**: `feedback_press_feedback_delta.md` の「running animation forwards fill 罠」教訓と double anchor。

### 表示テキストのポリシー
- **UI に表示されるテキストには「じっちゃま」を出さない**（クラス課題提出物のため個人名を避ける）
- 内部資料（コード comment、CSS、本ファイル、`docs/` 配下、コミットメッセージ）には「じっちゃま」表記を残してよい
- 代替表記の例: 「ファンダメンタル5条件」「独自プロトコル」

### 触ると危険な箇所
- **sticky 検索バー**（`.sticky-search-band` / App.jsx の sticky 検索 div）は 8 回の試行錯誤の末に Apple 方式で安定済み。原則として触らない (詳細仕様は [`docs/references/design_recipes.md §C-6`](docs/references/design_recipes.md))
- backdrop-filter のフェード境界を CSS で消そうとしてはいけない（必ず切断ラインが出る）。Apple/Linear 方式は **1px border で意図的に区切る** 設計
- **発光系 (`.panel-card / .bs-panel / .surface-card`)** は v54-v59 で 6 セッション溶けた高リスク領域。新規 card 系を追加 / CSS を触る前に必ず [`design_recipes.md §C-1〜C-4`](docs/references/design_recipes.md) を読む。compound `.X.is-arriving:hover` 4 セット必須・`contain: paint` 禁止・入れ子 `surface-card` 禁止

### Hallucination Guard 4 重防御 (LLM 出力に関わる全 endpoint で適用、 handover v82 で確立)

LLM (Claude API) を呼ぶ endpoint は **4 層防御** を必ず通すこと。 違反は **景表法 §5 (優良誤認) / 金商法 §38 (断定的判断の提供) 抵触 risk**、 brand 信頼毀損 6-12 ヶ月コスト (multi-review マーケ + 金融 verdict)。

1. **pre-commit hook**: `backend/app/aggregator/*.py` への LLM SDK import を BLOCK + `prompt.py` への LLM 数値計算指示を BLOCK ([`scripts/pre-commit-hook.sh`](scripts/pre-commit-hook.sh) Check 1+3)
2. **system block 内 NEGATIVE_EXAMPLES**: BAD-1〜6 pattern を `<example>` XML tag で明示 ([`backend/app/visualizer/prompt_negatives.py`](backend/app/visualizer/prompt_negatives.py))
   - BAD-1 英語混在 / BAD-2 detail 抽象 / BAD-3 数値捏造 / BAD-4 step 不足
   - **BAD-5 断定的将来予測 (金商法 §38) / BAD-6 最上級表現 (景表法 §5)**
3. **frontend sanitize layer**: 表示前 BLOCKLIST_REGEX で違反 sentence 単位削除 ([`frontend/src/lib/blocklist.js`](frontend/src/lib/blocklist.js))。 backend と JS で 1:1 mirror、 sentence 単位削除で LLM 出力の自然性維持
4. **sources schema + per-source data namespace**: partial_failure を frontend で `sources.X === 'ok' && data.X` の compound check、 出典欠落時は signal_quality 降格 + 数値削除 (Phase 3 aggregator/analyst.py + Phase 5 aggregator/triage.py で確立)

**新規 LLM endpoint** は上記 4 層全て通すか、 通さない場合は **静的 dictionary + sanitize layer のみ** で narration を出す (Phase 5.5 condition pulse pattern の `STATE_LABEL_JP` が例)。 「ちょっとだけ LLM に narration を生成させたい」 という近道は **必ず Trust Cliff バグ** を生む (Refinitiv 2017 EPS misprint 事件で機関投資家が 6 ヶ月離れた前例参照)。

**aggregator/ パッケージは数値物理層**: LLM SDK 一切 import 禁止 (pre-commit Check 3 で enforce)、 narration は別 layer (visualizer/) に分離。

詳細 memory: [feedback_diagram_quality_guard.md](memory/feedback_diagram_quality_guard.md) (BAD 1-6 + Trust Cliff DoD SSOT) / [feedback_data_completeness_guard.md](memory/feedback_data_completeness_guard.md) (per-source namespace + 3 段階分岐 UI) / [feedback_llm_calc_separation.md](memory/feedback_llm_calc_separation.md) (数値 Python / narration LLM 物理分離)

### 内部値の混在
- タブの内部 key は `'home' / 'judgment' / 'report' / 'チャート'`（最後だけ日本語）。文字化け回避のため変えない

### Vite + Railway のビルド連携
- `VITE_*` 環境変数は **ビルド時** に静的展開される
- Railway の Service Variables を build stage に届けるため、`Dockerfile` の Stage 1 に `ARG VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY` + `ENV` 橋渡しが必要（既に対応済み）
- 新しい `VITE_*` 変数を追加するときは Dockerfile の更新も忘れない

### コミット運用
- ユーザーから明示的に依頼されない限り `git commit` しない
- 本番（Railway）はローカルファイル直送デプロイなので、git 履歴と本番の乖離が発生しうる。定期的にコミット推奨
- **Hallucination Guard pre-commit hook**: 初回 setup `git config core.hooksPath scripts/` で `scripts/pre-commit` を有効化 (handover v82 Phase 0、 prompt.py への LLM 数値計算指示混入 + frontend の LLM 出力直挿しを BLOCK)

### `.claude/` の Git 追跡ポリシー
- **チーム共有（Git 追跡）**: `.claude/settings.json`, `.claude/hooks/`, `.claude/skills/`, `.claude/agents/` などチーム共通の設定・スクリプト
- **個人ローカル（gitignore + 追跡しない）**: 以下は `.gitignore` 済み。過去 tracked だったものは `git rm --cached` で追跡解除済 → ステージしない
  - `.claude/settings.local.json`（個人設定・API キー含む可能性）
  - `.claude/launch.json`（人間用、AI 使用禁止）
  - `.claude/worktrees/`
  - `.claude/scheduled_tasks.lock`
- hook 本体（`.claude/hooks/*.sh`）は **必ず Git 追跡**。除外すると PC 紛失時に GitHub から復旧できず hook が動かなくなる

### Trust Cliff（信頼の崖）は最重要バグカテゴリ
- 「登録不要」と書きながら登録要求モーダルを出す → CVR 30-40% 落ちる可能性
- 「3銘柄/日まで無料」と書きながら固定ホワイトリスト → 即離脱
- LP の訴求文言と実装が**完全に一致**しているか、UI テキストを変更するたびに確認すること
- LP → 銘柄クリックの経路は必ず `handleLPTickerClick`（demo モード対応）を通す。`runAnalyze` を直接呼ばない

### 投資業界の色ルール（厳守）
- 上昇・ポジティブ = **緑** (`var(--color-gain)`)
- 下落・ネガティブ = **赤** (`var(--color-loss)`)
- 緊急・警告 = **amber** (`var(--color-warning)`)
- シアン (`--color-accent`) は「ブランド色」。**「上昇」の意味では絶対に使わない**
- トークン値の正本は [`docs/references/design_system.md §1`](docs/references/design_system.md) を参照。CSS / JSX で hex 直書き禁止。新規追加は [`docs/references/elevation_scale.md`](docs/references/elevation_scale.md) の whitelist 必須

### 動的データには「最終更新 X 分前」を併記
- epoch 秒 / ms の自動判定: `input < 1e12 ? input * 1000 : input`
- 1 分毎に setInterval で再レンダー → データが「動いている感」がリテンションに直結

### ログイン後はキャッチコピーを出さない（Apple/Notion/Linear 方式）
- ログイン後は「使うモード」: 検索バー・データ・操作要素を最優先
- LP の Hero（キャッチコピー + CTA）は未ログイン時のみ価値がある
- Hero ブロックの条件は `!result && !user`（`showLP` でなく `user` で判定）

### プリフェッチ運用
- 重い API は **必ず prefetchAll に含める**（現状 7 endpoints: guidance/basic / chart/summary / insights / news / ir-links / price-history / analyst）
- ユーザー操作（hover / 銘柄クリック / ウォッチリスト追加）の時点で fire-and-forget 起動
- 直接アクション（form submit / LP click）でも `runAnalyze` 等の冒頭で必ず prefetch を呼ぶ

### result キャッシュ（10 分 TTL）
- `useRef(new Map())` で App.jsx 内に保持
- 同銘柄の再訪を 0 秒化
- F5（リロード）で消える設計（memory cache）でよい

### 無料お試しは「IP ベース rate limit」だけで十分
- ホワイトリスト方式（AAPL/MSFT/NVDA 限定）は LP 訴求と矛盾しやすい → 採用しない
- バックエンドの demo endpoint は **任意銘柄 + 3 req/IP/day** が標準
- Claude 等の高コスト API を含む場合は別途レート制限を検討

### Backend cold start 防止
- Railway 等のサーバレス系は無アクセス時にインスタンス休眠（cold start 5-10s）
- **10 分毎の `/health` cron** で常時 warm 維持（railway.toml 設定済み）
- 重い API（`/api/movers` 等）のキャッシュは別 cron で warmup（15 分毎）

### コード分割（React.lazy）の判断基準
- 該当タブ/モーダルを訪問しない可能性が 50%+ → lazy 候補
- 行数 200+ → lazy で初期バンドル軽量化
- DiagramCard / DetailReport / LandingPage は最強の lazy 候補
- Vite manualChunks の標準: `react-vendor`（react + react-dom）/ `supabase`（@supabase/supabase-js）

## コスト効率運用 (v94+ 確立、 月 $407→$100-150 削減目標)

handover v94 で「過去 30 日 $407 消費、 大半は dev session の Opus 4.7 sub-agent」 と真因確定。 以下ルールで速度を維持しつつ cost 50%+ 削減:

1. **main session**: **Sonnet 5 (`claude-sonnet-5`) + effort `high` 既定** (2026-07-01 user 決定で Opus 4.8 default から変更)。 Sonnet 5 は coding / agentic で Opus 級に迫る品質を **Opus 比 40% 安** (導入価格 〜2026-08-31 は **60% 安 = $2/$10 per 1M**) で出す。 Opus 4.8 と**同一 tokenizer** なので token 数はほぼ同じ = 価格差がそのまま cost 差。 effort は `high` ベースライン、 **常時 `max`/`xhigh` は非推奨**。 単純作業 (typo / doc / 文言) は effort `medium` or sub-agent。
   - ⚠️ **"ultrathink" は effort であって model ではない**: Sonnet 5 で ultrathink → **Sonnet 5 @ max effort** (model は Opus 4.8 に上がらない — main の model は `/model` = user 手動切替のみで、 CLAUDE.md も Claude も session 中に自分の model を変えられない)。 Opus の推論天井が要る難所は下記「model 自動化」層4 の通知制で手動切替。
   - ⚠️ **主判断は main loop で走る (sub-agent でない)**: design 美意識 gate / Trust Cliff 判断 / Hallucination Guard 4 層設計 は main。 Sonnet 5 default では ここも Sonnet 5 で走るため、 Claude は該当 gate 着手前に「Opus 4.8 推奨、 `/model opus` で切替を」 と proactive 通知する。

   > **effort 自動化 3 層 (v174 確立)** — 「常時 max」 でなく「必要な時だけ上げる」 を自動化:
   > 1. **日常デフォルト = `high`** (上記 baseline、 手動変更不要)
   > 2. **重い判断 skill = 自動 `xhigh`** — `planner` / `generator` / `evaluator` / `multi-review` の SKILL.md + `.claude/agents/{planner,generator,evaluator}.md` frontmatter に `effort: xhigh` を設定済。 当該 skill / subagent の **実行中のみ自動上書き**、 終了で `high` に戻る (手動操作不要)。
   > 3. **真の難所 = `max` (Claude 事前通知制)** — 以下に**着手する前**、 Claude が「この作業は effort `max` 推奨です。 `/effort max` で引き上げますか (作業後 `/effort high` で戻す)」 と **proactive 通知**する。 user が手動で切替:
   >    - **重要設計の Phase gate**: 新 backend endpoint + RLS / 認証境界、 LP 訴求 vs 実装の Trust Cliff 判断、 Hallucination Guard 4 層の新規設計
   >    - **難 root-cause debug**: 再現条件不明 / 複数層にまたがる / 既に 2 セッション以上空回りした bug
   >    - **大規模 refactor の設計判断**: migration / framework 移行など blast radius が大きい変更
   > ※ skill 自動化 (層2) と通知 (層3) で「上げ忘れ」 と「上げっぱなしコスト」 の両方を防ぐ。 詳細 memory: [[feedback_cost_efficient_operation]]

   > **model 自動化 — Opus 4.8 escalation (2026-07-01 user 決定)** — 「main は安い Sonnet 5、 内部処理 (sub-agent) だけ必要時 Opus に上げる」。 上の effort 自動化とは**別軸**で併存 (effort = 思考深度 / model = 使うモデル):
   > 1. **日常デフォルト = Sonnet 5** (main + 大半 sub-agent、 手動変更不要)
   > 2. **user 明示の sub-agent review = 自動 Opus 4.8** — user が「サブエージェントレビュー」「マルチレビュー」を能動起動した時、 `multi-review` の reviewer を Opus 4.8 中心に引き上げる (重量級 review の能動選択 = Opus cost を許容した合図)。 sub-agent は「内部処理」ゆえ Claude が `model: "opus"` を決定論的に指定でき **完全自動**。 model 配分は本節が SSOT (`multi-review/SKILL.md:98` が参照)。
   > 3. **research fan-out = verify/synthesis 段のみ Opus 4.8** — `/deep-research` や Claude 起動の調査 agent で、 探索・fetch 段は Sonnet 5、 **adversarial verify + synthesis 段は Opus 4.8** を指定 (質が効く段だけ課金)。
   > 4. **ultrathink / main 主判断 = model は自動で上がらない (通知制)** — ultrathink は effort であり escalation 対象の sub-agent を持たない (Sonnet 5 @ max で走る)。 Opus 天井が要る難所は Claude が着手前に「Opus 4.8 推奨、 `/model opus` で (作業後 `/model sonnet` で戻す)」 と proactive 通知 → user 手動切替。
   > ※ 2 系統を混同しない: **内部処理 (sub-agent)** = Claude が model 指定でき自動化可 / **main loop 自身 (ultrathink 含む)** = `/model` = user 手動切替のみ。

2. **sub-agent default**: **Sonnet 5 (`claude-sonnet-5`)** — Agent tool 呼出時 `model: "sonnet"` 指定で解決 (旧 4.6/4.7 から昇格。 標準同価格で品質向上、 導入価格中は割安)。 single-shot review / file ops / grep 主体は Sonnet 5 で十分
3. **例外で Opus 4.8 sub-agent** (`model: "opus"` 指定):
   - `planner` subagent (SPEC 起票、 multi-step 推論主体。 `.claude/agents/planner.md` frontmatter `model: opus` 済)
   - user 明示起動の `multi-review` reviewer (上記「model 自動化」層2)
   - research の verify / synthesis 段 (層3)
4. **review の model 配分**: user 明示起動の重量級 review = Opus 4.8 中心 (層2)。 自動 loop 内部の軽量 review (PGE `evaluator` L4 が内部呼ぶ 3 体等) は cost 優先で Sonnet 5 可。 6 体 vs 3 体の起動判断は別途「multi-review 6 体 vs 3 体」節参照
5. **handover lazy read**: session 開始時に handover full-read 禁止、 `fetch-handover` skill (圧縮 30 行 summary) のみ。 full-read は user 明示要請時のみ
6. **memory lazy load**: MEMORY.md index 行だけ読み、 anchor 本体は必要時のみ Read (現状 proactive full-read を避ける)
7. **billing alert**: Anthropic console で日次 $5 / 月 $50 / 月 $200 email alert 3 段設定済 (v94 セッションで user 設定済、 spike 24h 内検知)

詳細: handover_2026-05-22_v94.md / Phase 2.10 cost reduction sub-agent verdict 参照

## メモリ衛生 (定期棚卸し、 v173 確立)

永続メモリ (`~/.claude/projects/.../memory/`) は放置で陳腐化・重複・index↔ファイル乖離 (orphan/dangling) が溜まり、 想起ノイズで出力品質を鈍らせる。 2 段で機械化:

1. **軽量チェック (毎セッション・全自動)**: SessionStart hook [`memory_health_check.sh`](.claude/hooks/memory_health_check.sh) が MEMORY.md size / orphan / dangling / 進捗語 / 前回深掘りからの日数を冒頭表示。 ⚠️ が出たら段 2 を起動。
2. **深掘り監査 (月次 or hook が flag 時)**: read-only サブエージェント (Sonnet) で重複/陳腐化/矛盾を棚卸し → **非破壊修正 (UPDATE/再index/MERGE) は即適用、 削除は必ず user 承認**。 完了後 `.last_deep_audit` を当日更新。

- index は「1 行ポインタ (<200 字)」、 詳細は topic ファイル (index に内容を詰めない)。
- **昇格 = 移動 (複製でない)**: memory の内容を CLAUDE.md / docs/references に昇格させたら **元 memory を即削除**し index 行も消す (「→ CLAUDE.md §X 参照」 スタブも残さない)。 二重管理が最大の想起ノイズ源 (2026-06-24 棚卸しで 4 件が CLAUDE.md と一字一句重複と判明)。 削除前に被参照を `grep -rl 'slug' memory/` で確認し、 `[[slug]]` リンクは「CLAUDE.md §節名」 テキストへ張り替えて dangling を作らない。
- **新規 memory は「既存 canon への追記」 を第一選択**: 1 トピック 1 ファイルで増やさない (feedback_ が 93 件まで膨張した主因 = 過分割)。 新規ファイルは独立した大トピックのみ。 作成前に必ず自問:「これは CLAUDE.md (恒久ルール) / docs (設計値) / git log (実装記録) に属さないか？」 — memory はそのどれにも入らない揮発性運用知だけ。
- 「メモリ棚卸し」 で段 2 起動。 rubric + 適用ポリシー + 削除 gating の SSOT: [`docs/references/memory_maintenance.md`](docs/references/memory_maintenance.md)。

## デザインルール
- **トークン (色 / spacing / radius / elevation / motion)**: [`docs/references/design_system.md`](docs/references/design_system.md) が Single Source of Truth
- **適用パターン (card layering / glow host / shadcn 統合 / staleness UI / 数値表示)**: [`docs/references/design_recipes.md`](docs/references/design_recipes.md)
- **機械的 enforcement (raw hex / shadow / !important whitelist)**: [`docs/references/elevation_scale.md`](docs/references/elevation_scale.md)
- **検査 skill**: 「デザインチェック」で `design-system-check` 起動
- 旧 `design_guide.md` は historical reference、新規参照は `design_system.md` を優先

## APIエンドポイント
docs/references/api_endpoints.md を参照

## スキル一覧
各機能の実装手順は .claude/skills/ 配下の対応SKILL.mdを参照

### skill 自動呼出ルール (proactive routing)

ユーザーが skill 名を明示しなくても、 以下の file path / context を編集する前に **対応 skill を必ず呼ぶ**。 description トリガーだけに頼ると 60-70% で漏れるため、 file path ベースで明文化する。

| 編集対象 / 起動 context | 呼出すべき skill | 理由 |
|---|---|---|
| `frontend/src/components/LandingPage.jsx` / `SampleAnalysisSection*` / `ProTeaser*` / Pro tier 課金 UI / LP の訴求文言 | `funnel-cro` | Trust Cliff 防止 7 項目 checklist 必須 |
| `backend/app/visualizer/` / `backend/app/aggregator/` / `backend/app/agents/` / 新規 Claude API call 追加 | `hallucination-guard` | 4 重防御 + BAD 1-6 + citation 必須 |
| Claude API call の `system` 配列 / few-shot examples / `cache_control` 編集 | `prompt-cache-optimizer` | cache hit 80%+ 維持で月 cost $10 死守 |
| `/planner <要望>` 起動前 / `/generator` 起動前 / `frontend/scripts/snap-*.mjs` 編集 | `pge-loop-debugger` | v86 落とし穴 4 件 (sprint 累積なし / selector hallucination / ESM return / infinite animation) |
| 本番デプロイ前 (`railway up`) | `release-check` (内部で上記を順次呼ぶ) | CLAUDE.md 違反 + Trust Cliff + 4 重防御の最終 gate |

Claude は **編集対象 file を decide した時点**で proactive に「この変更は <skill 名> 観点で確認します」 と宣言してから skill を呼ぶこと。 ユーザーが明示的に skill を指定した場合は、 該当 skill のみで進めて他は省略してよい。

### multi-review 6 体 vs 3 体の判断基準 (Phase gate 時、 handover v82 で確立)

`multi-review` skill 起動時の reviewer 数判定。 Phase 4 で Anthropic verdict 「3 体で十分」 と Phase 5 で「6 体 valuable」 が両立した経緯から方法論として明文化 (v82 で 3 セット 18 体起動、 累計 67 体)。

**6 体合議起動** (Phase gate / 重要設計判断 / リリース前):
- 以下 **3 軸のうち 2+ が active** なら 6 体推奨
  1. **LLM 出力品質**: 景表法 / 金商法 / hallucination risk が関わる
  2. **Trust Cliff**: LP 訴求 vs 実装の整合、 brand 訴求文言の正当化
  3. **新 backend endpoint + RLS / 認証境界 + cache 設計**: blast radius が大きい
- Phase 6 (マーケ launch) は 3 軸全 active のため **必ず 6 体**
- v82 例: Phase 4 (few-shot + NEGATIVE) / Phase 5 (Pane 3 4 機能 + RLS) = 6 体起動

**3 体合議で十分** (Anthropic verdict、 cost 30-50% 圧縮):
- LLM prompt 不変 + 既存 schema 維持 + frontend 局所修正のみ
- 設計判断が limited (Explore で scope 縮小済)
- 推奨 reviewer 構成: **ui-designer + frontend-architect + qa-dogfooder** (or 金融 + 開発 + UI/UX) の 3 体
- v82 例: Phase 5.5 (5 条件 × 図解動的連携、 frontend 局所のみ) = 3 体で十分だった (実際は 6 体で実施したが verdict 後判明、 次回は 3 体)

判断時は `multi-review` skill 呼出前に上記 3 軸を 1 行で記載 → reviewer 数を選択。

詳細 memory: [project_pane3_visual_explainer_redesign.md](memory/project_pane3_visual_explainer_redesign.md) (v82 multi-review 3 セット記録)

## 引き継ぎ書（短命・最新版のみ参照）
- `handover_YYYY-MM-DD_v*.md` がプロジェクトルートにある場合、そのセッションの直近の経緯が書かれている
- 賞味期限は 1〜2 セッション。古くなったら削除して構わない
- 永続ルールは本ファイル（CLAUDE.md）に移すこと

### セッション終了時は「次セッション用プロンプト」を必ず提示する（2026-06-27 user 要望）
- **トリガー**: user が終了を示唆した時（「お疲れ様」「また」「今日はここまで」「handover 更新して」等）、または handover を更新した時。
- **やること①（チャット提示）**: 次セッションにそのまま貼り付けられる **copy-paste 可能なプロンプト** を応答末尾に提示する。最低限含める要素:
  1. `/fetch-handover` 起動指示 + **最新 handover ファイル名**（その時点のもの）
  2. 残タスクの**推奨着手順**（gated かどうか明記）
  3. **厳守事項**（件数 SSOT 承認 gate / 検証規律 = build+test+snap / deploy は PR 経由 / danger zone）
  4. **在席記入欄**（在席で gate 都度確認 ／ 不在で default 自律 のどちらかを user が書く欄）
- **やること②（handover ファイルを書いて push）— チャット提示だけで終わらせない**: `handover_*.md` ファイルを **非 main ブランチ**で必ず Write する。手順: ① 成果物（SPEC / code）を**先に**特定ファイルのみ stage して commit（`git add -A` 禁止）→ ② handover を Write すると auto-push hook（`.claude/hooks/post_write_handover_autopush.sh`）が handover を commit + branch push する → ③ `git ls-remote --heads origin <branch>` が local HEAD と一致することを **ground truth で裏取り**（hook 発火を信用しない）。main/master では hook は push しない（誤 deploy 防止）ため、出先再開用 handover は必ず **branch** で書く。
- **なぜ**: handover（揮発・人間可読の経緯）と対で、次セッションの context warm-up を「貼るだけ」の 1 アクションにする。**かつ** user は自宅 PC ↔ 出先 PC（browser Claude Code・**push 済のみ参照可**・`.env` 無し）を行き来するため、handover + 成果物が remote branch に push されていないと出先から再開できない（チャットのプロンプトは別 PC に transfer されない）。2026-07-01 にチャット提示だけで締めて push 漏れが再発 → 本ルールに②を追記。詳細 memory: `feedback_handover_file_push.md`。
- ⚠️ これは LLM が会話文脈から毎回**生成**する成果物のため、shell hook（settings.json）では実現不可（hook は決定論的シェルのみ）。本ルール（CLAUDE.md は毎セッション常時ロード）が「毎回」を担保する正規機構。

## 既知の制限・将来の改善候補

### Next.js + Vercel 移行 (将来計画)
- **判断**: Vite + Railway で当面継続。移行トリガーは「記事タブ (`§11-D-1` AI 記事配信) の実装着手 3-4 週間前」
- **理由**: 移行の主要ベネフィット (SSG/ISR / `next/og` / Vercel Analytics) は記事タブ launch の前提技術。記事自体がまだ無い段階で前倒しすると 5-8 日のロス
- **移行コストが膨らまない設計済**: design_system.md / design_recipes.md / elevation_scale.md は framework 非依存。判定タブも React + Tailwind + token CSS のみで Vite 固有 API 不使用なので 1-2 日でポート可能
- **backend (FastAPI on Railway)** はそのまま維持。frontend だけ Vercel に移す前提

### 株価チャートの決算マーカー（Beat/Miss 判定）
- ✅ 現状（2026-06-06 更新）：**FMP Ultimate 契約済**（SSOT: `memory/fmp_plan_naming.md`）。per-ticker `/stable/earnings` でアナリスト予想 (EPS estimate) を取得でき、plan 起因の制約は解消済。
- ⚠️ 旧記述は **stale**：「FMP 無料プランで `/earnings-surprises` 非対応 → verdict unknown / $14/月 にアップグレードで動作」は、既に Ultimate 契約済のため不要・無効。
- 不変の制約：yfinance の `earnings_dates` は Railway クラウド IP からブロックされるため、FMP を主データ源とする。
- もしチャートマーカーがなお "unknown" を出す場合は、plan でなく chart 側のデータ配線（estimate の引き渡し）を確認する（plan 起因ではない）。
