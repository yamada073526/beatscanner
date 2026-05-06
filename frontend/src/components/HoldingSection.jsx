import { useEffect, useMemo, useState } from 'react';
import { useSplitDetection } from '../hooks/useSplitDetection.js';

/**
 * 保有数 + 取得単価 入力セクション (X-2-B: ロット履歴ベース)
 *
 * holdings 有無で UI 分岐:
 * - holdings なし (初回): 株数 + 購入価格 + 購入日 のシンプルフォーム → 1 ロット追加
 * - holdings あり: 集計サマリー + タブ「追加買付 / 履歴」+ 全削除ボタン
 *   - 追加買付: 株数 + 購入価格 + 購入日 → 新規ロット追加 (加重平均は自動再計算)
 *   - 履歴: ロット一覧、各行で個別編集 / 削除
 *
 * 原則 ④「1 クリックを減らせ」:
 * - 旧「直接編集」タブは廃止。誤入力訂正は履歴タブで対象ロットを編集 / 削除する。
 * - 加重平均は集計から自動計算 (UI に出すのはプレビューのみ)。
 */
function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function fmtUSD(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return x.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function fmtShares(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return x.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

// レビュー指摘 (Web 設計 #5): saving 中の視覚フィードバック強化用スピナー。
// インライン SVG (12x12) を回転アニメで表示。CSS .spinner-rotate を使用。
function Spinner({ size = 12 }) {
  return (
    <svg
      className="spinner-rotate"
      aria-hidden="true"
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="3" strokeLinecap="round"
      style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: '6px' }}
    >
      <path d="M12 2 A10 10 0 0 1 22 12" />
    </svg>
  );
}

// ── 個別ロット表示行 (履歴タブ) ───────────────────────────────
function LotRow({ lot, suggestion, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [shares, setShares] = useState(String(lot.shares ?? ''));
  const [price, setPrice] = useState(String(lot.price ?? ''));
  const [tradeDate, setTradeDate] = useState(lot.trade_date || todayISO());
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorField, setErrorField] = useState(null); // 'shares' | 'price' | null
  const errorId = `lot-error-${lot.id}`;

  useEffect(() => {
    if (!editing) {
      setShares(String(lot.shares ?? ''));
      setPrice(String(lot.price ?? ''));
      setTradeDate(lot.trade_date || todayISO());
      setErrorField(null);
    }
  }, [editing, lot]);

  // 株式分割補正の 1 クリック適用ハンドラ
  const applySplit = async () => {
    if (!suggestion || busy) return;
    setErrorMsg('');
    setBusy(true);
    try {
      await onUpdate(lot.id, { price: suggestion.adjustedPrice });
    } catch (e) {
      setErrorMsg(e?.message || '補正に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <li className="lot-row">
        <div className="lot-row-main">
          <span className="lot-row-date">{lot.trade_date || '—'}</span>
          <span className="lot-row-shares">{fmtShares(lot.shares)} 株</span>
          <span className="lot-row-price">@ ${fmtUSD(lot.price)}</span>
        </div>
        <div className="lot-row-actions">
          <button
            type="button"
            className="lot-row-btn"
            onClick={() => setEditing(true)}
            aria-label="編集"
            title="編集"
          >
            編集
          </button>
          <button
            type="button"
            className="lot-row-btn lot-row-btn-danger"
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              try { await onDelete(lot.id); }
              catch (e) { setErrorMsg(e?.message || '削除に失敗しました'); }
              finally { setBusy(false); }
            }}
            disabled={busy}
            aria-label="削除"
            title="削除"
          >
            削除
          </button>
        </div>
        {suggestion && (
          <div className="lot-split-chip" role="status">
            <span className="lot-split-chip-icon" aria-hidden="true">🔀</span>
            <span className="lot-split-chip-text">
              株式分割で補正可能:
              {' '}
              <span className="lot-split-chip-old">${fmtUSD(lot.price)}</span>
              {' → '}
              <strong>${fmtUSD(suggestion.adjustedPrice)}</strong>
              {' '}
              <span className="lot-split-chip-factor">
                ({suggestion.splitFactor >= 2 ? `${Math.round(suggestion.splitFactor)}:1 split` : '分割反映後'})
              </span>
            </span>
            <button
              type="button"
              className="lot-split-chip-btn"
              onClick={applySplit}
              disabled={busy}
            >
              {busy ? '...' : '補正'}
            </button>
          </div>
        )}
        {errorMsg && <p className="holding-error">{errorMsg}</p>}
      </li>
    );
  }

  // ── 編集モード ──
  const handleSave = async () => {
    setErrorMsg(''); setErrorField(null);
    const s = Number(shares);
    const p = Number(price);
    if (!Number.isFinite(s) || s <= 0) {
      setErrorMsg('株数は 0 より大きい数値を入力してください');
      setErrorField('shares');
      return;
    }
    if (!Number.isFinite(p) || p <= 0) {
      setErrorMsg('購入価格は 0 より大きい数値を入力してください');
      setErrorField('price');
      return;
    }
    setBusy(true);
    try {
      await onUpdate(lot.id, { shares: s, price: p, tradeDate });
      setEditing(false);
    } catch (e) {
      setErrorMsg(e?.message || '保存に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="lot-row lot-row-editing">
      <div className="lot-edit-grid">
        <label className="holding-field lot-edit-field">
          <span className="holding-label">株数</span>
          <input
            type="number" inputMode="decimal" step="any" min="0"
            value={shares} onChange={(e) => { setShares(e.target.value); if (errorField === 'shares') setErrorField(null); }}
            className="holding-input"
            disabled={busy}
            aria-invalid={errorField === 'shares' ? 'true' : undefined}
            aria-describedby={errorField === 'shares' ? errorId : undefined}
          />
        </label>
        <label className="holding-field lot-edit-field">
          <span className="holding-label">購入価格</span>
          <div className="holding-input-prefixed">
            <span className="holding-input-prefix">$</span>
            <input
              type="number" inputMode="decimal" step="any" min="0"
              value={price} onChange={(e) => { setPrice(e.target.value); if (errorField === 'price') setErrorField(null); }}
              className="holding-input holding-input-with-prefix"
              disabled={busy}
              aria-invalid={errorField === 'price' ? 'true' : undefined}
              aria-describedby={errorField === 'price' ? errorId : undefined}
            />
          </div>
        </label>
        <label className="holding-field lot-edit-field">
          <span className="holding-label">購入日</span>
          <input
            type="date"
            value={tradeDate}
            onChange={(e) => setTradeDate(e.target.value)}
            className="holding-input"
            disabled={busy}
            max={todayISO()}
          />
        </label>
      </div>
      {errorMsg && <p className="holding-error" role="alert" id={errorId}>{errorMsg}</p>}
      <div className="lot-edit-actions">
        <button type="button" className="btn-ghost" onClick={() => setEditing(false)} disabled={busy}>キャンセル</button>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={busy} aria-busy={busy}>
          {busy ? <><Spinner /> 保存中...</> : '保存'}
        </button>
      </div>
    </li>
  );
}

// ── メイン: HoldingSection ────────────────────────────────────
export default function HoldingSection({
  ticker,
  current,         // { ticker, shares, avg_cost, lotCount } | null
  lots = [],       // 当該銘柄の全ロット (trade_date 降順)
  onAddLot,        // ({ shares, price, tradeDate }) => Promise<void>
  onUpdateLot,     // (lotId, patch) => Promise<void>
  onDeleteLot,     // (lotId) => Promise<void>
  onDeleteAll,     // () => Promise<void>  (全ロット削除)
}) {
  const hasCurrent = !!current && Number(current.shares) > 0;

  const [mode, setMode] = useState(hasCurrent ? 'add' : 'add'); // 'add' | 'history'
  const [addShares, setAddShares] = useState('');
  const [addPrice, setAddPrice] = useState('');
  const [addDate, setAddDate] = useState(todayISO());
  const [errorMsg, setErrorMsg] = useState('');
  // レビュー指摘 (Web 設計 #5): どのフィールドが invalid かを記録し、
  // 該当 input に aria-invalid="true" + aria-describedby=errorId を付与する。
  const [errorField, setErrorField] = useState(null); // 'shares' | 'price' | null
  const errorId = 'holding-section-error';
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  // X-2-5-D: 株式分割の補正候補を検出 (履歴タブで chip 表示)
  const { suggestions: splitSuggestions } = useSplitDetection(lots);
  const splitSuggestionCount = Object.keys(splitSuggestions).length;

  // 加重平均プレビュー (既存ありの場合のみ)
  const addPreview = useMemo(() => {
    if (!hasCurrent) return null;
    const a = Number(addShares);
    const p = Number(addPrice);
    if (!Number.isFinite(a) || a <= 0 || !Number.isFinite(p) || p <= 0) return null;
    const cur = Number(current.shares);
    const curAvg = Number(current.avg_cost);
    if (!Number.isFinite(cur) || !Number.isFinite(curAvg)) return null;
    const newShares = cur + a;
    const newAvg = (cur * curAvg + a * p) / newShares;
    return { newShares, newAvg };
  }, [hasCurrent, current, addShares, addPrice]);

  const handleAdd = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    setErrorMsg(''); setErrorField(null);
    const s = Number(addShares);
    const p = Number(addPrice);
    if (!Number.isFinite(s) || s <= 0) {
      setErrorMsg('株数は 0 より大きい数値を入力してください');
      setErrorField('shares');
      return;
    }
    if (!Number.isFinite(p) || p <= 0) {
      setErrorMsg('購入価格は 0 より大きい数値を入力してください');
      setErrorField('price');
      return;
    }
    setSaving(true);
    try {
      await onAddLot({ shares: s, price: p, tradeDate: addDate || undefined });
      setAddShares('');
      setAddPrice('');
      setAddDate(todayISO());
      setErrorMsg('');
      setErrorField(null);
    } catch (e) {
      setErrorMsg(e?.message || '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAll = async () => {
    setErrorMsg(''); setErrorField(null);
    setSaving(true);
    try {
      await onDeleteAll();
    } catch (e) {
      setErrorMsg(e?.message || '削除に失敗しました');
    } finally {
      setSaving(false);
      setPendingDelete(false);
    }
  };

  // ──────── 初回登録 (holdings なし) ────────
  if (!hasCurrent) {
    return (
      <form className="holding-section" onSubmit={handleAdd}>
        <div className="holding-form">
          <label className="holding-field">
            <span className="holding-label">株数</span>
            <input
              type="number" inputMode="decimal" step="any" min="0"
              value={addShares}
              onChange={(e) => { setAddShares(e.target.value); if (errorField === 'shares') setErrorField(null); }}
              placeholder="例: 100"
              className="holding-input"
              disabled={saving}
              aria-invalid={errorField === 'shares' ? 'true' : undefined}
              aria-describedby={errorField === 'shares' ? errorId : undefined}
            />
          </label>

          <label className="holding-field">
            <span className="holding-label">購入価格 (USD)</span>
            <div className="holding-input-prefixed">
              <span className="holding-input-prefix">$</span>
              <input
                type="number" inputMode="decimal" step="any" min="0"
                value={addPrice}
                onChange={(e) => { setAddPrice(e.target.value); if (errorField === 'price') setErrorField(null); }}
                placeholder="例: 189.50"
                className="holding-input holding-input-with-prefix"
                disabled={saving}
                aria-invalid={errorField === 'price' ? 'true' : undefined}
                aria-describedby={errorField === 'price' ? errorId : undefined}
              />
            </div>
          </label>

          <label className="holding-field">
            <span className="holding-label">購入日</span>
            <input
              type="date"
              value={addDate}
              onChange={(e) => setAddDate(e.target.value)}
              className="holding-input"
              disabled={saving}
              max={todayISO()}
            />
          </label>

          {errorMsg && <p className="holding-error" role="alert" id={errorId}>{errorMsg}</p>}

          <div className="holding-section-actions">
            <button type="submit" className="btn-primary" disabled={saving} aria-busy={saving}>
              {saving ? <><Spinner /> 保存中...</> : '保存'}
            </button>
          </div>
        </div>
      </form>
    );
  }

  // ──────── 既存あり (holdings あり) ────────
  return (
    <form className="holding-section" onSubmit={handleAdd}>
      <p className="holding-current-snapshot">
        現在: <strong>{fmtShares(current.shares)} 株</strong> @ ${fmtUSD(current.avg_cost)}
        {current.lotCount > 0 && (
          <span className="holding-lot-count">（{current.lotCount} ロット）</span>
        )}
      </p>

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
            id="holding-tab-hist"
            aria-controls="holding-panel-hist"
            aria-selected={mode === 'history'}
            tabIndex={mode === 'history' ? 0 : -1}
            onClick={() => { setMode('history'); setErrorMsg(''); }}
            className={`holding-mode-tab ${mode === 'history' ? 'is-active' : ''}`}
            disabled={saving}
          >
            {/* レビュー指摘 (UI/UX #7): 件数バッジと警告バッジを 1 つに統合。
                警告がある時は同じバッジを amber スタイルに切替＋⚠ 前置で
                「件数 + 警告件数」を兼ねる。バッジ数が減って情報が圧縮される。 */}
            履歴{' '}
            <span
              className={`holding-tab-badge${splitSuggestionCount > 0 ? ' holding-tab-badge-attention' : ''}`}
              title={
                splitSuggestionCount > 0
                  ? `履歴 ${lots.length} 件中、株式分割の補正候補 ${splitSuggestionCount} 件`
                  : `履歴 ${lots.length} 件`
              }
            >
              {splitSuggestionCount > 0 ? `⚠ ${lots.length}` : lots.length}
            </span>
          </button>
        </div>

        <div
          role="tabpanel"
          id={mode === 'add' ? 'holding-panel-add' : 'holding-panel-hist'}
          aria-labelledby={mode === 'add' ? 'holding-tab-add' : 'holding-tab-hist'}
          className="holding-tabpanel"
          key={mode}
        >
          {mode === 'add' && (
            <>
              <label className="holding-field">
                <span className="holding-label">追加株数</span>
                <input
                  type="number" inputMode="decimal" step="any" min="0"
                  value={addShares}
                  onChange={(e) => { setAddShares(e.target.value); if (errorField === 'shares') setErrorField(null); }}
                  placeholder="例: 50"
                  className="holding-input"
                  disabled={saving}
                  aria-invalid={errorField === 'shares' ? 'true' : undefined}
                  aria-describedby={errorField === 'shares' ? errorId : undefined}
                />
              </label>

              <label className="holding-field">
                <span className="holding-label">購入価格 (USD)</span>
                <div className="holding-input-prefixed">
                  <span className="holding-input-prefix">$</span>
                  <input
                    type="number" inputMode="decimal" step="any" min="0"
                    value={addPrice}
                    onChange={(e) => { setAddPrice(e.target.value); if (errorField === 'price') setErrorField(null); }}
                    placeholder="例: 210.00"
                    className="holding-input holding-input-with-prefix"
                    disabled={saving}
                    aria-invalid={errorField === 'price' ? 'true' : undefined}
                    aria-describedby={errorField === 'price' ? errorId : undefined}
                  />
                </div>
              </label>

              <label className="holding-field">
                <span className="holding-label">購入日</span>
                <input
                  type="date"
                  value={addDate}
                  onChange={(e) => setAddDate(e.target.value)}
                  className="holding-input"
                  disabled={saving}
                  max={todayISO()}
                />
              </label>

              {addPreview && (
                <div className="holding-add-preview">
                  <div className="holding-add-row">
                    <span className="holding-add-row-label">新保有数</span>
                    <span className="holding-add-row-value">
                      {fmtShares(addPreview.newShares)} 株
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

          {mode === 'history' && (
            <>
              {lots.length === 0 ? (
                <p className="holding-history-empty">ロットがありません。「追加買付」から登録してください。</p>
              ) : (
                <ul className="lot-list">
                  {lots.map((lot) => (
                    <LotRow
                      key={lot.id}
                      lot={lot}
                      suggestion={splitSuggestions[lot.id] || null}
                      onUpdate={onUpdateLot}
                      onDelete={onDeleteLot}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      {errorMsg && <p className="holding-error" role="alert" id={errorId}>{errorMsg}</p>}

      <div className="holding-section-actions">
        {pendingDelete ? (
          <div className="holding-delete-confirm">
            <span>すべての履歴を削除しますか？</span>
            <button type="button" onClick={handleDeleteAll} className="btn-danger" disabled={saving} aria-busy={saving}>
              {saving ? <><Spinner /> 削除中...</> : '削除する'}
            </button>
            <button type="button" onClick={() => setPendingDelete(false)} className="btn-ghost" disabled={saving}>
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
              全削除
            </button>
            <div className="holding-section-spacer" />
            {mode === 'add' && (
              <button type="submit" className="btn-primary" disabled={saving} aria-busy={saving}>
                {saving ? <><Spinner /> 保存中...</> : '追加して保存'}
              </button>
            )}
          </>
        )}
      </div>
    </form>
  );
}
