# BeatScanner Handover v128 — Summary (lazy load 用 SSOT)

> **作成日**: 2026-05-29 (夜間自律 PDCA セッション、 user 就寝中 ~朝4時)
> **production bundle (最新 deploy 後)**: HTML `index-BHbCD6mw.js` 系 + CSS `index-Dgh4ytiL.css`
>   (※ JSON repair deploy 後に js hash 更新。 `curl -s <prod>/ | grep -oE 'index-[A-Za-z0-9_-]+\.(js|css)'` で確認)
> **全変更 commit + push 済** (main): 5ef6378 → 8154e1f → 5c4f97e → 44049ee → 67adc24 (+ JSON repair commit)

## このセッションで着地した内容 (v127 R16 系、 多数 deploy)

### R16-1 (午前 dogfood 起点、 全て deploy + commit 済)
- 投資家への問い: 単一文 → **角度タグ付き 2-3 問配列** (prompt schema + few-shot 8例 + main.py 正規化 + DiagramCard/DetailReport/blocklist/demo)
- empty-state アイコン emoji → lucide (FileBarChart2 / Banknote)
- breakout chip Mountain → **ChartCandlestick** (StockPriceChart + CustomScreenerPanel)
- チャートラベル extended/climax → **50DMA+15%/+25%** + margin拡張 + pivot/extended stagger + SellZoneカードに意味併記
- **R15-1 真因 fix**: warmup が stub narration を `_viz_cache[ticker::3]` に保存し frontend の rich 図解を上書きする設計バグ除去 (FMP prewarm のみ残す)

### R16-2 (dogfood UX 3件)
- 表示期間 1Y/3Y/5Y 切替を partial 更新化 (図解 unmount せず trends だけ merge、 scroll jump 解消)
- 図解生成中 loading → skeleton+shimmer / Workspace読込中 → branded wordmark+3dot loader
- signal_quality 降格 banner 誤発火解消 (material_facts 未配線で常時low→degradedMode のみ) + 損切り -8% ラベル赤化

### R16-3 (技術シグナル、 独自プロトコル ライブ解説対応)
- **R6 200DMA Break** 売りシグナル (SellZoneCard dma200_break zone)
- **R2 Distribution Days** カード (直近25営業日の機関売り圧力、 full-width)
- **50/200DMA break の date-key bug fix** (price=date / overlay=time、 timeで引いてた silent no-op = 50DMA break が無発火だった)
- **LLY cup_completing**: カップ完成間近検出 (直近カップ逆走探索)。LLY pivot $1130 ≈ ライブ解説 $1133、 recovery99.7%。誤発火 33%→12.5% に精度向上
- **NVDA box_support**: 長期ボックス支持線検出 (_detect_horizontal_support、 水平帯clustering)。NVDA $195 ≈ ライブ解説 $200。chart cyan 帯 + BuyZoneCard 表示
- **visualize JSON repair 堅牢化**: raw_decode で "Extra data" (LLM trailing text) を吸収 (deploy 反映確認中)

## ✅ 本番検証済 (smoke test)
- health 200 / technical 全銘柄安定: LLY=cup_completing$1130 / NVDA=formation$217 box_support$195 / AAPL=breakout_pending$311 / GE=cup_completing$332
- AAPL visualize (full analysis_data = 実frontend相当): headline+trends4+investorQuestions2問 正常

## ⚠️ 残課題 / 既知の minor 項目
1. **NVDA P2 `pullback_to_support` state 未実装**: 利確ゾーン→押し目→支持線接近の局面 state。sub-agent verdict で state machine 変更 + blast radius のため **6 体合議推奨**。box_support (P1) + 表示 (P3) は着地済、 P2 のみ user review 待ち
2. **visualize 空データ (`{}`) エッジケース**: 実frontend (full conditions) は正常。空/最小データ時に LLM が malformed JSON → JSON repair 堅牢化で対応 (verifying)
3. R12-1 Phase 2 (R4 Churning / R5 市場 Distribution Days): FMP Ultimate 必要、 未着手
4. cup_completing/box_support の nightly scan 全 SP500 dry-run 未実施 (誤発火率は主要16銘柄で12.5%確認のみ)

## 🆕 新規 memory anchor (このセッション)
- feedback_viz_cache_key_flaw / feedback_signal_quality_banner_misfire / feedback_price_date_overlay_time_key / feedback_cup_completing_box_support

## 触ると危険 (CLAUDE.md より、 再掲)
- sticky 検索バー / 発光系 (.panel-card等) / VITE_ ARG-ENV 同期 / aggregator に LLM import 禁止
- **JSX 属性間にコメント (`{/* */}` / `//`) 不可** (今セッション 3 回踏んだ、 opening tag の外に出す)
- frontend の「じっちゃま」 文字列は pre-edit hook がブロック (comment も) → 「独自プロトコル」 に言い換え
