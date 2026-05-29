# BeatScanner Handover v129 — 次セッション backlog (user dogfood 2026-05-30 朝)

> v128 (前セッション = LLY cup_completing / NVDA box_support / R6 / R2 / dogfood修正 多数) は本番反映・検証・commit 済。
> 本 v129 は **起床後 dogfood feedback の未着手 backlog** (優先順)。本番 bundle: `index-B4qg3ITc.js` 系。
> 全 commit push 済 (main 最新 a9cf293)。`fetch-handover` で本ファイル + v128 を読む。

## user が OK 確認済 (着手不要)
- LLY cup_completing / NVDA box_support / 表示期間切替 / 損切りラベル色 / Distribution Days / 投資家への問い → 全て「OK」「いい感じ」

## 🔴 P0 バグ (図解、 visible・恥ずかしい系、 まず直す)
1. **5条件バッジの分母分子が消失**: NVDA 図解 Hero 下が「2/5 条件クリア」 のはずが「 / 条件クリア」 になっている (passCount/totalCount が render されていない)。DiagramCard の headline/conditions badge 周辺
2. **判定不可 tooltip の課金文言**: Hero 下「判定不可」 hover で「FMP有料プランで解決できます」 と課金を求める文言が出る → user 「ユーザーに課金を求めるな」。文言を中立化 or 撤去 (Trust Cliff)。grep "FMP有料プラン"
3. **Hero 上の白い「・」 dot**: 図解 Hero (例「営業CF健全も利益成長失速」) の少し上に小さい白 dot が表示される (謎要素)。DiagramCard Hero 周辺を grep
4. **skeleton → 旧"読み込み中"に戻る flicker**: 図解読込完了直前に skeleton が消えて以前の簡素な「読み込み中」 表示に一瞬戻る。StickyDiagramAccordion の vizState 遷移 (loading→done の間に Suspense fallback が挟まる?)

## 🟡 P1 カード可読性改善 (株価ファースト)
5. **Cup-Handle pivot / 50DMA extension 状況 / 長期ボックス支持線 の3カード**: user 「一番読みたいのは株価。今はテクニカル説明の後に小さい文字で株価」 → **株価(pivot/extension値/支持線価格)をカード先頭+大型表示**に。`アナリスト目標株価` は既に株価が大きく見やすいので対象外
6. **売り目安 (損切り) の価格を計算表示**: 「pivot price から -8% の水準が損切り目安」 の **具体的価格 (pivot×0.92)** を表示。現状 narration のみで価格なし。Cup-Handle pivot/50DMA は価格表示あるのに sell side だけ無い。CupPivotCard の sell section + SellZoneCard
7. **アナリスト目標株価カード**: 「コンセンサスは目安。 アナリスト予想は外れることがあります。」 と「最終更新 X分前」 が近接して視覚的に混ざる → 後者を右寄せ等で分離。AnalystTargetCard

## 🟡 P1 サブエージェントレビュー (user 明示依頼)
8. **図解ボタン文言短縮**: 現「業績・ビジネス・強みを図解 / 7セクションで銘柄の全体像を視覚化」 が冗長 → 例「図解 業績・ビジネス・強みを視覚化」。5原則「シンプルかつリッチ」 準拠の文言提案。StickyDiagramAccordion diagram-banner__title/sub
9. **図解ボタン + loading を中央寄せ**: 現在左寄せ。図解 Hero が中央揃えなので、ボタン・「図解を生成中…」 も中央寄せにすると読み進めが自然 (user 提案)。8 と同じ sub-agent でまとめて可
10. **box_support 全銘柄表示の是非**: ほぼ全銘柄で「長期ボックス支持線」 が出る (informational)。user 「自分は良いと思うが客観判断できてない」 → 客観レビュー (signal 価値 vs ノイズ、 touch数/strength/role で絞るか)
11. **チャート下カードのデザイン磨き込み (sub-agent 主導)**: CupPivotCard/SellZoneCard/BuyZoneCard/DistributionDaysCard/AnalystTargetCard の株価・テキストのデザインを磨く。優先順位 **1.見やすさ > 2.格好よさ**、 できれば**今風な雰囲気**。P1 #5/#6/#7 (株価ファースト+大型 / 損切り価格表示 / アナリストカード文章分離) を**この sub-agent レビューに統合**して一括設計させる (ui-designer 中心)。Aman 級ブランド整合 + 5原則準拠

## 🔍 サブエージェントレビュー (backlog でなく方針判断、 user 明示依頼)
12. **ゴールデンクロスをスクリーナー検索条件に格上げすべきか**: 現状 GC は chart chip 表示のみ (dma_cross)。user 「AMZN は ~2週前の GC からかなり上昇。Cup-Handle ほどでないが有力な買いシグナルなら検索条件に格上げを」。GC の買いシグナル有効性 (false positive 率 / Cup-Handle との役割分担 / screener 条件化の是非) を金融 + frontend-architect でレビュー
13. **チャート hover で日付+株価表示 (離脱防止・retention 観点)**: 現状 chart マウスオーバーは日付のみ (決算日は EPS Beat/Miss 表示、 但しその日の株価は不明)。user 「日付単位の株価が分からず買い/売り準備しづらい。底値タッチはいつ・そこから何%上昇・今いくらで売りゾーンまであと何%、 が読めない。"株価は他サイトで" となると離脱原因。"BeatScanner ないとトレードできない" と思わせる観点で改善レビューを」。Recharts Tooltip に close 価格 + (可能なら) 主要 ref line (pivot/支持線/利確) との distance% を出す案。StockPriceChart Tooltip

## 🔵 P2 大型 (user「着手願います」)
11. **NVDA P2 `pullback_to_support` state**: 「利確ゾーン(profit-take)→押し目→買いゾーン(支持線)接近中」 の局面 state。sub-agent verdict (handover 内) で **state machine 変更 + nightly scan/backtest blast radius のため 6体合議推奨**。box_support(P1)+表示(P3) は v128 着地済、 P2 のみ。設計は前セッションの NVDA sub-agent verdict (3-A breakout_extended guard は適用済 / `pullback_to_support` 判定条件: かつて pivot 上抜け + 直近高値から5%+押し + box_support band +8%以内接近 + band_low 未割れ) 参照

## user 判断済
- FMP Ultimate ($99/月、 R4 churning / R5 市場 distribution days): **見送り** (売上未発生、 課金転換ドライバー弱い)。release 後 DAU 付いてから市場タイミング指標として Premium 訴求に再検討

## 触ると危険 (再掲)
- 発光系 .panel-card / sticky検索 / VITE_ ARG-ENV / aggregator LLM import 禁止
- **JSX 属性間コメント (`{/* */}` `//`) 不可** (opening tag 外へ)
- frontend「じっちゃま」 文字列は pre-edit hook ブロック → 「独自プロトコル」
- DiagramCard は重量級・mount維持 ([[feedback-diagram-card-remount-cache]])
