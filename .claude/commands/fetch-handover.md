---
description: 最新の handover ファイルを読み、要点を圧縮サマリーで返す
allowed-tools: Bash(ls:*), Bash(grep:*), Read
---

# /fetch-handover — 最新引き継ぎ書の取得・要約

新セッション開始時の context warm-up 用。 最新の `handover_YYYY-MM-DD_v*.md` を 1 つだけ読み、 要点を圧縮して返す。

## 関連 docs

- CLAUDE.md「引き継ぎ書（短命・最新版のみ参照）」 — 賞味期限 1〜2 セッション、 旧版削除推奨
- CLAUDE.md「コスト効率運用」 — handover lazy read SOP (session 開始時に full-read 禁止、 本 command の圧縮 summary のみ)
- memory `feedback_cost_efficient_operation.md` — Opus 4.7 main session の context warm-up コスト圧縮 SOP

## 実行手順

### 1. 最新ファイルを特定

```bash
ls -1 handover_*.md 2>/dev/null | sort -V | tail -1
```

これで「最も新しいバージョン番号」 のファイルを得る。 該当ファイルがなければ「handover ファイルが見つかりません」 と返して終了。

### 2. ファイル全体を Read で読む

Read tool で取得 (引き継ぎ書は通常 200-400 行、 大きい場合は offset/limit で分割読みも検討)。

### 3. 30 行以内のサマリーを返す

以下の形式で抽出:

```
📋 引き継ぎ書 v?? サマリー (作成日 YYYY-MM-DD)

🎯 完了済みの主要トピック (3-5 行):
  - ...

🔴 最優先 — 次セッション着手必須:
  - ...

🟡 重要知見 (永続化要、 特にセッション固有のもの):
  - ...

📊 残バックログ (未完 Phase / 工数):
  - 内容 (工数)
  - ...

⚠️ 触ると危険な箇所のリマインダ (CLAUDE.md「触ると危険な箇所」 からも引用):
  - sticky 検索バー
  - 発光系 (.panel-card / .bs-panel / .surface-card)
  - VITE_ ARG/ENV 同期
  - ...
```

### 4. 旧バージョン (v??-1 以前) は読まない

CLAUDE.md ルール:「賞味期限は 1〜2 セッション。 古くなったら削除して構わない」。 古い handover を読むのは context window の浪費 (`feedback_cost_efficient_operation.md` lazy read SOP)。 最新版のみで十分な情報が得られる設計。

## 注意

- 引き継ぎ書本体を Read で開いて読むこと (grep でつまみ食いしない、 文脈を失う)
- 全文要約せず、 **「次セッションが知っていれば困らない」** 情報に絞る
- user が「full-read してほしい」 と明示した場合のみ全文要約 (default は lazy summary)
- 永続化すべき知見が見つかったら memory への移動を user に提案 (handover は短命、 memory は永続)
