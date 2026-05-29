import { useEffect, useState } from 'react';
import { ChartCandlestick, Crown, TrendingUp } from 'lucide-react';
import { fetchCustomScreener, fetchCupHandleScanner, fetchRsScanner } from '../api.js';
import Chip, { ChipGroup } from './ui/Chip.jsx';

const CONDITION_SHORT = ['CF率', 'EPS', 'CFPS', '売上', 'CF>EPS'];

// v120 hotfix v3 (user dogfood 2 件 fix + 金融 sub-agent verdict 反映):
// 1. 「ファンダ」 chip 削除 = 「全て」 (default = 5 条件 PASS 表示) と結果同一の矛盾解消
// 2. 「両方」 → 「ファンダ&カップ」 復活 = 3 条件中 2 条件 を意味する曖昧さ解消
// v122 (handover v121 backlog): 「O'Neil 完全」 (ファンダ AND カップ AND RS80+) chip 追加
//   金融 sub-agent (Opus) verdict: 「両立は希少だが価値極めて高い、 月 5-15 銘柄、 独自プロトコル最強 setup」
//   実装は frontend intersection (backend は 'both' + 'rs' 既存 endpoint 流用、 cost ゼロ)
const SCANNER_FILTERS = [
  { key: 'cup',   label: 'カップ' },
  { key: 'rs',    label: 'RS強', titleExtra: 'Relative Strength ≥ 80 (CAN SLIM L 条件、 SP500 universe で上位 20%)' },
  { key: 'both',  label: 'ファンダ&カップ', premium: true, fullLabel: 'ファンダ AND Cup-Handle 複合検索' },
  { key: 'oneill', label: "O'Neil 完全", premium: true, fullLabel: "ファンダ AND Cup-Handle AND RS≥80 (William O'Neil CAN SLIM 完全)", titleExtra: '打診買い 3 点セット (ファンダメンタル5条件 × Cup-Handle × Relative Strength)' },
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
            c.passed ? 'bg-[color-mix(in_srgb,var(--color-gain)_18%,transparent)] text-[var(--color-gain)]' : 'bg-[color-mix(in_srgb,var(--color-loss)_12%,transparent)] text-[var(--color-loss)]'
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
  // v120 Scanner design Phase 2 (UI/UX subagent verdict P1): PASS card に常時 subtle gold glow、
  // hover で card lift + halo (design_recipes.md §C-1 準拠、 Aman 級「触れる前から生きている UI」)
  const isPass = item.overallPass === true || passCount >= 5;

  return (
    <div
      className="rounded-xl border border-[var(--border)] transition-all duration-200 hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--color-accent)_40%,transparent)]"
      style={isPass ? {
        boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-gain) 25%, transparent)',
      } : undefined}
    >
      {/* Main row — always visible */}
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={() => onSelect(item.ticker)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold text-[var(--text-primary)]">{item.ticker}</span>
            {item.companyName && (
              <span className="truncate text-xs text-[var(--text-muted)] hidden sm:inline">
                {item.companyName}
              </span>
            )}
          </div>
        </button>

        {/* Pass count badge */}
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${
            item.overallPass ? 'bg-[color-mix(in_srgb,var(--color-gain)_18%,transparent)] text-[var(--color-gain)]' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
          }`}
        >
          {passCount}/5
        </span>

        {/* Expand toggle — mobile only */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded p-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] sm:hidden"
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

/**
 * v120 RS Screener Phase 1: William O'Neil CAN SLIM L 条件 (RS≥80) results.
 * 既存 _compute_rs() を SP500 universe で集約、 nightly batch + Supabase 永続化。
 * Trust Cliff 防止: universe 範囲 (SP500 N 銘柄 / 6 ヶ月 / calc_date) を明示。
 */
function RsScannerResults({ data, onSelect }) {
  if (!data) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-muted)]">
        スキャン中...
      </div>
    );
  }
  if (data.error) {
    return (
      <div className="rounded-lg border border-[var(--color-loss)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--color-loss)]">
        RS スキャン失敗: {data.error}
      </div>
    );
  }
  const items = data.items || [];
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-muted)]">
        {data.note || `RS ≥ ${data.min_percentile ?? 80} の銘柄なし (nightly batch 未実行の可能性、 明朝確認)`}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {/* Trust Cliff 防止: universe 範囲を 1 行で明示 */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
        <span>universe: SP500 {data.universe_size}銘柄 / 6 ヶ月 RS / {data.calc_date} 計算</span>
        <span className="ml-auto">CAN SLIM の L = RS ≥ {data.min_percentile} (上位 {100 - data.min_percentile}%)</span>
      </div>
      {/* v120 hotfix v3 (user dogfood): 3 列 grid → 1 列縦並び + ランキング番号で順位を即視認.
          各 row は左端 #順位 / 中央 ticker + SPY 比 / 右端 RS percentile badge の 3 column layout. */}
      <div className="flex flex-col gap-1.5">
        {items.map((item, idx) => {
          const pct = Number(item.universe_percentile ?? 0);
          const rsDiff = Number(item.rs_vs_spy_pct ?? 0);
          const rank = idx + 1;
          return (
            <button
              key={item.ticker}
              onClick={() => onSelect(item.ticker)}
              className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--color-gain)]"
              style={{
                background: rank <= 3
                  ? 'color-mix(in srgb, var(--color-gain) 10%, transparent)'
                  : 'color-mix(in srgb, var(--color-gain) 4%, transparent)',
              }}
              title={`#${rank} / SP500 universe 内 上位 ${100 - pct}% / SPY 比 ${rsDiff > 0 ? '+' : ''}${rsDiff.toFixed(1)}pt (6 ヶ月)`}
            >
              {/* 左端: ランキング番号 (上位 3 は gold、 4-10 は accent、 残り muted) */}
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums"
                style={{
                  background: rank <= 3
                    ? 'color-mix(in srgb, var(--color-gold) 18%, transparent)'
                    : rank <= 10
                      ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)'
                      : 'var(--bg-subtle)',
                  color: rank <= 3
                    ? 'var(--color-gold)'
                    : rank <= 10
                      ? 'var(--color-accent)'
                      : 'var(--text-muted)',
                }}
              >
                {rank}
              </span>
              {/* 中央: ticker + SPY 比 */}
              <div className="flex flex-1 min-w-0 flex-col">
                <span className="text-sm font-bold text-[var(--text-primary)]">{item.ticker}</span>
                <span className="text-xs text-[var(--text-muted)] tabular-nums">
                  SPY 比 {rsDiff > 0 ? '+' : ''}{rsDiff.toFixed(1)}pt (6 ヶ月)
                </span>
              </div>
              {/* 右端: RS percentile badge */}
              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums"
                style={{
                  color: 'var(--color-gain)',
                  background: 'color-mix(in srgb, var(--color-gain) 18%, transparent)',
                }}
              >
                RS {pct}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CupScannerResults({ data, onSelect, onUpgrade, filterKey }) {
  if (!data) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-muted)]">
        スキャン中...
      </div>
    );
  }
  if (data.error) {
    return (
      <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-loss)_25%,transparent)] bg-[color-mix(in_srgb,var(--color-loss)_8%,transparent)] p-3 text-xs text-[var(--color-loss)]">
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
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-sm text-[var(--text-muted)]">
        現在 {filterLabel} 該当銘柄はありません (nightly scan は UTC 23:00 = JST 8:00 に実行)
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold text-[var(--text-primary)]">
          {filterLabel}: 全 {totalCount} 件
        </span>
        {!isPremium && totalCount > visibleCount && (
          <span className="text-xs text-[var(--text-muted)]">
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
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--color-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_8%,transparent)] p-4">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            残り {totalCount - visibleCount} 件 + 毎営業日 email 通知
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Premium ¥1,800/月 で全銘柄 + Pivot 価格 + nightly scan 通知を解放。
          </p>
          {onUpgrade && (
            <button
              onClick={onUpgrade}
              className="mt-3 inline-flex items-center rounded-lg bg-[var(--color-warning)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-card)] hover:bg-[color-mix(in_srgb,var(--color-warning)_85%,black)]"
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
    <div
      className={`rounded-xl border border-[var(--border)] transition-all duration-200 ${masked ? 'pointer-events-none' : 'hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--color-accent)_40%,transparent)]'}`}
      style={state === 'breakout_confirmed' ? {
        boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-gain) 25%, transparent)',
      } : undefined}
    >
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={() => !masked && onSelect && onSelect(ticker)}
          className="min-w-0 flex-1 text-left"
          disabled={masked}
        >
          <div className="flex items-baseline gap-1.5">
            <span className={`text-sm font-bold ${masked ? 'text-[var(--text-muted)] blur-[3px] select-none' : 'text-[var(--text-primary)]'}`}>
              {ticker}
            </span>
            {item.company_name && (
              <span className="truncate text-xs text-[var(--text-muted)] hidden sm:inline">
                {item.company_name}
              </span>
            )}
          </div>
          {!masked && state && (
            <div className="mt-1.5">
              <Chip size="xs" variant="display" tone={stateTone}>
                {/* v127 (5/29): Mountain → ChartCandlestick (StockPriceChart と SSOT 統一、 Cup-Handle = チャート形状を直伝) */}
                <ChartCandlestick size={11} strokeWidth={1.75} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 3 }} />
                {stateLabel}
              </Chip>
              {pivotPrice != null && (
                <span className="ml-2 text-xs text-[var(--text-muted)]">Pivot: {pivotStr}</span>
              )}
            </div>
          )}
        </button>
        {item.passed_count != null && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold bg-[color-mix(in_srgb,var(--color-gain)_18%,transparent)] text-[var(--color-gain)]">
            {item.passed_count}/5
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * v122 O'Neil 完全 (ファンダ AND Cup-Handle AND RS≥80) 結果表示.
 * frontend intersection (backend は 'both' + 'rs' 既存 endpoint 流用、 cost ゼロ)。
 * 月 5-15 銘柄想定 (金融 sub-agent verdict)、 0 件時は丁寧な「条件全て稀少」 表示。
 */
function OneillScannerResults({ data, onSelect, onUpgrade }) {
  if (!data) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-muted)]">
        3 条件 (ファンダ × Cup × RS) 並列スキャン中...
      </div>
    );
  }
  if (data.error) {
    return (
      <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-loss)_25%,transparent)] bg-[color-mix(in_srgb,var(--color-loss)_8%,transparent)] p-3 text-xs text-[var(--color-loss)]">
        スキャン失敗: {data.error}
      </div>
    );
  }

  const items = data.items || [];
  const isPremium = !!data.is_premium;

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-[color-mix(in_srgb,var(--color-gold)_25%,transparent)] bg-[color-mix(in_srgb,var(--color-gold)_6%,transparent)] p-4">
        <div className="flex items-center gap-2 mb-2">
          <Crown size={14} strokeWidth={1.75} style={{ color: 'var(--color-gold)' }} aria-hidden />
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            現在 O'Neil 完全 該当銘柄はありません
          </p>
        </div>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          ファンダメンタル5条件 PASS かつ Cup-Handle 形成中 かつ RS ≥ 80 を全て満たす銘柄は希少です
          (月 5-15 銘柄目安)。 nightly scan (JST 8:00-8:30) の翌朝に再 check 推奨。
        </p>
        <p className="text-[10px] text-[var(--text-muted)] mt-2 tabular-nums">
          内訳: ファンダ∩Cup {data.both_total} 件 / RS≥80 {data.rs_total} 件
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Crown size={14} strokeWidth={1.75} style={{ color: 'var(--color-gold)' }} aria-hidden />
        <span className="font-semibold text-[var(--text-primary)]">
          O'Neil 完全: 全 {items.length} 件
        </span>
        <span className="text-[10px] text-[var(--text-muted)] tabular-nums ml-auto">
          ファンダ∩Cup {data.both_total} / RS≥80 {data.rs_total}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item, i) => (
          <OneillResultCard
            key={`${item.ticker || 'masked'}-${i}`}
            item={item}
            onSelect={onSelect}
            masked={item._masked === true}
          />
        ))}
      </div>

      {!isPremium && (
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--color-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_8%,transparent)] p-4">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Premium ¥1,800/月 で O'Neil 完全 + 毎営業日 email 通知
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            打診買い 3 点セット (ファンダ × Cup-Handle × RS≥80) を全銘柄解放。
          </p>
          {onUpgrade && (
            <button
              onClick={onUpgrade}
              className="mt-3 inline-flex items-center rounded-lg bg-[var(--color-warning)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-card)] hover:bg-[color-mix(in_srgb,var(--color-warning)_85%,black)]"
            >
              Premium にアップグレード
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function OneillResultCard({ item, onSelect, masked = false }) {
  const ticker = item.ticker;
  const state = item.state;
  const stateLabel = CUP_STATE_LABEL[state] || '—';
  const stateTone = CUP_STATE_TONE[state] || 'muted';
  const pivotPrice = item?.payload?.pivot?.price;
  const pivotStr = typeof pivotPrice === 'number' ? `$${pivotPrice.toFixed(2)}` : '—';
  const rsPct = item.rs_universe_percentile;

  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${masked ? 'pointer-events-none border-[var(--border)]' : 'border-[color-mix(in_srgb,var(--color-gold)_30%,transparent)] hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--color-gold)_60%,transparent)]'}`}
      style={!masked ? {
        boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-gold) 22%, transparent), 0 1px 3px color-mix(in srgb, var(--color-gold) 8%, transparent)',
      } : undefined}
    >
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={() => !masked && onSelect && onSelect(ticker)}
          className="min-w-0 flex-1 text-left"
          disabled={masked}
        >
          <div className="flex items-baseline gap-1.5">
            <Crown size={11} strokeWidth={1.75} style={{ color: 'var(--color-gold)', flexShrink: 0 }} aria-hidden />
            <span className={`text-sm font-bold ${masked ? 'text-[var(--text-muted)] blur-[3px] select-none' : 'text-[var(--text-primary)]'}`}>
              {ticker}
            </span>
            {item.company_name && (
              <span className="truncate text-xs text-[var(--text-muted)] hidden sm:inline">
                {item.company_name}
              </span>
            )}
          </div>
          {!masked && state && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Chip size="xs" variant="display" tone={stateTone}>
                {/* v127: Mountain → ChartCandlestick (StockPriceChart と SSOT 統一) */}
                <ChartCandlestick size={11} strokeWidth={1.75} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 3 }} />
                {stateLabel}
              </Chip>
              {pivotPrice != null && (
                <span className="text-xs text-[var(--text-muted)]">Pivot: {pivotStr}</span>
              )}
              {typeof rsPct === 'number' && (
                <span
                  className="ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                  style={{
                    color: 'var(--color-gain)',
                    background: 'color-mix(in srgb, var(--color-gain) 16%, transparent)',
                  }}
                >
                  RS {rsPct}
                </span>
              )}
            </div>
          )}
        </button>
        {item.passed_count != null && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold bg-[color-mix(in_srgb,var(--color-gain)_18%,transparent)] text-[var(--color-gain)]">
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
  const [rsData, setRsData] = useState(null); // v120 RS Screener
  const [oneillData, setOneillData] = useState(null); // v122 O'Neil 完全 (frontend intersection)
  const [activeFilter, setActiveFilter] = useState(null); // null | 'funda' | 'cup' | 'rs' | 'both' | 'oneill'
  const [error, setError] = useState(null);

  async function run() {
    setPhase('loading');
    setError(null);
    setCupData(null);
    setRsData(null);
    setOneillData(null);
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

  // v100 Sprint A-B (multi-review 6 体合議 verdict、 UI/UX + 金融 + マーケター 3 体一致):
  //   mount 時に auto-run、 「button 押さないと何も見えない」 を解消。
  //   backend 15 分 TTL cache 済のため再 fetch cost なし。 retention / CVR 最大改善。
  useEffect(() => {
    run();
  }, []);

  async function runCupFilter(filterKey) {
    setActiveFilter(filterKey);
    setCupData(null);
    setRsData(null);
    setOneillData(null);
    if (filterKey === 'funda') return; // 既存 data でカバー、 cup endpoint 呼ばない
    if (filterKey === 'rs') {
      // v120 RS Screener: 別 endpoint (Supabase DB SELECT only、 高速)
      try {
        const result = await fetchRsScanner(80, 50);
        setRsData(result);
      } catch (e) {
        setRsData({ error: e.message, items: [], universe_size: 0 });
      }
      return;
    }
    if (filterKey === 'oneill') {
      // v122 O'Neil 完全: 'both' (ファンダ ∩ カップ) と RS≥80 を並列 fetch して frontend intersection
      try {
        const [bothResult, rsResult] = await Promise.all([
          fetchCupHandleScanner('both').catch((e) => ({ error: e.message, items: [], total_count: 0, visible_count: 0, is_premium: false })),
          fetchRsScanner(80, 500).catch((e) => ({ error: e.message, items: [], universe_size: 0 })),
        ]);
        const rsTickers = new Set((rsResult.items || []).map((r) => (r.ticker || '').toUpperCase()));
        const rsPctByTicker = new Map((rsResult.items || []).map((r) => [(r.ticker || '').toUpperCase(), r]));
        const intersected = (bothResult.items || []).filter((it) => {
          const t = (it.ticker || '').toUpperCase();
          return t && rsTickers.has(t);
        }).map((it) => ({
          ...it,
          rs_universe_percentile: rsPctByTicker.get((it.ticker || '').toUpperCase())?.universe_percentile,
          rs_vs_spy_pct: rsPctByTicker.get((it.ticker || '').toUpperCase())?.rs_vs_spy_pct,
        }));
        setOneillData({
          items: intersected,
          total_count: intersected.length,
          is_premium: !!bothResult.is_premium,
          both_total: bothResult.total_count || 0,
          rs_total: (rsResult.items || []).length,
          rs_universe_size: rsResult.universe_size || 0,
          rs_calc_date: rsResult.calc_date,
          error: bothResult.error || rsResult.error || null,
        });
      } catch (e) {
        setOneillData({ error: e.message, items: [], total_count: 0, is_premium: false });
      }
      return;
    }
    try {
      const result = await fetchCupHandleScanner(filterKey);
      setCupData(result);
    } catch (e) {
      setCupData({ error: e.message, items: [], total_count: 0, visible_count: 0, is_premium: false });
    }
  }

  return (
    <section className="rounded-2xl bg-[var(--bg-card)] p-6 shadow-[var(--shadow-sm)]">
      <div className="mb-4">
        <h3 className="section-label">ファンダメンタル5条件スクリーナー</h3>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          ファンダメンタル5条件で自動判定
        </p>
      </div>

      {/* v100 Sprint A-C (multi-review 6 体合議): grace 注記 2 件削除。
          ⚠️ S&P500 限定注記 + 15 分キャッシュ注記は 5 原則 §1 読み手の負担増。
          v100 commit 59925ea で SP500_SAMPLE 補完済、 user に意識させる必要なし。 */}

      {/* Idle */}
      {phase === 'idle' && (
        <button
          onClick={run}
          className="w-full rounded-lg bg-[var(--text-primary)] py-2.5 text-sm font-semibold text-[var(--bg-card)] hover:bg-[var(--text-secondary)]"
        >
          スクリーニングを実行
        </button>
      )}

      {/* Loading — v120 Scanner design Phase 4 (UI/UX subagent P5): shimmer skeleton で
          card shape を予告、 30 秒待機の体感速度向上 (5 原則 §5 図解で認知コスト↓). */}
      {phase === 'loading' && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-sm font-medium text-[var(--text-secondary)]">スクリーニング中...</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">財務データを取得・分析しています（約 30 秒）</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-16 rounded-xl"
                style={{
                  background: 'linear-gradient(90deg, var(--bg-subtle) 0%, var(--bg-card) 50%, var(--bg-subtle) 100%)',
                  backgroundSize: '200% 100%',
                  animation: `dsShimmer 1.6s ease-in-out infinite`,
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div className="space-y-3">
          <div className="rounded-lg bg-[color-mix(in_srgb,var(--color-loss)_10%,transparent)] p-3 text-sm text-[var(--color-loss)]">{error}</div>
          <button
            onClick={run}
            className="w-full rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          >
            再試行
          </button>
        </div>
      )}

      {/* Results */}
      {phase === 'done' && data && (
        <div className="space-y-5">
          {/* Summary bar — v120 Scanner design refresh Phase 1 (UI/UX subagent verdict):
              フラットテキスト → pill badge で数値を主役に。
              PASS は gain tone 強調 + 数値 text-xl で 2 秒視認、 FAIL/スキップ は muted。 */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div
              className="flex items-center gap-2 rounded-xl border px-3 py-1.5"
              style={{
                background: 'color-mix(in srgb, var(--color-gain) 10%, transparent)',
                borderColor: 'color-mix(in srgb, var(--color-gain) 25%, transparent)',
              }}
            >
              <span className="text-xs font-medium" style={{ color: 'var(--color-gain)' }}>PASS</span>
              <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--color-gain)' }}>
                {data.passing.length}
              </span>
              <span className="text-xs opacity-70" style={{ color: 'var(--color-gain)' }}>銘柄</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-1.5">
              <span className="text-xs font-medium text-[var(--text-muted)]">FAIL</span>
              <span className="text-base font-semibold tabular-nums text-[var(--text-secondary)]">
                {data.failing.length}
              </span>
              <span className="text-xs text-[var(--text-muted)]">銘柄</span>
            </div>
            {data.skipped.length > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-1.5">
                <span className="text-xs font-medium text-[var(--text-muted)]">スキップ</span>
                <span className="text-base font-semibold tabular-nums text-[var(--text-secondary)]">
                  {data.skipped.length}
                </span>
              </div>
            )}
            <span className="ml-auto text-xs text-[var(--text-muted)]">{data.screenedAt} 実行</span>
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
                    title={f.premium ? `${f.fullLabel || 'Premium 限定'}\nPremium ¥1,800/月 限定 (Pro tier はファンダのみ / カップのみ 個別 scan 可)${f.titleExtra ? `\n\n${f.titleExtra}` : ''}` : f.titleExtra}
                  >
                    {/* v120 hotfix (user dogfood + icon-brand-consistency): 🔒 emoji の安っぽさを Crown 格調シンボルへ。
                        Aman 級ブランド世界観整合、 Pro 限定 = 「王冠 = 王者の選別」 メタファー */}
                    {f.premium && (
                      <Crown
                        size={11}
                        strokeWidth={1.75}
                        aria-hidden
                        style={{ color: 'var(--color-gold)', marginRight: 4, verticalAlign: '-1px' }}
                      />
                    )}
                    {/* v120 RS Screener: 'rs' chip に TrendingUp icon で「相対強度」 視覚化 */}
                    {f.key === 'rs' && (
                      <TrendingUp
                        size={11}
                        strokeWidth={2}
                        aria-hidden
                        style={{ color: 'var(--color-gain)', marginRight: 4, verticalAlign: '-1px' }}
                      />
                    )}
                    {f.label}
                  </Chip>
                );
              })}
            </ChipGroup>
          </div>

          {/* v120 RS Screener results (activeFilter === 'rs' のとき表示) */}
          {activeFilter === 'rs' && (
            <RsScannerResults data={rsData} onSelect={onSelect} />
          )}

          {/* v122 O'Neil 完全 results (activeFilter === 'oneill' のとき表示) */}
          {activeFilter === 'oneill' && (
            <OneillScannerResults data={oneillData} onSelect={onSelect} onUpgrade={onUpgrade} />
          )}

          {/* Cup-Handle scanner results (activeFilter が cup / both のとき表示) */}
          {activeFilter && activeFilter !== 'funda' && activeFilter !== 'rs' && activeFilter !== 'oneill' && (
            <CupScannerResults
              data={cupData}
              onSelect={onSelect}
              onUpgrade={onUpgrade}
              filterKey={activeFilter}
            />
          )}

          {/* Legend — desktop only */}
          <div className="hidden sm:flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
            <span className="font-medium text-[var(--text-muted)]">条件:</span>
            {['①CF率≥15%', '②EPS成長', '③CFPS成長', '④売上成長', '⑤CFPS>EPS'].map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>

          {/* PASS */}
          {data.passing.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-gain)]">
                PASS 銘柄 — 5条件すべてクリア
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.passing.map((item) => (
                  <ResultCard key={item.ticker} item={item} onSelect={onSelect} />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">現時点でPASS銘柄はありません。</p>
          )}

          {/* FAIL (collapsible) */}
          {data.failing.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition">
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
            <div className="rounded-lg bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-muted)]">
              データ不足のためスキップ: {data.skipped.map((s) => s.ticker).join(', ')}
              （新規上場等でデータが3期分揃っていない銘柄です）
            </div>
          )}

          {/* Re-run */}
          <div className="text-center">
            <button
              onClick={run}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              再実行（キャッシュ期限前はAPIを消費しません）
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
