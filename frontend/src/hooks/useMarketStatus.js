import { useEffect, useState } from 'react';

/**
 * §11-E v51 Phase 1: NYSE / NASDAQ マーケット状態 hook (Concierge Greeting 用)
 *
 * 米国市場の営業時間を判定し、状態 + 開閉までの時間を返す。
 * - 平日 (月-金) の ET 09:30-16:00 が REGULAR (通常取引)
 * - 平日 ET 04:00-09:30 が PRE (プレマーケット)
 * - 平日 ET 16:00-20:00 が POST (アフターマーケット)
 * - それ以外 (土日 / 祝日 / 夜間) は CLOSED
 *
 * 注: US 祝日カレンダーは省略 (NYSE 公式は Good Friday 等 9 日)。
 * 厳密性が必要になれば将来 backend で `/api/market-calendar` を実装。
 *
 * 戻り値:
 *   {
 *     state: 'REGULAR' | 'PRE' | 'POST' | 'CLOSED',
 *     label: string ("通常取引中" 等の日本語),
 *     untilNext: string ("4 時間後にオープン" 等),
 *   }
 */
export function useMarketStatus(updateIntervalMs = 60_000) {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), updateIntervalMs);
    return () => clearInterval(id);
  }, [updateIntervalMs]);

  return computeMarketStatus(new Date(tick));
}

function computeMarketStatus(now) {
  // ET (米国東部時間) は EST=UTC-5 / EDT=UTC-4 で揺れるが、
  // toLocaleString に America/New_York を渡せば自動切替される
  const etStr = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  // 例: "Mon, 05/09/2026, 14:30"
  const m = etStr.match(/^(\w{3}),\s+(\d{2})\/(\d{2})\/(\d{4}),\s+(\d{2}):(\d{2})$/);
  if (!m) return { state: 'CLOSED', label: '市場休場', untilNext: '' };
  const [, weekday, , , , hh, mm] = m;
  const minutesEt = parseInt(hh, 10) * 60 + parseInt(mm, 10);
  const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);

  // ET 時刻範囲 (分単位)
  const PRE_OPEN = 4 * 60;        // 04:00
  const REG_OPEN = 9 * 60 + 30;   // 09:30
  const REG_CLOSE = 16 * 60;      // 16:00
  const POST_CLOSE = 20 * 60;     // 20:00

  if (!isWeekday) {
    return { state: 'CLOSED', label: '週末で休場', untilNext: '' };
  }

  if (minutesEt >= REG_OPEN && minutesEt < REG_CLOSE) {
    const minsToClose = REG_CLOSE - minutesEt;
    return {
      state: 'REGULAR',
      label: 'NYSE 通常取引中',
      untilNext: relativeJa(minsToClose, 'クローズまで'),
    };
  }
  if (minutesEt >= PRE_OPEN && minutesEt < REG_OPEN) {
    const minsToOpen = REG_OPEN - minutesEt;
    return {
      state: 'PRE',
      label: 'プレマーケット',
      untilNext: relativeJa(minsToOpen, 'オープンまで'),
    };
  }
  if (minutesEt >= REG_CLOSE && minutesEt < POST_CLOSE) {
    return {
      state: 'POST',
      label: 'アフターマーケット',
      untilNext: '',
    };
  }
  // 夜間 (20:00 以降 〜 翌 04:00)
  // 翌営業日のオープンまで概算
  const minsTillFour = (24 * 60 - minutesEt) + PRE_OPEN; // 翌 04:00 まで
  const minsTillOpen = (24 * 60 - minutesEt) + REG_OPEN; // 翌 09:30 まで
  return {
    state: 'CLOSED',
    label: '市場休場',
    untilNext: relativeJa(minutesEt < PRE_OPEN ? minsTillFour - 24 * 60 : minsTillOpen, '次のオープンまで'),
  };
}

function relativeJa(mins, suffix) {
  if (!Number.isFinite(mins) || mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} 分${suffix ? '・' + suffix : ''}`;
  if (m === 0) return `${h} 時間${suffix ? '・' + suffix : ''}`;
  return `${h} 時間 ${m} 分${suffix ? '・' + suffix : ''}`;
}

/**
 * 時間帯別の挨拶文 (Stripe Dashboard 流の Concierge Greeting)
 */
export function greetingFor(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return 'Good night';
  if (h < 11) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
