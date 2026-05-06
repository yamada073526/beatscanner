// Y-3 Phase A: 通知設定 (user_notification_preferences) の Supabase 操作ヘルパ
// 既存 lib/holdings.js / lib/tags.js と同じパターン (RLS で守られている前提)

const PREF_FIELDS = `
  user_id,
  email_enabled, email_address,
  line_enabled, line_user_id,
  webhook_enabled, webhook_url, webhook_type,
  earnings_alerts, daily_brief,
  created_at, updated_at
`.trim().replace(/\s+/g, ' ');

// デフォルト設定 (まだ DB に行がないユーザー用)
export function getDefaultPreferences() {
  return {
    email_enabled: false,
    email_address: '',
    line_enabled: false,
    line_user_id: '',
    webhook_enabled: false,
    webhook_url: '',
    webhook_type: 'slack',
    earnings_alerts: true,
    daily_brief: false,
  };
}

export async function fetchPreferences(supabase, userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from('user_notification_preferences')
    .select(PREF_FIELDS)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[notifications] fetch failed', error);
    return null;
  }
  return data;
}

// upsert (PK = user_id なので ON CONFLICT で merge される)
export async function savePreferences(supabase, userId, patch) {
  if (!supabase || !userId) throw new Error('Supabase or userId missing');
  const row = {
    user_id: userId,
    ...patch,
  };
  // 不要フィールド (undefined) は除外
  for (const k of Object.keys(row)) {
    if (row[k] === undefined) delete row[k];
  }
  const { data, error } = await supabase
    .from('user_notification_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select(PREF_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

// バリデーション (UI 側で表示する用)
// returns { ok: bool, errors: { [fieldName]: string } }
export function validatePreferences(prefs) {
  const errors = {};
  if (prefs.email_enabled) {
    const e = (prefs.email_address || '').trim();
    if (!e) errors.email_address = 'メールアドレスを入力してください';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) errors.email_address = '正しいメールアドレスを入力してください';
  }
  if (prefs.webhook_enabled) {
    const u = (prefs.webhook_url || '').trim();
    if (!u) errors.webhook_url = 'Webhook URL を入力してください';
    else if (!/^https?:\/\//.test(u)) errors.webhook_url = 'http(s):// で始まる URL を入力してください';
  }
  if (prefs.line_enabled) {
    if (!(prefs.line_user_id || '').trim()) errors.line_user_id = 'LINE userId を入力してください (Phase C で連携手順を提供予定)';
  }
  if (!prefs.earnings_alerts && !prefs.daily_brief) {
    // どちらかは ON にしないと意味がない
    errors._global = '通知トリガを 1 つ以上選択してください';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}
