/**
 * PlanComparisonBanner — デモ分析後に表示されるプラン比較バナー。
 *
 * v40+: LP の PricingSection と同じ 2 段構造 (Free / Pro ¥980) に統一。
 *
 * Props:
 *   onStartCheckout () => void   — Stripe Checkout を開始 (Pro 用)
 *   user            object | null — ログイン状態 (Pro CTA の挙動制御)
 */

import { ShieldCheck } from 'lucide-react';

export default function PlanComparisonBanner({ onStartCheckout }) {
  // user チェックは親 (App.jsx) 側で処理するため、ここでは単に呼ぶだけ
  return (
    <section style={{
      marginTop: 32,
      padding: '24px 20px',
      borderRadius: 14,
      background: 'var(--bg-subtle)',
      border: '1px solid var(--border)',
    }}>
      <div style={{ marginBottom: 16, textAlign: 'center' }}>
        <h3 style={{
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 6,
        }}>
          全銘柄を無制限に分析する
        </h3>
        <p style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          margin: 0,
          lineHeight: 1.6,
        }}>
          無料お試しはここまで。Pro なら無制限分析・AI レポート・市場の声フル表示。
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 12,
        maxWidth: 640,
        margin: '0 auto',
      }}>
        {/* Free プラン — v40+: panel-card で LP と同じ発光・ホバー演出 */}
        <div className="panel-card" style={{
          padding: '20px 18px',
          borderRadius: 12,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ minHeight: 70 }}>
            <div style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 4,
            }}>
              FREE
            </div>
            <div style={{
              fontSize: 24, fontWeight: 700,
              color: 'var(--text-primary)',
            }}>
              ¥0<span style={{
                fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4,
              }}>現在のプラン</span>
            </div>
          </div>
          <ul style={{
            listStyle: 'none', padding: 0, margin: '12px 0 16px',
            fontSize: 12, lineHeight: 2, color: 'var(--text-secondary)',
          }}>
            <li>✓ 3銘柄/日まで無料分析</li>
            <li>✓ 5条件 即時判定</li>
            <li>✓ 株価チャート閲覧</li>
          </ul>
          <div style={{
            marginTop: 'auto',
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            fontSize: 11,
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}>
            現在のプラン
          </div>
        </div>

        {/* Pro プラン (おすすめ) — v40+: panel-card で LP と同じ発光・ホバー演出 */}
        <div className="panel-card" style={{
          position: 'relative',
          padding: '20px 18px',
          borderRadius: 12,
          background: 'var(--bg-card)',
          border: '1px solid rgba(34,211,238,0.55)',
          boxShadow: '0 0 18px rgba(34,211,238,0.12)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            position: 'absolute',
            top: -10,
            right: 16,
            padding: '2px 10px',
            borderRadius: 9999,
            background: 'rgb(56, 189, 248)',
            color: '#0f172a',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.05em',
          }}>
            おすすめ
          </div>
          <div style={{ minHeight: 70 }}>
            <div style={{
              fontSize: 11,
              color: 'rgb(56, 189, 248)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 4,
            }}>
              PRO
            </div>
            <div style={{
              fontSize: 24, fontWeight: 700,
              color: 'rgb(56, 189, 248)',
            }}>
              ¥980<span style={{
                fontSize: 12, fontWeight: 400, color: 'var(--text-muted)',
              }}>/月</span>
            </div>
            <div style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginTop: 2,
            }}>
              1日約¥33・コーヒー1杯より安く
            </div>
            <div style={{
              display: 'inline-block',
              padding: '2px 10px',
              borderRadius: 9999,
              background: 'rgba(34,211,238,0.12)',
              border: '1px solid rgba(34,211,238,0.40)',
              color: 'rgb(56, 189, 248)',
              fontSize: 11,
              fontWeight: 600,
              marginTop: 8,
            }}>
              🎁 7日間 完全無料
            </div>
          </div>
          <ul style={{
            listStyle: 'none', padding: 0, margin: '12px 0 16px',
            fontSize: 12, lineHeight: 2, color: 'var(--text-secondary)',
          }}>
            <li>✓ 分析数 <strong style={{ color: 'rgb(56, 189, 248)' }}>無制限</strong></li>
            <li>✓ 市場の声 フル表示</li>
            <li>✓ AI 詳細レポート</li>
            <li>✓ ウォッチリスト無制限</li>
            <li>✓ 決算前自動分析</li>
          </ul>
          <div style={{
            marginTop: 'auto',
            fontSize: 11,
            color: 'var(--text-muted)',
            textAlign: 'center',
            marginBottom: 8,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ShieldCheck size={12} strokeWidth={1.75} aria-hidden="true" />
              Stripe で安全に決済 / いつでも解約可
            </span>
          </div>
          <button
            onClick={onStartCheckout}
            style={{
              width: '100%',
              padding: '11px',
              borderRadius: 10,
              background: 'rgb(56, 189, 248)',
              color: '#0f172a',
              border: 'none',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 0 12px rgba(34,211,238,0.30)',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-strong)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgb(56, 189, 248)'; }}
          >
            7日間無料で試す →
          </button>
        </div>
      </div>
    </section>
  );
}
