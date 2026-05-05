import { useState, useEffect, useRef } from 'react';
import { translateTexts } from '../api.js';

// ニュースタイトルの英→日翻訳トグルを共通化したフック
// (NewsPanel / TodaysBriefSection 両方で再利用)
// localStorage キー 'translateNews' は NewsPanel 既存と統一して横断的に永続化

const LS_KEY = 'translateNews';

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

  // 自動翻訳: enabled && items が揃って translated が空のとき発火
  useEffect(() => {
    if (!enabled || !items || items.length === 0) return;
    if (translated) return;
    if (translatingRef.current) return;

    translatingRef.current = true;
    setTranslating(true);

    const titles = items.map(getTitle).filter(Boolean);
    translateTexts(titles)
      .then(setTranslated)
      .catch(() => { /* silent fail — original titles remain visible */ })
      .finally(() => {
        translatingRef.current = false;
        setTranslating(false);
      });
  }, [enabled, items, translated, getTitle]);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    try { localStorage.setItem(LS_KEY, String(next)); } catch { /* ignore */ }
  };

  // displayTitles: 翻訳が ON かつ取得済みなら翻訳配列、それ以外は null
  const displayTitles = (enabled && translated) ? translated : null;

  return { enabled, toggle, displayTitles, translating };
}
