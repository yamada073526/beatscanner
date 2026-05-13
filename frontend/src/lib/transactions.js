// Transactions (append-only event log) Supabase 操作ヘルパ
// schema SSOT: memory/portfolio_account_schema.md (handover v68)
// migration: docs/migrations/2026-05-14_portfolio_phase1_v68.sql
//
// 7 type: buy / sell / dividend / split / fee / deposit / withdraw

export const TRANSACTION_TYPES = [
  { value: 'buy',       label: '買付',   requiresShares: true,  requiresTicker: true  },
  { value: 'sell',      label: '売却',   requiresShares: true,  requiresTicker: true  },
  { value: 'dividend',  label: '配当',   requiresShares: false, requiresTicker: true  },
  { value: 'split',     label: '分割',   requiresShares: true,  requiresTicker: true  },
  { value: 'fee',       label: '手数料', requiresShares: false, requiresTicker: false },
  { value: 'deposit',   label: '入金',   requiresShares: false, requiresTicker: false },
  { value: 'withdraw',  label: '出金',   requiresShares: false, requiresTicker: false },
];

export const TRANSACTION_TYPE_LABEL = Object.fromEntries(
  TRANSACTION_TYPES.map((x) => [x.value, x.label])
);

export async function fetchTransactions(supabase, userId, { accountId, ticker } = {}) {
  if (!supabase || !userId) return [];
  let q = supabase
    .from('transactions')
    .select('id, user_id, account_id, ticker, type, shares, price, currency, fx_rate, trade_date, fee, note, created_at')
    .eq('user_id', userId)
    .order('trade_date', { ascending: true })
    .order('created_at', { ascending: true });
  if (accountId) q = q.eq('account_id', accountId);
  if (ticker) q = q.eq('ticker', String(ticker).toUpperCase());
  const { data, error } = await q;
  if (error) {
    console.error('[transactions] fetch failed', error);
    return [];
  }
  return data || [];
}

// 共通バリデータ — migration の transactions_type_shape_ck と整合
function validateTransactionPayload(input) {
  const type = String(input.type || '').toLowerCase();
  const spec = TRANSACTION_TYPES.find((x) => x.value === type);
  if (!spec) throw new Error('不明な取引種別です');

  const ticker = input.ticker ? String(input.ticker).trim().toUpperCase() : null;
  if (spec.requiresTicker && !ticker) throw new Error('銘柄コードが必要です');

  const shares = input.shares != null ? Number(input.shares) : null;
  if (spec.requiresShares && (!Number.isFinite(shares) || shares <= 0)) {
    throw new Error('株数は 0 より大きい数値で入力してください');
  }

  const price = input.price != null ? Number(input.price) : null;
  if (price == null || !Number.isFinite(price) || price <= 0) {
    throw new Error('価格は 0 より大きい数値で入力してください');
  }

  const currency = String(input.currency || 'USD').toUpperCase();
  const fee = input.fee != null && Number.isFinite(Number(input.fee)) ? Number(input.fee) : 0;
  if (fee < 0) throw new Error('手数料は 0 以上で入力してください');

  return { type, ticker, shares, price, currency, fee };
}

export async function addTransaction(supabase, userId, payload) {
  if (!supabase || !userId) throw new Error('Supabase or userId missing');
  if (!payload.account_id) throw new Error('account_id が必要です');

  const v = validateTransactionPayload(payload);

  const row = {
    user_id: userId,
    account_id: payload.account_id,
    ticker: v.ticker,
    type: v.type,
    shares: v.shares,
    price: v.price,
    currency: v.currency,
    fx_rate: payload.fx_rate != null ? Number(payload.fx_rate) : null,
    fee: v.fee,
  };
  if (payload.trade_date) row.trade_date = payload.trade_date;  // YYYY-MM-DD
  if (payload.note != null && String(payload.note).trim()) {
    row.note = String(payload.note).trim();
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert(row)
    .select('id, user_id, account_id, ticker, type, shares, price, currency, fx_rate, trade_date, fee, note, created_at')
    .single();
  if (error) throw error;
  return data;
}

export async function updateTransaction(supabase, userId, txId, patch) {
  if (!supabase || !userId || !txId) throw new Error('required args missing');
  const updates = {};
  if (patch.shares != null) {
    const n = Number(patch.shares);
    if (!Number.isFinite(n) || n <= 0) throw new Error('株数は 0 より大きい数値で入力してください');
    updates.shares = n;
  }
  if (patch.price != null) {
    const n = Number(patch.price);
    if (!Number.isFinite(n) || n <= 0) throw new Error('価格は 0 より大きい数値で入力してください');
    updates.price = n;
  }
  if (patch.currency) updates.currency = String(patch.currency).toUpperCase();
  if (patch.fx_rate !== undefined) {
    updates.fx_rate = patch.fx_rate == null ? null : Number(patch.fx_rate);
  }
  if (patch.fee != null) {
    const n = Number(patch.fee);
    if (!Number.isFinite(n) || n < 0) throw new Error('手数料は 0 以上で入力してください');
    updates.fee = n;
  }
  if (patch.trade_date) updates.trade_date = patch.trade_date;
  if (patch.note !== undefined) updates.note = patch.note ? String(patch.note).trim() : null;
  if (patch.ticker !== undefined) {
    updates.ticker = patch.ticker ? String(patch.ticker).trim().toUpperCase() : null;
  }

  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('user_id', userId)
    .eq('id', txId)
    .select('id, user_id, account_id, ticker, type, shares, price, currency, fx_rate, trade_date, fee, note, created_at')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTransaction(supabase, userId, txId) {
  if (!supabase || !userId || !txId) throw new Error('required args missing');
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', userId)
    .eq('id', txId);
  if (error) throw error;
}

// 既存 holding_lots → transactions に手動で 1 件移行するヘルパ。
// migration で backfill 済の user 向けには使わない。手動補正・テスト用。
export async function addBuyFromLot(supabase, userId, accountId, lot) {
  return addTransaction(supabase, userId, {
    account_id: accountId,
    ticker: lot.ticker,
    type: 'buy',
    shares: lot.shares,
    price: lot.price,
    currency: 'USD',
    trade_date: lot.trade_date,
    note: lot.note || null,
  });
}
