import { useMemo, useState } from 'react';
import { TRANSACTION_TYPE_LABEL } from '../lib/transactions.js';
import { ACCOUNT_TYPE_LABEL } from '../lib/accounts.js';

/**
 * 取引履歴 viewer + 削除 modal (Phase 2.5 v68)
 *
 * 設計:
 * - useTransactions の transactions 配列を新しい順 (trade_date desc) で表示
 * - 行: 日付 / 種別 / 銘柄 / 株数 / 単価 / 通貨 / 口座
 * - 削除 button: confirm 後 onDelete (useTransactions.removeTransaction) を呼ぶ
 *   - 楽観的更新 + window event 経由で他 instance が即同期
 * - account filter: selectedAccountId が null = 全口座 rollup、特定 = 絞り込み
 * - 編集 (update) は Phase 3 で別途実装。MVP は delete + 再登録で代替
 */

function fmtDate(d) {
  if (!d) return '—';
  // YYYY-MM-DD or ISO → YYYY/MM/DD
  const s = String(d).slice(0, 10);
  return s.replace(/-/g, '/');
}

function fmtNumber(n, digits = 4) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return x.toLocaleString('en-US', { maximumFractionDigits: digits });
}

const TYPE_COLOR = {
  buy: 'var(--color-gain)',
  sell: 'var(--color-loss)',
  dividend: 'var(--color-warning)',
  split: 'var(--text-secondary)',
  fee: 'var(--text-muted)',
  deposit: 'var(--text-secondary)',
  withdraw: 'var(--text-secondary)',
};

export default function TransactionHistoryModal({
  open,
  onClose,
  transactions,
  accounts,
  selectedAccountId,
  onDelete,
}) {
  const [deletingId, setDeletingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState(null);

  const accountMap = useMemo(() => {
    const m = {};
    for (const a of accounts || []) m[a.id] = a;
    return m;
  }, [accounts]);

  const sortedRows = useMemo(() => {
    const list = Array.isArray(transactions) ? [...transactions] : [];
    const filtered = selectedAccountId
      ? list.filter((t) => t.account_id === selectedAccountId)
      : list;
    // trade_date desc, created_at desc tie-breaker
    filtered.sort((a, b) => {
      const ad = String(a.trade_date || '');
      const bd = String(b.trade_date || '');
      if (ad !== bd) return ad < bd ? 1 : -1;
      const ac = String(a.created_at || '');
      const bc = String(b.created_at || '');
      return ac < bc ? 1 : ac > bc ? -1 : 0;
    });
    return filtered;
  }, [transactions, selectedAccountId]);

  if (!open) return null;

  const handleDelete = async (txId) => {
    setError(null);
    setDeletingId(txId);
    try {
      await onDelete(txId);
      setConfirmId(null);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="取引履歴"
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
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          maxHeight: '90vh',
          boxShadow: 'var(--shadow-4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            取引履歴
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--text-muted)',
              marginLeft: 8,
            }}>
              {sortedRows.length} 件
              {selectedAccountId && accountMap[selectedAccountId]
                ? ` · ${accountMap[selectedAccountId].name}`
                : ''}
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: 18,
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            ×
          </button>
        </div>

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

        {sortedRows.length === 0 ? (
          <div style={{
            padding: '40px 12px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 13,
          }}>
            該当する取引履歴がありません。
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {sortedRows.map((tx) => {
              const isConfirm = confirmId === tx.id;
              const isDeleting = deletingId === tx.id;
              const acc = accountMap[tx.account_id];
              const typeColor = TYPE_COLOR[tx.type] || 'var(--text-primary)';
              return (
                <div
                  key={tx.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(80px, auto) 60px minmax(60px, auto) 1fr auto auto',
                    gap: 10,
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 12,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>
                    {fmtDate(tx.trade_date)}
                  </span>
                  <span style={{
                    color: typeColor,
                    fontWeight: 700,
                    fontSize: 11,
                  }}>
                    {TRANSACTION_TYPE_LABEL[tx.type] || tx.type}
                  </span>
                  <span style={{
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                  }}>
                    {tx.ticker || '—'}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {tx.shares != null ? `${fmtNumber(tx.shares)} 株` : '—'}
                    {' × '}
                    {tx.price != null ? `${tx.currency || ''} ${fmtNumber(tx.price, 2)}` : '—'}
                    {acc ? <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                      ({acc.name})
                    </span> : null}
                  </span>
                  {isConfirm ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDelete(tx.id)}
                        disabled={isDeleting}
                        style={{
                          padding: '4px 8px',
                          background: 'var(--color-loss)',
                          color: 'var(--bg-card)',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {isDeleting ? '削除中...' : '削除'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        disabled={isDeleting}
                        style={{
                          padding: '4px 8px',
                          background: 'transparent',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        キャンセル
                      </button>
                    </>
                  ) : (
                    <>
                      <span />
                      <button
                        type="button"
                        onClick={() => setConfirmId(tx.id)}
                        title="この取引を削除"
                        aria-label="この取引を削除"
                        style={{
                          padding: '4px 8px',
                          background: 'transparent',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        削除
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          lineHeight: 1.5,
        }}>
          編集は Phase 3 で実装予定。誤入力は削除 → 再登録で訂正してください。
        </div>
      </div>
    </div>
  );
}
