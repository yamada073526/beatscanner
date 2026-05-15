import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TRANSACTION_TYPES } from '../lib/transactions.js';
import { SUPPORTED_CURRENCIES } from '../lib/accounts.js';
import { fetchHistoricalDividends, fetchForexRate, searchTickers, fetchQuotes } from '../api.js';
import CompanyLogo from './CompanyLogo.jsx';

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
  pinnedTickers,    // v68 dogfood 2026-05-15: portfolio 既存 ticker を autocomplete 上位 pin
  onAdd,            // (payload) => Promise<tx>
  onUpdate,         // Phase 3: 編集モード用 (id, patch) => Promise<tx>
  editingTx,        // Phase 3: 編集モード時に渡す既存 transaction (null = 新規登録)
  onCreateDefaultAccount,  // 任意: 「デフォルト口座を作成」CTA で呼ぶ
  accountsError,           // 任意: useAccounts の error を可視化
}) {
  const isEditing = !!editingTx?.id;
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
  const [successMsg, setSuccessMsg] = useState(null);
  // 配当 auto-fill (handover v68 §2 #1): ticker 入力時に過去配当を fetch、click で price + 日付に即代入
  const [divCandidates, setDivCandidates] = useState([]);
  const [divLoading, setDivLoading] = useState(false);
  // v68 §2 #6 dogfood 6 体合議 (2026-05-15): ticker autocomplete
  const [tickerSuggestions, setTickerSuggestions] = useState([]);
  const [tickerLoading, setTickerLoading] = useState(false);
  const [tickerDropdownOpen, setTickerDropdownOpen] = useState(false);
  const [tickerFocused, setTickerFocused] = useState(false);
  // v68 dogfood fix 2026-05-15: 選択後に再検索でドロップダウンが復活する bug 回避用 ref
  const justSelectedRef = useRef(false);
  // modal open 時に銘柄 input へ auto-focus する用 ref
  const tickerInputRef = useRef(null);

  // open 時に default を反映 (新規) or 既存値を pre-fill (編集)
  useEffect(() => {
    if (!open) return;
    if (editingTx?.id) {
      // 編集モード: editingTx の値で全 field 初期化
      setType(editingTx.type || 'buy');
      setAccountId(editingTx.account_id || defaultAccountId || '');
      setTicker(editingTx.ticker || '');
      setShares(editingTx.shares != null ? String(editingTx.shares) : '');
      setPrice(editingTx.price != null ? String(editingTx.price) : '');
      setCurrency(editingTx.currency || 'USD');
      setTradeDate(editingTx.trade_date || todayISO());
      setFee(editingTx.fee != null ? String(editingTx.fee) : '');
      setNote(editingTx.note || '');
    } else {
      // 新規モード
      setType('buy');
      setAccountId(defaultAccountId || (accounts?.[0]?.id ?? ''));
      setTicker(defaultTicker || '');
      setShares('');
      setPrice('');
      setCurrency('USD');
      setTradeDate(todayISO());
      setFee('');
      setNote('');
    }
    setError(null);
    setSubmitting(false);
    setSuccessMsg(null);
    // ticker / type が変わるので candidates もクリア (次の useEffect で再取得)
    setDivCandidates([]);
    setDivLoading(false);
  }, [open, editingTx?.id, defaultAccountId, defaultTicker, accounts]);

  // v68 dogfood fix 2026-05-15: modal open 時に 銘柄 input へ auto-focus
  // 編集モード or defaultTicker pre-fill のときは focus 不要 (ticker 既に決まっている)
  // また、portalTarget が mount してから focus する必要がある (DOM ready 待ち)
  useEffect(() => {
    if (!open) return undefined;
    if (editingTx?.id) return undefined;
    if (defaultTicker) return undefined;
    const timer = setTimeout(() => {
      tickerInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [open, editingTx?.id, defaultTicker]);

  // v68 dogfood fix 2026-05-15: Esc key で modal を閉じる
  // - autocomplete dropdown 開いていたら、まず dropdown を閉じる (modal は閉じない)
  // - dropdown 閉じていれば modal を閉じる
  // - IME composition 中の Esc は変換キャンセル動作なので scope 外
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (e.isComposing || e.keyCode === 229) return;
      if (tickerDropdownOpen) {
        e.preventDefault();
        e.stopPropagation();
        setTickerDropdownOpen(false);
        setTickerFocused(false);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onClose?.();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [open, tickerDropdownOpen, onClose]);

  // 配当 auto-fill: dividend mode + ticker 入力時に過去配当を debounce fetch
  // 編集モードは既存値を尊重するので fetch しない
  useEffect(() => {
    if (!open) return undefined;
    if (isEditing) return undefined;
    if (type !== 'dividend') {
      setDivCandidates([]);
      setDivLoading(false);
      return undefined;
    }
    const sym = String(ticker || '').trim().toUpperCase();
    if (sym.length < 1 || sym.length > 12) {
      setDivCandidates([]);
      setDivLoading(false);
      return undefined;
    }
    let cancelled = false;
    setDivLoading(true);
    // 過去 18 ヶ月の配当 (四半期 6 回 ≒ 6 件想定)
    const since = (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 18);
      return d.toISOString().slice(0, 10);
    })();
    const timer = setTimeout(async () => {
      try {
        const data = await fetchHistoricalDividends(sym, { since, limit: 8 });
        if (cancelled) return;
        const list = Array.isArray(data?.dividends) ? data.dividends.slice(0, 6) : [];
        setDivCandidates(list);
      } catch {
        if (!cancelled) setDivCandidates([]);
      } finally {
        if (!cancelled) setDivLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, isEditing, type, ticker]);

  const spec = useMemo(
    () => TRANSACTION_TYPES.find((t) => t.value === type) || TRANSACTION_TYPES[0],
    [type]
  );

  // v68 §2 #6 dogfood 6 体合議 (2026-05-15): ticker autocomplete (debounce 250ms + AbortController)
  // - FMP `/api/search` を流用 (新 endpoint 不要)
  // - portfolio 既存 ticker は最上位 pin (買い増し 1-tap、金融指摘)
  // - 編集モードでは disabled
  useEffect(() => {
    if (!open) return undefined;
    if (isEditing) return undefined;
    if (!spec?.requiresTicker) return undefined;
    if (!tickerFocused) return undefined;
    // v68 dogfood fix 2026-05-15: 選択直後の ticker 変化で再検索しない
    // (再 fetch → setTickerDropdownOpen(true) で復活する bug を回避)
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return undefined;
    }
    const q = String(ticker || '').trim();
    if (q.length < 1) {
      const pinned = Array.isArray(pinnedTickers)
        ? pinnedTickers.slice(0, 5).map((t) => ({ symbol: t, name: '保有銘柄', pinned: true }))
        : [];
      setTickerSuggestions(pinned);
      setTickerDropdownOpen(pinned.length > 0);
      return undefined;
    }
    const controller = new AbortController();
    setTickerLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchTickers(q);
        if (controller.signal.aborted) return;
        const filtered = Array.isArray(results) ? results.slice(0, 8) : [];
        const pinned = Array.isArray(pinnedTickers)
          ? pinnedTickers
              .filter((t) => String(t).toUpperCase().startsWith(q.toUpperCase()))
              .slice(0, 3)
              .map((t) => ({ symbol: t, name: '保有銘柄', pinned: true }))
          : [];
        const seen = new Set(pinned.map((p) => p.symbol));
        const merged = [
          ...pinned,
          ...filtered.filter((r) => !seen.has(String(r.symbol).toUpperCase())),
        ].slice(0, 8);
        setTickerSuggestions(merged);
        setTickerDropdownOpen(merged.length > 0);
      } catch {
        if (!controller.signal.aborted) setTickerSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setTickerLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, isEditing, spec?.requiresTicker, ticker, tickerFocused, pinnedTickers]);

  // ticker 選択 → ticker set + current price autofill (trade_date == today のみ)
  const handleSelectTicker = async (sym) => {
    const symU = String(sym || '').trim().toUpperCase();
    if (!symU) return;
    // v68 dogfood fix 2026-05-15: 直後の re-fetch 抑止
    justSelectedRef.current = true;
    setTicker(symU);
    setTickerDropdownOpen(false);
    setTickerSuggestions([]);
    setTickerFocused(false);
    // input を blur して次の field に進める準備 (UX: 株数欄が次)
    try { tickerInputRef.current?.blur(); } catch { /* noop */ }
    if (tradeDate === todayISO() && (!price || Number(price) <= 0) && (type === 'buy' || type === 'sell')) {
      try {
        const data = await fetchQuotes([symU]);
        const q = data?.quotes?.find?.((x) => String(x.symbol).toUpperCase() === symU);
        const p = Number(q?.price);
        if (Number.isFinite(p) && p > 0) setPrice(String(p.toFixed(2)));
      } catch {
        // silent
      }
    }
  };

  if (!open) return null;

  // v68 dogfood 2026-05-15: WorkspaceShell の `contain: layout` 回避のため Portal で body 直下に描画
  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  if (!portalTarget) return null;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setError(null);
    setSuccessMsg(null);
    if (!accountId) { setError('口座を選択してください'); return; }
    setSubmitting(true);
    try {
      // handover v68 §2 #2 (Phase 2.5): currency が account.base_currency と異なれば
      // trade_date 時点の fx_rate を fetch して凍結書き込み (Stripe/Wise 方式)。
      // 取得失敗時は null のまま続行 — 後から手動補正 / forex_rates cron で埋める前提。
      const acc = (accounts || []).find((a) => a.id === accountId) || null;
      const base = (acc?.base_currency || 'USD').toUpperCase();
      const cur = String(currency || 'USD').toUpperCase();
      let fxRate = null;
      if (cur !== base) {
        const fx = await fetchForexRate(base, cur, tradeDate || undefined);
        if (fx && Number.isFinite(Number(fx.rate)) && Number(fx.rate) > 0) {
          fxRate = Number(fx.rate);
        }
      }
      const payload = {
        account_id: accountId,
        type,
        ticker: spec.requiresTicker ? ticker : (ticker || null),
        shares: spec.requiresShares ? Number(shares) : (shares ? Number(shares) : null),
        price: Number(price),
        currency: cur,
        fx_rate: fxRate,
        trade_date: tradeDate,
        fee: fee === '' ? 0 : Number(fee),
        note: note || null,
      };
      let result;
      if (isEditing && onUpdate) {
        result = await onUpdate(editingTx.id, payload);
      } else {
        result = await onAdd(payload);
      }
      // 成功フィードバック
      const tspec = TRANSACTION_TYPES.find((x) => x.value === type);
      const tickerLabel = result?.ticker || ticker || '';
      const sharesLabel = result?.shares ?? shares;
      const verb = isEditing ? '更新しました' : '登録しました';
      setSuccessMsg(
        `${tspec?.label || type} を${verb}${tickerLabel ? ` (${tickerLabel}${sharesLabel ? ` ${sharesLabel} 株` : ''})` : ''}`
      );
      setTimeout(() => {
        setSuccessMsg(null);
        onClose?.();
      }, 2500);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal((
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
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            {isEditing ? '取引を編集' : '取引を登録'}
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
          {(accounts || []).length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '10px 12px',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.30)',
              borderRadius: 'var(--radius-sm)',
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                口座が見つかりません。
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {accountsError
                  ? `エラー: ${String(accountsError.message || accountsError)}`
                  : 'デフォルト口座を作成して取引登録を開始できます。'}
              </div>
              {onCreateDefaultAccount && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const created = await onCreateDefaultAccount();
                      if (created?.id) setAccountId(created.id);
                    } catch (e) {
                      setError(e?.message || String(e));
                    }
                  }}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '6px 12px',
                    background: 'var(--color-warning)',
                    color: 'var(--bg-card)',
                    border: 'none',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  デフォルト口座を作成
                </button>
              )}
            </div>
          ) : (
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
          )}
        </Field>

        {spec.requiresTicker && (
          <Field label="銘柄">
            <div style={{ position: 'relative' }}>
              <input
                ref={tickerInputRef}
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                onFocus={() => setTickerFocused(true)}
                onBlur={() => {
                  // delay で suggestion click が走るのを許可
                  setTimeout(() => {
                    setTickerFocused(false);
                    setTickerDropdownOpen(false);
                  }, 150);
                }}
                placeholder="AAPL"
                style={inputStyle}
                required
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={tickerDropdownOpen}
              />
              {tickerDropdownOpen && tickerSuggestions.length > 0 && (
                <div
                  role="listbox"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    boxShadow: 'var(--shadow-4)',
                    maxHeight: 240,
                    overflowY: 'auto',
                    zIndex: 10,
                  }}
                >
                  {tickerSuggestions.map((s) => (
                    <button
                      key={s.symbol}
                      type="button"
                      role="option"
                      onMouseDown={(e) => e.preventDefault()}  // blur 抑止
                      onClick={() => handleSelectTicker(s.symbol)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        padding: '6px 10px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 12,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {/* v68 dogfood 2026-05-15: 企業ロゴ追加 (パッと見 2 秒識別、5 原則 #1) */}
                      <CompanyLogo ticker={s.symbol} size={20} />
                      <span style={{
                        fontWeight: 700,
                        minWidth: 56,
                        color: s.pinned ? 'var(--color-warning)' : 'var(--text-primary)',
                      }}>
                        {s.pinned && <span aria-hidden="true" style={{ marginRight: 4 }}>★</span>}
                        {s.symbol}
                      </span>
                      <span style={{
                        color: 'var(--text-muted)',
                        fontSize: 11,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}>
                        {s.name || ''}
                      </span>
                    </button>
                  ))}
                  {tickerLoading && (
                    <div style={{
                      padding: '6px 10px',
                      color: 'var(--text-muted)',
                      fontSize: 11,
                    }}>
                      検索中...
                    </div>
                  )}
                </div>
              )}
            </div>
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

        {/* 配当 type は requiresShares=false だが optional 入力を許可。
            空欄なら lib/holdings.js が受領時保有数を自動使用 (smart default) */}
        {type === 'dividend' && (
          <Field label="受領株数 (任意)">
            <input
              type="number"
              step="any"
              min="0"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="空欄: 受領時保有数を自動使用"
              style={inputStyle}
            />
          </Field>
        )}

        {/* 配当 auto-fill: dividend mode で ticker が入力されたら過去配当 candidate を表示 */}
        {type === 'dividend' && !isEditing && (divLoading || divCandidates.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              📥 過去の配当 {divLoading ? '取得中...' : `(${divCandidates.length}件)`}
            </span>
            {divCandidates.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {divCandidates.map((c) => (
                  <button
                    key={c.date}
                    type="button"
                    onClick={() => {
                      setPrice(String(c.amount));
                      setTradeDate(c.paymentDate || c.date);
                    }}
                    title={`ex-date ${c.date}${c.paymentDate ? ` / payment ${c.paymentDate}` : ''}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-pill)',
                      color: 'var(--text-primary)',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>{(c.paymentDate || c.date).replace(/-/g, '/')}</span>
                    <span style={{ color: 'var(--color-gain)' }}>${Number(c.amount).toFixed(4)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
            onChange={(e) => {
              // Chrome は <input type="date"> でも 5+ 桁の年を手動入力で許可してしまうので
              // 入力時に YYYY-MM-DD に正規化 (年 5+ 桁は先頭 4 桁に切詰め、< 4 桁は ゼロ埋め空のまま)
              let v = e.target.value;
              const m = v.match(/^(\d+)-(\d{2})-(\d{2})$/);
              if (m && m[1].length > 4) {
                v = `${m[1].slice(0, 4)}-${m[2]}-${m[3]}`;
              }
              setTradeDate(v);
            }}
            min="1900-01-01"
            max="2999-12-31"
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

        {successMsg && (
          <div
            role="status"
            aria-live="polite"
            style={{
              padding: '14px 16px',
              background: 'rgba(52, 239, 129, 0.14)',
              border: '2px solid rgba(52, 239, 129, 0.50)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-gain)',
              fontSize: 15,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 0 0 4px rgba(52, 239, 129, 0.08)',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 18 }}>✓</span>
            <span>{successMsg}</span>
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
            disabled={submitting || !!successMsg}
            style={btnPrimaryStyle}
          >
            {submitting
              ? (isEditing ? '更新中...' : '登録中...')
              : successMsg
              ? '✓ 完了'
              : (isEditing ? '更新' : '登録')}
          </button>
        </div>
      </form>
    </div>
  ), portalTarget);
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
  color: 'var(--bg-card)',
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
