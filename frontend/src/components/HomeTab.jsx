import ChartTab from './ChartTab.jsx';
import Watchlist from './Watchlist.jsx';
import MoversCard from './MoversCard.jsx';

export default function HomeTab({ watchlist, onSelect, onRemove, onHover, onFocusSearch, onMove }) {
  return (
    <div className="space-y-6">
      {/* ── 急騰・急落 注目銘柄 ── */}
      <div className="rounded-2xl overflow-hidden shadow-sm"
           style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <MoversCard onSelect={onSelect} />
      </div>

      {/* ── ウォッチリスト チャート ── */}
      <ChartTab watchlist={watchlist} onSelect={onSelect} onMove={onMove} />

      {/* ── ウォッチリスト ── */}
      <section className="rounded-2xl p-6 shadow-sm"
               style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h3 className="mb-3 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          ウォッチリスト
        </h3>
        <Watchlist
          items={watchlist}
          onSelect={onSelect}
          onRemove={onRemove}
          onHover={onHover}
          onFocusSearch={onFocusSearch}
        />
      </section>
    </div>
  );
}
