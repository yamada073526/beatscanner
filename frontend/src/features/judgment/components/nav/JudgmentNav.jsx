import React, { useEffect, useState } from 'react';
import { useJudgment } from '../../state/JudgmentContext.jsx';

/**
 * Pane 1: Linear 流 240px サイドバー (判定タブ専用).
 *
 * - グループ filter (radio): すべて / 保有 / ウォッチ / 5 条件合致
 * - sort: 直近分析 / 条件合致 / ティッカー
 * - 折り畳み (localStorage 永続化)
 * - mobile (< md) では親側で非表示にする想定
 */

const LS_KEY = 'bs_judgment_nav_collapsed';

const GROUP_OPTIONS = [
  { key: 'all',       label: 'すべて',     icon: '◯' },
  { key: 'holdings',  label: '保有',       icon: '◆' },
  { key: 'watchlist', label: 'ウォッチ',   icon: '◇' },
  { key: 'all-pass',  label: '5 条件合致', icon: '✓' },
];

const SORT_OPTIONS = [
  { key: 'recent',     label: '直近分析' },
  { key: 'pass-count', label: '条件合致' },
  { key: 'ticker',     label: 'ティッカー' },
];

export default function JudgmentNav({ counts = {} }) {
  const { filters, setFilters } = useJudgment();
  const [collapsed, setCollapsedRaw] = useState(() => {
    try { return localStorage.getItem(LS_KEY) === '1'; } catch { return false; }
  });
  const setCollapsed = (next) => {
    setCollapsedRaw(next);
    try { localStorage.setItem(LS_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  };

  // collapse ボタンキーボード
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setCollapsed(!collapsed);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  const width = collapsed ? 56 : 240;

  return (
    <aside
      className="bs-panel ds-judgment-nav"
      aria-label="判定タブ ナビゲーション"
      style={{
        width,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 'calc(100vh - 200px)',
        overflow: 'hidden',
        transition: 'width var(--motion-base, 200ms) var(--ease-out-expo)',
      }}
    >
      {/* Header + collapse */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '12px 0' : '12px 14px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {!collapsed && (
          <h3
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              margin: 0,
            }}
          >
            判定リスト
          </h3>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'ナビ展開' : 'ナビ折り畳み'}
          title={`${collapsed ? '展開' : '折り畳み'} (⌘\\)`}
          style={{
            width: 24,
            height: 24,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-xs)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          {collapsed ? '▸' : '◂'}
        </button>
      </header>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: collapsed ? '8px 0' : '8px 0',
        }}
      >
        {/* Groups */}
        <div role="group" aria-label="グループフィルタ">
          {!collapsed && (
            <div
              style={{
                padding: '8px 14px 4px',
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              グループ
            </div>
          )}
          {GROUP_OPTIONS.map((g) => {
            const active = filters.group === g.key;
            const count = counts[g.key];
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => setFilters({ ...filters, group: g.key })}
                aria-pressed={active}
                title={collapsed ? g.label : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: collapsed ? 0 : 10,
                  width: '100%',
                  padding: collapsed ? '10px 0' : '8px 14px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  textAlign: 'left',
                  background: active ? 'var(--bg-hover)' : 'transparent',
                  borderLeft: active ? '2px solid rgb(56, 189, 248)' : '2px solid transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  transition: 'background var(--motion-fast, 120ms) var(--ease-out-expo)',
                }}
              >
                <span aria-hidden style={{ width: 14, textAlign: 'center', color: 'var(--text-muted)' }}>
                  {g.icon}
                </span>
                {!collapsed && <span style={{ flex: 1 }}>{g.label}</span>}
                {!collapsed && count != null && (
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      fontWeight: 500,
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sort */}
        {!collapsed && (
          <div role="group" aria-label="並び替え">
            <div
              style={{
                padding: '16px 14px 4px',
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              並び替え
            </div>
            {SORT_OPTIONS.map((s) => {
              const active = filters.sort === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setFilters({ ...filters, sort: s.key })}
                  aria-pressed={active}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    padding: '6px 14px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ width: 14, textAlign: 'center' }}>
                    {active ? '•' : ''}
                  </span>
                  <span style={{ marginLeft: 6 }}>{s.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer hint */}
      {!collapsed && (
        <footer
          style={{
            padding: '8px 14px',
            borderTop: '1px solid var(--border)',
            fontSize: 10,
            color: 'var(--text-muted)',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>⌘\</span>
          <span>折り畳み</span>
        </footer>
      )}
    </aside>
  );
}
