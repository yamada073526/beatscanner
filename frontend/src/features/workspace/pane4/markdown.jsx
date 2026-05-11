/**
 * Pane 4 / Reading Room の Markdown 強化 helpers.
 *
 * - MD_COMPONENTS: ReactMarkdown に渡す renderer 集
 * - stripArticleTrailer: 記事末尾の trailer 行 (元記事誘導) を除去 (§round22)
 *
 * v65 §C-3 で Pane4Inspector.jsx から分離 (1158 → ~1000 行への第一段階).
 */

// ── §round17/21 Markdown 見出し補強 ──────────
//   backend SSE が一部見出しを `## ...` ではなく `**...**` (bold) または
//   句読点なしの短いプレーン段落として生成する。両ケースを ReactMarkdown の
//   p renderer で h3 に昇格させる.
const HEADING_STRONG_RE = /[。.!?…!?]/;
const HEADING_PLAIN_RE = /[。.!?…!?]/;

function _extractText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(_extractText).join('');
  if (typeof node === 'object' && node?.props?.children != null) {
    return _extractText(node.props.children);
  }
  return '';
}

/** §round22 記事末尾の trailer 行を除去. */
const TRAILER_PATTERNS = [
  /^---\s*元記事で続きを読む\s*$/i,
  /^---+\s*$/,
  /^={3,}\s*$/,
  /^元記事(で|を)(続き|全文).*/,
  /^続きは?元記事/,
  /^全文を読む/,
  /^Read (more|the full).*/i,
  /^Click here to.*/i,
];

export function stripArticleTrailer(text) {
  if (!text) return text;
  const lines = text.split('\n');
  let end = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (!t) { end = i; continue; }
    if (TRAILER_PATTERNS.some((re) => re.test(t))) { end = i; continue; }
    break;
  }
  return lines.slice(0, end).join('\n').trimEnd();
}

function isHeadingLike(children) {
  const arr = Array.isArray(children) ? children : [children];
  const meaningful = arr.filter((c) => {
    if (c == null) return false;
    if (typeof c === 'string') return c.trim().length > 0;
    return true;
  });
  if (meaningful.length !== 1) return null;
  const only = meaningful[0];
  if (typeof only === 'object' && only?.type === 'strong') {
    const text = _extractText(only).trim();
    if (!text) return null;
    if (text.length > 40) return null;
    if (HEADING_STRONG_RE.test(text)) return null;
    return text;
  }
  if (typeof only === 'string') {
    const text = only.trim();
    if (text.length < 4) return null;
    if (text.length > 45) return null;
    if (HEADING_PLAIN_RE.test(text)) return null;
    return text;
  }
  return null;
}

/** §round23 本文中の数値 / % / $ / ticker を inline 強調. */
const NUMBER_RE = /([+\-]?\$?\d[\d,]*\.?\d*\s?(?:%|兆ドル|億ドル|兆円|億円|円|ドル))/g;
const TICKER_RE = /\b(?:\^|\$)?[A-Z]{2,5}(?:\.[A-Z]+)?\b/g;
const TICKER_SKIP = new Set(['AI', 'CEO', 'IPO', 'ETF', 'GDP', 'CPI', 'PPI', 'FRB', 'ECB', 'BOJ', 'FOMC', 'NYSE', 'NASDAQ', 'SEC', 'M&A', 'GPU', 'CPU', 'FY', 'YoY', 'QoQ', 'EPS']);

function enhanceInlineText(text) {
  if (typeof text !== 'string') return text;
  const parts = [];
  let lastEnd = 0;
  const numMatches = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    numMatches.push({ start: m.index, end: m.index + m[0].length, text: m[0], kind: 'num' });
  }
  const tickerMatches = [];
  for (const m of text.matchAll(TICKER_RE)) {
    if (TICKER_SKIP.has(m[0].replace(/[\^$]/, ''))) continue;
    if (m[0].length < 2) continue;
    tickerMatches.push({ start: m.index, end: m.index + m[0].length, text: m[0], kind: 'ticker' });
  }
  const all = [...numMatches, ...tickerMatches]
    .sort((a, b) => a.start - b.start)
    .reduce((acc, cur) => {
      if (acc.length && acc[acc.length - 1].end > cur.start) return acc;
      acc.push(cur);
      return acc;
    }, []);
  if (all.length === 0) return text;
  for (const m of all) {
    if (m.start > lastEnd) parts.push(text.slice(lastEnd, m.start));
    if (m.kind === 'num') {
      const isPos = /^\+/.test(m.text);
      const isNeg = /^-/.test(m.text);
      const cls = isPos ? 'longform-num pos' : isNeg ? 'longform-num neg' : 'longform-num';
      parts.push(<span key={`${m.start}-${m.kind}`} className={cls}>{m.text}</span>);
    } else {
      parts.push(<span key={`${m.start}-${m.kind}`} className="longform-ticker">{m.text}</span>);
    }
    lastEnd = m.end;
  }
  if (lastEnd < text.length) parts.push(text.slice(lastEnd));
  return parts;
}

function patchChildren(children) {
  if (typeof children === 'string') return enhanceInlineText(children);
  if (!Array.isArray(children)) return children;
  return children.flatMap((c) => {
    if (typeof c === 'string') {
      const out = enhanceInlineText(c);
      return Array.isArray(out) ? out : [out];
    }
    return [c];
  });
}

export const MD_COMPONENTS = {
  p: ({ children, node, ...rest }) => {
    const heading = isHeadingLike(children);
    if (heading) {
      // §v66 user feedback: 原文 h2 → 翻訳 h3 ダウングレード問題の対策で h2 に揃える.
      // backend prompt も「## 見出しは ## のまま」と明示済 (二重防御).
      return <h2 {...rest}>{heading}</h2>;
    }
    return <p {...rest}>{patchChildren(children)}</p>;
  },
  li: ({ children, node, ...rest }) => <li {...rest}>{patchChildren(children)}</li>,
};
