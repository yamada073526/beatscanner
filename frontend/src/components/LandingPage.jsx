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
      padding: '48px 24px 48px',  // v40: 下 padding を 36 → 48 に増やして呼吸を確保
      position: 'relative',
      overflow: 'hidden',
      borderBottom: '1px solid var(--border)',  // v40: Hero 終端を視覚的に明示
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
        <span style={{ display: 'block' }}>買うべきか分からない</span>
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

      {/* メインCTA + 1行補助テキスト (v40: 「登録不要で試せる」と「登録30秒」の
          矛盾を解消。CTA は「無料で始める」、補助は「クレカ不要・Googleで30秒」に統一) */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <PrimaryCTA onClick={onFreeStart}>
          <GoogleIcon /> 無料で始める
        </PrimaryCTA>
        <div style={{
          marginTop: 12,
          marginBottom: 0,
          fontSize: 12,
          color: 'var(--text-muted)',
          textAlign: 'center',
        }}>
          クレカ不要・Googleで30秒
        </div>
      </div>
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
        marginBottom: 4,
      }}>
        🔥 今日の注目
      </div>
      {/* v40: クリック可能シグナル — モバイルで hover が効かないため明示 */}
      <div style={{
        textAlign: 'center',
        fontSize: 11,
        color: 'var(--text-muted)',
        marginBottom: 12,
      }}>
        ↓ タップで即分析（登録不要）
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
        maxWidth: 720,  // v40: 機能カード等と幅を揃える
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
                    position: 'relative',  // v40: 矢印 absolute 配置のため
                    textAlign: 'center',
                    padding: '16px 12px',
                    cursor: 'pointer',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                  }}
                >
                  <div style={{
                    fontSize: 20,  // v40: 16 → 20 でティッカーを主役化
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: 4,
                  }}>{m.ticker}</div>
                  <div style={{
                    fontSize: 12,
                    color: '#34ef81',  // v40: シアン → 緑 (上昇=緑の業界ルール)
                    fontWeight: 600,
                    marginBottom: 4,
                  }}>{pctStr}</div>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    lineHeight: 1.4,
                  }}>{desc || 'クリックで分析'}</div>
                  {/* v40: クリック可能を示す矢印 */}
                  <span style={{
                    position: 'absolute',
                    bottom: 8,
                    right: 10,
                    fontSize: 12,
                    color: '#22d3ee',
                    opacity: 0.6,
                  }} aria-hidden="true">→</span>
                </div>
              );
            })
        }
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>
    </section>
  );
}

// ── セクション 2.5 (v40 新設): 今週の注目決算 ────────────────────────────
// /api/calendar から今後 30 日以内の決算予定を取得し、最も近い 3 件を表示。
// FOMO + 「未来の判断材料」訴求で「毎日見たい」体験を強化。
function UpcomingEarningsSection({ onTickerClick }) {
  const [items, setItems] = useState(null);  // null: loading / array: loaded / 'error': error
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/calendar')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(d => {
        if (cancelled) return;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const enriched = (Array.isArray(d) ? d : [])
          .map(item => {
            try {
              const dt = new Date(`${item.date}T00:00:00`);
              const daysUntil = Math.floor((dt - today) / 86400000);
              return { ...item, daysUntil };
            } catch { return null; }
          })
          .filter(it => it && it.daysUntil >= 0 && it.daysUntil <= 30)
          .sort((a, b) => a.daysUntil - b.daysUntil)
          .slice(0, 3);
        setItems(enriched);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setItems('error');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // エラー or 0件は非表示
  if (items === 'error') return null;
  if (!loading && (!items || items.length === 0)) return null;

  return (
    <section style={{ padding: '32px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: 4,
        }}>
          ⚠️ 今週の注目決算
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          ↓ タップで事前分析
        </div>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
        maxWidth: 720,
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
          : items.map(item => {
              const dayLabel = item.daysUntil === 0
                ? '本日決算'
                : item.daysUntil === 1
                ? '明日決算'
                : `あと${item.daysUntil}日`;
              return (
                <div
                  key={item.symbol}
                  className="panel-card"
                  onClick={() => onTickerClick?.(item.symbol)}
                  style={{
                    position: 'relative',
                    textAlign: 'center',
                    padding: '16px 12px',
                    cursor: 'pointer',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                  }}
                >
                  <div style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: 4,
                  }}>{item.symbol}</div>
                  <div style={{
                    fontSize: 12,
                    color: '#f59e0b',  // amber: FOMO/緊急性
                    fontWeight: 600,
                    marginBottom: 4,
                  }}>{dayLabel}</div>
                  <div style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                  }}>{item.date}</div>
                  <span style={{
                    position: 'absolute',
                    bottom: 8,
                    right: 10,
                    fontSize: 12,
                    color: '#22d3ee',
                    opacity: 0.6,
                  }} aria-hidden="true">→</span>
                </div>
              );
            })
        }
      </div>
    </section>
  );
}

// ── セクション 2.7 (v40+ 新設): サンプル分析結果 ──────────────────────────
// 「契約後にどんな画面が見られるか」を 1 枚で示す Show-don't-tell 戦略。
// 静的データで NVDA の 5 条件 PASS + 市場の声 + CTA を実 UI 風に再現。
// クリックで NVDA 分析を実行 → ログインなしで価値体験 → 登録動機を最大化。
function SampleAnalysisSection({ onTickerClick }) {
  const conditions = [
    { label: '営業CFマージン', value: '38.2%' },
    { label: 'EPS 連続増加', value: '4Q' },
    { label: 'CFPS 連続増加', value: '4Q' },
    { label: '売上 連続増加', value: '4Q' },
    { label: 'CFPS > EPS (粉飾リスク低)', value: '✓' },
  ];
  return (
    <section style={{ padding: '32px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: 4,
        }}>
          📊 サンプル分析結果
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          ↓ 実際にこういう画面が見られます
        </div>
      </div>

      {/* 単一の panel-card で実 UI を再現 */}
      <div
        className="panel-card"
        onClick={() => onTickerClick?.('NVDA')}
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '20px 22px',
          borderRadius: 14,
          background: 'var(--bg-card)',
          border: '1px solid rgba(34,211,238,0.40)',
          boxShadow: '0 0 18px rgba(34,211,238,0.10)',
          cursor: 'pointer',
        }}
      >
        {/* ヘッダー: ティッカー + PASS バッジ */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
        }}>
          <div>
            <div style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--text-primary)',
              lineHeight: 1.2,
            }}>NVDA</div>
            <div style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginTop: 2,
            }}>NVIDIA Corp.</div>
          </div>
          <span style={{
            background: 'rgba(34,239,129,0.15)',
            color: '#34ef81',
            padding: '4px 12px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 700,
            border: '1px solid rgba(34,239,129,0.35)',
          }}>✓ PASS 5/5</span>
        </div>

        {/* 5 条件リスト */}
        <div style={{
          background: 'rgba(34,211,238,0.04)',
          borderRadius: 8,
          padding: '12px 14px',
          marginBottom: 14,
        }}>
          {conditions.map(c => (
            <div key={c.label} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
              padding: '4px 0',
              color: 'var(--text-secondary)',
            }}>
              <span>
                <span style={{ color: '#34ef81', marginRight: 8 }}>✓</span>
                {c.label}
              </span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {c.value}
              </span>
            </div>
          ))}
        </div>

        {/* 市場の声プレビュー */}
        <div style={{
          background: 'rgba(245,158,11,0.04)',
          borderRadius: 8,
          padding: '12px 14px',
          marginBottom: 14,
          border: '1px solid rgba(245,158,11,0.15)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}>
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-secondary)',
            }}>
              📊 市場の声
            </span>
            <span style={{
              background: 'rgba(245,158,11,0.15)',
              color: '#f59e0b',
              padding: '2px 10px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 700,
            }}>⚡ 強弱混在</span>
          </div>
          <div style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            borderLeft: '2px solid rgba(34,211,238,0.3)',
            paddingLeft: 10,
          }}>
            AI半導体需要は堅調。ただし競合台頭とバリュエーション面での割高感が懸念材料。
          </div>
        </div>

        {/* CTA — クリックで NVDA 分析を実行 (デモ) */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onTickerClick?.('NVDA'); }}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: 10,
            background: '#22d3ee',
            color: '#0f172a',
            border: 'none',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 0 12px rgba(34,211,238,0.30)',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#06b6d4'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#22d3ee'; }}
        >
          📄 NVDA の完全な分析を見る →
        </button>
      </div>
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
      <div style={{ fontSize: 24, marginBottom: 10 }}>{icon}</div>
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

// v39: 市場の声カード用 UI モックアップ (拡充版)
// — センチメントバッジ + 要約引用 + 強気/弱気材料 + キー指標フッター
function MarketVoiceMockup() {
  const items = [
    { icon: '🟢', text: 'AI需要が継続拡大' },
    { icon: '🔴', text: '競合AMDが猛追中' },
    { icon: '🔴', text: 'バリュエーション割高懸念' },
  ];
  return (
    <div style={{
      background: 'rgba(34,211,238,0.06)',
      borderRadius: 8,
      padding: '10px 12px',
      marginTop: 8,
      fontSize: 11,
    }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
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
      {/* 要約引用 (cyan 縦線で引用感を出す) */}
      <div style={{
        fontSize: 10,
        color: 'var(--text-secondary)',
        marginBottom: 8,
        lineHeight: 1.5,
        borderLeft: '2px solid rgba(34,211,238,0.3)',
        paddingLeft: 8,
      }}>
        AI半導体需要は堅調。ただし競合台頭と<br />
        バリュエーション面での割高感が懸念材料。
      </div>
      {/* 強気・弱気材料 */}
      {items.map((it, i) => (
        <div key={i} style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          marginBottom: 3,
        }}>
          {it.icon} {it.text}
        </div>
      ))}
      {/* キー指標フッター */}
      <div style={{
        marginTop: 8,
        padding: '4px 8px',
        background: 'rgba(34,211,238,0.06)',
        borderRadius: 4,
        fontSize: 10,
        color: 'var(--text-muted)',
      }}>
        📌 次回決算: EPS $0.89予想 / 毎朝4時更新
      </div>
    </div>
  );
}

// v39: チャート連動カード用 UI モックアップ (拡充版)
// — 期間切替タブ + 株価線 + Beat/Miss マーカー + 遡及訴求
function ChartLinkMockup() {
  const periods = ['1Q', '1Y', '3Y', '5Y'];
  const activeIdx = 2;  // 3Y を選択中
  return (
    <div style={{
      background: 'rgba(34,211,238,0.06)',
      borderRadius: 8,
      padding: '10px 12px',
      marginTop: 8,
      fontSize: 11,
    }}>
      {/* 期間切替タブ */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: 8,
      }}>
        {periods.map((label, i) => (
          <span key={label} style={{
            fontSize: 9,
            padding: '1px 6px',
            borderRadius: 3,
            background: i === activeIdx ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.05)',
            color: i === activeIdx ? '#22d3ee' : 'var(--text-muted)',
            fontWeight: i === activeIdx ? 700 : 400,
          }}>{label}</span>
        ))}
      </div>
      {/* 株価ラインチャート */}
      <svg width="100%" height="48" viewBox="0 0 200 48" preserveAspectRatio="none" aria-hidden="true">
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
      {/* キャプション */}
      <div style={{
        marginTop: 4,
        fontSize: 10,
        color: 'var(--text-muted)',
      }}>
        ▲ Beat / ▼ Miss を株価に重ねて表示
      </div>
      {/* 遡及訴求 */}
      <div style={{
        marginTop: 6,
        fontSize: 10,
        color: 'var(--text-muted)',
        textAlign: 'center',
      }}>
        過去5年・20決算まで遡及可能
      </div>
    </div>
  );
}

function FeaturesSection() {
  return (
    <section style={{ padding: '56px 20px' }}>
      {/* v40: Hero と訴求重複のため見出し削除 — カードを直接見せる Apple/Stripe 流 */}
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
      {/* v40: 見出し削除 — 「シンプルな料金体系」は当たり前すぎて情報価値ゼロ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 16,
        maxWidth: 720,
        margin: '0 auto',
      }}>
        {/* Free プラン — panel-card / v39: 上部エリアを div ラップ + minHeight で
            Pro カードと ✓ 項目の開始位置を水平揃え。
            CTA は marginTop:auto で底固定。 */}
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
          {/* 上部エリア: アイコン + プラン名 + 価格。
              minHeight で Pro カードの上部 (アイコン+名+価格+¥33+pill+ベネフィット) と高さ揃え。
              v40: ベネフィットコピー追加に伴い 152 → 188 に増量 */}
          <div style={{ minHeight: 188 }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>🆓</div>
            <h3 className="section-heading" style={{ fontSize: 16, marginBottom: 4 }}>
              無料
            </h3>
            <div style={{
              fontSize: 26, fontWeight: 700,
              color: 'var(--text-primary)',
            }}>
              ¥0<span style={{
                fontSize: 13, fontWeight: 400, color: 'var(--text-muted)',
              }}>/月</span>
            </div>
          </div>
          {/* 中部: ✓ リスト (上部直後に通常フロー — Pro と水平揃え) */}
          <ul style={{
            listStyle: 'none', padding: 0, margin: '0 0 22px',
            fontSize: 13, lineHeight: 2, color: 'var(--text-secondary)',
          }}>
            <li>✓ 3銘柄/日まで無料分析</li>
            <li>✓ 5条件 即時判定</li>
            <li>✓ 株価チャート閲覧</li>
          </ul>
          {/* 下部: CTA を marginTop:auto で底固定 */}
          <div style={{ marginTop: 'auto' }}>
            <OutlinedCTA onClick={onFreeStart} fullWidth>
              今すぐ無料で始める
            </OutlinedCTA>
          </div>
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
          {/* v39: 上部エリアを div ラップ — Free カードと minHeight 揃え */}
          <div>
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
              marginBottom: 12,
            }}>
              🎁 7日間 完全無料
            </div>
            {/* v40: ベネフィット1行コピー — 機能リストの前にPro価値を要約 */}
            <div style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginBottom: 0,
              lineHeight: 1.5,
            }}>
              市場の声 + AI レポートで、<br />
              「買いか撤退か」の根拠が手に入る。
            </div>
          </div>
          {/* 中部: ✓ リスト — 上部直後に通常フローで Free と水平揃え */}
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
          {/* 下部: 信頼バッジ + CTA + 年払いバッジを marginTop:auto で底固定 */}
          <div style={{ marginTop: 'auto' }}>
            {/* v40+: Stripe 信頼バッジ — クレカ登録の心理障壁を低減 */}
            <div style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              textAlign: 'center',
              marginBottom: 10,
              lineHeight: 1.6,
            }}>
              🔒 Stripe で安全に決済 / いつでも解約可
            </div>
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
      {/* v40: 見出し削除 — 「Q.」が並んでいれば自明 */}
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
      padding: '40px 20px 56px',  // v40+: 56/72 → 40/56 で過剰余白を縮小
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
      <UpcomingEarningsSection onTickerClick={onTickerClick} />
      <SampleAnalysisSection onTickerClick={onTickerClick} />
      <FeaturesSection />
      <PricingSection onFreeStart={onSignIn} onProCheckout={handleProClick} />
      <FAQSection />
      {/* v40+: データソース表記を FAQ 後 フッター直前に移動 (孤立を解消) */}
      <div style={{
        textAlign: 'center',
        fontSize: 11,
        color: 'var(--text-muted)',
        padding: '16px 20px',
        borderTop: '1px solid var(--border)',
      }}>
        Powered by Financial Modeling Prep · Yahoo Finance · Anthropic Claude
      </div>
      <FooterCTASection onFreeStart={onSignIn} />
    </div>
  );
}
