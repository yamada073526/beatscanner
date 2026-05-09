# BeatScanner Design System (Canonical Reference)

> **Status**: 不変の真理 (Single Source of Truth) / トークン値はこのファイルから外に書かない
> **このファイルの目的**: 「Aman / Ritz-Carlton ロビー級の驚き・豪華さ」+「Stripe Sigma / Linear Insights 級のデータ体験」を測定可能・再現可能なトークン群として定義する。
> **適用パターン (どう使うか)** は `design_recipes.md`、**機械的 enforcement の whitelist** は `elevation_scale.md` を参照。
> **思想 (5 原則 / Trust Cliff / 投資業界の色ルール / 「じっちゃま」UI 禁止)** は `CLAUDE.md` を参照。

---

## 0. アンカー目標 (測れる定義)

「Aman / Ritz-Carlton ロビー級」を**主観排除**するため 5 基準を定める。新規 PR は満たしているか自己レビュー必須。

| # | 基準 | 数値目標 | 検査方法 |
|---|---|---|---|
| 1 | Hover Ring 強度 | arrival ring α=0.36 → hover ring α=0.60 (light) / arrival 0.50-0.62 → hover 0.75-0.80 (dark) | DevTools で `box-shadow` の最終層 alpha を確認 |
| 2 | Stagger 順次遅延 | 40ms × n、8 件で総 320ms 以内 (delay)、stage 600ms に収まる | リスト入場で 1 件目から 8 件目までの cumulative delay |
| 3 | Font Weight Contrast | Stat fw700 : Label fw500 (visual stress 1.4×) | 同字幅で並べた目視チェック |
| 4 | Line-height 比率 | Stat ≤1.1 : Label ≥1.3 (差 ≥1.18×) | computed line-height |
| 5 | Focus 区別 | Hover = cyan ring、Focus-visible = gold ring + 2px white outer | Tab 操作 vs Mouse 操作で異なる視覚チャンネル |

「Stripe Sigma / Linear Insights 級のデータ体験」は §B-4 (金融データ表示ルール) の遵守が同義とみなす。

---

## 1. Color Tokens

### 1-A. Investment colors (CLAUDE.md「投資業界の色ルール」厳守)

| Token | Light | Dark | 用途 | 禁止用途 |
|---|---|---|---|---|
| `--color-gain` | `#16a34a` | `#34ef81` | 上昇・ポジティブ・PASS・Beat | 中立 / ブランド emphasis |
| `--color-loss` | `#dc2626` | `#f87171` | 下落・ネガティブ・FAIL・Miss | 警告 (amber を使う) |
| `--color-warning` | `#f59e0b` | `#f59e0b` | 決算 D-7/D-3/D-0、緊急、警告 | 上昇 |
| `--color-accent` (cyan) | `rgb(56,189,248)` | `rgb(56,189,248)` | ブランド emphasis、フィルタ active、watchlist、hover ring | **方向性 (上昇/下落) には絶対使わない** |

**Verdict mapping** (Beat/Miss/In-line/Unknown):
- `[Beat]` = `--color-gain`
- `[Miss]` = `--color-loss`
- `[In-line]` = `--text-muted`
- `[Unknown]` = `--text-muted` + `?` icon (信頼破壊回避、§B-4-D 参照)

### 1-B. Surfaces

| Token | Light | Dark |
|---|---|---|
| `--bg-primary` | `#f8fafc` | `#0f172a` |
| `--bg-card` | `#ffffff` | `#1e2433` |
| `--bg-subtle` | `#f1f5f9` | `#1e2a3a` |
| `--bg-muted` | `#e2e8f0` | `#243447` |
| `--bg-hover` | `#f1f5f9` | `#253045` |
| `--text-primary` | `#0f172a` | `#f1f5f9` |
| `--text-secondary` | `#334155` | `#cbd5e1` |
| `--text-muted` | `#64748b` | `#94a3b8` |
| `--border` | `#e2e8f0` | `#334155` |
| `--page-bg` | `#f8fafc` | `#0f172a` |
| `--page-bg-rgb` | `248, 250, 252` | `15, 23, 42` |

### 1-C. Hero / glass

| Token | Light | Dark |
|---|---|---|
| `--hero-bg-start` | `rgba(56,189,248,0.10)` | `rgba(56,189,248,0.06)` |
| `--amber-bg` | `#fffbeb` | `rgba(120,80,0,0.25)` |
| `--amber-title` | `#92400e` | `#fbbf24` |
| `--amber-body` | `#b45309` | `#fcd34d` |

---

## 2. Spacing Scale

`4px` ベースのリニアスケール (Stripe Dashboard 流)。**px / rem の直書き禁止**。

| Token | Value | 主な用途 |
|---|---|---|
| `--space-1` | `4px` | icon gap / dot |
| `--space-2` | `8px` | inline gap / chip padding |
| `--space-3` | `12px` | card inner gutter (small) |
| `--space-4` | `16px` | section gutter (default) |
| `--space-6` | `24px` | card padding / section break |
| `--space-8` | `32px` | hero margin / pane separator |
| `--space-12` | `48px` | hero block vertical |
| `--space-16` | `64px` | page-level vertical |
| `--space-20` *(planned)* | `80px` | hero gutter (judgment Hero 用、UI/UX レビュー追加要望) |

---

## 3. Radius Scale

| Token | Value | 主な用途 |
|---|---|---|
| `--radius-xs` | `4px` | inputs (small)、tag pill |
| `--radius-sm` | `8px` | buttons、badges |
| `--radius-md` | `12px` | **default**: cards、modals、`surface-card` |
| `--radius-lg` | `16px` | large panels、hero card |
| `--radius-xl` | `24px` | hero section、modal sheet |
| `--radius-pill` | `9999px` | chip / avatar |

**ルール**: `surface-card` 系は **必ず `--radius-md`**。Sticky search bar は例外的に `14px` (Apple 方式、§凍結)。

---

## 4. Elevation (Shadow)

Aman 4 階層モデル (天井/壁/床) + cyan glow。**raw `box-shadow` の直書きは禁止**、token のみ参照。許可された生値は `elevation_scale.md` の whitelist にのみ列挙。

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `--shadow-1` | `0 1px 0 rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.04)` | `0 1px 0 rgba(0,0,0,.30), 0 1px 2px rgba(0,0,0,.20)` | 微浮上 (chip / row) |
| `--shadow-2` | `0 2px 4px rgba(0,0,0,.06), 0 4px 8px rgba(0,0,0,.04)` | `0 2px 4px rgba(0,0,0,.40), 0 4px 8px rgba(0,0,0,.24)` | card default |
| `--shadow-3` | `0 4px 12px rgba(0,0,0,.08), 0 12px 24px rgba(0,0,0,.06)` | `0 4px 12px rgba(0,0,0,.50), 0 12px 24px rgba(0,0,0,.30)` | card hover (静的) |
| `--shadow-4` | `0 12px 32px rgba(0,0,0,.12), 0 24px 48px rgba(0,0,0,.08)` | `0 12px 32px rgba(0,0,0,.60), 0 24px 48px rgba(0,0,0,.40)` | modal / popover |
| `--shadow-glow-cyan` | `0 0 0 1px rgba(56,189,248,.20), 0 8px 32px rgba(56,189,248,.12)` | `0 0 0 1px rgba(56,189,248,.30), 0 8px 32px rgba(56,189,248,.20)` | brand emphasis |

### Arrival / Hover Glow Set (specificity 0,3,1 が常に勝つ)

| State | Light box-shadow | Dark box-shadow | translateY |
|---|---|---|---|
| `.is-arriving` (受動) | `0 0 16px rgba(56,189,248,.18), 0 6px 20px rgba(56,189,248,.12), 0 0 0 1px rgba(56,189,248,.36)` | `.panel-card`: `0 0 24px .32, 0 10px 28px .20, 0 0 0 1.5px .62` / `.bs-panel,.surface-card`: `0 0 22px .26, 0 10px 28px .16, 0 0 0 1px .50` | `-3px` |
| `.is-arriving:hover` (能動 > 受動) | `0 0 26px .30, 0 12px 30px .20, 0 0 0 2px .60` | `0 0 32px .38, 0 14px 36px .24, 0 0 0 2px rgba(99,179,237,.80)` | `-5px` |
| `:hover` (能動・arrival 不在) | 同上 (hover 単独) | 同上 + `bg rgba(255,255,255,.06)` | `-5px` |
| `:focus-visible` (kbd) | `0 0 0 2px var(--bg-primary), 0 0 0 4px rgba(245,158,11,.85)` (gold) | 同左 | `0` |

**禁止**: `.is-arriving` を 0,2,0 specificity のまま放置 → `:hover` (0,1,1) が勝てない (v57 教訓)。詳細は recipes §C-2。

---

## 5. Motion

| Token | Value | 用途 |
|---|---|---|
| `--motion-fast` | `120ms` | button ripple、focus ring transition |
| `--motion-base` | `200ms` | hover scale、color shift |
| `--motion-slow` | `360ms` | arrival glow、card lift、tab switch |
| `--motion-stage` | `600ms` | hero 入場、modal sheet、view transition |
| `--motion-stagger` *(planned)* | `40ms` | リスト入場の per-item delay (8 件で総 320ms) |
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | hover、arrival (Linear 標準) |
| `--ease-out-cubic` | `cubic-bezier(0.22, 1, 0.36, 1)` | tab、page transition |
| `--ease-in-out-quad` | `cubic-bezier(0.45, 0, 0.55, 1)` | reversible state |

### 推奨 macro

```css
--transition-arrival: transform var(--motion-slow) var(--ease-out-expo),
                      filter var(--motion-slow) var(--ease-out-expo),
                      box-shadow var(--motion-slow) var(--ease-out-expo),
                      border-color var(--motion-slow) ease;
```

**ルール**: `prefers-reduced-motion: reduce` 環境では transform / animation-duration / transition-duration を 0.01ms に短縮済 (グローバル `@media` で適用)。新規 transform を持つコンポーネントは個別に `transform: none` も適用必須。

---

## 6. Z-Index

| Token | Value |
|---|---|
| `--z-base` | `1` |
| `--z-sticky` | `10` |
| `--z-overlay` | `20` |
| `--z-modal` | `100` |
| `--z-toast` | `1000` |

---

## 7. Typography

### 7-A. Hierarchy

| Tier | Size | Weight | Tracking | Line-height | 用途 |
|---|---|---|---|---|---|
| Display | `28-32px` | 600 | `-0.02em` | `1.1` | Hero 主見出し |
| Heading | `18px` | 500 | `-0.015em` | `1.2` | section 見出し |
| Subsection | `16px` | 500 | `-0.01em` | `1.3` | subsection |
| Body | `14px` | 400 | 0 | `1.5` | 本文 |
| Label small caps | `11px` | 500 | `+0.06em` | `1.4` | KPI label、chip text |
| Mono / Stat | `inherit` | 700 | 0 | `≤1.1` | 数値 stat (大) |

### 7-B. Stat / Label Contrast Rule (測定可能基準 #3, #4)

| Element | Weight | Line-height | Notes |
|---|---|---|---|
| Stat 大 (株価、% 変動、EPS) | **700** | **≤1.1** (推奨 1.05) | 視線誘導の主役 |
| Stat ラベル | 500 | **≥1.3** (推奨 1.4) | 主役を引き立てる余白 |

**禁止**: 日本語表示で `font-weight: 300` 以下。Stat と Label の line-height 比が 1.18 未満 (差別が見えない)。

---

## 8. Token 使用ポリシー

1. **CSS の hex (`#xxxxxx`) 直書き禁止** — `var(--color-*)` 経由で参照。例外は `elevation_scale.md` whitelist。
2. **box-shadow の生値直書き禁止** — `var(--shadow-1..4)` / `var(--shadow-glow-cyan)` / arrival/hover glow set のみ。
3. **px の数値リテラル直書き禁止** — spacing は `var(--space-*)`、radius は `var(--radius-*)`。
4. **!important 使用は 3 用途のみ** — recipes §C-3 参照。新規追加は `elevation_scale.md` の許可リストに同時追加が必須。
5. **新規 token を追加するときは本ファイルを必ず更新** — `index.css` だけ更新は禁止。

---

## 関連ファイル

- `frontend/src/index.css:5-98` — 既存 token 定義 (実装側)
- `frontend/src/index.css:894-1023` — surface-card / is-arriving / hover の正解実装
- `docs/references/design_recipes.md` — 適用パターン (card layering / glow host / shadcn 統合 / staleness UI)
- `docs/references/elevation_scale.md` — whitelist (機械的 enforcement の入力)
- `CLAUDE.md` — 思想 / 触ると危険な箇所 / 投資業界の色ルール
