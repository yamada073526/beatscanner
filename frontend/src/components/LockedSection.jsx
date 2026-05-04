/**
 * LockedSection — Free会員向けロック演出の共通ラッパー (v40+)
 *
 * 設計: Ghost Content + Aurora Veil + Inline CTA
 *  - 子要素 (実コンテンツ形状の ghost) を表示
 *  - 下部に向かってフェード (locked-veil) で「あるけど見えない」演出
 *  - シアン aurora を背景に流し、CTA chip を 1 つだけ浮かべる
 *
 * Props:
 *   children    React.Node  — ghost skeleton (実コンテンツの形状を模倣したもの)
 *   ctaLabel    string      — chip のメインテキスト (例: "続きを読む" "詳細を見る")
 *   onUpgrade   () => void  — chip クリック時に呼ばれる (App.jsx の upgrade.open)
 *   minHeight   number      — section の最低高さ (default 320)
 *   hint        string?     — オプション: 上部の 1 行説明 (例: "AI が決算を図解で解説")
 */

export default function LockedSection({ children, ctaLabel, onUpgrade, minHeight = 320, hint }) {
  return (
    <div className="locked-section" style={{ minHeight, padding: '14px 4px 4px' }}>
      {hint && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: 'var(--text-secondary)',
          marginBottom: 14,
        }}>
          <span style={{ fontSize: 13, color: '#22d3ee' }}>✦</span>
          {hint}
        </div>
      )}

      <div className="locked-content">
        {children}
      </div>

      <div className="locked-aurora" />
      <div className="locked-veil" />

      <button type="button" className="locked-cta" onClick={onUpgrade}>
        <span style={{ fontSize: 12 }}>🔒</span>
        <span>{ctaLabel}</span>
        <span style={{ opacity: 0.65, fontSize: 12, marginLeft: 2 }}>· Pro</span>
      </button>
    </div>
  );
}

// ── Ghost building blocks ───────────────────────────────────────────────────

function GhostBar({ width = '100%', height = 10, marginBottom = 8, borderRadius }) {
  return (
    <div
      className="ghost-bar"
      style={{
        width: typeof width === 'number' ? `${width}%` : width,
        height,
        marginBottom,
        ...(borderRadius != null ? { borderRadius } : {}),
      }}
    />
  );
}

// ── Per-feature ghosts ──────────────────────────────────────────────────────

/** 市場の声 — 統合見解(プレビュー文) + 強気/弱気 2カラム + 注目指標pill */
export function InsightsGhost({ previewSentence, sentiment }) {
  return (
    <>
      {/* プレビュー文 (実データの先頭1文を読める状態で)
          v40+: ロック領域内では hover 演出が効かないため panel-card クラスを使わず、
          static な border/background のみで表示。上端の box-shadow クリップも回避。 */}
      {previewSentence && (
        <div style={{
          padding: '14px 16px',
          borderRadius: 10,
          background: 'rgba(34,211,238,0.07)',
          border: '1px solid rgba(34,211,238,0.25)',
          fontSize: 13,
          lineHeight: 1.75,
          marginBottom: 16,
          color: 'var(--text-primary)',
        }}>
          {previewSentence}
        </div>
      )}

      {/* 強気 / 弱気 2カラム ghost */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        marginBottom: 16,
      }}>
        <div style={{
          padding: '12px 14px',
          borderRadius: 10,
          background: 'rgba(34,211,238,0.05)',
          border: '1px solid rgba(34,211,238,0.20)',
        }}>
          <div style={{
            fontSize: 11, color: '#22d3ee', fontWeight: 500,
            letterSpacing: '0.06em', marginBottom: 10,
          }}>
            🟢 強気材料
          </div>
          {[92, 78, 85, 70].map((w, i) => (
            <GhostBar key={i} width={w} />
          ))}
        </div>
        <div style={{
          padding: '12px 14px',
          borderRadius: 10,
          background: 'rgba(248,113,113,0.05)',
          border: '1px solid rgba(248,113,113,0.20)',
        }}>
          <div style={{
            fontSize: 11, color: '#f87171', fontWeight: 500,
            letterSpacing: '0.06em', marginBottom: 10,
          }}>
            🔴 弱気材料
          </div>
          {[88, 72, 90, 65].map((w, i) => (
            <GhostBar key={i} width={w} />
          ))}
        </div>
      </div>

      {/* 注目指標 pill 群 */}
      <div style={{
        fontSize: 11, color: 'var(--text-muted)', marginBottom: 8,
        letterSpacing: '0.06em',
      }}>
        📌 注目指標
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {[64, 88, 52, 76, 60].map((w, i) => (
          <div
            key={i}
            className="ghost-bar"
            style={{ width: w, height: 22, borderRadius: 999 }}
          />
        ))}
      </div>
    </>
  );
}

/** AI詳細レポート — 3カラム metric カード + マークダウン段落 */
export function AiReportGhost() {
  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 12,
        marginBottom: 20,
      }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            padding: 14,
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--bg-subtle)',
            minHeight: 92,
          }}>
            <GhostBar width={42} height={9} marginBottom={12} />
            <GhostBar width={70} height={22} marginBottom={0} />
          </div>
        ))}
      </div>
      {[95, 88, 92, 70, 85].map((w, i) => (
        <GhostBar key={i} width={w} />
      ))}
    </>
  );
}

/** カンファレンス要点 — 引用ブロック風 (左ボーダー + 3行テキスト) */
export function ConferenceGhost() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            borderLeft: '2px solid rgba(34,211,238,0.30)',
            paddingLeft: 14,
            marginBottom: 18,
          }}
        >
          <GhostBar width={32} height={9} marginBottom={8} />
          <GhostBar width={92} height={11} />
          <GhostBar width={78} height={11} marginBottom={0} />
        </div>
      ))}
    </>
  );
}

/** アナリスト視点 — テーブル風 (ヘッダー + 5行) */
export function AnalystGhost() {
  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr 1fr',
        gap: 8,
        marginBottom: 12,
        opacity: 0.7,
      }}>
        {['四半期', '予想', '実績', 'サプライズ'].map((h) => (
          <div key={h} style={{ fontSize: 11, color: 'var(--text-muted)' }}>{h}</div>
        ))}
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            gap: 8,
            marginBottom: 10,
          }}
        >
          <GhostBar height={12} marginBottom={0} />
          <GhostBar height={12} marginBottom={0} />
          <GhostBar height={12} marginBottom={0} />
          <GhostBar height={12} marginBottom={0} />
        </div>
      ))}
    </div>
  );
}
