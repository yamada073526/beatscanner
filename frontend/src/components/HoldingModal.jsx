import { useEffect, useMemo, useState } from 'react';

/**
 * 保有数 + 取得単価 入力モーダル (Holdings X-2 + 案A 加重平均モード)
 * - mode='direct': shares + avg_cost を直接上書き
 * - mode='add': 追加買付分 + 購入単価を入力 → 加重平均を自動計算して保存
 *   （current が無い場合は add モード非表示）
 * - 削除はどちらのモードでも可能
 * - 通貨は USD 固定
 */
export default function HoldingModal({
  isOpen,
  ticker,
  current,         // { ticker, shares, avg_cost } | null
  onClose,
  onSave,          // ({ shares, avgCost }) => Promise<void>
  onDelete,        // () => Promise<void>
}) {
  // 'direct' = 直接入力 / 'add' = 追加買付（加重平均）
  const [mode, setMode] = useState('direct');
  const [shares, setShares] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [addShares, setAddShares] = useState('');
  const [addPrice, setAddPrice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setMode('direct');
      setShares('');
      setAvgCost('');
      setAddShares('');
      setAddPrice('');
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
    setAddShares('');
    setAddPrice('');
    setErrorMsg('');
  }, [isOpen, current]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // 追加買付モードの加重平均プレビュー
  const addPreview = useMemo(() => {
    if (mode !== 'add' || !current) return null;
    const a = Number(addShares);
    const p = Number(addPrice);
    if (!Number.isFinite(a) || a <= 0 || !Number.isFinite(p) || p <= 0) return null;
    const cur = Number(current.shares);
    const curAvg = Number(current.avg_cost);
    if (!Number.isFinite(cur) || !Number.isFinite(curAvg)) return null;
    const newShares = cur + a;
    const newAvg = (cur * curAvg + a * p) / newShares;
    return { newShares, newAvg };
  }, [mode, current, addShares, addPrice]);

  if (!isOpen) return null;

  async function handleSave() {
    setErrorMsg('');
    let sharesNum;
    let avgCostNum;

    if (mode === 'add') {
      if (!current) {
        setErrorMsg('追加買付は既存の保有がある銘柄のみで使えます');
        return;
      }
      const a = Number(addShares);
      const p = Number(addPrice);
      if (!Number.isFinite(a) || a <= 0) {
        setErrorMsg('追加株数は 0 より大きい数値を入力してください');
        return;
      }
      if (!Number.isFinite(p) || p <= 0) {
        setErrorMsg('購入単価は 0 より大きい数値を入力してください');
        return;
      }
      const cur = Number(current.shares);
      const curAvg = Number(current.avg_cost);
      sharesNum = cur + a;
      avgCostNum = (cur * curAvg + a * p) / sharesNum;
    } else {
      sharesNum = Number(shares);
      avgCostNum = Number(avgCost);
      if (!Number.isFinite(sharesNum) || sharesNum <= 0) {
        setErrorMsg('保有数は 0 より大きい数値を入力してください');
        return;
      }
      if (!Number.isFinite(avgCostNum) || avgCostNum <= 0) {
        setErrorMsg('取得単価は 0 より大きい数値を入力してください');
        return;
      }
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

  const showAddTab = !!current;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel holding-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{ticker} の保有を{current ? '編集' : '入力'}</h2>
          <button onClick={onClose} className="modal-close" aria-label="閉じる">×</button>
        </div>

        <div className="modal-body">
          {showAddTab && (
            <div className="holding-mode-tabs" role="tablist" aria-label="入力モード">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'direct'}
                onClick={() => { setMode('direct'); setErrorMsg(''); }}
                className={`holding-mode-tab ${mode === 'direct' ? 'is-active' : ''}`}
                disabled={saving}
              >
                直接入力
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'add'}
                onClick={() => { setMode('add'); setErrorMsg(''); }}
                className={`holding-mode-tab ${mode === 'add' ? 'is-active' : ''}`}
                disabled={saving}
              >
                追加買付
              </button>
            </div>
          )}

          <div className="holding-form">
            {mode === 'direct' && (
              <>
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

                {current && (
                  <p className="holding-current-note">
                    現在の登録: {Number(current.shares).toLocaleString()} 株 @ ${Number(current.avg_cost).toFixed(2)}
                  </p>
                )}
              </>
            )}

            {mode === 'add' && current && (
              <>
                <label className="holding-field">
                  <span className="holding-label">追加株数</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    value={addShares}
                    onChange={(e) => setAddShares(e.target.value)}
                    placeholder="例: 50"
                    className="holding-input"
                    autoFocus
                    disabled={saving}
                  />
                </label>

                <label className="holding-field">
                  <span className="holding-label">購入単価 (USD)</span>
                  <div className="holding-input-prefixed">
                    <span className="holding-input-prefix">$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      value={addPrice}
                      onChange={(e) => setAddPrice(e.target.value)}
                      placeholder="例: 210.00"
                      className="holding-input holding-input-with-prefix"
                      disabled={saving}
                    />
                  </div>
                </label>

                <div className="holding-add-preview">
                  <div className="holding-add-row">
                    <span className="holding-add-row-label">現在</span>
                    <span className="holding-add-row-value">
                      {Number(current.shares).toLocaleString()} 株 @ ${Number(current.avg_cost).toFixed(2)}
                    </span>
                  </div>
                  <div className="holding-add-row">
                    <span className="holding-add-row-label">追加後</span>
                    <span className="holding-add-row-value">
                      {addPreview
                        ? <>{addPreview.newShares.toLocaleString()} 株 @ <strong>${addPreview.newAvg.toFixed(2)}</strong></>
                        : <span className="holding-add-row-placeholder">入力すると自動計算</span>}
                    </span>
                  </div>
                </div>
              </>
            )}

            {errorMsg && <p className="holding-error">{errorMsg}</p>}
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
            {saving ? '保存中...' : (mode === 'add' ? '追加して保存' : '保存')}
          </button>
        </div>
      </div>
    </div>
  );
}
