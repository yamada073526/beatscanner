# Pane 3 Detail — mockup vs v6 実装 drift 監査
**日付**: 2026-06-28  
**監査対象 mockup**: `docs/specs/mockups/pane3-detail-v1.html` (464 行)  
**監査対象実装**: `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` + `sections/` 配下

---

## 進捗ログ (mockup-fidelity 優先順位順)
- **[F] #6 L0 セクター pill MISSING → 修正済** ([PR #94](https://github.com/yamada073526/beatscanner/pull/94)・main `a63139c`・本番 live)。
  backend `_sector_for()` (universe 24h cache 再利用・非LLM) + `rs.sector` 注入、frontend Hero に neutral チップ + EN→JP 静的 dict。
  検証: NVDA/JPM/AAPL → 正しい sector、NVDA snap で「テクノロジー」pill 描画確認。
  既知: deploy 直後 cold universe 窓で technical cache が sector=None を 24h 固定する fragility (Sprint 3b と共通)。follow-up task 化済。
- **[既済] #4 L6 ニュース/IR/10-K → 既に 1 fold 集約済** (`ContextSection.jsx` 70行・単一 AccordionSection「ニュース · IR · 10-K」内に 3 サブ見出し)。#87 の成果。AUDIT の「3 個別 AccordionSection (L105-173)」は **sub-agent 調査の誤り** (ファイルは 70 行で L105-173 不在)。
- **[既済] #2 L6「市場評価」章扉突出 / ChapterTabs → 既に撤去済** (`MarketEvalSection.jsx` 105行・冒頭コメントで章扉+isV2/V3/V5 分岐 撤去を明記)。#81 の成果。
- **⚠️ 本 AUDIT の L6 所見は大幅に stale**: sub-agent が #81/#87 マージ前の状態を監査。L6 の DRIFT/MISSING の多くは既に解消済。**L6 を直す前は必ず現コードを ground-truth すること**。
- **[保全/gate] 残りは事故 drift でない**:
  - L1 tooltip「詳細セクションを参照」/ L2 EarningsFlash 拡張 / L0 1W·1M の L4 降格 = **意図的** (保全)。
  - L4 PriceLadder premium-gate (#1) / L4 順張り note (§38) / L4 buyq (flag OFF) / L5 図解 CTA コピー (#10) = **monetization/§38/copy 判断** (funnel-cro / hallucination-guard 経由・機械 revert 不可)。
- **総括**: L0 sector pill (#6) 修正後、純粋な「事故 drift」は実質残っていない。Pane 3 mockup 忠実化は **substantially complete**。

---

## 凡例
- **MATCH**: mockup 通り（構造・文言・順序が一致）
- **DRIFT**: 存在するが乖離（どう違うかを明示）
- **MISSING**: mockup にあるが実装に無い
- **EXTRA**: 実装にあるが mockup に無い（意図的追加の可能性あり）

---

## L0 同定 (`.id-row #top`)

mockup 構造: ロゴ(52px 正方形) + ticker(26px/700) + 社名「社名 · FYxxxx Qx」 + meta pill 2個(次決算amber + セクター) + id-spacer + 右側に価格列(22px) + 前日比+% + 「1W −x% · 1M −x%」小行 + 「☆ ウォッチ追加」ボタン

| mockup 要素 | 判定 | 実装の実状 | 具体差分 |
|---|---|---|---|
| ロゴ 52px 正方形 角丸13px | MATCH | `Hero.jsx` — `CompanyLogo` shape='rounded' | CompanyLogo size デフォルト=48-56px 相当。mockup 52px と概ね一致 |
| ticker テキスト 26px/700 | MATCH | `Hero.jsx` (Card 内、`data-testid="pane3-hero"`) | 実装でも ticker 大表示。厳密 px は CSS 変数依存だが構造は一致 |
| 社名「社名 · FY期」 | DRIFT | `Hero.jsx` `companyName` + `period` prop | mockup は同一行「Apple Inc. · FY2025 Q3」。実装は CompanyLogo・ticker・period が別行/別 chip になっている可能性（Hero.jsx L116-以降で Card レイアウト） |
| meta pill: 次決算まで N 日 (amber) | MATCH | `Hero.jsx` `hideCountdownChip={false}` | v6 では `hideCountdownChip=false` で D-XX pill 表示。amber 色 chip |
| meta pill: セクター | MISSING | `Hero.jsx` を確認した範囲では明示的なセクター pill なし | mockup は `<span class="pill-meta">テクノロジー</span>` がある。実装に対応する chip が確認できない |
| id-spacer (flex: 1) | MATCH | `Hero.jsx` 内の Card レイアウトで右寄せ実現 | 概念的に一致 |
| 右側: 価格 22px/700 | MATCH | `Hero.jsx` が `detail?.price` を KpiStrip 経由で表示 | 実装では Hero Card と KpiStrip が分かれているが「同定」に価格を含む点は一致 |
| 右側: 前日比 +%（色） | MATCH | KpiStrip の「前日比」 chip (JudgmentDetail.jsx L503-513) | 実装に存在。ただし Hero Card 右上でなく KpiStrip (水平 chip 列) として表示 = レイアウトが異なる |
| 「1W −x% · 1M −x%」小行 | DRIFT | `ReturnGrid` を L4 に降格 (JudgmentDetail.jsx L876-) | mockup は L0 内に 1W/1M の 2 期間を小行で表示。実装では L4「期間別リターン」8 分割グリッドに降格。L0 には表示されない |
| 「☆ ウォッチ追加」ボタン | MATCH | `Hero.jsx` `watchlist` / `onAddToWatchlist` prop (L82-96) | v6 では `frameless` Hero 内に「ウォッチ追加」ボタンあり |
| L0 全体を **発光なし** 同定バー | MATCH | `VerdictHero` に `verdict="unknown"` 固定、`hideEarningsRing={true}`, `hideEyebrow={true}` (JudgmentDetail.jsx L738-755) | 判定 ring 非表示・eyebrow 非表示で同定層として分離 |
| **KpiStrip (横 chip 列)** | EXTRA | JudgmentDetail.jsx L491-586: 株価・前日比・RS Rating・Forward P/E・配当性向・自社株買い の 6 chip | mockup L0 にはなく、実装のみに存在。KpiStrip は VerdictHero 内部 (`VerdictHero.jsx`) にある |
| **EarningsRing** | EXTRA → 実装では `hideEarningsRing={true}` で非表示 | JudgmentDetail.jsx L746 | v6 では非表示なので有効な EXTRA でなく、正しく mockup に合わせてある |
| **DetailBreadcrumb** (競合ナビ) | EXTRA | JudgmentDetail.jsx L632 | mockup にない競合ナビバー。意図的追加 |
| **CompletenessRollupBadge** | EXTRA | JudgmentDetail.jsx L642 | mockup にない完全性台帳バッジ。意図的追加 |

---

## L1 判定サマリー (`.verdict` card)

mockup 構造: card(bg-card + border-strong + radius 14px) 内に — ヘッダー「判定サマリー」+「条件充足 3/5」dot+ⓘ → `.v-context` 地合い行 → 決算3点 buckets 3列(各 clickable→#earnings、lead 背景) → streak-rs 2列 mini

| mockup 要素 | 判定 | 実装の実状 file:line | 具体差分 |
|---|---|---|---|
| card border-strong + radius(14px) | MATCH | `L1SummaryBuckets.jsx` L106-113 `cardStyle` | `border: '1px solid var(--border-strong)'`, `borderRadius: 'var(--radius-md, 14px)'`。mockup `var(--radius)=14px` = `--radius-md` と一致 |
| ヘッダー「判定サマリー」 UPPERCASE 12px/700 | MATCH | `L1SummaryBuckets.jsx` L121-127 `titleStyle` | `textTransform: 'uppercase'`, `fontSize: 12`, `fontWeight: 700`, `color: 'var(--text-secondary)'` |
| 右に「条件充足 3/5」+ dot(amber) + ⓘ | MATCH | `L1SummaryBuckets.jsx` L349-373 | dot `background: dotColor(passedCount, totalCount)`、ⓘ title tooltip。構造一致 |
| ⓘ tooltip 文言 | DRIFT | `L1SummaryBuckets.jsx` L365-370 | mockup: 「ファンダ5条件のうち3条件が充足（状態の根拠は累進開示）」。実装: 「ファンダ${totalCount}条件のうち${passedCount}条件が充足（状態の根拠は詳細セクションを参照）」。末尾文言が「累進開示」→「詳細セクションを参照」に変更 |
| `.v-context` 地合い行「地合い（市場全体）: 上昇局面（指数が 50/200DMA 上方）ⓘ」 | DRIFT | `L1SummaryBuckets.jsx` L375-413 `showRegime` ブロック | mockup: `<span class="tag">前提</span>` タグ + 固定文言。実装: `regime.label` / `regime.detail` を動的に取得 (`ftdRegime`/`ftdMap`)。文言は動的だが構造（tag「前提・地合い」+ label + ⓘ）は一致。`regime.status === 'none'` 時は非表示 (mockup は常時表示) |
| 決算3点 buckets 3列 — EPS | MATCH | `L1SummaryBuckets.jsx` L416-444 | 3 列 grid、EPS bucket、bLabel「EPS（対コンセンサス）」、bMain サプライズ%、bSub「実績 ／ 予想」 |
| 決算3点 buckets 3列 — 売上 | MATCH | `L1SummaryBuckets.jsx` L446-504 | 売上 bucket 同様 |
| 決算3点 buckets 3列 — ガイダンス | MATCH | `L1SummaryBuckets.jsx` L474-503 | ガイダンス bucket。gLabel が null 時は「—」 |
| bucket が `<a href="#earnings">` リンク | DRIFT | `L1SummaryBuckets.jsx` L419/447/475 | mockup は `<a class="bucket lead">` (anchor)。実装は `<button type="button" onClick={scrollToEarnings}>` (button)。動作は等価だが要素型が異なる |
| bucket 先頭 2 つ `.lead` 背景 (bg-future) | DRIFT | `L1SummaryBuckets.jsx` L143 `bucketBaseStyle` | 全 3 bucket が同一 `bucketBaseStyle` (bg-future + rgba 0.12 border)。mockup では先頭 2 つのみ `.lead`、3 番目 (ガイダンス) も `.lead` になっている = mockup 自体も 3 つとも lead だった（確認すると mockup 279-283 でガイダンスも `.lead`）。実装一致 |
| `b-drill` 「詳細 ↓」テキスト | MATCH | `L1SummaryBuckets.jsx` L426 `bDrillStyle` | `詳細 ↓` テキスト, `position: 'absolute', top: 11, right: 11` |
| `★` 色 amber `#fbbf24` | MATCH | `L1SummaryBuckets.jsx` L427-428 | `color: 'var(--color-warning, #fbbf24)'` |
| streak-rs 2 列 mini — 連続ビート | MATCH | `L1SummaryBuckets.jsx` L508-529 | 「連続ビート」 key, `streak` Q数, 「Q 連続」 suffix |
| streak-rs 2 列 mini — RS | MATCH | `L1SummaryBuckets.jsx` L531-548 | rsLabel / rsDisplay / rsScale 動的。mockup「RS（相対強さ）」 71 · 目安80+で強い」に相当 |
| RS mini click → `#technical` | MATCH | `L1SummaryBuckets.jsx` L257-264 `scrollToTechnical` | `[data-testid="v6-technical-section"]` へ smooth scroll |
| **出典 footer** 「出典: SEC / FMP（数値）· 取得日: 本日」 | EXTRA | `L1SummaryBuckets.jsx` L604-606 | mockup にないが Trust Cliff 防止のため追加。良い追加 |
| **セクター地位 chip** (RS leader 時のみ) | EXTRA | `L1SummaryBuckets.jsx` L552-591 | mockup にない。Sprint 3b 追加 |

---

## On This Page 目次 (`nav.toc`)

mockup 構造: `On this page` label + chip 5個（決算 / 品質・継続性 / テクニカル・買い場 / 図解 / その他）

| mockup 要素 | 判定 | 実装の実状 file:line | 具体差分 |
|---|---|---|---|
| 「On this page」 label | MATCH | `Pane3TOC.jsx` L107 | `<span style={labelStyle}>On this page</span>` |
| chip 5 個: 決算 / 品質・継続性 / テクニカル・買い場 / 図解 / その他 | MATCH | `Pane3TOC.jsx` L21-27 `TOC_ENTRIES` | 5 エントリー完全一致 |
| chip が `<a href="#id">` アンカー | DRIFT | `Pane3TOC.jsx` L108-128 | 実装は `<button type="button" onClick>` smooth scroll。mockup は `<a href="#earnings">` 等の native anchor |
| chip スタイル (border-radius 999px、bg-subtle) | MATCH | `Pane3TOC.jsx` L45-57 `chipBaseStyle` | `borderRadius: 999`, `background: 'var(--bg-subtle, #1e2a3a)'` |
| 非 equity 時は決算・テクニカルを除外 | EXTRA | `Pane3TOC.jsx` L89 `entries = TOC_ENTRIES.filter(...)` | mockup にないが適切な追加 |

---

## hairline 区切り (`hr.hair`)

| mockup 要素 | 判定 | 実装の実状 file:line | 具体差分 |
|---|---|---|---|
| TOC 直後の hairline | MATCH | `JudgmentDetail.jsx` L777 | `<hr style={{ height: 1, background: 'var(--border)', border: 0, margin: 0 }} />` |
| L2 決算 → L3 品質 間の hairline | MATCH | `JudgmentDetail.jsx` L834 | 同上 |
| L3 品質 → L4 テクニカル 間の hairline | MATCH | `JudgmentDetail.jsx` L874 | 同上 |
| L4 → L5 間の hairline | MATCH | `JudgmentDetail.jsx` L920 | 同上 |
| L5 → L6 間の hairline | MATCH | `JudgmentDetail.jsx` L961 | 同上 |
| L2 内: 決算3点 → 成長トレンド 間の hairline | MATCH | `JudgmentDetail.jsx` L808 | 同上 |
| L2 内: 成長トレンド → 5条件 間の hairline | MATCH | `JudgmentDetail.jsx` L817 | 同上 |

---

## L2 決算 (`#earnings`)

mockup 構造:  
- 章ヘッダー: `①` + 「決算」 + note「直近 FY2025 Q3 · 8/1 発表」  
- サブヘッド「決算3点 — 対コンセンサス」  
- `earn-grid` 3列 (EPS / 売上 / ガイダンス 各 k/大v/予想c)  
- `future-strip` 来期コンセンサス  
- hairline  
- サブヘッド「成長トレンド（直近 8Q）」  
- `spark-row` 2列 bchart  
- hairline  
- `.five` 5条件カード（★唯一の発光）

| mockup 要素 | 判定 | 実装の実状 file:line | 具体差分 |
|---|---|---|---|
| 章ヘッダー `①` + 「決算」 | MATCH | `JudgmentDetail.jsx` L787-795 | `<span>①</span><span>決算</span>` |
| 章 note「直近 FY2025 Q3 · 8/1 発表」 | DRIFT | `JudgmentDetail.jsx` L790-794 | 実装: `FY{result.latestPeriod}` のみ（「直近」prefix なし、「発表日」なし）。mockup の「直近 FY2025 Q3 · 8/1 発表」より情報量が少ない |
| サブヘッド「決算3点 — 対コンセンサス」 | MATCH | `JudgmentDetail.jsx` L798-800 | 同一文言、同スタイル (uppercase 12px/700) |
| `earn-grid` EPS/売上/ガイダンス 3列 | DRIFT | `EarningsFlashSummary.jsx` (全体) | **大きな構造差分**: mockup は `.earn-grid` シンプル 3 列グリッド (k/v/c の 3 行×3列)。実装は `EarningsFlashSummary` (1026行) で `HeadlineGrid`(EPS+売上を予想/結果/予想比/前年比の5列グリッドに展開) + `LowerGrid`(部門別+粗利率) + `FutureGrid`(来期) + count-up アニメーション + 判定バッジ + コピーボタン + カードヘッダー帯 など大幅な情報拡張。mockup の「シンプル3列」に対して「列揃えグリッド + 4列見出し + 下段セグメント」の本格表に進化している |
| EPS: 予想 $x.xx → 実績 $x.xx (サプライズ%) | MATCH | `EarningsFlashSummary.jsx` `HeadlineGrid` L313-383 | 動的データで同等の情報を表示 |
| ガイダンス: 状態ラベル + サブテキスト | DRIFT | `EarningsFlashSummary.jsx` `FutureGrid` L615-687 | ガイダンスは来期コンセンサス grid に統合。mockup の「ガイダンス（来期）」独立 earn-cell とは構造が違う（FutureGrid に統合） |
| `future-strip` 来期コンセンサス（YoY）売上+x% · EPS+x% | DRIFT | `EarningsFlashSummary.jsx` `FutureGrid` L615-687 | mockup は `.future-strip` (横並び 1 行、bg-future)。実装は `FutureGrid` (5列 grid、複数行の縦積み)。情報は含むが表現形式が異なる |
| サブヘッド「成長トレンド（直近 8Q）」 | MATCH | `JudgmentDetail.jsx` L811-813 | 同一文言 |
| `spark-row` 2列 bchart — EPS YoY | MATCH | `EarningsGrowthSpark.jsx` L288-311 | `SparkChart` label「EPS 成長率 YoY（%）」。構造一致 |
| `spark-row` 2列 bchart — 売上 YoY | MATCH | `EarningsGrowthSpark.jsx` L300-311 | `SparkChart` label「売上 成長率 YoY（%）」 |
| baxis: 「FY23 Q4 · 加速↗ / 横ばい→ · FY25 Q3」 | MATCH | `EarningsGrowthSpark.jsx` L186-195 | `trendLabel` 関数 (L43-55) で「加速 ↗」「横ばい →」「減速 ↘」を動的に計算 |
| 直近バーを色つき・他は bg-muted | MATCH | `EarningsGrowthSpark.jsx` L100-146 `SparkBar` | `isLatest` で最終 bar を `var(--color-gain)` / `var(--color-loss)` 着色 |
| `.five` 5条件カード — border `rgba(56,189,248,.22)` + glow | DRIFT | `FiveConditionsCard.jsx`（未読だが `v5Header={true}` prop あり） | `JudgmentDetail.jsx` L820-831 で `FiveConditionsCard` を `v5Header={true}` で render。実際の glow CSS は `FiveConditionsCard.jsx` に依存。mockup `.five` は `box-shadow: 0 0 0 1px rgba(56,189,248,.10), 0 8px 34px rgba(56,189,248,.08)` — FiveConditionsCard が同等の glow を持つかは UNVERIFIED（本監査で FiveConditionsCard.jsx を未読） |
| `.five` ヘッダー「ファンダメンタル 5 条件」+ 「充足 3/5」 | MATCH | `FiveConditionsCard.jsx`（UNVERIFIED — v5Header prop あり） | UNVERIFIED: `v5Header={true}` prop から title 変更あり可能性あるが、mockup と同文言と推定 |
| 5 条件行 (mk-ok✓ / mk-no—) + 条件文 + 右に数値 | MATCH | `FiveConditionsCard.jsx`（UNVERIFIED） | JudgmentDetail.jsx L820-831 で `conditions` / `passedCount` / `totalCount` を props 渡し |
| **来期コンセンサス詳細行** (Section sprint追加) | EXTRA | `EarningsFlashSummary.jsx` — ガイダンス発表比較・コンセンサスドリフト | mockup にない追加情報（会社 8-K ガイダンス比、コンセンサス修正トレンド等） |
| **グロスマージン行** | EXTRA | `EarningsFlashSummary.jsx` `LowerGrid` gmStr | mockup にない。Flash Phase2 追加 |
| **セグメント別売上** (最大 2 件) | EXTRA | `EarningsFlashSummary.jsx` `LowerGrid` segs | mockup にない。Flash Phase2 追加 |
| **ヘッダー帯** (「決算サマリー」+ 期 + コピーボタン + ⓘ) | EXTRA | `EarningsFlashSummary.jsx` L476-510 | mockup になし。EarningsFlashSummary 独自のカード Header 帯 |

---

## L3 品質・継続性 (`#quality`)

mockup 構造: 章ヘッダー② + note「サマリー常時 · 詳細は展開」 + fold 行 4個  
fold 行の order: ①営業CFマージン → ②ROE/PER/PEG → ③機関投資家保有トレンド → ④会社概要・セグメント

| mockup 要素 | 判定 | 実装の実状 file:line | 具体差分 |
|---|---|---|---|
| 章ヘッダー `②` + 「品質・継続性」 | MATCH | `JudgmentDetail.jsx` L843-846 | `②` + 「品質・継続性」 |
| note「サマリー常時 · 詳細は展開」 | MATCH | `JudgmentDetail.jsx` L845 | `<span>サマリー常時 · 詳細は展開</span>` |
| fold ①: 営業CFマージン + f-sum「28.4%（理想帯 15-35%）· 良好」 | MATCH | `L3QualityFold.jsx` L68-131 | `AccordionSection` id="v6-l3-ocf-margin" + `summary={ocfSummary}` で動的サマリー |
| fold ②: ROE/PER/PEG + f-sum 動的 | MATCH | `L3QualityFold.jsx` L133-151 | `AccordionSection` id="v6-l3-roe-per-peg" + `rppSummary` |
| fold ③: 機関投資家 保有トレンド + f-sum「QoQ +0.6pt · 緩やかに増加」 | MATCH | `L3QualityFold.jsx` L174-191 | `AccordionSection` id="v6-l3-institutional" + `instSummary` |
| fold ④: 会社概要・セグメント + f-sum「iPhone 51% · Services 26% · ほか」 | MATCH | `JudgmentDetail.jsx` L853-871 `FundamentalsAccordion` + `segmentSummaryInHeader` | `FundamentalsAccordion` renderSection="profile" + `segmentSummaryInHeader={true}` でヘッダーにセグメント% サマリーを常時表示 |
| fold 順: CFマージン→ROE/PER/PEG→機関保有→会社概要 | DRIFT | `L3QualityFold.jsx` L110-192 + `JudgmentDetail.jsx` L848-871 | **fold 追加**: `L3QualityFold.jsx` に mockup 4 個のうち 3 個 (CFマージン/ROE-PER-PEG/機関保有) が実装されているが、**DSO (売上債権回転日数) fold が追加されている** (`L3QualityFold.jsx` L153-172 id="v6-l3-dso")。mockup の fold は 4 個、実装は 5 個 |
| **DSO (売上債権回転日数) fold** | EXTRA | `L3QualityFold.jsx` L153-172 | Sprint 3a 追加。mockup にない |
| fold に `AccordionSection` (chevronPosition="right") | DRIFT | `L3QualityFold.jsx` L112 | mockup は静的 `.fold` div(▸ chev + f-title + f-sum)。実装は `AccordionSection` (展開/折りたたみ可能 interactive)。視覚的に同等だが interactive 度が高い |
| `valuationExtras` が null の時は L3QualityFold 非表示 | EXTRA | `JudgmentDetail.jsx` L848 `{!isNonEquityV6 && valuationExtras && <L3QualityFold />}` | valuationExtras fetch 待ちまたはエラー時は fold 群が丸ごと消える。mockup は常時表示 |

---

## L4 テクニカル・買い場 (`#technical`)

mockup 構造: 章ヘッダー③ + note「順張りシグナル 一部」 → チャート placeholder → 「価格ラダー」 → ladder 6 rung → buyq → 「期間別リターン」 → ret-grid 4列×2段

| mockup 要素 | 判定 | 実装の実状 file:line | 具体差分 |
|---|---|---|---|
| 章ヘッダー `③` + 「テクニカル・買い場」 | MATCH | `JudgmentDetail.jsx` L882-885 | `③` + 「テクニカル・買い場」 |
| note「順張りシグナル 一部」 | MISSING | `JudgmentDetail.jsx` L882-885 | mockup 章ヘッダーは `<span class="ch-note">順張りシグナル 一部</span>` を右端に持つが、実装の章ヘッダーには `ch-note` に相当する要素なし（L882-885 を確認: `div` 3 要素のみで note span なし） |
| チャート (価格チャート日足) | MATCH | `JudgmentDetail.jsx` L894-903 `StockPriceChart` | `SectionFade` > `StockPriceChart` |
| 「価格ラダー」 l2h + ladder 6 rung | DRIFT | `JudgmentDetail.jsx` L904-906 `PriceLadder` | **Premium 限定**: `{selectedTicker && plan === 'premium' && <PriceLadder />}` — mockup は常時表示 (`アナリスト目標/pivot/現在/50日線/サポート/リスク`)。実装では `premium` plan 以外に非表示 |
| ladder rung 構成 6 本 (アナリスト目標/pivot/現在/50日線/サポート/リスク確認ライン) | UNVERIFIED | `PriceLadder.jsx` (未読) | PriceLadder 内部の rung 構成は未確認。6 rung かどうか UNVERIFIED |
| buyq「ブレイクアウト強度（参考）」行 | MISSING | L4 section に対応行なし | mockup `.buyq` 行「ブレイクアウト強度（参考）O'Neil 基準: ブレイク時 出来高 +40%」が実装に対応なし（`BreakoutZoneCard` は `isBoCardEnabled()` で default OFF の別 component） |
| 「期間別リターン」 l2h + ret-grid 4列×2段 (1W/1M/3M/6M/1Y/3Y/5Y/10Y) | MATCH | `JudgmentDetail.jsx` L908-917 `ReturnGrid` | `ReturnGrid` splitByTerm sectionLabel="期間別リターン"。8 期間グリッド |
| **TechnicalIdentityRibbon** (会社同定 1 行) | EXTRA | `JudgmentDetail.jsx` L888-891, `TechnicalIdentityRibbon.jsx` | mockup にない。2026-06-28 追加。ロゴ + 社名 + 和文 1 行 + セグメント% の 1 行バー |
| **TechnicalSpyNote** (SPY データ未取得注記) | EXTRA | `JudgmentDetail.jsx` L897 | mockup にない。完全性台帳由来 |
| **BreakoutZoneCard** (default OFF) | EXTRA | `JudgmentDetail.jsx` L899-902 | mockup にない。`isBoCardEnabled()` で default OFF |

---

## L5 図解 (`#figure`)

mockup 構造: 章ヘッダー④「図解で理解する」+ note「Pro」 → `.figure-lock` blur 背景 + overlay CTA（lock SVG + 「この決算を 1 枚の図解で」+「数値の因果を視覚で 2 秒理解」+「Pro で解錠」accent ボタン）

| mockup 要素 | 判定 | 実装の実状 file:line | 具体差分 |
|---|---|---|---|
| 章ヘッダー `④` + 「図解で理解する」 | MATCH | `JudgmentDetail.jsx` L929-931 | `④` + 「図解で理解する」 |
| 章 note「Pro」 | MATCH | `JudgmentDetail.jsx` L931 | `<span>Pro</span>` |
| free 時: blur 背景 + CTA lock + 「この決算を 1 枚の図解で」+「Pro で解錠」 | DRIFT | `JudgmentDetail.jsx` L935-958 `PremiumLock` | mockup は custom `.figure-lock` + `.figure-blur` + `.figure-cta`（lock SVG/「数値の因果を視覚で 2 秒理解」/accent ボタン）。実装は `PremiumLock` component (`feature="ai_diagram"`, `label="図解で 5 条件・ビジネスを 2 秒で理解"`) で wrap。label 文言が「この決算を 1 枚の図解で」 → 「図解で 5 条件・ビジネスを 2 秒で理解」に変更。blur 背景も `div` (rgba 0.04 bg) と mockup の stripes と異なる |
| Pro/Premium 時: `StickyDiagramAccordion` | MATCH (要素として) | `JudgmentDetail.jsx` L935-939 | mockup には Pro 時の表示なし（mockup は lock 状態のみ）。実装は Pro 時 `StickyDiagramAccordion` を render |

---

## L6 その他 (`#more`)

mockup 構造: 章ヘッダー⑤「その他」(ch-note なし) → fold 行 5 個（アナリスト視点 / 市場の声 / 過去8Q決算反応 / Insider取引 / ニュース·IR·10-K）

| mockup 要素 | 判定 | 実装の実状 file:line | 具体差分 |
|---|---|---|---|
| 章ヘッダー `⑤` + 「その他」 | MATCH | `JudgmentDetail.jsx` L969-972 | `⑤` + 「その他」 |
| ch-note なし | MATCH | `JudgmentDetail.jsx` L969-972 | 章ヘッダーに note span なし。mockup 同様 |
| fold ①: アナリスト視点 + f-sum「目標 $305 · n=37 · 更新 6/15」 | DRIFT | `MarketEvalSection.jsx` (isV5=false 経路) | **fold でなく直接 mount**: `JudgmentDetail.jsx` L974-990 は `MarketEvalSection` を `isV5={false}` で render。MarketEvalSection 内では `isV3=true` 時 `ChapterTabs`（アナリスト視点 / 市場の声 tab）か `AccordionSection`（アナリスト視点）として表示。Chapter 章扉も出力する（「市場評価」見出し）。mockup は fold 1 行だが実装は独立セクション化 |
| fold ②: 市場の声 + f-sum「直近ニュースの論点要約」 | DRIFT | `MarketEvalSection.jsx` InsightsPanel | isV3=true では ChapterTabs の tab 2 として、isV3=false では AccordionSection として表示。f-sum「直近ニュースの論点要約」は出ない（AccordionSection title は「市場の声」のみ）|
| fold ③: 過去8Q決算反応 + f-sum | MATCH | `JudgmentDetail.jsx` L991-1009 `AccordionSection` id="sec-v6-earnings-reaction" | `AccordionSection` title="過去 8Q 決算反応" label="PRO" + `EarningsReactionPanel`。fold 構造一致 |
| fold ④: Insider取引 + f-sum「直近 90 日の売買」 | MISSING | L6 section に Insider 取引 fold なし | mockup にある「Insider 取引」fold が実装に見当たらない。`ContextSection` や `MarketEvalSection` にも InsiderPanel 相当なし |
| fold ⑤: ニュース·IR·10-K + f-sum「一次ソースへのリンク」 | DRIFT | `ContextSection.jsx` L105-173 | mockup は fold 1 個「ニュース · IR · 10-K」。実装では「最新ニュース」/「IR Links」/「10-K (年次報告書)」と **3 個の別々の AccordionSection** に分割。まとめて 1 fold にはなっていない |
| **MarketEvalSection の章扉「市場評価」** | EXTRA | `MarketEvalSection.jsx` L44-51 | mockup の L6 には「市場評価」見出しなし。実装では `ChapterSection chapterNumber="II" chapterTitle="市場評価"` (isV5=false 時) や `ChapterHeader label="市場評価"` が L6 内に表示される。mockup の「その他」chapter の先頭に唐突な章扉が現れる |
| **DirectReport (AI 詳細レポート) fold** | EXTRA | `ContextSection.jsx` L177-230 (isV4=true なので `!isV4` で非表示) | `isV4={true}` のため非表示。有効 EXTRA でない |
| **関連記事リンク** | EXTRA | `JudgmentDetail.jsx` L1036-1065 | mockup になし。P3.7 追加 |

---

## 末尾 footnote

| mockup 要素 | 判定 | 実装の実状 file:line | 具体差分 |
|---|---|---|---|
| `<p class="footnote">` 出典方針 | MISSING | `JudgmentDetail.jsx` 全体に対応なし | mockup の footnote「数値はモックアップ用のサンプル。実装時は SEC/FMP（数値）> KB（観点）の出典 footer を各セクションに付与…」相当の全体 footnote が実装にない。ただし各 section に個別 cite（L1SummaryBuckets の出典、EarningsGrowthSpark の出典等）あり |

---

## isV5 dead branch / ContextSection isV5 prop 確認

| 確認事項 | 事実 |
|---|---|
| `ContextSection` の `isV5` prop | `JudgmentDetail.jsx` L1023 `isV5={false}` で渡される。v6 唯一経路では isV5=false が固定 |
| `MarketEvalSection` の `isV5` prop | `JudgmentDetail.jsx` L982 `isV5={false}` で渡される。同様に v6 では false 固定 |
| `ContextSection` 内の isV5 分岐 | `ContextSection.jsx` L97-103: isV5=true → `chapterNumber="④" chapterTitle="リファレンス"` 章扉, isV5=false → `chapterNumber="③"` または `ChapterHeader` |
| `MarketEvalSection` 内の isV5 分岐 | `MarketEvalSection.jsx` L45-51: isV5=true → `chapterNumber="③" chapterTitle="市場評価"`, isV5=false → `chapterNumber="II"` またはレガシー ChapterHeader |
| **結論** | v6 経路では両 component とも `isV5={false}` 固定。`isV5=true` ブランチは dead branch（v5 旧経路の残骸）。v6 実装で `isV5={false}` 経路のみが実際に実行される |

---

## L6 が fold 化されているか直接 mount かの事実確認

| L6 要素 | fold / AccordionSection か | 詳細 |
|---|---|---|
| アナリスト視点 | `AccordionSection` (isV3=false 時) または `ChapterTabs` (isV3=true 時) | `MarketEvalSection.jsx` L98-117。isV3 default ON のため通常は ChapterTabs の tab として表示（fold でない） |
| 市場の声 | ChapterTabs の tab 2 (isV3=true 時) または `AccordionSection` (isV3=false) | `MarketEvalSection.jsx` L65-87 |
| 過去 8Q 決算反応 | `AccordionSection` (defaultOpen=false) | `JudgmentDetail.jsx` L992-1008 |
| Insider 取引 | 実装なし (MISSING) | — |
| ニュース | `AccordionSection` | `ContextSection.jsx` L111-127 |
| IR Links | `AccordionSection` | `ContextSection.jsx` L139-154 |
| 10-K | `AccordionSection` | `ContextSection.jsx` L159-173 |
| **結論** | アナリスト視点・市場の声は isV3=true 時に ChapterTabs（tab 切替）として**直接 mount**。過去8Q/ニュース/IR/10-K は AccordionSection (fold)。mockup の「全 fold」とは異なる |

---

## L1 arrival glow / `.five` 発光の実装有無

| 確認事項 | 事実 file:line |
|---|---|
| `.five` card に glow (border cyan + box-shadow) | UNVERIFIED — `FiveConditionsCard.jsx` は本監査で未読。`JudgmentDetail.jsx` L820 で `<FiveConditionsCard v5Header={true} ...>` を render。mockup の `.five` は `border: 1px solid rgba(56,189,248,.22)` + `box-shadow: 0 0 0 1px rgba(56,189,248,.10), 0 8px 34px rgba(56,189,248,.08)` |
| `is-arriving` class / `useArrivalSpotlight` | `Hero.jsx` は `Card` component を使用。`VerdictHero.jsx` (未読) が `verdict="unknown"` で glow tint を制御。v6 では verdict 固定 "unknown" なので Tier S glow は発火しない可能性が高い |
| `data-spotlight="card"` による arrival glow | `VerdictHero.jsx` 未読のため UNVERIFIED。ただし v6 では `verdict="unknown"` 固定であり、`is-arriving` の cyan glow が常時点灯していた bug を `data-spotlight-skip="1"` で防ぐ対策が `JudgmentDetail.jsx` L447-465 (空 state の placeholder) にある |
| **mockup の「★唯一の発光」= `.five` のみという設計が実装で維持されているか** | UNVERIFIED。FiveConditionsCard.jsx 未読のため断言不可 |

---

## 総括: 層ごとの MATCH/DRIFT/MISSING/EXTRA 件数

| 層 | MATCH | DRIFT | MISSING | EXTRA |
|---|---|---|---|---|
| L0 同定 | 8 | 2 | 1 | 4 (うち2は実質無効) |
| L1 判定サマリー | 9 | 3 | 0 | 3 |
| 目次 (TOC) | 3 | 1 | 0 | 1 |
| hairline | 7 | 0 | 0 | 0 |
| L2 決算 | 8 | 4 | 0 | 5 |
| L3 品質・継続性 | 5 | 2 | 0 | 2 |
| L4 テクニカル・買い場 | 3 | 2 | 2 | 3 |
| L5 図解 | 2 | 1 | 0 | 1 |
| L6 その他 | 2 | 3 | 2 | 2 |
| 末尾 footnote | 0 | 0 | 1 | 0 |
| **合計** | **47** | **18** | **6** | **21** |

---

## インパクト大の乖離 トップ 10

1. **L4: PriceLadder が `premium` plan 限定** (`JudgmentDetail.jsx` L904-906)  
   mockup は常時表示の中核要素。free/pro ユーザーには価格ラダーが全く見えない。

2. **L6: アナリスト視点・市場の声が fold でなく `ChapterTabs` として直接 mount** (`MarketEvalSection.jsx` L55-87)  
   mockup は fold 累進開示。実装は isV3=true (default ON) で tab UI として展開される別設計。さらに「市場評価」章扉が L6 内に突出。

3. **L6: Insider 取引 fold が MISSING** (L6 section 全体を確認)  
   mockup fold ④「Insider 取引・直近 90 日の売買」が実装に対応なし。

4. **L6: ニュース/IR/10-K が 1 fold でなく 3 つの別々の AccordionSection** (`ContextSection.jsx` L105-173)  
   mockup は 1 fold「ニュース · IR · 10-K」。実装では 3 fold に分割 (視覚的重量が 3 倍)。

5. **L2: EarningsFlashSummary が mockup の「シンプル 3 列 earn-grid」より大幅に情報拡張** (`EarningsFlashSummary.jsx` 全体)  
   mockup の `earn-grid` は k/v/c の 3行3列。実装は 5列グリッド + 下段 (部門別/粗利率) + 来期 grid + カードヘッダー帯 + count-up + コピーボタン = 見た目の「密度」が mockup の 3-4 倍。

6. **L0: セクター pill が MISSING** (Hero.jsx 確認範囲)  
   mockup L0 の meta pill 2 個のうち「テクノロジー」セクター pill が実装に見当たらない。

7. **L0: 「1W / 1M リターン小行」が L4 に降格** (`ReturnGrid` は L4)  
   mockup は L0 内 id-price の第 3 行に「1W −4.78% · 1M −9.19%」。実装では ReturnGrid として L4 の独立 section に移動 (Sprint 2-B 降格)。L0 からパフォーマンス情報が失われている。

8. **L4: 「順張りシグナル 一部」chapter note が MISSING** (`JudgmentDetail.jsx` L882-885)  
   mockup の `<span class="ch-note">順張りシグナル 一部</span>` が章ヘッダー右端に実装されていない。

9. **L4: buyq「ブレイクアウト強度（参考）」行が MISSING** (L4 section)  
   mockup 409行: `<div class="buyq">ブレイクアウト強度（参考）</div>` が実装になし。`BreakoutZoneCard` は default OFF の別 component で概念的に近いが直接対応でない。

10. **L5: PremiumLock の CTA 文言が mockup と異なる** (`JudgmentDetail.jsx` L944-946)  
    mockup: 「この決算を 1 枚の図解で」+「数値の因果を視覚で 2 秒理解」。実装: `label="図解で 5 条件・ビジネスを 2 秒で理解"` (PremiumLock の単一 label)。mockup の 2 行構成と差がある。
