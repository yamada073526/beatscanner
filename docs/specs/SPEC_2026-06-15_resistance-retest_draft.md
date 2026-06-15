# SPEC(最終版): 旧レジスタンス・リテスト水準 検出

> **status**: final pseudo-SPEC (2026-06-15) — 6視点レビュー + じっちゃま再現検証を反映
> **codename**: 内部 state `resistance_retest` / UI 中立名は §6 で確定
> **北極星**: 原則4「人力の代替」— 「旧抵抗を上抜けて、サポート転換した水準まで押し戻ってきた」銘柄を毎晩 scan→朝メールで肩代わりする。
> **本SPECの diff**: 検出は新規独立関数 `_detect_resistance_retest`、配信は既存 nightly digest 基盤への増設。既存 `pullback_to_support` は温存。

> ## ⚠️ 実装時の重要修正 + 確定事項 (2026-06-16 夜間 autopilot)
> **(A) retracement は band 内でなく pivot 基準に修正(実装で確定)**: §1.2 の「band_high→band_low 帯内 retracement」は
> role==resistance_turned_support が定義上 today>band_high のため**常時負になり3段閾値が一切発火しない数学的破綻**。
> 検証エージェントの **pivot 基準** `retracement_pct = (cup pivot - 現在値)/(pivot - band_high)` に修正。
> pivot 不在(cup未検出=GOOG)は自然に非該当=確定事項①と一致。**本番実OHLCで NVDA=deep(72%)/AAPL=shallow(37.6%)/
> GOOG=非該当/AVGO=非該当 を再現確認済**。C1b(高値圏ガード)は 0.85 が NVDA(0.824)/AAPL(0.829)を誤除外したため
> **0.70 に校正**(崩れ除外は role が担う — 実データで PLTR/TSLA/MSFT/META=overhead_resistance, AMZN=pivot不在を確認)。
>
> **(B) user 承認の6確定事項 (2026-06-15)**: ①GOOG=救済しない(非該当、$355.19は参考併記のみ) ②AAPL=shallowで拾い注記
> ③funda崩れ(売上YoYマイナス OR 2Q連続failed)は配信除外 ④pullback_to_supportと別state並走 ⑤配信MVP同梱(本番ON=
> メール/Premium課金/LP掲載は朝の6体合議後) ⑥件名1通集約。
>
> **(C) 夜間 autopilot 実装済(本番反映・flag default OFF / §38は全ユーザー)**:
> backend `_detect_resistance_retest` + /api/technical additive(4ab8e92/0fbcfb8) / golden test 11ケース(ca6f63b) /
> §38: blocklist BAD-11 両mirror + BuyZoneCard 緑/シアン→中立 + buyZoneLabels静的辞書 + BuyZoneCard リテスト表示
> flag `?retest=1`(bf80ed9)。**残=screener section / Premium gate / LP / mailer / 配信ON は朝の合議・funnel-cro後**。

---

## TL;DR(4行)

1. **検出は `_detect_cup_handle` の内部分岐ではなく独立関数 `_detect_resistance_retest()` に切る** — 既存 `pullback_to_support` は `today_close > ext_pivot` ガード内にあり、pivot 下に押し戻した NVDA($205<$224)を構造的に拾えないため(実コード裏取り済 main.py:13282)。
2. **retracement は cup pivot を分子に使わず、`box_support` 帯 1 本で測る** — pivot(未突破 formation)と support(別構造)を 1 軸の両端にする草案は意味が接続しない。`band_high`(突破した旧抵抗上限)→ `band_low`(割れ判定線)の帯内位置で全銘柄統一。これで pivot fallback も `synthetic_swing_pivot` も `EVENT_LEVELS` も不要になる。
3. **接近は 3 段判定** — じっちゃま再現検証で「閾値 1 本の二値では NVDA(深い)と AAPL(浅い)の分離とじっちゃま全該当が数学的に両立不能」と確定したため。`深い該当 / 浅い該当(amber注記) / 非該当` の 3 段。
4. **§38**: 緑・シアンを 1 箇所も出さない(BuyZoneCard の既存緑+シアンバグも同 PR で是正)、narration 静的辞書、免責近接、メールの PASS ハードコード撤廃を MVP 必須に含める。

---

## 0. 設計判断の起点 — なぜ独立関数か(草案§0 を撤回)

**草案の致命的誤り(レビュー全6視点が指摘、実コードで確定)**:
草案は「既存 `pullback_to_support` と同じ extended 分岐内で並走判定」としたが、実コード(main.py:13276-13340)では:

- `pullback_to_support` 分岐は `extended_candidate is not None and today_close > extended_candidate["ext_pivot"]` のガード**内部**にある。
- `_detect_cup_handle` は最初に該当した 1 state を `return` で即返す逐次関数。NVDA/AAPL は `formation` で先に return し、extended 分岐に**到達しない**。
- NVDA($205.19 < pivot $224.32)は `today_close > ext_pivot` を満たさず、この分岐自体に入れない。

→ **草案の「実装済みプリミティブで拾える」前提は崩れている。**

**確定方針**: 新規独立関数 `_detect_resistance_retest(times, highs, lows, closes, box_support)` を切り出す。`/api/technical` 内で `_detect_cup_handle` の return 後に**並列呼び出し**し、結果を別フィールド `resistance_retest` で返す(`cup_handle` の state 取り合いを物理的に回避)。`box_support` を主語にするため cup 未検出の GOOG 型も同じ経路で扱える。

---

## 1. パターン定義 — `box_support` 1 本で formalize(pivot を軸から外す)

### 1.1 入力プリミティブ(全て `/api/technical/{ticker}` で取得済)

| プリミティブ | 出所(main.py) | 役割 |
|---|---|---|
| `box_support.level / band_low / band_high` | `_detect_horizontal_support` (~12815) | サポート転換した旧レジスタンス帯。**retracement 軸の両端** |
| `box_support.role` | ~12874 | `resistance_turned_support` = 条件(2) |
| `box_support.touch_count / strength` | ~12889 | 帯の信頼度・成熟度 |
| `box_support.first_touch_date`(無ければ touch 期間で代替) | ~12815 | 鮮度ガード |
| `rs.* / dma_cross` | 既存 | 表示・配信フィルタ(非gate) |
| `ath_252w_high` | ~13316 | 高値圏ベース判定 |
| 現在価格 `today_close` | — | リテスト位置 |

### 1.2 じっちゃま3条件の formal 化(最終)

```python
# 条件(1) 明確なブレイクアウト = 旧レジスタンスを上抜け済み
#   pivot(cup)を使わず、box_support.role で代替。
#   role == "resistance_turned_support" は「旧抵抗が複数回 test されてサポート転換した」
#   = 上抜けは事実上証明済み(frontend-architect HIGH-2 / じっちゃま忠実度 verdict)。
#   ※ had_breakout_above_pivot という架空フィールドは草案から全削除。
C1 = (box_support is not None) and (box_support["role"] == "resistance_turned_support")

# 条件(1') 鮮度ガード — 崩れた後の戻り売りゾーンを除外
#   リテスト先の帯が52週高値の85%以上(高値圏のベース)。
#   PLTR/TSLA 型(高値から大きく剥落した中段帯)を物理 drop。
C1b = (box_support["level"] >= ath_252w_high * 0.85)
#   かつ 帯の最後のタッチが12ヶ月以内(first_touch でなく last_touch 基準)
C1c = (days_since_last_touch <= 365)

# 条件(2) サポート転換の強度 + 成熟度
#   touch>=4(strength='strong'閾値)。配信は §7 で touch>=5 AND span に絞る
C2 = (box_support["touch_count"] >= 4)

# 条件(3) サポート付近まで押し戻し、まだ割り込んでいない(帯内位置で測る)
#   retracement_pct = band_high を 0%、band_low を 100% とした現在値の位置。
#   = 「突破した旧抵抗(band_high)からサポート割れ線(band_low)へどこまで戻ったか」
#   分母は band 幅(常に正)。pivot 不在でも全銘柄で決定論的に算出可能。
denom = max(box_support["band_high"] - box_support["band_low"], box_support["band_high"] * 0.001)
retracement_pct = (box_support["band_high"] - today_close) / denom * 100.0
#   割れ判定:band_low を 0.5% 超下回ったら物理 drop
dist_to_band_low = (today_close - box_support["band_low"]) / box_support["band_low"]

C3_deep    = (retracement_pct >= 50.0) and (dist_to_band_low >= -0.005)   # 深い該当
C3_shallow = (30.0 <= retracement_pct < 50.0) and (dist_to_band_low >= -0.005)  # 浅い該当
# 上方向の暴走除外:band_high より大きく上(retracement < 0 = まだ全然戻ってない)は非該当
C3_too_high = (retracement_pct < 30.0)

approach_level = (
    "deep"    if (C1 and C1b and C1c and C2 and C3_deep)    else
    "shallow" if (C1 and C1b and C1c and C2 and C3_shallow) else
    None
)
RESISTANCE_RETEST = approach_level is not None
```

> **設計を 1 階層削った**: cup pivot を retracement 軸から外したことで、草案§1.4 の pivot 3 段 fallback(`cup_pivot`/`synthetic_swing_pivot`/`ath_proxy`)も §2b の `EVENT_LEVELS` 手動 dict も**不要**になった(テクニカル定量 verdict 必須項目を反映)。GOOG はこの帯内定義で box_support($322.87 帯)に対し決定論的に判定される(下記§1.4)。

### 1.3 出力スキーマ(最終)

```jsonc
{
  "detected": true,
  "state": "resistance_retest",
  "approach_level": "deep",          // "deep"(≥50%) | "shallow"(30-50%)
  "retracement_pct": 64.9,           // band_high→band_low の帯内位置 %
  "dist_to_band_low_pct": 6.9,       // 割れ判定線からの距離 %
  "dist_to_band_high_pct": -3.8,     // 旧抵抗上限からの距離 %(負=帯内に戻った)
  "box_support": { "level": 194.84, "band_low": 191.92, "band_high": 197.76,
                   "touch_count": 9, "role": "resistance_turned_support",
                   "strength": "strong", "days_since_last_touch": 12 },
  "levels": [ /* §2b: 参考併記。approach_target には使わない */ ],
  "market_context": "neutral",       // "weak"(SPY 200DMA 下) 時は screener 注記
  "healthy_retest": true,            // §1.5 出来高プロファイル(配信フィルタ)
  "rs": { "self_percentile": 30, "universe_percentile": 56, "vs_spy_pct": 3.9 }
}
```

### 1.4 GOOG の扱い — `EVENT_LEVELS` を撤回、box_support 単独で正直に判定

**再現検証の事実**: GOOG は cup 未検出、現在 $358.16 が box_support の `band_high`($327.72)を**上回っている**。帯内定義では `retracement_pct < 0`(まだ全然戻っていない)= **非該当**。

**確定方針(§38 + Trust Cliff + テクニカル定量 verdict 一致)**:
- `EVENT_LEVELS` 手動 curated dict(GOOG 公募価格 $355.19 を support 扱い)は **MVP で採用しない**。理由:
  1. 公募増資価格を「サポート性のある水準」として `approach_target` に採用し「+0.8%=ほぼ到達」と出すと、アルゴリズム由来でない裁量水準に「接近=好機」の含意を人手で付与 = 景表法§5/§38 の新たな火種(§38 verdict)。
  2. 「じっちゃま発言の数値化」は出典検証可能性が低く Trust Cliff の入口(テクニカル定量 verdict)。
  3. 運用オーナーシップ・陳腐化・分割調整が未解決(QA verdict)。
- **GOOG は「box_support 単独で非該当」のまま正直に落とす。** 救済しないのが §38 的に最も安全。
- GOOG の公募価格水準は、別途「参考水準」として `levels[]` に**出所明記で併記表示するのみ**(approach の主語にしない、§2b)。Phase 3 で FMP 決算ギャップ起点など再現可能な数値源を確保してから自動化を再検討。

→ **じっちゃま再現は「NVDA=深い該当 / AAPL=浅い該当 / GOOG=非該当(参考水準併記) / AVGO=除外」に確定。** GOOG を「該当」に倒すことは §38 リスクと引き換えなので**見送り**、§11 で user gate に上げる。

### 1.5 出来高プロファイル(配信品質フィルタ、テクニカル定量 med 反映)

押し戻しの「質」を補助シグナル化(gate にはしない、配信を絞る):
```python
# healthy_retest = 押し戻し局面の平均出来高 < ブレイク時出来高(売り枯れ)
# distribution_warning = 押し戻し中に avg_volume_50 の 1.5倍超(売り抜け)
```
`_extended_numeric_fields` 同様、出来高比 1 フィールド追加で実装可。**朝メール配信は `healthy_retest=true` のみ**に絞り、落下中銘柄の false positive を減らす。

---

## 2. 3つの核心パラメータ(最終確定値)

### (a) 接近判定 = `RETRACE_MIN` を二値でなく**3段**に確定

| 段 | 閾値 | 該当例 | 表示 |
|---|---|---|---|
| **深い該当** | `retracement_pct >= 50.0` | NVDA(64.9%) | amber「リテスト接近」 |
| **浅い該当** | `30.0 <= retracement_pct < 50.0` | AAPL(34.1%※) | amber + 注記「押し戻し浅い」 |
| 非該当 | `< 30.0` または band_low 割れ | GOOG / AVGO | 非表示 or 物理drop |

- **確定根拠(1行)**: 再現検証で「閾値 1 本の二値では NVDA(深い)拾い・AAPL(浅い)落としと、じっちゃま=AAPL 該当が数学的に両立不能」と確定 → 3 段化で NVDA と AAPL の濃淡を保ちつつ両方拾う(草案§11-1 後者案を default 化)。
- **第2ガード `dist_to_band_low >= -0.005`**: AVGO「買いゾーン割り込み」を物理 drop。**ただし主たる除外は C1(role) であり、このガードは band 微割れの gray zone 用**(QA med 指摘を反映し説明を修正)。

> **AAPL の注意(QA/テクニカル high)**: AAPL は実コードで `formation`(cup pivot $305.64 未突破)。だが本機能の C1 は cup pivot でなく **box_support.role** で判定するため、AAPL の box_support($263.12 帯、touch10、role=resistance_turned_support)に対して帯内 retracement を計算でき、`shallow` で正しく拾える。「未突破=リテストでない」という批判は cup pivot 基準の話で、box_support 基準では成立する(これが pivot を軸から外す利点)。※ AAPL の現在値が band_high の上か下かは本番 curl で確定(§8)。

### (b) 複数水準の併記 — `levels[]`(参考表示のみ、approach_target には pivot/event を使わない)

```python
levels = []  # 各 {kind, price, label, dist_pct, source}
levels.append({"kind": "box_support", "price": box_support["level"], "label": "サポート転換帯"})
# pivot(cup があれば)は「旧抵抗の参考線」として併記。approach_target にはしない(QA med)
if cup_handle and cup_handle.get("pivot"):
    levels.append({"kind": "pivot_ref", "price": cup_handle["pivot"]["price"], "label": "旧抵抗(参考)"})

# approach_target は box_support 1 本に固定(動的ジャンプを排除、テクニカル定量 low)
approach_target = "box_support"
```

- **確定根拠(1行)**: `EVENT_LEVELS` 撤回(§1.4)+ approach_target を box_support 固定で「価格が水準を割った瞬間に approach 先が -10% 下へワープする」動的ジャンプを排除。pivot は方向の参考線として表示するが support 候補にしない。

### (c) RS は **非gate(表示のみ)+ 打消し明示**

**確定: RS を filter 条件にしない。`rs.*` を response に含め、UI はバッジ表示のみ。**

- **根拠(1行)**: 精査3銘柄とも RS 中位以下(NVDA self30/AAPL self29/GOOG self20)、じっちゃまは価格構造で買いゾーンを語る。RS を gate にすると 3 銘柄全滅。
- **§38/§5 の打消し明示(§38 med 反映)**: バッジは必ず「相対強度: self 30(参考指標・本パターンの採否には不使用)」と非採用を明示。`universe_percentile < 40` には neutral テキストで「相対強度は市場平均以下」注記(warning 色は使わない)。配信メールにも同注記を 1 行。
- **下降トレンド除外(テクニカル定量 med 反映)**: RS 低位そのものでなく `50DMA < 200DMA` or `vs_spy 継続マイナス` の銘柄に warning フラグ → 検出は残すが**朝メール配信からは除外**(落ちてくるナイフを弾く)。

---

## 3. 対象ユニバース

| レーン | universe | 理由 |
|---|---|---|
| nightly scan(配信源) | **本番 = russell3000**(nightly_scan.yml 環境変数で固定)。手動 API テスト/unit test は sp500 でも動作 | 既存 cup-scan に相乗り、追加 API 0 |
| individual detail | 任意 ticker | `/api/technical/{ticker}` がそのまま返す |
| WL+保有の優先スキャン | ⏭ Phase 3 | 北極星本丸だが MVP は universe 全体で先に価値 |

- **ADR 注記(QA low)**: 外貨建て報告銘柄(BABA/ASML/TSM)は box_support の信頼性が為替換算で低下。MVP では除外せず、`is_adr` フラグで touch_count バッジに注記(Phase 2)。
- **市場環境(QA med)**: `market_context == "weak"`(SPY 200DMA 下)の銘柄は screener で amber 注記「市場環境: 弱気」を併記。
- **決算直前(QA med)**: `days_to_earnings <= 5` は配信から除外 or `is_pre_earnings` 注記(FMP `/stable/earnings` で追加 API 0)。

---

## 4. Tier と Free での見せ方

| 項目 | 確定 | 根拠 |
|---|---|---|
| tier | **Premium**(`buy_zone_pivot` と同 tier) | 価格構造スキャン+配信は最上位の人力代替価値 |
| feature key | **新規 `retest_scan = PLAN.PREMIUM`** を planGating.js に追加 | UpgradeModal で独立訴求行を出すため |
| Free / 非Premium screener | top1 visible + 残り `_mask_signal_for_free` で **backend 段階 payload 除外**(CSS blur だけにしない) | 既存 main.py:18656 をそのまま再利用(state+ticker のみ残す) |
| Free の朝メール | 送らない。「Premium で旧抵抗リテスト接近を毎朝メール」と訴求 | 配信は Premium の核心 |
| 未ログイン LP | ticker 名のみ見せ・数値伏せ + ProTeaser | demoMode。**LP 訴求文との同期必須(§6)** |

---

## 5. 配置(どこに何を)

| 配置先 | 出すもの | 実装 |
|---|---|---|
| **screener Hero section(新規)** | 「旧抵抗リテスト接近」銘柄群。**rank circle(序列番号)を出さず**、approach 距離%バッジでフラット表示 | ScreenerPane に HeroSection 1 個。eyebrow は欠番回避で既存連番の次。§38注記を section header に近接 |
| **screener chip filter `retest`(新規)** | 既存 leader/rising/new-cwh に4つ目。**chip ref を refMap オブジェクト化してから追加** | ScreenerPane(三項チェーン → `{leader, rising, 'new-cwh', retest}` map) |
| **個別 detail の BuyZoneCard** | `resistance_retest` カード。複数水準併記 + 接近%。**amber固定、緑・シアン禁止** | BuyZoneCard 新分岐 + 既存緑/シアン是正(§6) |
| **StateCompass** | 短語「旧抵抗→支持転換」 | COMPASS_PRICE_LABEL 新 key |
| **nightly push(朝メール)** | リテスト接近への遷移を digest に1セクション。**funda 実値表示** | mailer + transition map(§7) |
| **専用タブ** | 作らない | 5原則③シンプル |

> **§38 序列暗示の排除(§38 med)**: Hero section の rank circle(1〜5位)は「1位が最も買い」の序列暗示になり中立命名を相殺する。**接近度バッジ(残り N%)に置換し「順位」でなく「状態」を出す。**

---

## 6. §38 表現層 — 確定文言(曖昧さゼロ)

### 中立命名(確定)

- **内部 state**: `resistance_retest`
- **BuyZoneCard h3 タイトル**: `旧レジスタンス・リテスト水準`
- **chip 短語**(14字超過回避、テクニカル定量 low): `リテスト接近中`(7字)
- **UpgradeModal `FEATURE_LABEL_JP['retest_scan']`**: `支持線リテスト接近スキャン`(LP の「支持線・ピボット価格」に接続、CRO Trust Cliff 反映)
- **LP Premium bullet に追加**: `✓ 旧抵抗線リテスト接近スキャン・朝配信(Premium)`(LandingPage.jsx:1766 の隣)
- **「買い」「買いゾーン」「買い場」を UI に一切出さない。**

### 色(緑・シアン禁止 — 既存バグも同 PR で是正)

実コード裏取りで BuyZoneCard に **3 箇所**の §38 リスク色を確認:

```js
// BuyZoneCard.jsx の確定変更(草案は L160 1箇所しか触れず L149/L175 が緑・シアン残存)
// L117: isPullback → 中立パターン集合に拡張
const isNeutralPricePattern = cupState === 'pullback_to_support' || cupState === 'resistance_retest';

// L149 deltaTone: resistance_retest で 'gain'(緑)を出さない
const deltaTone = (isNeutralPricePattern || distancePct == null)
  ? 'muted'
  : (distancePct >= 0 ? 'gain' : 'loss');

// L160 chip tone: 'gain'(緑) → 'warning'(amber)
tone={isNeutralPricePattern ? 'warning' : 'gain'}

// L175 label chip: 'accent'(シアン=ブランド色、上昇暗示誤読) → 'muted'
tone={isNeutralPricePattern ? 'muted' : 'accent'}
```

- 使ってよい色: **amber(warning)/ neutral(muted)/ blue(info)** のみ。amber は「割れたら pattern failure」の両面警告色として正当。
- **既存 `pullback_to_support` の緑/シアンも本 PR で是正**(別タスクに切らず、同カードを触る以上インラインが安全 — テクニカル定量 med / CRO Issue 3)。

### narration = 静的辞書一択(LLM 不使用)— 確定文面

`buyZoneLabels.js` に新設。**両面性を明文化し、免責を必ず含める**(§38 med 2件反映):

```js
resistance_retest: {
  conclusion: "現在価格は旧レジスタンス・リテスト水準の帯内 {RETRACE_PCT}% に位置しています。",
  detail:
    "かつての上値抵抗線がサポートに転換した水準まで株価が戻った局面として観察されています。" +
    "この水準を割り込めばパターンの不成立(pattern failure)のサインとされ、" +
    "維持された場合でも将来の上昇を保証するものではありません。" +
    "投資判断はご自身でご確認ください。",
  // shallow 時のみ付加:
  shallow_note: "押し戻しは浅く、リテスト水準への到達途上の段階です。",
}
```

- **片面(好機)誘導の外部化を排除**: 「割り込めば failure / 維持しても上昇保証なし」の両面 + 「ご自身で確認」を必須(草案雛形は免責欠落、§38 med)。
- **免責近接**: カード footer に `BUY_ZONE_FOOTER`(出典 + 「※テクニカル分析は将来の値動きを保証しません」)強制 render。メールは既存 `DISCLAIMER_HTML/TEXT` 流用。

### blocklist — 本機能固有語彙を先に追加してから narration 実装(§38 必須)

現行 BAD-7〜9 は「リテスト」「サポート転換」「押し戻し」を**カバーしていない**(語彙が対象外だから 0 ヒットになるだけ = 安全の誤認、§38 必須)。**先に追加**:

```js
// blocklist.js + backend prompt_negatives.py に 1:1 mirror で追加
// BAD-10: 「〜まで戻れば反発」「割り込まなければ買い場」型の将来断定
/(?:リテスト|サポート|支持線|旧抵抗).{0,15}(?:なら|れば|たら).{0,10}(?:反発|上昇|買い)/
/割り込ま(?:なけれ|ず).{0,10}(?:買い|上昇|反発)/
```
追加**後**に narration の 0 ヒットを assert(§8)。

---

## 7. 自動スキャン & メール配信(MVP に含める — CRO high 反映で Phase 逆転)

> **Phase 配置の変更**: CRO verdict「配信を Phase2 に後退させると Premium 正当化(原則4の核心)が抜ける」を反映。**配信を MVP に含める。** コード量(transition map 2行 + mailer テンプレ + funda 実値化)は 1 スプリントに収まる。

### 7.1 検出→保存 — **`_CONSENSUS_CUP_STATES` の gate を必ず通す(frontend-architect MED-2 必須)**

実コードで `_CONSENSUS_CUP_STATES = ("breakout_pending","breakout_confirmed","breakout_extended")`(main.py:17116)が upsert の `.in_("state", ...)` **gate**(17241)。**この allowlist に追加しないと nightly scan で保存されない。**

```python
# 必須変更:
_CONSENSUS_CUP_STATES = (
    "breakout_pending", "breakout_confirmed", "breakout_extended",
    "pullback_to_support",   # 既存も実は保存漏れ(別途確認)
    "resistance_retest",     # 新規
)
```
`resistance_retest` は別関数の return なので、nightly scan ループで `_detect_resistance_retest` も呼んで `pattern_signals` に upsert(pattern_type は別名 `resistance_retest` で名前空間分離 / テクニカル定量 high)。

### 7.2 遷移検出 — **実観測してから transition ペア確定(§38 high / テクニカル定量 high)**

実コードの `_CUP_TRANSITION_MAP` は 2 種のみで、`breakout_extended` 起点の遷移は**ゼロ**。草案の `(breakout_extended→resistance_retest)` は prev_state が素直に遷移する保証がない。

- **MVP**: 最も確実な `(pullback_to_support → resistance_retest)` と、新 state 単独の「初検出」通知を入れる。
- **`_STATE_PRIORITY` を整数で再採番**(frontend-architect LOW-1):
  ```python
  _STATE_PRIORITY = {
      "breakout_confirmed": 0, "breakout_pending": 1,
      "pullback_to_support": 2, "resistance_retest": 3,  # pullback より緩い条件 = 下位
      "formation": 4, "cup_completing": 5,
      "breakout_extended": 6, "formation_market_weak": 7,
  }
  ```
- **Phase 2**: nightly ログで「どの prev_state から resistance_retest に入るか」を 1 週間観測 → 確定した遷移ペアを map に追加 + dedup(ticker+transition_type+7日)を実機 1 サイクル検証。

### 7.3 funda — 「PASS 必須」を撤回、「明確な崩れは除外」に確定

- **草案の「funda 非必須」を一部修正**(テクニカル定量/じっちゃま忠実度 verdict): 価格構造優先は維持しつつ、**「直近決算で売上 YoY マイナス OR all_passed=False が2四半期連続」は配信除外**(検出・detail には残す)。じっちゃま「崩れ銘柄は買わない」と整合。§11-3 を user 判断でなく**この default にコミット**。
- **mailer の PASS ハードコード撤廃(全 verdict 必須)**: mailer.py:140/188 の `ファンダ 5 条件: PASS (5/5)` を transition_type で分岐:
  ```js
  const fundaText = is_funda_passed
    ? 'ファンダ 5 条件: PASS (5/5)'
    : '価格構造パターン検出(ファンダ参照中)';
  ```
  **funda 未PASS銘柄を PASS と虚偽表示するのは景表法§5 直撃 → この修正完了まで配信に進まない。**

### 7.4 件名 — **変数名を変えず別定数を新設(QA high 必須)**

`SUBJECT_TEMPLATE.format(count=...)`(mailer.py:212)を壊すと既存配信が KeyError で死ぬ。

```python
# 既存はそのまま。retest 向けに別定数を追加(§38 推奨 risk 回避方針 mailer.py:74 を踏襲)
RETEST_SUBJECT_TEMPLATE = "📊 BeatScanner: 本日の注目の値動き {count} 件"
# send_*_digest に retest_count: int = 0 を追加し件名を選択
```
- 件名は「リテスト接近 N件」でなく「注目の値動き N件」に寄せる(§38 low — 既存「注目」方針と整合)。

---

## 8. 検証計画

### 8.1 ゴールデンケース回帰(`backend/tests/test_resistance_retest.py` 新規)

`times/highs/lows/closes` を実測値で固め、`_detect_resistance_retest` を直接呼んで assert(LLM 不使用で決定論的):

| ticker | retracement_pct | 期待 | 理由 |
|---|---|---|---|
| **NVDA** | 64.9% | `deep` ✅ | ≥50% + band_low未割れ。**この branch を実際に通ることを assert**(§38 high) |
| **AAPL** | 34.1%※ | `shallow` ✅(amber注記) | 30-50% 帯。じっちゃま該当を 3 段で再現 |
| **GOOG** | <0%(band_high上) | **非該当** | box_support単独。EVENT_LEVELS 撤回(§1.4)。救済しないのが default |
| **AVGO** | band_low下抜け | **物理drop** | `dist_to_band_low < -0.005` |
| PLTR/TSLA | 高値から-40%帯 | **除外** | C1b(`level >= ath*0.85`)不成立 |
| AMZN/MSFT/META | 崩れ | **除外** | C1(role)不成立 |

- **ZeroDivision/負値ガード(QA high 必須)**: `pivot <= support` / `band_high == band_low` で 500 にしないため `denom = max(..., band_high*0.001)`。各 fixture で `RESISTANCE_RETEST=False` を assert。
- ※ AAPL の retracement は band_high 基準で再計算(本番 curl で確定)。じっちゃま=該当を `shallow` で満たすことを固定。
- **閾値校正(テクニカル定量 med)**: MVP 後、russell3000 で `RETRACE_MIN` 各値の検出件数分布を 1 晩で取得し、日次 3-10 件に収まることを確認。backtest(検出後20日リターン)は Phase 3。

### 8.2 §38 / 色 回帰

- narration を `sanitizeText`(blocklist 新 BAD-10 追加後)に通し **0 ヒット** assert。
- **snapshot test で `resistance_retest`/`pullback_to_support`/`box_support` 全 state に `tone !== 'gain'` かつ `tone !== 'accent'` を assert**(緑・シアン両方、全 verdict 必須)。

### 8.3 視覚検証(visual harness exception)

`frontend/scripts/snap-retest-card.mjs`(headless 60s, .visual/ 出力)で NVDA detail を撮影 → Haiku vision で「緑・シアン不在 / 複数水準併記 / 免責可視」を採点(既存 snap-pdca-loop パターン)。

---

## 9. backend / frontend 変更点一覧

### Backend(`backend/app/`)

| ファイル:行 | 種別 | 変更 |
|---|---|---|
| `main.py` 新規 `_detect_resistance_retest()` | **新規関数** | §1.2。`box_support` 主語、帯内 retracement、3段判定、ZeroDivガード |
| `main.py:13666`(`/api/technical`) | **流用+並列呼出** | `_detect_cup_handle` return 後に `_detect_resistance_retest` を並列呼び `resistance_retest` フィールドで返す |
| `main.py:17116`(`_CONSENSUS_CUP_STATES`) | **必須追加** | `"pullback_to_support", "resistance_retest"` を allowlist に(これが無いと保存されない) |
| `main.py:18645`(`_STATE_PRIORITY`) | **整数再採番** | `resistance_retest: 3`、以降 +1 ずらし |
| `main.py:18807` 周辺(`scanner_cup_handle`) | **独立ブランチ** | `if filter == 'retest':` で funda AND を skip し state 絞込 + retracement 降順 sort(既存 filter を壊さない) |
| `main.py:16343`(`_CUP_TRANSITION_MAP`) | **追加** | `("pullback_to_support","resistance_retest"): "pullback_to_resistance_retest"` |
| `main.py:16518`(funda filter) | **方針変更** | retest は funda 非必須だが「明確な崩れは除外」(§7.3) |
| `mailer.py:78` | **別定数追加** | `RETEST_SUBJECT_TEMPLATE`(既存 SUBJECT_TEMPLATE は不変) |
| `mailer.py:104`(`_TRANSITION_LABEL`) | **追加** | `"pullback_to_resistance_retest": "押し目接近 → 旧レジスタンス・リテスト水準"` |
| `mailer.py:140/188` | **必須是正** | `ファンダ 5 条件: PASS (5/5)` ハードコード → funda 実値分岐 |
| `cron_cup_scan` / `nightly_scan.yml` | **scan に1関数追加** | 既存ループで `_detect_resistance_retest` も呼ぶ |
| `tests/test_resistance_retest.py` | **新規** | §8.1 |

### Frontend(`frontend/src/`)

| ファイル | 種別 | 変更 |
|---|---|---|
| `lib/buyZoneLabels.js` | **新キー+辞書+分岐** | `BUY_ZONE_LABEL_JP/DESC_JP['resistance_retest']` + `classifyBuyZone` 分岐 |
| `components/BuyZoneCard.jsx:117/149/160/175` | **新分岐+既存色是正** | `isNeutralPricePattern` 集合化、L149/160/175 の緑・シアンを amber/muted に(§6) |
| `features/workspace/ScreenerPane.jsx` | **新 section+chip+refMap化** | HeroSection(rank circle 無し・接近%バッジ)+ chip filter `retest` + chip ref を refMap に先リファクタ |
| `lib/planGating.js` | **新キー** | `retest_scan: PLAN.PREMIUM` |
| `components/UpgradeModal.jsx` | **新ラベル** | `FEATURE_LABEL_JP['retest_scan']='支持線リテスト接近スキャン'` |
| `components/LandingPage.jsx:1766` | **新 bullet** | `✓ 旧抵抗線リテスト接近スキャン・朝配信(Premium)` |
| `features/judgment/constants/stateCompassText.js` | **新キー** | `COMPASS_PRICE_LABEL['resistance_retest']='旧抵抗→支持転換'` |
| `lib/blocklist.js` | **BAD-10 追加** | §6(prompt_negatives.py と 1:1 mirror) |
| `scripts/snap-retest-card.mjs` | **新規(使い捨て)** | §8.3 |

---

## 10. Phase 分割

### MVP(1スプリント・本番リリース可能)— 「検出 + detail + screener + **朝配信**」

価値: screener/個別チャートで「旧抵抗リテスト接近」が見え、**Premium 朝メールで毎晩 scan を肩代わり**(原則4の核心を MVP で成立)。

1. backend: `_detect_resistance_retest`(帯内 retracement・3段・ZeroDivガード・鮮度ガード)を独立関数で
2. backend: `/api/technical` 並列呼出 + `_CONSENSUS_CUP_STATES` allowlist 追加 + `_STATE_PRIORITY` 再採番
3. backend: `scanner_cup_handle?filter=retest` 独立ブランチ
4. backend: mailer PASS ハードコード是正 + `RETEST_SUBJECT_TEMPLATE` + `_CUP_TRANSITION_MAP` 1行 + funda「崩れ除外」
5. frontend: buyZoneLabels + BuyZoneCard 新分岐 **+ 既存緑/シアン是正**
6. frontend: ScreenerPane HeroSection(rank circle無し)+ chip refMap化 + planGating + UpgradeModal + LP bullet
7. frontend+backend: blocklist BAD-10 追加(narration の**前に**)
8. test: ゴールデンケース + ZeroDiv + §38色 snapshot + blocklist 0ヒット
9. 検証: NVDA=deep / AAPL=shallow / GOOG=非該当 / AVGO除外を本番 curl + 翌朝メール着弾を scheduled-task で確認

→ **MVP は Phase gate 級(Trust Cliff + LLM出力品質 2軸 active)。リリース前に 6体合議(または最低 ui+frontend+qa の 3体)+ `funnel-cro` skill の Trust Cliff 7項目を必ず通す**(LP↔実装の「支持線・ピボット」文言同期、blur teaser 実態確認 — CRO high)。

### Phase 2 — 配信精緻化

10. nightly ログで遷移ペア観測 → `_CUP_TRANSITION_MAP` に確定ペア追加 + dedup 1サイクル検証
11. healthy_retest 出来高フィルタ / 決算直前除外 / 市場 weak 注記 / ADR 注記
12. 前日比 delta(「昨日より +5.2pt 接近」)で「毎日開きたく」を強化(CRO low)

### Phase 3 — パーソナライズ & イベント水準自動化

13. WL+保有を優先スキャン(per-user filter)
14. event_level を FMP 決算ギャップ起点で再現可能に自動算出(手動 dict は持たない)
15. backtest で retracement 帯別勝率検証 → 閾値の銘柄ボラ別動的化

---

## レビューで変わった点(草案 → 最終)

- **§0 配置**: 「extended 分岐内で並走」→ **独立関数 `_detect_resistance_retest` を `/api/technical` で並列呼出**(実コードで NVDA が pullback ガードに到達不能と確定。全6視点 high)。
- **retracement 軸**: 「pivot→support.level」→ **`box_support` 帯内(band_high→band_low)1本**。これで pivot 3段fallback / `synthetic_swing_pivot` / `EVENT_LEVELS` が**全て不要に**(テクニカル定量 必須 / 設計を1階層削減)。
- **接近判定**: 二値 `RETRACE_MIN=0.50` → **3段(deep≥50% / shallow 30-50% / 非該当)**。閾値1本では NVDA拾い・AAPL落としとじっちゃま全該当が数学的両立不能と再現検証で確定。AAPL を `shallow` で拾う。
- **C1**: 架空フィールド `had_breakout_above_pivot` を**全削除** → `box_support.role=='resistance_turned_support'` で代替(frontend-architect/テクニカル定量/じっちゃま忠実度)。
- **GOOG**: `EVENT_LEVELS` 手動dict救済 → **撤回。box_support単独で非該当(正直に落とす)**。§38リスクのため救済は user gate へ(§38/テクニカル定量/CRO 一致)。
- **鮮度・成熟度ガード追加**: `level >= ath*0.85`(崩れ後の戻り売りゾーン除外)+ last_touch 12ヶ月以内(テクニカル定量)。
- **色**: 草案は BuyZoneCard L160 の1箇所のみ → **L117/149/160/175 の緑・シアン3箇所を本PRで是正**(全verdict 必須)。
- **mailer**: `ファンダ 5 条件: PASS (5/5)` ハードコードの**虚偽表示是正を MVP 必須**に(funda非必須なのにPASS表示=景表法§5、全verdict)。
- **件名**: SUBJECT_TEMPLATE 変数名変更 → **別定数 `RETEST_SUBJECT_TEMPLATE`**(既存 `.format(count=)` の KeyError 破壊回避、QA必須)。
- **`_CONSENSUS_CUP_STATES`**: allowlist gate への追加を必須化(無いと nightly 保存されない、frontend-architect)。
- **配信の Phase**: Phase2 → **MVP に前倒し**(Premium正当化=原則4の核心が抜けるため、CRO high)。
- **transition ペア**: `breakout_extended→retest` を確定済として書く → **実観測してから確定**(prev_state遷移保証なし、§38/テクニカル定量)。
- **funda**: 「非必須」→「**明確な崩れ(売上YoYマイナス/2Q連続failed)は配信除外**」に default 確定。
- **RS/血slist/serial化**: RS 打消し明示 + 下降トレンド配信除外 / blocklist BAD-10 を narration の前に追加 / Hero rank circle を接近%バッジに置換 / ZeroDivガード追加。

## userに判断を仰ぐ未決事項

1. **GOOG 救済の可否(最重要)**: 推奨=**救済しない(box_support単独で非該当)**。`EVENT_LEVELS` 手動dict は §38/Trust Cliff リスクが高く、6視点中3視点が「救済しない方が安全」と verdict。じっちゃまが GOOG を「該当」としている点と乖離するが、公募価格を「サポート=接近好機」と人手で出すのは景表法§5/§38 の火種。**推奨: MVP は非該当、Phase3 で再現可能な数値源(FMP決算ギャップ)確保後に再検討。**
2. **AAPL 浅い該当の見せ方**: 推奨=**`shallow` で拾い amber+「押し戻し浅い」注記**(再現検証の最小修正案)。代替=非表示。拾う方がじっちゃま再現に忠実だが、「浅いのに出す」が誤誘導にならないか UX 判断。**推奨: 拾って注記。**
3. **funda 崩れの線引き**: 推奨=**「売上YoYマイナス OR all_passed=False が2Q連続」は配信除外、それ以外は funda 非必須**。じっちゃま「価格構造優先・崩れは買わない」の折衷。代替=funda PASS 必須(漏れ増)/ 完全非必須(ナイフ混入)。**推奨: 折衷案。**
4. **`pullback_to_support` と `resistance_retest` の共存**: 推奨=**別state並走(本SPEC)**。一本化は SPEC v2 回帰リスク大。代替=既存を作り直して一本化(UI状態数減)。**推奨: 並走。**
5. **配信の Phase 配置**: 推奨=**MVP に含める(本SPEC、CRO反映)**。Premium正当化のため。代替=screener先行・配信Phase2。コード量1スプリント想定が崩れる場合のみ後者。**推奨: MVP同梱。**
6. **件名の同梱 vs 分離**: 推奨=**既存 digest に別定数で同梱しない別メール**は通知過多 → 本文セクション + 件名を `RETEST_SUBJECT_TEMPLATE` で出し分け。**推奨: 1通集約(本文セクション)。**

---
