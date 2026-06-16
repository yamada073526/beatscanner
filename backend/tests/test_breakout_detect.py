"""breakout (新高値ブレイク) 検出の golden-case 回帰テスト。

SPEC_2026-06-16_breakout-signal §1。cup_handle / resistance_retest と直交する第3の網
(_detect_breakout) を、合成 OHLCV 配列で各分岐を pin する決定論テスト (LLM 不使用)。

検出は「直近 N 日 intraday 高値 (pivotH、当日除く) を出来高を伴って終値で抜けた事実」だけを
見る。confirmed (vol>=1.5x) のみ polarity="up"、soft/pending/extended は "neutral"。
出来高なし上抜け (vol<1.3x) は bo_low_vol を返さず detected=False (false breakout を signal 化しない)。

各 case は最小の合成配列で branch を踏めばよい (CPA 厳密再現は不要)。
"""
from app.main import _detect_breakout, _is_new_52w_high, _pivot_high


def _base(n=70, slope=0.3, start=100.0):
    """緩やかな上昇トレンド (SMA50 上向き保証) の n 日 OHLCV を生成。

    closes は start から slope/day で単調増加 → _compute_sma(closes, 50) は上向き、
    pivotH(直近高値) は SMA50 を上回る → G1b stage filter を pass する土台。
    当日 (末尾) は各 test で個別に上書きして分岐を踏む。
    """
    closes = [start + slope * i for i in range(n)]
    highs = [c + 0.5 for c in closes]
    lows = [c - 0.5 for c in closes]
    vols = [1000.0] * n
    return closes, highs, lows, vols


# ─── _pivot_high / _is_new_52w_high 単体 ───────────────────────────────────────

def test_pivot_high_excludes_today():
    # window = highs[-(N+1):-1] = 当日を除いた直前 N 本の最大。
    highs = [10.0] * 19 + [50.0] + [99.0]  # 末尾=当日(99) は除外、直前20本の最大は 50
    assert _pivot_high(highs, 20) == 50.0


def test_pivot_high_insufficient_window():
    # len(window) < N → None
    assert _pivot_high([10.0] * 5, 20) is None


def test_is_new_52w_high_returns_2tuple():
    # SPEC §1.6 更新: (is_high: bool, prior_252w_high: float|None) の 2-tuple を返す。
    closes, highs, _lows, _vols = _base()
    res = _is_new_52w_high(highs, closes)
    assert isinstance(res, tuple)
    assert len(res) == 2
    is_high, prior = res
    assert isinstance(is_high, bool)
    assert prior is None or isinstance(prior, (int, float))


def test_is_new_52w_high_true_when_close_exceeds_prior():
    closes, highs, _lows, _vols = _base()
    closes[-1] = max(highs[:-1]) + 5.0   # 終値が直前の全 intraday 高値を超える
    highs[-1] = closes[-1] + 1.0
    is_high, prior = _is_new_52w_high(highs, closes)
    assert is_high is True
    assert isinstance(prior, (int, float))


# ─── _detect_breakout 各 state 分岐 ────────────────────────────────────────────

def test_bo_confirmed():
    # close > pivotH かつ vol >= 1.5x、地合い OK、stage filter pass → bo_confirmed / polarity up
    closes, highs, lows, vols = _base()
    pv = _pivot_high(highs, 20)
    closes[-1] = pv + 1.0
    highs[-1] = pv + 2.0
    vols[-1] = 1500.0   # avgVol50 = mean(vols[-51:-1]) = 1000 → ratio 1.5
    r = _detect_breakout([], highs, lows, closes, vols, True)
    assert r["detected"] is True
    assert r["state"] == "bo_confirmed"
    assert r["tier"] == "confirmed"
    assert r["polarity"] == "up"
    assert r["volume_ratio"] >= 1.5
    assert r["window"] in (20, 40)
    assert r["pivot_high"] == pv
    assert r["is_extended"] is False   # base_rise < 10% → confirmed が extended に化けない


def test_bo_soft():
    # vol 1.3–1.49x → bo_soft / neutral (緑禁止)
    closes, highs, lows, vols = _base()
    pv = _pivot_high(highs, 20)
    closes[-1] = pv + 1.0
    highs[-1] = pv + 2.0
    vols[-1] = 1400.0   # 1.4x
    r = _detect_breakout([], highs, lows, closes, vols, True)
    assert r["detected"] is True
    assert r["state"] == "bo_soft"
    assert r["tier"] == "soft"
    assert r["polarity"] == "neutral"


def test_bo_pending():
    # today_high > pivotH かつ today_close <= pivotH (CPA 型、引け失速) → bo_pending / neutral
    closes, highs, lows, vols = _base()
    pv = _pivot_high(highs, 20)
    highs[-1] = pv + 2.0     # ザラ場で pivot 上抜け
    closes[-1] = pv - 0.5    # 引けで割り込み (<= pivotH)
    vols[-1] = 1470.0        # CPA 型 vmult ~1.47x
    r = _detect_breakout([], highs, lows, closes, vols, True)
    assert r["detected"] is True
    assert r["state"] == "bo_pending"
    assert r["tier"] == "pending"
    assert r["polarity"] == "neutral"


def test_bo_extended_overrides_confirmed():
    # base_rise > 10% で confirmed が bo_extended に上書きされる (優先: extended > confirmed)
    closes, highs, lows, vols = _base()
    pv = _pivot_high(highs, 20)
    closes[-1] = round(pv * 1.12, 2)   # pivotH より +12%
    highs[-1] = closes[-1] + 1.0
    vols[-1] = 1500.0                  # 1.5x (本来 confirmed)
    r = _detect_breakout([], highs, lows, closes, vols, True)
    assert r["detected"] is True
    assert r["state"] == "bo_extended"
    assert r["tier"] == "extended"
    assert r["polarity"] == "neutral"   # extended は緑禁止
    assert r["is_extended"] is True
    assert r["base_rise_pct"] > 10.0


# ─── detected:False (signal 化しない) 分岐 ──────────────────────────────────────

def test_low_vol_not_detected():
    # close > pivotH だが vol < 1.3x → bo_low_vol を返さず detected:False (false breakout 抑止)
    closes, highs, lows, vols = _base()
    pv = _pivot_high(highs, 20)
    closes[-1] = pv + 1.0
    highs[-1] = pv + 2.0
    vols[-1] = 1100.0   # 1.1x (< SOFT_VOL 1.3)
    r = _detect_breakout([], highs, lows, closes, vols, True)
    assert r["detected"] is False
    assert r["tier"] is None
    # bo_low_vol のような state を捏造しない
    assert r["state"] == "breakout"


def test_g0_insufficient_history():
    # G0: n < 60 → detected:False
    closes, highs, lows, vols = _base(n=50)
    pv = _pivot_high(highs, 20)
    closes[-1] = pv + 1.0
    highs[-1] = pv + 2.0
    vols[-1] = 1500.0
    r = _detect_breakout([], highs, lows, closes, vols, True)
    assert r["detected"] is False


def test_g1b_drop_when_50dma_down():
    # G1b: 50DMA 下向き (下降トレンド) → pivotH が SMA50 を割る / slope 下向きで stage filter drop
    closes = [130.0 - 0.3 * i for i in range(70)]   # 単調下降
    highs = [c + 0.5 for c in closes]
    lows = [c - 0.5 for c in closes]
    vols = [1000.0] * 70
    pv = _pivot_high(highs, 20)
    closes[-1] = pv + 1.0
    highs[-1] = pv + 2.0
    vols[-1] = 1500.0
    r = _detect_breakout([], highs, lows, closes, vols, True)
    assert r["detected"] is False


def test_g1_market_weak_excluded():
    # G1: spy_uptrend is False (SPY 200DMA 割れ) → 落ちるナイフ回避で detected:False
    closes, highs, lows, vols = _base()
    pv = _pivot_high(highs, 20)
    closes[-1] = pv + 1.0
    highs[-1] = pv + 2.0
    vols[-1] = 1500.0
    r = _detect_breakout([], highs, lows, closes, vols, False)
    assert r["detected"] is False


def test_g1_market_unknown_graceful_pass():
    # G1: spy_uptrend is None (SPY fetch 失敗) は weak 扱いせず通す (graceful degrade)
    closes, highs, lows, vols = _base()
    pv = _pivot_high(highs, 20)
    closes[-1] = pv + 1.0
    highs[-1] = pv + 2.0
    vols[-1] = 1500.0
    r = _detect_breakout([], highs, lows, closes, vols, None)
    assert r["detected"] is True
    assert r["market_uptrend"] is None


# ─── §1.8 返却 dict のキー網羅 ─────────────────────────────────────────────────

def test_return_dict_keys_match_spec_1_8():
    closes, highs, lows, vols = _base()
    pv = _pivot_high(highs, 20)
    closes[-1] = pv + 1.0
    highs[-1] = pv + 2.0
    vols[-1] = 1500.0
    r = _detect_breakout([], highs, lows, closes, vols, True)
    expected_keys = {
        "detected", "state", "tier", "polarity", "window", "pivot_high",
        "close", "volume_ratio", "volume_threshold", "is_new_52w_high",
        "is_extended", "base_rise_pct", "sma50_deviation_pct",
        "market_uptrend", "levels",
    }
    assert expected_keys.issubset(set(r.keys()))
    assert r["volume_threshold"] == 1.5
    assert isinstance(r["is_new_52w_high"], bool)   # 2-tuple の bool 部のみが dict に入る
    assert isinstance(r["levels"], list)
    assert r["levels"][0]["kind"] == "pivot_high"


def test_levels_includes_52w_high_when_new():
    # is_new_52w_high True のとき levels に high_52w エントリが追加される
    closes, highs, lows, vols = _base()
    # 当日 close が直近全 high を超える → 52週高値更新 + confirmed
    new_high = max(highs[:-1]) + 5.0
    closes[-1] = new_high
    highs[-1] = new_high + 1.0
    vols[-1] = 1500.0
    r = _detect_breakout([], highs, lows, closes, vols, True)
    assert r["detected"] is True
    assert r["is_new_52w_high"] is True
    kinds = [lv["kind"] for lv in r["levels"]]
    assert "high_52w" in kinds


if __name__ == "__main__":
    # pytest 不在環境でも動かせる最小 runner
    import sys
    funcs = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in funcs:
        try:
            fn()
            print(f"PASS {fn.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL {fn.__name__}: {e}")
        except Exception as e:
            failed += 1
            print(f"ERROR {fn.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(funcs) - failed}/{len(funcs)} passed")
    sys.exit(1 if failed else 0)
