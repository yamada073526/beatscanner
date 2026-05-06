---
description: 朝の状況確認 — 経済指標 + 注目銘柄 + 本番健全性を 1 画面サマリー
allowed-tools: Bash(curl:*), Bash(grep:*), Bash(python3:*), Bash(date:*)
---

# /morning — 朝のブリーフィング

開発者向け。本番が動いているか + 今日のマーケット文脈 + ウォッチリストの動きを 30 秒で把握する。

注: ユーザー向け Gmail/Slack ToDo 統合の `/morning-todo` (morning-todo plugin) とは別物。本コマンドは beatscanner 開発者専用で、本番運用を頭出しするためのもの。

## サマリー構成

### 1. 本番ヘルス (1 行)
```bash
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" https://beatscanner-production.up.railway.app/health
```

### 2. 今日 / 明日の HIGH 経済指標
```bash
curl -s "https://beatscanner-production.up.railway.app/api/economic-calendar?days=2&impact=high" | \
  python3 -c "
import json, sys, datetime
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

📅 今日/明日の HIGH イベント (3 件):
  2026-05-07 21:30  [US]  CPI YoY  予想: 3.2%
  2026-05-08 03:00  [US]  FOMC 政策金利発表  予想: 5.50%
  ...

📈 急騰 5:
  NVDA  +5.2%  $920.00  NVIDIA Corp
  ...

📉 急落 5:
  TSLA  -3.8%  $185.00  Tesla Inc
  ...

📝 直近コミット:
  837e63a feat(holdings/badge/wl2): Enter保存
  ...

⚠️ 未コミット差分: 2 ファイル
```

イベントが 0 件 / 急騰急落のリストが空などの異常があれば警告を添える。
