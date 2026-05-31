/**
 * conditionCache.js — ticker → ファンダメンタル 5 条件サマリの localStorage 永続 cache.
 *
 * v143 (user dogfood 2026-05-31):
 *   - Pane 2 銘柄行の右端「5 条件 ○ dot」 が **ページを開くたびにリセット** される問題への対応。
 *   - 真因: 判定結果は useJudgmentResult の resultCacheRef (memory Map, 10 分 TTL) のみ保持、
 *     F5 / 再訪で消える設計 (CLAUDE.md「result キャッシュ F5 で消える memory cache でよい」)。
 *     → watchlist の各銘柄は再分析するまで dot が全消し (未分析表示) になっていた。
 *   - 対応: 判定完了時に **軽量サマリ (5 条件 pass/fail + passedCount + overallPass)** のみを
 *     localStorage に永続化。 reload 後も Pane 2 で「前回判定の dot」 を即表示できる。
 *
 * companyNameCache.js と同設計だが、 条件は決算 (四半期) で変わるため:
 *   - TTL 30 日: 古いサマリは load 時に無視 + prune (極端に stale な fundamentals を出さない)
 *   - 件数上限 300: 超過時は ts 古い順に prune (localStorage 肥大防止)
 *
 * 保存するのは「数値の派生 boolean」 のみ (= 物理層の結果)。 LLM narration は一切含めない。
 *
 * 設計:
 *   - localStorage key: `bs:condCache:v1`
 *   - format: `{ [TICKER]: { c: [bool×5], pc: number, op: boolean, ts: number } }` (compact key で容量節約)
 *   - read/write 同期、 fallback (localStorage 不可環境) は in-memory
 */

const STORAGE_KEY = 'bs:condCache:v1';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 日
const MAX_ENTRIES = 300;

let _memCache = null; // in-memory fallback / 一次キャッシュ

function _load() {
  if (_memCache !== null) return _memCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _memCache = raw ? JSON.parse(raw) : {};
  } catch {
    _memCache = {};
  }
  return _memCache;
}

function _save(map) {
  _memCache = map;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage 容量超過 / 不可環境では in-memory のみ
  }
}

/** result から 5 条件 boolean 配列を抽出 (conditions[].passed)。 取得不能なら null */
function _extractBooleans(result) {
  const arr = Array.isArray(result?.conditions) ? result.conditions : null;
  if (!arr || arr.length === 0) return null;
  return arr.map((c) => Boolean(c?.passed));
}

/**
 * 判定 result から軽量サマリを保存。
 * conditions が取れない result (ETF / error) は no-op。
 */
export function saveConditionSummary(ticker, result) {
  if (!ticker || !result) return;
  const bools = _extractBooleans(result);
  if (!bools) return; // ETF / 未判定 result は保存しない
  const key = String(ticker).toUpperCase();
  const passedCount =
    typeof result.passedCount === 'number'
      ? result.passedCount
      : bools.filter(Boolean).length;
  const overallPass =
    typeof result.overallPass === 'boolean'
      ? result.overallPass
      : bools.length > 0 && bools.every(Boolean);

  const map = _load();
  map[key] = { c: bools, pc: passedCount, op: overallPass, ts: Date.now() };

  // 件数上限超過時は ts 古い順に prune
  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => (map[a]?.ts ?? 0) - (map[b]?.ts ?? 0))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete map[k]);
  }
  _save(map);
}

/**
 * compact entry → JudgmentRow / JudgmentList が消費する判定 shape へ復元。
 * conditions は `[{ passed: bool }]` 形 (JudgmentRow が c?.passed を参照するため)。
 */
function _rehydrate(entry) {
  if (!entry || !Array.isArray(entry.c)) return null;
  if (typeof entry.ts === 'number' && Date.now() - entry.ts > TTL_MS) return null; // stale
  return {
    conditions: entry.c.map((b) => ({ passed: Boolean(b) })),
    passedCount: typeof entry.pc === 'number' ? entry.pc : entry.c.filter(Boolean).length,
    overallPass: Boolean(entry.op),
    ts: entry.ts ?? 0,
    _fromCache: true, // session 内の live result と区別するための flag (将来 staleness UI 用)
  };
}

/** 単一 ticker のサマリを取得 (TTL 切れ / miss は null) */
export function getConditionSummary(ticker) {
  if (!ticker) return null;
  const map = _load();
  return _rehydrate(map[String(ticker).toUpperCase()]);
}

/**
 * 全サマリを { TICKER: rehydrated } で返す (App.jsx の items 構築で一括 hydrate 用)。
 * TTL 切れ entry は除外。
 */
export function loadAllConditionSummaries() {
  const map = _load();
  const out = {};
  for (const [k, entry] of Object.entries(map)) {
    const r = _rehydrate(entry);
    if (r) out[k] = r;
  }
  return out;
}

/** cache を全削除 (debug / migration 用) */
export function clearConditionCache() {
  _memCache = {};
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}
