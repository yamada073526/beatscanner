import React, { useState } from 'react';
import { ChevronDown, BookOpen } from 'lucide-react';

/**
 * v125 P8-3 Sprint B: 図解 sticky accordion (default-collapsed = OFF)。
 *
 * SPEC §5 Phase 4-B 案 B (user gate 3 確定):
 *   - user 指示「メインは Chart、 図解は 2 回目以降しつこい → default OFF」
 *   - click で expand、 中身は「AI 詳細レポートを開くと自動で図解が生成されます」 + anchor link
 *
 * NOTE: 真の DiagramCard mount 維持 ([[feedback-diagram-card-remount-cache]] 完全準拠) は
 * DetailReport.jsx 内部からの vizData lift up が必要で大規模 refactor。 本 sprint は wrapper のみで、
 * DiagramCard 物理 mount は ContextSection 内 DetailReport accordion 経由のまま (Phase 4-B 後続 sprint で物理分離)。
 *
 * 配置: Pane 3 最上位 (Hero 直前)。 sticky は top:0、 z-index は検索 bar より下 (40)。
 * accordion 状態は localStorage で永続化しない (default OFF をユーザーが click で都度 expand)。
 */
export default function StickyDiagramAccordion() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="sticky-diagram-accordion"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: 'var(--bg-elevated, var(--bg-subtle))',
        borderRadius: 'var(--radius-md, 8px)',
        border: '1px solid var(--border, rgba(255,255,255,0.08))',
        marginBottom: 'var(--space-4, 16px)',
      }}
      data-testid="sticky-diagram-accordion"
    >
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-controls="sticky-diagram-accordion-content"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3, 12px)',
          width: '100%',
          padding: 'var(--space-3, 12px) var(--space-4, 16px)',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        <BookOpen size={16} strokeWidth={1.5} style={{ color: 'var(--color-accent)' }} />
        <span style={{ flex: 1 }}>図解 — AI 解説</span>
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            letterSpacing: '0.04em',
          }}
        >
          {isOpen ? '閉じる' : '開く'}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          style={{
            color: 'var(--text-muted)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms ease',
          }}
        />
      </button>

      {isOpen && (
        <div
          id="sticky-diagram-accordion-content"
          style={{
            padding: 'var(--space-2, 8px) var(--space-4, 16px) var(--space-4, 16px)',
            borderTop: '1px solid var(--border, rgba(255,255,255,0.05))',
            color: 'var(--text-secondary)',
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          <p style={{ margin: 0 }}>
            下の「AI 詳細レポート」 を開くと、 図解 (5 条件 × 業績推移) が自動で生成されます。
          </p>
          <a
            href="#sec-report"
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById('sec-report');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2, 8px)',
              marginTop: 'var(--space-3, 12px)',
              fontSize: 12,
              color: 'var(--color-accent)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            AI 詳細レポートへ →
          </a>
        </div>
      )}
    </div>
  );
}
