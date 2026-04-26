# beatscanner 引き継ぎ書 v8

作成日: 2026-04-25  
担当: Claude Sonnet 4.6  

---

## プロジェクト概要

じっちゃまプロトコル（広瀬隆雄氏の5条件）に基づく米国株決算分析 Web アプリ。  
FastAPI (Railway) + React/Vite + Anthropic Claude Haiku で構成。

---

## 今セッションで行った変更一覧

### タスク1: チャート高さ 260px → 320px
- **ファイル**: `frontend/src/components/ChartTab.jsx`
- 4箇所修正: `h-[320px]`（ErrorBoundary）、`height: 320`（createChart）、`height: "320px"` ×2（div）

---

### タスク2: ダークモードをページ全体に拡張
- **`frontend/src/index.css`**: CSS変数定義 + `[data-theme="dark"]` Tailwind上書きブロック追加
  - `:root` に `--bg-primary`/`--bg-card`/`--text-primary`/`--border` 等を定義
  - `[data-theme="dark"]` で `bg-white`, `bg-slate-50`, `text-slate-900` 等を上書き
- **`frontend/src/App.jsx`**:
  - `darkMode` state を App トップレベルに移動（localStorage キー: `chart_dark_mode`）
  - `useEffect` で `document.documentElement.setAttribute('data-theme', ...)` を設定
  - ヘッダー右端に `🌙 ダーク / ☀️ ライト` トグルボタン追加
  - `<ChartTab darkMode={darkMode} />` に props 渡し
- **`frontend/src/components/ChartTab.jsx`**:
  - 内部 `darkMode` state・`toggleDark`・浮動トグルボタン を削除
  - `darkMode` を props として受け取るよう変更

---

### タスク3: 決算直前銘柄を3段階で強調表示
- **`frontend/src/components/ChartTab.jsx`** — `TickerRow` コンポーネント内
- `next_earnings` から `daysToEarnings` を計算し `urgency` 判定:
  - `critical`（≤3日）: 赤ボーダー + 🔴バッジ
  - `urgent`（≤7日）: オレンジボーダー + 🟠バッジ
  - `approaching`（≤14日）: アンバーボーダー + 🟡バッジ
- 決算日テキスト色・次回決算欄の幅（w-14 → w-20）も urgency に合わせて変化

---

### タスク4: 指数セクション右端グラデーションフェード
- **`frontend/src/components/MarketWidget.jsx`**
- 既存の `md:hidden` （モバイル限定）フェード div から `md:hidden` クラスを削除
- デスクトップでも常時表示されるように変更

---

### タスク5: ニュース英語記事を日本語翻訳して表示
- **`backend/app/main.py`**: `POST /api/translate` エンドポイント追加
  - `texts: list[str]` を受け取り Claude Haiku で一括翻訳
  - `_translate_cache: dict[str, str]` でサーバーメモリキャッシュ（プロセスまたぎ不可）
- **`frontend/src/api.js`**: `translateTexts(texts)` 関数追加
- **`frontend/src/components/NewsPanel.jsx`**: 全面更新
  - `translated` / `translating` state 追加
  - ヘッダー右端に「🌐 日本語訳」ボタン（翻訳後は「🌐 英語に戻す」）
  - 翻訳済み時は原文タイトルをサブテキスト（11px / slate-400）で表示

---

### タスク6: AI要約プロンプトに Few-shot 例を追加
- **`backend/app/main.py`**
  - `_SUMMARY_FEW_SHOT` 定数を定義（`/api/summary/brief` 直前）
  - PASS/Beat 例と FAIL/Miss 例の2パターン
  - `summary_brief()` と `summary_brief_stream()` 両方のプロンプトに `{_SUMMARY_FEW_SHOT}` を挿入（`【決算データ】` の直前）

---

### タスク7: AI要約を temperature: 0 に固定
- **`backend/app/claude_client.py`**
  - `complete()` と `stream_complete()` 両メソッドに `temperature: float = 0.0` 引数追加
  - `messages.create()` / `messages.stream()` 呼び出しに `temperature=temperature` を渡す

---

### タスク8: スキルファイルを追加
新規作成（`.claude/skills/` 配下）:
- `dark-mode/SKILL.md` — CSS変数・Tailwind上書きアーキテクチャ
- `news-translation/SKILL.md` — 翻訳フロー・キャッシュ・エラー処理
- `chart-tab/SKILL.md` — ローソク足チャートタブ・urgencyロジック
- `earnings-urgency/SKILL.md` — 決算直前ハイライトのロジック・スタイルマッピング

既存スキル（変更なし）:
`stock-chart`, `summary-text`, `conference-analysis`, `earnings-calendar`, `screener`, `visualizer`

---

## アーキテクチャ現状（v8時点）

### フロントエンド
```
App.jsx
  ├── darkMode state (top-level, localStorage: chart_dark_mode)
  ├── useEffect → document.documentElement.setAttribute('data-theme', ...)
  ├── Header: ページタイトル + 🌙/☀️ トグルボタン
  ├── MarketWidget (市場指数 + 右端グラデーション)
  ├── TickerSearch → runAnalyze()
  ├── SummaryBrief (AI要約 ストリーミング, temperature=0)
  ├── Tabs: 判定詳細 / 決算レポート / チャート
  │    └── ChartTab (darkMode prop 受取)
  │         └── TickerRow (urgencyハイライト)
  │              └── CandleChart (lightweight-charts v4/v5)
  ├── NewsPanel (🌐翻訳ボタン付き)
  └── Watchlist
```

### バックエンド主要エンドポイント
| エンドポイント | 用途 |
|---|---|
| `GET /api/analyze/{ticker}` | 5条件判定（メイン）|
| `GET /api/guidance/{ticker}/basic` | ガイダンス基本情報（高速）|
| `GET /api/guidance/{ticker}` | ガイダンス詳細（SEC）|
| `GET /api/price/{ticker}` | 株価履歴 + 決算マーカー |
| `GET /api/chart/{ticker}/summary` | チャートタブ用サマリー |
| `GET /api/chart/{ticker}/candles` | ローソク足データ |
| `GET /api/news/{ticker}` | 最新ニュース |
| `POST /api/translate` | ニュース翻訳（Claude Haiku）|
| `POST /api/summary/brief` | AI要約（非ストリーム）|
| `POST /api/summary/brief/stream` | AI要約（SSEストリーム）|
| `POST /api/summary/detail` | 詳細レポート |

---

## 既知の制限・注意事項

### Beat/Miss 判定
- FMP 無料プランは `earnings-surprises` 非対応 → `verdict: "unknown"` が多い
- yfinance は Railway クラウド IP からブロックされる場合あり
- 改善: FMP 有料プラン（$14/月〜）

### ダークモード
- `lightweight-charts` は CSS変数が効かないためハードコード切り替え
- Tailwind の動的クラス（`bg-blue-600` など）は `index.css` に上書きルール追加が必要

### 翻訳キャッシュ
- `_translate_cache` はサーバーメモリ（プロセス再起動でクリア）
- Railway の再デプロイでキャッシュはリセットされる

### yfinance / chart summary
- `stock.calendar["Earnings Date"]` は Railway で断続的に失敗する場合あり
- 失敗時は `next_earnings: null` となり urgency ハイライトが表示されない

---

## 開発フロー

```bash
# ローカル起動
bash start.sh

# Railway デプロイ
railway up --detach

# 環境変数（Railway ダッシュボードで設定済み）
ANTHROPIC_API_KEY=...
FMP_API_KEY=...
```

---

## 次セッションへの申し送り

- ダークモード: 一部コンポーネント（ConditionCard, GuidanceCard など）の細かい色調整が残っている可能性あり
- 翻訳: サマリー（summary）テキストの翻訳は未対応（タイトルのみ）
- Beat/Miss 判定の完全化: FMP 有料プランへのアップグレードで解決
- ニュース翻訳キャッシュの永続化: Redis 等への移行でコスト削減可能
