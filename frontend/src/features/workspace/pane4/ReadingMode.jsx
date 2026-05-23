/**
 * Pane 5 Reading Mode — SSE 構造化記事 + ストリーミング翻訳.
 * v65 §C-3 で Pane4Inspector.jsx から分離.
 */
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, ExternalLink } from 'lucide-react';
import { translateTexts } from '../../../api.js';
import { sanitizeText } from '../../../lib/blocklist.js';
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
  // §user-feedback-2026-05-12: enLoading は first chunk 到着で false になるため
  // 翻訳 effect の trigger には使えない。SSE 完了 ([DONE]) で初めて true になる
  // 専用フラグを持ち、翻訳は完了後 1 回だけ start させる (chunk 毎の abort/restart 防止).
  const [enComplete, setEnComplete] = useState(false);
  const [enError, setEnError] = useState(null);
  const articleAbortRef = useRef(null);

  const [translatedTitle, setTranslatedTitle] = useState('');

  // §v66 dogfood-5 (Marketer #1 — Weber-Fechner: 体感 -60%): narrative cycling.
  // 5-15s の翻訳待ち中、無音 skeleton より 3 段階 narrative の方が
  // 「動いている感」が強く離脱率が下がる. Linear / Notion / Perplexity 同戦略.
  const NARRATIVES = [
    '原文を取得中…',
    'AI が日本語に翻訳中…',
    '仕上げ中…',
  ];
  const [narrativeIdx, setNarrativeIdx] = useState(0);

  // narrative cycler: 翻訳待ち中だけ 2.5s 毎に進める
  // §v66 dogfood-10: 二重翻訳廃止後は enContent を直接 watch.
  useEffect(() => {
    if (enContent || enError) return;
    setNarrativeIdx(0);
    const t = setInterval(() => {
      setNarrativeIdx((i) => Math.min(i + 1, NARRATIVES.length - 1));
    }, 2500);
    return () => clearInterval(t);
  }, [item?.url, enContent, enError]);

  // ── 記事 SSE 取得 ──────────────────────────────
  useEffect(() => {
    if (!item?.url) return;
    setEnContent('');
    setEnComplete(false);
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
          body: JSON.stringify({ url: item.url, max_lines: 25 }),
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
              setEnComplete(true);
              return;
            }
            try {
              const obj = JSON.parse(payload);
              if (obj.error) {
                setEnError(obj.error);
                setEnLoading(false);
                return;
              }
              // §v66 dogfood-4: backend が Sonnet retry を発動した時の reset signal.
              // それまでに表示した英文 (Haiku passthrough) を消し「再翻訳中」状態に戻す.
              if (obj.reset) {
                setEnContent('');
                setEnLoading(true);
                continue;
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

  // §v66 dogfood-10 (3 体合議): 旧 useArticleModal は /api/news/article SSE
  // 1 回だけで速かった。Pane 5 は backend で Sonnet 4.5 翻訳済 (enContent) を
  // 受けた後、frontend で paragraph 毎に /api/translate/stream を再呼び出しする
  // **二重翻訳**を行っており、TTFT が +5-10s 倍化していた。
  // 旧 UI に倣い、frontend 再翻訳を完全廃止し enContent を直接表示する.

  if (!item) return null;
  const cat = pickPrimaryCategory(item);
  const colors = getNewsColors(item.importance, cat);
  const Icon = cat ? CATEGORY_ICON[cat] : null;
  const displayTitle = jpEnabled && translatedTitle ? translatedTitle : item.title;
  // §v66 dogfood-10: backend が日本語化済 → enContent をそのまま表示
  // v100 Sprint A-K (multi-review Anthropic Engineer verdict、 release block):
  //   Hallucination Guard layer 3 (frontend sanitize) を enContent に適用。
  //   翻訳記事に BAD-5 (断定的将来予測) / BAD-6 (最上級表現) が混入する景表法/金商法 risk を解消。
  //   sanitizeText は違反 sentence 単位削除で LLM 出力の自然性を維持。
  const aiContent = sanitizeText(enContent);
  const fallbackContent = item.summary || '';
  const displayContent = aiContent || fallbackContent;
  const isUsingFallback = !aiContent && !!fallbackContent;
  const isStreamingTranslation = enLoading;
  // first chunk 到着まで banner を表示
  const isWaitingForJa = !enContent && !enError;

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
            {!jpEnabled && isUsingFallback && (
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
            {/* JP モード: jaContent が空の間は常に翻訳中 banner を表示
                (EN 取得中 / 翻訳着手前 / 翻訳着手後の最初の段落到着前、すべて 1 状態に統合) */}
            {isWaitingForJa && (
              <>
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
                  <span>{NARRATIVES[narrativeIdx]}</span>
                </div>
                {/* skeleton shimmer 5 行 (Marketer #1) — 「動いている感」で TTFT 体感を縮める */}
                <div aria-hidden style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {[100, 92, 96, 88, 70].map((w, i) => (
                    <div
                      key={i}
                      className="ws-pane5-skeleton"
                      style={{
                        height: 12,
                        width: `${w}%`,
                        borderRadius: 4,
                        background:
                          'linear-gradient(90deg, rgba(148,163,184,0.10) 0%, rgba(148,163,184,0.22) 50%, rgba(148,163,184,0.10) 100%)',
                        backgroundSize: '200% 100%',
                        animation: 'ws-pane5-shimmer 1.6s ease-in-out infinite',
                      }}
                    />
                  ))}
                </div>
              </>
            )}
            {/* 本文 / fallback summary: JP 待ち中は何も出さない (banner のみ) */}
            {displayContent ? (
              <ReactMarkdown components={MD_COMPONENTS}>{displayContent}</ReactMarkdown>
            ) : (
              !jpEnabled && !enContent && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  記事を読込中...
                </div>
              )
            )}
            {/* §user-feedback-2026-05-12: cursor は CSS keyframes が opacity を上書きする
                ため、inline opacity:0 では消えない。条件 render で確実に消す.
                JP 待ち中 (jaContent が空) も banner で代替するため cursor 不要. */}
            {isStreamingTranslation && displayContent && (
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
