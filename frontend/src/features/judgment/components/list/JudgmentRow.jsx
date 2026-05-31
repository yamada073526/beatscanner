import React, { useMemo } from 'react';
import { Tag } from 'lucide-react';
import ConditionDots from '../../primitives/ConditionDots.jsx';
import { useRowSparkline } from './RowSparkline.jsx';
import CompanyLogo from '../../../../components/CompanyLogo.jsx';

/**
 * JudgmentRow — Pane 2 / Pane 1 watchlist で使用する銘柄行.
 *
 * v120 Sprint 2 (multi-review 6 体合議 verdict 反映):
 *   - sparkline 80×28 SVG 列を削除 (Pane 2 chrome 軽量化、 user dogfood 「意味ない」 指摘)
 *   - Col 3 を強化: 株価 14/700 + 1日% 12/600 + 1Y trend 10/trendColor の 3 段表示
 *   - null 時の em dash「—」 削除 (span hide で視覚 noise 排除)
 *   - Col 4 (meta): pane2Meta change1d ブランチを redundant 削除、 default 'condition' 固定
 *   - earnings / tag ブランチは UI 切替廃止のため事実上 unreachable (future migration risk 低減で残置)
 *
 * v62 WS-6 dogfood feedback (2026-05-10、 履歴):
 *   - 企業ロゴを ticker 横配置 (CompanyLogo: TV → FMP → 頭文字円 fallback)
 *   - 現在株価の下に前日比 +X.X% 縦並び併記
 *   - 旧 SPA ticker-row-v2 風の hover 演出 (translateY -1px / accent bar / magic moment)
 *
 * @param {object} props
 * @param {object} props.item - { ticker, companyName?, price?, changePct?, judgment?, isHolding, isWatchlist, nextEarningsDays? }
 * @param {boolean} props.selected
 * @param {(ticker: string) => void} props.onClick
 * @param {'condition'|'earnings'} [props.metaMode='condition'] - 右端 meta cell。 v143: sort='決算近' のとき
 *   JudgmentList から 'earnings' を渡し、 5 条件 dot の代わりに決算カウントダウンを表示。
 */
export default function JudgmentRow({ item, selected, onClick, metaMode = 'condition' }) {
  const { ticker, companyName, price, changePct, judgment, isHolding } = item;
  const conditions = (judgment?.conditions || []).map((c) => Boolean(c?.passed));
  while (conditions.length < 5) conditions.push(false);

  // v143: 右端 meta は metaMode prop で制御 (旧 pane2Meta store 参照を廃止、 sort 連動に変更)
  const pane2Meta = metaMode;
  // v120 Sprint 2: 1Y trend % を sparkline cache 経由で取得 (削除した sparkline 列の代替)
  // useRowSparkline は module-level cache + dedupe 済、 watchlist 5-20 ticker 同時参照でも 1 fetch
  const prices1y = useRowSparkline(ticker, '1y');
  const trend1yPct = useMemo(() => {
    if (!Array.isArray(prices1y) || prices1y.length < 2) return null;
    const first = prices1y[0];
    const last = prices1y[prices1y.length - 1];
    if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
    return ((last - first) / first) * 100;
  }, [prices1y]);

  const trendColor =
    changePct == null
      ? 'var(--text-muted)'
      : changePct > 0
        ? 'var(--color-gain)'
        : changePct < 0
          ? 'var(--color-loss)'
          : 'var(--text-muted)';

  const trend1yColor =
    trend1yPct == null
      ? 'var(--text-muted)'
      : trend1yPct > 0
        ? 'var(--color-gain)'
        : trend1yPct < 0
          ? 'var(--color-loss)'
          : 'var(--text-muted)';

  // v120 Sprint 2: meta cell 簡素化
  // - default 'condition': 5 条件 dot 表示 (主用途)
  // - 'change1d' は Col 3 と redundant のため削除済 (migrate v14 で reset)
  // - 'earnings' / 'tag' は UI 切替廃止のため事実上 unreachable、 future migration risk 低減で残置
  let metaCell;
  if (pane2Meta === 'earnings') {
    const daysUntil = item.nextEarningsDays;
    const isUrgent = daysUntil != null && daysUntil <= 7;
    metaCell = daysUntil == null ? null : (
      <span
        style={{
          fontSize: 12,
          fontWeight: isUrgent ? 700 : 500,
          color: isUrgent ? 'var(--color-warning)' : 'var(--text-secondary)',
          padding: isUrgent ? '2px 8px' : '0',
          borderRadius: isUrgent ? 'var(--radius-pill, 9999px)' : '0',
          background: isUrgent ? 'color-mix(in srgb, var(--color-warning) 10%, transparent)' : 'transparent',
          minWidth: 56,
          textAlign: 'center',
        }}
      >
        {daysUntil === 0 ? '本日' : `あと${daysUntil}日`}
      </span>
    );
  } else if (pane2Meta === 'tag') {
    const { tagName, tagColor } = item;
    metaCell = !tagName ? null : (
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
            background: tagColor || 'var(--color-accent)',
            flexShrink: 0,
          }}
        />
        {tagName}
      </span>
    );
  } else {
    // default: ファンダメンタル 5 条件 dot
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
      data-testid="ws-judgment-row"
    >
      {/* Col 0: v143 cluster 3 — 旧 drag handle slot を「タグ・保有編集」 button に置換 (hover-reveal)。
          row は <button> なので role=button span + stopPropagation で nested button 回避。
          bs:open:tagassign で App root の TagAssignSheet を起動 (bs:open:addtx と同 CustomEvent pattern)。 */}
      <span
        className="ws-row-tag-btn"
        role="button"
        aria-label="タグ・保有を編集"
        title="タグ・保有を編集"
        data-testid="ws-row-tag-btn"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          try {
            window.dispatchEvent(new CustomEvent('bs:open:tagassign', { detail: { ticker } }));
          } catch { /* noop */ }
        }}
      >
        <Tag size={13} strokeWidth={1.75} aria-hidden />
      </span>

      {/* Col 1: Logo + Ticker + Co.Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span className="ws-row-logo">
          <CompanyLogo ticker={ticker} size={28} />
        </span>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: '-0.01em',
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {ticker}
            </span>
          </span>
          {/* v120 hotfix (user dogfood Bug 2): 「未分析」 文字は冗長
              (右端の 5 条件 dot が全消し = 未分析 を visual で既に示している)。
              companyName があるときのみ表示、 無い + 未分析時は何も表示しない (空白で hint)。 */}
          {companyName && (
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
              {companyName}
            </span>
          )}
        </div>
      </div>

      {/* v120 Sprint 2: Col 2 (sparkline 80×28 SVG) 削除 — chrome 軽量化、 1Y trend は Col 3 に統合 */}

      {/* Col 3: $price (14/700) + 1日% (12/700 大) + 1Y trend (9/400 控えめ)
          v120 hotfix (user dogfood Bug 1): 1日% と 1Y trend が同サイズで 1日% が埋没していたため
          visual hierarchy 強化: 株価 > 1日% (主) >> 1Y trend (補助、 fontSize 縮小 + opacity 0.6 で控えめ)。
          null 時は span 自体 hide (em dash 廃止). */}
      <div className="ws-row-price">
        {price != null && (
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--text-primary)',
              lineHeight: 1.05,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {`$${Number(price).toFixed(2)}`}
          </span>
        )}
        {changePct != null && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: trendColor,
              lineHeight: 1.1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {`${changePct > 0 ? '+' : ''}${(changePct * 100).toFixed(2)}%`}
          </span>
        )}
        {trend1yPct != null && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 400,
              color: 'var(--text-muted)',
              lineHeight: 1.1,
              fontVariantNumeric: 'tabular-nums',
              opacity: 0.6,
              letterSpacing: '0.02em',
            }}
            title="1 年トレンド (期初比)"
          >
            {`1Y ${trend1yPct > 0 ? '▲' : trend1yPct < 0 ? '▼' : '—'}${Math.abs(trend1yPct).toFixed(1)}%`}
          </span>
        )}
      </div>

      {/* Col 4: meta (5条件 dot default、 earnings / tag は dead branch だが残置) */}
      {metaCell && <span className="ws-row-meta">{metaCell}</span>}

      {/* Col 5: chevron */}
      <span
        aria-hidden
        style={{
          fontSize: 14,
          color: selected ? 'var(--color-accent)' : 'var(--text-muted)',
        }}
      >
        ›
      </span>
    </button>
  );
}
