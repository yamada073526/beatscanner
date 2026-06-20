import { useEffect, useState, useMemo } from 'react';
import { SlidersHorizontal, ChevronDown, Lock, Info } from 'lucide-react';
import { fetchScannerUniverse } from '../api.js';
// Sprint 5 Pass D: GA4/Clarity 比較 event (C-16 昇格ゲート baseline 用)
import { trackEvent } from '../lib/analytics.js';
import Chip, { ChipGroup } from './ui/Chip.jsx';
import ProTeaser from './ui/ProTeaser.jsx';
// Sprint 3: 市場局面バナーを ScreenerPane と共有 (FtdRegimeBanner.jsx が SSOT、二重定義なし)
import FtdRegimeBanner from '../features/workspace/FtdRegimeBanner.jsx';
// Pass B: 企業ロゴ (TV→FMP→頭文字円 3 段 fallback)
import CompanyLogo from './CompanyLogo.jsx';

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

// ─── Sprint 3: 営業CFマージン binary facet (§0-1③ PRESET_TABLE 統合禁止) ─────
// KB「ナイス・バディの法則 15% 足切り」に忠実な binary (ON/OFF) facet。
// 上限カットなし (35% 超も通す)。null = AND で除外 (honest count)。
// grades 体系 (loose/standard/strict) に統合しない — 質的閾値であり段階化になじまない。
// tier: 'free' (§0-1④、eps_yoy/roe と同列の上流ファンダ数値)。
const OCF_MARGIN_FACET = {
  key: 'ocf_margin_pct',
  field: 'ocf_margin_pct',
  label: 'キャッシュ創出力 15%以上',
  labelShort: 'CF創出力',
  tooltip: '営業キャッシュフロー ÷ 売上高 ≥ 15%。銀行・保険・REIT 等は業種特性によりデータなし。',
  threshold: 15,
  tier: 'free',
};

/** 実効 grade map: CORE は preset level、overrides で個別上書き ('off' で除外) */
// locked facet 和名マップ (Pass 3c: 静的 dict、module scope に配置して毎 render 再作成を回避)
const LOCKED_FACET_LABELS = {
  cup: 'カップ・ウィズ・ハンドル',
  breakout: '新高値ブレイク',
  near_high: '新高値圏',
  both: 'カップ+RS複合',
  oneill: 'オニール統合',
};
// Pass B: ヒット理由バッジ用の短縮ラベルマップ (module scope で毎 render 再作成を回避)
const FACET_SHORT_LABEL = {
  eps_yoy_pct: 'EPS↑',
  eps_cagr_3y: 'EPS3年',
  roe: 'ROE',
  rs_percentile: 'RS高',
  volume_surge_pct: '出来高急増',
  inst_holders_qoq_pct: '機関↑',
  ocf_margin_pct: 'CF創出力',
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
  // Sprint 3: 営業CFマージン binary facet (§0-1③)。null = AND 除外 (honest)、上限カットなし。
  // None-preserve: 0.0 は有効値だが閾値 15 未満なので自然に落ちる (`< threshold` で判定)。
  if (extra?.ocfMarginOnly) {
    const m = item[OCF_MARGIN_FACET.field];
    if (m == null || m < OCF_MARGIN_FACET.threshold) return false;
  }
  if (extra?.sectors?.length && !extra.sectors.includes(item.sector)) return false;
  if (extra?.mcapBands?.length && !extra.mcapBands.includes(item.mcap_band)) return false;
  return true;
}


/**
 * Sprint 5 Pass A: staleness 算出 (as_of は "YYYY-MM-DD" 日次文字列)。
 * epoch ms / 秒 自動判定は不要。日付差のみで本日/昨日/N日前を返す。
 * §38: "X分前" 使わない。粒度は日次のみ。
 */
function formatAsOf(asOf) {
  if (!asOf) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(asOf);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - target) / 86400000);
  if (diffDays <= 0) return '本日更新';
  if (diffDays === 1) return '昨日更新';
  return `${diffDays}日前に更新`;
}

export default function CustomScreenerPanel({
  onSelect,
  onUpgrade,
  onProUpgrade,
  onAddToWatchlist,
  watchlist = [],
  isProUser = false,
  // Sprint 3: 営業CFマージン facet を screener_v2 scope に限定する flag。
  // 共有部品 (CustomScreenerPanel) を legacy (default OFF) に漏らさないため prop で gate
  // (SPEC §6「hideHero のように prop で限定」)。v2 経路 (ScreenerMaster) のみ true を渡す。
  screenerV2 = false,
}) {
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
  // Sprint 3: 営業CFマージン binary chip (上流ファンダ品質・常時鮮度。funda_pass とは別次元)
  const [ocfMarginOnly, setOcfMarginOnly] = useState(false);
  // Pass C: 件数キャップ — 初期 100 件、「残りN件を表示」で全件展開
  const [showAllResults, setShowAllResults] = useState(false);
  // Sprint 5 Pass B: 複数選択 → watchlist 一括追加
  const [selectedTickers, setSelectedTickers] = useState(() => new Set());

  // 一括追加ハンドラ (Trust Cliff: 無料 3 件上限を明示)
  const handleBulkAdd = () => {
    const tickers = [...selectedTickers];
    if (!isProUser && (watchlist.length + tickers.length) > 3) {
      // 部分追加せず upgrade を明示誘導 (Trust Cliff 防止)
      onUpgrade?.('ウォッチリスト (Pro で無制限)');
      return;
    }
    tickers.forEach((t) => onAddToWatchlist?.(t));
    trackEvent('screener_watchlist_add', { tickers_count: tickers.length, mode: 'custom' });
    setSelectedTickers(new Set());
  };

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
    const extra = { fundaPassOnly, ocfMarginOnly, sectors: sectorFilter, mcapBands: mcapFilter };
    return items.filter((it) => itemPasses(it, activeGrades, extra));
  }, [universe, activeGrades, fundaPassOnly, ocfMarginOnly, sectorFilter, mcapFilter]);

  // Pass B: 条件合致度順ソート。
  // スコア = アクティブ数値 facet ごとに (item[key] - threshold) / threshold の合計。
  // §38 厳守: スコアは内部ソート専用。画面非表示・色 polarity なし。
  const sortedItems = useMemo(() => {
    // アクティブ facet のうち threshold が null でないものを収集
    const activeFacets = FUNDA_FACETS.flatMap((f) => {
      const lvl = activeGrades[f.key];
      const thr = lvl ? f.grades[lvl] : null;
      return thr != null ? [{ key: f.key, threshold: thr }] : [];
    });
    const scored = filteredItems.map((it) => {
      let score = 0;
      for (const { key, threshold } of activeFacets) {
        const v = it[key];
        if (v != null && threshold !== 0) {
          score += (v - threshold) / Math.abs(threshold);
        } else if (v != null && threshold === 0) {
          // threshold=0 の時は差分をそのまま加算 (inst_holders 等)
          score += v;
        }
      }
      return { it, score };
    });
    scored.sort((a, b) => b.score - a.score || a.it.ticker.localeCompare(b.it.ticker));
    return scored.map((s) => s.it);
  }, [filteredItems, activeGrades]);

  // Pass C: フィルタ変更で結果集合が変わったら件数キャップを 100 件に戻す
  // (「残りN件を表示」を一度押しても、新しい絞り込みでは描画負荷抑制の意図を維持)。
  useEffect(() => { setShowAllResults(false); }, [filteredItems]);

  // Pass 3b: preset 別の total 件数 (緩い/標準/厳しい) を live 算出。ハードコード禁止。
  const presetCounts = useMemo(() => {
    const items = universe?.items || [];
    const extra = { fundaPassOnly, ocfMarginOnly, sectors: sectorFilter, mcapBands: mcapFilter };
    const result = {};
    for (const lvl of ['loose', 'standard', 'strict']) {
      const grades = buildActiveGrades(lvl, overrides);
      result[lvl] = items.filter((it) => itemPasses(it, grades, extra)).length;
    }
    return result;
  }, [universe, overrides, fundaPassOnly, ocfMarginOnly, sectorFilter, mcapFilter]);

  // Pass 3c: faceted 件数 — 各 facet の各 level に変えた時の件数 (itemPasses 共有、Trust Cliff C-2)。
  // facet K を level L にした時の件数 = { ...activeGrades, [K]: L } で filter。
  // level='off' = K を外した件数 = delete g[K]。
  const facetLevelCounts = useMemo(() => {
    const items = universe?.items || [];
    const extra = { fundaPassOnly, ocfMarginOnly, sectors: sectorFilter, mcapBands: mcapFilter };
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
  }, [universe, activeGrades, fundaPassOnly, ocfMarginOnly, sectorFilter, mcapFilter]);

  // Pass 3c: empty サジェスト — 現在 active な制約を1つ外した時に最も件数が増える提案を算出。
  const emptySuggest = useMemo(() => {
    if (filteredItems.length > 0) return null;
    const items = universe?.items || [];
    const extra = { fundaPassOnly, ocfMarginOnly, sectors: sectorFilter, mcapBands: mcapFilter };
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
    // ocfMarginOnly を外す (Sprint 3)
    if (ocfMarginOnly) {
      const cnt = items.filter((it) => itemPasses(it, activeGrades, { ...extra, ocfMarginOnly: false })).length;
      if (!best || cnt > best.count) best = { key: 'ocf_margin', label: OCF_MARGIN_FACET.label, count: cnt, type: 'ocf_margin' };
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
  }, [filteredItems.length, universe, activeGrades, overrides, fundaPassOnly, ocfMarginOnly, sectorFilter, mcapFilter]);

  // Pass 3c: sector / mcap 選択肢を universe から live 算出 (count 付き)。
  // Pass 3d (修正A): 全件 universe 集計から faceted count へ変更 (Trust Cliff C-2 修正)。
  // sector 次元自身は "自分の bucket を消さない" ため除外し、grades + funda_pass + mcap を適用。
  const sectorOptions = useMemo(() => {
    const items = universe?.items || [];
    const map = {};
    for (const it of items) {
      if (!it.sector) continue;
      // sector 次元自身は除き (自己排除防止)、他の active facet を適用
      if (!itemPasses(it, activeGrades, { fundaPassOnly, ocfMarginOnly, mcapBands: mcapFilter, sectors: [it.sector] })) continue;
      map[it.sector] = (map[it.sector] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([s, cnt]) => ({ value: s, label: sectorLabelJp(s), count: cnt }));
  }, [universe, activeGrades, fundaPassOnly, ocfMarginOnly, mcapFilter]);
  const mcapOptions = useMemo(() => {
    const items = universe?.items || [];
    const map = {};
    for (const it of items) {
      if (!it.mcap_band) continue;
      // mcap 次元自身は除き (自己排除防止)、他の active facet を適用
      if (!itemPasses(it, activeGrades, { fundaPassOnly, ocfMarginOnly, sectors: sectorFilter, mcapBands: [it.mcap_band] })) continue;
      map[it.mcap_band] = (map[it.mcap_band] || 0) + 1;
    }
    return MCAP_BANDS.filter((b) => map[b.key]).map((b) => ({ ...b, count: map[b.key] || 0 }));
  }, [universe, activeGrades, fundaPassOnly, ocfMarginOnly, sectorFilter]);

  // Pass 3d (修正C): funda_pass chip に件数を表示するための faceted count。
  // 件数 = funda_pass=true かつ grades + ocf + sector + mcap を通過した件数 (日付ではない)。
  // 自己 (funda_pass) は直接 filter するため extra に含めない。他次元 (ocfMarginOnly 含む) は反映。
  const fundaPassCount = useMemo(() => {
    const items = universe?.items || [];
    return items.filter(
      (it) => it.funda_pass === true &&
        itemPasses(it, activeGrades, { ocfMarginOnly, sectors: sectorFilter, mcapBands: mcapFilter })
    ).length;
  }, [universe, activeGrades, ocfMarginOnly, sectorFilter, mcapFilter]);

  // Sprint 3: 営業CFマージン chip の faceted count (Trust Cliff C-3: chip count = 実表示件数)。
  // 件数 = ocf_margin_pct >= 15 かつ grades + funda_pass + sector + mcap を通過した件数。
  // 自己 (ocf_margin) は直接 filter するため extra に含めない (自己排除)。null = 除外 (honest)。
  const ocfMarginCount = useMemo(() => {
    const items = universe?.items || [];
    return items.filter(
      (it) => it[OCF_MARGIN_FACET.field] != null &&
        it[OCF_MARGIN_FACET.field] >= OCF_MARGIN_FACET.threshold &&
        itemPasses(it, activeGrades, { fundaPassOnly, sectors: sectorFilter, mcapBands: mcapFilter })
    ).length;
  }, [universe, activeGrades, fundaPassOnly, sectorFilter, mcapFilter]);

  return (
    <section className="rounded-2xl bg-[var(--bg-card)] p-6">
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

          {/* ── Sprint 5 Pass A: 決断支援ヒーロー (合致度TOP3 + 件数 + staleness + 免責) ──
              §38/景表法§5: 色 polarity 不使用・neutral/muted のみ。TOP3 は合致度順(軸を ⓘ で明示)、
              推奨でない旨を明示。shadowゼロ: border + tinted-bg のみ (.panel-card 等は付けない)。 */}
          <div
            data-testid="screener-hero-summary"
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {/* 左: 合致度TOP3 (軸明示 + ⓘ 選定基準) */}
              <div className="flex items-center gap-1.5 min-w-0" data-testid="screener-hero-top3">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] shrink-0">
                  合致度TOP3
                  <Info
                    size={12}
                    className="text-[var(--text-muted)] cursor-help"
                    aria-label="選定基準"
                    title="現在の絞り込み条件への合致度順（各数値条件の超過率合計の降順）。投資推奨ではありません。"
                  />
                </span>
                {sortedItems.slice(0, 3).map((it) => (
                  <Chip
                    key={it.ticker}
                    size="xs"
                    variant="display"
                    tone="muted"
                    onClick={() => onSelect?.(it.ticker)}
                  >
                    {it.ticker}
                  </Chip>
                ))}
                {sortedItems.length === 0 && (
                  <span className="text-xs text-[var(--text-muted)]">該当なし</span>
                )}
              </div>
              {/* 右: 件数 + staleness (毎朝更新サイクル文言、X分前は不使用) */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-medium text-[var(--text-secondary)]" data-testid="screener-hero-count">
                  {filteredItems.length}件ヒット
                </span>
                {universe.as_of && (
                  <span className="text-xs text-[var(--text-muted)]" data-testid="screener-hero-staleness">
                    {formatAsOf(universe.as_of)}（毎朝更新）
                  </span>
                )}
              </div>
            </div>
            {/* 免責 (景表法§5/§38) */}
            <p className="mt-1.5 text-[0.6875rem] leading-tight text-[var(--text-muted)]" data-testid="screener-hero-disclaimer">
              スクリーニング結果であり投資推奨ではありません。
            </p>
          </div>

          {/* ── Pass C: 1 行コンパクト操作帯 ── */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* 左: 厳しさ preset トグル */}
            <div data-testid="screener-preset-toggle" className="flex gap-1.5 items-center shrink-0">
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

            {/* 中: 適用中サマリ (active filter を短縮ラベルで) */}
            {(() => {
              const parts = [];
              if (mcapFilter.length > 0) parts.push(mcapFilter.map((k) => MCAP_BANDS.find((b) => b.key === k)?.label || k).join('・'));
              if (sectorFilter.length > 0) parts.push(sectorFilter.map(sectorLabelJp).join('・'));
              if (fundaPassOnly) parts.push('5条件達成');
              if (ocfMarginOnly) parts.push(OCF_MARGIN_FACET.labelShort);
              const overrideParts = Object.entries(overrides).filter(([, v]) => v && v !== 'off').map(([k]) => FACET_SHORT_LABEL[k] || k);
              if (overrideParts.length > 0) parts.push(overrideParts.join('・'));
              if (parts.length === 0) return null;
              return (
                <span className="flex-1 min-w-0 truncate text-[11px] text-[var(--text-muted)]">
                  {parts.join('　')}
                </span>
              );
            })()}

            {/* 右: 詳細を開く */}
            <button
              className="ml-auto flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              onClick={() => setDetailOpen((v) => !v)}
              data-testid="screener-detail-toggle"
              aria-expanded={detailOpen}
            >
              <SlidersHorizontal size={12} strokeWidth={2} aria-hidden />
              詳細
              <ChevronDown
                size={12}
                strokeWidth={2}
                aria-hidden
                style={{ transform: detailOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
              />
            </button>
          </div>

          {/* ── Pass C: 詳細 accordion (detailOpen 時のみ展開) ── */}
          {detailOpen && (
            <div
              className="rounded-xl border border-[var(--border)] p-3 space-y-4"
              role="region"
              aria-label="詳細フィルター"
              data-testid="screener-detail-panel"
            >
              {/* (2a) funda_pass binary chip */}
              {universe.freshness?.funda_pass && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">決算フィルター</p>
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

              {/* (2a-2) Sprint 3: 営業CFマージン binary chip — 常時鮮度の上流ファンダ品質。
                  funda_pass (決算イベント駆動) とは別次元のため別ヘッダーで視覚区別 (§0-2 2段階)。
                  screener_v2 scope 限定 (legacy には漏らさない、SPEC §6)。tier=free (件数表示)。
                  色運用: 緑は「上昇」予約色のため filter chip は兄弟と統一の accent/muted。
                  gold/green バッジによる 2段階区別は Sprint 4 hero scope (§0-2「gold accent バッジ」)。 */}
              {screenerV2 && universe.freshness?.ocf_margin && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">ファンダ品質フィルター</p>
                  <Chip
                    size="sm"
                    variant="filter"
                    pressed={ocfMarginOnly}
                    tone={ocfMarginOnly ? 'accent' : 'muted'}
                    title={OCF_MARGIN_FACET.tooltip}
                    onClick={() => setOcfMarginOnly((v) => !v)}
                    data-testid="screener-facet-ocf_margin_pct"
                  >
                    {OCF_MARGIN_FACET.label}
                    <span className="ml-1 tabular-nums opacity-70">({ocfMarginCount})</span>
                  </Chip>
                  <p className="mt-0.5 ml-1 text-[10px] text-[var(--text-muted)] opacity-60">
                    最新更新: {universe.freshness.ocf_margin}
                  </p>
                </div>
              )}

              {/* (2b) sector additive refinement */}
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

              {/* (2c) mcap additive refinement */}
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

              {/* (2d) ファンダメンタル grade override */}
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">ファンダメンタル</p>
                <div className="space-y-2">
                  {FUNDA_FACETS.filter((f) => PRESET_CORE_KEYS.includes(f.key)).map((facet) => {
                    return (
                      <div key={facet.key} className="flex flex-wrap items-center gap-1.5">
                        <span className="w-24 shrink-0 text-[11px] text-[var(--text-secondary)]">{facet.label}</span>
                        {['off', 'loose', 'standard', 'strict'].map((lvl) => {
                          const cnt = facetLevelCounts[facet.key]?.[lvl] ?? 0;
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

              {/* (2e) テクニカル群 */}
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">テクニカル</p>
                <div className="space-y-2">
                  {FUNDA_FACETS.filter((f) => !PRESET_CORE_KEYS.includes(f.key)).map((facet) => {
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

              {/* (2f) locked facets — 和名 + 鍵 */}
              {(universe.locked_facets || []).length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">Premium / Pro で解錠</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(universe.locked_facets || []).map((key) => {
                      const isProTier = key === 'near_high';
                      const handleLockClick = () => {
                        if (isProTier) {
                          (onProUpgrade || onUpgrade)?.();
                        } else {
                          onUpgrade?.();
                        }
                      };
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
            </div>
          )}

          {/* ── Pass C: 適用中フィルタ bar (詳細閉時もサマリ chip を visible に保つ) ── */}
          {(() => {
            const activeOverrides = Object.entries(overrides).filter(([, v]) => v && v !== 'off');
            const hasActive = activeOverrides.length > 0 || sectorFilter.length > 0 || mcapFilter.length > 0 || fundaPassOnly || ocfMarginOnly;
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

                {/* Sprint 3: 営業CFマージン (上流ファンダ品質) */}
                {ocfMarginOnly && (
                  <Chip
                    size="xs"
                    variant="filter"
                    pressed
                    tone="accent"
                    onClick={() => setOcfMarginOnly(false)}
                    data-testid="screener-applied-ocf_margin_pct"
                  >
                    {OCF_MARGIN_FACET.labelShort}
                    <span className="ml-1 opacity-70">×</span>
                  </Chip>
                )}

                {/* すべて解除 */}
                <button
                  className="ml-auto text-[11px] text-[var(--text-muted)] hover:text-[var(--color-loss)] transition-colors"
                  onClick={() => { setPreset('standard'); setOverrides({}); setSectorFilter([]); setMcapFilter([]); setFundaPassOnly(false); setOcfMarginOnly(false); }}
                  data-testid="screener-applied-clear"
                >
                  すべて解除
                </button>
              </div>
            );
          })()}

          {/* ── (5) 結果リスト ── */}
          <div>
            {/* リスト見出し: 件数のみ (staleness は上段ヒーローに集約、重複回避)。
                件数はヒーローと同一 filteredItems.length = Trust Cliff C-2 整合。 */}
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                {filteredItems.length} 件
              </span>
            </div>

            {/* Sprint 5 Pass B: 一括追加バー (1 件以上選択時に表示) */}
            {selectedTickers.size > 0 && (
              <div
                data-testid="screener-bulk-watchlist-bar"
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '8px 12px',
                  marginBottom: 4,
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm, 4px)',
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {selectedTickers.size} 件を選択中
                </span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setSelectedTickers(new Set())}
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm, 4px)',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    選択解除
                  </button>
                  <button
                    type="button"
                    data-testid="screener-bulk-watchlist"
                    onClick={handleBulkAdd}
                    className="text-white"
                    style={{
                      fontSize: 11,
                      padding: '3px 10px',
                      border: '1px solid var(--color-accent)',
                      borderRadius: 'var(--radius-sm, 4px)',
                      background: 'var(--color-accent)',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    ウォッチリストに追加
                  </button>
                </span>
              </div>
            )}
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
              /* Pass B: 条件合致度降順 (sortedItems)。上位3件強調 + 下位淡化。 */
              /* Pass C: 初期 100 件キャップ。超過時は「残りN件を表示」ボタン。 */
              <div
                data-testid="screener-result-list"
                className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] overflow-hidden"
              >
                {(showAllResults ? sortedItems : sortedItems.slice(0, 100)).map((it, idx) => {
                  // ── 上位強調 / 下位後退 (weight/size/opacity のみ、色 polarity なし §38) ──
                  const isTop = idx < 3;
                  const total = sortedItems.length;
                  // 後半ほど淡く: 上半=1.0, 下半=0.55 に線形
                  const opacityVal = total <= 1 ? 1 : idx < Math.ceil(total / 2) ? 1 : Math.max(0.55, 1 - (idx / total) * 0.45);

                  // ── ヒット理由バッジ (スコア寄与順・最大3個) ──
                  const activeFacetsSorted = FUNDA_FACETS
                    .flatMap((f) => {
                      const lvl = activeGrades[f.key];
                      const thr = lvl ? f.grades[lvl] : null;
                      if (thr == null) return [];
                      const v = it[f.key];
                      if (v == null) return [];
                      // 寄与スコアで降順
                      const contrib = thr !== 0 ? (v - thr) / Math.abs(thr) : v;
                      return [{ key: f.key, contrib }];
                    })
                    .sort((a, b) => b.contrib - a.contrib)
                    .slice(0, 2); // 狭い screener カラム幅に確実に収めるため上位2件 (spec「2-3個」範囲内)

                  const isSelected = selectedTickers.has(it.ticker);
                  return (
                    <div
                      key={it.ticker}
                      role="button"
                      tabIndex={0}
                      className={`group screener-result-row w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors${isSelected ? ' bg-[var(--bg-subtle)]' : ''}`}
                      onClick={() => {
                        trackEvent('screener_row_click', { ticker: it.ticker, rank: idx, mode: 'custom' });
                        onSelect?.(it.ticker);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          trackEvent('screener_row_click', { ticker: it.ticker, rank: idx, mode: 'custom' });
                          onSelect?.(it.ticker);
                        }
                      }}
                      data-testid={`screener-result-row-${it.ticker}`}
                      data-rank-top={isTop ? 'true' : undefined}
                      style={{ opacity: opacityVal, cursor: 'pointer', userSelect: 'none' }}
                    >
                      {/* dogfood fix Bug1: checkbox は logo と別セル (logo 常時表示・hover で消さない)。
                          hover/選択時のみ可視 + interactive (非表示時 pointer-events-none で誤タップ防止)。
                          チップを 2 行目へ移したため 1 行目に checkbox+logo 常時表示の幅が確保できる。 */}
                      <span
                        className={`shrink-0 flex items-center self-center transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'}`}
                        style={{ width: 16 }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            setSelectedTickers((prev) => {
                              const n = new Set(prev);
                              n.has(it.ticker) ? n.delete(it.ticker) : n.add(it.ticker);
                              return n;
                            });
                          }}
                          data-testid={`screener-row-select-${it.ticker}`}
                          aria-label={`${it.ticker} を選択`}
                          style={{ cursor: 'pointer', accentColor: 'var(--color-accent)' }}
                        />
                      </span>

                      {/* ロゴ (常時表示・hover で消さない) */}
                      <span className="shrink-0 self-center">
                        <CompanyLogo ticker={it.ticker} size={isTop ? 28 : 24} monoFallback />
                      </span>

                      {/* dogfood fix Bug2: メイン列を 2 段に分離。
                          1 行目=ティッカー(左)+RS(右)、2 行目=ヒット理由チップ+会社名。
                          狭幅でティッカーとチップが横方向に干渉していたため縦に分け、干渉を解消
                          (高さは元々 ticker+会社名 で 2 行ぶんあり密度不変)。 */}
                      <span className="flex flex-col min-w-0 flex-1 gap-0.5">
                        {/* 1 行目: ティッカー + RS */}
                        <span className="flex items-center justify-between gap-2">
                          <span
                            className="font-mono leading-tight tabular-nums text-[var(--text-primary)] truncate"
                            style={{ fontWeight: isTop ? 700 : 600, fontSize: isTop ? '0.875rem' : '0.8125rem' }}
                          >
                            {it.ticker}
                          </span>
                          {it.rs_percentile != null && (
                            /* §38: color polarity 撤廃 (買い断定誘導防止)。RS は数値のみ */
                            <span
                              className="shrink-0 text-xs tabular-nums text-[var(--text-secondary)]"
                              style={{ fontWeight: it.rs_percentile >= 85 ? 600 : 400 }}
                            >
                              RS {it.rs_percentile.toFixed(0)}
                            </span>
                          )}
                        </span>
                        {/* 2 行目: ヒット理由チップ(§38 中立 Chip) + 会社名(truncate)。
                            EPS YoY 数値は非表示 (ADR偽値 Trust Cliff [task#13]、EPS 充足は Chip で表現)。 */}
                        <span className="flex items-center gap-1.5 min-w-0">
                          {activeFacetsSorted.length > 0 && (
                            <span className="flex items-center gap-1 shrink-0">
                              {activeFacetsSorted.map(({ key }) => (
                                <Chip key={key} size="xs" variant="display" tone="muted">
                                  {FACET_SHORT_LABEL[key] || key}
                                </Chip>
                              ))}
                            </span>
                          )}
                          <span className="truncate text-[0.6875rem] leading-tight text-[var(--text-muted)]">
                            {it.name || it.ticker}
                          </span>
                        </span>
                      </span>
                    </div>
                  );
                })}
                {/* Pass C: 件数キャップ超過時「残りN件を表示」ボタン (仮想スクロール不採用) */}
                {!showAllResults && sortedItems.length > 100 && (
                  <div className="flex items-center justify-center px-4 py-3 border-t border-[var(--border)]">
                    <button
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                      onClick={() => setShowAllResults(true)}
                      data-testid="screener-show-more"
                    >
                      残り {sortedItems.length - 100} 件を表示
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
