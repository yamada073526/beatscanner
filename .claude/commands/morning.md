---
description: 朝の状況確認 — 経済指標 + 注目銘柄 + 本番健全性を 1 画面サマリー
allowed-tools: Bash(curl:*), Bash(grep:*), Bash(python3:*), Bash(date:*), Bash(git:*)
---

# /morning — 朝のブリーフィング

開発者向け。 本番が動いているか + 今日のマーケット文脈 + ウォッチリストの動きを 30 秒で把握する。

注: ユーザー向け Gmail/Slack ToDo 統合の `/morning-todo` (morning-todo plugin) とは別物。 本コマンドは beatscanner 開発者専用で、 本番運用を頭出しするためのもの。

## 関連 docs / command

- 本番 URL: `https://beatscanner-production.up.railway.app/` (CLAUDE.md 冒頭で定義)
- `/health` command — endpoint 別の詳細診断 (本 command はその一部 + マーケット文脈)
- `/release-check` command — リリース前の包括 check (本 command は朝の運用 brief)
- memory `feedback_cost_efficient_operation.md` — handover lazy read SOP (新 session で / morning の後 fetch-handover も活用)

## サマリー構成

### 1. 本番ヘルス (1 行)

```bash
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" https://beatscanner-production.up.railway.app/health
```

期待: HTTP 200 / 短時間応答。 異常なら `/health` command で詳細診断。

### 2. 今日 / 明日の HIGH 経済指標

```bash
curl -s "https://beatscanner-production.up.railway.app/api/economic-calendar?days=2&impact=high" | \
  python3 -c "
import json, sys
d = json.load(sys.stdin)
events = d.get('events', [])
for e in events[:8]:
    date = e.get('date', '')[:16].replace('T', ' ')
    print(f\"  {date}  [{e.get('country')}]  {e.get('event')}  予想:{e.get('estimate') or '-'}\")"
```

### 3. 注目銘柄 (急騰 / 急落 各 5 件)

```bash
curl -s "https://beatscanner-production.up.railway.app/api/movers" | \
  python3 -c "
import json, sys
d = json.load(sys.stdin)
print('  急騰:')
for s in d.get('gainers', [])[:5]:
    print(f\"    {s.get('symbol'):5s}  +{s.get('changesPercentage', 0):.1f}%  \\${s.get('price', 0):.2f}  {s.get('name', '')[:40]}\")
print('  急落:')
for s in d.get('losers', [])[:5]:
    print(f\"    {s.get('symbol'):5s}  {s.get('changesPercentage', 0):.1f}%  \\${s.get('price', 0):.2f}  {s.get('name', '')[:40]}\")"
```

### 4. 直近のコミット (差分把握)

```bash
git log --oneline -5
```

### 5. 未コミット差分の有無

```bash
git status --short | head -10
```

## 出力フォーマット

```
☕ Morning Brief — YYYY-MM-DD HH:MM

✅ Production: 200 0.4s

📅 今日/明日の HIGH イベント:
  YYYY-MM-DD HH:MM  [US]  CPI YoY  予想: 3.2%
  ...

📈 急騰 5:
  XXX  +5.2%  $920.00  XXX Corp
  ...

📉 急落 5:
  YYY  -3.8%  $185.00  YYY Inc
  ...

📝 直近コミット:
  <hash> <commit subject>
  ...

⚠️ 未コミット差分: N ファイル
```

## 注意

- イベントが 0 件 / 急騰急落のリストが空などの異常があれば警告を添える
- 本番 URL は本 command 内で hardcode しているが、 URL 変更時は他 command (`/health` / `/deploy` / `/release-check`) も同時更新が必要
- 各 endpoint の API spec / 上限は `docs/references/api_endpoints.md` および backend 実装が SSOT
- 朝の context warm-up として `/fetch-handover` も併用すると効果的 (`memory/feedback_cost_efficient_operation.md` lazy read SOP)
