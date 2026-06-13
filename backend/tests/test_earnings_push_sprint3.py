"""決算 push MVP Sprint 3: 重複送信防止 dedup ヘルパーの単体テスト.

テスト対象:
  - _make_earnings_dedup_key: dedup キー生成 (fiscal_period / earnings_date フォールバック)
  - _is_earnings_already_dispatched: 送信前チェック (mock Supabase)
  - _record_earnings_dispatch: 送信後記録 (mock Supabase)

SPEC Sprint 3 完了判定基準:
  - 同一決算 (ticker × fiscal_period) で 2 度目の送信が skip されることを確認。
  - fiscal_period=None でも ticker × earnings_date で dedup が効く。
  - cup digest の dispatch 記録と名前空間が衝突しない (pattern_type='earnings_push' で分離)。
"""
import pytest
from unittest.mock import MagicMock, patch

from app.main import (
    _make_earnings_dedup_key,
    _is_earnings_already_dispatched,
    _record_earnings_dispatch,
)


# ─── _make_earnings_dedup_key テスト ────────────────────────────────────────


def test_dedup_key_uses_fiscal_period_when_available():
    """fiscal_period が提供されている場合はそれを dedup キーに使用する。"""
    key = _make_earnings_dedup_key("Q1 2025", "2025-01-30")
    assert key == "Q1 2025"


def test_dedup_key_falls_back_to_earnings_date_when_fiscal_period_is_none():
    """fiscal_period=None の場合は earnings_date にフォールバックする。"""
    key = _make_earnings_dedup_key(None, "2025-01-30")
    assert key == "2025-01-30"


def test_dedup_key_falls_back_to_earnings_date_when_fiscal_period_is_empty():
    """fiscal_period が空文字 (falsy) の場合も earnings_date にフォールバックする。"""
    key = _make_earnings_dedup_key("", "2025-01-30")
    assert key == "2025-01-30"


# ─── _is_earnings_already_dispatched テスト ─────────────────────────────────


def _make_mock_sb(has_record: bool) -> MagicMock:
    """Supabase service client のモックを作成するユーティリティ。"""
    mock_sb = MagicMock()
    mock_response = MagicMock()
    mock_response.data = [{"id": 1}] if has_record else []

    # chain: .table().select().eq().eq().eq().eq().limit().execute()
    mock_table = MagicMock()
    mock_sb.table.return_value = mock_table
    mock_select = MagicMock()
    mock_table.select.return_value = mock_select
    # eq チェーンを柔軟に返す
    mock_select.eq.return_value = mock_select
    mock_select.limit.return_value = mock_select
    mock_select.execute.return_value = mock_response

    return mock_sb


def test_is_already_dispatched_returns_true_when_record_exists():
    """送信済み記録がある場合 True を返す (= skip すべき)。"""
    mock_sb = _make_mock_sb(has_record=True)

    with patch("app.main._get_supabase_service", return_value=mock_sb):
        result = _is_earnings_already_dispatched(
            ticker="AAPL",
            fiscal_period="Q1 2025",
            earnings_date="2025-01-30",
        )

    assert result is True


def test_is_already_dispatched_returns_false_when_no_record():
    """送信済み記録がない場合 False を返す (= 送信を続行してよい)。"""
    mock_sb = _make_mock_sb(has_record=False)

    with patch("app.main._get_supabase_service", return_value=mock_sb):
        result = _is_earnings_already_dispatched(
            ticker="NVDA",
            fiscal_period="Q4 2024",
            earnings_date="2025-02-26",
        )

    assert result is False


def test_is_already_dispatched_uses_earnings_date_when_fiscal_period_none():
    """fiscal_period=None の場合、earnings_date を dedup キーとして使用する。"""
    mock_sb = _make_mock_sb(has_record=True)

    with patch("app.main._get_supabase_service", return_value=mock_sb):
        result = _is_earnings_already_dispatched(
            ticker="MSFT",
            fiscal_period=None,
            earnings_date="2025-04-30",
        )

    # 記録あり (fiscal_period=None → earnings_date フォールバックで dedup 効く)
    assert result is True
    # transition_type に earnings_date が渡されていることを確認
    mock_sb.table.assert_called_with("notification_dispatch_log")
    # eq が "2025-04-30" で呼ばれていることを確認
    call_args_list = mock_sb.table.return_value.select.return_value.eq.call_args_list
    eq_values = [call[0][1] for call in call_args_list]  # 第2引数 (value) を抽出
    assert "2025-04-30" in eq_values


def test_is_already_dispatched_returns_false_when_service_unavailable():
    """Supabase service client が None (未設定) の場合 False を返す (送信を続行)。"""
    with patch("app.main._get_supabase_service", return_value=None):
        result = _is_earnings_already_dispatched(
            ticker="TSLA",
            fiscal_period="Q2 2025",
            earnings_date="2025-07-23",
        )

    assert result is False


def test_is_already_dispatched_returns_false_on_exception():
    """DB アクセス例外発生時も False を返して送信を続行させる。"""
    mock_sb = MagicMock()
    mock_sb.table.side_effect = Exception("DB connection error")

    with patch("app.main._get_supabase_service", return_value=mock_sb):
        result = _is_earnings_already_dispatched(
            ticker="AMZN",
            fiscal_period="Q1 2025",
            earnings_date="2025-05-01",
        )

    assert result is False


# ─── _record_earnings_dispatch テスト ───────────────────────────────────────


def test_record_earnings_dispatch_inserts_with_correct_fields():
    """正常ケース: 正しいフィールドで dispatch_log に insert される。"""
    mock_sb = MagicMock()
    mock_insert = MagicMock()
    mock_sb.table.return_value.insert.return_value = mock_insert
    mock_insert.execute.return_value = MagicMock()

    with patch("app.main._get_supabase_service", return_value=mock_sb):
        _record_earnings_dispatch(
            ticker="AAPL",
            fiscal_period="Q1 2025",
            earnings_date="2025-01-30",
            user_id="test-user-uuid",
            status="sent",
        )

    mock_sb.table.assert_called_with("notification_dispatch_log")
    insert_payload = mock_sb.table.return_value.insert.call_args[0][0]

    # pattern_type で名前空間分離を確認 (cup_handle と衝突しない)
    assert insert_payload["pattern_type"] == "earnings_push"
    assert insert_payload["ticker"] == "AAPL"
    assert insert_payload["transition_type"] == "Q1 2025"   # fiscal_period がキー
    assert insert_payload["signal_date"] == "2025-01-30"
    assert insert_payload["status"] == "sent"
    assert insert_payload["user_id"] == "test-user-uuid"
    assert insert_payload["channel"] == "email"


def test_record_earnings_dispatch_uses_earnings_date_when_fiscal_period_none():
    """fiscal_period=None の場合、transition_type に earnings_date を格納する。"""
    mock_sb = MagicMock()
    mock_insert = MagicMock()
    mock_sb.table.return_value.insert.return_value = mock_insert
    mock_insert.execute.return_value = MagicMock()

    with patch("app.main._get_supabase_service", return_value=mock_sb):
        _record_earnings_dispatch(
            ticker="MSFT",
            fiscal_period=None,
            earnings_date="2025-04-30",
            user_id="test-user-uuid",
        )

    insert_payload = mock_sb.table.return_value.insert.call_args[0][0]
    assert insert_payload["transition_type"] == "2025-04-30"  # フォールバック


def test_record_earnings_dispatch_namespace_isolation_from_cup():
    """pattern_type='earnings_push' で cup_handle の dedup に影響しないことを確認。"""
    mock_sb = MagicMock()
    mock_insert = MagicMock()
    mock_sb.table.return_value.insert.return_value = mock_insert
    mock_insert.execute.return_value = MagicMock()

    with patch("app.main._get_supabase_service", return_value=mock_sb):
        _record_earnings_dispatch(
            ticker="NVDA",
            fiscal_period="Q4 2024",
            earnings_date="2025-02-26",
            user_id="test-user-uuid",
        )

    insert_payload = mock_sb.table.return_value.insert.call_args[0][0]
    # cup は pattern_type='cup_handle'、本機能は 'earnings_push' → 衝突なし
    assert insert_payload["pattern_type"] == "earnings_push"
    assert insert_payload["pattern_type"] != "cup_handle"


def test_record_earnings_dispatch_does_not_raise_on_service_unavailable():
    """Supabase service client が None でも例外を raise しない。"""
    with patch("app.main._get_supabase_service", return_value=None):
        # 例外が raise されないことを確認
        _record_earnings_dispatch(
            ticker="TSLA",
            fiscal_period="Q2 2025",
            earnings_date="2025-07-23",
            user_id="test-user-uuid",
        )


def test_record_earnings_dispatch_does_not_raise_on_insert_exception():
    """insert 失敗時も例外を raise せず cron が継続できる。"""
    mock_sb = MagicMock()
    mock_sb.table.side_effect = Exception("DB connection error")

    with patch("app.main._get_supabase_service", return_value=mock_sb):
        # 例外が raise されないことを確認
        _record_earnings_dispatch(
            ticker="AMZN",
            fiscal_period="Q1 2025",
            earnings_date="2025-05-01",
            user_id="test-user-uuid",
        )


# ─── 統合シナリオ: 同一決算の 2 度送信が skip される ────────────────────────


def test_dedup_flow_second_dispatch_is_skipped():
    """統合シナリオ: 1 回目送信後に is_already_dispatched が True になる。

    Sprint 5 cron の呼び出し順をシミュレート:
      1. is_already_dispatched → False (初回)
      2. _record_earnings_dispatch でログ挿入
      3. is_already_dispatched → True (2 度目 = skip)

    実際の DB は使わず mock で dispatch_log への影響をシミュレートする。
    """
    TICKER = "AAPL"
    FISCAL_PERIOD = "Q1 2025"
    EARNINGS_DATE = "2025-01-30"
    USER_ID = "test-user-uuid"

    # Step 1: 初回チェック → 未送信 (False)
    mock_sb_initial = _make_mock_sb(has_record=False)
    with patch("app.main._get_supabase_service", return_value=mock_sb_initial):
        first_check = _is_earnings_already_dispatched(TICKER, FISCAL_PERIOD, EARNINGS_DATE)
    assert first_check is False, "初回チェックは False (未送信) であるべき"

    # Step 2: 送信後に dispatch_log にレコードを記録
    mock_sb_record = MagicMock()
    mock_insert = MagicMock()
    mock_sb_record.table.return_value.insert.return_value = mock_insert
    mock_insert.execute.return_value = MagicMock()
    with patch("app.main._get_supabase_service", return_value=mock_sb_record):
        _record_earnings_dispatch(TICKER, FISCAL_PERIOD, EARNINGS_DATE, USER_ID)

    # Step 3: 2 度目のチェック → 送信済み (True) → skip すべき
    mock_sb_second = _make_mock_sb(has_record=True)
    with patch("app.main._get_supabase_service", return_value=mock_sb_second):
        second_check = _is_earnings_already_dispatched(TICKER, FISCAL_PERIOD, EARNINGS_DATE)
    assert second_check is True, "2 度目のチェックは True (送信済み) であるべき → skip される"
