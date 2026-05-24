/**
 * ArticleCitations.jsx — 記事末尾の出典リスト
 *
 * SPEC P3.2 DoD:
 *   - data-testid="article-citations" が DOM に存在
 *   - citations 0 件なら何も表示しない (safe)
 *   - design_system.md token のみ使用 (hex 直書き禁止)
 *
 * citations 型:
 *   { id: number, source_url: string, title: string }[]
 */

export default function ArticleCitations({ citations }) {
  // citations が空または未定義なら何も表示しない
  if (!Array.isArray(citations) || citations.length === 0) {
    return null;
  }

  return (
    <aside
      data-testid="article-citations"
      className="article-citations"
      aria-label="出典"
    >
      <h2 className="article-citations__heading">出典</h2>
      <ol className="article-citations__list">
        {citations.map((cite, idx) => {
          const id = cite.id ?? idx + 1;
          return (
            <li key={id} id={`cite-${id}`} className="article-citations__item">
              <span className="article-citations__num">[{id}]</span>
              {cite.source_url ? (
                <a
                  href={cite.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="article-citations__link"
                >
                  {cite.title || cite.source_url}
                </a>
              ) : (
                <span className="article-citations__text">
                  {cite.title || `出典 ${id}`}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
