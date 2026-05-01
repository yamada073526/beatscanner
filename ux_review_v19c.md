# UXレビュー beatscanner v19c

レビュー日時: 2026-04-29

---

## 🔴 重大（すぐ直すべき）

### 1. ビジネスモデルフロー — サブラベルの途中折り返し

`buildFlowSVG` / `tspanWrap` 関数（`DetailReport.jsx` L51-87）の `maxCharsPerLine` が `8` に設定されているため、英数字を含む日本語文字列が意図しない位置で改行される。

- "AZ・M365主体" → "AZ・M365主 / 体" と分断
- "Copilot展開" → "Copilot展 / 開" と分断（英単語の後ろで切れる）

`tspanWrap` は ASCII 単語境界を考慮するロジックを持つが、`maxCharsPerLine=8` が短すぎて「ASCII 単語を延長する fallback」が機能する前に日本語部分が切れてしまう。サブラベル用の `maxCharsPerLine` を `10〜12` に拡げるか、サブラベル専用の `detailMaxChars` パラメータを追加する必要がある。

**影響**: ビジネスモデルフローはファーストビューに近い最重要セクション。意味が分断されると2秒でメンタルモデルを構築できないというデザイン哲学に直結する。

---

### 2. 成長グラフ — バー値と営業利益率ラベルの重なり

`buildGrowthSVG`（`DetailReport.jsx` L118-207）の Revenue パネルで、バー上部の値テキスト（font-size 10）と amber の営業利益率テキスト（font-size 9, `cy - 5`）の Y 座標が近接している。

バーが高い（値が大きい）場合:
- バー値は `by - 4`（バー上端から4px上）に配置
- 営業利益率ドットラベルは `cy - 5` に配置
- `cy`（margin overlay の Y 座標）とバー上端 `by` がほぼ同じ高さになるケースで両テキストが重なる

スクリーンショット3でも確認できる通り、211.0B$・41.3% などが同一 Y 帯に密集する。バー値のオフセットを `by - 16` 程度に引き上げるか、営業利益率ラベルを折り返して別 Y レーンに逃がす必要がある。

**影響**: 数値の読み取り精度が直接損なわれる。

---

## 🟡 中程度（次スプリント）

### 3. BEAT/MISS バッジ — EPS のみ表示、売上高が未対応

`ConferenceAnalysis.jsx` の `AnalystCard` は EPS の Beat/Miss 履歴のみを持つ（L143-241）。`DetailReport.jsx` の `enrichedData` には `beat_miss.revenue` フィールドが存在するが（L727-735）、`VizPanel` 内では売上高に対する BEAT/MISS バッジを独立して表示する UI が実装されていない。

また `buildGrowthSVG` の `beatLabel`（L151）は `d.beat` フラグを利用するが、このフラグは FMP 無料プランの制約で `null` になり verdict が "unknown" のままとなる（`CLAUDE.md` 既知の制限参照）。グレーのバッジが出るより、データが取れない場合はバッジ自体を非表示にする方が誤読リスクを下げられる。

**改善案**:
- `d.beat === null` の場合は `beatLabel` を完全に非表示にする（現行でも `beatLabel` 空文字は非表示だが明示的に `null` チェックを追加）
- 売上高 Beat/Miss の表示用カラムを `AnalystCard` に追加し、EPS と Revenue を並列表示する

---

### 4. バリュエーションカード — 判定基準が非明示

`VizPanel`（`DetailReport.jsx` L467-495）で PER/PBR/PSR を表示する際、`judgeColor` は `割安 / 割高` の二値のみ（L477）。ただし「何倍以上が割高か」の基準値が UI 上に一切表示されない。

- 他のカード（ConditionCard）には `？` ボタンと詳細モーダルが実装されているが、バリュエーションカードには同等の説明が存在しない
- ダークモード時に `--bg-subtle` 上の `割高`（赤字・`#F87171`）は WCAG AA を満たすが、`var(--text-muted)` の `PER` ラベルとの対比は弱い

**改善案**: バリュエーションカードにも `？` ボタンを追加し、業種平均 PER などの参考値を InfoModal で説明する。

---

### 5. Bull/Bear セクション — ダークモード時の視認性

`VizPanel`（`DetailReport.jsx` L563-586）のブル/ベアグリッドは背景色を `rgba(34,197,94,0.06)` / `rgba(239,68,68,0.06)` と非常に薄く設定している。ダークモード（`--bg-primary` が暗い場合）ではほぼ透明に見える。

- 箇条書きテキストは `var(--text-primary)` で読めるが、セクション自体のグループ感が失われる
- 強み・リスク対比（L523-548）も同じ透明度設定を共有しており同様の問題がある

**改善案**: ダークモード時は不透明度を `0.12` に上げるか、`var(--bg-subtle)` をベースに border だけで区別する方式に切り替える。

---

### 6. HistoryChart — 二軸グラフのスケール不整合

`HistoryChart.jsx`（L182-196）は左軸（売上高: B$）と右軸（EPS・CFPS: $）を `<ResponsiveContainer>` で表示するが、`<YAxis>` に `domain` 指定がないため、EPS と CFPS の小さな変動がグラフ上で誇張されることがある。

例: MSFT の EPS が $11 → $12 に改善した場合でも、右軸が EPS の range に自動フィットするため視覚上「急増」に見える。

**改善案**: 右軸に `domain={[0, 'auto']}` もしくは 0 起点を強制し、スケールの印象操作を防ぐ。

---

## 🟢 良い点（維持すべき）

- **AI要約のストリーミング表示**: `SummaryBrief.jsx` の `[POS]/[NEG]/[NEU]` タグによる色分けは直感的で、2秒スキャンのデザイン哲学に沿っている。スケルトンスクリーンによるレイアウトシフト防止も適切。
- **ConditionCard の詳細モーダル**: 各条件に `？` ボタンと豊富な説明モーダルが実装されており、初回ユーザーの学習障壁を下げている。
- **バリュエーション数値の視認性**: PER/PBR/PSR を `18px / font-weight:700` で表示し、判定ラベルをバッジ化しているレイアウトはコンパクトで読みやすい。
- **アコーディオン設計**: カンファレンスコール・アナリスト視点を accordion で折りたたんでいる（`ConferenceAnalysis.jsx`）ため、初期ページ長が抑制されている。
- **スクロールリビール演出**: `MoversCard` のスマートフォン向け入場アニメーションは segment の差別化につながる良い UX 施策（最新コミット）。

---

## 優先改善ロードマップ（上位5件）

| 優先 | 場所 | 問題 | 改善案 | 工数感 |
|------|------|------|--------|--------|
| 1 | `DetailReport.jsx` `tspanWrap` | サブラベルが maxCharsPerLine=8 で途中折り返し | `maxCharsPerLine` を 10〜12 に拡大、または `detailMaxChars` パラメータ分離 | S (1h) |
| 2 | `DetailReport.jsx` `buildGrowthSVG` | バー値と営業利益率ラベルが重なる | バー値オフセットを `by - 16` に変更、または margin ラベルを上部固定レーンに移動 | S (2h) |
| 3 | `DetailReport.jsx` `buildGrowthSVG` | `d.beat === null` 時にグレーバッジが表示 | `null` チェックで `beatLabel` を完全非表示化 | XS (30min) |
| 4 | `DetailReport.jsx` `VizPanel` | Bull/Bear カードがダークモードで背景が消える | 背景透明度を `0.12` に引き上げ or `var(--bg-subtle)` + border 方式に変更 | XS (30min) |
| 5 | `DetailReport.jsx` `VizPanel` | バリュエーションカードに説明がない | `？` ボタン + InfoModal で業種平均 PER 参考値を追加 | M (3h) |
