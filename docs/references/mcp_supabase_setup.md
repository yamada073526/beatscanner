# Supabase MCP セットアップ & migration runbook (SSOT)

Claude Code on the web のセッションから **Supabase 本番 DB に migration を適用 / SQL を実行**するための
設定 SSOT。 CLAUDE.md・各 handover が参照する。

> ✅ **2026-06-26 UPDATE: egress 許可後、PR #25 の migration を本番適用・検証済。**
> user が Environment 設定で `api.supabase.com` を allowlist に追加 → curl 経由で
> `2026-06-26_screener_fundamentals_last_report_date.sql` を適用 (column/index/GRANT を実クエリ検証)。
> **ただし MCP tool 自体はこの (既存) セッションでは動かず、curl を使った** (§9 の MCP routing caveat)。
> column は scan 前のため全 NULL = 想定通り。populate は PR #25 backend が main に merge・本番 deploy
> された後の nightly canslim-scan で埋まる (§7)。

---

## 1. 仕組み (なぜ 3 要素すべてが要るか)

公式 `@supabase/mcp-server-supabase` (stdio transport) は **Supabase Management API
(`https://api.supabase.com`)** を Personal Access Token (PAT) 認証で叩く。 直 Postgres 接続では
ないので DB password は不要 (PAT + project-ref だけで動く)。

migration 適用には次の **3 要素すべて** が揃って初めて動く。 1 つでも欠けると失敗する:

| 要素 | 何 | どこで設定 | このセッションの状態 |
|---|---|---|---|
| **A. 環境変数** | `SUPABASE_ACCESS_TOKEN` (PAT `sbp_…`) + `SUPABASE_PROJECT_REF` | Claude Code on the web の Environment 設定 (repo に置かない) | ✅ 両方注入済 (実測: token 44 文字 / ref 20 文字 `qwae…`) |
| **B. egress 許可** | `api.supabase.com` への outbound HTTPS | 同上 Environment の network policy / allowlist | ❌ **ブロック中** (`CONNECT tunnel failed, 403`) ← 最大ブロッカー |
| **C. `.mcp.json`** | MCP サーバーをセッション開始時に起動させる宣言 | repo root (committed・本 PR で追加) | ✅ 追加済 (`.mcp.json`) |

**B が最重要**。 `.mcp.json` を置いても MCP サーバーは runtime で `api.supabase.com` を叩くので、
egress が閉じている限り全 tool 呼出が 403 になる (curl 代替経路も同じ理由で死ぬ)。

---

## 2. 現状の到達可否 (2026-06-26 実測・正直な記録)

```
# Management API への read-only probe (curl)
POST https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query
→ curl: (56) CONNECT tunnel failed, response 403

# agent proxy status
recentRelayFailures: [{ kind: "connect_rejected",
  detail: "gateway answered 403 to CONNECT (policy denial or upstream failure)",
  host: "api.supabase.com:443" }]
noProxy: localhost,...,registry.npmjs.org,pypi.org,...  # ← supabase は含まれない
```

- `registry.npmjs.org` は noProxy 許可済 → `npx` での package 取得は通る。
- `api.supabase.com` は未許可 → MCP サーバーの実行時 API call が 403。
- 本番 Railway URL (`beatscanner-production.up.railway.app`) も同様に 403 → canslim-scan の
  curl trigger もこのセッションからは不可 (手動 trigger か nightly cron に依存)。
- proxy README の指示:「403 はポリシー拒否、 retry / 迂回禁止・報告せよ」。 → 環境側で直すしかない。

---

## 3. 環境側でやること (user 手作業・repo では直せない)

Claude Code on the web の Environment 設定で:

1. **egress allowlist に `api.supabase.com` を追加** (必須・最優先)。
   - これが無いと MCP も curl も動かない。
   - docs: https://code.claude.com/docs/en/claude-code-on-the-web (network policy の章)。
2. (任意) **`beatscanner-production.up.railway.app` も追加** — セッションから canslim-scan を
   curl trigger したい場合のみ。 不要なら user が SQL Editor 適用後に手動 trigger / nightly cron 任せ。
3. **環境変数の確認** — `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` は既に注入済 (再設定不要)。

> 💡 これらは **環境設定であって repo ファイルではない**。 `.mcp.json` を merge しても egress を
> 開けない限り効かない。

---

## 4. repo 側 (本 PR で committed)

`.mcp.json` (root):

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@0.8.2",
        "--project-ref=${SUPABASE_PROJECT_REF}",
        "--features=database"
      ],
      "env": { "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}" }
    }
  }
}
```

設計判断 (ground truth は v0.8.2 の shipped `dist/transports/stdio.js` を直接確認):

- **`@0.8.2` 固定**: pre-1.0 で breaking change があるため version pin (README が「expect breaking
  changes」と明記)。 上げるときは npm registry で latest 確認 → 本 file を更新。
- **`--project-ref` で project スコープ**: PAT は **アカウント全体権限**だが、 project-ref を渡すと
  MCP サーバーの操作対象がこの 1 project に限定され、 `list_projects` 等の account-level tool も無効化
  される (blast radius 縮小)。
- **`--features=database` のみ**: migration に必要な `apply_migration` / `execute_sql` /
  `list_tables` / `list_migrations` だけを公開。 account / branching / storage / edge-function
  tool は出さない (最小権限)。
- **`--read-only` は付けない**: read-only にすると `apply_migration` 等の mutating tool が全無効化
  され migration できない (README 明記)。 read-only 監査がしたいセッションだけ別途付ける。
- `${VAR}` は Claude Code の `.mcp.json` env 展開。 両 env 変数が無い環境では空展開で壊れるので、
  必ず A (環境変数) が揃った環境で使う。

---

## 5. 有効化手順 (この設定を実際に効かせる)

1. 本 PR (`.mcp.json` + 本 doc) を **`main` に merge** (fresh container は main を clone するため、
   feature branch のままでは将来セッションに効かない)。
2. §3 の **egress allowlist (`api.supabase.com`)** を Environment 設定で開ける。
3. **新しいセッションを開始** (Claude Code はセッション開始時に `.mcp.json` を読み MCP サーバーを起動)。
4. 起動確認: セッション内で Supabase MCP tool が見えるか。
   - `ToolSearch "+supabase"` で `apply_migration` / `execute_sql` / `list_tables` 等が出れば成功。
   - 出なければ §7 troubleshooting へ。

---

## 6. Migration runbook (MCP が生きた後の手順)

`docs/migrations/*.sql` を本番適用する標準フロー。 **全 NULL 空白を避けるため migration → scan →
verify を連続実行**する (各 migration ファイル冒頭の deploy 順序 note に従う)。

1. **適用** — `apply_migration` (name + SQL 本文)。 additive・冪等な migration のみ無人適用可。
   破壊的 DDL (DROP / ALTER TYPE 等) は user gate を必ず取る。
2. **populate scan** (該当する migration のみ) — 本番に POST:
   ```
   POST https://beatscanner-production.up.railway.app/api/cron/canslim-scan
   Header: X-Cron-Secret: <CRON_SECRET>   # backend env var
   ```
   ※ egress で Railway URL も許可されている場合のみセッションから curl 可。 無理なら user 手動 or
     nightly cron。
3. **検証** — `execute_sql` で migration ファイル末尾の確認クエリを実行 (column 追加 / GRANT / scan
   後 data の 3 本)。 **代理指標でなく実クエリ結果**で確認し正直に報告する。

---

## 7. PR #25 migration の状態 (2026-06-26 適用済)

**PR #25 (`feat(screener): seasonchip + 決算期混同ガード`) の決算期ガード migration = 本番適用済。**

- migration file: `docs/migrations/2026-06-26_screener_fundamentals_last_report_date.sql`
  (PR #25 のブランチ `claude/q4-seasonchip-planner-4rz0s7` の commit `01fc096`。
   `add column if not exists last_report_date text` + 部分 index + service_role GRANT。additive・冪等)。
- ✅ **DONE**: 2026-06-26 に curl (Management API `database/query`) で適用・検証済
  (column `text` / index / service_role GRANT 4 種、すべて実クエリ確認)。
- ⏳ **残り — populate (= PR #25 backend deploy 依存、私の手の外)**:
  - `last_report_date` を書き込む backend コード (PR #25 Sprint 1 `_compute_one` + upsert) は
    **main 未 merge = 本番未 deploy**。今 `canslim-scan` を打っても**旧コードでは populate されない (no-op)**。
  - 正しい順序: **PR #25 を main に merge → 本番 deploy → nightly canslim-scan が populate**
    (migration が先・コードが後 = graceful fallback で安全。逆順厳禁ではないが populate はコード後)。
  - すぐ埋めたい場合は PR #25 deploy 後に `POST /api/cron/canslim-scan` を手動 trigger
    (要 `X-Cron-Secret` + egress に Railway URL 許可。§3-2)。
- migration が先行しても本番は壊れない (backend graceful fallback / 表示 frontend も未 deploy)。

---

## 8. Security notes

- **PAT (`SUPABASE_ACCESS_TOKEN`) はアカウント全体権限**。 漏洩時の blast radius が大きいので
  `.mcp.json` に直書きしない (env 参照のみ)。 token 自体は Environment 設定にのみ置く。
- `--project-ref` スコープで操作対象を 1 project に限定するが、 PAT 自体の権限は縮まらない点に注意。
- 本番 DDL は **hard to reverse**。 additive・冪等な migration 以外は必ず user 承認を取る。
- read-only 監査だけのセッションは `.mcp.json` に `--read-only` を足した別設定を使う。

---

## 9. Troubleshooting

| 症状 | 原因 | 対処 |
|---|---|---|
| `ToolSearch "+supabase"` が 0 件 | `.mcp.json` 未 merge / MCP サーバー未起動 | §5。 main に merge → セッション再起動 |
| tool 呼出が 403 / `CONNECT tunnel failed` | egress で `api.supabase.com` 未許可 | §3。 allowlist 追加 (retry・迂回はしない) |
| **MCP tool が `Failed to execute SQL query` だが curl は 201 で通る** | **MCP routing caveat (下記)** | **既存セッションでは新セッション開始。 急ぐなら curl fallback (下記)** |
| `--project-ref=` が空 | env 変数 `SUPABASE_PROJECT_REF` 未注入 | Environment 設定で env 変数を確認 |
| `permission denied` (service_role) | migration の GRANT 抜け | migration に `grant … to service_role` を追加 (`feedback_supabase_grant_bug.md`) |

### MCP routing caveat (2026-06-26 実測)

egress を**セッション開始後に**開けた場合、その既存セッション内では Supabase MCP tool
(`execute_sql` / `apply_migration`) が `Failed to execute SQL query` で失敗することがある。
一方で **curl は同一 API (`POST /v1/projects/{ref}/database/query`) に 201 で通った**。

- 推定原因: MCP サーバー (node) は egress proxy 越えに HTTPS_PROXY を自動使用しない
  (Node の undici は HTTPS_PROXY を無視。curl は HTTPS_PROXY + CA bundle を読む)。
  egress 反映前に起動した node プロセスがルーティングできていない。
- 第一対処: **egress を開けた状態で新セッションを開始** (MCP サーバーが正しい環境で再起動)。
  → それでも MCP が失敗するなら本当に Node の proxy 非対応 → curl fallback を恒久利用。

### curl fallback (MCP が動かない時の確実な経路・検証済)

MCP `apply_migration` / `execute_sql` は内部的にこの Management API を叩くだけ。 同等:

```bash
# SQL 実行 / DDL 適用 (read も write も同じ endpoint、 201 が成功)
curl -sS -X POST "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"query":"select 1;"}'
```

⚠️ `--data` の SQL は JSON エスケープが要るので、 複数行 SQL は `python3 -c "import json;..."` で
payload を生成して `--data @payload.json` で渡すと安全 (引用崩れ防止)。

proxy 状態の確認: `curl -sS "$HTTPS_PROXY/__agentproxy/status"` → `recentRelayFailures` /
`noProxy` を見る。 詳細は `/root/.ccr/README.md`。
