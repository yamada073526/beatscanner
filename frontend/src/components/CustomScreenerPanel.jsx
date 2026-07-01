import { useEffect, useState, useMemo, useRef, useCallback, forwardRef, useImperativeHandle, Fragment } from 'react';
import { SlidersHorizontal, ChevronDown, Lock } from 'lucide-react';
import { fetchScannerUniverse } from '../api.js';
// Sprint 5 Pass D: GA4/Clarity 比較 event (C-16 昇格ゲート baseline 用)
import { trackEvent } from '../lib/analytics.js';
import Chip from './ui/Chip.jsx';
// Sprint 3: 市場局面バナーを ScreenerPane と共有 (FtdRegimeBanner.jsx が SSOT、二重定義なし)
import FtdRegimeBanner from '../features/workspace/FtdRegimeBanner.jsx';
// Pass B: 企業ロゴ (TV→FMP→頭文字円 3 段 fallback)
import CompanyLogo from './CompanyLogo.jsx';
// Sprint 1 Pass 1b: 共有 row primitive (screenerV2=true のみ、A-1 物理隔離)
import ScreenerRow from '../features/workspace/ScreenerRow.jsx';
import ScreenerGridTable, { presetWin } from '../features/workspace/ScreenerGridTable.jsx';

// 結果リストを「決算の通信簿」grid table で出す preset 集合。
//   earnings_pass / hot_sector = 決算列 (従来) / 残り4つ = preset 別根拠列 (column-driven)。
//   custom mode (activePreset=null) は対象外 = ScreenerRow (合致バッジ) を維持。
const GRID_TABLE_PRESETS = new Set([
  'earnings_pass', 'hot_sector', 'new_high_break', 'sector_leader', 'quiet_quality', 'market_leading',
]);

// 純関数層 (facet / 述語 / 件数集計) は customScreenerModel.js へ抽出。本 component から使用するものを import。
import {
  sectorLabelJp,
  MCAP_BANDS,
  FUNDA_FACETS,
  NEW_HIGH_SIGNAL_FACET,
  BUY_ZONE_G_FACET,
  FACET_MAP,
  PRESET_CORE_KEYS,
  PRESET_LABELS,
  PRESET_LABEL_JP,
  GRADE_LABELS_SHORT,
  facetLevels,
  clampLevel,
  gradeAnnot,
  OCF_MARGIN_FACET,
  OCF_GT_NI_FACET,
  BUY_ZONE_FACET,
  NEW_HIGH_52W_FACET,
  AD_VOLUME_FACET,
  CUP_STATE_ORDER,
  CUP_STATE_LABEL_JP,
  SEASON_LABEL,
  PRESET_CONDS,
  COND_MAP,
  LOCKED_FACET_LABELS,
  FACET_SHORT_LABEL,
  CROW_BINARY_META,
  CROW_LAYOUT,
  CROW_INLINE_LOCKED_KEYS,
  PRESET_DISPLAY_CONDS,
  PRESET_METRIC_KEY,
  sortRows,
  SORT_OPTIONS,
  PRESET_GATE_CONDS,
  buildMatchReason,
  buildActiveGrades,
  itemPasses,
  PRESET_PREDICATES,
  presetDefaultPrecision,
  presetPrecisionLevels,
  topSectorsByRs,
  sectorTone,
  sectorTagJp,
  fmtSr,
  buildSectorSummary,
  countPreset,
} from './customScreenerModel.js';

// 後方互換: 旧来 CustomScreenerPanel.jsx から公開していた named export を維持
// (consumer: ./CustomScreenerPanel.invariants.test.js / ../features/workspace/ScreenerMaster.jsx)。
// 純関数層の SSOT は customScreenerModel.js に移管済 (件数 SSOT 不変)。
export {
  PRESET_CONDS, CROW_LAYOUT, PRESET_DISPLAY_CONDS, PRESET_GATE_CONDS,
  buildActiveGrades, itemPasses, PRESET_PREDICATES, presetDefaultPrecision,
  presetPrecisionLevels,
  topSectorsByRs, sectorTone, sectorTagJp, fmtSr, buildSectorSummary, countPreset,
};

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

const CustomScreenerPanel = forwardRef(function CustomScreenerPanel({
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
  // IA昇格: preset→custom 切替で本パネルが新規 mount される際、親で選択済の戦略 key を
  // mount 時に 1 回だけ適用する (ref が null のタイミングを initialStrategy で補完)。
  initialStrategy = null,
}, ref) {
  // Pass 3b: 統合 universe state (additive facet engine の母集団)
  const [universe, setUniverse] = useState(_universeCache);
  const [universeLoading, setUniverseLoading] = useState(false);
  const [universeError, setUniverseError] = useState(null);
  // Pass 3b: preset セグメントトグル + overrides (Pass 3c で setter を有効化)
  const [preset, setPreset] = useState('standard');
  const [overrides, setOverrides] = useState({});
  // Pass 3c: 詳細展開 accordion の開閉状態。② drift fix: mockup v8 は refine=open default
  //   (.fh トグルで開閉、初期は展開済) のため default open に揃える。
  const [detailOpen, setDetailOpen] = useState(true);
  // #2 slice 2-c: アドバンスド(個別緩急) panel 開閉。OFF=精度プリセットのみ、ON=per-facet mini-segment 露出。
  const [advOpen, setAdvOpen] = useState(false);
  // #2 slice 2-d: Free が Pro-locked な個別緩急を操作した時のみ lockbar を出す nudge flag (常駐させない §4.3)。
  const [advLockNudge, setAdvLockNudge] = useState(false);
  // Pass 3b: sector / mcap additive refinement (universe ベース)
  const [sectorFilter, setSectorFilter] = useState([]);
  const [mcapFilter, setMcapFilter] = useState([]);
  // Pass 3b: funda_pass binary chip
  const [fundaPassOnly, setFundaPassOnly] = useState(false);
  // Sprint 3: 営業CFマージン binary chip (上流ファンダ品質・常時鮮度。funda_pass とは別次元)
  const [ocfMarginOnly, setOcfMarginOnly] = useState(false);
  // Phase1 S3: #1 営業CF>純利益 binary chip (利益の質・free)
  const [ocfGtNiOnly, setOcfGtNiOnly] = useState(false);
  // Phase1 S3: #3 買い場圏 binary chip (pivot 近接・Premium。free user には locked chip で表示)
  const [buyZoneOnly, setBuyZoneOnly] = useState(false);
  // 52週高値更新 binary chip (Premium。free user には breakout locked chip で表示)
  const [newHigh52wOnly, setNewHigh52wOnly] = useState(false);
  // Phase1 S4: #8 A/D 出来高の質 binary chip (上昇引け優勢・Premium。free user には locked chip で表示)
  const [adVolumeOnly, setAdVolumeOnly] = useState(false);
  // beat/cfps Phase 2: 決算の継続性 trio (任意トグル・default OFF)。
  const [eps3RisingOnly, setEps3RisingOnly] = useState(false);
  const [rev3RisingOnly, setRev3RisingOnly] = useState(false);
  const [cfpsRisingOnly, setCfpsRisingOnly] = useState(false);
  // 条件5: CFPS>EPS 比 (cfps_eps_ratio > 1.0)。null = AND 除外 (sector guard / 外貨ADR / EPS≤0 / 欠落)。backend PR#141 配線済。
  const [cfpsEpsRatioOnly, setCfpsEpsRatioOnly] = useState(false);
  // beat/cfps Phase 2 (Sprint 3): 直近決算ビート gate (new_high_break で常時 ON・binBindings には入れない)。
  const [beatOnly, setBeatOnly] = useState(false);
  // Phase A: セクター別リーダー binary flag (is_sector_rs_leader=true ∩ ocfMarginOnly)。
  const [sectorLeaderOnly, setSectorLeaderOnly] = useState(false);
  // Phase C: 現在適用中の戦略 preset key (master-detail view 切替に使用・表示専用)。
  const [activePreset, setActivePreset] = useState(initialStrategy || null);
  // D-8 sort (SPEC_2026-06-25): ユーザー制御の sort key (default = 合致度順)。applyStrategyImpl で
  //   reset するため activePreset 付近で宣言。表示順 displayItems は後段の useMemo で算出。
  const [sortKey, setSortKey] = useState('relevance');
  // Sprint3 (SPEC §14) + per-preset 根拠カラム: screener_v2 結果テーブルを「決算の通信簿」grid table へ。
  //   全 preset (earnings_pass / hot_sector / new_high_break / sector_leader / quiet_quality /
  //   market_leading) または ?screener_mock=1 (mock dogfood) のとき採用。earnings 系は決算列 (従来)、
  //   残り4つは preset 別根拠列 (ScreenerGridTable が preset prop で切替)。custom mode (activePreset=null)
  //   は従来 ScreenerRow 経路 (合致バッジが根拠) を維持。
  const screenerGridMock = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('screener_mock') === '1';
  const useScreenerGridTable = screenerV2
    && (screenerGridMock || (activePreset != null && GRID_TABLE_PRESETS.has(activePreset)));
  // cup「型」状態トグル (新高値ブレイク・Premium): default 'all' = 件数不変 (任意の絞り込み・gate1 確定)。
  //   applyStrategyImpl で reset するため sortKey と同様 activePreset 近傍で宣言 (v271 教訓)。
  const [cupState, setCupState] = useState('all');
  // Phase C: 旬のセクター master-detail で選択中のセクター (null = 先頭)。
  const [selectedSector, setSelectedSector] = useState(null);
  // Pass C: 件数キャップ — 初期 100 件、「残りN件を表示」で全件展開
  const [showAllResults, setShowAllResults] = useState(false);
  // Sprint 5 Pass B: 複数選択 → watchlist 一括追加
  const [selectedTickers, setSelectedTickers] = useState(() => new Set());

  // StrategyPresetBar → applyStrategy 本体 (imperative handle と mount 時適用で共用)。
  // 設計: state setter を直接呼ぶ (Redux store に混入しない、C-12 遵守)。
  /**
   * presetKey: 'earnings_pass' | 'new_high_break' | null (null = リセット)
   *
   * 決算合格 (earnings_pass):
   *   preset='standard' + fundaPassOnly=true + ocfMarginOnly=true + ocfGtNiOnly=true
   *   ★ funda_pass が 5 条件を内包。CF 2 本追加で「絶対6条件」に相当。
   *   overrides はリセット (preset 選び直し §0-7 と同規約)。
   *
   * 新高値ブレイク (new_high_break):
   *   buyZoneOnly=true (pivot 0〜+5%) + newHigh52wOnly=true (is_new_52w_high===true)
   *   ★ 52週高値 facet 実装済 (is_new_52w_high)。cup/breakout の状態分類トグルは将来拡張。
   *   preset='standard' (RS=85 維持で勢いも担保)。
   *   overrides はリセット。
   *
   * null (解除):
   *   すべての binary facet とプリセット overrides を初期値に戻す。
   *   preset='standard', overrides={} のみリセット (sector/mcap は保持)。
   */
  const applyStrategyImpl = useCallback((presetKey) => {
    // Phase C: active preset を追跡 (hot_sector のとき master-detail view へ切替・表示専用)。
    setActivePreset(presetKey);
    setSelectedSector(null);
    // D-8 (multi-review qa 指摘): preset 切替で sort を default (合致度順) に戻す。前 preset の
    //   sort 残留 (例: 時価総額順のまま別 preset へ) を防ぐ。BeatScanner は合致度順 default のため
    //   context 変化で reset が自然。
    setSortKey('relevance');
    // cup「型」状態トグルも preset 切替 / 全クリアで default ('すべて' = 件数不変) に戻す (sortKey と同規約)。
    setCupState('all');
    // まず共通リセット (overrides / binary facets)。精度は preset の default (S3 P1-b: sector_leader='loose')。
    setPreset(presetDefaultPrecision(presetKey));
    setOverrides({});
    setFundaPassOnly(false);
    setOcfMarginOnly(false);
    setOcfGtNiOnly(false);
    setBuyZoneOnly(false);
    setNewHigh52wOnly(false);
    setAdVolumeOnly(false);
    setSectorLeaderOnly(false);
    setEps3RisingOnly(false);
    setRev3RisingOnly(false);
    setCfpsRisingOnly(false);
    setCfpsEpsRatioOnly(false);
    setBeatOnly(false);
    setSectorFilter([]);
    setMcapFilter([]); // S3 P1-b: mcap cap を preset 切替で必ず初期化 (sector_leader 以外への漏れ=count≠list 防止)

    if (presetKey === 'earnings_pass') {
      // 5 条件達成 + 利益の質 (PRESET_PREDICATES.earnings_pass と一致)。
      //   ocf_margin は P1-a で grade 化 → PRESET_PREDICATES.grades 経由で activeGrades に算入 (flag 不要)。
      setFundaPassOnly(true);
      setOcfGtNiOnly(true);
    } else if (presetKey === 'new_high_break') {
      // 新高値ブレイク gate 修正 (SPEC_2026-06-25): 52週高値圏 (new_high_signal) は grade cond 化したため
      //   PRESET_PREDICATES.grades 経由で activeGrades に算入 (flag 不要)。買い場圏(buy_zone_g)は微調整で撤去。
      //   beat は gate flag。
      setBeatOnly(true);
    } else if (presetKey === 'sector_leader') {
      // セクター別リーダー (S3 P1-b): is_sector_rs_leader (extra.sectorLeaderOnly) + 機関保有増 QoQ≥0 (grades の
      //   inst_holders_qoq=loose 固定 gate) + mcap cap (中型↑/大型)。ocf_margin/roe/rs は grades 経由。
      //   mcapFilter を PRESET_PREDICATES.sector_leader.extra.mcapBands と一致させ count(countPreset)==list を担保。
      setSectorLeaderOnly(true);
      setMcapFilter(['mega', 'mid']);
    } else if (presetKey === 'hot_sector') {
      // 旬のセクター (Phase C 本実装): 正規 view は isSectorView の master-detail 一本
      //   (buildSectorSummary)。stock-list 描画経路は廃止済 (汎用 table は no-data fallback のみ)。
      //   下の funda_pass + sectorFilter=上位5 は「描画」でなく countPreset(topSectorsByRs ∩ funda_pass)
      //   と filteredItems を一致させる件数 SSOT 機構 (count==list・Trust Cliff)。撤去不可。
      //   _universeCache=module-scope は常に最新。
      setFundaPassOnly(true);
      setSectorFilter(topSectorsByRs(_universeCache?.items || [], 5));
    } else if (presetKey === 'market_leading') {
      // 市場をリードし始めた銘柄 (SPEC_2026-06-28 market_leading): 直近決算ビートを gate flag (beatOnly) に。
      //   grades (rs_mid_band/vs_spy/ocf_margin_pct/roe_lenient/eps_yoy_mid) は PRESET_PREDICATES.grades 経由で
      //   activeGrades に算入 (flag 不要)。extra.beatOnly=true と一致させ countPreset(tile)==filteredItems(list) を
      //   担保 (count==list・Trust Cliff)。mcap cap なし。
      setBeatOnly(true);
    }
    // null = リセットのみ (共通処理で完了)
  }, []);

  useImperativeHandle(ref, () => ({ applyStrategy: applyStrategyImpl }), [applyStrategyImpl]);

  // IA昇格: preset→custom 切替で本パネルが新規 mount された際、親で選択済の戦略を初回 1 回適用。
  // imperative path (mount 済での選択) とは排他: ref guard で「初回 mount のみ」に限定し、
  // 以後の initialStrategy 変化は imperative 経由 (二重適用しない)。
  const didApplyInitialStrategy = useRef(false);
  useEffect(() => {
    if (didApplyInitialStrategy.current) return;
    didApplyInitialStrategy.current = true;
    if (initialStrategy) applyStrategyImpl(initialStrategy);
  }, [initialStrategy, applyStrategyImpl]);

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
  // list 述語: activePreset の grade セットを精度 (preset state) でスケール。count==list の核。
  //   countPreset(tile) は同 presetKey を 'standard' 精度で呼ぶため、クリック直後 (precision=standard) は一致。
  const activeGrades = useMemo(() => buildActiveGrades(activePreset, preset, overrides), [activePreset, preset, overrides]);
  // #2 slice 2-d: 個別緩急(per-facet override)は Pro。screener_v2 scope のみゲート (legacy 不変 §4.5)。
  const advLocked = screenerV2 && !isProUser;
  // 新高値ブレイク gate 修正 (SPEC_2026-06-25): preset レベル Premium gate 判定。
  //   backend は非 premium に is_new_52w_high/pivot_distance_pct を null マスクし locked_facets に 'breakout' を入れる
  //   (CROW_BINARY_META.new_high_52w.locked='breakout' の lock crow が依存する既存シグナル)。
  //   'breakout' 不在 = Premium。Pro は near_high を持つため preset レベルで明示 gate (user 承認: Premium 専用維持)。
  const isPremiumUser = !((universe?.locked_facets || []).includes('breakout'));
  // #2 slice 2-c: 精度プリセットから個別変更したか (カスタム tag・状態の見える化 §1-6)。
  // isCustom: grade override があるか、または binary トグルが当該 preset の既定 (PRESET_PREDICATES.extra)
  //   から変化したら true。「カスタム」タグで preset 名と中身の乖離を明示する (funda_pass を OFF にして
  //   「決算合格」を緩めた等の免責・qa review 2026-06-26)。preset 既定トグルは extra の真フラグが SSOT
  //   (applyStrategyImpl が extra と一致する初期トグルをセットするため、初期表示では custom にならない)。
  const _presetExtra = (activePreset && PRESET_PREDICATES[activePreset]?.extra) || {};
  const _toggleState = { fundaPassOnly, ocfGtNiOnly, ocfMarginOnly, beatOnly, sectorLeaderOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, eps3RisingOnly, rev3RisingOnly, cfpsRisingOnly, cfpsEpsRatioOnly };
  const _togglesChanged = Object.entries(_toggleState).some(([f, v]) => !!v !== (_presetExtra[f] === true));
  const isCustom = Object.keys(overrides).length > 0 || _togglesChanged;
  const filteredItems = useMemo(() => {
    const items = universe?.items || [];
    const extra = { fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, eps3RisingOnly, rev3RisingOnly, cfpsRisingOnly, cfpsEpsRatioOnly, beatOnly, sectorLeaderOnly, cupState, sectors: sectorFilter, mcapBands: mcapFilter };
    return items.filter((it) => itemPasses(it, activeGrades, extra));
  }, [universe, activeGrades, fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, eps3RisingOnly, rev3RisingOnly, cfpsRisingOnly, cfpsEpsRatioOnly, beatOnly, sectorLeaderOnly, cupState, sectorFilter, mcapFilter]);

  // Pass B: 条件合致度順ソート。
  // スコア = アクティブ数値 facet ごとに (item[key] - threshold) / threshold の合計。
  // §38 厳守: スコアは内部ソート専用。画面非表示・色 polarity なし。
  const sortedItems = useMemo(() => {
    // アクティブ facet のうち threshold が null でないものを収集
    const activeFacets = FUNDA_FACETS.flatMap((f) => {
      const lvl = activeGrades[f.key];
      const thr = lvl ? f.grades[lvl] : null;
      return thr != null ? [{ key: f.key, threshold: thr, cmp: f.cmp }] : [];
    });
    const scored = filteredItems.map((it) => {
      let score = 0;
      for (const { key, threshold, cmp } of activeFacets) {
        const v = it[key];
        if (v == null) continue;
        // threshold=0 は差分をそのまま加算 (inst_holders 等)、それ以外は閾値で正規化。
        let part = threshold !== 0 ? (v - threshold) / Math.abs(threshold) : v;
        // cmp 'lte' = 上限型 (出来高 静か等) は「低いほど合致」= 符号反転 (§38 内部ソートのみ・非表示)。
        if (cmp === 'lte') part = -part;
        score += part;
      }
      // gold 標榜 (別格) を合致度順の最上位へ浮かせる (user dogfood: 「別格=並び順も上位」)。
      //   合致度 score は全 facet の総合で、gold は戦略の核軸での突出 = 別尺度のため両者は乖離する。
      //   gold を 1次キーにして「別格を先頭」を実現 (各群内は従来 score 降順を維持)。
      //   presetWin は column-driven 4 preset のみ true (earnings_pass/hot_sector は false=従来順)。§38: 事実順。
      return { it, score, win: presetWin(it, activePreset) ? 1 : 0 };
    });
    scored.sort((a, b) => b.win - a.win || b.score - a.score || a.it.ticker.localeCompare(b.it.ticker));
    return scored.map((s) => s.it);
  }, [filteredItems, activeGrades, activePreset]);

  // ── Phase C「旬のセクター」master-detail (SPEC_2026-06-27・U-2=(b) 市場全体の俯瞰) ──
  //   集計ロジックは純関数 buildSectorSummary が SSOT (module top・unit-test 済)。component は
  //   呼ぶだけ。master=全 universe のセクター俯瞰 / count・top3=filteredItems という C-2 不変は
  //   buildSectorSummary の JSDoc 参照。件数 SSOT (PRESET_PREDICATES/itemPasses/topSectorsByRs) は不触。
  const sectorSummary = useMemo(
    () => buildSectorSummary(universe?.items, filteredItems),
    [universe, filteredItems],
  );
  // 選択中セクター (未選択 or 集合変化で消えたら先頭に fallback)。
  const activeSector = useMemo(
    () => (sectorSummary.length ? (sectorSummary.find((s) => s.sn === selectedSector) || sectorSummary[0]) : null),
    [sectorSummary, selectedSector],
  );
  const isSectorView = activePreset === 'hot_sector' && sectorSummary.length > 0;

  // D-8 sort (SPEC_2026-06-25): 表示順 displayItems。'relevance' は合致度 (sortedItems) を維持。
  //   それ以外は filteredItems を sortRows で並べ替え。metric で preset 未マップなら合致度順に fallback
  //   (UI 側でも当該 option を disabled 化済 = silent fallback を起こさない・multi-review 指摘)。
  //   集合不変のため displayItems.length === filteredItems.length === sortedItems.length (C-2)。
  //   sortKey state は activePreset 付近で宣言 (applyStrategyImpl の reset 都合)。
  const displayItems = useMemo(() => {
    if (sortKey === 'relevance') return sortedItems;
    if (sortKey === 'metric' && !PRESET_METRIC_KEY[activePreset]) return sortedItems;
    return sortRows(filteredItems, sortKey, activePreset);
  }, [sortKey, sortedItems, filteredItems, activePreset]);

  // Pass C: フィルタ変更で結果集合が変わったら件数キャップを 100 件に戻す
  // (「残りN件を表示」を一度押しても、新しい絞り込みでは描画負荷抑制の意図を維持)。
  useEffect(() => { setShowAllResults(false); }, [filteredItems]);

  // Pass 3b: preset 別の total 件数 (緩い/標準/厳しい) を live 算出。ハードコード禁止。
  const presetCounts = useMemo(() => {
    const items = universe?.items || [];
    const extra = { fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, eps3RisingOnly, rev3RisingOnly, cfpsRisingOnly, cfpsEpsRatioOnly, beatOnly, sectorLeaderOnly, cupState, sectors: sectorFilter, mcapBands: mcapFilter };
    const result = {};
    // S4 market_leading: 精度段数は preset 毎 (market_leading は 4 段=最厳追加、他は 3 段)。
    for (const lvl of presetPrecisionLevels(activePreset)) {
      const grades = buildActiveGrades(activePreset, lvl, overrides);
      result[lvl] = items.filter((it) => itemPasses(it, grades, extra)).length;
    }
    return result;
  }, [universe, activePreset, overrides, fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, eps3RisingOnly, rev3RisingOnly, cfpsRisingOnly, cfpsEpsRatioOnly, beatOnly, sectorLeaderOnly, cupState, sectorFilter, mcapFilter]);

  // Pass 3c: faceted 件数 — 各 facet の各 level に変えた時の件数 (itemPasses 共有、Trust Cliff C-2)。
  // facet K を level L にした時の件数 = { ...activeGrades, [K]: L } で filter。
  // level='off' = K を外した件数 = delete g[K]。
  const facetLevelCounts = useMemo(() => {
    const items = universe?.items || [];
    const extra = { fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, eps3RisingOnly, rev3RisingOnly, cfpsRisingOnly, cfpsEpsRatioOnly, beatOnly, sectorLeaderOnly, cupState, sectors: sectorFilter, mcapBands: mcapFilter };
    const result = {};
    for (const facet of FUNDA_FACETS) {
      result[facet.key] = {};
      // 'なし' = この facet を active grades から外した件数
      const gOff = { ...activeGrades };
      delete gOff[facet.key];
      result[facet.key]['off'] = items.filter((it) => itemPasses(it, gOff, extra)).length;
      // 各 level (facet ごとの有効段のみ。eps_cagr_3y は loose なし / eps_yoy は severe あり)
      for (const lvl of facetLevels(facet)) {
        const g = { ...activeGrades, [facet.key]: lvl };
        result[facet.key][lvl] = items.filter((it) => itemPasses(it, g, extra)).length;
      }
    }
    return result;
  }, [universe, activeGrades, fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, eps3RisingOnly, rev3RisingOnly, cfpsRisingOnly, cfpsEpsRatioOnly, beatOnly, sectorLeaderOnly, cupState, sectorFilter, mcapFilter]);

  // Pass 3c: empty サジェスト — 現在 active な制約を1つ外した時に最も件数が増える提案を算出。
  const emptySuggest = useMemo(() => {
    if (filteredItems.length > 0) return null;
    const items = universe?.items || [];
    const extra = { fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, eps3RisingOnly, rev3RisingOnly, cfpsRisingOnly, cfpsEpsRatioOnly, beatOnly, sectorLeaderOnly, cupState, sectors: sectorFilter, mcapBands: mcapFilter };
    let best = null;
    // B-3.5: gate (南京錠・変更不可) は「外す提案」の候補から除外する。
    //   「外せない条件を外せ」と提案する矛盾 (Trust Cliff) を防ぐ (SPEC §5 Sprint 3)。
    const gateFlagSet = new Set(
      ((activePreset && PRESET_GATE_CONDS[activePreset]) || []).map((k) => COND_MAP[k]?.flag).filter(Boolean)
    );
    // overrides の各 facet を外す
    for (const [key, lvl] of Object.entries(overrides)) {
      if (lvl === 'off') continue;
      const g = { ...activeGrades };
      delete g[key];
      const cnt = items.filter((it) => itemPasses(it, g, extra)).length;
      if (!best || cnt > best.count) best = { key, label: FACET_MAP[key]?.label || key, count: cnt, type: 'override' };
    }
    // 適用中の grade facet を1つ外す (preset 別 grade セット = activeGrades の実 key を走査。
    //   PRESET_CORE_KEYS 固定だと new_high_break で非適用の eps_cagr/roe を誤提案するため修正)。
    for (const key of Object.keys(activeGrades)) {
      if (key in overrides) continue; // overrides ループで処理済
      // 新高値ブレイク gate 修正: new_high_signal/buy_zone_g は preset の必須/精度連動条件 (gate 相当)。
      //   「外す提案」候補から除外 (変更不可条件を外せという矛盾を防ぐ・SPEC §4.2.3 と整合)。
      if (key === 'new_high_signal' || key === 'buy_zone_g') continue;
      const g = { ...activeGrades };
      delete g[key];
      const cnt = items.filter((it) => itemPasses(it, g, extra)).length;
      if (!best || cnt > best.count) best = { key, label: FACET_MAP[key]?.label || key, count: cnt, type: 'preset' };
    }
    // fundaPassOnly を外す
    if (fundaPassOnly && !gateFlagSet.has('fundaPassOnly')) {
      const cnt = items.filter((it) => itemPasses(it, activeGrades, { ...extra, fundaPassOnly: false })).length;
      if (!best || cnt > best.count) best = { key: 'funda_pass', label: '最新決算5条件', count: cnt, type: 'funda_pass' };
    }
    // ocfMarginOnly を外す (Sprint 3)。gate の preset では候補外 (B-3.5)。
    if (ocfMarginOnly && !gateFlagSet.has('ocfMarginOnly')) {
      const cnt = items.filter((it) => itemPasses(it, activeGrades, { ...extra, ocfMarginOnly: false })).length;
      if (!best || cnt > best.count) best = { key: 'ocf_margin', label: OCF_MARGIN_FACET.label, count: cnt, type: 'ocf_margin' };
    }
    // ocfGtNiOnly を外す (Phase1 S3 #1)。gate の preset では候補外 (B-3.5)。
    if (ocfGtNiOnly && !gateFlagSet.has('ocfGtNiOnly')) {
      const cnt = items.filter((it) => itemPasses(it, activeGrades, { ...extra, ocfGtNiOnly: false })).length;
      if (!best || cnt > best.count) best = { key: 'ocf_gt_netincome', label: OCF_GT_NI_FACET.label, count: cnt, type: 'ocf_gt_netincome' };
    }
    // buyZoneOnly を外す (Phase1 S3 #3)
    if (buyZoneOnly && !gateFlagSet.has('buyZoneOnly')) {
      const cnt = items.filter((it) => itemPasses(it, activeGrades, { ...extra, buyZoneOnly: false })).length;
      if (!best || cnt > best.count) best = { key: 'buy_zone', label: BUY_ZONE_FACET.label, count: cnt, type: 'buy_zone' };
    }
    // newHigh52wOnly を外す
    if (newHigh52wOnly && !gateFlagSet.has('newHigh52wOnly')) {
      const cnt = items.filter((it) => itemPasses(it, activeGrades, { ...extra, newHigh52wOnly: false })).length;
      if (!best || cnt > best.count) best = { key: 'new_high_52w', label: NEW_HIGH_52W_FACET.label, count: cnt, type: 'new_high_52w' };
    }
    // adVolumeOnly を外す (Phase1 S4 #8)
    if (adVolumeOnly && !gateFlagSet.has('adVolumeOnly')) {
      const cnt = items.filter((it) => itemPasses(it, activeGrades, { ...extra, adVolumeOnly: false })).length;
      if (!best || cnt > best.count) best = { key: 'ad_volume', label: AD_VOLUME_FACET.label, count: cnt, type: 'ad_volume' };
    }
    // beat/cfps Phase 2: 決算の継続性 trio を外す提案 (任意トグル・gate ではないので常に候補)。
    if (eps3RisingOnly) {
      const cnt = items.filter((it) => itemPasses(it, activeGrades, { ...extra, eps3RisingOnly: false })).length;
      if (!best || cnt > best.count) best = { key: 'eps_3y_rising', label: 'EPS 連続増', count: cnt, type: 'eps_3y_rising' };
    }
    if (rev3RisingOnly) {
      const cnt = items.filter((it) => itemPasses(it, activeGrades, { ...extra, rev3RisingOnly: false })).length;
      if (!best || cnt > best.count) best = { key: 'rev_3y_rising', label: '売上 連続増', count: cnt, type: 'rev_3y_rising' };
    }
    if (cfpsRisingOnly) {
      const cnt = items.filter((it) => itemPasses(it, activeGrades, { ...extra, cfpsRisingOnly: false })).length;
      if (!best || cnt > best.count) best = { key: 'cfps_3y_rising', label: 'CFPS 連続増(4期)', count: cnt, type: 'cfps_3y_rising' };
    }
    if (cfpsEpsRatioOnly) {
      const cnt = items.filter((it) => itemPasses(it, activeGrades, { ...extra, cfpsEpsRatioOnly: false })).length;
      if (!best || cnt > best.count) best = { key: 'cfps_eps_ratio', label: 'CFPS>EPS', count: cnt, type: 'cfps_eps_ratio' };
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
    // sectorLeaderOnly を外す (Phase A)。gate 化された sector_leader preset では候補外 (B-3.5・矛盾防止)。
    if (sectorLeaderOnly && !gateFlagSet.has('sectorLeaderOnly')) {
      const cnt = items.filter((it) => itemPasses(it, activeGrades, { ...extra, sectorLeaderOnly: false })).length;
      if (!best || cnt > best.count) best = { key: 'sector_leader', label: 'セクター別リーダー', count: cnt, type: 'sector_leader' };
    }
    return best;
  }, [filteredItems.length, universe, activeGrades, overrides, fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, eps3RisingOnly, rev3RisingOnly, cfpsRisingOnly, cfpsEpsRatioOnly, beatOnly, sectorLeaderOnly, cupState, sectorFilter, mcapFilter, activePreset]);

  // Pass 3c: sector / mcap 選択肢を universe から live 算出 (count 付き)。
  // Pass 3d (修正A): 全件 universe 集計から faceted count へ変更 (Trust Cliff C-2 修正)。
  // sector 次元自身は "自分の bucket を消さない" ため除外し、grades + funda_pass + mcap を適用。
  const sectorOptions = useMemo(() => {
    const items = universe?.items || [];
    const map = {};
    for (const it of items) {
      if (!it.sector) continue;
      // sector 次元自身は除き (自己排除防止)、他の active facet を適用
      if (!itemPasses(it, activeGrades, { fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, eps3RisingOnly, rev3RisingOnly, cfpsRisingOnly, cfpsEpsRatioOnly, beatOnly, sectorLeaderOnly, mcapBands: mcapFilter, sectors: [it.sector] })) continue;
      map[it.sector] = (map[it.sector] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([s, cnt]) => ({ value: s, label: sectorLabelJp(s), count: cnt }));
  }, [universe, activeGrades, fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, eps3RisingOnly, rev3RisingOnly, cfpsRisingOnly, cfpsEpsRatioOnly, beatOnly, sectorLeaderOnly, mcapFilter]);
  const mcapOptions = useMemo(() => {
    const items = universe?.items || [];
    const map = {};
    for (const it of items) {
      if (!it.mcap_band) continue;
      // mcap 次元自身は除き (自己排除防止)、他の active facet を適用
      if (!itemPasses(it, activeGrades, { fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, eps3RisingOnly, rev3RisingOnly, cfpsRisingOnly, cfpsEpsRatioOnly, beatOnly, sectorLeaderOnly, sectors: sectorFilter, mcapBands: [it.mcap_band] })) continue;
      map[it.mcap_band] = (map[it.mcap_band] || 0) + 1;
    }
    return MCAP_BANDS.filter((b) => map[b.key]).map((b) => ({ ...b, count: map[b.key] || 0 }));
  }, [universe, activeGrades, fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, eps3RisingOnly, rev3RisingOnly, cfpsRisingOnly, cfpsEpsRatioOnly, beatOnly, sectorLeaderOnly, sectorFilter]);

  // Pass 3d (修正C): funda_pass chip に件数を表示するための faceted count。
  // 件数 = funda_pass=true かつ grades + ocf + sector + mcap を通過した件数 (日付ではない)。
  // 自己 (funda_pass) は直接 filter するため extra に含めない。他次元 (ocfMarginOnly 含む) は反映。
  const fundaPassCount = useMemo(() => {
    const items = universe?.items || [];
    return items.filter(
      (it) => it.funda_pass === true &&
        itemPasses(it, activeGrades, { ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, eps3RisingOnly, rev3RisingOnly, cfpsRisingOnly, cfpsEpsRatioOnly, beatOnly, sectors: sectorFilter, mcapBands: mcapFilter })
    ).length;
  }, [universe, activeGrades, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, eps3RisingOnly, rev3RisingOnly, cfpsRisingOnly, cfpsEpsRatioOnly, beatOnly, sectorFilter, mcapFilter]);

  // Phase1 S3: grade override 行の共有レンダラ (旧 2d/2e の重複を統一)。
  // CORE (eps/roe/rs) は preset 駆動 = level 既定 preset・off は明示時のみ。
  // 非CORE (volume/inst) は off 既定・level は override 時のみ。これを isCore で分岐保持。
  const renderGradeRow = (facet) => {
    // 有効段のみ反映 (clamp 済 activeGrades が真の押下状態 SSOT)。
    // legacy (screenerV2=false) は severe 段・閾値併記を出さず従来 3 段表示を維持 (§6 物理隔離)。
    const activeLvl = activeGrades[facet.key]; // undefined = なし(off)
    const levels = screenerV2 ? facetLevels(facet) : facetLevels(facet).filter((l) => l !== 'severe');
    return (
      <div key={facet.key} className="flex flex-wrap items-center gap-1.5" data-testid={`screener-grade-row-${facet.key}`}>
        <span className="w-24 shrink-0 text-[11px] text-[var(--text-secondary)]">{facet.label}</span>
        {['off', ...levels].map((lvl) => {
          const cnt = facetLevelCounts[facet.key]?.[lvl] ?? 0;
          const actuallyPressed = lvl === 'off' ? activeLvl == null : activeLvl === lvl;
          const segLabel = lvl === 'off' ? 'なし' : GRADE_LABELS_SHORT[lvl];
          return (
            <Chip
              key={lvl}
              size="xs"
              variant="segmented"
              pressed={actuallyPressed}
              // §4.2 ちら見せ: Pro-lock 時は disabled を使わず (Chip disabled は onClick を殺す)、
              //   淡色 class + onClick→lockbar nudge で「価値は見えるが操作は Pro」を表現。
              disabled={advLocked ? false : (cnt === 0 && !actuallyPressed)}
              className={advLocked ? 'screener-grade-seg--locked min-w-[36px] justify-center' : 'min-w-[36px] justify-center'}
              ariaLabel={advLocked ? `${facet.label} ${segLabel} — Pro で個別に調整できます` : undefined}
              onClick={() => {
                if (advLocked) {
                  setAdvLockNudge(true);
                  trackEvent('screener_adv_locked_click', { facet: facet.key, level: lvl });
                  return;
                }
                setOverrides((prev) => ({ ...prev, [facet.key]: lvl === 'off' ? 'off' : lvl }));
              }}
              data-testid={`screener-grade-${facet.key}-${lvl}`}
            >
              {segLabel}
              {screenerV2 && lvl !== 'off' && (
                <span className="ml-0.5 tabular-nums opacity-80">{gradeAnnot(facet, lvl)}</span>
              )}
              <span className="ml-0.5 tabular-nums opacity-60">({cnt})</span>
            </Chip>
          );
        })}
      </div>
    );
  };

  // Phase1 S3: sector / mcap 絞り込みブロックの共有レンダラ (legacy / v2 両 path で再利用)。
  const renderSectorBlock = () => (sectorOptions.length === 0 ? null : (
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
  ));
  const renderMcapBlock = () => (mcapOptions.length === 0 ? null : (
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
  ));

  // ── Phase B-2: 全条件を mockup の .crow (トグル + ラベル + 値チップ) へ統一 ──
  // grade も binary も同じ 1 行形状で 2 列グリッドに揃える。mseg/gate南京錠/Premium lock crow は B-3。
  // 数値ロジック(itemPasses)は経由せず表示のみ。off→on の grade 復帰は overrides 操作で行う。
  const renderCrow = (cond, isGate = false) => {
    if (!cond) return null;
    // ── 逆張り「静かな強さ」専用 facet ガード (SPEC_2026-06-28 §10 Sprint3) ──
    //   volume_quiet (≤型) / inst_qoq_calm (≤型) は CROW_LAYOUT に登録済 (RENDERABLE 要件) だが、
    //   quiet_quality 以外 (custom mode = activePreset null 含む) では描かない。custom mode で
    //   ≥型 (出来高急増 / 機関保有増) と ≤型が同 group に並ぶ矛盾露出を構造的に防ぐ (Trust Cliff)。
    //   quiet_quality のときは下の汎用 grade crow (gradeAnnot が ≤ 閾値を描画) へ素通し。
    if (cond.key === 'volume_quiet' || cond.key === 'inst_qoq_calm' || cond.key === 'uptrend') {
      if (activePreset !== 'quiet_quality') return null;
    }
    // ── 「市場をリードし始めた銘柄」専用 facet ガード (SPEC_2026-06-28 market_leading) ──
    //   vs_spy / rs_mid_band / roe_lenient / eps_yoy_mid は CROW_LAYOUT 登録済 (RENDERABLE 要件) だが、
    //   market_leading 以外 (custom mode = activePreset null 含む) では描かない (他 preset 誤露出防止・Trust Cliff)。
    if (cond.key === 'vs_spy' || cond.key === 'rs_mid_band' || cond.key === 'roe_lenient' || cond.key === 'eps_yoy_mid') {
      if (activePreset !== 'market_leading') return null;
    }
    // rs_mid_band: 範囲帯 [下限(精度連動), 75] を custom 描画 (gate「必須」)。汎用 grade crow は ≥下限 のみ表示し
    //   上限 75 が隠れフィルタ化するため別描画 (Trust Cliff)。下限は現在精度の resolved level から取得。
    if (cond.key === 'rs_mid_band') {
      const lvl = activeGrades[cond.key] ?? clampLevel(cond.facet, preset);
      const lo = cond.facet.grades[lvl] ?? cond.facet.grades.standard;
      return (
        <div key={cond.key} className="screener-crow is-gate" data-testid="screener-cond-row" data-cond={cond.key} data-gate="1" title={cond.facet.tooltip}>
          <span className="screener-crow__lockicon" aria-hidden><Lock size={13} strokeWidth={2} /></span>
          <span className="screener-crow__lbl">{cond.facet.label}</span>
          <span className="screener-crow__th">RS {lo}〜{cond.facet.bandMax}</span>
          <span className="screener-crow__gate-pill" aria-label="この戦略の絶対条件（精度で下限が変化）">必須</span>
        </div>
      );
    }
    // ── 新高値ブレイク gate 修正 (SPEC_2026-06-25): new_high_break 専用 custom crow ──
    //   汎用 grade crow は 999 sentinel / 0〜+5% range を正しく表示できないため別描画。
    //   activePreset !== 'new_high_break' では描かない (custom mode で allowed=null=全 keys 誤露出を防ぐ・Trust Cliff)。
    if (cond.key === 'new_high_signal') {
      if (activePreset !== 'new_high_break') return null;
      const th = preset === 'strict'
        ? '高値3%以内 または 実ブレイク'
        : preset === 'loose' ? '高値10%以内 または 実ブレイク' : '高値5%以内 または 実ブレイク';
      return (
        <div key={cond.key} className="screener-crow is-gate" data-testid="screener-cond-row" data-cond={cond.key} data-gate="1" title={NEW_HIGH_SIGNAL_FACET.tooltip}>
          <span className="screener-crow__lockicon" aria-hidden><Lock size={13} strokeWidth={2} /></span>
          <span className="screener-crow__lbl">52週高値圏</span>
          <span className="screener-crow__th">{th}</span>
          <span className="screener-crow__gate-pill" aria-label="この戦略の絶対条件（精度で閾値が変化）">必須</span>
        </div>
      );
    }
    if (cond.key === 'buy_zone_g') {
      if (activePreset !== 'new_high_break') return null;
      if (preset === 'strict') {
        return (
          <div key={cond.key} className="screener-crow is-gate" data-testid="screener-cond-row" data-cond={cond.key} data-gate="1" title={BUY_ZONE_G_FACET.tooltip}>
            <span className="screener-crow__lockicon" aria-hidden><Lock size={13} strokeWidth={2} /></span>
            <span className="screener-crow__lbl">買い場圏</span>
            <span className="screener-crow__th">0〜+5%</span>
            <span className="screener-crow__gate-pill" aria-label="厳しい設定での絶対条件">必須</span>
          </div>
        );
      }
      // 緩/標: 適用外をグレーアウトで明示 (隠れフィルタ誤認防止・SPEC §4.2.3)。
      return (
        <div key={cond.key} className="screener-crow is-off opacity-50" data-testid="screener-cond-row" data-cond={cond.key} data-inactive="1" title="買い場圏（節目+5%以内）は「厳しい」設定でのみ有効です。">
          <span className="screener-crow__lbl">買い場圏</span>
          <span className="screener-crow__th">厳しい設定で有効</span>
        </div>
      );
    }
    if (cond.kind === 'grade') {
      const facet = cond.facet;
      // B-3.5 gate (S3 P1-b): 当該 preset の死守 grade を南京錠 (トグル/mseg 不可) で描画。
      //   grades に固定 level で算入済 (件数 SSOT)。機関保有増の QoQ≥0 必須等。flag gate (L1402) と同形だが
      //   grade は閾値を gradeAnnot で併記。§38: 数値は data 由来・色 polarity なし。
      if (isGate) {
        const gLvl = activeGrades[cond.key] ?? clampLevel(facet, 'loose');
        return (
          <div key={cond.key} className="screener-crow is-gate" data-testid="screener-cond-row" data-cond={cond.key} data-gate="1" title={facet.tooltip || undefined}>
            <span className="screener-crow__lockicon" aria-hidden><Lock size={13} strokeWidth={2} /></span>
            <span className="screener-crow__lbl">{facet.label}</span>
            {gLvl && <span className="screener-crow__th">{gradeAnnot(facet, gLvl)}以上</span>}
            <span className="screener-crow__gate-pill" aria-label={`${facet.label} はこの戦略の絶対条件（変更不可）`}>必須</span>
          </div>
        );
      }
      const activeLvl = activeGrades[cond.key];           // undefined = off
      const on = activeLvl != null;
      const isCore = PRESET_CORE_KEYS.includes(cond.key);
      const dispLvl = on ? activeLvl : (isCore ? clampLevel(facet, preset) : clampLevel(facet, 'standard'));
      // S3 P1-b: off→on の復帰経路。delete で preset 既定へ戻せるのは「custom(全 core が PRESET_CORE_KEYS 経路で
      //   復帰) 」または「preset spec が当該精度で level を与える core key」のみ。sector_leader の roe/ocf は緩段=null
      //   (非適用) のため delete では off のまま (dead toggle) → 明示 override を置いて確実に ON にする。
      const _ps = activePreset ? PRESET_PREDICATES[activePreset]?.grades?.[cond.key] : undefined;
      const _presetGivesLevel = typeof _ps === 'string'
        ? true
        : (_ps && typeof _ps === 'object' ? _ps[preset] != null : false);
      const _restorableByDelete = isCore && (!activePreset || _presetGivesLevel);
      const toggle = () => {
        if (advLocked) { setAdvLockNudge(true); trackEvent('screener_adv_locked_click', { facet: cond.key }); return; }
        if (on) setOverrides((prev) => ({ ...prev, [cond.key]: 'off' }));
        else if (_restorableByDelete) setOverrides((prev) => { const n = { ...prev }; delete n[cond.key]; return n; });
        else setOverrides((prev) => ({ ...prev, [cond.key]: clampLevel(facet, preset) || 'standard' }));
      };
      // B-3 mseg: adv ON 時、grade crow 内に精度セグメント (緩/標/厳/最厳) を full-width で出す。
      //   ロジックは renderGradeRow と同一 (overrides 設定 / advLocked は disabled でなく nudge §4.2)。
      const msegLevels = screenerV2 ? facetLevels(facet) : facetLevels(facet).filter((l) => l !== 'severe');
      return (
        <div key={cond.key} className={`screener-crow${on ? ' is-on' : ' is-off'}`} data-testid="screener-cond-row" data-cond={cond.key}>
          <button type="button" role="switch" aria-checked={on} className="screener-crow__sw" onClick={toggle} aria-label={`${facet.label} を${on ? '外す' : '加える'}`} />
          <span className="screener-crow__lbl">{facet.label}</span>
          <span className="screener-crow__th">{GRADE_LABELS_SHORT[dispLvl]} {gradeAnnot(facet, dispLvl)}</span>
          {advOpen && (
            <div
              className={`screener-crow__mseg${advLocked ? ' is-locked' : ''}`}
              role="group"
              aria-label={`${facet.label} の強度`}
              data-testid={`screener-mseg-${cond.key}`}
              style={{ '--mseg-n': msegLevels.length, '--mseg-i': Math.max(0, msegLevels.indexOf(dispLvl)) }}
              data-sel={on && msegLevels.includes(dispLvl) ? '1' : '0'}
            >
              {/* sliding thumb (精度セグと同方式)。選択段を gold tint で示し切替時に滑走。 */}
              <span className="screener-crow__mseg-thumb" aria-hidden />
              {msegLevels.map((lvl) => {
                const pressed = on && dispLvl === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    className={`screener-crow__mseg-btn${pressed ? ' is-on' : ''}`}
                    aria-pressed={pressed}
                    aria-label={advLocked ? `${GRADE_LABELS_SHORT[lvl]} — Pro で個別に調整できます` : `${facet.label} を ${GRADE_LABELS_SHORT[lvl]} に設定`}
                    onClick={() => {
                      if (advLocked) { setAdvLockNudge(true); trackEvent('screener_adv_locked_click', { facet: cond.key, level: lvl }); return; }
                      setOverrides((prev) => ({ ...prev, [cond.key]: lvl }));
                    }}
                    data-testid={`screener-mseg-${cond.key}-${lvl}`}
                  >
                    {GRADE_LABELS_SHORT[lvl]}
                    <span className="screener-crow__mseg-v">{gradeAnnot(facet, lvl)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    }
    const meta = CROW_BINARY_META[cond.key];
    if (!meta) return null;
    // B-3 lock crow: Premium 限定 facet は「非表示」でなく南京錠 crow で見せる (Trust Cliff #2・件数0誤解を解消)。
    //   freshness 無関係に提示 (Premium 機能の存在を広告)。表示専用で itemPasses/件数には不参加 (C-2 不変)。
    if (meta.locked && (universe?.locked_facets || []).includes(meta.locked)) {
      const isProTier = meta.locked === 'near_high';
      return (
        <div key={cond.key} className="screener-crow is-locked" data-testid="screener-cond-row" data-cond={cond.key} data-locked="1" title={meta.tooltip || undefined}>
          <span className="screener-crow__lockicon" aria-hidden><Lock size={13} strokeWidth={2} /></span>
          <span className="screener-crow__lbl">{meta.label}</span>
          <button
            type="button"
            className="screener-crow__lock-cta"
            onClick={() => { trackEvent('screener_locked_crow_cta', { facet: cond.key }); (isProTier ? (onProUpgrade || onUpgrade) : onUpgrade)?.(`${meta.label} (${isProTier ? 'Pro' : 'Premium'})`); }}
            data-testid={`screener-locked-cta-${cond.key}`}
            aria-label={`${meta.label} は ${isProTier ? 'Pro' : 'Premium'} で解錠`}
          >
            {isProTier ? 'Pro で解錠' : 'Premium で解錠'}
          </button>
        </div>
      );
    }
    // cup「型」状態トグル (SPEC_2026-06-25): Premium・new_high_break のみ .th.state を描画。
    //   free/pro は上の locked crow で処理済 (ここに到達するのは Premium = cup_state 非マスク)。
    //   他 preset / custom では従来どおり非表示 (binBindings 未登録 → 末尾で null)。
    //   「任意の絞り込み」(gate1 確定) なので必須 pill は付けず、label + クリック循環 state pill のみ。
    if (cond.key === 'cup') {
      if (activePreset !== 'new_high_break') return null;
      const stLabel = CUP_STATE_LABEL_JP[cupState];
      const cycleCupState = () => {
        const i = CUP_STATE_ORDER.indexOf(cupState);
        setCupState(CUP_STATE_ORDER[(i + 1) % CUP_STATE_ORDER.length]);
        trackEvent('screener_cup_state_toggle', { from: cupState });
      };
      return (
        <div
          key={cond.key}
          className={`screener-crow${cupState !== 'all' ? ' is-on' : ''}`}
          data-testid="screener-cond-row"
          data-cond="cup"
          title={meta.tooltip || undefined}
        >
          <span className="screener-crow__lbl">{meta.label}</span>
          <button
            type="button"
            className="screener-crow__th screener-crow__th--state"
            onClick={cycleCupState}
            aria-label={`カップの形成段階で絞り込み（現在: ${stLabel}）。クリックで次の段階へ切替`}
            data-testid="screener-cup-state-toggle"
            data-cup-state={cupState}
          >
            {stLabel}
          </button>
        </div>
      );
    }
    if (!universe?.freshness?.[meta.freshness]) return null;
    // B-3.5 gate 南京錠: 当該 preset の死守条件は常時 ON・トグル不可で描画する。
    //   flag は applyStrategyImpl で既に true (件数算入済・count==list 不変)。トグル UI を出さず、
    //   lockicon + ラベル + 閾値 + 「必須」pill で「変更不可の絶対条件」を伝える (mockup `.gate`)。
    if (isGate) {
      return (
        <div
          key={cond.key}
          className="screener-crow is-gate"
          data-testid="screener-cond-row"
          data-cond={cond.key}
          data-gate="1"
          title={meta.tooltip || undefined}
        >
          <span className="screener-crow__lockicon" aria-hidden><Lock size={13} strokeWidth={2} /></span>
          <span className="screener-crow__lbl">{meta.label}</span>
          {meta.th && <span className="screener-crow__th">{meta.th}</span>}
          <span className="screener-crow__gate-pill" aria-label={`${meta.label} はこの戦略の絶対条件（変更不可）`}>必須</span>
        </div>
      );
    }
    const binBindings = {
      funda_pass: [fundaPassOnly, setFundaPassOnly],
      ocf_gt_netincome: [ocfGtNiOnly, setOcfGtNiOnly],
      buy_zone: [buyZoneOnly, setBuyZoneOnly],
      new_high_52w: [newHigh52wOnly, setNewHigh52wOnly],
      ad_volume: [adVolumeOnly, setAdVolumeOnly],
      eps_3y_rising: [eps3RisingOnly, setEps3RisingOnly],
      rev_3y_rising: [rev3RisingOnly, setRev3RisingOnly],
      cfps_3y_rising: [cfpsRisingOnly, setCfpsRisingOnly],
      cfps_eps_ratio: [cfpsEpsRatioOnly, setCfpsEpsRatioOnly],
    };
    const [val, setter] = binBindings[cond.key] || [];
    if (!setter) return null;
    return (
      <div key={cond.key} className={`screener-crow${val ? ' is-on' : ' is-off'}`} data-testid="screener-cond-row" data-cond={cond.key} title={meta.tooltip || undefined}>
        <button type="button" role="switch" aria-checked={!!val} className="screener-crow__sw" onClick={() => setter((v) => !v)} aria-label={`${meta.label} を${val ? '外す' : '加える'}`} />
        <span className="screener-crow__lbl">{meta.label}</span>
        {meta.th && <span className="screener-crow__th">{meta.th}</span>}
      </div>
    );
  };

  return (
    <section className="rounded-2xl bg-[var(--bg-card)] p-6">
      {/* Sprint 3: 市場局面バナー (FtdRegimeBanner.jsx 共有 module)。
          ScreenerPane (Hero) と CustomScreenerPanel (探索チップ UI) は別 view なので両方に表示する。
          fetch は api.js dedupGet で 1 本化されるため API 重複コールなし。
          data-testid="ftd-regime-banner" は FtdRegimeBanner 内に付与済 (loading / main 両 state)。
          ③ drift fix: 市場局面 (相場全体の状況) は「絞り込み条件」(個別フィルタ) とは別内容。
          mb-5 で明確に視覚分離し、②の見出し行トグルにも巻き込まれない独立ブロックに保つ。 */}
      <div className="screener-ftd-wrap mb-5">
        <FtdRegimeBanner />
      </div>

      {/* mockup v8 refine header (.fh)・② drift fix: 見出し行**全体**を折りたたみトリガに移設
          (旧「詳細」ボタンを廃し、mockup の .fh onclick 準拠)。caret + aria-expanded で開閉を明示。
          精度行 + 条件グリッドを一括開閉する (body は universe main 内 #screener-refine-body)。 */}
      <div className="mb-4">
        <button
          type="button"
          className="screener-refine-fh"
          onClick={() => setDetailOpen((v) => !v)}
          aria-expanded={detailOpen}
          aria-controls="screener-refine-body"
          data-testid="screener-refine-toggle"
        >
          <span className="screener-refine-fh__ti"><SlidersHorizontal size={16} strokeWidth={2} aria-hidden /></span>
          <span className="screener-refine-fh__lbl">絞り込み条件</span>
          <span className="screener-refine-fh__summ" data-testid="screener-refine-summary">
            {(activePreset && PRESET_LABEL_JP[activePreset]) || 'すべての銘柄'} ・ 精度「{PRESET_LABELS[preset]}」
          </span>
          <span className="screener-refine-fh__live">該当 <b data-testid="screener-live-count">{universeLoading ? '–' : filteredItems.length}</b> 銘柄</span>
          <ChevronDown
            className="screener-refine-fh__caret"
            size={14}
            strokeWidth={2.5}
            aria-hidden
            style={{ transform: detailOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </button>
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

          {/* ① drift fix: 「合致度TOP3」決断支援ヒーローを削除 (mockup に無い・下の銘柄リストと
              重複・選定条件が読み手に伝わらない)。件数は refine header「該当N銘柄」へ、staleness は
              結果リスト見出しへ移設済 (二重表示解消)。
              ── ② 折りたたみ body (mockup .fb): header トグル (#screener-refine-toggle) で開閉する
              精度行 + 条件グリッドを内包。⑤ grid-template-rows 0fr↔1fr の height アニメ + opacity fade
              (CSS の motion token・framer-motion 不使用・prefers-reduced-motion 配慮)。 */}
          <div
            id="screener-refine-body"
            className={`screener-refine-body${detailOpen ? ' screener-refine-body--open' : ''}`}
            role="region"
            aria-label="絞り込み条件"
            aria-hidden={!detailOpen}
          >
            <div className="screener-refine-body__inner">
              <div className="screener-refine-body__pad">

          {/* ── Sprint 2 Pass 2a: 1 行コンパクト操作帯 (screener-control-bar) ──
              S2 変更点:
              - screener-control-bar testid を操作帯ラッパーに付与 (全 state 共通)
              - screener-applied-summary testid を適用中サマリ span に付与
              - 詳細 accordion を {detailOpen && ...} から CSS display:none + opacity へ変更
                (framer-motion 不使用 / max-height jitter 廃止 / LazyMotion scope 罠回避)
              ─────────────────────────────────────────────────────────────────────── */}
          <div
            className="screener-control-bar flex items-center gap-2"
            data-testid="screener-control-bar"
          >
            {/* X-2: 精度ラベル (mockup .ctrl-lab)。常時表示。seg の aria-label="精度" と重複するため aria-hidden */}
            <span className="screener-ctrl-lab" aria-hidden="true">精度</span>
            {/* 左: 厳しさ精度スライド (B-2: sliding thumb・mockup .seg 準拠。緩い/標準/厳しい 3 段) */}
            <div
              className="screener-precision-seg shrink-0"
              data-testid="screener-precision-seg"
              role="radiogroup"
              aria-label="精度"
            >
              {/* thumb: 選択段に translateX で滑走 (n 等幅・1/n 単位)。
                  S4 market_leading: preset 毎に段数可変 (4段=最厳)。幅を inline /n 化し index.css 不触
                  (B2 crow 隔離保全)。n=3 では calc((100%-6px)/3) で CSS と一致=既存 preset の見た目不変。 */}
              <span
                className="screener-precision-seg__thumb"
                style={{
                  width: `calc((100% - 6px) / ${presetPrecisionLevels(activePreset).length})`,
                  transform: `translateX(${presetPrecisionLevels(activePreset).indexOf(preset) * 100}%)`,
                }}
                aria-hidden="true"
              />
              {(presetPrecisionLevels(activePreset)).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  role="radio"
                  aria-checked={preset === lvl}
                  className={`screener-precision-seg__btn${preset === lvl ? ' is-on' : ''}`}
                  onClick={() => { setPreset(lvl); setOverrides({}); /* §0-7: preset 選び直しで overrides リセット */ }}
                  data-testid={`screener-preset-${lvl}`}
                >
                  {PRESET_LABELS[lvl]}
                  {presetCounts[lvl] != null && (
                    <span className="ml-1 tabular-nums opacity-70">({presetCounts[lvl]})</span>
                  )}
                </button>
              ))}
            </div>

            {/* ④ drift fix: アドバンスド (個別緩急) トグルを精度行へ移動 (旧: 各条件の真上 screener-adv-bar)。
                user 希望で精度セグの直後 = 精度行の左クラスタに配置 (mockup は右端だが左寄せ採用)。
                legacy (screenerV2=false) は adv 非搭載のため screenerV2 gate で従来挙動を保全。 */}
            {screenerV2 && (
              <>
                <button
                  type="button"
                  role="switch"
                  aria-checked={advOpen}
                  className="screener-adv-toggle shrink-0"
                  onClick={() => {
                    setAdvOpen((v) => !v);
                    setAdvLockNudge(false);
                    trackEvent('screener_adv_toggle', { open: !advOpen, locked: advLocked });
                  }}
                  data-testid="screener-adv-toggle"
                >
                  <span className="screener-adv-toggle__sw" aria-hidden />
                  <span>アドバンスド（個別に緩急）</span>
                  {advLocked && <span className="screener-adv-pro" aria-label="Pro 機能">Pro</span>}
                </button>
                {isCustom && (
                  <span className="screener-custom-tag shrink-0" data-testid="screener-custom-tag">カスタム</span>
                )}
              </>
            )}

            {/* 中: 適用中サマリ (active filter を短縮ラベル + 件数寄与で) */}
            {/* screener-applied-summary は常に付与 (空なら aria-hidden) */}
            <span
              className="screener-applied-summary flex-1 min-w-0 truncate text-[11px] text-[var(--text-muted)]"
              data-testid="screener-applied-summary"
              aria-hidden={(() => {
                const hasMcap = mcapFilter.length > 0;
                const hasSector = sectorFilter.length > 0;
                const hasBinary = fundaPassOnly || ocfMarginOnly || ocfGtNiOnly || buyZoneOnly || newHigh52wOnly || adVolumeOnly || eps3RisingOnly || rev3RisingOnly || cfpsRisingOnly || cfpsEpsRatioOnly;
                const hasOverride = Object.values(overrides).some((v) => v && v !== 'off');
                return (!hasMcap && !hasSector && !hasBinary && !hasOverride) ? 'true' : undefined;
              })()}
            >
              {(() => {
                // facet 別の「寄与件数」を適用中サマリに薄く表示 (Trust Cliff C-2: itemPasses 同一集計)
                // 件数 = "この facet だけを外した" vs "現在の全適用" の差分で寄与を示す
                const parts = [];
                const items = universe?.items || [];
                const baseCount = filteredItems.length;
                const extra = { fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, eps3RisingOnly, rev3RisingOnly, cfpsRisingOnly, cfpsEpsRatioOnly, beatOnly, cupState, sectors: sectorFilter, mcapBands: mcapFilter };

                if (mcapFilter.length > 0) {
                  const label = mcapFilter.map((k) => MCAP_BANDS.find((b) => b.key === k)?.label || k).join('・');
                  const countWithout = items.filter((it) => itemPasses(it, activeGrades, { ...extra, mcapBands: [] })).length;
                  const contribution = countWithout - baseCount;
                  parts.push(contribution > 0 ? `${label}(+${contribution})` : label);
                }
                if (sectorFilter.length > 0) {
                  const label = sectorFilter.map(sectorLabelJp).join('・');
                  const countWithout = items.filter((it) => itemPasses(it, activeGrades, { ...extra, sectors: [] })).length;
                  const contribution = countWithout - baseCount;
                  parts.push(contribution > 0 ? `${label}(+${contribution})` : label);
                }
                if (fundaPassOnly) {
                  const countWithout = items.filter((it) => itemPasses(it, activeGrades, { ...extra, fundaPassOnly: false })).length;
                  const contribution = countWithout - baseCount;
                  parts.push(contribution > 0 ? `5条件達成(+${contribution})` : '5条件達成');
                }
                if (ocfMarginOnly) {
                  const countWithout = items.filter((it) => itemPasses(it, activeGrades, { ...extra, ocfMarginOnly: false })).length;
                  const contribution = countWithout - baseCount;
                  parts.push(contribution > 0 ? `${OCF_MARGIN_FACET.labelShort}(+${contribution})` : OCF_MARGIN_FACET.labelShort);
                }
                if (ocfGtNiOnly) {
                  const countWithout = items.filter((it) => itemPasses(it, activeGrades, { ...extra, ocfGtNiOnly: false })).length;
                  const contribution = countWithout - baseCount;
                  parts.push(contribution > 0 ? `${OCF_GT_NI_FACET.labelShort}(+${contribution})` : OCF_GT_NI_FACET.labelShort);
                }
                if (buyZoneOnly) {
                  const countWithout = items.filter((it) => itemPasses(it, activeGrades, { ...extra, buyZoneOnly: false })).length;
                  const contribution = countWithout - baseCount;
                  parts.push(contribution > 0 ? `${BUY_ZONE_FACET.labelShort}(+${contribution})` : BUY_ZONE_FACET.labelShort);
                }
                if (newHigh52wOnly) {
                  const countWithout = items.filter((it) => itemPasses(it, activeGrades, { ...extra, newHigh52wOnly: false })).length;
                  const contribution = countWithout - baseCount;
                  parts.push(contribution > 0 ? `${NEW_HIGH_52W_FACET.labelShort}(+${contribution})` : NEW_HIGH_52W_FACET.labelShort);
                }
                if (adVolumeOnly) {
                  const countWithout = items.filter((it) => itemPasses(it, activeGrades, { ...extra, adVolumeOnly: false })).length;
                  const contribution = countWithout - baseCount;
                  parts.push(contribution > 0 ? `${AD_VOLUME_FACET.labelShort}(+${contribution})` : AD_VOLUME_FACET.labelShort);
                }
                if (eps3RisingOnly) {
                  const countWithout = items.filter((it) => itemPasses(it, activeGrades, { ...extra, eps3RisingOnly: false })).length;
                  const contribution = countWithout - baseCount;
                  parts.push(contribution > 0 ? `EPS連続増(+${contribution})` : 'EPS連続増');
                }
                if (rev3RisingOnly) {
                  const countWithout = items.filter((it) => itemPasses(it, activeGrades, { ...extra, rev3RisingOnly: false })).length;
                  const contribution = countWithout - baseCount;
                  parts.push(contribution > 0 ? `売上連続増(+${contribution})` : '売上連続増');
                }
                if (cfpsRisingOnly) {
                  const countWithout = items.filter((it) => itemPasses(it, activeGrades, { ...extra, cfpsRisingOnly: false })).length;
                  const contribution = countWithout - baseCount;
                  parts.push(contribution > 0 ? `CFPS連続増(+${contribution})` : 'CFPS連続増');
                }
                if (cfpsEpsRatioOnly) {
                  const countWithout = items.filter((it) => itemPasses(it, activeGrades, { ...extra, cfpsEpsRatioOnly: false })).length;
                  const contribution = countWithout - baseCount;
                  parts.push(contribution > 0 ? `CFPS>EPS(+${contribution})` : 'CFPS>EPS');
                }
                const overrideParts = Object.entries(overrides).filter(([, v]) => v && v !== 'off').map(([k]) => FACET_SHORT_LABEL[k] || k);
                if (overrideParts.length > 0) parts.push(overrideParts.join('・'));
                return parts.join('　') || null;
              })()}
            </span>

            {/* ② drift fix: 旧「詳細」トグルボタンは廃止 (折りたたみトリガを見出し行
                #screener-refine-toggle へ移設したため)。 */}
          </div>

          {/* ② drift fix: 詳細 accordion の開閉は親 #screener-refine-body (折りたたみ body) に一本化。
              ここは条件グリッドの bordered コンテナとして常時描画 (display:none 制御は親へ移譲)。 */}
          <div
            className="screener-detail-panel"
            role="region"
            aria-label="詳細フィルター"
            data-testid="screener-detail-panel"
          >
              {screenerV2 ? (
                /* ━━ Phase1 S3 (§0-7): 「品質/タイミング/需給」3カテゴリ accordion 再編 (screener_v2 scope) ━━
                   binary facet (funda_pass/ocf_margin/#1/#3) をフラット末尾追加せず category 内に配置。
                   grade override は renderGradeRow + category filter で旧 2d/2e を統合。
                   §6 scope: legacy (screenerV2=false) は下の <> で従来構造を維持し、再編を漏らさない。 */
                <>
                  {/* ④ drift fix: アドバンスド (個別緩急) toggle は精度行 (screener-control-bar) へ移設済。
                      ここ (各条件の真上) からは削除。advOpen ON で下の各 .crow に mini-segment が露出する挙動は不変。 */}

                  {/* ── B-2: 全条件を .crow (トグル+ラベル+値チップ) で 2 列グリッドに統一 (mockup v8 忠実)。
                       品質/タイミング/需給 の grouphd 配下に grade も binary も同じ 1 行形状。
                       数値ロジック(itemPasses/PRESET_CONDS)は不変・表示のみ。mseg/gate南京錠は B-3。 */}
                  <div className="screener-conds" data-testid="screener-conds" data-preset={activePreset || 'all'}>
                    {/* B-4: 選択中 preset に意味のある条件だけ表示 (表示専用・pass/件数 不変)。
                        activePreset 未選択 or 未登録 preset は従来通り全条件 (後方互換)。 */}
                    {CROW_LAYOUT.map((grp) => {
                      const allowed = (activePreset && PRESET_DISPLAY_CONDS[activePreset]) || null;
                      const keys = allowed ? grp.keys.filter((k) => allowed.includes(k)) : grp.keys;
                      // B-3.5: 当該 preset の gate 条件は南京錠 (トグル不可) で描画する。
                      const gateKeys = (activePreset && PRESET_GATE_CONDS[activePreset]) || null;
                      const rows = keys.map((k) => renderCrow(COND_MAP[k], !!gateKeys?.includes(k))).filter(Boolean);
                      if (rows.length === 0) return null;
                      return (
                        <Fragment key={`${grp.group}/${grp.sub}`}>
                          <div className="screener-grouphd">{grp.group}<span className="screener-grouphd__sub">{grp.sub}</span></div>
                          {rows}
                        </Fragment>
                      );
                    })}
                    {(sectorOptions.length > 0 || mcapOptions.length > 0) && (
                      <Fragment key="filter">
                        <div className="screener-grouphd">絞り込み<span className="screener-grouphd__sub">セクター・規模</span></div>
                        <div className="screener-conds__full">{renderSectorBlock()}</div>
                        <div className="screener-conds__full">{renderMcapBlock()}</div>
                      </Fragment>
                    )}
                  </div>

                  {/* B-3.5: 旧 screener-gate-list (別 section の「必須」二重表示) は廃止。
                       gate は conds 内 inline 南京錠 (renderCrow isGate) に一本化し、
                       「トグル可能な任意条件」と「変更不可の死守条件」の二重表示矛盾 (Trust Cliff) を解消。 */}

                  {/* ── #2 2-d: lockbar — Free がアドバンスドを操作した時のみ (常駐させない §4.3)。
                      Free 価値(N銘柄に絞れている事実)を先に肯定→Pro 案内。list 可視を約束する語感は撤廃 (Trust Cliff #1)。 */}
                  {advOpen && advLocked && advLockNudge && (
                    <div className="screener-lockbar" role="status" data-testid="screener-lockbar">
                      <Lock size={14} strokeWidth={2} aria-hidden className="screener-lockbar__icon" />
                      <p className="screener-lockbar__copy">
                        プリセットで <strong>{filteredItems.length}銘柄</strong>に絞り込み中。条件を個別に詰めるには Pro へ（個別に締めるとさらに絞り込めます）。
                      </p>
                      <button
                        type="button"
                        className="screener-lockbar__cta"
                        onClick={() => {
                          trackEvent('screener_lockbar_cta', { count: filteredItems.length });
                          (onProUpgrade || onUpgrade)?.('個別緩急 (アドバンスド)');
                        }}
                        data-testid="screener-lockbar-cta"
                      >
                        Pro を見る
                      </button>
                    </div>
                  )}
                </>
              ) : (
                /* legacy (screenerV2=false = 現デフォルト): Sprint 3 以前の構造を維持。
                   #1/#3/ocf_margin/category 再編は screener_v2 scope のみ (§6 漏らさない)。 */
                <>
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
                      <p className="mt-0.5 ml-1 text-[10px] text-[var(--text-muted)] opacity-60">
                        最新評価: {universe.freshness.funda_pass}
                      </p>
                    </div>
                  )}

                  {/* (2b) sector additive refinement */}
                  {renderSectorBlock()}

                  {/* (2c) mcap additive refinement */}
                  {renderMcapBlock()}

                  {/* (2d) ファンダメンタル grade override (CORE) */}
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">ファンダメンタル</p>
                    <div className="space-y-2">
                      {FUNDA_FACETS.filter((f) => PRESET_CORE_KEYS.includes(f.key)).map(renderGradeRow)}
                    </div>
                  </div>

                  {/* (2e) テクニカル grade override (非CORE) */}
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">テクニカル</p>
                    <div className="space-y-2">
                      {FUNDA_FACETS.filter((f) => !PRESET_CORE_KEYS.includes(f.key)).map(renderGradeRow)}
                    </div>
                  </div>
                </>
              )}

              {/* (2f) locked facets — 和名 + 鍵。Phase1 S3/S4: pivot_distance (#3 買い場圏) /
                  ad_volume (#8 出来高の質) は screener_v2 scope のみ表示 (legacy には漏らさない、SPEC §6)。
                  free user の #3/#8 はこの locked chip 経路で「件数なし・Premium 解錠」表示
                  (§A 案・cup/breakout と同列)。 */}
              {(() => {
                const lockedVisible = (universe.locked_facets || []).filter(
                  // legacy: pivot_distance/ad_volume は v2 scope なので隠す。
                  // v2: cond が inline lock crow で出す key (pivot_distance/breakout/ad_volume) は二重表示防止で除外。
                  (key) => screenerV2
                    ? !CROW_INLINE_LOCKED_KEYS.has(key)
                    : (key !== 'pivot_distance' && key !== 'ad_volume')
                );
                if (lockedVisible.length === 0) return null;
                return (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">Premium / Pro で解錠</p>
                    <div className="flex flex-wrap gap-1.5">
                      {lockedVisible.map((key) => {
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
                );
              })()}
            </div>

              </div>{/* .screener-refine-body__pad */}
            </div>{/* .screener-refine-body__inner */}
          </div>{/* #screener-refine-body 折りたたみ body 閉じ (以降 Pass C / 結果は常時表示) */}

          {/* ── Pass C: 適用中フィルタ bar (詳細閉時もサマリ chip を visible に保つ) ── */}
          {(() => {
            const activeOverrides = Object.entries(overrides).filter(([, v]) => v && v !== 'off');
            const hasActive = activeOverrides.length > 0 || sectorFilter.length > 0 || mcapFilter.length > 0 || fundaPassOnly || ocfMarginOnly || ocfGtNiOnly || buyZoneOnly || newHigh52wOnly || adVolumeOnly || eps3RisingOnly || rev3RisingOnly || cfpsRisingOnly || cfpsEpsRatioOnly;
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

                {/* Phase1 S3: #1 営業CF>純利益 (利益の質) */}
                {ocfGtNiOnly && (
                  <Chip
                    size="xs"
                    variant="filter"
                    pressed
                    tone="accent"
                    onClick={() => setOcfGtNiOnly(false)}
                    data-testid="screener-applied-ocf_gt_netincome"
                  >
                    {OCF_GT_NI_FACET.labelShort}
                    <span className="ml-1 opacity-70">×</span>
                  </Chip>
                )}

                {/* Phase1 S3: #3 買い場圏 (pivot 近接) */}
                {buyZoneOnly && (
                  <Chip
                    size="xs"
                    variant="filter"
                    pressed
                    tone="accent"
                    onClick={() => setBuyZoneOnly(false)}
                    data-testid="screener-applied-buy_zone"
                  >
                    {BUY_ZONE_FACET.labelShort}
                    <span className="ml-1 opacity-70">×</span>
                  </Chip>
                )}

                {/* 52週高値更新 */}
                {newHigh52wOnly && (
                  <Chip
                    size="xs"
                    variant="filter"
                    pressed
                    tone="accent"
                    onClick={() => setNewHigh52wOnly(false)}
                    data-testid="screener-applied-new_high_52w"
                  >
                    {NEW_HIGH_52W_FACET.labelShort}
                    <span className="ml-1 opacity-70">×</span>
                  </Chip>
                )}

                {/* Phase1 S4: #8 A/D 出来高の質 (上昇引け優勢) */}
                {adVolumeOnly && (
                  <Chip
                    size="xs"
                    variant="filter"
                    pressed
                    tone="accent"
                    onClick={() => setAdVolumeOnly(false)}
                    data-testid="screener-applied-ad_volume"
                  >
                    {AD_VOLUME_FACET.labelShort}
                    <span className="ml-1 opacity-70">×</span>
                  </Chip>
                )}

                {/* beat/cfps Phase 2: 決算の継続性 trio (任意トグル) */}
                {eps3RisingOnly && (
                  <Chip
                    size="xs"
                    variant="filter"
                    pressed
                    tone="accent"
                    onClick={() => setEps3RisingOnly(false)}
                    data-testid="screener-applied-eps_3y_rising"
                  >
                    EPS 連続増
                    <span className="ml-1 opacity-70">×</span>
                  </Chip>
                )}
                {rev3RisingOnly && (
                  <Chip
                    size="xs"
                    variant="filter"
                    pressed
                    tone="accent"
                    onClick={() => setRev3RisingOnly(false)}
                    data-testid="screener-applied-rev_3y_rising"
                  >
                    売上 連続増
                    <span className="ml-1 opacity-70">×</span>
                  </Chip>
                )}
                {cfpsRisingOnly && (
                  <Chip
                    size="xs"
                    variant="filter"
                    pressed
                    tone="accent"
                    onClick={() => setCfpsRisingOnly(false)}
                    data-testid="screener-applied-cfps_3y_rising"
                  >
                    CFPS 連続増(4期)
                    <span className="ml-1 opacity-70">×</span>
                  </Chip>
                )}
                {cfpsEpsRatioOnly && (
                  <Chip
                    size="xs"
                    variant="filter"
                    pressed
                    tone="accent"
                    onClick={() => setCfpsEpsRatioOnly(false)}
                    data-testid="screener-applied-cfps_eps_ratio"
                  >
                    CFPS&gt;EPS
                    <span className="ml-1 opacity-70">×</span>
                  </Chip>
                )}

                {/* すべて解除 */}
                <button
                  className="ml-auto text-[11px] text-[var(--text-muted)] hover:text-[var(--color-loss)] transition-colors"
                  onClick={() => { setPreset('standard'); setOverrides({}); setSectorFilter([]); setMcapFilter([]); setFundaPassOnly(false); setOcfMarginOnly(false); setOcfGtNiOnly(false); setBuyZoneOnly(false); setAdVolumeOnly(false); setEps3RisingOnly(false); setRev3RisingOnly(false); setCfpsRisingOnly(false); setCfpsEpsRatioOnly(false); setBeatOnly(false); setSortKey('relevance'); setCupState('all'); /* D-8: すべて解除で sort も default へ。cup「型」トグルも 'すべて' に戻す */ }}
                  data-testid="screener-applied-clear"
                >
                  すべて解除
                </button>
              </div>
            );
          })()}

          {/* ── (5) 結果リスト ── */}
          <div>
            {/* リスト見出し: 件数 + seasonchip + staleness。① drift fix で旧ヒーロー削除に伴い
                staleness をここへ移設 (mockup の結果パネル .meta 相当)。件数は header と同一
                filteredItems.length = Trust Cliff C-2 整合。 */}
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="text-sm font-medium text-[var(--text-secondary)]">
                  {filteredItems.length} 件
                </span>
                {/* seasonchip: 選択中 preset の対象範囲ラベル (gold pill / 決算非依存は neutral)。
                    null・custom (未マップ) は描画しない = 表示専用・述語/件数に一切非干渉。 */}
                {activePreset && SEASON_LABEL[activePreset] && (
                  <span
                    data-testid="screener-seasonchip"
                    className={`seasonchip${SEASON_LABEL[activePreset].neutral ? ' is-neutral' : ''}`}
                  >
                    {SEASON_LABEL[activePreset].text}
                  </span>
                )}
                {/* ① staleness 移設: nightly 更新サイクルのため「毎朝更新」固定文言 (X分前は不使用)。 */}
                {universe.as_of && (
                  <span className="text-xs text-[var(--text-muted)] whitespace-nowrap" data-testid="screener-results-staleness">
                    {formatAsOf(universe.as_of)}（毎朝更新）
                  </span>
                )}
              </div>
              {/* D-8 sort select (mockup v8 sortwrap/sortsel 忠実)。sector view では非表示
                  (master-detail のため sort 無意味、mockup line 342 相当)。CSS は Tailwind + var()
                  token のみ = 発光系 (.panel-card/.bs-panel/.surface-card) に一切触れない low-risk 方式。
                  primary selector = data-testid (className 依存禁止)。 */}
              {!isSectorView && (
                <span className="relative inline-flex items-center">
                  <select
                    data-testid="screener-sort-select"
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value)}
                    aria-label="並び順"
                    className="appearance-none cursor-pointer text-xs rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] py-[5px] pl-3 pr-[26px]"
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option
                        key={o.value}
                        value={o.value}
                        /* D-8 (multi-review 指摘): 「主要指標」は preset で指標が変わる。未マップ
                           preset (custom / 起動直後の null) では選んでも合致度順に silent fallback
                           するため disabled 化し「壊れて見える」Trust Cliff を回避。 */
                        disabled={o.value === 'metric' && !PRESET_METRIC_KEY[activePreset]}
                      >
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="absolute right-2 pointer-events-none w-3 h-3 text-[var(--text-muted)]"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              )}
            </div>

            {/* 静かな強さ §38 留保 + citation (SPEC_2026-06-28 §10 / mockup p5 fhint line 337 が正本)。
                「人気化前」「見過ごされた相対力」の逆張り訴求は、この留保 (予測でない/低流動性/小型株偏り/
                出版後減衰/米国転用は外挿) が UI に併設されて初めて §38・景表法 §5 の中立フレームが成立する
                (金融 review 2026-06-28 critical)。mockup の fhint (折りたたみ refine 内) より可視性の高い
                結果ヘッダー直下に常設。静的文言 (LLM 非経由) のため Hallucination Guard 4層不要。 */}
            {activePreset === 'quiet_quality' && (
              <p
                data-testid="screener-quiet-quality-disclaimer"
                className="mb-2 text-[11px] leading-relaxed text-[var(--text-muted)]"
              >
                出来高「静か」＝急増していない（上限 ≤）／機関「殺到なし」＝QoQ増加が過熱でない（上限 ≤）の2軸が逆張りの肝。
                ※発見支援であり予測ではありません。低出来高は低流動性・小型株偏りを伴い、効果は出版後に減衰しうる（出典: Lee-Swaminathan 2000／Chen-Hong-Stein 2002／Choi-Jin-Yan 2013・米国転用は外挿）。
              </p>
            )}

            {/* Sprint 5 Pass B: 一括追加バー (1 件以上選択時に表示)。Phase C: sector view では非表示。 */}
            {!isSectorView && selectedTickers.size > 0 && (
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
            {isSectorView ? (
              /* ── Phase C Sprint 1 (SPEC_2026-06-27・U-2=(b) 市場全体の俯瞰): セクター一覧 master + Top3 detail。
                   master の sector 集合 = 全 universe (劣後含む俯瞰)。count/top3 は filteredItems 由来で
                   master 各行 count の総和 = filteredItems.length (Trust Cliff C-2 不変)。 */
              <div className="screener-secmd" data-testid="screener-sector-master-detail">
                {/* master: セクター一覧 (sr 降順、U-1 色: 主戦場 amber / 上位 緑 / 劣後 赤) */}
                <div className="screener-secmaster" role="list" aria-label="セクター一覧">
                  {sectorSummary.map((s, i) => {
                    // U-1: 最上位かつ sr>0=主戦場(amber) / sr>=0=上位(緑) / sr<0=劣後(赤)。
                    const tone = sectorTone(s.sr, i);
                    const sel = s.sn === activeSector?.sn;
                    return (
                      <button
                        key={s.sn}
                        type="button"
                        role="listitem"
                        className={`screener-secrow${sel ? ' is-sel' : ''}`}
                        onClick={() => setSelectedSector(s.sn)}
                        aria-pressed={sel}
                        data-testid={`screener-secrow-${s.sn}`}
                      >
                        <span className="screener-secrow__bar" data-tone={tone} aria-hidden />
                        <span className="screener-secrow__body">
                          <span className="screener-secrow__name">
                            {s.label}
                            {tone === 'hot' && <span className="screener-secrow__chip">主戦場</span>}
                          </span>
                          {/* D-3: 件数羅列でなく相対力の意味的ラベル (静的・§38 事実記述)。
                              件数は U-2 制約により master 行に出さず detail 見出しへ退避。 */}
                          <span className="screener-secrow__tag">{sectorTagJp(s.sr, i)}</span>
                        </span>
                        {/* D-2: 対 SPY 超過を符号付き整数で (U-4・単位無印)。 */}
                        <span className="screener-secrow__sr" data-tone={tone}>{fmtSr(s.sr)}</span>
                      </button>
                    );
                  })}
                  <div className="screener-seclegend" aria-hidden>
                    <span><i data-tone="hot" />主戦場</span>
                    <span><i data-tone="up" />上位</span>
                    <span><i data-tone="neg" />劣後</span>
                  </div>
                </div>
                {/* detail: 選択セクターの Top3 (相対力降順) */}
                <div className="screener-secdetail" data-testid="screener-sector-detail">
                  {/* D-4/U-5: 「好決算/合致」でなく事実記述「決算5条件達成」。件数は U-2 制約に従い
                      ここ (detail) に明確ラベル付きで退避 (master 行の俯瞰数値=RS と Trust Cliff 分離)。 */}
                  <p className="screener-secdetail__h">
                    {activeSector?.label}（相対力 {fmtSr(activeSector?.sr)}）の決算5条件達成銘柄 {activeSector?.count ?? 0}件
                  </p>
                  {(activeSector?.top3 || []).map((it) => (
                    <button
                      key={it.ticker}
                      type="button"
                      className="screener-secdetail__row"
                      onClick={() => onSelect?.(it.ticker)}
                      data-testid={`screener-secdetail-${it.ticker}`}
                    >
                      <span className="screener-secdetail__tk">
                        <strong>{it.ticker}</strong>
                        <span className="screener-secdetail__nm">{it.name}</span>
                      </span>
                      <Chip size="xs" variant="display" tone="muted">5条件達成</Chip>
                    </button>
                  ))}
                  {(activeSector?.count ?? 0) > 3 && (
                    <p className="screener-secdetail__more" data-testid="screener-sector-detail-more">
                      上位3件を表示・ほか {(activeSector.count - 3)}件
                    </p>
                  )}
                  {(activeSector?.top3 || []).length === 0 && (
                    <p className="screener-secdetail__empty" data-testid="screener-sector-detail-empty">
                      このセクターに条件合致（決算5条件達成）の銘柄は今のところありません。
                    </p>
                  )}
                </div>
              </div>
            ) : ((activePreset === 'new_high_break' || activePreset === 'quiet_quality' || activePreset === 'market_leading') && !isPremiumUser) ? (
              /* Premium tier preset の preset レベル gate (SPEC_2026-06-25 §4.2.2 + SPEC_2026-06-28 §10/market_leading)。
                 非 Premium には「0銘柄」でなくロック+CTA を出す (Trust Cliff)。新高値ブレイク / 静かな強さ / 市場をリード 共通。
                 ※ new_high_break / quiet_quality は N 件が非 Premium のマスク済 universe で算出不能のため件数を出さない。
                   market_leading は masked facet 非依存 (rs/vs_spy/ocf/roe/eps/beat は全 free) で件数=真値が出るため、
                   件数 Free の集客フックとして {filteredItems.length} 件を提示し、銘柄詳細 (リスト) のみ Premium gate。 */
              <div className="screener-lockbar" role="status" data-testid={`screener-premium-gate-${activePreset}`}>
                <Lock size={14} strokeWidth={2} aria-hidden className="screener-lockbar__icon" />
                <p className="screener-lockbar__copy">
                  {activePreset === 'quiet_quality'
                    ? <>「静かな強さ」はRSが強いのに出来高が静か・機関が未殺到の銘柄を毎晩スキャンする <strong>Premium 限定</strong>の戦略です。</>
                    : activePreset === 'market_leading'
                    ? <><strong>{filteredItems.length}件</strong>が「市場をリードし始めた銘柄」の条件に合致しています。各銘柄の詳細は <strong>Premium 限定</strong>です。</>
                    : <>「新高値ブレイク」は新高値圏 × 好決算を毎晩スキャンする <strong>Premium 限定</strong>の戦略です。</>}
                </p>
                <button
                  type="button"
                  className="screener-lockbar__cta"
                  onClick={() => { trackEvent('screener_preset_premium_gate_cta', { preset: activePreset }); onUpgrade?.(activePreset === 'quiet_quality' ? '静かな強さ (Premium)' : activePreset === 'market_leading' ? '市場をリードし始めた銘柄 (Premium)' : '新高値ブレイク (Premium)'); }}
                  data-testid="screener-premium-gate-cta"
                >
                  Premium を見る
                </button>
              </div>
            ) : (filteredItems.length === 0 && !screenerGridMock) ? (
              <div data-testid="screener-result-row-empty">
                <p className="py-3 text-center text-sm text-[var(--text-muted)]">
                  {activePreset === 'new_high_break'
                    ? '現在の市況では新高値圏の好決算銘柄がありません（下落相場では正常です）。精度を緩めるか、別の戦略をお試しください。'
                    : '該当する銘柄がありません。厳しさを緩めるか、フィルターを変更してください。'}
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
                        } else if (emptySuggest.type === 'ocf_margin') {
                          setOcfMarginOnly(false);
                        } else if (emptySuggest.type === 'ocf_gt_netincome') {
                          setOcfGtNiOnly(false);
                        } else if (emptySuggest.type === 'buy_zone') {
                          setBuyZoneOnly(false);
                        } else if (emptySuggest.type === 'ad_volume') {
                          setAdVolumeOnly(false);
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
            ) : useScreenerGridTable ? (
              /* Sprint3 (SPEC §14): 決算の通信簿 grid table。screener_v2 + earnings系 preset or ?screener_mock=1。
                 legacy / 他 preset / 非 v2 は下の従来 ScreenerRow 経路 (物理隔離・不触)。 */
              <ScreenerGridTable
                items={showAllResults ? displayItems : displayItems.slice(0, 100)}
                mock={screenerGridMock}
                preset={activePreset}
                count={displayItems.length}
                selectedTickers={selectedTickers}
                onSelect={(t) => {
                  // C-16 metrics: preset を付与し「どの戦略から銘柄到達したか」の funnel を計測可能に。
                  trackEvent('screener_row_click', { ticker: t, mode: 'custom', preset: activePreset });
                  onSelect?.(t);
                }}
                onCheckbox={(t, checked) => {
                  setSelectedTickers((prev) => {
                    const n = new Set(prev);
                    checked ? n.add(t) : n.delete(t);
                    return n;
                  });
                }}
              />
            ) : (
              /* Pass B: 表示順 displayItems (default=合致度降順、D-8 sort で切替可)。 */
              /* Pass C: 初期 100 件キャップ。超過時は「残りN件を表示」ボタン。 */
              <div
                data-testid="screener-result-list"
                className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] overflow-hidden"
              >
                {(showAllResults ? displayItems : displayItems.slice(0, 100)).map((it, idx) => {
                  // ── 上位強調 / 下位後退 (weight/size/opacity のみ、色 polarity なし §38) ──
                  // D-8: 強調/淡化は合致度順の時のみ。mcap/vol 等の sort で top3 を強調すると
                  //   「最良銘柄」と誤認させる (§38/Trust Cliff risk) ため、合致度以外は均一表示。
                  const isTop = sortKey === 'relevance' && idx < 3;
                  const total = displayItems.length;
                  // 後半ほど淡く: 上半=1.0, 下半=0.55 に線形 (合致度順のみ)
                  const opacityVal = sortKey !== 'relevance'
                    ? 1
                    : total <= 1 ? 1 : idx < Math.ceil(total / 2) ? 1 : Math.max(0.55, 1 - (idx / total) * 0.45);

                  // ── ヒット理由バッジ (スコア寄与順・最大2件) ──
                  const activeFacetsSorted = FUNDA_FACETS
                    .flatMap((f) => {
                      const lvl = activeGrades[f.key];
                      const thr = lvl ? f.grades[lvl] : null;
                      if (thr == null) return [];
                      const v = it[f.key];
                      if (v == null) return [];
                      // 寄与スコアで降順 (cmp 'lte'=上限型は低いほど合致のため符号反転・§38 内部のみ)
                      let contrib = thr !== 0 ? (v - thr) / Math.abs(thr) : v;
                      if (f.cmp === 'lte') contrib = -contrib;
                      return [{ key: f.key, contrib, value: v, threshold: thr }];
                    })
                    .sort((a, b) => b.contrib - a.contrib)
                    .slice(0, 2); // 狭い screener カラム幅に確実に収めるため上位2件 (spec「2-3個」範囲内)

                  const isSelected = selectedTickers.has(it.ticker);

                  // ── A-1 物理隔離: screenerV2=true のみ ScreenerRow primitive を使用 ──
                  // legacy 行 (screenerV2=false) は一切触らない (SPEC §6 / 追記条件3)。
                  // 一般 user (default OFF) には旧行 JSX をそのまま提供。
                  if (screenerV2) {
                    // D-1 構造化 props: matchBadges / metrics を組み立てる (追記条件4)
                    // 合否理由 静的dict: 実値・閾値を事実言い換え (valueText=行内 / reason=tooltip)。
                    const matchBadges = activeFacetsSorted.map(({ key, value, threshold }) => {
                      const r = buildMatchReason(key, value, threshold);
                      return {
                        label: FACET_SHORT_LABEL[key] || key,
                        valueText: r?.valueText,   // 行内コンパクト表示 (例 "+28%")
                        reason: r?.reason,         // tooltip/aria 用完全文
                        colorRole: 'neutral', // §38: 緑/赤断定なし
                        group: FUNDA_FACETS.find((f) => f.key === key)?.category || 'fundamental',
                      };
                    });
                    const metrics = [
                      it.rs_percentile != null
                        ? { key: 'rs_percentile', value: it.rs_percentile, category: 'technical' }
                        : null,
                    ].filter(Boolean);

                    return (
                      <div
                        key={it.ticker}
                        style={{ opacity: opacityVal }}
                        data-testid={`screener-row-${it.ticker}`}
                      >
                        <ScreenerRow
                          ticker={it.ticker}
                          name={it.name}
                          rank={idx + 1}
                          isTop={isTop}
                          matchBadges={matchBadges}
                          metrics={metrics}
                          /* 決算期混同ガード Sprint 3: 決算関連 preset でのみ直近決算の報告日を併記
                             (earnings_pass / new_high_break = latest_beat/eps_yoy が中心)。
                             NULL は ScreenerRow が「決算日不明」表示。表示専用・述語/件数に非干渉。 */
                          lastReportDate={it.last_report_date ?? null}
                          showReportDate={activePreset === 'earnings_pass' || activePreset === 'new_high_break'}
                          isSelected={isSelected}
                          onSelect={(t) => {
                            trackEvent('screener_row_click', { ticker: t, rank: idx, mode: 'custom' });
                            onSelect?.(t);
                          }}
                          onCheckbox={(t, checked) => {
                            setSelectedTickers((prev) => {
                              const n = new Set(prev);
                              checked ? n.add(t) : n.delete(t);
                              return n;
                            });
                          }}
                          mode="custom"
                          showCheckbox
                        />
                      </div>
                    );
                  }

                  // ── legacy 行 (screenerV2=false、既存 JSX を維持) ──────────────────
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
                {!showAllResults && displayItems.length > 100 && (
                  <div className="flex items-center justify-center px-4 py-3 border-t border-[var(--border)]">
                    <button
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                      onClick={() => setShowAllResults(true)}
                      data-testid="screener-show-more"
                    >
                      残り {displayItems.length - 100} 件を表示
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* スクリーナー全体の底部免責 (mockup v8 .disclaimer 準拠: bottom-of-page・amber left-border)。
          §38/景表法§5: 「条件に合致した一覧」であり買い推奨でない旨を明示。旧: hero 内 0.6875rem 微小テキスト
          (screener-hero-disclaimer) を廃し、全 state (loading/error/empty/main) 共通で常時表示するため
          universe main の外に置く。 */}
      <div
        className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 text-xs leading-relaxed text-[var(--text-muted)]"
        style={{ borderLeftWidth: '3px', borderLeftColor: 'var(--color-warning)' }}
        data-testid="screener-disclaimer"
      >
        これらは買い推奨ではなく、各戦略の
        <strong className="font-semibold text-[var(--text-secondary)]">条件に合致した銘柄の一覧</strong>
        です。最終的な投資判断はご自身で行ってください。
      </div>
    </section>
  );
});

export default CustomScreenerPanel;
