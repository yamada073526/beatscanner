import TagPill from './TagPill.jsx';

/**
 * ウォッチリスト上部のフィルタ pill bar (案 C)
 * 並び: 「タグ | [タグ1] [タグ2] ... | + 管理 | タグなし(末尾・低明度)」
 * - 「すべて」pill 廃止 (Notion 暗黙化): 未選択 = 全件
 * - active pill 再クリックで解除 (toggle off → 'all')
 * - 「タグなし」は末尾 + 低明度で「メンテ用フィルタ」と暗黙伝達
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

  // active pill 再クリックで 'all' に戻す toggle ヘルパ
  const handleClick = (id) => {
    onSelectFilter(selectedFilter === id ? 'all' : id);
  };

  const showUntagged = untaggedCount > 0 || tags.length > 0;

  return (
    <div className="tag-filter-bar" role="toolbar" aria-label="タグフィルタ">
      <span className="tag-filter-prefix" aria-hidden="true">タグ</span>

      {tags.map((tag) => (
        <TagPill
          key={tag.id}
          tag={tag}
          selected={selectedFilter === tag.id}
          count={tagCounts[tag.id] || 0}
          onClick={() => handleClick(tag.id)}
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

      {showUntagged && (
        <button
          type="button"
          onClick={() => handleClick('untagged')}
          className={`tag-filter-pill tag-filter-untagged ${selectedFilter === 'untagged' ? 'selected' : ''}`}
          aria-pressed={selectedFilter === 'untagged'}
          title={selectedFilter === 'untagged' ? 'クリックして解除' : '未分類銘柄のみ表示'}
        >
          タグなし <span className="tag-filter-count">{untaggedCount}</span>
        </button>
      )}
    </div>
  );
}
