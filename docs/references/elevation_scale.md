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

# §round18 ws-shadow-row-hover (light) — Pane 4 row hover の 4 層 shadow (近 + 遠 + ring + inset top highlight)
ALLOWED-SHADOW: 0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 28px -8px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(56, 189, 248, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.04)

# §round18 ws-shadow-row-hover (dark) — round 20 で cyan glow 強化
ALLOWED-SHADOW: 0 1px 2px rgba(0, 0, 0, 0.40), 0 14px 32px -8px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(56, 189, 248, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.04)
ALLOWED-SHADOW: 0 0 0 1px rgba(56, 189, 248, 0.50), 0 0 18px rgba(56, 189, 248, 0.18), 0 12px 28px -8px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.05)
ALLOWED-SHADOW: 0 0 0 1px rgba(56, 189, 248, 0.55), 0 0 12px rgba(56, 189, 248, 0.20), 0 1px 3px -1px rgba(0, 0, 0, 0.55)

# §round18 ws-shadow-row-active (light)
ALLOWED-SHADOW: 0 1px 3px -1px rgba(15, 23, 42, 0.20), 0 0 0 1px rgba(56, 189, 248, 0.30)

# §round18 ws-shadow-row-active (dark)
ALLOWED-SHADOW: 0 1px 3px -1px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(56, 189, 248, 0.32)

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

# EarningsRing glow (light) — v86 R3 三層 halo (vision motion_timing 62 → 75+ 狙い、 内 12px + 中 28px + 外 48px)
ALLOWED-SHADOW: 0 0 12px rgba(56, 189, 248, 0.20), 0 0 28px rgba(56, 189, 248, 0.32), 0 0 48px rgba(56, 189, 248, 0.14)

# EarningsRing glow (dark) — v86 R3 三層 halo (内 14px + 中 32px + 外 56px、 dark 背景 contrast 強化)
ALLOWED-SHADOW: 0 0 14px rgba(56, 189, 248, 0.26), 0 0 32px rgba(56, 189, 248, 0.42), 0 0 56px rgba(56, 189, 248, 0.18)

# Hero LIVE pulse dot (v86 R3、 static frame motion proxy)
ALLOWED-SHADOW: 0 0 0 4px rgba(56, 189, 248, 0.18), 0 0 12px rgba(56, 189, 248, 0.36)
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
ALLOWED-HEX: #0ea5e9   # --color-accent (light) — lightweight-charts palette neutral 系 (PortfolioHistoryChart / PortfolioAreaChartSlot)
ALLOWED-HEX: #38bdf8   # --color-accent (dark) — lightweight-charts palette neutral 系 (PortfolioHistoryChart / PortfolioAreaChartSlot)
ALLOWED-HEX: #d4af37   # 保有銘柄ゴールドアクセント + --color-gold (Aman 真鍮 base、 SectionHeader gold hairline / verdict gold foil)
ALLOWED-HEX: #f4cd5d   # 保有銘柄ゴールドアクセント highlight + --color-gold-mid (gradient mid)
ALLOWED-HEX: #c8952c   # --color-gold-dark (verdict gold foil gradient end、 古銅 / antique brass)
ALLOWED-HEX: #a78bfa   # --color-overlay-sma-200 (Cup-Handle Phase 1、 200DMA purple)
ALLOWED-HEX: #22c55e   # --color-overlay-rs (light、 RS chip) + ChartTab CandlestickSeries upColor
ALLOWED-HEX: #ef4444   # ChartTab CandlestickSeries downColor (既存 hardcode、 elevation_scale 漏れ追加)

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

# EarningsHistoryChart grouped bars — Sprint A (Phase 1.5)
ALLOWED-HEX: #0d9488   # teal-600 — EPS bar (grouped bars 中央列。SPS=cyan / EPS=teal / CFPS=slate tone)

# AccordionSection badge chip tokens — v100 hotfix (ConferenceAnalysis raw hex 解消)
# cyan (--color-accent) は「ブランド色」専用なので、 AI/PRO badge は意味分離のため別 hex を割当
ALLOWED-HEX: #2563eb   # --badge-ai-bg (AI分析 chip、 blue-600、 cyan brand と区別)
ALLOWED-HEX: #0e7490   # --badge-pro-bg (PRO tier chip、 teal-700、 cyan brand と区別)

# OGP SVG template (build-time only、 React バンドル非含有) — CSS var() が使えない SVG 属性空間での許可
# SVG は xml attribute で色を指定するため CSS token を直接参照できない。
# brand accent の 4B9EFF は design_system.md の --color-accent (brand cyan) の OGP 用近似値。
# 090E1A / 0D1526 はダークキャンバス背景 (0f172a 系の更に深いネイビー、OGP 専用)。
ALLOWED-HEX: #4b9eff   # OGP SVG template brand cyan (SVG attribute 専用、 React bundle 非含有)
ALLOWED-HEX: #090e1a   # OGP SVG dark canvas base (OGP 専用ダークネイビー、 React bundle 非含有)
ALLOWED-HEX: #0d1526   # OGP SVG dark canvas gradient end (OGP 専用、 React bundle 非含有)
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

# Phase 2 Sprint 3: 3 tier glow grammar (.verdict-hero / .tier-m-glow / .tier-l-glow)
# compound 4 セット (.X.is-arriving:hover) で border-color / background-color
# / box-shadow を inline / tailwind base に勝つため
ALLOWED-IMPORTANT: frontend/src/index.css  # .verdict-hero.is-arriving:hover border-color (light/dark)
ALLOWED-IMPORTANT: frontend/src/index.css  # .verdict-hero.is-arriving:hover background-color (dark)
ALLOWED-IMPORTANT: frontend/src/index.css  # .verdict-hero.is-arriving:hover box-shadow (light/dark)
ALLOWED-IMPORTANT: frontend/src/index.css  # .tier-m-glow halo sweep border (light/dark)
ALLOWED-IMPORTANT: frontend/src/index.css  # .tier-l-glow hover hairline border (light/dark)
ALLOWED-IMPORTANT: frontend/src/index.css  # prefers-reduced-motion animation-duration override
ALLOWED-IMPORTANT: frontend/src/index.css  # prefers-reduced-motion transition-duration override
ALLOWED-IMPORTANT: frontend/src/index.css  # prefers-reduced-motion scroll-behavior override
ALLOWED-IMPORTANT: frontend/src/index.css  # prefers-reduced-motion .tier-m-glow animation: none

# prefers-reduced-motion — a11y AAA (Vercel Geist / Linear / Stripe 標準パターン)
# Sprint 0 (Phase 2 前提整備) で確認済。index.css §11-E v51 Phase 1 から既存の宣言。
# prefers-reduced-motion: reduce が設定された際に全 animation / transition を 0.01ms に縮退する。
ALLOWED-IMPORTANT: frontend/src/index.css:107  # animation-duration (0.01ms 縮退)
ALLOWED-IMPORTANT: frontend/src/index.css:108  # animation-iteration-count (1 回のみ)
ALLOWED-IMPORTANT: frontend/src/index.css:109  # transition-duration (0.01ms 縮退)
ALLOWED-IMPORTANT: frontend/src/index.css:110  # scroll-behavior (auto 固定)
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

---

## ALLOWED-CHIP (round 7 追加)

Chip primitive 違反検査 (design-system-check skill §4) の whitelist。
`<Chip>` primitive ([components/ui/Chip.jsx](../../frontend/src/components/ui/Chip.jsx)) を経由しない `.ds-chip` 直書きを許可する例外を列挙する。

通常は **空であるべき** (全 chip は primitive 経由が原則)。
やむを得ず inline chip を書く場合は、その都度 PR で議論 + 本リストに追加 + 理由コメント。

```
# ALLOWED-CHIP: <file:line>  # 理由
(現在: 空)
```

## ALLOWED-PLUS-ICON (round 8 追加)

lucide-react `Plus` icon は原則 `<Chip variant="add">` 経由で使う (add-action SSOT)。
add 用途以外で Plus icon を使う場合の例外を列挙する。

```
# ALLOWED-PLUS-ICON: <file:line>  # 理由
(現在: 空)
```

---

## 関連

- `design_system.md` — token 定義 (上流)
- `design_recipes.md §C-3 / §C-4` — !important / 禁止パターン
- `.claude/hooks/pre_edit_trust_cliff.sh` — hook の参照実装パターン
- `memory/chip_primitive_canonical.md` — Chip primitive SSOT (round 7)
