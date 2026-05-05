import { useEffect, useState } from 'react';
import { TAG_COLORS, TAG_COLOR_KEYS, MAX_TAGS_PER_USER, MAX_TAG_NAME_LENGTH } from '../lib/tags.js';

/**
 * タグ管理モーダル
 * - 既存タグ一覧（rename / 色変更 / 削除）
 * - 新規作成フォーム
 */
export default function TagManagerModal({ isOpen, onClose, tags, onCreate, onUpdate, onDelete }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('cyan');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState('cyan');
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setCreating(false);
      setNewName('');
      setNewColor('cyan');
      setEditingId(null);
      setPendingDeleteId(null);
      setErrorMsg('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const reachedLimit = tags.length >= MAX_TAGS_PER_USER;

  async function handleCreate() {
    if (!newName.trim()) return;
    setErrorMsg('');
    try {
      await onCreate({ name: newName, color: newColor });
      setNewName('');
      setNewColor('cyan');
      setCreating(false);
    } catch (e) {
      setErrorMsg(e?.message || 'タグの作成に失敗しました');
    }
  }

  function startEdit(tag) {
    setEditingId(tag.id);
    setEditingName(tag.name);
    setEditingColor(tag.color);
    setErrorMsg('');
  }

  async function handleUpdate() {
    if (!editingName.trim()) return;
    setErrorMsg('');
    try {
      await onUpdate(editingId, { name: editingName, color: editingColor });
      setEditingId(null);
    } catch (e) {
      setErrorMsg(e?.message || 'タグの更新に失敗しました');
    }
  }

  async function handleDelete(tagId) {
    setErrorMsg('');
    try {
      await onDelete(tagId);
      setPendingDeleteId(null);
    } catch (e) {
      setErrorMsg(e?.message || 'タグの削除に失敗しました');
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel tag-manager-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>タグを管理</h2>
          <button onClick={onClose} className="modal-close" aria-label="閉じる">×</button>
        </div>

        <div className="modal-body">
          {tags.length === 0 && !creating && (
            <p className="tag-manager-empty">
              タグはまだ作成されていません。<br />
              「+ 新規作成」でタグを追加できます。
            </p>
          )}

          {tags.length > 0 && (
            <ul className="tag-list">
              {tags.map((tag) => (
                <li key={tag.id} className="tag-list-item">
                  {editingId === tag.id ? (
                    <div className="tag-edit-form">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        maxLength={MAX_TAG_NAME_LENGTH}
                        autoFocus
                      />
                      <ColorPicker selected={editingColor} onSelect={setEditingColor} />
                      <div className="tag-edit-actions">
                        <button onClick={() => setEditingId(null)} className="btn-ghost">キャンセル</button>
                        <button onClick={handleUpdate} className="btn-primary">保存</button>
                      </div>
                    </div>
                  ) : pendingDeleteId === tag.id ? (
                    <div className="tag-delete-confirm">
                      <p>「{tag.name}」を削除しますか？<br /><span className="muted">割り当てた銘柄からも解除されます。</span></p>
                      <div className="tag-edit-actions">
                        <button onClick={() => setPendingDeleteId(null)} className="btn-ghost">キャンセル</button>
                        <button onClick={() => handleDelete(tag.id)} className="btn-danger">削除する</button>
                      </div>
                    </div>
                  ) : (
                    <div className="tag-row">
                      <span className="tag-row-dot" style={{ backgroundColor: TAG_COLORS[tag.color]?.hex }} />
                      <span className="tag-row-name">{tag.name}</span>
                      <button onClick={() => startEdit(tag)} className="btn-icon" aria-label="編集">編集</button>
                      <button onClick={() => setPendingDeleteId(tag.id)} className="btn-icon btn-icon-danger" aria-label="削除">削除</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {creating ? (
            <div className="tag-create-form">
              <input
                type="text"
                placeholder="タグ名（例: 検討中）"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={MAX_TAG_NAME_LENGTH}
                autoFocus
              />
              <ColorPicker selected={newColor} onSelect={setNewColor} />
              <div className="tag-edit-actions">
                <button onClick={() => { setCreating(false); setNewName(''); }} className="btn-ghost">キャンセル</button>
                <button onClick={handleCreate} className="btn-primary" disabled={!newName.trim()}>作成</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              disabled={reachedLimit}
              className="tag-create-trigger"
            >
              {reachedLimit ? `+ タグは最大 ${MAX_TAGS_PER_USER} 個まで` : '+ 新規作成'}
            </button>
          )}

          {errorMsg && <p className="tag-error">{errorMsg}</p>}
        </div>
      </div>
    </div>
  );
}

function ColorPicker({ selected, onSelect }) {
  return (
    <div className="color-picker">
      {TAG_COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          aria-label={TAG_COLORS[key].label}
          className={`color-swatch ${selected === key ? 'selected' : ''}`}
          style={{ backgroundColor: TAG_COLORS[key].hex }}
        />
      ))}
    </div>
  );
}
