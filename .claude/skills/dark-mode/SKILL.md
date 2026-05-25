---
name: dark-mode
description: |
  アプリ全体のダークモード切替を変更する。
  「ダークモードが効かない」「カードの背景が白いまま」「ダーク時のテキスト色を変えて」
  などの指示で呼び出す。
---

# ダークモードスキル

`document.documentElement[data-theme]` 属性で全体のテーマを切り替える機能の SSOT。 CSS 変数による semantic token + 一部 Tailwind class 上書きで実現。

## 依存

- `frontend/src/App.jsx` — `darkMode` state (正源) + `toggleDark` + `useEffect` で `data-theme` 属性 set
- `frontend/src/index.css` — `:root` (light) / `[data-theme="dark"]` (dark) の CSS 変数定義 + Tailwind class 上書きブロック
- `frontend/src/components/ChartTab.jsx` — `darkMode` prop 受取 (lightweight-charts CSS 変数非対応のため)
- `docs/references/design_system.md` — 色 token (--color-* / --bg-* / --text-*) の SSOT
- skill `chart-tab` — lightweight-charts 統合 (CSS 変数非対応の hex 切替)
- skill `designing-workspace-ui` — 新規 component 追加時の dark 対応規律

## アーキテクチャ

### state 管理

- **正源**: `App.jsx` の `darkMode` state
- **永続化**: localStorage (key は `App.jsx` で定義、 skill にベタ書きしない)
- **DOM 反映**: `useEffect` で `document.documentElement.setAttribute('data-theme', 'dark' | 'light')`
- **子 component への伝達**: prop drilling (lightweight-charts 等 CSS 変数非対応のもののみ)
- **トグルボタン**: `App.jsx` ヘッダー右端 (他コンポーネント内の重複 toggle は廃止済)

### CSS 変数 (`frontend/src/index.css`)

```
:root              { --bg-primary / --bg-card / --text-primary / --border ... }
[data-theme="dark"] { --bg-primary / --bg-card / --text-primary / --border ... }
```

**実際の hex 値は `frontend/src/index.css` の `:root` / `[data-theme="dark"]` ブロックが SSOT** (skill に値をコピーしない、 design token 更新で stale 化するため)。 新規 token 追加は `docs/references/design_system.md` と同期。

### Tailwind class 上書き (`index.css`)

`[data-theme="dark"] .bg-white { ... }` 形式で主要 Tailwind class をダーク色に上書き。 `!important` を使う場合は `docs/references/elevation_scale.md` の `ALLOWED-IMPORTANT:` whitelist に登録必須 (`design-system-check` skill で BLOCK される)。

### lightweight-charts (CSS 変数非対応)

`darkMode` prop を受け取り、 `createChart()` の `layout.background.color` 等を JS で hex 直接切替。 hex 値は CSS 変数と同じ値を使うが、 lightweight-charts API 制約で参照不可。 詳細は `chart-tab` skill 参照。

## 新規ダーク対応コンポーネント追加時の手順

1. component が `bg-white` / `text-slate-*` 等 light 前提の Tailwind class を使っているか確認
2. 該当 class を `index.css` の `[data-theme="dark"]` ブロックに上書き追加 (既存 token を再利用)
3. 直接 styling する場合は `var(--bg-card)` 等の CSS 変数を使用 (生 hex 禁止)
4. `design-system-check` skill で raw hex / unauthorized `!important` がないか機械検査
5. 実機で light / dark トグルして両モードの可読性確認

## 注意

- 「ダークモードで card が白いまま」 系の bug は **`!important` 抜け / dark block の class 追加漏れ** が大半
- `lightweight-charts` 関連の dark 不具合は CSS 変数では直せない (JS hex 直接設定が必要)
- 過去に「dark 時 text が見えない」 bug 多発 → 新 component 追加時は **必ず両モード dogfood**
