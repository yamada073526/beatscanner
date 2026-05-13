// Accounts (口座) Supabase 操作ヘルパ
// schema SSOT: memory/portfolio_account_schema.md (handover v68)
// migration: docs/migrations/2026-05-14_portfolio_phase1_v68.sql

export const ACCOUNT_TYPES = [
  { value: 'tokutei',         label: '特定口座' },
  { value: 'ippan',           label: '一般口座' },
  { value: 'nisa_growth',     label: 'NISA 成長投資枠' },
  { value: 'nisa_tsumitate',  label: 'NISA つみたて枠' },
  { value: 'foreign',         label: '海外口座' },
  { value: 'cash',            label: '現物 (汎用)' },
  { value: 'other',           label: 'その他' },
];

export const ACCOUNT_TYPE_LABEL = Object.fromEntries(
  ACCOUNT_TYPES.map((x) => [x.value, x.label])
);

export const SUPPORTED_CURRENCIES = ['USD', 'JPY', 'HKD', 'EUR', 'GBP', 'BDT'];

export async function fetchAccounts(supabase, userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from('accounts')
    .select('id, name, type, base_currency, display_order, is_default, created_at, updated_at')
    .eq('user_id', userId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[accounts] fetch failed', error);
    return [];
  }
  return data || [];
}

export async function addAccount(supabase, userId, { name, type, baseCurrency, displayOrder, isDefault }) {
  if (!supabase || !userId) throw new Error('Supabase or userId missing');
  const n = String(name || '').trim();
  if (!n) throw new Error('口座名が必要です');
  const t = String(type || 'tokutei');
  if (!ACCOUNT_TYPE_LABEL[t]) throw new Error('不明な口座種別です');
  const c = String(baseCurrency || 'USD').toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(c)) throw new Error('未対応の通貨です');

  const row = {
    user_id: userId,
    name: n,
    type: t,
    base_currency: c,
    display_order: Number.isFinite(Number(displayOrder)) ? Number(displayOrder) : 0,
    is_default: Boolean(isDefault),
  };

  const { data, error } = await supabase
    .from('accounts')
    .insert(row)
    .select('id, name, type, base_currency, display_order, is_default, created_at, updated_at')
    .single();
  if (error) throw error;
  return data;
}

export async function updateAccount(supabase, userId, accountId, patch) {
  if (!supabase || !userId || !accountId) throw new Error('required args missing');
  const updates = {};
  if (patch.name != null) {
    const n = String(patch.name).trim();
    if (!n) throw new Error('口座名が必要です');
    updates.name = n;
  }
  if (patch.type) {
    if (!ACCOUNT_TYPE_LABEL[patch.type]) throw new Error('不明な口座種別です');
    updates.type = patch.type;
  }
  if (patch.baseCurrency) {
    const c = String(patch.baseCurrency).toUpperCase();
    if (!SUPPORTED_CURRENCIES.includes(c)) throw new Error('未対応の通貨です');
    updates.base_currency = c;
  }
  if (patch.displayOrder != null && Number.isFinite(Number(patch.displayOrder))) {
    updates.display_order = Number(patch.displayOrder);
  }
  if (patch.isDefault != null) updates.is_default = Boolean(patch.isDefault);

  const { data, error } = await supabase
    .from('accounts')
    .update(updates)
    .eq('user_id', userId)
    .eq('id', accountId)
    .select('id, name, type, base_currency, display_order, is_default, created_at, updated_at')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAccount(supabase, userId, accountId) {
  if (!supabase || !userId || !accountId) throw new Error('required args missing');
  // CASCADE delete: transactions も同時に消える (migration 設計通り)
  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('user_id', userId)
    .eq('id', accountId);
  if (error) throw error;
}

// is_default: true で flip するヘルパ。user ごとに max 1 行制約があるため
// 旧 default を先に false に落とす必要がある (部分 unique index 違反回避)。
export async function setDefaultAccount(supabase, userId, accountId) {
  if (!supabase || !userId || !accountId) throw new Error('required args missing');
  // 1. 既存 default を全 false に
  const { error: e1 } = await supabase
    .from('accounts')
    .update({ is_default: false })
    .eq('user_id', userId)
    .eq('is_default', true);
  if (e1) throw e1;
  // 2. 指定 account を default に
  const { data, error: e2 } = await supabase
    .from('accounts')
    .update({ is_default: true })
    .eq('user_id', userId)
    .eq('id', accountId)
    .select('id, name, type, base_currency, display_order, is_default')
    .single();
  if (e2) throw e2;
  return data;
}

// 既存 user に default 口座が無い場合 (= migration 未適用 user) のフォールバック。
// frontend で「口座未登録」状態を検出した時に作る。
export async function ensureDefaultAccount(supabase, userId) {
  if (!supabase || !userId) return null;
  const existing = await fetchAccounts(supabase, userId);
  const def = existing.find((a) => a.is_default);
  if (def) return def;
  return addAccount(supabase, userId, {
    name: 'デフォルト',
    type: 'tokutei',
    baseCurrency: 'USD',
    displayOrder: 0,
    isDefault: true,
  });
}
