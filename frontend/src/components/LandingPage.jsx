import { useState, useEffect } from 'react';

/**
 * LandingPage — 未ログインユーザー向けランディングページ
 *
 * 表示条件: activeTab === 'home' && !result && !user && !loading
 *
 * デザイン方針: 既存ホーム画面のデザインシステムに完全統一
 *  - Hero は既存 .hero-badge / .hero-title (グラデーションテキスト) を流用
 *  - カードは .panel-card クラス (ホバー演出付き)
 *  - ボタンは .cta-btn クラス (シアン outlined)
 *  - 見出しは .section-heading (18px / weight 500)
 *  - 補助テキストは .section-subtext (12px / muted)
 *  - カラーは CSS 変数 (--text-primary / --text-secondary / --text-muted / --bg-card / --bg-subtle / --border)
 *  - フォントサイズは固定値ではなくセマンティッククラスに任せる
 *
 * Props:
 *   onSignIn      () => void   — Googleログイン (無料CTA)
 *   onProCheckout () => void   — Pro チェックアウト (ログイン → 自動的に Stripe へ遷移)
 */

function GoogleIcon({ size = 16, fill = '#0f172a' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill={fill} d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill={fill} d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill={fill} d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill={fill} d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

// ── 共通: ソリッドシアンの主要 CTA (Google ログイン用) ─────────────────────
// 既存の cta-btn (outlined) と差別化するため、こちらは塗り。Hero/Footer の主役 CTA。
function PrimaryCTA({ children, onClick, fullWidth = false }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '14px 28px',
        borderRadius: 10,
        background: hover ? '#06b6d4' : '#22d3ee',
        color: '#0f172a',
        border: 'none',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 0 12px rgba(34,211,238,0.30)',
        transition: 'all 0.2s ease',
        width: fullWidth ? '100%' : 'auto',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

// ── 共通: outlined シアン CTA (既存 .cta-btn 相当のインライン版) ────────────
// 既存 .cta-btn は :hover が !important で定義されているため、共通スタイルとして再利用。
function OutlinedCTA({ children, onClick, fullWidth = false }) {
  return (
    <button
      type="button"
      className="cta-btn"
      onClick={onClick}
      style={{
        display: 'block',
        width: fullWidth ? '100%' : 'auto',
        padding: '14px',
        background: 'rgba(255,255,255,0.05)',
        color: '#22d3ee',
        border: '1px solid rgba(34,211,238,0.35)',
        borderRadius: 10,
        fontWeight: 600,
        textAlign: 'center',
        boxShadow: '0 0 10px rgba(34,211,238,0.15)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// ── セクション見出しヘルパー ──────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <p
      className="section-subtext"
      style={{
        textTransform: 'uppercase',
        letterSpacing: '0.15em',
        color: '#22d3ee',
        marginBottom: 8,
      }}
    >
      {children}
    </p>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="section-heading" style={{ fontSize: 24, marginBottom: 12 }}>
      {children}
    </h2>
  );
}

// ── セクション 1: ヒーロー ────────────────────────────────────────────────
// 既存 App.jsx の Hero (line 681-) と同じ hero-badge / hero-title クラスを使用
function HeroSection({ onFreeStart }) {
  return (
    <section style={{
      textAlign: 'center',
      padding: '48px 24px 36px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* 背景の装飾（既存 Hero と同じ放射状グロー） */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -60%)',
          width: '600px',
          height: '300px',
          background: 'radial-gradient(ellipse, rgba(56,189,248,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* β バッジ削除 (v37): 招待制という虚偽訴求を回避 + Hero ノイズ削減 */}

      {/* メインコピー — 痛み→解決型（v37 で「機能説明」から転換） */}
      <h1
        className="hero-title"
        style={{
          position: 'relative', zIndex: 1,
          textAlign: 'center',
          fontSize: 'clamp(32px, 6vw, 56px)',
          fontWeight: 600,
          lineHeight: 1.15,
          margin: '0 0 16px',
          letterSpacing: '-0.02em',
        }}
      >
        <span style={{ display: 'block' }}>決算を見ても</span>
        <span style={{ display: 'block' }}>買うべきか分からない。</span>
      </h1>

      {/* サブコピー — 解決策の提示 (権威性 + 具体性) */}
      <p style={{
        position: 'relative', zIndex: 1,
        fontSize: 'clamp(13px, 1.8vw, 16px)',
        color: 'var(--text-muted)',
        margin: '0 auto 24px',
        lineHeight: 1.6,
      }}>
        プロが使う5条件で、3秒で判定。
      </p>

      {/* メインCTA + 安心バッジ (v37: 制限訴求を消して登録不要を強調) */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <PrimaryCTA onClick={onFreeStart}>
          <GoogleIcon /> 無料で試す（登録30秒）
        </PrimaryCTA>
        <div style={{
          marginTop: 12,
          marginBottom: 0,
          fontSize: 12,
          color: 'var(--text-muted)',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          ✓ 登録不要で試せる　✓ 30秒で完了
        </div>
      </div>

      {/* v37: プルーフチップ 3 個を削除 (機能セクションで詳述するため重複) */}
    </section>
  );
}

// ── セクション 2 (v37 新設): 今日の注目銘柄 ──────────────────────────────
// 急騰 Top3 を /api/movers から取得して表示。クリックでデモ分析へ直結。
// 「毎日見たい」体験を作り、未ログインでもブックマーク価値を生む。
function TodayHotSection({ onTickerClick }) {
  const [movers, setMovers] = useState(null);  // null: loading / [] or array: loaded / 'error': error
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/movers')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(d => {
        if (cancelled) return;
        const top3 = (d?.gainers || []).slice(0, 3);
        setMovers(top3);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setMovers('error');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // エラー時はセクションごと隠す
  if (movers === 'error') return null;

  return (
    <section style={{ padding: '32px 20px' }}>
      <div style={{
        fontSize: 11,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        textAlign: 'center',
        marginBottom: 16,
      }}>
        🔥 今日の注目
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
        maxWidth: 600,
        margin: '0 auto',
      }}>
        {loading
          ? [0, 1, 2].map(i => (
              <div
                key={i}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '24px 12px',
                  textAlign: 'center',
                  animation: 'pulse 1.5s ease-in-out infinite',
                  minHeight: 84,
                }}
              />
            ))
          : (movers || []).map(m => {
              const pctStr = m.pct != null ? `${m.pct > 0 ? '+' : ''}${m.pct.toFixed(2)}%` : '';
              const desc = (m.keyword || '').slice(0, 20);
              return (
                <div
                  key={m.ticker}
                  className="panel-card"
                  onClick={() => onTickerClick?.(m.ticker)}
                  style={{
                    textAlign: 'center',
                    padding: '16px 12px',
                    cursor: 'pointer',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                  }}
                >
                  <div style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: 4,
                  }}>{m.ticker}</div>
                  <div style={{
                    fontSize: 12,
                    color: '#22d3ee',
                    fontWeight: 600,
                    marginBottom: 4,
                  }}>{pctStr}</div>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    lineHeight: 1.4,
                  }}>{desc || '急騰注目銘柄'}</div>
                </div>
              );
            })
        }
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>
    </section>
  );
}

// ── セクション 3: 機能紹介 ────────────────────────────────────────────────
// 既存 .panel-card クラスを使用 (ホバー演出付き)
// v37: mockup prop で実 UI 表現を差し込み可能に
// v38: flex column + height:100% で 3 カードを同高揃え
function FeatureCard({ icon, title, description, mockup }) {
  return (
    <div
      className="panel-card"
      style={{
        padding: '24px 20px',
        borderRadius: 12,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>
      <h3
        className="section-heading"
        style={{ fontSize: 16, marginBottom: 8 }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.7,
            color: 'var(--text-secondary)',
            margin: 0,
          }}
        >
          {description}
        </p>
      )}
      {/* mockup を下部に押し出して上部の余白を均等化 */}
      {mockup && <div style={{ marginTop: 'auto' }}>{mockup}</div>}
    </div>
  );
}

// v37: 5条件カード用の実 UI モックアップ (NVDA PASS 5/5 を CSS だけで描画)
function FiveConditionsMockup() {
  return (
    <div style={{
      background: 'rgba(34,211,238,0.06)',
      borderRadius: 8,
      padding: '10px 12px',
      marginTop: 8,
      fontSize: 11,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>NVDA</span>
        <span style={{
          background: 'rgba(34,239,129,0.15)',
          color: '#34ef81',
          padding: '1px 8px',
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 700,
        }}>✓ PASS 5/5</span>
      </div>
      {['営業CFマージン', 'EPS連続増加', 'CFPS連続増加', '売上連続増加', 'CFPS≧EPS'].map(label => (
        <div key={label} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 3,
          color: 'var(--text-muted)',
          fontSize: 10,
        }}>
          <span style={{ color: '#34ef81' }}>✓</span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

// v38: 市場の声カード用 UI モックアップ — センチメントバッジ + 強気/弱気/注目指標
function MarketVoiceMockup() {
  const items = [
    { icon: '🟢', text: 'AI半導体需要が継続拡大', color: '#34ef81' },
    { icon: '🔴', text: '競合のAMDが猛追中', color: '#f87171' },
    { icon: '📌', text: '次回決算: EPS $0.89 予想', color: '#94a3b8' },
  ];
  return (
    <div style={{
      background: 'rgba(34,211,238,0.06)',
      borderRadius: 8,
      padding: '10px 12px',
      marginTop: 8,
      fontSize: 11,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>NVDA</span>
        <span style={{
          background: 'rgba(245,158,11,0.15)',
          color: '#f59e0b',
          padding: '1px 8px',
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 700,
        }}>⚡ 強弱混在</span>
      </div>
      {items.map((it) => (
        <div key={it.text} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 3,
          color: 'var(--text-muted)',
          fontSize: 10,
        }}>
          <span>{it.icon}</span>
          <span>{it.text}</span>
        </div>
      ))}
    </div>
  );
}

// v38: チャート連動カード用 UI モックアップ — 株価線 + Beat/Miss マーカー
function ChartLinkMockup() {
  return (
    <div style={{
      background: 'rgba(34,211,238,0.06)',
      borderRadius: 8,
      padding: '10px 12px',
      marginTop: 8,
      fontSize: 11,
    }}>
      <svg width="100%" height="48" viewBox="0 0 200 48" preserveAspectRatio="none" aria-hidden="true">
        {/* 株価線 (シアン) */}
        <polyline
          points="0,40 40,35 80,20 120,28 160,12 200,8"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Beat マーカー (緑) */}
        <circle cx="80" cy="20" r="4" fill="#34ef81" />
        <text x="80" y="14" fontSize="8" fill="#34ef81" textAnchor="middle" fontWeight="700">Beat</text>
        {/* Miss マーカー (赤) */}
        <circle cx="120" cy="28" r="4" fill="#f87171" />
        <text x="120" y="44" fontSize="8" fill="#f87171" textAnchor="middle" fontWeight="700">Miss</text>
      </svg>
      <div style={{
        marginTop: 4,
        fontSize: 10,
        color: 'var(--text-muted)',
      }}>
        ▲ Beat / ▼ Miss を株価に重ねて表示
      </div>
    </div>
  );
}

function FeaturesSection() {
  return (
    <section style={{ padding: '56px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <SectionLabel>FEATURES</SectionLabel>
        <SectionTitle>投資判断を、データで武装する。</SectionTitle>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 16,
        maxWidth: 1080,
        margin: '0 auto',
        alignItems: 'stretch',  // v38: 3 カード同高
      }}>
        {/* v38: 案A 採用 — 3 カードすべてに UI モックアップを追加。
            理由: 訴求力 / 情報均等性 / 認知コスト削減のいずれも案B (高さ統一のみ) より優れる。
            設計思想 ⑥「図解で認知コストを下げろ」を 3 カードすべてに適用。 */}
        <FeatureCard
          icon="⚡"
          title="5条件、即判定"
          mockup={<FiveConditionsMockup />}
        />
        <FeatureCard
          icon="📊"
          title="市場の声"
          mockup={<MarketVoiceMockup />}
        />
        <FeatureCard
          icon="📈"
          title="チャート連動"
          mockup={<ChartLinkMockup />}
        />
      </div>
    </section>
  );
}

// ── セクション 4: 料金プラン ──────────────────────────────────────────────
function PricingSection({ onFreeStart, onProCheckout }) {
  return (
    <section style={{
      padding: '56px 20px',
      borderTop: '1px solid var(--border)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <SectionLabel>PRICING</SectionLabel>
        <SectionTitle>シンプルな料金体系</SectionTitle>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 16,
        maxWidth: 720,
        margin: '0 auto',
      }}>
        {/* Free プラン — panel-card / v38: flex col + ul marginTop:auto で
            ✓ リスト + CTA を下部に押し出して Pro カードと底揃え */}
        <div
          className="panel-card"
          style={{
            padding: '28px 22px',
            borderRadius: 12,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          <div style={{ fontSize: 22, marginBottom: 4 }}>🆓</div>
          <h3 className="section-heading" style={{ fontSize: 16, marginBottom: 4 }}>
            無料
          </h3>
          <div style={{
            fontSize: 26, fontWeight: 700,
            color: 'var(--text-primary)', marginBottom: 18,
          }}>
            ¥0<span style={{
              fontSize: 13, fontWeight: 400, color: 'var(--text-muted)',
            }}>/月</span>
          </div>
          <ul style={{
            listStyle: 'none', padding: 0, margin: '0 0 22px',
            fontSize: 13, lineHeight: 2, color: 'var(--text-secondary)',
            marginTop: 'auto',  // v38: 下部に押し出して ✓ リスト位置を Pro と揃える
          }}>
            <li>✓ 3銘柄/日まで無料分析</li>
            <li>✓ 5条件 即時判定</li>
            <li>✓ 株価チャート閲覧</li>
          </ul>
          <OutlinedCTA onClick={onFreeStart} fullWidth>
            今すぐ無料で始める
          </OutlinedCTA>
        </div>

        {/* Pro プラン — panel-card + シアン強調 / v38: flex col で Free と底揃え */}
        <div
          className="panel-card"
          style={{
            position: 'relative',
            padding: '28px 22px',
            borderRadius: 12,
            background: 'var(--bg-card)',
            border: '1px solid rgba(34,211,238,0.55)',
            boxShadow: '0 0 18px rgba(34,211,238,0.12)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          {/* おすすめバッジ */}
          <div style={{
            position: 'absolute',
            top: -10,
            right: 18,
            padding: '3px 10px',
            borderRadius: 9999,
            background: '#22d3ee',
            color: '#0f172a',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.05em',
          }}>
            おすすめ
          </div>
          <div style={{ fontSize: 22, marginBottom: 4 }}>✨</div>
          <h3 className="section-heading" style={{ fontSize: 16, marginBottom: 4 }}>
            Pro
          </h3>
          <div style={{
            fontSize: 26, fontWeight: 700,
            color: '#22d3ee', marginBottom: 4,
          }}>
            ¥980<span style={{
              fontSize: 13, fontWeight: 400, color: 'var(--text-muted)',
            }}>/月</span>
          </div>
          {/* v37 Fix 7: コーヒー1杯アンカリングで体感価格を下げる */}
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            marginTop: 4,
            marginBottom: 12,
          }}>
            1日あたり約¥33 — コーヒー1杯より安く
          </div>
          <div style={{
            display: 'inline-block',
            padding: '2px 10px',
            borderRadius: 9999,
            background: 'rgba(34,211,238,0.12)',
            border: '1px solid rgba(34,211,238,0.40)',
            color: '#22d3ee',
            fontSize: 11,
            fontWeight: 600,
            marginBottom: 18,
          }}>
            🎁 7日間 完全無料
          </div>
          <ul style={{
            listStyle: 'none', padding: 0, margin: '0 0 22px',
            fontSize: 13, lineHeight: 2, color: 'var(--text-secondary)',
            marginTop: 'auto',  // v38: 下部に押し出して Free と底揃え
          }}>
            <li>✓ 分析数 <strong style={{ color: '#22d3ee' }}>無制限</strong></li>
            <li>✓ 市場の声 フル表示</li>
            <li>✓ AI 詳細レポート</li>
            <li>✓ ウォッチリスト無制限</li>
            <li>✓ 決算前自動分析</li>
          </ul>
          <PrimaryCTA onClick={onProCheckout} fullWidth>
            7日間無料で試す →
          </PrimaryCTA>
          {/* Fix 3: 年払いバッジを目立つシアン pill に強化 */}
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <span style={{
              display: 'inline-block',
              background: 'rgba(34,211,238,0.12)',
              border: '1px solid rgba(34,211,238,0.35)',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 12,
              color: '#22d3ee',
              fontWeight: 600,
            }}>
              🏷️ 年払いで2ヶ月分お得（¥1,960節約）
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── セクション 5: FAQ ─────────────────────────────────────────────────────
function FAQItem({ q, a, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      padding: '18px 0',
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          padding: 0,
          textAlign: 'left',
          cursor: 'pointer',
          color: 'var(--text-primary)',
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: '-0.01em',
        }}
      >
        <span>{q}</span>
        <span style={{
          color: '#22d3ee',
          fontSize: 18,
          transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
          marginLeft: 12,
          flexShrink: 0,
        }}>
          +
        </span>
      </button>
      {open && (
        <p style={{
          marginTop: 10,
          fontSize: 13,
          lineHeight: 1.8,
          color: 'var(--text-secondary)',
        }}>
          {a}
        </p>
      )}
    </div>
  );
}

function FAQSection() {
  return (
    <section style={{
      padding: '56px 20px',
      maxWidth: 720,
      margin: '0 auto',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <SectionLabel>FAQ</SectionLabel>
        <SectionTitle>よくあるご質問</SectionTitle>
      </div>

      <FAQItem
        defaultOpen
        q="Q. 無料プランと Pro プランの違いは？"
        a="無料プランは1日3銘柄まで分析でき、5条件判定や株価チャートが使えます。Pro プランは分析数が無制限になり、市場の声のフル表示・AI 詳細レポート・ウォッチリスト無制限など全機能が使えます。"
      />
      <FAQItem
        q="Q. 7日間無料トライアルはいつでも解約できますか？"
        a="はい。トライアル期間中（7日間）であれば、Stripe 経由でいつでも解約でき、料金は一切発生しません。トライアル終了前に解約のリマインドメールもお送りします。"
      />
      <FAQItem
        q="Q. 投資初心者でも使えますか？"
        a="はい。専門知識は不要です。5条件の判定結果と AI 解説で、決算の良し悪しをシンプルに確認できます。まずは気になる銘柄を1つ検索してみてください。"
      />
    </section>
  );
}

// ── セクション 6: フッター CTA ─────────────────────────────────────────────
function FooterCTASection({ onFreeStart }) {
  return (
    <section style={{
      padding: '56px 20px 72px',
      textAlign: 'center',
      borderTop: '1px solid var(--border)',
      background: 'linear-gradient(180deg, transparent, rgba(34,211,238,0.04))',
    }}>
      <h2
        className="section-heading"
        style={{ fontSize: 22, marginBottom: 12 }}
      >
        まず、1銘柄。
      </h2>
      <p
        className="section-subtext"
        style={{ marginBottom: 24 }}
      >
        30秒・クレカ不要
      </p>
      <PrimaryCTA onClick={onFreeStart}>
        <GoogleIcon /> 今すぐ無料で始める
      </PrimaryCTA>
    </section>
  );
}

// ── メインエクスポート ────────────────────────────────────────────────────
// onTickerClick(ticker): 「今日の注目」銘柄クリック時に親で runAnalyze + setActiveTab を実行
export default function LandingPage({ onSignIn, onProCheckout, onTickerClick }) {
  // 「7日間無料で試す」: ログイン後に自動的にチェックアウトへ遷移するため、
  // localStorage に意図フラグをセットしてからログイン画面へ
  const handleProClick = () => {
    try {
      localStorage.setItem('bs_post_login_intent', 'checkout_monthly');
    } catch { /* private mode 等は無視 */ }
    onProCheckout?.();
  };

  return (
    <div style={{
      // 全幅セクション化のため親のパディングを脱出 (sticky 検索バーと同じテクニック)
      width: '100vw',
      marginLeft: 'calc(-50vw + 50%)',
      marginRight: 'calc(-50vw + 50%)',
      // ダーク/ライト両対応のため CSS 変数の背景を継承
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
    }}>
      <HeroSection onFreeStart={onSignIn} />
      <TodayHotSection onTickerClick={onTickerClick} />
      <FeaturesSection />
      <PricingSection onFreeStart={onSignIn} onProCheckout={handleProClick} />
      {/* v37 Fix 6: データソース表記を控えめに復活 (信頼シグナル) */}
      <div style={{
        textAlign: 'center',
        fontSize: 11,
        color: 'var(--text-muted)',
        padding: '16px 20px',
        borderTop: '1px solid var(--border)',
      }}>
        Powered by Financial Modeling Prep · Yahoo Finance · Anthropic Claude
      </div>
      <FAQSection />
      <FooterCTASection onFreeStart={onSignIn} />
    </div>
  );
}
