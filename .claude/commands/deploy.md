---
description: Railway に直送デプロイし、本番バンドルハッシュ変更を検証する
allowed-tools: Bash(railway:*), Bash(curl:*), Bash(grep:*), Bash(date:*), Bash(sleep:*)
---

# /deploy — 本番デプロイ + 反映確認

CLAUDE.md ルール:「デプロイは `railway up` のみ」「反映完了の判定はバンドルハッシュの変更で行う」を 1 コマンド化したもの。

## 実行手順

1. **デプロイ前バンドルハッシュを取得**:
   ```bash
   curl -s https://beatscanner-production.up.railway.app/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1
   ```
   出力された `index-XXXX.js` のハッシュ部分を変数 `BEFORE_HASH` として記憶する。

2. **デプロイ実行**:
   ```bash
   railway up --detach
   ```

3. **20 秒間隔で 5 分まで待機しながらハッシュ確認** (Railway ビルドは通常 2-4 分):
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

4. **検証メッセージで補足説明**:
   - ハッシュが変わらなければ「Railway ビルド未完了の可能性。`railway logs` で確認を」と促す
   - 変わっていれば「次は実際にブラウザで動作確認してください」とユーザーに知らせる

## 注意

- ユーザー側で `railway up` を実行することの承認を取ってから実行する (本番影響あり)
- `--no-verify` 等の skip フラグは絶対に使わない
- フロントエンドのビルドは Railway 側で自動実行される
