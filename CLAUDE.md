# beatscanner

じっちゃまプロトコル（広瀬隆雄氏）に基づく米国株決算分析Webアプリ。
本番URL: https://beatscanner-production.up.railway.app/

## 必ず守るルール（永続）

### デプロイ運用
- **デプロイは `railway up` のみ**。preview server / `npm run dev` は使用しない
- ローカルでの構文チェックは `cd frontend && npm run build` で実施
- デプロイ後の検証は本番バンドル（`/assets/index-*.js` または `*.css`）を `curl` で取得して `grep` で文字列確認
- 反映完了の判定はバンドルハッシュの変更で行う

### 表示テキストのポリシー
- **UI に表示されるテキストには「じっちゃま」を出さない**（クラス課題提出物のため個人名を避ける）
- 内部資料（コード comment、CSS、本ファイル、`docs/` 配下、コミットメッセージ）には「じっちゃま」表記を残してよい
- 代替表記の例: 「ファンダメンタル5条件」「独自プロトコル」

### 触ると危険な箇所
- **sticky 検索バー**（`.sticky-search-band` / App.jsx の sticky 検索 div）は 8 回の試行錯誤の末に Apple 方式（72%透過 + `saturate(180%) blur(20px)` + 1px border-bottom）で安定済み。原則として触らない
- backdrop-filter のフェード境界を CSS で消そうとしてはいけない（必ず切断ラインが出る）。Apple/Linear 方式は **1px border で意図的に区切る** 設計

### 内部値の混在
- タブの内部 key は `'home' / 'judgment' / 'report' / 'チャート'`（最後だけ日本語）。文字化け回避のため変えない

### Vite + Railway のビルド連携
- `VITE_*` 環境変数は **ビルド時** に静的展開される
- Railway の Service Variables を build stage に届けるため、`Dockerfile` の Stage 1 に `ARG VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY` + `ENV` 橋渡しが必要（既に対応済み）
- 新しい `VITE_*` 変数を追加するときは Dockerfile の更新も忘れない

### コミット運用
- ユーザーから明示的に依頼されない限り `git commit` しない
- `.claude/settings.local.json` は `.gitignore` 済みだが過去 tracked のため `M` 表示が残る → ステージしない
- 本番（Railway）はローカルファイル直送デプロイなので、git 履歴と本番の乖離が発生しうる。定期的にコミット推奨

### Trust Cliff（信頼の崖）は最重要バグカテゴリ
- 「登録不要」と書きながら登録要求モーダルを出す → CVR 30-40% 落ちる可能性
- 「3銘柄/日まで無料」と書きながら固定ホワイトリスト → 即離脱
- LP の訴求文言と実装が**完全に一致**しているか、UI テキストを変更するたびに確認すること
- LP → 銘柄クリックの経路は必ず `handleLPTickerClick`（demo モード対応）を通す。`runAnalyze` を直接呼ばない

### 投資業界の色ルール（厳守）
- 上昇・ポジティブ = **緑 (`#34ef81`)**
- 下落・ネガティブ = **赤 (`#f87171`)**
- 中立 = シアン or グレー
- 緊急・警告（決算が X 日後 等）= **amber (`#f59e0b`)**
- シアンは「ブランド色」として使うが「上昇」を意味しない

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
docs/references/design_guide.md を参照

## APIエンドポイント
docs/references/api_endpoints.md を参照

## スキル一覧
各機能の実装手順は .claude/skills/ 配下の対応SKILL.mdを参照

## 引き継ぎ書（短命・最新版のみ参照）
- `handover_YYYY-MM-DD_v*.md` がプロジェクトルートにある場合、そのセッションの直近の経緯が書かれている
- 賞味期限は 1〜2 セッション。古くなったら削除して構わない
- 永続ルールは本ファイル（CLAUDE.md）に移すこと

## 既知の制限・将来の改善候補

### 株価チャートの決算マーカー（Beat/Miss 判定）
- 現状：EPS 実績値は表示されるが、アナリスト予想が取得できないため verdict = "unknown"（グレー）
- 原因：
  - FMP 無料プランは `/earnings-surprises` エンドポイント非対応（429 Limit Reach）
  - yfinance の `earnings_dates` は Railway クラウド IP からブロックされる
  - `quarterly_income_stmt` は EPS 実績のみ（アナリスト予想なし）で fallback として使用中
- 改善方法：FMP 有料プラン（$14/月〜）にアップグレードすれば Beat/Miss 判定が完全に動作する
