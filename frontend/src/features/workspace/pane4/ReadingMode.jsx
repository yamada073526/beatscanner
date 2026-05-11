/**
 * Pane 5 Reading Mode — SSE 構造化記事 + ストリーミング翻訳.
 * v65 §C-3 で Pane4Inspector.jsx から分離.
 */
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, ExternalLink } from 'lucide-react';
import { translateTexts, translateTextsStream } from '../../../api.js';
import { MD_COMPONENTS, stripArticleTrailer } from './markdown.jsx';
import {
  CATEGORY_ICON,
  fmtRelative,
  getNewsColors,
  pickPrimaryCategory,
  sanitizeArticleError,
} from './format.js';

export default function ReadingMode({ item, onClose, jpEnabled }) {
  const [enContent, setEnContent] = useState('');
  const [enLoading, setEnLoading] = useState(false);
  const [enError, setEnError] = useState(null);
  const articleAbortRef = useRef(null);

  const [jaContent, setJaContent] = useState('');
  const [jaLoading, setJaLoading] = useState(false);
  const translateAbortRef = useRef(null);

  const [translatedTitle, setTranslatedTitle] = useState('');

  // ── 記事 SSE 取得 ──────────────────────────────
  useEffect(() => {
    if (!item?.url) return;
    setEnContent('');
    setJaContent('');
    setTranslatedTitle('');
    setEnError(null);
    setEnLoading(true);

    articleAbortRef.current?.abort();
    const ctrl = new AbortController();
    articleAbortRef.current = ctrl;

    (async () => {
      try {
        const res = await fetch('/api/news/article', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: item.url, max_lines: 30 }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6);
            if (payload === '[DONE]') {
              setEnContent((prev) => stripArticleTrailer(prev));
              setEnLoading(false);
              return;
            }
            try {
              const obj = JSON.parse(payload);
              if (obj.error) {
                setEnError(obj.error);
                setEnLoading(false);
                return;
              }
              if (obj.chunk) {
                setEnContent((prev) => prev + obj.chunk);
                setEnLoading(false);
              }
            } catch { /* ignore */ }
          }
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          setEnError(e.message || '記事取得失敗');
          setEnLoading(false);
        }
      }
    })();

    return () => { ctrl.abort(); };
  }, [item?.url]);

  // ── タイトル翻訳 (jpEnabled ON のみ) ─────────────
  useEffect(() => {
    if (!jpEnabled || !item?.title) return;
    let cancelled = false;
    (async () => {
      try {
        const out = await translateTexts([item.title]);
        if (!cancelled && Array.isArray(out) && out[0]) {
          setTranslatedTitle(out[0]);
        }
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [jpEnabled, item?.title]);

  // ── 本文翻訳 (SSE ストリーミング、enContent 完了後) ──
  useEffect(() => {
    if (!jpEnabled || !enContent || enLoading) return;
    translateAbortRef.current?.abort();
    const ctrl = new AbortController();
    translateAbortRef.current = ctrl;

    setJaContent('');
    setJaLoading(true);

    const paragraphs = enContent.split(/\n\n+/).filter((p) => p.trim());
    const buffer = new Array(paragraphs.length).fill('');
    (async () => {
      try {
        await translateTextsStream(
          paragraphs,
          (idx, translation) => {
            // §user-feedback-2026-05-12: fallback で英文 (paragraphs[idx]) を入れると
            // (a) 見出しレベルが h2 → h3 に flicker (英文 `## heading` → 翻訳後 plain text へ
            //    変わり isHeadingLike が h3 に promote)、(b) 和訳前に一瞬英文が見える、
            // という 2 件のバグになる。空文字を入れ、連続翻訳済の prefix だけ表示する.
            buffer[idx] = translation || '';
            let cut = 0;
            while (cut < buffer.length && buffer[cut]) cut += 1;
            setJaContent(buffer.slice(0, cut).join('\n\n'));
          },
          ctrl.signal
        );
      } catch (e) {
        if (e.name !== 'AbortError') {
          // 失敗時は英文を最後の手段として表示 (user は英語が読める前提)
          setJaContent(enContent);
        }
      } finally {
        setJaLoading(false);
      }
    })();

    return () => { ctrl.abort(); };
  }, [jpEnabled, enContent, enLoading]);

  if (!item) return null;
  const cat = pickPrimaryCategory(item);
  const colors = getNewsColors(item.importance, cat);
  const Icon = cat ? CATEGORY_ICON[cat] : null;
  const displayTitle = jpEnabled && translatedTitle ? translatedTitle : item.title;
  // §user-feedback-2026-05-12: jpEnabled 時は jaContent のみ表示 (英文 fallback 撤去).
  // 「和訳前に一瞬英文が出る」体験を削り、進行中バナーで代替する.
  const aiContent = jpEnabled ? jaContent : enContent;
  const fallbackContent = item.summary || '';
  const displayContent = aiContent || (jpEnabled ? '' : fallbackContent);
  const isUsingFallback = !jpEnabled && !aiContent && !!fallbackContent;
  const isStreamingTranslation = jpEnabled ? jaLoading : enLoading;
  const isLoadingFirstChunk = enLoading && !enContent;
  // 和訳着手済だが最初の段落がまだ到着していない (= 完全な無表示状態)
  const isAwaitingFirstJa = jpEnabled && !enLoading && jaLoading && !jaContent;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        className="ws-pane4-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'transparent',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          title="閉じる"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            borderRadius: 'var(--radius-sm, 6px)',
          }}
        >
          <X size={13} aria-hidden />
        </button>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.18em' }}>
          The Reading Room
        </span>
        <div style={{ flex: 1 }} />
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            title="元記事を新しいタブで開く"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: 'rgb(14,165,233)',
              textDecoration: 'none',
            }}
          >
            元記事 <ExternalLink size={11} aria-hidden />
          </a>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          {cat && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                padding: '2px 6px',
                borderRadius: 4,
                background: colors.bg,
                color: colors.fg,
                textTransform: 'uppercase',
              }}
            >
              {Icon && <Icon size={11} strokeWidth={2.25} aria-hidden />}
              <span>{item.importance === 'HIGH' ? `HIGH · ${cat}` : cat}</span>
            </span>
          )}
          {item.source && (
            <span className="ws-pane4-source-pill">{item.source}</span>
          )}
          {item.published && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {fmtRelative(item.published)}
            </span>
          )}
        </div>
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            lineHeight: 1.4,
            color: 'var(--text-primary)',
          }}
        >
          {displayTitle}
        </h3>
        {item.image && (
          <img
            src={item.image}
            alt=""
            loading="lazy"
            style={{
              marginTop: 12,
              width: '100%',
              maxHeight: 200,
              objectFit: 'cover',
              borderRadius: 8,
              background: 'var(--bg-subtle)',
            }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        {enError && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            ⚠️ {sanitizeArticleError(enError)}
          </div>
        )}
        {!enError && (
          <div className="ws-pane4-article-body" style={{ marginTop: 12 }}>
            {/* EN モードで summary fallback 中: AI 構造化 banner */}
            {isLoadingFirstChunk && isUsingFallback && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 10,
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm, 8px)',
                  background: 'rgba(56,189,248,0.08)',
                  border: '1px solid rgba(56,189,248,0.22)',
                  fontSize: 11,
                  color: 'rgb(14,165,233)',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'rgb(56,189,248)',
                    animation: 'ws-pane4-live-pulse 1.4s ease-in-out infinite',
                  }}
                />
                <span>AI が記事を構造化中… (元記事の要約を先に表示)</span>
              </div>
            )}
            {/* JP モードで本文翻訳着手済 + 最初の段落到着前: 翻訳中 banner */}
            {(isAwaitingFirstJa || (jpEnabled && enLoading && !enContent)) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 10,
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm, 8px)',
                  background: 'rgba(56,189,248,0.08)',
                  border: '1px solid rgba(56,189,248,0.22)',
                  fontSize: 11,
                  color: 'rgb(14,165,233)',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'rgb(56,189,248)',
                    animation: 'ws-pane4-live-pulse 1.4s ease-in-out infinite',
                  }}
                />
                <span>AI が翻訳中…</span>
              </div>
            )}
            {displayContent ? (
              <ReactMarkdown components={MD_COMPONENTS}>{displayContent}</ReactMarkdown>
            ) : (
              !isAwaitingFirstJa && !(jpEnabled && enLoading) && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  記事を読込中...
                </div>
              )
            )}
            {/* §user-feedback-2026-05-12: cursor は CSS keyframes が opacity を上書きする
                ため、inline opacity:0 では消えない。条件 render で確実に消す. */}
            {isStreamingTranslation && (
              <span
                key="ws-pane4-cursor"
                className="ws-pane4-cursor"
                aria-hidden
              >
                ▌
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
