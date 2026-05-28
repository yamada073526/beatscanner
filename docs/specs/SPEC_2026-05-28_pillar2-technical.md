# SPEC 2026-05-28: Pillar 2「テクニカル分析」 昇格 — じっちゃま 1 本足から 2 本柱へ

> **起票日**: 2026-05-28 (planner subagent 自律起票)
> **承認 status**:
>   - **Sprint 1+4+5+6**: 🟢 着地完了 (commit 8f4680e + R1 hotfix f6da250 + R2 hotfix 852a399)
>   - **Phase 4-A/B/C**: 🟡 6 体合議 verdict 集約済、 **user gate 3 通過後着手** (handover v125 §Phase 4 verdict 集約参照)
> **trigger**: user prompt 「BeatScanner の戦略的再設計、 テクニカル分析を pillar 2 に昇格」 (午前) + grill-me 9 件 verdict
> **owner**: planner subagent → Generator subagent (Phase 1-3 着地済、 Phase 4 は user gate 後)
> **est 総工数**: 6 phase / **8.5-12.0 人日** (Phase 4 含む。 Sprint 1-6 着地済 = 3.7 人日相当、 Phase 4 残り 4.8-6.3 人日)
> **multi-review 判定**: §7 参照 (Phase 4 6 体合議 verdict 受領済、 patch list は §11 に集約)

---

## 1. Context

### 1-A. user prompt 原文

> 「BeatScanner の戦略的再設計、 テクニカル分析を pillar 2 に昇格して。 Pane 1 スクリーナー entry / Pane 3 順序入替 / 売り card 追加 / IBD 50DMA extension dynamic line / analyst target card / 図解 sticky button。 grill-me 9 件 verdict 済」

### 1-B. なぜ今やるか (background)

1. **じっちゃま 5 条件 1 本足の retention 限界**: handover v124 + v123 dogfood で「Pane 3 ファンダ詳細は深いが、 売り timing / 急上昇 / IBD 系シグナルが欠落」 と user feedback。 5 条件 (RGE/PGE/CSM/EBM/RSM) は **buy gate** だが **sell / momentum gate** が不在
2. **既存資産が既に揃っている**: Cup-with-Handle Phase 2 nightly cron 本番稼働 (v84 着地) + RS percentile 計算 (project_cup_handle_phase2) + FMP Active で /stable/price-target-consensus 取得可 (project_fmp_ultimate_deferred) → **新規 API 契約不要** で pillar 2 構築可
3. **「毎日開く」 KPI lever**: 5 条件は四半期決算 trigger (年 4 回 / 銘柄)、 テクニカルは **daily trigger** (RS 急上昇 / Cup-Handle 検出 / 50DMA extension)。 retention 7d 45%→55% goal の最強 lever ([[project-home-personalization]] 系 anchor)
4. **release MVP gate 通過前の最後の差別化追加**: v124 で article auto-publish + Russell 3000 着地済、 release 直前段階。 testimonial 取得前に「テクニカル pillar 2」 を premium 訴求の core に据える必要 ([[feedback-pre-release-priority]])

### 1-C. 期待される成果 (5 原則寄与 mapping)

| 原則 | 寄与 mechanism |
|---|---|
| §1 **読み手に負担をかけない (2 秒理解)** | Pane 3 順序入替で「図解 sticky / Chart / 目標+売り / ファンダ」 → 視線移動 1 列、 売り zone はチャート上 dynamic line で「赤帯=危険、 灰=普通」 を 1 秒判別 |
| §2 **毎日開きたくなる** | Pane 1 スクリーナー Hero「今日の注目 3 セクション」 (O'Neil 交差 / RS 急上昇 / 新規 Cup-Handle 検出) で **daily trigger** が成立 |
| §3 **シンプルかつリッチ** | 売り card は静的 dictionary narration (景表法 / 金商法 safe) + dynamic line は 3 本のみ、 装飾は IBD 公式色 (red50/amber50/cyan brand) |
| §4 **1 クリックを減らせ** | WorkspaceScreenerModal 廃止 + nav 1 本化、 図解 accordion sticky で「scroll 戻り 0 click」 |
| §5 **図解で認知コスト下げる** | 50DMA extension 3 本 line は「移動平均から +25% で climax 危険」 を文字説明なしで視覚化 |

### 1-D. 必読 memory anchor (Generator 起動前に必ず Read)

- [[project-cup-handle-design]] 6 体合議 5 賛成 1 反対、 Premium 限定、 じっちゃま推奨 anchor
- [[project-cup-handle-phase2]] nightly scan + multi-review verdict 14 件着地 SSOT
- [[feedback-technical-signal-thresholds]] RS 計算 (self-history percentile) + DMA cross 閾値 + ProTeaser gate
- [[feedback-cup-handle-thresholds]] Phase 1 確定 12 パラメータ SSOT
- [[feedback-chart-overlay-safety]] handover v75 真っ白事故 SSOT (新 Line / ReferenceLine 追加時 4 層防御必須)
- [[project-pane3-visual-explainer-redesign]] v82 multi-review 6 体合議 SSOT (Pane 3 構成変更の前例)
- [[project-pane3-completion-backlog]] Pane 3 既存 7 ブロック構造 SSOT
- [[pane3-pane4-ui-unification]] 和訳トグル UI 統一の前例
- [[feedback-icon-brand-consistency]] アイコン Aman/Ritz-Carlton 級品格チェック (Sell zone card で必須)
- [[feedback-cls-envelope-pattern]] root minHeight envelope (Chart + Card 追加で section 伸縮の risk)

---

## 2. ブランド世界観 (Aman/Ritz-Carlton 級) への適合根拠

「最高級ホテルのロビー」 比喩で言えば、 現状の Pane 3 は「全部屋豪華だが廊下の順序が散らかっている」 状態。 本 SPEC は **5 感情語彙の「興奮 (excitement)」と「楽しい (joy)」** を強化する:

- **興奮**: Pane 1 Hero「今日の注目 3 セクション」 は朝の**心拍数を上げる**仕掛け。 「昨日まで quiet だった銘柄が今日 RS 急上昇 top 5 に入った」 を毎朝発見できる
- **楽しい**: チャート上 50DMA extension の 3 本 dynamic line は「**動く** 危険信号」。 静的画面でなく「市場と一緒に呼吸する」 感覚
- **驚き**: Cup-Handle 検出 chip は「テクニカル professionals の世界」 への入り口、 user が「こんな pattern 見つけてくれるの?」 と感動する moment
- **洗練さ**: 売り card narration は **静的 dictionary** (LLM 排除) で「断定的判断の提供」 ([金商法 §38](#-3-trust-cliff-checklist)) を物理層で回避、 brand 信頼担保
- **豪華さ**: Pane 3 sticky 図解 accordion は「ロビー入口の chandelier」、 default collapsed で詰め込み回避 + click で展開のリッチ感

`feedback_brand_aspiration.md` の anchor (修正禁止) は破壊せず、 5 感情語彙の `興奮` `楽しい` に new evidence を追加するのみ。

---

## 3. Trust Cliff チェックリスト

LP 訴求文言 vs 実装の整合を **3 項目以上** 検証:

| # | LP 文言 / 既存 anchor | 本 SPEC での実装整合 |
|---|---|---|
| 1 | 「登録不要で 3 銘柄/日まで無料試用」 | Pane 1 スクリーナー Hero (今日の注目 3 セクション) は **未ログイン LP で表示しない**。 demo モードでは Hero 領域に「ログインで今日の注目銘柄を解放」 hint のみ表示。 nav 「スクリーナー」 entry も demo 時は disabled + tooltip |
| 2 | 「じっちゃまプロトコル準拠」 | テクニカル pillar 2 化で**じっちゃま 5 条件が薄まらない**。 Pane 3 順序入替で 5 条件 (ファンダ) は **accordion 内**に格納するが、 default 状態は「PASS X/5」 badge が visible (信号品質を 2 秒で判別可能) |
| 3 | 「断定的判断の提供 (金商法 §38) は提供しない」 | Sell zone narration は **静的 dictionary** (`SELL_ZONE_LABEL_JP` パターン、 condition pulse pattern [[feedback-condition-pulse-pattern]] と同構造) で出力。 「売るべき」 「climax だ」 等の断定 BAN、 「IBD ルールでは extension 段階」 等の客観 fact 表記のみ |
| 4 | 「Premium ¥2,000/月 で全機能解放」 | Pane 1 スクリーナー Hero + Pane 3 dynamic line は **無料 tier** で公開 (daily trigger の lever のため)。 Cup-Handle 検出 chip と RS percentile 数値表示は Premium gate 維持 ([[feedback-technical-signal-thresholds]] の ProTeaser localStorage gate を継承) |
| 5 | 既存 ProTeaser「3 銘柄/日まで無料」 | Pane 1 Hero「今日の注目 3 セクション」 の各セクションは demo モードで top 1 (= 1 銘柄) のみ visible、 残り 4 銘柄は blur + ProTeaser overlay。 既存 demo rate limit (3 req/IP/day) と整合 |

---

## 4. Hallucination Guard 適合

### 4-A. LLM 呼び出しを含むか

**no** — 本 SPEC は **数値計算 + 静的 dictionary narration のみ** で完結。 4 重防御の追加実装は不要、 ただし以下 checklist で「LLM 経路混入の罠」 を予防:

| 層 | 本 SPEC への適用 |
|---|---|
| pre-commit Check 1 (`backend/app/visualizer/prompt.py`) | **触らない**。 prompt.py は変更対象外 |
| pre-commit Check 3 (`backend/app/aggregator/*.py` への LLM SDK import BAN) | 新規 endpoint `backend/app/aggregator/price_target.py` 追加時に **anthropic / openai import 一切なし** で実装、 50DMA / 最高値計算は Python の numpy / pandas で完結 |
| NEGATIVE_EXAMPLES (`backend/app/visualizer/prompt_negatives.py`) | **触らない** |
| frontend sanitize (`frontend/src/lib/blocklist.js`) | **触らない** (sell zone narration は静的 dictionary で生成、 LLM 出力ではないため BLOCKLIST_REGEX 通過不要) |
| sources schema + per-source data namespace | analyst target endpoint は新規追加、 `sources: { priceTarget: 'ok' | 'empty' | 'timeout' | 'error' }` envelope を新規 implement、 frontend で `sources.priceTarget === 'ok' && data.priceTarget` の compound check |

### 4-B. 「ちょっとだけ LLM」 への警告

grill-me verdict #4 (Sell zone narration scope) で「**静的 dictionary 一択**、 LLM narration 拡張は Phase 2 でも禁止」 と確定済。 Generator は「ちょっと自然な文章にしたいから LLM 呼ぼう」 という近道に **絶対に踏み込まない**。 Refinitiv 2017 EPS misprint 事件 (機関投資家 6 ヶ月離脱) 前例参照、 信頼毀損 6-12 ヶ月コスト回避。

### 4-C. 静的 dictionary 設計 (sell zone)

```
SELL_ZONE_LABEL_JP = {
  'normal':    '通常レンジ (50DMA 近辺)',
  'extended':  'extension 段階 (50DMA +15-25%)',
  'climax':    'climax warning (50DMA +25%+)',
  'stop_hit':  '8% trailing stop 抵触',
}
SELL_ZONE_DESC_JP = {
  'extended':  'IBD ルールでは 50DMA から +15% 以上で過熱の目安。 段階利確検討領域',
  'climax':    'IBD climax top criteria。 過去 climax run は短期 reversion 確率上昇',
  'stop_hit':  '購入価格から -8% は IBD の universal stop loss',
}
```

「売るべき」 「危険」 等の断定 BAN、 「目安」 「IBD ルールでは」 「過去...確率上昇」 等の客観表現のみ。

---

## 5. スプリント分割 (6 sprint、 上限内)

### Sprint 1: 安全網 — git tag + backup branch + visual baseline 取得 (0.3 人日、 blast radius S)

**目的**: 全 Phase 着手前に復元 path 確保。 Pane 3 順序入替 (Phase 4) は大 blast radius のため roll-back 経路を **必須先行**。

**触るファイル**:
- `git tag pre-pillar2-redesign-2026-05-28`
- `git branch backup/pre-pillar2-2026-05-28`
- `frontend/.visual/baseline-pillar2/` に snap-pdca-loop で Pane 1/3/4 PNG 3 枚取得

**呼ぶ既存 skill**: なし (git ops + snap-pdca-loop script のみ)

**DoD**:
- [ ] git tag `pre-pillar2-redesign-2026-05-28` push 済
- [ ] backup branch origin 同期済
- [ ] `frontend/.visual/baseline-pillar2/` に Pane 1 / Pane 3 (AAPL) / Pane 4 の 3 枚 PNG 保存
- [ ] handover ベース「Pane 3 順序を変える前の状態」 記録 1 行

---

### Sprint 2: backend `/api/price-target-consensus/{ticker}` 新規 endpoint (1.0 人日、 blast radius M)

**目的**: FMP `/stable/price-target-consensus` を叩いて consensus / high / low / analyst_count を返す独立 endpoint。 Pane 3 AnalystTargetCard + チャート overlay line 1 本の data source。

**触るファイル**:
- 新規: `backend/app/aggregator/price_target.py` (LLM SDK import **絶対なし**)
- 新規: `backend/app/api/price_target.py` (FastAPI route)
- 編集: `backend/app/main.py` (route 登録 1 行)
- 編集: `backend/app/api/__init__.py` (export)

**呼ぶ既存 skill**: `fmp-api-retry` (FMP /stable/ 系の retry / backoff pattern SSOT)、 `hallucination-guard` (新規 aggregator/ への import 検査)

**output schema**:
```json
{
  "ticker": "AAPL",
  "data": {
    "priceTarget": {
      "consensus": 195.0,
      "high": 240.0,
      "low": 150.0,
      "analystCount": 32,
      "currency": "USD",
      "updatedAt": 1748428800
    }
  },
  "sources": { "priceTarget": "ok" },
  "signal_quality": "full"
}
```

**DoD**:
- [ ] FMP /stable/price-target-consensus を 5 銘柄 (AAPL/MSFT/NVDA/TSLA/AMZN) で fetch 成功
- [ ] pre-commit hook Check 3 (aggregator LLM import) 通過
- [ ] `sources.priceTarget === 'empty'` (FMP 該当データなし時) の fallback テスト 1 件
- [ ] response cache 6h (Redis or in-memory、 既存 pattern 継承)
- [ ] curl smoke test 1 件 (production deploy 前)

---

### Sprint 3: backend `/api/price-history/{ticker}` に 50DMA + extension 計算追加 (0.7 人日、 blast radius M)

**目的**: 既存 price-history endpoint の response に `dma50` (50 日移動平均、 daily array)、 `dma50_extended_15pct` (50DMA × 1.15)、 `dma50_extended_25pct` (50DMA × 1.25) の 3 array を追加。 frontend ReferenceLine 3 本の data source。

**触るファイル**:
- 編集: `backend/app/aggregator/price_history.py` (50DMA 計算 + 2 extension 計算追加)
- 編集: backend test (新規 array 3 件の値検証)

**呼ぶ既存 skill**: `stock-chart` (StockPriceChart 既存 SSOT)、 `hallucination-guard` (aggregator import 検査)

**DoD**:
- [ ] pandas rolling(50).mean() で 50DMA 計算 (既存 if あれば再利用)
- [ ] `dma50_extended_15pct` = `dma50 * 1.15`、 `dma50_extended_25pct` = `dma50 * 1.25` を array で返却
- [ ] response size 増加 ≤ 30% (3 array × float64) を計測
- [ ] 既存 frontend StockPriceChart は影響なし (3 array は **未使用 field** として静かに追加、 Sprint 5 で消費)
- [ ] backend test pass

---

### Sprint 4: frontend `AnalystTargetCard.jsx` 新規追加 + Pane 3 既存 Chart 直下に配置 (1.2 人日、 blast radius M)

**目的**: grill-me #7 verdict 通り、 Chart 直下に **dedicated card** で consensus / 低-高 range / アナリスト人数を表示。 chart overlay line は Sprint 5 で別途追加。

**触るファイル**:
- 新規: `frontend/src/features/workspace/components/AnalystTargetCard.jsx` (≤ 150 行目安)
- 新規: `frontend/src/features/workspace/components/AnalystTargetCard.css` (token 経由のみ、 raw hex 禁止)
- 編集: `frontend/src/features/workspace/panes/Pane3.jsx` (Chart 直下に `<AnalystTargetCard />` 挿入、 既存順序維持)
- 編集: `frontend/src/lib/api.js` (`/api/price-target-consensus` 呼び出し関数追加)

**呼ぶ既存 skill**: `designing-workspace-ui` (Pane 3 component layout SSOT)、 `shadcn` (Card primitive 再利用)、 `design-system-check` (token / hex / elevation 検査)

**UI 仕様**:
- card title: 「アナリスト目標株価」
- 中央大表示: consensus (例: `$195.00`、 fw700 / 28px)
- 左右 sub: low / high (例: `Low $150 / High $240`)
- 右上 badge: `アナリスト N 人` (chip primitive 経由 [[chip-primitive-canonical]])
- 更新時刻: 「最終更新 X 分前」 (1 分毎 setInterval re-render、 epoch ms 自動判定パターン [[CLAUDE.md 動的データ]])
- partial_failure (`sources.priceTarget !== 'ok'`): 「アナリスト目標株価データ取得失敗」 + retry button (signal_quality 降格 pattern [[feedback-data-completeness-guard]])

**DoD**:
- [ ] AAPL/MSFT/NVDA/TSLA/AMZN 5 銘柄で consensus / high / low / count 表示 OK
- [ ] partial_failure UI verify (FMP rate limit 時に gracefully degrade)
- [ ] design-system-check pass (raw hex / shadow / !important 違反 0)
- [ ] CLS envelope: AnalystTargetCard 最小高さ 120px で fetch 前後の伸縮防止 ([[feedback-cls-envelope-pattern]])
- [ ] snap-pdca-loop で「アナリスト目標株価 card が Chart 直下に visible」 verify

---

### Sprint 5: StockPriceChart に 50DMA + extension 3 本 dynamic line + analyst target overlay 追加 (1.5 人日、 blast radius L)

**目的**: grill-me #5 verdict (IBD 50DMA extension rule) + #7 chart overlay 1 本を **chart-overlay-safety 4 層防御** 遵守で追加。 v75 真っ白事故再発 BAN。

**触るファイル**:
- 編集: `frontend/src/features/workspace/components/StockPriceChart.jsx` (ReferenceLine 4 本追加: 50DMA / +15% / +25% / analyst consensus)
- 編集: `frontend/src/features/workspace/components/StockPriceChart.css` (line color: 50DMA = slate, +15% = amber, +25% = red, analyst = cyan brand)
- 編集: `frontend/src/features/workspace/components/ChartLegend.jsx` (新規 4 legend item 追加 + 説明 tooltip)

**呼ぶ既存 skill**: `stock-chart` (StockPriceChart SSOT)、 `chart-tab` (legend pattern)、 `design-system-check`

**chart overlay safety 4 層防御** ([[feedback-chart-overlay-safety]] 厳守):
1. **ErrorBoundary**: StockPriceChart 全体を ErrorBoundary 包囲 (既存維持確認)
2. **conditional render**: `data?.dma50?.length > 0` で 50DMA Line / `data?.dma50_extended_15pct?.length > 0` で +15% Line / 同様に +25% / `analystTarget?.consensus != null` で analyst Line
3. **Number.isFinite**: 各 array の値を Number.isFinite filter 通し、 NaN/Infinity を chart に渡さない
4. **isAnimationActive=false**: 全 ReferenceLine + 既存 Line の prop に明示

**色運用** (投資業界の色ルール厳守):
- 50DMA = `var(--color-text-tertiary)` (中立、 slate)
- +15% extension = `var(--color-warning)` (amber、 注意)
- +25% climax = `var(--color-loss)` (red、 危険)
- analyst consensus = `var(--color-accent)` (cyan brand、 ニュートラルな情報)
- **シアンを「上昇」 で使わない** ルール遵守 (analyst target は方向性ではなく情報なので OK)

**DoD**:
- [ ] AAPL chart に 4 本 ReferenceLine visible + legend 4 item visible
- [ ] FMP timeout 時に chart 真っ白にならない (ErrorBoundary fallback)
- [ ] dma50 array が null/empty の銘柄 (新規上場 IPO < 50 日) で chart 描画 OK (line だけ skip)
- [ ] snap-pdca-loop 3 run mean で「50DMA / +15% / +25% / analyst line が visible」 verify ([[feedback-vision-api-noise]])
- [ ] design-system-check pass

---

### Sprint 6: SellZoneCard 新規追加 + Chart 直下に AnalystTargetCard と並列配置 (1.0 人日、 blast radius M)

**目的**: grill-me #4 + #6 verdict 通り、 sell zone narration を **静的 dictionary** で出力。 50DMA extension 段階 + 8% trailing stop の 2 シグナルを単一 card に統合。

**触るファイル**:
- 新規: `frontend/src/features/workspace/components/SellZoneCard.jsx` (≤ 200 行目安)
- 新規: `frontend/src/features/workspace/components/SellZoneCard.css`
- 新規: `frontend/src/lib/sellZoneLabels.js` (`SELL_ZONE_LABEL_JP` + `SELL_ZONE_DESC_JP` 静的 dictionary)
- 編集: `frontend/src/features/workspace/panes/Pane3.jsx` (AnalystTargetCard の隣に並列配置、 desktop 2-col / mobile 1-col stack)

**呼ぶ既存 skill**: `designing-workspace-ui`、 `shadcn`、 `design-system-check`、 `hallucination-guard` (sanitize layer 不要だが念のため LLM 呼び出しゼロ確認)

**UI 仕様**:
- card title: 「売り timing シグナル」
- zone badge (大): `通常レンジ` (slate) / `extension 段階` (amber) / `climax warning` (red) / `8% stop hit` (red)
- 計算式: `currentPrice / dma50 - 1` で extension % 算出 → zone 判定
- 補足説明: `SELL_ZONE_DESC_JP[zone]` を 1-2 行で表示
- 8% stop calculation: user の保有 (transactions table from portfolio) と integration は **Phase 2 defer**、 Phase 1 は「購入価格 から -8%」 の汎用説明のみ

**DoD**:
- [ ] AAPL (current $195 vs 50DMA $180 = +8%): 「通常レンジ」 表示
- [ ] NVDA (current $1200 vs 50DMA $900 = +33%): 「climax warning」 表示
- [ ] 静的 dictionary 通過、 LLM 呼び出しゼロ (grep `anthropic\|openai` で 0 件)
- [ ] icon: Aman/Ritz-Carlton 級品格 ([[feedback-icon-brand-consistency]])。 TrendingUp / AlertTriangle / Crown 等を使用、 ✨🔥💎 禁止
- [ ] snap-pdca-loop で 3 zone の表示 verify
- [ ] design-system-check pass

---

## ⚠️ Phase 4 (大 blast radius) 別建て: Pane 3 順序入替 + 図解 sticky accordion + Pane 1 スクリーナー entry 1 本化

> **gate**: 上記 Sprint 1-6 着地後、 **6 体合議 multi-review 起動 + user gate 必須**。 Pane 3 順序入替は handover v82 の Pane 3 visual explainer redesign と同 blast radius (8-12 人日)、 [[project-pane3-visual-explainer-redesign]] の lesson 適用。

### Phase 4-A: Pane 1「スクリーナー」 nav entry 追加 + WorkspaceScreenerModal 削除 (1.5 人日、 blast radius L)

**触るファイル**:
- 編集: `frontend/src/features/workspace/WorkspaceHeader.jsx` (nav 「スクリーナー」 item 追加)
- 編集: `frontend/src/features/workspace/Workspace.jsx` (Pane 1 内 ScreenerSection 新規 mount)
- **削除**: `frontend/src/features/workspace/WorkspaceScreenerModal.jsx` (entry 1 本化、 modal route 廃止)
- 新規: `frontend/src/features/workspace/panes/ScreenerPane.jsx` (Hero + Explorer 2-section 構成)

**Hero 内部** (top 3 セクション、 各 top 5、 grill-me #2 verdict):
- セクション 1: O'Neil 3 条件交差 top 5 (RS percentile ≥ 80 + 52w high 近接 + Cup-Handle 検出済) ([[feedback-oneill-screener-frontend-intersection]] pattern 再利用)
- セクション 2: RS 急上昇 top 5 (RS 過去 5 日 delta top)
- セクション 3: 新規 Cup-Handle 検出 top 5 (nightly scan の last 24h 検出分)

**Explorer 内部**: 既存 WorkspaceScreenerModal の chip filter テーブルを移植

### Phase 4-B: Pane 3 セクション順序入替 (2.5 人日、 blast radius **XL**)

**2026-05-28 user gate 3 確定** (案 B + 図解 default OFF + DiagramCard mount 維持):

新 5 セクション順序:
1. **図解 sticky accordion (default-collapsed = OFF)** — user 指示「メインは Chart、 図解は 2 回目以降しつこい → default OFF」。 top 56-64px、 click で inline expand に DiagramCard
2. **Chart** — StockPriceChart (Sprint 5 で line overlay 追加済)
3. **目標株価 + 売り card 並列** — AnalystTargetCard + SellZoneCard (Sprint 4/6 で追加済)
4. **5 条件カード (accordion 外、 常時 visible)** — 案 B 確定 (user 帰宅後判断、 LP「2 秒で判定」 完全保持)
5. **ファンダ accordion (default-collapsed)** — 業績推移 + 詳細レポート + アナリスト視点 + ガイダンス + Profile + Triage 内包 (5 条件カードは accordion 外なので除外)
6. **その他** — News / IR Links / Analyst view / Conference / Insider / Earnings Reaction

**DiagramCard mount 維持** (技術判定、 [[feedback-diagram-card-remount-cache]] 遵守):
- StickyDiagramAccordion は mount 維持、 表示制御は CSS `display: none` / `hidden` attribute のみ
- accordion expand/collapse で unmount→remount BAN (5 分 TTL ephemeral cache 破壊 → 月 cost $4.5 → $30-45 膨張 risk 回避)
- React Query / SWR の `staleTime` を `/api/visualize` で 5 分以上に明示

**触るファイル**:
- 編集: `frontend/src/features/judgment/components/detail/JudgmentDetail.jsx` (1422 行、 大規模 refactor。 既存 ChapterSection ① 数値 / II 市場評価 / ② テクニカル / ③ リファレンス 構造を新順序へ並べ替え)
- 新規: `frontend/src/features/judgment/components/detail/sections/StickyDiagramAccordion.jsx` (DiagramCard mount 維持 wrapper、 default-collapsed)
- 新規: `frontend/src/features/judgment/components/detail/sections/FundamentalsAccordion.jsx` (Triage / Profile / Guidance / EarningsHistory / 詳細レポート / アナリスト視点 の wrapper、 5 条件カードは含まない)
- 新規: `frontend/src/features/judgment/components/detail/sections/MarketEvalSection.jsx` (AnalystPanel + InsightsPanel)
- 新規: `frontend/src/features/judgment/components/detail/sections/ContextSection.jsx` (News / IR / Conference / Insider / Earnings Reaction)

**feature flag** (Sprint B DoD):
- `localStorage.pane3_v4 = '0'` または URL `?pane3_v4=0` で旧 Pane 3 順序に即時 revert (reload のみ)
- 7 日 dogfood 後に旧フラグ群 (`isPane3ScrollV1` / `isPane3V2` / `isPane3V3` / `isPane3V2Frameless`) と共に cleanup

### Phase 4-C: SPA route + URL parameter sync (0.5 人日)

- スクリーナー pane の URL 化 (`?pane=screener`)
- Pane 3 のファンダ accordion default state 永続化 (localStorage)

---

## 6. 触ってはいけないファイル一覧 (Generator への禁止指示)

| ファイル | 理由 | 本 SPEC での扱い |
|---|---|---|
| `backend/app/visualizer/prompt.py` | Hallucination Guard pre-commit Check 1 | 全 sprint で触らない |
| `backend/app/aggregator/*.py` への LLM SDK import | pre-commit Check 3 | Sprint 2/3 で aggregator/ 編集するが anthropic/openai 一切 import なし |
| `backend/app/visualizer/prompt_negatives.py` | 法務 anchor | 触らない |
| `frontend/src/lib/blocklist.js` の BLOCKLIST_REGEX | LLM 出力 sanitize (本 SPEC は LLM 不使用なので関与なし) | typo は OK、 BLOCKLIST_REGEX 配列の constant は触らない |
| `.claude/launch.json` | 人間用 | 触らない |
| `migrations/*.sql` | DB schema | 本 SPEC は新規テーブル不要、 触らない |
| `handover_*.md` | read-only reference | 触らない (planner が読むだけ) |
| `railway.toml` cron 定義 | 既存 cron 7 件 (cup-scan/rs-scan/article 系) は本 SPEC 影響なし | 触らない |
| `frontend/src/App.jsx` の sticky 検索 div | 8 回試行錯誤の安定領域 | 触らない (Pane 3 順序入替で sticky 図解 accordion 追加するが、 検索 sticky は別 layer) |
| `.panel-card / .bs-panel / .surface-card` 関連 CSS | 発光バグ高 risk | AnalystTargetCard / SellZoneCard で **新規 panel-card 派生クラス追加禁止**、 既存 `.bs-panel` を再利用。 新規 `.is-arriving:hover` compound 4 セットを追加する場合 [[css-specificity-gotchas]] 厳守 |
| `frontend/src/components/LandingPage.jsx` | LP 訴求文言 | 本 SPEC では触らない (Pane 1 スクリーナー entry は login 後のみ、 LP は変更なし)。 ただし Phase 4-A 着手時に「LP 「無料試用」 訴求と Pane 1 demo モード Hero blur」 整合を再 verify |
| `backend/app/aggregator/triage.py` | per-source namespace SSOT | 触らない (analyst target は新規 endpoint で並列、 既存 schema は変えない) |
| `frontend/src/features/workspace/Workspace.jsx` の prefetchAll | 7 endpoints prefetch list | analyst target endpoint を **prefetchAll に追加** する (CLAUDE.md「重い API は必ず prefetchAll」 ルール遵守、 Phase 4-A 時に編集) |

---

## 7. multi-review 必要性判定

CLAUDE.md「multi-review 6 体 vs 3 体の判断基準」 3 軸を本 SPEC に適用:

| 軸 | active? | 根拠 |
|---|---|---|
| 1. **LLM 出力品質** (景表法 / 金商法 / hallucination risk) | 🟡 **半 active** | 本 SPEC 自体は LLM 不使用だが、 sell zone narration が「LLM 拡張への誘惑」 と grill-me で議論済。 静的 dictionary 維持の verdict 担保のため reviewer 必要 |
| 2. **Trust Cliff** (LP 訴求 vs 実装の整合) | 🟢 **active** | Phase 4-A で Pane 1 nav 構造変更 + demo モード Hero blur、 LP「無料試用」 整合の verdict 必須 |
| 3. **新 backend endpoint + RLS / 認証境界 + cache 設計** | 🟢 **active** | Sprint 2 で `/api/price-target-consensus` 新規追加 + 6h cache、 partial_failure schema 設計判断 |

**判定結果**:

- **Sprint 1-3 (backend + 安全網)**: **3 体合議で十分** (ui-designer + frontend-architect + qa-dogfooder) — 設計判断 limited、 frontend 局所影響なし、 cost 30-50% 圧縮
- **Sprint 4-6 (frontend card 追加 + chart overlay)**: **3 体合議推奨** — chart overlay safety 4 層防御 + design-system-check で gate、 大規模設計判断なし
- **Phase 4-A/B/C (Pane 1 + Pane 3 構造変更)**: **6 体合議必須** — 3 軸全 active (LLM 半 active + Trust Cliff + 新構造 blast radius L-XL)。 Anthropic engineer / 金融 verdict / マーケ verdict / ui-designer / frontend-architect / qa-dogfooder の 6 体。 mixed model (Opus 2-3 体 + Sonnet 3-4 体) で cost 圧縮 ([[feedback-cost-efficient-operation]])

**user gate position**:
- gate 1 (本 SPEC 承認): **暫定承認、 18 時帰宅後 final review** (本 SPEC 冒頭)
- gate 2 (Sprint 1-6 着地後): user dogfood + 「Phase 4 着手 OK?」 判断
- gate 3 (Phase 4 着手前): 6 体合議 verdict + user 最終判断

---

## 8. 想定リスク + roll-back plan

### 8-A. リスク

| # | リスク | 影響範囲 | 検知方法 |
|---|---|---|---|
| R1 | FMP /stable/price-target-consensus が 429 / 5xx 連発 | AnalystTargetCard 表示不能 | partial_failure UI で gracefully degrade ([[feedback-data-completeness-guard]])、 production smoke test |
| R2 | 50DMA 計算 perf 悪化 (price-history response size 30%+ 増) | Pane 3 初期ロード遅延 | Sprint 3 DoD で size 計測、 30% 超なら別 endpoint 分離 |
| R3 | chart に ReferenceLine 4 本追加で v75 真っ白事故再発 | Pane 3 全停止 | chart-overlay-safety 4 層防御 + snap-pdca-loop verify |
| R4 | Sell zone 静的 dictionary が「断定的判断」 と誤読される | 金商法 §38 抵触 risk | Phase 4 6 体合議で金融 reviewer に narration 文言 verify、 必要なら「目安」 「IBD ルールでは」 を強化 |
| R5 | Pane 3 順序入替で既存 user の「ファンダ 5 条件が最初に見えなくなった」 不満 | retention 一時的 dip | Phase 4 着手前 user gate + Phase 4 deploy 後 7 日間は localStorage feature flag で旧 order 復元可能 ([[feedback-feature-flag-dual-mode]]) |
| R6 | WorkspaceScreenerModal 削除で既存 bookmark URL 破断 | 一部 user の re-engagement | Phase 4-A で `?modal=screener` URL → `?pane=screener` の redirect 1 行追加 |
| R7 | sticky 図解 accordion が App.jsx の sticky 検索 div と z-index 衝突 | Pane 3 操作不能 | Phase 4-B 着手時に既存 sticky 領域の z-index 値を grep + 図解 accordion は **検索 div より下 z-index** で配置 |

### 8-B. roll-back plan

#### 軽微 (Sprint 2-6 単体失敗時)

- `git revert <commit-hash>` → `railway up` で 5-10 分 roll-back
- 既存 Pane 3 は影響なし (新規 card 追加のみのため)

#### 中程度 (Phase 4-A/B 中の不具合発覚)

- feature flag (URL parameter + localStorage [[feedback-feature-flag-dual-mode]]) で旧 Pane 3 順序 / 旧 WorkspaceScreenerModal を切替復元
- backup branch `backup/pre-pillar2-2026-05-28` から該当 file を cherry-pick

#### 重度 (本番真っ白事故等の緊急 roll-back)

- `git reset --hard pre-pillar2-redesign-2026-05-28` (tag 復元)
- `railway up` で deploy
- Railway dashboard で previous deployment ID に redeploy も可 (即時)
- 復旧目標: 15 分以内

---

## 9. KPI / 評価指標

### release MVP gate 通過後 (Phase 4 着地から 14 日計測)

| KPI | baseline (v124 推定) | target | 計測方法 |
|---|---|---|---|
| 7d retention | 45% | **55%** | Supabase user activity log |
| daily active session 平均時間 | 4.2 分 | **6.5 分** | Sentry session duration |
| Pane 1 スクリーナー access 頻度 / DAU | 0 (未実装) | **1.5 回 / DAU / 日** | frontend event log |
| RS 急上昇 chip click rate | 0 (未実装) | **15%+** | event log |
| Cup-Handle 検出 chip click rate | 既存 (推定 8%) | **15%+** | event log |
| Premium gate hit rate (3 銘柄/日超過) | 既存 | **+30%** | demo rate limit log |
| Sell zone card scroll-into-view rate | 0 (未実装) | **40%+** | IntersectionObserver event |

### vision-eval 評価 (3 run mean)

- Pane 1 ScreenerPane: target **70.0+** (Pane 4 noise floor と同等)
- Pane 3 (順序入替後): target **72.4+ 維持** (Pane 3 noise floor を下回らないこと)
- 評価軸: typography (sticky 図解 56-64px) / spacing (card 間 var(--space-6)) / color (50DMA red/amber/slate) / aman (3 run mean 必須 [[feedback-vision-api-noise]])

---

## 10. 関連 memory anchor 一覧 (Generator + Evaluator が必読)

### 既存 anchor (このまま参照)

- [[project-cup-handle-design]] — Cup-Handle Phase 1 6 体合議 SSOT
- [[project-cup-handle-phase2]] — nightly scan + multi-review 14 件 verdict + Phase 2.6 候補
- [[feedback-cup-handle-thresholds]] — Phase 1 確定 12 パラメータ
- [[feedback-technical-signal-thresholds]] — RS percentile + DMA cross + ProTeaser gate
- [[feedback-chart-overlay-safety]] — v75 真っ白事故 4 層防御 SSOT (Sprint 5 で **絶対遵守**)
- [[project-pane3-visual-explainer-redesign]] — v82 Pane 3 構造変更 6 体合議 SSOT (Phase 4 の前例)
- [[project-pane3-completion-backlog]] — Pane 3 既存 7 ブロック構造 (順序入替で破壊しない baseline)
- [[pane3-pane4-ui-unification]] — 和訳トグル UI 統一前例
- [[feedback-icon-brand-consistency]] — Aman/Ritz-Carlton 級アイコン (SellZoneCard で必須)
- [[feedback-cls-envelope-pattern]] — root minHeight envelope (AnalystTargetCard / SellZoneCard で適用)
- [[feedback-data-completeness-guard]] — per-source data namespace (Sprint 2 response schema)
- [[feedback-condition-pulse-pattern]] — 静的 dictionary narration pattern (sell zone narration の type)
- [[chip-primitive-canonical]] — Chip.jsx 再利用 (AnalystTargetCard の analyst 人数 badge)
- [[css-specificity-gotchas]] — compound `.X.is-arriving:hover` 4 セット必須
- [[feedback-feature-flag-dual-mode]] — Phase 4 deploy 後 旧 Pane 3 順序 fallback
- [[feedback-cost-efficient-operation]] — 6 体合議 mixed model (Opus 2-3 体 + Sonnet 3-4 体)
- [[feedback-vision-api-noise]] — 3 run mean 必須
- [[feedback-llm-calc-separation]] — 数値 Python / narration LLM 物理分離 (本 SPEC は narration も静的 dictionary)
- [[feedback-oneill-screener-frontend-intersection]] — Pane 1 Hero O'Neil 3 条件交差 pattern
- [[fmp-plan-naming]] — FMP /stable/ vs /api/v3/ SSOT (Sprint 2 で /stable/ 使用)

### 新規追加候補 (Phase 4 着地後に memory anchor 化を検討)

- `project_pillar2_technical_redesign.md` (本 SPEC 着地完了の SSOT、 Phase 4 6 体合議 verdict 記録)
- `feedback_sell_zone_static_dict.md` (sell zone 静的 dictionary が LLM 拡張誘惑への防壁になった経緯 SSOT)

---

## Appendix A: Generator subagent への引き継ぎ情報

- SPEC path: `/Users/yamadadaiki/Projects/beatscanner/docs/specs/SPEC_2026-05-28_pillar2-technical.md`
- Phase 1 開始指示: **Sprint 1 (git tag + backup branch + visual baseline) を最初に実行**
- skill 起動順: `pge-loop-debugger` (Generator の落とし穴 4 件予防) → `hallucination-guard` (Sprint 2/3 aggregator 編集前) → `stock-chart` (Sprint 5 chart overlay) → `design-system-check` (Sprint 4/5/6 着地時) → `multi-review` 3 体 (Sprint 6 完了時) → `multi-review` 6 体 (Phase 4 着手前、 **user gate 必須**)
- Generator self-eval 5 項目 ([[feedback-generator-selfeval-incomplete]]) は main session で手動補完: build / testid grep / NaN grep / Evaluator 起動 / pre-commit hook 通過確認
- user は 18 時帰宅、 それまでは本 SPEC の Sprint 1-6 を自律 PDCA で進行可能。 Phase 4 は user gate 必須

## Appendix B: 暫定承認の根拠

- user 明示「18 時まで進めて OK」 + grill-me 9 件 verdict 全完了 + 前提制約 (CLAUDE.md / Hallucination Guard / 色ルール / 既存 anchor) すべて反映
- Phase 1-3 (Sprint 1-6) は技術的 contained、 大 blast radius なし
- Phase 4 (Pane 3 順序入替) は SPEC + 3 体合議 verdict まで進めて **gate 3 で user 最終判断**
- final review pending 項目 (user 帰宅後):
  1. Hero「今日の注目 3 セクション」 の specific 銘柄選定 (top 5 で OK?)
  2. SellZoneCard と 8% trailing stop の portfolio integration を Phase 2 defer で OK?
  3. 旧 WorkspaceScreenerModal の URL bookmark redirect 仕様 (`?modal=screener` → `?pane=screener`)
  4. Phase 4 着手 sequence (Phase 4-A → B → C を 1 commit で 1 phase か、 細分化か)

---

## 11. Phase 4 6 体合議 verdict patch list (2026-05-28 着地、 user gate 3 待ち)

6 体合議 (Opus 3 + Sonnet 3 mixed、 cost 30-50% 圧縮 [[feedback-cost-efficient-operation]]) verdict を以下に集約。 Phase 4 着手前に SPEC §Phase 4-A/B/C 該当箇所へ patch 反映必須。

### 11-A. Phase 4-A patch (1.5 → 1.8 人日)

1. **触るファイル list 追加**:
   - `frontend/src/features/workspace/useUrlSync.js` — `VALID_TABS` Set に `'screener'` 追加、 `normalizeWorkspaceTab` で 'screener' を non-fallback (現状未追加だと `?tab=screener` が silently `home` に fallback)
   - `frontend/src/features/workspace/WorkspaceHeader.jsx` (line 207-273 周辺) — 既存「スクリーナー」 button 削除明示、 nav 1 本化
   - `backend/app/cron/cron_rs_scan.py` — Sprint 2.5 追加 (0.3 人日)、 upsert 時に当日 percentile と前日 percentile 比較 → `rs_ratings.delta_1d_percentile` 列追加 (DDL migration 同時必須)

2. **ラベル変更**:
   - 「O'Neil 3 条件交差」 → **「Leader + Breakout + Cup-Handle 交差」** (CAN SLIM の 3/7 のみのため誇大表記回避、 金融アナリスト critical)
   - 「今日の注目」 ヘッダラベル → **「スクリーニング結果」** + 各セクション header に「これは screening 条件に合致した銘柄一覧であり、 推奨ではありません」 1 行明記 (金商法 §38 抵触リスク回避、 金融アナリスト critical)

3. **demo モード**:
   - Pane 1 nav 「スクリーナー」 entry は demo モード (`user === null`) でも **active 維持** (disabled NG、 LP「3 銘柄/日まで無料試用」 と矛盾、 marketer critical)
   - 未ログイン clicking nav → 「ログインで今日の注目銘柄を解放」 モーダル

4. **Hero UI layout 明示** (ui-designer major):
   - PC: 3-column grid、 mobile: 1-column stack
   - 各カラム `bs-panel` class、 chip filter `[Leader+Breakout+CWH] [RS 急上昇] [Cup-Handle]` で active highlight
   - セクション間 ticker exclusion (S1 → S2 → S3 順で取得済除外、 「同じ 5 銘柄」 退屈回避、 qa-dogfooder major)

5. **URL parameter namespace 統一** (frontend-architect major):
   - `?pane=` vs `?tab=` を **`?tab=screener` に統一** (現 useUrlSync が `tab` 採用済、 namespace 増設不要)

6. **memory anchor**: [[feedback-screener-hero-3sections]] (本 SPEC §Phase 4-A 着地後の SSOT、 v125 既設置)

### 11-B. Phase 4-B patch (2.5 人日、 XL blast radius、 6 critical 全 reviewer 一致)

1. **5 条件 PASS X/5 視認性確保** (金融 + qa-dogfooder + marketer critical):
   - 案 A (推奨): `FundamentalsAccordion` header に **常時 PASS X/5 badge visible** + accordion expand で詳細 (`Chip primitive` 経由)
   - 案 B (代替): 5 条件カードは **accordion 外維持**、 ファンダ accordion 内は業績推移 + 詳細レポート + アナリスト視点 + ガイダンス の 4 ブロックのみ内包
   - **LP「2 秒で判定」 訴求と直結のため必須**、 user gate 3 で案 A / B を選定

2. **図解 sticky accordion default 状態** (qa-dogfooder critical):
   - `default-collapsed` → **`defaultOpen={true}`** に変更 (5 原則 #4 「1 クリックを減らせ」 違反解消)
   - scroll 時の sticky 残留は維持 (Aman 級 brand 整合)

3. **DiagramCard mount 維持** (Anthropic engineer critical):
   - **「DiagramCard は mount 維持で表示制御は CSS `display: none` / `hidden` attribute のみ、 unmount→remount を BAN」** を §5 Phase 4-B に明文化
   - 理由: unmount→remount で 5 分 TTL ephemeral cache 超過 → 月 cost $4.5 → $30-45 膨張 risk
   - React Query / SWR の `staleTime` を `/api/visualize` で 5 分以上に明示
   - memory anchor: [[feedback-diagram-card-remount-cache]] (v125 既設置)

4. **feature flag DoD 格上げ** (全 6 体一致):
   - `localStorage.pane3_v4 = '0'` で旧 Pane 3 順序に即時 revert (reload のみ)
   - URL `?pane3_v4=0` でも同様 revert (dogfood 共有 URL として機能)
   - 7 日 dogfood 後に旧フラグ群と共に cleanup (`isPane3ScrollV1` / `isPane3V2` / `isPane3V3` + 本 flag、 技術的負債解消)

5. **2-step split commit** (frontend-architect + ui-designer + qa-dogfooder):
   - **Sprint A (1.0 人日)**: 抽出分離 — JudgmentDetail.jsx から `FundamentalsAccordion.jsx` + `MarketEvalSection.jsx` + `ContextSection.jsx` を named component に切出し、 **描画順序は不変**。 build 確認 + snap-pdca-loop baseline。
   - **Sprint B (1.5 人日)**: 順序変更 — Sprint A で分離した component を新順序で並べ替え。 git diff が「移動」 だけになり review 容易。
   - アトミック 1 commit XL refactor NG (v82 Pane 3 redesign の 8-12 人日膨張教訓)

6. **release MVP gate 順序判断** (marketer 推奨):
   - Phase 4-B は **release 後 14 日 dogfood で baseline KPI 取得後** に着手判定の選択肢あり
   - pre-release-priority SOP 遵守、 retention dip 検知で順序判断
   - user gate 3 で release 前着手 vs release 後着手を最終判断

### 11-C. Phase 4-C patch (0.5 人日)

1. **URL parameter enum allowlist** (Anthropic engineer major):
   - §4-A Hallucination Guard 適合表に「URL parameter は enum allowlist で validate、 LLM user message へ直流入 BAN」 を 1 行追加
   - Phase 4-C Sprint DoD に `?section=` parameter の whitelist 検証 testid を含める

2. **section id 確定後に同 commit** (frontend-architect major):
   - Phase 4-B Sprint A (FundamentalsAccordion 抽出) で section id namespace 確定 → Phase 4-C で `?section=fundamentals` 等の deep link 実装
   - Phase 4-B Sprint A と Phase 4-C を同 commit にする

3. **`?pane=` vs `?tab=` 統一** (frontend-architect major):
   - Phase 4-A と同期、 `tab` に統一

### 11-D. Hallucination Guard 4 層 拡張 (Anthropic engineer major)

§4-A の table に Check 5 追加:

| 層 | 対象 | 実装 |
|---|---|---|
| pre-commit Check 5 (新規、 0.2 人日) | `frontend/src/features/workspace/components/*.{jsx,js}` への `@anthropic-ai/sdk` / `openai` import | `scripts/pre-commit-hook.sh` で BLOCK |

Phase 4-A 着手前に 1 行 patch で実装可。 frontend で LLM SDK 直叩き = API key 露出 risk + 4 層 sanitize bypass、 これを物理層で予防。

### 11-E. §7 6 体合議 mixed model 配分 明示 (Anthropic engineer major)

§7 multi-review 必要性判定の reviewer 一覧に model 列追加:

| reviewer | model | 担当観点 |
|---|---|---|
| 金融アナリスト | **Opus** | 金商法 §38 / 景表法 §5、 CAN SLIM 整合、 国内競合比較 |
| Anthropic engineer | **Opus** | Hallucination Guard 4 層、 prompt cache 設計、 cost 効率 |
| マーケター | **Opus** | LP Trust Cliff、 SEO/AIO、 release MVP gate 順序 |
| ui-designer | Sonnet | 5 原則「2 秒で読める」、 brand 世界観、 mobile responsive |
| frontend-architect | Sonnet | chart-overlay-safety 4 層、 hooks rules、 bundle size |
| qa-dogfooder | Sonnet | dogfood シナリオ、 muscle memory、 KPI 計測準備 |

cost 30-50% 圧縮 estimate ([[feedback-cost-efficient-operation]] v94 SOP)。 Phase 4-B 着手時の Generator subagent は Opus 必須 (XL blast radius)、 Phase 4-A/C は Sonnet で十分。

### 11-F. マーケ launch punch line (user 帰宅後選定)

5 案中の推奨は **「米国株を毎日チェックする最強の道具 — IBD テクニカル × ファンダ 5 条件、 日本語で」** (毎日 trigger + 2 本柱 + 日本語 = 国内市場 unique position 全部入り)。

---

**SPEC end**

---

## changelog

- 2026-05-28 07:35: planner subagent 起票 (480 行)
- 2026-05-28 08:10: Sprint 1+4+5+6 着地 commit 8f4680e (frontend 局所、 backend 0 改修で pivot)
- 2026-05-28 08:40: R1 hotfix commit f6da250 (3 体合議 critical 3 + major 4 件消化)
- 2026-05-28 09:00: R2 hotfix commit 852a399 (6 体合議 金融 M-2 stop_hit dictionary 矛盾)
- 2026-05-28 07:50: §11 Phase 4 6 体合議 patch list 追記 (本 SPEC への verdict 反映、 user gate 3 待ち)
