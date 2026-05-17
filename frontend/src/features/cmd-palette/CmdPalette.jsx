import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CompanyLogo from '../../components/CompanyLogo.jsx';
import { searchMasterTickers } from '../../data/masterTickers.js';

/**
 * Cmd Palette — Linear / Raycast 流のグローバル ⌘K UI.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.close
 * @param {Array} props.items - パレット候補. 形:
 *   { id, group, label, description?, ticker?, action: () => void, hint? }
 *   group は 'recent' | 'watchlist' | 'holdings' | 'action' | 'analyze'
 * @param {(ticker: string) => void} [props.onAnalyze] - 未登録 ticker を typed したときに呼ばれる
 */
export default function CmdPalette({ open, close, items = [], onAnalyze }) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // ── filter + analyze suggestion + master オートコンプリート ────────
  // handover v77 user feedback (2026-05-17、 dogfood #5/#7): ticker 全部入力するのが面倒 → master
  // 80 銘柄から prefix/contains match で候補を出す (CompanyLogo 付き)。
  // 重複表示 (items 側の watchlist/recent と analyze candidate) は group 不問で除外する。
  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qRaw = query.trim();
    if (!q) return items;

    const filteredItems = items.filter(
      (it) =>
        it.label?.toLowerCase().includes(q) ||
        it.ticker?.toLowerCase().includes(q) ||
        it.description?.toLowerCase().includes(q)
    );

    // items 側に既にある ticker は analyze candidate (master / typed 両方) で重複させない
    const existingTickerSet = new Set(
      filteredItems.map((it) => (it.ticker || '').toUpperCase()).filter(Boolean)
    );

    // master tickers prefix/contains match 候補 (最大 6 件、 既存 items に重複しないもの)
    const masterSuggestions = searchMasterTickers(qRaw, 6)
      .filter((s) => !existingTickerSet.has(s.ticker));
    const masterTickerSet = new Set(masterSuggestions.map((s) => s.ticker));
    const masterItems = masterSuggestions.map((s) => ({
      id: `analyze-master:${s.ticker}`,
      group: 'analyze',
      label: `${s.ticker} を分析`,
      description: s.name,
      ticker: s.ticker,
      hint: 'Enter',
      action: onAnalyze ? () => onAnalyze(s.ticker) : undefined,
    }));

    // ティッカー風 (英 1-5 文字) かつ items にも master にも無い「未知ティッカー」 を直接分析する候補
    const candidates = [...masterItems, ...filteredItems];
    if (/^[A-Za-z]{1,5}(\.[A-Za-z]+)?$/.test(qRaw)) {
      const upper = qRaw.toUpperCase();
      if (!existingTickerSet.has(upper) && !masterTickerSet.has(upper)) {
        candidates.unshift({
          id: `analyze-typed:${upper}`,
          group: 'analyze',
          label: `${upper} を分析`,
          ticker: upper,
          hint: 'Enter',
          action: onAnalyze ? () => onAnalyze(upper) : undefined,
        });
      }
    }
    return candidates;
  }, [items, query, onAnalyze]);

  // open 時に reset + auto focus + 閉じた時に元の focus へ復帰
  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement;
    setQuery('');
    setHighlight(0);
    // RAF で render 後にフォーカス (CSS transition と競合しないため)
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      // 閉じた時に元のフォーカス先へ復帰 (a11y 推奨パターン)
      if (prevFocus instanceof HTMLElement) {
        try { prevFocus.focus(); } catch { /* ignore */ }
      }
    };
  }, [open]);

  // highlight が view 範囲外なら 0 に巻き戻す
  useEffect(() => {
    if (highlight >= view.length) setHighlight(0);
  }, [view.length, highlight]);

  // highlight が変わったら scrollIntoView
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  if (!open) return null;

  const handleKey = (e) => {
    // v68 dogfood fix 2026-05-15: 日本語 IME 入力中 (ひらがな → 漢字変換確定の Enter)
    // をパレットの Enter / Escape として誤検知しないよう、composition 中は全 key を no-op。
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, view.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = view[highlight];
      if (it?.action) {
        try {
          it.action();
        } catch (err) {
          console.error('[CmdPalette] action error', err);
        }
        close();
      }
    } else if (e.key === 'Tab') {
      // focus trap: palette 外への escape を防ぐ. Linear/Raycast 流に Tab 自体を消費.
      e.preventDefault();
    }
  };

  // group ヘッダ
  const renderRow = (it, idx) => {
    const selected = idx === highlight;
    return (
      <li
        key={it.id}
        data-idx={idx}
        id={`cmd-palette-opt-${idx}`}
        role="option"
        aria-selected={selected}
        onMouseEnter={() => setHighlight(idx)}
        onClick={() => {
          it.action?.();
          close();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          cursor: 'pointer',
          background: selected ? 'var(--bg-hover)' : 'transparent',
          borderLeft: selected ? '2px solid rgb(56, 189, 248)' : '2px solid transparent',
          transition: 'background var(--motion-fast, 120ms) var(--ease-out-expo)',
        }}
      >
        {/* handover v77 user feedback (2026-05-17):
            ticker を持つ item (analyze / recent / watchlist / holdings) は CompanyLogo を leading icon に。
            それ以外の action / account / transaction は記号 (⚡ → ↗ に変更で品格 up)。 */}
        {it.ticker ? (
          <CompanyLogo ticker={it.ticker} size={20} />
        ) : (
          <span aria-hidden style={{ color: 'var(--text-muted)', width: 20, height: 20, fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {it.group === 'action' ? '◆'
              : it.group === 'account' ? '🏦'
              : it.group === 'transaction' ? '📋'
              : '○'}
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--text-primary)',
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {it.label}
          </div>
          {it.description && (
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-muted)',
                lineHeight: 1.3,
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {it.description}
            </div>
          )}
        </div>
        {it.hint && (
          <kbd
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: '2px 6px',
              color: 'var(--text-muted)',
              background: 'var(--bg-subtle)',
              borderRadius: 4,
              border: '1px solid var(--border)',
            }}
          >
            {it.hint}
          </kbd>
        )}
      </li>
    );
  };

  // group ごとに section 分け (filter なしの時のみ)
  const grouped = !query.trim();
  let sections = [];
  if (grouped) {
    const buckets = {
      action:      { title: 'クイックアクション',     items: [] },
      account:     { title: '口座切替',               items: [] },
      recent:      { title: '直近分析',               items: [] },
      holdings:    { title: '保有銘柄',               items: [] },
      watchlist:   { title: 'ウォッチリスト',         items: [] },
      transaction: { title: '取引履歴',               items: [] },
      analyze:     { title: '分析',                   items: [] },
    };
    let idx = 0;
    for (const it of view) {
      buckets[it.group]?.items.push({ ...it, _idx: idx });
      idx++;
    }
    sections = Object.values(buckets).filter((b) => b.items.length > 0);
  }

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="コマンドパレット"
      onKeyDown={handleKey}
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal, 100)',
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'saturate(140%) blur(4px)',
        WebkitBackdropFilter: 'saturate(140%) blur(4px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 'min(15vh, 120px)',
        paddingLeft: 16,
        paddingRight: 16,
        animation: 'cmdPaletteIn var(--motion-fast, 120ms) var(--ease-out-expo)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '70vh',
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span aria-hidden style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            🔍
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            placeholder="銘柄を分析、タブ切替、設定変更..."
            aria-label="コマンド検索"
            role="combobox"
            aria-controls="cmd-palette-listbox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={view[highlight] ? `cmd-palette-opt-${highlight}` : undefined}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 15,
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}
          />
          <kbd
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: '2px 6px',
              color: 'var(--text-muted)',
              background: 'var(--bg-subtle)',
              borderRadius: 4,
              border: '1px solid var(--border)',
            }}
          >
            ESC
          </kbd>
        </div>
        <ul
          ref={listRef}
          id="cmd-palette-listbox"
          role="listbox"
          aria-label="検索候補"
          style={{
            flex: 1,
            overflowY: 'auto',
            listStyle: 'none',
            margin: 0,
            padding: '6px 0',
          }}
        >
          {view.length === 0 ? (
            <li
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 13,
              }}
            >
              該当する候補がありません
            </li>
          ) : grouped ? (
            sections.map((sec) => (
              <React.Fragment key={sec.title}>
                <div
                  style={{
                    padding: '8px 16px 4px',
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                  }}
                >
                  {sec.title}
                </div>
                {sec.items.map((it) => renderRow(it, it._idx))}
              </React.Fragment>
            ))
          ) : (
            view.map((it, i) => renderRow(it, i))
          )}
        </ul>
        <div
          style={{
            display: 'flex',
            gap: 14,
            padding: '8px 16px',
            borderTop: '1px solid var(--border)',
            fontSize: 11,
            color: 'var(--text-muted)',
          }}
        >
          <span>↑↓ 移動</span>
          <span>↵ 選択</span>
          <span>ESC 閉じる</span>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
