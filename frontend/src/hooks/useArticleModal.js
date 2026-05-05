import { useState, useCallback } from 'react';

// ニュース記事のモーダル表示 + ストリーミング取得を共通化したフック
// (NewsPanel / TodaysBriefSection 両方で再利用)

const REMOVE_PATTERNS = [
  /^元記事(で|を)(続き|全文)/,
  /^続きは?元記事/,
  /^全文を読む/,
  /^この記事の続き/,
  /^Read (more|the full)/i,
  /^Click here to/i,
];

export default function useArticleModal() {
  const [articleModal, setArticleModal] = useState(null);

  const openArticle = useCallback(async (item, displayTitle) => {
    if (!item || !item.url) return;
    const title = displayTitle || item.title;
    setArticleModal({
      url: item.url,
      title,
      source: item.source,
      published: item.published,
      content: '',
      loading: true,
      error: null,
    });

    try {
      const res = await fetch('/api/news/article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url, max_lines: 30 }),
      });
      if (!res.ok) throw new Error('記事の取得に失敗しました');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') {
            setArticleModal(prev => {
              if (!prev) return null;
              const cleaned = (prev.content || '')
                .split('\n')
                .filter(ln => {
                  const t = ln.trim();
                  if (!t) return true;
                  return !REMOVE_PATTERNS.some(p => p.test(t));
                })
                .join('\n')
                .trimEnd();
              return { ...prev, content: cleaned, loading: false };
            });
            break;
          }
          try {
            const { chunk, error } = JSON.parse(payload);
            if (error) {
              setArticleModal(prev => prev ? { ...prev, error, loading: false } : null);
              return;
            }
            if (chunk) {
              setArticleModal(prev => prev ? {
                ...prev,
                loading: false,
                content: (prev.content || '') + chunk,
              } : null);
            }
          } catch { /* ignore JSON parse error */ }
        }
      }
    } catch (e) {
      setArticleModal(prev => prev ? { ...prev, error: e.message, loading: false } : null);
    }
  }, []);

  const closeArticle = useCallback(() => setArticleModal(null), []);

  return { articleModal, openArticle, closeArticle };
}
