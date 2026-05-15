import { useMemo, useState, useEffect } from 'react';

/**
 * ファンダメンタル 5 条件 詳細 modal (Phase 1.5 自然延長 / handover v68 §2 #5)
 *
 * Pane 2 PortfolioVerdictRollup の「5条件判定」row click で開く。
 * 内部 (じっちゃまプロトコル) 5 条件 = 営業CFマージン / EPS連続増加 / CFPS連続増加 /
 *   売上高連続増加 / CFPS > EPS。backend (judgment.py) が conditions array で全部返却済。
 *
 * 設計判断 (本セッション):
 * - Modal + 銘柄ごとの accordion (FAIL 優先 → PASS → ETF/エラー)
 * - 初期 expand: 最初の FAIL 銘柄 1 つ (UX 補助)
 * - 行 = ✓/✗ + 条件名 + detail (e.g. "18.0%") + threshold note
 * - 内部「じっちゃま」表記は本 file の comment にのみ残す。UI には出さない。
 */

const PASS_ICON = '✓';
const FAIL_ICON = '✗';

const ERROR_LABEL = {
  ETF: 'ETF (5条件判定対象外)',
  NOT_FOUND: 'データなし',
  ERROR: '取得エラー',
};

function sortTickersByStatus(tickers, verdicts, errors) {
  const list = (tickers || []).map((t) => String(t).toUpperCase());
  return list.slice().sort((a, b) => {
    const va = verdicts?.[a];
    const vb = verdicts?.[b];
    const aGroup = !va ? 2 : va.overallPass ? 1 : 0;
    const bGroup = !vb ? 2 : vb.overallPass ? 1 : 0;
    if (aGroup !== bGroup) return aGroup - bGroup;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function firstFailTicker(tickers, verdicts) {
  for (const t of tickers) {
    const v = verdicts?.[t];
    if (v && v.overallPass === false) return t;
  }
  return null;
}

export default function PortfolioJudgmentDetailModal({
  open,
  onClose,
  tickers,
  verdicts,
  errors,
  loading,
}) {
  const sortedTickers = useMemo(
    () => sortTickersByStatus(tickers, verdicts, errors),
    [tickers, verdicts, errors],
  );

  const initialExpand = useMemo(
    () => firstFailTicker(sortedTickers, verdicts),
    [sortedTickers, verdicts],
  );

  const [expanded, setExpanded] = useState(() => new Set(initialExpand ? [initialExpand] : []));

  useEffect(() => {
    if (!open) return;
    setExpanded(new Set(initialExpand ? [initialExpand] : []));
  }, [open, initialExpand]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const toggle = (t) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const judgedCount = sortedTickers.filter((t) => verdicts?.[t]).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ファンダメンタル5条件 詳細"
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
            ファンダメンタル5条件 詳細
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--text-muted)',
              marginLeft: 8,
            }}>
              {judgedCount} 銘柄
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

        {loading && sortedTickers.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>集計中...</div>
        )}

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          overflowY: 'auto',
          paddingRight: 4,
        }}>
          {sortedTickers.map((t) => {
            const v = verdicts?.[t];
            const err = errors?.[t];
            const isExpanded = expanded.has(t);
            const isJudged = !!v;
            const overallPass = isJudged && v.overallPass === true;
            const overallFail = isJudged && v.overallPass === false;

            return (
              <div
                key={t}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  background: 'transparent',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  onClick={() => isJudged && toggle(t)}
                  aria-expanded={isExpanded}
                  aria-controls={`judgment-detail-${t}`}
                  disabled={!isJudged}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    background: 'transparent',
                    border: 'none',
                    cursor: isJudged ? 'pointer' : 'default',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    fontWeight: 600,
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{t}</span>
                  {isJudged && (
                    <>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-pill)',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.4,
                          background: overallPass
                            ? 'rgba(34, 197, 94, 0.12)'
                            : 'rgba(248, 113, 113, 0.12)',
                          color: overallPass
                            ? 'var(--color-gain)'
                            : 'var(--color-loss)',
                          border: `1px solid ${overallPass
                            ? 'rgba(34, 197, 94, 0.32)'
                            : 'rgba(248, 113, 113, 0.32)'}`,
                        }}
                      >
                        {overallPass ? 'PASS' : 'FAIL'}
                      </span>
                      <span style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 500,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {v.passedCount}/{v.totalCount} 通過
                      </span>
                    </>
                  )}
                  {!isJudged && (
                    <span style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      fontWeight: 500,
                    }}>
                      {ERROR_LABEL[err] || '対象外'}
                    </span>
                  )}
                  {isJudged && (
                    <span style={{
                      marginLeft: 'auto',
                      color: 'var(--text-muted)',
                      fontSize: 14,
                      transition: 'transform 0.15s ease',
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      display: 'inline-block',
                    }}>
                      ›
                    </span>
                  )}
                </button>

                {isExpanded && isJudged && Array.isArray(v.conditions) && (
                  <div
                    id={`judgment-detail-${t}`}
                    style={{
                      borderTop: '1px solid var(--border)',
                      padding: '8px 12px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    {v.conditions.map((c, idx) => (
                      <ConditionRow key={`${t}-${idx}`} condition={c} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{
          paddingTop: 8,
          borderTop: '1px solid var(--border)',
          fontSize: 11,
          color: 'var(--text-muted)',
          lineHeight: 1.5,
        }}>
          独自プロトコル 5 条件 = 営業CFマージン ≥ 15% / EPS 連続増加 / CFPS 連続増加 /
          売上高 連続増加 / CFPS &gt; EPS (直近期)
        </div>
      </div>
    </div>
  );
}

function ConditionRow({ condition }) {
  const passed = condition?.passed === true;
  const name = condition?.name || '—';
  const detail = condition?.detail || '';
  const color = passed ? 'var(--color-gain)' : 'var(--color-loss)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 0',
        fontSize: 12,
        color: 'var(--text-secondary)',
      }}
    >
      <span style={{
        width: 16,
        textAlign: 'center',
        color,
        fontWeight: 700,
        fontSize: 13,
      }}>
        {passed ? PASS_ICON : FAIL_ICON}
      </span>
      <span style={{ color: 'var(--text-primary)', flex: 1 }}>{name}</span>
      {detail && (
        <span style={{
          color: 'var(--text-muted)',
          fontSize: 11,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {detail}
        </span>
      )}
    </div>
  );
}
