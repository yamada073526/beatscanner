/**
 * ArticlePage.jsx — /articles/:slug の React component
 *
 * SPEC P3.2:
 *   - data-testid="article-hero" / "article-body" / "article-citations" が DOM に存在
 *   - window.__ARTICLE_DATA__ (build-articles.mjs が inject) を優先参照 (SSG hydration)
 *   - SPA 経由訪問時は dist/articles/<slug>/article-data.json から runtime fetch
 *   - fetch 失敗 slug は 404 でなく「準備中」 page を表示 (Trust Cliff 防止)
 *   - react-markdown は manualChunks 'markdown' chunk から lazy load 済み (vite.config.js)
 *
 * URL パターン: /articles/<slug>
 *   slug は build-articles.mjs が生成した記事 dir 名と一致
 *
 * 5 原則:
 *   - 原則 1「2 秒理解」: Hero で即座に価値判断、 本文は段階的読み込み
 *   - 原則 4「1 クリックを減らせ」: 直接 URL → 静的 HTML or SPA fallback で 0 click 到達
 *
 * ブランド世界観:
 *   - 洗練 + 豪華 + 興奮 target (静的記事 = FT Weekend 級の編集装飾)
 *   - max-width 680px / Noto Serif JP / gold accent 数字 → .article-prose CSS で実現
 *
 * memory anchors:
 *   - project_pane45_redesign.md (v113 P1+P2 着地)
 *   - feedback_triage_banner_pattern.md (per-source data namespace)
 *   - feedback_diagram_quality_guard.md (Hallucination Guard 4 層)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import ArticleHero from './ArticleHero.jsx';
import ArticleBody from './ArticleBody.jsx';
import ArticleCitations from './ArticleCitations.jsx';

// ── CANONICAL_BASE (build-articles.mjs と同値) ─────────────────────────────────
const CANONICAL_BASE = 'https://beatscanner-production.up.railway.app';

/**
 * slug から article-data.json の URL を生成
 * SPA 経由訪問時のランタイム fetch 用
 */
function getArticleDataUrl(slug) {
  // 本番 build 済みなら /articles/<slug>/article-data.json が静的配信される
  // ローカル開発 (dist/ から serve) でも同パスでアクセス可能
  return `/articles/${slug}/article-data.json`;
}

/**
 * window.__ARTICLE_DATA__ (SSG inject) から slug が一致するデータを返す。
 * 一致しない場合は null (SPA 経由訪問で SSG なし)。
 */
function getInjectedData(slug) {
  try {
    const data = window.__ARTICLE_DATA__;
    if (data && typeof data === 'object' && data.slug === slug) {
      return data;
    }
  } catch {
    // window が undefined 等の場合は無視 (SSR/SSG build 環境対応)
  }
  return null;
}

// ── LoadingState component ──────────────────────────────────────────────────────
function ArticleLoadingState() {
  return (
    <div className="article-page article-page--loading" aria-live="polite" aria-label="記事を読み込み中">
      <div className="article-page__loading-inner">
        <div className="article-page__loading-pulse" aria-hidden="true" />
        <p className="article-page__loading-text">記事を読み込んでいます...</p>
      </div>
    </div>
  );
}

// ── NotFoundState component ─────────────────────────────────────────────────────
function ArticleNotFound({ slug }) {
  return (
    <div className="article-page article-page--notfound">
      <div className="article-page__notfound-inner">
        <h1 className="article-page__notfound-title">記事を準備中です</h1>
        <p className="article-page__notfound-body">
          この記事は現在準備中か、 URLが変更された可能性があります。
        </p>
        <a href="/" className="article-page__back-link">
          トップへ戻る
        </a>
      </div>
    </div>
  );
}

// ── メイン ArticlePage ──────────────────────────────────────────────────────────

/**
 * @param {Object} props
 * @param {string} [props.slug]  - 明示 slug (App.jsx から pathname 解析して渡す)
 */
export default function ArticlePage({ slug }) {
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Hallucination Guard 第 3 層: sanitize 削除が発生したか
  const [sanitized, setSanitized] = useState(false);
  // onSanitized callback は一度 true になれば再 render を最小化するため ref 経由
  const sanitizedRef = useRef(false);

  const handleSanitized = useCallback(() => {
    if (!sanitizedRef.current) {
      sanitizedRef.current = true;
      setSanitized(true);
    }
  }, []);

  useEffect(() => {
    if (!slug) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    // SSG inject データが既にある場合は fetch をスキップ (hydration)
    const injected = getInjectedData(slug);
    if (injected) {
      setArticle(injected);
      setLoading(false);
      return;
    }

    // SPA 経由訪問: article-data.json を runtime fetch
    let aborted = false;
    const controller = new AbortController();

    (async () => {
      try {
        const url = getArticleDataUrl(slug);
        const res = await fetch(url, {
          signal: controller.signal,
        });

        if (aborted) return;

        if (!res.ok) {
          // 404 等 → 準備中 page 表示 (Trust Cliff 防止: 404 でなく Suggestion 案内)
          setNotFound(true);
          setLoading(false);
          return;
        }

        const data = await res.json();
        if (aborted) return;

        setArticle(data);
        setLoading(false);
      } catch (err) {
        if (aborted) return;
        if (err.name === 'AbortError') return;
        console.warn('[ArticlePage] article-data.json fetch 失敗:', err.message);
        setNotFound(true);
        setLoading(false);
      }
    })();

    return () => {
      aborted = true;
      controller.abort();
    };
  }, [slug]);

  // ── レンダリング分岐 ──────────────────────────────────────────────────────────

  if (loading) {
    return <ArticleLoadingState />;
  }

  if (notFound || !article) {
    return <ArticleNotFound slug={slug} />;
  }

  const { title, subtitle, body_md, citations, ticker, published_at } = article;

  return (
    <main className="article-page">
      {/* 記事コンテナ: max-width 680px + 中央寄せ */}
      <div className="article-page__container">

        {/* Hero: title + subtitle + 発行日 + _sanitized note */}
        <ArticleHero
          title={title}
          subtitle={subtitle}
          ticker={ticker}
          published_at={published_at}
          _sanitized={sanitized}
        />

        {/* 本文: react-markdown + sanitize */}
        <ArticleBody
          bodyMd={body_md}
          onSanitized={handleSanitized}
        />

        {/* 出典リスト */}
        <ArticleCitations citations={citations} />

        {/* フッター: トップへ戻るリンク */}
        <footer className="article-page__footer">
          <a href="/" className="article-page__back-link">
            ← BeatScanner トップへ
          </a>
        </footer>
      </div>
    </main>
  );
}
