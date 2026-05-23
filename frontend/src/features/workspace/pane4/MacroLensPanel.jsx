/**
 * MacroLensPanel — Pane 4 ニュース一覧表示 component (v102 Sprint B-D)
 *
 * 抽出元: Pane4Inspector.jsx L424-449 (旧 internal NewsList)
 *
 * 機能: sorted ニュースを上位 30 件まで NewsItem で render。
 *   - loading + 空状態の placeholder text
 *   - jpEnabled で displayTitle (翻訳タイトル) 切替
 *   - selected.url で is-open highlight (Pane 3 NewsPanel 統合と等価)
 *
 * Props:
 *   sorted             Signal[]  - useSignalPipeline の sorted
 *   loading            boolean   - useNewsFeeds の loading
 *   jpEnabled          boolean   - useTranslation の jpEnabled
 *   titleTranslations  Object    - useTranslation の titleTranslations
 *   onSelect           (item)    - Reading Mode 切替 (store setActiveReadingItem)
 *   selected           Item|null - 現 reading 中 item
 */
import NewsItem from './NewsItem.jsx';

export default function MacroLensPanel({ sorted, loading, jpEnabled, titleTranslations, onSelect, selected }) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '8px 0 16px' }}>
      {loading && sorted.length === 0 ? (
        <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          ニュースを読込中...
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          該当ニュースなし
        </div>
      ) : (
        sorted.slice(0, 30).map((n, i) => (
          <NewsItem
            key={n.url || `${n.title}-${i}`}
            item={n}
            displayTitle={jpEnabled ? titleTranslations[n.url] : null}
            onSelect={onSelect}
            isOpen={selected?.url === n.url}
            index={i}
          />
        ))
      )}
    </div>
  );
}
