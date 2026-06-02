/**
 * preview-main.jsx — AI 図解 (DiagramCard) 視覚検証ハーネスの entry。
 *
 * ## 役割
 * DiagramCard を MotionProvider で wrap して固定 FIXTURE でレンダーする。 本番 SPA (main.jsx) とは独立。
 * vite.preview.config.mjs でこの entry を build し、 .preview-dist/preview.html を file:// で開いて
 * snap-diagram.mjs が screenshot を撮る。 さらに本番 build 時は dist/diagram-preview/ に出力され、
 * 公開 URL (/diagram-preview/preview.html) でスマホからも閲覧できる (デザイン提案の比較用)。
 *
 * ## v154: デザイン提案 (vibe) の比較表示
 * vision-eval スコア向上候補 (serif 見出し / ゆとり余白 / gold accent) を「現状 vs 案」 で並べる。
 * vibe={} = 現状 (production と完全同一)、 案A/案B は preview だけで渡す (DiagramCard は vibe で切替)。
 *
 * ## ⚠️ MotionProvider 必須 ([[feedback_pane_error_boundary]])
 * DiagramCard は内部で m.* (framer-motion / LazyMotion) を使う。 scope 外だと opacity:0 固着。
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import DiagramCard from './components/DiagramCard.jsx';
import MotionProvider from './components/MotionProvider.jsx';
import { DIAGRAM_FIXTURE } from './preview-fixture.js';
import './index.css';

// 比較する提案 (vibe)。 現状を先頭に、 以降が向上候補。
const VARIANTS = [
  { key: 'current', label: '現状', desc: 'cyan accent / サンセリフ / 標準余白', vibe: {} },
  { key: 'serif-loose', label: '案A: 編集的 (推奨)', desc: 'Noto Serif JP 見出し + ゆとり余白 (ブランド色は cyan 維持)', vibe: { headingFont: 'serif', spacing: 'loose' } },
  { key: 'serif-gold', label: '案B: 案A + gold accent', desc: '案A に加え見出しを gold (真鍮) に。 ※ブランド色 cyan からの逸脱に注意', vibe: { headingFont: 'serif', spacing: 'loose', accent: 'gold' } },
];

function VariantBlock({ v }) {
  const [years, setYears] = useState(5);
  return (
    <section style={{ marginBottom: '40px' }} data-testid={`variant-${v.key}`}>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '2px',
        marginBottom: '12px', paddingBottom: '10px',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>{v.label}</span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{v.desc}</span>
      </div>
      <MotionProvider>
        <DiagramCard data={DIAGRAM_FIXTURE} ticker="MSFT" selectedYears={years} onYearsChange={setYears} vibe={v.vibe} />
      </MotionProvider>
    </section>
  );
}

function PreviewApp() {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--page-bg)',
      padding: '24px 16px 80px', display: 'flex', justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: '760px' }} data-testid="preview-container">
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            AI図解 デザイン提案 比較
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
            下に「現状」 と向上案を並べています。 MSFT のモックデータ。 どの方向で磨き込むかお選びください。
          </p>
        </div>
        {VARIANTS.map((v) => <VariantBlock key={v.key} v={v} />)}
      </div>
    </div>
  );
}

createRoot(document.getElementById('preview-root')).render(<PreviewApp />);
