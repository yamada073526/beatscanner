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

## 進捗管理

各タスク完了時はこのファイル冒頭に `✅ 完了: YYYY-MM-DD` を追記。  
リリース後は本ファイルを `archive/` に移動して履歴保存。
