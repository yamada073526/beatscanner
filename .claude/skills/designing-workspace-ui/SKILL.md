---
name: designing-workspace-ui
description: |
  BeatScanner の workspace UI (Pane 1-N / features/workspace / 既存 components) を編集する際に、
  デザイン SSOT (design_system.md / design_recipes.md / elevation_scale.md) を経由しない変更を防ぐスキル。
  「Pane を変えたい」「ペインに機能を追加したい」「色を変えたい」「余白を変えたい」「角丸を変えたい」
  「コンポーネントを作りたい」「workspace のレイアウトを調整したい」「フォームを追加したい」
  と依頼された際に使用する。 次の場合は使用しない: design SSOT を触らない typo 修正 / README 編集 /
  test code のみ修正 / 依存パッケージ更新。
---

# designing-workspace-ui スキル

BeatScanner の workspace UI を編集する際の **デザイン規律強制 skill**。 ブランド世界観 (Aman/Ritz-Carlton 級) と 5 原則 を満たしつつ、 v54-v59 で 6 セッション溶けた発光バグや Trust Cliff の再発を防ぐ。

## 依存

- CLAUDE.md「設計思想」 (ブランド世界観 + 5 原則) / 「触ると危険な箇所」 / 「投資業界の色ルール」 / 「動的データには『最終更新 X 分前』を併記」
- `docs/references/design_system.md` — token (色 / spacing / radius / elevation / motion) の Single Source of Truth
- `docs/references/design_recipes.md` — 適用パターン (card layering / glow host / shadcn 統合 / staleness UI / 数値表示)
- `docs/references/elevation_scale.md` — 機械的 enforcement (raw hex / shadow / !important whitelist)
- `frontend/src/index.css` — Tailwind v3 + `:root` CSS 変数の実装
- `frontend/src/components/ui/` — primitive 群 (`Chip.jsx` / `ProTeaser.jsx` / `TickerBadge.jsx`)
- `frontend/src/features/workspace/` — workspace mode の Pane 実装
- `frontend/tailwind.config.js` — Tailwind v3 設定 (v4 `@theme` ではない)
- memory `glow_elevation_postmortem.md` — 発光バグ root cause + 症状別 quick reference
- memory `workspace_path_map.md` — workspace 化後の component path 移行マップ
- memory `chip_primitive_canonical.md` — chip 系 UI の SSOT
- memory `css_specificity_gotchas.md` — `.is-arriving` (0,2,0) vs `:hover` (0,1,1) compound 解
- memory `feedback_brand_aspiration.md` — Aman/Ritz-Carlton 級世界観 anchor
- skill `design-system-check` — 機械検査 (raw hex / shadow / !important / 発光バグ兆候)
- skill `dark-mode` / `chart-tab` / `stock-chart` / `screener` / `earnings-calendar` 等 — 個別 UI 領域の SSOT

## いつ呼び出すか

- workspace mode の Pane (Pane 1-N) を編集する前
- 新規 component を `frontend/src/components/` または `frontend/src/features/` に追加する前
- 既存 component の色 / 余白 / 角丸 / shadow / typography を変える前
- `frontend/src/index.css` の `:root` 変数 / utility class / pattern (`.panel-card` / `.bs-panel` / `.surface-card`) を変える前
- レイアウト (grid / flex 構成) を変える前
- 「ちょっと見た目を整えたい」 要望に対する proactive 提案

## 使ってはいけない場合

- design SSOT (`docs/references/design_*.md` / `elevation_scale.md`) を触らない typo / 文言修正
- test code のみ修正
- 依存パッケージ更新 / lint 修正
- README / `docs/` のドキュメント編集のみ

## コード生成の禁止事項

CLAUDE.md と既存 memory で確立された禁止 pattern。 違反は即 design-system-check で BLOCK される。

| 禁止 | 正しい方法 | 根拠 |
|---|---|---|
| 生 hex 色 (`#RRGGBB`) | `var(--color-gain)` 等の semantic CSS 変数 | `docs/references/design_system.md` token / `elevation_scale.md` whitelist |
| 生 box-shadow | `var(--shadow-*)` 変数 | `docs/references/design_system.md` elevation |
| `!important` の新規追加 | semantic token + 親管理 / specificity 解消 | `docs/references/elevation_scale.md` の `ALLOWED-IMPORTANT:` whitelist のみ可 |
| 「上昇」 をシアン色 | 緑 (`var(--color-gain)`)、 シアンはブランド色 | CLAUDE.md「投資業界の色ルール」 |
| `space-y-*` / `space-x-*` | `flex flex-col gap-*` / `flex gap-*` | 子要素が条件で消えると余白崩れ |
| `className` で色 / フォントサイズ / フォントウェイトを上書き | semantic token + 親 component 側の variant 追加 | コピペ蔓延でダークモード対応漏れ |
| 自前 div で chip / badge / separator | `frontend/src/components/ui/Chip.jsx` 等の primitive | a11y + ダークモード + テーマ連動が組み込み済 (`memory/chip_primitive_canonical.md`) |
| 新規 `.panel-card` / `.bs-panel` / `.surface-card` 系 class 追加 | 既存 pattern を `design_recipes.md §C-1〜C-4` の compound rule で適用 | 6 セッション溶けた発光バグの再発リスク |
| `contain: paint` を glow host に | 禁止 (発光が clip される) | `memory/glow_elevation_postmortem.md` |
| `:has(.is-arriving)` 親抑制 | 禁止 (v54 で削除済) | `memory/glow_elevation_postmortem.md` |
| `.X.is-arriving:hover` の compound 4 セット不足 | 必ず 4 セット (`.X`, `.X:hover`, `.X.is-arriving`, `.X.is-arriving:hover`) を揃える | `memory/css_specificity_gotchas.md` |

## SSoT エスカレーション規律

**design SSOT を経由しない UI 変更は禁止**。 既存 SSOT で作れないものが出てきたら、 以下の 4 分岐で診断し、 必ず user に確認。

### 作業前の確認 (必ず実行)

以下のチェックリストを応答にそのまま含め、 各項目を完了したら `[x]` に置き換える:

```
SSoT 把握:
- [ ] docs/references/design_system.md を読み、 既存 token を列挙した
- [ ] frontend/src/index.css を grep し、 既存 utility class / pattern を列挙した
- [ ] frontend/src/components/ui/ を ls し、 利用可能な primitive を列挙した
- [ ] memory/glow_elevation_postmortem.md を読了 (card 系 / 発光系を触る場合)
- [ ] CLAUDE.md「触ると危険な箇所」 を読了
```

このチェックが全て埋まる前にコード生成を開始してはならない。

### 4 分岐の決定木

既存 SSoT で作れる → そのまま実装。 作れない → 以下に進む。 **いずれの分岐でも、 user の判断なしに実装に進んではならない。**

#### 3a. トークンの穴

色 / 余白 / 角丸 / 影 / フォント等の値が既存 token で足りない。

- やる: 何が足りないかを 1 行で説明 → `design_system.md` への追加案 + `elevation_scale.md` whitelist 追加案を提示 → user の判断を仰ぐ
- やらない: 生 hex の使用 / 「一時的に hardcoded」 仮対応 / user に聞かず `:root` を変更

#### 3b. 部品の穴

既存 primitive (`Chip` / `ProTeaser` / `TickerBadge` 等) で表現できない形 / variant が必要。

- やる: 既存 primitive の variant / size で代替できないか先に試す → 不可能なら新 variant または新 primitive を起案 → user の判断を仰ぐ
- やらない: primitive ファイルを fork コピー / 呼び出し側で className 上書きで済ませる

#### 3c. パターンの穴

レイアウトパターン / 複数 component の組み合わせ規則 / 状態 (empty / error / loading / staleness) の規律がない。

- やる: `design_recipes.md` を読み、 本当に規律がないことを確認 → 規律案を起案 → user の判断を仰ぐ
- やらない: 「とりあえず置いてみる」 で恒久パターン既成事実化

#### 3d. 情報設計の穴

Pane に何を載せるか / 並び順 / 情報の増減の規律がない。

- やる: **コードを書かない**。 何を載せるか / 優先順位 / 並び順を質問する → user が決めてから実装
- やらない: 「投資アプリならこれが普通」 と独断で情報を足す / 削る / 並び替える

### エスカレーションのテンプレート

```
[診断]
何が足りない: <1 行説明>
分岐: 3a / 3b / 3c / 3d のどれか

[根拠]
design_system.md §X / design_recipes.md §Y / elevation_scale.md / memory anchor の <根拠>

[提案]
案 1: <内容>(メリット / デメリット)
案 2: <内容>(メリット / デメリット)

[ユーザーへの質問]
どちらで進めますか？ 別案ありますか？
```

## Pane 責務分離 (workspace mode)

Pane 構成と各 Pane の責務は `memory/workspace_path_map.md` および `docs/references/design_recipes.md` が SSOT。 個別 Pane の機能変更時は対応 skill を呼ぶ:

- Pane 2 (注目銘柄系) → `screener` skill
- Pane 3 (主、 銘柄詳細 / 判定) → 該当 domain skill (`stock-chart` / `chart-tab` / `summary-text` / `hallucination-guard` 等)
- Pane 4 (補助情報) → 該当 domain skill
- 経済カレンダー Pane → `earnings-calendar` skill

「Pane の責務を変えたい」「Pane を増やしたい」 等の大改修は **`multi-review` skill で 6 体合議** を経て decide。

## 角丸 (border-radius) の階層ルール

`rounded-*` / `border-radius` の選択に迷ったとき:

1. **親 R ≧ 子 R** — 親の箱に当てた R より大きな R を子に付けない
2. **同格の島は同じ R** — `panel-card` で囲った「島」 は基本同じ R に揃える
3. **厳密な同心までは求めない** — Tailwind スケール (`xl/lg/md/sm`) で段差が分かれば十分
4. **高密度 UI での例外** — 行密度を上げるため `panel-card` を 1 段下げてよい (ルール 1 維持)

具体的な R クラスと役割の対応表は `docs/references/design_recipes.md` を参照。

## React 18 + hook ルール

BeatScanner は React 18.3.1。 以下の禁止 pattern を守る:

- **`useEffect` 内同期 `setState` で初期値入れ直し禁止** → 親側で `key` 変更で子を再マウントし `useState(initialValue)` で初期化
- **フォーカス + 全選択** → `autoFocus` + `onFocus={(e) => e.target.select()}`
- **依存配列の eslint warning** → 必ず解消する (silence しない)

## 出力後セルフレビュー

コードを出力した後、 以下 5 点をセルフレビューし、 違反があれば修正版を出す:

1. **間隔は親管理** か (`gap-*`)? `space-y-*` / `space-x-*` を使っていないか?
2. **色は semantic token** か? 生 hex / 生 RGB を使っていないか?
3. **shadow は semantic token** か? `elevation_scale.md` whitelist 内か?
4. **既存 primitive (`Chip` 等) を再利用** したか? 自前 div で chip / badge を作っていないか?
5. **発光系 / card 系を触ったなら** `design_recipes.md §C-1〜C-4` の compound 4 セットを揃えたか?

レビュー完了後、 必ず `design-system-check` skill を走らせて機械検査も通す。

## 関連 skill

- `design-system-check` — 機械検査 (本 skill の自己レビュー後に必ず実行)
- `shadcn` — shadcn 汎用知識 (BeatScanner は shadcn CLI 未使用、 idiom のみ参考)
- `multi-review` — Pane 責務変更 / 大規模 UI 改修時の 6 体合議
- `funnel-cro` — LP / Pro tier UI を触るなら Trust Cliff 防止
- `dark-mode` — darkMode prop 連携を触る場合
- `chart-tab` / `stock-chart` / `screener` / `earnings-calendar` 等 — domain 別 UI skill
