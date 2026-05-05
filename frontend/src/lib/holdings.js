// Holdings (保有数 + 取得単価) の Supabase 操作ヘルパ
// MVP: 1 ユーザー × 1 銘柄 = 1 行（複合 PK (user_id, ticker)）
// 通貨は USD 固定（米国株専用）

export const PNL_NEUTRAL_THRESHOLD_PCT = 0.5;  // ±0.5% 以内は灰色（フリッカー防止）

// ─── holdings テーブル CRUD ──────────────────────────────────

export async function fetchHoldings(supabase, userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from('holdings')
    .select('ticker, shares, avg_cost, created_at, updated_at')
    .eq('user_id', userId);
  if (error) {
    console.error('[holdings] fetch failed', error);
    return [];
  }
  return data || [];
}

export async function upsertHolding(supabase, userId, { ticker, shares, avgCost }) {
  if (!supabase || !userId) throw new Error('Supabase or userId missing');
  const t = (ticker || '').trim().toUpperCase();
  if (!t) throw new Error('銘柄コードが必要です');
  const sharesNum = Number(shares);
  const avgCostNum = Number(avgCost);
  if (!Number.isFinite(sharesNum) || sharesNum <= 0) throw new Error('保有数は 0 より大きい数値で入力してください');
  if (!Number.isFinite(avgCostNum) || avgCostNum <= 0) throw new Error('取得単価は 0 より大きい数値で入力してください');

  const { data, error } = await supabase
    .from('holdings')
    .upsert(
      { user_id: userId, ticker: t, shares: sharesNum, avg_cost: avgCostNum },
      { onConflict: 'user_id,ticker' }
    )
    .select('ticker, shares, avg_cost, created_at, updated_at')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteHolding(supabase, userId, ticker) {
  if (!supabase || !userId || !ticker) throw new Error('required args missing');
  const { error } = await supabase
    .from('holdings')
    .delete()
    .eq('user_id', userId)
    .eq('ticker', ticker);
  if (error) throw error;
}

// ─── 損益計算ユーティリティ ──────────────────────────────────

// 損益率を返す。±0.5% 以内は 0 として扱う（中立色）。
// holding: { shares, avg_cost }, currentPrice: number
// → { pnlPct, pnlAbs, status: 'gain' | 'loss' | 'neutral' | null }
export function computePnL(holding, currentPrice) {
  if (!holding || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return { pnlPct: null, pnlAbs: null, status: null };
  }
  const { shares, avg_cost } = holding;
  if (!Number.isFinite(shares) || !Number.isFinite(avg_cost) || avg_cost <= 0) {
    return { pnlPct: null, pnlAbs: null, status: null };
  }
  const pnlPct = ((currentPrice - avg_cost) / avg_cost) * 100;
  const pnlAbs = (currentPrice - avg_cost) * shares;
  let status = 'neutral';
  if (pnlPct > PNL_NEUTRAL_THRESHOLD_PCT) status = 'gain';
  else if (pnlPct < -PNL_NEUTRAL_THRESHOLD_PCT) status = 'loss';
  return { pnlPct, pnlAbs, status };
}

// 損益バッジ表示用フォーマット（例: "+12.3%" / "-4.5%" / "±0%"）
export function formatPnLPct(pnlPct) {
  if (!Number.isFinite(pnlPct)) return '';
  if (Math.abs(pnlPct) <= PNL_NEUTRAL_THRESHOLD_PCT) return '±0%';
  const sign = pnlPct > 0 ? '+' : '';
  return `${sign}${pnlPct.toFixed(1)}%`;
}
