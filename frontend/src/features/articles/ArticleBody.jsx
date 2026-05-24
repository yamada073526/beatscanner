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

import { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sanitizeText } from '../../lib/blocklist.js';

// v116 R4: remark-gfm を有効化することで、 Markdown table syntax (| col |---| value |) を
// <table> として render する。 plugin なしでは | パイプ生テキストが <p> に落ちるブランド毀損バグ。
const REMARK_PLUGINS = [remarkGfm];

/**
 * v116 R6 (QA dogfooder P2): 比較表直後に挿入する中間 CTA component.
 * 記事末 CTA だけだと途中離脱読者に届かないため、 第 1 幕の表直後にも CTA を置く。
 * 末尾 CTA より控えめスタイル (text link 寄り、 gold accent border 1px) で重複感を回避。
 */
function MidArticleCTA({ ticker }) {
  if (!ticker) return null;
  return (
    <aside
      className="article-mid-cta"
      data-testid="article-mid-cta"
      aria-label={`${ticker} を BeatScanner で詳しく見る`}
    >
      <a
        href={`/?ticker=${encodeURIComponent(ticker)}`}
        className="article-mid-cta__link"
      >
        <span className="article-mid-cta__icon" aria-hidden="true">→</span>
        <span className="article-mid-cta__text">
          <strong>{ticker}</strong> の決算詳細・5 条件判定を見る
        </span>
      </a>
    </aside>
  );
}

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
 * v116 R6 (UI/UX P1): body 末尾の `## 投資家への含意` section を抽出し、
 *   ### 強気シナリオ / ### 弱気シナリオ / ### 推奨アクション の 3 H3 を構造化して返す。
 * frontend で 2 列 callout (緑/赤) + アクション full-width で render する。
 *
 * @param {string} md
 * @returns {{ before: string, implications: { bull: string, bear: string, action: string }|null }}
 */
function extractImplications(md) {
  if (!md || typeof md !== 'string') return { before: md || '', implications: null };
  // 「## 投資家への含意」 or 「## 含意」 を検出
  const headingRe = /^##\s*(?:投資家への含意|含意|まとめ|総括)\s*$/m;
  const headingMatch = headingRe.exec(md);
  if (!headingMatch) return { before: md, implications: null };
  const sectionStart = headingMatch.index;
  const before = md.slice(0, sectionStart).replace(/\n+$/, '');
  const sectionText = md.slice(sectionStart + headingMatch[0].length);
  // ### 強気シナリオ / 弱気シナリオ / 推奨アクション を抽出
  // 注: 末尾は次の ## が来るか EOF まで
  const nextH2 = /\n##\s/.exec(sectionText);
  const sectionBody = nextH2 ? sectionText.slice(0, nextH2.index) : sectionText;
  const extractH3 = (label) => {
    const re = new RegExp(
      `###\\s*${label}\\s*\\n([\\s\\S]*?)(?=\\n###\\s|$)`,
      'm',
    );
    const m = re.exec(sectionBody);
    return m ? m[1].trim() : '';
  };
  const bull = extractH3('強気(?:シナリオ)?');
  const bear = extractH3('弱気(?:シナリオ)?');
  const action = extractH3('推奨アクション|アクション|提案|推奨');
  // 1 つも見つからない場合は実装なしと判定 (旧 article 形式)
  if (!bull && !bear && !action) return { before: md, implications: null };
  return {
    before,
    implications: { bull, bear, action },
  };
}

/**
 * v116 R6: 投資家への含意 2 列 callout component.
 * 強気 (緑) + 弱気 (赤) を grid、 推奨アクション (gold) を full-width で render。
 */
function InvestorImplications({ bull, bear, action, components }) {
  return (
    <aside
      className="article-implications"
      data-testid="article-implications"
      aria-label="投資家への含意"
    >
      <h2 className="article-implications__heading">投資家への含意</h2>
      <div className="article-implications__grid">
        {bull && (
          <div
            className="article-implications__panel article-implications__panel--bull"
            data-testid="article-implications-bull"
          >
            <div className="article-implications__label">強気シナリオ</div>
            <div className="article-implications__body">
              <ReactMarkdown components={components} remarkPlugins={REMARK_PLUGINS}>
                {bull}
              </ReactMarkdown>
            </div>
          </div>
        )}
        {bear && (
          <div
            className="article-implications__panel article-implications__panel--bear"
            data-testid="article-implications-bear"
          >
            <div className="article-implications__label">弱気シナリオ</div>
            <div className="article-implications__body">
              <ReactMarkdown components={components} remarkPlugins={REMARK_PLUGINS}>
                {bear}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
      {action && (
        <div
          className="article-implications__action"
          data-testid="article-implications-action"
        >
          <div className="article-implications__label article-implications__label--action">推奨アクション</div>
          <div className="article-implications__body">
            <ReactMarkdown components={components} remarkPlugins={REMARK_PLUGINS}>
              {action}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </aside>
  );
}

/**
 * v116 (multi-review 3 体合議 verdict): body_md 冒頭の `## TL;DR\n- ...` section を
 * 抽出して別 component で render する。 残りの body は通常 ReactMarkdown で render。
 * 文字壁感緩和 + 2 秒把握スコア向上が目的。
 *
 * @param {string} md
 * @returns {{ tldr: Array<string>|null, rest: string }}
 */
function extractTLDR(md) {
  if (!md || typeof md !== 'string') return { tldr: null, rest: md || '' };
  // 「## TL;DR\n- ...\n- ...\n- ...」 を match (許容: TL;DR / TLDR / 要約)
  const match = md.match(/^##\s*(?:TL;DR|TLDR|要約|要点)\s*\n((?:[ \t]*-\s*.+\n?)+)/m);
  if (!match) return { tldr: null, rest: md };
  const items = match[1]
    .split('\n')
    .filter((line) => /^[ \t]*-\s/.test(line))
    .map((line) => line.replace(/^[ \t]*-\s*/, '').trim())
    .filter((item) => item.length > 0);
  if (items.length === 0) return { tldr: null, rest: md };
  const rest = md.replace(match[0], '').replace(/^\s*\n+/, '');
  return { tldr: items, rest };
}

/**
 * react-markdown の components で使用するカスタム renderer factory
 * onSanitized: sanitize で削除が発生した場合に呼ぶ callback
 */
function buildComponents(onSanitized, ticker, tableRenderedRef) {
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
    // v116 R6 (QA P2): 最初の table 直後に中間 CTA を挿入 (途中離脱読者向け導線)
    table({ children }) {
      const isFirstTable = tableRenderedRef && !tableRenderedRef.current;
      if (isFirstTable) tableRenderedRef.current = true;
      return (
        <>
          <div className="article-prose__table-wrapper">
            <table>{children}</table>
          </div>
          {isFirstTable && ticker && <MidArticleCTA ticker={ticker} />}
        </>
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
    //   - #cite-N (footnote): className で装飾 + aria-label (v116 R6 a11y、 UI/UX P3)
    a({ href, children }) {
      const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
      const isCitation = href && href.startsWith('#cite-');
      const isInternalStock = href && href.startsWith('/stock/');
      // v116 R6 a11y: citation [N] は VoiceOver で「かっこ 1 かっこ」 と読まれるだけだったため
      //   aria-label="出典 N を見る" を付与。 N は href の #cite-N から抽出。
      //   internal stock link は ticker 名 (children) が読み上げられるので追加不要。
      let ariaLabel;
      if (isCitation) {
        const m = /#cite-(\d+)/.exec(href);
        if (m) ariaLabel = `出典 ${m[1]} を見る`;
      }
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
          aria-label={ariaLabel}
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
export default function ArticleBody({ bodyMd, onSanitized, ticker }) {
  const handleSanitized = typeof onSanitized === 'function' ? onSanitized : () => {};
  // v116 R6: 最初の table 直後に中間 CTA を挿入するための tracker (再 render で reset しない)
  const tableRenderedRef = useRef(false);
  const components = buildComponents(handleSanitized, ticker, tableRenderedRef);

  // v116: TL;DR section を抽出して accent box で render、 残りは通常 ReactMarkdown
  const { tldr, rest: afterTldr } = extractTLDR(bodyMd);
  // v116 R6: 投資家への含意を抽出して 2 列 callout で render、 残りは通常 ReactMarkdown
  const { before: mainBody, implications } = extractImplications(afterTldr);

  // citation [N] を footnote anchor に前処理 (TL;DR + 本文どちらにも適用)
  const processedMain = preprocessMarkdownCitations(mainBody);
  const processedTldr = tldr
    ? tldr.map((item) => preprocessMarkdownCitations(item))
    : null;
  const processedImplications = implications
    ? {
        bull: preprocessMarkdownCitations(implications.bull),
        bear: preprocessMarkdownCitations(implications.bear),
        action: preprocessMarkdownCitations(implications.action),
      }
    : null;

  return (
    <div
      data-testid="article-body"
      className="article-prose"
    >
      {processedTldr && (
        <aside
          className="article-tldr"
          data-testid="article-tldr"
          aria-label="この記事の要点"
        >
          <div className="article-tldr__label">この記事の要点</div>
          <ul className="article-tldr__list">
            {processedTldr.map((item, i) => (
              <li key={i} className="article-tldr__item">
                <ReactMarkdown components={components}>{item}</ReactMarkdown>
              </li>
            ))}
          </ul>
        </aside>
      )}
      <ReactMarkdown components={components} remarkPlugins={REMARK_PLUGINS}>
        {processedMain}
      </ReactMarkdown>
      {processedImplications && (
        <InvestorImplications
          bull={processedImplications.bull}
          bear={processedImplications.bear}
          action={processedImplications.action}
          components={components}
        />
      )}
    </div>
  );
}
