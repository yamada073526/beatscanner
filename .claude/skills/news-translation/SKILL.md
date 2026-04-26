---
name: news-translation
description: |
  ニュース見出しの日本語翻訳機能を変更する。
  「翻訳ボタンが表示されない」「翻訳結果がおかしい」「翻訳をサマリーにも適用して」
  などの指示で呼び出す。
---

# ニュース翻訳スキル（news-translation）

## フロー

```
[🌐 日本語訳 ボタン] → translateTexts(titles) → POST /api/translate
→ Claude Haiku で一括翻訳 → translated[] state に格納 → タイトル表示を置換
```

## フロントエンド

### `NewsPanel.jsx`
- `translated` state: `null`（未翻訳）または `string[]`（翻訳済みタイトル配列）
- `translating` state: ボタン無効化用
- ボタン: 翻訳前は「🌐 日本語訳」、翻訳後は「🌐 英語に戻す」（toggle）
- 翻訳済み時は原文タイトルをサブテキストで表示（11px、slate-400）

### `api.js` — `translateTexts(texts: string[])`
```js
POST /api/translate  body: { texts: string[] }
→ { translations: string[] }
```

## バックエンド（`main.py`）

### `POST /api/translate`
- Claude Haiku に番号付きリスト形式で一括翻訳依頼
- `_translate_cache: dict[str, str]` でサーバーメモリキャッシュ（プロセス再起動でリセット）
- キャッシュヒット分は Claude 呼び出しをスキップ
- レスポンス: `{ translations: [str, ...] }`

## 注意事項
- 翻訳は titles のみ（summary は翻訳しない）
- Anthropic APIキーが未設定の場合 503 エラー → フロントエンドはエラーを無視してボタンを再度有効化
- 翻訳コストを抑えるため、サーバー側キャッシュを活用
