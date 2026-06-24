import { useEffect, useState, useMemo, useRef, useCallback, forwardRef, useImperativeHandle, Fragment } from 'react';
import { SlidersHorizontal, ChevronDown, Lock, Info } from 'lucide-react';
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
// Phase1 S3: category = 「品質(ファンダ)/タイミング(テクニカル)/需給」3カテゴリ accordion 再編 (§0-7)。
//   quality = 利益・キャッシュの質 / timing = 値動き・勢い / demand = 機関の動き。
//   RS は勢い指標なので timing、機関保有増は需給。grade の preset 駆動 (CORE) かどうかとは独立。
// §2.1 原典較正ラダー (2026-06-23 gate1: じっちゃま原典優先→オニール CAN-SLIM §7.1)。
//   eps_yoy_pct: severe(+100) 追加 (canslim p.179-197)。
//   eps_cagr_3y: 緩い段=「3年連続増」state は backend #4 DEFER のため未配線 →
//     緩標同値矛盾を避けるべく loose 段を出さず standard(25) を下限とする (金融レビュー指摘)。
//   roe: 床 17 (原典 p.179-210 注)・rs_percentile: 標準 80 / 床 70 ハードゲート。
//   ⚠️ roe床10→17・rs標準85→80 は Free 標準プリセットの件数を動かす (原典忠実の代償・gate1 承認済)。
// delta=true: 成長/変化系 (符号併記 "+25%")、false: 水準系 (≥ 併記 "≥80")。
const FUNDA_FACETS = [
  { key: 'eps_yoy_pct',         field: 'eps_yoy_pct',         label: 'EPS成長(四半期)', unit: '%', tier: 'free', category: 'quality', delta: true,  grades: { loose: 20, standard: 25, strict: 50, severe: 100 } },
  { key: 'eps_cagr_3y',         field: 'eps_cagr_3y',         label: 'EPS成長(3年)',    unit: '%', tier: 'free', category: 'quality', delta: true,  grades: { standard: 25, strict: 50 } },
  { key: 'roe',                 field: 'roe',                 label: 'ROE',            unit: '%', tier: 'free', category: 'quality', delta: false, grades: { loose: 17, standard: 25, strict: 50 } },
  { key: 'rs_percentile',       field: 'rs_percentile',       label: 'RS(相対強さ)',     unit: '',  tier: 'free', category: 'timing',  delta: false, grades: { loose: 70, standard: 80, strict: 90 } },
  { key: 'volume_surge_pct',    field: 'volume_surge_pct',    label: '出来高急増',       unit: '%', tier: 'free', category: 'timing',  delta: true,  grades: { loose: 25, standard: 40, strict: 50 } },
  { key: 'inst_holders_qoq_pct', field: 'inst_holders_qoq_pct', label: '機関保有増(45日遅延)', unit: '%', tier: 'free', category: 'demand', delta: true,  grades: { loose: 0, standard: 3, strict: 5 } },
];
const FACET_MAP = Object.fromEntries(FUNDA_FACETS.map((f) => [f.key, f]));
// preset の CORE 4 metric。volume/inst_holders は preset off、override で追加 (Pass 3c)。
const PRESET_CORE_KEYS = ['eps_yoy_pct', 'eps_cagr_3y', 'roe', 'rs_percentile'];
const PRESET_LABELS = { loose: '緩い', standard: '標準', strict: '厳しい', severe: '最厳' };
// 個別緩急 mini-segment 用の短縮ラベル (幅節約・原則1)。
const GRADE_LABELS_SHORT = { loose: '緩', standard: '標', strict: '厳', severe: '最厳' };
// grade の強弱順 (clamp / 並び順の SSOT)。
const GRADE_ORDER = ['loose', 'standard', 'strict', 'severe'];
// facet に定義された有効段のみを順序付きで返す (eps_cagr_3y は loose 段なし)。
function facetLevels(facet) {
  return GRADE_ORDER.filter((l) => facet?.grades?.[l] != null);
}
// 要求 level を facet の定義域にクランプ (loose 要求×定義なし → 最小段、severe 要求×定義なし → 最大段)。
// RS<70 ハードフロア等、定義域外の override を下限/上限へ寄せる安全装置 (§2.1 注)。
function clampLevel(facet, level) {
  const lv = facetLevels(facet);
  if (lv.length === 0) return null;
  if (facet.grades[level] != null) return level;
  const idx = GRADE_ORDER.indexOf(level);
  const defined = lv.map((l) => GRADE_ORDER.indexOf(l));
  const lo = Math.min(...defined), hi = Math.max(...defined);
  return GRADE_ORDER[idx < lo ? lo : hi];
}
// mini-segment の閾値併記 (例 "+25%" / "≥80")。§38: 数値は data 由来、色 polarity なし。
function gradeAnnot(facet, lvl) {
  const thr = facet?.grades?.[lvl];
  if (thr == null) return '';
  return `${facet.delta ? '+' : '≥'}${thr}${facet.unit || ''}`;
}

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
  category: 'quality',
};

// ─── Phase1 S3: #1 営業CF>純利益 (利益の質) binary facet (§0-1 free / §0-3) ──────
// TTM 営業キャッシュフロー > TTM 純利益 の bool (粉飾フィルタ・利益の質)。null = AND 除外。
// sector guard (銀行/保険/REIT/証券) + 外貨ADR は backend _compute_one で null 保存済 (§0-3)。
// tier: 'free' (§0-1①、ファンダの質は ocf_margin と同列で無料)。category: 'quality'。
// §38: 「投資不適格」等の断定でなく「利益の質の目安」「警戒されるとされる」の第三者手法描写に留める。
const OCF_GT_NI_FACET = {
  key: 'ocf_gt_netincome',
  field: 'ocf_gt_netincome',
  label: '営業CF>純利益',
  labelShort: '利益の質',
  tooltip: '直近1年の営業キャッシュフローが純利益を上回る = 利益の質が高い目安。米国成長株手法では下回る銘柄を警戒するとされる。銀行・保険・REIT 等は業種特性によりデータなし。',
  tier: 'free',
  category: 'quality',
};

// ─── Phase1 S3: #3 買い場圏 (pivot 近接) binary facet (§0-1 Premium / §0-4) ──────
// pivot (直近の節目) から 0〜+5% 以内 = 買い場圏。null (cup 未形成) = AND 除外。
// §0-4: buy zone = 0 ≤ distance ≤ 5。pivot 下 (distance<0=ブレイク前) は買い場圏に含めない。
// 閾値 +5% は KB が正 (trading.md:178/1206)・実装都合で変えない。
// tier: 'premium' (§0-1①、タイミング系は cup/breakout と同列)。free user には locked chip
//   (universe.locked_facets に 'pivot_distance' が含まれ pivot_distance_pct=None マスク、§A 案)。
// category: 'timing'。§38: 「買い場圏」(状態語) は可・「買い場」(断定) は禁止。
const BUY_ZONE_FACET = {
  key: 'buy_zone',
  field: 'pivot_distance_pct',
  label: '買い場圏 (節目近接)',
  labelShort: '買い場圏',
  tooltip: '直近の節目 (pivot) から 0〜+5% 以内。米国成長株手法では +5〜10% 超は遅い (高値づかみ) とされる。節目未形成の銘柄はデータなし。',
  zoneMin: 0,
  zoneMax: 5,
  tier: 'premium',
  category: 'timing',
};

// ─── 52週高値更新 binary facet (§0-1 Premium / breakout freshness) ──
// is_new_52w_high (bool): 直近終値が過去52週高値を更新 = true。null = Premium マスク / 欠落 = AND 除外 (honest)。
// tier: 'premium'。breakout 鮮度キー: universe.freshness.breakout。
// category: 'timing'。§38: 「更新」(観測語) は可・「上がります」(断定) は禁止。
const NEW_HIGH_52W_FACET = {
  key: 'new_high_52w',
  field: 'is_new_52w_high',
  label: '52週高値を更新',
  labelShort: '52週高値',
  tooltip: '直近の終値が過去52週の高値を更新。米国成長株手法では新高値更新が上昇トレンドの起点とされる。節目未形成・データ欠落の銘柄はデータなし。',
  tier: 'premium',
  category: 'timing',
};

// ─── Phase1 S4: #8 A/D 出来高の質 (上昇引け優勢) binary facet (§0-1 Premium / §0-2) ──
// 13週(65営業日)の「上昇引け日 volume 合計 ÷ 下落引け日 volume 合計」が >1 = 買い優勢。
// backend (cup-scan) で算出し cup payload 同梱 → universe で読むだけ (§0-5 追加 fetch ゼロ)。
// coverage = pivot_distance (#3) と同源 (cup-detected ≈618 ticker)。null = AND 除外 (honest)。
// ★ Trust Cliff §3-2: A/D は出来高 up/down 集計であって 13F「機関保有」データそのものではない。
//   ラベルは中身忠実に「出来高の質 (上昇引け優勢)」。機関保有は inst_holders_qoq_pct の別軸。
// tier: 'premium' (§0-1、cup 由来の需給系 → pivot_distance と同列)。free user は locked chip。
// category: 'demand'。§38: 「買い優勢」(出来高事実の観測語) は可・「買いです」(断定) は禁止。
const AD_VOLUME_FACET = {
  key: 'ad_volume',
  field: 'ad_volume_ratio',
  label: '出来高の質 (上昇引け優勢)',
  labelShort: '出来高の質',
  tooltip: '直近13週の上昇引け日の出来高合計 ÷ 下落引け日の出来高合計 > 1。米国成長株手法で機関の継続買いの目安とされる。13F の機関保有比率とは別軸 (出来高の up/down 集計)。節目未形成の銘柄はデータなし。',
  threshold: 1,
  tier: 'premium',
  category: 'demand',
};

// ─── Phase B-1: PRESET_CONDS 単一条件レジストリ (count==list の述語 SSOT) ─────────────
// 目的: FUNDA_FACETS(grade 型) + binary facets を 1 つの条件レジストリへ統合し、
//   itemPasses / countPreset / applyStrategyImpl の「条件の二重・三重管理」を脱して
//   単一 SSOT を参照する土台を作る ([[feedback_facet_filter_count_integrity]] Trust Cliff C-2)。
// B-1 は「UI 不変・数値不変の内部 refactor」: 既存 facet 定義はそのまま参照し、挙動を完全一致させる。
//   - kind 'grade'  : activeGrades({key:level}) 経由。pass(item, lvl)。FACET_MAP の facet を参照。
//   - kind 'binary' : extra[flag] が ON の時だけ pass(item) を AND (閾値/範囲型 binary facet)。
//   - kind 'flag'   : extra[flag] が ON の時だけ pass(item) を AND (bool flag・facet オブジェクトなし)。
// 後続 sprint の土台 (B-1 では未付与): levels(精度スライド値配列=B-2) / group・gate・states(B-2/B-3) /
//   tier・available(準備中 disabled=B-3) / preset→conds 配列(B-4)。B-1 時点の 12 条件はすべて現行で機能中。
function gradePass(facet, item, lvl) {
  const v = item[facet.field];
  if (v == null) return false;            // 測定外は AND で除外 (honest)
  const thr = facet.grades[lvl];
  if (thr != null && v < thr) return false; // 未定義段は no-op (clamp 済のため通常到達しない)
  return true;
}
// cup screener が通す cup_state 集合 (backend _CONSENSUS_CUP_STATES と一致: main.py:17907)。
//   breakout_extended は backend 側で v148 の 3 ゲート (50DMA乖離/上昇率/market gate) 済み。
//   free/pro は backend が cup_state=null マスク (Premium 限定) → pass=false (件数に影響しない)。
const CUP_PASS_STATES = new Set(['breakout_pending', 'breakout_confirmed', 'breakout_extended']);
export const PRESET_CONDS = [
  // ── grade 条件 (精度連動・activeGrades 経由) ──
  { key: 'eps_yoy_pct',          kind: 'grade', facet: FACET_MAP.eps_yoy_pct,          pass: (item, lvl) => gradePass(FACET_MAP.eps_yoy_pct, item, lvl) },
  { key: 'eps_cagr_3y',          kind: 'grade', facet: FACET_MAP.eps_cagr_3y,          pass: (item, lvl) => gradePass(FACET_MAP.eps_cagr_3y, item, lvl) },
  { key: 'roe',                  kind: 'grade', facet: FACET_MAP.roe,                  pass: (item, lvl) => gradePass(FACET_MAP.roe, item, lvl) },
  { key: 'rs_percentile',        kind: 'grade', facet: FACET_MAP.rs_percentile,        pass: (item, lvl) => gradePass(FACET_MAP.rs_percentile, item, lvl) },
  { key: 'volume_surge_pct',     kind: 'grade', facet: FACET_MAP.volume_surge_pct,     pass: (item, lvl) => gradePass(FACET_MAP.volume_surge_pct, item, lvl) },
  { key: 'inst_holders_qoq_pct', kind: 'grade', facet: FACET_MAP.inst_holders_qoq_pct, pass: (item, lvl) => gradePass(FACET_MAP.inst_holders_qoq_pct, item, lvl) },
  // ── binary / flag 条件 (extra フラグ経由・順序は旧 itemPasses の AND チェック順を踏襲) ──
  // funda_pass: 5 条件達成 flag (facet オブジェクトなし)。true のみ通す。
  { key: 'funda_pass',       kind: 'flag',   flag: 'fundaPassOnly',  pass: (item) => item.funda_pass === true },
  // ocf_margin: 営業CFマージン ≥15% (§0-1③)。null = AND 除外 (honest)、上限カットなし。
  //   None-preserve: 0.0 は有効値だが閾値 15 未満なので自然に落ちる。
  { key: 'ocf_margin_pct',   kind: 'binary', flag: 'ocfMarginOnly',  facet: OCF_MARGIN_FACET,   pass: (item) => { const m = item[OCF_MARGIN_FACET.field]; return m != null && m >= OCF_MARGIN_FACET.threshold; } },
  // ocf_gt_netincome: 営業CF>純利益 bool (§0-3)。null (sector guard / 外貨ADR / 欠落) = AND 除外。
  { key: 'ocf_gt_netincome', kind: 'flag',   flag: 'ocfGtNiOnly',    facet: OCF_GT_NI_FACET,    pass: (item) => item[OCF_GT_NI_FACET.field] === true },
  // buy_zone: 買い場圏 0 ≤ pivot_distance_pct ≤ 5 (§0-4)。null / pivot 下 / 過熱 (>5) = AND 除外。
  { key: 'buy_zone',         kind: 'binary', flag: 'buyZoneOnly',    facet: BUY_ZONE_FACET,     pass: (item) => { const d = item[BUY_ZONE_FACET.field]; return d != null && d >= BUY_ZONE_FACET.zoneMin && d <= BUY_ZONE_FACET.zoneMax; } },
  // new_high_52w: 52週高値更新 bool。null (Premium マスク / 欠落) = AND 除外。
  { key: 'new_high_52w',     kind: 'flag',   flag: 'newHigh52wOnly', facet: NEW_HIGH_52W_FACET, pass: (item) => item[NEW_HIGH_52W_FACET.field] === true },
  // ad_volume: A/D 出来高の質 ratio > 1 (§0-2)。null (cup 未形成 / Premium マスク) = AND 除外。
  { key: 'ad_volume',        kind: 'binary', flag: 'adVolumeOnly',   facet: AD_VOLUME_FACET,    pass: (item) => { const r = item[AD_VOLUME_FACET.field]; return r != null && r > AD_VOLUME_FACET.threshold; } },
  // sector_leader: セクター内 RS 上位 flag (is_sector_rs_leader)。null / undefined / false = 除外。
  { key: 'sector_leader',    kind: 'flag',   flag: 'sectorLeaderOnly', pass: (item) => item.is_sector_rs_leader === true },
  // cup: Cup-with-Handle 形成 (Premium 限定・backend が free/pro は cup_state=null マスク)。
  //   CUP_PASS_STATES に属する state のみ pass。Sprint 1 では cupOnly flag を誰も ON にしない =
  //   count/list 不参加 (件数不変・Trust Cliff C-2 露出ゼロ)。applied gate 化は Sprint 2 (Premium 限定)。
  { key: 'cup',              kind: 'flag',   flag: 'cupOnly',          pass: (item) => item.cup_state != null && CUP_PASS_STATES.has(item.cup_state) },
];
const COND_MAP = Object.fromEntries(PRESET_CONDS.map((c) => [c.key, c]));
// binary/flag 条件のみ (extra フラグ経由で AND・itemPasses が走査)。grade は activeGrades 経由で別ループ。
const BINARY_CONDS = PRESET_CONDS.filter((c) => c.kind === 'binary' || c.kind === 'flag');

/** 実効 grade map: CORE は preset level、overrides で個別上書き ('off' で除外) */
// locked facet 和名マップ (Pass 3c: 静的 dict、module scope に配置して毎 render 再作成を回避)
const LOCKED_FACET_LABELS = {
  cup: 'カップ・ウィズ・ハンドル',
  breakout: '新高値ブレイク',
  near_high: '新高値圏',
  both: 'カップ+RS複合',
  oneill: 'オニール統合',
  // Phase1 S3: #3 買い場圏 (pivot_distance) は free user に locked chip で見せる (§A 案・cup/breakout と同列)。
  pivot_distance: '買い場圏 (節目近接)',
  // Phase1 S4: #8 A/D 出来高の質 (ad_volume) も free user に locked chip (§A 案・cup/breakout と同列)。
  ad_volume: '出来高の質 (上昇引け優勢)',
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
  ocf_gt_netincome: '利益の質',
  buy_zone: '買い場圏',
  ad_volume: '出来高の質',
};

// ─── Phase B-2: .crow 統一レンダラ用メタ (mockup v8 忠実化) ───────────────────────
// binary 条件を mockup の .crow (トグル + ラベル + 値チップ) として描画する表示メタ。
// PRESET_CONDS の pass ロジックは不変 — 表示の可否と中身のみ (§6 物理隔離)。
//   label/th(閾値型のみ・bool は null)/freshness(未取得→非表示)/locked(Premium→非表示・B-3でlock crow化)
const CROW_BINARY_META = {
  funda_pass:       { label: '最新決算で5条件達成', th: null,     freshness: 'funda_pass' },
  ocf_margin_pct:   { label: 'キャッシュ創出力',     th: '≥15%',   freshness: 'ocf_margin',       tooltip: OCF_MARGIN_FACET.tooltip },
  ocf_gt_netincome: { label: '営業CF>純利益',        th: null,     freshness: 'ocf_gt_netincome', tooltip: OCF_GT_NI_FACET.tooltip },
  buy_zone:         { label: '買い場圏',             th: '0〜+5%', freshness: 'pivot_distance',   locked: 'pivot_distance', tooltip: BUY_ZONE_FACET.tooltip },
  new_high_52w:     { label: '52週高値を更新',        th: null,     freshness: 'breakout',         locked: 'breakout',       tooltip: NEW_HIGH_52W_FACET.tooltip },
  ad_volume:        { label: '出来高の質',           th: '>1',     freshness: 'ad_volume',        locked: 'ad_volume',       tooltip: AD_VOLUME_FACET.tooltip },
  // cup: free/pro は locked_facets に 'cup' が入る (backend マスク) → lock crow で Premium 解錠を広告。
  //   Premium の applied gate 表示は Sprint 2 (freshness.cup or gate 経路)。Sprint 1 は lock crow のみ。
  cup:              { label: 'カップ・ウィズ・ハンドル', th: null,     freshness: 'cup',              locked: 'cup',             tooltip: 'オニールのカップ・ウィズ・ハンドル形成。ベース完成からのブレイク初動の型（Premium で解錠）' },
};
const CROW_LAYOUT = [
  { group: '品質',       sub: '利益・キャッシュの質', keys: ['funda_pass', 'ocf_margin_pct', 'ocf_gt_netincome', 'eps_yoy_pct', 'eps_cagr_3y', 'roe'] },
  { group: 'タイミング', sub: '値動き・勢い',         keys: ['buy_zone', 'new_high_52w', 'cup', 'rs_percentile', 'volume_surge_pct'] },
  { group: '需給',       sub: '機関の動き',           keys: ['ad_volume', 'inst_holders_qoq_pct'] },
];
// B-3: crow conds が inline lock crow として提示する locked_facets key 集合 (= CROW_BINARY_META.locked)。
//   v2 では (2f) 別 section から除外して二重表示を防ぐ ({pivot_distance, breakout, ad_volume})。
const CROW_INLINE_LOCKED_KEYS = new Set(
  Object.values(CROW_BINARY_META).map((m) => m.locked).filter(Boolean)
);

// ─── Phase B-4: preset→conds 表示レジストリ (mockup v8 PRESETS[].conds 忠実化・表示専用) ──────
// 目的: 全 preset 一律の CROW_LAYOUT を、選択中 preset (activePreset) に意味のある条件だけへ絞って
//   表示する (原則1: 読み手の負担を減らす)。**pass 述語 (PRESET_CONDS/itemPasses) は一切不変** —
//   ここで決めるのは「どの crow を描くか」だけで、件数 (count==list) には無影響 (SPEC §5 Sprint 1)。
// 値は CROW_LAYOUT に存在する cond key のみ (mockup の未配線条件 rev3/cfps3/cfpsgt/beat は
//   defer = ここに含めない。嘘の南京錠/空表示を作らない・SPEC §3/§9)。
//   cup は Premium 限定 facet として CROW_LAYOUT + 本 map に追加済 (free は lock crow 経由・件数不変)。
// activePreset が null (preset 未選択 = フリーフォーム custom) または本 map に無い key の場合は、
//   従来通り CROW_LAYOUT 全条件を表示する (legacy 挙動・後方互換)。
const PRESET_DISPLAY_CONDS = {
  // 決算合格: 成長性 (EPS) + 収益の質 (CF マージン/CF>純利益/ROE) + モメンタム (RS)
  //   ocf_gt_netincome は gate (§B-3.5) なので display にも含める (南京錠で必ず可視化)。
  earnings_pass:  ['eps_yoy_pct', 'eps_cagr_3y', 'ocf_margin_pct', 'ocf_gt_netincome', 'roe', 'rs_percentile'],
  // 新高値ブレイク: 型/タイミング (買い場圏/52週高値) + 需給 (出来高急増) + RS
  new_high_break: ['buy_zone', 'new_high_52w', 'cup', 'volume_surge_pct', 'rs_percentile'],
  // 旬のセクター: master-detail (Phase C) が主役。conds は funda_pass のみ (重複回避・SPEC §5 Sprint 1)
  hot_sector:     ['funda_pass'],
  // セクター別リーダー: 収益の質 (CF マージン/ROE) + 機関の動き
  sector_leader:  ['ocf_margin_pct', 'roe', 'inst_holders_qoq_pct'],
};

// ─── Phase B-3.5: gate 条件レジストリ (preset 毎の「常時 ON・トグル不可」死守条件) ──────────
// 目的: mockup v8 `o.gate:true` 条件を南京錠 (lockicon + 「必須」pill・トグル UI なし) で固定し、
//   「変えられる/変えられない」の階層を視覚分離する (原則3・SPEC §5 Sprint 2)。
// 死守ルール (Trust Cliff C-2): gate は当該 preset で必ず pass に算入される条件のみを列挙する。
//   ここに載せる key は applyStrategyImpl + PRESET_PREDICATES.extra の両方で当該 preset 選択時に
//   常時 ON である flag に対応していること (count==list を壊さない)。
// gate-1 決定 (Q2=(a) 件数不変): ocf 系は earnings_pass / sector_leader で既に applyStrategyImpl が
//   ON にしている (= 件数不変)。これらを南京錠化し、旧 screener-gate-list の別 section 二重表示を解消。
// defer (嘘の南京錠を作らない・SPEC §3/§9): cfpsgt/beat (実データ無し) と cup/buy_zone/new_high_52w/
//   ad_volume (Premium マスクで free は cup_state/pivot_distance_pct 等が null・main.py:20456-20484) は
//   free で applied gate にすると全滅するため gate に含めない。データ整備 / Premium 専用化は別 sprint。
const PRESET_GATE_CONDS = {
  earnings_pass: ['ocf_margin_pct', 'ocf_gt_netincome'], // 既に applyStrategyImpl で ON = 件数不変
  sector_leader: ['ocf_margin_pct'],                     // 既に applyStrategyImpl で ON = 件数不変
};

// ─── 合否理由 静的dict (§38安全・LLM不使用・STATE_LABEL_JP 方式) ────────────────
// 「なぜ合致したか」を事実言い換え。数値は data 由来で、LLM 数値計算・narration なし
// ([[feedback_llm_calc_separation]] / [[feedback_diagram_quality_guard]])。
// 全 facet は「閾値以上」条件 (itemPasses: v < grades[lvl] で fail)。
// name = 正式名 (FACET_SHORT_LABEL の省略形より読み手負担が低い・原則1)。
const MATCH_REASON_JP = {
  eps_yoy_pct:          { name: 'EPS成長(四半期)', unit: '%' },
  eps_cagr_3y:          { name: 'EPS成長(3年)',    unit: '%' },
  roe:                  { name: 'ROE',            unit: '%' },
  rs_percentile:        { name: 'RS(相対強さ)',     unit: ''  },
  volume_surge_pct:     { name: '出来高急増',       unit: '%' },
  inst_holders_qoq_pct: { name: '機関保有増',       unit: '%' },
};

/**
 * buildMatchReason — facet の実値・閾値を「事実言い換え」テキストへ変換 (静的テンプレ)。
 * @returns {{ valueText: string, reason: string } | null}
 *   valueText = 行内コンパクト表示用 (例 "+28%")、reason = tooltip/aria 用完全文。
 */
function buildMatchReason(key, value, threshold) {
  const d = MATCH_REASON_JP[key];
  if (!d || value == null) return null;
  const rounded = Math.round(value * 10) / 10;
  // % 系は符号付きで「成長/増加」の事実を明示 (色 polarity なし §38)。RS percentile は符号なし。
  const valTxt = d.unit === '%'
    ? `${rounded > 0 ? '+' : ''}${rounded}%`
    : `${rounded}`;
  const reason = threshold != null
    ? `${d.name} ${valTxt}（基準 ${threshold}${d.unit}以上）`
    : `${d.name} ${valTxt}`;
  return { valueText: valTxt, reason };
}
export function buildActiveGrades(preset, overrides) {
  const g = {};
  for (const k of PRESET_CORE_KEYS) {
    const lvl = clampLevel(FACET_MAP[k], preset); // eps_cagr_3y は loose→standard へクランプ
    if (lvl) g[k] = lvl;
  }
  for (const [k, lvl] of Object.entries(overrides || {})) {
    if (lvl === 'off') { delete g[k]; continue; }
    const f = FACET_MAP[k];
    g[k] = f ? clampLevel(f, lvl) : lvl; // RS<70 等の定義域外 override を下限へクランプ
  }
  return g; // { facetKey: level }
}

/** 単一 predicate — count も list も必ずこれを通す (Trust Cliff C-2 の根拠)。
 *  Phase B-1: PRESET_CONDS レジストリ駆動に移行 (挙動は refactor 前と完全一致・数値不変)。
 *  grade 条件は activeGrades({key:level}) 経由、binary/flag 条件は extra フラグ経由で、
 *  すべて同一 cond.pass を通す (FUNDA_FACETS / binary facets の二重管理を単一 SSOT へ統合)。
 *  各 binary の否定は旧実装と論理一致 (例: !(m!=null && m>=15) ≡ m==null || m<15)。 */
export function itemPasses(item, activeGrades, extra) {
  // grade 条件 (精度連動・activeGrades = {facetKey: level})
  for (const [k, lvl] of Object.entries(activeGrades)) {
    const c = COND_MAP[k];
    if (!c || c.kind !== 'grade') continue; // grade 以外/未登録 key は no-op (旧 FACET_MAP[k] 不在 continue と等価)
    if (!c.pass(item, lvl)) return false;
  }
  // binary / flag 条件 (extra フラグが ON のものだけ AND・順序は旧実装踏襲で結果不変)
  for (const c of BINARY_CONDS) {
    if (extra?.[c.flag] && !c.pass(item)) return false;
  }
  // sector / mcap フィルタ (preset 非依存・旧実装そのまま)
  if (extra?.sectors?.length && !extra.sectors.includes(item.sector)) return false;
  if (extra?.mcapBands?.length && !extra.mcapBands.includes(item.mcap_band)) return false;
  return true;
}

// ─── Phase A: プリセット述語 SSOT ────────────────────────────────────────────
// Trust Cliff 整合: タイル件数と list が必ず同一 predicate を通すための SSOT。
// [[feedback_facet_filter_count_integrity]] に準拠。
export const PRESET_PREDICATES = {
  earnings_pass:  { extra: { fundaPassOnly: true, ocfMarginOnly: true, ocfGtNiOnly: true } },
  new_high_break: { extra: { buyZoneOnly: true, newHigh52wOnly: true } },
  sector_leader:  { extra: { sectorLeaderOnly: true, ocfMarginOnly: true } },
  // hot_sector: セクター算出は topSectorsByRs で計算 (sectorTopN=5 相当)
  hot_sector:     { sectorTopN: 5, extra: { fundaPassOnly: true } },
};

/**
 * topSectorsByRs — sector_rs_median 上位 topN セクター名を返す純関数。
 * countPreset (件数) と applyStrategyImpl (list の sector filter) の両方から呼び、
 * hot_sector の count==list 整合を担保する ([[feedback_facet_filter_count_integrity]])。
 * sector_rs_median は同一 sector 内で全銘柄同値だが、欠損は 0 扱いで max を採る。
 * @returns {string[]} 上位 topN セクター名 (RS 降順)
 */
export function topSectorsByRs(items, topN = 5) {
  const medianBySector = {};
  for (const it of (items || [])) {
    const sec = it.sector;
    if (!sec) continue;
    const v = it.sector_rs_median ?? 0;
    if (medianBySector[sec] == null || v > medianBySector[sec]) medianBySector[sec] = v;
  }
  return Object.entries(medianBySector)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([sec]) => sec);
}

/**
 * countPreset — プリセットキーに対応する件数を universe.items から算出。
 * ScreenerMaster がタイル件数表示に利用 (list の itemPasses と同一述語)。
 * @param {Array}  items    — universe.items (空配列/null なら null を返す)
 * @param {string} presetKey
 * @returns {number|null}
 */
export function countPreset(items, presetKey) {
  if (!items || items.length === 0) return null;
  const cfg = PRESET_PREDICATES[presetKey];
  if (!cfg) return null;

  const grades = buildActiveGrades('standard', {});

  if (presetKey === 'hot_sector') {
    // 上位 sectorTopN セクター (sector_rs_median 降順) ∩ funda_pass を集計。
    // applyStrategyImpl も同一 topSectorsByRs を使うため count==list が保証される。
    const topSectors = topSectorsByRs(items, cfg.sectorTopN ?? 5);
    if (topSectors.length === 0) return null;
    const extra = { ...cfg.extra, sectors: topSectors };
    return items.filter((it) => itemPasses(it, grades, extra)).length;
  }

  // その他プリセット: PRESET_PREDICATES.extra をそのまま使う。
  return items.filter((it) => itemPasses(it, grades, cfg.extra)).length;
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
  // Pass 3c: 詳細展開 accordion の開閉状態
  const [detailOpen, setDetailOpen] = useState(false);
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
  // Phase A: セクター別リーダー binary flag (is_sector_rs_leader=true ∩ ocfMarginOnly)。
  const [sectorLeaderOnly, setSectorLeaderOnly] = useState(false);
  // Phase C: 現在適用中の戦略 preset key (master-detail view 切替に使用・表示専用)。
  const [activePreset, setActivePreset] = useState(initialStrategy || null);
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
    // まず共通リセット (overrides / binary facets)
    setPreset('standard');
    setOverrides({});
    setFundaPassOnly(false);
    setOcfMarginOnly(false);
    setOcfGtNiOnly(false);
    setBuyZoneOnly(false);
    setNewHigh52wOnly(false);
    setAdVolumeOnly(false);
    setSectorLeaderOnly(false);
    setSectorFilter([]);

    if (presetKey === 'earnings_pass') {
      // 5 条件達成 + CF 創出力 + 利益の質 (PRESET_PREDICATES.earnings_pass と一致)
      setFundaPassOnly(true);
      setOcfMarginOnly(true);
      setOcfGtNiOnly(true);
    } else if (presetKey === 'new_high_break') {
      // 買い場圏 (pivot ≤+5%) + 52週高値更新 (PRESET_PREDICATES.new_high_break と一致)
      setBuyZoneOnly(true);
      setNewHigh52wOnly(true);
    } else if (presetKey === 'sector_leader') {
      // セクター別リーダー: is_sector_rs_leader + ocfMarginOnly (PRESET_PREDICATES.sector_leader と一致)
      setSectorLeaderOnly(true);
      setOcfMarginOnly(true);
    } else if (presetKey === 'hot_sector') {
      // 旬のセクター (Phase A 暫定): 上位5セクター ∩ funda_pass を stock list 表示。
      // countPreset と同一 topSectorsByRs (_universeCache=module-scope・常に最新) を使い
      // count==list を担保 (Trust Cliff)。Phase C でセクター master-detail view に置換予定。
      setFundaPassOnly(true);
      setSectorFilter(topSectorsByRs(_universeCache?.items || [], 5));
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
  const activeGrades = useMemo(() => buildActiveGrades(preset, overrides), [preset, overrides]);
  // #2 slice 2-d: 個別緩急(per-facet override)は Pro。screener_v2 scope のみゲート (legacy 不変 §4.5)。
  const advLocked = screenerV2 && !isProUser;
  // #2 slice 2-c: 精度プリセットから個別変更したか (カスタム tag・状態の見える化 §1-6)。
  const isCustom = Object.keys(overrides).length > 0;
  const filteredItems = useMemo(() => {
    const items = universe?.items || [];
    const extra = { fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, sectorLeaderOnly, sectors: sectorFilter, mcapBands: mcapFilter };
    return items.filter((it) => itemPasses(it, activeGrades, extra));
  }, [universe, activeGrades, fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, sectorLeaderOnly, sectorFilter, mcapFilter]);

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

  // ── Phase C: 旬のセクター master-detail 用のセクター集計 ──
  // filteredItems の grouping = master/detail は同一集合の view なので count==list (C-2) を自然に担保。
  // sr = sector_rs_median (同一セクター内同値・欠損は 0、topSectorsByRs と整合で max を採る)。
  // 並び = sr 降順 → count 降順。最上位を「主戦場」(amber) として強調、残りは「上位」(緑)。
  const sectorSummary = useMemo(() => {
    const map = {};
    for (const it of filteredItems) {
      const sec = it.sector;
      if (!sec) continue;
      if (!map[sec]) map[sec] = { sn: sec, sr: it.sector_rs_median ?? 0, items: [] };
      map[sec].items.push(it);
      if ((it.sector_rs_median ?? 0) > map[sec].sr) map[sec].sr = it.sector_rs_median ?? 0;
    }
    return Object.values(map)
      .map((g) => ({
        sn: g.sn,
        label: sectorLabelJp(g.sn),
        sr: g.sr,
        count: g.items.length,
        top3: [...g.items]
          .sort((a, b) => (b.rs_percentile ?? -1) - (a.rs_percentile ?? -1) || a.ticker.localeCompare(b.ticker))
          .slice(0, 3),
      }))
      .sort((a, b) => b.sr - a.sr || b.count - a.count);
  }, [filteredItems]);
  // 選択中セクター (未選択 or 集合変化で消えたら先頭に fallback)。
  const activeSector = useMemo(
    () => (sectorSummary.length ? (sectorSummary.find((s) => s.sn === selectedSector) || sectorSummary[0]) : null),
    [sectorSummary, selectedSector],
  );
  const isSectorView = activePreset === 'hot_sector' && sectorSummary.length > 0;

  // Pass C: フィルタ変更で結果集合が変わったら件数キャップを 100 件に戻す
  // (「残りN件を表示」を一度押しても、新しい絞り込みでは描画負荷抑制の意図を維持)。
  useEffect(() => { setShowAllResults(false); }, [filteredItems]);

  // Pass 3b: preset 別の total 件数 (緩い/標準/厳しい) を live 算出。ハードコード禁止。
  const presetCounts = useMemo(() => {
    const items = universe?.items || [];
    const extra = { fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, sectorLeaderOnly, sectors: sectorFilter, mcapBands: mcapFilter };
    const result = {};
    for (const lvl of ['loose', 'standard', 'strict']) {
      const grades = buildActiveGrades(lvl, overrides);
      result[lvl] = items.filter((it) => itemPasses(it, grades, extra)).length;
    }
    return result;
  }, [universe, overrides, fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, sectorLeaderOnly, sectorFilter, mcapFilter]);

  // Pass 3c: faceted 件数 — 各 facet の各 level に変えた時の件数 (itemPasses 共有、Trust Cliff C-2)。
  // facet K を level L にした時の件数 = { ...activeGrades, [K]: L } で filter。
  // level='off' = K を外した件数 = delete g[K]。
  const facetLevelCounts = useMemo(() => {
    const items = universe?.items || [];
    const extra = { fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, sectorLeaderOnly, sectors: sectorFilter, mcapBands: mcapFilter };
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
  }, [universe, activeGrades, fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, sectorLeaderOnly, sectorFilter, mcapFilter]);

  // Pass 3c: empty サジェスト — 現在 active な制約を1つ外した時に最も件数が増える提案を算出。
  const emptySuggest = useMemo(() => {
    if (filteredItems.length > 0) return null;
    const items = universe?.items || [];
    const extra = { fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, sectorLeaderOnly, sectors: sectorFilter, mcapBands: mcapFilter };
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
    // CORE preset facet を1つ外す
    for (const key of PRESET_CORE_KEYS) {
      if (overrides[key] === 'off') continue;
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
    // sectorLeaderOnly を外す (Phase A)
    if (sectorLeaderOnly) {
      const cnt = items.filter((it) => itemPasses(it, activeGrades, { ...extra, sectorLeaderOnly: false })).length;
      if (!best || cnt > best.count) best = { key: 'sector_leader', label: 'セクター別リーダー', count: cnt, type: 'sector_leader' };
    }
    return best;
  }, [filteredItems.length, universe, activeGrades, overrides, fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, sectorLeaderOnly, sectorFilter, mcapFilter, activePreset]);

  // Pass 3c: sector / mcap 選択肢を universe から live 算出 (count 付き)。
  // Pass 3d (修正A): 全件 universe 集計から faceted count へ変更 (Trust Cliff C-2 修正)。
  // sector 次元自身は "自分の bucket を消さない" ため除外し、grades + funda_pass + mcap を適用。
  const sectorOptions = useMemo(() => {
    const items = universe?.items || [];
    const map = {};
    for (const it of items) {
      if (!it.sector) continue;
      // sector 次元自身は除き (自己排除防止)、他の active facet を適用
      if (!itemPasses(it, activeGrades, { fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, sectorLeaderOnly, mcapBands: mcapFilter, sectors: [it.sector] })) continue;
      map[it.sector] = (map[it.sector] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([s, cnt]) => ({ value: s, label: sectorLabelJp(s), count: cnt }));
  }, [universe, activeGrades, fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, sectorLeaderOnly, mcapFilter]);
  const mcapOptions = useMemo(() => {
    const items = universe?.items || [];
    const map = {};
    for (const it of items) {
      if (!it.mcap_band) continue;
      // mcap 次元自身は除き (自己排除防止)、他の active facet を適用
      if (!itemPasses(it, activeGrades, { fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, sectorLeaderOnly, sectors: sectorFilter, mcapBands: [it.mcap_band] })) continue;
      map[it.mcap_band] = (map[it.mcap_band] || 0) + 1;
    }
    return MCAP_BANDS.filter((b) => map[b.key]).map((b) => ({ ...b, count: map[b.key] || 0 }));
  }, [universe, activeGrades, fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, sectorLeaderOnly, sectorFilter]);

  // Pass 3d (修正C): funda_pass chip に件数を表示するための faceted count。
  // 件数 = funda_pass=true かつ grades + ocf + sector + mcap を通過した件数 (日付ではない)。
  // 自己 (funda_pass) は直接 filter するため extra に含めない。他次元 (ocfMarginOnly 含む) は反映。
  const fundaPassCount = useMemo(() => {
    const items = universe?.items || [];
    return items.filter(
      (it) => it.funda_pass === true &&
        itemPasses(it, activeGrades, { ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, sectors: sectorFilter, mcapBands: mcapFilter })
    ).length;
  }, [universe, activeGrades, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, sectorFilter, mcapFilter]);

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
    if (cond.kind === 'grade') {
      const facet = cond.facet;
      const activeLvl = activeGrades[cond.key];           // undefined = off
      const on = activeLvl != null;
      const isCore = PRESET_CORE_KEYS.includes(cond.key);
      const dispLvl = on ? activeLvl : (isCore ? clampLevel(facet, preset) : clampLevel(facet, 'standard'));
      const toggle = () => {
        if (advLocked) { setAdvLockNudge(true); trackEvent('screener_adv_locked_click', { facet: cond.key }); return; }
        if (on) setOverrides((prev) => ({ ...prev, [cond.key]: 'off' }));
        else if (isCore) setOverrides((prev) => { const n = { ...prev }; delete n[cond.key]; return n; });
        else setOverrides((prev) => ({ ...prev, [cond.key]: 'standard' }));
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
            <div className={`screener-crow__mseg${advLocked ? ' is-locked' : ''}`} role="group" aria-label={`${facet.label} の強度`} data-testid={`screener-mseg-${cond.key}`}>
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
      ocf_margin_pct: [ocfMarginOnly, setOcfMarginOnly],
      ocf_gt_netincome: [ocfGtNiOnly, setOcfGtNiOnly],
      buy_zone: [buyZoneOnly, setBuyZoneOnly],
      new_high_52w: [newHigh52wOnly, setNewHigh52wOnly],
      ad_volume: [adVolumeOnly, setAdVolumeOnly],
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
            {/* 左: 厳しさ精度スライド (B-2: sliding thumb・mockup .seg 準拠。緩い/標準/厳しい 3 段) */}
            <div
              className="screener-precision-seg shrink-0"
              data-testid="screener-precision-seg"
              role="radiogroup"
              aria-label="精度"
            >
              {/* thumb: 選択段に translateX で滑走 (3 等幅・1/3 単位) */}
              <span
                className="screener-precision-seg__thumb"
                style={{ transform: `translateX(${['loose', 'standard', 'strict'].indexOf(preset) * 100}%)` }}
                aria-hidden="true"
              />
              {(['loose', 'standard', 'strict']).map((lvl) => (
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

            {/* 中: 適用中サマリ (active filter を短縮ラベル + 件数寄与で) */}
            {/* screener-applied-summary は常に付与 (空なら aria-hidden) */}
            <span
              className="screener-applied-summary flex-1 min-w-0 truncate text-[11px] text-[var(--text-muted)]"
              data-testid="screener-applied-summary"
              aria-hidden={(() => {
                const hasMcap = mcapFilter.length > 0;
                const hasSector = sectorFilter.length > 0;
                const hasBinary = fundaPassOnly || ocfMarginOnly || ocfGtNiOnly || buyZoneOnly || newHigh52wOnly || adVolumeOnly;
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
                const extra = { fundaPassOnly, ocfMarginOnly, ocfGtNiOnly, buyZoneOnly, newHigh52wOnly, adVolumeOnly, sectors: sectorFilter, mcapBands: mcapFilter };

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
                const overrideParts = Object.entries(overrides).filter(([, v]) => v && v !== 'off').map(([k]) => FACET_SHORT_LABEL[k] || k);
                if (overrideParts.length > 0) parts.push(overrideParts.join('・'));
                return parts.join('　') || null;
              })()}
            </span>

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

          {/* ── Sprint 2 Pass 2a: 詳細 accordion (CSS display:none + opacity — framer-motion 不使用) ──
              SPEC §5 Sprint2 / 3体合議追記条件8: max-height jitter / LazyMotion scope 罠を回避。
              display:none でスクリーンリーダーからも隠れ、opacity fade は CSS transition のみ。
              クラス screener-detail-panel--open/closed を index.css で制御 (JS でスタイル直書きなし)。 */}
          <div
            className={`screener-detail-panel${detailOpen ? ' screener-detail-panel--open' : ' screener-detail-panel--closed'}`}
            role="region"
            aria-label="詳細フィルター"
            aria-hidden={!detailOpen}
            data-testid="screener-detail-panel"
          >
              {screenerV2 ? (
                /* ━━ Phase1 S3 (§0-7): 「品質/タイミング/需給」3カテゴリ accordion 再編 (screener_v2 scope) ━━
                   binary facet (funda_pass/ocf_margin/#1/#3) をフラット末尾追加せず category 内に配置。
                   grade override は renderGradeRow + category filter で旧 2d/2e を統合。
                   §6 scope: legacy (screenerV2=false) は下の <> で従来構造を維持し、再編を漏らさない。 */
                <>
                  {/* ── #2 2-c/2-d: アドバンスド(個別緩急) toggle ──
                      OFF=精度プリセット+strategy chip のみ / ON=各 facet の per-facet mini-segment を露出。
                      個別緩急(per-facet override)は Pro (§4.1)。Free は ON でも segment が淡色 ちら見せ+件数のみ。 */}
                  <div className="screener-adv-bar flex items-center gap-2 flex-wrap" data-testid="screener-adv-header">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={advOpen}
                      className="screener-adv-toggle"
                      onClick={() => {
                        setAdvOpen((v) => !v);
                        setAdvLockNudge(false);
                        trackEvent('screener_adv_toggle', { open: !advOpen, locked: advLocked });
                      }}
                      data-testid="screener-adv-toggle"
                    >
                      <SlidersHorizontal size={13} strokeWidth={2} aria-hidden />
                      <span>アドバンスド（個別に緩急）</span>
                      {advLocked && <span className="screener-adv-pro" aria-label="Pro 機能">Pro</span>}
                      <ChevronDown
                        size={13} strokeWidth={2} aria-hidden
                        style={{ transform: advOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
                      />
                    </button>
                    {isCustom && (
                      <span className="screener-custom-tag" data-testid="screener-custom-tag">カスタム</span>
                    )}
                  </div>

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
                        <Fragment key={grp.group}>
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

          {/* ── Pass C: 適用中フィルタ bar (詳細閉時もサマリ chip を visible に保つ) ── */}
          {(() => {
            const activeOverrides = Object.entries(overrides).filter(([, v]) => v && v !== 'off');
            const hasActive = activeOverrides.length > 0 || sectorFilter.length > 0 || mcapFilter.length > 0 || fundaPassOnly || ocfMarginOnly || ocfGtNiOnly || buyZoneOnly || newHigh52wOnly || adVolumeOnly;
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

                {/* すべて解除 */}
                <button
                  className="ml-auto text-[11px] text-[var(--text-muted)] hover:text-[var(--color-loss)] transition-colors"
                  onClick={() => { setPreset('standard'); setOverrides({}); setSectorFilter([]); setMcapFilter([]); setFundaPassOnly(false); setOcfMarginOnly(false); setOcfGtNiOnly(false); setBuyZoneOnly(false); setAdVolumeOnly(false); }}
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
              /* ── Phase C: 旬のセクター master-detail (セクター一覧 master + Top3 detail)。
                   master/detail とも filteredItems の view なので件数整合 (Trust Cliff C-2)。 */
              <div className="screener-secmd" data-testid="screener-sector-master-detail">
                {/* master: セクター一覧 (sr 降順、先頭=主戦場 amber、残り=上位 緑) */}
                <div className="screener-secmaster" role="list" aria-label="セクター一覧">
                  {sectorSummary.map((s, i) => {
                    const tone = i === 0 ? 'hot' : 'up';
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
                            {i === 0 && <span className="screener-secrow__chip">主戦場</span>}
                          </span>
                          <span className="screener-secrow__tag">{s.count} 銘柄が合致</span>
                        </span>
                        <span className="screener-secrow__sr" data-tone={tone}>{Math.round(s.sr)}</span>
                      </button>
                    );
                  })}
                  <div className="screener-seclegend" aria-hidden>
                    <span><i data-tone="hot" />主戦場</span>
                    <span><i data-tone="up" />上位</span>
                  </div>
                </div>
                {/* detail: 選択セクターの Top3 (相対力降順) */}
                <div className="screener-secdetail" data-testid="screener-sector-detail">
                  <p className="screener-secdetail__h">
                    {activeSector?.label}（相対力 {Math.round(activeSector?.sr ?? 0)}）の合致銘柄 Top3
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
                </div>
              </div>
            ) : filteredItems.length === 0 ? (
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

                  // ── ヒット理由バッジ (スコア寄与順・最大2件) ──
                  const activeFacetsSorted = FUNDA_FACETS
                    .flatMap((f) => {
                      const lvl = activeGrades[f.key];
                      const thr = lvl ? f.grades[lvl] : null;
                      if (thr == null) return [];
                      const v = it[f.key];
                      if (v == null) return [];
                      // 寄与スコアで降順
                      const contrib = thr !== 0 ? (v - thr) / Math.abs(thr) : v;
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
});

export default CustomScreenerPanel;
