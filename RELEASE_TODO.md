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

## 進捗管理

各タスク完了時はこのファイル冒頭に `✅ 完了: YYYY-MM-DD` を追記。  
リリース後は本ファイルを `archive/` に移動して履歴保存。
