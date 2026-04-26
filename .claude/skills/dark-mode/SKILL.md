---
name: dark-mode
description: |
  アプリ全体のダークモード切替を変更する。
  「ダークモードが効かない」「カードの背景が白いまま」「ダーク時のテキスト色を変えて」
  などの指示で呼び出す。
---

# ダークモードスキル（dark-mode）

## アーキテクチャ

### 状態管理
- `App.jsx` の `darkMode` state が正源。`localStorage` キー: `chart_dark_mode`
- `useEffect` で `document.documentElement.setAttribute('data-theme', 'dark'|'light')` を設定
- `ChartTab` には `darkMode` を props で渡す（内部状態は持たない）

### CSS 変数（`frontend/src/index.css`）
```css
:root {
  --bg-primary: #f8fafc;   --bg-card: #ffffff;
  --bg-subtle: #f1f5f9;    --text-primary: #0f172a;
  --border: #e2e8f0;
}
[data-theme="dark"] {
  --bg-primary: #0f172a;   --bg-card: #1e293b;
  --bg-subtle: #1e2a3a;    --text-primary: #f1f5f9;
  --border: #334155;
}
```

### Tailwind クラス上書き
`index.css` の `[data-theme="dark"] .bg-white { ... !important }` ブロックで
主要 Tailwind クラスをダーク色に上書き。追加が必要な場合はこのブロックに追記する。

### lightweight-charts（CandleChart）
CSS 変数が使えないため JS 内でダーク判定。`darkMode` prop を受け取り、
`createChart()` の `layout.background.color` などをハードコードで切り替える。

## 関連ファイル
- `frontend/src/index.css` — CSS変数定義 + Tailwindクラス上書き
- `frontend/src/App.jsx` — darkMode state, toggleDark, useEffect
- `frontend/src/components/ChartTab.jsx` — darkMode prop受取、lightweight-charts設定

## トグルボタン
`App.jsx` ヘッダー右端に配置。`ChartTab` の内部トグルは廃止済み。

## 実装ステップ（新規ダーク対応コンポーネント追加時）
1. コンポーネントが `bg-white` / `text-slate-*` 等の Tailwind クラスを使っているか確認
2. `index.css` の `[data-theme="dark"]` ブロックに追加クラスを上書き
3. CSS変数で直接スタイルする場合は `var(--bg-card)` 等を使用
