---
description: Railway に直送デプロイし、本番バンドルハッシュ変更を検証する
allowed-tools: Bash(railway:*), Bash(curl:*), Bash(grep:*), Bash(date:*), Bash(sleep:*)
---

# /deploy — 本番デプロイ + 反映確認

CLAUDE.md ルール:「デプロイは `railway up` のみ」「反映完了の判定はバンドルハッシュの変更で行う」 を 1 コマンド化したもの。

## 関連 docs / command

- CLAUDE.md「デプロイ運用」 — `railway up` 限定 / 本番バンドル grep で検証する原則
- 本番 URL: `https://beatscanner-production.up.railway.app/` (CLAUDE.md 冒頭で定義)
- `/release-check` command — デプロイ前のセルフレビュー (本 command の前段で必ず実行)
- `/health` command — デプロイ後の endpoint 別詳細診断
- memory `feedback_railway_worktree.md` — `railway up` は worktree から実行不可 (git tree of main を上げる)、 deploy 前に必ず main マージ
- memory `feedback_railway_build_diagnose.md` — deploy 失敗時の Diagnose ボタン優先 SOP
- memory `feedback_railway_oauth_offline.md` — `railway login` OAuth 503 時の切替戦略

## 実行プロトコル

### Step 0: 事前確認 (必ず実行)

- [ ] **現 branch が main** か確認 (worktree から `railway up` は不可、 `feedback_railway_worktree.md` 参照)
- [ ] **`/release-check` command を通過済** か確認 (CLAUDE.md ルール違反 / Trust Cliff / バンドル肥大の最終 gate)
- [ ] user 承認を取得 (本番影響あり、 user 明示同意なしに deploy 禁止)

### Step 1: デプロイ前バンドルハッシュを取得

```bash
BEFORE_HASH=$(curl -s https://beatscanner-production.up.railway.app/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
echo "BEFORE: $BEFORE_HASH"
```

### Step 2: デプロイ実行

```bash
railway up --detach
```

`--no-verify` / `--skip-*` 等の skip フラグは **絶対に使わない** (CLAUDE.md「Git Safety Protocol」 + skill `creating-skills` Step 6 hook 通過必須)。

### Step 3: ハッシュ変化を polling 確認

Railway ビルドは通常数分かかる。 polling で本番ハッシュ変化を待つ:

```bash
for i in $(seq 1 15); do
  sleep 20
  CURRENT=$(curl -s https://beatscanner-production.up.railway.app/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
  echo "[$i/15] $CURRENT"
  if [ "$CURRENT" != "$BEFORE_HASH" ] && [ -n "$CURRENT" ]; then
    echo "✅ 反映完了: $BEFORE_HASH → $CURRENT"
    break
  fi
done
```

polling 間隔 / 上限 (20s × 15 = 5 分) は Railway 通常ビルド時間に合わせた目安。 ビルド時間は環境で変動するため、 完了しなければ `railway logs` で詳細確認。

### Step 4: 検証メッセージで補足説明

- ハッシュが変わらなければ:
  - **「Railway ビルド未完了の可能性。 `railway logs` で確認」** と user に通知
  - 失敗時は `memory/feedback_railway_build_diagnose.md` の Diagnose ボタン優先 SOP を案内
- ハッシュが変わっていれば:
  - **「次は実際にブラウザで動作確認してください」** と user に通知
  - `/health` command で endpoint 別の sanity check を推奨

## 注意

- 本番影響があるため、 user 側で `railway up` を実行することの承認を **必ず取ってから** 実行
- `--no-verify` 等 skip フラグ禁止 (hook が失敗したら本質的問題を解決、 skip しない)
- frontend ビルドは Railway 側で自動実行される (`Dockerfile` Stage 1 で VITE_ ARG/ENV 橋渡し、 CLAUDE.md「Vite + Railway のビルド連携」 参照)
- worktree からの実行は不可 → 必ず main branch で実行 (`memory/feedback_railway_worktree.md`)
- `railway login` OAuth 障害時の切替戦略は `memory/feedback_railway_oauth_offline.md` 参照
- 本番 URL は本 command 内で hardcode、 URL 変更時は他 command (`/morning` / `/health` / `/release-check`) も同時更新
