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

// ── 「市場局面」 集約 (v175・2026-06-28 金融アナリスト review で再設計) ──────────────
// CAN-SLIM 主導指数 (グロース本命)。1 指数のみ confirmed なら NASDAQ を優先代表に取る。
const NASDAQ_INDEX = '^IXIC';

// §38 (断定的判断の提供) 回避: 静的 dict。 「買い / 売り / 今スキャンしろ」 等の action 断定は BAN、
//   price action の事実 + 出典 (O'Neil 理論) のみ。 ScreenerPane CUP_STATE_LABEL_JP と同 idiom。
// 2026-06-28 review 論点3: 「上昇トレンド入りのシグナル点灯」 は断定的将来予測寄り
//   (FTD は失敗率が無視できない指標) → 事実記述「上昇試行が確認水準に到達」 へ中立化。
const FTD_REGIME_LABEL_JP = {
  ftd_confirmed: '上昇試行が確認水準に到達',
  watching: '市場は反発を試行中',
  no_attempt: '大きな調整は出ていません',
  none: '市場局面を判定できません',
};

// SPEC §4 必須: 地合い表示には ⓘ 免責を併記 (金商法§38)。
export const FTD_REGIME_DISCLAIMER =
  '機械判定であり相場予測ではありません。FTD は下落相場の底打ちを観察する手がかりで、確認後に失敗する例もあります。';

/** 3 指数の ftdMap から市場局面を集約する。
 *  2026-06-28 金融アナリスト review 反映:
 *   - 論点2 (楽観バイアス除去): confirmed regime は「2 指数以上 confirmed」 または
 *     「NASDAQ (主導指数) confirmed」 のみ。1 指数のみ (NASDAQ 以外) confirmed は watching へ降格。
 *   - 論点5 (部分欠落の Trust Cliff): 有効指数 (error/insufficient/欠落でない) が 2 本未満なら
 *     breadth 不足で判定不能 (`none`)。1 指数だけ no_attempt で「平穏」 と誤表示しない。
 *  @param {Record<string, object>} ftdMap useFtdMap() の返り値
 *  @returns {{ status, tone, label, detail, indexName, confirmedCount, validCount, disclaimer }}
 */
export function ftdRegime(ftdMap) {
  const none = (label = FTD_REGIME_LABEL_JP.none) => ({
    status: 'none', tone: 'muted', label, detail: '',
    indexName: null, confirmedCount: 0, validCount: 0, disclaimer: FTD_REGIME_DISCLAIMER,
  });

  // 有効指数 = error / insufficient_data / 欠落 でないもの
  const valid = [];
  for (const idx of FTD_INDICES) {
    const ftd = ftdMap[idx];
    if (!ftd) continue;
    if (ftd.status === 'error' || ftd.status === 'insufficient_data') continue;
    valid.push({ idx, ftd });
  }
  // 論点5: breadth (市場の広がり) を見るため最低 2 指数が必要。2 本未満は判定不能。
  if (valid.length < 2) return none();

  const confirmed = valid.filter((v) => v.ftd.status === 'ftd_confirmed');
  const confirmedCount = confirmed.length;
  const nasdaq = confirmed.find((v) => v.idx === NASDAQ_INDEX) || null;
  const anyWatching = valid.some((v) => v.ftd.status === 'watching');
  const validCount = valid.length;

  let status, repr, indexName;
  // 論点2: confirmed は 2 指数以上 or NASDAQ confirmed のみ。
  if (confirmedCount >= 2 || nasdaq) {
    status = 'ftd_confirmed';
    repr = (nasdaq || confirmed[0]).ftd;
    indexName = repr.label_ja || (nasdaq || confirmed[0]).idx;
  } else if (confirmedCount === 1 || anyWatching) {
    // 1 指数のみ confirmed (NASDAQ 以外) or 上昇試行中 → 「試行中」 へ降格
    status = 'watching';
    const w = confirmed[0] || valid.find((v) => v.ftd.status === 'watching');
    repr = w.ftd;
    indexName = repr.label_ja || w.idx;
  } else {
    // 全 valid が no_attempt
    status = 'no_attempt';
    repr = valid[0].ftd;
    indexName = null;
  }

  const tone = status === 'ftd_confirmed' ? 'gain' : status === 'watching' ? 'warning' : 'muted';
  let detail = '';
  if (status === 'ftd_confirmed') {
    const pct = typeof repr.ftd_pct === 'number' ? `+${repr.ftd_pct.toFixed(1)}% 超・` : '';
    detail = `${indexName} で Day ${repr.ftd_day_number} に ${pct}出来高増の Follow-Through Day 条件を満たしました（3 指数中 ${confirmedCount} 指数）。`;
  } else if (status === 'watching') {
    detail = confirmedCount === 1
      ? `${indexName} で Follow-Through Day 条件を確認（1 指数のみ・他指数は未確認）。市場全体の確認には至っていません。`
      : '主要指数が上昇試行中。Follow-Through Day はまだ確認されていません。';
  } else if (status === 'no_attempt') {
    detail = '主要指数に上昇試行イベントは出ていません（通常局面）。';
  }

  return { status, tone, label: FTD_REGIME_LABEL_JP[status], detail, indexName, confirmedCount, validCount, disclaimer: FTD_REGIME_DISCLAIMER };
}
