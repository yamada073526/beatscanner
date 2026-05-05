import { useState, useEffect, useRef } from 'react';
import { translateTexts } from '../api.js';

// ニュースタイトルの英→日翻訳トグルを共通化したフック
// (NewsPanel / TodaysBriefSection 両方で再利用)
// localStorage キー 'translateNews' は NewsPanel 既存と統一して横断的に永続化

const LS_KEY = 'translateNews';
const CACHE_KEY = 'bs_translation_cache_v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 日
const CACHE_MAX_ENTRIES = 500;

// 原文をそのままキーとして利用 (sha1 不要、衝突実用上ゼロ)。
// trim + lowercase 正規化で揺れに強くする。
function cacheKey(text) {
  return (text || '').trim().toLowerCase();
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return {};
    const now = Date.now();
    const valid = {};
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v.t === 'number' && typeof v.v === 'string' && now - v.t < CACHE_TTL_MS) {
        valid[k] = v;
      }
    }
    return valid;
  } catch {
    return {};
  }
}

function saveCache(cache) {
  try {
    const entries = Object.entries(cache);
    let toSave = cache;
    if (entries.length > CACHE_MAX_ENTRIES) {
      // LRU: 最新 timestamp 順で上位を保持
      entries.sort((a, b) => (b[1].t || 0) - (a[1].t || 0));
      toSave = Object.fromEntries(entries.slice(0, CACHE_MAX_ENTRIES));
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(toSave));
  } catch {
    // QuotaExceededError 等で保存失敗 → サイレント
  }
}

export default function useTranslation(items, getTitle = (i) => i.title) {
  const [enabled, setEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      return saved !== null ? saved === 'true' : true;  // デフォルトは ON
    } catch {
      return true;
    }
  });
  const [translated, setTranslated] = useState(null);
  const [translating, setTranslating] = useState(false);
  const translatingRef = useRef(false);
  const lastItemsRef = useRef(null);

  // items 配列の参照が変わったら translated を破棄 (新しい items は再翻訳が必要)
  useEffect(() => {
    if (lastItemsRef.current !== items) {
      setTranslated(null);
      lastItemsRef.current = items;
    }
  }, [items]);

  // 自動翻訳: items が揃った時点で発火 (enabled に関わらず先回り実行)
  // - localStorage キャッシュにあれば即座に解決 (リピーター 0s)
  // - 未キャッシュ分のみ /api/translate にリクエスト
  // - enabled=false でもバックグラウンド翻訳は実行 (ユーザーが ON にした瞬間に即時表示)
  useEffect(() => {
    if (!items || items.length === 0) return;
    if (translated) return;
    if (translatingRef.current) return;

    const titles = items.map(getTitle).map((t) => t || '');
    if (titles.length === 0) return;

    // localStorage キャッシュ参照
    const cache = loadCache();
    const cachedResults = titles.map((t) => cache[cacheKey(t)]?.v);
    const allCached = cachedResults.every((c) => typeof c === 'string');

    // 全件キャッシュヒット → 即時解決 (体感 0s)
    if (allCached) {
      setTranslated(cachedResults);
      return;
    }

    // 未キャッシュのみ抽出
    const uncachedIndices = [];
    const uncachedTexts = [];
    titles.forEach((t, i) => {
      if (typeof cachedResults[i] !== 'string') {
        uncachedIndices.push(i);
        uncachedTexts.push(t);
      }
    });

    translatingRef.current = true;
    setTranslating(true);

    translateTexts(uncachedTexts)
      .then((translations) => {
        if (!Array.isArray(translations)) {
          throw new Error('Invalid translation response');
        }
        // キャッシュとマージ
        const merged = [...cachedResults];
        const now = Date.now();
        const updatedCache = { ...cache };
        uncachedIndices.forEach((idx, k) => {
          const tr = translations[k];
          if (typeof tr === 'string' && tr.length > 0) {
            merged[idx] = tr;
            updatedCache[cacheKey(uncachedTexts[k])] = { v: tr, t: now };
          } else {
            merged[idx] = uncachedTexts[k];  // 失敗時は原文を返す
          }
        });
        saveCache(updatedCache);
        setTranslated(merged);
      })
      .catch(() => {
        // silent fail — 原文表示にフォールバック (cached は活用)
        const fallback = [...cachedResults];
        uncachedIndices.forEach((idx, k) => {
          fallback[idx] = uncachedTexts[k];
        });
        // translated は設定しない (リトライ可能性を残す)
      })
      .finally(() => {
        translatingRef.current = false;
        setTranslating(false);
      });
  }, [items, translated, getTitle]);  // enabled 依存を削除して常時プリフェッチ

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    try { localStorage.setItem(LS_KEY, String(next)); } catch { /* ignore */ }
  };

  // displayTitles: 翻訳が ON かつ取得済みなら翻訳配列、それ以外は null
  const displayTitles = (enabled && translated) ? translated : null;

  // translating 表示は enabled 時のみ (OFF 時の裏プリフェッチを見せない)
  const visibleTranslating = enabled && translating;

  return { enabled, toggle, displayTitles, translating: visibleTranslating };
}
