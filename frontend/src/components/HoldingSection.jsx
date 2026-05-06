import { useEffect, useMemo, useState } from 'react';

/**
 * 保有数 + 取得単価 入力セクション (案 D — TagAssignSheet 内に inline 配置)
 *
 * holdings 有無で UI 分岐:
 * - holdings なし (初回): 「保有数 + 取得単価」のみのシンプルフォーム
 * - holdings あり: タブ切替「追加買付 (デフォルト) / 直接編集」、削除ボタン併設
 *
 * 用語ルール:
 * - 取得単価: 加重平均後の最終単価 (DB 保存対象)
 * - 購入価格: 1 回の追加買付の単価 (一時入力)
 * - 新取得単価: 加重平均プレビュー
 */
export default function HoldingSection({
  ticker,
  current,         // { ticker, shares, avg_cost } | null
  onSave,          // ({ shares, avgCost }) => Promise<void>
  onDelete,        // () => Promise<void>
}) {
  const hasCurrent = !!current;

  // 既存ありの場合のデフォルトモード = 追加買付 (UI/UX エージェント推奨, 頻度高)
  const [mode, setMode] = useState(hasCurrent ? 'add' : 'overwrite');
  const [shares, setShares] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [addShares, setAddShares] = useState('');
  const [addPrice, setAddPrice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  useEffect(() => {
    if (current) {
      setShares(String(current.shares ?? ''));
      setAvgCost(String(current.avg_cost ?? ''));
    } else {
      setShares('');
      setAvgCost('');
    }
  }, [current]);

  // 追加買付モード時の加重平均プレビュー
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

  async function handleSave(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    setErrorMsg('');
    let sharesNum;
    let avgCostNum;

    if (hasCurrent && mode === 'add') {
      const a = Number(addShares);
      const p = Number(addPrice);
      if (!Number.isFinite(a) || a <= 0) {
        setErrorMsg('追加株数は 0 より大きい数値を入力してください');
        return;
      }
      if (!Number.isFinite(p) || p <= 0) {
        setErrorMsg('購入価格は 0 より大きい数値を入力してください');
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
      // 成功後はリセットして次の操作に備える
      setAddShares('');
      setAddPrice('');
      setErrorMsg('');
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
    } catch (e) {
      setErrorMsg(e?.message || '削除に失敗しました');
    } finally {
      setSaving(false);
      setPendingDelete(false);
    }
  }

  // ──────── 初回登録 (holdings なし) ────────
  if (!hasCurrent) {
    return (
      <form className="holding-section" onSubmit={handleSave}>
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

          <div className="holding-section-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={saving}
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </form>
    );
  }

  // ──────── 既存あり (holdings あり) ────────
  return (
    <form className="holding-section" onSubmit={handleSave}>
      <p className="holding-current-snapshot">
        現在: <strong>{Number(current.shares).toLocaleString()} 株</strong> @ ${Number(current.avg_cost).toFixed(2)}
      </p>

      {/* タブ + tabpanel を 1 つのカードに包んで親子関係を視覚化 (案 H) */}
      <div className="holding-tab-card">
        <div className="holding-mode-tabs" role="tablist" aria-label="入力モード">
          <button
            type="button"
            role="tab"
            id="holding-tab-add"
            aria-controls="holding-panel-add"
            aria-selected={mode === 'add'}
            tabIndex={mode === 'add' ? 0 : -1}
            onClick={() => { setMode('add'); setErrorMsg(''); }}
            className={`holding-mode-tab ${mode === 'add' ? 'is-active' : ''}`}
            disabled={saving}
          >
            追加買付
          </button>
          <button
            type="button"
            role="tab"
            id="holding-tab-ovr"
            aria-controls="holding-panel-ovr"
            aria-selected={mode === 'overwrite'}
            tabIndex={mode === 'overwrite' ? 0 : -1}
            onClick={() => { setMode('overwrite'); setErrorMsg(''); }}
            className={`holding-mode-tab ${mode === 'overwrite' ? 'is-active' : ''}`}
            disabled={saving}
          >
            直接編集
          </button>
        </div>

        <div
          role="tabpanel"
          id={mode === 'add' ? 'holding-panel-add' : 'holding-panel-ovr'}
          aria-labelledby={mode === 'add' ? 'holding-tab-add' : 'holding-tab-ovr'}
          className="holding-tabpanel"
          key={mode}
        >
          {mode === 'add' && (
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
                  disabled={saving}
                />
              </label>

              <label className="holding-field">
                <span className="holding-label">購入価格 (USD)</span>
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

              {addPreview && (
                <div className="holding-add-preview">
                  <div className="holding-add-row">
                    <span className="holding-add-row-label">新保有数</span>
                    <span className="holding-add-row-value">
                      {addPreview.newShares.toLocaleString()} 株
                    </span>
                  </div>
                  <div className="holding-add-row">
                    <span className="holding-add-row-label">新取得単価</span>
                    <span className="holding-add-row-value">
                      <strong>${addPreview.newAvg.toFixed(2)}</strong>
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {mode === 'overwrite' && (
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
            </>
          )}
        </div>
      </div>

      {errorMsg && <p className="holding-error">{errorMsg}</p>}

      <div className="holding-section-actions">
        {pendingDelete ? (
          <div className="holding-delete-confirm">
            <span>削除しますか？</span>
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
        ) : (
          <>
            <button
              type="button"
              onClick={() => setPendingDelete(true)}
              className="btn-danger-ghost"
              disabled={saving}
            >
              削除
            </button>
            <div className="holding-section-spacer" />
            <button
              type="submit"
              className="btn-primary"
              disabled={saving}
            >
              {saving ? '保存中...' : (mode === 'add' ? '追加して保存' : '上書き保存')}
            </button>
          </>
        )}
      </div>
    </form>
  );
}
