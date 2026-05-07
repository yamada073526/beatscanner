import { useEffect } from 'react';

/**
 * §11-C-1: 構造化データ JSON-LD を <head> に動的注入する Hook。
 *
 * 設計判断:
 * - StrictMode 二重実行 / タブ切替時の重複を防ぐため、id 固定 + 既存削除パターン
 * - cleanup で必ず remove (memory leak 防止)
 * - 6 体エージェントレビューの全員一致採用
 * - Phase 2 (Backend Jinja2 移行) に進む際は、この Hook の呼び出しを削除し、
 *   builder 関数のみ backend に移植する想定
 *
 * @param {string} id - script タグの id (重複防止)。例: 'jsonld-website'
 * @param {object | null} schema - schema.org 準拠の JS オブジェクト。null の場合は注入しない (data 未取得時)
 */
export function useJsonLd(id, schema) {
  useEffect(() => {
    if (!schema) return;
    // 既存削除 (StrictMode 二重実行 / Vite HMR の累積対策)
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const el = document.createElement('script');
    el.id = id;
    el.type = 'application/ld+json';
    el.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      ...schema,
    });
    document.head.appendChild(el);

    return () => {
      const node = document.getElementById(id);
      if (node) node.remove();
    };
  }, [id, schema]);
}
