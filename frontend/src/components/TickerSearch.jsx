import { forwardRef, useEffect, useRef, useState } from 'react';
import { searchTickers, prefetchGuidance } from '../api.js';

const _prefetchCache = new Set();

const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX', 'NYSE ARCA', 'NYSE MKT']);
const JP_EXCHANGES = new Set(['TSE', 'JPX', 'TYO']);

const hasJapanese = (s) => /[\u3040-\u30ff\u3400-\u9faf]/.test(s);

const TickerSearch = forwardRef(function TickerSearch(
  { value, onChange, onSubmit, forceClose },
  inputRef,
) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounceRef = useRef(null);
  const prefetchRef = useRef(null);
  const containerRef = useRef(null);
  const justSelectedRef = useRef(false);
  const composingRef = useRef(false);

  useEffect(() => {
    if (!composingRef.current) setInputValue(value);
  }, [value]);

  // Force-close from parent (called on search submit)
  useEffect(() => {
    if (forceClose) {
      clearTimeout(debounceRef.current);
      setOpen(false);
      setSuggestions([]);
      inputRef.current?.blur();
    }
  }, [forceClose]);

  const showJapaneseHint = hasJapanese(value);

  useEffect(() => {
    // Always cancel pending debounce first, regardless of justSelected
    clearTimeout(debounceRef.current);

    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    if (!value.trim() || showJapaneseHint) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const results = await searchTickers(value);
      setSuggestions(results);
      setOpen(results.length > 0);
      setActive(-1);
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [value, showJapaneseHint]);

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
    clearTimeout(debounceRef.current); // cancel pending search before anything else
    justSelectedRef.current = true;
    onChange(sym);
    setOpen(false);
    setSuggestions([]);
    inputRef.current?.blur();
    onSubmit(sym);
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

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        ref={inputRef}
        value={inputValue}
        onChange={(e) => {
          const v = e.target.value;
          setInputValue(v);
          if (!composingRef.current) {
            const upper = v.toUpperCase().trim();
            onChange(upper);
            clearTimeout(prefetchRef.current);
            if (upper.length >= 3) {
              prefetchRef.current = setTimeout(() => {
                if (!_prefetchCache.has(upper)) {
                  _prefetchCache.add(upper);
                  prefetchGuidance(upper);
                }
              }, 800);
            }
          }
        }}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          const v = e.target.value.toUpperCase();
          setInputValue(v);
          onChange(v);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => { setOpen(false); setSuggestions([]); }, 200)}
        placeholder="ティッカー or 銘柄名（英語）例: 7203.T、Toyota、AAPL"
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
                onMouseDown={() => select(s.symbol)}
                className={`flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50 ${
                  i === active ? 'bg-slate-100' : ''
                } ${i > 0 ? 'border-t border-slate-100' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{s.symbol}</span>
                  <span className="text-slate-500 truncate max-w-48">{s.name}</span>
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${
                    isUS ? 'bg-blue-50 text-blue-700'
                    : isJP ? 'bg-red-50 text-red-700'
                    : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {s.exchange}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

export default TickerSearch;
