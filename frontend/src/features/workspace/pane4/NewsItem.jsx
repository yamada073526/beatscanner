/**
 * Pane 4 ニュース 1 行コンポーネント.
 * v65 §C-3 で Pane4Inspector.jsx から分離.
 */
import { useState } from 'react';
import CompanyLogo from '../../../components/CompanyLogo.jsx';
import {
  CATEGORY_ICON,
  attentionLevel,
  freshnessStatus,
  getNewsColors,
  pickPrimaryCategory,
} from './format.js';

export default function NewsItem({ item, displayTitle, onSelect, isOpen, index }) {
  const cat = pickPrimaryCategory(item);
  const colors = getNewsColors(item.importance, cat);
  const Icon = cat ? CATEGORY_ICON[cat] : null;
  const hasImage = !!(item.image && String(item.image).trim());
  const [imgError, setImgError] = useState(false);
  const isHolding = item._holdingHits?.length > 0;
  const isWatch = !isHolding && item._watchHits?.length > 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-pressed={isOpen}
      className={`ws-pane4-news-item${isOpen ? ' is-open' : ''}${isHolding ? ' is-holding' : ''}${isWatch ? ' is-watch' : ''}`}
      style={{
        '--row-delay': `${Math.min(index, 8) * 40}ms`,
        position: 'relative',
        display: 'flex',
        gap: 8,
        width: 'calc(100% - 8px)',
        textAlign: 'left',
        padding: '6px 10px 6px 12px',
        margin: '3px 4px',
        borderRadius: 'var(--radius-md, 10px)',
        border: '1px solid var(--border)',
        background: 'transparent',
        color: 'var(--text-primary)',
        cursor: 'pointer',
      }}
    >
      {/* §round17/23: 左端 accent bar (attention level で高さ可変) */}
      {(() => {
        const lvl = attentionLevel(item.cluster_size);
        const inset = `${(1 - lvl) * 40}%`;
        return (
          <span
            aria-hidden
            className="ws-pane4-accent-bar"
            title={`注目度: ${item.cluster_size || 1} 媒体`}
            style={{
              position: 'absolute',
              left: 0,
              top: inset,
              bottom: inset,
              width: 2.5,
              borderRadius: '0 2px 2px 0',
              background: colors.bar,
              opacity: 0.6 + 0.4 * lvl,
            }}
          />
        );
      })()}
      {hasImage && !imgError ? (
        <img
          src={item.image}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImgError(true)}
          style={{
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: 6,
            objectFit: 'cover',
            background: 'var(--bg-subtle)',
          }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: colors.bg,
            color: colors.fg,
          }}
        >
          {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden />}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
          {cat && cat !== '登録銘柄' && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                padding: '1px 6px',
                borderRadius: 4,
                background: colors.bg,
                color: colors.fg,
                textTransform: 'uppercase',
              }}
            >
              {Icon && <Icon size={10} strokeWidth={2.25} aria-hidden />}
              <span>{item.importance === 'HIGH' ? `HIGH · ${cat}` : cat}</span>
            </span>
          )}
          {(isHolding || isWatch) && (() => {
            const hits = isHolding ? item._holdingHits : item._watchHits;
            const main = hits[0];
            return (
              <span
                title={`${isHolding ? '保有' : 'ウォッチ'}銘柄: ${hits.join(', ')}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <CompanyLogo ticker={main} size={16} />
                <span
                  className="ws-pane4-ticker"
                  style={{
                    color: isHolding ? 'rgb(212,175,55)' : 'rgb(56,189,248)',
                  }}
                >
                  {main}
                </span>
                {hits.length > 1 && (
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                    +{hits.length - 1}
                  </span>
                )}
              </span>
            );
          })()}
          {item.source && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              · {item.source}
            </span>
          )}
          {(() => {
            const f = freshnessStatus(item.published);
            if (!f.label) return null;
            const isLive = f.tone === 'live';
            const isStale = f.tone === 'stale';
            const color =
              isLive ? 'rgb(34,197,94)'
              : f.tone === 'fresh' ? 'rgb(56,189,248)'
              : isStale ? 'rgb(245,158,11)'
              : 'var(--text-muted)';
            return (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 10,
                  fontWeight: isLive || isStale ? 700 : 500,
                  color,
                  letterSpacing: isLive ? '0.04em' : 0,
                }}
              >
                {isLive && (
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'rgb(34,197,94)',
                      animation: 'ws-pane4-live-pulse 1.4s ease-in-out infinite',
                    }}
                  />
                )}
                {f.label}
              </span>
            );
          })()}
        </div>
        <div
          className="ws-pane4-news-title"
          style={{
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1.35,
            color: 'var(--text-primary)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {displayTitle || item.title}
        </div>
      </div>
    </button>
  );
}
