# SPEC(draft): 新高値ブレイク signal 検出 + 出来高ビジュアル

> **version note v2 (2026-06-16 overnight autopilot)**: §12.2 BLOCKING(10件)の是正 rewrite を **本文(§1〜§6)へ反映**した。**コードは一切変更していない**(SPEC 本文の整合のみ)。各反映は **要 user レビュー**。§11/§12 の台帳は履歴として残置し、反映済 item に「→ 本文反映済 (v2)」注記を追加。breakout の state は本版で **`bo_confirmed` / `bo_pending` / `bo_soft` / `bo_extended`** に一本化(§11.1 B1)、`classifyBreakoutZone()` 新設を前提に §1.8/§2.x/§4.1/§6 を一貫させた。design fork のある item は推奨方向を本文に書きつつ「⚠️user確認(decision)」を inline で残す(値は lock していない)。decision⑫(pending × tier)は **user 決裁待ちのまま**。
>
> **status**: ⚠️ **draft — 未着手 / Phase gate(6体合議)後・本文是正反映済(v2)**。本SPECは設計のみ。コードは一切変更していない(各設計エージェントは read-only で main.py / frontend を読んだだけ)。実装は **decision⑧ の順序**(retest A先行公開を完遂 → その screener infra 再利用 → 本SPECを起票 → **6体合議(decision⑨)PASS 後**)に従って初めて着手する。CPA の暫定表示は SPEC 完成まで何も出さない(decision⑪)。
> **codename**: pattern_type = `breakout`(cup_handle / resistance_retest とは別 namespace)、state ∈ `{bo_confirmed, bo_pending, bo_soft, bo_extended}`(§11.1 B1 で旧 `breakout_*` から改名・cup_handle state との同名衝突を物理回避)
> **北極星**: 原則4「人力の代替」— 「短期 base(直近 4〜8 週)の高値(pivotH)を出来高を伴って終値で抜けた」銘柄を毎晩 scan→朝メールで肩代わりする。手作業の「新高値ブレイク銘柄の見回り」を BeatScanner が代替する。
> **本SPECの diff**: 検出は新規独立関数 `_detect_breakout`(数値物理層・LLM 不使用)、保存は nightly scan に `pattern_type='breakout'` の別 namespace を additive 増設、screener は retest A先行の `/api/scanner` infra を再利用。既存 `_detect_cup_handle` / `_detect_resistance_retest` / cup_handle 閾値は一切触らない(回帰ゼロ)。
> **出来高ビジュアルだけは tier=無料・別レイヤー**: 株価チャートの出来高バー + 相対出来高 chip(最小2点)は基本チャート要素として全ユーザーに出す。breakout の **分類ラベル**(bo_confirmed/bo_pending/bo_soft/bo_extended)と **screener** は Premium。viz(事実)と分類(解釈)を物理分離する(§5)。⚠️ ただし decision⑫(pending × tier)は user 決裁待ち — pending を無料 viz 側の中立注記として出すか否かで本切り分けが変わる(§12.4)。

---

## TL;DR(5行)

1. **検出は `_detect_cup_handle` の内部分岐でなく独立関数 `_detect_breakout()`** — cup の幾何条件(U字・prior uptrend・rim 対称)を**課さず**、「直近 N 日 intraday 高値(pivotH)を終値が抜けたか + 出来高確認」だけを見る短期 base breakout の広い網。retest と同型の additive・`out` パターン dict 返却・LLM SDK import 禁止。
2. **pivotH = 直近 N 日 intraday 高値(当日除く)、N=20(4週)/40(8週)の2 tier** — ③実データで pivotH は pivotC(終値高値)の約半分の検出数 = 厳格。N=60 は冗長、N=252(52週)は厳しすぎ却下 → 52週高値は別 strong tier badge。
3. **confirmed = 出来高 ≥ 1.5x(50日平均) / soft = 1.3–1.49x / 2.0x は却下** — ③で 2.0x は全 N 全銘柄 0件の死tier。confirmed は S&P500 日次 **3-5件** に収束(朝push の S/N に適正)。
4. **pending(日中ブレイク→引け失速)は必ず §38-safe 非買いラベル** — ③で N20 の pending は **91件**(confirmed の ~18倍)。日中 pop を緑表示すると引け後に剥がれ Trust Cliff 直撃。pending は nightly では **DB 保存しない**(stale 化回避)、`/api/technical` 個別銘柄のリアルタイムでのみ中立ラベル表示。
5. **§38**: **緑は confirmed のみ**(過去確定事実、終値 + 出来高 ≥1.5x)。**soft=muted**(出来高 1.3–1.49x = 確認不十分・信頼度低、緑は誤認 → §9 #9 是正で soft の緑可を撤回)。pending=muted(終値未確認)・extended=amber(過熱警告)。緑・シアンを将来材料に出さない。narration 静的辞書(`buyZoneLabels.js`)、blocklist を frontend ⇄ backend 1:1 mirror(**FE=BAD-10 / BE=BAD-11**、実コード grep で最終明示 ID が割れるため別 ID。1:1 mirror は regex pattern で担保。旧「BAD-12」記述は §9 #7 で破棄)。plan gating は `getPlan(subscription)` 経由。

---

## 0. 背景・CPA 実証 + 確定事項(decision①-⑪)

### 0.1 なぜ独立関数か(cup_handle / retest と並走)

cup-with-handle は「形状あり」の精緻 detector(U字・prior uptrend・rim 対称を要求)。resistance_retest は「旧抵抗をサポート転換した帯まで押し戻った」の detector。本 `_detect_breakout` は両者と直交する第3の網で、**形状不問・「直近高値を出来高を伴って抜けた事実」だけ**を見る。3 つは別 `pattern_type` namespace(`cup_handle` / `resistance_retest` / `breakout`)で共存し、互いの DB 行を上書きしない。`/api/technical` でも別フィールドに格納し state の取り合いを物理回避する。

cup_handle の `_detect_cup_handle` は最初に該当した 1 state を `return` で即返す逐次関数(retest SPEC §0 で確定済の制約)。breakout を内部分岐に入れると formation で先に return される銘柄を構造的に拾えない。よって retest と同じく **独立関数 + 並列呼び出し** が唯一の正解。

### 0.2 日中 vs 終値の Trust Cliff 教訓(最重要)

③実データで N=20 の生検出 53件に対し **pending(日中のみブレイク)は 91件**。日中ザラ場で pivotH を一瞬抜けても引けで割り込む銘柄が confirmed の ~18倍存在する。これを「ブレイク」として緑で表示すると、引け後・翌日に表示が剥がれて **Trust Cliff 直撃**(CLAUDE.md 最重要バグカテゴリ「日中ブレイク表示は引け失速で Trust Cliff」)。

教訓の物理的帰結:
- pivotH の算出 window は **当日バーを除外**(`highs[-(N+1):-1]`)。当日 high を含めると自明に never-break になり pending/confirmed が原理的に出ない。
- **confirmed 判定は終値ベースのみ**(`close[-1] > pivotH`)。ザラ場高値で抜けただけは confirmed にしない。
- **pending は §38-safe 非買いラベル固定**(decision①)、緑禁止・muted。nightly では DB 保存しない(引け後には消えている stale signal を screener に溜めない)。

### 0.3 CPA(じっちゃま銘柄)実証 — pending 分類の裏取り

③で実測した CPA(本番 `/api/price-history` 実 OHLC、2026-06-15):

| 項目 | 実測値 |
|---|---|
| pivotH(N=20, 5/27 高値) | **145.57** |
| 当日 high | **151.95**(> pivotH ✓) |
| 当日 close | **144.40**(≤ pivotH ✓) |
| vmult | 1.47 |
| 52週高値 | 156.41(close 144.40 が未達) |

→ CPA は当日ザラ場で pivotH(145.57)を 151.95 まで上抜けたが、**引けで 144.40 まで失速 → `bo_pending` に該当**(decision③「今回の CPA が pending でヒットする条件」を満たす)。全 N で pending = ③で「日中ブレイク失敗の典型」と結論された通り。52週高値(156.41)は close 未達で **strong tier badge は非該当**。
→ この 1 件が本 SPEC の §38 設計(pending を非買いで正直に出す)の正当性そのもの。CPA を confirmed で緑表示していたら引け後に剥がれていた。

### 0.4 確定事項(user LOCKED decision、2026-06-16、上書き不可)

本 SPEC は以下 decision を**前提**として設計している。Phase gate でこれらを覆す提案は scope 外(数値の最終確認は可)。

| # | 確定内容 |
|---|---|
| ① | **pending を UI に出す**(§38-safe 非買いラベルで)。 |
| ② | **pivot = 直近 N 日 intraday 高値(pivotH)** で確定(pivotC は不採用)。 |
| ③ | **N=20(4週)と 40(8週)の2 tier**。今回の CPA が pending でヒットする条件。**新52週高値は別の strong tier badge**。 |
| ④ | **confirmed = 出来高 ≥ 1.5x(50日平均)**。**1.3x = soft tier**。**2.0x = 却下**(③で全滅)。 |
| ⑤ | **出来高 viz = 最小2点**(株価チャートに出来高バー + 相対出来高 chip)。**screener 出来高カラムは今回スコープ外**(後回し)。 |
| ⑥ | **nightly 保存 + screener 化 = やる**(`pattern_type='breakout'` 別 namespace、retest 同様)。 |
| ⑦ | **tier**: 出来高ビジュアル = **無料**(全ユーザー、基本チャート要素)。breakout シグナル分類(confirmed/pending/extended ラベル)+ breakout screener = **Premium**(cup_handle/retest と一貫、非Premium は breakout payload を物理除去 = retest A先行と同型 masking)。 |
| ⑧ | **順序**: retest A先行公開を先に完遂 → その screener infra(`/api/scanner`, ScreenerPane chip refMap, 最小 masking)を breakout が再利用 → breakout 実装は **6体合議後**。breakout は retest A の後ろに差し込む。**✅解消済(commit 36d9ac8、2026-06-16 deploy)**: Task#4 retest A先行公開を本日 deploy。`/api/scanner/retest` 新設 + ScreenerPane「リテスト接近」chip/section + StateCompass label + Premium gate 一本化。本 decision の「retest infra 再利用」の前提が真になった(§12.1-ゲート3 の hard gate を満たす)。 |
| ⑨ | **SPEC 起票後に 6体合議(Phase gate)にかける = yes**。 |
| ⑩ | **nightly 502**(別 workstream): まず continue-on-error の silent fail を是正(scan 後 freshness assert で落とす)。再発時は universe 分割(chunk 化)を第一手、ダメなら scan 非同期化。⑥で breakout も同じ nightly に相乗りするので 502 安定は retest A / breakout screener 両方の前提。 |
| ⑪ | **CPA の暫定表示は SPEC 完成まで待つ**(今は何も出さない)。 |

---

## 1. 検出ロジック — `_detect_breakout`(数式)

retest `_detect_resistance_retest` の guard 順序慣習を踏襲。非検出は `None` でなく初期 `out` dict を返し、guard を `if ...: return out` で順次適用。価格 `round(_, 2)` / パーセント `round(_, 1)`。narration 文字列禁止(`label` の静的日本語のみ可)。aggregator/ 外の main.py モジュールレベル helper として置く(LLM SDK import 禁止 = pre-commit Check 3)。

### 1.1 入力プリミティブ(全て `/api/technical` / `_scan_one` で展開済)

| プリミティブ | 出所 | 役割 |
|---|---|---|
| `highs / lows / closes / volumes / times` | `/api/technical` の OHLCV 展開 / `_scan_one` の `_fetch_ohlcv_3y` | pivotH・vmult・52週高値の生計算 |
| `spy_uptrend` | `_spy_uptrend()`(main.py L12798) | 地合い gate(SPY 200DMA、retest M1 と同型) |
| `avg_volume_50` | `volumes[-51:-1]` の平均(当日除く) | confirmed/soft 判定の分母 |

新たな fetch は追加しない。cup_handle と同一 OHLCV を使い回す(502 リスクの母数を増やさない、§4)。

### 1.2 pivotH(直近 N 日 intraday 高値)— decision②③

```python
N20, N40 = 20, 40

def _pivot_high(highs, N):
    # 直近 N 営業日 (当日除く) の intraday 高値。当日を含めると never-break になる (§0.2)
    window = highs[-(N + 1):-1]          # 末尾=当日を除いた直前 N 本
    if len(window) < N:                  # データ不足 (上場間もない等) は None
        return None
    return round(max(w for w in window if w > 0), 2)

pivotH20 = _pivot_high(highs, N20)   # 4週 base
pivotH40 = _pivot_high(highs, N40)   # 8週 base
```

**根拠(③):** N=20(生検出 53件 → 1.5x:5件)と N=40(25件 → 1.5x:3件)が「短期 base breakout の妥当窓」。N=60(25件 / 1.5x:3件)は N=40 と検出数ほぼ同一で情報冗長 → 二段から除外。N=252(52週、16件 / 1.5x:2件)は CPA(52週高値 156.41 に close 144.40 が未達)非該当で厳しすぎ → 別 strong tier badge に分離(§1.6)。

**pivotH > pivotC の厳格性(③):** pivotH(intraday)は pivotC(終値高値、緩め)の約半分の検出数(N20: 53 vs 98、N40: 25 vs 50、N252: 16 vs 24)。decision② が intraday を選んだのは、終値高値だと「ザラ場では一度も抜けていない銘柄」まで confirmed になり「新高値を**つけた**」事実と乖離するため。pivotH 採用で過検出を物理半減。

### 1.3 confirmed / soft の判定式 — decision④

```python
avg_volume_50 = sum(volumes[-51:-1]) / 50 if n >= 51 else sum(volumes) / max(1, n)
today_close, today_high, today_volume = closes[-1], highs[-1], volumes[-1]
vol_ratio = today_volume / avg_volume_50 if avg_volume_50 > 0 else 0.0

CONFIRM_VOL = 1.5   # decision④ confirmed
SOFT_VOL    = 1.3   # decision④ soft tier
# 2.0x は却下 (③で全 N 全銘柄 0件 = 死tier)

def _classify(pivotH):
    if pivotH is None:            return None
    if today_close <= pivotH:     return None   # 終値で抜けていない → pending か非該当 (§1.5)
    if vol_ratio >= CONFIRM_VOL:  return ("bo_confirmed", round(vol_ratio, 2))
    if vol_ratio >= SOFT_VOL:     return ("bo_soft",      round(vol_ratio, 2))
    return None   # vol<1.3x の close>pivotH は breakout 非該当(detected せず)。
    # 新高値の事実は §1.6 の 52週 badge が別経路で担う。decision④(1.3x=soft 下限)準拠。
    # 出来高を伴わない上抜けは false breakout リスクのため signal 化しない。
```

tier は **最も短い窓で抜けた tier を採用**(N20 優先 → N40)。state は `bo_*` namespace(§11.1 B1 で cup_handle の `breakout_*` と同名衝突を回避)。

| state | 終値 vs pivotH | vol_ratio | ③根拠 |
|---|---|---|---|
| `bo_confirmed` | close > pivotH | ≥ 1.5x | N20: 5件 / N40: 3件(S&P500 日次)。実用帯の上限。**緑可は confirmed のみ** |
| `bo_soft` | close > pivotH | 1.3–1.49x | N20: 13→5 の差分 ≈ 8件 / N40: 6→3 の差分 ≈ 3件。「抜けたが出来高やや不足」。**緑禁止・muted**(§2.4) |

**1.5x を confirmed にする根拠(③):** O'Neil 原典は breakout 日出来高 +40-50%。1.5x(=+50%)で confirmed が S&P500 日次 **3-5件** に収束 = 毎晩 push する銘柄数として適正(原則4 の S/N)。cup_handle 既存 `breakout_volume_multiplier=1.40` より僅かに厳格だが、**独立定数 `CONFIRM_VOL=1.5 / SOFT_VOL=1.3` を別定義**し cup_handle 閾値は流用・参照しない(回帰回避)。

**soft の扱い(§9 #9 是正):** confirmed と同じ payload に `tier="soft"` を持たせ、UI では confirmed と視覚的に区別する。**ただし soft は muted(緑禁止)で、chip ラベルに「出来高やや不足 ×{vol_ratio:.2f}」の数値を併記して差別化する**(「緑の濃淡」は誤りで撤回 — soft の緑可は confirmed を希釈し Trust Cliff。§2.4・§4.1 と整合させる)。soft を confirmed と同列に緑強調すると③の「N20 13件中8件が出来高やや不足」が confirmed を希釈する。**2.0x 却下(③):** 全 N・全銘柄で 0件、シグナルが出ない死tier。

### 1.4 extended(過熱)の乖離判定 — 独立フラグ設計(§9 #2 是正)

#### ⚠️ Trust Cliff 防止: `_compute_extended_gate` の `.passed` を逆用しない

`_compute_extended_gate`(main.py L16225)の `gate2` は `base_rise <= 25.0` で `passed=True` を返す。これは「base_rise が 25% 以下 = 初動・乗れる(extended でない)」を意味する screener **露出ゲート**(cup_handle 専用)。`is_extended = extended_gate.passed` と書くと `passed=True` が「extended フラグ ON」に反転し、初動銘柄(乗れる)が過熱扱いになる = **Trust Cliff 直撃**(緑 confirmed が amber extended に化ける逆転)。`_compute_extended_gate` を `_detect_breakout` 内で直接呼ぶことも不可(async + 時価総額 fetch が必要、かつ cup_handle 専用で意味が異なる)。

#### 是正: `is_extended` は独立フラグとして算出する

`_extended_numeric_fields`(main.py L13020)は `base_rise_pct` / `sma50_deviation_pct` の**純数値を返すだけ**で判定を持たない。判定は呼び出し側で独立に書く。

```python
ext = _extended_numeric_fields(closes, today_close, pivotH_used, spy_uptrend)
base_rise_pct = ext.get("base_rise_pct")       # (today_close - pivotH_used)/pivotH_used * 100
sma50_dev_pct = ext.get("sma50_deviation_pct") # (today_close - SMA50)/SMA50 * 100

# ─────────────────────────────────────────────────────────────────────────
# ⚠️ extended フラグは _compute_extended_gate の .passed を流用しない (真逆になる)。
#    独立フラグで判定する。
# ─────────────────────────────────────────────────────────────────────────

# 時価総額は _detect_breakout の同期スコープでは取得不可 → sma50 閾値は固定値で対応。
# ⚠️ §12.2 B2: breakout 固有値に再キャリブレーション要 user 確認 (下記 design fork)
SMA50_THRESH_CONSERVATIVE = 30.0  # ⚠️user確認: 保守的に大型閾値 30% 固定 vs 中小 50% 固定
EXTENDED_BASE_RISE_THRESH = 10.0  # ⚠️user確認: 暫定 B案 (O'Neil 原典寄り)。6体合議で final lock (design fork)

is_extended: bool = (
    (isinstance(base_rise_pct, (int, float)) and base_rise_pct > EXTENDED_BASE_RISE_THRESH)
    or (isinstance(sma50_dev_pct, (int, float)) and sma50_dev_pct > SMA50_THRESH_CONSERVATIVE)
)
# None-preserve (M4): base_rise_pct / sma50_dev_pct が None なら isinstance ガードで False 扱い
#   → 数値欠落時は extended に落とさない (graceful degrade)。None>THRESH の TypeError も回避。
```

**閾値の読み方(cup_handle との対称関係):**

| フィールド | cup_handle `_compute_extended_gate` | `_detect_breakout` 独立フラグ |
|---|---|---|
| `base_rise_pct` | `<= 25.0` → `gate2=True`(乗れる) | `> THRESH`(暫定 10.0)→ `is_extended=True`(過熱) |
| `sma50_deviation_pct` | `<= 30.0(大型)/50.0(中小)` → `gate1=True` | `> 30.0(保守値)` → `is_extended=True` |

2 条件は **OR**: どちらか一方でも超えれば extended。`is_extended=True` なら tier を `bo_extended` に上書き(state 優先: extended > confirmed > soft、§4.1 と整合)。

**extended の §38 扱い:** extended は「追いかけ過ぎの事実」であり「売り」「買うな」断定は禁止。`base_rise_pct` / `sma50_deviation_pct` の**乖離数値を必ず payload に含め UI 側で併記**(v148⑦: extended は §38/§5 で乖離数値併記必須)。色は緑禁止(過熱を緑=上昇で煽らない)、amber(`var(--color-warning)`)のみ(§2)。

---

#### ⚠️ design fork — extended 閾値の再キャリブレーション(user 確認事項・§12.2 B2)

現状の `EXTENDED_BASE_RISE_THRESH` は本版で暫定 **10.0(B案)** を採用したが、O'Neil 原典との関係は以下:

| 出典 | extended の定義 |
|---|---|
| O'Neil 原典 | pivot から **+5% 以内**が buyable zone、**+5〜+10%** で extended 警告 |
| 本プロジェクト v148⑦(cup_handle) | pivot からの chase を `base_rise > 25%` で判定(緩め設定) |

cup_handle の 25% は「ATH 近傍の extended state」向けの緩め値であり、breakout の「直近 N 日高値からの乖離」に流用すると「5〜10% 程度のチェイスを許容し高値掴みを clean breakout として default 表示」する懸念がある(§12.2 B2)。

⚠️ **user 確認が必要な選択肢(値は lock していない):**

| 選択肢 | 閾値 | メリット | デメリット |
|---|---|---|---|
| A: cup_handle 流用 | `> 25%` | プロジェクト内で値統一、回帰ゼロ | O'Neil 原典より相当緩め。base_rise 10–24% の過熱を見逃す |
| B: O'Neil 原典寄り(**暫定採用**) | `> 10%` | 「pivot +5% 以内が buyable」に忠実 | 既存 cup_handle 25% との乖離。検出数変化要③再計測 |
| C: 中間値 | `> 15%` | O'Neil「+15% 超で extended」に整合 | 新規閾値を SSOT に追加 |

**実装側の対応:** いずれを選んでも `EXTENDED_BASE_RISE_THRESH` 定数1行の変更で済む。SMA50 閾値も同様(時価総額を同期関数で取れず大型/中小の2段ができないため、保守 30% 固定 vs 中小 50% 固定の選択も user 確認)。**6体合議で数値を final lock**。それまで保守側 B(`> 10%`)を暫定値として記載。

### 1.5 pending(日中ブレイク失敗)の式 — decision①・CPA 実証

```python
def _is_pending(pivotH):
    # 当日ザラ場で pivotH を上抜けたが、引けで抜け切れなかった (= 日中ブレイク失敗)
    return (pivotH is not None
            and today_high  > pivotH      # ザラ場高値は pivot を超えた
            and today_close <= pivotH)    # しかし終値は pivot 以下 = 引け失速
```

**state 優先順位(排他):** 同一銘柄で confirmed と pending は両立しない(confirmed は `close > pivotH`、pending は `close <= pivotH`)。`_classify` を先に評価し非該当なら `_is_pending` を見る。

**Trust Cliff 防御:** ③で N20 の pending は 91件(confirmed の ~18倍)。pending は `detected: True` だが `tier="pending"` で「上抜けトライ中 / 引けで未確定」の事実のみ。色は緑禁止 → muted(§2)。`buyZoneLabels.js` 静的辞書で「買い場」「今が買い」表現を禁止(blocklist.js ↔ prompt_negatives.py 1:1 mirror、§2)。**nightly では DB 保存しない**(§4)。

### 1.6 新52週高値の strong tier badge — decision③⑥

decision③「新52週高値は別の strong tier badge」。confirmed/soft/pending とは**直交する独立フラグ**(同一 breakout に重畳可能)。

```python
HIGH_52W_LOOKBACK = 252
def _is_new_52w_high(highs, closes):
    if len(closes) < 60:
        ref = highs[:-1]                                  # 上場来でも最低60本は §1.7 で担保
    else:
        ref = highs[-(HIGH_52W_LOOKBACK + 1):-1]          # 当日除く直近252本の intraday 高値
    if not ref:  return False
    prior_252w_high = max(h for h in ref if h > 0)
    return closes[-1] >= prior_252w_high                  # 終値ベースで52週高値を更新
```

**終値ベース採用の根拠(③ + Trust Cliff):** ③で「新52週高値終値ブレイク: 16件」。52週高値 badge は最強tierなので**終値**で確定したもののみ(ザラ場の瞬間タッチは pending と同じく剥がれる)。③で N40 confirmed の RL/AMAT が「新52週高値」だったのと整合(RL/AMAT/SW の3件中2件が 52週高値 = 最強tier の実体)。CPA は 52週高値 156.41 未達 → `False`(③実証通り)。pending では終値が pivotH を抜けていない以上 52週終値高値も未更新 = `False`。

### 1.7 除外条件(guard 順序)— retest 慣習踏襲・stage filter G1b 追加(§9 #3 是正)

```python
out = {"detected": False, "state": "breakout", "tier": None}

# G0 データ不足: cup_handle/retest と同じ下限
if n < 60:                                   return out   # SMA・窓に不足
if not closes or closes[-1] <= 0:            return out
if pivotH20 is None and pivotH40 is None:    return out   # 両 tier とも窓不足

# G1 地合い gate (落ちるナイフ回避、retest M1 と同型):
#   SPY 200DMA 割れ = market_context "weak" なら breakout を出さない
market_context = "weak" if spy_uptrend is False else ("strong" if spy_uptrend else "unknown")
if market_context == "weak":                 return out   # spy_uptrend is False のみ。None(取得失敗)は通す

# G1b 軽量 stage filter (bear-market rally / faulty base を追加 fetch ゼロで除外):
#   _compute_sma は main.py:L12715 の既存ヘルパ (追加 fetch ゼロ)。
#   pivotH > SMA50 かつ 50DMA 上向き(直近 5 日 slope) を必須にし、
#   下落途中の戻り高値抜け(faulty base)を緑 confirmed で量産しない。
#   ⚠️ user確認: SMA200 単独条件(close > SMA200)への変更も検討余地あり(下記 design fork)
sma50_list = _compute_sma(closes, 50)        # L12715: _compute_sma(closes, period)
sma50_now  = sma50_list[-1] if sma50_list else None
sma50_5ago = sma50_list[-6] if len(sma50_list) >= 6 else None

_stage_ok = (
    isinstance(sma50_now, (int, float))
    and isinstance(sma50_5ago, (int, float))
    and (pivotH20 or pivotH40 or 0) > sma50_now  # pivotH(採用 tier)が SMA50 を上回る
    and sma50_now > sma50_5ago                   # 50DMA が直近 5 日で上向き
)
if not _stage_ok:                            return out   # faulty base / 下落途中の戻り高値抜けを除外

# G2 出来高ソース欠落 gate:
if avg_volume_50 <= 0 or today_volume <= 0:  return out   # 出来高確認不能 → confirmed を名乗れない
```

**market_context weak 除外の根拠(③ + retest 整合):** ③の N20 pending 上位が TFC(vmult 2.78)/NDSN/PNC/FITB/NUE/STLD… と**金融・景気敏感に偏在**(6/15 日中 pop→引け失速)。地合い悪化局面でこれらが大量に「ブレイク」表示されると false signal の洪水。retest と同じく `market_context == "weak"`(SPY 200DMA 割れ)で物理 drop。`spy_uptrend is None`(SPY fetch 失敗)は `weak` 扱いせず通す(graceful degrade、`market_uptrend: None` を payload に残し沈黙の欠落を表面化)。

**G1b stage filter の根拠と実コード接続(§9 #3 / §12.2 B3):**
- `_compute_sma`(main.py L12715)は `_extended_numeric_fields`(L13036)が 50DMA 乖離算出に既に使用している同一ヘルパ。追加 fetch ゼロで SMA50 を計算可能(§4.5「502 リスクの母数を増やさない」を維持)。
- `pivotH > sma50_now`: 直近 N 日高値そのものが SMA50 を上回っていない銘柄は「下落途中のベース形成」— 終値がその pivotH を抜いても bear-market rally の可能性が高い(O'Neil ステージ分析 Stage 2 判定の最小条件)。
- `sma50_now > sma50_5ago`(5 日 slope): 50DMA が下向きのまま終値が pivotH を抜けるケースが faulty base の典型。5 本は micro-fluctuation を避ける最短ウィンドウ。
- **③ 検出数への影響(⚠️ user確認):** このフィルタにより N20 confirmed(5件)・soft(8件)がどの程度減少するか③相当の再計測が必要。激減(例: confirmed 1件以下)する場合は訴求を「新高値ブレイク」→「短期高値更新(地合い未確認)」に降格し、§0/TL;DR・§5 screener 訴求・LP 文言も改訂する(下記 design fork)。

**出来高不足:** decision④で「出来高確認」が confirmed の必須要素。`avg_volume_50<=0` or `today_volume<=0`(price-history で volume 欠落)なら confirmed/soft を名乗れず除外。終値が pivotH を抜けていても出来高が取れなければ「ブレイク確認不能」= 非検出(Trust Cliff: 出来高確認を訴求しながら確認できていない状態を confirmed にしない)。

**uptrend 完全除外(旧本文)を撤回する理由(§9 #3):** 旧本文「G1(地合い weak)+ §1.6 の 52週高値 strong tier が担う」という論拠は不十分だった。G1(SPY 200DMA)は市場全体の weak を弾くが、個別銘柄が Stage 1〜4 のどの段階かを判別しない。SPY が 200DMA 上でも個別銘柄が下落トレンド中に一時的に直近高値を上抜けることは十分起こり得る(bear-market rally の定義そのもの)。52週高値 strong tier badge は「更新している銘柄」への追加 badge であり Stage 2 未満を confirmed から除外する gate ではない。軽量 stage filter(G1b)を G2 の前に挿入することで、追加 fetch ゼロのまま「落ちるナイフを掴むな」とじっちゃまプロトコルに整合した除外が実現できる。

#### ⚠️ design fork — stage filter の実装形式 + 訴求降格(user 決裁)

| 論点 | 推奨 | 代替 | 決裁条件 |
|---|---|---|---|
| ① stage filter 形式 | `pivotH > SMA50 かつ 50DMA 上向き(5日 slope)` の AND 2条件 | `close > SMA200` 単独(より緩い) | ③相当のデータ再計測後に user 決裁 |
| ② 検出数激減時の訴求降格 | G1b 適用後 N20 confirmed が 1件以下なら §0 TL;DR・§5・LP を『新高値ブレイク』→『短期高値更新(地合い未確認)』に降格 | 降格しない | マーケ訴求に関わるため user 決裁 |

#### 1.7.5 変数 assembly — §1.8 返却 dict の組み立て

guard 通過後、返却 dict に使う変数を以下の順で確定する(実装者への補完省略防止ノート):

- **採用 tier 選択(decision③)**: N20 ピボット(`pivotH20`)で `_classify` 結果あり → `used_window=20, pivotH_used=pivotH20`。なければ N40(`pivotH40`)を採用 → `used_window=40, pivotH_used=pivotH40`。両方 None なら `detected=False` 終了。
- **state / tier**: `_classify(pivotH_used)` の返り値タプル `(state, vol_ratio)` から取得。`tier` は state の `bo_` 以降の文字列(`bo_confirmed` → `"confirmed"` など)。
- **polarity**: `confirmed`(vol≥1.5x)のみ `"up"`。`soft / pending / extended` は `"neutral"`(§9 #9 準拠)。
- **is_new_52w_high**: §1.6 の判定結果(変数名 `is_new_52w_high`、`bool`)をそのまま使用。
- **is_extended**: §1.4 `_compute_extended_gate` の `.passed`(変数名 `is_extended`、`bool`)をそのまま使用。
- **pivotH_used / used_window**: 上記採用 tier 選択で確定した値をそのまま渡す。

### 1.8 成功時の返却 dict(全キー)— retest 慣習踏襲

```python
return {
    "detected": True,
    "state": state,                          # bo_confirmed | bo_soft | bo_pending | bo_extended (§11.1 B1)
    "tier": tier,                            # "confirmed" | "soft" | "pending" | "extended"
    "polarity": polarity,                    # "up"(confirmed のみ, vol≥1.5x) | "neutral"(soft/pending/extended)
    #   soft(1.3–1.49x) は終値で pivotH を抜けた確定事実だが出来高確認が不十分 →
    #   "確認済み" と誤認させる緑を出さない。muted + 数値「出来高やや不足 ×{vol_ratio:.2f}」で補う。
    #   polarity="up" は confirmed(vol≥1.5x)のみ。緑は §4.1 / §2.4 表と一致させる(§9 #9 是正)。
    "window": used_window,                   # 20 | 40 (採用した base 窓、短い方優先)
    "pivot_high": pivotH_used,               # 採用 tier の pivotH (round 2)
    "close": round(today_close, 2),
    "volume_ratio": round(vol_ratio, 2),     # today_volume / avg_volume_50
    "volume_threshold": CONFIRM_VOL,         # 1.5 (confirmed 基準、UI 説明用)
    "is_new_52w_high": is_new_52w_high,       # strong tier badge (§1.6)
    "is_extended": is_extended,              # §1.4 過熱フラグ
    "base_rise_pct": ext["base_rise_pct"],   # pivotH からの上昇率 (extended 数値併記)
    "sma50_deviation_pct": ext["sma50_deviation_pct"],
    "market_uptrend": spy_uptrend,           # True/False/None (沈黙の欠落表面化)
    "levels": [                              # frontend PriceLadder 接続
        {"kind": "pivot_high", "price": pivotH_used,     "label": "直近高値(ブレイク水準)"},
        {"kind": "high_52w",   "price": prior_252w_high, "label": "52週高値"},  # is_new_52w_high 時のみ
    ],
}
```

`label` は静的日本語(事実語)のみ。「買い場」「今が好機」は禁止(blocklist mirror、§2)。

---

## 2. §38 層 — 確定文言・色・blocklist(buy signal 境界)

緑(`--color-gain`)は **過去/現在の確定 polarity のみ**。**confirmed = 終値 + 出来高 ≥1.5x で実際に pivotH を抜けた確定事実 → `polarity="up"`(緑可)**。**soft(1.3–1.49x)/pending/extended は `neutral`(緑禁止・§9 #9 是正で soft の緑可を撤回)**。hex 直書き禁止(`design_system.md` token)。

### 2.1 中立ラベル文言(確定)— `classifyBreakoutZone` 新設 + `BUY_ZONE_LABEL_JP` / `COMPASS_PRICE_LABEL` 追加(§9 #8 是正)

> **前提(§11.1 B1)**: breakout の state は `bo_confirmed / bo_pending / bo_soft / bo_extended` に改名する。`classifyBuyZone(state)`(buyZoneLabels.js:108)は state 文字列で分岐し `breakout_confirmed → 'breakout_support'`・`breakout_extended → 'breakout_extended'` に変換してから辞書キーとして参照する **cup_handle 専用** の関数。`bo_*` 改名後にこの関数へ分岐を追加しないと `classifyBuyZone('bo_confirmed')` は `'unknown'` にフォールスルーし、辞書に `bo_*` キーがあっても到達しない(v219 同型 priceCell `'—'` バグ)。「`breakout_extended` は既存キー `'ATH付近 pivot 目安'` を流用」も bo_extended 改名後は到達不能のため**撤回**。

#### 2.1-A `classifyBreakoutZone()` を新設(buyZoneLabels.js に追加)

```js
/**
 * breakout namespace (pattern_type='breakout') 専用の zone 分類関数。
 * 既存 classifyBuyZone(cup_handle.state) とは独立して呼ぶ。
 * StateCompass の priceCell は patterns.breakout?.state(bo_*)を渡す。
 */
export function classifyBreakoutZone(state) {
  if (state === 'bo_confirmed') return 'bo_confirmed';
  if (state === 'bo_soft')      return 'bo_soft';
  if (state === 'bo_pending')   return 'bo_pending';
  if (state === 'bo_extended')  return 'bo_extended';
  return 'unknown';
}
```

#### 2.1-B `BUY_ZONE_LABEL_JP` に breakout 専用エントリを新設(既存 cup キーは不変)

```js
// buyZoneLabels.js — BUY_ZONE_LABEL_JP 追加分 (bo_* namespace 専用)
// 既存 breakout_extended / breakout_support / breakout_pending キーは cup_handle 文脈のまま不変。
bo_confirmed: 'ブレイクアウト確認済み',   // 終値+出来高で確定した上抜け事実
bo_soft:      '出来高やや不足(×{VOL_RATIO})', // 終値抜けたが vmult 1.3–1.49x ⚠️user確認: {VOL_RATIO} 実数値 inject か固定文字列か (design fork)
bo_pending:   '上抜け確定待ち',            // 日中上抜け・引け失速 (終値未確認)
bo_extended:  '高値圏突破(過熱)',          // base_rise 過熱局面
```

#### 2.1-C `COMPASS_PRICE_LABEL` に breakout 専用エントリを新設(stateCompassText.js)

```js
// COMPASS_PRICE_LABEL 追加分 (bo_* namespace 専用、StateCompass 短語 SSOT)
// 欠落で priceCell が '—' に落ちる v219 同型バグ防止 → classifyBreakoutZone と同時追加。
// 既存キー (breakout_support: 'ブレイク後' / breakout_extended: '高値圏') は cup 文脈のまま不変。
bo_confirmed: '新高値ブレイク',        // ⚠️user確認: cup「ブレイク後」と語彙差別化 (§12.2 #10)。別案「確認済みブレイク」「ベース突破確認」
bo_soft:      '出来高やや不足',         // COMPASS は短語のため数値 inject せず固定 (BUY_ZONE_LABEL_JP と方針分離)
bo_pending:   '上抜け確定待ち',
bo_extended:  '高値圏(過熱)',
```

禁止(採らない): `'上昇中'` `'買い目安'` `'強い上抜け'`(将来方向・行動指示・程度の最上級)。

> ⚠️user確認(design fork): `bo_soft` chip の `×{VOL_RATIO}` を動的 inject(情報量↑・実装コスト++)するか固定文字列「出来高やや不足」のみ(シンプル)か。推奨方向 = `BUY_ZONE_LABEL_JP` は数値込み「出来高やや不足 ×{VOL_RATIO}」/ `COMPASS_PRICE_LABEL` は固定「出来高やや不足」(COMPASS は短語 SSOT)。

### 2.2 2 field narration(確定文面)— `BUY_ZONE_DESC_JP` 追加(§9 #8 是正)

> **前提(撤回)**: 「`breakout_extended` は既存 `BUY_ZONE_DESC_JP.breakout_extended` を流用」は撤回。既存 cup 用エントリは `classifyBuyZone(cup_handle.state)` 経由で参照される cup_handle 文脈であり、`bo_extended` は `classifyBreakoutZone()` 経由の別 zone type のため**別エントリが必要**(既存 cup 用は不変・併存)。

`resistance_retest` / `pullback_to_support` の3文構造(一般ルール引用 → pattern failure 両面 → 免責)を踏襲。`{VMULT}` `{PIVOT}` `{BASE_RISE_PCT}` 等は backend 物理層が計算 → frontend は文字列置換のみ(aggregator に LLM import 禁止を維持)。

```js
// buyZoneLabels.js — BUY_ZONE_DESC_JP 追加分 (bo_* namespace 専用)

bo_confirmed: {
  conclusion: '直近 pivot を出来高を伴って上抜けた局面です。',
  detail: '一般的なルールでは、base 完成水準 (pivot) を出来高 50%+ の増加を伴って終値で上抜けた状態が' +
          'ブレイクアウト確認の目安として知られています。ただし上抜け後に pivot 下へ戻した場合は' +
          'pattern failure のサインともされ、維持されても将来の上昇を保証するものではありません。' +
          '投資判断はご自身でご確認ください。',
},

bo_soft: {
  conclusion: '直近 pivot を終値で上抜けましたが、出来高の増加は基準をやや下回る局面です。',
  detail: '一般的なルールでは出来高 50%+ 増加を伴う上抜けが確認の条件とされています。' +
          '当該局面の出来高増加は基準に届いておらず、確認が不十分な状態です。' +
          '上抜け後に pivot 下へ戻した場合は pattern failure のサインともされ、' +
          '将来の上昇を保証するものではありません。投資判断はご自身でご確認ください。',
},

bo_pending: {
  // Trust Cliff 殺しの核: 「日中上抜け」と「終値未確認」を同一文で明示し、点灯解除を最初から織り込む
  conclusion: '日中に pivot を上抜けていますが、終値での確定はまだの局面です。',
  detail: '一般的なルールでは、終値が pivot を上抜け、かつ出来高の増加を伴うことがブレイクアウト確認の' +
          '条件とされています。日中の一時的な上抜けは終値で割り込むと確認に至らない場合があり、' +
          '現時点は到達途上の段階です。投資判断はご自身でご確認ください。',
  intraday_note: '※ 日中値での到達であり、引け値での確定を待つ段階です。',
},

bo_extended: {
  // §38: 過熱の事実のみ。「売り」「買うな」断定禁止。乖離数値は backend payload から inject。
  conclusion: '直近 pivot から大きく上昇し、過熱局面とされる水準にある局面です。',
  detail: '一般的なルールでは pivot から大きく上昇 (乖離率 {BASE_RISE_PCT}%) した局面は' +
          '新規 entry より段階利確・押し目待ちが検討される事例が紹介されています。' +
          '将来の値動きを保証するものではなく、投資判断はご自身でご確認ください。',
},
```

> **§2.2 narration 設計規律(resistance_retest / pullback_to_support の3文構造踏襲):** 一般ルール引用 → pattern failure 両面 → 免責 の3構造を全エントリで維持。`{BASE_RISE_PCT}` 等のプレースホルダーは backend payload の物理計算値を frontend 文字列置換で inject(aggregator に LLM import 禁止を維持)。`BUY_ZONE_FOOTER.disclaimer`(「※ テクニカル分析は将来の値動きを保証するものではありません」)は全 bo_* state で必ず render。

**pending narration の設計肝(decision①):** 「日中上抜け」と「終値未確認」を同一文で現在進行形に書き、点灯解除を「失速」でなく「未確定→確定 or 不成立」の正常な状態遷移として最初から提示する。これで引け後に表示が変わっても Trust Cliff にならない(「最初から未確定と言っていた」)。

### 2.3 `classifyBreakoutZone` 分岐の追加と StateCompass 配線(additive + 優先順位)(§9 #5/#8 是正)

breakout namespace 分離に伴い、`technical.patterns.breakout?.state`(`bo_*` 値)を受け取る専用関数 `classifyBreakoutZone()`(§2.1-A)を **新設**する。**既存 `classifyBuyZone` は一切変更しない**(cup_handle の `breakout_confirmed → breakout_support` 等の既存挙動は不変)。§2.1 の旧「同名 state 素通し」記述は **撤回**(B1 改名後は不正確)。

#### 2.3.1 `StateCompass.jsx` の `priceCell` 配線(実コード: L116–130)

**根拠**: `StateCompass.jsx:116` の `priceCell useMemo` は現在:
1. L118–120: `technical?.patterns?.resistance_retest?.detected` を最初に評価(v220 deploy 済)
2. L122–123: `technical?.patterns?.cup_handle?.state` を読み `classifyBuyZone(state)` を呼ぶ
3. `technical?.patterns?.breakout` は**一切読まれていない** → bo_* 改名 + 辞書追加のみでは永久に「判定なし」(§12.2 #5)

retest が L118–120 で `patterns.resistance_retest.detected` を**直接読む(classifyBuyZone 非経由)**パターンと同型で breakout 経路を追加する:

```jsx
// StateCompass.jsx priceCell useMemo 追記案 (L118 retest 分岐の直後に挿入)
const bo = technical?.patterns?.breakout;
if (bo?.detected) {
  const boZone = classifyBreakoutZone(bo.state);  // buyZoneLabels.js から import 追加
  const boLabel = COMPASS_PRICE_LABEL[boZone] || '—';
  // confirmed でも緑不可・warn(amber)固定・価格セルは §38 ルールで warn 一択
  return { signal: 'warn', Icon: Crosshair, value: boLabel, sub: '参考水準' };
}
// ... 既存 retest → cup_handle フォール
```

import 行に `classifyBreakoutZone` を追加(`buyZoneLabels.js` から named import)。

> **⚠️ 2層分離ルール(実装者必読)**: StateCompass の `priceCell` は §38(購入行為誘導回避)のため **全 bo_* state を `signal='warn'`（amber）に統一**する。これは chip / カード層の色とは別レイヤーであり、§2.4 の tone 表（chip / tooltip 用、`bo_confirmed` = gain 可）とは使い分ける。「StateCompass = warn 固定 / chip・tooltip = §2.4 tone 表に従う」という2層の分離が §38 安全側の正しい設計。既存の `resistance_retest` StateCompass 実装(v220 deploy 済、`signal='warn'`)とも整合する。

#### 2.3.2 cup / retest / breakout 同時検出時の優先順位(⚠️user確認・6体合議論点)

3つのシグナルが同日に同一銘柄で検出された場合のプライオリティ。推奨方向(6体合議 Phase gate で確定):

| 優先順 | signal | 理由 |
|---|---|---|
| 1 | `resistance_retest` | 現在の押し目局面(最もアクション性が高い接近状態)。v220 で既に最上位に実装済 |
| 2 | `breakout`(bo_confirmed / bo_soft) | 当日ブレイク = 最新の「今」の事実。cup 形成中より新しい局面 |
| 3 | `cup_handle` | 形状パターン(時間軸が長い・背景情報) |
| (非表示 or amber 文言のみ) | `bo_pending` / `bo_extended` | pending=終値未確定・extended=過熱 |

⚠️**user確認**: 上記はデフォルト案。「cup_handle confirmed(ベース完成直後)が breakout(当日のみ)より重要」という逆転の可能性を6体合議で検証してから確定すること(§8 に論点追加)。

#### 2.3.3 `TECHNICAL_CANONICAL_PATTERNS`(api.js:5)への `'breakout'` 追記(§12.2 #5 / B3)

`StateCompass` は `TECHNICAL_CANONICAL_PATTERNS` で `fetchTechnical` を呼ぶ(StateCompass.jsx:109)。`api.js` の定数が `'cup_handle,sma_50,sma_200,rs,dma_cross'` のままでは breakout payload が届かない。`'cup_handle,sma_50,sma_200,rs,dma_cross,breakout'` に追記する。cache_key は `f"{ticker}:{period}:{'+'.join(sorted(requested))}"` 自動構成のため全 priceCell cache が一斉 miss する点に注意(§12.3 MAJOR 参照)。

### 2.4 色 tone 割当(投資色ルール厳守)(§9 #9 是正 — bo_soft 行追加)

| 状態 | tone | token | 根拠 |
|---|---|---|---|
> **⚠️ 適用層の明確化**: この tone 表は **chip / tooltip / カード層**に適用する。**StateCompass の `priceCell` signal は §2.3.1 の通り全 bo_* で `warn` 固定**（信号機サマリーは事実の方向より §38 中立を優先）。実装者は「StateCompass = warn / chip・tooltip = 下表」と層を分けること。

| `bo_confirmed` | **緑** | `var(--color-gain)` | 過去の確定事実(終値 + 出来高 ≥1.5x で確定済)= polarity OK |
| `bo_soft` | **muted(中立)** | `var(--text-muted)` | 終値で pivotH を抜けたが出来高 1.3–1.49x = 確認が不十分。緑は「確認済み」の誤認を生む → Trust Cliff。muted + 数値「出来高やや不足 ×{vol_ratio}」を chip に併記して事実を伝える。**緑は confirmed(≥1.5x)のみ** |
| `bo_pending` | **muted(中立)** | `var(--text-muted)` | 終値未確認 = 確定 polarity 不在。緑にすると「点灯→消灯」で Trust Cliff。amber でなく muted が正(pending は警告でなく「未確定」) |
| `bo_extended` | **amber(警告)** | `var(--color-warning)` | 過延伸=過熱の注意喚起。緑禁止 |

補足規律:
- **シアン(`--color-accent`)は上昇の意味で使わない**。`buildTechnicalState` の `pl-status-dot` は accent 固定だが「ブランドの状態点」であり polarity 信号でないため現状維持(緑置換は §38 違反なので**しない**)。
- pending を amber でなく muted にするのが肝。amber は「危険」を含意し、pending(健全な未確定)を amber で出すと過剰警告で逆に Trust Cliff。muted = 「まだ判定材料が揃っていない」の正直な表現。
- **soft は pending と同じ `var(--text-muted)` だが意味が異なる**: pending=「未確定(引け後に消える可能性)」/ soft=「確定したが出来高やや不足(信頼度低)」。chip ラベルで両者を区別 — pending:「上抜け確定待ち」/ soft:「出来高やや不足 ×{vol_ratio:.2f}」(数値をそのまま見せて判断を委ねる)。
- `BUY_ZONE_FOOTER.disclaimer`(既存「※ テクニカル分析は将来の値動きを保証するものではありません」)を全 bo_* 状態で必ず render。

### 2.5 blocklist BAD-10/BE-BAD-11(frontend ⇄ backend 1:1 mirror)(§9 #7 是正)

**採番の正規化(実コード根拠):**
- `frontend/src/lib/blocklist.js`: コメント上の最終明示 ID は `// BAD-9:`(L60)。v218/v219 追加分は ID なしで landed。`grep -n "BAD-10\|BAD-11\|BAD-12"` で 0件確認。→ breakout の追加は **FE = BAD-10**。
- `backend/app/visualizer/prompt_negatives.py`: `"id": "BAD-10"`(L112)が最終明示。v219 追加分は ID なしで landed。→ breakout の追加は **BE = BAD-11**。
- 旧 §2.5 の「BAD-11 は retest 使用済」「BAD-12 を新採番」記述は**両ファイル grep で確認した事実と矛盾するため破棄**。1:1 mirror を維持するため FE/BE で別 ID になることを明記(mirror は regex pattern で担保、ID は装飾)。

カテゴリ「ブレイク後 将来条件付き買い断定」(金商法 §38 第2号)。既存 BAD-7(`(?:上抜け|ブレイク).{0,10}買い`)・v148(青天井/まだ上がる)の**未カバー領域**だけを tight に塞ぐ。

```js
// BLOCKLIST_PATTERNS 追加分 (frontend /.../g、backend は re.compile で 1:1 mirror)
// ─── FE=BAD-10 / BE=BAD-11: breakout 後 将来条件付き断定 (金商法 §38 第2号) ───────────────
// ① 「抜けたら/超えたら/上抜ければ + 肯定帰結」型の将来条件付き断定。
//    打消し帰結 (不成立/失敗/pattern failure/下落) は肯定帰結 alternation に含めず自動的に残す。
/(?:pivot|抵抗線?|レジスタンス|高値|ネックライン)[^。]{0,12}(?:抜け(?:たら|れば|た[らな]ら?)|超え(?:たら|れば)|突破[^。]{0,4}(?:たら|れば|なら))[^。]{0,12}(?:買い|上昇|反発|一段高|上値)/g

// ② 「ブレイク(した) + 将来帰結語」型。BAD-7 未カバーの「一段高/上値余地/さらなる上昇」を補完。
//    v124「追い風」単独 match 過剰削除の教訓に従い、ブレイク単独では match させず帰結語と複合のみ。
/(?:ブレイクアウト|上抜け)(?:した|済み)?[^。]{0,12}(?:一段高|さらなる上昇|上値余地|買い場|買い時)/g
```

**過剰削除回避の検証(v124/v218 教訓・Python 実測確認済):**
- 「pivot を上抜け(事実記述のみ・帰結語なし)」→ 帰結 alternation に当たらず**残る**(confirmed narration が自滅しない。`p2.search('pivot を上抜け終値で確認') → None` 確認済)。
- 「上抜け後に pivot 下へ戻すと pattern failure」→ 帰結が否定なので**残る**(§38-safe 両面記述を保護。実測 hit=False)。
- 「ブレイクアウト確認の目安」→ 帰結語が無いので**残る**。

```python
# prompt_negatives.py NEGATIVE_EXAMPLES 追加分 (backend BLOCKLIST_REGEX と同一 commit で同時追加)
{
  "id": "BAD-11",   # FE=BAD-10 / BE=BAD-11 (ファイル間の最終明示 ID が異なるため連番が割れる。1:1 mirror は regex pattern で維持)
  "category": "ブレイク後 将来条件付き断定",
  "bad_output": ('"bullCase": ["pivot を抜けたら一段高", '
                 '"レジスタンスを突破すれば買い", '
                 '"ブレイクアウトしたので上値余地が大きい"]'),
  "reason": "ブレイクアウト (過去/現在の事実) を起点に将来の株価上昇を条件付きで断定 (金商法 §38 第2号 断定的判断の提供)。"
            "「抜けたら買い」「突破すれば上昇」「上値余地」 等の肯定帰結は禁止。ブレイクの事実 (日時・出来高比・pivot との距離%) の記述は可。"
            "上抜け後の pattern failure・不成立への言及 (否定帰結) は §38-safe なので残す。",
  # ⚠️ good_alternative の書き方ルール:
  #   「上抜け」「ブレイクアウト」と「上値余地/一段高/買い場/買い時」の複合は P2 regex 自身にヒットする(自己矛盾)。
  #   旧文「強気シナリオでは上抜け水準の維持で上値余地」は P2 に hit=True(Python 実測)→ sanitize で自滅していた。
  #   模範文は「実績の事実記述」+「シナリオ帰結語を『判断指標/確認点/とされる』で受ける」形に限定する。
  "good_alternative": ('"bullCase": ["pivot を出来高 +52% を伴い終値で上抜け (直近確定事実)", '
                       '"強気シナリオでは pivot 維持の継続が判断指標とされる", '
                       '"上抜け後に pivot を割り込んだ場合は pattern failure のサインとされる"]'),
},
```

**[good_alternative 書き直しの根拠]** 旧 `good_alternative` の「強気シナリオでは上抜け水準の維持で上値余地」は P2 regex に `上抜け水準の維持で上値余地` でヒットすることを Python(`re.search`)で実測確認(hit=True)。`sanitizeDiagramData → sanitizeStringArray → sanitizeText` 経路で bullCase 配列のこのエントリが sentence 単位削除される自己矛盾が生じる。修正方針は「模範文の書き直し」を採用(P2 の negative lookahead 緩和は却下 — 「シナリオ」先頭・「上値余地」末尾の語順では lookahead が機能せず Python 実測でも逃がせないことを確認)。新模範文は (1) 過去事実の記述のみ・帰結語なし、(2) 帰結語を「判断指標とされる」= 行動断定でなく観察の言及、(3) 否定帰結の §38-safe 両面記述、の3文構成で P2 / BAD-7 両方のヒットなしを Python で実測確認(hit=False×全候補)。

---

## 3. 出来高 viz(最小2点・無料層)— decision⑤⑦

decision⑤「最小2点(株価チャートの出来高バー + 相対出来高 chip)」、decision⑦「viz=無料」。本 §3 は **plan gate を一切かけない基本チャート要素**。breakout の分類ラベル(confirmed/pending/extended)とは物理分離する(§5)。出来高バーの強調は「過去に出来高が多かった事実」の可視化だけで、「ブレイク確定」とは書かない。

### 3.1 出来高バー(StockPriceChart へ追加)

**データ配線(追加 fetch ゼロ):** `data.prices[*].volume` は `/api/price-history/{ticker}` が返却済み。`chartData` useMemo が `{ ...p }` で spread するため volume は各 entry に含まれる。ただし `volume` は `null` 混在(yfinance fallback / ETF 一部)→ map 内で `entry.volume = (p.volume != null && Number.isFinite(Number(p.volume))) ? Number(p.volume) : null;` を明示変換(型安全化、Layer3 guard 前段)。SMA/Cup が無い銘柄でも volume 正規化が要るため、early return の前段で volume 正規化だけ行う(diff 最小)。

**副 YAxis(price 主軸と分離):**
```jsx
<YAxis yAxisId="vol" orientation="right" hide
       domain={[0, (dataMax) => (Number.isFinite(dataMax) && dataMax > 0 ? dataMax * 5 : 1)]} />
```
- `hide`(絶対値不要、比率が本質 = 5原則#1 読み手負担減)。`domain` 上限 `dataMax * 5` で出来高帯をチャート下部 ~20% に圧縮(`* 4〜* 6` 調整可)。非有限/0 で `1` fallback(Layer3 guard)。`margin.right: 160` は変えない(右ラベル群 clip なし)。

**`<Bar>`(price 描画の直前 = z順で price の背面):**
```jsx
<Bar yAxisId="vol" dataKey="volume" isAnimationActive={false} name="出来高">
  {chartData.map((entry, i) => <Cell key={i} {...volCellProps(entry, avgVol50)} />)}
</Bar>
```
- `yAxisId="vol"` 明示で price 主軸・candle `<Bar>`(主軸)と衝突回避(Recharts は同一 ComposedChart 内で yAxisId 違いの複数 `<Bar>` を共存可)。`<Cell>` 方式採用(candle の shape 関数より単純・安全、`import { Cell } from 'recharts'`)。**`isAnimationActive={false}` 必須**(Layer4。chartData が SMA/Cup 後追い load で再計算されるたび再アニメ=視覚不安定)。line/candle 両モードで常時表示(toggle は今回追加しない=最小2点)。

### 3.2 up/down 色 + breakout 日ハイライト(`volCellProps` 純粋関数)

| 条件 | fill | fillOpacity | 意味 |
|---|---|---|---|
| `!Number.isFinite(volume)` | `'transparent'` | — | Layer3 guard(null skip) |
| `close >= open` | `var(--color-gain)` | 0.45 | 上昇日(過去事実の polarity のみ) |
| `close < open` | `var(--color-loss)` | 0.45 | 下落日 |
| **breakout 日** | 同上の方向色 | **0.85** | 強調は**透明度のみ**(色は方向色を維持) |

- breakout 日判定: `Number.isFinite(avgVol50) && entry.volume >= avgVol50 * 1.5 && entry.close >= entry.open`(④ confirmed=1.5x。1.3x soft は viz では強調しない=無料層は 1.5x のみ際立たせ単純化)。`avgVol50` が `null`(< 50点 / 非株式)→ 全日 uniform(breakout 強調なし、方向色 0.45 のみ)。
- breakout 強調は `fillOpacity` 0.45→0.85 で「事実の出来高急増」を際立たせる。**色を別 hue に変えない**(緑=上昇/赤=下落の意味分離を保つ。シアン=ブランド色は使わない)。
- §38: 強調は「過去に出来高が 50日平均×1.5 を超えた日」という**確定事実**のみ。tooltip も事実1行(「出来高: 50日平均比 ×X.X」)に限定、「買い」「ブレイク成功」等の将来断定は一切禁止(§38 / BAD-5)。

### 3.3 `avgVol50` と breakout 日判定(別 useMemo、`isNonEquity` gate)

```jsx
const avgVol50 = useMemo(() => {
  if (isNonEquity) return null;                  // 指数/先物/為替は出来高の意味が異なる
  const vols = (data?.prices ?? []).map(p => Number(p?.volume)).filter(Number.isFinite);
  if (vols.length < 50) return null;             // データ不足は fallback
  const last50 = vols.slice(-50);
  return last50.reduce((a,b)=>a+b,0) / last50.length;
}, [data, isNonEquity]);
```

### 3.4 相対出来高 chip(最小2点の2点目)

**位置:** PriceLadder 上部の chip 行(「地合い」Chip の隣)。「地合い: Distribution Days」Chip と並べることで **売り圧(地合い)⇄ 今日の出来高(相対)の両輪**を1視線に収める(③整合、5原則#5)。PriceLadder 一本に集約(chip の二重表示を避ける)。`buildTechnicalState` への引数追加は**しない**(stateText に出来高文を混ぜると §38 verify 面が増える。chip 独立で十分)。

**データ:** PriceLadder 既存 distCount useMemo に相乗り(`prices` は既に prop)。
```jsx
const volsAll = Array.isArray(prices) ? prices.map(p=>Number(p?.volume)).filter(Number.isFinite) : [];
const avgVol50 = volsAll.length >= 50 ? volsAll.slice(-50).reduce((a,b)=>a+b,0)/50 : null;
const todayVol = volsAll.length ? volsAll[volsAll.length-1] : null;
const volRatio = (Number.isFinite(avgVol50) && avgVol50 > 0 && Number.isFinite(todayVol)) ? todayVol/avgVol50 : null;
```

**chip 仕様(§38-safe 文言 + 投資色 tone):**
```jsx
{Number.isFinite(volRatio) && (
  <Chip variant="display" size="xs" tone={volTone}>出来高: 50日平均比 ×{volRatio.toFixed(2)}</Chip>
)}
```
- 文言は事実記述のみ(「出来高: 50日平均比 ×1.47」)。「急増」「商い活発」程度の中立語は許容、「買い場」「上昇」「ブレイク」等の方向断定・将来予測は BAN。
- **tone(§38 微妙ポイント → 既定 = 中立 muted):** 出来高は方向を持たない指標。`volRatio >= 1.5` を `gain`(緑)にすると「緑=上昇」と誤読される恐れ。**既定は `>= 1.5` でも `muted` 一択、緑は使わない**(出来高の多寡 ≠ polarity)。倍率の大小は文字の数値が担い、色で煽らない。薄商い `< 1.0` も `muted`(赤=下落専用なので薄商いに赤を使わない)。**「緑にするか中立にするか」は §8 の 6体合議論点に明示**。
- gate: `isNonEquity` で非表示(RS/Cup chip と同軸、`feedback_non_equity_chart_overlays` 一貫)。`!Number.isFinite(volRatio)` でも非表示。

### 3.5 DistributionDaysCard(売り圧)との両輪整合(③)

役割分離を維持: DistributionDays = 「機関の**売り圧**(直近25日の下落×出来高増の日数)」、相対出来高 chip = 「**今日の商い**の相対水準」。両者は別指標。両 component とも `volume > 前日volume` と `volume / 50日平均` を**同じ生 `prices[*].volume`** から frontend で算出(LLM 不使用の物理層分離)。DistributionDaysCard / PriceLadder の既存ロジックは不変(触らない)。PriceLadder 上部 chip 行に「地合い」と「出来高(相対比)」を横並びにして「売られているか × 商いが厚いか」を2秒で対比。

### 3.6 Chart Overlay Safety 4層 / CLS

1. **Layer1 ErrorBoundary**: `StockChartErrorBoundary` が `<StockPriceChartInner>` を既に包む(追加 `<Bar>`/`<Cell>` が throw しても chart のみ blank、`PaneErrorBoundary` も上位で継承)。
2. **Layer2 conditional render**: 出来高 `<Bar>` は `{!loading && data && data.prices.length > 0 && ...}` ブロック内(data null 中は render しない)。
3. **Layer3 `Number.isFinite` guard**: `volCellProps` 内で false → `fill: 'transparent'`。`avgVol50` null → breakout 判定スキップ。副 YAxis domain も非有限で `1` fallback。
4. **Layer4 `isAnimationActive={false}`**: 出来高 `<Bar>` に必須。
- **CLS**: 出来高帯は副 YAxis domain 圧縮で**既存 chart 高さ内に収まる**(高さ・margin 不変=レイアウトシフトゼロ)。chip 追加は既存 chip 行内 inline 拡張(行の高さ不変、CLS envelope 不要)。

---

## 4. nightly 保存 + screener 化(⑥)+ 502 安定(⑩)

### 4.1 `_scan_breakout` の state 定義(引け確定のみ・§38 境界)

nightly scan は**引け後実行**(OHLCV 最終足=確定終値)。日中足の曖昧性が無いのが nightly の強み。nightly で **DB 保存する state は3値**(pending は保存しない):

| state | 物理条件(pivotH=直近N日 intraday 高値、N=20 or 40) | §38 polarity |
|---|---|---|
| `bo_confirmed` | `close[-1] > pivotH` かつ `vmult >= 1.5` かつ not extended | **緑可**(過去/現在の確定事実=「ブレイク済み」) |
| `bo_soft` | `close[-1] > pivotH` かつ `1.3 <= vmult < 1.5` かつ not extended | **中立 muted**(出来高薄い=確度低い、緑にしない。§9 #9 で確定) |
| `bo_extended` | `close[-1] > pivotH` かつ過熱(`base_rise_pct > THRESH` 等、§1.4 独立フラグ) | **amber**(警告=高値掴みリスク、買い場でない) |
| (非保存) | `close[-1] <= pivotH`(pending 含む) | — |

> state 優先順位(同時成立時): `extended > confirmed > soft`(過熱なら vmult によらず extended、追いかけ警告を最優先)。extended 判定は §1.4 の独立フラグ(`_compute_extended_gate.passed` を流用しない・§9 #2)。

**pending を nightly 保存しない理由:** pending は「リアルタイム性のあるシグナル」で、引け確定後には消えている(翌日の引けで再判定)。保存すると stale な非買いシグナルが DB に溜まる。**pending の UI 表示は `/api/technical`(個別銘柄リアルタイム)側の責務**(§4.4)。screener(DB SELECT)には confirmed/soft/extended のみ載る = decision① と⑥の整合点。これにより「ブレイクアウト銘柄」と訴求して pending が screener に混入しない**構造的保証**になる(Trust Cliff 物理回避)。

### 4.2 nightly 配線(`_scan_one`、parallel + sequential 両 path)(§9 blocking-1 / §12.2 #1 是正)

#### parallel path — `_scan_one` の5要素化(main.py L16352–L16373)

現状の `_scan_one`(main.py:16352)は **4要素 tuple `(ticker, result, retest, err)`** を返す。早期 return が3箇所あり、breakout 追加時に **全 return 文と unpack 行を同時に5要素化しないと `asyncio.gather` の unpack(L16373)で全502銘柄 `ValueError` → nightly 全停止**(`feedback_pge_loop_pitfalls` ルール1「全 return 文を揃える」)。

変更が必要な行を以下に明示する:

```python
# ---- L16359: ohlcv fetch 失敗(早期 return) ----
# Before:  return ticker, None, None, "ohlcv_fetch_failed"
# After:   return ticker, None, None, None, "ohlcv_fetch_failed"   # breakout=None を追加

# ---- L16364: _detect_cup_handle 例外(早期 return) ----
# Before:  return ticker, None, None, f"detect_failed: {e}"
# After:   return ticker, None, None, None, f"detect_failed: {e}"  # breakout=None を追加

# ---- L16366–L16367: 正常系 return ----
# Before:
retest = _scan_resistance_retest(times, highs, lows, closes, result)
return ticker, result, retest, None
# After:
retest   = _scan_resistance_retest(times, highs, lows, closes, result)
breakout = _scan_breakout(times, highs, lows, closes, volumes, result)   # ← 追加
return ticker, result, retest, breakout, None   # err=None

# ---- L16373: gather 後の unpack ----
# Before:  for ticker, result, retest, err in results:
# After:   for ticker, result, retest, breakout, err in results:
```

`_scan_breakout` は `_scan_resistance_retest` と同一 OHLCV(`times, highs, lows, closes, volumes`)を使い回す(**追加 fetch ゼロ**、§4.5)。`result`(cup_handle 結果)は重複検出回避の参照のみ、内部ロジックは完全独立。cup_handle 閾値(`breakout_volume_multiplier` 等)は流用禁止、breakout 独自定数(`CONFIRM_VOL=1.5 / SOFT_VOL=1.3`)を使う。

unpack 後の保存ブロックは cup/retest の既存パターンに倣い additive 追加:

```python
# gather unpack 後(既存 retest ブロックの直後)
if breakout and breakout.get("detected"):
    breakout_detected += 1
    if not dry_run:
        bo_state = breakout.get("state") or "bo_confirmed"
        ok_bo = await asyncio.to_thread(
            _upsert_pattern_signal, ticker, "breakout", today, bo_state, breakout,
        )
        if ok_bo:
            breakout_upserted += 1
```

カウンタ `breakout_detected / breakout_upserted` を `retest_detected / retest_upserted` の初期化直後に追加。response dict に `breakout_detected_count / breakout_upserted_count` を追加。`.github/workflows/nightly_scan.yml` の jq 行に2カウンタ + freshness assert(§4.5)を追加。保存は `on_conflict="ticker,pattern_type,signal_date"` で cup_handle/retest と別 namespace(衝突なし)、`scanned_at` は DB `DEFAULT now()` 自動付与。

#### sequential path — ローカル変数パターン(tuple 拡張なし)

sequential path(worker_count=1、L16406 以降)は `return` でなく **ループ内ローカル変数 + continue** の構造のため、tuple 要素数の拡張は不要。breakout は retest ブロックの直後に **ローカル変数 + upsert ブロック追加** で配線する(既存 `retest = _scan_resistance_retest(...)` ブロック末尾の直後):

```python
# sequential path — retest ブロック末尾(L16450 直後)に追加
breakout = _scan_breakout(times, highs, lows, closes, volumes, result)
if breakout and breakout.get("detected"):
    breakout_detected += 1
    if not dry_run:
        bo_state = breakout.get("state") or "bo_confirmed"
        ok_bo = await asyncio.to_thread(
            _upsert_pattern_signal, ticker, "breakout", today, bo_state, breakout,
        )
        if ok_bo:
            breakout_upserted += 1
```

**parallel / sequential の書き分け根拠**: parallel path は `_scan_one` が coroutine として `asyncio.gather` に投入される。この gather の unpack が5要素化と同期しないと全銘柄 `ValueError` で nightly 全停止する(実コード確認済: L16369–L16373)。sequential path はループ直書きのため gather unpack が存在せず、tuple 要素数変更は不要で安全。

**触ってはいけない箇所(回帰防止):**
- `_CONSENSUS_CUP_STATES`(cup_handle pattern_type 専用 state filter)— 一切手を加えない。`_build_consensus_universe` の cup query は `.eq("pattern_type","cup_handle")` で明示フィルタのため衝突しない。
- `_upsert_pattern_signal` 本体(汎用設計済、signature `(ticker, pattern_type, signal_date, state, payload)` をそのまま呼ぶ)。
- `_fetch_pattern_signal_latest_breakout`(cup_handle の `state="breakout_confirmed"` fetch、新 `pattern_type="breakout"` とは別物。名が紛らわしいが変えると cup_handle の last_breakout inject が壊れる)。
- `_detect_cup_handle` / `_detect_resistance_retest` / `_scan_resistance_retest` / `cron_canslim_scan` / `_fetch_ohlcv_3y` / worker/chunk safety cap。

### 4.3 payload schema(`pattern_signals.payload`)(§9 #4 是正 — vs_spy_excess 削除)

**`vs_spy_excess` フィールドを payload から削除する。** `cron_rs_ratings`(main.py L17042)が IBD式 `universe_percentile`(1-99)を `rs_ratings` テーブルに nightly upsert 済(L17164: `rs_vs_spy_pct` 昇順ランク → 1-99 変換、L17207: `universe_percentile` upsert)。`/api/technical` も `_universe_percentile_for(ticker_u)`(L13960)で `rs_ratings.universe_percentile` を `patterns_result["rs"]["universe_percentile"]` に注入済。新規 `vs_spy_excess` を payload に持たせると (1) `universe_percentile` と二重実装(SSOT 違反)、(2) nightly `_scan_one` 内でさらに SPY fetch を追加 → 502 リスク母数増加(decision⑥「追加 fetch ゼロ」と矛盾)、(3) `vs_spy_excess > 0`(SPY をわずかに上回るだけ)は IBD式 RS 思想の劣化版。

改訂後の payload schema(vs_spy_excess 行を削除):

```json
{
  "n_window": 40,
  "pivot_high": 145.57,
  "pivot_date": "2026-05-27",
  "close": 152.30,
  "breakout_pct": 4.62,
  "vmult": 1.62,
  "vol_avg_50": 18234100,
  "is_new_52w_high": true,
  "state": "bo_confirmed"
}
```
- nightly `_scan_breakout` 内での SPY 比較算出は不要(screener 側で `rs_ratings` JOIN、§6.3)。
- `is_new_52w_high`: `close[-1] >= max(highs[-252:])`(strong tier badge 用)。
- 数値は全て Python 計算(HG 層1)。narration 含めない(表示時に静的辞書 `buyZoneLabels` でラベル化)。

### 4.4 `/api/technical`(個別銘柄リアルタイム)への additive 出力

`get_technical()` の `if "cup_handle" in requested:` ブロック直後に `if "breakout" in requested:` を additive で追加。`patterns_result["breakout"] = _detect_breakout(times, highs, lows, closes, volumes)`。frontend は `patterns=cup_handle,sma_50,sma_200,rs,dma_cross,breakout` を送る(`TECHNICAL_CANONICAL_PATTERNS` に `breakout` 追記、§2.3.3 / §12.2 #5)。`cache_key` は `f"{ticker}:{period}:{'+'.join(sorted(requested))}"` で自動構成され衝突しない(canonical 変更で全 priceCell cache 一斉 miss、§12.3)。breakout の G1 gate は spy_uptrend を要するため、cup 非 requested でも動くよう **breakout の if ブロック内で `_spy_uptrend` を独立取得**(or 前段ヘルパに括り出し共有、§12.2 B3)。
- ここでは pending を含む4 state(`bo_pending` / `bo_soft` / `bo_confirmed` / `bo_extended`)を返すが、**pending は §38-safe 非買いラベル固定**で色信号を出さない(中立 muted、§2)。confirmed/extended は nightly DB と同じ判定式で一貫。
- 触ってはいけない: `_detect_cup_handle` 内部 / `_TECHNICAL_CACHE` 構造 / `overlays` リスト(breakout はオーバーレイ折れ線でなく `patterns_result` のみ)/ `OVERLAY_COLORS`(breakout 用に hex 直書きしない、シアン使わない)/ yfinance import(OHLCV は展開済変数を使う、新 fetch なし)。

### 4.5 502 risk(⑩・3000銘柄同期)

1. **追加 fetch ゼロ**: breakout 検出は `_scan_one` 内で cup_handle と**同一 OHLCV を使い回す**。新規 fetch を追加しない → scan 時間・FMP 呼び出し回数とも不変、502 リスクの母数を 1mm も増やさない。
2. **事前 gate で早期 return**: `_scan_breakout` は データ長<60 / volumes 欠損 で即 None。pivotH 算出は `max()` 1回×2窓のみ(O(N))。retest の「pivot 不在なら box_support scan をスキップ」と同型に、`pivotH20 is None and pivotH40 is None` or `market_context=="weak"` を先頭 gate にして地合い weak・データ不足銘柄では重い計算をスキップ。
3. **freshness assert(⑩ 第一手 = silent fail 是正)**: nightly workflow に scan 後 freshness assert を追加。`breakout_upserted_count == 0` かつ `breakout_detected_count == 0` が **2日連続 → workflow を明示 fail(exit 1)**。「S&P500 で日次 3-5件 confirmed」が実測 baseline、0件継続は 502 or 配線断の signal。これで「nightly cup-scan 502 が continue-on-error で隠れる」既知問題を breakout 相乗りを機に是正(retest A / breakout 両方の前提)。
4. **再発時の段階的対処(⑩ 順序)**: 第一手 = **universe 分割(chunk 化)**(universe を N 分割し chunk 毎に別 step / 別 matrix job、部分失敗が全体を巻き込まない)。ダメなら = **scan 非同期化**(trigger と結果取得を分離、fire→poll)。breakout は cup/retest と同一 nightly に相乗りするのでこの 502 対策は **3 pattern 共通インフラ**として効く。

---

## 5. tier + masking(⑦)

| 要素 | tier | 実装 |
|---|---|---|
| 出来高バー(株価チャート)+ 相対出来高 chip | **無料** | 基本チャート要素。全ユーザー。plan gate をかけない。`cupRequiresPro` 等の masking 対象に含めない(§3) |
| breakout signal 分類ラベル(bo_confirmed/bo_soft/bo_extended/bo_pending) | **Premium** | `/api/technical` payload で非Premium は breakout block を物理除去(retest A先行と同型)。⚠️ ただし get_technical に現状 plan gate が無い(cup_handle も全ユーザーに返している)ため backend 物理除去は新規 plan 判定が必要 = 「既存同型・回帰ゼロ」前提は偽(§12.3 MAJOR)。decision⑫ で pending を無料 viz 側に出す案も未決 |
| `/api/scanner/breakout`(screener) | **Premium** | §6.2 物理空配列 masking。`count_locked`(件数のみ)を非Premium に出して ProTeaser 訴求 |

- **重要な切り分け**: §3 の出来高バー強調(1.5x で透明度↑)は「過去の出来高が多かった事実」の可視化 = 無料。一方「これはブレイク confirmed/pending」という**分類ラベル = Premium**。viz(事実)と分類(解釈)を物理分離することで「viz 無料・分類 Premium」の Trust Cliff を回避。出来高バーの強調は分類ラベルを伴わない(「×1.5超の日が緑濃い」だけで「ブレイク確定」とは書かない)。
- plan 判定は `getPlan(subscription)` 経由(手組み三項禁止 = `feedback_plan_resolution_ssot`)。cup_handle=Premium / retest=Premium と一貫(screener は Premium 統一)。
- 非Premium への物理除去は backend(leak させない)。frontend の ProTeaser blur は見た目のみで payload は既に空。

---

## 6. screener 化 — `/api/scanner/breakout`(retest A先行 infra 再利用)

> **screener ラベル語彙(§9 #10 是正・原則1)**: `ScreenerPane.jsx:39-47` の `CUP_STATE_LABEL_JP` は cup_handle 由来の `breakout_confirmed: 'ブレイク確定'` / `breakout_pending: 'ブレイク待機'` / `breakout_extended: '高値圏突破'` を保持。新 breakout(`bo_*`)は **別 dict `BREAKOUT_STATE_LABEL_JP` を新設**し cup の `CUP_STATE_LABEL_JP` と物理分離する。`ScreenerPane.jsx:671-674` の badge 生成は `item.pattern_type === 'breakout'` で分岐してから `BREAKOUT_STATE_LABEL_JP[item.state]` を参照(cup 側 dict にフォールスルーしない)。

### 6.1 endpoint 設計(DB SELECT のみ・検出は走らせない)

```
GET /api/scanner/breakout?n=40&min_vmult=1.5&exclude_extended=1&min_percentile=70
```
- **DB SELECT のみ**: `pattern_signals` を `pattern_type="breakout"` かつ `signal_date >= today - 1`(前営業日 nightly 分)で SELECT。検出ロジックは**呼ばない**(nightly 保存済を引くだけ = 高速・502 無関係)。
- retest A先行の `/api/scanner`(resistance_retest 版)と**同一構造**(同じ `createClient`(service_role)・同じ payload 展開・同じ response shape)。新規 fetch / LLM / 重い計算ゼロ。
- **state 名は B1 改名後の `bo_*` namespace**(`bo_confirmed` / `bo_pending` / `bo_soft` / `bo_extended`)。⚠️user確認: namespace の最終形は §11.1 B1 の decision(`bo_*` か `newhigh_*` か)を先に lock し §1.8/§4.1/§6 全体へ伝播する。以下は `bo_*` 案で記述。
- response(`vs_spy_excess` を廃し screener 側で `rs_ratings` JOIN した `universe_percentile` を載せる、§6.3):
```json
{
  "as_of": "2026-06-16",
  "count": 4,
  "items": [
    {"ticker":"RL","state":"bo_confirmed","n_window":40,"breakout_pct":4.6,
     "vmult":1.62,"is_new_52w_high":true,"universe_percentile":88,"rs_vs_spy_pct":12.3,
     "pivot_date":"2026-05-27","signal_date":"2026-06-16"}
  ]
}
```

### 6.2 tier gate(⑦・物理除去 = retest A先行と同型 masking)

`getPlan(subscription) !== 'premium'` の場合: **backend で items を物理空配列化**(`items: [], locked: true, count_locked: N`)。`count_locked`(件数だけ)は出して ProTeaser で「Premium で N 件の新高値ブレイクを見る」と訴求。**payload 本体は1件も return しない**。物理除去は backend(leak させない)。

### 6.3 screener default filter(数値・③根拠)(§9 #4 是正 — universe_percentile JOIN)

`vs_spy_excess > 0` を廃止し、`scanner_retest` / `scanner_rs`(main.py 既存)と同型の `rs_ratings` JOIN + `universe_percentile` フィルタに変更する(SSOT: `scanner_rs` / `scanner_retest` / `scanner_canslim` の全既存 screener が `rs_ratings` JOIN パターンを採用 = 二重実装撤廃でコードベース一貫)。

```
n ∈ {20, 40}                 # 両 tier OR
state == bo_confirmed        # vmult>=1.5 のみ (soft は除外)
exclude_extended == true     # 過熱帯 (高値掴み帯) を default で隠す
universe_percentile >= 70    # IBD RS Rating 上位30% (⚠️user確認: 閾値は min_percentile param で調整可)
```

**実装パターン(scanner_retest と同型 rs_ratings JOIN):**
```python
# ── RS join (scanner_retest と同パターン) ──
rs_calc_date, _ = _latest_valid_calc_date(sb, "rs_ratings", "calc_date", _MIN_VALID_RS_ROWS)
rs_map: dict[str, dict] = {}
if rs_calc_date:
    for i in range(0, len(breakout_tickers), 150):       # chunk 150 (URL 長制限回避、retest 同型)
        chunk = breakout_tickers[i:i + 150]
        rs_res = (sb.table("rs_ratings")
            .select("ticker,universe_percentile,rs_vs_spy_pct,self_percentile")
            .eq("calc_date", rs_calc_date).in_("ticker", chunk).execute())
        for r in (rs_res.data or []):
            if r.get("ticker"):
                rs_map[r["ticker"]] = r
# filter: universe_percentile >= min_percentile (default 70)
up = int(rs_map.get(ticker, {}).get("universe_percentile") or 0)
if up < min_percentile:
    continue
```

**根拠(③):**
- N40 confirmed(close>pivotH+1.5x)= **RL/AMAT/SW の3件**。N20 1.5x=5件。両 tier OR で S&P500 日次 **3-8件**。
- `exclude_extended`: 過熱帯は「追いかけ買い禁止」帯。default で隠して「今まさに pivot 付近」の clean breakout だけ見せる(原則1 読み手負担減)。extended は toggle で表示可。⚠️user確認: extended 閾値は §1.4 design fork(O'Neil 原典 pivot+5-10% への再キャリブレーション)に連動。
- `universe_percentile >= 70`: IBD CAN-SLIM の RS Rating 70+ 相当。`scanner_rs` でも `gte("universe_percentile", min_percentile)` を実績使用。③の N20 pending 上位の金融・景気敏感銘柄(TFC/PNC/FITB/NUE/STLD)も `universe_percentile` 上位フィルタで `vs_spy_excess > 0` と同等以上に除外できる。`rs_ratings.universe_percentile` は `cron_rs_ratings`(L17042)が nightly upsert 済 = SELECT 時 JOIN で取得(追加 fetch ゼロ、502 リスク不変)。
- **endpoint シグネチャ(改訂後)**: `GET /api/scanner/breakout?n=40&min_vmult=1.5&exclude_extended=1&min_percentile=70`。`vs_spy_excess` は query param・payload ともに消滅。`min_percentile`(default=70)を採用。⚠️user確認: 閾値 70 vs 80 vs retest 同型 `rs_vs_spy_pct>0` の選択は §8 6体合議論点。
- default 以外の toggle(user 操作で緩める): `state=bo_soft` 含む(1.3x)/ `include_extended` / `is_new_52w_high only`。soft と extended は default OFF(Trust Cliff 回避 = 確度の低い・追いかけ帯を初期表示しない)。

### 6.4 screener ラベル語彙の差別化(§9 #10・原則1)

新 breakout(`bo_*`)用 `BREAKOUT_STATE_LABEL_JP` を新設し cup の `CUP_STATE_LABEL_JP` と物理分離。⚠️user確認: 以下ラベルは暫定。6体合議(§8)に「screener badge 語彙 — cup『ブレイク』との 2秒判別を満たすか」を追加して reviewer 確認を経る。

| state(`bo_*`) | `BREAKOUT_STATE_LABEL_JP` | cup `CUP_STATE_LABEL_JP` との対比 |
|---|---|---|
| `bo_confirmed` | 「新高値ブレイク」 | cup:「ブレイク確定」→ 語頭「新高値」で即識別 |
| `bo_pending` | 「高値圏トライ中」 | cup:「ブレイク待機」→ 「トライ中」で未確定ニュアンス |
| `bo_extended` | 「新高値圏(過延伸)」 | cup:「高値圏突破」→ 「過延伸」を括弧で明示 |
| `bo_soft` | 「新高値ブレイク(出来高薄)」 | — |

**russell3000 外挿:**

| universe | confirmed 日次(推定) | filter 後(default: confirmed + universe_percentile≥70 + not-extended) |
|---|---|---|
| S&P500 (502) | 3-8件(実測) | **3-5件** |
| russell3000 (3000) | 線形外挿 ×6 ≈ 18-48件 | **15-30件**(universe_percentile≥70 で約半減見込み) |

russell3000 raw は「毎日開きたくなる」には多すぎ(原則2 違反=認知過負荷)。screener default で `universe_percentile≥70 + confirmed + not-extended` を必須にして russell3000 でも日次 15-30件に抑える(§6.3 是正で `vs_SPY>0` から `rs_ratings.universe_percentile` JOIN に変更)。「新52週高値」toggle で 5-10件の強tier に絞る導線を用意。

---

## 7. ③実データ分布(S&P500 502銘柄, 2026-06-15, 本番 `/api/price-history` 実 OHLC)

### 7.1 pivot 定義 × N × 出来高フィルタの生検出数

`pivot=pivotH`(直近N日 intraday 高値)、`close>pivotH` の生検出:

| N(窓) | 生検出 | vol≥1.3x | vol≥1.5x | vol≥2.0x | pending(日中のみ) |
|---|---|---|---|---|---|
| N=20(4週) | 53 | 13 | **5** | 0 | 91 |
| N=40(8週) | 25 | 6 | **3** | 0 | 55 |
| N=60(12週) | 25 | 6 | 3 | — | 54 |
| N=252(52週) | 16 | 5 | 2 | — | 26 |

`pivot=pivotC`(N日終値高値、緩め)`close>pivotC`: N20=98 / N40=50 / N60=48 / N252=24。
新52週高値**終値**ブレイク: **16件**。

### 7.2 confirmed 銘柄の実体(N40, close>pivotH+1.5x)

| ticker | 備考 |
|---|---|
| RL | 新52週高値 ✓(strong tier 該当) |
| AMAT | 新52週高値 ✓(strong tier 該当) |
| SW | confirmed のみ(52週高値非該当) |

→ N40 confirmed 3件中2件が新52週高値 = 最強tier の実体。

### 7.3 N20 pending 上位(日中 pop→引け失速)

TFC(vmult 2.78)/ NDSN / PNC / FITB / NUE / STLD …**金融・景気敏感に偏在**(6/15 の日中 pop→引け失速)。→ §1.7 G1(地合い weak で物理 drop)+ G1b(stage filter)+ §6.3(`universe_percentile≥70` で弾く)の根拠。

### 7.4 CPA(じっちゃま銘柄)

pivotH=145.57(5/27 高値)/ close=144.40 / high=151.95 / vmult=1.47 → 全 N で **pending**(日中 145.57 超→引け割れ)。新52週高値=False(52週=156.41)。**日中ブレイク失敗の典型**(§0.3 で §38 設計の正当性を裏取り)。

### 7.5 結論(③)

- **vol≥2.0x は全滅で厳しすぎ。1.3-1.5x が実用帯**(④で 1.5x=confirmed / 1.3x=soft / 2.0x=却下 を確定)。
- **N=20-40 が短期 base breakout の妥当窓**(52週高値は厳しすぎ CPA 非該当 → strong tier badge に分離)。
- **pivotH は pivotC の約半分 = 厳格**(② intraday 採用で過検出抑制)。
- **pending は多数(N20 で91件)= 日中ブレイクを出すと Trust Cliff、pending は必ず非買い**(① §38-safe ラベル + nightly 非保存)。
- **confirmed 日次は S&P500 で 3-5件(N20-40, 1.5x)、russell3000 は要 filter**(§6.3 default filter)。
- 教訓: **SPEC の数式は実データで再現検証する**(retest で「band 内 retracement が常時負で発火しない数学的破綻」を実データで発見した教訓と double anchor)。

---

## 8. Phase gate(6体合議)計画 — decision⑨

3軸のうち **2軸 active** → **6体合議**(`multi-review` 6体起動基準: 3軸中 2+ active):
1. **LLM 出力品質(§38 境界)**: confirmed の緑信号判定、extended の amber、pending/soft の非緑ラベル、blocklist FE=BAD-10/BE=BAD-11 の過剰削除なし。 ✅ active
2. **Trust Cliff**: pending 非買い・日中ブレイク非表示・nightly 非保存(screener に構造的に混入しない物理保証)・extended 追いかけ警告。 ✅ active
3. **新 endpoint(`/api/scanner/breakout` + tier masking)**: blast radius。 ✅ active

→ 3軸全 active のため **6体合議で実施**(ui-designer / frontend-architect / qa-dogfooder + 金融 verdict / Anthropic engineer / マーケター)。

**詰めるべき主要論点(reviewer に明示):**
- **§38**: `bo_confirmed` を緑にしてよいか(=「ブレイク済み」は過去事実で OK だが「買い時」と読ませない文言設計が成立しているか)。`bo_extended` の amber が「売り推奨」に読まれないか。`bo_pending` / `bo_soft` の muted で「未確定 / 出来高やや不足」が正しく伝わるか。
- **Trust Cliff**: 「ブレイクアウト銘柄」と訴求して pending が混入しない物理保証(nightly 非保存=DB 由来 screener には構造的に入らない、を確認)。viz(無料・事実)と分類ラベル(Premium・解釈)の物理分離が Trust Cliff を生まないか。
- **endpoint / RS filter(§9 #4 是正)**: screener default を `rs_ratings.universe_percentile` JOIN にした設計。`min_percentile` の閾値選定(**70 vs 80 vs retest 同型 `rs_vs_spy_pct>0`**)を final lock。`vs_spy_excess` 廃止で二重実装を撤廃。⚠️user確認(decision)。
- **extended 閾値再キャリブレーション(§9 #2 / §1.4 design fork)**: cup 流用 `>25%` か O'Neil 原典寄り `>10%`(暫定)か中間 `>15%` か。SMA50 閾値の保守 30% 固定 vs 中小 50% 固定。⚠️user確認(decision)。
- **stage filter(§9 #3 / §1.7 G1b)**: `pivotH>SMA50 かつ 50DMA 上向き` の AND 2条件 vs `close>SMA200` 単独。③再計測後に検出数激減なら訴求降格。⚠️user確認(decision)。
- **3 signal 優先順位(§2.3.2)**: cup / retest / breakout 同時検出時の priceCell 表示優先(retest>breakout>cup 暫定)。⚠️user確認(decision)。
- **screener badge 語彙(§6.4)**: `BREAKOUT_STATE_LABEL_JP`「新高値ブレイク」が cup「ブレイク確定」と 2秒判別できるか。⚠️user確認(decision)。
- **viz tone**: 相対出来高 chip の tone を `>= 1.5` で緑にするか中立にするか(§3.4、既定=中立 muted、出来高は方向を持たない)。出来高バー breakout 強調を「1.5x のみ」か「1.3x soft も淡く」か(既定=1.5x のみ、単純化)。
- **decision⑫(pending × tier)**: pending を無料 viz 側の中立注記として出すか(§12.4、合議推奨 = m4 採用)。⚠️user決裁待ち。
- **StateCompass priceCell の色 — confirmed を緑(gain)にするか warn(amber)固定にするか**: 暫定 = **warn 固定**（§2.3.1）。理由: StateCompass は「信号機サマリー」として機能し、confirmed 緑が「買い時」の誤認を生む §38 リスクがある。chip / tooltip 層は §2.4 で `bo_confirmed` = gain 可(過去確定事実の polarity 表示)。**2層分離が既存 retest 実装(signal='warn')とも整合**するため暫定は warn 固定。6体合議で confirmed の信号機緑 vs warn 固定の最終確定を行う。⚠️user確認(decision)。

合議 PASS 後に `_scan_breakout` 配線 → `/api/scanner/breakout` → screener UI(retest infra 再利用)→ Generator 実装(decision⑧)。

---

## 9. 閾値・根拠サマリー表(③ S&P500 502銘柄, 2026-06-15)

| パラメータ | 確定値 | ③根拠 |
|---|---|---|
| pivot 定義 | 直近N日 intraday 高値(当日除く) | LOCKED②。pivotC 比 約半分=厳格、過検出抑制 |
| N tier | 20(4w) / 40(8w) | N20: 1.5x=5件 / N40: 1.5x=3件。N60 冗長・N252 厳しすぎ却下 |
| confirmed vol | ≥ 1.5x(50日平均) | LOCKED④。S&P500 日次 3-5件に収束 = push 適正 |
| soft vol | 1.3–1.49x | N20 差分≈8件。confirmed と区別表示(**muted・緑禁止**、§9 #9 是正で色濃淡を撤回) |
| 却下 vol | 2.0x | ③全N全銘柄 0件 = 死tier |
| pending 式 | high>pivotH & close≤pivotH | CPA(151.95>145.57, close144.40)で実証ヒット。N20 で91件→必ず非買い・nightly 非保存 |
| extended | base_rise>**+10%(暫定 B案・⚠️user確認)** or sma50_dev>+30%(保守固定) | §9 #2 是正: `_compute_extended_gate.passed` 逆流用回避の独立フラグ。cup 流用+25% は O'Neil 原典より緩く再キャリブレーション(§1.4 design fork、6体合議 final lock)。乖離数値併記(§38/§5) |
| stage filter(G1b) | pivotH>SMA50 かつ 50DMA 上向き(⚠️user確認: close>SMA200 単独も代替) | §9 #3 是正: prior uptrend 欠落で bear-market rally を緑量産する金融致命を防止。追加 fetch ゼロ |
| 52週高値 tier | 終値≥直近252本 intraday 高値 | ③16件。RL/AMAT(N40 confirmed)が該当 = 最強tier 実体 |
| 地合い除外 | market_context=="weak"(SPY 200DMA 割れ) | ③ pending 上位の金融偏在を物理 drop。None(fetch 失敗)は通す |
| screener RS filter | universe_percentile>=70(⚠️user確認: min_percentile param) | §9 #4 是正: `vs_spy_excess` 廃止、`rs_ratings` JOIN(cron_rs_ratings 既存、二重実装撤廃) |
| データ下限 | n<60 / pivotH 両None / 出来高欠落 | cup_handle・retest と統一 |
| 出来高バー強調 | 1.5x 以上の上昇日を fillOpacity 0.85 | ④ confirmed。色は方向色維持(緑/赤、シアン禁止) |
| 相対出来高 chip tone | 既定=muted(緑不使用) | 出来高は方向 polarity を持たない(§38)。6体合議論点 |

---

## 10. 実装順序(decision⑧ LOCKED・retest A先行後)

1. ~~**retest A先行公開(現🔴)を先に完遂**~~ ← **✅完遂済(commit 36d9ac8、2026-06-16 deploy)**: `/api/scanner/retest` 新設 + ScreenerPane「リテスト接近」chip/section + StateCompass label + Premium gate 一本化。
2. その screener infra(`/api/scanner/retest` DB SELECT + ScreenerPane chip refMap + 最小 masking)を確立 ← **✅同 commit で確立済**。breakout はこの infra を再利用する。
3. **freshness assert で nightly 502 silent fail を是正**(breakout 相乗りの前提・⑩)← 未着手(§4.5 で設計済、breakout 実装時に配線)。
4. **本 SPEC 起票 → 6体合議(Phase gate、decision⑨)** ← 6体合議実施済(§12)。本版で §12.2 BLOCKING を本文反映(v2)。残りは decision⑫ user 決裁 + 本文レビュー。
5. 合議 PASS 後: `_scan_breakout` 配線(nightly parallel+sequential、`_scan_one` 5要素化 §4.2)→ `/api/scanner/breakout`(retest `/api/scanner` 再利用、`rs_ratings` JOIN §6.3)→ screener UI(ScreenerPane chip refMap 再利用 + `BREAKOUT_STATE_LABEL_JP` §6.4)→ `/api/technical` additive(`bo_*` 4 state)→ §2 §38 層(`classifyBreakoutZone` + buyZoneLabels bo_* / blocklist FE=BAD-10/BE=BAD-11 / 色 tone)→ §3 出来高 viz(無料・別レイヤー、先行着手可)。
6. **出来高 viz(§3)は tier=無料・基本チャート要素**のため、breakout 分類レイヤー(Premium)と独立に先行リリース可能(viz は pending/confirmed を区別せず「事実の商い」だけ描く=分類ラベルを含まない)。
7. **CPA の暫定表示は SPEC 完成まで何も出さない**(decision⑪)。

---

## 付録: 参照した実装箇所(read-only・変更なし)

- `/Users/yamadadaiki/Projects/beatscanner/backend/app/main.py`:
  `_spy_uptrend`(L12798)/ `_detect_horizontal_support`(L12815)/ `_detect_resistance_retest`(L12893)/ `_scan_resistance_retest`(L12987)/ `_extended_numeric_fields`(L13020)/ `_detect_cup_handle` breakout state machine(L13234-13257)/ `get_technical`(L13793)/ `_upsert_pattern_signal`(L15093)/ `_fetch_pattern_signal_latest_breakout`(L15142)/ `_scan_one`(L16352)/ `_compute_extended_gate`(L16225)/ `_CONSENSUS_CUP_STATES`(L17288)
- `/Users/yamadadaiki/Projects/beatscanner/.github/workflows/nightly_scan.yml`(cup-scan step jq 観測行)
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/lib/buyZoneLabels.js`(`BUY_ZONE_LABEL_JP` / `BUY_ZONE_DESC_JP` / `classifyBuyZone`)
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/features/judgment/constants/stateCompassText.js`(`COMPASS_PRICE_LABEL`)
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/lib/blocklist.js`(`BLOCKLIST_PATTERNS`)
- `/Users/yamadadaiki/Projects/beatscanner/backend/app/visualizer/prompt_negatives.py`(`NEGATIVE_EXAMPLES` / `BLOCKLIST_REGEX`)
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/components/StockPriceChart.jsx`(`chartData` useMemo / `<YAxis>` / candle `<Bar>` / `EarningsTooltip` / `StockChartErrorBoundary`)
- `/Users/yamadadaiki/Projects/beatscanner/frontend/src/components/PriceLadder.jsx`(`buildTechnicalState` / distCount useMemo / 地合い Chip 行)

---

## 11. 完全性クリティック検出 + 是正「方針」(コード未変更 / 2026-06-16 自動監査)

> ⚠️ **重要な訂正(2026-06-16 6体合議で指摘・受容)**: 本セクションは **是正「方針」** であり、**コードは一切変更していない**(autopilot 安全境界)。当初「是正済」と書いたのは overclaim だった。正確には: **B1/B3 は「問題の存在」を実コード grep で一次確認済**(B1=`_CONSENSUS_CUP_STATES` 同名衝突・`classifyBuyZone` が state のみ分岐、B3=`TECHNICAL_CANONICAL_PATTERNS` に breakout 無し)。**B2 は critic 指摘のみで Claude は独立検証していない**(6体合議で「`_scan_one` は実コードでは現在も4要素のまま」と確認 = **未是正**)。本セクションの「是正」は全て **実装時に SPEC 本文(§1.8/§2.1/§2.3/§4.x)へ反映する方針** の意。下記 §12 の 6体合議が B1-B3 の方向性を「妥当だが不十分(伝播未完)」と評価。

### 11.1 BLOCKING(実コード検証済・実装前 must)

**B1. state 名衝突(検証✓)** — `_CONSENSUS_CUP_STATES = ("breakout_pending","breakout_confirmed","breakout_extended")`(main.py:17288、これは cup_handle の state 値)と完全同名。`classifyBuyZone(state)`(buyZoneLabels.js:108)は **state 文字列のみで分岐**(pattern_type を受け取らない): `breakout_confirmed→'breakout_support'` / `breakout_pending→'cup_pivot'` / `breakout_extended→'breakout_extended'`。同名だと cup 分岐が先にヒットし新分岐に到達不能。
→ **是正**: breakout の state を別 namespace **`bo_confirmed` / `bo_pending` / `bo_extended`**(or `newhigh_*`)に改名。**`classifyBreakoutZone(state)` を新設**し PriceLadder/StateCompass/BuyZoneCard が `pattern_type` で呼び分け。**§2.3 の「同名 state 素通し」は撤回**。§1.8(state='breakout'+tier)と §2.1/§4.1(state='breakout_confirmed')の SPEC 内部矛盾は **`pattern_type='breakout'` + `state ∈ {bo_confirmed,bo_pending,bo_extended}`** に一本化。
> → **本文反映済 (v2, 2026-06-16 overnight autopilot, 要 user レビュー)**: §codename/§1.3/§1.8/§2.1-A(classifyBreakoutZone 新設)/§2.2/§2.3/§4.1/§4.3/§6 全体で `bo_confirmed/bo_pending/bo_soft/bo_extended` に一本化。namespace 最終形(`bo_*` vs `newhigh_*`)は user decision 待ち。

**B2. _scan_one 全 return 5要素化** — 現状4要素 `(ticker,result,retest,err)`。早期 return が複数(ohlcv None / detect_failed)。breakout 追加で **全 return を `(ticker,result,retest,breakout,err)` の5要素に統一**(err 系は breakout=None)、unpack 行も5要素化。sequential path は tuple でなくループ内ローカル変数なので「tuple 拡張」でなく「ローカル変数 + upsert ブロック追加」と書き分け([[feedback_pge_loop_pitfalls]] ルール1「全 return 文を揃える」)。
> → **本文反映済 (v2, 2026-06-16 overnight autopilot, 要 user レビュー)**: §4.2 を parallel(L16359/16364/16367 全 return + L16373 unpack の5要素化を行レベルで明示)+ sequential(ローカル変数パターン)に書き分け。

**B3. get_technical の breakout 配線 scope(検証✓: canonical に breakout 無し)** — retest 配線は `if "cup_handle" in requested:` 内部で `spy_up` 等 cup ローカルに依存。breakout の G1 gate も spy_uptrend 必要。
→ **是正**: breakout の if ブロック内で **spy_history/`_spy_uptrend` を独立取得**(cup 非 requested でも動く、or 前段ヘルパに括り出し共有)。`TECHNICAL_CANONICAL_PATTERNS`(api.js:5=`'cup_handle,sma_50,sma_200,rs,dma_cross'`)に **`'breakout'` を追加**(StateCompass は canonical 使用のため未追加だと届かない)。
> → **本文反映済 (v2, 2026-06-16 overnight autopilot, 要 user レビュー)**: §4.4 に `_spy_uptrend` 独立取得 + §2.3.3 に `TECHNICAL_CANONICAL_PATTERNS` への `breakout` 追記を反映。

### 11.2 MAJOR(実装前に解消)

- **M1. 表示配線**: StateCompass priceCell(L117)/ PriceLadder(L274-281)は `cup_handle.state` のみ読む。`patterns.breakout` 併読の拡張手順を明記。cup と breakout 同時 detected 時の priceCell 優先順位を決める(辞書追加だけでは到達しない=retest L117-119 と同型)。
  > → **本文反映済 (v2, 2026-06-16 overnight autopilot, 要 user レビュー)**: §2.3.1(priceCell に `patterns.breakout?.detected` 分岐 + classifyBreakoutZone)+ §2.3.2(cup/retest/breakout 優先順位表、retest>breakout>cup 暫定・⚠️user確認)に反映。
- **M2. blocklist BAD 採番(検証✓: FE 最大 BAD-9 / BE 最大 BAD-10)** — SPEC §2.5 の「BAD-11 retest 使用済」は**誤り**(grep BAD-11=0件、retest は ID なしで landed)。→ breakout の新 ID は **FE=BAD-10 / BE=BAD-11 起点**、or 両ファイルで ID 体系を正規化(1:1 mirror 維持)。「BAD-12」記述は破棄。
  > → **本文反映済 (v2, 2026-06-16 overnight autopilot, 要 user レビュー)**: §2.5 で FE=BAD-10/BE=BAD-11 に正規化、「BAD-12」記述を破棄。TL;DR §5 も更新。
- **M3. nightly freshness assert**: 「2日連続 fail」は GHA が state を持たず実装不能。→ **当日単発閾値**(`detected_count < baseline` で `::warning::` or exit 1)に簡素化、or Supabase `scan_runs` に前日値保存。⑩ silent fail 是正は breakout の **hard 前提**として §10 順序の gate に明記(依存の循環を解消)。
- **M4. extended None-preserve**: `_extended_numeric_fields`(L13038-13048)は SMA50/pivot 無で None 返す。`None > 25.0` は TypeError。→ `isinstance(x,(int,float)) and x > THRESH`、None は False(非 extended)に倒す。時価総額依存の +30%/+50%(中小/大型)分岐は breakout が**追加 fetch ゼロ**を守るなら適用不能 → **単一閾値**にするか `_compute_extended_gate`(時価総額 fetch あり)を nightly 限定流用と明記。

### 11.3 MINOR(実装時に解消)

- **m1. `_is_new_52w_high` 返り値**: bool でなく `(is_high, prior_252w_high)` を返し levels 構築に渡す(現状 prior_252w_high が関数内ローカルで NameError リスク)。§1.6 の n<60 分岐は G0(n<60 で return out 済)と重複したデッドコード→削除。
- **m2. avgVol50 二重定義**: StockPriceChart(slice(-50))と PriceLadder と backend(volumes[-51:-1])で起点が違い chip 倍率・バー強調・confirmed 判定がズレ「×1.5 chip なのにバー非強調」Trust Cliff。→ `lib/volume.js` に単一純粋関数集約、**全箇所で当日除く直前50日(`volumes[-51:-1]` 相当)に統一**。
- **m3. 52週 tier × guard 順序**: breakout 非検出(pivotH 両 None / market weak)でも 52週終値更新なら badge を出すか捨てるか未確定。→ 52週 badge を breakout detected と**独立経路**にするか**重畳限定**かを decision③ の意図に照らし §1.6/§1.8 で確定。
- **m4. pending × tier 境界(decision① と ⑦ の衝突・要 user 確認)**: §5 は「分類ラベル(confirmed/soft/extended/pending)=Premium 物理除去」だが decision①「pending を出す」が**無料層で成立しない可能性**。CPA(じっちゃま銘柄)の pending デモも無料ユーザーに見えない。→ **解決案**: pending を無料 viz 側の中立 state 注記(「終値未確認」)として出し、Premium 分類ラベルとは別レイヤーにする。**6体合議の §38/Trust Cliff 論点に追加**(下記 §8 に反映)。

### 11.4 是正の実装順序への反映

§10 の実装着手前に B1-B3(blocking)を SPEC 本文(§1.8/§2.1/§2.3/§4.x)へ反映し、state 改名 `bo_*` を全 reference に伝播してから Generator 着手。M1-M4 は Generator 実装時の必須チェック項目、m1-m4 は実装時解消。**m4 は user 確認事項(decision⑫、§12.4 に集約・user 決裁待ち)**。

> **v2 反映状況 (2026-06-16 overnight autopilot)**: B1-B3 + §12.2 BLOCKING(10件)を **SPEC 本文(§1〜§6)へ反映済**(各 item の注記参照)。コードは未変更・**要 user レビュー**。m1-m4 は実装時解消の方針として台帳に残置。decision⑫ は **user 決裁待ち**のまま。

---

## 12. 6体合議 verdict(Phase gate・decision⑨ / 2026-06-16)

> **consensus: `GO_WITH_CONDITIONS`(全6体一致)** / **implementation_ready: No(Generator 着手不可)**
> 1行: NO_GO は無いが、SPEC↔実コード乖離が blocking 級で複数あり、**(1) SPEC 本文の blocking 是正 + (2) decision⑫ (pending×tier) の user 決裁 + (3) retest A先行(Task#4)完了の hard gate** が揃うまで Generator 着手不可。B1-B3 の方向性(bo_* 別 namespace + classifyBreakoutZone + additive)は妥当だが **不十分**(伝播未完・B2 未是正)。

### 12.1 着手の 3 ゲート(全て満たして初めて Generator 着手可)
1. **SPEC 本文 blocking 是正(下記 §12.2 の 10 件)** を §1〜§5 に反映(本 draft は §11/§12 が台帳、本文は未反映)。
   > → **本文反映済 (v2, 2026-06-16 overnight autopilot, 要 user レビュー)**: §12.2 の 10 件を §1〜§6 に反映完了。コード未変更。各 item 注記参照。
2. **decision⑫(pending × tier)を user 決裁・locked 化**(§12.4)。集客価値と Trust Cliff を左右する decision レベル。 ← **user 決裁待ち(本版でも未 lock)**
3. **retest A先行 screener infra(handover v220 Task#4)の完了を hard gate**。~~実コード確認: `/api/scanner/retest` も ScreenerPane retest chip も実在しない~~。
   > → **✅解消済 (commit 36d9ac8, 2026-06-16 deploy)**: Task#4 retest A先行公開を本日 deploy。`/api/scanner/retest` 新設 + ScreenerPane「リテスト接近」chip/section + StateCompass label + Premium gate 一本化。decision⑧「retest infra 再利用」の前提が **真になった**(本 hard gate 充足)。

### 12.2 BLOCKING(10件・SPEC 本文是正 must)
1. **B2「是正済」撤回**: `_scan_one`(main.py:16352)は現在も4要素 tuple。breakout 追加時に全 return(L16359/16364/16367)+ unpack(L16373)を5要素 `(ticker,result,retest,breakout,err)` に統一。漏れると asyncio.gather unpack で全502銘柄 ValueError → nightly 全停止。
   > → **本文反映済 (v2, 要 user レビュー)**: §4.2 に parallel(行レベル diff)+ sequential 書き分けを反映。
2. **extended gate の boolean 逆流用**: `_compute_extended_gate`(main.py:16249)は `base_rise ≤ 25.0 → passed=True`(=初動・乗れる)。SPEC §1.4 の「>+25%=extended」とは **真逆**。`.passed` を extended フラグに誤用すると extended(過熱)が confirmed(緑)に反転 = Trust Cliff。`is_extended = (base_rise_pct is not None and base_rise_pct > THRESH)` の独立フラグに書き直し + None-preserve(M4)統合。**さらに extended 閾値を cup 流用の +25% でなく O'Neil 原典 pivot+5〜10% に③再キャリブレーション**(+25% だと pivot+20% 走った銘柄を clean breakout として default 表示 = 高値掴み誘導)。
   > → **本文反映済 (v2, 要 user レビュー)**: §1.4 を独立フラグ設計に全面書き換え(`.passed` 逆用回避を明記)+ None-preserve 統合。閾値は暫定 B案(`>10%`)を採用、design fork で A/B/C を ⚠️user確認(値は lock せず)。§9 表も更新。
3. **prior uptrend / stage filter 欠落(金融致命)**: §1.7 が prior uptrend を完全除外 → 下落途中の bear-market rally(戻り高値抜け=faulty base)を confirmed=緑で量産 → じっちゃま「落ちるナイフを掴むな」と正面衝突。追加 fetch ゼロで可能な軽量 stage filter(`pivotH > SMA50 かつ 50DMA 上向き`、or `close > SMA200`)を G1 に追加し③で検出数影響を再計測。激減するなら訴求を「新高値ブレイク」→「短期高値更新(地合い未確認)」に降格。
   > → **本文反映済 (v2, 要 user レビュー)**: §1.7 に G1b stage filter(`pivotH>SMA50 かつ 50DMA 上向き`)を G2 前段に追加 + design fork(SMA200 代替・訴求降格)を ⚠️user確認。検出数③再計測は実装時。
4. **vs_spy_excess の車輪の再発明(SSOT違反)**: `cron_rs_ratings`(L17042)が IBD式 `universe_percentile`(1-99)を `rs_ratings` table に nightly upsert 済(L13960 で /api/technical 併載済)。新規 vs_spy_excess は二重実装 + RS思想の劣化版(SPYをわずかに上回るだけ)。screener default を `rs_ratings.universe_percentile >= 70` JOIN に変更。
   > → **本文反映済 (v2, 要 user レビュー)**: §4.3 で payload から `vs_spy_excess` 削除、§6.1/§6.3 で `rs_ratings` JOIN + `universe_percentile>=70`(`min_percentile` param)に変更。閾値は ⚠️user確認(§8 論点)。
5. **StateCompass priceCell の breakout 読取経路欠落**: `StateCompass.jsx:117` は `cup_handle.state` のみ直読み。bo_* 改名 + 辞書追加しても `patterns.breakout` を読まないため永久に「判定なし」。`patterns.breakout?.state` を OR 評価し `classifyBreakoutZone` を呼ぶ経路 + cup/breakout 同時検出の優先順位を設計追記。
   > → **本文反映済 (v2, 要 user レビュー)**: §2.3.1(priceCell 分岐 jsx)+ §2.3.2(優先順位表)+ §2.3.3(`TECHNICAL_CANONICAL_PATTERNS` 追記)に反映。優先順位は ⚠️user確認。
6. **retest A先行 infra 不在(前提崩壊)**: ~~§12.1-3 の通り~~。
   > → **✅解消済 (commit 36d9ac8, 2026-06-16 deploy)**: `/api/scanner/retest` + ScreenerPane chip/section + StateCompass label + Premium gate を deploy。§0.4⑧ / §10 / §12.1-3 に反映済。decision⑧ の前提が真に。
7. **§2.5 good_alternative の自己矛盾**: §38-safe 模範文「強気シナリオでは上抜け水準の維持で上値余地」が新設 P2 regex に自らヒットし sanitize で消える。模範文を hedge+実績ベースに書き直し or P2 を negative lookahead で hedge 文脈除外(v124/v218 同型)。
   > → **本文反映済 (v2, 要 user レビュー)**: §2.5 で模範文を「実績の事実記述 + 判断指標とされる + 否定帰結」の3文に書き直し(Python 実測 hit=False 確認の旨を記載)。FE=BAD-10/BE=BAD-11 採番も正規化。
8. **bo_* 改名後の辞書到達不能**: 既存 `BUY_ZONE_LABEL_JP.breakout_extended` 等は cup namespace キー。bo_extended 改名で到達不能 → priceCell '—'(v219 同型)。bo_confirmed/bo_pending/bo_soft/bo_extended 専用エントリを §38-safe 文言で新設。§2.1/§2.2 の「既存キー流用」撤回。
   > → **本文反映済 (v2, 要 user レビュー)**: §2.1-B/§2.1-C(BUY_ZONE_LABEL_JP / COMPASS_PRICE_LABEL に bo_* 4エントリ新設)+ §2.2(BUY_ZONE_DESC_JP に bo_* 4エントリ新設)。「既存キー流用」撤回を明記。
9. **soft tier の §38 polarity 矛盾**: §1.8(polarity='up' 緑可)/ §4.1(中立・緑にしない)/ §2.4(soft 欠落)が SPEC 内で割れている。soft を **'neutral'(緑禁止・muted or「出来高やや不足 ×1.3」数値併記)** に確定、緑は confirmed(≥1.5x)のみ。
   > → **本文反映済 (v2, 要 user レビュー)**: §1.3/§1.8 polarity コメント / §2.4(bo_soft 行追加・muted)/ §4.1 / TL;DR §5 を「緑は confirmed のみ・soft=muted ×{vol_ratio} 併記」に統一。
10. **ユーザー可視ラベルの衝突**: `ScreenerPane.jsx:39 CUP_STATE_LABEL_JP` に cup 由来の「ブレイク確定/ブレイク待機/高値圏突破」が既存。新 breakout の「ブレイクアウト確認済み」が同画面で同名衝突 → 2秒判別不能(原則1違反)。breakout 語彙を cup の「ブレイク」から差別化(「新高値ブレイク」vs cup「ベース完成」)。
   > → **本文反映済 (v2, 要 user レビュー)**: §6.4 に別 dict `BREAKOUT_STATE_LABEL_JP`(「新高値ブレイク」等、`pattern_type==='breakout'` で分岐)を新設し cup と物理分離。語彙は ⚠️user確認(§8 論点)。

### 12.3 MAJOR(13件・実装前/実装時に解消、要点)
3 signal 同時表示の優先順位確定 / **avgVol50 三重定義の統一**(backend volumes[-50:]当日込 vs SPEC volumes[-51:-1] vs PriceLadder slice(-26) → `lib/volume.js` に当日除く50日で集約、chip倍率・バー強調・confirmed判定を物理一致)/ **B1 改名の伝播漏れ**(`_STATE_PRIORITY` L18817 / `_detect_signal_transitions` L16548 も旧 breakout_* 直参照)/ **masking 実態の乖離**(get_technical に plan gate 無し=cup_handle も全ユーザーに返している、Premium gate は frontend のみ。「既存同型・回帰ゼロ」前提が偽 → backend 物理除去は新規 plan 判定が必要)/ 出来高バー強調が confirmed(close>pivotH)と不一致 / vs_spy_excess 計算式未定義 / TECHNICAL_CANONICAL に breakout 追加で8コンポーネント cache key 一斉変動 / freshness assert の GHA 実装不能(単日閾値に simplify) / 副YAxis の右ラベル干渉(snap-*.mjs ドライラン要) / bo_soft ラベル/narration 欠落 / screener 0件の日の空状態UX / PriceLadder chip 3要素の狭幅折返し。

### 12.4 decision⑫(pending × tier)— **user 決裁待ち**
decision①(pending を §38-safe 非買いで出す)と ⑦(分類ラベル=Premium 物理除去)は **無料層で両立しない**(6体中5体が blocking/major)。発端の CPA が全Nで pending のため、Premium 物理除去だと「新高値ブレイクを肩代わり」訴求の核(pending を正直に見せる Trust Cliff 殺し)が **無料ユーザーに一切届かず CVR フックが死ぬ**。
**【合議推奨 = §11.3 m4 採用】** pending を **「無料 viz 側の中立 state 注記(色なし・例『日中上抜け/終値未確認』)」** として出し、Premium 分類ラベル(confirmed/soft/extended の確度判別 + screener一覧 + nightly push)とは別レイヤー化する。→ CPA デモが無料層で体験でき、Premium 付加価値は「確度の判別」に置く。**集客価値と Trust Cliff を左右するため user 決裁(decision⑫)で locked 化が必要**。
