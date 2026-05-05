// 翻訳 ON/OFF トグル (NewsPanel / TodaysBriefSection 共通)
// 既存 NewsPanel のピル型スイッチを再利用可能にしたもの

export default function TranslationToggle({ enabled, onToggle, translating }) {
  return (
    <label
      style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        cursor: 'pointer', fontSize: '13px',
        color: 'var(--text-secondary)',
        userSelect: 'none',
      }}
    >
      <span
        className={translating ? 'translating-shimmer' : ''}
        style={{ whiteSpace: 'nowrap' }}
      >
        {translating ? '日本語に翻訳しています…' : '🌐 日本語表示'}
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
