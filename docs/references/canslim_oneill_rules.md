# CAN-SLIM（William O'Neil）ルール 調査リファレンス

> **用途**: BeatScanner への CAN-SLIM テクニカル条件実装の根拠資料（SSOT）。
> **出典の質**: deep-research harness（fan-out web search → adversarial verify）で収集。26ソース → 86 claim → 25検証 → **21 confirmed（大半 3-0 全会一致）**。primary = IBD/Investor's Business Daily 系（Nasdaq 経由再掲）、secondary = AAII / Yahoo(IBD記事) / Wikipedia。
> **作成**: 2026-06-17（deep-research workflow `wmjlb1gq1`）。
> ⚠️ Distribution Day / Follow-Through Day の数値は session limit で機械検証が abstain（事実誤りではなく未検証）。IBD 公式定義として注記付きで採用。

---

## 結論サマリー（BeatScanner 視点）

- CAN-SLIM の **C/A/N/S/M は実装済み**、**L は部分実装**（self-history percentile ＝ CAN-SLIM 式とは別物）、**I のみ完全未実装**。
- N（ベースパターン/ブレイクアウト）・S（出来高）のテクニカル中核は、既存 **Cup-Handle 検出** ＋ 進行中の **breakout signal セッション**が既にカバー → 新規実装は衝突する。
- 衝突せず価値が高いのは **①L=RS Rating の universe percentile 化 ②I=機関投資家保有 ③既存しきい値の最小監査**。

---

## §1. CAN-SLIM 7要素の定義と数値しきい値

| 要素 | 意味 | オニールの数値基準 | 出典 |
|---|---|---|---|
| **C** Current quarterly earnings | 当四半期EPS（前年同期比） | 最低 **+18〜20%**、実スクリーンは **+20%以上 + 継続事業から黒字EPS**。3rd edition で確認条件「売上 YoY **+25%超** or 直近3Q加速」追加 | [AAII #78](https://www.aaii.com/stocks/screens/78) |
| **A** Annual earnings | 年間EPS（複数年） | **過去3年 毎年増加 かつ 年率 +25%成長**。最高勝ち株は **ROE ≥17%**（AAII 3rd edition screen は ROE 不使用） | [AAII #78](https://www.aaii.com/stocks/screens/78) |
| **N** New | 新製品/新経営陣/**新高値**。チャートでは**ベースからのブレイクアウト** | buy point 突破後 **+5%まで** が buy zone（超えたら extended） | [IBD/Nasdaq](https://www.nasdaq.com/articles/ibd-rating-upgrades-intercontinental-exchange-flashes-improved-relative-price-strength) |
| **S** Supply and demand | 需給（出来高・浮動株） | ブレイクアウト出来高 **≥ 50日平均 +40%**、小型中型は **2〜3倍** | [IBD/Nasdaq](https://www.nasdaq.com/articles/basics-how-analyze-stocks-cup-handle-2018-01-03) |
| **L** Leader | 相対力 | **RS Rating ≥80**（理想 ≥90）、**RS<70 回避**。1950–2008 勝ち株は上昇直前 **平均 RS 87** | [IBD/Nasdaq](https://www.nasdaq.com/articles/ibd-rating-upgrades-intercontinental-exchange-flashes-improved-relative-price-strength) / [Yahoo/IBD](https://finance.yahoo.com/news/relative-strength-rating-pinpoints-stocks-214500318.html) / [AAII](https://www.aaii.com/stocks/screens/78) |
| **I** Institutional sponsorship | 機関投資家の保有 | 直近Qで機関保有「数」が増加・新規買付。過剰保有は逆にリスク | [Wikipedia/AAII](https://en.wikipedia.org/wiki/CAN_SLIM) |
| **M** Market direction | 市場全体の方向 | Distribution day カウント / Follow-Through Day で地合い判定 | [IBD/Nasdaq](https://www.nasdaq.com/articles/how-do-you-spot-major-stock-market-top-heres-easy-way-2017-12-21) |

---

## §2. テクニカル条件の詳細

### L — Relative Strength（RS Rating）
- **定義**: 過去 **12か月（≒52週）の価格パフォーマンス**を IBD データベース内の全銘柄と比較した **1〜99 のパーセンタイル順位**。RS 99 = 全銘柄の99%を上回る。[Yahoo/IBD](https://finance.yahoo.com/news/relative-strength-rating-pinpoints-stocks-214500318.html) / [Nasdaq/IBD](https://www.nasdaq.com/articles/ibd-rating-upgrades-intercontinental-exchange-flashes-improved-relative-price-strength)
- **しきい値**: 早期段階の勝ち株は **>80**、推奨 **≥90**、**<70 は回避**。[Nasdaq/IBD](https://www.nasdaq.com/articles/ibd-rating-upgrades-intercontinental-exchange-flashes-improved-relative-price-strength) / [AAII](https://www.aaii.com/stocks/screens/78)
- **RS Rating ≠ RS Line**: RS Line は株価バー下の青線で「**S&P 500 比**」の相対パフォーマンス（パーセンタイルではない）。[Yahoo/IBD](https://finance.yahoo.com/news/relative-strength-line-identify-emerging-210700981.html)
- **計算近似**: 直近12か月リターンを四半期加重（直近Qを2倍重み：`0.4×Q1 + 0.2×Q2 + 0.2×Q3 + 0.2×Q4`）→ 全ユニバースでパーセンタイル化（IBD 正式式は非公開）。

### N — ベースパターンの幾何学的定義

| パターン | 形成期間 | 深さ | 買いポイント（ピボット） |
|---|---|---|---|
| **Cup with Handle** | ハンドル込み **最低7週**（カップ単独 最低6週、ハンドル単独 最低5取引日） | カップ深さ **30〜33%以内**（弱気相場例外で40〜50%可） | **ハンドル最高値 +10セント**（Baidu: ハンドル高値$132.80 → ピボット$132.90） |
| **Cup（ハンドル無し）** | 最低6週 | 52週/史上最高値から 30〜33%下落 | ベース**左側ピーク +10セント** |
| **Flat Base** | 通常5週以上 | 浅い（〜15%程度） | ベース直近最高値 +10セント |
| **Double Bottom（W字）** | — | 2番目の底は通常1番目より低い | **W字中央の日中ピーク +10セント** |

- **ハンドル追加条件**: 押し目は最大15%だが勝ち株では **8〜12%以内**。ハンドルは**ベース上半分**で形成（midpoint test）。通常下落日で始まる。[Nasdaq/IBD cup-handle](https://www.nasdaq.com/articles/basics-how-analyze-stocks-cup-handle-2018-01-03) / [Nasdaq/IBD chart-reading](https://www.nasdaq.com/articles/chart-reading-basics-how-find-correct-buy-point-leading-stocks-2017-10-02)
- **buy zone**: ピボット突破後 **+5%まで**。超えたら extended。[Nasdaq/IBD](https://www.nasdaq.com/articles/ibd-rating-upgrades-intercontinental-exchange-flashes-improved-relative-price-strength)

### S — 出来高（Supply & Demand）
- ブレイクアウト時の出来高は **50日平均出来高比 +40%以上**が理想。小型中型株は **2〜3倍**。[Nasdaq/IBD](https://www.nasdaq.com/articles/basics-how-analyze-stocks-cup-handle-2018-01-03)
- **10週移動平均を割り込んでのブレイクは避ける**。
- アキュムレーション/ディストリビューション（A/D Rating, A〜E）で大口の買い集め/売り抜けを判定。[Yahoo/IBD](https://finance.yahoo.com/news/accumulation-distribution-rating-tells-pros-234100013.html)

### M — 市場方向（要検証だが IBD 定番定義）
- **Distribution Day**: 主要指数（Nasdaq総合・S&P 500・NYSE）が**前日より出来高増を伴い 0.2%以上下落**した日。直近4〜5週で **6〜7日積み上がると天井サイン**（時に8〜9日でも上昇継続あり）。[Nasdaq/IBD](https://www.nasdaq.com/articles/how-do-you-spot-major-stock-market-top-heres-easy-way-2017-12-21)
- **Follow-Through Day**: 下落相場の反転確認。安値試行から **4日目以降**に主要指数が**出来高増を伴い +1.5%前後上昇** → 新上昇相場の点灯シグナル。

---

## §3. 実装の計算式・データ要件・落とし穴

**必要データ**: 日足 OHLCV（最低13か月）、50日/200日 SMA、10週(=50日)移動平均、52週高値、50日平均出来高、ユニバース全銘柄の12か月リターン（RS パーセンタイル用）、主要指数の日足。→ FMP Ultimate + 既存配線で取得可能。

**よくある落とし穴**:
1. **RS は「自分の過去」ではなく「全銘柄横断」のパーセンタイル**。self-history percentile で代用すると CAN-SLIM の L とは別物。
2. **ピボット = 終値ではなく日中高値 +10セント**。終値ブレイクと混同しない。
3. **出来高条件は「ブレイク当日」**の 50日平均比。週次平均と混同しない。
4. **カップ深さの分母は「左側ピーク（直近52週高値）」**。安値起点ではない。
5. ベース期間の**下限（7週/6週）**未満の短期反発をベースと誤検出しやすい。

---

## §4. 既存実装との重複マップ（衝突回避）

| CAN-SLIM テクニカル要素 | BeatScanner 既存/進行中 | 衝突リスク |
|---|---|---|
| N: Cup-with-Handle base | ✅ `_detect_cup_handle`（state機械含む） | 🔴 高（再実装になる） |
| N: 新高値ブレイクアウト（cup以外） | 🟡 進行中 `_detect_breakout`（`bo_*`/`pattern_type='breakout'`） | 🔴 直接衝突 |
| S: ブレイクアウト出来高 | 🟡 進行中 breakout（出来高判定 + viz Sprint 3予定） | 🔴 直接衝突 |
| M: Distribution/FTD | ✅ `FtdRegimeBanner` + `DistributionDaysCard` | 🟢 低 |
| C/A/S(自社株買い) ファンダ | ✅ `screener_fundamentals` | 🟢 低 |
| L: RS | 🟡 部分（self-history percentile） | 🟡 中 |
| I: 機関投資家 | ❌ 未実装（13F遅延で deferred） | 🟢 白地 |

→ **N・S を新規実装してはいけない**（進行中ブランチと確実に衝突）。

---

## §5. 売り（利確/損切り）ルール
- **損切り: 買値から −7〜8%** で機械的に売る（最重要）。
- **利確: +20〜25%** で大半を利確。[Yahoo/IBD 20% rule](https://finance.yahoo.com/news/using-20-sell-rule-help-200500142.html)
- **8週ホールド例外**: ブレイクアウトから **3週間以内に +20%上昇**した強力銘柄は **8週間ホールド**。[Yahoo/IBD 8-week hold](https://finance.yahoo.com/news/know-invoke-8-week-hold-215800238.html) / [TraderLion](https://traderlion.com/trading-strategies/the-8-week-hold-rule/)
- ℹ️ BeatScanner の「買値登録 → −7〜8%損切り / +20〜25%利確で通知」構想（¥10k tier 素地）と完全整合。

---

## 主要出典（primary/secondary）
- IBD/Nasdaq: [RS/buy zone](https://www.nasdaq.com/articles/ibd-rating-upgrades-intercontinental-exchange-flashes-improved-relative-price-strength) / [Cup-with-Handle](https://www.nasdaq.com/articles/basics-how-analyze-stocks-cup-handle-2018-01-03) / [buy point各パターン](https://www.nasdaq.com/articles/chart-reading-basics-how-find-correct-buy-point-leading-stocks-2017-10-02) / [Distribution Day](https://www.nasdaq.com/articles/how-do-you-spot-major-stock-market-top-heres-easy-way-2017-12-21)
- Yahoo/IBD: [RS Rating](https://finance.yahoo.com/news/relative-strength-rating-pinpoints-stocks-214500318.html) / [RS Line](https://finance.yahoo.com/news/relative-strength-line-identify-emerging-210700981.html) / [A/D Rating](https://finance.yahoo.com/news/accumulation-distribution-rating-tells-pros-234100013.html) / [20% sell](https://finance.yahoo.com/news/using-20-sell-rule-help-200500142.html) / [8週hold](https://finance.yahoo.com/news/know-invoke-8-week-hold-215800238.html)
- [AAII CAN-SLIM screen #78](https://www.aaii.com/stocks/screens/78)（C/A/L しきい値 SSOT）

---

## §6. Sprint A 監査結果（2026-06-17・コード変更ゼロ）

既存しきい値（`reference_cup_handle_thresholds` + RS screener）を CAN-SLIM canonical と照合。**全項目整合、変更不要**（user 方針「条件を増やしすぎると不信感」に合致）。

| 項目 | 既存実装値 | CAN-SLIM canonical | 判定 |
|---|---|---|---|
| Cup 深さ最大 | `depth_max=0.33` | 30〜33% | ✅ 一致 |
| Cup 期間最小 | `cup_min_weeks=7` | ハンドル込み最低7週 | ✅ 一致 |
| Handle pullback 最大 | `handle_pullback_max=0.12` | 8〜12%（max15%）| ✅ 一致（保守的）|
| Pivot offset | `$0.10` | ハンドル高値 +10¢ | ✅ 完全一致 |
| Cup breakout 出来高 | `breakout_volume_multiplier=1.40` | 50日平均比 +40% | ✅ 完全一致 |
| RS screener しきい値 | `/api/scanner/rs min_percentile=80` | RS ≥80 | ✅ 完全一致 |
| breakout signal 出来高 | `vol 1.5x`（+50%）| +40%（canonical）| ⚠️ 意図的に厳しめ（breakout セッションの実データ検証採用・bug でない）→ 変更不要 |

補足: handle 高値超え許容 10%（v126）・左右リム 0.92 は ATH 主導株（LLY/GE/META/NVDA）救済の意図的緩和で、`breakout_extended` 再分類ガード（v147/v148）付き。canonical 違反ではないため変更しない。

**結論: Sprint A はコード変更ゼロで完了**（既存実装は CAN-SLIM テクニカル基準に既に準拠）。

---

## §7. 一次資料（原典・頁つき）— 2026-06-18 PDF 抽出

> **出典**: 『オニールの成長株発掘法』(William O'Neil, *How to Make Money in Stocks* 第4版 邦訳) PDF を頁指定でサブエージェント抽出。§1-§6 の deep-research（secondary: IBD/AAII）を**原典で裏取り**し、さらにチャートパターンの**形成段階**を追加した。reader 頁は邦訳版本文頁。
> **用途**: スクリーナー「蛇口（指標）の緩い/標準/厳しい段階化」の厳格な根拠（[[project_screener_fundamental_threshold_grading]]）。
> ⚠️「緩い/標準/厳しい」の段階区分は BeatScanner 実装向けの整理であり、原典の言葉ではない。**RS<70 と弱気相場(M)は段階に関係なく禁止のハードゲート**。

### §7.1 CAN-SLIM 7条件の段階値（原典数値）

| 条件 | 緩い（床/必須） | 標準 | 厳しい（最良） | 原典頁 |
|---|---|---|---|---|
| **C** 当四半期EPS(YoY) | +18〜20% | +25% | +50〜100%超 | p.179-197 |
| **A** 年間EPS | 3年連続増 | +25%/年 | +50%/年以上 | p.197-210 |
| **N** 新高値/ピボット | ベースからブレイク（ピボット+5〜10%以内で買い） | +5%以内 | +5%以内 | p.211-224 |
| **S** 需給・出来高 | 出来高 +25% / 小型優先 | +40% | +50%以上 / 浮動株少 | p.225-233 |
| **L** RS指数 | **≥70（絶対床・70未満は禁止）** | ≥80 | ≥90 | p.235-243 |
| **I** 機関保有 | 5社以上 | 10社以上＋増加中 | 優秀ファンド複数＋直近買増 | p.249-257 |
| **M** 市場地合い | 指数が50日線上 | フォロースルー確認済 | 主要3指数 全て強気 | p.260-312 |

- ROE: 最低 **17%**、理想 **25〜50%**（C/A 共通、p.179-210）。
- 過剰な機関保有（株式の大半）は逆にリスク（シスコ・JDSユニフェイズ等の急落事例、p.249-257）。
- M の天井サイン: 失速日（distribution day, 出来高増で指数 −0.2%以上下落）が **4〜5日内に3〜5回**。底サイン: フォロースルー日（底1日目の後 **4〜7日目以降**に出来高増＋ **+1〜1.5%以上**）。p.260-312。

### §7.2 チャートパターンの形成段階（新規・テクニカル蛇口の根拠）

**取っ手付きカップ（Cup with Handle）— 3段階**（p.121-130）

| 段階 | 判定条件 |
|---|---|
| ① カップ形成中 | 期間7〜65週（多くは3〜6ヶ月）／深さ 12〜33%（最大50%は危険）／**U字必須・V字は失格**／形成前に上昇トレンド＋RS30%上昇 |
| ② 取っ手形成中 | 1〜2週以上／**ベース上半分**に形成（下半分は失格）／押し目 8〜12%（最大15%、20%超は失格）／安値付近で**出来高減少**／10週線より上 |
| ③ ブレイク確定 | 取っ手高値（ピボット）を上抜け／出来高 **50日平均比 +40〜50%以上**／ピボット +5〜10%以内で買い |

**その他パターン**

| パターン | 定義・段階 | 出来高 | 原典頁 |
|---|---|---|---|
| ダブルボトム（W底） | 2番底（D）が1番底（B）より**低い**こと／中央高値（C）上抜けが買い点／取っ手付きは E/F | ブレイクで増加 | p.139-142 |
| 平底（フラットベース） | 調整 **10〜15%以内**／**5〜6週以上**（1〜3週は信頼低）／高値抜けが買い点 | ブレイクで増加 | p.143-145 |
| 上昇ベース | 上昇途中で**3回の押し**（各10〜20%）、安値が切り上がる／3回目反発で買い | — | p.157-158 |
| 高位フラッグ | 先行急騰 **100〜120%**／調整 10〜25%／**4〜8週**（rare・high risk） | 安値で出来高減→ブレイクで急増 | p.147-155 |
| 正方形（タイトボックス） | 1〜5%の浅い調整／4〜7週 | — | p.145-146 |

**全パターン共通**: ベース前に上昇トレンド必須／最低5〜6週／**弱気相場のベースでは買わない**／3〜4回目のベースは主導株でないサイン（リスク上昇）。

### §7.3 原典 vs 既存実装の照合（§6監査の原典再確認）

| 項目 | 既存実装 | 原典 | 判定 |
|---|---|---|---|
| カップ深さ33% / 取っ手12% / 出来高+40% / RS80・90 / buy zone+5% | 既存値 | 一致 | ✅ §6監査を原典で再確認 |
| pivot +$0.10 | `$0.10` | 英語原典の慣例。**邦訳本文には明示なし**（誤差小） | ⚠️ 注記 |
| **平底 / ダブルボトム / 上昇ベース / 高位フラッグ / 正方形** | 未実装 | 原典に定義あり | 🆕 蛇口化の新規候補（SPEC S5） |

