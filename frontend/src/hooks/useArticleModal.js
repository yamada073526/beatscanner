import { useState, useCallback, useRef } from 'react';

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
  // v177: 記事取得 stream の AbortController を保持。連続クリック / 高速開閉で
  // 孤児化した read ループが locked ReadableStream を残し InvalidStateError + メモリリーク
  // を生んでいた (Sentry JS 13 events/週) ため、開く度・閉じる度に前の取得を中断する。
  const controllerRef = useRef(null);

  const openArticle = useCallback(async (item, displayTitle) => {
    if (!item || !item.url) return;
    // 直前の記事取得が走っていれば中断 (stream race / locked reader 残留を防ぐ)
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;

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

    let reader = null;
    try {
      const res = await fetch('/api/news/article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url, max_lines: 30 }),
        signal,
      });
      if (!res.ok) throw new Error('記事の取得に失敗しました');

      reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done || signal.aborted) break;

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
      // 中断 (AbortError) は user が閉じた / 次の記事を開いた正常系なので無視
      if (signal.aborted || e.name === 'AbortError') return;
      setArticleModal(prev => prev ? { ...prev, error: e.message, loading: false } : null);
    } finally {
      // locked reader を必ず解放 (未解放だと次の stream で InvalidStateError を誘発)
      try { reader?.releaseLock(); } catch { /* already released / no reader */ }
    }
  }, []);

  const closeArticle = useCallback(() => {
    controllerRef.current?.abort();  // 取得中なら中断 (孤児 read ループ / locked reader を防ぐ)
    setArticleModal(null);
  }, []);

  return { articleModal, openArticle, closeArticle };
}
