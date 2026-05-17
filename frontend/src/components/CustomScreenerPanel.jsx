import { useState } from 'react';
import { fetchCustomScreener, fetchCupHandleScanner } from '../api.js';
import Chip, { ChipGroup } from './ui/Chip.jsx';

const CONDITION_SHORT = ['CF率', 'EPS', 'CFPS', '売上', 'CF>EPS'];

// Cup-Handle Phase 2.4 (multi-review 6 体合議 verdict)
// filter chip 4 個: 全て / ファンダ / Cup-Handle / 両方 (両方は Premium lock)
const SCANNER_FILTERS = [
  { key: 'funda', label: 'ファンダ', mobile: 'ファンダ' },
  { key: 'cup',   label: 'Cup-Handle', mobile: 'Cup' },
  { key: 'both',  label: 'ファンダ ∩ Cup', mobile: '両方', premium: true },
];

const CUP_STATE_LABEL = {
  formation: '形成中',
  formation_market_weak: '形成中・市場待機',
  breakout_pending: 'ブレイクアウト待機',
  breakout_confirmed: 'ブレイクアウト確定',
};

const CUP_STATE_TONE = {
  formation: 'muted',
  formation_market_weak: 'muted',
  breakout_pending: 'warning',
  breakout_confirmed: 'gain',
};

function ConditionDots({ conditions = [], showLabels = false }) {
  return (
    <div className="flex flex-wrap gap-1">
      {conditions.map((c, i) => (
        <span
          key={i}
          title={c.name}
          className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
            c.passed ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-400'
          }`}
        >
          {c.passed ? '✓' : '✕'}
          {showLabels && <span className="hidden sm:inline">{CONDITION_SHORT[i]}</span>}
        </span>
      ))}
    </div>
  );
}

function ResultCard({ item, onSelect }) {
  const passCount = item.passedCount ?? item.conditions?.filter((c) => c.passed).length ?? 0;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 transition hover:border-slate-400">
      {/* Main row — always visible */}
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={() => onSelect(item.ticker)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold text-slate-900">{item.ticker}</span>
            {item.companyName && (
              <span className="truncate text-xs text-slate-400 hidden sm:inline">
                {item.companyName}
              </span>
            )}
          </div>
        </button>

        {/* Pass count badge */}
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${
            item.overallPass ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {passCount}/5
        </span>

        {/* Expand toggle — mobile only */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded p-1 text-xs text-slate-400 hover:text-slate-600 sm:hidden"
          aria-label="条件詳細を展開"
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {/* Condition dots — always visible on desktop, toggle on mobile */}
      <div className={`px-3 pb-3 ${expanded ? 'block' : 'hidden sm:block'}`}>
        <ConditionDots conditions={item.conditions} showLabels />
      </div>
    </div>
  );
}

function CupScannerResults({ data, onSelect, onUpgrade, filterKey }) {
  if (!data) {
    return (
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
        スキャン中...
      </div>
    );
  }
  if (data.error) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-600">
        スキャン失敗: {data.error}
      </div>
    );
  }

  const items = data.items || [];
  const totalCount = data.total_count || 0;
  const visibleCount = data.visible_count || items.length;
  const isPremium = !!data.is_premium;
  const filterLabel = filterKey === 'both' ? 'ファンダ ∩ Cup-Handle' : 'Cup-Handle';

  if (totalCount === 0) {
    return (
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-500">
        現在 {filterLabel} 該当銘柄はありません (nightly scan は UTC 23:00 = JST 8:00 に実行)
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold text-slate-700">
          {filterLabel}: 全 {totalCount} 件
        </span>
        {!isPremium && totalCount > visibleCount && (
          <span className="text-xs text-slate-500">
            ({visibleCount} 件公開 / 残り {totalCount - visibleCount} 件 Premium)
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item, i) => (
          <CupResultCard
            key={`${item.ticker || 'masked'}-${i}`}
            item={item}
            onSelect={onSelect}
            masked={item._masked === true}
          />
        ))}
      </div>

      {!isPremium && totalCount > visibleCount && (
        <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            残り {totalCount - visibleCount} 件 + 毎営業日 email 通知
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Premium ¥1,800/月 で全銘柄 + Pivot 価格 + nightly scan 通知を解放。
          </p>
          {onUpgrade && (
            <button
              onClick={onUpgrade}
              className="mt-3 inline-flex items-center rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              Premium にアップグレード
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CupResultCard({ item, onSelect, masked = false }) {
  const ticker = item.ticker;
  const state = item.state;
  const stateLabel = CUP_STATE_LABEL[state] || '—';
  const stateTone = CUP_STATE_TONE[state] || 'muted';
  const pivotPrice = item?.payload?.pivot?.price;
  const pivotStr = typeof pivotPrice === 'number' ? `$${pivotPrice.toFixed(2)}` : '—';

  return (
    <div className={`rounded-xl border border-slate-200 transition hover:border-slate-400 ${masked ? 'pointer-events-none' : ''}`}>
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={() => !masked && onSelect && onSelect(ticker)}
          className="min-w-0 flex-1 text-left"
          disabled={masked}
        >
          <div className="flex items-baseline gap-1.5">
            <span className={`text-sm font-bold ${masked ? 'text-slate-400 blur-[3px] select-none' : 'text-slate-900'}`}>
              {ticker}
            </span>
            {item.company_name && (
              <span className="truncate text-xs text-slate-400 hidden sm:inline">
                {item.company_name}
              </span>
            )}
          </div>
          {!masked && state && (
            <div className="mt-1.5">
              <Chip size="xs" variant="display" tone={stateTone}>
                ☕ {stateLabel}
              </Chip>
              {pivotPrice != null && (
                <span className="ml-2 text-xs text-slate-500">Pivot: {pivotStr}</span>
              )}
            </div>
          )}
        </button>
        {item.passed_count != null && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold bg-green-100 text-green-700">
            {item.passed_count}/5
          </span>
        )}
      </div>
    </div>
  );
}

export default function CustomScreenerPanel({ onSelect, onUpgrade }) {
  const [phase, setPhase] = useState('idle'); // idle | loading | done | error
  const [data, setData] = useState(null);
  const [cupData, setCupData] = useState(null);
  const [activeFilter, setActiveFilter] = useState(null); // null | 'funda' | 'cup' | 'both'
  const [error, setError] = useState(null);

  async function run() {
    setPhase('loading');
    setError(null);
    setCupData(null);
    setActiveFilter(null);
    try {
      const result = await fetchCustomScreener();
      setData(result);
      setPhase('done');
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  }

  async function runCupFilter(filterKey) {
    setActiveFilter(filterKey);
    setCupData(null);
    if (filterKey === 'funda') return; // 既存 data でカバー、 cup endpoint 呼ばない
    try {
      const result = await fetchCupHandleScanner(filterKey);
      setCupData(result);
    } catch (e) {
      setCupData({ error: e.message, items: [], total_count: 0, visible_count: 0, is_premium: false });
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="section-label">ファンダメンタル5条件スクリーナー</h3>
        <p className="mt-0.5 text-xs text-slate-400">
          ファンダメンタル5条件で自動判定
        </p>
      </div>

      {/* 検索対象範囲の注記（Phase A 完了時に削除予定） */}
      <div className="mb-3 rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
        ⚠️ 現在は S&amp;P500 主要銘柄を対象（順次拡大予定）
      </div>

      {/* Cache notice */}
      {data && (
        <div className="mb-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
          結果は15分間キャッシュされます
        </div>
      )}

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

          {/* Cup-Handle filter chips (Phase 2.4、 multi-review verdict D + 7) */}
          <div className="flex flex-wrap items-center gap-2">
            <ChipGroup prefix="絞り込み:" gap="normal" ariaLabel="スキャナー絞り込み">
              <Chip
                size="sm"
                variant="filter"
                tone={activeFilter === null ? 'accent' : 'muted'}
                pressed={activeFilter === null}
                onClick={() => { setActiveFilter(null); setCupData(null); }}
              >
                全て
              </Chip>
              {SCANNER_FILTERS.map((f) => {
                const isActive = activeFilter === f.key;
                return (
                  <Chip
                    key={f.key}
                    size="sm"
                    variant="filter"
                    tone={isActive ? 'accent' : 'muted'}
                    pressed={isActive}
                    onClick={() => runCupFilter(f.key)}
                    title={f.premium ? 'Premium ¥1,800/月 限定 (ファンダ ∩ Cup-Handle AND 検索)\nPro tier はファンダのみ / Cup のみ 個別 scan 可' : undefined}
                  >
                    {f.premium ? '🔒 ' : ''}{f.label}
                  </Chip>
                );
              })}
            </ChipGroup>
          </div>

          {/* Cup-Handle scanner results (activeFilter が cup / both のとき表示) */}
          {activeFilter && activeFilter !== 'funda' && (
            <CupScannerResults
              data={cupData}
              onSelect={onSelect}
              onUpgrade={onUpgrade}
              filterKey={activeFilter}
            />
          )}

          {/* Legend — desktop only */}
          <div className="hidden sm:flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span className="font-medium text-slate-500">条件:</span>
            {['①CF率≥15%', '②EPS成長', '③CFPS成長', '④売上成長', '⑤CFPS>EPS'].map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>

          {/* PASS */}
          {data.passing.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-700">
                PASS 銘柄 — 5条件すべてクリア
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
