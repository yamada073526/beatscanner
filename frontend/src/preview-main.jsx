/**
 * preview-main.jsx — AI 図解 (DiagramCard) 視覚検証ハーネスの entry。
 *
 * ## 役割
 * DiagramCard を MotionProvider で wrap して固定 FIXTURE でレンダーするだけの最小 entry。
 * 本番 SPA (main.jsx) とは完全に独立。 vite.preview.config.mjs でこの entry を build し、
 * .preview-dist/preview.html を file:// で開いて snap-diagram.mjs が screenshot を撮る。
 *
 * ## ⚠️ MotionProvider 必須 ([[feedback_pane_error_boundary]])
 * DiagramCard は内部で m.* (framer-motion / LazyMotion) を使う。 MotionProvider (LazyMotion) の
 * scope 外でレンダーすると initial opacity:0 のまま固着し「DOM にはあるが恒久不可視」になる。
 * DiagramCard は self-contained に MotionProvider を local wrap しているが、 ハーネス側でも
 * 明示的に wrap して二重に保証する (Pane 3 と同じ mount 条件を再現)。
 *
 * ## index.css の取り込み
 * DiagramCard は var(--border) / var(--color-gain) 等の design token に依存する。
 * index.css を import して :root + [data-theme="dark"] のトークンを供給する。
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import DiagramCard from './components/DiagramCard.jsx';
import MotionProvider from './components/MotionProvider.jsx';
import { DIAGRAM_FIXTURE } from './preview-fixture.js';
import './index.css';

function PreviewApp() {
  // 年セレクター (3 / 5 年トグル) を動かせるよう state を持つ。 screenshot は静的だが、
  // snap-diagram.mjs から click 駆動したくなった場合に備える。
  const [selectedYears, setSelectedYears] = useState(5);

  return (
    <div
      style={{
        // 本番 Pane 3 (AI 図解カラム) を模した dark page 背景 + 中央寄せ container。
        minHeight: '100vh',
        background: 'var(--page-bg)',
        padding: '32px 24px 80px',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: '760px' }} data-testid="preview-container">
        <MotionProvider>
          <DiagramCard
            data={DIAGRAM_FIXTURE}
            ticker="MSFT"
            selectedYears={selectedYears}
            onYearsChange={setSelectedYears}
          />
        </MotionProvider>
      </div>
    </div>
  );
}

createRoot(document.getElementById('preview-root')).render(<PreviewApp />);
