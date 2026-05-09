import React, { useMemo } from 'react';
import Card from '../../primitives/Card.jsx';
import SectionHeader from '../../primitives/SectionHeader.jsx';

/**
 * 直近 N 四半期の EPS 棒グラフ.
 * design_system.md §B-4 数値フォーマット (EPS 2 桁) と
 * §1-A 色 (gain=緑、loss=赤) に準拠.
 *
 * 入力: result.periods 配列。各要素:
 *   { period: '2024Q3', revenue, eps, cfps?, shares_diluted? }
 *
 * 表示は最新 8 四半期に絞り、新しい順に右、古い順に左.
 */
export default function EarningsBars({ periods = [], currency = 'USD' }) {
  const view = useMemo(() => {
    if (!Array.isArray(periods)) return null;
    // 最新 8 四半期、配列の末尾が最新と仮定。複数 fallback を試す
    const recent = periods.slice(-8);
    if (recent.length === 0) return null;
    const epsValues = recent.map((p) => Number(p.eps) || 0);
    const max = Math.max(...epsValues.map(Math.abs), 0.01);
    return { items: recent, max, epsValues };
  }, [periods]);

  if (!view) {
    return (
      <Card>
        <div style={{ padding: 'var(--space-6, 24px)' }}>
          <SectionHeader id="sec-eps-bars" title="EPS 推移" label="QUARTERLY" />
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            データ取得中
          </div>
        </div>
      </Card>
    );
  }

  const positiveCount = view.epsValues.filter((v) => v > 0).length;
  const trendUp = view.epsValues.length >= 2 &&
    view.epsValues[view.epsValues.length - 1] > view.epsValues[0];

  return (
    <Card>
      <div style={{ padding: 'var(--space-6, 24px)' }}>
        <SectionHeader
          id="sec-eps-bars"
          title="EPS 推移"
          label={`${view.items.length}Q · ${currency}`}
          action={
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: trendUp ? 'var(--color-gain)' : 'var(--text-muted)',
              }}
            >
              {trendUp ? '↑ 改善傾向' : ''}
            </span>
          }
        />
        <div
          role="img"
          aria-label={`直近 ${view.items.length} 四半期の EPS、${positiveCount} 期が黒字`}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${view.items.length}, 1fr)`,
            gap: 8,
            alignItems: 'end',
            height: 140,
            marginTop: 12,
          }}
        >
          {view.items.map((p, i) => {
            const eps = Number(p.eps) || 0;
            const heightPct = Math.max(2, Math.abs(eps) / view.max * 100);
            const positive = eps >= 0;
            const color = positive ? 'var(--color-gain)' : 'var(--color-loss)';
            return (
              <div
                key={p.period || i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  height: '100%',
                  position: 'relative',
                }}
                title={`${p.period}: EPS ${eps.toFixed(2)}`}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    lineHeight: 1.05,
                    color: color,
                    marginBottom: 4,
                  }}
                >
                  {eps.toFixed(2)}
                </span>
                <div
                  style={{
                    width: '100%',
                    maxWidth: 36,
                    height: `${heightPct}%`,
                    minHeight: 2,
                    background: color,
                    opacity: 0.85,
                    borderRadius: 'var(--radius-xs)',
                    transition: 'height var(--motion-base, 200ms) var(--ease-out-expo)',
                  }}
                />
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${view.items.length}, 1fr)`,
            gap: 8,
            marginTop: 6,
          }}
        >
          {view.items.map((p, i) => (
            <div
              key={`label-${p.period || i}`}
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: 'var(--text-muted)',
                textAlign: 'center',
                letterSpacing: '0.02em',
              }}
            >
              {String(p.period || '').replace(/^20/, "'")}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
