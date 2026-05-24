/**
 * ArticleBody.jsx — Markdown renderer + Hallucination Guard 第 3 層 sanitize
 *
 * SPEC P3.2:
 *   - data-testid="article-body" が DOM に存在
 *   - react-markdown (既存 manualChunks 'markdown' chunk) を流用
 *   - sanitizeText() を全 paragraph / list item / heading に適用 (P3.5 で完全組込、 P3.2 では基盤を用意)
 *   - citation [N] を footnote anchor リンクに変換 (ArticleCitations と連携)
 *   - design_system.md token のみ使用 (.article-prose 経由)
 *
 * Hallucination Guard 第 3 層:
 *   - BAD-5 断定的将来予測 (金商法 §38) / BAD-6 最上級表現 (景表法 §5) の sentence 単位削除
 *   - sanitizeText は blocklist.js から import (BLOCKLIST_PATTERNS を直接変更しない)
 *   - 削除が発生した場合、 onSanitized callback で ArticlePage に通知 (_sanitized flag)
 *
 * memory anchors:
 *   - feedback_diagram_quality_guard.md (BAD 1-6 SSOT)
 *   - feedback_citation_required.md (景表法/金商法 anchor)
 */

import ReactMarkdown from 'react-markdown';
import { sanitizeText } from '../../lib/blocklist.js';

/**
 * Markdown 本文中の [N] を footnote anchor リンクに変換する前処理
 * 例: 「売上高 [1]」 → 「売上高 <a href="#cite-1">[1]</a>」
 * react-markdown の remarkPlugins でなく string 置換で実装 (plugin dep 追加なし)
 */
function preprocessMarkdownCitations(md) {
  if (!md || typeof md !== 'string') return md || '';
  // [数字] パターンを anchor に置換 (inline HTML は react-markdown が許可)
  return md.replace(/\[(\d+)\]/g, (_, n) => `[[${n}]](#cite-${n})`);
}

/**
 * react-markdown の components で使用するカスタム renderer factory
 * onSanitized: sanitize で削除が発生した場合に呼ぶ callback
 */
function buildComponents(onSanitized) {
  /**
   * children の text 内容を sanitize し、 違反 sentence を削除して返す。
   * 削除が発生した場合は onSanitized() を呼ぶ。
   */
  function sanitizeChildren(children) {
    if (!children) return children;
    // children が string の場合
    if (typeof children === 'string') {
      const result = sanitizeText(children);
      if (result !== children) onSanitized();
      return result;
    }
    // children が配列の場合 (inline markdown)
    if (Array.isArray(children)) {
      return children.map((child) => {
        if (typeof child === 'string') {
          const result = sanitizeText(child);
          if (result !== child) onSanitized();
          return result;
        }
        return child;
      });
    }
    return children;
  }

  return {
    // paragraph: sanitize + null check (削除された場合は何も表示しない)
    p({ children }) {
      const sanitized = sanitizeChildren(children);
      if (!sanitized && sanitized !== 0) return null;
      return <p>{sanitized}</p>;
    },

    // list item: sanitize
    li({ children }) {
      const sanitized = sanitizeChildren(children);
      return <li>{sanitized}</li>;
    },

    // heading (h1〜h6): sanitize + Noto Serif JP は .article-prose CSS で適用
    h1({ children }) {
      return <h1>{sanitizeChildren(children)}</h1>;
    },
    h2({ children }) {
      return <h2>{sanitizeChildren(children)}</h2>;
    },
    h3({ children }) {
      return <h3>{sanitizeChildren(children)}</h3>;
    },
    h4({ children }) {
      return <h4>{sanitizeChildren(children)}</h4>;
    },

    // blockquote: そのまま (引用は製作者の意図を尊重)
    blockquote({ children }) {
      return <blockquote>{children}</blockquote>;
    },

    // code block: サニタイズ不要 (コードは BAD-5/6 が誤検知する恐れがある)
    code({ inline, className, children }) {
      if (inline) {
        return <code className={className}>{children}</code>;
      }
      return (
        <pre className={className ? `language-${className.replace('language-', '')}` : ''}>
          <code className={className}>{children}</code>
        </pre>
      );
    },

    // table 系: そのまま (数値 table は BAD-5/6 対象外)
    table({ children }) {
      return (
        <div className="article-prose__table-wrapper">
          <table>{children}</table>
        </div>
      );
    },
    thead({ children }) { return <thead>{children}</thead>; },
    tbody({ children }) { return <tbody>{children}</tbody>; },
    tr({ children }) { return <tr>{children}</tr>; },
    th({ children }) { return <th>{children}</th>; },
    td({ children }) { return <td>{children}</td>; },

    // anchor:
    //   - 外部リンク (http/https): target="_blank" + rel="noopener noreferrer"
    //   - /stock/<TICKER> (P3.7 internal link): rel="noopener" のみ (same-origin)
    //   - #cite-N (footnote): className で装飾
    a({ href, children }) {
      const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
      const isCitation = href && href.startsWith('#cite-');
      const isInternalStock = href && href.startsWith('/stock/');
      return (
        <a
          href={href}
          target={isExternal && !isCitation ? '_blank' : undefined}
          rel={
            isExternal && !isCitation ? 'noopener noreferrer'
            : isInternalStock ? 'noopener'
            : undefined
          }
          className={isCitation ? 'article-prose__cite-link' : undefined}
        >
          {children}
        </a>
      );
    },
  };
}

/**
 * ArticleBody
 *
 * @param {string} bodyMd       - Markdown 本文
 * @param {Function} onSanitized - sanitize で削除が発生したときの callback
 */
export default function ArticleBody({ bodyMd, onSanitized }) {
  const handleSanitized = typeof onSanitized === 'function' ? onSanitized : () => {};
  const components = buildComponents(handleSanitized);

  // citation [N] を footnote anchor に前処理
  const processedMd = preprocessMarkdownCitations(bodyMd);

  return (
    <div
      data-testid="article-body"
      className="article-prose"
    >
      <ReactMarkdown components={components}>
        {processedMd}
      </ReactMarkdown>
    </div>
  );
}
