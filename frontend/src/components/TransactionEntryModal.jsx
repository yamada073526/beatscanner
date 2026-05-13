import { useEffect, useMemo, useState } from 'react';
import { TRANSACTION_TYPES } from '../lib/transactions.js';
import { SUPPORTED_CURRENCIES } from '../lib/accounts.js';

/**
 * 取引登録 modal (Phase 2 v68)
 *
 * 7 type 対応: buy / sell / dividend / split / fee / deposit / withdraw
 * 必須項目は type 別 (TRANSACTION_TYPES の requiresShares / requiresTicker で分岐)
 *
 * 設計:
 * - 1 modal で 7 type を扱う「type selector + 動的フォーム」方式
 *   → 1 クリック減原則 (5 原則 #4)
 * - 通貨はデフォルト USD、後段で account.base_currency に追従させる
 *   (Phase 2.5: forex_rates が埋まったら自動 fx_rate 凍結)
 */

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const TYPE_HINT = {
  buy:      '購入: 株数 × 単価 + 手数料 が cost basis に加算',
  sell:     '売却: 移動平均 cost basis から (売却単価 - 平均) × 株数 を実現損益として記録',
  dividend: '配当: 1 株あたり配当額 × 受領株数 を実現損益に加算',
  split:    '分割: 分子 / 分母 で比率指定。例 10-for-1 → 株数 10、分母 1',
  fee:      '手数料: 単独手数料を実現損益から減算',
  deposit:  '入金: 現金残高に加算 (Phase 2.5 で表示)',
  withdraw: '出金: 現金残高から減算 (Phase 2.5 で表示)',
};

export default function TransactionEntryModal({
  open,
  onClose,
  accounts,
  defaultAccountId,
  defaultTicker,
  onAdd,            // (payload) => Promise<tx>
}) {
  const [type, setType] = useState('buy');
  const [accountId, setAccountId] = useState(defaultAccountId || '');
  const [ticker, setTicker] = useState(defaultTicker || '');
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [tradeDate, setTradeDate] = useState(todayISO());
  const [fee, setFee] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // open 時に default を反映
  useEffect(() => {
    if (open) {
      setType('buy');
      setAccountId(defaultAccountId || (accounts?.[0]?.id ?? ''));
      setTicker(defaultTicker || '');
      setShares('');
      setPrice('');
      setCurrency('USD');
      setTradeDate(todayISO());
      setFee('');
      setNote('');
      setError(null);
      setSubmitting(false);
    }
  }, [open, defaultAccountId, defaultTicker, accounts]);

  const spec = useMemo(
    () => TRANSACTION_TYPES.find((t) => t.value === type) || TRANSACTION_TYPES[0],
    [type]
  );

  if (!open) return null;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setError(null);
    if (!accountId) { setError('口座を選択してください'); return; }
    setSubmitting(true);
    try {
      await onAdd({
        account_id: accountId,
        type,
        ticker: spec.requiresTicker ? ticker : (ticker || null),
        shares: spec.requiresShares ? Number(shares) : (shares ? Number(shares) : null),
        price: Number(price),
        currency,
        trade_date: tradeDate,
        fee: fee === '' ? 0 : Number(fee),
        note: note || null,
      });
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="取引を登録"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'var(--surface-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            取引を登録
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            ×
          </button>
        </div>

        <Field label="種別">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={inputStyle}
          >
            {TRANSACTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <Hint>{TYPE_HINT[type]}</Hint>
        </Field>

        <Field label="口座">
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            style={inputStyle}
            required
          >
            <option value="" disabled>選択...</option>
            {(accounts || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.is_default ? ' (既定)' : ''}
              </option>
            ))}
          </select>
        </Field>

        {spec.requiresTicker && (
          <Field label="銘柄">
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="AAPL"
              style={inputStyle}
              required
            />
          </Field>
        )}

        {spec.requiresShares && (
          <Field label={type === 'split' ? '分子 (新株数)' : '株数'}>
            <input
              type="number"
              step="any"
              min="0"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              style={inputStyle}
              required
            />
          </Field>
        )}

        <Field label={
          type === 'split' ? '分母 (旧株数)' :
          type === 'dividend' ? '1 株あたり配当額' :
          type === 'fee' ? '手数料額' :
          type === 'deposit' ? '入金額' :
          type === 'withdraw' ? '出金額' :
          '単価'
        }>
          <input
            type="number"
            step="any"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            style={inputStyle}
            required
          />
        </Field>

        <Field label="通貨">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            style={inputStyle}
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>

        <Field label="取引日">
          <input
            type="date"
            value={tradeDate}
            onChange={(e) => setTradeDate(e.target.value)}
            style={inputStyle}
            required
          />
        </Field>

        {(type === 'buy' || type === 'sell' || type === 'dividend') && (
          <Field label="手数料 (任意)">
            <input
              type="number"
              step="any"
              min="0"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0"
              style={inputStyle}
            />
          </Field>
        )}

        <Field label="メモ (任意)">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder=""
            style={inputStyle}
          />
        </Field>

        {error && (
          <div style={{
            padding: '8px 12px',
            background: 'rgba(248, 113, 113, 0.10)',
            border: '1px solid rgba(248, 113, 113, 0.30)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-loss)',
            fontSize: 12,
          }}>
            {String(error)}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={btnSecondaryStyle}
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={btnPrimaryStyle}
          >
            {submitting ? '登録中...' : '登録'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-secondary)',
        letterSpacing: '0.04em',
      }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Hint({ children }) {
  return (
    <span style={{
      marginTop: 4,
      fontSize: 11,
      color: 'var(--text-muted)',
      lineHeight: 1.4,
    }}>
      {children}
    </span>
  );
}

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  background: 'var(--surface-input, rgba(255,255,255,0.04))',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontSize: 13,
};

const btnPrimaryStyle = {
  padding: '8px 16px',
  background: 'var(--text-primary)',
  color: 'var(--surface-card)',
  border: 'none',
  borderRadius: 'var(--radius-pill)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const btnSecondaryStyle = {
  padding: '8px 16px',
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-pill)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};
