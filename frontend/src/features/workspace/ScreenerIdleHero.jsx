/**
 * ScreenerIdleHero — screener master-detail の Pane3 idle (銘柄未選択時) placeholder。
 *
 * v250 refinement #6 (二重表示解消): 「今日の筆頭」は Pane2 (ScreenerTable の featured strip +
 *   表内 pin 行) に集約。Pane3 idle は「銘柄を選ぶと詳細」placeholder + 母集団統計に変更した。
 *   旧版は FeaturedCard/CompactRow で今日の筆頭を表示し Pane2 strip と二重 (= user dogfood 指摘) だった。
 *
 * 設計:
 *   - fetchScannerUniverse で母集団統計 (対象件数 / RS 中央値 / 鮮度) を表示 (原則2 データが動いている感)。
 *   - §38/§5: 統計は事実数値のみ。断定/最上級/買い場示唆なし。
 *   - 発光ゼロ (.panel-card/.bs-panel/.surface-card 不使用)。token のみ。raw hex 禁止。
 *   - master-detail 正道: idle は「一覧から選んで」と促す placeholder (Pane2 主役は WorkspaceShell の幅自動で担保)。
 *   - testid を loading/error/placeholder 全 render path に付与 (data-state)。
 */
import { useState, useEffect } from 'react';
import { Crown, ArrowLeft } from 'lucide-react';
import { fetchScannerUniverse } from '../../api.js';

// 鮮度表示 (as_of "YYYY-MM-DD" → 本日/昨日/N日前)。§38 日次粒度のみ ("X分前" 禁止)。
function formatAsOf(asOf) {
  if (!asOf) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(asOf);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - target) / 86400000);
  if (diffDays <= 0) return '本日更新';
  if (diffDays === 1) return '昨日更新';
  return `${diffDays}日前に更新`;
}

// 数値配列の中央値 (null/非有限は除外)。母集団 RS の体感統計用。
function median(nums) {
  const arr = nums.filter((n) => typeof n === 'number' && Number.isFinite(n)).sort((a, b) => a - b);
  if (arr.length === 0) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? Math.round(arr[mid]) : Math.round((arr[mid - 1] + arr[mid]) / 2);
}

/**
 * ScreenerIdleHero (Pane3 idle placeholder)
 * onSelect/onUpgrade は呼出側互換のため受け取るが、placeholder では使用しない
 * (銘柄選択は Pane2 一覧で行う = master-detail)。
 */
export default function ScreenerIdleHero() {
  const [stats, setStats] = useState({ loading: true, error: null, count: 0, rsMedian: null, asOf: null });

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        // api.js の fetchScannerUniverse は positional 引数 (universeSize)。dedup 60s で ScreenerTable と共有。
        const data = await fetchScannerUniverse(3000);
        if (ac.signal.aborted) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setStats({
          loading: false,
          error: null,
          count: items.length,
          rsMedian: median(items.map((it) => it.rs_percentile)),
          asOf: data?.as_of || null,
        });
      } catch (e) {
        if (ac.signal.aborted) return;
        setStats({ loading: false, error: String(e), count: 0, rsMedian: null, asOf: null });
      }
    })();
    return () => ac.abort();
  }, []);

  const { loading, error, count, rsMedian, asOf } = stats;
  const freshness = formatAsOf(asOf);

  return (
    <div
      data-testid="screener-idle-hero"
      data-state={loading ? 'loading' : error ? 'error' : 'placeholder'}
      className="screener-idle-placeholder"
    >
      <Crown size={28} strokeWidth={1.4} aria-hidden className="screener-idle-placeholder__icon" />
      <h3 className="screener-idle-placeholder__title">銘柄を選ぶと詳細が表示されます</h3>
      <p className="screener-idle-placeholder__guide">
        <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
        左の一覧から銘柄を選ぶと、決算サマリー・チャート・5条件がここに表示されます。
      </p>

      {/* 母集団統計 (原則2: データが動いている感、§38 事実数値のみ) */}
      {!loading && !error && (
        <div className="screener-idle-placeholder__stats" data-testid="idle-placeholder-stats">
          <span>対象 <strong>{count.toLocaleString()}</strong> 銘柄</span>
          {typeof rsMedian === 'number' && (
            <span>RS 中央値 <strong>{rsMedian}</strong></span>
          )}
          {freshness && <span>{freshness}</span>}
        </div>
      )}

      {/* featured 誘導 (Pane2 strip/pin への導線、銘柄名は出さず重複回避) */}
      <p className="screener-idle-placeholder__featured-note">
        「今日の筆頭」は一覧の最上部に
        <Crown size={11} strokeWidth={2} aria-hidden />
        で表示しています。
      </p>
    </div>
  );
}
