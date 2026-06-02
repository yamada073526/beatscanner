# Round 3-B: FMP Ultimate データを AI図解コンテンツに追加 SPEC

> 金融アナリスト sub-agent review (2026-06-03、 opus) verdict を SPEC 化。
> user「FMP Ultimate ($149/月) のデータ量が増えたので図解内コンテンツに追加を検討」 への回答。
> ⚠️ **autopilot で実装せず SPEC 化した理由**: ②③④ は visualize endpoint (core) の payload に
> backend 配線が必要 = blast radius 大 + §38 表示設計に user 承認が望ましい。 design 側 (R3 narrative /
> emoji) は実装・push 済。 本 SPEC は user が approach 承認後に実装。

## アナリスト review の最重要発見
**提案データの多くは既に backend に計算済**（新規 FMP 配線は少ない）。論点は「新規取得」 でなく
「既に取れているデータを visualize payload に流して図解化する」。

| データ | backend 状態 | visualize payload | 必要作業 |
|---|---|---|---|
| ② アナリスト予想レンジ + rating | `aggregator/analyst.py build_analyst_view` で計算済 (target_range mean/median/high/low + rating_consensus) | **未配線** (parsed に attach されていない) | visualize endpoint で build_analyst_view 呼出 → parsed attach + frontend section |
| ③ 決算後株価反応 (event study) | `aggregator/earnings_reaction.py` + `/api/earnings-reaction` で計算済 | 未配線 | 同上 |
| ④ インサイダー Form4 買い | `/api/insider` (main.py:14234) で取得済、 P/S/A/D 分類済 | 未配線 | buy(P)のみ集計 attach + frontend badge |
| ① 13F 機関保有の変化 | Ultimate で `restricted`→`ok` 開放、 集計ロジック未実装 | 未配線 | backend 集計新規 + 新 section |
| ⑤ 議員取引 | **fmp_client に method 未実装** | 未配線 | fmp_client 新規 method + 配線 + section |

## 実装優先順位 (アナリスト verdict: 工数 vs インパクト)

### 最優先 = ② アナリスト予想レンジ + 次Qコンセンサス (1〜1.5 人日)
- **理由**: build_analyst_view が既に §38-safe に計算・cache 済。 残作業は visualize payload 配線 + frontend 1 section。 じっちゃま条件4 (Earnings Beat History) 直撃。
- **backend**: `/api/visualize` handler (main.py ~L11000-11150 の parsed 組立) で `build_analyst_view(sym, client, current_price)` を呼び、 `parsed["analystConsensus"] = {target_range, rating_consensus, next_q_consensus}` を attach。 ⚠️ aggregator は LLM import 禁止 (既存)、 数値そのまま流す。
- **frontend**: DiagramCard に新 section「アナリスト予想」 を **「次Qガイダンス」 の直後** に追加 (会社見通し vs 市場予想の対比)。
  - 目標株価 = **レンジのボックス図** (high—median—low—現在値 の位置関係)。 ⚠️ **「上昇余地○%」 は §38 で出さない** (`compute_target_upside_pct` 計算済だが使わない)。
  - rating = bullish/neutral/bearish の **分布バー** (個別 firm の "Strong Buy" は §5 最上級で出さない)。
  - 文言例: 「アナリスト目標株価: 中央値 \$X (高値 \$Y / 安値 \$Z、 n=28社)。 現在値 \$W。 ※予想の中央値であり株価を保証するものではありません」。
- **Hallucination Guard**: 数値は backend、 narration は静的 dict (Phase 5.5 condition pulse pattern と同型)。 LLM 生成しない。

### 次点 = ③ 決算後株価反応 (1 人日、 計算済)
- 「数字で見る成長ストーリー」 の下に帯グラフ。 「過去8Qの決算後5営業日平均: Beat時 +X% / Miss時 −Y% (実績集計、 将来を示すものではありません)」。
- じっちゃま「決算は中身より反応を見ろ」 哲学に直結。 backend は earnings_reaction.py 流すだけ。

### ③の次 = ① 13F 機関保有の変化 (差別化の目玉、 2〜3 人日)
- O'Neil "I" 直撃。 **個社名リストは出さない** (45日遅延 + herd risk)。 機関保有**比率の4Q推移** + 新規建て機関数 vs 解消機関数の**集計**のみ。
- 「機関保有比率: 前期 62.1% → 当期 64.8% (+2.7pt) / 新規 14社・解消 6社 (FMP 13F、 2026Q1 提出)」。
- backend: Ultimate `restricted`→`ok` 動作確認 + 集計ロジック新規。

### 最後 = ⑤ 議員取引 (話題枠、 新規配線)
- **投資シグナルでなく engagement コンテンツ**と明確に位置づけ (αは薄い、 45日遅延)。 国内競合に皆無で「毎日開きたくなる」(5原則#2) に効く。 fmp_client に senate-trading/house-disclosure method 新規。

## §38 / §5 やってはいけない (アナリスト verdict、 厳守)
- 目標株価の「上昇余地○%」 → レンジと現在値の位置だけ、 %煽り禁止。
- 13F 個社名ランキング列挙 → 比率の方向 + 増減件数の集計のみ。
- アナリスト個別「Strong Buy」 バッジ強調 → rating 分布のみ、 最上級禁止。
- 議員取引を「○議員が買った=買いシグナル」 → 開示の事実のみ、 因果断定禁止。
- ETF 保有 → 個別決算判定にノイズ、 図解に入れない (別タブ候補)。
- Insider の Award/Gift/税金売り を buy/sell シグナルに混ぜない (P/S/A/D 分類済、 frontend で P のみ強調)。

## 関連 file (実装時参照)
- `backend/app/aggregator/analyst.py` — build_analyst_view (②供給源)
- `backend/app/aggregator/earnings_reaction.py` — ③ event study
- `backend/app/main.py:14234` — /api/insider (①④、 13F restricted→Ultimate ok は :14295)
- `backend/app/fmp_client.py:289` institutional_holder (①) / :281 insider_trading (④) / 議員取引(⑤)は method 未実装
- `backend/app/visualizer/calc.py` — compute_target_range / classify_rating_consensus 済 (②の表示値)
- `backend/app/visualizer/prompt_negatives.py` — BAD-5断定/BAD-6最上級。 新 section も 4層 guard 通す
- `frontend/src/components/DiagramCard.jsx` — 図解 section 追加先

## 見積
②=1〜1.5人日 / ③=1人日 / ①=2〜3人日 / ⑤=新規配線。 **②から着手推奨** (ROI 最大、 既存計算流用)。
新 section は全て Hallucination Guard 4層 + §38 レンジ/分布表示で。
