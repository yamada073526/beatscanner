import { useEffect, useState, useMemo } from 'react';
import { ChartCandlestick, Crown, TrendingUp, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { fetchCustomScreener, fetchCupHandleScanner, fetchRsScanner, fetchUniverseMeta, fetchCanslimScanner } from '../api.js';
import Chip, { ChipGroup } from './ui/Chip.jsx';
// Sprint 3: 市場局面バナーを ScreenerPane と共有 (FtdRegimeBanner.jsx が SSOT、二重定義なし)
import FtdRegimeBanner from '../features/workspace/FtdRegimeBanner.jsx';

// v159 SPEC_2026-06-03 Part B: RS スクリーナ結果の セクター / 時価総額 絞り込み (client-side)。
// universe-meta endpoint (純データ、 §38/景表法 risk なし) を起動時 1 回 fetch → ticker join。
// FMP /stable/company-screener の sector (英語) → 日本語表示ラベル。
const SECTOR_LABEL_JP = {
  'Technology': 'テクノロジー',
  'Healthcare': 'ヘルスケア',
  'Financial Services': '金融',
  'Consumer Cyclical': '一般消費財',
  'Communication Services': '通信',
  'Industrials': '資本財',
  'Consumer Defensive': '生活必需品',
  'Energy': 'エネルギー',
  'Basic Materials': '素材',
  'Real Estate': '不動産',
  'Utilities': '公益',
};
const SECTOR_OTHER = 'その他';
function sectorLabelJp(sector) {
  if (!sector) return SECTOR_OTHER;
  return SECTOR_LABEL_JP[sector] || SECTOR_OTHER;
}

// 時価総額帯 (backend _mcap_band と 1:1 mirror)。 hint は数値 tooltip (finance verdict)。
const MCAP_BANDS = [
  { key: 'mega', label: '大型', hint: '時価総額 $10B 以上' },
  { key: 'mid', label: '中型', hint: '時価総額 $2B〜$10B' },
  { key: 'small', label: '小型', hint: '時価総額 $2B 未満' },
];

// universe-meta の module-scope cache。 tab 切替で RsScannerResults が unmount/remount しても
// 再 fetch しない (DiagramCard remount cache 教訓と同 pattern、 24h backend cache と二重防御)。
let _universeMetaCache = null; // { asOf, count, meta }
let _universeMetaPromise = null;
function loadUniverseMeta() {
  if (_universeMetaCache) return Promise.resolve(_universeMetaCache);
  if (_universeMetaPromise) return _universeMetaPromise;
  _universeMetaPromise = fetchUniverseMeta()
    .then((res) => {
      _universeMetaCache = res && res.meta ? res : { asOf: 0, count: 0, meta: {} };
      return _universeMetaCache;
    })
    .catch(() => {
      _universeMetaPromise = null; // 失敗時は次回 retry を許可
      return { asOf: 0, count: 0, meta: {} };
    });
  return _universeMetaPromise;
}

const CONDITION_SHORT = ['CF率', 'EPS', 'CFPS', '売上', 'CF>EPS'];

// v120 hotfix v3 (user dogfood 2 件 fix + 金融 sub-agent verdict 反映):
// 1. 「ファンダ」 chip 削除 = 「全て」 (default = 5 条件 PASS 表示) と結果同一の矛盾解消
// 2. 「両方」 → 「ファンダ&カップ」 復活 = 3 条件中 2 条件 を意味する曖昧さ解消
// v122 (handover v121 backlog): 「O'Neil 完全」 (ファンダ AND カップ AND RS80+) chip 追加
//   金融 sub-agent (Opus) verdict: 「両立は希少だが価値極めて高い、 月 5-15 銘柄、 独自プロトコル最強 setup」
//   実装は frontend intersection (backend は 'both' + 'rs' 既存 endpoint 流用、 cost ゼロ)
const SCANNER_FILTERS = [
  { key: 'cup',   label: 'カップ' },
  // v141 D4 Sprint2 (3体合議 QA verdict、 #1 Trust Cliff リスク): cup scan を frontend で breakout_confirmed のみ抽出。
  // state machine 流れ (形成中 → ブレイクアウト確定) で 'cup' の直後に配置。 premium 限定 (理由は runCupFilter / CupScannerResults 参照)。
  { key: 'breakout', label: 'ブレイクアウト', premium: true, fullLabel: 'Cup-Handle ブレイクアウト確定 (Pivot 上抜け + 出来高確認)', titleExtra: '打診買いゾーン: Pivot 価格を出来高を伴って上抜けた確定銘柄のみ。 ATH 追いかけ買い (extended) は除外' },
  { key: 'rs',    label: 'RS上位', titleExtra: '相対強度 ≥ 80 — 米国主要銘柄〈ETF・ファンド除く〉 universe で上位 20%' },
  { key: 'both',  label: 'ファンダ&カップ', premium: true, fullLabel: 'ファンダ AND Cup-Handle 複合検索' },
  { key: 'oneill', label: '全条件クリア', premium: true, fullLabel: 'ファンダ AND Cup-Handle AND RS≥80 AND 四半期EPS成長 (主要条件 全クリア)', titleExtra: '打診買い 主要条件セット (ファンダメンタル5条件 × Cup-Handle × Relative Strength × 四半期EPS成長 +18%以上)' },
];

const CUP_STATE_LABEL = {
  formation: '形成中',
  formation_market_weak: '形成中・市場待機',
  breakout_pending: 'ブレイクアウト待機',
  breakout_confirmed: 'ブレイクアウト確定',
  // v127 R16-3 (5/29): カップ完成間近 (左 rim へ回復中・未突破、 LLY 型)
  cup_completing: 'カップ完成間近',
  breakout_extended: 'ATH付近 extended',
};

const CUP_STATE_TONE = {
  formation: 'muted',
  formation_market_weak: 'muted',
  breakout_pending: 'warning',
  breakout_confirmed: 'gain',
  cup_completing: 'accent',
  breakout_extended: 'muted',
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

        {/* 条件クリア数 badge — 分母「5条件中 N クリア」で明示 (Sprint 1 Trust Cliff 対応) */}
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${
            item.overallPass ? 'bg-[color-mix(in_srgb,var(--color-gain)_18%,transparent)] text-[var(--color-gain)]' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
          }`}
          title={`5条件中 ${passCount} 条件クリア`}
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
 * v159 SPEC Part B: sector/時価総額 絞り込みの共有 hook。
 * RS スクリーナの inline 実装 (3体合議 SHIP-WITH-MINOR で承認) を抽出し、 Cup タブにも再利用。
 * 挙動不変: メタ未取得 ticker は facet count・filter 双方で除外 (count 厳密一致)、
 *   sector は実セクター top6 + その他、 sector AND mcap (各次元内 OR)。
 * @param {Array} rawItems - 各 item は { ticker } を持つ (masked item は ticker なし → 自動除外)
 */
function useMetaFilter(rawItems, universeMeta) {
  const [sectorFilter, setSectorFilter] = useState([]); // [] = 全セクター
  const [mcapFilter, setMcapFilter] = useState([]); // [] = 全帯
  const [filterOpen, setFilterOpen] = useState(false); // 折りたたみ default 閉
  const metaMap = universeMeta?.meta || {};
  const items = rawItems || [];

  const sectorFacets = useMemo(() => {
    const counts = new Map();
    for (const it of items) {
      const m = metaMap[(it.ticker || '').toUpperCase()];
      if (!m) continue; // メタ未取得は filter 時も除外 → facet count を絞り込み結果と厳密一致 (Trust Cliff)
      const label = sectorLabelJp(m.sector);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    const realEntries = [...counts.entries()]
      .filter(([k]) => k !== SECTOR_OTHER)
      .sort((a, b) => b[1] - a[1]);
    const top = realEntries.slice(0, 6);
    const restCount =
      realEntries.slice(6).reduce((s, [, c]) => s + c, 0) + (counts.get(SECTOR_OTHER) || 0);
    const facets = top.map(([label, count]) => ({ label, count }));
    if (restCount > 0) facets.push({ label: SECTOR_OTHER, count: restCount });
    return facets;
  }, [items, metaMap]);
  const topSectorLabels = useMemo(
    () => sectorFacets.filter((f) => f.label !== SECTOR_OTHER).map((f) => f.label),
    [sectorFacets],
  );
  const mcapFacets = useMemo(() => {
    const counts = { mega: 0, mid: 0, small: 0 };
    for (const it of items) {
      const m = metaMap[(it.ticker || '').toUpperCase()];
      if (m?.mcapBand && counts[m.mcapBand] != null) counts[m.mcapBand] += 1;
    }
    return counts;
  }, [items, metaMap]);
  const metaReady = sectorFacets.some((f) => f.label !== SECTOR_OTHER);
  const filteredItems = useMemo(() => {
    if (!sectorFilter.length && !mcapFilter.length) return items;
    return items.filter((it) => {
      const m = metaMap[(it.ticker || '').toUpperCase()];
      if (!m) return false; // メタ未知 (masked item 含む) は一致を確認できないため絞り込み中は除外
      if (sectorFilter.length) {
        const label = sectorLabelJp(m.sector);
        const effective = topSectorLabels.includes(label) ? label : SECTOR_OTHER;
        if (!sectorFilter.includes(effective)) return false;
      }
      if (mcapFilter.length) {
        if (!m.mcapBand || !mcapFilter.includes(m.mcapBand)) return false;
      }
      return true;
    });
  }, [items, metaMap, sectorFilter, mcapFilter, topSectorLabels]);
  const activeFilterCount = sectorFilter.length + mcapFilter.length;
  const toggleSector = (label) =>
    setSectorFilter((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]));
  const toggleMcap = (key) =>
    setMcapFilter((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  const clearFilters = () => {
    setSectorFilter([]);
    setMcapFilter([]);
  };
  const asOfStr =
    universeMeta?.asOf > 0 ? new Date(universeMeta.asOf * 1000).toLocaleDateString('ja-JP') : null;
  return {
    sectorFacets, mcapFacets, metaReady, filteredItems,
    sectorFilter, mcapFilter, filterOpen, setFilterOpen,
    toggleSector, toggleMcap, clearFilters, activeFilterCount, asOfStr,
  };
}

/**
 * v159 SPEC Part B (3体合議): セクター / 時価総額 絞り込み panel (折りたたみ、 default 閉)。
 * 中立操作 (§38/景表法 risk なし)、 accent (ブランド色) で active 表現。 metaReady=false で非表示。
 */
function MetaFilterPanel({ filter }) {
  const {
    sectorFacets, mcapFacets, metaReady, sectorFilter, mcapFilter,
    filterOpen, setFilterOpen, toggleSector, toggleMcap, clearFilters, activeFilterCount, asOfStr,
  } = filter;
  if (!metaReady) return null;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)]">
      <button
        type="button"
        onClick={() => setFilterOpen((o) => !o)}
        aria-expanded={filterOpen}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--text-secondary)]"
      >
        <SlidersHorizontal size={13} strokeWidth={2} aria-hidden style={{ color: 'var(--text-muted)' }} />
        <span>セクター・時価総額で絞り込み</span>
        {activeFilterCount > 0 && (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
            style={{ background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)', color: 'var(--color-accent)' }}>
            {activeFilterCount}
          </span>
        )}
        <ChevronDown
          size={14}
          aria-hidden
          className={`ml-auto transition-transform duration-150 ${filterOpen ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-muted)' }}
        />
      </button>
      {filterOpen && (
        <div className="space-y-3 border-t border-[var(--border)] px-3 py-3">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-[var(--text-muted)]">セクター</p>
            <ChipGroup gap="tight" ariaLabel="セクター絞り込み">
              {sectorFacets.map((f) => (
                <Chip
                  key={f.label}
                  size="xs"
                  variant="filter"
                  tone={sectorFilter.includes(f.label) ? 'accent' : 'muted'}
                  pressed={sectorFilter.includes(f.label)}
                  onClick={() => toggleSector(f.label)}
                >
                  {f.label} <span className="font-semibold tabular-nums opacity-70">{f.count}</span>
                </Chip>
              ))}
            </ChipGroup>
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-[var(--text-muted)]">
              時価総額
              {asOfStr && (
                <span className="ml-1 font-normal opacity-70" title={`時価総額は ${asOfStr} 時点のデータ`}>
                  （{asOfStr} 時点）
                </span>
              )}
            </p>
            <ChipGroup gap="tight" ariaLabel="時価総額絞り込み">
              {MCAP_BANDS.map((b) => {
                // 該当 0 件の帯は non-interactive + dim で「押しても何も出ない」 誤操作を防ぐ。
                const count = mcapFacets[b.key];
                const disabled = count === 0;
                return (
                  <Chip
                    key={b.key}
                    size="xs"
                    variant="filter"
                    tone={mcapFilter.includes(b.key) ? 'accent' : 'muted'}
                    pressed={mcapFilter.includes(b.key)}
                    onClick={disabled ? undefined : () => toggleMcap(b.key)}
                    title={disabled ? `${b.hint}（該当なし）` : b.hint}
                    className={disabled ? 'opacity-40' : ''}
                  >
                    {b.label} <span className="font-semibold tabular-nums opacity-70">{count}</span>
                  </Chip>
                );
              })}
            </ChipGroup>
          </div>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-secondary)]"
            >
              絞り込みを解除
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * v120 RS Screener Phase 1: William O'Neil CAN SLIM L 条件 (RS≥80) results.
 * 既存 _compute_rs() を 米国主要銘柄 universe で集約、 nightly batch + Supabase 永続化。
 * Trust Cliff 防止: universe 範囲 (主要約N銘柄 / 6 ヶ月 / calc_date) を明示。
 * v158 (3体合議): 結果の並び替え dropdown 追加 (RSスコア順 default / SPY比順 / RS変化順)。
 * v159 SPEC Part B: sector/時価総額 絞り込みを useMetaFilter + MetaFilterPanel に抽出 (Cup と共有)。
 */
function RsScannerResults({ data, onSelect, universeMeta }) {
  // ⚠️ hooks は早期 return より前に呼ぶ (Rules of Hooks)。
  const [sortKey, setSortKey] = useState('percentile');
  const rawItems = data?.items || [];
  const hasDelta = rawItems.some((x) => x.delta_1d_percentile != null);
  // v159 SPEC Part B: セクター / 時価総額 絞り込みは共有 hook に委譲 (Cup タブと同一実装)。
  //   filter state は本 component local = tab 切替で unmount/remount → 自動 reset
  //   (RsScannerResults が activeFilter==='rs' のときだけ条件付き render される前提)。
  const filter = useMetaFilter(rawItems, universeMeta);

  const sortedItems = useMemo(() => {
    const getters = {
      percentile: (x) => Number(x.universe_percentile ?? -Infinity),
      spy: (x) => Number(x.rs_vs_spy_pct ?? -Infinity),
      delta: (x) => Number(x.delta_1d_percentile ?? -Infinity),
    };
    const get = getters[sortKey] || getters.percentile;
    return [...filter.filteredItems].sort((a, b) => get(b) - get(a));
  }, [filter.filteredItems, sortKey]);

  if (!data) {
    /* Sprint4 skeleton: スキャン中テキストを形状一致 shimmer に置換
       skel-base + skel-text-line 流用 (既存 keyframe)、minHeight で CLS 防止 */
    return (
      <div
        className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3"
        data-testid="rs-scanner-loading"
        style={{ minHeight: 96 }}
        aria-busy="true"
        aria-label="RSスキャン中"
      >
        <div className="skel-base skel-text-line" style={{ width: '70%', marginBottom: 8 }} />
        <div className="skel-base skel-text-line" style={{ width: '50%', marginBottom: 8 }} />
        <div className="skel-base skel-text-line" style={{ width: '60%', marginBottom: 8 }} />
        <div className="skel-base skel-text-line" style={{ width: '40%' }} />
      </div>
    );
  }
  if (data.error) {
    return (
      <div
        className="rounded-lg border border-[var(--color-loss)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--color-loss)]"
        data-testid="rs-scanner-error"
      >
        RS スキャン失敗: {data.error}
      </div>
    );
  }
  if (rawItems.length === 0) {
    return (
      <div
        className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-muted)]"
        data-testid="rs-scanner-empty"
      >
        {data.note || `RS ≥ ${data.min_percentile ?? 80} の銘柄なし (nightly batch 未実行の可能性、 明朝確認)`}
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="rs-scanner-results">
      {/* Trust Cliff 防止: universe 範囲を 1 行で明示 */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
        <span>universe: 米国主要 約{data.universe_size}銘柄〈ETF・ファンド除く〉 / 6 ヶ月 RS / {data.calc_date} 計算</span>
        <span className="ml-auto">RS ≥ {data.min_percentile} (上位 {100 - data.min_percentile}%)</span>
      </div>
      {/* v158 (3体合議): 並び替え dropdown。 §38 中立ラベル + 「投資推奨でない」 旨を併記。 */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[var(--text-muted)]">並び替え</span>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value)}
          aria-label="RS スクリーナーの並び替え"
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1 text-xs text-[var(--text-primary)]"
        >
          <option value="percentile">RS スコア順</option>
          <option value="spy">SPY 比順</option>
          {hasDelta && <option value="delta">RS 変化順</option>}
        </select>
        <span className="text-[var(--text-muted)] opacity-80">※ 表示順の変更であり、投資判断の推奨ではありません</span>
        {filter.activeFilterCount > 0 && (
          <span className="ml-auto text-[var(--text-secondary)] tabular-nums">
            {sortedItems.length} / {rawItems.length} 件
          </span>
        )}
      </div>

      {/* v159 SPEC Part B: セクター / 時価総額 絞り込み (共有 MetaFilterPanel)。 */}
      <MetaFilterPanel filter={filter} />

      {/* v120 hotfix v3 (user dogfood): 3 列 grid → 1 列縦並び + ランキング番号で順位を即視認.
          各 row は左端 #順位 / 中央 ticker + SPY 比 / 右端 RS percentile badge の 3 column layout. */}
      <div className="flex flex-col gap-1.5">
        {sortedItems.length === 0 ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 text-xs text-[var(--text-muted)]">
            選択した条件に一致する銘柄がありません（絞り込みを変更してください）
          </div>
        ) : sortedItems.map((item, idx) => {
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
              title={`#${rank} / 主要銘柄 universe 内 上位 ${100 - pct}% / SPY 比 ${rsDiff > 0 ? '+' : ''}${rsDiff.toFixed(1)}pt (6 ヶ月)`}
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
              {/* 右端: RS percentile badge — 「RS {score} / 上位 {percentile}%」形式で表示 (Sprint 1 ラベル明確化) */}
              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums"
                style={{
                  color: 'var(--color-gain)',
                  background: 'color-mix(in srgb, var(--color-gain) 18%, transparent)',
                }}
                title={`RS ${pct} / 上位 ${100 - pct}%`}
              >
                RS {pct} / 上位{100 - pct}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CupScannerResults({ data, onSelect, onUpgrade, filterKey, universeMeta }) {
  // ⚠️ hooks は早期 return より前 (Rules of Hooks)。 RS と同一の共有 sector/mcap 絞り込み hook。
  const filter = useMetaFilter(data?.items || [], universeMeta);
  if (!data) {
    /* Sprint4 skeleton: スキャン中テキストを形状一致 shimmer に置換
       skel-base + skel-text-line 流用 (既存 keyframe)、minHeight で CLS 防止 */
    return (
      <div
        className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3"
        data-testid="cup-scanner-loading"
        style={{ minHeight: 96 }}
        aria-busy="true"
        aria-label="Cupスキャン中"
      >
        <div className="skel-base skel-text-line" style={{ width: '65%', marginBottom: 8 }} />
        <div className="skel-base skel-text-line" style={{ width: '50%', marginBottom: 8 }} />
        <div className="skel-base skel-text-line" style={{ width: '70%', marginBottom: 8 }} />
        <div className="skel-base skel-text-line" style={{ width: '45%' }} />
      </div>
    );
  }
  if (data.error) {
    return (
      <div
        className="rounded-lg border border-[color-mix(in_srgb,var(--color-loss)_25%,transparent)] bg-[color-mix(in_srgb,var(--color-loss)_8%,transparent)] p-3 text-xs text-[var(--color-loss)]"
        data-testid="cup-scanner-error"
      >
        スキャン失敗: {data.error}
      </div>
    );
  }

  const items = data.items || [];
  const totalCount = data.total_count || 0;
  const visibleCount = data.visible_count || items.length;
  const isPremium = !!data.is_premium;
  // v159 SPEC Part B: filter active なら絞り込み後 items (masked 銘柄は ticker 不可視で自動除外)。
  const filteredCupItems = filter.activeFilterCount > 0 ? filter.filteredItems : items;
  const filterLabel = filterKey === 'breakout'
    ? 'ブレイクアウト確定'
    : filterKey === 'both'
      ? 'ファンダ ∩ Cup-Handle'
      : 'Cup-Handle';

  // v141 D4 Sprint2: breakout は Premium 限定。 free user は cup endpoint で state が mask され抽出不可なので、
  // misleading な cup 総数を見せず clean teaser を出す (空表示=「動かないアプリ」回避、 Trust Cliff #1 対策)。
  if (filterKey === 'breakout' && !isPremium) {
    return (
      <div className="rounded-xl border border-[color-mix(in_srgb,var(--color-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_8%,transparent)] p-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          ブレイクアウト確定銘柄は Premium 限定です
        </p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Pivot 価格を出来高を伴って上抜けた確定銘柄を Premium ¥1,800/月 で全件解放 (ATH 追いかけ買いは除外、 毎営業日 email 通知付)。
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
    );
  }

  if (totalCount === 0) {
    return (
      <div
        className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-sm text-[var(--text-muted)]"
        data-testid="cup-scanner-empty"
      >
        現在 {filterLabel} 該当銘柄はありません (nightly scan は UTC 23:00 = JST 8:00 に実行)
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="cup-scanner-results">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold text-[var(--text-primary)]">
          {filterLabel}: 全 {totalCount} 件
        </span>
        {!isPremium && totalCount > visibleCount && (
          <span className="text-xs text-[var(--text-muted)]">
            ({visibleCount} 件公開 / 残り {totalCount - visibleCount} 件 Premium)
          </span>
        )}
        {filter.activeFilterCount > 0 && (
          <span className="ml-auto text-xs text-[var(--text-secondary)] tabular-nums">
            絞り込み {filteredCupItems.length} 件
          </span>
        )}
      </div>

      {/* v159 SPEC Part B: セクター / 時価総額 絞り込み (RS と共有 MetaFilterPanel)。 masked 銘柄は
          ticker 不可視で絞り込み対象外 = filter 中は自動除外、 Premium teaser は下部で従来どおり訴求。 */}
      <MetaFilterPanel filter={filter} />

      {filter.activeFilterCount > 0 && filteredCupItems.length === 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 text-xs text-[var(--text-muted)]">
          選択した条件に一致する銘柄がありません（絞り込みを変更してください）
        </div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {filteredCupItems.map((item, i) => (
            <CupResultCard
              key={`${item.ticker || 'masked'}-${i}`}
              item={item}
              onSelect={onSelect}
              masked={item._masked === true}
            />
          ))}
        </div>
      )}

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
              <Chip size="xs" variant="display" tone={stateTone} data-cup-state={state}>
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
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold bg-[color-mix(in_srgb,var(--color-gain)_18%,transparent)] text-[var(--color-gain)]"
            title={`5条件中 ${item.passed_count} 条件クリア`}
          >
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
    /* Sprint4 skeleton: 3条件並列スキャン中テキストを形状一致 shimmer に置換
       skel-base + skel-text-line 流用 (既存 keyframe)、minHeight で CLS 防止 */
    return (
      <div
        className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3"
        data-testid="oneill-scanner-loading"
        style={{ minHeight: 96 }}
        aria-busy="true"
        aria-label="3条件スキャン中"
      >
        <div className="skel-base skel-text-line" style={{ width: '60%', marginBottom: 8 }} />
        <div className="skel-base skel-text-line" style={{ width: '45%', marginBottom: 8 }} />
        <div className="skel-base skel-text-line" style={{ width: '55%', marginBottom: 8 }} />
        <div className="skel-base skel-text-line" style={{ width: '35%' }} />
      </div>
    );
  }
  if (data.error) {
    return (
      <div
        className="rounded-lg border border-[color-mix(in_srgb,var(--color-loss)_25%,transparent)] bg-[color-mix(in_srgb,var(--color-loss)_8%,transparent)] p-3 text-xs text-[var(--color-loss)]"
        data-testid="oneill-scanner-error"
      >
        スキャン失敗: {data.error}
      </div>
    );
  }

  const items = data.items || [];
  const isPremium = !!data.is_premium;

  if (items.length === 0) {
    return (
      <div
        className="rounded-xl border border-[color-mix(in_srgb,var(--color-gold)_25%,transparent)] bg-[color-mix(in_srgb,var(--color-gold)_6%,transparent)] p-4"
        data-testid="oneill-scanner-empty"
      >
        <div className="flex items-center gap-2 mb-2">
          <Crown size={14} strokeWidth={1.75} style={{ color: 'var(--color-gold)' }} aria-hidden />
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            現在 全条件クリア 該当銘柄はありません
          </p>
        </div>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          ファンダメンタル5条件 PASS かつ Cup-Handle 形成中 かつ RS ≥ 80
          {data.canslim_ready ? ' かつ 四半期EPS成長 +18%以上' : ''} を全て満たす銘柄は希少です
          (月 5-15 銘柄目安)。 nightly scan (JST 8:00-8:30) の翌朝に再 check 推奨。
        </p>
        <p className="text-[10px] text-[var(--text-muted)] mt-2 tabular-nums">
          内訳: ファンダ∩Cup {data.both_total} 件 / RS≥80 {data.rs_total} 件
          {data.canslim_ready
            ? ` / 四半期EPS成長 達成 ${data.canslim_total} 件・未達 ${data.canslim_failed} 件・データなし ${data.canslim_excluded} 件`
            : ' / 四半期EPS成長 集計前'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="oneill-scanner-results">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Crown size={14} strokeWidth={1.75} style={{ color: 'var(--color-gold)' }} aria-hidden />
        <span className="font-semibold text-[var(--text-primary)]">
          全条件クリア: 全 {items.length} 件
        </span>
        <span className="text-[10px] text-[var(--text-muted)] tabular-nums ml-auto">
          ファンダ∩Cup {data.both_total} / RS≥80 {data.rs_total}
          {data.canslim_ready ? ` / EPS成長 達成 ${data.canslim_total}` : ' / EPS成長 集計前'}
        </span>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
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
            Premium ¥1,800/月 で 全条件クリア + 毎営業日 email 通知
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
              <Chip size="xs" variant="display" tone={stateTone} data-cup-state={state}>
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
                  title={`RS ${rsPct} / 上位 ${100 - rsPct}%`}
                >
                  RS {rsPct} / 上位{100 - rsPct}%
                </span>
              )}
            </div>
          )}
        </button>
        {item.passed_count != null && (
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold bg-[color-mix(in_srgb,var(--color-gain)_18%,transparent)] text-[var(--color-gain)]"
            title={`5条件中 ${item.passed_count} 条件クリア`}
          >
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
  const [activeFilter, setActiveFilter] = useState(null); // null | 'funda' | 'cup' | 'breakout' | 'rs' | 'both' | 'oneill'
  const [error, setError] = useState(null);
  // v159 SPEC Part B: universe-meta (sector/mcap) を起動時 1 回 fetch (module cache 経由、 24h backend cache)。
  const [universeMeta, setUniverseMeta] = useState(_universeMetaCache);

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

  // v159 SPEC Part B: universe-meta を起動時 1 回 fetch (RS スクリーナの sector/mcap 絞り込み材料)。
  // module cache 済なら即返るので再 fetch なし。 失敗時は空 meta = 絞り込み panel 非表示 (graceful)。
  useEffect(() => {
    if (universeMeta) return; // 既に cache から hydrate 済
    let alive = true;
    loadUniverseMeta().then((res) => {
      if (alive) setUniverseMeta(res);
    });
    return () => {
      alive = false;
    };
  }, [universeMeta]);

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
      // v122 → Phase2 S4: 'both' (ファンダ∩カップ) ∩ RS≥80 ∩ C(四半期EPS YoY≥18%) の交差。
      // C 条件 (/api/scanner/canslim) は backend が単一条件 read、 交差は frontend で行う
      // (feedback_oneill_screener_frontend_intersection)。
      try {
        const [bothResult, rsResult, canslimResult] = await Promise.all([
          fetchCupHandleScanner('both').catch((e) => ({ error: e.message, items: [], total_count: 0, visible_count: 0, is_premium: false })),
          fetchRsScanner(80, 500).catch((e) => ({ error: e.message, items: [], universe_size: 0 })),
          fetchCanslimScanner(18).catch((e) => ({ error: e.message, items: [], total_count: 0, failed_count: 0, excluded_count: 0, as_of: null })),
        ]);
        const rsTickers = new Set((rsResult.items || []).map((r) => (r.ticker || '').toUpperCase()));
        const rsPctByTicker = new Map((rsResult.items || []).map((r) => [(r.ticker || '').toUpperCase(), r]));
        const canslimByTicker = new Map((canslimResult.items || []).map((r) => [(r.ticker || '').toUpperCase(), r]));
        const canslimTickers = new Set(canslimByTicker.keys());
        // C 条件 populate 済 (as_of あり + 3状態 count 合計 > 0) の時のみ交差に適用。
        // 未 populate (nightly 前) は oneill を 3 条件に graceful degrade し「集計前」表示
        // (空テーブルで AND すると oneill が常に 0 件化する regression を回避)。
        const canslimReady = !!canslimResult.as_of &&
          ((canslimResult.total_count || 0) + (canslimResult.failed_count || 0) + (canslimResult.excluded_count || 0)) > 0;
        const intersected = (bothResult.items || []).filter((it) => {
          const t = (it.ticker || '').toUpperCase();
          // v148 ⑦ (3 体合議): breakout_extended は正統 cup-handle でないため打診買い
          // 交差からも除外 (高値圏突破は section ③ のみで露出、 §5 優良誤認回避)。
          if (it.state === 'breakout_extended') return false;
          if (!(t && rsTickers.has(t))) return false;
          if (canslimReady && !canslimTickers.has(t)) return false; // C 条件 (populate 済時のみ)
          return true;
        }).map((it) => ({
          ...it,
          rs_universe_percentile: rsPctByTicker.get((it.ticker || '').toUpperCase())?.universe_percentile,
          rs_vs_spy_pct: rsPctByTicker.get((it.ticker || '').toUpperCase())?.rs_vs_spy_pct,
          eps_yoy_pct: canslimByTicker.get((it.ticker || '').toUpperCase())?.eps_yoy_pct,
        }));
        setOneillData({
          items: intersected,
          total_count: intersected.length,
          is_premium: !!bothResult.is_premium,
          both_total: bothResult.total_count || 0,
          rs_total: (rsResult.items || []).length,
          rs_universe_size: rsResult.universe_size || 0,
          rs_calc_date: rsResult.calc_date,
          // C 条件 3 状態 (達成/未達/データなし) — 6体合議 facet count integrity
          canslim_ready: canslimReady,
          canslim_total: canslimResult.total_count || 0,
          canslim_failed: canslimResult.failed_count || 0,
          canslim_excluded: canslimResult.excluded_count || 0,
          canslim_as_of: canslimResult.as_of || null,
          error: bothResult.error || rsResult.error || null,
        });
      } catch (e) {
        setOneillData({ error: e.message, items: [], total_count: 0, is_premium: false });
      }
      return;
    }
    if (filterKey === 'breakout') {
      // v141 D4 Sprint2 (3体合議 QA verdict、 #1 Trust Cliff リスク): cup scan を frontend intersection で抽出。
      // backend 増設ゼロ ('oneill' 前例)。 QA Trust Cliff 4 条件:
      //   ① breakout_extended (ATH 追いかけ買い) を物理除外 → state !== 'breakout_confirmed' で全 state 除外。
      //   ② pivot 乖離率 +8% guard: scanner item payload に現在価格が無い (backend _detect_cup_handle 戻り値=保存 payload で
      //      verify 済、 today_close/current_price フィールドなし) ため frontend 計算不可。
      //      → backend の breakout_extended 分類 (today_close >= 252週高値95%) が over-extension を構造的に除外、 ① と同一除外でカバー。
      //   ③ state==null + Number.isFinite(pivot) guard。
      //   ④ premium 限定: cup endpoint が free user の state/payload を mask → 抽出不可 + misleading count 回避。
      try {
        const result = await fetchCupHandleScanner('cup');
        if (!result.is_premium) {
          // Free: state mask 済で breakout 抽出不可 → CupScannerResults の breakout teaser で訴求 (count 主張なし)
          setCupData(result);
          return;
        }
        const filtered = (result.items || []).filter((it) => {
          if (!it || it._masked || !it.state) return false; // ③ state==null guard
          if (it.state !== 'breakout_confirmed') return false; // ①/② extended 含む他 state 物理除外
          return Number.isFinite(it?.payload?.pivot?.price); // ③ pivot guard
        });
        setCupData({
          ...result,
          items: filtered,
          total_count: filtered.length,
          visible_count: filtered.length,
        });
      } catch (e) {
        setCupData({ error: e.message, items: [], total_count: 0, visible_count: 0, is_premium: false });
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
      {/* Sprint 3: 市場局面バナー (FtdRegimeBanner.jsx 共有 module)。
          ScreenerPane (Hero) と CustomScreenerPanel (探索チップ UI) は別 view なので両方に表示する。
          fetch は api.js dedupGet で 1 本化されるため API 重複コールなし。
          data-testid="ftd-regime-banner" は FtdRegimeBanner 内に付与済 (loading / main 両 state)。 */}
      <FtdRegimeBanner />

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
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
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
            <ChipGroup prefix="探索" gap="normal" ariaLabel="スキャナー絞り込み">
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
            <RsScannerResults data={rsData} onSelect={onSelect} universeMeta={universeMeta} />
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
              universeMeta={universeMeta}
            />
          )}

          {/* Legend — desktop only */}
          <div className="hidden sm:flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
            <span className="font-medium text-[var(--text-muted)]">条件:</span>
            {['①CF率≥15%', '②EPS成長', '③CFPS成長', '④売上成長', '⑤CFPS>EPS'].map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>

          {/* A-5 (SPEC 2026-06-04): PASS 銘柄を「ご褒美」 章扉化 (Crown gold + text-h2 見出し + 件数 fw700 stat)。
              「お宝発見の旅」 の到達点として格を上げる。 PASS=緑 は ResultCard の gain ring で維持
              (投資業界色ルール正、 章扉 icon は希少性の gold)。 */}
          {data.passing.length > 0 ? (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Crown size={18} strokeWidth={1.75} aria-hidden style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
                <h4 className="pane3-section-heading">PASS 銘柄</h4>
                <span className="text-xs text-[var(--text-muted)]">5条件中 5 クリア</span>
                <span className="ml-auto text-base font-bold tabular-nums" style={{ color: 'var(--color-gain)' }}>
                  {data.passing.length}銘柄
                </span>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                {data.passing.map((item) => (
                  <ResultCard key={item.ticker} item={item} onSelect={onSelect} />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">現時点でPASS銘柄はありません。</p>
          )}

          {/* ⑦ 案D (北極星「投資家が毎日人力でやる『next PASS 候補探し』を代替」): あと 1 条件で PASS の
              「惜しい」 銘柄 (4/5 達成) を FAIL collapsible から引き出して可視 section 化。 PASS が少ない日の
              下部 void を「次に注目すべき銘柄」 で埋める。 zero fetch (既存 data.failing の conditions/passedCount)。
              §38 中立 (「4/5 達成」 = 事実)、 色は neutral (amber=警告 専用ルール遵守、 near-miss は警告でない)。 */}
          {(() => {
            const passCnt = (it) => it.passedCount ?? it.conditions?.filter((c) => c.passed).length ?? 0;
            const nearMiss = data.failing.filter((it) => passCnt(it) === 4);
            const rest = data.failing.filter((it) => passCnt(it) !== 4);
            return (
              <>
                {nearMiss.length > 0 && (
                  <div data-testid="screener-near-miss">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <h4 className="pane3-section-heading">あと1条件でPASS</h4>
                      <span className="text-xs text-[var(--text-muted)]">5条件中 4 クリア — 次の候補（推奨ではありません）</span>
                      <span className="ml-auto text-base font-bold tabular-nums text-[var(--text-secondary)]">
                        {nearMiss.length}銘柄
                      </span>
                    </div>
                    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                      {nearMiss.map((item) => (
                        <ResultCard key={item.ticker} item={item} onSelect={onSelect} />
                      ))}
                    </div>
                  </div>
                )}
                {/* FAIL (collapsible) — 4/5 以外 (≤3/5) を折りたたみ */}
                {rest.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer list-none text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition">
                      条件未達の銘柄を表示 ({rest.length}件) ▼
                    </summary>
                    <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                      {rest.map((item) => (
                        <ResultCard key={item.ticker} item={item} onSelect={onSelect} />
                      ))}
                    </div>
                  </details>
                )}
              </>
            );
          })()}

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
