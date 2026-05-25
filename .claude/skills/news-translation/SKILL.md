---
name: news-translation
description: |
  ニュース見出しの日本語翻訳機能を変更する。
  「翻訳ボタンが表示されない」「翻訳結果がおかしい」「翻訳をサマリーにも適用して」
  などの指示で呼び出す。
---

# ニュース翻訳スキル

ニュース見出し (titles) を Claude Haiku で一括翻訳し、 翻訳結果を toggle 表示する機能の SSOT。

## 依存

- `frontend/src/components/NewsPanel.jsx` — 翻訳ボタン + `translated` / `translating` state + 表示切替
- `frontend/src/api.js` — `translateTexts(texts: string[])` API 関数
- `backend/app/main.py` — `POST /api/translate` endpoint + `_translate_cache` メモリキャッシュ
- skill `prompt-cache-optimizer` — Claude API call 全般の cache 戦略
- skill `hallucination-guard` — 翻訳結果に景表法 / 金商法違反語が混入しないか sanitize

## フロー

```
[🌐 日本語訳 ボタン] → translateTexts(titles) → POST /api/translate
→ Claude Haiku で一括翻訳 (番号付きリスト形式) → translated[] state に格納 → タイトル表示を置換
```

ボタン文言は翻訳前 / 翻訳後で toggle (詳細は `NewsPanel.jsx` 参照)。 翻訳済み時は原文 title を sub-text として小さく表示 (font-size / 色は `frontend/src/index.css` の semantic token を使用、 skill にベタ書きしない)。

## バックエンド endpoint

`POST /api/translate` の request / response schema および cache key 戦略は `backend/app/main.py` が SSOT。 主要 invariant:

- 一括翻訳 (1 call で複数 titles)、 cache hit 分は Claude 呼び出しスキップ
- `_translate_cache` はプロセスメモリ (再起動でリセット)、 永続化は不採用
- Anthropic API key 未設定時は 503、 frontend は error を無視してボタンを再有効化

## 適用範囲

- **翻訳対象**: titles のみ
- **翻訳しない**: summary / body (cost を抑えるため)
- summary 等への拡張要望時は、 cost 試算 + `prompt-cache-optimizer` skill で cache 戦略を再設計してから実装

## 注意事項

- 翻訳コスト抑制のため server side cache を必ず活用 (cache 未経由の実装変更は禁止)
- 翻訳結果が hallucination / 違反語を含む可能性があるため、 表示前に `hallucination-guard` の sanitize 適用を推奨
- 翻訳結果 toggle (英語 ⇄ 日本語) を user が予期せず切り替えると confused になるため、 state 復元は session 内のみ (再 mount でリセット OK)
