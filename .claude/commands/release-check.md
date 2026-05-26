---
description: リリース前のセルフレビュー — CLAUDE.md 違反 / Trust Cliff / バンドル肥大を一括検査
allowed-tools: Bash(grep:*), Bash(curl:*), Bash(npm:*), Bash(ls:*), Bash(wc:*), Bash(find:*), Bash(git:*), Skill
---

# /release-check — リリース前セルフレビュー

CLAUDE.md の永続ルール違反 / Trust Cliff 文言 / バンドル肥大化 / 未コミット差分を一括スキャン。 本番デプロイ前 (`/deploy` 前) に必ず通すこと。

## 関連 skill / docs

- CLAUDE.md「必ず守るルール（永続）」 全般 (本 command は CLAUDE.md ルールの一括検査者)
- skill `design-system-check` — token / 発光バグ / chip primitive の機械検査 (本 command から呼出)
- skill `funnel-cro` — Trust Cliff 7 項目 checklist の SSOT (本 command が Trust Cliff 領域で参照)
- skill `hallucination-guard` — LLM 出力 4 重防御 (新 LLM endpoint がある場合)
- skill `prompt-cache-optimizer` — cache hit ratio 確認 (LLM endpoint 変更があった場合)
- skill `pge-loop-debugger` — `frontend/scripts/*.mjs` 変更があった場合の落とし穴 verify
- memory `feedback_cost_before_acquisition.md` — ¥/$ コスト発生施策の事前承認

## 実行プロトコル

### Step 1: 関連 skill の自動呼出

該当 file が触られていれば、 以下 skill を **必ず先に呼ぶ**:

```bash
# 何が変わったか確認
git diff --name-only main
```

| 変更 file | 呼ぶべき skill |
|---|---|
| `frontend/src/components/LandingPage.jsx` / `SampleAnalysisSection*` / `ProTeaser*` | `funnel-cro` |
| `backend/app/visualizer/` / `backend/app/aggregator/` / 新規 Claude API call | `hallucination-guard` |
| Claude API `system` 配列 / `cache_control` 編集 | `prompt-cache-optimizer` |
| `frontend/scripts/snap-*.mjs` | `pge-loop-debugger` |
| `frontend/src/index.css` / `frontend/src/components/` (大量) | `designing-workspace-ui` + `design-system-check` |

### Step 2: 機械的 grep check (CLAUDE.md ルール群)

#### 2.1 UI に「じっちゃま」 が含まれていないか

CLAUDE.md ルール:「UI 表示テキストには『じっちゃま』を出さない」

```bash
grep -rn "じっちゃま" frontend/src/ 2>/dev/null | grep -v "//\|/\*\|\*"
```

**期待**: 0 件 (1 件でもあれば PR ブロック)

#### 2.2 Trust Cliff — LP 訴求と実装の整合性

CLAUDE.md ルール:「LP の訴求文言と実装が完全に一致しているか」 + `funnel-cro/references/trust_cliff_checklist.md` の 7 項目

```bash
# LP の訴求語を抽出
grep -nE "登録不要|無料|まで無料|無料で|Pro 限定|3 銘柄" frontend/src/components/LandingPage.jsx
# 実装側に固定 whitelist (旧 Trust Cliff bug の痕跡) が残っていないか
grep -rn 'AAPL.*MSFT.*NVDA\|"AAPL", "MSFT", "NVDA"' frontend/src/ backend/app/ 2>/dev/null
```

**期待**: LP 文言と実装ロジックの矛盾なし。 疑わしい場合は `funnel-cro` skill で詳細 audit。

#### 2.3 sticky 検索バー周辺を破壊していないか

CLAUDE.md ルール:「sticky 検索バーは原則として触らない」

```bash
git diff --stat main -- frontend/src/index.css frontend/src/App.jsx 2>/dev/null | grep -E "sticky-search|saturate|backdrop-filter"
```

**期待**: 該当箇所への変更があれば 1 行でも警告 (意図的なら user 確認)

#### 2.4 バンドルサイズの推移

```bash
cd frontend && npm run build 2>&1 | tail -20 | grep "index-.*\.js"
```

直近のサイズと比較し、 **明らかな急増** があれば警告。 user に「lazy chunk に分割できるか検討してください」 と促す。 閾値は固定しない (バンドル size baseline は時間で変動するため、 直近 1-2 deploy との比較で判断)。

#### 2.5 プリフェッチ運用の整合性

CLAUDE.md ルール:「重い API は必ず prefetchAll に含める」。 対象 endpoint の最新リストは CLAUDE.md「プリフェッチ運用」 + `frontend/src/api.js` の `prefetchAll` 実装が SSOT。

```bash
grep -n "prefetchAll\|prefetch.*Promise.allSettled" frontend/src/api.js | head -5
```

**期待**: `prefetchAll` に当該 endpoint が含まれている (個別 endpoint 名は実装側で確認)

#### 2.6 Stage 1 Dockerfile の VITE_ ARG/ENV 同期

CLAUDE.md ルール:「新しい `VITE_*` 変数を追加するときは Dockerfile の更新も忘れない」

```bash
# frontend で参照されている VITE_ 変数
grep -rho "VITE_[A-Z_]*" frontend/src/ 2>/dev/null | sort -u
# Dockerfile に橋渡しされている VITE_ 変数
grep -E "ARG VITE_|ENV VITE_" Dockerfile 2>/dev/null
```

**期待**: 両者が一致

#### 2.7 未コミットの差分量

```bash
git status --short | wc -l
```

**期待**: 多い場合 (目安 30+ 行) は分割コミット推奨 (`memory/feedback_commit_proactive.md` 参照)

#### 2.8 console.log / debugger の混入チェック

```bash
grep -rnE "console\\.log|console\\.warn|debugger" frontend/src/ 2>/dev/null | grep -vE "// debug|// 仮|TODO|console\\.error" | head -10
```

**期待**: 本番混入予定の console.log は 0 件 (`console.error` は OK)

### Step 3: design / hallucination 系 skill 機械検査

#### 3.1 design-system-check skill 呼出

```
skill design-system-check
```

token 違反 / `!important` / 発光バグ兆候 / Chip primitive 違反を一括検査。 詳細は当該 skill の SSOT 参照。

#### 3.2 hallucination-guard DoD verify (LLM endpoint 変更時)

`backend/app/visualizer/` / `backend/app/aggregator/` / 新 LLM endpoint がある場合のみ:

- `hallucination-guard/references/dod_verify.md` の 8 ticker × BAD pattern 0 件 checklist を実行
- `prompt-cache-optimizer` で cache hit ratio 80%+ が維持されているか確認

## 出力フォーマット

各項目をチェックし、 状態 (✅/⚠️/❌) を 1 行で報告。 最後にサマリー:

```
✅ クリア: N 項目
⚠️ 警告: M 項目 (詳細: ...)
❌ ブロック: K 項目

→ デプロイ可能 / 修正後再実行 (ブロック数に応じて)
```

ブロック項目があればデプロイ非推奨と明示し、 修正方針を提案する。 警告のみなら user に判断を委ねる。

## 注意

- 本 command は **CLAUDE.md ルールの実行者**、 ルール自体は CLAUDE.md が SSOT。 ルール追加 / 変更時は CLAUDE.md を更新し本 command の grep を追従
- 過去 Trust Cliff bug の grep pattern (whitelist 固定 / 「登録不要」 矛盾 等) は実装変化に応じて更新
- ¥/$ コスト発生する集客施策の事前承認 ルール (`memory/feedback_cost_before_acquisition.md`) は本 command の grep では検知不可、 user dogfood で別途確認
