// タグ機能の Supabase 操作ヘルパ
// MVP: 1 銘柄 = 1 タグ（UI 側で保証、スキーマは多対多）

export const TAG_COLORS = {
  cyan:   { hex: '#22d3ee', label: 'シアン' },
  green:  { hex: '#34ef81', label: 'グリーン' },
  amber:  { hex: '#f59e0b', label: 'アンバー' },
  violet: { hex: '#a78bfa', label: 'バイオレット' },
};

export const TAG_COLOR_KEYS = Object.keys(TAG_COLORS);
export const MAX_TAGS_PER_USER = 8;
export const MAX_TAG_NAME_LENGTH = 30;

export function getTagColorHex(colorKey) {
  return TAG_COLORS[colorKey]?.hex || TAG_COLORS.cyan.hex;
}

// ─── tags テーブル CRUD ──────────────────────────────────────────

export async function fetchTags(supabase, userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from('tags')
    .select('id, name, color, position, created_at')
    .eq('user_id', userId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[tags] fetch failed', error);
    return [];
  }
  return data || [];
}

export async function createTag(supabase, userId, { name, color }) {
  if (!supabase || !userId) throw new Error('Supabase or userId missing');
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('タグ名を入力してください');
  if (trimmed.length > MAX_TAG_NAME_LENGTH) throw new Error(`タグ名は ${MAX_TAG_NAME_LENGTH} 文字以内で入力してください`);
  if (!TAG_COLOR_KEYS.includes(color)) throw new Error('無効な色です');

  const { data, error } = await supabase
    .from('tags')
    .insert({ user_id: userId, name: trimmed, color })
    .select('id, name, color, position, created_at')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('同じ名前のタグが既に存在します');
    throw error;
  }
  return data;
}

export async function updateTag(supabase, tagId, { name, color }) {
  if (!supabase || !tagId) throw new Error('Supabase or tagId missing');
  const updates = {};
  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('タグ名を入力してください');
    if (trimmed.length > MAX_TAG_NAME_LENGTH) throw new Error(`タグ名は ${MAX_TAG_NAME_LENGTH} 文字以内で入力してください`);
    updates.name = trimmed;
  }
  if (color !== undefined) {
    if (!TAG_COLOR_KEYS.includes(color)) throw new Error('無効な色です');
    updates.color = color;
  }
  const { data, error } = await supabase
    .from('tags')
    .update(updates)
    .eq('id', tagId)
    .select('id, name, color, position, created_at')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('同じ名前のタグが既に存在します');
    throw error;
  }
  return data;
}

export async function deleteTag(supabase, tagId) {
  if (!supabase || !tagId) throw new Error('Supabase or tagId missing');
  // watchlist_tags の関連 row は ON DELETE CASCADE で自動削除される
  const { error } = await supabase
    .from('tags')
    .delete()
    .eq('id', tagId);
  if (error) throw error;
}

// ─── watchlist_tags 割当 ──────────────────────────────────────────

// 全銘柄のタグ割当を { TICKER: tag_id } の形で返す（MVP: 1:1 想定）
export async function fetchAssignments(supabase, userId) {
  if (!supabase || !userId) return {};
  const { data, error } = await supabase
    .from('watchlist_tags')
    .select('ticker, tag_id')
    .eq('user_id', userId);
  if (error) {
    console.error('[tags] fetchAssignments failed', error);
    return {};
  }
  const map = {};
  for (const row of data || []) {
    map[row.ticker] = row.tag_id;
  }
  return map;
}

// 銘柄にタグを割当（MVP: 既存割当を delete してから insert で 1:1 を保証）
export async function assignTag(supabase, userId, ticker, tagId) {
  if (!supabase || !userId || !ticker || !tagId) throw new Error('required args missing');
  // 既存割当を削除（複数タグでも全削除）
  await supabase
    .from('watchlist_tags')
    .delete()
    .eq('user_id', userId)
    .eq('ticker', ticker);
  // 新規 insert
  const { error } = await supabase
    .from('watchlist_tags')
    .insert({ user_id: userId, ticker, tag_id: tagId });
  if (error) throw error;
}

// 銘柄からタグを解除
export async function unassignTag(supabase, userId, ticker) {
  if (!supabase || !userId || !ticker) throw new Error('required args missing');
  const { error } = await supabase
    .from('watchlist_tags')
    .delete()
    .eq('user_id', userId)
    .eq('ticker', ticker);
  if (error) throw error;
}

// 銘柄が watchlist から削除されたとき、関連の tag 割当も削除
// （ON DELETE CASCADE は user 削除時のみ働くので、ticker 単位は手動）
export async function cleanupAssignmentsForTicker(supabase, userId, ticker) {
  return unassignTag(supabase, userId, ticker);
}
