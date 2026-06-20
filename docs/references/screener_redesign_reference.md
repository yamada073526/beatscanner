# Screener 再設計 模範解答リファレンス

> screener タブ再設計（2026-06-20 user「すごく使いづらい」発端）の参照資料。
> user 提供の「図解」連載（第6/7/8回）が **「シンプルかつリッチ」を高レベルで体現**しているため、
> 表層の模倣でなく **再現可能な情報設計の原理 + 生 design token（実数値）** を抽出・記録する。
> SSOT: memory `project_screener_tab_redesign.md` / 進行: `handover` 最新版。
>
> ⚠️ 本資料は **模範解答の生データ**。BeatScanner への適用方針は再設計 SPEC（`docs/specs/`）で別途確定する。
> ⚠️ 金融でも検索 UI でもないが、user 評価「シンプルかつリッチの体現」のため情報設計の原理を移植対象とする。

## 出典

| 回 | URL | テーマ |
|---|---|---|
| 第6回 | https://ads_lecture_6_diagram.surge.sh/ | 自分のアプリを世界に出す |
| 第7回 | https://ads_lecture_7_diagram.surge.sh/ | 自分のツールに記憶を持たせる |
| 第8回 | https://ads_lecture_8_diagram.surge.sh/ | 自分の武器を作り上げる |

**重要**: 3枚は**完全に同一の design system**（同じ token 名 `ads-*`・同じ hex 値・同じ余白規則）を共有。
よって以下の token 表は **3枚共通の確定解答**として扱える（1枚を真似れば3枚すべてに整合）。

---

## Part 1. 情報設計の9原理（PDF 視覚解析、3体の独立分析が収束）

| # | 原理 | 要点 |
|---|---|---|
| 1 | **色の10%ルール** | 画面の90%はモノクロ、accent は面積10-15%以下。「色がある＝重要情報の住所」。色に役割固定 |
| 2 | **視覚階層は3段で打ち止め** | 見出し→ラベル→本文。L1とL3のコントラストを大きく取り、2秒で見出しだけ拾える。本文は「読みたい人への贈り物」 |
| 3 | **余白の寛大さ＝上質さ** | コンテンツ幅65-75%、左右に空間。リッチさは装飾でなく余白と構造。グラデ/強shadow/アニメに頼らない「静かな上質さ」 |
| 4 | **繰り返しモジュール** | 同じパターンを反復→読み方を1度学べば自動処理。一貫性こそ「作り込まれた信頼感」 |
| 5 | **密度の交互律** | 詰め→抜き→詰めのリズム。全要素同じ視覚重みが最も疲れる。一覧でも「上位強調・下位後退」と起伏 |
| 6 | **ラベル/アイコン先行・データ後続** | 「何を選ぶか」を先に宣言してからコントロール・数値。一方向の読み順 |
| 7 | **グルーピングで境界** | 線でなく角丸ボックス/ゾーン背景色で「話の塊」を区切る。脇道情報は物理分離 |
| 8 | **冒頭サマリー＋締めの再提示** | 最初に全体像（索引/件数）、最後に要点再提示。前置き型 progressive disclosure |
| 9 | **概念→手順→確認の三部構造** | 1単位に完結感。「理解した」満足が次へのモチベ＝**毎日開きたくなる**源泉 |

---

## Part 2. 生 design token（実数値、3枚共通）

### 2-1. カラーパレット

| token | hex | 用途 |
|---|---|---|
| `ads-bg` | `#FFFFFF` | ページ背景 |
| `ads-surface` | `#F8FAFB` | card / section 背景（最多使用） |
| `ads-hover` | `#F1F5F9` | ホバー面 |
| `ads-border` | `#E2E8F0` | 境界線（標準・最多） |
| `ads-accent` | `#0D6CA7` | primary（ブランド青、上辺4px帯・見出しアイコン） |
| `ads-accent-light` | `#3A8FCA` | badge テキスト等の薄い accent |
| `ads-accent-dark` | `#223A49` | accent 暗色（ほぼ未使用） |
| `ads-text` | `#1A2332` | 見出し・本文（規定） |
| `ads-muted` | `#5A6B7D` | サブテキスト |
| `ads-dim` | `#8A96A5` | caption / placeholder |
| `ads-positive` | `#1B7A5A` | 正・成功 |
| `ads-negative` | `#B91C1C` | 負・エラー |
| `ads-warning` | `#92650A` | 注意 |
| blue scale | `#B3D9EF`〜`#094D7A` | blue 6段階 |

**セマンティック色（情報ブロックの意味づけ、低彩度マスク `/5`〜`/30` opacity で使用）**

| 色 | 役割 | 使用回数(第8回) |
|---|---|---|
| slate | 本文・グレー系全般 | 150 |
| emerald | 正・正解・完了 | 52 |
| violet | 設計・構造・AI | 35 |
| amber | 注意・中間・課題 | 32 |
| blue | primary 情報・accent | 31 |
| red | NG・エラー・否定例 | 26 |
| cyan | 補足・データ形式 | 19 |
| indigo | 詳細・深層 | 12 |
| teal | tip・補足 | 8 |

> 多色だが **各色に役割を固定** + **面積極小（10%マスク）** で衝突回避。「色＝内容属性の記号」。

### 2-2. タイポグラフィ

font-stack: `"Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", "Meiryo", sans-serif`（日本語最優先）

| 役割 | font-size | weight | line-height |
|---|---|---|---|
| H1 hero | 30px → 48px(md) | 900 black | tight |
| H2 section | 24px | 700 bold | — |
| H3 sub | 20-24px | 700 | — |
| 本文リード | 18px | 400 | 1.625 relaxed |
| 本文 | 14px | 400 | 1.625 relaxed |
| caption/label | 12px | 700 | — |
| badge/pill | 11px | 400-700 | — |
| micro | 10px / 9px | 400 | — |
| code inline | 12px | 400 mono | — |

> **weight 3段（900/700/400）のみ**、中間500/600ほぼ不使用。weight の段差を大きく取り、size差が小さくても階層が立つ。

### 2-3. スペーシング（純4pxグリッド）

| 用途 | 値 |
|---|---|
| コンテンツ最大幅 | **768px (`max-w-3xl`)** 単一カラム |
| ページ横padding | 20px |
| ページ縦padding | 40px → 64px(md) |
| **section 間** | **64px → 80px(md)**（主要区切り・機械統一） |
| section 内ブロック間 | 32px（最多） |
| card padding | 20px / 24px / 32px / 40px（サイズ別） |
| item gap | 8px / 12px |
| micro gap | 6px（icon+label） |
| inline margin | 4px〜8px |

> **3段余白階層**: section 64-80px / block 32px / item 8-16px を厳格に使い分け、視線リズムが安定。

### 2-4. 形状・質感

| プロパティ | 値 | 頻度・用途 |
|---|---|---|
| radius 標準 | 12px (`rounded-xl`) | card全般（最多 ×74） |
| radius 小 | 8px (`rounded-lg`) | inline block ×33 |
| radius 大 | 16px (`rounded-2xl`) | highlight ×10 |
| radius pill | 9999px (`rounded-full`) | badge ×13 |
| radius 極小 | 4px (`rounded`) | pill/code |
| **box-shadow** | **事実上ゼロ**（`shadow-sm` 数箇所のみ） | — |
| border 標準 | `1px solid #E2E8F0` | card全般 |
| border accent | `2px solid` | 強調card |
| **border-l-4** | 4px（blue/amber/emerald 等） | カードの意味カテゴリを色帯で即識別（×8） |
| border-t-4 | 4px `#0D6CA7` | ページ上辺ブランド帯（1箇所） |
| グラデーション | 文字1単語 + highlight背景2箇所のみ | 極小 |

> ⭐ **elevation は shadow でなく「border + tinted background」で表現**。
> white(`#FFFFFF`) ↔ surface(`#F8FAFB`) の背景色差 + 1px border で2段標高。
> → BeatScanner の `.panel-card` 発光バグ（v54-v59 で6セッション溶けた）が **原理的に起きない引き算哲学**。

### 2-5. レイアウト

| パターン | 値 |
|---|---|
| 主レイアウト | `flex-col` 縦積み |
| grid | カード**内部のみ** `grid-cols-1` → `md:grid-cols-2/3/4` |
| 横並び | `flex gap-2〜4`（icon+text） |
| interaction | `transition-colors` + `hover:text-ads-accent`（静的のため最小） |

> 全体は **単一カラム縦スクロール**、grid 分割は section 内の比較カードに限定。「縦に追う + 部分的に横展開」。

---

## Part 3. screener UI への移植候補原理（PDF 3体が独立に提案、収束分）

1. **銘柄行を固定モジュール化** — `ロゴ | 銘柄+ticker | 条件バッジ | スコア | 状態` の一貫レイアウト。1行目で読み方を学習（原理4）
2. **色は「全条件クリア/注目」のみ**、Fail はグレー（赤でなく灰で「欠落」表現）。色の意味をワンルール固定（原理1）
3. **フィルタを役割でグルーピング** — ファンダ/テクニカル/Cup を角丸カードで分け、グループの扉を先に見せる（原理7）
4. **ヒーローに「本日のTOP3 / N銘柄ヒット」** を余白多めで大きく → 「で、どれを見ればいい?」に即答（原理8+9、確認ゾーン）
5. **フィルタ説明は物理分離**（折りたたみ/?ボックス）、本流UIに混ぜない（原理7）
6. **適用中条件を chip 列で常時再提示** — 今何が効いているか（原理8）
7. **screen を3ゾーン構成** — ①何を探すか（フィルタ）→ ②結果リスト → ③だから今日の注目はこれ（決断支援）（原理9）

---

## Part 4. BeatScanner 不変制約（移植時の入力）

- design token は `docs/references/design_system.md` が SSOT（raw hex 直書き禁止、上記 `ads-*` 値は**参考**であり BeatScanner token への mapping が必要）
- Chip primitive（`Chip.jsx` + index.css §Chip、inline 禁止）
- §38（事実のみ・買い断定/将来予測/最上級なし）・§5（優良誤認なし）→ **色で「買い」を断定できない**
- 5原則（読み手負担/毎日開きたい/シンプルかつリッチ/1クリック減/図解）
- ブランド世界観: Aman・Ritz 級の静かな上質さ
- 投資の色ルール: 上昇=緑/下落=赤/警告=amber/cyan=ブランド色（上昇の意味で使わない）

> ⭐ 模範資料の「shadow ゼロ + border/tinted-bg elevation」は BeatScanner の発光バグ回避と方向一致。
> ただし BeatScanner は既存の発光 recipe（`feedback_glow_active_pattern`）も持つため、再設計で「どちらの哲学を採るか」は SPEC の論点。

---

## Part 5. BeatScanner 適用方針（確定骨格 2026-06-20、effort max / ultrathink / deep-research 統合）

> deep-research（109 agent / 出典付き 3票合議）+ PDF 9原理 + 生token + pain point 5軸 を統合し user 承認した骨格。
> 各 finding の確度: high/3-0 = 全員一致の強い裏付け。出典は本 Part 末尾。

### 5-1. アーキテクチャ — master-detail 一本化（root cause への解）

> root cause =「絞る面(Pane2 Explorer)」と「眺める面(Pane3 Hero)」が**2つの別 master として並置**。
> 解 = **master-detail パターン**（research C, high/3-0、Wikipedia master-detail 正準形）。
> ※ Shneiderman "overview→detail" mantra は**3票合議で却下** → 根拠にしない。

- **master = 銘柄リスト1つ**に統合。上段トグルで「**今日の注目(preset)**」⇄「**自分で絞る(custom)**」を切替。別ペインに分けない
- **preset + additive custom 二層**（research B, TradingView 一次資料）: preset でワンクリック俯瞰 → custom で条件を足す。結果は同じ master リストに出る
- **detail = Pane3 個別分析**。master 行クリックで populate（master-detail 正準形、side-by-side or top-bottom）
- **WorkspaceScreenerModal（第3の入口）は廃止**

### 5-2. フィルタ操作（pain point ②操作ステップ・④発見性）

- 利用頻度順に**上位5-10条件を既定表示**、残りのみ折りたたみ（research B, Baymard high/3-0）。現状の「全隠し折りたたみ」を廃止
- 各 facet/preset chip に**件数併記**「急騰 (34)」（research B, Baymard「フィルタUI最高インパクト改善の一つ」high/3-0）
- **適用中条件を chip 列で常時可視** + 個別 x + clear all（research B, Baymard high/3-0）
- 毎日使う条件（急騰/出来高/新高値）を上段固定。銘柄数の多い sector facet には in-facet 検索

### 5-3. リスト密度（pain point ①情報密度・⑤結果解釈）

- **銘柄行を固定モジュール化**（PDF原理4、1行目で読み方を学習）: `ロゴ｜銘柄+ticker｜条件バッジ｜スコア｜状態`
- **観点別カラムプリセット切替**（research A, high/3-0, TradingView ready-made column set）: 急騰観点(出来高/RS)・ファンダ観点(EPS/売上YoY) で同じリストを別レンズ。列の sort/並替/除去も提供
- 密度の交互律「**上位強調・下位後退**」（PDF原理5）。ResultCard の過多情報（条件ドット5+CAN-SLIM5）は detail へ送る

### 5-4. 視覚言語（PDF 9原理 + 生token、Part 1/2 に実数値）

- **shadow ゼロ・border + tinted-bg で elevation**（発光バグが原理的に起きない安全解）
- **accent 1色 + opacity 変調**（`/5`〜`/30`）、セマンティック色は**役割固定・低彩度マスク**（投資の色ルール 緑/赤/amber と整合）
- **weight 3段**（900/700/400）、**3段余白階層**（section 64-80 / block 32 / item 8-16px）
- 単一カラム + カード内 grid

### 5-5. 決断支援（pain point ⑤ + 原則4 人力代替）

- 結果→行動の2経路（research D, high/3-0, TradingView）: **複数選択で watchlist 一括追加** / **行クリックで Pane3 直行**
- ヒーローに「本日の TOP3 / N銘柄ヒット」→「so what = 次に見るべき個別銘柄」へ即答

### 5-6. ⚠️ やってはいけない（research 却下 + §38）

- **Shneiderman mantra を設計根拠にしない**（vote 1-2 却下、master-detail が正本）
- **モバイル 5-7 facet 閾値は未実証**（vote 0-3 却下、PC 優先で進める）
- **「件数表示で決断麻痺が減る」と謳わない**（vote 0-3 却下、因果は primary research なし）
- **§38**: 色で「買い」断定不可。color は事実状態のみ（research の「色で行動示唆」を金融規制で制限）

### 5-7. SPEC で詰める Open Questions（research が未確定）

1. **apply 挙動: instant（件数リアルタイム更新）vs batch** — nightly precompute と絡む
2. **件数の動的計算コスト** — 0件/disabled chip の扱い、リアルタイム vs 事前計算
3. **preset/custom の視覚的区切り** — Aman/Ritz 級の静かな上質さと両立する分け方

### 出典（high/3-0 の主要一次資料）

- Baymard（独立大規模ユーザビリティ研究）: https://baymard.com/learn/ecommerce-filter-ui — 件数併記/上位5-10表示/適用中chip
- TradingView 公式: https://www.tradingview.com/support/solutions/43000718885-tradingview-screeners-walkthrough/ — preset+custom二層/観点別カラム/watchlist転送
- TradingView watchlist: https://www.tradingview.com/support/solutions/43000473930
- Wikipedia master-detail: https://en.wikipedia.org/wiki/Master%E2%80%93detail_interface — 視線統合正本
- （却下元）infovis-wiki Shneiderman mantra: https://infovis-wiki.net/wiki/Visual_Information-Seeking_Mantra
