import { useState } from 'react';
import { fetchCustomScreener } from '../api.js';

function ConditionDots({ conditions = [] }) {
  return (
    <div className="flex gap-1">
      {conditions.map((c, i) => (
        <span
          key={i}
          title={c.name}
          className={`inline-block h-2 w-2 rounded-full ${c.passed ? 'bg-green-500' : 'bg-red-300'}`}
        />
      ))}
    </div>
  );
}

function ResultCard({ item, onSelect }) {
  const passCount = item.passedCount ?? item.conditions?.filter((c) => c.passed).length ?? 0;
  return (
    <button
      onClick={() => onSelect(item.ticker)}
      className="flex flex-col items-start rounded-xl border border-slate-200 p-3 text-left transition hover:border-slate-600 hover:shadow-sm w-full"
    >
      <div className="mb-1.5 flex w-full items-start justify-between gap-1">
        <div className="min-w-0">
          <span className="text-sm font-bold text-slate-900">{item.ticker}</span>
          {item.companyName && (
            <p className="truncate text-xs text-slate-400">{item.companyName}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${
            item.overallPass ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {passCount}/5
        </span>
      </div>
      <ConditionDots conditions={item.conditions} />
    </button>
  );
}

export default function CustomScreenerPanel({ onSelect }) {
  const [phase, setPhase] = useState('idle'); // idle | loading | done | error
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function run() {
    setPhase('loading');
    setError(null);
    try {
      const result = await fetchCustomScreener();
      setData(result);
      setPhase('done');
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">カスタムスクリーナー</h3>
        <p className="mt-0.5 text-xs text-slate-400">
          じっちゃまプロトコル5条件 × S&amp;P500主要銘柄を自動判定
        </p>
      </div>

      {/* Survivorship bias notice */}
      <div className="mb-3 rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
        ⚠️ このスクリーナーはS&amp;P500主要銘柄（約15銘柄）を対象としています。S&amp;P500外・新規上場銘柄は対象外です。投資判断の補助ツールとしてご活用ください。
      </div>

      {/* API usage info */}
      <div className="mb-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
        1回のスクリーン実行: 約34リクエスト消費 ／ FMP無料プラン（250/日）で最大7回実行可能
        {data && <span className="ml-1 text-slate-400">— 結果は15分間キャッシュされます</span>}
      </div>

      {/* Idle */}
      {phase === 'idle' && (
        <button
          onClick={run}
          className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          スクリーニングを実行
        </button>
      )}

      {/* Loading */}
      {phase === 'loading' && (
        <div className="py-8 text-center">
          <p className="text-sm font-medium text-slate-600">スクリーニング中...</p>
          <p className="mt-1 text-xs text-slate-400">財務データを取得・分析しています（約30秒）</p>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div className="space-y-3">
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
          <button
            onClick={run}
            className="w-full rounded-lg border border-slate-300 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            再試行
          </button>
        </div>
      )}

      {/* Results */}
      {phase === 'done' && data && (
        <div className="space-y-5">
          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-semibold text-green-600">✅ PASS: {data.passing.length}銘柄</span>
            <span className="text-slate-400">FAIL: {data.failing.length}銘柄</span>
            {data.skipped.length > 0 && (
              <span className="text-slate-400">スキップ: {data.skipped.length}銘柄</span>
            )}
            <span className="ml-auto text-xs text-slate-300">{data.screenedAt} 実行</span>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span className="font-medium text-slate-500">条件:</span>
            {['①CFマージン', '②EPS成長', '③CFPS成長', '④売上成長', '⑤CFPS>EPS'].map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>

          {/* PASS */}
          {data.passing.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-700">
                PASS 銘柄 — 5条件すべてクリア
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {data.passing.map((item) => (
                  <ResultCard key={item.ticker} item={item} onSelect={onSelect} />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">現時点でPASS銘柄はありません。</p>
          )}

          {/* FAIL (collapsible) */}
          {data.failing.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none text-xs text-slate-400 hover:text-slate-600">
                FAIL銘柄を表示 ({data.failing.length}件) ▼
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {data.failing.map((item) => (
                  <ResultCard key={item.ticker} item={item} onSelect={onSelect} />
                ))}
              </div>
            </details>
          )}

          {/* Skipped */}
          {data.skipped.length > 0 && (
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              データ不足のためスキップ: {data.skipped.map((s) => s.ticker).join(', ')}
              （新規上場等でデータが3期分揃っていない銘柄です）
            </div>
          )}

          {/* Re-run */}
          <div className="text-center">
            <button
              onClick={run}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              再実行（キャッシュ期限前はAPIを消費しません）
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
