import { useState } from 'react';
import { demoAnalyze } from '../api.js';

const DEMO_TICKERS = [
  { sym: 'AAPL', name: 'Apple', sector: 'テクノロジー' },
  { sym: 'MSFT', name: 'Microsoft', sector: 'テクノロジー' },
  { sym: 'NVDA', name: 'NVIDIA', sector: '半導体' },
];

export default function DemoTicker({ onResult }) {
  const [loading, setLoading] = useState(false);
  const [loadingSym, setLoadingSym] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  async function handleDemo(sym) {
    setLoading(true);
    setLoadingSym(sym);
    setError(null);
    try {
      const data = await demoAnalyze(sym);
      onResult(data, sym);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingSym(null);
    }
  }

  if (!expanded) {
    return (
      <div className="mt-4 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-6 text-center">
        <p className="mb-1 text-sm font-medium text-slate-600">APIキーなしでも試せます</p>
        <p className="mb-4 text-xs text-slate-400">AAPL・MSFT・NVDA の3銘柄を1日3回まで無料で分析</p>
        <button
          onClick={() => setExpanded(true)}
          className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          まず試してみる →
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">銘柄を選んでください（デモモード）</p>
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          閉じる
        </button>
      </div>
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>
      )}
      <div className="grid grid-cols-3 gap-3">
        {DEMO_TICKERS.map(({ sym, name, sector }) => (
          <button
            key={sym}
            onClick={() => handleDemo(sym)}
            disabled={loading}
            className="flex flex-col items-start rounded-xl border border-slate-200 p-3 text-left transition hover:border-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <span className="text-sm font-bold text-slate-900">
              {loadingSym === sym ? '分析中...' : sym}
            </span>
            <span className="text-xs text-slate-500">{name}</span>
            <span className="mt-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400">
              {sector}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">
        デモモードは1日3回まで。全銘柄を使うにはAPIキーを設定してください。
      </p>
    </div>
  );
}
