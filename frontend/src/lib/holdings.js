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

// ─── holding_lots テーブル CRUD (X-2-B) ────────────────────────────
// ロット (lot) = 1 回の買付。各ロットは ticker + shares + price + trade_date を持ち、
// 1 ユーザー × 1 銘柄に対して N ロット。サマリー (shares / avg_cost) は
// aggregateLots() でクライアントサイドで計算する。

export async function fetchLots(supabase, userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from('holding_lots')
    .select('id, ticker, shares, price, trade_date, note, created_at, updated_at')
    .eq('user_id', userId)
    .order('trade_date', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[holding_lots] fetch failed', error);
    return [];
  }
  return data || [];
}

export async function addLot(supabase, userId, { ticker, shares, price, tradeDate, note }) {
  if (!supabase || !userId) throw new Error('Supabase or userId missing');
  const t = (ticker || '').trim().toUpperCase();
  if (!t) throw new Error('銘柄コードが必要です');
  const sharesNum = Number(shares);
  const priceNum = Number(price);
  if (!Number.isFinite(sharesNum) || sharesNum <= 0) throw new Error('株数は 0 より大きい数値で入力してください');
  if (!Number.isFinite(priceNum) || priceNum <= 0) throw new Error('購入価格は 0 より大きい数値で入力してください');

  const row = {
    user_id: userId,
    ticker: t,
    shares: sharesNum,
    price: priceNum,
  };
  if (tradeDate) row.trade_date = tradeDate; // YYYY-MM-DD
  if (note != null && String(note).trim()) row.note = String(note).trim();

  const { data, error } = await supabase
    .from('holding_lots')
    .insert(row)
    .select('id, ticker, shares, price, trade_date, note, created_at, updated_at')
    .single();
  if (error) throw error;
  return data;
}

export async function updateLot(supabase, userId, lotId, patch) {
  if (!supabase || !userId || !lotId) throw new Error('required args missing');
  const updates = {};
  if (patch.shares != null) {
    const n = Number(patch.shares);
    if (!Number.isFinite(n) || n <= 0) throw new Error('株数は 0 より大きい数値で入力してください');
    updates.shares = n;
  }
  if (patch.price != null) {
    const n = Number(patch.price);
    if (!Number.isFinite(n) || n <= 0) throw new Error('購入価格は 0 より大きい数値で入力してください');
    updates.price = n;
  }
  if (patch.tradeDate) updates.trade_date = patch.tradeDate;
  if (patch.note !== undefined) updates.note = patch.note ? String(patch.note).trim() : null;

  const { data, error } = await supabase
    .from('holding_lots')
    .update(updates)
    .eq('user_id', userId)
    .eq('id', lotId)
    .select('id, ticker, shares, price, trade_date, note, created_at, updated_at')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLot(supabase, userId, lotId) {
  if (!supabase || !userId || !lotId) throw new Error('required args missing');
  const { error } = await supabase
    .from('holding_lots')
    .delete()
    .eq('user_id', userId)
    .eq('id', lotId);
  if (error) throw error;
}

// 同一銘柄の全ロットから { shares, avg_cost } を計算
// 加重平均: avg_cost = Σ(shares_i × price_i) / Σ(shares_i)
// 売却 (shares < 0) は MVP 非対応のため考慮しない。
export function aggregateLotsForTicker(lots) {
  if (!Array.isArray(lots) || lots.length === 0) {
    return { shares: 0, avg_cost: 0, lotCount: 0 };
  }
  let totalShares = 0;
  let totalCost = 0;
  for (const l of lots) {
    const s = Number(l.shares);
    const p = Number(l.price);
    if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(p) || p <= 0) continue;
    totalShares += s;
    totalCost += s * p;
  }
  return {
    shares: totalShares,
    avg_cost: totalShares > 0 ? totalCost / totalShares : 0,
    lotCount: lots.length,
  };
}

// ─── transactions (Phase 1 / v68) ────────────────────────────────────
// holding_lots (買付のみ) を append-only event log に進化させた版。
// 7 type: buy / sell / dividend / split / fee / deposit / withdraw。
// schema SSOT: memory/portfolio_account_schema.md (handover v68)
// 計算法: 移動平均 (Moving Average Cost) — 日本 NISA / 特定口座と整合
//
// 戻り値: {
//   shares: 残保有数 (split 反映済)
//   avgCost: per-share 平均取得単価 (cost basis)
//   realized: 実現損益 (sell の (price - avg) × shares + dividend - fee)
//   totalCost: 現時点の取得原価合計 (= shares × avgCost)
// }
export function aggregateWithTransactions(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { shares: 0, avgCost: 0, realized: 0, totalCost: 0 };
  }
  // trade_date asc → created_at asc で時系列順に適用
  const sorted = [...rows].sort((a, b) => {
    const da = String(a.trade_date || '');
    const db = String(b.trade_date || '');
    if (da !== db) return da < db ? -1 : 1;
    const ca = String(a.created_at || '');
    const cb = String(b.created_at || '');
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });

  let shares = 0;
  let costBasis = 0;  // shares × avgCost = 取得原価合計
  let realized = 0;
  let dividendTotal = 0;  // 受取配当合計 (per-ticker summary header 用)
  let txCount = 0;

  for (const r of sorted) {
    const type = String(r.type || '').toLowerCase();
    const sh = Number(r.shares);
    const pr = Number(r.price);
    const fee = Number(r.fee) || 0;
    txCount += 1;

    if (type === 'buy') {
      if (!Number.isFinite(sh) || sh <= 0 || !Number.isFinite(pr) || pr <= 0) continue;
      costBasis += sh * pr + fee;
      shares += sh;
    } else if (type === 'sell') {
      if (!Number.isFinite(sh) || sh <= 0 || !Number.isFinite(pr) || pr <= 0) continue;
      if (shares <= 0) continue;  // 売れる玉が無い: defensive skip
      const sellShares = Math.min(sh, shares);
      const avg = costBasis / shares;
      realized += (pr - avg) * sellShares - fee;
      costBasis -= avg * sellShares;
      shares -= sellShares;
    } else if (type === 'dividend') {
      // price = per-share 配当額。shares NULL → 配当受領時点の保有株数を使う
      if (!Number.isFinite(pr) || pr <= 0) continue;
      const divShares = Number.isFinite(sh) && sh > 0 ? sh : shares;
      const divAmount = divShares * pr - fee;
      realized += divAmount;
      dividendTotal += divAmount;
    } else if (type === 'split') {
      // shares = 分子、price = 分母 として ratio = shares / price
      // 例: 10-for-1 split → shares=10, price=1 → ratio=10 (株数 ×10、avg ÷10)
      if (!Number.isFinite(sh) || sh <= 0 || !Number.isFinite(pr) || pr <= 0) continue;
      const ratio = sh / pr;
      if (!Number.isFinite(ratio) || ratio <= 0) continue;
      shares = shares * ratio;
      // costBasis は不変 (per-share avg は ratio で割れる)
    } else if (type === 'fee') {
      // 単独手数料: realized から減算 (cost basis には影響しない)
      if (Number.isFinite(pr) && pr > 0) realized -= pr;
    }
    // deposit / withdraw は現金残高用 (Phase 2)。本関数では shares/cost に影響なし
  }

  return {
    shares,
    avgCost: shares > 0 ? costBasis / shares : 0,
    realized,
    totalCost: shares > 0 ? costBasis : 0,
    dividendTotal,  // v68 §2 #6 dogfood: per-ticker summary header 用
    txCount,
  };
}

// transactions[] を (account_id, ticker) でグルーピングして集計マップを返す
// 戻り値: { [accountId]: { [TICKER]: { shares, avgCost, realized, totalCost, txCount } } }
export function aggregateTransactionsByAccount(transactions) {
  const byAccount = {};
  for (const tx of (transactions || [])) {
    const acc = tx.account_id;
    const t = (tx.ticker || '').toUpperCase();
    if (!acc) continue;
    if (!byAccount[acc]) byAccount[acc] = {};
    // ticker NULL の deposit/withdraw/fee は account レベル現金扱い (Phase 2)
    if (!t) continue;
    if (!byAccount[acc][t]) byAccount[acc][t] = [];
    byAccount[acc][t].push(tx);
  }
  const out = {};
  for (const [acc, byTicker] of Object.entries(byAccount)) {
    out[acc] = {};
    for (const [t, arr] of Object.entries(byTicker)) {
      const agg = aggregateWithTransactions(arr);
      if (agg.shares > 0 || agg.realized !== 0) {
        out[acc][t] = { ticker: t, ...agg, txCount: arr.length };
      }
    }
  }
  return out;
}

// 全 transactions → ticker 単位の rollup (全 account 統合、「合計」ビュー用)
// 戻り値: { [TICKER]: { shares, avgCost, realized, totalCost, accountCount } }
export function aggregateTransactionsRollup(transactions) {
  const byTicker = {};
  for (const tx of (transactions || [])) {
    const t = (tx.ticker || '').toUpperCase();
    if (!t) continue;
    if (!byTicker[t]) byTicker[t] = [];
    byTicker[t].push(tx);
  }
  const out = {};
  for (const [t, arr] of Object.entries(byTicker)) {
    const agg = aggregateWithTransactions(arr);
    if (agg.shares > 0 || agg.realized !== 0) {
      const accountSet = new Set(arr.map((x) => x.account_id).filter(Boolean));
      out[t] = { ticker: t, ...agg, accountCount: accountSet.size };
    }
  }
  return out;
}

// 全ロットを ticker でグルーピングして集計マップを返す
// 戻り値: { [TICKER]: { ticker, shares, avg_cost, lotCount, updated_at } }
export function aggregateAllLots(lots) {
  const byTicker = {};
  for (const l of (lots || [])) {
    const t = (l.ticker || '').toUpperCase();
    if (!t) continue;
    if (!byTicker[t]) byTicker[t] = [];
    byTicker[t].push(l);
  }
  const out = {};
  for (const [t, arr] of Object.entries(byTicker)) {
    const agg = aggregateLotsForTicker(arr);
    if (agg.shares > 0) {
      // updated_at は最新ロットの更新時刻 (UI の「最終更新」表示用)
      const latest = arr.reduce((a, b) => (
        (a.updated_at || a.created_at) > (b.updated_at || b.created_at) ? a : b
      ));
      out[t] = {
        ticker: t,
        shares: agg.shares,
        avg_cost: agg.avg_cost,
        lotCount: agg.lotCount,
        updated_at: latest.updated_at || latest.created_at,
      };
    }
  }
  return out;
}
