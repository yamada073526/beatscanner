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
4. **1 クリックを減らせ** — 不要なステップを削ぎ落とす
5. **図解で認知コストを下げろ** — 長文テキストより視覚表現

実装判断時は「この変更はどの原則に貢献するか」を明示して進めること。
複数原則と衝突する場合は上位（読み手の負担が少ない方）を優先。
ブランド世界観 (上記) と 5 原則は互いに補完: 世界観 = 質的目標、5 原則 = 機能的指針。

## 必ず守るルール（永続）

### デプロイ運用
- **デプロイは `railway up` のみ**。preview server / `npm run dev` は使用しない
- ローカルでの構文チェックは `cd frontend && npm run build` で実施
- デプロイ後の検証は本番バンドル（`/assets/index-*.js` または `*.css`）を `curl` で取得して `grep` で文字列確認
- 反映完了の判定はバンドルハッシュの変更で行う

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

### 内部値の混在
- タブの内部 key は `'home' / 'judgment' / 'report' / 'チャート'`（最後だけ日本語）。文字化け回避のため変えない

### Vite + Railway のビルド連携
- `VITE_*` 環境変数は **ビルド時** に静的展開される
- Railway の Service Variables を build stage に届けるため、`Dockerfile` の Stage 1 に `ARG VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY` + `ENV` 橋渡しが必要（既に対応済み）
- 新しい `VITE_*` 変数を追加するときは Dockerfile の更新も忘れない

### コミット運用
- ユーザーから明示的に依頼されない限り `git commit` しない
- 本番（Railway）はローカルファイル直送デプロイなので、git 履歴と本番の乖離が発生しうる。定期的にコミット推奨

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

## 判定ロジック
docs/references/jijima_protocol.md を参照

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

## 引き継ぎ書（短命・最新版のみ参照）
- `handover_YYYY-MM-DD_v*.md` がプロジェクトルートにある場合、そのセッションの直近の経緯が書かれている
- 賞味期限は 1〜2 セッション。古くなったら削除して構わない
- 永続ルールは本ファイル（CLAUDE.md）に移すこと

## 既知の制限・将来の改善候補

### Next.js + Vercel 移行 (将来計画)
- **判断**: Vite + Railway で当面継続。移行トリガーは「記事タブ (`§11-D-1` AI 記事配信) の実装着手 3-4 週間前」
- **理由**: 移行の主要ベネフィット (SSG/ISR / `next/og` / Vercel Analytics) は記事タブ launch の前提技術。記事自体がまだ無い段階で前倒しすると 5-8 日のロス
- **移行コストが膨らまない設計済**: design_system.md / design_recipes.md / elevation_scale.md は framework 非依存。判定タブも React + Tailwind + token CSS のみで Vite 固有 API 不使用なので 1-2 日でポート可能
- **backend (FastAPI on Railway)** はそのまま維持。frontend だけ Vercel に移す前提

### 株価チャートの決算マーカー（Beat/Miss 判定）
- 現状：EPS 実績値は表示されるが、アナリスト予想が取得できないため verdict = "unknown"（グレー）
- 原因：
  - FMP 無料プランは `/earnings-surprises` エンドポイント非対応（429 Limit Reach）
  - yfinance の `earnings_dates` は Railway クラウド IP からブロックされる
  - `quarterly_income_stmt` は EPS 実績のみ（アナリスト予想なし）で fallback として使用中
- 改善方法：FMP 有料プラン（$14/月〜）にアップグレードすれば Beat/Miss 判定が完全に動作する
