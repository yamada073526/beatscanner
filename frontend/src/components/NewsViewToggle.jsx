// 共通: ニュース表示方式 (list / grid) を切り替える Segmented Control
// Today's Brief / NewsPanel の双方で再利用可能。
// アイコン: SVG パスをインライン定義 (Lucide 等の依存ライブラリを増やさない)

function ListIcon(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function GridIcon(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </svg>
  );
}

export default function NewsViewToggle({ view, onChange }) {
  return (
    <div className="news-view-toggle" role="group" aria-label="表示方式">
      <button
        type="button"
        className={`view-toggle-btn${view === 'list' ? ' active' : ''}`}
        aria-pressed={view === 'list'}
        aria-label="縦列表示"
        title="縦列表示"
        onClick={() => onChange('list')}
      >
        <ListIcon />
      </button>
      <button
        type="button"
        className={`view-toggle-btn${view === 'grid' ? ' active' : ''}`}
        aria-pressed={view === 'grid'}
        aria-label="グリッド表示"
        title="グリッド表示"
        onClick={() => onChange('grid')}
      >
        <GridIcon />
      </button>
    </div>
  );
}
