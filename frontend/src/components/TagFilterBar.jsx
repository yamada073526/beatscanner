import TagPill from './TagPill.jsx';

/**
 * ウォッチリスト上部のフィルタ pill bar
 * 「すべて | タグなし | [タグ1] [タグ2] ... | + 管理」を横スクロール 1 行で表示
 */
export default function TagFilterBar({
  tags,
  assignments,
  totalCount,
  selectedFilter,           // 'all' | 'untagged' | tagId
  onSelectFilter,
  onOpenManager,
}) {
  const untaggedCount = totalCount - Object.keys(assignments).length;

  // タグごとの件数（assignments 値の出現数）
  const tagCounts = {};
  for (const tagId of Object.values(assignments)) {
    tagCounts[tagId] = (tagCounts[tagId] || 0) + 1;
  }

  return (
    <div className="tag-filter-bar" role="toolbar" aria-label="タグフィルタ">
      <span className="tag-filter-prefix" aria-hidden="true">タグ</span>
      <button
        type="button"
        onClick={() => onSelectFilter('all')}
        className={`tag-filter-pill ${selectedFilter === 'all' ? 'selected' : ''}`}
      >
        すべて <span className="tag-filter-count">{totalCount}</span>
      </button>

      {(untaggedCount > 0 || tags.length > 0) && (
        <button
          type="button"
          onClick={() => onSelectFilter('untagged')}
          className={`tag-filter-pill ${selectedFilter === 'untagged' ? 'selected' : ''}`}
        >
          タグなし <span className="tag-filter-count">{untaggedCount}</span>
        </button>
      )}

      {tags.map((tag) => (
        <TagPill
          key={tag.id}
          tag={tag}
          selected={selectedFilter === tag.id}
          count={tagCounts[tag.id] || 0}
          onClick={() => onSelectFilter(tag.id)}
        />
      ))}

      <button
        type="button"
        onClick={onOpenManager}
        className="tag-filter-manage"
        aria-label="タグを管理"
      >
        {tags.length === 0 ? '+ タグを作成' : '+ 管理'}
      </button>
    </div>
  );
}
