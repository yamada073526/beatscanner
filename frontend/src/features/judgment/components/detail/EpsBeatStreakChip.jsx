/**
 * EpsBeatStreakChip — EPS 連続 Beat 期数を表示する小型 chip (v104 release MVP)
 *
 * 用途: 章 1 verdict header 横に「連続 N 期 Beat」 を一目で見せる。
 *   QuarterlyHistoryTable は accordion collapsed default で詳細は隠れているが、
 *   streak chip だけ前出しすることで「過去実績の anchor」 を Aman ロビーで明示。
 *
 * 表示条件: streak >= 2 のみ。 0-1 期は表示しない (anchor として弱い + visual noise 回避)
 *
 * Design: gain color (緑) 系の minimal chip、 12px font、 pill shape (radius 999)。
 *   ChartTab 凡例 / NewsItem 内 ticker chip と同 idiom。
 */
import { useEpsBeatStreak } from './useEpsBeatStreak.js';

export default function EpsBeatStreakChip({ ticker }) {
  const { streak, hasData } = useEpsBeatStreak(ticker, 8);

  if (!hasData || streak < 2) return null;

  return (
    <div style={{ padding: '4px 16px 8px', display: 'flex' }}>
      <span
        data-testid="eps-beat-streak-chip"
        aria-label={`EPS ${streak} 期連続 Beat`}
        title={`過去 ${streak} 四半期連続で EPS が市場予想を上回り (Beat)`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 999,
          border: '1px solid color-mix(in srgb, var(--color-gain) 45%, transparent)',
          background: 'color-mix(in srgb, var(--color-gain) 12%, transparent)',
          color: 'var(--color-gain)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.02em',
          lineHeight: 1.4,
          whiteSpace: 'nowrap',
        }}
      >
        <span aria-hidden style={{ fontSize: 9, opacity: 0.85 }}>●</span>
        <span>{streak}Q 連続 Beat</span>
      </span>
    </div>
  );
}
