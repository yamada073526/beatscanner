import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BookOpen, ArrowRight, Sparkles, X } from 'lucide-react';
import { generateVisualization } from '../../../../../api.js';

// DiagramCard は重量級 (52KB gzip 14KB)、 lazy load で初期 bundle 軽量化。
// banner expand 時に初回 mount され、 同銘柄を閉じる→開くしても unmount しない (mount 維持で cache 保護)。
const DiagramCard = lazy(() => import('../../../../../components/DiagramCard.jsx'));

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

  // ticker 変更時に vizData reset (別銘柄では再 fetch 必要)
  useEffect(() => {
    if (vizTicker !== ticker) {
      setVizData(null);
      setVizState('idle');
      setVizError(null);
      setVizTicker(ticker);
    }
  }, [ticker, vizTicker]);

  // expanded + 未 fetch + analysis 揃ったら fetch
  useEffect(() => {
    if (!expanded || !ticker || !analysis || vizState !== 'idle') return;
    setVizState('loading');
    const enrichedData = {
      ticker,
      company_name: analysis.companyName,
      fiscal_period: analysis.latestPeriod,
      verdict: analysis.overallPass ? 'PASS' : 'FAIL',
      passed_conditions: analysis.passedCount,
      conditions_detail: JSON.stringify(analysis.conditions ?? [], null, 2),
      metrics_trend: '',
      // v126 R15-1: 構造化 periods を送信、 backend FMP fetch 失敗時の trends fallback 用 (DiagramCard 決算図解 生成)
      periods: Array.isArray(analysis.periods) ? analysis.periods : [],
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
    };
    generateVisualization(ticker, enrichedData, 3)
      .then((json) => {
        setVizData(json);
        setVizState('done');
        setVizError(null);
      })
      .catch((err) => {
        setVizState('error');
        setVizError(err?.message || String(err));
      });
  }, [expanded, ticker, analysis, guidance, vizState]);

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
          <BookOpen size={18} strokeWidth={1.5} />
          <Sparkles size={10} strokeWidth={1.5} className="diagram-banner__sparkle" />
        </span>
        <span className="diagram-banner__text">
          <span className="diagram-banner__title">業績・ビジネス・強みを図解</span>
          <span className="diagram-banner__sub">7 セクションで銘柄の全体像を視覚化</span>
        </span>
        <span className="diagram-banner__arrow" aria-hidden="true">
          {expanded ? <X size={14} strokeWidth={1.5} /> : <ArrowRight size={14} strokeWidth={1.5} />}
        </span>
      </button>

      {/* Inline 展開 content: mount 維持 + display 切替で cache 保護 */}
      <div
        id="diagram-banner-content"
        className={`diagram-banner-content${expanded ? ' diagram-banner-content--expanded' : ''}`}
        aria-hidden={!expanded}
      >
        {expanded && (
          <>
            {vizState === 'loading' && (
              <div className="diagram-banner-loading">
                <span className="diagram-banner-loading__spinner" aria-hidden="true" />
                <span className="diagram-banner-loading__text">図解を生成中…</span>
              </div>
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
              <Suspense fallback={<div className="diagram-banner-loading"><span className="diagram-banner-loading__text">読み込み中…</span></div>}>
                <DiagramCard data={vizData} ticker={ticker} selectedYears={3} />
              </Suspense>
            )}
          </>
        )}
      </div>
    </div>
  );
}
