import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { TRANSACTION_TYPE_LABEL } from '../lib/transactions.js';
import { ACCOUNT_TYPE_LABEL } from '../lib/accounts.js';
import { aggregateWithTransactions } from '../lib/holdings.js';
import CompanyLogo from './CompanyLogo.jsx';

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
  selectedTicker,   // v68 §2 #6 dogfood (6 体合議): ticker filter (null = 全 ticker)
  currentPrice,     // 任意: per-ticker 評価額 / 含み損益 計算用 (number)
  onDelete,
  onEdit,           // Phase 3 v68: (tx) => void - 編集 modal を開く callback
  onNew,            // v68 §2 #6 dogfood 6 体合議 (2026-05-15): + 新規取引 (ticker?) => void
}) {
  const [deletingId, setDeletingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState(null);

  // v68 §2 #6 dogfood 2026-05-15 bug fix: modal close 時に confirm state を reset しないと、
  // 次に modal を開いたときに「削除/キャンセル」 button が前回の選択状態のまま残る。
  // open が true → false に変わったら全 transient state をクリア。
  useEffect(() => {
    if (!open) {
      setConfirmId(null);
      setDeletingId(null);
      setError(null);
    }
  }, [open]);

  // v68 dogfood fix 2026-05-15: Esc key で modal を閉じる
  // - confirm モード中の Esc は confirm をキャンセル (誤削除 1 段階防御)
  // - 通常時は modal close
  // - IME composition 中は scope 外
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (e.isComposing || e.keyCode === 229) return;
      if (confirmId) {
        e.preventDefault();
        e.stopPropagation();
        setConfirmId(null);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onClose?.();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [open, confirmId, onClose]);

  const accountMap = useMemo(() => {
    const m = {};
    for (const a of accounts || []) m[a.id] = a;
    return m;
  }, [accounts]);

  // ticker は表記ゆれ防止のため filter 側でも正規化 (write 側と double-check)
  const filterTicker = selectedTicker ? String(selectedTicker).trim().toUpperCase() : null;

  const sortedRows = useMemo(() => {
    const list = Array.isArray(transactions) ? [...transactions] : [];
    let filtered = selectedAccountId
      ? list.filter((t) => t.account_id === selectedAccountId)
      : list;
    if (filterTicker) {
      filtered = filtered.filter((t) => String(t.ticker || '').trim().toUpperCase() === filterTicker);
    }
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
  }, [transactions, selectedAccountId, filterTicker]);

  // per-ticker summary (filterTicker のときのみ計算)。sortedRows は新→古、aggregator は古→新 sort するので素データを渡す
  const tickerSummary = useMemo(() => {
    if (!filterTicker) return null;
    return aggregateWithTransactions(sortedRows);
  }, [sortedRows, filterTicker]);

  if (!open) return null;

  // v68 dogfood 2026-05-15: WorkspaceShell の `contain: layout` が fixed 子要素の
  // containing block を pane にしてしまうため、Portal で document.body 直下に描画して viewport 全体を覆う。
  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  if (!portalTarget) return null;

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

  return createPortal((
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
        className="ds-tx-history-card"
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          {filterTicker ? (
            <h2 style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minWidth: 0,
            }}>
              <CompanyLogo ticker={filterTicker} size={24} />
              <span style={{ fontWeight: 800, letterSpacing: 0.3 }}>{filterTicker}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                の取引履歴
              </span>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>
                · {sortedRows.length} 件
                {selectedAccountId && accountMap[selectedAccountId]
                  ? ` · ${accountMap[selectedAccountId].name}`
                  : ''}
              </span>
            </h2>
          ) : (
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
          )}
          <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
            {/* v68 §2 #6 dogfood 6 体合議 (2026-05-15): history modal から新規取引登録 動線。
                ticker filter 中なら ticker を prefill (買い増し 1-tap)。
                shares/price は空欄 (誤コピー防止、金融指摘) → TransactionEntryModal 側で reset 済 */}
            {onNew && (
              <button
                type="button"
                onClick={() => onNew(filterTicker || null)}
                aria-label={filterTicker ? `${filterTicker} で新規取引を登録` : '新規取引を登録'}
                title={filterTicker ? `${filterTicker} で新規取引を登録` : '新規取引を登録'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'background 0.12s ease, color 0.12s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                <Plus size={14} strokeWidth={2.4} />
              </button>
            )}
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
        </div>

        {/* v68 §2 #6 dogfood 6 体合議 (2026-05-15): Robinhood 流 P/L hero hierarchy
            1 行目: 含み損益 (大、未確定 = 点線下線) + 実現損益 (中、確定 = solid)
            2 行目: 平均取得 / 保有 / 評価額 / 受取配当 (副次、muted) */}
        {filterTicker && tickerSummary && tickerSummary.txCount > 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '12px 14px',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {/* 1 行目: 含み損益 (大字 hero) + 実現損益 (中字、確定なので solid 色) */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'baseline',
              gap: 18,
              rowGap: 6,
            }}>
              {Number.isFinite(Number(currentPrice)) && tickerSummary.shares > 0 ? (
                <PnLHero
                  label="含み損益"
                  pnl={(Number(currentPrice) - tickerSummary.avgCost) * tickerSummary.shares}
                  pct={tickerSummary.avgCost > 0
                    ? ((Number(currentPrice) - tickerSummary.avgCost) / tickerSummary.avgCost) * 100
                    : null}
                  unrealized
                />
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  含み損益 = 現在価格取得待ち
                </span>
              )}
              {Math.abs(tickerSummary.realized - tickerSummary.dividendTotal) > 0.005 && (
                <PnLHero
                  label="実現損益"
                  pnl={tickerSummary.realized - tickerSummary.dividendTotal}
                  pct={null}
                  size="mid"
                />
              )}
            </div>
            {/* 2 行目: 副次 chip 群 (平均取得 / 保有 / 評価額 / 受取配当) */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              fontSize: 11,
              color: 'var(--text-muted)',
              paddingTop: 4,
              borderTop: '1px dashed var(--border)',
              marginTop: 2,
            }}>
              <SummaryMini
                label="平均取得"
                value={tickerSummary.avgCost > 0 ? `$${fmtNumber(tickerSummary.avgCost, 2)}` : '—'}
              />
              <SummaryMini
                label="保有"
                value={tickerSummary.shares > 0 ? `${fmtNumber(tickerSummary.shares, 4)} 株` : '0 株'}
              />
              {Number.isFinite(Number(currentPrice)) && tickerSummary.shares > 0 && (
                <SummaryMini
                  label="評価額"
                  value={`$${fmtNumber(tickerSummary.shares * Number(currentPrice), 2)}`}
                />
              )}
              {tickerSummary.dividendTotal > 0 && (
                <SummaryMini
                  label="受取配当"
                  value={`+$${fmtNumber(tickerSummary.dividendTotal, 2)}`}
                  color="var(--color-warning)"
                />
              )}
            </div>
          </div>
        )}

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
            {sortedRows.map((tx, idx) => {
              const isConfirm = confirmId === tx.id;
              const isDeleting = deletingId === tx.id;
              const acc = accountMap[tx.account_id];
              const typeColor = TYPE_COLOR[tx.type] || 'var(--text-primary)';
              // v68 §2 #6 dogfood (UI/UX 推奨): 年セパレータ
              const curYear = String(tx.trade_date || '').slice(0, 4);
              const prevYear = idx > 0 ? String(sortedRows[idx - 1].trade_date || '').slice(0, 4) : null;
              const showYearSep = idx > 0 && curYear && prevYear && curYear !== prevYear;

              // v68 §2 #6 dogfood 6 体合議: per-row 合計額 (金融 MUST) + split/dividend 専用表記
              const type = String(tx.type || '').toLowerCase();
              const sh = Number(tx.shares);
              const pr = Number(tx.price);
              const cur = String(tx.currency || 'USD').toUpperCase();
              const totalAmount = Number.isFinite(sh) && Number.isFinite(pr)
                ? sh * pr + (Number(tx.fee) || 0)
                : null;
              const isSplit = type === 'split';
              const isDividend = type === 'dividend';
              // dividend で shares が null = trade_date 時点保有数 smart default を使う印
              const dividendAutoShares = isDividend && tx.shares == null;

              return (
                <div key={tx.id}>
                {showYearSep && (
                  <div style={{
                    padding: '6px 12px 4px',
                    background: 'rgba(255, 255, 255, 0.015)',
                    borderTop: '1px solid var(--border)',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                    letterSpacing: 0.4,
                  }}>
                    ─── {curYear} ───
                  </div>
                )}
                <div
                  className="ds-tx-row"
                  style={{
                    display: 'grid',
                    // 5 列: 日付 / 種別 / ticker / data (合計+副) / actions
                    // container query @ 460px で ticker hide + 4 列構成へ自動切替
                    gridTemplateColumns: filterTicker
                      ? 'minmax(72px, auto) 56px minmax(0, 1fr) auto'
                      : 'minmax(72px, auto) 56px minmax(48px, auto) minmax(0, 1fr) auto',
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
                  {/* ticker filter 中は省略 (logo + ticker は header に既出、redundant) */}
                  {!filterTicker && (
                    <span className="ds-tx-ticker" style={{
                      color: 'var(--text-primary)',
                      fontWeight: 600,
                    }}>
                      {tx.ticker || '—'}
                    </span>
                  )}
                  {/* data column: 合計額を主表示 (金融 MUST) + 株数×単価を副表示 + fx chip + account chip (条件付) */}
                  <div style={{
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}>
                    {/* 主: 合計額 (split は専用表記、buy/sell/dividend は金額) */}
                    {isSplit ? (
                      <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                        📐 {Number.isFinite(sh) && Number.isFinite(pr) && pr > 0
                          ? `${fmtNumber(sh)}:${fmtNumber(pr)} split`
                          : 'split'}
                      </span>
                    ) : totalAmount != null && totalAmount > 0 ? (
                      <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                        {cur} {fmtNumber(totalAmount, 2)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                    {/* 副: 株数 × 単価 + fx_rate + account chip */}
                    <span style={{
                      color: 'var(--text-muted)',
                      fontSize: 10,
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      {!isSplit && (
                        <span style={{ whiteSpace: 'nowrap' }}>
                          {tx.shares != null
                            ? `${fmtNumber(tx.shares)} 株`
                            : dividendAutoShares ? '保有数 自動' : '—'}
                          {' × '}
                          {tx.price != null ? `${cur} ${fmtNumber(tx.price, 4)}` : '—'}
                        </span>
                      )}
                      {dividendAutoShares && (
                        <span
                          title="trade_date 時点の保有数で自動計算 (Phase 1.5 v68 smart default)"
                          style={{
                            color: 'var(--text-muted)',
                            fontSize: 9,
                            padding: '0 4px',
                            border: '1px dashed var(--border)',
                            borderRadius: 'var(--radius-pill)',
                          }}
                        >
                          ⓘ 自動
                        </span>
                      )}
                      {tx.fx_rate != null && Number.isFinite(Number(tx.fx_rate)) && (
                        <span
                          className="ds-tx-fx-chip"
                          title={`trade_date 時点で凍結された為替レート`}
                          style={{
                            color: 'var(--text-muted)',
                            fontSize: 10,
                            padding: '1px 6px',
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-pill)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          @{fmtNumber(tx.fx_rate, 4)}
                        </span>
                      )}
                      {acc && (
                        <span
                          className="ds-tx-account"
                          style={{
                            color: 'var(--text-muted)',
                            fontSize: 10,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {acc.name}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="ds-tx-row-actions" style={{
                    display: 'flex',
                    gap: 4,
                    alignItems: 'center',
                  }}>
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
                          whiteSpace: 'nowrap',
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
                          whiteSpace: 'nowrap',
                        }}
                      >
                        キャンセル
                      </button>
                    </>
                  ) : (
                    <>
                      <IconActionButton
                        onClick={() => onEdit?.(tx)}
                        disabled={!onEdit}
                        label="編集"
                        ariaLabel="この取引を編集"
                        icon={<Pencil size={14} strokeWidth={2} />}
                      />
                      <IconActionButton
                        onClick={() => setConfirmId(tx.id)}
                        label="削除"
                        ariaLabel="この取引を削除"
                        icon={<Trash2 size={14} strokeWidth={2} />}
                        danger
                      />
                    </>
                  )}
                  </div>
                </div>
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
          編集・削除した内容は即座に Pane 2 集計に反映されます。
        </div>
      </div>
    </div>
  ), portalTarget);
}

// v68 §2 #6 dogfood (6 体合議): 編集/削除 を icon button 化。
// visual 28px、padding で hit area ~36px 確保 (WCAG 44px は modal context で UI/UX trade-off)。
// emoji NG (OS 字形不揃い) → lucide-react Pencil/Trash2 SVG。
function IconActionButton({ onClick, disabled, label, ariaLabel, icon, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={ariaLabel || label}
      style={{
        width: 28,
        height: 28,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        background: 'transparent',
        color: danger ? 'var(--color-loss)' : 'var(--text-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.12s ease, color 0.12s ease, border-color 0.12s ease',
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = danger
          ? 'rgba(248, 113, 113, 0.10)'
          : 'rgba(255, 255, 255, 0.05)';
        e.currentTarget.style.borderColor = danger
          ? 'rgba(248, 113, 113, 0.30)'
          : 'var(--text-secondary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    >
      {icon}
    </button>
  );
}

// v68 §2 #6 dogfood 6 体合議 (2026-05-15): Robinhood 流 P/L hero
// 含み損益 = 未確定 → 点線下線で会計概念を視覚化 (金融指摘)
// 実現損益 = 確定 → solid color、サイズ中
function PnLHero({ label, pnl, pct, size = 'large', unrealized = false }) {
  const safe = Number(pnl);
  const positive = safe >= 0;
  const color = positive ? 'var(--color-gain)' : 'var(--color-loss)';
  const sign = positive ? '+' : '';
  const fontSize = size === 'large' ? 24 : 16;
  return (
    <div style={{
      display: 'inline-flex',
      flexDirection: 'column',
      gap: 2,
      minWidth: 0,
    }}>
      <span
        title={unrealized ? '未確定 (current price による評価)' : '確定済 (sell + 配当)'}
        style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          letterSpacing: 0.4,
          textDecoration: unrealized ? 'underline dotted' : 'none',
          textUnderlineOffset: 3,
        }}
      >
        {label}
      </span>
      <span style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 6,
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span style={{
          fontSize,
          fontWeight: 800,
          color,
          letterSpacing: -0.2,
          lineHeight: 1,
        }}>
          {sign}${fmtNumber(Math.abs(safe), 2)}
        </span>
        {Number.isFinite(pct) && (
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            color,
            opacity: 0.85,
          }}>
            ({sign}{fmtNumber(Math.abs(pct), 2)}%)
          </span>
        )}
      </span>
    </div>
  );
}

// 2 行目副次 mini-chip (label: value 横並び、padding なし、軽量)
function SummaryMini({ label, value, color }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'baseline',
      gap: 4,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: color || 'var(--text-primary)', fontWeight: 700 }}>{value}</span>
    </span>
  );
}
