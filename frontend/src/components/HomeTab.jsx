import { useEffect, useRef, useState } from 'react';
import ChartTab from './ChartTab.jsx';
import Watchlist from './Watchlist.jsx';
import MoversCard from './MoversCard.jsx';
import DiagramCard from './DiagramCard.jsx';
import {
  DEMO_VIZ_DATA_1Y, DEMO_VIZ_DATA_3Y, DEMO_VIZ_DATA_5Y, DEMO_TICKER,
} from '../data/demoVizData.js';

const DEMO_DATA_BY_YEARS = {
  1: DEMO_VIZ_DATA_1Y,
  3: DEMO_VIZ_DATA_3Y,
  5: DEMO_VIZ_DATA_5Y,
};

export default function HomeTab({
  watchlist, onSelect, onRemove, onHover, onFocusSearch, onMove,
  analysis, user,
}) {
  // 未ログイン かつ 検索結果なし のときのみデモ図解を表示
  // ログイン済みユーザーには Watchlist が先頭に来る（既存の順序がそのまま該当）
  const showDemo = !analysis && !user;
  const [demoYears, setDemoYears] = useState(3);
  const currentDemoData = DEMO_DATA_BY_YEARS[demoYears] ?? DEMO_VIZ_DATA_3Y;

  // ── 1Y/3Y/5Y セレクターの初回オートデモ + コーチマーク ───────────────
  // R2v3: ヒントテキスト → ボタン直上の吹き出し（初回のみ・localStorage 制御）
  const userInteractedRef = useRef(false);  // 手動クリック検知
  const hasRunRef = useRef(false);          // 初回1度のみ実行
  const animTimersRef = useRef([]);         // 進行中タイマーの追跡（クリーンアップ用）
  const [showCoach, setShowCoach] = useState(false);

  // 手動クリック時：アニメ停止 + コーチ消去 + 実値反映
  const handleDemoYearsChange = (y) => {
    userInteractedRef.current = true;
    animTimersRef.current.forEach(clearTimeout);
    animTimersRef.current = [];
    setShowCoach(false);
    setDemoYears(y);
  };

  // DiagramCard 側 IntersectionObserver から呼ばれる（80% 可視で1回のみ）
  const handleSelectorVisible = () => {
    if (hasRunRef.current) return;
    if (userInteractedRef.current) return;
    hasRunRef.current = true;

    // 初回訪問時のみコーチマークを表示
    let firstVisit = false;
    try {
      firstVisit = !localStorage.getItem('coachShown');
      if (firstVisit) localStorage.setItem('coachShown', 'true');
    } catch {
      // localStorage 不可環境（プライベートモード等）はスキップ
      firstVisit = false;
    }
    if (firstVisit) setShowCoach(true);

    const schedule = (delay, fn) => {
      const id = setTimeout(() => {
        if (userInteractedRef.current) return;
        fn();
      }, delay);
      animTimersRef.current.push(id);
    };

    // 0s→1Y, 1s→3Y, 2s→5Y, 2.5s→3Yに戻し（アニメ完了）, 4.5s→コーチ非表示（完了+2s）
    schedule(0,    () => setDemoYears(1));
    schedule(1000, () => setDemoYears(3));
    schedule(2000, () => setDemoYears(5));
    schedule(2500, () => setDemoYears(3));
    schedule(4500, () => setShowCoach(false));
  };

  // アンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      animTimersRef.current.forEach(clearTimeout);
      animTimersRef.current = [];
    };
  }, []);

  return (
    <div className="space-y-8" style={{ marginTop: '16px' }}>
      {/* ── トップページデモ図解（初訪問時のみ）── */}
      {showDemo && (
        <section>
          <style>{`
            @keyframes demo-arrow-blink {
              0%, 100% { opacity: 1; }
              50%      { opacity: 0.4; }
            }
            .demo-banner-arrow {
              animation: demo-arrow-blink 1.5s ease-in-out infinite;
            }
          `}</style>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 14px', marginBottom: '12px',
              borderRadius: '10px',
              background: 'rgba(56,189,248,0.10)',
              border: '1px solid rgba(56,189,248,0.30)',
              fontSize: '13px', color: '#0369A1', fontWeight: 600,
              lineHeight: 1.5,
            }}
          >
            <span
              className="demo-banner-arrow"
              style={{ fontSize: '16px', fontWeight: 800, color: '#38BDF8' }}
              aria-hidden="true"
            >
              ↑
            </span>
            <span>
              ティッカーを入力すると、下のような分析結果があなたの銘柄で生成されます
            </span>
          </div>
          {/* 既存 .panel-card のフチ発光・lift を流用するためのラッパー。
              ダークモードでは [data-theme="dark"] .panel-card にも border が
              当たり、DiagramCard 自身の border と二重線になるため inline で
              ラッパー側のみ border を無効化する（hover 発光は box-shadow の
              outer ring が担うので影響なし）。 */}
          <div
            className="panel-card"
            style={{ borderRadius: '12px', border: 'none' }}
          >
            <DiagramCard
              data={currentDemoData}
              ticker={DEMO_TICKER}
              selectedYears={demoYears}
              onYearsChange={handleDemoYearsChange}
              showCoach={showCoach}
              onSelectorVisible={handleSelectorVisible}
            />
          </div>
        </section>
      )}

      {/* ── ウォッチリスト ── */}
      <section className="panel-card rounded-2xl p-6 shadow-sm"
               style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h3 className="mb-3 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          ウォッチリスト
        </h3>
        {watchlist.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: '8px', padding: '16px 0', textAlign: 'center',
          }}>
            <span style={{ fontSize: '28px' }}>★</span>
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>
              ウォッチリストはまだ空です
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              銘柄を分析して「★ ウォッチに追加」で登録できます
            </p>
            <button
              onClick={() => onSelect?.('AAPL')}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(56,189,248,0.15)';
                e.currentTarget.style.borderColor = 'rgba(56,189,248,0.70)';
                e.currentTarget.style.color = 'rgb(14,165,233)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              style={{
                marginTop: '4px',
                padding: '8px 20px',
                borderRadius: '999px',
                border: '1.5px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s, color 0.15s',
              }}
            >
              まず AAPL で試してみましょう →
            </button>
          </div>
        ) : (
          <Watchlist
            items={watchlist}
            onSelect={onSelect}
            onRemove={onRemove}
            onHover={onHover}
            onFocusSearch={onFocusSearch}
          />
        )}
      </section>

      {/* ── 急騰・急落 注目銘柄 ── */}
      <div className="panel-card rounded-2xl shadow-sm"
           style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="rounded-2xl overflow-hidden">
          <MoversCard onSelect={onSelect} />
        </div>
      </div>

      {/* ── ウォッチリスト チャート ── */}
      <ChartTab watchlist={watchlist} onSelect={onSelect} onMove={onMove} />
    </div>
  );
}
