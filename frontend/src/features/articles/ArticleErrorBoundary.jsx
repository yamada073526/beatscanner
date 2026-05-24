/**
 * ArticleErrorBoundary.jsx — Article 専用 React Error Boundary
 *
 * v116 R4 frontend architect verdict P1:
 *   - ArticlePage 内で react-markdown のパースエラーや sanitizeText の regex 例外が throw されると
 *     <Suspense> は受け取れずアプリ全体が白画面になる
 *   - 他 component (ChartTab / ConditionSparkline) は既に ErrorBoundary 実装済、 記事だけ抜けていた
 *
 * 動作:
 *   - エラー発生時に「準備中」 fallback UI を表示 (Trust Cliff 防止: 404 や白画面でなく Suggestion)
 *   - Sentry が有効ならエラーを 1 度だけ報告 (componentDidCatch)
 *
 * memory anchors:
 *   - feedback_chart_overlay_safety.md (v75 真っ白事故の 4 層防御パターン)
 */

import { Component } from 'react';

export default class ArticleErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Sentry 等の external reporter があれば 1 回だけ通知
    try {
      if (typeof window !== 'undefined' && window.Sentry?.captureException) {
        window.Sentry.captureException(error, {
          tags: { boundary: 'article' },
          extra: { componentStack: errorInfo?.componentStack },
        });
      }
    } catch {
      // reporter failure を握り潰す (fallback UI 表示優先)
    }
    // console は本番ではログ collector に届く
    // eslint-disable-next-line no-console
    console.error('[ArticleErrorBoundary] caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="article-page article-page--notfound"
          role="alert"
          data-testid="article-error-boundary"
        >
          <div className="article-page__notfound-inner">
            <h1 className="article-page__notfound-title">記事の表示でエラーが発生しました</h1>
            <p className="article-page__notfound-body">
              一時的な問題の可能性があります。 ページを再読み込みするか、 しばらくしてからお試しください。
            </p>
            <a href="/" className="article-page__back-link">
              トップへ戻る
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
