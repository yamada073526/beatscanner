import { useState } from 'react';

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

      {/* バッジ — 既存 .hero-badge */}
      <div
        className="hero-badge"
        style={{
          position: 'relative', zIndex: 1,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          borderRadius: '999px',
          padding: '5px 16px',
          fontSize: '11px',
          marginBottom: '24px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        <span style={{ fontSize: '8px' }}>●</span>
        β版・先着ユーザー募集中
        <span style={{ fontSize: '8px' }}>●</span>
      </div>

      {/* メインコピー — 既存 .hero-title (グラデーションテキスト) */}
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
        <span style={{ display: 'block' }}>決算を、瞬時に</span>
        <span style={{ display: 'block' }}>読み解く。</span>
      </h1>

      {/* サブコピー — 既存 Hero と同じスタイル */}
      <p style={{
        position: 'relative', zIndex: 1,
        fontSize: 'clamp(13px, 1.8vw, 16px)',
        color: 'var(--text-muted)',
        margin: '0 auto 28px',
        lineHeight: 1.7,
        maxWidth: '440px',
      }}>
        売上・EPS・バリュエーションをAIが図解。
        <br />
        Beat/Miss・ブル/ベアを即判定。
      </p>

      {/* メインCTA */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <PrimaryCTA onClick={onFreeStart}>
          <GoogleIcon /> 無料で試す（登録30秒）
        </PrimaryCTA>
        <p
          className="section-subtext"
          style={{ marginTop: 12, marginBottom: 20, textAlign: 'center' }}
        >
          クレカ不要・3銘柄/日まで無料分析
        </p>
      </div>

      {/* プルーフチップ — 既存 Hero と同じスタイル */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        {['✓ 5条件 即時判定', '✓ AI市場分析', '✓ 株価チャート連動'].map(text => (
          <span
            key={text}
            style={{
              fontSize: '11px',
              color: '#38BDF8',
              background: 'rgba(56,189,248,0.08)',
              border: '1px solid rgba(56,189,248,0.2)',
              borderRadius: '999px',
              padding: '3px 10px',
              fontWeight: 600,
            }}
          >
            {text}
          </span>
        ))}
      </div>
    </section>
  );
}

// ── セクション 2: 信頼シグナル ────────────────────────────────────────────
function TrustSection() {
  return (
    <section style={{
      padding: '32px 20px',
      textAlign: 'center',
      borderTop: '1px solid var(--border)',
      borderBottom: '1px solid var(--border)',
    }}>
      <SectionLabel>DATA SOURCES</SectionLabel>
      <div
        className="section-subtext"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 16,
          marginTop: 12,
          color: 'var(--text-secondary)',
          opacity: 1,
        }}
      >
        <span>📊 Financial Modeling Prep</span>
        <span style={{ color: 'var(--text-muted)' }}>·</span>
        <span>📰 Yahoo Finance</span>
        <span style={{ color: 'var(--text-muted)' }}>·</span>
        <span>📋 Seeking Alpha</span>
        <span style={{ color: 'var(--text-muted)' }}>·</span>
        <span>🤖 Claude AI</span>
      </div>
    </section>
  );
}

// ── セクション 3: 機能紹介 ────────────────────────────────────────────────
// 既存 .panel-card クラスを使用 (ホバー演出付き)
function FeatureCard({ icon, title, description }) {
  return (
    <div
      className="panel-card"
      style={{
        padding: '24px 20px',
        borderRadius: 12,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>
      <h3
        className="section-heading"
        style={{ fontSize: 16, marginBottom: 8 }}
      >
        {title}
      </h3>
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
      }}>
        <FeatureCard
          icon="⚡"
          title="5条件 即時判定"
          description="営業CFマージン・EPS・CFPS・売上・ガイダンスを自動チェック。会計上のごまかしが効かない指標で銘柄を瞬時に評価します。"
        />
        <FeatureCard
          icon="📊"
          title="市場の声（AI統合分析）"
          description="毎朝4時に最新ニュースをAIが分析。強気・弱気材料を構造化表示し、市場参加者のセンチメントを可視化します。"
        />
        <FeatureCard
          icon="📈"
          title="株価チャート連動"
          description="決算発表タイミングを株価チャートに重ねて表示。Beat/Miss が株価にどう影響したかを一目で把握できます。"
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
        {/* Free プラン — panel-card */}
        <div
          className="panel-card"
          style={{
            padding: '28px 22px',
            borderRadius: 12,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
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
          }}>
            <li>✓ 基本分析（3銘柄/日）</li>
            <li>✓ 5条件 即時判定</li>
            <li>✓ 株価チャート閲覧</li>
            <li style={{ color: 'var(--text-muted)' }}>— 市場の声（プレビューのみ）</li>
            <li style={{ color: 'var(--text-muted)' }}>— AI 詳細レポート</li>
          </ul>
          <OutlinedCTA onClick={onFreeStart} fullWidth>
            今すぐ無料で始める
          </OutlinedCTA>
        </div>

        {/* Pro プラン — panel-card + シアン強調 */}
        <div
          className="panel-card"
          style={{
            position: 'relative',
            padding: '28px 22px',
            borderRadius: 12,
            background: 'var(--bg-card)',
            border: '1px solid rgba(34,211,238,0.55)',
            boxShadow: '0 0 18px rgba(34,211,238,0.12)',
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
            color: '#22d3ee', marginBottom: 6,
          }}>
            ¥980<span style={{
              fontSize: 13, fontWeight: 400, color: 'var(--text-muted)',
            }}>/月</span>
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
          <p
            className="section-subtext"
            style={{ marginTop: 10, marginBottom: 0, textAlign: 'center' }}
          >
            年払いなら ¥9,800（2ヶ月分お得）
          </p>
        </div>
      </div>
    </section>
  );
}

// ── セクション 5: FAQ ─────────────────────────────────────────────────────
function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
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
        q="Q. 無料プランと Pro プランの違いは？"
        a="無料プランは1日3銘柄まで分析でき、5条件判定や株価チャートが使えます。Pro プランは分析数が無制限になり、市場の声のフル表示・AI 詳細レポート・ウォッチリスト無制限など全機能が使えます。"
      />
      <FAQItem
        q="Q. 7日間無料トライアルはいつでも解約できますか？"
        a="はい。トライアル期間中（7日間）であれば、Stripe 経由でいつでも解約でき、料金は一切発生しません。トライアル終了前に解約のリマインドメールもお送りします。"
      />
      <FAQItem
        q="Q. データはどこから取得していますか？"
        a="財務データは Financial Modeling Prep（公式 API）、ニュースは Yahoo Finance および Seeking Alpha の RSS フィード、市場分析は Anthropic Claude AI を使用しています。すべて信頼性の高い一次ソースです。"
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
        さあ、決算を読み解こう。
      </h2>
      <p
        className="section-subtext"
        style={{ marginBottom: 24 }}
      >
        登録は Google アカウントで30秒。クレカ不要。
      </p>
      <PrimaryCTA onClick={onFreeStart}>
        <GoogleIcon /> 今すぐ無料で始める
      </PrimaryCTA>
    </section>
  );
}

// ── メインエクスポート ────────────────────────────────────────────────────
export default function LandingPage({ onSignIn, onProCheckout }) {
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
      <TrustSection />
      <FeaturesSection />
      <PricingSection onFreeStart={onSignIn} onProCheckout={handleProClick} />
      <FAQSection />
      <FooterCTASection onFreeStart={onSignIn} />
    </div>
  );
}
