---
description: リリース前のセルフレビュー — CLAUDE.md 違反 / Trust Cliff / バンドル肥大を一括検査
allowed-tools: Bash(grep:*), Bash(curl:*), Bash(npm:*), Bash(ls:*), Bash(wc:*), Bash(find:*)
---

# /release-check — リリース前セルフレビュー

CLAUDE.md の永続ルール違反 / Trust Cliff 文言 / バンドル肥大化 / 未コミット差分を一括スキャン。本番デプロイ前 (`/deploy` 前) に必ず通すこと。

## チェック項目

### 1. UI に「じっちゃま」が含まれていないか
CLAUDE.md ルール:「UI 表示テキストには『じっちゃま』を出さない」
```bash
# .jsx/.tsx/.js (frontend) のみ対象。docs / *.md / コメント行は除外しない (UI 文字列としての検査)
grep -rn "じっちゃま" frontend/src/ 2>/dev/null | grep -v "//\|/\*\|\*"
```
**期待**: 0 件 (1 件でもあれば PR ブロック)

### 2. Trust Cliff チェック — LP 訴求と実装の整合性
CLAUDE.md ルール:「LP の訴求文言と実装が完全に一致しているか」
```bash
# LandingPage.jsx に「登録不要」「無料」「3銘柄/日まで」等が書かれているか抽出
grep -nE "登録不要|無料|3銘柄|3 銘柄|まで無料|無料で" frontend/src/components/LandingPage.jsx
# それに対応する実装側で固定 whitelist（["AAPL","MSFT","NVDA"] 等の硬いリスト）が残っていないか
grep -rn 'AAPL.*MSFT.*NVDA\|"AAPL", "MSFT", "NVDA"' frontend/src/ backend/app/ 2>/dev/null
```
**期待**: LP 文言と実装ロジックの矛盾なし

### 3. 本番 sticky 検索バー周辺を破壊していないか
CLAUDE.md ルール:「sticky 検索バーは原則として触らない」
```bash
git diff --stat main -- frontend/src/index.css frontend/src/App.jsx 2>/dev/null | grep -E "sticky-search|saturate|backdrop-filter"
```
**期待**: 該当箇所への変更があれば 1 行でも警告 (意図的なら OK)

### 4. バンドルサイズの推移
```bash
cd frontend && npm run build 2>&1 | tail -20 | grep "index-.*\.js"
```
直近のサイズと比較し、**+50 KB 以上の急増があれば警告**。
ユーザーに「lazy chunk に分割できるか検討してください」と促す。

### 5. プリフェッチ運用の整合性 (CLAUDE.md「重い API は必ず prefetchAll に含める」)
```bash
grep -n "prefetchAll\|prefetch.*Promise.allSettled" frontend/src/api.js | head -5
grep -nE "fetch\\(`/api/(guidance|chart|insights|news|ir-links|price-history|analyst)" frontend/src/ -r 2>/dev/null | head -10
```
**期待**: prefetchAll に 7 endpoint がすべて含まれている

### 6. Stage 1 Dockerfile の VITE_ ARG/ENV 同期
CLAUDE.md ルール:「新しい `VITE_*` 変数を追加するときは Dockerfile の更新も忘れない」
```bash
# frontend で参照されている VITE_ 変数
grep -rho "VITE_[A-Z_]*" frontend/src/ 2>/dev/null | sort -u
# Dockerfile に橋渡しされている VITE_ 変数
grep -E "ARG VITE_|ENV VITE_" Dockerfile 2>/dev/null
```
**期待**: 両者が一致

### 7. 未コミットの差分量
```bash
git status --short | wc -l
```
**期待**: 多すぎる場合 (> 30 行) は分割コミット推奨

### 8. console.log / debugger の混入チェック
```bash
grep -rnE "console\\.log|console\\.warn|debugger" frontend/src/ 2>/dev/null | grep -vE "// debug|// 仮|TODO|console\\.error" | head -10
```
**期待**: 本番混入予定の console.log は 0 件 (console.error は OK)

## 出力フォーマット

各項目をチェックし、状態 (✅/⚠️/❌) を 1 行で報告。最後にサマリー:
```
✅ クリア: 5 項目
⚠️ 警告: 2 項目 (バンドル +60KB / console.log 1 件)
❌ ブロック: 0 項目

→ デプロイ可能 (警告は自己責任)
```

ブロック項目があればデプロイ非推奨と明示し、修正方針を提案する。
