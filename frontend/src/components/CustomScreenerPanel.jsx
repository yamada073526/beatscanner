import { useEffect, useState, useMemo, useRef } from 'react';
import { SlidersHorizontal, ChevronDown, Lock } from 'lucide-react';
import { fetchCustomScreener, fetchCanslimRows, fetchScannerUniverse } from '../api.js';
import Chip, { ChipGroup } from './ui/Chip.jsx';
import ProTeaser from './ui/ProTeaser.jsx';
// Sprint 3: 市場局面バナーを ScreenerPane と共有 (FtdRegimeBanner.jsx が SSOT、二重定義なし)
import FtdRegimeBanner from '../features/workspace/FtdRegimeBanner.jsx';

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

// ─── Pass 3b: 統合 universe module-scope cache ───────────────────────────────
let _universeCache = null; // universe payload (items / freshness / locked_facets 等)
let _universePromise = null;
function loadUniverse() {
  if (_universeCache) return Promise.resolve(_universeCache);
  if (_universePromise) return _universePromise;
  _universePromise = fetchScannerUniverse(3000)
    .then((res) => {
      // Pass 3d (修正D): res が null/undefined = fetch 失敗として reject 伝播。
      // 旧実装は null を空オブジェクトとして cache → useEffect の .catch に到達せず
      // universeError が set されなかった (error UI と empty UI の区別不能)。
      if (!res) { _universePromise = null; throw new Error('universe fetch failed'); }
      _universeCache = res;
      return _universeCache;
    })
    .catch((e) => {
      _universePromise = null; // 失敗時は次回 retry を許可
      throw e; // reject 伝播 → useEffect の .catch で universeError set
    });
  return _universePromise;
}

// ─── Pass 3b: facet engine SSOT ─────────────────────────────────────────────
// §0-7(b) 本番較正値。count と list が必ず同一 predicate = Trust Cliff 防止の核。
const FUNDA_FACETS = [
  { key: 'eps_yoy_pct',         field: 'eps_yoy_pct',         label: 'EPS成長(四半期)', unit: '%', tier: 'free', grades: { loose: 20, standard: 25, strict: 50 } },
  { key: 'eps_cagr_3y',         field: 'eps_cagr_3y',         label: 'EPS成長(3年)',    unit: '%', tier: 'free', grades: { loose: 10, standard: 20, strict: 25 } },
  { key: 'roe',                 field: 'roe',                 label: 'ROE',            unit: '%', tier: 'free', grades: { loose: 10, standard: 17, strict: 25 } },
  { key: 'rs_percentile',       field: 'rs_percentile',       label: 'RS(相対強さ)',     unit: '',  tier: 'free', grades: { loose: 70, standard: 85, strict: 90 } },
  { key: 'volume_surge_pct',    field: 'volume_surge_pct',    label: '出来高急増',       unit: '%', tier: 'free', grades: { loose: 25, standard: 40, strict: 50 } },
  { key: 'inst_holders_qoq_pct', field: 'inst_holders_qoq_pct', label: '機関保有増(45日遅延)', unit: '%', tier: 'free', grades: { loose: 0, standard: 3, strict: 5 } },
];
const FACET_MAP = Object.fromEntries(FUNDA_FACETS.map((f) => [f.key, f]));
// preset の CORE 4 metric。volume/inst_holders は preset off、override で追加 (Pass 3c)。
const PRESET_CORE_KEYS = ['eps_yoy_pct', 'eps_cagr_3y', 'roe', 'rs_percentile'];
const PRESET_LABELS = { loose: '緩い', standard: '標準', strict: '厳しい' };

/** 実効 grade map: CORE は preset level、overrides で個別上書き ('off' で除外) */
// locked facet 和名マップ (Pass 3c: 静的 dict、module scope に配置して毎 render 再作成を回避)
const LOCKED_FACET_LABELS = {
  cup: 'カップ・ウィズ・ハンドル',
  breakout: '新高値ブレイク',
  near_high: '新高値圏',
  both: 'カップ+RS複合',
  oneill: 'オニール統合',
};
function buildActiveGrades(preset, overrides) {
  const g = {};
  for (const k of PRESET_CORE_KEYS) g[k] = preset;
  for (const [k, lvl] of Object.entries(overrides || {})) {
    if (lvl === 'off') delete g[k]; else g[k] = lvl;
  }
  return g; // { facetKey: level }
}

/** 単一 predicate — count も list も必ずこれを通す (Trust Cliff C-2 の根拠) */
function itemPasses(item, activeGrades, extra) {
  for (const [k, lvl] of Object.entries(activeGrades)) {
    const f = FACET_MAP[k]; if (!f) continue;
    const v = item[f.field];
    if (v == null) return false;          // 測定外は AND で除外 (honest)
    if (v < f.grades[lvl]) return false;
  }
  if (extra?.fundaPassOnly && item.funda_pass !== true) return false;
  if (extra?.sectors?.length && !extra.sectors.includes(item.sector)) return false;
  if (extra?.mcapBands?.length && !extra.mcapBands.includes(item.mcap_band)) return false;
  return true;
}


export default function CustomScreenerPanel({ onSelect, onUpgrade, onProUpgrade }) {
  const [phase, setPhase] = useState('idle'); // idle | loading | done | error
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // Pass 3b: 統合 universe state (additive facet engine の母集団)
  const [universe, setUniverse] = useState(_universeCache);
  const [universeLoading, setUniverseLoading] = useState(false);
  const [universeError, setUniverseError] = useState(null);
  // Pass 3b: preset セグメントトグル + overrides (Pass 3c で setter を有効化)
  const [preset, setPreset] = useState('standard');
  const [overrides, setOverrides] = useState({});
  // Pass 3c: 詳細展開 accordion の開閉状態
  const [detailOpen, setDetailOpen] = useState(false);
  // Pass 3b: sector / mcap additive refinement (universe ベース)
  const [sectorFilter, setSectorFilter] = useState([]);
  const [mcapFilter, setMcapFilter] = useState([]);
  // Pass 3b: funda_pass binary chip
  const [fundaPassOnly, setFundaPassOnly] = useState(false);

  // S5b funda (3体合議 frontend 必須): run() 連打時に古い rows fetch が新 data を上書きする
  // stale merge を runId で遮断。
  const runIdRef = useRef(0);

  async function run() {
    setPhase('loading');
    setError(null);

    const runId = ++runIdRef.current;
    try {
      const result = await fetchCustomScreener();
      setData(result);
      setPhase('done');
      // S5b funda (3体合議 C 案): C/A/N/S rows を非ブロックで後乗せ merge
      // (await 直列だと初回結果の体感が rows fetch 分遅れる。 feedback_price_fetch_merge_pattern idiom)。
      // 失敗 / DB 不在 ticker は canslim 未付与のまま = バッジ非表示で従来表示 (graceful)。
      const allTickers = [...(result.passing || []), ...(result.failing || [])]
        .map((it) => it.ticker)
        .filter(Boolean);
      if (allTickers.length > 0) {
        fetchCanslimRows(allTickers)
          .then((cr) => {
            if (runId !== runIdRef.current || !cr?.rows) return;
            setData((prev) => {
              if (!prev) return prev;
              const attach = (arr) => (arr || []).map((it) => {
                const row = cr.rows?.[(it.ticker || '').toUpperCase()];
                return row ? { ...it, canslim: row } : it;
              });
              return { ...prev, passing: attach(prev.passing), failing: attach(prev.failing), canslim_rows_as_of: cr.as_of || null };
            });
          })
          .catch(() => { /* graceful: バッジ非表示のまま */ });
      }
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


  // Pass 3b: 統合 universe を custom モード mount 時 1 回 fetch (module cache 経由)。
  useEffect(() => {
    if (universe) return; // module cache 済なら即 hydrate
    let alive = true;
    setUniverseLoading(true);
    loadUniverse().then((res) => {
      if (!alive) return;
      setUniverse(res);
      setUniverseLoading(false);
    }).catch(() => {
      if (!alive) return;
      setUniverseError('universe の取得に失敗しました');
      setUniverseLoading(false);
    });
    return () => { alive = false; };
  }, [universe]);

  // Pass 3b: filteredItems — count も list も同一 predicate (Trust Cliff C-2 の核)。
  const activeGrades = useMemo(() => buildActiveGrades(preset, overrides), [preset, overrides]);
  const filteredItems = useMemo(() => {
    const items = universe?.items || [];
    const extra = { fundaPassOnly, sectors: sectorFilter, mcapBands: mcapFilter };
    return items.filter((it) => itemPasses(it, activeGrades, extra));
  }, [universe, activeGrades, fundaPassOnly, sectorFilter, mcapFilter]);

  // Pass 3b: preset 別の total 件数 (緩い/標準/厳しい) を live 算出。ハードコード禁止。
  const presetCounts = useMemo(() => {
    const items = universe?.items || [];
    const extra = { fundaPassOnly, sectors: sectorFilter, mcapBands: mcapFilter };
    const result = {};
    for (const lvl of ['loose', 'standard', 'strict']) {
      const grades = buildActiveGrades(lvl, overrides);
      result[lvl] = items.filter((it) => itemPasses(it, grades, extra)).length;
    }
    return result;
  }, [universe, overrides, fundaPassOnly, sectorFilter, mcapFilter]);

  // Pass 3c: faceted 件数 — 各 facet の各 level に変えた時の件数 (itemPasses 共有、Trust Cliff C-2)。
  // facet K を level L にした時の件数 = { ...activeGrades, [K]: L } で filter。
  // level='off' = K を外した件数 = delete g[K]。
  const facetLevelCounts = useMemo(() => {
    const items = universe?.items || [];
    const extra = { fundaPassOnly, sectors: sectorFilter, mcapBands: mcapFilter };
    const result = {};
    for (const facet of FUNDA_FACETS) {
      result[facet.key] = {};
      // 'なし' = この facet を active grades から外した件数
      const gOff = { ...activeGrades };
      delete gOff[facet.key];
      result[facet.key]['off'] = items.filter((it) => itemPasses(it, gOff, extra)).length;
      // 各 level
      for (const lvl of ['loose', 'standard', 'strict']) {
        const g = { ...activeGrades, [facet.key]: lvl };
        result[facet.key][lvl] = items.filter((it) => itemPasses(it, g, extra)).length;
      }
    }
    return result;
  }, [universe, activeGrades, fundaPassOnly, sectorFilter, mcapFilter]);

  // Pass 3c: empty サジェスト — 現在 active な制約を1つ外した時に最も件数が増える提案を算出。
  const emptySuggest = useMemo(() => {
    if (filteredItems.length > 0) return null;
    const items = universe?.items || [];
    const extra = { fundaPassOnly, sectors: sectorFilter, mcapBands: mcapFilter };
    let best = null;
    // overrides の各 facet を外す
    for (const [key, lvl] of Object.entries(overrides)) {
      if (lvl === 'off') continue;
      const g = { ...activeGrades };
      delete g[key];
      const cnt = items.filter((it) => itemPasses(it, g, extra)).length;
      if (!best || cnt > best.count) best = { key, label: FACET_MAP[key]?.label || key, count: cnt, type: 'override' };
    }
    // CORE preset facet を1つ外す
    for (const key of PRESET_CORE_KEYS) {
      if (overrides[key] === 'off') continue;
      const g = { ...activeGrades };
      delete g[key];
      const cnt = items.filter((it) => itemPasses(it, g, extra)).length;
      if (!best || cnt > best.count) best = { key, label: FACET_MAP[key]?.label || key, count: cnt, type: 'preset' };
    }
    // fundaPassOnly を外す
    if (fundaPassOnly) {
      const cnt = items.filter((it) => itemPasses(it, activeGrades, { ...extra, fundaPassOnly: false })).length;
      if (!best || cnt > best.count) best = { key: 'funda_pass', label: '最新決算5条件', count: cnt, type: 'funda_pass' };
    }
    // sectorFilter を全解除
    if (sectorFilter.length > 0) {
      const cnt = items.filter((it) => itemPasses(it, activeGrades, { ...extra, sectors: [] })).length;
      if (!best || cnt > best.count) best = { key: 'sector', label: 'セクター絞り込み', count: cnt, type: 'sector' };
    }
    // mcapFilter を全解除
    if (mcapFilter.length > 0) {
      const cnt = items.filter((it) => itemPasses(it, activeGrades, { ...extra, mcapBands: [] })).length;
      if (!best || cnt > best.count) best = { key: 'mcap', label: '時価総額絞り込み', count: cnt, type: 'mcap' };
    }
    return best;
  }, [filteredItems.length, universe, activeGrades, overrides, fundaPassOnly, sectorFilter, mcapFilter]);

  // Pass 3c: sector / mcap 選択肢を universe から live 算出 (count 付き)。
  // Pass 3d (修正A): 全件 universe 集計から faceted count へ変更 (Trust Cliff C-2 修正)。
  // sector 次元自身は "自分の bucket を消さない" ため除外し、grades + funda_pass + mcap を適用。
  const sectorOptions = useMemo(() => {
    const items = universe?.items || [];
    const map = {};
    for (const it of items) {
      if (!it.sector) continue;
      // sector 次元自身は除き (自己排除防止)、他の active facet を適用
      if (!itemPasses(it, activeGrades, { fundaPassOnly, mcapBands: mcapFilter, sectors: [it.sector] })) continue;
      map[it.sector] = (map[it.sector] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([s, cnt]) => ({ value: s, label: sectorLabelJp(s), count: cnt }));
  }, [universe, activeGrades, fundaPassOnly, mcapFilter]);
  const mcapOptions = useMemo(() => {
    const items = universe?.items || [];
    const map = {};
    for (const it of items) {
      if (!it.mcap_band) continue;
      // mcap 次元自身は除き (自己排除防止)、他の active facet を適用
      if (!itemPasses(it, activeGrades, { fundaPassOnly, sectors: sectorFilter, mcapBands: [it.mcap_band] })) continue;
      map[it.mcap_band] = (map[it.mcap_band] || 0) + 1;
    }
    return MCAP_BANDS.filter((b) => map[b.key]).map((b) => ({ ...b, count: map[b.key] || 0 }));
  }, [universe, activeGrades, fundaPassOnly, sectorFilter]);

  // Pass 3d (修正C): funda_pass chip に件数を表示するための faceted count。
  // 件数 = funda_pass=true かつ grades + sector + mcap を通過した件数 (日付ではない)。
  const fundaPassCount = useMemo(() => {
    const items = universe?.items || [];
    return items.filter(
      (it) => it.funda_pass === true &&
        itemPasses(it, activeGrades, { sectors: sectorFilter, mcapBands: mcapFilter })
    ).length;
  }, [universe, activeGrades, sectorFilter, mcapFilter]);

  return (
    <section className="rounded-2xl bg-[var(--bg-card)] p-6 shadow-[var(--shadow-sm)]">
      {/* Sprint 3: 市場局面バナー (FtdRegimeBanner.jsx 共有 module)。
          ScreenerPane (Hero) と CustomScreenerPanel (探索チップ UI) は別 view なので両方に表示する。
          fetch は api.js dedupGet で 1 本化されるため API 重複コールなし。
          data-testid="ftd-regime-banner" は FtdRegimeBanner 内に付与済 (loading / main 両 state)。 */}
      <FtdRegimeBanner />

      <div className="mb-4">
        <h3 className="section-label">銘柄スクリーナー</h3>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          条件を組み合わせて絞り込む
        </p>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          Pass 3b: 統合 universe + additive facet UI
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* universe loading */}
      {universeLoading && (
        <div className="space-y-3 py-4" data-testid="screener-universe-loading">
          <p className="text-center text-sm text-[var(--text-muted)]">データを読み込み中...</p>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-8 rounded-lg"
              style={{
                background: 'linear-gradient(90deg, var(--bg-subtle) 0%, var(--bg-card) 50%, var(--bg-subtle) 100%)',
                backgroundSize: '200% 100%',
                animation: 'dsShimmer 1.4s ease-in-out infinite',
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* universe error */}
      {!universeLoading && universeError && (
        <div className="rounded-lg bg-[color-mix(in_srgb,var(--color-loss)_10%,transparent)] p-3 text-sm text-[var(--color-loss)]" data-testid="screener-universe-error">
          {universeError}
        </div>
      )}

      {/* universe empty (fetch 完了 + items なし) */}
      {!universeLoading && !universeError && universe && (universe.items || []).length === 0 && (
        <p className="py-4 text-center text-sm text-[var(--text-muted)]" data-testid="screener-universe-empty">
          スクリーナーのデータがありません。しばらく後に再度お試しください。
        </p>
      )}

      {/* universe main */}
      {!universeLoading && !universeError && universe && (universe.items || []).length > 0 && (
        <div className="space-y-4" data-testid="screener-universe-main">
          {/* ── (1) preset セグメントトグル ── */}
          <div data-testid="screener-preset-toggle">
            <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">厳しさ</p>
            <div className="flex gap-2 flex-wrap">
              {(['loose', 'standard', 'strict']).map((lvl) => (
                <Chip
                  key={lvl}
                  size="sm"
                  variant="segmented"
                  pressed={preset === lvl}
                  onClick={() => { setPreset(lvl); setOverrides({}); /* §0-7: preset 選び直しで overrides リセット */ }}
                  data-testid={`screener-preset-${lvl}`}
                >
                  {PRESET_LABELS[lvl]}
                  {presetCounts[lvl] != null && (
                    <span className="ml-1 tabular-nums opacity-70">({presetCounts[lvl]})</span>
                  )}
                </Chip>
              ))}
            </div>
          </div>

          {/* ── (2) funda_pass binary chip ── */}
          {/* Pass 3d (修正C): 件数を表示 (日付を括弧内に出すと件数と誤認される Trust Cliff を修正)。
              日付は chip の外に独立した注記として配置。 */}
          {universe.freshness?.funda_pass && (
            <div>
              <Chip
                size="sm"
                variant="filter"
                pressed={fundaPassOnly}
                tone={fundaPassOnly ? 'accent' : 'muted'}
                onClick={() => setFundaPassOnly((v) => !v)}
                data-testid="screener-facet-funda_pass"
              >
                最新決算で5条件達成
                <span className="ml-1 tabular-nums opacity-70">({fundaPassCount})</span>
              </Chip>
              {universe.freshness.funda_pass && (
                <p className="mt-0.5 ml-1 text-[10px] text-[var(--text-muted)] opacity-60">
                  最新評価: {universe.freshness.funda_pass}
                </p>
              )}
            </div>
          )}

          {/* ── (3) sector / mcap additive refinement ── */}
          {sectorOptions.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">セクター</p>
              <div className="flex flex-wrap gap-1.5" data-testid="screener-facet-sector">
                {sectorOptions.map(({ value, label, count }) => {
                  const active = sectorFilter.includes(value);
                  return (
                    <Chip
                      key={value}
                      size="sm"
                      variant="filter"
                      pressed={active}
                      tone={active ? 'accent' : 'muted'}
                      onClick={() =>
                        setSectorFilter((prev) =>
                          prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
                        )
                      }
                    >
                      {label}
                      <span className="ml-1 tabular-nums opacity-60">({count})</span>
                    </Chip>
                  );
                })}
              </div>
            </div>
          )}

          {mcapOptions.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">時価総額</p>
              <div className="flex flex-wrap gap-1.5" data-testid="screener-facet-mcap_band">
                {mcapOptions.map(({ key, label, hint, count }) => {
                  const active = mcapFilter.includes(key);
                  return (
                    <Chip
                      key={key}
                      size="sm"
                      variant="filter"
                      pressed={active}
                      tone={active ? 'accent' : 'muted'}
                      title={hint}
                      onClick={() =>
                        setMcapFilter((prev) =>
                          prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
                        )
                      }
                    >
                      {label}
                      <span className="ml-1 tabular-nums opacity-60">({count})</span>
                    </Chip>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── (3c-A) 詳細展開 accordion ── */}
          <div>
            <button
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              onClick={() => setDetailOpen((v) => !v)}
              data-testid="screener-detail-toggle"
              aria-expanded={detailOpen}
            >
              <SlidersHorizontal size={12} strokeWidth={2} aria-hidden />
              詳細を調整
              <ChevronDown
                size={12}
                strokeWidth={2}
                aria-hidden
                style={{ transform: detailOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
              />
            </button>

            {detailOpen && (
              <div
                className="mt-3 rounded-xl border border-[var(--border)] p-3 space-y-4"
                role="region"
                aria-label="詳細フィルター"
              >
                {/* ファンダ群 */}
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">ファンダメンタル</p>
                  <div className="space-y-2">
                    {FUNDA_FACETS.filter((f) => PRESET_CORE_KEYS.includes(f.key)).map((facet) => {
                      // 実効 level: overrides 優先 → なければ preset 由来
                      const effectiveLevel = overrides[facet.key] === 'off'
                        ? 'off'
                        : overrides[facet.key] || preset;
                      return (
                        <div key={facet.key} className="flex flex-wrap items-center gap-1.5">
                          <span className="w-24 shrink-0 text-[11px] text-[var(--text-secondary)]">{facet.label}</span>
                          {['off', 'loose', 'standard', 'strict'].map((lvl) => {
                            const cnt = facetLevelCounts[facet.key]?.[lvl] ?? 0;
                            // CORE facet で overrides 未指定なら preset level が「選択中」に見える
                            const actuallyPressed = lvl === 'off'
                              ? (overrides[facet.key] === 'off')
                              : (overrides[facet.key]
                                  ? overrides[facet.key] === lvl
                                  : preset === lvl);
                            return (
                              <Chip
                                key={lvl}
                                size="xs"
                                variant="segmented"
                                pressed={actuallyPressed}
                                disabled={cnt === 0 && !actuallyPressed}
                                onClick={() => {
                                  setOverrides((prev) => ({
                                    ...prev,
                                    [facet.key]: lvl === 'off' ? 'off' : lvl,
                                  }));
                                }}
                                data-testid={`screener-facet-level-${facet.key}-${lvl}`}
                              >
                                {lvl === 'off' ? 'なし' : PRESET_LABELS[lvl]}
                                <span className="ml-0.5 tabular-nums opacity-60">({cnt})</span>
                              </Chip>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* テクニカル群 */}
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">テクニカル</p>
                  <div className="space-y-2">
                    {FUNDA_FACETS.filter((f) => !PRESET_CORE_KEYS.includes(f.key)).map((facet) => {
                      const effectiveLevel = overrides[facet.key] === 'off' ? 'off' : overrides[facet.key] || 'off';
                      return (
                        <div key={facet.key} className="flex flex-wrap items-center gap-1.5">
                          <span className="w-24 shrink-0 text-[11px] text-[var(--text-secondary)]">{facet.label}</span>
                          {['off', 'loose', 'standard', 'strict'].map((lvl) => {
                            const cnt = facetLevelCounts[facet.key]?.[lvl] ?? 0;
                            const actuallyPressed = lvl === 'off'
                              ? !overrides[facet.key] || overrides[facet.key] === 'off'
                              : overrides[facet.key] === lvl;
                            return (
                              <Chip
                                key={lvl}
                                size="xs"
                                variant="segmented"
                                pressed={actuallyPressed}
                                disabled={cnt === 0 && !actuallyPressed}
                                onClick={() => {
                                  setOverrides((prev) => ({
                                    ...prev,
                                    [facet.key]: lvl === 'off' ? 'off' : lvl,
                                  }));
                                }}
                                data-testid={`screener-facet-level-${facet.key}-${lvl}`}
                              >
                                {lvl === 'off' ? 'なし' : PRESET_LABELS[lvl]}
                                <span className="ml-0.5 tabular-nums opacity-60">({cnt})</span>
                              </Chip>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── (3c-B) 適用中フィルタ bar ── */}
          {(() => {
            const activeOverrides = Object.entries(overrides).filter(([, v]) => v && v !== 'off');
            const hasActive = activeOverrides.length > 0 || sectorFilter.length > 0 || mcapFilter.length > 0 || fundaPassOnly;
            if (!hasActive) return null;
            return (
              <div
                className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
                data-testid="screener-applied-bar"
              >
                {/* preset chip (常に1つ active) */}
                <Chip size="xs" variant="display" tone="muted" data-testid="screener-applied-preset">
                  厳しさ: {PRESET_LABELS[preset]}
                </Chip>

                {/* overrides */}
                {activeOverrides.map(([key, lvl]) => (
                  <Chip
                    key={key}
                    size="xs"
                    variant="filter"
                    pressed
                    tone="accent"
                    onClick={() => setOverrides((prev) => { const n = { ...prev }; delete n[key]; return n; })}
                    data-testid={`screener-applied-override-${key}`}
                  >
                    <span className="opacity-60 mr-0.5">ファンダ:</span>
                    {FACET_MAP[key]?.label || key}: {PRESET_LABELS[lvl]}
                    <span className="ml-1 opacity-70">×</span>
                  </Chip>
                ))}

                {/* sector */}
                {sectorFilter.map((s) => (
                  <Chip
                    key={s}
                    size="xs"
                    variant="filter"
                    pressed
                    tone="accent"
                    onClick={() => setSectorFilter((prev) => prev.filter((x) => x !== s))}
                    data-testid={`screener-applied-sector-${s}`}
                  >
                    <span className="opacity-60 mr-0.5">セクター:</span>
                    {sectorLabelJp(s)}
                    <span className="ml-1 opacity-70">×</span>
                  </Chip>
                ))}

                {/* mcap */}
                {mcapFilter.map((k) => {
                  const band = MCAP_BANDS.find((b) => b.key === k);
                  return (
                    <Chip
                      key={k}
                      size="xs"
                      variant="filter"
                      pressed
                      tone="accent"
                      onClick={() => setMcapFilter((prev) => prev.filter((x) => x !== k))}
                      data-testid={`screener-applied-mcap-${k}`}
                    >
                      <span className="opacity-60 mr-0.5">時価総額:</span>
                      {band?.label || k}
                      <span className="ml-1 opacity-70">×</span>
                    </Chip>
                  );
                })}

                {/* funda_pass */}
                {fundaPassOnly && (
                  <Chip
                    size="xs"
                    variant="filter"
                    pressed
                    tone="accent"
                    onClick={() => setFundaPassOnly(false)}
                    data-testid="screener-applied-funda_pass"
                  >
                    決算5条件達成
                    <span className="ml-1 opacity-70">×</span>
                  </Chip>
                )}

                {/* すべて解除 */}
                <button
                  className="ml-auto text-[11px] text-[var(--text-muted)] hover:text-[var(--color-loss)] transition-colors"
                  onClick={() => { setPreset('standard'); setOverrides({}); setSectorFilter([]); setMcapFilter([]); setFundaPassOnly(false); }}
                  data-testid="screener-applied-clear"
                >
                  すべて解除
                </button>
              </div>
            );
          })()}

          {/* ── (4) locked facets — 和名 + 鍵 (Pass 3c) ── */}
          {(universe.locked_facets || []).length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">Premium / Pro で解錠</p>
              <div className="flex flex-wrap gap-1.5">
                {(universe.locked_facets || []).map((key) => {
                  // Premium 系 (cup/breakout/both/oneill) → onUpgrade、Pro 系 (near_high) → onProUpgrade
                  const isProTier = key === 'near_high';
                  // TODO Sprint6(C-1): 未ログイン時は onUpgrade でなくログインモーダルへ (非ログインPC=LP routing で現状到達不可だが要 guard)
                  const handleLockClick = () => {
                    if (isProTier) {
                      (onProUpgrade || onUpgrade)?.();
                    } else {
                      onUpgrade?.();
                    }
                  };
                  /* Pass 3d (修正E): raw rgba → CSS class (screener-locked-chip) へ変更。
                     Chip primitive に style prop を渡す escape hatch を禁止。
                     wrapper div に screener-locked-chip class で tint を CSS から付与。
                     サブラベル: text-[9px] → text-[10px] (最小フォント下限遵守)。 */
                  return (
                    <div key={key} className="screener-locked-chip-wrapper flex flex-col items-start gap-0.5">
                      <div className="screener-locked-chip">
                        <Chip
                          size="sm"
                          variant="filter"
                          tone="accent"
                          onClick={handleLockClick}
                          data-testid={`screener-locked-${key}`}
                        >
                          <Lock size={11} strokeWidth={2} aria-hidden style={{ marginRight: 4, verticalAlign: '-1px' }} />
                          {LOCKED_FACET_LABELS[key] || key}
                        </Chip>
                      </div>
                      <span className="ml-1 text-[10px] text-[var(--text-muted)]">
                        {isProTier ? 'Pro で解錠' : 'Premium で解錠'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── (5) 結果リスト ── */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                {filteredItems.length} 件
              </span>
              {universe.as_of && (
                <span className="text-xs text-[var(--text-muted)]">
                  最終更新: {universe.as_of}
                </span>
              )}
            </div>
            {filteredItems.length === 0 ? (
              <div data-testid="screener-result-row-empty">
                <p className="py-3 text-center text-sm text-[var(--text-muted)]">
                  該当する銘柄がありません。厳しさを緩めるか、フィルターを変更してください。
                </p>
                {/* (5) empty サジェスト */}
                {emptySuggest && emptySuggest.count > 0 && (
                  <div className="mt-2 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
                    <span>「{emptySuggest.label}」を外すと {emptySuggest.count} 件</span>
                    <button
                      className="rounded px-2 py-0.5 border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                      onClick={() => {
                        if (emptySuggest.type === 'override') {
                          setOverrides((prev) => { const n = { ...prev }; delete n[emptySuggest.key]; return n; });
                        } else if (emptySuggest.type === 'preset') {
                          setOverrides((prev) => {
                            const n = { ...prev };
                            n[emptySuggest.key] = 'off';
                            return n;
                          });
                        } else if (emptySuggest.type === 'funda_pass') {
                          setFundaPassOnly(false);
                        } else if (emptySuggest.type === 'sector') {
                          setSectorFilter([]);
                        } else if (emptySuggest.type === 'mcap') {
                          setMcapFilter([]);
                        }
                      }}
                      data-testid="screener-empty-suggest-action"
                    >
                      外す
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] overflow-hidden">
                {filteredItems.map((it) => (
                  <button
                    key={it.ticker}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors"
                    onClick={() => onSelect?.(it.ticker)}
                    data-testid={`screener-result-row-${it.ticker}`}
                  >
                    <span className="w-16 shrink-0 font-mono text-sm font-semibold text-[var(--text-primary)]">{it.ticker}</span>
                    <span className="flex-1 truncate text-xs text-[var(--text-secondary)]">{it.name || it.ticker}</span>
                    <span className="shrink-0 text-xs text-[var(--text-muted)]">{sectorLabelJp(it.sector)}</span>
                    {it.rs_percentile != null && (
                      /* Pass 3d (修正B): color polarity 撤廃 (§38 買い断定誘導防止)。
                         RS≥85 は fontWeight=600 のみで強調、色は text-secondary 固定。 */
                      <span
                        className="shrink-0 w-14 text-right text-xs tabular-nums text-[var(--text-secondary)]"
                        style={{ fontWeight: it.rs_percentile >= 85 ? 600 : 400 }}
                      >
                        RS {it.rs_percentile.toFixed(0)}
                      </span>
                    )}
                    {it.eps_yoy_pct != null && (
                      /* TODO Sprint4: ADR 外貨/銀行 EPS 偽値 (BABA eps_yoy=-94.8 等) を表示抑止 [task#13] */
                      <span className="shrink-0 w-16 text-right text-xs tabular-nums text-[var(--text-muted)]">
                        EPS {it.eps_yoy_pct > 0 ? '+' : ''}{it.eps_yoy_pct.toFixed(0)}%
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
