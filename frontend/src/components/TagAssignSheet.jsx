import { useEffect } from 'react';
import { TAG_COLORS } from '../lib/tags.js';
import HoldingSection from './HoldingSection.jsx';

/**
 * 銘柄に対するアクション統合 bottom sheet (案 D 統合版)
 * - タグセクション: 既存タグから 1 つ選択 / タグなし / + 新規タグを作成・管理
 * - 保有セクション: 保有数 + 取得単価入力 (HoldingSection を inline 配置)
 *
 * クリック数削減: HoldingModal を廃止し、1 シート内ですべて完結 (5-6 click → 2-3 click)
 */
export default function TagAssignSheet({
  isOpen,
  ticker,
  tags,
  currentTagId,
  currentHolding,        // { shares, avg_cost } | null
  onClose,
  onAssign,
  onUnassign,
  onOpenManager,
  onSaveHolding,         // ({ shares, avgCost }) => Promise<void>
  onDeleteHolding,       // () => Promise<void>
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
          <h3>{ticker}</h3>
          <button onClick={onClose} className="modal-close" aria-label="閉じる">×</button>
        </div>

        <div className="bottom-sheet-body">
          {/* ── タグセクション ── */}
          <div className="action-sheet-section">
            <p className="action-sheet-section-label">🏷️ タグ</p>

            <button
              onClick={async () => { await onUnassign(); }}
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
                        onClick={async () => { await onAssign(tag.id); }}
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
          </div>

          {/* ── 保有セクション (案 D) ── */}
          {onSaveHolding && (
            <div className="action-sheet-section">
              <p className="action-sheet-section-label">💰 保有</p>
              <HoldingSection
                ticker={ticker}
                current={currentHolding}
                onSave={onSaveHolding}
                onDelete={onDeleteHolding}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
