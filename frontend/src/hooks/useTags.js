import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchTags as fetchTagsRemote,
  fetchAssignments as fetchAssignmentsRemote,
  createTag as createTagRemote,
  updateTag as updateTagRemote,
  deleteTag as deleteTagRemote,
  assignTag as assignTagRemote,
  unassignTag as unassignTagRemote,
} from '../lib/tags.js';

/**
 * タグ機能の状態管理 hook
 * - tags: Tag[]
 * - assignments: { [TICKER]: tag_id }
 * - tagsById: { [tag_id]: Tag } (memoized)
 * 楽観的更新: 各操作は local state を即更新 → backend → 失敗時 rollback
 */
export function useTags({ supabase, user }) {
  const [tags, setTags] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const loadedForUserRef = useRef(null);

  const tagsById = useMemo(() => {
    const m = {};
    for (const t of tags) m[t.id] = t;
    return m;
  }, [tags]);

  // 初回ロード（ユーザーログイン時）
  useEffect(() => {
    if (!supabase || !user?.id) {
      setTags([]);
      setAssignments({});
      loadedForUserRef.current = null;
      return;
    }
    if (loadedForUserRef.current === user.id) return;
    loadedForUserRef.current = user.id;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [tagsRows, asgnMap] = await Promise.all([
          fetchTagsRemote(supabase, user.id),
          fetchAssignmentsRemote(supabase, user.id),
        ]);
        if (!cancelled) {
          setTags(tagsRows);
          setAssignments(asgnMap);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, user?.id]);

  // ─── CRUD ─────────────────────────────────────────────

  const createTag = useCallback(async ({ name, color }) => {
    if (!supabase || !user?.id) throw new Error('ログインが必要です');
    // optimistic: 仮 id で即追加 → 失敗時に rollback
    const tempId = `temp-${Date.now()}`;
    const optimistic = { id: tempId, name: name.trim(), color, position: tags.length, _optimistic: true };
    setTags(prev => [...prev, optimistic]);
    try {
      const real = await createTagRemote(supabase, user.id, { name, color });
      setTags(prev => prev.map(t => (t.id === tempId ? real : t)));
      return real;
    } catch (e) {
      setTags(prev => prev.filter(t => t.id !== tempId));
      throw e;
    }
  }, [supabase, user?.id, tags.length]);

  const updateTag = useCallback(async (tagId, updates) => {
    const prev = tags.find(t => t.id === tagId);
    if (!prev) throw new Error('タグが見つかりません');
    setTags(curr => curr.map(t => (t.id === tagId ? { ...t, ...updates } : t)));
    try {
      const real = await updateTagRemote(supabase, tagId, updates);
      setTags(curr => curr.map(t => (t.id === tagId ? real : t)));
      return real;
    } catch (e) {
      setTags(curr => curr.map(t => (t.id === tagId ? prev : t)));
      throw e;
    }
  }, [supabase, tags]);

  const deleteTag = useCallback(async (tagId) => {
    const prevTags = tags;
    const prevAssignments = assignments;
    setTags(curr => curr.filter(t => t.id !== tagId));
    // 関連割当も local state から除去（DB は CASCADE）
    setAssignments(curr => {
      const next = {};
      for (const [k, v] of Object.entries(curr)) if (v !== tagId) next[k] = v;
      return next;
    });
    try {
      await deleteTagRemote(supabase, tagId);
    } catch (e) {
      setTags(prevTags);
      setAssignments(prevAssignments);
      throw e;
    }
  }, [supabase, tags, assignments]);

  const assignTag = useCallback(async (ticker, tagId) => {
    if (!supabase || !user?.id) throw new Error('ログインが必要です');
    const prev = assignments[ticker];
    setAssignments(curr => ({ ...curr, [ticker]: tagId }));
    try {
      await assignTagRemote(supabase, user.id, ticker, tagId);
    } catch (e) {
      setAssignments(curr => {
        const next = { ...curr };
        if (prev) next[ticker] = prev;
        else delete next[ticker];
        return next;
      });
      throw e;
    }
  }, [supabase, user?.id, assignments]);

  const unassignTag = useCallback(async (ticker) => {
    if (!supabase || !user?.id) return;
    const prev = assignments[ticker];
    if (!prev) return;
    setAssignments(curr => {
      const next = { ...curr };
      delete next[ticker];
      return next;
    });
    try {
      await unassignTagRemote(supabase, user.id, ticker);
    } catch (e) {
      setAssignments(curr => ({ ...curr, [ticker]: prev }));
      throw e;
    }
  }, [supabase, user?.id, assignments]);

  // 銘柄が watchlist から削除されたとき local state を整合
  const removeAssignmentForTicker = useCallback((ticker) => {
    setAssignments(curr => {
      if (!(ticker in curr)) return curr;
      const next = { ...curr };
      delete next[ticker];
      return next;
    });
  }, []);

  return {
    tags,
    assignments,
    tagsById,
    loading,
    error,
    createTag,
    updateTag,
    deleteTag,
    assignTag,
    unassignTag,
    removeAssignmentForTicker,
  };
}
