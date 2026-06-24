# Memory Maintenance — 永続メモリの定期棚卸し SOP

Claude 永続メモリ (`~/.claude/projects/-Users-yamadadaiki-Projects-beatscanner/memory/`) は放置すると **陳腐化 / 重複 / index↔ファイル乖離 (orphan・dangling)** が溜まり、想起ノイズで出力品質を鈍らせる。これを「軽量チェック (毎セッション・機械) + 深掘り監査 (月次・判断) 」の 2 段で機械化する SSOT。

- 確立: 2026-06-06 (v173)。 user 要望「データ整理を定期的・機械的に」。
- 関連: `CLAUDE.md`「メモリ衛生」 / `.claude/hooks/memory_health_check.sh` (軽量) / `docs/references/tool_reliability_prevention.md` (context 衛生の双子)

> **原則**: index は「1 行ポインタ」(目安 **<200B/行**、hook が機械検出。日本語混在では「~200 字」でなく **~200 byte** が実効ライン)、詳細は topic ファイル。index に内容 (commit hash・数値・進捗状態) を詰めない。**削除は必ず user 承認**、非破壊修正 (UPDATE / 再index / MERGE) は即適用可。
>
> **根本対策 (2026-06-20)**: 「size 肥大 → つど圧縮」 を繰り返さないため、hook が **個別行の詰め込み (>200B)** を毎セッション検出する (size 上限到達の前兆を行単位で先取り)。size warning だけだと「上限に当たって初めて気づく」 → 全行を慌てて圧縮、の悪循環になる。**新規 entry 追加時は最初から <200B のフックで書く**こと。詳細は本体ファイルに置き index はリンク + 識別フックのみ。
>
> **根本対策 v2 (2026-06-24 棚卸し)**: 行の圧縮は対症療法。**件数の単調増加こそ size 肥大の真因** (feedback_ が 93 件まで過分割していた)。 3 レバーで構造的に断つ —
> - **(A) 昇格 = 移動 (複製でない)**: memory を CLAUDE.md / docs/references に昇格させたら **元 memory を即削除** (「→ CLAUDE.md §X 参照」 スタブも残さない)。 二重管理が最大の想起ノイズ源 (今回 honesty / cost_efficient / claude_output_language / visual_harness の 4 件が CLAUDE.md と一字一句重複と判明し削除)。 削除前に `grep -rl 'slug' memory/` で被参照を確認 → `[[slug]]` は「CLAUDE.md §節名」 テキストへ張り替えて dangling を作らない (memory は git 外 = 不可逆。 削除前に /tmp へ backup 推奨)。
> - **(C) 新規は「既存 canon への追記」 を第一選択**: 1 bug=1 file をやめ、既存ファイルに 1 セクション足せるなら追記する。 新規ファイルは独立した大トピックのみ。 作成前に必ず自問:「これは CLAUDE.md (恒久ルール) / docs (設計値) / git log (実装記録) に属さないか？」 — memory はそのどれにも入らない揮発性運用知だけ。
> - **(B) hook が件数 + 卒業候補を検知** (段 1 表の 2 行)。 A/C を「忘れない」 機械的補助。
> - SSOT の役割分担: **CLAUDE.md「メモリ衛生」= 要点 / 本ファイル = 詳細手順**。 二重記述を避ける。

---

## 段 1: 軽量チェック (毎セッション・全自動)

`SessionStart` hook `memory_health_check.sh` が毎セッション冒頭に以下を read-only 検出し表示する (常に exit 0、session を止めない):

| 指標 | 閾値 | 意味 / 対処 |
|---|---|---|
| MEMORY.md size | ≥22KB (上限 24.4KB) | index 行を圧縮 (詳細は topic へ) |
| **長すぎる index 行** | >200B/行 | 詰め込み (commit hash・数値・進捗を index に書いた)。詳細を本体へ移しフックのみ残す。**size 上限の前兆を個別行で検出 (2026-06-20 追加)** |
| **orphan** | >0 | disk にあるが index 未掲載 = **想起されない**。価値あれば再index、不要なら削除提案 |
| **dangling** | >0 | index にあるが実体なし = リンク切れ。index 行を修正 |
| 進捗語 (着手中/保留 等) | >8 | stale fact の更新候補 |
| **総ファイル数** | ≥150 | 過分割の先行指標。 既存 canon へ統合 or CLAUDE.md/docs へ昇格(=移動)。size 肥大の前に件数を断つ (2026-06-24 追加) |
| **卒業候補 (phase_log/impl_log)** | 30日+ 更新なし | 完了済 impl 記録。 commit hash は git log で代替可 → 削除/統合候補 (2026-06-24 追加) |
| 前回深掘りからの日数 | ≥30 | 月次深掘りを実施 |

⚠️ が出たら段 2 を起動。何も出なければ「✅ メモリ健全」一行のみ。

> orphan/dangling は harness 標準の size 警告では検出されない。v173 で「glow grammar / motion SSOT が 16 日間 orphan で想起不能」だった真因がこれ。**毎回検出が肝**。

---

## 段 2: 深掘り監査 (月次 or hook が flag した時・判断を伴う)

read-only サブエージェント (Sonnet、コスト SOP 準拠) に全 memory ファイルを精読させ、現実 (git log / 最新 handover / CLAUDE.md / 実コード) と突き合わせて棚卸しする。

### 起動コマンド
「メモリ棚卸し」「メモリ監査」 と指示 → 下記 rubric のサブエージェントを起動。

### サブエージェント rubric (再現用・v173 で確立)
- **役割**: 監査のみ。**ファイル編集・削除は一切しない** (main 側が user 承認を経て適用)。日本語回答。
- **突き合わせ先**: `memory/*.md` 全件 / 最新 `handover_*.md` / `git log --oneline -50` / `CLAUDE.md` / 実コード (ディレクトリ・component 存在確認)。
- **出力カテゴリ** (各 file 名 + 根拠 + confidence[高/中/低] 必須):
  - 🔴 DELETE 候補 — 陳腐化で価値消失 / CLAUDE.md・他ファイルに完全吸収済。**吸収先を明記**。保守的に。
  - 🟡 MERGE 候補 — 同一トピック分割。survivor + 畳み込む内容。
  - 🟠 UPDATE 候補 — 事実が古い (ファイルは残し本文修正)。**正しい現状を根拠つき**で。
  - ⚪ CONTRADICTION — memory 同士 or memory と現実の矛盾。
  - 📊 サマリー + 「最も output を鈍らせる上位 5 件」。
- **保守バイアス**: bug 教訓 / postmortem / 設計判断の根拠 は完了済でも KEEP。確信なければ KEEP。confidence 低の DELETE は「低」明記。

### main 側の適用ポリシー (監査後)
1. **サブエージェントを鵜呑みにしない** — DELETE 推奨と適用する UPDATE は **自分で対象ファイルを精読して検証** (v173 で「Pane4 完全削除」根拠が実コードと相違＝部分誤りを検出した実績)。
2. **非破壊修正は即適用**: UPDATE (stale fact 修正) / 再index (orphan 復活) / MERGE。
3. **削除は user 承認制**: 高確度/要判断に分類し AskUserQuestion で確認。被参照 (`grep -rn 'file.md' memory/`) を削除前に確認しダングリングを防ぐ。
4. **別セッションの担当領域は触らない** (例: 並行ニュース実装中の `news_*` memory)。
5. 完了後 `.last_deep_audit` を当日 (`YYYY-MM-DD`) に更新 → 段 1 の日数カウンタがリセット。

### CLAUDE.md / docs に属すべき内容
memory が CLAUDE.md の恒久ルールや docs/references と完全重複していたら、memory を削除し SSOT 側に一本化 (memory は「コードから導けない」ものだけ)。

---

## 触ると危険 / 注意

- index の `[Title](file.md)` リンクの **file 名は変更しない** (topic ファイルへのポインタ)。圧縮するのは「— 」以降の hook 文のみ。
- 削除はほぼ不可逆。high-confidence でも user 承認を取る。
- `.last_deep_audit` は dot-prefix・非 .md なので memory として読まれない (orphan 判定対象外)。
