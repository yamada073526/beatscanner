# beatscanner リリース前 To-Do（永続）

このファイルはリリース直前にまとめて実施する重要タスクの台帳。  
短命の `handover_*.md` とは別管理で、リリースまで継続参照する。

---

## 1. FMP 有料プラン契約

**実施タイミング**: リリース 1-3 日前（全体動作の最終確認直前）  
**コスト**: $14/月〜（年契約割引あり）  
**契約 URL**: https://site.financialmodelingprep.com/developer/docs/pricing

**契約の効果**（コード変更ほぼゼロ）:
- 経済カレンダー: `_source: 'estimated'` → `'fmp'` 自動切替、予想/前回/実績が実数値化、サプライズ%計算可能
- マクロニュース: `/general-news` 復活で WSJ / Reuters / Bloomberg 直接取得（JPM target / Iran 攻撃のような速報を取りこぼさない）
- 指標バー: `/quote` レート制限緩和で Tier 2 拡張（30+ 指標化）安定
- decisive_metrics / earnings 系の精度向上

**契約後の検証手順**:
```bash
# 経済カレンダー実データ化を確認
curl -s "https://beatscanner-production.up.railway.app/api/economic-calendar?days=7&impact=high" | python3 -m json.tool | head -30
# _source が "fmp" になり、actual/estimate/previous が埋まっていることを確認

# マクロニュース /general-news 復活確認
curl -s "https://beatscanner-production.up.railway.app/api/macro-news" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('_meta'))"
# sources に "fmp" が含まれることを確認
```

---

## 2. BYOK UI 完全削除（FMP 契約とセット）

**実施タイミング**: FMP 有料契約の**直後**（順序重要：契約前に削除すると free 枠制約でフル機能提供できない）

**理由**:
- ユーザー目線で「英語サイトで API キー取得」は CVR を著しく下げる（Trust Cliff の最大要因）
- 業界標準は SaaS が一括負担（Bloomberg / TradingView / Yahoo Finance）
- $14/月 の負担で離脱率改善する方が遥かに ROI 高い

**削除対象**:

### フロントエンド
- `frontend/src/components/ApiKeyModal.jsx` — 全削除
- `frontend/src/components/ApiKeySettings.jsx` — 全削除
- `frontend/src/components/ApiKeyBanner.jsx` — 全削除
- `frontend/src/lib/planGating.js` — APIキー有無で機能ゲート → サブスクリプションのみで判定に変更
- `frontend/src/App.jsx`:
  - `hasKey` / `setHasKey` / `showSettings` / `showApiKeyModal` 関連 state
  - `loadFmpKey` / `saveFmpKey` / `clearFmpKey` 呼び出し
  - `handleKeySaved` / `handleKeyDeleted`
  - `runAnalyze` 内 `if (!hasFmpKey()) { setShowApiKeyModal(true); return; }` ガード削除
  - ハンバーガーメニューの「FMP APIキー設定済み」項目削除
- `frontend/src/lib/fmpKey.js`（あれば）— 全削除

### バックエンド
- `backend/app/main.py:631` `_get_fmp_key()` — ヘッダ参照を削除し env var のみに統一
- 全 endpoint の `_get_fmp_key(request) or os.getenv("FMP_API_KEY", "")` を `os.getenv("FMP_API_KEY", "")` にシンプル化（grep で約 6-8 箇所）

### Supabase
- `user_fmp_keys` テーブル（あれば）削除を検討。既存ユーザーのキーは無効化されるが影響なし

### DEMO モードの扱い（要判断）
- 現状: 未ログインユーザーは AAPL/MSFT/NVDA + 3 req/IP/day
- BYOK 廃止後: 未ログイン = 開発者キーで全機能 vs DEMO 維持で会員登録誘導
- **推奨**: DEMO は維持（コスト管理 + 会員登録動機付け）。ただし「3銘柄/日まで無料」表現と整合させる

**削除後検証**:
- ログイン直後に銘柄入れて分析できることを確認
- ハンバーガーメニューに鍵アイコン項目がないことを確認
- バンドルサイズが減少していることを確認（lazy chunks）

---

## 3. 宣伝戦略設計

**実施タイミング**: リリース直前 〜 直後  
**スコープ**: 別セッションで本格設計。本書は方向性メモのみ。

**想定チャネル**（ROI 順）:

### A. X (旧 Twitter) — 最優先
- 米国株決算速報系アカウントへのリプライで beatscanner リンク提示
- 「じっちゃまプロトコル」関連ツイートに有用な分析結果スクショで返信
- 自前アカウントで決算シーズンの注目銘柄を毎日 1-2 件投稿（テンプレ化）
- ハッシュタグ: `#米国株` `#決算` `#ファンダメンタル分析`

### B. note / Zenn — SEO 流入
- 「ファンダメンタル5条件」「米国株決算プロトコル」解説記事 + アプリ紹介
- 個別銘柄の分析事例記事（実例付きでアプリの実力を示す）
- 月 2-3 本ペースで蓄積 → SEO 効果は 3-6 ヶ月後

### C. YouTube 米国株チャンネルへの DM 営業
- フォロワー 1-10 万の中堅チャンネル狙い（大手は競合扱いされる）
- アプリで分析した結果を動画ネタとして提供（コメント欄リンク許可型）

### D. その他検討
- Reddit `r/stocks` `r/investing` 英語圏展開（日本株対応がないため要検討）
- PR TIMES 等プレスリリース（ROI 不明、コストかかる）
- インフルエンサー一括 DM（スパム認定リスク高、避ける）

**KPI**:
- 月間 100-500 ユーザー（最初の 1-3 ヶ月）
- CVR 1-3% を厳しめ前提（X からの流入で 1-2%、SEO で 3-5% 想定）
- 月額 ¥980 の Pro 換算 → 100 ユーザー × CVR 2% × ¥980 = ¥1,960/月（黒字化までは数ヶ月かかる前提）

**次セッションで決めること**:
- 自前 X アカウント運用方針（実名 / 匿名 / 投稿頻度）
- note 記事のフォーマットとテンプレート
- ローンチ初日の同時告知チャネルセット

---

## 4. Claude Code 活用度向上ロードマップ

2026-05-05 Anthropic エンジニア視点レビュー結果（claude-code-guide subagent）に基づく改善計画。  
本プロジェクトの Claude Code 活用度評価は **5 観点平均 ⭐⭐⭐ (5 段階)** で、特に **`.claude/agents/` 未活用** と **`.claude/commands/` 未活用** が最大の機会損失と指摘された。

### 4-A. 即実装すべき改善 5 件（リリース直後 1 週目）

| # | 改善項目 | 工数 | 効果 |
|---|---|---|---|
| 1 | **`.claude/commands/` スラッシュコマンド 5 個** — `/deploy`(railway up + 本番ハッシュ検証) / `/health` (endpoints + DB チェック) / `/release-check` (バンドル + ログ検証) / `/morning` (経済指標 + 注目銘柄) / `/fetch-handover` (最新 handover 取得) | 2h | 反復タスク 5-10 分短縮、開発速度 +30% |
| 2 | **PreEdit hook + 5 原則 / Trust Cliff 自動チェック** — 「じっちゃま」検出 / UI text ∩ LP copy 不一致検知 / 5 原則貢献度自動プロンプト | 1.5h | Trust Cliff バグ 0 化、離脱率改善 +5-10% |
| 3 | **Backend skill 2 個** — `conference-stream-analysis` / `fmp-api-retry` （現状 backend は skill 化 0） | 1.5h | backend bug 対応 -50% |
| 4 | **EarningsAlertAgent (subagent)** — `scheduled-tasks` MCP で FMP ポーリング → 決算リリース自動検出 → `/api/analyze` + 図解 → Slack/Discord 投稿 | 2.5h | DAU +15% 見込み |
| 5 | **GitHub Actions cron** — `/health` + `npm run build` 毎朝実施、結果を `.claude/reports/` に保存し morning context 化 | 1.5h | 障害検出 1 分化、SLA 改善 |

**合計工数**: 9h（リリース直後 1 週目に分散）

### 4-B. 夢ある新機能 5 件（DAU 取れ始めたら 1 ヶ月後〜）

| # | 機能 | 5 原則貢献 | 想定効果 |
|---|---|---|---|
| 1 | **決算リリース直後の自動分析 → Discord/Slack 図解配信** | ②毎日開きたくなる + ④1 クリック減 | リテンション +20% |
| 2 | **朝のインテリジェンスブリーフ（subagent 並列化）** — economic-events / market-movers / watchlist-urgency を 3 subagent 並列実行、結果を 1 スレッドに集約 | ②毎日開きたくなる | 朝開く習慣化 |
| 3 | **デプロイ→本番検証 CI/CD 完全自動化** — railway up → ハッシュ検証 → endpoint sanity check → Slack 報告 | （開発者向け） | 本番バグ 99% 防止 |
| 4 | **決算 48h 前の図解プリフェッチ** — ProductionReadinessAgent が事前に SVG テンプレート生成 → 決算直後 0.5s 表示 | ⑤図解で認知コスト下げる | 即時表示で印象強化 |
| 5 | **`/release-checklist` 開発者用 gate** — CLAUDE.md ルール違反 / Trust Cliff / 5 原則貢献 / 環境変数同期を一括 self-check、pass のみ `/deploy` 可能 | （品質保証） | リリース品質保証 |

### 4-C. Anthropic 2026 ベストプラクティスで未採用の要素

| 要素 | 現状 | 採用後の効果 | 工数 |
|---|---|---|---|
| **PreEdit / PreWrite Hook** | PostEdit のみ | domain linter 機能、編集 前 検証 | 1h |
| **スラッシュコマンド階層化** | 0 個 | permission prompt -70% | 1.5h |
| **Agent SDK 統合 (Python)** | 未利用 | backend テスト自動化 | 2h |
| **MCP Connector (Remote MCP)** | 未利用 | Claude が backend に直接 query | 2.5h |
| **Structured Outputs (JSON Schema)** | 未利用 | `/api/visualize` の streaming UI 化 | 1.5h |
| **Prompt Caching** | 未利用 | じっちゃまプロトコル判定 cache → cost -15-20% / latency -200-500ms | 1h |

### 4-D. 実装優先順位（時系列）

```
リリース前 (今):
  └ タグ機能 X-1 ✅ / Holdings X-2 / バックログ消化

リリース直後 (1-2 週目):
  ├ 4-A の #1, #2, #5 (合計 5h) — 開発フロー安定化
  └ Prompt Caching (1h) — コスト最適化

リリース 1 ヶ月後 (DAU 計測開始):
  ├ 4-A の #3, #4 (合計 4h) — backend / subagent 強化
  └ 4-B の #1, #2 (subagent 駆使) — リテンション主役

リリース 3 ヶ月後 (機能拡張期):
  └ 4-B の #3, #4, #5 + Agent SDK / MCP Connector
```

**トータル工数見積**: 約 25-30h（リリース後 3 ヶ月に分散）

---

## 5. ホームタブ刷新（4 体エージェントレビュー統合・2026-05-06）

金融アナリスト / UI/UX デザイナー / Web 設計エキスパート / Web 開発エキスパートの 4 体並列レビューで合意した方向性を整理。**Holdings X-2 完了後に着手予定**（先に保有数 + 損益で「自分ごと」の見える化を完了させる）。

### 5-A. 現状ホームタブ section と問題点

```
1. 指標 / 為替バー
2. 検索バー (sticky)
3. 今日のマクロ
4. 今週の経済指標
5. ウォッチリスト (タグ pill)
6. 今日の注目銘柄 (Brief)
7. ウォッチリスト (騰落率 + チャート付き)  ← 5 と 7 が分離
8. ハンバーガー > スクリーナー / 決算カレンダー  ← 隠れて使われない
```

### 5-B. 4 エージェント合意点（採用方針）

| # | 施策 | 5 原則 | 工数 |
|---|---|---|---|
| 1 | **ウォッチリスト 2 ブロック単一統合** — チップ内に騰落率 + sparkline 常時表示（行内 1 行設計、Robinhood / TradingView 標準） | ① ② ③ ④ ⑤ 全方位 | 2-3 日 |
| 2 | **スクリーナー / 決算カレンダーをハンバーガーから常設化** — 折りたたみ + 決算サマリーバッジ（次決算 X 日後） | ② ④ | 1-2 日 |
| 3 | **決算カレンダーのシーズン自動展開** — 決算シーズン中（1/4/7/10 月の中旬-下旬 + 前後 2 週）は default open、オフは「ウォッチリスト銘柄の次回決算 3 件」だけ要約表示 | ② ④ | 1 日 |
| 4 | **マクロニュース + 経済指標の統合** — マクロ上部に「水 14:30 CPI / 木 FOMC」1 行ピン、経済指標は折りたたみ default closed（high impact あれば自動展開） | ① ④ | 0.5-1 日 |
| 5 | **section 並び替え機能は MVP では入れない** — A/B 統計でカスタマイズ機能利用率は 5-10%。デフォルト最適化が ROI 高い。代わりに「ピン留め」のみ Holdings X-2 後に追加検討 | ─ | 0 |
| 6 | **uiStore (Zustand) 導入** — 折りたたみ状態 / 並び順を localStorage 永続化、ログイン時 Supabase 同期（マルチデバイス）。+3KB gz | ② | 1 日（同梱で） |

**最低限の推奨セクション順（合意案）**:

```
1. 指標 / 為替バー (44px, 常時)
2. 検索バー sticky (56px, 常時, 触らない)
3. ウォッチリスト統合版 (240-300px, 常時, タグ pill + チップ拡張)
4. 今日の注目銘柄 (220px, 常時, bento 2 列)
5. 決算カレンダー (60→320px, シーズン自動切替)
6. 今日のマクロニュース (180px, 常時, 経済指標 1 行ピン同梱)
7. 今週の経済指標 (60→240px, 折りたたみ default closed)
8. スクリーナー (80→400px, 折りたたみ, 24h cache 結果プレビュー)
```

### 5-C. スクリーナー機能改善（個別タスク）

#### ✅ 即座に対応した分（2026-05-06 コミット `d212998`）
- BYOK 残骸テキスト削除（「FMP無料プラン（250/日）で最大7回実行可能」の文言）

#### 🟡 残り対応分

**(i) 検索対象拡大（Phase 段階的）**
- **Phase A**（FMP 有料契約後即）: S&P 500 主要 15 → S&P 500 全 503 銘柄
- **Phase B**（FMP 有料 + cron 検証後）: Russell 1000（約 1000 銘柄、流動性 100 万株/日 ≥）
- **Phase C**（Phase B 安定運用後）: 全米上場（NYSE+NASDAQ コモンストック ≈ 4500、ETF/ADR/OTC 除く）

> 🚨 **Trust Cliff 警告**: LP/UI に「米国上場全銘柄」と書くなら実装は最低 Phase C まで進める必要。Russell 1000 で確定する場合はコピーを「米国主要 1,000 銘柄を毎晩チェック」に揃える。文言-実装一致が最優先。

**(ii) 検索条件 8 個に拡張（金融アナリスト推奨）**
| # | 条件 | 出典 |
|---|---|---|
| 1 | 期間（日/週/月/半年/年） | ユーザー案 |
| 2 | 騰落率 % | ユーザー案 |
| 3 | 5 条件連続クリア回数 | ユーザー案 |
| 4 | 時価総額レンジ（メガ/大/中/小） | アナリスト追加 |
| 5 | セクター（11 GICS） | アナリスト追加 |
| 6 | 平均出来高（流動性フィルタ） | アナリスト追加 |
| 7 | アナリスト目標株価乖離率 | アナリスト追加 |
| 8 | Forward PER または PSR（1 つ） | アナリスト追加 |

**(iii) 5 条件連続クリア判定の実装戦略**
- 各銘柄の過去 4-8 四半期 × 3 endpoint (`income-statement` + `earnings-surprises` + `earnings-calendar`) fetch → 4500 銘柄 × 8Q = 約 36,000 req
- FMP Starter ($14, 300 req/min) で全銘柄横展開は 2 時間/run
- **Supabase `earnings_streaks` テーブル + Railway cron による nightly 事前計算が必須**
- ユーザー実行時は cache 読み出し（200ms 以下）

### 5-D. 段階的実装計画（Holdings X-2 完了後）

```
Phase 5-1 (3-4 日): ウォッチリスト 1+2 統合 + uiStore 導入 + 折りたたみ localStorage 永続化
Phase 5-2 (4-5 日): スクリーナー/カレンダー常設化 + 決算サマリーバッジ + マクロ+経済指標統合
Phase 5-3 (1 週): スクリーナー S&P 500 拡張 (Phase A) + earnings_streaks cron + 5 条件連続クリア検索
Phase 5-4 (1 週, 任意): Russell 1000 拡張 (Phase B) + ピン留め (dnd-kit, Supabase 同期)
```

トータル: 3-4 週間（Holdings X-2 4-5 日とは別建て）。

### 5-E. 4 エージェントレビューで意見が割れた点

**ピン留め / 並び替え機能の優先度**
- アナリスト + UI/UX: 「v1 では実装しない」（利用率 3-5%、デフォルト最適化のほうが ROI 高い）
- Web 設計 + Web 開発: 「ピン留めだけ入れる」（リテンション +2.3x、Supabase 同期で課金訴求）

**判定**: MVP では非採用。Holdings X-2 + Phase 5-1〜5-3 で UI 完成度を上げ、DAU 取れ始めたら（リリース 1 ヶ月後〜）Phase 5-4 で再検討。

---

## 6. ポートフォリオダッシュボード Phase X-2-5（4 体エージェントレビュー統合・2026-05-06）

Holdings X-2 Phase 3 (チップ損益バッジ) / Phase 4 (表示モード切替) 完了後の発展機能。
4 体並列レビュー: 金融アナリスト / UI/UX デザイナー / Web 開発エキスパート / Web 設計エキスパート。

### 6-A. 4 エージェント全員一致の合意点

| # | 項目 | 合意 |
|---|---|---|
| 1 | **当日変動額・%** をサマリー最上位 KPI に | 4/4。Robinhood / Webull / Fidelity 標準。「銘柄数」「合計取得額」は降格 |
| 2 | **時系列推移グラフは Phase 1 で実装しない** | 4/4。`holdings` テーブルが買付履歴を持たないため正確な過去評価額再構築が**数学的に不可能** → Trust Cliff 直撃 |
| 3 | **追加ライブラリ最小化** | 4/4。円グラフは `conic-gradient` 純 CSS、時系列は既存 `lightweight-charts` 流用 |
| 4 | **ホーム上部 or 専用タブで開示**（Drawer は却下） | 3/4。モバイルで Drawer は届きにくく原則 ④ 違反 |
| 5 | **株式分割自動補正は Phase 1 必須** | 金融アナリスト強指摘。NVDA 10:1 / AAPL 4:1 等で avg_cost が壊れる Trust Cliff |

### 6-B. サマリー KPI 最終 5 つ（金融アナリスト推奨順）

1. **当日変動額 + %**（最大字、緑/赤）— 毎日開く動機の 80%
2. **合計評価額**（USD、サブヒーロー）
3. **含み損益額 + %**（緑/赤）
4. **配当年額予測**（差別化指標、シアン）
5. **直近決算済み / 直近決算予定**（決算アプリらしさ、amber）

「銘柄数」「合計取得額」は本文テーブル合計行に降格。

### 6-C. 銘柄一覧テーブル列（UI/UX + 金融アナリスト合意）

```
[ロゴ + Ticker] [株数] [取得単価] [現在値*] [当日変動%] [評価額] [含み損益+%] [構成比%] [次回決算 D-N] [📰]
```

* モバイル時は現在値カラム省略（評価額 ÷ 株数で導出可、認知コスト削減）

**重要追加列**:
- **次回決算 D-N**（amber バッジ）— Robinhood では出ない、beatscanner 独自の毎日開く動機
- **ニュースドット**（直近 24h 更新あり = 既存 news endpoint 流用、低コスト）

**モバイル表示**: カード型 4 要素（ticker / 株数@取得 / 評価額 / 損益%+構成比%）+ ソートはプルダウン 1 個（Schwab 方式）

### 6-D. 円グラフは「集中リスクチップ + Drawer 展開」へ縮退（UI/UX 推奨）

5 銘柄以下のユーザーには円グラフは装飾。代わりに:
- **top1 構成比 ≥ 30% → amber chip「集中リスク: AAPL 42%」**を サマリー直下に表示
- チップクリックで accordion 展開、150px ドーナツ + 凡例（≥6 銘柄ユーザー向け）

### 6-E. 差別化案（設計エキスパート提案）

#### 「決算カレンダー × 構成比 Treemap」 — beatscanner 独自領域
- 横軸 = 次回決算までの日数（左ほど近い）
- 縦軸 = ポートフォリオ構成比（面積）
- 色 = 直近決算 Beat / Miss（緑/赤/グレー）
- Robinhood / Webull / Finviz Treemap いずれも持たない領域
- 実装: `recharts Treemap`、+25KB gz

#### 「週次 保有銘柄決算プレビュー」 — Claude AI 活用
- 月曜朝バッチ生成、保有銘柄のうち今週決算ある銘柄 → Claude Haiku で 1 銘柄 80 token のコメント
- コスト: 月 $2.4 / 1000 ユーザー（極小）
- 設計思想 ② 毎日開きたくなる + ④ 1 クリック減 直撃

### 6-F. 段階的実装計画（Web 開発推奨）

```
X-2-5-A (1.5 日): SummaryCards (当日変動最上位) + Table + 集中リスクチップ + /api/quotes 新設
X-2-5-B (2 日):   holding_lots テーブル新設 + 入力 UI 改修 (ロット履歴対応) + RLS
X-2-5-C (1 日):   HistoryChart (lightweight-charts、lots から日次評価額再構築)
X-2-5-D (0.5 日): 株式分割自動補正 (FMP /historical-price-full の adjClose で検出)
X-2-5-E (1 日):   決算 Treemap + 週次 AI プレビュー (差別化機能)
```

**合計**: 6 日。A だけ先行リリースして 1 週間ユーザー観察、その後 B/C/D/E。

### 6-G. 重要警告

- **時系列グラフを焦って近似実装**（「最新保有数 × 過去株価」など） → Trust Cliff 直撃 → 絶対 NG
- **株式分割対応漏れ** = NVDA / AAPL / TSLA 保有者の avg_cost 壊滅
- **当日変動の欠落** = Robinhood / Webull に劣後する第一印象（リテンション悪化）

### 6-H. /api/quotes エンドポイント（Phase 3 と共通）

Phase 3 (チップ損益バッジ) でも同じ FMP `/v3/quote/{list}` bulk 呼出が必要 → **Phase 3 で新設して Phase X-2-5 で再利用**する設計。
- TTL: 60 秒（市場開場時）/ 900 秒（pre/after/週末）
- 米国市場時間判定: `pytz US/Eastern` + 9:30-16:00 ET

### 6-I. モバイルカード折りたたみ検討（保留・要相談、2026-05-06 ユーザー指摘）

スマホ時の PortfolioDashboard の各銘柄カードは現状 7 項目フル表示（株数 / 取得 / 現在値 / 当日 / 評価額 / 損益 / 構成比 + 次回決算）。情報量が多いため折りたたみで「銘柄 + 評価額 + 損益% のみ」に圧縮する案がある。

**ユーザー判断保留中の理由**:
- 「自分がどれだけ儲かっているか」は最大の関心事 = 情報量多くても体感時間は短い
- 1 画面で全情報が見えるほうが「毎日開きたくなる」原則に直結
- 折りたたみ展開のクリックは「1 クリックを減らせ」原則に逆行する

**実装する場合の案**:
- アコーディオン (各カードの右上に▼ chevron、デフォルト折りたたみ)
- スワイプで展開 (Apple HIG)
- もしくは 2 階層: 主要 4 項目 (株数 / 評価額 / 損益% / 次回決算) を常時表示、詳細 (取得 / 現在値 / 当日 / 構成比) を tap で展開

工数: 1-2 時間。**リリース後ユーザー DAU 計測してから判断推奨** (DAU 上位ユーザーの行動ログで「カード内すべて見ている」or「上の方しか見ていない」を確認)。

---

## 7. 投資判定スコアカード（リリース後 3 ヶ月以降・5 体エージェントレビュー統合・2026-05-06）

実現損益トラッキング機能の追加可否について、金融アナリスト / UI/UX デザイナー / Web 開発エキスパート / Web 設計エキスパート / Web マーケターの 5 体並列レビューで以下に到達。

### 7-A. リリース前の判定: **見送り**（4/5 合意）

**理由**:
- beatscanner の本業は決算分析であって税務管理ではない
- Sharesight ($7/月) / 楽天 / SBI 等が既に高精度で提供 → 単純実現損益では勝てない
- 手入力依存 → 不正確な数字 → Trust Cliff 直撃（CLAUDE.md 最重要バグカテゴリ）
- 7-9 日工数を本業（CC コール / 図解 / スクリーナー高度化）に投じる方が ROI 高い

### 7-B. 将来実装する場合の最強案: 「投資判定スコアカード」

純粋な実現損益はコモディティで差別化できないが、**「決算判断 × 損益」のクロス分析**として実装すれば beatscanner 独自の差別化機能になる。

| 指標 | 例 |
|---|---|
| ファンダメンタル 5 条件で買った銘柄の勝率 | 87% |
| 決算 Beat 銘柄保有継続のリターン | +12% |
| 決算前売却の平均リターン | -3% (失敗パターン) |
| あなたの決算予測精度 | 78% (Beat/Miss 当てた率) |

**Robinhood / Sharesight / Seeking Alpha のいずれにも作れない、beatscanner 独自軸**。じっちゃまプロトコル文脈にも整合。

### 7-C. 実装前提条件（4 つすべて満たす場合のみ）

1. **Phase X-3 (FIFO ロット履歴 + 配当 + 分割) が先に完成**していること
2. **CSV インポート対応** (楽天 / SBI / Robinhood / IBKR フォーマット) → 手入力依存を避ける
3. **「概算」明示** UI で誘導（確定申告は証券会社レポート使えと明記、Trust Cliff 予防）
4. **freemium ハイブリッド**: 直近 10 売却まで Free / 全期間 + 年次レポート + 決算精度クロス分析 + CSV エクスポート = Pro

### 7-D. DB スキーマ最終案（Web 開発エキスパート推奨）

**transactions テーブル方式（single source of truth）**:

```sql
create table transactions (
  id uuid primary key,
  user_id uuid references auth.users(id),
  ticker text not null,
  type text check (type in ('buy', 'sell', 'dividend', 'split')),
  shares numeric,
  price numeric,
  fee numeric default 0,
  fx_rate numeric,           -- USD/JPY for tax reporting
  executed_at timestamptz,
  created_at timestamptz default now()
);
```

`holdings` テーブルは将来的に view 化 (`SELECT ... FROM transactions GROUP BY ticker`) すれば single source of truth になる。

cost basis 計算は **FIFO** 採用 (IRS デフォルト一致 + Robinhood/Schwab/Fidelity 標準)。

### 7-E. 段階的実装計画（Web 開発推奨、リリース後）

| Phase | 内容 | 工数 | 時期 |
|---|---|---|---|
| **5-A** | transactions テーブル + RLS + 既存 holdings seed migration | 1.5 日 | リリース後 2-4 週 |
| **5-B** | 売却入力 sheet UI + FIFO consume + realized_pnl 表示 | 2.5 日 | 5-A の +1 週 |
| **5-C** | 配当・分割対応 + YTD サマリーカード（ホーム hero） | 2 日 | 5-B の +2 週 |
| **5-D** | 決算判定スコアカード（差別化機能） | 2-3 日 | 5-C の +1-2 週 |

**合計**: 8-9 日。MVP リリース後 1-3 ヶ月で段階配信。

### 7-F. マーケティング戦略（マーケター推奨）

1. ネーミングは「実現損益」でなく **「投資判定スコアカード」**（じっちゃまプロトコル文脈）
2. シェア画像 OGP 自動生成（5 条件バッジ付き、黒背景 + 緑数字 + 銘柄ロゴ）
3. 年次まとめ（1 月配信）でメール復帰促進
4. ランディングに「決算で勝てた銘柄ランキング」未ログイン層訴求

### 7-G. 採否判断のトリガー

リリース後、以下のシグナルが揃った場合のみ Phase 5-D まで進める:
- Holdings 登録ユーザー比率 30% 超
- 「実現損益機能ほしい」ユーザー要望が 5 件以上
- Pro 転換率改善ニーズが顕在化（無料層の Pro 訴求弾不足）

シグナル不足なら 5-D は永続的に見送り、本業（決算分析）の磨き込みに集中。

### 7-H. 重要警告

- **ゲーミフィケーション (連勝記録 / マイルストーン演出) は不採用**: Robinhood は紙吹雪演出と Realized Gains ランキングが過剰取引を誘発し SEC $70M 制裁。じっちゃまプロトコル「ファンダメンタル長期保有」思想と真逆。
- 採用可: **S&P500 比較バッジ**（冷静な振り返り、過剰取引を煽らない）

---

## 8. 判定タブ刷新 + 企業紹介長文記事（ユーザー要望・2026-05-06 v45）

**追加日**: 2026-05-06 (v45 セッション)
**起点**: ユーザー直接要望
**実施タイミング**: §1 FMP 有料化 → §2 BYOK 削除完了後、リリース直前 or 直後
**前提**: 既存「判定タブ」(`ConferenceAnalysis.jsx`) と「四半期決算履歴」(`DetailReport.jsx` 第 3 アコーディオン + `ConferenceAnalysis.jsx` 4 列テーブル) を起点に刷新する

### 8-A. 判定タブ「アナリストの視点」刷新

**現状** (`ConferenceAnalysis.jsx` L179 `AnalystCard`):
- FMP `analyst_price_targets` の `mean / high / low` と現在値乖離を表示
- アナリスト個別履歴 (`history`) + Beat/Miss カウント

**新機能の改善要件 (要設計)**:
- カバレッジ強化: アナリスト数 / 上方修正・下方修正の直近 90 日推移
- セルサイドコンセンサス vs バイサイドコンセンサスの乖離可視化
- 価格ターゲット改定タイムライン (折れ線 + イベントマーカー)
- "Why now" — このタイミングで強気/弱気が増えた理由を 1 段落要約 (Claude API)
- Pro 限定機能化候補

#### 8-A-bis. 過去サブエージェントレビュー要点の統合 (v19b / v19c, 2026-04-29)

**v45 で過去レビュー文書を git 履歴から復元 (commit `384cc49` で追加・`8479b1a` で削除済)。本作業に巻き込む。**

##### 🔴 最重大バグ (v19b §1) — 即時対応推奨

**AI 要約の年次 EPS と四半期 EPS の混在表示** (例: 「EPS $13.64（予想$3.92に対し実績$4.14でBeat...）」):
- 原因: `build_user_prompt` が `metrics_trend`（年次 3 期）と `beat_miss_detail`（四半期実績）を区別なく同一プロンプトに渡している
- 影響: ユーザーが誤った投資判断をする可能性
- 修正: プロンプト内で年次セクション / 四半期 Beat セクションを明示的に分離し、「年次データを ①④ に、四半期 Beat 情報を ② に使う」旨の制約を末尾追記

**営業 CF の符号エラー** (例: `-$136.16B`):
- LLM が支出 CF (投資/財務活動) を誤って参照、またはスケール変換エラー
- 数値出力後に sanity check (営業 CF が負値なら警告タグ)

##### 🟡 v19b 推奨改善 5 件 (金融アナリスト視点)

| 優先 | 指標 / 機能 | 問題 | 改善案 |
|---|---|---|---|
| 1 | AI 要約プロンプトの数値コンテキスト分離 | 年次 EPS / 四半期 EPS 混在 | `build_user_prompt` 改修 + 使用規則明示 |
| 2 | **FCF (フリーキャッシュフロー) 指標追加** | OCF のみで CapEx 集約型企業 (MSFT 約 $44B/年) を過大評価 | `judgment.py` の `PeriodData` に `capex` / `fcf` (= ocf - capex) 追加、`to_dict()` で FCF マージン提示 |
| 3 | ガイダンス状態の 3 値区分 | 「非開示」「取得失敗」「取得成功」が UI 上で同一表示 | `_fetch_sec_guidance` の戻り値に `status: "not_disclosed_policy" / "fetch_failed" / "available"` を追加 |
| 4 | 売上高成長率の加速度バッジ | 3 期連続増加の二値判定では成長の質 (加速 vs 減速) が不明 | `revenueGrowthAcceleration = 直近 YoY - 前期 YoY` を計算し +/- でバッジ表示 |
| 5 | バリュエーション指標のリアルタイム化 | P/E・P/B・P/S が LLM 学習データ依存で再現性なし | FMP `/key-metrics` から直接取得し LLM 値を置換 |

##### 🟡 v19c 推奨改善 5 件 (Beat/Miss バッジ・FCF・条件①トレンド)

| 優先 | 指標 / 機能 | 問題 | 改善案 |
|---|---|---|---|
| 1 | **売上高 Beat/Miss バッジ追加** | EPS のみバッジ表示、Revenue Beat はビジュアル不在 (機関投資家は EPS Beat + Revenue Miss 等のコンビを見る) | `/api/guidance/{ticker}/basic` の `revenue.verdict` を HistoryChart と成長グラフに渡し `▲BEAT`/`▼MISS` バッジを追加 |
| 2 | バリュエーションリアルタイム化 | (v19b #5 と重複) | yfinance `.info` の `trailingPE / priceToBook / priceToSalesTrailing12Months` をセクター中央値比で評価 |
| 3 | FCF マージン補助指標 | (v19b #2 と重複) | `cash_flow.capitalExpenditure` から FCF を算出 |
| 4 | ガイダンス非開示の文脈区別 | 前期開示 → 今期撤回 (例: FY2025 INTC) を NEU として等価扱い | 直前決算のガイダンス有無を cache に保存、撤回時は「非開示（前期から撤回）」と差別表示 |
| 5 | 条件① マージントレンド評価 | 直近 1 期 15% のみ判定、トレンド悪化を見逃す | `series` 既に 3 期保持済 → 「直近期 15% 以上 + 前期比改善 or 維持」を PASS 条件追加 |

##### 🟢 追加すべき指標 (v19b §3 + v19c §3)

- **粗利益率 (Gross Margin)** — 事業構造変化を最早期に映す (Azure 比率拡大 / Apple サービス比率)
- **PEG レシオ** — 高 P/E でも高成長で割安判定可能
- **機関投資家持株比率変化 (13F)** — 業界 No.1 投資の需給シグナル
- **セクター比較** — 営業 CF マージン 15% は SaaS で物足りず、ユーティリティで高ハードル
- **Revenue Guidance Beat/Miss** — 自社ガイダンス vs 実績 (`_extract_revenue_from_guidance` 既存だが未活用)
- **EPS 連続 Beat 率 (直近 4-8 四半期)** — 既に `ConferenceAnalysis.jsx` に Beat 率計算ロジックあるがメインカード未表示
- **セグメント別成長率** — MSFT (Azure / M365 / MPC) のような多セグメント企業

##### 🔵 ガイダンス判定の精緻化 (v19b §「ガイダンス判定の是非」)

現状: `_fetch_sec_guidance` が `None` を返すと UI は「非開示」表示 → ガイダンス意図的非開示企業 (AAPL 等) と取得失敗が区別できない

3 段階精緻化:
1. `guidance_status: "not_disclosed_by_policy" / "fetch_failed" / "available"` の 3 値区分
2. 取得成功時は「上方修正 / 維持 / 下方修正」の方向性を判定サブスコアに
3. 前期ガイダンス達成率 (直近 2 件) を表示 — 経営の execution quality 評価

##### 🔵 セクター別 Beat/Miss 閾値 (v19b §6, v19c #5)

現状の ±3% 閾値は無差別適用:
- ハイテク・SaaS (MSFT, NVDA): アナリスト精度高く 1-2% 乖離で市場反応
- エネルギー・素材 (コモディティ価格依存): 10-15% 乖離が通常範囲

→ セクター別閾値テーブル (`SECTOR_BEAT_MISS_THRESHOLDS`) を導入

##### データ制約と FMP 有料化との関係 (v19c §補足)

v19b/v19c の優先 1〜5 はいずれも **FMP 有料プラン契約 (§1)** が前提条件。`/earnings-surprises` 復活で Revenue Beat バッジ・Beat 率・サプライズ精度が完全動作する。**§1 → §2 → §8-A の順序が最も合理的**。

#### 8-A 工数見積 (統合版)

| 作業 | 工数 |
|---|---|
| 既存改善 (price_targets / Why now / Pro ゲート) | 3-4 日 |
| v19b/v19c 反映 (AI プロンプト分離 + FCF + ガイダンス 3 値 + 売上 Beat バッジ) | +2-3 日 |
| セクター閾値 + 加速度バッジ + valuation リアル化 | +1.5 日 |
| **合計** | **6.5-8.5 日** (大規模化、Pro 訴求弾として最重要) |

### 8-B. 判定タブ「四半期決算履歴」刷新

**現状の 2 経路**:
1. `DetailReport.jsx` L974 第 3 アコーディオン (Pro 同梱、過去 8 期 EPS/Revenue 実績/予想/サプライズ% テーブル + 連続 Beat 期数)
2. `ConferenceAnalysis.jsx` L208 4 列テーブル (四半期 / 予想EPS / 実績EPS / サプライズ%)

→ **統合 + 刷新**:
- 既存 5 体レビュー指摘 (UI/UX #4, Web #6) **サプライズスパークライン化** (1-2h) を本作業に巻き込む
- 4 列テーブル → カード/タイムライン視覚化に置換
- ガイダンス vs アナリスト予想 vs 実績の三項対比を 1 行に圧縮 (設計原則 ① 2 秒で分かる)
- 連続 Beat 期数の累積バッジ (○ ✕ × ✕ ○ ○ ○ ○ のような系列マーカー)

**工数見積**: 設計 0.5 日 + 実装 2-3 日 = 計 2.5-3.5 日

### 8-C. 企業紹介の長文記事（仮称: Strainer 風）

**コンセプト**: Strainer (https://strainer.jp/) のような「読み物」体験を提供。決算分析にとどまらず、その企業のビジネスモデル・競争優位・直近トピックを記者風の文体で読ませる長文 (1,500-3,000 字)。

**設計思想 5 原則との整合**:
- ① 読み手に負担をかけない → 既存の数値中心 UX とは**意図的に逆方向**の機能。設計原則と直接 conflict するため別タブで隔離する
- ② 毎日開きたくなる → 「今日の 1 銘柄」週次配信フォーマットで日次リテンション補強
- ⑤ 図解で認知コスト下げ → 文章中に Claude 生成図解 (8-A の決算判定スコアカード等) を組み込み

**実装方針 (要設計)**:
- 銘柄分析画面に **「読む」タブ** を新設 (既存の 判定 / レポート / チャート / 図解 と並列)
- バックエンドで Claude Sonnet を使った長文生成 (template + 銘柄データ + 直近ニュース)
- 結果は Supabase キャッシュ (週次更新、TTL 7 日)
- 文体・構成のテンプレート設計が肝 (Strainer の記事構成を分解した上で beatscanner 流にアレンジ)

**コスト懸念**:
- Claude Sonnet 長文生成: 約 1 リクエストあたり $0.015-0.03。週次更新 × 100 銘柄 = 月 $6-12
- 配信戦略次第ではこのコストを Pro 限定に閉じ込める

**工数見積**: プロンプト設計 1 日 + バックエンド (生成 + キャッシュ + Pro ゲート) 2 日 + フロントエンド (新タブ + 記事レイアウト) 1.5 日 + 文体評価ループ 1 日 = **計 5.5-6 日 (中規模)**

**判断軸**:
- リリース前: 機能追加し過ぎでコア訴求がブレるため見送り
- リリース後 Pro 転換率が伸び悩んだ場合の差別化弾として優先度上げ

### 8-D. 着手順序の推奨

| 順 | 項目 | 工数 | タイミング |
|---|---|---|---|
| 1 | 8-A-bis 🔴 AI 要約の年次/四半期 EPS 混在バグ修正 (v19b 最重大) | 0.5-1 日 | **§1 FMP 有料化と並行で即時対応推奨** |
| 2 | 8-B 四半期決算履歴刷新 (既存資産活用、5 体レビュー残課題吸収) | 2.5-3.5 日 | リリース直前 |
| 3 | 8-A アナリストの視点刷新 (Pro 訴求弾、v19b/v19c 統合) | 6.5-8.5 日 | リリース後 1-2 週、§1 完了後 |
| 4 | 8-C 企業紹介長文記事 (差別化・大規模) | 5.5-6 日 | リリース後 1 ヶ月、転換率データを見て判断 |

合計工数: **約 15-19 日** (4 件全着手する場合)

**🔴 8-A-bis のみ別枠で即時対応推奨**: AI 要約の数値混在は誤った投資判断を促す重大度のため、リリース前に修正完了させる。プロンプト改修のみなので 0.5-1 日で完了可能。

---

## 9. ホームタブ刷新 第 2 ラウンド (4 体エージェントレビュー・2026-05-06 v45 後)

UI/UX デザイナー / 金融アナリスト / モダンプロダクトデザイン / Web 設計エキスパートの 4 体並列レビュー (本セッション開催) で合意した方向性を整理。**§5 (第 1 ラウンド・2026-05-04) を継承しつつ具体化**。

### 9-A. P0 即時修正 (2026-05-06 完了済 ✅)

| # | 内容 | コミット |
|---|---|---|
| ✅ P0-1 | MoversCard 上昇=青 (`#3b82f6`) を CSS 変数 (`var(--color-gain)`) に修正 — CLAUDE.md 業界色ルール違反 | `1f1dc5e` |
| ✅ P0-2 | FMP APIキー設定ボタンをハンバーガードロワーから削除 (§2 完全削除予定の段階削除 step 1) | `1f1dc5e` |
| ✅ P0-3 | `holdings>0` 時の自動 hold モード起動 (localStorage 空 + holdings>0 で自動切替、明示選択は尊重) | `1f1dc5e` |

### 9-B. P1 短期 (UX 大刷新)

| # | 内容 | 5 原則 | 工数 | 状態 |
|---|---|---|---|---|
| ✅ 9-B-1 | **chip × ChartTab 統合** — chip セクション完全削除、ChartTab 行内左カラム 160px に TagPill / PnL バッジ内蔵、右に 4 ボタン縦積み (↑↓⋯×)。Linear Issue table パターン | ①②④⑤ | 1 日 | `7214f10` |
| ✅ 9-B-1 補正 | **«» トグル削除 (4→3 ボタン化) + ChartTab 色トークン化 (#3B6D11/#A32D2D → CSS 変数) + バグ案 B (filteredWatchlist を `watchlist ∪ holdings` に拡張、⊘ ウォッチ外 バッジ追加、watchlist 外は × 非表示)** — 2 体エージェント (UI/UX + Web 設計) レビュー統合 | ①②③④ | 30 分 | `76dfec2` |
| ✅ 9-B-1 補正 2 | **次回決算 + あと N 日 並列化 (Stripe-style パレンセシス sub) + Undo Snackbar (Gmail/Material 方式、× 削除誤クリックリカバリ 5 秒)** — 2 体エージェント Q1 + Q3 推奨統合 | ①③④ | 1h | (本コミット) |
| 🟡 9-B-1 残 | **DnD 並び替え (`@dnd-kit/core+sortable+modifiers`、⋮⋮ ハンドル方式、FLIP 破棄して useSortable transform 一本化、PointerSensor activationConstraint delay 250ms tolerance 5、restrictToVerticalAxis + restrictToParentElement)** — Notion/Linear 標準、bundle +16KB gzip。両エージェント完全合意。**別セッション着手推奨** (4-6h、設計判断点多数) | ①④ | 4-6h | 未着手 |
| 9-B-2 | **PortfolioDashboard Hero 化** — KPI 4 枚 (当日変動/評価額/含み損益/次回決算) を常時 Hero、テーブル/履歴チャートは `<details>` で初期 collapsed。Stripe/Mercury/Wealthfront 標準 | ②③ | 4h | 未着手 |
| 9-B-3 | **ChartTab 5 期間 → 6 期間化** (YTD 追加 — 個人投資家最頻出単位) | ① | 2h | 未着手 |

#### 9-B-1 残: DnD 実装計画 (別セッション)

両エージェント完全合意の実装方針:
1. **依存追加**: `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/modifiers` (合計 16KB gzip)
2. **Vite manualChunks 追加**: `'dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/modifiers']`
3. **TickerRow 修正**: ↑↓ ボタン削除、左端に ⋮⋮ ドラッグハンドル追加 (`useSortable` の `attributes` / `listeners` バインド)
4. **FLIP 破棄**: ChartTab.jsx:610-652 の `useLayoutEffect` を削除、`useSortable` の `transform` / `transition` に一本化
5. **モバイル長押し対応**: `PointerSensor` `activationConstraint: { delay: 250, tolerance: 5 }` で `expanded` トグルとの競合解決
6. **拘束**: `restrictToVerticalAxis` + `restrictToParentElement` で横スクロール / 画面外ドロップ防止
7. **a11y**: `KeyboardSensor` + `sortableKeyboardCoordinates` でキーボード並び替え (Space pickup → ↑↓ → Space drop)
8. **失敗時ロールバック**: `onDragEnd` で `arrayMove` → setState → Supabase 書き込み、エラー時は state 復元 + toast

⚠️ 注意: ChartTab は判定タブ (App.jsx activeTab='チャート') でも使用。DnD 機能は `enableDnd` prop で opt-in にして判定タブ側は従来通りに保つ。

### 9-C. P2 中期 (ホーム再構成、合計 3-5 日)

| # | 内容 | 工数 |
|---|---|---|
| 9-C-1 | **決算カレンダーをホーム統合** — `CalendarPanel` 既存資産流用 (新コンポ不要)、自動繰上 2 軸 (ウォッチ ≤3 営業日 / S&P100 ≤7 営業日)、明示セパレータ「あなたのウォッチ」「注目大型株」「その他」、空き枠フォールバック (ウォッチ 0 件でも section 残す)、日数バッジ (D-2 等) 常時併記 | 1.5 日 |
| 9-C-2 | **5 条件スクリーナーをホーム統合** — 折り畳み collapsed default、ハンバーガーから完全削除 | 1 日 |
| 9-C-3 | **セクション並び順最終確定** (下記) | 0.5 日 |
| 9-C-4 | **`SectionErrorBoundary` 共通コンポ + 5 セクション境界配置** — 1 セクション壊れても他生存 | 0.5 日 |

**確定セクション順 (P2-3)**:
```
1. PortfolioDashboard (Hero 化 KPI 4 枚常時)
2. 決算カレンダー (自動繰上 2 軸)
3. ウォッチリスト統合 (chip 廃止 → ChartTab 単独)
4. 経済指標カレンダー (今週)
5. 急騰落 Top 5 (上昇=緑修正済)
6. 5 条件スクリーナー (折り畳み collapsed)
7. 今日のマクロ・地政学ニュース (TodaysBrief、最下段)
```
ニュース最下段の理由: 長文で滞在時間を奪う → 業界標準 (Bloomberg / Yahoo Finance も同パターン)。

### 9-D. P3 中長期 (戦略判断必要、FMP 有料化後)

| # | 内容 | 工数 | 判断軸 |
|---|---|---|---|
| 9-D-1 | **セクター・ヒートマップ** (XLK/XLF/XLE 等 S&P500 11 セクター ETF を 3×4 グリッド) | 1 日 | ◎ FMP `/quote` で 1 リクエスト、競合差別化大 |
| 9-D-2 | **マーケットセンチメントストリップ** (VIX/US10Y/DXY/WTI 細帯を画面最上部) | 1 日 | ◎ FMP `/quote/^VIX,^TNX,DX-Y.NYB,CL=F` |
| 9-D-3 | **Unusual Options Activity Top 5** (機関フロー先行シグナル) | 2 日 | △ Polygon Options $29/月追加契約必要 |
| 9-D-4 | **インプライド・ムーブ (IM) を決算カレンダー第 3 軸に** (ATM ストラドル価格 ÷ 株価) | 2 日 | △ Polygon $29/月必要 |
| 9-D-5 | **時刻別セクション順序出し分け** (寄り前=経済指標最上段 / 場中=急騰落上位 / 引け後=決算ハイライト / FOMC 当日=カウントダウン) | 2 日 | ⚠ 複雑度↑、A/B テスト推奨 |
| 9-D-6 | **SWR 導入** (5 セクションの fetch ボイラープレート半減、`revalidateOnFocus + dedupingInterval` 統一) | 1.5 日 | △ Bundle +6KB、Q1 lazy 化と相殺 |

### 9-E. P4 バックログ追加 (今回発見、各 2-4h)

- 9-E-1: ChartTab に **vs SP500 α / 52 週高値からの距離 / 出来高変化** を追加検討
- 9-E-2: 経済指標カレンダーに **Fed Funds Futures 折込確率 (CME FedWatch) / FOMC blackout pill** 追加
- 9-E-3: 騰落率の **彩度 3 段階化** (淡/中/濃で +0.5% と +50% を視覚区別)
- 9-E-4: **ダーク切替をアバターメニューに昇格 + System オプション追加** (Apple HIG 準拠)
- 9-E-5: **Watchlist Empty state を 4 ステップカード化** (1.検索→2.分析→3.★追加→4.毎朝開く)

### 9-F. 4 体間で対立した重要論点 (要ユーザー判断)

| 対立 | 縦積み維持派 (UI/UX + 金融) | Segmented 派 (モダンデザイン) | 暫定判断 |
|---|---|---|---|
| ホーム構造 | 7 セクション縦積み + 順序最適化 | Linear/Stripe 風 segmented control「📅 マーケット / ⭐ ウォッチ / 💼 PF / 🔍 スクリーナー」 | **縦積み維持** (個人投資家リテラシー考慮 + 設計原則 ② に有利) |

ターゲットがクラス課題 → 個人投資家の「米国株学習者」のため、能動的に切り替えを要求するモダン構造より、開いた瞬間に全情報がスクロールで見える縦積みを採用。Q1 「フラット感」指摘は **PortfolioDashboard だけ Hero 化 (border 消し + KPI 大文字)** で非対称化を実現。

---

## 10. 指標バー (MarketWidget) 残タスク

v41 で Phase 1 (UX 即適用 / Tier 1 拡充 / タブ→2行 / シアンバー) 完了済 (`5ef4d61` / `c3debd9` / `ee1b03a`)。以降の Phase 2c / P2-P4 は **handover_2026-05-05_v40.md §14-§16** に詳細設計済だが永続化が漏れていたため本セクションで再登録。

### 10-A. Phase 2c 仕上げ (合計 6-10h)

| # | 内容 | 工数 |
|---|---|---|
| 10-A-1 | **ピン機能** (☆ アイコン + localStorage、ユーザー上位 5 件カスタマイズ → モバイル 4 件固定の不満解消) | 2-3h |
| 10-A-2 | **Closed バッジ** (米市場クローズ時に「動いている群」と「停止群」を視覚分離) | 2h |
| 10-A-3 | **動的 TTL** (FOMC / CPI 日は 15s に短縮、平時 60s、米市場 8:30-10:00 ET と 14:00-16:00 ET は 15s) | 2-3h |
| 10-A-4 | **並び順カスタマイズ (DnD)** (`@dnd-kit/core` + `@dnd-kit/sortable`、a11y 対応、モバイル長押しドラッグ) | 4-6h |

### 10-B. P2-P4 大規模リファクタリング (合計 30-38h、上級者拡充の核)

| # | 内容 | 工数 | 依存 |
|---|---|---|---|
| 10-B-1 (P2) | **SSOT 化** — `marketSymbols.json` 新設、FE/BE 双方が読む。30+ 指標準備 (Tier 1 のみ表示) | 6-8h | 単独可 |
| 10-B-2 (P3) | **Zustand + 期間切替 + Markets ▾** — history endpoint + store 化 + Segmented Control (1D/1W/1M/6M/1Y) + 段階開示。期間切替 0ms (Bloomberg/TradingView 体感) | 16-20h | P2 必須 |
| 10-B-3 (P4) | **ピン + DnD** (10-A-1 + 10-A-4 を Zustand に統合、persist + ☆ UI) | 8-10h | P3 必須 |

### 10-C. Tier 2 拡張 7 候補 (FMP 有料化後に解放)

KRE / HG=F / ^VVIX / BZ=F / ^N225 / NG=F / USDCNH=X 等。FMP `/quote` レート制限緩和で 30+ 指標化が安定する。

### 10-D. 着手タイミング推奨

- **10-A-1 (ピン)**: 単独着手可、§9 の P1/P2 と並行可能
- **10-A-2 / 10-A-3 (Closed バッジ + 動的 TTL)**: 同上
- **10-B シリーズ**: §9 P1/P2 完了後 (= ホームタブ刷新と同タイミングでない)、Holdings 系 Zustand 移行と同時に実施が ROI 最大

---

## 11. ホームタブ動的充実 (5 体エージェントレビュー統合・2026-05-07)

UI/UX デザイナー / モダンプロダクトデザイン / Web 開発エキスパート / Web マーケター / 金融アナリストの **5 体並列レビュー**で合意した方向性を整理。ユーザーフィードバック 3 件 (F1: 経済指標 / F2: マクロニュース縦列サムネ / F3: ChartTab ▼ 位置) と、レビュー過程で発見した**隠れ施策**を統合。

### 11-A. P0 即時実装 (2026-05-07 完了 ✅ + 補正 3 件 完了 ✅)

| # | 内容 | 5 原則 | 工数 | 状態 |
|---|---|---|---|---|
| P0-1 | **F3 ▼ ボタン移動** — ChartTab TickerRow の ▼ を右端から「日/週/月セル直下、横全幅で独立行」に配置 | ①④ | 1h | ✅ |
| P0-2 | **F1 経済指標 枠固定** — `max-height: clamp(360px, 60vh, 620px)` + sticky day header + showFade パターン | ①② | 1h | ✅ |
| P0-3 | **F2 縦列サムネ** — TodaysBriefSection NewsRow に image 列追加 (backend は既に image 返却済) | ①⑤ | 1h | ✅ |
| P0-4+5 | **F1 和訳活用 + カテゴリアイコン** — `frontend/src/lib/i18n/economicEvents.js` 新設、楽天 MS II 流「日本語 主 + 英語 sub」+ アイコン | ①⑤ | 2h | ✅ |
| P0-6 | **⭐ 最注目大ピル化** — `highestEventKey` を amber グラデ大ピル展示 + 一文和訳 + 発表時刻 | ②⑤ | 30 分 | ✅ |

**P0 合計工数**: 5-6h (本セッション完了)

#### P0 補正 3 件 (2026-05-07 第 2 ラウンド 4 体レビュー後 ✅)

ユーザー視覚確認 → 4 体レビュー (UI/UX / モダン / Web 開発 / マーケター) で発見された問題を補正:

| # | 内容 |
|---|---|
| ✅ F4 | 「最注目」と日付グループの視覚的区切り — spotlight と list 間に「📅 今週の予定」見出し + 1px hairline divider 追加。両者並列誤認の解消 |
| ✅ F5 | **🚨 バグ修正**: `EconomicCalendarSection.jsx:500` `spotlightInfo.icon` (undefined) → `spotlightInfo.category.icon`。最注目カードのカテゴリアイコン復活 (Web 開発エージェント発見) |
| ✅ F7 | スクロールバー視認性統一 — 共通 `.bs-scroll-thin` ユーティリティ新設 (thumb 42% alpha + hover 65%、Webkit 8px、ダーク両対応)。3 箇所統一適用。**重大発見**: `news-grid-scroll-wrapper` は scrollbar 設定が**欠落**しており OS デフォルト太バー = ユーザー認識と実装が逆転していた |
| ✅ F6 | カテゴリアイコン SVG 化 — 絵文字 (📊💼🏦🏭🛒🏠📈📋) を `lucide-react` (^1.14.0) SVG に置換。物価=`TrendingUp`/雇用=`Users`/中銀=`Landmark`/製造業=`Factory`/消費=`ShoppingCart`/住宅=`Home`/GDP=`BarChart3`/その他=`FileText`。色は CLAUDE.md 投資業界色ルール遵守 (中立色のみ、緑/赤は損益専用)。spotlight は 36×36 amber タイル + 28px SVG 中央配置。マーケター実証「信頼スコア +18-25pt」(Linear/Notion 刷新事例)。Build: main +6.20KB |
| ✅ F8 | ChartTab モバイル ⋯ 集約 + bottom sheet — `isMobile` 時に 4 ボタン縦積み (20px 各) を `MoreHorizontal` 1 ボタン (44×44, Apple HIG 準拠) に集約。tap で `<ActionSheet>` (createPortal、role="dialog" + ESC + body scroll lock + safe-area-inset 対応) を起動し「上へ移動 / 下へ移動 / タグ・保有を編集 / ウォッチリストから削除」を 52px 高ボタンで縦並び。デスクトップは現状 28px 4 ボタン維持 (mouse 精度十分)。スワイプ案・編集モードトグル案は a11y / 状態管理コストで非採用。リテンション期待: モバイル操作成功率 60% 台 → 95%+、D7→D30 +20% 規模 (マーケター推計)。Build: ChartTab chunk +6.44KB、main bundle ±0.01KB (lucide 共有) |

### 11-B. P1 中期 (中期改善、合計 4-5h)

| # | 内容 | 工数 | 出典 |
|---|---|---|---|
| 11-B-1 | **Fed Speaker 拡充** — backend `_EVENT_NAME_JP_MAP` に Williams / Waller / Bowman / Jefferson / Goolsbee 等の地区連銀総裁を追加。「Fed [姓] Speech」形式が FMP 標準 | 15 分 | 金融アナリスト |
| 11-B-2 | **`_LOW_NOISE_EVENT_KEYWORDS` 新設** — MBA Mortgage Applications / Chicago Fed National Activity Index 等のノイズ指標を「重要のみ」フィルタ時に完全非表示。素人離脱防止 | 30 分 | 金融アナリスト |
| 11-B-3 | **★3/★2/★1 切替** — HIGH/MED/LOW pill を Investing.com 流 star icon (`aria-label="重要度 3"` 併記) に。国際標準と一致、機関投資家リテラシー対応 | 30 分 | 金融アナリスト |
| 11-B-4 | **「注目順 / 新着順」トグル** — TodaysBriefSection に追加。`importance === 'HIGH' && cluster_size >= 3` を最上位ソート。既存 cluster_size 活用、データ追加なし | 1h | 金融アナリスト (高 ROI 低コスト) |
| 11-B-5 | **セクション最終更新時刻表示** — `EconomicCalendarSection.updated_at` (state にあるが未表示) を section header 右下に `text-[10px] text-slate-400` で。CLAUDE.md「動的データには最終更新を併記」原則違反解消。TodaysBrief 含む全セクション統一 | 30 分 | モダン |
| 11-B-6 | **過去発表アコーディオン化** — 「昨日 (発表済)」グループを default 折り畳み + 「[+ 3 件の過去発表を見る]」展開ボタン | 1h | 金融アナリスト |
| 11-B-7 | **9-B-1 残: DnD 並び替え** (§9-B-1 既登録、`@dnd-kit/core+sortable+modifiers`、4-6h) | 4-6h | 既存 |
| 🔴 11-B-8 | **セクション順序最適化「ChartTab → マクロニュース → 経済指標」** — Robinhood / Public.com「Your portfolio first」原則、Apple Stocks / Yahoo Finance 同パターン。現状 (経済指標→マクロ→ChartTab) は Bloomberg 寄り (情報過多) で、設計原則 ② 「毎日開きたくなる」と相反。HomeTab.jsx のセクション render 順を入れ替え + spotlight + 枠固定の高さ再調整 | 1-2h | Web 設計 Q5-2 |
| 11-B-9 | **NewsRow サムネ dynamic sizing** — モバイル 64px → 48px (画面幅 <375px、Yahoo!ニュース app 同パターン)。タイトル領域確保で 3 行折り返しを抑制 | 30 分 | UI/UX Q5-1 |
| 11-B-10 | **`(あと N 日)` 緊急色を pill 内統合 (critical D-3 のみ)** — モバイルで「5/12 · あと 5 日」を 1 pill に統合し、D-3 以内のみ pill 全体を amber 背景に。CLAUDE.md 投資業界色ルール (緊急 = amber) に整合 | 30 分 | UI/UX Q5-2 |
| 11-B-11 | **TickerRow scrollIntoView の sticky 検索バー裏問題** — `block: 'center'` → `block: 'start'` + `scroll-margin-top: 80px` で sticky 高さ分オフセット | 15 分 | UI/UX Q5-3 |
| 11-B-12 | **`@container` query / 360/390/430 の 3 段モバイルブレーク** — `useIsMobile` 単一閾値だと iPhone SE / iPhone Pro Max の差を吸収できず。Linear/Notion 標準 | 1-2h | Web 設計 Q5-1 |
| 11-B-13 | **`periodsExpanded` の Zustand 巻き上げ** — 現在ローカル state + L307 useEffect で global 同期、初回 mount race condition の懸念。`useSyncExternalStore` か Zustand に巻き上げ Linear/Stripe 並みの一貫性確保 | 1h | Web 設計 Q5-3 |

### 11-C. P2 戦略 (FMP 有料化と同期、ROI 最高、合計 1-2 週)

| # | 内容 | コスト | ROI | 出典 |
|---|---|---|---|---|
| **🔴 11-C-1** | **構造化データ JSON-LD** (`schema.org/Event` (経済指標) + `schema.org/NewsArticle` (マクロニュース)) — `<head>` 直書き。「FOMC 結果」「今週の経済指標 米国」月間 1-3 万 KW、SEO 流入 +20-40% (Search Console データ) | 1 日 | 🔴 最高 | マーケター |
| **🔴 11-C-2** | **OGP 動的生成 (Vercel OG / CF Worker)** — 「今週の HIGH 指標 3 つ + ⭐ 最注目」を動的に PNG 生成。SNS シェア (X / Threads) CTR 0.5-1.0% → 2-3 倍、月 100-300 流入増 | 1-2 日 | 🔴 最高 | マーケター |
| **🔴 11-C-3** | **`/news/[id]` 個別ランディング + canonical + Twitter Card `summary_large_image`** — 自社ドメインに canonical を立てて AI 検索 (Perplexity / ChatGPT search) で beatscanner が引用される機会↑ | 1-2 日 | 🔴 高 | マーケター |
| 11-C-4 | **サプライズ Sparkline** — 経済指標の直近 6 回 `(actual - estimate) / |estimate| * 100` を 60×16 SVG polyline で。色は中立シアン/グレー (CPI 上振れ=株価ネガなので緑赤は使わない)。FMP 有料化 ($14/月) 前提、暫定は FRED API 無料利用 | 1 日 | 高 | 金融アナリスト |
| 11-C-5 | **ハト派/タカ派タグ** — Powell / Williams / ECB 講演ニュースに Claude Haiku で `["dovish","hawkish","neutral"]` 自動分類。月コスト $2-5。「AI 推定」明記必須 | 1 日 | 中 | 金融アナリスト |
| **⭐ 11-C-6** | **保有銘柄 × ニュース連携** — holdings sector → SPDR ETF tag (XLK/XLF/XLE 等) → macro news の sector tag を交差。「あなたの NVDA に関連: 半導体補助金法案進展」のような表示。**差別化最強候補** (Robinhood / Bloomberg にも無い領域) | 2-3 日 | 🔴 最強差別化 | 金融アナリスト |

### 11-D. 着手タイミング推奨

- **11-A (P0)**: 本セッションで一気に完成 (5-6h、6 件まとめてコミット & デプロイ)
- **11-B-1〜6**: P0 後の別セッション 1-2 個ずつ消化
- **11-B-7 (DnD)**: §9-B-1 残として既登録、4-6h 単独セッション
- **11-C-1〜3 (SEO 三本柱)**: ⚠️ **本アプリは銘柄分析に個別ページがなく SEO 対策が課題** とユーザー指摘。リリース直前の集中投資が ROI 最高
- **11-C-4 (サプライズ Sparkline)**: §1 FMP 有料契約と同時実装、決算 Sparkline 化と並行
- **11-C-6 (保有銘柄 × ニュース連携)**: リリース後 1 ヶ月、リテンションデータを見て差別化機能投入の判断

### 11-E. リテンション期待効果サマリ (マーケター集計)

| 施策 | D1 | D7 | 滞在時間 | CTR | SEO 流入 |
|---|---|---|---|---|---|
| F1 枠固定 (P0-2) | +5-8pt | +3-5pt | -10〜15% (健全) | — | — |
| F2 サムネ化 (P0-3) | — | +3-5pt | — | +15-30% | — |
| F1 和訳併記 (P0-4) | — | — | +20-30% | — | — |
| F1 ⭐ 大ピル化 (P0-6) | — | — | — | +5-10% | — |
| 構造化データ (11-C-1) | — | — | — | — | +20-40% |
| OGP 動的生成 (11-C-2) | — | — | — | SNS CTR 2-3 倍 | 月 100-300 流入 |
| 保有 × ニュース (11-C-6) | リテール SaaS で MAU/WAU +10-15% (差別化機能の典型) | | | | |

---

## 進捗管理

各タスク完了時はこのファイル冒頭に `✅ 完了: YYYY-MM-DD` を追記。  
リリース後は本ファイルを `archive/` に移動して履歴保存。
