import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchLots as fetchLotsRemote,
  addLot as addLotRemote,
  updateLot as updateLotRemote,
  deleteLot as deleteLotRemote,
  aggregateAllLots,
  aggregateLotsForTicker,
} from '../lib/holdings.js';

/**
 * Holdings 機能の状態管理 hook (X-2-B: ロット履歴ベース)
 *
 * 設計:
 * - holding_lots を source of truth とする (1 ユーザー × 1 銘柄 × N ロット)
 * - holdings (集計マップ) はロットから派生計算 (useMemo)
 * - 旧 setHolding API は「直接編集 = 全ロット削除 + 新ロット 1 件追加」として
 *   後方互換ラッパで提供 (HoldingSection の overwrite モード用)
 *
 * 楽観的更新: lot CRUD は local state を即更新 → backend → 失敗時 rollback
 */
export function useHoldings({ supabase, user }) {
  const [lots, setLots] = useState([]);          // 全ロット (全 ticker)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const loadedForUserRef = useRef(null);

  // ロットから集計した holdings マップ
  const holdings = useMemo(() => aggregateAllLots(lots), [lots]);
  const tickers = useMemo(() => Object.keys(holdings), [holdings]);

  // ロットを ticker でグループ化したマップ (UI 用)
  const lotsByTicker = useMemo(() => {
    const m = {};
    for (const l of lots) {
      const t = (l.ticker || '').toUpperCase();
      if (!t) continue;
      if (!m[t]) m[t] = [];
      m[t].push(l);
    }
    // trade_date 降順 (最新が上)
    for (const arr of Object.values(m)) {
      arr.sort((a, b) => {
        const ad = a.trade_date || a.created_at;
        const bd = b.trade_date || b.created_at;
        if (ad === bd) return (b.created_at || '').localeCompare(a.created_at || '');
        return (bd || '').localeCompare(ad || '');
      });
    }
    return m;
  }, [lots]);

  // 初回ロード（ユーザーログイン時）
  useEffect(() => {
    if (!supabase || !user?.id) {
      setLots([]);
      loadedForUserRef.current = null;
      return;
    }
    if (loadedForUserRef.current === user.id) return;
    loadedForUserRef.current = user.id;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await fetchLotsRemote(supabase, user.id);
        if (cancelled) return;
        setLots(rows);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, user?.id]);

  // ─── ロット CRUD (X-2-B 新 API) ──────────────────────────────

  const addLot = useCallback(async (ticker, { shares, price, tradeDate, note }) => {
    if (!supabase || !user?.id) throw new Error('ログインが必要です');
    const t = (ticker || '').trim().toUpperCase();
    if (!t) throw new Error('銘柄コードが必要です');
    // 楽観的: 仮 id を付けて即時反映 → 成功時に real に置換
    const tempId = `__tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const optimistic = {
      id: tempId,
      ticker: t,
      shares: Number(shares),
      price: Number(price),
      trade_date: tradeDate || new Date().toISOString().slice(0, 10),
      note: note || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _optimistic: true,
    };
    setLots(curr => [...curr, optimistic]);
    try {
      const real = await addLotRemote(supabase, user.id, { ticker: t, shares, price, tradeDate, note });
      setLots(curr => curr.map(l => l.id === tempId ? real : l));
      return real;
    } catch (e) {
      setLots(curr => curr.filter(l => l.id !== tempId));
      throw e;
    }
  }, [supabase, user?.id]);

  const updateLot = useCallback(async (lotId, patch) => {
    if (!supabase || !user?.id) throw new Error('ログインが必要です');
    const prev = lots.find(l => l.id === lotId);
    if (!prev) throw new Error('対象ロットが見つかりません');
    const optimistic = {
      ...prev,
      ...(patch.shares != null ? { shares: Number(patch.shares) } : {}),
      ...(patch.price != null ? { price: Number(patch.price) } : {}),
      ...(patch.tradeDate ? { trade_date: patch.tradeDate } : {}),
      ...(patch.note !== undefined ? { note: patch.note || null } : {}),
      updated_at: new Date().toISOString(),
      _optimistic: true,
    };
    setLots(curr => curr.map(l => l.id === lotId ? optimistic : l));
    try {
      const real = await updateLotRemote(supabase, user.id, lotId, patch);
      setLots(curr => curr.map(l => l.id === lotId ? real : l));
      return real;
    } catch (e) {
      setLots(curr => curr.map(l => l.id === lotId ? prev : l));
      throw e;
    }
  }, [supabase, user?.id, lots]);

  const removeLot = useCallback(async (lotId) => {
    if (!supabase || !user?.id) throw new Error('ログインが必要です');
    const prev = lots.find(l => l.id === lotId);
    if (!prev) return;
    setLots(curr => curr.filter(l => l.id !== lotId));
    try {
      await deleteLotRemote(supabase, user.id, lotId);
    } catch (e) {
      setLots(curr => [...curr, prev]);
      throw e;
    }
  }, [supabase, user?.id, lots]);

  // ─── 旧 API 後方互換ラッパ (HoldingSection overwrite / 既存呼出用) ────

  // 「直接編集」相当: 既存ロットを全削除 → 新ロット 1 件追加
  // 将来 X-2-5-D で「直接編集 = avg_cost を書き換える 1 ロット」へ正規化される想定。
  const setHolding = useCallback(async (ticker, { shares, avgCost }) => {
    if (!supabase || !user?.id) throw new Error('ログインが必要です');
    const t = (ticker || '').trim().toUpperCase();
    if (!t) throw new Error('銘柄コードが必要です');
    const existing = (lots || []).filter(l => (l.ticker || '').toUpperCase() === t);
    // 既存ロット削除 → 新ロット 1 件 (順次実行で原子性は弱いが MVP では許容)
    for (const l of existing) {
      try { await deleteLotRemote(supabase, user.id, l.id); } catch (e) {
        console.warn('[useHoldings] setHolding delete failed', l.id, e);
      }
    }
    const real = await addLotRemote(supabase, user.id, {
      ticker: t,
      shares,
      price: avgCost,
      note: '直接編集',
    });
    // ローカル state を反映
    setLots(curr => [...curr.filter(l => (l.ticker || '').toUpperCase() !== t), real]);
    return aggregateLotsForTicker([real]);
  }, [supabase, user?.id, lots]);

  // 「ティッカー単位で全削除」 = 当該 ticker の全ロット削除
  const removeHolding = useCallback(async (ticker) => {
    if (!supabase || !user?.id) return;
    const t = (ticker || '').trim().toUpperCase();
    const existing = (lots || []).filter(l => (l.ticker || '').toUpperCase() === t);
    if (existing.length === 0) return;
    // 楽観的に全削除
    setLots(curr => curr.filter(l => (l.ticker || '').toUpperCase() !== t));
    try {
      for (const l of existing) {
        await deleteLotRemote(supabase, user.id, l.id);
      }
    } catch (e) {
      // 部分失敗時はロールバック (最も安全側)
      setLots(curr => [...curr, ...existing]);
      throw e;
    }
  }, [supabase, user?.id, lots]);

  // ウォッチリスト整合用: state からのみ削除 (DB は触らない)
  const removeHoldingForTicker = useCallback((ticker) => {
    setLots(curr => {
      const t = (ticker || '').trim().toUpperCase();
      return curr.filter(l => (l.ticker || '').toUpperCase() !== t);
    });
  }, []);

  const getHolding = useCallback((ticker) => {
    const t = (ticker || '').trim().toUpperCase();
    return holdings[t] || null;
  }, [holdings]);

  const getLots = useCallback((ticker) => {
    const t = (ticker || '').trim().toUpperCase();
    return lotsByTicker[t] || [];
  }, [lotsByTicker]);

  return {
    holdings,
    lots,
    lotsByTicker,
    tickers,
    loading,
    error,
    // 新 API (lot)
    addLot,
    updateLot,
    removeLot,
    getLots,
    // 旧 API (holding)
    setHolding,
    removeHolding,
    removeHoldingForTicker,
    getHolding,
  };
}
