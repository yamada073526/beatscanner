/**
 * ScreenerTable — screener_v2 preset を TradingView 型データテーブルに再構成。
 *
 * SPEC 2026-06-21: screener を TradingView 型データテーブル化 (Sprint H)
 *   - universe items (全 field) を fetchScannerUniverse で取得しフロントでソート
 *   - 列セットタブ (概要/テクニカル/ファンダ/需給) + ソート可能ヘッダー
 *   - 今日の筆頭 featured strip (HERO_LADDER 流用)
 *   - 発光ゼロ: .panel-card/.bs-panel/.surface-card 不使用、token + border + tinted-bg のみ
 *   - §38/§5: 色 neutral、断定/最上級禁止、価格変化%列なし
 *   - testid: loading/error/empty/main 全 render path に付与
 *
 * DESIGN:
 *   - Aman ダーク: hairline border-bottom / mono tabular 数値 / 二色 / 余白
 *   - overflow-x:auto で列多い時 nested scroll (row は縦 scroll、 横 scroll は最小化)
 *   - icons: lucide-react のみ (emoji/Tabler 禁止)
 *   - token のみ (raw hex 禁止)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Lock,
  Zap,
  Target,
  ArrowUpRight,
  Crown,
  CheckCircle,
  Minus,
  AlertCircle,
} from 'lucide-react';
import { fetchScannerUniverse } from '../../api.js';

// ──────────────────────────────────────────
// 定数: 列定義 (module-level)
// ──────────────────────────────────────────

/**
 * COLUMN_DEFS: key → { label, field, type, tier }
 *   type: 'ticker' | 'num' | 'pct' | 'bool' | 'chip' | 'badge' | 'text'
 *   tier: 'free' | 'pro' | 'premium'
 */
const COLUMN_DEFS = {
  ticker:          { label: '銘柄',       field: 'ticker',              type: 'ticker',  tier: 'free' },
  rs:              { label: 'RS',         field: 'rs_percentile',       type: 'num',     tier: 'free' },
  eps_yoy:         { label: 'EPS成長%',   field: 'eps_yoy_pct',         type: 'pct',     tier: 'free' },
  eps_cagr:        { label: 'EPS CAGR',   field: 'eps_cagr_3y',         type: 'pct',     tier: 'free' },
  ocf_margin:      { label: '営業CF率%',  field: 'ocf_margin_pct',      type: 'pct',     tier: 'free' },
  ocf_gt_ni:       { label: 'CF>純益',    field: 'ocf_gt_netincome',    type: 'bool',    tier: 'free' },
  roe:             { label: 'ROE%',       field: 'roe',                 type: 'pct',     tier: 'free' },
  funda_pass:      { label: '決算3条件', field: 'funda_pass',           type: 'badge',   tier: 'free' },
  inst_qoq:        { label: '機関保有増%', field: 'inst_holders_qoq_pct', type: 'pct',   tier: 'free' },
  buyback:         { label: '自社株%',    field: 'buyback_yield_pct',   type: 'pct',     tier: 'free' },
  near_high:       { label: '52週高値比%', field: 'near_high_pct_scaled', type: 'pct',  tier: 'pro' },
  volume_surge:    { label: '出来高急増%', field: 'volume_surge_pct',   type: 'pct',     tier: 'free' },
  mcap_band:       { label: '時価総額',   field: 'mcap_band',           type: 'text',    tier: 'free' },
  sector:          { label: 'セクター',   field: 'sector',              type: 'text',    tier: 'free' },
  cup_state:       { label: 'Cup',        field: 'cup_state',           type: 'chip',    tier: 'premium' },
  breakout_state:  { label: 'ブレイク',   field: 'breakout_state',      type: 'chip',    tier: 'premium' },
  pivot_distance:  { label: 'pivot乖離%', field: 'pivot_distance_pct',  type: 'pct',     tier: 'premium' },
  ad_ratio:        { label: 'A/D比',      field: 'ad_volume_ratio',     type: 'num',     tier: 'premium' },
  signal:          { label: 'シグナル',   field: '__signal__',          type: 'chip',    tier: 'premium' },
};

/**
 * COLUMN_SETS: タブ key → 列 key 配列 (銘柄+RS は全タブ先頭固定)
 */
const COLUMN_SETS = {
  overview:   { label: '概要',       cols: ['ticker', 'rs', 'eps_yoy', 'ocf_margin', 'roe', 'signal', 'volume_surge'] },
  technical:  { label: 'テクニカル', cols: ['ticker', 'rs', 'near_high', 'pivot_distance', 'ad_ratio', 'volume_surge', 'signal'] },
  funda:      { label: 'ファンダ',   cols: ['ticker', 'rs', 'eps_yoy', 'eps_cagr', 'ocf_margin', 'ocf_gt_ni', 'roe', 'funda_pass'] },
  demand:     { label: '需給',       cols: ['ticker', 'rs', 'inst_qoq', 'buyback', 'ad_ratio', 'mcap_band', 'sector'] },
};

const COLSET_KEYS = Object.keys(COLUMN_SETS);

// ──────────────────────────────────────────
// 定数: signal ラベル / icon (ScreenerIdleHero.jsx から流用)
// ──────────────────────────────────────────

function deriveSignalLabel(it) {
  if (it.cup_state === 'breakout_confirmed') return 'ブレイク確定';
  if (it.cup_state === 'breakout_pending') return 'ブレイク待ち';
  if (it.breakout_state === 'bo_confirmed') return '新高値ブレイク';
  if (it.cup_state === 'formation') return 'カップ形成中';
  return null;
}

function signalIconFor(label) {
  if (label === 'ブレイク確定' || label === '新高値ブレイク') return Zap;
  if (label === 'ブレイク待ち') return ArrowUpRight;
  if (label === 'カップ形成中') return Target;
  return null;
}

const CUP_STATE_SHORT = {
  breakout_confirmed: 'ブレイク確定',
  breakout_pending:   'ブレイク待ち',
  pullback_to_support: '押し目',
  formation:          '形成中',
  cup_completing:     'カップ完成間近',
  breakout_extended:  '過延伸',
  formation_market_weak: '形成中(市場待機)',
};

const BREAKOUT_STATE_SHORT = {
  bo_confirmed: '新高値ブレイク',
  bo_pending:   '高値圏トライ中',
  bo_extended:  '新高値圏(過延伸)',
  bo_soft:      '新高値(出来高薄)',
};

// ──────────────────────────────────────────
// 定数: featured strip 用 HERO_LADDER (ScreenerIdleHero.jsx から簡易移植)
// ──────────────────────────────────────────

const RS_MIN      = 75;
const OCF_MIN     = 15;
const EPS_YOY_MIN = 18;
const ROE_MIN     = 17;

function passRs(it)  { return typeof it.rs_percentile === 'number' && it.rs_percentile >= RS_MIN; }
function passOcf(it) { return typeof it.ocf_margin_pct === 'number' && it.ocf_margin_pct >= OCF_MIN; }
function passEps(it) { return typeof it.eps_yoy_pct === 'number' && it.eps_yoy_pct >= EPS_YOY_MIN; }
function passRoe(it) { return typeof it.roe === 'number' && it.roe >= ROE_MIN; }
function passTech(it) {
  return it.cup_state === 'breakout_confirmed' ||
    it.cup_state === 'breakout_pending' ||
    it.breakout_state === 'bo_confirmed';
}
function passTechRelaxed(it) { return passTech(it) || it.cup_state === 'formation'; }

const HERO_LADDER = [
  { pred: (it) => passRs(it) && passOcf(it) && passEps(it) && passRoe(it) && passTech(it) },
  { pred: (it) => passRs(it) && passOcf(it) && passEps(it) && passTech(it) },
  { pred: (it) => passRs(it) && passOcf(it) && passTech(it) },
  { pred: (it) => passRs(it) && passTech(it) },
  { pred: (it) => passRs(it) && passTechRelaxed(it) },
];

/** 全 items から #1 (featured) を決定する。RS降順→ファンダ達成数→OCF でソート。 */
function pickFeatured(items) {
  if (!items || items.length === 0) return null;
  const buckets = HERO_LADDER.map((L) => items.filter(L.pred));
  let levelIdx = buckets.findIndex((m) => m.length >= 1);
  if (levelIdx === -1) return null;
  const pool = buckets[levelIdx];
  const sorted = pool.slice().sort((a, b) => {
    const rsDiff = (b.rs_percentile ?? 0) - (a.rs_percentile ?? 0);
    if (rsDiff !== 0) return rsDiff;
    const fcA = (passOcf(a) ? 1 : 0) + (passEps(a) ? 1 : 0) + (passRoe(a) ? 1 : 0);
    const fcB = (passOcf(b) ? 1 : 0) + (passEps(b) ? 1 : 0) + (passRoe(b) ? 1 : 0);
    if (fcB !== fcA) return fcB - fcA;
    return (b.ocf_margin_pct ?? -Infinity) - (a.ocf_margin_pct ?? -Infinity);
  });
  return sorted[0] ?? null;
}

// ──────────────────────────────────────────
// セル描画 helpers (module-level、inline 関数 component 禁止)
// ──────────────────────────────────────────

/** 数値を n 桁小数で表示 (tabular-nums) */
function fmtNum(val, digits = 0) {
  if (val == null || !Number.isFinite(Number(val))) return null;
  return Number(val).toFixed(digits);
}

/** ±符号付き % 表示 (eps_yoy / inst_qoq / volume_surge など符号系) */
function fmtSignedPct(val, digits = 1) {
  if (val == null || !Number.isFinite(Number(val))) return null;
  const n = Number(val);
  return (n >= 0 ? '+' : '') + n.toFixed(digits);
}

/**
 * PctCell — pct 型セルの表示 (中立色、符号付き/なし)
 * signed=true の場合は +/- で符号表示するが、色は neutral (緑/赤の断定なし §38)。
 */
function PctCell({ val, signed = true, digits = 1 }) {
  if (val == null || !Number.isFinite(Number(val))) {
    return <span className="screener-table__cell--muted">—</span>;
  }
  const text = signed ? fmtSignedPct(val, digits) + '%' : fmtNum(val, digits) + '%';
  return <span className="screener-table__num">{text}</span>;
}

/** NumCell — num 型セルの表示 (整数 tabular) */
function NumCell({ val, digits = 0 }) {
  if (val == null || !Number.isFinite(Number(val))) {
    return <span className="screener-table__cell--muted">—</span>;
  }
  return <span className="screener-table__num">{fmtNum(val, digits)}</span>;
}

/** BoolCell — bool 型セル: true→✓ cyan / false/null→— muted */
function BoolCell({ val }) {
  if (val === true) {
    return (
      <span className="screener-table__bool screener-table__bool--true" aria-label="該当">
        <CheckCircle size={13} strokeWidth={2} aria-hidden />
      </span>
    );
  }
  return <span className="screener-table__cell--muted">—</span>;
}

/** ChipCell — cup_state / breakout_state / signal 型: tinted chip */
function ChipCell({ val, field }) {
  if (val == null) return <span className="screener-table__cell--muted">—</span>;

  let label = null;
  let Icon = null;

  if (field === '__signal__') {
    label = deriveSignalLabel(val);
    if (!label) return <span className="screener-table__cell--muted">—</span>;
    const SIcon = signalIconFor(label);
    Icon = SIcon;
  } else if (field === 'cup_state') {
    label = CUP_STATE_SHORT[val] || val;
    const SIcon = signalIconFor(label);
    Icon = SIcon;
  } else if (field === 'breakout_state') {
    label = BREAKOUT_STATE_SHORT[val] || val;
    const SIcon = signalIconFor(label);
    Icon = SIcon;
  }

  if (!label) return <span className="screener-table__cell--muted">—</span>;

  return (
    <span className="screener-table__chip">
      {Icon && <Icon size={11} strokeWidth={2} aria-hidden className="screener-table__chip-icon" />}
      <span>{label}</span>
    </span>
  );
}

/** BadgeCell — funda_pass: gold tint badge */
function BadgeCell({ val }) {
  if (!val) return <span className="screener-table__cell--muted">—</span>;
  return <span className="screener-table__badge screener-table__badge--gold">決算3条件</span>;
}

/** TextCell — mcap_band / sector: muted */
function TextCell({ val }) {
  if (!val) return <span className="screener-table__cell--muted">—</span>;
  return <span className="screener-table__text">{val}</span>;
}

/** LockCell — tier gate: premium 列で値 null の行 */
function LockCell() {
  return (
    <span className="screener-table__lock" aria-label="Premium で解放">
      <Lock size={11} strokeWidth={1.75} aria-hidden />
    </span>
  );
}

/**
 * renderCell — 列 type に応じてセルを描画
 * signal 列は item 全体を val として受け取る (field='__signal__')
 */
function renderCell(colKey, colDef, item) {
  const { field, type, tier } = colDef;

  // ticker 列は専用 (固定 left)
  if (type === 'ticker') return null; // TickerCell は別途

  // premium 列で値 null → tier gate 表示
  const isPremiumCol = tier === 'premium' || tier === 'pro';
  // signal 列は派生値 (cup_state/breakout_state が null → lock)
  if (isPremiumCol) {
    const rawField = field === '__signal__' ? 'cup_state' : field;
    if (item[rawField] == null) return <LockCell />;
  }

  // signal 列は item 全体を渡す
  const val = field === '__signal__' ? item : item[field];

  switch (type) {
    case 'num':
      return <NumCell val={val} digits={0} />;
    case 'pct': {
      // 符号付き列: eps_yoy / eps_cagr / inst_qoq / volume_surge / pivot_distance
      const signed = ['eps_yoy', 'eps_cagr', 'inst_qoq', 'volume_surge', 'pivot_distance'].includes(colKey);
      return <PctCell val={val} signed={signed} digits={1} />;
    }
    case 'bool':
      return <BoolCell val={val} />;
    case 'chip':
      return <ChipCell val={field === '__signal__' ? item : val} field={field} />;
    case 'badge':
      return <BadgeCell val={val} />;
    case 'text':
      return <TextCell val={val} />;
    default:
      return <span className="screener-table__cell--muted">—</span>;
  }
}

// ──────────────────────────────────────────
// ソート helper
// ──────────────────────────────────────────

/** 数値可能な列かどうか (ソートを有効化する条件) */
function isSortable(colKey, colDef) {
  if (colDef.type === 'ticker') return false;
  if (colDef.type === 'text') return false;
  if (colDef.type === 'badge') return false;
  if (colDef.type === 'bool') return true;
  if (colDef.type === 'chip') return false; // chip はラベルソート不要
  return true; // num / pct
}

/** items を sortKey/sortDir でソートする */
function sortItems(items, sortKey, sortDir) {
  if (!sortKey) return items;
  const colDef = COLUMN_DEFS[sortKey];
  if (!colDef) return items;

  return [...items].sort((a, b) => {
    let va, vb;
    if (colDef.field === '__signal__') {
      va = deriveSignalLabel(a) ? 1 : 0;
      vb = deriveSignalLabel(b) ? 1 : 0;
    } else {
      va = a[colDef.field];
      vb = b[colDef.field];
    }
    // null を末尾へ
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const diff = Number(va) - Number(vb);
    return sortDir === 'asc' ? diff : -diff;
  });
}

// ──────────────────────────────────────────
// sub-component: FeaturedStrip (module-level)
// ──────────────────────────────────────────

/**
 * FeaturedStrip — テーブル上部の細い「今日の筆頭」strip。
 * gold left-border + ticker + RS + ファンダ N/3 + signal chip。1 行コンパクト。
 */
function FeaturedStrip({ item, onSelect }) {
  if (!item) return null;
  const signal = deriveSignalLabel(item);
  const SIcon = signalIconFor(signal);
  const rs = item.rs_percentile;
  const fcount = (passOcf(item) ? 1 : 0) + (passEps(item) ? 1 : 0) + (passRoe(item) ? 1 : 0);

  return (
    <div
      data-testid="screener-featured-strip"
      className="screener-featured-strip"
      role="complementary"
      aria-label="今日の筆頭銘柄"
    >
      <span className="screener-featured-strip__label">
        <Crown size={12} strokeWidth={1.75} aria-hidden />
        今日の筆頭
      </span>
      <button
        type="button"
        className="screener-featured-strip__ticker"
        onClick={() => onSelect(item.ticker)}
        aria-label={`${item.ticker} の詳細を表示`}
      >
        {item.ticker}
      </button>
      {typeof rs === 'number' && (
        <span className="screener-featured-strip__rs">
          RS <strong>{Math.round(rs)}</strong>
        </span>
      )}
      <span className="screener-featured-strip__funda">
        ファンダ {fcount}/3
      </span>
      {signal && (
        <span className="screener-featured-strip__signal">
          {SIcon && <SIcon size={11} strokeWidth={2} aria-hidden />}
          {signal}
        </span>
      )}
    </div>
  );
}

// ──────────────────────────────────────────
// sub-component: ColumnSetTabs (module-level)
// ──────────────────────────────────────────

function ColumnSetTabs({ activeSet, onSetChange }) {
  return (
    <div className="screener-table__colset-tabs" role="tablist" aria-label="列セット">
      {COLSET_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={activeSet === key}
          data-testid={`screener-table-colset-${key}`}
          className={[
            'screener-table__colset-tab',
            activeSet === key ? 'screener-table__colset-tab--active' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => onSetChange(key)}
        >
          {COLUMN_SETS[key].label}
        </button>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────
// sub-component: SortIcon (module-level)
// ──────────────────────────────────────────

function SortIcon({ colKey, sortKey, sortDir }) {
  if (colKey !== sortKey) {
    return (
      <span className="screener-table__sort-icon screener-table__sort-icon--idle" aria-hidden>
        <ArrowDown size={10} strokeWidth={2} />
      </span>
    );
  }
  return (
    <span className="screener-table__sort-icon screener-table__sort-icon--active" aria-hidden>
      {sortDir === 'asc' ? <ArrowUp size={10} strokeWidth={2} /> : <ArrowDown size={10} strokeWidth={2} />}
    </span>
  );
}

// ──────────────────────────────────────────
// sub-component: TableSkeleton (loading)
// ──────────────────────────────────────────

function TableSkeleton() {
  return (
    <div
      data-testid="screener-table-loading"
      className="screener-table__skeleton"
      aria-busy="true"
      aria-label="読み込み中"
    >
      {[...Array(8)].map((_, i) => (
        <div key={i} className="screener-table__skeleton-row">
          <div className="skel-base skel-text-line" style={{ width: '60px' }} />
          <div className="skel-base skel-text-line" style={{ width: '36px' }} />
          <div className="skel-base skel-text-line" style={{ width: '48px' }} />
          <div className="skel-base skel-text-line" style={{ width: '48px' }} />
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────
// メイン component: ScreenerTable
// ──────────────────────────────────────────

/**
 * ScreenerTable
 * @param {object} props
 * @param {Function} props.onSelect — ticker 文字列を受け取る (行クリック → master-detail)
 */
export default function ScreenerTable({ onSelect }) {
  // ── state ──────────────────────────────
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSet, setActiveSet] = useState('overview');
  const [sortKey, setSortKey] = useState('rs');       // 既定: RS 降順
  const [sortDir, setSortDir] = useState('desc');

  // ── fetch ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const data = await fetchScannerUniverse(3000);
        if (cancelled) return;
        if (!data || !Array.isArray(data.items)) {
          setError('データ取得に失敗しました');
          setLoading(false);
          return;
        }
        setItems(data.items);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError('データ取得に失敗しました');
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ── ソートハンドラ ──────────────────────
  const handleSort = useCallback((key) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('desc');
      return key;
    });
  }, []);

  // ── 派生値 ──────────────────────────────
  const activeCols = COLUMN_SETS[activeSet]?.cols ?? COLUMN_SETS.overview.cols;

  const sortedItems = useMemo(
    () => sortItems(items, sortKey, sortDir),
    [items, sortKey, sortDir],
  );

  const featured = useMemo(() => pickFeatured(items), [items]);

  // ── render ─────────────────────────────
  if (loading) {
    return (
      <div data-testid="screener-table" className="screener-table">
        <TableSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="screener-table" className="screener-table screener-table--error">
        <div className="screener-table__error" role="alert">
          <AlertCircle size={16} strokeWidth={1.75} aria-hidden />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div data-testid="screener-table" className="screener-table screener-table--empty">
        <div className="screener-table__empty">
          <Minus size={16} strokeWidth={1.75} aria-hidden />
          <span>銘柄データなし</span>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="screener-table" className="screener-table">
      {/* STEP 2: 今日の筆頭 featured strip */}
      <FeaturedStrip item={featured} onSelect={onSelect} />

      {/* 列セットタブ */}
      <ColumnSetTabs activeSet={activeSet} onSetChange={setActiveSet} />

      {/* データテーブル (overflow-x: auto で横スクロール) */}
      <div className="screener-table__scroll-wrap">
        <table className="screener-table__table" role="table">
          {/* ── ヘッダー ── */}
          <thead>
            <tr data-testid="screener-table-head" className="screener-table__head-row">
              {activeCols.map((colKey) => {
                const colDef = COLUMN_DEFS[colKey];
                if (!colDef) return null;
                const sortable = isSortable(colKey, colDef);
                const isActive = sortKey === colKey;
                const isTicker = colDef.type === 'ticker';
                return (
                  <th
                    key={colKey}
                    scope="col"
                    className={[
                      'screener-table__th',
                      isTicker ? 'screener-table__th--ticker' : '',
                      sortable ? 'screener-table__th--sortable' : '',
                      isActive ? 'screener-table__th--active' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={sortable ? () => handleSort(colKey) : undefined}
                    aria-sort={
                      isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                    title={sortable ? `${colDef.label} でソート` : undefined}
                  >
                    <span className="screener-table__th-inner">
                      {colDef.label}
                      {sortable && (
                        <SortIcon colKey={colKey} sortKey={sortKey} sortDir={sortDir} />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* ── 行 ── */}
          <tbody>
            {sortedItems.map((item) => (
              <tr
                key={item.ticker}
                data-testid={`screener-table-row-${item.ticker}`}
                className="screener-table__row"
                onClick={() => onSelect(item.ticker)}
                role="row"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelect(item.ticker);
                }}
                aria-label={`${item.ticker} の詳細を表示`}
              >
                {activeCols.map((colKey) => {
                  const colDef = COLUMN_DEFS[colKey];
                  if (!colDef) return null;
                  const isTicker = colDef.type === 'ticker';

                  if (isTicker) {
                    return (
                      <td
                        key={colKey}
                        className="screener-table__td screener-table__td--ticker"
                      >
                        <span className="screener-table__ticker-name">{item.ticker}</span>
                        {item.name && (
                          <span className="screener-table__ticker-sub">{item.name}</span>
                        )}
                      </td>
                    );
                  }

                  return (
                    <td
                      key={colKey}
                      className="screener-table__td screener-table__td--num"
                    >
                      {renderCell(colKey, colDef, item)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 行数フッター */}
      <div className="screener-table__footer">
        <span>{sortedItems.length} 銘柄</span>
        <span className="screener-table__footer-note">投資の推奨ではありません</span>
      </div>
    </div>
  );
}
