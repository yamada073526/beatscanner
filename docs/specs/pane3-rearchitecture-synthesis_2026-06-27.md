# 銘柄詳細 (Pane 3) 情報アーキテクチャ 再構成シンセシス

作成: 2026-06-27 / session: pane3 正本 mockup 化 Phase 2 (effort max)
位置づけ: **mockup ドラフト (Phase 3) と planner SPEC (Phase 5) の正本となる IA 提案**。これ自体は SPEC ではない (planner が形式化する)。

## 0. 3 入力の出典

| 入力 | 内容 | 出典 |
|---|---|---|
| 現状把握 (Phase 0) | v4 default の render 構成・構造的問題 | Explore 委譲 + JudgmentDetail.jsx flag 本体 ground-truth + authed baseline snap (AAPL, 6730px) |
| KB 優先順位 (Phase 1') | じっちゃま/オニールの判断順序 → 情報優先順位 | `/Users/yamadadaiki/Projects/investment-knowledge-base` 抽出 (general-purpose agent) |
| 競合 IA (Phase 1) | 一流 stock-detail の構造化手法 | deep-research (NN/g + Simply Wall St / Seeking Alpha 公式 doc)。生 report: `tasks/w4r467mwh.output` (result.findings 11 件・全 high) |

**相補性の核心**: KB =「**何を、どの順序で**」見せるか (投資判断の優先順位)。deep-research =「**どう構造化するか**」(IA の技法)。競合のレイアウト模倣でなく、じっちゃまプロトコルの優先順位を競合の IA 技法で実装する。

## 1. 現状の構造的問題 (再構成の起点・事実ベース)

1. **一等地のミスアロケーション**: 最上部 StateCompass (3軸 signal) 自体は良い (= 競合の「要約層を先頭」と合致) が、その直後の fold が **KPI(価格/前日比/Forward P/E/配当性向/自社株買い) + 期間別リターン + TTM バリュエーション** で埋まる。これらは KB 優先順位で**下層**。本丸の「決算3点 (EPS/売上/ガイダンス) の詳細」「8Q 成長トレンド」は遥か下のファンダ章に沈む。
2. **6730px ≈ 7.5 画面分の flat scroll**: 8-10 個の accordion がフラット連続。competitor finding [4]「accordion は (a) 大半の content が必要 (b) 多階層 (c) 連続 reading flow では避ける」に真っ向から抵触。
3. **card 過多 (4-5 種の surface 混在)**: competitor finding [7]「枠は default でなく fallback。全 section の card 化は busy/cluttered な最重要 anti-pattern」。
4. **heading 階層不統一**: ChapterHeader / SectionDivider / ChapterSection / AccordionSection 混在、ローマ数字 II と ③ 混在。
5. **tab で cross-ref データを分断**: v3 tab (Guidance / 過去業績 / 直近8Q) は competitor finding [3]「fundamentals↔chart のような cross-reference データを別 tab に隠すのは anti-pattern (短期記憶課税・default tab しか見ない)」に該当しうる。
6. **feature flag 組合せ爆発**: v2/v3/v4/v5/compass/flash/order_v2/header_v2/headroom。一貫性の敵。正本 mockup は収束先を与える。
7. **ナビゲーション outline 不在**: 6730px に対し「On This Page / 目次」が無く、competitor finding [5] の推奨パターン未実装。

## 2. KB 由来の情報優先順位 (3 層)

> ⚠️ **§38 翻訳必須**: KB は投資ロジックの優先順位を与えるが、UI 表示は金商法§38 (断定的判断の提供) / 景表法§5 に従い「買い/売り/脱出」等の**行動指示を出さない**。既存 StateCompass (§38-safe 状態語彙・2026-06-14) と [[feedback_section38_buy_signal_boundary]] の境界を踏襲。「状態バッジ」は色信号 + §38-safe ラベル + ⓘ 累進開示で実装する。

| 層 | 情報 (KB 優先順) | じっちゃま根拠 |
|---|---|---|
| **最上部 (2秒判断)** | ①決算3点 (EPS/売上/**ガイダンス** vs コンセンサス) ②連続ビート counter ③RS (70/80/90 閾値文脈) ④状態 (§38-safe) | 「決算3点 ALL ビートが最低条件」「ガイダンスが最も将来株価に効く (未来を映す)」「RS<70 はロクな銘柄なし」 |
| **2番手 (scroll)** | ⑤EPS成長 8Q ⑥売上成長 8Q ⑦来期コンセンサス EPS (YoY) ⑧機関保有 増減 | 「加速しているか」を傾きで認識 / ガイダンス→コンセンサス上昇の連鎖 / 機関の資金裏付け |
| **畳む (詳細時)** | ⑨OCFマージン (15-35%帯・年次) ⑩ROE/PER/PEG ⑪テクニカルチャート ⑫DSO ⑬アナリスト個別 | OCF は構造確認で毎Q不要 / valuation は補助 / テクニカルは「買い場タイミング」の二次チェック (ファンダ先・テクニカル後) |

## 3. 競合 IA 技法 (deep-research・採用パターン)

- **[0][1] 要約層を先頭に「名前付きバケツ」で**: Simply Wall St Snowflake (5軸 radar) / Seeking Alpha Ratings Summary (3 rating→1 snapshot)。flat な metric 羅列でなく、名前付きグループに集約して quick scan → drill。
- **[10] clickable summary → drill (累進開示の実装)**: Seeking Alpha Factor Grades (Quant Rating → 5 Factor Grades、各 grade clickable で詳細 metric へ)。beginner↔advanced 両立の中核。
- **[2][3] tab を universal に使うな**: tab=section少+長い時のみ。cross-ref データを tab 裏に隠さない。明確な grouping が無ければ single-page + subheading。
- **[5] On This Page / 目次 アンカー**: long-form の navigability を tab/accordion でなく目次で補う。
- **[6][7] whitespace 優先・card は Common Region の時だけ**: 枠は fallback。whitespace で grouping を試み、不足時のみ border。全 section card 化禁止。
- **[8][9] summary first, depth on demand**: 頻繁に必要なものは up-front、深層への導線は見える場所にラベル付きで。

> deep-research の honest limitation: 「決算/ガイダンス/ファンダ/チャート/アナリストの**順序**を直接規定する競合横断ベンチマークは無い」(IA 原則からの推論)。→ **順序は KB (じっちゃま優先順位) が SSOT、競合は構造化技法の SSOT** と役割分担。

## 4. 提案する新 IA (top → bottom)

設計原則: **「2秒の要約層 → 目次 → じっちゃま優先順位順の章 → 累進開示で深層」**。card は 5条件 (発光・単一焦点) のみ、他は whitespace + hairline。価格/リターン/valuation は一等地から降格。

```
【L0 アイデンティティ & ライブ】(最小・orientation)
  ticker + 社名 + 現在価格/前日比 + 次決算カウントダウン + ウォッチ追加
  ※価格は「判定」でなく「同定」。verdict 的扱いを外す。

【L1 判定サマリー】★再構成の心臓部 = at-a-glance 要約層 (2秒)
  StateCompass を基盤に「決算3点 named buckets」へ拡張:
    決算 [EPS ● 売上 ● ガイダンス]  連続ビート[3Q]  RS[xx/閾値]  状態[§38-safe]
  各バケツ clickable → 該当詳細セクションへ scroll (Factor Grades パターン finding[10])
  単一 surface (1 band)。価格/Forward P/E/配当/buyback/期間別リターンはここから除外。

【On This Page 目次】 finding[5] — 6730px の navigability を回復 (章アンカー)

【L2 決算 (ファンダの本丸)】 KB: 最優先
  決算3点 詳細 (EPS/売上/ガイダンス vs コンセンサス・来期コンセンサス YoY)
  + EPS成長 8Q / 売上成長 8Q トレンド (傾き視覚)
  + 5条件カード (★唯一の発光カード = 単一焦点・v5 の勝ち筋を継承)
  whitespace + hairline 区切り (入れ子 card 禁止)

【L3 品質・継続性】(累進開示: サマリー行常時 + 詳細 on demand)
  OCFマージン / ROE・PER・PEG / 機関保有トレンド / 会社概要

【L4 テクニカル・買い場】 KB: ファンダの後
  チャート + PriceLadder (v5 の chart+価格 1ユニット化を継承) + 期間別リターン (ここへ降格)
  + 買い場の質 (cup-handle / breakout 出来高)

【L5 図解 (Pro/Premium)】 — 視覚的「解説」層
  free = ぼかしプレビュー + Pro CTA (funnel-cro)。配置は §6 未決事項参照。

【L6 その他】(畳む・目次から到達)
  アナリスト視点 / 市場の声 / 8Q決算反応 / Insider / ニュース・IR・10-K / 関連記事
```

### v4/v5 との差分

| 観点 | v4 (現 default) | v5 (opt-in) | 本提案 |
|---|---|---|---|
| ブロック数 | 8-10 flat | 5 ブロック | 6 層 + 明示的 L1 要約層 + 目次 |
| 一等地 | 価格/リターン/TTM | 同様 | **決算3点 verdict に置換**・価格は同定のみ |
| 要約層 | StateCompass のみ | 同様 | **StateCompass を決算3点 named buckets へ拡張 + clickable drill** |
| ナビ | 無し | 無し | **On This Page 目次** 追加 |
| surface | card 4-5種混在 | 発光集約済 (5条件のみ) | v5 継承 + whitespace 優先徹底 |
| tab | v3 tab (cross-ref 分断) | 一部 | **再検討** (subheading + 目次 アンカーへ寄せる候補) |

**v5 の勝ち筋は継承**: 発光を 5条件カードのみに集約 / hairline 垂直リズム / L2冠統一 / chart+PriceLadder の 1ユニット化。本提案は v5 を破棄せず「L1 要約層の決算3点化 + 目次 + 一等地の優先順位是正」を上乗せする。

## 5. 壊してはいけない制約 (danger zone)

- **§38/§5**: 行動指示 (買い/売り/脱出) 禁止。状態は色信号 + §38-safe ラベル + ⓘ。来期売上の金融 sector 抑止・断定回避を維持 ([[feedback_section38_buy_signal_boundary]] / [[project_forward_visibility]])。
- **発光**: 新規 card 系追加・CSS 変更前に design_recipes §C-1〜C-4 必読。発光は 5条件カードのみ。compound `.X.is-arriving:hover` 4セット必須・`contain:paint` 禁止・入れ子 surface-card 禁止 ([[glow_elevation_postmortem]])。
- **sticky 検索バー**: 触らない。
- **citation precedence**: SEC/FMP (数値) > KB (観点) > news。数値は出典 footer 必須 ([[feedback_citation_required]])。
- **Premium gate**: 8Q / SellZone / CupPivot / BuyZone / Distribution / 図解 の境界維持。free は PremiumLock CTA。
- **mount 維持キャッシュ**: DiagramCard は unmount しない (cost)。

## 6. mockup 着手前の未決事項 (Phase gate・user 判断 or multi-review)

1. **図解 (L5) の配置**: 要約層直後 (視覚的「解説」として上げる) vs 下層 (Pro paywall を早期に出さない funnel-cro 配慮)。→ funnel-cro 観点。
2. **v3 tab の処遇**: 決算データの tab を解体し subheading + 目次アンカーへ寄せるか、cross-ref 度合いを見て tab 維持か。
3. **価格/期間別リターンの降格度**: L0 に最小の価格のみ残し、リターンは L4 へ全面降格でよいか (毎日見る user の慣れとの兼ね合い)。
4. **L1 要約層の密度**: 決算3点 + 連続ビート + RS + 状態 を 1 band に収める具体レイアウト (横並び named buckets か、StateCompass 拡張か)。
5. **段階的 ship 戦略**: 新 IA を `?pane3_v6=1` 等の新 flag で default OFF → dogfood → 昇格 (v5 が辿った安全経路)。
```
```

## 7. 次フェーズ

- Phase 3: 上記 L0-L6 を HTML 正本 mockup (`docs/specs/mockups/`) にドラフト。baseline snap (`.visual/pane3-baseline/AAPL/`) を見ながら before/after。
- Phase 4: ui-designer 中心の multi-review (3体) で mockup 批評・反復。
- Phase 5: planner で SPEC 化 → user 承認 gate → generator / mockup-fidelity。

## 8. mockup v1→v2 更新 (2026-06-27 user feedback + KB 追加・正本 = `mockups/pane3-detail-v1.html`)

user feedback「成長トレンド 8Q と 5条件 に具体数値を併記」+「他に KB 言及の情報があれば追加検討」を反映。再クラッタ回避のため**既存要素の enrichment 中心**に厳選:
1. **8Q 成長トレンド**: 全8四半期の YoY 数値併記 + 直近値強調 (EPS 加速 +12→+34% / 売上 横ばい +5.1→+6.0%)。
2. **5条件**: 各条件に実数+基準を右寄せ (例 ROE 147%/基準17%、売上高成長 +6.0%/基準20%)。ファンダ軸に再構成 (RS は L1 へ分離)。
3. **地合い M ゲート (KB 最上流・新規)**: L1 verdict に「前提: 地合い 強気 — 個別判定は地合い良好が前提」。KB step1 (Market direction = 最上流ゲート) を反映。市場全体の状態 = §38-safe。
4. **セクター地位 (KB step5・新規)**: RS mini を「RS・セクター地位」に拡張 (リーダーセクター 1-2 番手)。
5. **ROE 基準 / DSO (KB・新規)**: 品質層に ROE 基準併記 + DSO (売掛金回収日数、急増=売上の質警戒) fold 追加。
6. **買い場の質 (KB step7・新規)**: テクニカルに「pivot 突破に出来高 +40% 以上」。

KB 由来で**未採用 (今後検討)**: 材料出尽くし (buy rumor sell news) / 連続性の更に細かい可視化。すべて §38-safe (色信号+safe ラベルのみ、行動指示なし)。

## 9. Phase 4 UI/UX 3体合議 verdict + 実装条件 (2026-06-27)

**verdict: 3体 全員 条件付き Go (IA 方向は満場一致で承認・No-Go 要素なし)**。ui-designer / frontend-architect / qa-dogfooder。

### 9-A. mockup v2 で即修正済 (§38/§5 + 色ルール、生 report = `tasks/{a813d3822837835cb,a097983b28b0e3f98,ae92168e7b0193b0a}.output`)
- **§38-safe 語彙確定** (= generator への語彙一覧): 「損切り目安」→**リスク確認ライン(−8%)** / 「買い目安(pivot)」→**pivot 水準(観察点)** / 地合い「強気」→**上昇局面(指数 50/200DMA 上方)+「機械判定であり相場予測でない」明記** / 「買い場の質」→**ブレイクアウト強度(参考)** / ガイダンス「維持」の amber→**neutral** (amber は引き下げ時のみ) / b-sub「上回り」評価語→**数値のみ**。
- **色ルール**: bucket.lead の cyan border→neutral / ch-idx cyan→muted / figure-cta btn `#06121f`→`var(--bg-primary)` (raw hex 撲滅)。
- **dogfood**: 1W/1M リターンを L0 へ (retention) / 「条件充足 中」→「3/5」/ 🔒 emoji→inline SVG (icon-brand-consistency)。

### 9-B. データ source 裏取り結果 (frontend-architect ground-truth・Trust Cliff の核心)
- **実在✓ (既存データで結線可)**: 地合い M (`useFtdMap`/`ftdRegime`/`/api/follow-through-day`・但し Pane3 へ import 追加要) / 来期コンセンサス (`guidance/basic` `next_q.eps_yoy_pct`/`rev_yoy_pct`) / 連続ビート (`useEpsBeatStreak`+`quarterly-history`) / 8Q 成長 (`fetchQuarterlyHistory` `eps_yoy_pct`/`revenue_yoy_pct`)。
- **backend 拡張が必要 → v2 mockup から撤去 (実データ来るまで出さない)**: ①**セクター地位** (`is_sector_rs_leader` は `/api/scanner/universe` のみ・個別銘柄 endpoint 未配線) → `guidance/basic` か `technical` に追加が前提 ②**DSO** (全 endpoint 未取得・FMP `key-metrics-ttm` `daysSalesOutstanding` 要取得)。→ **Sprint 3 (backend) で配線後に復活**。撤去理由 = 出すと Trust Cliff。

### 9-C. SPEC に持ち込む実装条件 (Phase 5 planner 必読)
1. **Trust Cliff ガード**: セクター地位/DSO は backend 結線まで非表示。partial failure は `sources.X==='ok' && data.X` の compound check で欠落時 **— fallback** ([[feedback_data_completeness_guard]])。per-section citation footer (SEC/FMP・更新日)。
2. **非equity gate**: `isNonEquityTicker` true で 決算3点/5条件/テクニカル買い場 を section ごと非表示 + 目次からも除外 ([[feedback_non_equity_chart_overlays]])。
3. **DSO sector gate**: 銀行/保険/不動産 では DSO 非表示 ([[feedback_revenue_basis_mismatch]])。
4. **TOC アンカー**: native `href=#id` は内側スクロールで効かない → `smoothScrollToSelector(detailRoot, '#id', {offset})` で実装 (StateCompass 既存パターン)。アンカー先が折りたたみ時は **fold auto-open** してから scroll。
5. **L1 buckets**: `EarningsFlashSummary` の EPS/売上/ガイダンス data を流用 (fetch 重複なし)。StateCompass は残置し `?pane3_v6=1` で L1SummaryBuckets に置換。
6. **flag 戦略**: `pane3_v6` は isV5 の上位 opt-in でなく **v5 経路を上書き** + default ON 昇格時に v4/v5 分岐を一括削除できる clean exit path を SPEC 明記 (現状 flag 12個の組合せ爆発を増やさない)。
7. **継承 (不触)**: 5条件カード唯一発光 / hairline / PriceLadder+Chart 1ユニット / DiagramCard unmount 禁止。
8. **sprint 分割** (frontend 提案): S1 foundation(L0/L1 buckets/目次/8Q) → S2 章移動+L3 fold+地合い import → S3 セクター地位+DSO(backend 拡張) → S4 dogfood→v6 昇格→旧 flag sweep。

### 9-D. 未決 (user 判断・Phase 5 gate)
- **L1 判定サマリーに arrival glow を付与するか** (ui-designer H-1: Aman/Ritz「驚き・豪華」へ。賛: 主役 surface に世界観 / 否: 「発光は5条件のみ単一焦点」原則と競合・発光 danger zone)。→ **推奨: 実装時に vision-eval (aman 軸 3 run mean) で A/B 判定**。glow は `.five` の ~70% 強度・compound `.is-arriving` 4セット厳守 ([[glow_elevation_postmortem]])。
