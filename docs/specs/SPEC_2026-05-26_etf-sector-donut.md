# SPEC 2026-05-26: ETF Phase 2 — sector breakdown bar → donut chart 化

## 1. Context

### user prompt 原文
> ETF Phase 2: sector breakdown を bar chart から donut chart 化したい (handover v118 ETF Step 3 P2 の一部)。

### 背景
- handover v118 §「ETF 完全対応」 で **Step 3 (P2): Holdings Top10 + Sector donut** が 2 人日見積で計画済 (v117 R9 で 1 人日進捗、 残 P2 部分)
- handover v119 §「次 session 最優先タスク 3」 として 1.5 人日に scope 圧縮で再計画
- **現状 `EtfOverviewPanel.jsx`**:
  - `SectorBar` component (159-212 行) が 11 sectors を縦並列 bar chart 表示
  - 各行 `120px label + 8px height bar + 60px %` 計 11 行 (推定 11 × 32px ≈ 352px 高)
  - mobile viewport (< 480px) で section が縦長、 視認性低い
  - 「テクノロジー 35%」 のような支配 sector を読み取るのに視線移動 4-6 回必要
- recharts は既存 4 component で使用中 (`EarningsHistoryChart.jsx` / `Sparkline.jsx` / `StockPriceChart.jsx` / `HistoryChart.jsx`)、 `PieChart` / `Pie` / `Cell` は **未使用** → 新規 import
- backend は変更不要 (`/api/etf-info/{ticker}` で `sectors[]` 取得済、 `industry` + `exposure` field)

### なぜ今やるか (memory anchor 根拠)
- handover v119: 「ETF Phase 2 sector donut chart (1.5 人日)」 として明示計画中
- [[project-fmp-ultimate-deferred]] により Step 3 P3 (同カテゴリ比較 / dividend / tracking error) は release 後送り、 P2 (donut) は Premium plan で完結する **release MVP 含み** タスク
- v118 では SectorBar の縦並列が user dogfood で 「縦長 / 視認性低」 と直接指摘されてはいないが、 v119 task list で 1.5 人日として登録 = 開発者観点での improvement
- TTM Panel Sprint 4 deploy 待ち中 = 並行着手可能な独立タスク

### 期待される成果 (5 原則のどれに貢献するか)
1. **§1 読み手に負担をかけない (2 秒理解)** — 「dominant sector が一目」 = donut 中央視点固定で OK、 縦走査不要
2. **§3 シンプルかつリッチ** — 縦 352px → 縦 220-260px に圧縮、 mobile での scroll 距離削減 + circle shape の richness
3. **§5 図解で認知コストを下げろ** — 「テクノロジー 35%」 が長文より pie で即理解、 ETF の性格 (broad / sector / themed) を shape で視認

非該当原則:
- §2 毎日開きたくなる — ETF panel 自体は ticker 入力時のみで 「毎日」 軸とは独立
- §4 1 クリックを減らせ — 同一クリック数

### 関連必読 memory anchor (Generator 実装時に必ず Read)
1. **[[feedback-chart-overlay-safety]]** — Recharts 新規 chart 追加時 4 層防御 (ErrorBoundary / conditional render / Number guard / isAnimationActive=false)
2. **[[feedback-no-baseline-cyan]]** — panel-card baseline は neutral 維持、 cyan は brand emphasis に限定
3. **[[feedback-cls-envelope-pattern]]** — chart fetch 完了前後 CLS を minHeight envelope で吸収
4. **[[feedback-press-feedback-delta]]** — animation forwards fill の transform 独占罠 (donut の active slice expand で再発 risk)

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

「ロビーで pie chart のような円形シンボル = 中央フォーカスで視線が落ち着く」。 縦並列 bar は「壁一面の指標」、 donut は「テーブル中央の宝石」。 5 感情語彙に照らすと:

- **驚き**: 11 sectors を縦走査 → 円グラフ 1 瞥で「テクノロジーが約 1/3」 と即理解 → 「速っ!」
- **豪華さ**: cyan→gold gradient が donut 周縁で連続的に光る (現状の bar gradient 1 行 × 11 → ring 形状 1 連)
- **興奮**: hover で sector 1 slice が outer 方向に 2-3px 拡張 (Aman 比喩: 「指差された宝石が浮き上がる」)
- **洗練さ**: Bloomberg / Linear / Apple Stocks の sector breakdown はほぼ全て donut / pie 採用 → 業界標準準拠
- **楽しい**: legend hover で slice highlight + slice hover で legend underline の双方向リンク (nice-to-have)

`feedback_brand_aspiration.md` anchor を破壊しないこと: 「Aman/Ritz-Carlton 級」 anchor は SectorBar の cyan→gold gradient を donut で **そのまま継承** する設計 (新規色追加なし)。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言との整合 3 項目:

1. **LP 訴求**: 「米国株決算分析」 = ETF も米国上場前提なので donut chart 表示は LP 訴求の延長線 ✓
2. **LP 訴求**: 「無料お試し 3 銘柄/日」 = ETF も demo rate limit に含まれる (handover v118 で確認済)、 donut chart 化で API call 増えない (`/api/etf-info` 1 回で sectors[] 取得済) → demo 体験劣化なし ✓
3. **LP 訴求**: 「登録不要」 = donut hover に login 要求 modal を出さない (interaction は client-side のみ) ✓

ETF Panel 自体の Trust Cliff DoD ([[feedback-diagram-quality-guard]]):
- 「ETF 専用の主要指標をお届けします。 構成銘柄の分散状況がひと目でわかります。」 という現状 panel description は **donut 化で強化される** (「ひと目で」 = pie で即実現)
- 「機関投資家」 等の禁止語は SectorBar にも donut 版にも一切出てこない (numeric + sector label JP のみ) ✓

---

## 4. Hallucination Guard 適合

**LLM 呼び出しを含むか**: **NO**

donut chart は backend `/api/etf-info` から返る `sectors[].industry / .exposure` の純粋な numeric data + 静的 dictionary `SECTOR_LABEL_JP` (EtfOverviewPanel.jsx:97-109) の組合せ。 LLM narration 一切なし。

「LLM 不要、 静的 dictionary / Python 計算で完結」 と明記:
- backend: 既存 `app/main.py` の `/api/etf-info/{ticker}` (FMP `/stable/etf-sector-weightings` raw fetch、 LLM 経由なし)
- frontend: `SECTOR_LABEL_JP` map (11 sector 英→日) は EtfOverviewPanel.jsx に既存、 donut でも同 dict を再利用
- 「ちょっとだけ LLM に narration」 の近道は採らない (CLAUDE.md Hallucination Guard ルール遵守)

4 重防御適用判定: **不適用** (LLM 不在のため、 pre-commit hook / NEGATIVE_EXAMPLES / sanitize / sources schema いずれも N/A)。

---

## 5. スプリント分割 (上限 6、 本 SPEC は 4 sprint)

### Sprint 1: SectorDonut primitive 新規作成

**目的**: 11 sector × exposure を recharts `PieChart` + `Pie` + `Cell` で donut 描画する純粋 component を作る。 既存 SectorBar とは独立 (mount は Sprint 3 で行う)。

**触るファイル**:
- `frontend/src/components/EtfOverviewPanel.jsx` 内に **`SectorDonut` function component を追加** (新規 file は作らない、 SectorBar と共存させ Sprint 4 で切替)
- alt: `frontend/src/features/judgment/primitives/SectorDonut.jsx` を新規作成 (ReturnGrid と同じ primitive pattern) ← **推奨** (Generator 判断、 etf 専用なら inline、 将来個別株 holding にも使うなら primitive 切出し)

**呼ぶ既存 skill**:
- `chart-tab` (Recharts pattern 参照、 既存 4 chart の Cell 色設定方法)
- `designing-workspace-ui` (workspace mode 500-900px / mobile <480px の responsive 設計)
- `design-system-check` (raw hex 禁止、 token のみ確認)

**完了判定基準**:
- [ ] `<SectorDonut sectors={[{industry, exposure}, ...]} />` が render 可能
- [ ] 11 slice すべて Cell `fill` が token から生成 (cyan → gold gradient 11 段階補間)
- [ ] `Number.isFinite` validation を `exposure` 全件に適用、 NaN/Infinity は filter out
- [ ] `isAnimationActive={false}` 全 Cell + Pie に設定 ([[feedback-chart-overlay-safety]] 遵守)
- [ ] `ResponsiveContainer width="100%" height={220}` で aspect 固定 + CLS envelope
- [ ] `npm run build` 成功

### Sprint 2: Legend layout (sector 名 + %)

**目的**: donut 右側 (desktop) / 下側 (mobile) に sector 一覧を grid 表示。 legend item は color dot + sector 名 + exposure% の 3 要素。

**触るファイル**:
- Sprint 1 で作った `SectorDonut` 内に Legend を統合 (recharts 標準 `<Legend>` を使うか custom legend かは Generator 判断、 **custom 推奨** = Bloomberg/Linear 流の数値右揃え)

**呼ぶ既存 skill**:
- `chip-primitive-canonical` (sector legend item を Chip primitive に寄せるか判断、 軽量 inline でも可)
- `designing-workspace-ui` (workspace responsive layout、 `grid-template-columns: 1fr 1fr` mobile / `1fr` desktop)

**完了判定基準**:
- [ ] desktop (>= 600px): donut 左 (220×220) + legend 右 (1 列) の 2 column layout
- [ ] mobile (< 480px): donut 上 (220×220 center) + legend 下 (2 列 grid)
- [ ] 各 legend item は `[●] テクノロジー  35.20%` 形式、 数値 `tabular-nums` + 右揃え
- [ ] color dot は donut の Cell fill と 1:1 一致 (色 token 共有 useMemo)

### Sprint 3: EtfOverviewPanel に SectorDonut mount + SectorBar 撤去

**目的**: 既存 SectorBar 並列 render を SectorDonut に切替。 「セクター構成」 section header はそのまま維持。

**触るファイル**:
- `frontend/src/components/EtfOverviewPanel.jsx`:
  - 313-338 行 (現状 `{sectors.length > 0 && (...)}` ブロック) を SectorDonut mount に置換
  - 内部 `SectorBar` function component (159-212 行) は削除 OR コメント保持 (Generator 判断、 死コード削除推奨)
- mount 位置は **現状と同じ** (Row 2 直下、 StockPriceChart の直前)

**呼ぶ既存 skill**:
- `design-system-check` (`var(--color-accent)` / `var(--color-gold)` token 使用確認、 raw hex 禁止)
- `pge-loop-debugger` (worktree 累積確認、 SectorBar 削除と SectorDonut mount は同 sprint 内で必ず両方 commit)

**完了判定基準**:
- [ ] `[data-testid="etf-overview-panel"]` 内に `[data-testid="etf-sector-donut"]` が render
- [ ] 旧 SectorBar div (gridTemplateColumns: '120px 1fr 60px') が DOM に存在しない (本番 bundle grep で確認)
- [ ] section header 「セクター構成」 文字列維持 ([[feedback-no-baseline-cyan]] gold color 維持)
- [ ] sectors.length === 0 のとき section 自体非表示 (R9.3 仕様維持)
- [ ] SPY / VOO / ARKK / XLK / XLF の 5 ETF で donut が正常表示

### Sprint 4: responsive + hover interaction + Auto-PDCA verify

**目的**: mobile fallback 確認 + hover で slice 拡張 (nice-to-have) + snap-pdca-loop で視覚 verdict。

**触るファイル**:
- `SectorDonut` component (Sprint 1 で作った場所、 hover handler 追加)
- `frontend/scripts/snap-pdca-loop.mjs` を起動 (visual harness exception 4 条件遵守、 新規 snap-*.mjs 作成は不要、 既存 script 利用)

**呼ぶ既存 skill**:
- `vision-eval` (Auto-PDCA で「donut が circle 形状で表示されているか」 verdict)
- `qa-dogfooder` (mobile viewport iframe / DevTools responsive で確認)
- `pge-loop-debugger` (snap-pdca-loop.mjs の 60s teardown 遵守)

**完了判定基準**:
- [ ] desktop (width >= 600px): donut 220×220 + legend 右 1 column
- [ ] tablet (480-600px): donut 200×200 + legend 下 2 column
- [ ] mobile (< 480px): donut 180×180 + legend 下 2 column grid
- [ ] hover で active slice が outer 方向に 4px 拡張 + 0.15s ease (Recharts `activeIndex` + `activeShape` pattern)
- [ ] snap-pdca-loop.mjs で `--check "セクター構成 section が donut chart (円形) で 11 sector slice + legend で表示されているか" --selector "[data-testid='etf-sector-donut']" --ticker SPY` が `verdict: "pass"` を返す
- [ ] 5 ETF (SPY / VOO / ARKK / XLK / XLF) で本番 bundle smoke test

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

### 永続禁止 (本 sprint 全体)
- `backend/app/visualizer/prompt.py` (Hallucination Guard pre-commit Check 1) — 本 sprint LLM 不在のため無関係だが永続禁止
- `backend/app/aggregator/*.py` への LLM SDK import (pre-commit Check 3) — 同上
- `backend/app/visualizer/prompt_negatives.py` (法務 anchor) — 同上
- `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX (typo は OK) — 同上
- `.claude/launch.json` (人間用)
- `migrations/*.sql` (DB schema)
- `handover_*.md` (read-only reference)
- `railway.toml` cron 定義
- `frontend/src/App.jsx` の sticky 検索 div (8 回試行錯誤の安定領域)
- `.panel-card / .bs-panel / .surface-card` 関連 CSS (発光バグ高リスク) — donut は EtfOverviewPanel 内に既存の `bs-panel` host を再利用、 新規 panel CSS class **追加禁止**

### 本 sprint 特有禁止
- **`frontend/src/features/judgment/primitives/ReturnGrid.jsx`** (Sprint 4 着地済、 v119 R9.6.1 hotfix で安定) — 触らない
- **`frontend/src/components/TtmValuationPanel.jsx`** (TTM Panel Sprint 4 deploy 待ち中、 並行 deploy 競合回避) — 触らない
- **`backend/app/main.py` の `/api/etf-info/{ticker}` endpoint** — backend 変更不要、 sectors[] が既に返っている
- **`frontend/src/components/StockPriceChart.jsx`** (handover v75 真っ白事故の SSOT chart、 別 chart 触らない)
- **`frontend/src/index.css`** の発光系 (`.bs-panel` / `.panel-card` / 発光 box-shadow) — donut の hover effect は inline style + Cell fill のみで実現、 CSS 追加禁止
- `frontend/scripts/snap-*.mjs` の **新規作成禁止** — 既存 snap-pdca-loop.mjs を CLI 引数で呼び分ける (`--check / --selector / --ticker`)

---

## 7. multi-review 必要性判定

### 3 軸チェック
1. **LLM 出力品質 (景表法 / 金商法 / hallucination risk)**: **inactive** — LLM 一切呼ばない、 純粋 visualization 切替
2. **Trust Cliff (LP 訴求 vs 実装の整合)**: **inactive** — 文言変更なし、 chart shape のみ変更
3. **新 backend endpoint + RLS / 認証境界 + cache 設計**: **inactive** — backend 完全無触

### 判定結果
**→ 3 体合議で十分** (3 軸すべて inactive、 frontend 局所修正のみ、 設計判断 limited)

### 推奨 reviewer 構成
- **ui-designer** (donut layout / hover interaction / Aman 比喩品格チェック)
- **frontend-architect** (Recharts PieChart + ResponsiveContainer + Cell 設計、 CLS envelope)
- **qa-dogfooder** (5 ETF mobile/desktop smoke test、 snap-pdca-loop verdict)

cost: Sonnet 3 体並列 (1 message)、 Opus 不要 ([[feedback-cost-efficient-operation]] 遵守)。

---

## 8. 想定リスク + roll-back plan

### リスク 1: Recharts PieChart 初 mount で `Number.isFinite` 漏れ → 真っ白事故
- 原因: `exposure` が backend で `null` / `undefined` / 文字列で返る ETF (少数だが SOXL 等で過去前例)
- 対策: SectorDonut 内で `sectors.filter(s => Number.isFinite(s.exposure))` を必ず適用 ([[feedback-chart-overlay-safety]] 4 層防御 §3 Number guard)
- 検知: `npm run build` 後の本番 deploy で 5 ETF smoke test 必須

### リスク 2: ResponsiveContainer の CLS (donut fetch 完了前後で section 高さ変動)
- 原因: 初期 `sectors=[]` → `sectors=11 件` で section 高さが 0 → 280px にジャンプ
- 対策: `<section style={{ minHeight: 280 }}>` の minHeight envelope ([[feedback-cls-envelope-pattern]] 遵守)
- 検知: snap-pdca-loop.mjs で `--check "fetch 完了前後で CLS 発生していないか"` も option 追加

### リスク 3: 11 slice 中、 dominant sector (Technology 35%+) が pie の大半を占有して残り 10 slice が判別不能
- 原因: Technology-heavy ETF (QQQ / XLK / SOXX 等) で当然発生
- 対策: legend 側で全 11 sector を **数値降順 + tabular-nums** で並べる → donut で判別不能でも legend で 100% 補完
- 検知: QQQ で donut + legend を目視確認

### リスク 4: hover で active slice 拡張時に donut が clipping (panel border-radius と衝突)
- 原因: panel-card の `overflow: hidden` 内で slice が outer に拡張すると切れる
- 対策: SectorDonut の wrapper `div` に `padding: 8px` を確保、 + ResponsiveContainer に余白
- 検知: snap-pdca-loop で hover state を撮るのは困難なので人間 dogfood に委ねる ([[feedback-vision-api-noise]] 静止 PNG では motion 検知不能)

### 緊急 roll-back 手順
```bash
# 1. git revert で SectorDonut 関連 commit を打消し
cd /Users/yamadadaiki/Projects/beatscanner
git log --oneline -10 | grep -i "donut\|sector"
git revert <commit-hash>  # Sprint 3 mount commit を最優先 revert (SectorBar 復活)

# 2. Railway redeploy
railway up

# 3. 本番 bundle hash 変更確認
curl -s https://beatscanner-production.up.railway.app/ | grep -o 'index-[a-zA-Z0-9]*\.js' | head -1

# 4. SectorBar が DOM に復活していること confirm (5 ETF smoke test)
```

**roll-back 影響範囲**: ETF Panel の sector breakdown のみ。 ReturnGrid / TTM Panel / 個別株 Pane 3 への blast radius **ゼロ** (SectorDonut は独立 component、 props interface 不変)。

---

## 次 step (Generator subagent への引き継ぎ)

- **SPEC path**: `/Users/yamadadaiki/Projects/beatscanner/docs/specs/SPEC_2026-05-26_etf-sector-donut.md`
- **Sprint 1 指示**: SectorDonut primitive を `frontend/src/features/judgment/primitives/SectorDonut.jsx` 新規作成。 recharts `PieChart` + `Pie` + `Cell` + `ResponsiveContainer` で 11 sector × exposure を donut 描画。 cyan → gold gradient 11 段補間。 [[feedback-chart-overlay-safety]] 4 層防御 (ErrorBoundary / Number.isFinite / isAnimationActive=false / conditional render) 必須。 testId="etf-sector-donut" 設定。
- **multi-review trigger**: Sprint 3 完了時 (EtfOverviewPanel mount 着地) に 3 体合議 (ui-designer + frontend-architect + qa-dogfooder) を 1 message 並列起動
- **deploy gate**: Sprint 4 完了 + snap-pdca-loop verdict pass + 5 ETF smoke test pass で `railway up`
