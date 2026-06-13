"""cup dedup 名前空間 filter のテスト (multi-review 6体 verdict 2026-06-13).

決算 push MVP の design gate (Sprint 4/5 着手前 6体合議) で、既存 cup
`_is_already_dispatched` が pattern_type フィルタを持たず、notification_dispatch_log を
共有する earnings_push / article 行と「transition_type 値の偶然 disjoint」でしか
分離されていない点を指摘 (Anthropic engineer + Web設計 + QA の 3体が堅牢化を推奨)。

behavior-preserving な明示 filter (.eq("pattern_type", "cup_handle")) を追加した。
cup の insert は常に pattern_type='cup_handle' のため、既存データは全て match し
結果は不変。除外されるのは他種 (earnings_push 等) の行のみ。article dedup
(pattern_type='article' を既に filter) と一貫し、複合 index
(user_id, ticker, pattern_type, transition_type, signal_date) を完全活用する。
"""
from unittest.mock import MagicMock, patch

from app.main import _is_already_dispatched


def _make_mock_sb(has_record: bool) -> MagicMock:
    """Supabase service client のモック。

    chain: .table().select().eq()....gte().eq().limit().execute()
    eq / gte / limit は自身を返し、execute で response を返す。
    """
    mock_sb = MagicMock()
    mock_response = MagicMock()
    mock_response.data = [{"id": 1}] if has_record else []

    mock_table = MagicMock()
    mock_sb.table.return_value = mock_table
    mock_select = MagicMock()
    mock_table.select.return_value = mock_select
    mock_select.eq.return_value = mock_select
    mock_select.gte.return_value = mock_select
    mock_select.limit.return_value = mock_select
    mock_select.execute.return_value = mock_response

    return mock_sb


def test_cup_dedup_filters_pattern_type_cup_handle():
    """cup _is_already_dispatched が pattern_type='cup_handle' を明示 filter する。

    名前空間分離を「transition_type 値の偶然 disjoint」でなく「明示 filter」で保証
    (multi-review 6体 verdict 2026-06-13、article dedup と一貫)。
    """
    mock_sb = _make_mock_sb(has_record=True)
    with patch("app.main._get_supabase_service", return_value=mock_sb):
        result = _is_already_dispatched(
            user_id="user-123",
            ticker="AAPL",
            transition_type="formation_to_breakout_pending",
        )
    assert result is True
    # eq 呼出しに ("pattern_type", "cup_handle") が含まれることを確認
    eq_calls = mock_sb.table.return_value.select.return_value.eq.call_args_list
    eq_pairs = [(c[0][0], c[0][1]) for c in eq_calls]
    assert ("pattern_type", "cup_handle") in eq_pairs, (
        f"cup dedup に pattern_type='cup_handle' filter が無い: {eq_pairs}"
    )


def test_cup_dedup_returns_false_when_no_record():
    """cup の未送信 (記録なし) では False (= 送信続行)。behavior-preserving 確認。"""
    mock_sb = _make_mock_sb(has_record=False)
    with patch("app.main._get_supabase_service", return_value=mock_sb):
        result = _is_already_dispatched(
            user_id="user-123",
            ticker="MSFT",
            transition_type="breakout_pending_to_confirmed",
        )
    assert result is False


def test_cup_dedup_returns_false_when_service_unavailable():
    """service client None なら False (送信続行)。既存挙動の回帰確認。"""
    with patch("app.main._get_supabase_service", return_value=None):
        result = _is_already_dispatched(
            user_id="user-123",
            ticker="TSLA",
            transition_type="formation_to_breakout_pending",
        )
    assert result is False
