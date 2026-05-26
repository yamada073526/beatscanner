/**
 * companyNameCache.js — ticker → companyName の localStorage 永続 cache.
 *
 * v120 hotfix (user dogfood req Q3 案 A):
 *   - 「未分析」 ラベル削除 + 「会社名を毎回 fetch するのは API 費用無駄」 への対応
 *   - 会社名は **静的データ** (ticker→name mapping は不変) なので 1 デバイス で永続 cache 可
 *
 * 案 A (localStorage) を採用した理由:
 *   1. 即効性: backend 変更なし、 frontend 単独で完結 (工数 0.2 人日)
 *   2. cost: 会社名は静的なので「永続 cache + version 化なし」 で OK、 cost ほぼゼロ
 *   3. 個人投資家は基本 1 デバイス で利用、 デバイス間共有不要
 *   4. 後で B (backend in-memory) に拡張可能 (case load 増えたとき)
 *
 * 設計:
 *   - localStorage key: `bs:companyName:v1`
 *   - format: `{ [ticker]: companyName }` (JSON)
 *   - 上限なし (会社名 1 件 ~50 byte、 10,000 銘柄でも 500KB = localStorage 5MB 上限内)
 *   - read/write は同期、 fallback (localStorage 不可環境) は in-memory Map
 */

const STORAGE_KEY = 'bs:companyName:v1';

let _memCache = null; // in-memory fallback

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

/** ticker → companyName を取得 (cache hit なら returns string、 miss なら null) */
export function getCompanyName(ticker) {
  if (!ticker) return null;
  const map = _load();
  return map[String(ticker).toUpperCase()] || null;
}

/** ticker + companyName を cache に保存 (上書き OK、 null は無視 = cache に書かない) */
export function setCompanyName(ticker, companyName) {
  if (!ticker || !companyName || typeof companyName !== 'string') return;
  const key = String(ticker).toUpperCase();
  const map = _load();
  if (map[key] === companyName) return; // 既に同一値なら write skip (localStorage I/O 節約)
  map[key] = companyName;
  _save(map);
}

/** 複数 ticker → name mapping を一括保存 ({TICKER: name, ...}) */
export function setCompanyNamesBulk(mapping) {
  if (!mapping || typeof mapping !== 'object') return;
  const cache = _load();
  let dirty = false;
  for (const [t, n] of Object.entries(mapping)) {
    if (!t || !n || typeof n !== 'string') continue;
    const key = String(t).toUpperCase();
    if (cache[key] !== n) {
      cache[key] = n;
      dirty = true;
    }
  }
  if (dirty) _save(cache);
}

/** cache を全削除 (debug / migration 用) */
export function clearCompanyNameCache() {
  _memCache = {};
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}
