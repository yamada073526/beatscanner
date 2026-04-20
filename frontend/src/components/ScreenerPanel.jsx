import { useEffect, useState } from 'react';
import { fetchScreener } from '../api.js';

const TABS = [
  { key: 'gainers', label: '急騰', desc: '上昇率トップ' },
  { key: 'losers',  label: '急落', desc: '下落率トップ' },
  { key: 'actives', label: '出来高上位', desc: '売買代金トップ' },
];

function ChangeCell({ pct }) {
  if (pct == null) return <span className="text-slate-400">—</span>;
  const n = Number(pct);
  const sign = n >= 0 ? '+' : '';
  const formatted = `${sign}${n.toFixed(2)}%`;
  if (n >= 5)  return <span className="font-semibold text-blue-600">🔵 {formatted}</span>;
  if (n <= -5) return <span className="font-semibold text-red-500">🔴 {formatted}</span>;
  if (n >= 0)  return <span className="text-green-600">{formatted}</span>;
  return <span className="text-red-500">{formatted}</span>;
}

export default function ScreenerPanel({ onSelect }) {
  const [tab, setTab] = useState('gainers');
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (cache[tab]) return;
    let alive = true;
    setLoading(true);
    setError(null);
    fetchScreener(tab)
      .then((d) => alive && setCache((prev) => ({ ...prev, [tab]: d })))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [tab]);

  const items = cache[tab] ?? [];

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">注目銘柄スクリーナー</h3>
        <p className="mt-0.5 text-xs text-slate-400">株価$10以上 ・ クリックで決算分析プロトコル判定へ</p>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map(({ key, label, desc }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex flex-1 flex-col items-center rounded-md py-1.5 text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
            <span className="text-xs font-normal text-slate-400">{desc}</span>
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-slate-500">読み込み中...</p>}
      {error && (
        error.includes('有料プラン') ? (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-center">
            <p className="text-sm font-medium text-slate-600 mb-1">FMP有料プランが必要</p>
            <p className="text-xs text-slate-400">
              注目銘柄スクリーナーはFMPの有料エンドポイントです。
              <br />無料プランでは個別銘柄の分析をご利用ください。
            </p>
          </div>
        ) : (
          <p className="text-sm text-red-500">エラー: {error}</p>
        )
      )}

      {!loading && !error && items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                <th className="pb-2 pr-4">銘柄</th>
                <th className="pb-2 pr-3">取引所</th>
                <th className="pb-2 pr-4 text-right">株価</th>
                <th className="pb-2 text-right">前日比</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((it, i) => (
                <tr
                  key={`${it.symbol}-${i}`}
                  onClick={() => onSelect(it.symbol)}
                  className="cursor-pointer transition-colors hover:bg-slate-50"
                >
                  <td className="py-2.5 pr-4">
                    <div className="font-bold text-slate-900">{it.symbol}</div>
                    {it.name && (
                      <div className="max-w-[12rem] truncate text-xs text-slate-400">
                        {it.name}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="text-xs text-slate-500">{it.exchange || '—'}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-semibold text-slate-900">
                    {it.price != null ? `$${Number(it.price).toFixed(2)}` : '—'}
                  </td>
                  <td className="py-2.5 text-right">
                    <ChangeCell pct={it.change_pct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-slate-500">該当する銘柄が見つかりません。</p>
      )}
    </section>
  );
}
