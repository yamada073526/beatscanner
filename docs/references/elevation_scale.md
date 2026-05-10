# Elevation Scale Whitelist (Machine Enforcement)

> **目的**: hook が grep で参照する「許可された生値」のリスト。design_system.md の token に集約しきれず、CSS 内で生値が残る箇所を**ここに列挙したもののみ許可**する。
> hook 実装時は本ファイルの「ALLOWED:」セクションを正規表現で読み取り、新規 PR で **whitelist 外の生値が追加された** 場合に exit 2 する。

---

## 形式

```
ALLOWED-SHADOW: <value>
ALLOWED-HEX: <#xxxxxx>
ALLOWED-IMPORTANT: <file:line> # <理由>
```

PR で値を追加するときは本ファイルにも 1 行追加。両方が揃っていない PR は hook が落とす。

---

## ALLOWED-SHADOW (token 化されていない生 box-shadow / inset shadow)

design_system.md §4 の token (`--shadow-1..4`, `--shadow-glow-cyan`, arrival/hover glow set) でカバーされない一次的な生値。**新規追加は原則禁止**、追加せず token 化を優先。

```
# Sticky search input (Apple 方式、永久凍結)
ALLOWED-SHADOW: 0 2px 8px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 1.00)
ALLOWED-SHADOW: inset 0 1px 0 rgba(56, 189, 248, 0.12), inset 0 -1px 0 rgba(0, 0, 0, 0.10)

# Floating bottom nav (light)
ALLOWED-SHADOW: 0 8px 24px rgba(0, 0, 0, 0.10)

# Floating bottom nav (dark)
ALLOWED-SHADOW: 0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.06)

# Hover (arrival 不在、bs-panel/surface-card)
ALLOWED-SHADOW: 0 0 22px rgba(56, 189, 248, 0.26), 0 10px 28px rgba(56, 189, 248, 0.18), 0 0 0 2px rgba(56, 189, 248, 0.55)
ALLOWED-SHADOW: 0 0 28px rgba(56, 189, 248, 0.34), 0 12px 32px rgba(56, 189, 248, 0.22), 0 0 0 2px rgba(99, 179, 237, 0.75)

# Panel-card hover (dark)
ALLOWED-SHADOW: 0 0 24px rgba(56,189,248,0.30), 0 10px 28px rgba(56,189,248,0.20), 0 0 0 2px rgba(99, 179, 237, 0.70)

# Arrival (light)
ALLOWED-SHADOW: 0 0 16px rgba(56, 189, 248, 0.18), 0 6px 20px rgba(56, 189, 248, 0.12), 0 0 0 1px rgba(56, 189, 248, 0.36)

# Arrival (dark, panel-card)
ALLOWED-SHADOW: 0 0 24px rgba(56, 189, 248, 0.32), 0 10px 28px rgba(56, 189, 248, 0.20), 0 0 0 1.5px rgba(56, 189, 248, 0.62)

# Arrival (dark, bs-panel/surface-card)
ALLOWED-SHADOW: 0 0 22px rgba(56, 189, 248, 0.26), 0 10px 28px rgba(56, 189, 248, 0.16), 0 0 0 1px rgba(56, 189, 248, 0.50)

# Arrival hover (light)
ALLOWED-SHADOW: 0 0 26px rgba(56, 189, 248, 0.30), 0 12px 30px rgba(56, 189, 248, 0.20), 0 0 0 2px rgba(56, 189, 248, 0.60)

# Arrival hover (dark)
ALLOWED-SHADOW: 0 0 32px rgba(56, 189, 248, 0.38), 0 14px 36px rgba(56, 189, 248, 0.24), 0 0 0 2px rgba(99, 179, 237, 0.80)

# Focus-visible gold ring (kbd)
ALLOWED-SHADOW: 0 0 0 2px var(--bg-primary, #0f172a), 0 0 0 4px rgba(245, 158, 11, 0.85)

# Ticker row expanded inset
ALLOWED-SHADOW: inset 0 0 0 1px rgba(56, 189, 248, 0.28), 0 0 22px rgba(56, 189, 248, 0.18), 0 10px 28px rgba(56, 189, 248, 0.14)

# Hover effect token (--shadow-hover、light)
ALLOWED-SHADOW: 0 16px 40px rgba(0, 0, 0, 0.35)
```

---

## ALLOWED-HEX (token 化されていない生色)

design_system.md §1 の token (`--color-gain` 等) でカバーされない、CSS 内 hex の許可リスト。

```
# 投資業界カラー (light) — token 経由で参照すべきだが、:root 定義行は許可
ALLOWED-HEX: #16a34a   # --color-gain (light)
ALLOWED-HEX: #dc2626   # --color-loss (light)
ALLOWED-HEX: #f59e0b   # --color-warning
ALLOWED-HEX: #34ef81   # --color-gain (dark)
ALLOWED-HEX: #f87171   # --color-loss (dark)
ALLOWED-HEX: #d4af37   # 保有銘柄ゴールドアクセント (ticker-row-v2 / ws-judgment-row)
ALLOWED-HEX: #f4cd5d   # 保有銘柄ゴールドアクセント highlight (gradient mid)

# Surface tokens (light/dark)
ALLOWED-HEX: #f8fafc   # bg-primary (light)
ALLOWED-HEX: #ffffff   # bg-card (light)
ALLOWED-HEX: #f1f5f9   # bg-subtle (light) / bg-hover
ALLOWED-HEX: #e2e8f0   # bg-muted / border (light)
ALLOWED-HEX: #0f172a   # bg-primary (dark) / text-primary (light)
ALLOWED-HEX: #1e2433   # bg-card (dark)
ALLOWED-HEX: #1e2a3a   # bg-subtle (dark)
ALLOWED-HEX: #243447   # bg-muted (dark)
ALLOWED-HEX: #253045   # bg-hover (dark)
ALLOWED-HEX: #334155   # text-secondary (light) / border (dark)
ALLOWED-HEX: #64748b   # text-muted (light)
ALLOWED-HEX: #f1f5f9   # text-primary (dark)
ALLOWED-HEX: #cbd5e1   # text-secondary (dark)
ALLOWED-HEX: #94a3b8   # text-muted (dark)

# NEU block
ALLOWED-HEX: #2d3748   # neu-bg (dark)
ALLOWED-HEX: #e2e8f0   # neu-text (dark) — duplicate of bg-muted, OK

# Amber warning
ALLOWED-HEX: #fffbeb   # amber-bg (light)
ALLOWED-HEX: #92400e   # amber-title (light)
ALLOWED-HEX: #b45309   # amber-body (light)
ALLOWED-HEX: #fbbf24   # amber-title (dark)
ALLOWED-HEX: #fcd34d   # amber-body (dark) / color-border-warning (light)
ALLOWED-HEX: #fefce8   # color-background-warning (light)
ALLOWED-HEX: #78350f   # color-border-warning (dark)

# Earnings urgency
ALLOWED-HEX: #ea580c   # D-3 amber-orange
```

---

## ALLOWED-IMPORTANT (許可された !important 使用箇所)

`design_recipes.md §C-3` の 3 用途のみ。新規追加は本ファイルに 1 行追加が必須。

```
# is-arriving / hover の border-color (inline border-style に勝つため)
ALLOWED-IMPORTANT: frontend/src/index.css:918  # .is-arriving border-color (light)
ALLOWED-IMPORTANT: frontend/src/index.css:928  # .panel-card.is-arriving border-color (dark)
ALLOWED-IMPORTANT: frontend/src/index.css:936  # .bs-panel.is-arriving border-color (dark)
ALLOWED-IMPORTANT: frontend/src/index.css:950  # .is-arriving:hover border-color (light)
ALLOWED-IMPORTANT: frontend/src/index.css:959  # .is-arriving:hover border-color (dark)
ALLOWED-IMPORTANT: frontend/src/index.css:960  # .is-arriving:hover background-color (dark)

# .bs-panel:hover dark mode (Tailwind base override)
ALLOWED-IMPORTANT: frontend/src/index.css:980  # box-shadow (dark hover)
ALLOWED-IMPORTANT: frontend/src/index.css:981  # border-color (dark hover)
ALLOWED-IMPORTANT: frontend/src/index.css:982  # background-color (dark hover)

# .panel-card:hover dark mode
ALLOWED-IMPORTANT: frontend/src/index.css:886  # box-shadow (dark hover)
ALLOWED-IMPORTANT: frontend/src/index.css:887  # background-color (dark hover)

# prefers-reduced-motion
ALLOWED-IMPORTANT: frontend/src/index.css:107  # animation-duration
ALLOWED-IMPORTANT: frontend/src/index.css:108  # animation-iteration-count
ALLOWED-IMPORTANT: frontend/src/index.css:109  # transition-duration
ALLOWED-IMPORTANT: frontend/src/index.css:110  # scroll-behavior
```

**注**: 上記の行番号は v60 時点。リファクタで動いたら本ファイルも同時更新。hook は exact match ではなく selector ベースで検証する実装にしてもよい (将来検討)。

---

## hook / skill 実装

### `pre_edit_design_tokens.sh` (PreToolUse: Edit/Write) ✅ 実装済
- `frontend/src/**/*.{css,jsx,tsx,js,ts}` の Edit/Write を対象
- new_string にあって old_string にない raw hex (`#[0-9a-f]{6}`) を検出
- `ALLOWED-HEX` 未登録なら exit 2 で block
- 3 文字 hex (`#fff` 等) や docs ファイルは対象外
- 設定: `.claude/settings.json` の PreToolUse に登録

### `design-system-check` skill ✅ 実装済
- raw hex / raw box-shadow / 未許可 `!important` / 発光バグ兆候を on-demand 検査
- リリース前手動実行 (`Skill design-system-check`)
- 詳細: `.claude/skills/design-system-check/SKILL.md`

### 設計判断 (実装範囲)
- **box-shadow** の hook 化は値文字列の formatting 揺れで false positive 多発のため見送り (skill による on-demand 検査で代替)
- **`!important` 増殖警告** も skill で代替 (PostToolUse 毎の警告は noise)
- Hook で block するのは **最も drift しやすい raw hex のみ**。残りは skill による定期検査でカバー

---

## 関連

- `design_system.md` — token 定義 (上流)
- `design_recipes.md §C-3 / §C-4` — !important / 禁止パターン
- `.claude/hooks/pre_edit_trust_cliff.sh` — hook の参照実装パターン
