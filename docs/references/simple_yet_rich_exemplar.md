# シンプルかつリッチ 模範解答 (user 提出 ADS 講義 diagram)

> user (大貴さん) が「"シンプルかつリッチ"の模範解答にしてほしい」と明示した参照物 (2026-06-21 確認)。
> 過去に「色数値のみ記録して html/css を保存し損ねた」ため、ここに recipe を SSOT 化して再喪失を防ぐ。
> CLAUDE.md 5 原則の「3. シンプルかつリッチ」と「5. 図解で認知コストを下げろ」の質的 anchor。

## ソース

- https://ads_lecture_8_diagram.surge.sh/ — 第8回「自分の武器を作り上げる」
- https://ads_lecture_7_diagram.surge.sh/ — 第7回「自分のツールに記憶を持たせる」
- https://ads_lecture_6_diagram.surge.sh/ — 第6回「自分のアプリを世界に出す」(STEP 1-10 カードグリッド図解が白眉)

screenshot 再生成: `cd frontend && node scripts/snap-reference-surge.mjs` → `.visual/ref-surge{6,7,8}-{fold,full}.png` (gitignore 済)。

## スタック

- **Tailwind Play CDN** (`cdn.tailwindcss.com`) + **Lucide icons** (`unpkg.com/lucide`)。**ライト基調**。
- カスタムブランド色 `ads` = **#0d6ca7** (青) を Tailwind config に登録して全面の accent に。

## 「リッチ」の正体 = 6 つの device (発光ではない)

実測: `rounded-` **130回** / `border` **133回** に対し `shadow-` は **3回だけ**。奥行きは影でなく入れ子+枠線で出している。

1. **タイポの劇的階層** — pill eyebrow (薄青地・角丸full・アイコン付) → 特大太字見出し(**キーワード1語だけ** `bg-clip-text text-transparent` の gradient)→ muted gray lede → 末尾に装飾 `───`。
2. **色の徹底した規律** — 中立 slate 地 (bg #f8fafb / border slate-100 #f1f5f9・slate-200 #e2e8f0) + **ブランド色1つ** (#0d6ca7、濃淡 #094d7a〜#b3d9ef) + 意味色 (緑 #1b7a5a / 琥珀 #92650a / 赤 #b91c1c) は **アイコンタイルの小さな差し色のみ**。地に意味色を塗らない。
3. **奥行き = 入れ子 + hairline 枠線 (影ではない)** — 外コンテナ → カード (rounded-xl + slate-200 border) → コード/データ inset パネル (slate-50 地・mono) の3層構造で depth を出す。box-shadow はほぼ不使用。
4. **色分けアイコンタイル** — 概念ごとに「小さな角丸 tinted square + Lucide line icon」(Markdown=緑/JSON=琥珀 等)。一目で分類が伝わる。
5. **カードグリッド図解** — 第6回「開発の一周=10ステップ」は 5×2 のコンパクトカード (STEP色ラベル + Lucide アイコン + 太字短語 + 極小 caption) を1つの大角丸コンテナに収めた **図解 archetype**。長文でなく視覚で流れを伝える (原則5)。
6. **潤沢な余白** — section 間・カード内とも余白が広く、密度が低い。

## NOT (この模範解答が「やっていない」こと)

- 重い box-shadow / 発光 / neon / glow ベタ塗り。
- ダークテーマ。
- 地への意味色ベタ塗り (色は accent と icon tile に限定)。

## BeatScanner screener (B-3 / aman 天井 68 突破) への写像

vision-eval で screener (dark shadow-zero) は legacy も v2+S3 も aman **68** で頭打ち。S3 でタイポ階層・余白・token は実施済 → **未着手レバー**がこの模範解答に集中している:

- **gradient のキーワード/数値差し色** (見出し or 筆頭銘柄の主要数値1つだけ)。
- **色分け Lucide アイコンタイル** (RS/ファンダ/Cup 等の条件を icon tile 化)。
- **入れ子カードの可視的奥行き** (現 screener は flat な border のみ)。
- **「表/リスト」→「カードグリッド図解」化** (第6回 STEP グリッドが範。screener idle hero / 結果を図解寄りに)。
- **ダーク vs ライト**: 天井の一部はダークテーマ起因の可能性。北極星「Aman/Ritz級」は本来 穏やか・明るい上質 = この模範解答に近い。screener surface の明度再考は brand anchor (design_system.md §-1) 級の判断 → user 決定 + multi-review 必須。

関連: [`design_system.md §-1`](design_system.md) (brand 世界観) / [`design_recipes.md`](design_recipes.md) (適用 recipe) / memory `feedback_polish_iteration_roi_decay.md` (aman 天井 68 実測) / `feedback_design_principles.md` (5 原則)。
