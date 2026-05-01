import { forwardRef, useEffect, useRef, useState } from 'react';
import { searchTickers, prefetchGuidance } from '../api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

const _prefetchCache = new Set();

const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX', 'NYSE ARCA', 'NYSE MKT']);
const JP_EXCHANGES = new Set(['TSE', 'JPX', 'TYO']);

const hasJapanese = (s) => /[\u3040-\u30ff\u3400-\u9faf]/.test(s);

const TickerSearch = forwardRef(function TickerSearch(
  { value, onChange, onSubmit, forceClose, watchlist = [], onToggleWatchlist },
  inputRef,
) {
  const [inputValue, setInputValue] = useState(value);
  const isMobile = useIsMobile();
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounceRef = useRef(null);
  const prefetchRef = useRef(null);
  const containerRef = useRef(null);
  const composingRef = useRef(false);
  // When true, all search activity is suppressed (set after selection, reset after 2s)
  const suppressRef = useRef(false);

  // Sync display value when parent updates ticker externally
  useEffect(() => {
    if (!composingRef.current) setInputValue(value);
  }, [value]);

  // Force-close signal from parent (on search submit)
  useEffect(() => {
    if (forceClose) {
      suppressRef.current = true;
      clearTimeout(debounceRef.current);
      setOpen(false);
      setSuggestions([]);
      inputRef.current?.blur();
      setTimeout(() => { suppressRef.current = false; }, 2000);
    }
  }, [forceClose]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function select(sym) {
    suppressRef.current = true;
    clearTimeout(debounceRef.current);
    setOpen(false);
    setSuggestions([]);
    setInputValue(sym);
    inputRef.current?.blur();
    onChange(sym);
    onSubmit(sym);
    setTimeout(() => { suppressRef.current = false; }, 2000);
  }

  function handleChange(e) {
    const v = e.target.value;
    setInputValue(v);
    if (composingRef.current) return;

    const upper = v.toUpperCase().trim();
    onChange(upper);

    if (suppressRef.current) return;

    // Prefetch guidance into server cache
    clearTimeout(prefetchRef.current);
    if (upper.length >= 3) {
      prefetchRef.current = setTimeout(() => {
        if (!_prefetchCache.has(upper)) {
          _prefetchCache.add(upper);
          prefetchGuidance(upper);
        }
      }, 800);
    }

    // Debounced search
    clearTimeout(debounceRef.current);
    if (!upper || hasJapanese(upper)) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      if (suppressRef.current) return;
      const results = await searchTickers(upper);
      if (suppressRef.current) return;
      setSuggestions(results);
      setOpen(results.length > 0);
      setActive(-1);
    }, 250);
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === 'Enter') {
      if (open && active >= 0) {
        e.preventDefault();
        select(suggestions[active].symbol);
      } else {
        clearTimeout(debounceRef.current);
        setOpen(false);
        setSuggestions([]);
        inputRef.current?.blur();
      }
    } else if (e.key === 'Escape') {
      clearTimeout(debounceRef.current);
      setOpen(false);
      setSuggestions([]);
    }
  }

  const showJapaneseHint = hasJapanese(value);

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        ref={inputRef}
        value={inputValue}
        onChange={handleChange}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          const v = e.target.value.toUpperCase();
          setInputValue(v);
          onChange(v);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => {
          if (!suppressRef.current) {
            setOpen(false);
            setSuggestions([]);
          }
        }, 150)}
        placeholder={isMobile
          ? 'AAPL, MSFT, Toyota…'
          : 'ティッカー or 銘柄名（英語）例: AAPL, 7203.T, Toyota'}
        autoComplete="off"
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-lg font-semibold tracking-wider focus:border-slate-900 focus:outline-none"
      />
      {showJapaneseHint && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-lg">
          <p className="font-semibold">日本株の検索は英語または証券コードで入力してください</p>
          <p className="mt-1 text-xs text-amber-600">
            例: トヨタ → <button onMouseDown={() => select('7203.T')} className="font-bold underline">7203.T</button>
            ソニー → <button onMouseDown={() => select('6758.T')} className="font-bold underline">6758.T</button>
            ソフトバンク → <button onMouseDown={() => select('9984.T')} className="font-bold underline">9984.T</button>
            任天堂 → <button onMouseDown={() => select('7974.T')} className="font-bold underline">7974.T</button>
          </p>
        </div>
      )}
      {open && !showJapaneseHint && (
        <ul className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          {suggestions.map((s, i) => {
            const isUS = US_EXCHANGES.has(s.exchange);
            const isJP = JP_EXCHANGES.has(s.exchange);
            return (
              <li
                key={`${s.symbol}-${i}`}
                className={`flex items-center text-sm ${
                  i === active ? 'bg-slate-100' : ''
                } ${i > 0 ? 'border-t border-slate-100' : ''}`}
              >
                {/* 左: 銘柄情報 → クリックで分析 */}
                <div
                  onMouseDown={() => select(s.symbol)}
                  className="flex flex-1 cursor-pointer items-center justify-between px-4 py-2.5 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{s.symbol}</span>
                    <span className="text-slate-500 truncate max-w-40">{s.name}</span>
                  </div>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${
                    isUS ? 'bg-blue-50 text-blue-700'
                    : isJP ? 'bg-red-50 text-red-700'
                    : 'bg-slate-100 text-slate-500'
                  }`}>
                    {s.exchange}
                  </span>
                </div>
                {/* 右: ☆/★ ウォッチリストボタン */}
                <button
                  onMouseDown={e => {
                    e.preventDefault(); // blur防止
                    e.stopPropagation();
                    onToggleWatchlist?.(s.symbol);
                  }}
                  title={watchlist.includes(s.symbol) ? 'ウォッチリストから削除' : 'ウォッチリストに追加'}
                  style={{
                    flexShrink: 0,
                    width: '36px',
                    alignSelf: 'stretch',
                    background: 'transparent',
                    border: 'none',
                    borderLeft: '1px solid #e2e8f0',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: watchlist.includes(s.symbol) ? '#f59e0b' : '#94a3b8',
                    transition: 'color 0.15s',
                  }}
                >
                  {watchlist.includes(s.symbol) ? '★' : '☆'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

export default TickerSearch;
