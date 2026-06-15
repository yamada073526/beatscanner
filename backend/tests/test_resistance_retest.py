"""resistance_retest (旧レジスタンス・リテスト水準) 検出の golden-case 回帰テスト。

SPEC_2026-06-15_resistance-retest。じっちゃま 2026-06-13 ライブの NVDA/AAPL/GOOG/AVGO +
崩れ銘柄を、本番 /api/technical の実測値(2026-06-15)で固めた決定論テスト(LLM 不使用)。

検出は box_support(role=resistance_turned_support)を主語に、直近高値(cup pivot)からの
押し戻し率 retracement_pct = (pivot - 現在値)/(pivot - band_high) で 3段判定:
  deep >= 50% / shallow 30-50% / 非該当。pivot 不在(cup未検出=GOOG型)は非該当。

※当初 SPEC §1.2 の帯内(band_high→band_low)retracement は role の定義上 today>band_high で
常時負になり破綻 → pivot 基準に修正。C1b(高値圏ガード)は 0.85 が NVDA(0.824)/AAPL(0.829)を
誤除外したため 0.70 に校正(崩れ除外は role が担う)。
"""
from app.main import _detect_resistance_retest


def _bs(level, bl, bh, touch, role="resistance_turned_support"):
    return {
        "level": level, "band_low": bl, "band_high": bh, "touch_count": touch,
        "role": role, "strength": "strong" if touch >= 4 else "moderate",
    }


def _ch(pivot):
    return {"pivot": {"price": pivot}} if pivot else {"detected": False}


def _run(current, ath, box, cup):
    # closes[-1]=現在値、max(highs[-252:])=52週高値 のみ使用
    return _detect_resistance_retest([], [ath] * 300, [], [current], box, cup)


# --- じっちゃま 6/13 ライブの 4 銘柄(実測値) ---

def test_nvda_deep():
    r = _run(205.19, 236.54, _bs(194.84, 191.92, 197.76, 9), _ch(224.32))
    assert r["detected"] is True
    assert r["approach_level"] == "deep"
    assert r["retracement_pct"] >= 50.0


def test_aapl_shallow():
    r = _run(291.13, 317.40, _bs(263.12, 259.17, 267.06, 10), _ch(305.64))
    assert r["detected"] is True
    assert r["approach_level"] == "shallow"
    assert 30.0 <= r["retracement_pct"] < 50.0


def test_goog_no_pivot_excluded():
    # cup 未検出 = pivot なし → 非該当。公募価格$355.19 を support 救済しない(§38、user承認2026-06-15)。
    r = _run(358.16, 360.0, _bs(322.87, 318.03, 327.72, 6), _ch(None))
    assert r["detected"] is False


def test_avgo_no_pivot_excluded():
    # AVGO: role は resistance_turned_support だが cup pivot 不在 → 非該当(じっちゃま「割り込み」と同じ outcome)
    r = _run(335.0, 360.0, _bs(326.74, 321.84, 331.64, 6), _ch(None))
    assert r["detected"] is False


# --- ガード群 ---

def test_band_low_break_excluded():
    # サポート割れ(band_low を 0.5% 超下回る) → 除外。pivot ありでも。
    r = _run(190.0, 236.54, _bs(194.84, 191.92, 197.76, 9), _ch(224.32))
    assert r["detected"] is False


def test_overhead_resistance_excluded():
    # role != resistance_turned_support(崩れ: PLTR/TSLA 型) → 非該当
    r = _run(150.0, 236.54, _bs(161.99, 159.5, 164.5, 5, role="overhead_resistance"), _ch(180))
    assert r["detected"] is False


def test_touch_below_5_excluded():
    # 帯が未成熟(touch < 5、O'Neil「5回以上は本物」/ frontend boxSupport gate と統一) → 非該当
    r = _run(205.19, 236.54, _bs(194.84, 191.92, 197.76, 4), _ch(224.32))
    assert r["detected"] is False


def test_market_weak_excluded():
    # SPY 下降トレンド(cup_handle.market_context="weak") → 落ちてくるナイフ回避で非該当
    cup = {"pivot": {"price": 224.32}, "market_context": "weak"}
    r = _run(205.19, 236.54, _bs(194.84, 191.92, 197.76, 9), cup)
    assert r["detected"] is False


def test_too_high_not_pulled_back():
    # まだ高値圏(retracement < 30%) → 非該当
    r = _run(220.0, 236.54, _bs(194.84, 191.92, 197.76, 9), _ch(224.32))
    assert r["detected"] is False


def test_dead_cat_below_70pct_excluded():
    # level が 52週高値の 70% 未満(崩落後の dead-cat) → soft backstop で除外
    r = _run(150.0, 300.0, _bs(160.0, 158.0, 162.0, 9), _ch(180.0))
    assert r["detected"] is False


def test_zero_div_and_pivot_at_band_guard():
    # pivot <= band_high(構造不整合 / denom 0 回避) → 非該当(500 にしない)
    r = _run(200.0, 236.54, _bs(195.0, 195.0, 195.0, 5), _ch(195.0))
    assert r["detected"] is False


def test_kmi_band_high_too_far_excluded():
    # KMI 実測(2026-06-16 本番 curl): retracement 40.8% は shallow 帯内だが、現在値(~31.46)が
    # 旧抵抗帯上限 band_high(26.45)より 18.9% 上 = リテスト水準まで遠く「接近」とは呼べない。
    # retracement だけでは帯幅の相対スケールで誤検出する KMI 型を dBHi<=10% gate で物理 drop。
    # Phase-gate 6体合議 + 完全性クリティック発見(narration 虚偽相当=景表法§5)。
    r = _run(31.46, 35.0, _bs(26.06, 25.67, 26.45, 8), _ch(34.91))
    assert r["detected"] is False


def test_dbhi_within_gate_still_detected():
    # 逆: dBHi<=10% の正常な接近 (NVDA 型 today=band_high*1.05) は引き続き検出されること
    # (gate が deep/shallow を過剰除外していない回帰)。
    r = _run(207.9, 236.54, _bs(194.84, 191.92, 197.76, 9), _ch(224.32))
    assert r["detected"] is True


def test_no_box_support():
    r = _run(205.19, 236.54, None, _ch(224.32))
    assert r["detected"] is False
