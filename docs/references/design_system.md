# BeatScanner Design System (Canonical Reference)

> **Status**: 不変の真理 (Single Source of Truth) / トークン値はこのファイルから外に書かない
> **このファイルの目的**: 「Aman / Ritz-Carlton ロビー級の驚き・豪華さ」+「Stripe Sigma / Linear Insights 級のデータ体験」を測定可能・再現可能なトークン群として定義する。
> **適用パターン (どう使うか)** は `design_recipes.md`、**機械的 enforcement の whitelist** は `elevation_scale.md` を参照。
> **思想 (5 原則 / Trust Cliff / 投資業界の色ルール / 「じっちゃま」UI 禁止)** は `CLAUDE.md` を参照。

---

## −1. ブランド世界観 (Brand Aspiration) — 不変の北極星

> **重要度**: ★★★★★ (最重要、不変)
> **由来**: ユーザー直伝。AI-Driven School のアドバイス「色使いなどはアプリの世界観を決める重要な要素なので、デザインシステムとして必ず参照できる場所に記録しておく」に基づいて永続化。
> **修正禁止**: このセクションの言葉は変更しない。新しい修飾語を追加するときは末尾に追記のみ。

### 目標とする体験 (ユーザー原文)

> **「まるで最高級ホテルの入口からロビーへ入場したときのような、驚き・豪華さ・興奮・洗練さを感じられて、画面を見ているだけで楽しい」**

### 由来 / 苦労の足跡

- **v54-v59 の 6 セッション**を「発光バグ」修正に費やしたが、その過程で「単に動く」ではなく「**Aman Resorts / Ritz-Carlton のロビー級**の体験」を実装目標として磨き上げた
- 発光は CSS の box-shadow ring + arrival 中強度 + hover 強強度の 2 段階階層で実現
- 「シアン (= ブランドの記憶色) 」を方向性 (上昇/下落) には絶対使わず、ブランド emphasis 専用に限定する厳密な色運用が世界観の柱
- v61 dogfood で再確認: この体験を脅かすバグ (LP 3 chip 1個ランダム発光、ApiKeyBanner 残置) は Trust Cliff として最優先で潰す

### 体験を構成する 5 つの感情語彙

ユーザー原文の **「驚き・豪華さ・興奮・洗練さ・楽しい」** をデザイン判断の評価軸とする:

| 感情語彙 | 視覚的に対応する表現 | 違反例 |
|---|---|---|
| **驚き (surprise)** | 入場時の cyan ring arrival glow / Hero ticker の display tier (32px / fw600 / -0.02em) | 平坦な panel-card がただ並ぶだけ |
| **豪華さ (luxury)** | Aman 4 階層 elevation (天井/壁/床/glow) + 適切な空白 (var(--space-6) 以上) | 詰め込み (gap-2 以下) / 影なしの平面 |
| **興奮 (excitement)** | hover 時の translateY(-5px) + ring 強化 + 4 KPI が「動いている感」 (60s setInterval re-render) | 静的画像のような死んだ画面 |
| **洗練さ (sophistication)** | typography 階層 (Stat fw700 lh1.05 vs Label fw500 lh1.4) / Linear-style focus-visible gold ring | フォント混在 / 中途半端な太字 / カラーの方向性逸脱 |
| **楽しい (joy)** | View Transitions cross-fade / Cmd Palette ⌘K / Skeleton 寸法一致 / Pane の整理感 | 突然の re-flow / CLS / loading spinner 単純表示 |

### この世界観を守る理由

1. **launch 後の差別化要素**: 米国株情報サイトは無数にある (Yahoo Finance / Seeking Alpha / Bloomberg)。BeatScanner の差別化は「**毎日開きたくなる体験**」。世界観なしの clone は launch 即埋没
2. **苦労して辿り着いた価値**: v54-v59 の 6 セッションで具体化したものを、再評価で gradually 失わない anchor が必要
3. **AI-Driven School の教え**: 色使い = 世界観の anchor。記録なしの世界観は次セッションで簡単に diluted される

### 適用範囲

このセクションは **すべての BeatScanner 画面 / 機能 / コンポーネント** に適用。
- LP / 判定タブ / 決算タブ / チャートタブ
- 道A 移行後の Next.js 16 + Tailwind v4 `@theme` 環境でも継承 (oklch 値で再現)
- Future: 記事タブ / モバイルアプリ / E-mail デザインまで

新規 UI を追加する時は、§0 の 5 測定可能基準で **数値的に**、本セクションの 5 感情語彙で **質的に** 自己レビュー必須。

---

## −1-A. ホーム画面の世界観 (毎朝のファーストインプレッション)

> **重要度**: ★★★★★ (最重要、不変、§-1 と同格)
> **由来**: ユーザー直伝。「ホーム画面は毎朝必ず顔を合わせるところ」「心地よい・また見たいと思ってもらえなければ、ユーザーは会いに来てくれない」
> **修正禁止**: §-1 と同じく言葉は変更しない、追記のみ。

### 目標とする体験 (ユーザー原文)

> **「ホーム画面を開いたとき、ユーザーが一目惚れするような、目がハートになるような設計」**

ホーム画面は他の画面と性質が異なる:
- **毎朝顔を合わせる空間** = 24/365 で daily exposure される唯一の画面
- **心地よさが retention の lever** = ホームで一秒でも違和感を感じたら、その日の利用を止めて翌日に来なくなる
- **「一目惚れ → 通いたくなる」**が KPI 7d retention 45%→55% を達成する根拠

### ホーム画面固有の 5 デザイン要件

§-1 の汎用 5 感情語彙 (驚き / 豪華さ / 興奮 / 洗練さ / 楽しい) に加え、ホーム画面に特化した 5 要件を満たすこと:

| 要件 | 視覚的に対応する表現 | 違反例 |
|---|---|---|
| **一目惚れ (love at first sight)** | First fold (above-fold) の Hero / Movers / Today's brief が完璧な「**美しい photograph**」のように見える状態 | 散らかった card 群 / 情報過多 / 整列されていない grid |
| **目がハート (heart-eyes)** | 動的データの "活き" (LIVE indicator + pulse) + brand cyan の glow が静止画ではないことを伝える + hover の小さな delight | 完全静止画面 / loading spinner だけ / hover で何も起きない |
| **心地よさ (comfort / coziness)** | 適切な空白 (`--space-6` 以上の section gap) + 文字密度低め (1 ファーストフォールドに 5-7 要素まで) + 情報の hierarchy が明確 | 詰め込み grid (`gap-2`) / 全項目が同じ重要度に見える / fontTiny |
| **また見たい (want to see again)** | パーソナライズ (「あなたの保有」「直近見た銘柄」) + 動的更新 (「最終更新 X 分前」) + 朝の rhythm 感 (Today's brief / 今日の注目) | 静的な generic content / personal touch なし / 日次更新感ゼロ |
| **通いたくなる空間 (a place to return to)** | 季節 / 時間帯 / 市場開閉に応じた micro-変化 (例: 朝は「おはようございます」、市場 open 中は LIVE indicator) + 「ここは私のスペース」と感じる pinned items | 朝も夜も平日も週末も全く同じ画面 / customization 不可 |

### ホーム画面が満たすべき体験フロー (3-second test)

ユーザーがホームを開いてから 3 秒以内に:

1. **0-1 秒**: Hero / 主要 visual で「**わ、綺麗**」と思う (一目惚れ)
2. **1-2 秒**: 自分に関連する情報 (保有 / ウォッチ / 直近見た) を発見し「**あ、私のため**」と感じる (heart-eyes)
3. **2-3 秒**: 「**今日は何が起きてる?**」の答えが Movers / Today's brief で見える (daily routine 化)

このフローを満たさないホーム画面は要再設計。

### ホーム画面の構成原則 (§-1 を継承しつつ追加)

| 原則 | 具体 |
|---|---|
| **First fold 至上主義** | 1280px viewport で scroll なしで見える領域に **最も美しいもの** を配置 |
| **写真集ではなくダッシュボード** | 「Aman ロビーの photograph」ではあるが、ただの装飾ではない。**毎朝の意思決定 anchor** として機能 |
| **静を 2 / 動を 1 の比率** | LIVE indicator や pulse は ホーム全体の 1/3 程度に抑制。動きすぎは「ぴょこぴょこした安っぽさ」(洗練さ違反) |
| **personalization-first** | 未ログイン LP と異なり、ログイン済ホームは「あなたの」が必須 (例: 保有が空でも「保有を追加するとここに表示」hint) |
| **季節・時間帯の micro-変化** | 同じユーザーが朝 7 時と夜 23 時に開いた時、subtle に異なる体験 (greeting / 強調セクション) |

### ホーム画面に特化した違反パターン

- **「使い方ガイド」が first-fold にある** = ホームは「毎朝の家」、使い方は別画面で
- **「Pro にアップグレード」CTA が一番目立つ** = upsell は subtle に、main は data
- **無機質な data table のみ** = ホームは「**dashboard**」だが「**おはよう**」感がある dashboard
- **朝晚と週末に同じ Hero** = micro-変化なしは "通いたくなる" 違反
- **personalization 0** = ログイン済なのに generic content のみ → Trust Cliff

### 適用範囲

- ログイン済ユーザーのホームタブ (現 `frontend/src/components/HomeTab.jsx` / 道A 後 `app/page.tsx`)
- 未ログイン LP は §-1 の汎用世界観のみ適用 (LP は「説得」目的で性質が違う)
- 道A 移行後も全継承

### KPI との対応

ホーム画面の世界観達成は handover §8 KPI に直接的に効く:
- 7d retention 45% → 55% (12 ヶ月) → ホーム「一目惚れ」が daily return の根拠
- DAU 50 → 800 (12 ヶ月) → 「通いたくなる空間」が継続率を底上げ
- Free → Pro CVR 3% → 6% → ホームから判定タブへの自然遷移が funnel

新規ホーム画面 UI は **§-1 の 5 感情語彙 + §-1-A の 5 要件** で二段評価必須。

---

## −1-B. 精読画面の世界観 (ベッドの間接照明) — **historical note: v66 で POC、Pane 3 で撤回**

> **status (2026-05-12 更新)**: **Pane 3 適用は撤回**。warm tint は機能 UI 不適合と判明。Pane 5 ニュース全文 / 図解 (読み物 surface) で再検討候補。
> **由来**: ユーザー直伝 (2026-05-12 初版)。「項目を選択し詳細を読む瞬間」の体験 anchor が §-1 / §-1-A に存在しなかったため、6 体並列レビュー (UI/UX / 金融 / Web 設計 / Web 開発 / マーケター / Anthropic engineer) を経て新設。Phase 1 POC を Pane 3 判定詳細に適用後、dogfood + 再 4 体合議で**撤回判断**。

### Phase 1 POC 撤回 postmortem (2026-05-12)

**実装**: `.bs-mode-reading::before` で radial spotlight + linear ambient の warm gradient overlay を Pane 3 (`.ds-judgment-detail`) に適用 (α 0.05 → 0.12 にバンプ)。

**failure mode** (user dogfood):
1. 背景 (カード外側余白 gutter) まで warm overlay が漏れ、Pane 2 との境目が悪目立ち
2. hue 25° / α 0.12 が dark navy 背景 (`#0f172a`) と補色彩度増幅で「amber wash 化」(warm cream に見えない)
3. **「ユーザー体験が上がったとは思えない」**(user 評価) — cyan 抑制以外の体感差なし

**4 体合議 (UI/UX / マーケター / Web 開発 / Web 設計) の converge**:
- 機能 UI 業界 8 例 (Stripe / Linear / Notion / Anthropic Console / Vercel / Arc / Stripe Dashboard / Linear Issue Detail) で **warm tint 0 件**
- warm 採用例 (Bear / iA Writer / Things 3 / Stratechery) は**読み物アプリ専用** (テキスト 70%+ surface)
- Pane 3 は verdict + 数値 + 5 条件 = 機能 UI 寄り → ベッド読書メタファ不適合
- Trust Cliff リスク (orange wash 化、Pane 2 境目悪目立ち) も発生

**撤回方針**:
- `.bs-mode-reading` wrapper class を JSX から削除
- `.bs-mode-reading::before` 系 CSS rules を削除
- token (`--reading-warmth` / `--shadow-glow-cyan-reading` / `--reading-dim-bg-filter`) は **:root に保持** (Pane 5 等読み物 surface で再検討する際の配線として)
- design_system.md §-1-B は本 historical note として残置 (postmortem、将来の Claude セッションが同じ罠を踏まない anchor)
- 代わりに Pane 3 は **typography + spacing + elevation 強化** (機能 UI 業界標準、Linear / Anthropic Console 流) で読みやすさを演出

**学びの記録**:
- 「世界観メタファ」と「surface 特性」の整合性チェックを設計時に必須化
- dogfood 前に業界事例調査 (機能 UI vs 読み物アプリ) を実施
- POC は完全自動公開せず、最低 1 回 user dogfood レビューを通す
- 撤回コストを最小化する設計 (wrapper class 単体、token は再利用可能) は機能した

---

### 以下、元の §-1-B 構想記録 (historical reference として保持)

> **重要度** (元): ★★★★★ — Pane 3 適用は撤回されたが、**読み物 surface (Pane 5 ニュース / 図解)** で再検討時の anchor として記録継続。
> **修正禁止** (元): §-1 / §-1-A と同じく言葉は変更しない、追記のみ。

### 目標とする体験 (ユーザー原文)

> **「開放感のある豪華な部屋のなかで、ベッドに脱力しながら読書をするとき、手元を見るための間接照明に照らされているような演出」**

§-1 ロビー世界観の「驚き・興奮」とは方向性が逆 (脱力・静寂)。これは **矛盾ではなくシーン分離**である:

- **入場時 (LP / Home / Workspace 初期 / Pane 1 世界市場 / Pane 2 ウォッチリスト一覧)** = §-1 ロビーの興奮
- **朝の dashboard (Home)** = §-1-A 一目惚れの心地よさ
- **項目を選択し詳細を精読する瞬間 (Pane 3 判定詳細 / Pane 4 Inspector / 図解 / News 全文)** = §-1-B ベッドの間接照明

Aman Resorts 自身がロビー (公共・興奮) と villa (個室・脱力) で空間を分けている。BeatScanner も「**俯瞰モード = ロビー / 精読モード = villa**」で分離する。

### 由来 / 苦労の足跡

- 2026-05-12 ユーザーから「項目を選択したとき、開放感のある豪華な部屋でベッドに脱力しながら読書をする間接照明のような演出」という質的目標が提示
- §-1 の「興奮」と方向が逆だが、Aman / Ritz-Carlton のロビー⇔villa 設計と同じ「**シーン分離**」で整理することでユーザー合意
- 6 体並列レビューで converge した Must-fix (周囲 dim は背景のみ / 数値は overlay 上 / cyan 減衰は新 token 経由 / light mode 無効化 / .is-arriving compound 不触) は §C-7 (recipes) で運用化

### 体験を構成する 5 つの感情語彙

ユーザー原文の **「開放感・豪華さ・脱力・読書・間接照明」** をデザイン判断の評価軸とする:

| 感情語彙 | 視覚的に対応する表現 | 違反例 |
|---|---|---|
| **脱力 (relaxation)** | 周囲 Pane の背景 `filter: brightness(0.85)`、対象 surface の spacing +1 step、motion を §-1 の 600ms → 700ms 上限で緩慢化 | 周囲も同じ明るさ / 詰め込み grid / 入場と同じ速度感 |
| **没頭 (immersion)** | 上端から落ちる radial warm spotlight、対象 surface 単独に視線が集中する z-index 設計、非関連 UI の subtle fade | 平坦に並んだ複数 card / 視線誘導なし / chrome が冷たいまま |
| **心地よさ (cozy comfort)** | warm cream tone (`--reading-warmth`) の極低 α overlay、Body line-height 拡張 (≥1.65)、max-width 64ch で目幅を整える | 冷たい cyan のみで埋まる / 行長無制限 / 詰めた lh1.5 |
| **温かさ (warmth)** | dark mode の `rgba(255,218,165,α≤0.06)` (実装時に hue 25°/45° で AB)、amber 警告 (38°) とは色相 10°+ 離して分離 | warm overlay が amber 警告に誤読される / α が saturated すぎる / light mode で「紙の黄ばみ」化 |
| **滋味 (subtle richness)** | cyan glow は新 token `--shadow-glow-cyan-reading` で減衰 (arrival ring 静寂、hover 操作時のみ控えめに反応)、LIVE indicator / 数値 / Miss 赤 / amber 警告は overlay の上 z-index で輝度保持 | cyan を §-1 と同強度で残す / warm に数値が飲まれて桁読み違い / Trust Cliff (重要情報が薄まる) |

### この世界観を守る理由

1. **「2 秒判定」(§-1 ロビー) と「精読没頭」(§-1-B ベッド) のシーン両立**: 米国株情報サイトでこの 2 モード切替を持つ競合 (Yahoo / Seeking Alpha / Bloomberg / Koyfin) はゼロ。差別化レバー
2. **retention の lever**: 精読 surface の心地よさは滞在時間と return rate に直接寄与。handover §8 KPI (7d retention 45→55%) を底上げ
3. **記録なしで diluted されるリスク**: §-1 / §-1-A 同様、anchor なしの世界観は次セッションで簡単に薄まる。同形式で永続化必須

### 適用範囲

**適用 (Reading Mode が発動する surface)**:
- Pane 3 判定詳細 (Hero / KpiStrip / VerdictDetail / ConditionGrid / EPS 推移 / Profile)
- Pane 4 Inspector (News / Insights / IR Links) — **ただし Phase 2 で Pane 4 round 16 改修完了後に適用**
- 図解 HTML モーダル (Visualizer 出力)
- News 全文展開 (要約 / 全文)

**適用外 (§-1 ロビー世界観のまま維持)**:
- LP / Home / Pane 1 (世界市場) / Pane 2 (ウォッチリスト一覧) / チャートタブ / Pane 5

### Pro 深化レイヤー (Pro Reading Lounge)

baseline は全ユーザーに提供 (Pro ロックしない)。Pro はその上に "**深化レイヤー**" を積む 3 機能で差別化:

1. **集中シールド (LIVE tick pause)** — §-1-B surface 滞在中は 60s 自動 re-render 停止、手動 refresh ボタン提示
2. **typography 強化** — Body 14→16px / lh 1.5→1.75 / max-width 64ch / 段落間 +1 step
3. **Reading bookmarks** — News / Pane 3 / 図解 を「あとで読む」「ハイライト」「メモ」(Supabase スキーマ追加)

baseline 自体が完成体験であり、Pro 未加入者に「劣化版を見せられている」感は出さない (Trust Cliff 回避)。

### 適用パターン (実装規律)

実装の具体は `design_recipes.md §C-7` を参照。要点:

- 適用 surface に `.bs-mode-reading` wrapper + children root に `data-reading-target`
- radial spotlight は `.ds-workspace-shell::before` で実装 (card 本体 ::before / `.bs-panel-hero::before` は不触)
- 周囲 Pane は **背景 `filter: brightness(0.85)` のみ** (テキスト opacity は触らない、WCAG 維持)
- cyan glow は新 token `--shadow-glow-cyan-reading` 経由 (既存 `.is-arriving:hover` compound 4 セットは v54-v62 教訓により不触)
- light mode は warm overlay を `transparent` 化 (紙の黄ばみ化を回避)
- `prefers-reduced-motion` で warm opacity transition / spotlight fade も短縮

### 着手タイミング (段階展開)

発光バグ被害履歴 (v54-v62 で 6 セッション) を踏まえ、Phase 0 (本ドキュメント) → Phase 1 (Pane 3 POC) → Phase 2 (Pane 4 横展開) → Phase 3 (skill 検査) の 4 段階で展開:

- **Phase 0** (このセッション): 本セクション + recipes §C-7 + memory `feedback_reading_lamp.md` ドラフト
- **Phase 1**: Pane 3 判定詳細のみ POC。handover v65 §5 A (Pane 2 Phase 2 銘柄) 完了後
- **Phase 2**: Pane 4 Inspector / 図解 / News 全文。**Pane 4 round 16 完了後** (Inspector 大改修と衝突回避)
- **Phase 3**: `.claude/skills/design-system-check` に検査ルール追加 (対象外 surface への warm 流出 block 等)

新規 UI を §-1-B surface に追加するときは、§-1 / §-1-A と同じ二段評価 (§0 の 5 測定基準 + 本セクションの 5 感情語彙) に加え、**§C-7 の Must-fix 6 項目**を必ず満たすこと。

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

### 1-A2. Technical overlay colors (Cup-with-Handle Phase 1、 2026-05-17 6 体合議)

ChartTab.jsx の lightweight-charts overlay 専用。 lightweight-charts は CSS var を直接受け付けないため、 backend response で hex を返し frontend で resolve する pattern。

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `--color-overlay-cup` | `#38bdf8` | `#38bdf8` | Cup-with-Handle pattern overlay (cyan 系、 brand accent と同色) |
| `--color-overlay-sma-50` | `#f59e0b` | `#f59e0b` | 50 日移動平均線 (amber、 短期 trend = warning と同色) |
| `--color-overlay-sma-200` | `#a78bfa` | `#a78bfa` | 200 日移動平均線 (purple、 長期 trend = じっちゃま #1 最重要指標) |
| `--color-overlay-rs` | `#22c55e` | `#34ef81` | レラティブ・ストレングス chip (じっちゃま #2 IBD 流) |

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

### 1-D. Reading Mode (§-1-B) tokens *(planned, Phase 1 で確定)*

§-1-B「ベッドの間接照明」専用トークン。**`.bs-mode-reading` scope 内でのみ参照可**、対象外 surface への流出は `design-system-check` skill で block 予定 (Phase 3)。

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `--reading-warmth` | `transparent` (warm overlay は light mode 無効化) | `rgba(255,218,165, 0.04〜0.06)` *(α / hue は Phase 1 で AB 確定。hue は amber 38° から 10°+ 離す: 25° 赤寄り or 45° 黄寄り)* | §-1-B surface の上端 radial spotlight overlay (`.ds-workspace-shell::before` 経由) |
| `--shadow-glow-cyan-reading` | `0 0 0 1px rgba(56,189,248,.10), 0 6px 24px rgba(56,189,248,.06)` | `0 0 0 1px rgba(56,189,248,.18), 0 6px 24px rgba(56,189,248,.12)` *(§-1 比 ≈70% 減衰)* | §-1-B 内の cyan accent (既存 `.is-arriving:hover` compound 4 セットは不触、reading scope 内でのみ参照) |
| `--reading-dim-bg-filter` | `brightness(0.92)` | `brightness(0.85)` | 周囲 Pane の **背景のみ** dim (テキスト opacity は触らない、WCAG 維持) |

**運用ルール**:
- `--reading-warmth` を `.bs-mode-reading` scope 外で参照すると design-system-check が block (Phase 3)
- amber 警告 (`--color-warning`) と `--reading-warmth` の同時表示が必要な場合、amber は **overlay の上 z-index に逃す**
- light mode で warm overlay が「紙の黄ばみ」化する問題を回避するため、light は `transparent` 固定

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
