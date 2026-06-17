/**
 * lib/volume.js — avgVol50 の SSOT (全コンポーネントはこれを使う)
 * SPEC_2026-06-16_breakout-signal §3.7 (M2 是正)。
 *
 * 「当日除く直前50日」を正とする。理由: vol_ratio = today_volume / avgVol50 の分母に
 * 当日値を含めると自己参照で vmult が低めにバイアスされる。chip 倍率 (§3.4) / バー強調 (§3.2) /
 * backend confirmed 判定 (_detect_breakout の volumes[-51:-1]) を物理一致させるため全箇所でこの関数を経由する。
 * backend _detect_cup_handle の volumes[-50:] (当日込み) とは意図的に別仕様 (別関数・別スコープ)。
 */

/**
 * 直前50日の平均出来高 (当日除く) を返す。
 * @param {Array<{volume?: number|null}>} prices  /api/price-history の prices 配列
 * @returns {number|null}  50日平均出来高。データ不足 (< 51本) なら null。
 */
export function computeAvgVol50(prices) {
  if (!Array.isArray(prices) || prices.length < 51) return null;
  const window = prices.slice(-(50 + 1), -1); // = prices[-51:-1] 相当 (当日=末尾を除く直前50本)
  const vols = window.map((p) => Number(p?.volume)).filter(Number.isFinite);
  if (vols.length < 50) return null;
  return vols.reduce((a, b) => a + b, 0) / vols.length;
}

/**
 * 今日の出来高 / avgVol50 を返す。
 * @param {number|null} todayVolume
 * @param {number|null} avgVol50  computeAvgVol50 の返り値
 * @returns {number|null}  非有限 / avgVol50<=0 で null。
 */
export function computeVolRatio(todayVolume, avgVol50) {
  if (!Number.isFinite(todayVolume) || !Number.isFinite(avgVol50) || avgVol50 <= 0) return null;
  return todayVolume / avgVol50;
}

/** confirmed 判定閾値 (decision④ LOCKED) */
export const CONFIRM_VOL = 1.5;
/** soft 判定閾値 (decision④ LOCKED) */
export const SOFT_VOL = 1.3;

/**
 * 出来高バー強調の判定 (ChartBar の Cell に渡す)。
 * 強調は confirmed (1.5x) のみ・close>=open 限定 (§3.2)。
 * @param {{volume?: number|null, close?: number|null, open?: number|null}} entry
 * @param {number|null} avgVol50
 * @returns {boolean}
 */
export function isBreakoutBar(entry, avgVol50) {
  return (
    Number.isFinite(avgVol50) &&
    avgVol50 > 0 &&
    Number.isFinite(entry?.volume) &&
    entry.volume >= avgVol50 * CONFIRM_VOL &&
    Number.isFinite(entry?.close) &&
    Number.isFinite(entry?.open) &&
    entry.close >= entry.open
  );
}
