import { useState, useEffect, useMemo, useRef } from 'react';
import { fetchEconomicCalendar } from '../api.js';
import { translateEvent } from '../lib/i18n/economicEvents.js';

// 経済指標カレンダー (v41 Y-1 + Y-2 高度化)
// 設計思想 ②「毎日開きたくなる」の核 — FOMC/CPI/雇用統計など週次イベントが
// 日次リテンションを生む。
//
// Y-2 拡張内容:
// - 国フィルタ pill (US / JP / EU / 全)
// - 日付グルーピング (今日 / 明日 / 5/8 (水) ...)
// - Beat/Miss カラーリング (発表済の actual vs estimate)
// - "TODAY" バッジで当日イベントを強調

// impact レベル別の色設計
function getImpactColors(impact) {
  if (impact === 'HIGH') {
    return {
      dot: '#f59e0b',
      bg: 'rgba(245,158,11,0.10)',
      border: 'rgba(245,158,11,0.35)',
      label: 'HIGH',
    };
  }
  if (impact === 'MED') {
    return {
      dot: '#06b6d4',
      bg: 'rgba(6,182,212,0.10)',
      border: 'rgba(6,182,212,0.35)',
      label: 'MED',
    };
  }
  return {
    dot: '#94a3b8',  // slate-400
    bg: 'rgba(148,163,184,0.10)',
    border: 'rgba(148,163,184,0.30)',
    label: 'LOW',
  };
}

// 国コード → 表示用ラベル + 旗
const COUNTRY_LABEL = {
  US: '🇺🇸 米国',
  JP: '🇯🇵 日本',
  EU: '🇪🇺 ユーロ圏',
};

// pill 用の短いラベル
const COUNTRY_PILL = {
  all: '全て',
  US: '🇺🇸 米',
  JP: '🇯🇵 日',
  EU: '🇪🇺 EU',
};

// 日付フォーマッタ: ISO → "5/8 (水) 21:30 JST"
function formatJST(input) {
  if (!input) return '';
  let d;
  if (typeof input === 'number') {
    d = new Date(input < 1e12 ? input * 1000 : input);
  } else {
    d = new Date(input);
  }
  if (isNaN(d.getTime())) return '';
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} (${wd}) ${hh}:${mm} JST`;
}

// 時刻のみ抽出 ("21:30")
function formatTimeJST(input) {
  if (!input) return '';
  let d;
  if (typeof input === 'number') d = new Date(input < 1e12 ? input * 1000 : input);
  else d = new Date(input);
  if (isNaN(d.getTime())) return '';
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

// 日付キー (YYYY-MM-DD) を生成 — グルーピング用
function dateKey(input) {
  if (!input) return '';
  let d;
  if (typeof input === 'number') d = new Date(input < 1e12 ? input * 1000 : input);
  else d = new Date(input);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 「今日 / 明日 / 5/8 (水)」のヘッダラベル
function groupHeader(key) {
  if (!key) return '';
  const target = new Date(`${key}T00:00:00`);
  if (isNaN(target.getTime())) return key;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  const month = target.getMonth() + 1;
  const day = target.getDate();
  const wd = ['日', '月', '火', '水', '木', '金', '土'][target.getDay()];
  if (diffDays === 0) return `今日 (${month}/${day} ${wd})`;
  if (diffDays === 1) return `明日 (${month}/${day} ${wd})`;
  if (diffDays === -1) return `昨日 (${month}/${day} ${wd})`;
  return `${month}/${day} (${wd})`;
}

// カウントダウン表示: "あと N 時間" or "あと N 日"
function getCountdown(input) {
  if (!input) return null;
  let target;
  if (typeof input === 'number') target = new Date(input < 1e12 ? input * 1000 : input);
  else target = new Date(input);
  if (isNaN(target.getTime())) return null;
  const diffMs = target.getTime() - Date.now();
  if (diffMs < 0) {
    const elapsedHrs = Math.floor(-diffMs / (1000 * 60 * 60));
    if (elapsedHrs < 24) return `${elapsedHrs} 時間前 (発表済)`;
    return `${Math.floor(elapsedHrs / 24)} 日前 (発表済)`;
  }
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) {
    const diffMin = Math.floor(diffMs / (1000 * 60));
    return `あと ${diffMin} 分`;
  }
  if (diffHours < 24) return `あと ${diffHours} 時間`;
  return `あと ${Math.floor(diffHours / 24)} 日`;
}

// 数値抽出: "3.2%" → 3.2 / "210K" → 210000 / 比較不可なら null
function parseNumeric(s) {
  if (s == null || s === '') return null;
  const str = String(s).trim();
  // 末尾の K/M/B 単位を吸収
  const m = str.match(/^[+\-]?[\d,.]+\s*([kKmMbB]?)\s*%?$/);
  if (!m) return null;
  const numStr = str.replace(/[^\d.\-+]/g, '');
  const v = Number(numStr);
  if (!Number.isFinite(v)) return null;
  const u = (m[1] || '').toLowerCase();
  const mult = u === 'k' ? 1e3 : u === 'm' ? 1e6 : u === 'b' ? 1e9 : 1;
  return v * mult;
}

// 発表済み (actual あり) の Beat/Miss 判定
// returns 'gain' / 'loss' / 'neutral' / null
// 注: 経済指標は「上振れ = 良い」とは限らない (CPI が上振れ = インフレ → 株価ネガ等)。
//     ここでは単純に actual vs estimate の方向のみ表現し、色も中立的なシアン/グレーに留める。
function compareActualVsEstimate(event) {
  const a = parseNumeric(event.actual);
  const e = parseNumeric(event.estimate);
  if (a === null || e === null) return null;
  if (e === 0) return null;
  const pct = ((a - e) / Math.abs(e)) * 100;
  if (Math.abs(pct) < 1) return 'neutral';
  return pct > 0 ? 'above' : 'below';
}

function EventRow({ event, isHighest }) {
  const colors = getImpactColors(event.impact);
  const dateStr = formatJST(event.date);
  const countdown = getCountdown(event.date);
  const country = COUNTRY_LABEL[event.country] || event.country;
  const isPast = countdown && countdown.includes('発表済');
  const isEstimated = event._source === 'estimated';

  // Y-2: 当日イベントは "TODAY" バッジ
  const isToday = (() => {
    const k = dateKey(event.date);
    if (!k) return false;
    const todayK = dateKey(new Date().toISOString());
    return k === todayK;
  })();

  // Y-2: actual vs estimate の方向 (発表済のみ)
  // レビュー指摘 (UI/UX #5): amber (#f59e0b) は CLAUDE.md で「緊急・警告」専用色のため、
  // ここでは使わない。経済指標は「上振れ = 良い」とは限らない (CPI 上振れ = インフレ加速等)
  // ため、価値中立な slate/grey で「方向だけ」を表現する。
  const cmp = isPast ? compareActualVsEstimate(event) : null;
  const actualHl = (() => {
    if (cmp === 'above')   return { color: 'var(--text-secondary)', label: '↑' };
    if (cmp === 'below')   return { color: 'var(--text-muted)',     label: '↓' };
    if (cmp === 'neutral') return { color: 'var(--text-muted)',     label: '≈' };
    return null;
  })();

  return (
    <div
      className="relative px-4 py-3 transition-colors"
      style={{ opacity: isPast ? 0.6 : 1 }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-3 bottom-3 w-[2px] rounded-sm"
        style={{ background: colors.dot }}
      />
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
          style={{
            backgroundColor: colors.bg,
            color: colors.dot,
            border: `1px solid ${colors.border}`,
          }}
        >
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: colors.dot }}
          />
          {colors.label}
        </span>
        <span className="text-[10px] text-slate-400 leading-none">
          {country}
        </span>
        <span className="text-[10px] text-slate-400 leading-none">
          · {formatTimeJST(event.date)} JST
        </span>
        {isToday && !isPast && (
          <span
            className="text-[10px] font-bold leading-none px-1.5 py-0.5 rounded animate-pulse-subtle"
            style={{
              color: '#f59e0b',
              backgroundColor: 'rgba(245,158,11,0.12)',
              border: '1px solid rgba(245,158,11,0.45)',
              letterSpacing: '0.06em',
            }}
            title="本日発表予定"
          >
            TODAY
          </span>
        )}
        {isHighest && !isPast && (
          <span
            className="text-[10px] font-semibold leading-none px-1.5 py-0.5 rounded"
            style={{
              color: '#f59e0b',
              backgroundColor: 'rgba(245,158,11,0.10)',
              border: '1px solid rgba(245,158,11,0.30)',
            }}
            title="最も近い HIGH 影響イベント"
          >
            ⭐ 最注目
          </span>
        )}
        {isEstimated && (
          <span
            className="text-[10px] font-medium leading-none px-1.5 py-0.5 rounded"
            style={{
              color: 'rgb(100, 116, 139)',
              backgroundColor: 'rgba(100, 116, 139, 0.10)',
              border: '1px solid rgba(100, 116, 139, 0.20)',
            }}
            title="標準的なリリーススケジュールに基づく推定日。実際の発表日と異なる場合があります"
          >
            予定
          </span>
        )}
        {countdown && (
          <span
            className="ml-auto text-[10px] font-semibold leading-none"
            style={{ color: isPast ? 'var(--text-muted)' : colors.dot }}
          >
            {countdown}
          </span>
        )}
      </div>
      {/* P0-4+5: 和訳メイン + 英語 sub + カテゴリアイコン (楽天マーケットスピード II 流) */}
      {(() => {
        const t = translateEvent(event.event);
        return (
          <>
            <p
              className="text-sm font-medium text-slate-900 leading-snug"
              style={{ letterSpacing: '0.01em', display: 'flex', alignItems: 'baseline', gap: 6 }}
            >
              <span aria-hidden style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }} title={t.category.label}>
                {t.category.icon}
              </span>
              <span>{t.ja || t.en}</span>
            </p>
            {t.ja && t.ja !== t.en && (
              <p
                className="text-[10px] leading-tight"
                style={{ color: 'var(--text-muted)', marginTop: 1, marginLeft: 19 }}
              >
                {t.en}
              </p>
            )}
          </>
        );
      })()}
      {(event.estimate || event.previous || event.actual) && (
        <p className="text-xs text-slate-500 mt-1 tabular-nums">
          {event.estimate != null && event.estimate !== '' && (
            <span>予想 <span className="text-slate-700 font-medium">{event.estimate}</span></span>
          )}
          {event.previous != null && event.previous !== '' && (
            <span className="ml-2">前回 <span className="text-slate-700 font-medium">{event.previous}</span></span>
          )}
          {event.actual != null && event.actual !== '' && (
            <span className="ml-2">
              実績{' '}
              <span style={{ color: actualHl?.color || colors.dot, fontWeight: 600 }}>
                {actualHl?.label && <span style={{ marginRight: 2, fontSize: 11 }}>{actualHl.label}</span>}
                {event.actual}
              </span>
            </span>
          )}
        </p>
      )}
    </div>
  );
}

const FILTER_STORAGE_KEY = 'bs_econoCalFilter';
const COUNTRY_STORAGE_KEY = 'bs_econoCalCountry';

export default function EconomicCalendarSection() {
  const [data, setData] = useState({ events: [], updated_at: null });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(() => {
    try {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY);
      return saved === 'all' ? 'all' : 'high';
    } catch {
      return 'high';
    }
  });
  // Y-2: 国フィルタ
  const [country, setCountry] = useState(() => {
    try {
      const saved = localStorage.getItem(COUNTRY_STORAGE_KEY);
      if (saved === 'US' || saved === 'JP' || saved === 'EU' || saved === 'all') return saved;
    } catch { /* ignore */ }
    return 'US';  // デフォルト US (リテンション直撃 = 米国市場の指標)
  });
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEconomicCalendar(7, filter === 'high' ? 'high' : null)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filter]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const handleFilterChange = (next) => {
    setFilter(next);
    try { localStorage.setItem(FILTER_STORAGE_KEY, next); } catch { /* ignore */ }
  };

  const handleCountryChange = (next) => {
    setCountry(next);
    try { localStorage.setItem(COUNTRY_STORAGE_KEY, next); } catch { /* ignore */ }
  };

  // 国フィルタ + 件数キャップ
  const visibleEvents = useMemo(() => {
    const filtered = (data.events || []).filter((e) => country === 'all' || e.country === country);
    return filtered.slice(0, filter === 'high' ? 16 : 30);
  }, [data.events, filter, country]);

  // 日付グルーピング (YYYY-MM-DD 単位)
  const grouped = useMemo(() => {
    const out = [];
    let lastKey = '';
    for (const ev of visibleEvents) {
      const k = dateKey(ev.date);
      if (k !== lastKey) {
        out.push({ type: 'header', key: k });
        lastKey = k;
      }
      out.push({ type: 'event', event: ev });
    }
    return out;
  }, [visibleEvents]);

  // 最も近い未来の HIGH イベントを「最注目」マークに (オブジェクトと key を別々に保持)
  const spotlightEvent = useMemo(() => {
    const now = Date.now();
    let best = null;
    let bestDiff = Infinity;
    for (const ev of visibleEvents) {
      if (ev.impact !== 'HIGH') continue;
      const t = new Date(ev.date).getTime();
      if (!Number.isFinite(t)) continue;
      const diff = t - now;
      if (diff > 0 && diff < bestDiff) {
        best = ev;
        bestDiff = diff;
      }
    }
    return best;
  }, [visibleEvents]);
  const highestEventKey = spotlightEvent ? `${spotlightEvent.event}-${spotlightEvent.date}` : null;
  const spotlightInfo = useMemo(
    () => (spotlightEvent ? translateEvent(spotlightEvent.event) : null),
    [spotlightEvent]
  );
  const spotlightTimeLabel = useMemo(() => {
    if (!spotlightEvent) return '';
    return formatJST(spotlightEvent.date);
  }, [spotlightEvent]);

  // P0-2: スクロール枠固定 + showFade パターン (NewsPanel 流用)
  const listScrollRef = useRef(null);
  const [showFade, setShowFade] = useState(false);
  const updateFadeState = () => {
    const el = listScrollRef.current;
    if (!el) { setShowFade(false); return; }
    const canScroll = el.scrollHeight > el.clientHeight + 1;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    setShowFade(canScroll && !atBottom);
  };
  useEffect(() => {
    // visibleEvents 変化後の再計算 (1 frame 遅延で DOM 反映待ち)
    const id = requestAnimationFrame(updateFadeState);
    return () => cancelAnimationFrame(id);
  }, [visibleEvents]);

  if (loading) {
    return <div className="h-32 rounded-2xl bg-slate-100 animate-pulse" />;
  }
  if (!data.events || data.events.length === 0) {
    return null;
  }

  return (
    <section
      className="panel-card rounded-2xl shadow-sm overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      aria-labelledby="econo-cal-heading"
    >
      <div className="px-6 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 id="econo-cal-heading" className="section-heading" style={{ margin: 0 }}>
            今週の経済指標
            <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
              FOMC・CPI・雇用統計など
            </span>
          </h3>
          <div role="tablist" aria-label="重要度フィルタ" className="flex items-center gap-1.5">
            <button
              role="tab"
              aria-selected={filter === 'high'}
              onClick={() => handleFilterChange('high')}
              className="tab-pill"
            >
              重要のみ
            </button>
            <button
              role="tab"
              aria-selected={filter === 'all'}
              onClick={() => handleFilterChange('all')}
              className="tab-pill"
            >
              すべて
            </button>
          </div>
        </div>
        {/* Y-2: 国フィルタ pill */}
        <div role="tablist" aria-label="国フィルタ" className="flex items-center gap-1.5 mt-2">
          {(['all', 'US', 'JP', 'EU']).map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={country === c}
              onClick={() => handleCountryChange(c)}
              className="tab-pill tab-pill-sm"
              title={c === 'all' ? 'すべての国' : COUNTRY_LABEL[c]}
            >
              {COUNTRY_PILL[c]}
            </button>
          ))}
        </div>
      </div>
      {visibleEvents.length === 0 ? (
        <p className="px-6 py-6 text-sm text-center" style={{ color: 'var(--text-muted)' }}>
          選択した条件のイベントはありません
        </p>
      ) : (
        <>
          {/* P0-6: ⭐ 最注目イベント大ピル (HIGH 中で最も近い未来 1 件、リテール層向けに「結局どれが今日効くか」明示) */}
          {spotlightEvent && (
            <div className="econo-cal-spotlight" role="region" aria-label="最注目イベント">
              <div className="econo-cal-spotlight-row">
                {/* F5 バグ修正: spotlightInfo.icon (undefined) → spotlightInfo.category.icon */}
                <span
                  className="econo-cal-spotlight-icon"
                  aria-hidden
                  title={spotlightInfo.category.label}
                >
                  {spotlightInfo.category.icon}
                </span>
                <div className="econo-cal-spotlight-body">
                  <div className="econo-cal-spotlight-meta">
                    <span className="econo-cal-spotlight-badge">⭐ 最注目</span>
                    <span className="econo-cal-spotlight-time">{spotlightTimeLabel}</span>
                  </div>
                  <p className="econo-cal-spotlight-title">{spotlightInfo.ja || spotlightInfo.en}</p>
                  {spotlightInfo.ja && spotlightInfo.ja !== spotlightInfo.en && (
                    <p className="econo-cal-spotlight-sub">{spotlightInfo.en}</p>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* F4: 「最注目」と「日付別」の視覚的区切り (Web 開発推奨の最小実装) */}
          {spotlightEvent && (
            <div className="econo-cal-list-heading" aria-hidden>
              📅 今週の予定
            </div>
          )}
          <div
            ref={listScrollRef}
            className={`econo-cal-list econo-cal-list-scroll bs-scroll-thin${showFade ? ' show-fade' : ''}`}
            role="region"
            aria-label="経済指標一覧"
            tabIndex={0}
            onScroll={updateFadeState}
          >
            {grouped.map((row, i) => {
              if (row.type === 'header') {
                return (
                  <div key={`h-${row.key}`} className="econo-cal-day-header">
                    {groupHeader(row.key)}
                  </div>
                );
              }
              const ev = row.event;
              const evKey = `${ev.event}-${ev.date}-${i}`;
              const isHighest = highestEventKey && `${ev.event}-${ev.date}` === highestEventKey;
              return <EventRow key={evKey} event={ev} isHighest={isHighest} />;
            })}
          </div>
        </>
      )}
    </section>
  );
}
