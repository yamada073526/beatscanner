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
import ArticleErrorBoundary from './ArticleErrorBoundary.jsx';

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

/**
 * v122: SSG されていない記事の fallback fetch (auto-publish 直後 / Railway redeploy 待ち中)。
 *
 * 設計:
 * - build-articles.mjs は deploy 時のみ実行 → cron で publish された article は次 deploy
 *   まで dist/articles/<slug>/ 不在 → article-data.json 404
 * - Trust Cliff 防止: 「auto-publish された記事を email で告知 → click → 404」 を避けるため、
 *   article-data.json 404 時に Supabase REST で fetch して表示する
 * - SEO / OGP は失われるが UX 維持 (1 user 1 通の email 通知経路では SEO 不要)
 * - 次 deploy で正常 SSG されれば自然に SSG path に戻る
 *
 * @returns {Promise<Object|null>} - 失敗時は null
 */
async function fetchArticleFromSupabase(slug) {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey || !slug) return null;
    const endpoint = `${url}/rest/v1/articles?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=slug,title,subtitle,body_md,citations,ticker,theme,format,published_at,generated_at,verdict_sign&limit=1`;
    const res = await fetch(endpoint, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0];
    return {
      slug: row.slug,
      title: row.title || '',
      subtitle: row.subtitle || '',
      body_md: row.body_md || '',
      citations: row.citations || [],
      ticker: row.ticker || null,
      theme: row.theme || null,
      format: row.format || 'deep_dive',
      published_at: row.published_at || row.generated_at,
      verdict_sign: row.verdict_sign || null,
      _from_fallback: true,
    };
  } catch (e) {
    // CORS / 401 / network → silent (404 page で代替)
    console.warn('[ArticlePage] Supabase fallback fetch 失敗:', e?.message);
    return null;
  }
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

    // v123 hotfix: published_at が null の article は generated_at で fallback。
    // (v121 末期に user が service_role で status='published' 手動 update した残骸 2 件 -
    // googl-202605241934 / nvda-202605251039 - 等への defense-in-depth。
    // ArticleHero formatPublishedAt(null) → '' で <time> tag が消える bug を防止)
    const withPublishedAtFallback = (data) => ({
      ...data,
      published_at: data?.published_at || data?.generated_at || null,
    });

    // SSG inject データが既にある場合は fetch をスキップ (hydration)
    const injected = getInjectedData(slug);
    if (injected) {
      setArticle(withPublishedAtFallback(injected));
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
          // v122: article-data.json 404 → Supabase fallback fetch
          // (auto-publish 直後で Railway redeploy 未完了の状態でも記事表示する)
          const fallback = await fetchArticleFromSupabase(slug);
          if (aborted) return;
          if (fallback) {
            setArticle(withPublishedAtFallback(fallback));
            setLoading(false);
            return;
          }
          // fallback も失敗 → 準備中 page 表示 (Trust Cliff 防止: 404 でなく Suggestion 案内)
          setNotFound(true);
          setLoading(false);
          return;
        }

        const data = await res.json();
        if (aborted) return;

        setArticle(withPublishedAtFallback(data));
        setLoading(false);
      } catch (err) {
        if (aborted) return;
        if (err.name === 'AbortError') return;
        console.warn('[ArticlePage] article-data.json fetch 失敗:', err.message);
        // v122: network エラー時も Supabase fallback を試す
        const fallback = await fetchArticleFromSupabase(slug);
        if (aborted) return;
        if (fallback) {
          setArticle(withPublishedAtFallback(fallback));
          setLoading(false);
          return;
        }
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
    <ArticleErrorBoundary>
    <main className="article-page">
      {/* 記事コンテナ: max-width 680px + 中央寄せ */}
      <div className="article-page__container">

        {/* Hero: title + subtitle + 発行日 + verdict badge + _sanitized note */}
        <ArticleHero
          title={title}
          subtitle={subtitle}
          ticker={ticker}
          published_at={published_at}
          verdict={article.verdict}
          _sanitized={sanitized}
        />

        {/* 本文: react-markdown + sanitize + 中間 CTA (v116 R6 ticker 渡し) */}
        <ArticleBody
          bodyMd={body_md}
          onSanitized={handleSanitized}
          ticker={ticker}
        />

        {/* 出典リスト */}
        <ArticleCitations citations={citations} />

        {/* v116 user dogfood + QA dogfooder 案 2: 記事末 ticker 特化 CTA */}
        {/*   - 「読み終わったら次行動へ」 5 原則 4 + 5 原則 2 (毎日開きたくなる) */}
        {/*   - href は /?ticker=<TICKER> で App.jsx の useEffect 経由 runAnalyze 起動 */}
        {ticker && (
          <aside
            className="article-cta"
            data-testid="article-cta"
            aria-label={`${ticker} を BeatScanner で詳しく見る`}
          >
            <a
              href={`/?ticker=${encodeURIComponent(ticker)}`}
              className="article-cta__button"
            >
              <span className="article-cta__main">
                <strong className="article-cta__ticker">{ticker}</strong>
                <span className="article-cta__label">の決算詳細を BeatScanner で見る</span>
              </span>
              <span className="article-cta__arrow" aria-hidden="true">→</span>
            </a>
            <p className="article-cta__sub">ファンダメンタル 5 条件で BEAT 判定 + 過去 5 年の推移を即時確認</p>
          </aside>
        )}

        {/* フッター: トップへ戻るリンク */}
        <footer className="article-page__footer">
          <a href="/" className="article-page__back-link">
            ← BeatScanner トップへ
          </a>
        </footer>
      </div>
    </main>
    </ArticleErrorBoundary>
  );
}
