import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import { searchTickers } from '../../../../api.js';
import Chip from '../../../../components/ui/Chip.jsx';
import CompanyLogo from '../../../../components/CompanyLogo.jsx';

/**
 * 観察銘柄追加 button (handover v69 §3 #5).
 *
 * 「+」 icon button をクリックすると floating dropdown が開き、
 * ティッカー入力 + autocomplete で銘柄選択 → 即 onAdd(ticker) 実行。
 *
 * 設計 (round 7 chip primitive と矛盾しない方針):
 *  - createPortal で document.body に dropdown を描画 (overflow 制約回避、TransactionEntryModal と同パターン)
 *  - 既存 watchlist (currentSet) と重複 ticker は disabled で表示
 *  - 既存 holdings との重複も考慮 (任意、Pro tier 3 件制限は親側 addToWatchlist で chec
 *  - Esc / outside click で閉じる
 *
 * Props:
 *   onAdd: (ticker: string) => void    // 親で addToWatchlist を呼ぶ
 *   currentSet: Set<string>            // 既存 watchlist (重複防止)
 *   isPro?: boolean                    // Pro 判定 (将来制限 UI 用)
 *   maxFree?: number (default 3)       // 無料制限件数
 *   maxFreeReached?: boolean           // H2: 無料制限到達済フラグ (親で計算)
 */
export default function WatchlistAddButton({
  onAdd,
  currentSet,
  isPro = false,
  maxFree = 3,
  maxFreeReached = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 240 });

  // Esc + outside click で閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    const onClick = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  // 開いた直後 input にフォーカス
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (inputRef.current) inputRef.current.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [open]);

  // trigger 位置基準で dropdown 配置を計算
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // dropdown は trigger の下、右端揃え (overflow しないよう viewport 内に clamp)
    const width = 260;
    const margin = 8;
    let left = rect.right - width;
    if (left < margin) left = margin;
    if (left + width > window.innerWidth - margin) {
      left = window.innerWidth - width - margin;
    }
    setPos({
      top: rect.bottom + 4,
      left,
      width,
    });
  }, [open]);

  // 検索 (debounce 200ms)
  useEffect(() => {
    if (!open || !query.trim()) {
      setResults([]);
      setActiveIndex(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const list = await searchTickers(query.trim());
        if (cancelled) return;
        setResults(Array.isArray(list) ? list.slice(0, 8) : []);
        setActiveIndex(0);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query]);

  const dedupedSet = currentSet instanceof Set ? currentSet : new Set(currentSet || []);

  const choose = (ticker) => {
    if (!ticker) return;
    const t = String(ticker).trim().toUpperCase();
    if (!t || dedupedSet.has(t)) return;
    onAdd(t);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    // IME composition 中は skip (CLAUDE.md §Cmd+K の教訓と同様)
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const pick = results[activeIndex];
      if (pick?.ticker) {
        choose(pick.ticker);
      } else if (query.trim()) {
        // 検索結果なしでも、入力値をそのまま追加 (新規銘柄に対応)
        choose(query.trim().toUpperCase());
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    }
  };

  // round 8 (6 体合議): Chip primitive variant='add' で「+ 追加」label pill 化。
  // dashed border default + hover cyan、視認性 + アフォーダンス両立 (Linear/Notion 流)。
  // triggerRef を Chip 内部に渡せないので、wrapper span に ref を取る。
  // H2: maxFreeReached 時は disabled 状態 + 「Pro で無制限」hint chip を隣表示。
  return (
    <>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span ref={triggerRef} style={{ display: 'inline-flex' }}>
          <Chip
            size="sm"
            variant="add"
            onClick={maxFreeReached ? undefined : () => setOpen((v) => !v)}
            ariaLabel={maxFreeReached ? '無料プランの観察銘柄上限に達しました' : '観察銘柄を追加'}
            aria-expanded={maxFreeReached ? undefined : open}
            title={maxFreeReached ? '無料プランは 3 件まで。Pro / Premium で無制限' : '観察銘柄を追加'}
            icon={<Plus size={12} strokeWidth={2.2} />}
            style={maxFreeReached ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
          >
            追加
          </Chip>
        </span>
        {maxFreeReached && (
          <Chip
            size="xs"
            variant="display"
            tone="accent"
            title="Pro / Premium にアップグレードすると観察銘柄を無制限に追加できます"
          >
            Pro で無制限
          </Chip>
        )}
      </span>

      {open && createPortal(
        <div
          ref={dropdownRef}
          role="dialog"
          aria-label="観察銘柄を追加"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 9999,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md, 12px)',
            boxShadow: '0 10px 28px -8px rgba(15, 23, 42, 0.32)',
            padding: 8,
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="ティッカー or 会社名"
            spellCheck={false}
            autoCapitalize="characters"
            style={{
              width: '100%',
              padding: '6px 10px',
              fontSize: 13,
              background: 'var(--bg-elevated, transparent)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm, 8px)',
              color: 'var(--text-primary)',
              outline: 'none',
              fontVariantNumeric: 'tabular-nums',
            }}
          />
          <div style={{ marginTop: 6, maxHeight: 260, overflowY: 'auto' }}>
            {loading && (
              <div style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-muted)' }}>
                検索中…
              </div>
            )}
            {!loading && query.trim() && results.length === 0 && (
              <div style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-muted)' }}>
                Enter で「{query.trim().toUpperCase()}」を追加
              </div>
            )}
            {results.map((r, i) => {
              const ticker = String(r.ticker || '').toUpperCase();
              const exists = dedupedSet.has(ticker);
              const active = i === activeIndex;
              return (
                <button
                  key={ticker}
                  type="button"
                  disabled={exists}
                  onClick={() => choose(ticker)}
                  onMouseEnter={() => setActiveIndex(i)}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '5px 8px',
                    border: '1px solid transparent',
                    borderRadius: 'var(--radius-sm, 8px)',
                    background: active && !exists ? 'rgba(56, 189, 248, 0.10)' : 'transparent',
                    color: exists ? 'var(--text-muted)' : 'var(--text-primary)',
                    cursor: exists ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    textAlign: 'left',
                  }}
                >
                  {/* H3: CompanyLogo 24px — TV→FMP→頭文字円 3 段フォールバック */}
                  <CompanyLogo
                    ticker={ticker}
                    size={24}
                    shape="rounded"
                    monoFallback
                  />
                  <span style={{ fontWeight: 600, fontFamily: 'monospace', flexShrink: 0 }}>{ticker}</span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {r.name || ''}
                  </span>
                  {exists && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>登録済</span>
                  )}
                </button>
              );
            })}
          </div>
          {!isPro && (
            <div
              style={{
                marginTop: 6,
                padding: '4px 8px',
                fontSize: 10,
                color: 'var(--text-muted)',
              }}
            >
              無料プラン: 観察銘柄は {maxFree} 件まで
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
