# Supabase MCP セットアップ (migration 適用などの DB 操作用)

Claude Code on the web セッションから Supabase の DB 操作 (migration 適用 / SQL 実行) を
行うための MCP サーバ設定。`.mcp.json` (リポジトリroot・git 追跡) で定義し、トークンは
claude.ai の Environment Variables で供給する (git にシークレットを入れない)。

## 構成

- 設定: [`.mcp.json`](../../.mcp.json) — `@supabase/mcp-server-supabase` を npx local + PAT で起動
- 形態: **npx local + Personal Access Token (PAT)** を採用。hosted HTTP (`https://mcp.supabase.com/mcp`)
  は OAuth 対話認証で headless/remote セッションに不向きなため不採用。
- env 展開: `${VAR:-}` 形式 = 未設定でも `.mcp.json` parse は成功 (graceful、CI/他セッションを壊さない)。

## 必要な環境変数 (claude.ai Environment Variables に設定・git 厳禁)

| 変数 | 取得元 | 用途 |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard → Account → Access Tokens → 新規 PAT 発行 | MCP の認証 |
| `SUPABASE_PROJECT_REF` | Supabase project URL `https://<ref>.supabase.co` の `<ref>` 部分 | 操作対象 project の scope 限定 |

設定場所: claude.ai → 該当 environment → Edit → "Environment variables" フィールドに `KEY=value` を1行ずつ
(値はクォートで囲まない)。

## 有効化手順 (durable)

1. 上記 2 変数を claude.ai Environment Variables に設定。
2. **新規セッションを起動** (現セッションでは `.mcp.json` はロードされない — 起動時読み込みのため)。
3. 起動時の MCP 承認 (trust) プロンプトで「承認」を選択。
4. 以降のセッションは承認済のため自動接続。

## 提供される主な tool

- `apply_migration` — SQL migration を適用 (DDL)
- `execute_sql` — 任意 SQL 実行
- ほか project / table 操作系

## セキュリティ注意

- 本設定は `--read-only` を**付けていない** (migration 適用 = DDL 書き込みに必要なため)。
  PAT は対象 project に DB 書き込み権限を持つ。読み取り専用に戻す場合は `.mcp.json` の args に
  `--read-only` を追加する。
- PAT は management API 権限を持つため、必ず Environment Variables で管理し、chat / git / コード
  コメントに貼らない。漏洩時は Supabase Dashboard で即 revoke。
- `--project-ref` で操作対象を 1 project に scope 限定済 (他 project への波及を防ぐ)。

## migration 適用の流れ (例)

1. `docs/migrations/*.sql` を作成・commit (既存フロー)。
2. 本 MCP 経由で `apply_migration` に SQL を渡して本番適用。
3. backend が新カラムを使う場合は graceful fallback を必ず実装 (migration 前後で deploy 順序非依存に)。
4. nightly scan 系で populate する場合は適用後に手動 trigger して NULL 空白を回避。
