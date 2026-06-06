// ── FTD (Follow-Through Day, William O'Neil) 共有ロジック ──────────────
// v120 で Pane1MacroSection に実装した FTD chip / rail のロジックを v175 で中立ファイルに切り出し、
// ScreenerPane の「市場局面」 バナーと共有する (Pane 間結合を避けるため中立な features/workspace/ftd.js へ)。
// fetch は api.js の dedupGet / GET coalescing 層で重複吸収されるため、 複数 mount でも 1 本化される。
import { useEffect, useState } from 'react';
import { fetchFollowThroughDay } from '../../api.js';

// v120 hotfix: ^NDX は FMP Premium 限定 → ^IXIC (NASDAQ Composite) に切替
export const FTD_INDICES = ['^GSPC', '^IXIC', '^DJI'];

/** v120 hotfix v3 (user dogfood): FTD status を user 視点 4 段階 label に改善.
 *  「監視中」 / 「—」 だけだと「機能していない」 と誤解される (user feedback)。
 *  William O'Neil 理論の 4 段階 (上昇 / シグナル待ち / 安定 / データ不足) を明示。 */
export function ftdLabel(ftd) {
  if (!ftd) return { text: '—', tone: 'muted', tip: 'データ未取得' };
  switch (ftd.status) {
    case 'ftd_confirmed':
      return {
        text: `Day ${ftd.ftd_day_number} ✓ ${ftd.ftd_pct != null ? `+${ftd.ftd_pct.toFixed(1)}%` : ''}`.trim(),
        tone: 'gain',
        tip: `上昇トレンド入り確認 (Day ${ftd.ftd_day_number} で +${ftd.ftd_pct?.toFixed(1)}% 上昇 + 出来高増加)`,
      };
    case 'watching':
      return {
        text: 'シグナル待ち',
        tone: 'warning',
        tip: `上昇試行 ${ftd.rally_attempt_date} 開始、 Day 4-7 内に +1.7% 以上 + 出来高増加で FTD 確定`,
      };
    case 'no_attempt':
      return {
        text: '安定',
        tone: 'muted',
        tip: '直近 21 営業日内に 3 日連続下落 event なし (= 大きな調整局面なし、 上昇試行イベント無し)',
      };
    case 'insufficient_data':
      return { text: '—', tone: 'muted', tip: 'データ不足 (21 営業日未満)' };
    case 'error':
    default:
      return { text: '—', tone: 'muted', tip: 'データ取得エラー (FMP API)' };
  }
}

/** tone → CSS color token mapping (FtdRailDots / FtdChipRow / 市場局面バナー 共有) */
export function ftdToneColor(tone) {
  return tone === 'gain' ? 'var(--color-gain)'
       : tone === 'warning' ? 'var(--color-warning)'
       : 'var(--text-muted)';
}

/** v120 hotfix: FTD fetch logic を hook 化、 full mode + rail mode + screener banner で共有 (fetch 重複防止) */
export function useFtdMap() {
  const [ftdMap, setFtdMap] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all(FTD_INDICES.map((idx) => fetchFollowThroughDay(idx).catch(() => null)))
      .then((results) => {
        if (cancelled) return;
        const map = {};
        results.forEach((r, i) => { if (r) map[FTD_INDICES[i]] = r; });
        setFtdMap(map);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { ftdMap, loading };
}

// ── ScreenerPane「市場局面」 バナー用の 3 指数集約 (v175) ──────────────
// O'Neil の「市場底打ち」 はいずれか主要指数の Follow-Through Day で確認されるため、
// 3 指数 (S&P500 / NASDAQ / DJIA) の中で最も進んだ status を市場局面の代表に取る。
const FTD_STATUS_PRIORITY = { ftd_confirmed: 3, watching: 2, no_attempt: 1, insufficient_data: 0, error: 0 };

// §38 (断定的判断の提供) 回避: 静的 dict。 「買い / 売り / 今スキャンしろ」 等の action 断定は BAN、
//   price action の事実 + 出典 (O'Neil 理論) のみ。 ScreenerPane CUP_STATE_LABEL_JP と同 idiom。
const FTD_REGIME_LABEL_JP = {
  ftd_confirmed: '上昇トレンド入りのシグナル点灯',
  watching: '市場は反発を試行中',
  no_attempt: '大きな調整は出ていません',
  none: '市場局面を取得中',
};

/** 3 指数の ftdMap から市場局面の代表を 1 つに集約する (最強 status を代表に取る)。
 *  @param {Record<string, object>} ftdMap useFtdMap() の返り値
 *  @returns {{ status: string, tone: string, label: string, detail: string, indexName: string|null }}
 */
export function ftdRegime(ftdMap) {
  let best = null;
  let bestIdx = null;
  for (const idx of FTD_INDICES) {
    const ftd = ftdMap[idx];
    if (!ftd) continue;
    const pri = FTD_STATUS_PRIORITY[ftd.status] ?? 0;
    if (best == null || pri > (FTD_STATUS_PRIORITY[best.status] ?? 0)) {
      best = ftd;
      bestIdx = idx;
    }
  }
  // 全指数が insufficient_data / error / 未取得 → 局面不明
  if (!best || (FTD_STATUS_PRIORITY[best.status] ?? 0) === 0) {
    return { status: 'none', tone: 'muted', label: FTD_REGIME_LABEL_JP.none, detail: '', indexName: null };
  }
  const indexName = best.label_ja || bestIdx;
  const { tone } = ftdLabel(best); // Pane1 と色を一貫 (gain / warning / muted)
  let detail = '';
  if (best.status === 'ftd_confirmed') {
    detail = `${indexName} で Follow-Through Day 確定 (Day ${best.ftd_day_number})。 O'Neil 理論では下落相場の底打ち・新規上昇局面入りの確認シグナルです。`;
  } else if (best.status === 'watching') {
    detail = `${indexName} が上昇試行中。 Follow-Through Day はまだ確定していません。`;
  } else if (best.status === 'no_attempt') {
    detail = '主要指数に上昇試行イベントなし (通常局面)。';
  }
  return { status: best.status, tone, label: FTD_REGIME_LABEL_JP[best.status], detail, indexName };
}
