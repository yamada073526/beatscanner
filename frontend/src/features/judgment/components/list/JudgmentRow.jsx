import React from 'react';
import { GripVertical } from 'lucide-react';
import ConditionDots from '../../primitives/ConditionDots.jsx';
import RowSparkline from './RowSparkline.jsx';
import CompanyLogo from '../../../../components/CompanyLogo.jsx';
import { useWorkspaceStore } from '../../../../state/workspaceStore.js';

/**
 * JudgmentRow — Pane 2 / Pane 1 watchlist で使用する銘柄行.
 *
 * v62 WS-6 dogfood feedback (2026-05-10):
 *   - 企業ロゴを ticker 横に配置 (CompanyLogo: TV → FMP → 頭文字円 fallback)
 *   - 現在株価の下に前日比 +X.X% 縦並び併記
 *   - 旧 SPA ticker-row-v2 風の hover 演出を取り入れ:
 *     - 若干浮上 (translateY -1px)
 *     - 背景 tint: 保有 = ゴールド (#d4af37) / 非保有 = シアン
 *     - 左端 accent bar: 保有 = 常時ゴールド / 非保有 = hover 時のみシアン
 *     - drag handle (GripVertical) が hover で出現 (DnD 並び替え可能を示唆)
 *     - sparkline hover で微発光 (磨き込み済 magic moment)
 *   - 全 hover 演出は CSS class `.ws-judgment-row` で SSOT 化 (index.css)
 *
 * @param {object} props
 * @param {object} props.item - { ticker, companyName?, price?, changePct?, judgment?, isHolding, isWatchlist, nextEarningsDays? }
 * @param {boolean} props.selected
 * @param {(ticker: string) => void} props.onClick
 */
export default function JudgmentRow({ item, selected, onClick }) {
  const { ticker, companyName, price, changePct, judgment, isHolding } = item;
  const conditions = (judgment?.conditions || []).map((c) => Boolean(c?.passed));
  while (conditions.length < 5) conditions.push(false);

  const pane2Meta = useWorkspaceStore((s) => s.pane2Meta);
  const sparklinePeriod = useWorkspaceStore((s) => s.sparklinePeriod);

  const trendColor =
    changePct == null
      ? 'var(--text-muted)'
      : changePct > 0
        ? 'var(--color-gain)'
        : changePct < 0
          ? 'var(--color-loss)'
          : 'var(--text-muted)';

  // メタ表示 (右端 column): pane2Meta に応じて切替
  let metaCell;
  if (pane2Meta === 'change1d') {
    metaCell = (
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: trendColor,
          minWidth: 56,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {changePct == null ? '—' : `${changePct > 0 ? '+' : ''}${(changePct * 100).toFixed(2)}%`}
      </span>
    );
  } else if (pane2Meta === 'earnings') {
    const daysUntil = item.nextEarningsDays;
    metaCell = (
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: daysUntil != null && daysUntil <= 7 ? 'var(--color-warning)' : 'var(--text-muted)',
          padding: '2px 8px',
          borderRadius: 'var(--radius-pill, 9999px)',
          background: daysUntil != null && daysUntil <= 7 ? 'rgba(245,158,11,0.10)' : 'transparent',
          minWidth: 56,
          textAlign: 'center',
        }}
      >
        {daysUntil == null ? '—' : daysUntil === 0 ? '本日' : `あと${daysUntil}日`}
      </span>
    );
  } else if (pane2Meta === 'tag') {
    // v62 WS-Phase2: ユーザー設定タグ (パーソナライズ)
    const { tagName, tagColor } = item;
    if (!tagName) {
      metaCell = (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 56, textAlign: 'right' }}>
          (未タグ)
        </span>
      );
    } else {
      const dotColor = tagColor || 'rgb(56, 189, 248)';
      metaCell = (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-pill, 9999px)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            maxWidth: 100,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={`タグ: ${tagName}`}
        >
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: dotColor,
              flexShrink: 0,
            }}
          />
          {tagName}
        </span>
      );
    }
  } else {
    // default: ファンダメンタル5条件 dot
    metaCell = <ConditionDots conditions={conditions} size={7} gap={3} />;
  }

  const className = [
    'ws-judgment-row',
    isHolding ? 'is-holding' : '',
    selected ? 'is-active' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      onClick={() => onClick(ticker)}
      aria-current={selected ? 'true' : undefined}
      className={className}
    >
      {/* Col 0: drag handle (hover で出現、DnD 示唆。実 DnD は WS-Phase2) */}
      <span
        className="ws-row-handle"
        aria-hidden
        title="ドラッグで並び替え"
      >
        <GripVertical size={12} />
      </span>

      {/* Col 1: Logo + Ticker + Co.Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span className="ws-row-logo">
          <CompanyLogo ticker={ticker} size={28} />
        </span>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)',
            }}
          >
            {ticker}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              lineHeight: 1.3,
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {companyName || (judgment ? `${conditions.filter(Boolean).length}/5 条件合致` : '未分析')}
          </span>
        </div>
      </div>

      {/* Col 2: sparkline — §dogfood-pane2 round 7: インライン style display を撤去
          (CSS class .ws-row-sparkline の display:none を inline:inline-flex が上書きしていたバグ) */}
      <span className="ws-row-sparkline">
        <RowSparkline ticker={ticker} period={sparklinePeriod} />
      </span>

      {/* Col 3: $price (大) + change% (小) — 改善希望「現在株価の下に前日比 +X.X%」 */}
      <div
        className="ws-row-price"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 1,
          minWidth: 60,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.05,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {price == null ? '—' : `$${Number(price).toFixed(2)}`}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: trendColor,
            lineHeight: 1.05,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {changePct == null ? '—' : `${changePct > 0 ? '+' : ''}${(changePct * 100).toFixed(1)}%`}
        </span>
      </div>

      {/* Col 4: meta (5条件 dot / 1日% / 決算まで)
          §dogfood-pane2: ws-row-meta class で狭幅時に container query で非表示 */}
      <span className="ws-row-meta" style={{ display: 'inline-flex', alignItems: 'center' }}>
        {metaCell}
      </span>

      {/* Col 5: chevron */}
      <span
        aria-hidden
        style={{
          fontSize: 14,
          color: selected ? 'rgb(56, 189, 248)' : 'var(--text-muted)',
        }}
      >
        ›
      </span>
    </button>
  );
}
