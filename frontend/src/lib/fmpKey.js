const STORAGE_KEY = 'fmp-api-key-v1';

// ── localStorage 専用の同期 API（既存）─────────────────────────────────────
// api.js / planGating.js / App.jsx (hasFmpKey) から毎リクエスト同期で呼ばれるため、
// async 化は破壊的変更となる。Supabase 同期は別の async 関数で行う。

export function getFmpKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setFmpKey(key) {
  try {
    if (key) {
      localStorage.setItem(STORAGE_KEY, key);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable
  }
}

export function hasFmpKey() {
  return !!getFmpKey();
}

export function getMaskedKey() {
  const key = getFmpKey();
  if (!key || key.length < 4) return null;
  return '****' + key.slice(-4).toUpperCase();
}

// ── Supabase クラウド同期 API（async・新規）──────────────────────────────
// テーブル: user_settings (user_id PK, fmp_api_key text, updated_at timestamptz)
// RLS有効・authenticated に全権限付与済み。

async function _getUser(supabase) {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user || null;
  } catch {
    return null;
  }
}

/**
 * APIキーを localStorage に保存し、ログイン済みなら Supabase にも upsert。
 * 戻り値: { synced: boolean } — Supabase 同期が成功したかどうか。
 */
export async function saveFmpKey(key, supabase) {
  setFmpKey(key);
  const user = await _getUser(supabase);
  if (!user) return { synced: false };
  try {
    const { error } = await supabase
      .from('user_settings')
      .upsert(
        {
          user_id: user.id,
          fmp_api_key: key,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    if (error) {
      console.error('[fmpKey] supabase upsert failed:', error);
      return { synced: false };
    }
    return { synced: true };
  } catch (e) {
    console.error('[fmpKey] supabase upsert exception:', e);
    return { synced: false };
  }
}

/**
 * APIキーを取得する。優先順位:
 *  1. ログイン済みなら Supabase から取得（成功時 localStorage にもミラー）
 *  2. 未ログイン or 取得失敗時は localStorage から
 * 戻り値: 文字列（空なら未設定）
 */
export async function loadFmpKey(supabase) {
  const user = await _getUser(supabase);
  if (!user) return getFmpKey();
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('fmp_api_key')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.error('[fmpKey] supabase select failed:', error);
      return getFmpKey();
    }
    const remote = data?.fmp_api_key || '';
    if (remote) {
      // オフライン対応: ローカルにミラーして以後の同期 getter で読めるようにする
      setFmpKey(remote);
      return remote;
    }
    // リモートが空ならローカル値を返す（端末初回ログイン時にローカルキーを優先したい場合に備える）
    return getFmpKey();
  } catch (e) {
    console.error('[fmpKey] supabase select exception:', e);
    return getFmpKey();
  }
}

/**
 * APIキーを localStorage からクリアし、ログイン済みなら Supabase の値も null に更新。
 * 戻り値: { synced: boolean }
 */
export async function clearFmpKey(supabase) {
  setFmpKey('');
  const user = await _getUser(supabase);
  if (!user) return { synced: false };
  try {
    const { error } = await supabase
      .from('user_settings')
      .update({ fmp_api_key: null, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (error) {
      console.error('[fmpKey] supabase clear failed:', error);
      return { synced: false };
    }
    return { synced: true };
  } catch (e) {
    console.error('[fmpKey] supabase clear exception:', e);
    return { synced: false };
  }
}
