# レビューブリーフ 2026-06-07: CAN-SLIM スクリーナー拡張 + 買値通知 + Pane3/screener UX 再編

> **目的**: 発表会フィードバック起点の改善希望 (memory `project_canslim_screener_expansion.md`) を 6 体合議で**採否・実装可否・優先度**まで決める Phase gate。
> **これは設計レビュー (コード diff なし)**。各 reviewer は「何を作るべきか/作るべきでないか」と「順序」を判断する。
> 必読: `CLAUDE.md` (5 原則・Trust Cliff・Hallucination Guard・投資業界色ルール)、memory `project_canslim_screener_expansion.md`。

---

## 0. 背景 (なぜ今)

AI スクール発表会で BeatScanner を共有 → **株経験者でも「パッと見で何が表示されているか分からない」**反応。2 つの課題:
1. **認知コスト**: Pane3 (銘柄分析) と screener が「何を見ればいいか」即座に伝わらない。
2. **検索条件の薄さ**: 現ファンダ5条件は「クリア2件」で物足りない。オニール (CAN-SLIM) で厚くしたい。

加えて user は **買値登録 → 損切/利確の自動通知**を要望 (原則4「人力の代替」の核 + ¥10k tier 素地)。

---

## 1. 現状実装の grounding (Explore 調査確定済 — 「もうあるもの」を再提案しないこと)

| CAN-SLIM | 現状 | 根拠 |
|---|---|---|
| **C** 四半期EPS YoY成長% (+18〜25%) | **未実装** (screener filter として)。8Q テーブルは「Beat 判定」で YoY 成長率%でのフィルタは無い。`eps_yoy` 計算は guidance/triage 表示にのみ存在 | FMP `earnings_surprises`/`income_statement(quarter)` 取得済 → 計算追加のみ |
| **A** 年EPS 3-5年CAGR + ROE (17%↑) | **未実装**。`fmp_client` に ratios(ROE) メソッド無し。年次EPSは custom-screener で fetch 済だが CAGR/ROE 計算せず | FMP `/financial-ratios`(returnOnEquity) / `income-statement(annual)` で取得可 (client method 追加要) |
| **N** 新高値/ATHブレイク (ハンドルなし) | **部分的** (Cup-Handle 内の `breakout_extended`=252週高値95%圏のみ)。**独立した「52週高値ブレイク単独スキャナー」は無い** | `yearHigh` は batch_quotes で取得済。cup nightly scan infra 流用可 |
| **S** 出来高急増/株数/自社株買い | **部分的**。出来高急増は Cup-Handle 内 `breakout_volume_multiplier=1.40`(50日平均×140%) で判定するが**独立 filter でない**。株数/自社株買いは screener 未使用 | `commonStockRepurchased`(cash_flow)/`sharesOutstanding`(profile) 取得可 |
| **L** RS≥80 (リーダー) | **実装済**。`/api/scanner/rs` + `rs_ratings` テーブル + nightly RS-scan 稼働中。O'Neil完全 chip も RS≥80 込み | 流用。課題は **UX ("Leader"=RS80 が分かりづらい)** |
| **I** 機関保有増 | **部分的** (表示のみ)。`aggregator/institutional.py` が 4Q 推移・`increasedPositions`/`newPositions` 集計済。**screener filter 化は未** | 既存集計に数値比較を足すだけ |
| **M** 売り抜け日/FTD/地合い | **ほぼ実装済**。`_detect_ftd` + `/api/follow-through-day/{index}` (3指数) 完全稼働。`DistributionDaysCard.jsx` (frontend pure 計算)。`_spy_uptrend()` | FTD endpoint + distribution card + SPY uptrend 全て有。surfacing/磨きのみ |
| **買値通知** | **部分的**。`transactions.price`(取得単価) 保存済。**損切(-7-8%)/利確(+20-25%) アラート未実装** | 通知 infra (cron + Resend mailer + notification_dispatch_log) は Cup-Handle digest で実証済 → 転用低コスト |

**既存 screener endpoint**: `/api/screener?category=gainers|losers|actives` / `/api/custom-screener`(独自5条件) / `/api/scanner/rs` / `/api/scanner/cup-handle?filter=all|funda|cup|both` / `/api/screener/universe-meta` / `/api/follow-through-day/{index}`。
**frontend**: `features/workspace/ScreenerPane.jsx` (Hero 3 section) / `components/CustomScreenerPanel.jsx` ("探索"チップ 5 種: カップ/ブレイクアウト/RS強/ファンダ&カップ/O'Neil完全) / `DistributionDaysCard.jsx` / `ftd.js`。

---

## 2. レビュー対象の提案 (3 part)

### Part A — CAN-SLIM スクリーナー条件拡張
user 要望の各条件を「採用/見送り/将来」+「実装方式」+「Trust Cliff/§38 risk」で判定してほしい。特に:
- **C (四半期EPS YoY%)**: 「+18-25% 以上」を filter 化。閾値は単一か段階 (18/25/40%) か。既存「Beat 判定」との二重表示で混乱しないか。
- **A (年EPS CAGR + ROE)**: 3-5年 CAGR と ROE17%↑ を filter 化。データ欠損銘柄 (赤字/新興) の扱い。ROE の金融セクター歪み。
- **N (ATH ブレイク単独)**: handover 確認事項「ATH検索 実装済か?」→ **未実装**。Cup-Handle と独立に「新高値ブレイク」スキャナーを足すか。Cup-Handle との棲み分け (重複/カニバリ)。
- **S (出来高急増/株数/自社株買い)**: 出来高急増を独立 filter 化するか。「中小型株優位」を時価総額帯 filter で代替するか。自社株買いは I の insider 図解と重複しないか。
- **L (RS)**: 実装済。**"Leader" 表記の改善**のみ (補足併記 or 「RS80以上」直書き)。
- **I (機関保有増)**: filter 化の価値 vs データ鮮度 (13F は45日遅延)。§38 (機関が買ってる=買い、と読ませない)。
- **M (売り抜け日/FTD)**: ほぼ実装済 → screener の**市場局面ゲート**として活かすか (弱気相場では銘柄を出さない/警告)。

### Part B — 買値登録 → 損切/利確 通知 (原則4 核 + ¥10k tier)
- 買値 (`transactions.price`) を基準に **損切 -7〜8% / 利確 +20〜25%** で通知。
- **8週間ホールド例外**: 数週間で +20% 以上急騰の強力銘柄は利確を保留 (オニール「8週ルール」)。
- 通知は **Cup-Handle digest と同じ Resend cron 配線**を転用 (nightly or 日中 1 回)。
- 判断: §38 (「売れ/利確しろ」は断定的判断 → 「-7.8% (買値比)」事実通知 + 静的 dict 文言に留める)。Stripe/PMF 前の段階制約 (`project_signature_tier_10k_strategy`)。free/Pro/Premium のどこに置くか。

### Part C — Pane3 / screener UX 再編
- **Pane3**: 「ファンダメンタル」「テクニカル」**2 大分類** + 各冒頭サマリー + **ライター憲法** (①短文で結論先出し ②既知→未知 ③並列情報は表示要素統一)。
- **screener**: Pane2 を「ファンダ+テクニカル **2 本柱検索**」へ。**結果は Pane2 下でなく Pane3 に出す** (検索のメンタルモデル一致)。"探索"チップ UX 廃止検討。
- **ラベル明確化**: "Leader"=RS80 補足、chip 上 "Pass 2銘柄・Fail 3銘柄" の分かりにくさ解消。
- **ロード中に絵** (現テキストのみで寂しい)。"Loading screener" も同様。

---

## 3. 各 reviewer への問い (verdict 必須)

各自の専門レンズで以下を**結論**してほしい:
1. **採否マトリクス**: Part A の C/A/N/S/I の各条件を「採用 / 将来 / 見送り」+ 1 行根拠。L/M は実装済前提で「磨き内容」。
2. **原則4「人力の代替」適合**: 各提案は「投資家が毎日人力でやる手間の代替」か、それとも「情報の足し算/飾り」か。Yes/No を明示 (CLAUDE.md 最重要採否軸)。
3. **Trust Cliff / §38 / 景表法**: データ鮮度 (13F 45日遅延・ROE 期ズレ)、「事実のみ」訴求との整合、断定的判断回避、"Leader"/"Pass N件" の誤読。
4. **実装コスト/順序**: 既存流用 vs 新規。FMP client method 追加要否。最初に着手すべき 2-3 件と、その理由。
5. **Part B 通知**: 価値 (原則4) と risk (§38・段階制約) のバランス。今やるか PMF 後か。
6. **Part C UX**: 2 大分類 + 2 本柱検索 + 結果を Pane3 へ、の方向は正しいか。手戻り/破壊リスク (sticky 検索・発光系)。

**出力**: verdict (この再編全体に GO / GO-with-changes / RECONSIDER) + 採否マトリクス + 最優先 2-3 件 + 各自の懸念 BLOCK/CONCERN。

---

## 4. 6体合議 verdict 統合 (2026-06-07、mixed model: 金融/Anthropic-eng/マーケ=Opus、ui/frontend/qa=Sonnet)

**全6体 = 条件付賛成 (GO-with-changes)。反対ゼロ。**

### 強い共通結論 (4体以上一致)
1. **順序: Part C (UX再編+ラベル) を先、Part A (条件追加) を後** — マーケが逆順を **BLOCK** (「条件を増やすと欠損グリッドが倍増し『2秒理解』に逆行 = 発表会FB再生産」)。UI/frontend/qa 同意。発表会FB「パッと見で分からない」は9割が情報設計の問題で機能不足ではない。
2. **ラベル明確化 = 最優先・ほぼ0コスト・Trust Cliff直撃** (全6体):
   - `"Leader"` → 「RS 82 / 上位18%」(数値直書き、内輪語廃止)
   - `"Pass 2銘柄・Fail 3銘柄"` → 「5条件中2クリア」or「条件クリア: N銘柄 / 非該当: M銘柄」(分母明示)
   - `"O'Neil完全"` → 「全条件クリア」(固有名詞をUIから出さない = CLAUDE.md準拠)
3. **C (四半期EPS YoY%) = 採用 (最優先級)** — FMP取得済で計算追加のみ、free餌。ただし既存「Beat判定」「8Q売上YoY」と**二重表示回避** (8Q側ロジックを SSOT流用して数値一致)。
4. **M (FTD/地合い) = 磨きのみ・高ROI** — 既実装。screener冒頭に「現在の地合い (分配日X日/FTD)」バナー = 弱気相場ゲート。qa「最高ROI」。
5. **I (機関保有増 filter) = 全員 将来/見送り** — 13F 45日遅延が §38 地雷 (「機関が買い=買い」と誤読)。表示はOK、filter化は保留。
6. **0件問題 (qa最優先の罠) = リリース前提条件** — CAN-SLIM AND絞りは0件頻発。「どの条件で何銘柄脱落」の内訳表示が無いと「無言で壊れたscreener」に見える。条件追加リリースの**必須前提**。

### backend 設計の核 (Anthropic-eng)
- C/A/N/S を **1枚の新テーブル `screener_fundamentals(ticker, calc_date, eps_yoy_pct, eps_cagr_3y, roe, buyback_yield, near_high_pct, UNIQUE(ticker,calc_date))`** に集約 + endpoint 1本 (`/api/scanner/canslim`) + **cup scan nightly にピギーバック** (FMP追加call僅少)。条件交差は既存 frontend intersection (`feedback_oneill_screener_frontend_intersection`) 維持 = backendは単一条件readに徹する。
- GRANT は **sequence usage 含め別ファイル明示** (`feedback_supabase_grant_bug`)。
- **CONCERN**: Supabase Free 500MB が RS 33%+案B snapshot で逼迫 → C/A は retention 30日 + 月次DELETE cron 同居を migration 同梱。

### frontend 設計の核 (frontend-architect)
- **screener→Pane3 配線は `setActiveTicker` で既に動いている** (新設コストほぼゼロ、`ScreenerPane.jsx`)。
- Pane3 2分類 = `TickerDetailBody` に wrapper div 差し込みのみ (0.5-1人日、`AnalystPanel`/発光CSS無傷)。Sprint4 drift cell は**ファンダ束**へ。
- **BLOCK**: 2本柱検索UIを作る前に **chip整理の設計を固める** (条件をただ増やすと `feedback_minimalism_over_additive`「カラフル過多」再発)。chip増殖でなく「2本柱トグル + 折りたたみ詳細 (range/段階badge)」。

### 対立論点 (user 判断 or grill 対象)
- **N (ATH単独スキャナー)**: backend/UI/qa = **採用** (yearHigh取得済・低コスト・Cup-Handleと棲み分け「形 vs 水準」)。金融 = **見送り** (オニール原典は「裸の新高値」を買えと言わない。ベース完成後のピボット突破が買い場。単独ATHは extended/climax top を拾い高値掴み誘発、Cup-Handleとカニバる)。マーケ=将来(Premium)。
  → **折衷**: 採用するなら Cup-Handle に**従属**させ「extended警告」併記 (金融CONCERN対応)。
- **A (年EPS CAGR + ROE)**: 金融=採用だが **ROE 金融/REIT 除外ガードを BLOCK 条件**化 (高レバレッジで構造的高ROE→誤選別。AAPL自社株買いでROE100%超の罠)。UI/qa=将来 (赤字CAGR数学的未定義・新興3年未満データ不足・欠損の無音除外)。
  → **格上げ条件**: sector別ROEガード + 欠損明示 (—=データなし と ×=未達 を色/アイコンで区別) + 売上CAGR代替検討。

### Part B 買値通知
- 価値 = **原則4「人力の代替」のど真ん中・¥10k tier 最強看板** (金融/backend/マーケ一致)。売買規律 (損切-7-8%/利確+20-25%/8週ルール) はオニール原典に忠実。8週例外は「ブレイク日から3週以内に+20%」を起点に厳密化 (金融)。
- **今やるのは素地のみ** (マーケ/UI/qa BLOCK): Stripe未配線 + 通知事故はPMF前少数ユーザーで致命的。今は**画面内表示** (損切ライン-8%/利確+20%を表示、通知なし) を Pro素地に。自動push本体は Stripe+PMF後 (`project_signature_tier_10k_strategy`)。cup_notify cron + Resend mailer + notification_log 転用で push化は 2-3人日。§38: 「-7.8%(買値比)」事実 + 静的dict、「売れ」断定禁止。

### §38 / 景表法§5 要対策 (設計で潰せるが潰さず出すと致命的)
- §38: I (機関買い=買い)、L (RS=Leader=買い)、N (新高値=買い時)、Part B (損切れ/利確しろ) → 静的dict + 時点明記 + 一般論帰属 + LLM生成禁止。
- §5: 「CAN-SLIM **全条件**スクリーニング」訴求 vs 大型株の欠損だらけ実態 → 訴求を「主要条件」にトーンダウン + 欠損銘柄を「—(データなし)」と明示 (達成扱いも未達扱いもしない = HG第4層 per-source の screener版)。

### 推奨実装プラン (合議統合、Phase 振り分け)
- **Phase 1 (UX地ならし・最優先・手戻り最小)**: ①ラベル明確化 (0コスト) ②Pane3 2大分類+ライター憲法サマリー (0.5-1人日) ③M地合いバナー surfacing ④ローディング skeleton (shimmer、emoji禁止)
- **Phase 2 (条件拡張本体)**: ⑤C(EPS YoY%) filter化 (8Q SSOT流用、free餌) ⑥`screener_fundamentals` テーブル+endpoint+nightly piggyback ⑦0件内訳表示 (リリース前提) ⑧2本柱検索UI (chip整理設計を先に固める=frontend BLOCK)
- **Phase 3 (要ガード)**: ⑨A(CAGR+ROE、sector ガード+欠損明示) ⑩N(Cup-Handle従属+extended警告) ⑪S(出来高急増独立filter)
- **Phase 4 (PMF後)**: ⑫I(機関保有増filter、13F鮮度解決後) ⑬Part B 自動push (Stripe後)。今はPart B画面内表示のみPro素地。
