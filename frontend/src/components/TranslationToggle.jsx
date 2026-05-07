// 翻訳 ON/OFF トグル (NewsPanel / TodaysBriefSection 共通)
// §11-B-5-B: ユーザー指摘 + UI/UX エージェント推奨で「日本語表示」→「JP」コンパクト化。
// モバイル 375px の controls 行の窮屈さを解消、Lucide Globe icon で意味補強。

import { Globe } from 'lucide-react';

export default function TranslationToggle({ enabled, onToggle, translating }) {
  return (
    <label
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        cursor: 'pointer', fontSize: '13px',
        color: 'var(--text-secondary)',
        userSelect: 'none',
      }}
      title={translating ? '日本語に翻訳しています' : (enabled ? '英語表示に切替' : '日本語表示に切替')}
    >
      <span
        className={`inline-flex items-center gap-1 ${translating ? 'translating-shimmer' : ''}`}
        style={{ whiteSpace: 'nowrap', fontSize: '12px', fontWeight: 500 }}
      >
        <Globe size={14} strokeWidth={2} aria-hidden />
        <span>JP</span>
      </span>
      <div
        role="switch"
        aria-checked={enabled}
        aria-label="日本語翻訳の切替"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        style={{
          width: '40px', height: '22px',
          borderRadius: '11px',
          background: enabled ? '#3b82f6' : 'var(--border)',
          position: 'relative',
          transition: 'background 0.2s',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute',
          top: '3px',
          left: enabled ? '21px' : '3px',
          width: '16px', height: '16px',
          borderRadius: '50%',
          background: '#ffffff',
          transition: 'left 0.2s',
        }} />
      </div>
    </label>
  );
}
