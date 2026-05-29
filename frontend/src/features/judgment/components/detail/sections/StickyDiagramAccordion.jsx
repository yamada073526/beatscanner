import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { BookOpen, ArrowRight, Sparkles, X } from 'lucide-react';
import { generateVisualization } from '../../../../../api.js';

// DiagramCard は重量級 (52KB gzip 14KB)、 lazy load で初期 bundle 軽量化。
// banner expand 時に初回 mount され、 同銘柄を閉じる→開くしても unmount しない (mount 維持で cache 保護)。
const DiagramCard = lazy(() => import('../../../../../components/DiagramCard.jsx'));

// v130 P0 #4: vizState loading 中 + Suspense fallback (lazy chunk 未 load 中) の双方で同一
// skeleton を共有することで「skeleton → 旧"読み込み中…" → DiagramCard」 の flicker を排除。
// v132 P1-B (user dogfood 5/30 「ずっと変わらない」): 3 段階 narration で「もう少しです」 感を演出。
//   0-3s: 「決算データを集めています…」 / 3-7s: 「AI が分析中…」 / 7s+: 「最終チェック中、 もう少しです」
const DIAGRAM_LOADING_STAGES = [
  { threshold: 0,    text: '決算データを集めています…' },
  { threshold: 3000, text: 'AI が業績ストーリーを分析中…' },
  { threshold: 7000, text: '最終チェック中、 もう少しです' },
];

function DiagramSkeleton() {
  const [stageIdx, setStageIdx] = useState(0);
  const startRef = useRef(null);
  useEffect(() => {
    startRef.current = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const next = DIAGRAM_LOADING_STAGES.findIndex(
        (s, i) => elapsed >= s.threshold && (i === DIAGRAM_LOADING_STAGES.length - 1 || elapsed < DIAGRAM_LOADING_STAGES[i + 1].threshold)
      );
      if (next >= 0) setStageIdx(next);
    }, 500);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="diagram-skel" aria-busy="true" aria-label="図解を生成中">
      <div className="diagram-skel__caption">
        <span className="diagram-skel__spinner" aria-hidden="true" />
        {DIAGRAM_LOADING_STAGES[stageIdx].text}
      </div>
      <div className="skel-base diagram-skel__headline" />
      <div className="diagram-skel__cond-grid">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skel-base diagram-skel__cond" style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </div>
      <div className="skel-base diagram-skel__main" style={{ animationDelay: '0.1s' }} />
      <div className="diagram-skel__two-col">
        <div className="skel-base diagram-skel__half" />
        <div className="skel-base diagram-skel__half" style={{ animationDelay: '0.18s' }} />
      </div>
      <div className="diagram-skel__two-col">
        <div className="skel-base diagram-skel__sm" />
        <div className="skel-base diagram-skel__sm" style={{ animationDelay: '0.15s' }} />
      </div>
    </div>
  );
}

/**
 * v126 R11-1: 図解 inline 展開 banner (sub-agent verdict 案 1 推奨)。
 *
 * 旧版 (R7-2): click で AI 詳細レポートへ scroll → user feedback「行ったり来たり面倒、 inline で展開してほしい」
 * 新版 (R11-1):
 *   - click で **banner 直下に DiagramCard が inline 展開**
 *   - 閉じる X button が expanded 時 header 右に visible
 *   - mount 維持 ([[feedback-diagram-card-remount-cache]] 遵守): expand/collapse は内部 visibility のみ、 vizData state 保持
 *   - scroll 不要、 page context 維持
 *
 * DiagramCard 2 instance 問題 (Phase 4-B SPEC §5 で deferred とした問題):
 *   - 既存 DetailReport.jsx 内にも DiagramCard が render される (legacy compat)
 *   - 本 banner が新規 1 instance を mount = 2 instance 状態
 *   - **mount 維持**で cache 破壊なし、 Claude API prompt cache (ticker base) で実 cost 1 倍
 *   - 完全な 1 mount 化は workspaceStore lift up + DetailReport refactor 必要 (1.5 人日)、 次 sprint で検討
 */
export default function StickyDiagramAccordion({ ticker, analysis, guidance }) {
  const [expanded, setExpanded] = useState(false);
  const [vizData, setVizData] = useState(null);
  const [vizState, setVizState] = useState('idle'); // 'idle' | 'loading' | 'done' | 'error'
  const [vizError, setVizError] = useState(null);
  const [vizTicker, setVizTicker] = useState(null);
  // v127 R16 (user dogfood): 表示期間 1Y/3Y/5Y toggle と連動。旧版は selectedYears=3 ハードコード +
  // onYearsChange 未配線で toggle が no-op だった (trends が年切替で変わらない bug)。
  const [selectedYears, setSelectedYears] = useState(3);

  // ticker 変更時に vizData reset (別銘柄では再 fetch 必要)
  useEffect(() => {
    if (vizTicker !== ticker) {
      setVizData(null);
      setVizState('idle');
      setVizError(null);
      setVizTicker(ticker);
      setSelectedYears(3); // 別銘柄では default 3 に戻す
    }
  }, [ticker, vizTicker]);

  // v127 R16: enrichedData 構築を共通化 (初回 fetch + 年切替 re-fetch で再利用)。
  const buildEnriched = useCallback(() => ({
    ticker,
    company_name: analysis?.companyName,
    fiscal_period: analysis?.latestPeriod,
    verdict: analysis?.overallPass ? 'PASS' : 'FAIL',
    passed_conditions: analysis?.passedCount,
    conditions_detail: JSON.stringify(analysis?.conditions ?? [], null, 2),
    metrics_trend: '',
    // v126 R15-1: 構造化 periods を送信、 backend FMP fetch 失敗時の trends fallback 用 (DiagramCard 決算図解 生成)
    periods: Array.isArray(analysis?.periods) ? analysis.periods : [],
    guidance: guidance ? JSON.stringify(guidance, null, 2) : 'データなし',
    conference_call_points: 'データなし',
    ai_summary: '',
    beat_miss: {
      eps: {
        actual: guidance?.eps?.actual ?? null,
        estimated: guidance?.eps?.estimated ?? null,
        verdict: guidance?.eps?.verdict ?? null,
      },
      revenue: {
        actual: guidance?.revenue?.actual ?? null,
        estimated: guidance?.revenue?.estimated ?? null,
        verdict: guidance?.revenue?.verdict ?? null,
      },
    },
  }), [ticker, analysis, guidance]);

  // 初回 fetch (banner 展開時): vizState を loading→done で遷移 (DiagramCard を新規 mount)。
  const fetchViz = useCallback((years) => {
    if (!ticker || !analysis) return;
    setVizState('loading');
    generateVisualization(ticker, buildEnriched(), years)
      .then((json) => { setVizData(json); setVizState('done'); setVizError(null); })
      .catch((err) => { setVizState('error'); setVizError(err?.message || String(err)); });
  }, [ticker, analysis, buildEnriched]);

  // v127 R16 (user dogfood): 年切替は「数字で見る成長ストーリー (trends) だけ差し替え」。
  // vizState を loading に落とさず DiagramCard を mount 維持したまま background re-fetch し、
  // trends 系 field のみ merge する。これで (1) 図解が一旦閉じて scroll が飛ぶ問題を解消、
  // (2) narration は再生成せず「数値部分だけ変わる」体験になる。失敗時は既存図解を維持。
  const refetchTrendsForYear = useCallback((years) => {
    if (!ticker || !analysis) return;
    setSelectedYears(years); // 年トグルの選択 highlight は即時更新 (click feedback)
    generateVisualization(ticker, buildEnriched(), years)
      .then((json) => {
        setVizData((prev) => (prev ? {
          ...prev,
          trends: json.trends,
          fcfTrend: json.fcfTrend,
          capexTrend: json.capexTrend,
          operatingMargins: json.operatingMargins,
          fcfDataAvailable: json.fcfDataAvailable,
          fcfYield: json.fcfYield,
        } : json));
      })
      .catch(() => { /* 年切替の失敗は無視 (既存図解を維持) */ });
  }, [ticker, analysis, buildEnriched]);

  // expanded + 未 fetch + analysis 揃ったら fetch (現在の selectedYears で)
  useEffect(() => {
    if (!expanded || vizState !== 'idle') return;
    fetchViz(selectedYears);
  }, [expanded, vizState, selectedYears, fetchViz]);

  const handleToggle = () => {
    setExpanded((v) => !v);
  };

  return (
    <div className="diagram-banner-wrap" data-testid="sticky-diagram-accordion">
      <button
        type="button"
        className={`diagram-banner${expanded ? ' diagram-banner--expanded' : ''}`}
        onClick={handleToggle}
        aria-expanded={expanded}
        aria-controls="diagram-banner-content"
        aria-label={expanded ? '図解を閉じる' : '図解を見る'}
      >
        <span className="diagram-banner__icon-wrap" aria-hidden="true">
          {/* v132 P1-E PART1 (ui-designer verdict APPROVE、 5/30 user dogfood「模範解答準拠」):
              18→22 大型化 + Aman 真鍮プレート icon-wrap 40→44 + radius 8→12 で「凝った作り」 強化 */}
          <BookOpen size={22} strokeWidth={1.4} />
          <Sparkles size={11} strokeWidth={1.5} className="diagram-banner__sparkle" />
        </span>
        {/* v132 P1-E PART1: 2 段 hierarchy 復活、 「図解」 大 (17px fw700) + sub 小・薄 (11px text-muted)
            で視線の落差を演出。 v130 P1 #8 の 1 行統合は cognitive context 不足 (user dogfood)。 */}
        <span className="diagram-banner__text">
          <span className="diagram-banner__title">図解</span>
          <span className="diagram-banner__sub">業績・ビジネス・強みを視覚化</span>
        </span>
        {/* v132 P0-D (user dogfood 5/30): expanded 時の X icon は冗長 (banner 自体が toggle)、
            ArrowRight (→) のみ表示し、 展開時は rotate で下向き (▽) を表現する代替も検討したが、
            シンプルに展開時は arrow を hide で「アイコンなし」 にして CLS / 装飾過多を回避。 */}
        {!expanded && (
          <span className="diagram-banner__arrow" aria-hidden="true">
            <ArrowRight size={14} strokeWidth={1.5} />
          </span>
        )}
      </button>

      {/* Inline 展開 content: mount 維持 + display 切替で cache 保護 */}
      <div
        id="diagram-banner-content"
        className={`diagram-banner-content${expanded ? ' diagram-banner-content--expanded' : ''}`}
        aria-hidden={!expanded}
      >
        {expanded && (
          <>
            {/* v127 R16 (user dogfood「視覚的な動きがなく体感が長い」): spinner+text →
                図解レイアウトを模した skeleton + shimmer (既存 .skel-base / skelShimmer 再利用)。
                stagger animationDelay で光が順次流れ、 ~10s 生成中も視覚的な変化が続く。
                v130 P0 #4 (user dogfood 5/30): vizState loading→done 遷移で Suspense fallback
                の旧「読み込み中…」 が一瞬挟まる flicker を skeleton 共通化で解消。 */}
            {(vizState === 'loading' || (vizState === 'done' && !vizData)) && (
              <DiagramSkeleton />
            )}
            {vizState === 'error' && (
              <div className="diagram-banner-error">
                <p>図解の生成に失敗しました。</p>
                {vizError && <p style={{ fontSize: 11, opacity: 0.7 }}>{vizError}</p>}
                <button
                  type="button"
                  onClick={() => { setVizState('idle'); setVizError(null); }}
                  className="diagram-banner-error__retry"
                >
                  再試行
                </button>
              </div>
            )}
            {vizState === 'done' && vizData && (
              <Suspense fallback={<DiagramSkeleton />}>
                <DiagramCard
                  data={vizData}
                  ticker={ticker}
                  selectedYears={selectedYears}
                  onYearsChange={refetchTrendsForYear}
                />
              </Suspense>
            )}
          </>
        )}
      </div>
    </div>
  );
}
