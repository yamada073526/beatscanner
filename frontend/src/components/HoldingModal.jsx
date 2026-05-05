import { useEffect, useState } from 'react';

/**
 * 保有数 + 取得単価 入力モーダル (Holdings X-2)
 * - 既存 holding がある場合は値を pre-fill + 削除ボタン表示
 * - 通貨は USD 固定（米国株専用）
 */
export default function HoldingModal({
  isOpen,
  ticker,
  current,         // { ticker, shares, avg_cost } | null
  onClose,
  onSave,          // ({ shares, avgCost }) => Promise<void>
  onDelete,        // () => Promise<void>
}) {
  const [shares, setShares] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShares('');
      setAvgCost('');
      setErrorMsg('');
      setSaving(false);
      setPendingDelete(false);
      return;
    }
    if (current) {
      setShares(String(current.shares ?? ''));
      setAvgCost(String(current.avg_cost ?? ''));
    } else {
      setShares('');
      setAvgCost('');
    }
  }, [isOpen, current]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleSave() {
    setErrorMsg('');
    const sharesNum = Number(shares);
    const avgCostNum = Number(avgCost);
    if (!Number.isFinite(sharesNum) || sharesNum <= 0) {
      setErrorMsg('保有数は 0 より大きい数値を入力してください');
      return;
    }
    if (!Number.isFinite(avgCostNum) || avgCostNum <= 0) {
      setErrorMsg('取得単価は 0 より大きい数値を入力してください');
      return;
    }
    setSaving(true);
    try {
      await onSave({ shares: sharesNum, avgCost: avgCostNum });
      onClose();
    } catch (e) {
      setErrorMsg(e?.message || '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setErrorMsg('');
    setSaving(true);
    try {
      await onDelete();
      onClose();
    } catch (e) {
      setErrorMsg(e?.message || '削除に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel holding-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{ticker} の保有を{current ? '編集' : '入力'}</h2>
          <button onClick={onClose} className="modal-close" aria-label="閉じる">×</button>
        </div>

        <div className="modal-body">
          <div className="holding-form">
            <label className="holding-field">
              <span className="holding-label">保有数</span>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="例: 100"
                className="holding-input"
                autoFocus
                disabled={saving}
              />
            </label>

            <label className="holding-field">
              <span className="holding-label">取得単価 (USD)</span>
              <div className="holding-input-prefixed">
                <span className="holding-input-prefix">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={avgCost}
                  onChange={(e) => setAvgCost(e.target.value)}
                  placeholder="例: 189.50"
                  className="holding-input holding-input-with-prefix"
                  disabled={saving}
                />
              </div>
            </label>

            {errorMsg && <p className="holding-error">{errorMsg}</p>}

            {current && (
              <p className="holding-current-note">
                現在の登録: {Number(current.shares).toLocaleString()} 株 @ ${Number(current.avg_cost).toFixed(2)}
              </p>
            )}
          </div>
        </div>

        <div className="modal-footer holding-footer">
          {current && !pendingDelete && (
            <button
              type="button"
              onClick={() => setPendingDelete(true)}
              className="btn-danger-ghost"
              disabled={saving}
            >
              削除
            </button>
          )}
          {current && pendingDelete && (
            <div className="holding-delete-confirm">
              <span>本当に削除しますか？</span>
              <button
                type="button"
                onClick={handleDelete}
                className="btn-danger"
                disabled={saving}
              >
                削除する
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(false)}
                className="btn-ghost"
                disabled={saving}
              >
                キャンセル
              </button>
            </div>
          )}
          <div className="holding-footer-spacer" />
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost"
            disabled={saving}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn-primary"
            disabled={saving || pendingDelete}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
