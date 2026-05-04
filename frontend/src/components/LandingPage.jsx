import { useState } from 'react';

/**
 * LandingPage — 未ログインユーザー向けランディングページ
 *
 * 表示条件: activeTab === 'home' && !result && !user
 *
 * Props:
 *   onSignIn      () => void   — Googleログイン (無料CTA)
 *   onProCheckout () => void   — Pro チェックアウト (ログイン → 自動的に Stripe へ遷移)
 */

// シアン・ダークテーマ統一の共通スタイルトークン
const C = {
  cyan: '#22d3ee',
  cyanHover: '#06b6d4',
  cyanGlow: '0 0 12px rgba(34,211,238,0.30)',
  cyanBg: 'rgba(34,211,238,0.07)',
  cyanBgHover: 'rgba(34,211,238,0.12)',
  cyanBorder: 'rgba(34,211,238,0.35)',
  cyanBorderStrong: 'rgba(34,211,238,0.60)',
};

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

function PrimaryCTA({ children, onClick, icon, glow = true, fullWidth = false }) {
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
        borderRadius: 12,
        background: hover ? C.cyanHover : C.cyan,
        color: '#0f172a',
        border: 'none',
        fontSize: 15,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: glow ? C.cyanGlow : 'none',
        transition: 'all 0.2s',
        width: fullWidth ? '100%' : 'auto',
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function SecondaryCTA({ children, onClick, fullWidth = false }) {
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
        gap: 8,
        padding: '12px 24px',
        borderRadius: 12,
        background: hover ? C.cyanBgHover : C.cyanBg,
        color: C.cyan,
        border: `1px solid ${hover ? C.cyanBorderStrong : C.cyanBorder}`,
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s',
        width: fullWidth ? '100%' : 'auto',
      }}
    >
      {children}
    </button>
  );
}

// ── セクション 1: ヒーロー ────────────────────────────────────────────────
function HeroSection({ onFreeStart }) {
  return (
    <section style={{
      padding: '64px 20px 56px',
      textAlign: 'center',
      borderBottom: '1px solid rgba(34,211,238,0.10)',
    }}>
      {/* β バッジ */}
      <div style={{
        display: 'inline-block',
        padding: '6px 14px',
        borderRadius: 9999,
        background: C.cyanBg,
        border: `1px solid ${C.cyanBorder}`,
        color: C.cyan,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.02em',
        marginBottom: 24,
      }}>
        🚀 β版・先着ユーザー募集中
      </div>

      {/* キャッチコピー */}
      <h1 style={{
        fontSize: 'clamp(32px, 6vw, 52px)',
        fontWeight: 800,
        letterSpacing: '-0.02em',
        lineHeight: 1.15,
        marginBottom: 20,
        color: 'var(--text-primary)',
      }}>
        決算を、瞬時に<br className="md:hidden" />読み解く。
      </h1>

      {/* サブコピー */}
      <p style={{
        fontSize: 'clamp(15px, 2.2vw, 18px)',
        lineHeight: 1.7,
        color: 'var(--text-secondary)',
        maxWidth: 620,
        margin: '0 auto 40px',
      }}>
        売上・EPS・バリュエーションを <span style={{ color: C.cyan, fontWeight: 600 }}>AI が図解</span>。<br />
        Beat / Miss・ブル / ベアを即判定。
      </p>

      {/* メインCTA */}
      <PrimaryCTA
        onClick={onFreeStart}
        icon={<GoogleIcon />}
      >
        無料で試す（登録30秒）
      </PrimaryCTA>

      {/* 補助テキスト */}
      <p style={{
        marginTop: 16,
        fontSize: 12,
        color: 'var(--text-muted)',
      }}>
        クレカ不要・3銘柄/日まで無料分析
      </p>

      {/* モックアップ（軽量CSS で「画面の枠」を表現） */}
      <div style={{
        marginTop: 56,
        maxWidth: 720,
        marginLeft: 'auto',
        marginRight: 'auto',
        padding: 16,
        borderRadius: 16,
        background: 'rgba(34,211,238,0.04)',
        border: `1px solid ${C.cyanBorder}`,
        boxShadow: '0 0 24px rgba(34,211,238,0.10)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          marginBottom: 12,
          borderBottom: `1px solid ${C.cyanBorder}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>NVDA</span>
            <span style={{
              fontSize: 11, fontWeight: 600, color: C.cyan,
              background: C.cyanBg, padding: '2px 10px', borderRadius: 9999,
              border: `1px solid ${C.cyanBorder}`,
            }}>
              ✓ PASS
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>5/5 条件達成</div>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 8,
        }}>
          {['営業CF', 'EPS', 'CFPS', '売上', 'CFPS≧EPS'].map((label, i) => (
            <div key={i} style={{
              padding: '10px 6px',
              borderRadius: 8,
              background: C.cyanBg,
              border: `1px solid ${C.cyanBorder}`,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 16, color: C.cyan, marginBottom: 4 }}>✓</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{label}</div>
            </div>
          ))}
        </div>
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
      borderBottom: '1px solid rgba(34,211,238,0.10)',
    }}>
      <div style={{
        fontSize: 11,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.15em',
        marginBottom: 16,
      }}>
        DATA SOURCES
      </div>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 16,
        fontSize: 13,
        color: 'var(--text-secondary)',
      }}>
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
function FeatureCard({ icon, title, description }) {
  return (
    <div style={{
      padding: '28px 24px',
      borderRadius: 16,
      background: 'rgba(34,211,238,0.04)',
      border: `1px solid ${C.cyanBorder}`,
      transition: 'all 0.2s',
    }}>
      <div style={{ fontSize: 36, marginBottom: 16 }}>{icon}</div>
      <h3 style={{
        fontSize: 17,
        fontWeight: 700,
        marginBottom: 10,
        color: 'var(--text-primary)',
      }}>
        {title}
      </h3>
      <p style={{
        fontSize: 13,
        lineHeight: 1.7,
        color: 'var(--text-secondary)',
      }}>
        {description}
      </p>
    </div>
  );
}

function FeaturesSection() {
  return (
    <section style={{
      padding: '64px 20px',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{
          fontSize: 11,
          color: C.cyan,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          marginBottom: 12,
        }}>
          FEATURES
        </div>
        <h2 style={{
          fontSize: 'clamp(24px, 4vw, 32px)',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: 12,
        }}>
          投資判断を、データで武装する。
        </h2>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 20,
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
      padding: '64px 20px',
      borderTop: '1px solid rgba(34,211,238,0.10)',
      borderBottom: '1px solid rgba(34,211,238,0.10)',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{
          fontSize: 11,
          color: C.cyan,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          marginBottom: 12,
        }}>
          PRICING
        </div>
        <h2 style={{
          fontSize: 'clamp(24px, 4vw, 32px)',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: 12,
        }}>
          シンプルな料金体系
        </h2>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 20,
        maxWidth: 760,
        margin: '0 auto',
      }}>
        {/* Free プラン */}
        <div style={{
          padding: '32px 24px',
          borderRadius: 16,
          background: 'rgba(148,163,184,0.04)',
          border: '1px solid rgba(148,163,184,0.30)',
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🆓</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            無料
          </h3>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 20 }}>
            ¥0<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)' }}>/月</span>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', fontSize: 13, lineHeight: 2 }}>
            <li style={{ color: 'var(--text-secondary)' }}>✓ 基本分析（3銘柄/日）</li>
            <li style={{ color: 'var(--text-secondary)' }}>✓ 5条件 即時判定</li>
            <li style={{ color: 'var(--text-secondary)' }}>✓ 株価チャート閲覧</li>
            <li style={{ color: 'var(--text-muted)' }}>— 市場の声（プレビューのみ）</li>
            <li style={{ color: 'var(--text-muted)' }}>— AI 詳細レポート</li>
          </ul>
          <SecondaryCTA onClick={onFreeStart} fullWidth>
            今すぐ無料で始める
          </SecondaryCTA>
        </div>

        {/* Pro プラン (おすすめ表示) */}
        <div style={{
          position: 'relative',
          padding: '32px 24px',
          borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(34,211,238,0.10), rgba(34,211,238,0.04))',
          border: `1px solid ${C.cyanBorderStrong}`,
          boxShadow: '0 0 24px rgba(34,211,238,0.15)',
        }}>
          {/* おすすめバッジ */}
          <div style={{
            position: 'absolute',
            top: -12,
            right: 20,
            padding: '4px 12px',
            borderRadius: 9999,
            background: C.cyan,
            color: '#0f172a',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.02em',
          }}>
            おすすめ
          </div>
          <div style={{ fontSize: 24, marginBottom: 8 }}>✨</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            Pro
          </h3>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.cyan, marginBottom: 4 }}>
            ¥980<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)' }}>/月</span>
          </div>
          <div style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: 9999,
            background: C.cyanBg,
            border: `1px solid ${C.cyanBorder}`,
            color: C.cyan,
            fontSize: 11,
            fontWeight: 600,
            marginBottom: 20,
          }}>
            🎁 7日間 完全無料
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', fontSize: 13, lineHeight: 2 }}>
            <li style={{ color: 'var(--text-secondary)' }}>✓ 分析数 <strong style={{ color: C.cyan }}>無制限</strong></li>
            <li style={{ color: 'var(--text-secondary)' }}>✓ 市場の声 フル表示</li>
            <li style={{ color: 'var(--text-secondary)' }}>✓ AI 詳細レポート</li>
            <li style={{ color: 'var(--text-secondary)' }}>✓ ウォッチリスト無制限</li>
            <li style={{ color: 'var(--text-secondary)' }}>✓ 決算前自動分析</li>
          </ul>
          <PrimaryCTA onClick={onProCheckout} fullWidth>
            7日間無料で試す →
          </PrimaryCTA>
          <p style={{
            marginTop: 12,
            fontSize: 11,
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}>
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
      borderBottom: '1px solid rgba(148,163,184,0.20)',
      padding: '20px 0',
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
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        <span>{q}</span>
        <span style={{
          color: C.cyan,
          fontSize: 20,
          transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
          marginLeft: 12,
        }}>
          +
        </span>
      </button>
      {open && (
        <p style={{
          marginTop: 12,
          fontSize: 14,
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
      padding: '64px 20px',
      maxWidth: 720,
      margin: '0 auto',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          fontSize: 11,
          color: C.cyan,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          marginBottom: 12,
        }}>
          FAQ
        </div>
        <h2 style={{
          fontSize: 'clamp(24px, 4vw, 28px)',
          fontWeight: 700,
          color: 'var(--text-primary)',
        }}>
          よくあるご質問
        </h2>
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
      padding: '64px 20px 80px',
      textAlign: 'center',
      background: 'linear-gradient(180deg, transparent, rgba(34,211,238,0.06))',
      borderTop: '1px solid rgba(34,211,238,0.10)',
    }}>
      <h2 style={{
        fontSize: 'clamp(22px, 4vw, 30px)',
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: 16,
      }}>
        さあ、決算を読み解こう。
      </h2>
      <p style={{
        fontSize: 14,
        color: 'var(--text-secondary)',
        marginBottom: 32,
      }}>
        登録は Google アカウントで30秒。クレカ不要。
      </p>
      <PrimaryCTA
        onClick={onFreeStart}
        icon={<GoogleIcon />}
      >
        今すぐ無料で始める
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
      // 全幅ヒーロー対応のため親のパディングを脱出
      width: '100vw',
      marginLeft: 'calc(-50vw + 50%)',
      marginRight: 'calc(-50vw + 50%)',
      // ダークテーマの基本背景
      background: 'var(--bg-primary)',
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
