import { useEffect } from 'react';
import { TAG_COLORS } from '../lib/tags.js';

/**
 * 銘柄にタグを割り当てる bottom sheet
 * - 既存タグ一覧から 1 つ選択 → assignTag
 * - 「タグなし」選択 → unassignTag
 * - 「+ 新規タグ」→ TagManagerModal を開く
 */
export default function TagAssignSheet({
  isOpen,
  ticker,
  tags,
  currentTagId,
  currentHolding,      // { shares, avg_cost } | null  (Holdings X-2)
  onClose,
  onAssign,
  onUnassign,
  onOpenManager,
  onOpenHolding,       // () => void  (Holdings X-2)
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="bottom-sheet-backdrop" onClick={onClose}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="bottom-sheet-handle" />
        <div className="bottom-sheet-header">
          <h3>{ticker} のタグ</h3>
          <button onClick={onClose} className="modal-close" aria-label="閉じる">×</button>
        </div>

        <div className="bottom-sheet-body">
          <button
            onClick={async () => { await onUnassign(); onClose(); }}
            className={`tag-assign-row ${!currentTagId ? 'selected' : ''}`}
          >
            <span className="tag-assign-dot tag-assign-dot-empty" />
            <span className="tag-assign-name">タグなし</span>
            {!currentTagId && <span className="tag-assign-check">✓</span>}
          </button>

          {tags.length === 0 ? (
            <p className="tag-assign-empty">
              タグはまだ作成されていません。
            </p>
          ) : (
            <ul className="tag-assign-list">
              {tags.map((tag) => {
                const isSelected = currentTagId === tag.id;
                return (
                  <li key={tag.id}>
                    <button
                      onClick={async () => { await onAssign(tag.id); onClose(); }}
                      className={`tag-assign-row ${isSelected ? 'selected' : ''}`}
                    >
                      <span
                        className="tag-assign-dot"
                        style={{ backgroundColor: TAG_COLORS[tag.color]?.hex }}
                      />
                      <span className="tag-assign-name">{tag.name}</span>
                      {isSelected && <span className="tag-assign-check">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <button
            onClick={() => { onClose(); onOpenManager(); }}
            className="tag-assign-manage"
          >
            + 新規タグを作成・管理
          </button>

          {onOpenHolding && (
            <button
              onClick={() => { onClose(); onOpenHolding(); }}
              className="tag-assign-holding"
            >
              {currentHolding ? (
                <>
                  <span className="tag-assign-holding-icon">💰</span>
                  <span className="tag-assign-holding-text">
                    保有: {Number(currentHolding.shares).toLocaleString()} 株 @ ${Number(currentHolding.avg_cost).toFixed(2)}
                  </span>
                  <span className="tag-assign-holding-edit">編集</span>
                </>
              ) : (
                <>
                  <span className="tag-assign-holding-icon">💰</span>
                  <span className="tag-assign-holding-text">保有を入力</span>
                  <span className="tag-assign-holding-edit">→</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
