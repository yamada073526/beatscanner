# BeatScanner Design Recipes (適用パターン集)

> **目的**: `design_system.md` のトークンを「どう組み合わせて何を作るか」のレシピ集。
> v54-v59 の 6 セッションを溶かした「発光バグ」を再発させないための運用ルールが核。
> 新規コンポーネントを書くときは、まず該当する recipe を読んでから実装する。

---

## C-1. Glow Host & Border-Radius Ownership (v59 教訓)

**問題の歴史**: v58 で `surface-card` を ChartTab の root に付けたら、内側の `wl-list-frame` の border-radius と arrival ring の半径が一致せず「二重枠 + フチ消失」が発生 → v59 で `surface-card` を `wl-list-frame` に移動して解決。

### ルール

1. **`surface-card` は最深の border-radius を持つ要素にのみ適用**。タブ root、レイアウト wrapper には絶対付けない。
2. **入れ子の `surface-card` 禁止**。二重 ring + 半径不一致が発生する。
3. **arrival glow 候補要素 (`.is-arriving` を持ちうるもの) は自分の border-radius を所有**。親が `border-radius` を持っているなら、子は `border-radius: 0` か inherit にする。
4. **`overflow: hidden` を glow host に置かない** → ring がクリップされる。
5. **`contain: paint` を glow host に置かない** → box-shadow が要素境界でクリップされる (v54 教訓)。

### 安全な並べ方

```jsx
<section className="bs-panel">           {/* glow host: border-radius: 12px */}
  <header>...</header>                    {/* 子: border-radius なし */}
  <ul className="watchlist-rows">         {/* 子: 親の rounded を超えない */}
    <li className="ticker-row-v2">...</li>
  </ul>
</section>
```

### 危険な並べ方

```jsx
<div className="surface-card">            {/* 親 glow host */}
  <div className="bs-panel">              {/* ❌ 子も glow host = 二重 ring */}
    ...
  </div>
</div>
```

---

## C-2. Specificity Ladder (v57 教訓)

**問題**: `.is-arriving` (specificity 0,2,0) の状態で `:hover` (0,1,1) が発火しても、後勝ち順序により arrival のスタイルが残り、hover が「強発光に切り替わらない」。

### ルール

- `.is-arriving` を持つ全クラスについて、**compound selector で hover を併設**: `.panel-card.is-arriving:hover`、`.bs-panel.is-arriving:hover`、`.surface-card.is-arriving:hover` (specificity 0,3,1 → 0,2,0 を超える)。
- 範囲: `.panel-card / .bs-panel / .surface-card` の 3 つすべて。dark mode 用も同様に `[data-theme="dark"]` 接頭で同じ compound を書く。
- 新しい card-like クラスを追加するときは **必ず compound 4 つセット** (light arrival / light arrival:hover / dark arrival / dark arrival:hover)。

### 実装サンプル

```css
/* 受動 (scroll) */
.panel-card.is-arriving { box-shadow: arrival-set; transform: translateY(-3px); }

/* 能動 (mouse) > 受動 — specificity 0,3,1 */
.panel-card.is-arriving:hover { box-shadow: hover-set; transform: translateY(-5px); }

/* dark も両方必要 */
[data-theme="dark"] .panel-card.is-arriving { ... }
[data-theme="dark"] .panel-card.is-arriving:hover { ... }
```

---

## C-3. !important Policy (3 用途のみ許可)

`!important` は禁止ではないが、**用途を限定**しないと specificity 戦争に陥る。

### 許可用途

1. **dark mode で Tailwind base や inline style を上書きするとき** (例: `[data-theme="dark"] .bg-white { ... !important }`)
2. **`.is-arriving` / `:hover` の `border-color`** — HomeTab L156 のような inline `style="border:..."` に勝つため
3. **inline 競合解消の最終手段** — 他に手がない時のみ

### 禁止

- 新規 CSS で specificity 不足を雑に解決するために使う
- `!important` を持つ rule を、別の `!important` で上書きしようとする (specificity hack の連鎖)
- token 違反 (raw hex / raw shadow) の延命

### Enforcement

新規追加箇所は `elevation_scale.md` の `!important` 許可リストに同時記載 (hook が grep で照合)。

---

## C-4. 禁止パターン (再発防止)

| 禁止 | 理由 / 教訓 |
|---|---|
| `contain: paint` を `.panel-card / .bs-panel / .surface-card` に付与 | box-shadow が要素境界でクリップ → arrival glow が消える (v54) |
| `:has(.surface-card.is-arriving)` で親を抑制 | 多階層 DOM で意図しない祖先を黙らせる (v54)。leaf 判定は `useArrivalSpotlight` (JS) に集約済 |
| `overflow: hidden` を glow host に付与 | ring クリップ |
| 新規 raw hex (`#34ef81` 等) を CSS / JSX style に直書き | token を経由しない → セッション間で値が drift |
| 新規 raw shadow (`box-shadow: 0 8px 24px ...`) を直書き | elevation scale を破る |
| `.is-arriving` を 0,2,0 のまま `:hover` を 0,1,1 で書く | hover が arrival に負ける (v57) |
| 入れ子 `surface-card` | 二重 ring (v58) |

---

## C-5. shadcn/ui Hybrid 統合ルール

v60 で 7 体合意済の方針: **新規機能のみ shadcn/ui primitive 採用、既存独自 CSS は永続保護**。

### ルール

1. **新規機能 (`features/judgment/` 等) で shadcn/ui Dialog / Select / Checkbox / Tooltip / Tabs を採用**。生 Tailwind で内製しない。
2. **shadcn primitive を `surface-card / bs-panel / panel-card` の中に入れるとき、shadcn 側の border-radius を 0 か親 inherit にする** (二重 rounded 防止)。
3. **Tailwind utility (`bg-slate-700` / `text-slate-100` 等) を shadcn コンポーネントに直書きしない**。token 経由のラッパー component を必ず作る:

```jsx
// ❌ 禁止
<Dialog className="bg-white dark:bg-slate-800 rounded-lg" />

// ✅ token 経由
<Dialog className="ds-modal" />  // .ds-modal { background: var(--bg-card); border-radius: var(--radius-md); }
```

4. **focus ring は cyan 2px outline で統一**。shadcn デフォルトの focus-visible は上書きする。
5. **shadcn コンポーネントの色は dark mode 対応必須**。light/dark 両方で動作確認してから merge。

---

## C-6. Sticky Search Bar Anatomy (永久凍結)

8 回の試行錯誤の末に到達した Apple/Linear 方式。**変更禁止** (CLAUDE.md「触ると危険な箇所」と同義)。

### 確定仕様

```css
.sticky-search-band {
  background: rgba(var(--page-bg-rgb), 0.72);          /* 72% 透過 */
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-bottom: none;                                  /* light は border 不要 */
}
[data-theme="dark"] .sticky-search-band {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);  /* dark のみ極薄 1px */
}
```

### 触ってはいけない理由

- backdrop-filter の fade 境界は要素端で必ず切れる → CSS で消そうとすると別の問題が発生
- Apple / Linear / Stripe Dashboard が全社採用している「1px border で意図的に区切る」設計
- input は `border-radius: 14px` (`--radius-md` ではない例外)

---

## C-7. Modern Pattern Mandate

新規機能で**標準採用**する現代的パターン。

| パターン | 実装 | 適用先 |
|---|---|---|
| View Transitions API | `document.startViewTransition(() => setState())` | tab 切替、result reveal、判定タブ Detail 入場 |
| Optimistic UI | `.is-pending` (lighter ring 50%) で楽観 commit | watchlist 追加、portfolio 編集 |
| Skeleton hierarchy | `.skel-stat-lg / .skel-stat / .skel-badge / .skel-card` (汎用 placeholder 禁止) | 各データ型ごとに skeleton 定義 |
| Focus-visible 必須 | gold 4px ring (kbd 専用、§7 参照) | 全 interactive element |
| `prefers-reduced-motion` 個別対応 | グローバル @media に加え、新規 transform 持ち component で `transform: none` を明示 | 全 hover / arrival / animation |
| Dark mode token parity | 全色 token に `[data-theme="dark"]` override | 新規追加 token は light/dark 同時定義 |

---

## C-8. Freshness / Staleness UI

「最終更新 X 分前」の rendering policy。CLAUDE.md 既存ルールを具体化。

### Time format

```js
const ms = epoch < 1e12 ? epoch * 1000 : epoch;
```

60 秒の `setInterval` で再描画。

### Staleness threshold

| 経過時間 | 表示 | opacity / icon |
|---|---|---|
| < 5 min | "最終更新 X 分前" | 100% (full bright) |
| 5-60 min | 同上 | 100% |
| 60min - 4h (市場時間) | "最終更新 X 時間前" | 70%、subtext muted |
| > 4h (off-hours) | "更新待ち" + clock icon | 50%、gray-out + icon |

### 決算日跨ぎ

- T-8 〜 T-1: "決算 X 日前" (amber、forecast チャート OK)
- T-0 (earnings day): forecast estimate を gray out、actual EPS が出たら緑系で表示
- T+1: verdict lock (Beat/Miss/In-line/Unknown)、actual vs estimate を side-by-side
- AH (after-hours) 報告は "AH 報告" badge を muted で添える

---

## C-9. 数値表示 (Numeric Format)

`design_system.md §B-4` を実装側でどう書くかのレシピ。

### 必ず守る順序

1. 通貨記号 → 値 → 単位 → 時間窓
2. ゼロは `+0.0%` (空白禁止)、欠損は `—` (em dash、`N/A` 禁止)
3. 正は必ず先頭 `+`、負は `−` (en-dash 禁止、minus sign を使う)
4. % リターン (1 桁) には**必ず時間窓を suffix** (`+8.5% YTD`)。bare `%` 禁止。

### 例

| 種別 | 良い | 悪い |
|---|---|---|
| % リターン | `+8.5% YTD` | `+8.5%`, `8.5%` |
| EPS Beat | `+0.50 (+12.5%)` | `+12.5%` (基準値小だと暴れる) |
| 株価 | `$145.67` | `145.67` |
| 出来高 | `45.2M` | `45,234,567` |
| 時価総額 | `$2.4B` | `$2,400,000,000` |

### Beat/Miss/Unknown UI

- 実績あり・予想欠損 → `[Miss]` 出さない (信頼破壊)。`[Unknown]` chip + `?` icon、tooltip「予想は更新待ち」、actual EPS を緑系で並列表示
- 実績 = 予想 (±3% 以内) → `[In-line]` muted gray
- abs(est) < 0.05 のときは Beat 量を `+$0.07` (絶対値) で表示、% は出さない (基準値小で暴れる)

---

## C-10. Section Header / Card / Stat Pattern

判定タブ Detail 等の大量セクションを書くときの統一パターン。

```jsx
<section className="bs-panel" aria-labelledby="sec-{id}">
  {/* SectionHeader */}
  <header className="ds-section-header">
    <h2 id="sec-{id}" className="ds-heading">節タイトル</h2>
    <span className="ds-label">SUB / META</span>
  </header>

  {/* KpiStrip */}
  <div className="ds-kpi-strip">
    <Stat value="$145.67" label="現在値" trend="up" />
    <Stat value="+8.5% YTD" label="リターン" trend="up" />
    <Stat value="—" label="EPS Beat" verdict="unknown" />
  </div>

  {/* Body */}
  <div className="ds-section-body">...</div>
</section>
```

**Stat component** は次を必ず満たす:
- 値: fw700 / line-height ≤1.1
- ラベル: fw500 / line-height ≥1.3
- trend: `up` = `--color-gain`、`down` = `--color-loss`、`neutral` = `--text-muted`
- verdict: `beat / miss / in-line / unknown` を chip で表示 (色は §1-A)

---

## 関連ファイル

- `design_system.md` — トークン値の Single Source of Truth
- `elevation_scale.md` — 機械的 enforcement の whitelist
- `frontend/src/index.css:894-1024` — surface-card / is-arriving / hover の正解実装
- `frontend/src/components/ChartTab.jsx:962-1014` — v59 修正 (surface-card → wl-list-frame)
- `frontend/src/components/PortfolioDashboard.jsx` — TWR + SPY indexed=100 の参照実装
- `handover_2026-05-09_v60.md` §5-1 — 発光バグ post-mortem 生情報
