import { useState, useEffect } from 'react';
import { Zap, MessageSquare, BarChart3, TrendingUp, AlertTriangle, Eye, Clock, LineChart, Sparkles, Gift, Lock, Tag, Crown } from 'lucide-react';
import { useBacktest } from '../hooks/useBacktest.js';
import ProTeaser from './ui/ProTeaser.jsx';

const API_BASE = import.meta.env.VITE_API_URL || '';

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
        background: hover ? 'var(--color-accent-strong)' : 'rgb(56, 189, 248)',
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
        color: 'rgb(56, 189, 248)',
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
        color: 'rgb(56, 189, 248)',
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
//
// Phase 3 Sub-1 (handover v72 §2-B、 2026-05-16): backtest 実証データを hero に統合。
// 「決算を見ても買うべきか分からない」 → 「過去 5 年で 100 万円 → XXX 万円」 (動的取得) という
// 痛み→ 解決→ 実証 の 3 段で説得力強化。 数字は useBacktest hook の動的取得値を使用
// (Trust Cliff 回避: 訴求文言と本番 backtest 結果が常時一致)。

// 数字フォーマッタ (BacktestPage と同じシグネチャ、 LP chunk 内 inline 定義)
function fmtSignedPctLP(n, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}
function fmtJpyLP(yen) {
  if (yen == null || !Number.isFinite(yen)) return '—';
  if (yen >= 100_000_000) return `${(yen / 100_000_000).toFixed(yen >= 1_000_000_000 ? 0 : 1)} 億円`;
  return `${Math.round(yen / 10_000).toLocaleString('ja-JP')} 万円`;
}
const HERO_BASE_JPY_LP = 1_000_000;

function goToBacktest() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('layout', 'backtest');
    window.location.href = url.toString();
  } catch {
    window.location.href = '/?layout=backtest';
  }
}

function HeroSection({ onFreeStart }) {
  // backtest 実証データ取得 (5y / 365d 保有、 useBacktest は 30 分 module cache)
  // Phase 2.2 full (handover v73 §2-A): per-trade avg → portfolio cum_return に切替。
  // 「過去 5 年運用したら $10K → $XX,XXX」 という真の portfolio simulation 結果を訴求。
  // portfolio 取得失敗時は per-trade avg に fallback (旧 LP 体験継続)。
  const { data: bt, loading: btLoading } = useBacktest('5y', 365);
  const pf = bt?.portfolio && !bt.portfolio.error ? bt.portfolio : null;
  const pfCum = pf?.kpis?.cum_return_pct;
  const pfAlpha = pf?.kpis?.alpha_pct;
  const btAvg = pfCum != null ? pfCum : bt?.kpis?.avg_return_pct;
  const btAlpha = pfAlpha != null ? pfAlpha : bt?.kpis?.avg_alpha_pct;
  const usingPortfolio = pfCum != null;
  const btFutureJpy = btAvg != null ? HERO_BASE_JPY_LP * (1 + btAvg / 100) : null;
  const hasBacktest = !btLoading && btAvg != null && btAlpha != null;

  return (
    <section style={{
      textAlign: 'center',
      padding: '48px 24px 48px',  // v40: 下 padding を 36 → 48 に増やして呼吸を確保
      position: 'relative',
      overflow: 'hidden',
      borderBottom: '1px solid var(--border)',  // v40: Hero 終端を視覚的に明示
    }}>
      {/* 背景の装飾（放射状グロー）
          Phase 3 Sub-3 dogfood Round 3 (handover v72、 2026-05-16): user 指摘
          「上に横一直線のクリッピング」 解消。 旧版は transform translate(-50%, -60%) で
          楕円中心を上方シフトしていたため、 楕円の上端が hero overflow:hidden で
          硬く切れて水平線として見えていた。 BacktestPage の hero::before と同じ
          「mask radial 4 辺均一フェード」 pattern を適用 → 縁が hero の境界に到達する前に
          二重 (gradient transparent + mask radial) で完全透明化。 */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '1100px',
          height: '400px',
          background: 'radial-gradient(ellipse, rgba(56,189,248,0.07) 0%, transparent 60%)',
          pointerEvents: 'none',
          zIndex: 0,
          WebkitMaskImage: 'radial-gradient(ellipse, black 20%, transparent 55%)',
          maskImage: 'radial-gradient(ellipse, black 20%, transparent 55%)',
        }}
      />

      {/* β バッジ削除 (v37): 招待制という虚偽訴求を回避 + Hero ノイズ削減 */}

      {/* メインコピー (Phase 3 Sub-3 dogfood Round 2、 handover v72、 subagent 案 A 採用)
          旧版 (痛み→解決型 2 行)「決算を見ても / 買うべきか分からない」 + サブコピー
          「プロが使う5条件で、2秒で判定。」 → 1 行断言型に圧縮。
          根拠 3 個 (subagent レビュー):
            (1) 5 原則 #1「読み手 2 秒で分かる」 体現: 12 字 1 行で reading time 0.8 秒
                (旧版 1.4 秒から 43% 短縮)
            (2) Aman / Ritz-Carlton 級 dark luxury 世界観と整合: 「勝てる」 能動語 +
                体言止め+読点で Bloomberg Terminal × 茶室の余白を両立
            (3) Trust Cliff / SEC/金商法回避: 「勝てる」 は能力訴求 (BeatScanner で判定可能の意)、
                予測ではないので法的に安全。 数値訴求は実証 chip に閉じ込めて二段ロケット効果
          Typography: clamp 32-56px → 40-72px / weight 600 → 700 / letter-spacing -0.02em → -0.025em
          で「ロビーの天井高」 を演出。 */}
      <h1
        className="hero-title"
        style={{
          position: 'relative', zIndex: 1,
          textAlign: 'center',
          fontSize: 'clamp(40px, 6.5vw, 72px)',
          fontWeight: 700,
          lineHeight: 1.1,
          margin: '0 0 16px',
          letterSpacing: '-0.025em',
        }}
      >
        勝てる決算、 2 秒で。
      </h1>

      {/* v138 Phase 2B audit 後: 既存 segment data (NVDA Data Center YoY +92%、 AAPL iPhone YoY +21%、 GOOGL Cloud YoY +63%、 MSFT Azure 系 YoY +31%) と「予想 vs 実績」 verdict (bm_data → DiagramCard / SegmentSection) は backend で動作確認済。 LP 訴求を「2 本柱日本語チェック」 から「部門別売上・予想比較まで日本語で」 に拡張、 機能事実訴求で Trust Cliff Risk なし。 v146: 「来期見通し」 を追加 = アナリストコンセンサス YoY (FMP analyst-estimates、 高 coverage・検証済) で
          実装 (前方視界、 アプリの「来期見通し」 label と完全一致 → Trust Cliff #1 OK)。 ⚠️会社開示「ガイダンス」 (SEC 8-K、
          抽出精度 20-35%) とは別物・別訴求なので「ガイダンス」 表記は引き続き不使用 (8-K は Phase 2D で 60-70% 達成後再考)。
          「機関投資家級」 等の主観言葉は §38 断定 risk 回避で見送り。 */}
      <p
        className="hero-subtitle"
        style={{
          position: 'relative', zIndex: 1,
          textAlign: 'center',
          fontSize: 'clamp(15px, 2vw, 18px)',
          fontWeight: 500,
          lineHeight: 1.5,
          margin: '0 auto 24px',
          maxWidth: '720px',
          color: 'var(--text-secondary)',
          letterSpacing: '-0.005em',
        }}
      >
        決算 quarterly + テクニカル daily、 部門別売上・予想比較・来期見通しまで日本語で。
      </p>

      {/* Phase 3 Sub-1: 実証データブロック (過去 5 年バックテスト結果)
          数字は動的取得 (Trust Cliff 回避)、 取得失敗時は section ごと自動非表示で hero 健全性維持 */}
      {hasBacktest && (
        <div style={{ position: 'relative', zIndex: 1, margin: '0 auto 24px', maxWidth: 420, textAlign: 'center' }}>
        <button
          type="button"
          onClick={goToBacktest}
          aria-label="バックテスト実証データを見る"
          style={{
            position: 'relative', zIndex: 1,
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            margin: '0 auto 8px',
            padding: '14px 24px',
            background: 'rgba(34, 197, 94, 0.06)',
            border: '1px solid rgba(34, 197, 94, 0.22)',
            borderRadius: 14,
            cursor: 'pointer',
            transition: 'background 0.2s ease, border-color 0.2s ease, transform 0.2s ease',
            font: 'inherit',
            color: 'inherit',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(34, 197, 94, 0.10)';
            e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.45)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(34, 197, 94, 0.06)';
            e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.22)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}>
            過去 5 年 実証データ
          </span>
          <span style={{
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: 10,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '0.01em',
          }}>
            <span style={{ fontSize: 'clamp(16px, 2.4vw, 20px)', fontWeight: 600, color: 'var(--text-secondary)' }}>
              100 万円
            </span>
            <span style={{ fontSize: 'clamp(14px, 2vw, 16px)', color: 'var(--text-muted)', fontWeight: 300, opacity: 0.7 }}>
              →
            </span>
            <span style={{ fontSize: 'clamp(22px, 3.6vw, 32px)', fontWeight: 700, color: 'var(--color-gain)' }}>
              {fmtJpyLP(btFutureJpy)}
            </span>
          </span>
          <span style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            letterSpacing: '0.02em',
          }}>
            {usingPortfolio ? '月次リバランスで運用、 5 年累積' : '1 銘柄あたり平均'} <strong style={{ color: 'var(--color-gain)', fontWeight: 700 }}>{fmtSignedPctLP(btAvg)}</strong>
            <span style={{ margin: '0 6px', opacity: 0.5 }}>·</span>
            S&amp;P 500 を <strong style={{ color: 'var(--color-gain)', fontWeight: 700 }}>{fmtSignedPctLP(btAlpha)}</strong> ポイント上回る
          </span>
          <span style={{
            marginTop: 4,
            fontSize: 11,
            color: 'rgb(56, 189, 248)',
            letterSpacing: '0.04em',
          }}>
            実証データを見る →
          </span>
        </button>
        {/* §38 免責 inline 表示 (funnel-cro / Trust Cliff): payload の静的 disclaimer
            (backend main.py:4746、 LLM 非生成) を hero 数値訴求の直下に明示。
            倍増 headline + 免責 1-click 先の Trust Cliff を解消。 数値は n=20 preliminary。 */}
        <p style={{
          margin: 0,
          fontSize: 10,
          lineHeight: 1.5,
          color: 'var(--text-muted)',
          letterSpacing: '0.01em',
          opacity: 0.85,
        }}>
          {bt?.disclaimer || '過去実績は将来を保証しません。 本機能は教育目的、 投資勧誘ではありません。'}
        </p>
        </div>
      )}

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

// 相対時刻フォーマッタ — 「たった今 / X分前 / X時間前 / X日前」
// 引数: ISO 文字列 OR Unix エポック (秒 or ミリ秒どちらにも対応)
// /api/movers の updated_at は epoch 秒 (例: 1777880534) のため検出して ms 化する
function formatRelativeTime(input) {
  if (input == null) return '';
  let then;
  if (typeof input === 'number') {
    // 10 桁 (≒ 2001-2286年範囲) なら秒、13 桁ならミリ秒として扱う
    const ms = input < 1e12 ? input * 1000 : input;
    then = new Date(ms);
  } else {
    then = new Date(input);
  }
  if (isNaN(then.getTime())) return '';
  const diffMin = Math.floor((Date.now() - then.getTime()) / 60000);
  if (diffMin < 0) return 'たった今';  // 時計ずれの保険
  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}時間前`;
  return `${Math.floor(diffHr / 24)}日前`;
}

// ── セクション 2 (v37 新設): 今日の注目銘柄 ──────────────────────────────
// 急騰 Top3 を /api/movers から取得して表示。クリックでデモ分析へ直結。
// 「毎日見たい」体験を作り、未ログインでもブックマーク価値を生む。
// v40+: updated_at で「最終更新 X 分前」を表示してリアルタイム感を演出。
function TodayHotSection({ onTickerClick }) {
  const [movers, setMovers] = useState(null);  // null: loading / [] or array: loaded / 'error': error
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  // 1 分ごとに「X 分前」表示を再計算するため強制再レンダー用 tick state
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/movers')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(d => {
        if (cancelled) return;
        const top3 = (d?.gainers || []).slice(0, 3);
        setMovers(top3);
        setUpdatedAt(d?.updated_at || null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setMovers('error');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // 1 分ごとに再レンダー (formatRelativeTime の表示更新)
  useEffect(() => {
    if (!updatedAt) return;
    const t = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, [updatedAt]);


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
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        width: '100%',
      }}>
        <TrendingUp size={14} strokeWidth={2.2} style={{ color: 'rgb(245, 158, 11)' }} />
        今日の注目
      </div>
      {/* v40: クリック可能シグナル — モバイルで hover が効かないため明示 */}
      <div style={{
        textAlign: 'center',
        fontSize: 11,
        color: 'var(--text-muted)',
        marginBottom: 12,
      }}>
        ↓ タップで即分析（登録不要）
        {updatedAt && (
          <span style={{ marginLeft: 8, opacity: 0.7 }}>
            · 最終更新 {formatRelativeTime(updatedAt)}
          </span>
        )}
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
                    color: 'var(--color-gain)',  // v40: シアン → 緑 (上昇=緑の業界ルール)
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
                    color: 'rgb(56, 189, 248)',
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
          // v62: 上限 30 日を撤去 — 直近決算が遠い時期 (例: 決算シーズン直後) でも
          // 常に「次に来る 3 件」を表示する。「決算の近い銘柄」訴求を維持。
          .filter(it => it && it.daysUntil >= 0)
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
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <AlertTriangle size={14} strokeWidth={2.2} style={{ color: 'var(--color-warning)' }} />
          決算の近い銘柄
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
                    color: 'var(--color-warning)',  // amber: FOMO/緊急性
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
                    color: 'rgb(56, 189, 248)',
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

// ── セクション 2.6 (v40+ 新設): あなたが見た銘柄 ────────────────────────
// localStorage の bs_analyzed (App.jsx runAnalyze で記録) と /api/calendar を突合し、
// 「過去に分析した銘柄で、決算が 30 日以内に近づいているもの」を最大 3 件表示。
// リピート訪問者にだけ表示される動的セクション (初回訪問者には非表示)。
function MissedSection({ onTickerClick }) {
  const [items, setItems] = useState(null);  // null: loading / [] or array: loaded

  useEffect(() => {
    let cancelled = false;
    let analyzed = {};
    try {
      analyzed = JSON.parse(localStorage.getItem('bs_analyzed') || '{}');
    } catch { /* private mode 等 */ }
    const tickers = Object.keys(analyzed);
    if (tickers.length === 0) {
      setItems([]);  // 空配列 → 非表示
      return;
    }
    fetch('/api/calendar')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(d => {
        if (cancelled) return;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const matches = (Array.isArray(d) ? d : [])
          .filter(c => analyzed[c.symbol])
          .map(c => {
            try {
              const dt = new Date(`${c.date}T00:00:00`);
              const daysUntil = Math.floor((dt - today) / 86400000);
              const daysAgo = Math.floor((Date.now() - analyzed[c.symbol]) / 86400000);
              return { ...c, daysUntil, daysAgo };
            } catch { return null; }
          })
          .filter(c => c && c.daysUntil >= 0 && c.daysUntil <= 30)
          .sort((a, b) => a.daysUntil - b.daysUntil)
          .slice(0, 3);
        setItems(matches);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => { cancelled = true; };
  }, []);

  // 0件 (初回訪問者 or 該当なし) はセクション全体を非表示
  if (!items || items.length === 0) return null;

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
          <Eye size={14} strokeWidth={2.2} style={{ color: 'rgb(56, 189, 248)', display: 'inline-block', verticalAlign: 'middle', marginRight: 6, marginTop: -2 }} />
          あなたが見た銘柄、決算が近づいています
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          ↓ 再分析で最新データをチェック
        </div>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
        maxWidth: 720,
        margin: '0 auto',
      }}>
        {items.map(item => {
          const dayLabel = item.daysUntil === 0
            ? '本日決算'
            : item.daysUntil === 1
            ? '明日決算'
            : `あと${item.daysUntil}日`;
          const agoLabel = item.daysAgo === 0
            ? '今日見た'
            : item.daysAgo === 1
            ? '昨日見た'
            : `${item.daysAgo}日前に見た`;
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
                border: '1px solid rgba(245,158,11,0.30)',
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
                color: 'var(--color-warning)',
                fontWeight: 600,
                marginBottom: 4,
              }}>{dayLabel}</div>
              <div style={{
                fontSize: 10,
                color: 'var(--text-muted)',
              }}>{agoLabel}</div>
              <span style={{
                position: 'absolute',
                bottom: 8,
                right: 10,
                fontSize: 12,
                color: 'rgb(56, 189, 248)',
                opacity: 0.6,
              }} aria-hidden="true">→</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── セクション 2.65 (v62 復活): 以前に調べた銘柄 ────────────────────────
// localStorage の bs_analyzed (App.jsx runAnalyze で記録) から最近 3 件を表示。
// MissedSection は「決算近接 ∩ 過去分析」のため空になりやすかったので、
// より広く「以前に調べた銘柄」として常時表示するセクションを別建て。
// 初回訪問者 (bs_analyzed 空) には自動で非表示。
function RecentlyAnalyzedSection({ onTickerClick }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let analyzed = {};
    try {
      analyzed = JSON.parse(localStorage.getItem('bs_analyzed') || '{}');
    } catch { /* private mode 等 */ }
    const top = Object.entries(analyzed)
      .map(([symbol, ts]) => ({ symbol, ts: Number(ts) || 0 }))
      .filter(x => x.symbol)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 3);
    setItems(top);
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <section style={{ padding: '32px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: 4,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <Clock size={14} strokeWidth={2.2} style={{ color: 'var(--text-muted)' }} />
          以前に調べた銘柄
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          ↓ クリックで再分析
        </div>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
        maxWidth: 720,
        margin: '0 auto',
      }}>
        {items.map(item => {
          const ago = item.ts ? Math.floor((Date.now() - item.ts) / 86400000) : null;
          const agoLabel = ago == null
            ? ''
            : ago === 0
            ? '今日'
            : ago === 1
            ? '昨日'
            : `${ago}日前`;
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
                color: 'var(--text-muted)',
                fontWeight: 600,
              }}>{agoLabel}</div>
              <span style={{
                position: 'absolute',
                bottom: 8,
                right: 10,
                fontSize: 12,
                color: 'rgb(56, 189, 248)',
                opacity: 0.6,
              }} aria-hidden="true">→</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── セクション 2.7 (v40+ → v75 動的化): サンプル分析結果 ──────────────────
// handover v74 §2-A #3 + 6 体合議 (2026-05-16) verdict:
// gainers Top10 → PASS 5/5 → 4/5 fallback で 1 銘柄を表示。
// 市場の声 mockup は ProTeaser (Premium 解禁訴求) に置換 (景表法・ステマ規制回避)。
// 「最終更新 X 分前」 chip で動的感を担保。
const SAMPLE_STATIC_FALLBACK = {
  ticker: 'NVDA',
  companyName: 'NVIDIA Corp.',
  passedCount: 5,
  totalCount: 5,
  overallPass: true,
  source: 'static_fallback',
  conditions: [
    { name: '営業CFマージン 5%以上', passed: true },
    { name: 'EPS 連続増加 (3期)', passed: true },
    { name: 'CFPS 連続増加 (3期)', passed: true },
    { name: '売上 連続増加 (3期)', passed: true },
    { name: 'CFPS > EPS (粉飾リスク低)', passed: true },
  ],
  updatedAt: null,
};

function SampleAnalysisSection({ onTickerClick, onProCheckout }) {
  const [sample, setSample] = useState(SAMPLE_STATIC_FALLBACK);
  const [loading, setLoading] = useState(true);
  // 1 分毎に再レンダー (formatRelativeTime の表示更新)
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/sample-pass`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        if (cancelled) return;
        if (d && d.ticker) setSample(d);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);  // fallback static は既に initial state
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!sample?.updatedAt) return;
    const t = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, [sample?.updatedAt]);

  const ticker = sample.ticker || 'NVDA';
  const companyName = sample.companyName || 'NVIDIA Corp.';
  const passedCount = typeof sample.passedCount === 'number' ? sample.passedCount : 5;
  const totalCount = sample.totalCount || 5;
  const isPerfect = passedCount === totalCount;
  // 5/5 → 緑、 4/5 → amber、 3 以下 → muted
  const badgeColor = isPerfect
    ? { bg: 'rgba(34,239,129,0.15)', fg: 'var(--color-gain)', border: 'rgba(34,239,129,0.35)' }
    : passedCount >= 4
      ? { bg: 'rgba(245,158,11,0.15)', fg: 'var(--color-warning)', border: 'rgba(245,158,11,0.35)' }
      : { bg: 'rgba(127,127,127,0.10)', fg: 'var(--text-secondary)', border: 'rgba(127,127,127,0.25)' };
  const handleClick = () => onTickerClick?.(ticker);

  return (
    <section style={{ padding: '32px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: 4,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <LineChart size={14} strokeWidth={2.2} style={{ color: 'rgb(56, 189, 248)' }} />
          サンプル分析結果
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          ↓ 実際にこういう画面が見られます
          {sample.updatedAt && (
            <span style={{ marginLeft: 8, opacity: 0.7 }}>
              · 最終更新 {formatRelativeTime(sample.updatedAt)}
            </span>
          )}
        </div>
      </div>

      {/* 単一の panel-card で実 UI を再現。
          v62: baseline cyan border / boxShadow を撤去し他カードと揃える。
          PASS バッジ (緑/amber) でサンプルらしさを担保。
          loading 中は initial NVDA hardcode (opacity 0.6) で skeleton 代用 (Web 開発 agent 推奨)。 */}
      <div
        className="panel-card"
        onClick={handleClick}
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '20px 22px',
          borderRadius: 14,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          opacity: loading ? 0.6 : 1,
          transition: 'opacity 0.3s ease',
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
            }}>{ticker}</div>
            <div style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginTop: 2,
            }}>{companyName}</div>
          </div>
          <span style={{
            background: badgeColor.bg,
            color: badgeColor.fg,
            padding: '4px 12px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 700,
            border: `1px solid ${badgeColor.border}`,
          }}>
            {isPerfect ? '✓ ' : ''}PASS {passedCount}/{totalCount}
          </span>
        </div>

        {/* 5 条件リスト — ✓/✕ icon + 条件名のみ。 数値詳細は判定タブで */}
        <div style={{
          background: 'rgba(34,211,238,0.04)',
          borderRadius: 8,
          padding: '12px 14px',
          marginBottom: 14,
        }}>
          {(sample.conditions || []).slice(0, 5).map((c, i) => (
            <div key={c.name || i} style={{
              display: 'flex',
              alignItems: 'center',
              fontSize: 12,
              padding: '4px 0',
              color: 'var(--text-secondary)',
            }}>
              <span style={{
                color: c.passed ? 'var(--color-gain)' : 'var(--color-loss)',
                marginRight: 8,
                fontWeight: 700,
                width: 14,
                display: 'inline-block',
              }}>{c.passed ? '✓' : '✕'}</span>
              <span style={{ color: c.passed ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {c.name}
              </span>
            </div>
          ))}
        </div>

        {/* CTA — クリックで動的 ticker 分析を実行 (demo モード対応、 handleLPTickerClick 経由) */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleClick(); }}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: 10,
            background: 'rgb(56, 189, 248)',
            color: '#0f172a',
            border: 'none',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 0 12px rgba(34,211,238,0.30)',
            transition: 'background 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-strong)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgb(56, 189, 248)'; }}
        >
          {/* A2 (v141): 旧 📄 絵文字 → lucide Eye (「分析を見る」 の意味、 OS 依存 glyph 排除) */}
          <Eye size={15} strokeWidth={2.2} aria-hidden="true" /> {ticker} の完全な分析を見る →
        </button>
      </div>

      {/* 旧「市場の声」 mockup を ProTeaser に置換 (6 体合議 #3-a B 案、 マーケター指摘の景表法回避)。
          AI 生成 (C 案) は hallucination + 景表法・ステマ規制リスクで本セッション見送り、 Phase 2 候補。 */}
      <div style={{ maxWidth: 720, margin: '16px auto 0' }}>
        <ProTeaser
          title="市場の声 (Pro で解禁)"
          description="ファンダメンタル PASS の銘柄について、 アナリスト評価・ニュース要約・カンファレンスコール抽出を Pro で提供。"
          features={[
            'アナリスト評価サマリ (買い/中立/売り 集計)',
            'カンファレンスコールのポジ/ネガ抽出',
            'AI ニュースタグ (材料、 リスク、 ガイダンス)',
          ]}
          onUpgrade={onProCheckout}
          variant="gold"
        />
      </div>
    </section>
  );
}

// ── セクション 3: 機能紹介 ────────────────────────────────────────────────
// 既存 .panel-card クラスを使用 (ホバー演出付き)
// v37: mockup prop で実 UI 表現を差し込み可能に
// v38: flex column + height:100% で 3 カードを同高揃え
function FeatureCard({ icon: Icon, title, description, mockup }) {
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
      {/* Lucide SVG icon (Phase 3 dogfood、 handover v72): Aman ホテル風 - 極小金属プレート
          + 微発光リング。 旧 ⚡/📊/📈 絵文字は OS 依存 native glyph で品格低下、 SVG で統一。
          Bug fix (handover v72 round): lucide-react は React.forwardRef (typeof = 'object') なので
          typeof === 'function' 判定では落ちる。 `Icon ?` で truthy 判定に変更。 */}
      <div style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: 'rgba(56, 189, 248, 0.08)',
        border: '1px solid rgba(56, 189, 248, 0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        color: 'rgb(56, 189, 248)',
        boxShadow: '0 0 12px rgba(56, 189, 248, 0.12)',
      }}>
        {Icon ? <Icon size={20} strokeWidth={2} /> : null}
      </div>
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
          color: 'var(--color-gain)',
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
          <span style={{ color: 'var(--color-gain)' }}>✓</span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

// v39: 市場の声カード用 UI モックアップ (拡充版)
// — センチメントバッジ + 要約引用 + 強気/弱気材料 + キー指標フッター
function MarketVoiceMockup() {
  // A2 (v141): 旧 🟢🔴 絵文字 → 方向ドット (user 採択 hybrid)。
  // 色は投資業界ルール厳守: bull=緑 (--color-gain) / bear=赤 (--color-loss)。
  const items = [
    { tone: 'bull', text: 'AI需要が継続拡大' },
    { tone: 'bear', text: '競合AMDが猛追中' },
    { tone: 'bear', text: 'バリュエーション割高懸念' },
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
          color: 'var(--color-warning)',
          padding: '1px 8px',
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 700,
        }}>強弱混在</span>
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
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 10,
          color: 'var(--text-muted)',
          marginBottom: 3,
        }}>
          <span aria-hidden="true" style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            flexShrink: 0,
            background: it.tone === 'bull' ? 'var(--color-gain)' : 'var(--color-loss)',
          }} />
          <span>{it.text}</span>
        </div>
      ))}
      {/* キー指標フッター */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 8,
        padding: '4px 8px',
        background: 'rgba(34,211,238,0.06)',
        borderRadius: 4,
        fontSize: 10,
        color: 'var(--text-muted)',
      }}>
        {/* A2 (v141): 旧 📌 絵文字 → lucide Clock (「毎朝4時更新」 の更新性を示唆) */}
        <Clock size={11} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span>次回決算: EPS $0.89予想 / 毎朝4時更新</span>
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
            color: i === activeIdx ? 'rgb(56, 189, 248)' : 'var(--text-muted)',
            fontWeight: i === activeIdx ? 700 : 400,
          }}>{label}</span>
        ))}
      </div>
      {/* 株価ラインチャート */}
      <svg width="100%" height="48" viewBox="0 0 200 48" preserveAspectRatio="none" aria-hidden="true">
        <polyline
          points="0,40 40,35 80,20 120,28 160,12 200,8"
          fill="none"
          stroke="rgb(56, 189, 248)"
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
        ↑ Beat / ↓ Miss を株価に重ねて表示
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
        // v138.7 Phase 2.1c: FeaturesSection は元々 maxWidth 1080 (v38「3 カード同高」)。 Phase 2.1b の
        // grid revert で誤って 720 に下げ、 3×260+2×16=812 > 720 で 3 カードが 2 行折り返していた (user dogfood)。 原状回復。
        maxWidth: 1080,
        margin: '0 auto',
        alignItems: 'stretch',  // v38: 3 カード同高
      }}>
        {/* v38: 案A 採用 — 3 カードすべてに UI モックアップを追加。
            理由: 訴求力 / 情報均等性 / 認知コスト削減のいずれも案B (高さ統一のみ) より優れる。
            設計思想 ⑥「図解で認知コストを下げろ」を 3 カードすべてに適用。 */}
        <FeatureCard
          icon={Zap}
          title="5条件、即判定"
          mockup={<FiveConditionsMockup />}
        />
        <FeatureCard
          icon={MessageSquare}
          title="市場の声"
          mockup={<MarketVoiceMockup />}
        />
        <FeatureCard
          icon={BarChart3}
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
            {/* v138.7 Phase 2.1: Free/Pro/Premium 3 列。 minmax 200px + maxWidth 1080 で
          3×200+2×16=632px から 3 列横並び (laptop も確実に 3 up、 phone は 1 列 reflow)。 */}
<div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        maxWidth: 1080,
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
            {/* Phase 3 Sub-3 dogfood (handover v72): 旧 🆓 絵文字 → Lucide Sparkles icon。
                Aman ロビーの極小金属プレート風 + 微発光リング。 */}
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(148, 163, 184, 0.08)',
              border: '1px solid rgba(148, 163, 184, 0.18)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8,
              color: 'var(--text-secondary)',
            }}>
              <Sparkles size={18} strokeWidth={2} />
            </div>
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
          {/* 中部: ✓ リスト (上部直後に通常フロー — Pro と水平揃え)
              Phase 3 Sub-3 (handover v72): バックテスト実証データを Free 訴求に明示。
              LP hero 「過去 5 年で 100 万円 → XXX 万円」 (動的) と Pricing が完全整合。 */}
          <ul style={{
            listStyle: 'none', padding: 0, margin: '0 0 22px',
            fontSize: 13, lineHeight: 2, color: 'var(--text-secondary)',
          }}>
            <li>✓ 3銘柄/日まで無料分析</li>
            <li>✓ 5条件 即時判定</li>
            <li>✓ 株価チャート閲覧</li>
            <li>✓ <strong style={{ color: 'rgb(56, 189, 248)' }}>バックテスト</strong> 5 年実証</li>
          </ul>
          {/* 下部: CTA を marginTop:auto で底固定 */}
          <div style={{ marginTop: 'auto' }}>
            <OutlinedCTA onClick={onFreeStart} fullWidth>
              今すぐ無料で始める
            </OutlinedCTA>
          </div>
        </div>

        {/* Pro プラン — panel-card + シアン強調 / v38: flex col で Free と底揃え。
            v62: baseline cyan border / boxShadow を撤去。シアン強調は「おすすめ」バッジと
            価格 (¥980 + ¥33 アンカー) で担保し、weak→strong 発光階層を他カードと揃える。 */}
        <div
          className="panel-card"
          style={{
            position: 'relative',
            padding: '28px 22px',
            borderRadius: 12,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          {/* おすすめバッジ
              v72 dogfood Round (handover v72、 2026-05-16): subagent レビュー指摘
              「右上半分隠れ」 解消。 旧 top:-10 で sticky 検索バー (z-index:50) や panel-card
              :hover transform translateY(-5px) と干渉していた。 Stripe/Linear 流の
              「カード内側収納」 パターンに変更 (top:12, right:12) + box-shadow で
              luxury 感を担保。 sticky bar 通過時もクリップされない。 */}
          <div style={{
            position: 'absolute',
            top: 12,
            right: 12,
            padding: '3px 10px',
            borderRadius: 9999,
            background: 'rgb(56, 189, 248)',
            color: '#0f172a',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.05em',
            boxShadow: '0 4px 12px rgba(56, 189, 248, 0.35)',
            zIndex: 2,
          }}>
            おすすめ
          </div>
          {/* v39: 上部エリアを div ラップ — Free カードと minHeight 揃え */}
          <div>
            {/* Phase 3 Sub-3 dogfood (handover v72): 旧 ✨ 絵文字 → Lucide Sparkles icon
                (cyan brand 色) でブランド統一。 */}
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(56, 189, 248, 0.10)',
              border: '1px solid rgba(56, 189, 248, 0.30)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8,
              color: 'rgb(56, 189, 248)',
              boxShadow: '0 0 12px rgba(56, 189, 248, 0.18)',
            }}>
              <Sparkles size={18} strokeWidth={2} />
            </div>
            <h3 className="section-heading" style={{ fontSize: 16, marginBottom: 4 }}>
              Pro
            </h3>
            <div style={{
              fontSize: 26, fontWeight: 700,
              color: 'rgb(56, 189, 248)', marginBottom: 4,
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
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '2px 10px',
              borderRadius: 9999,
              background: 'rgba(34,211,238,0.12)',
              border: '1px solid rgba(34,211,238,0.40)',
              color: 'rgb(56, 189, 248)',
              fontSize: 11,
              fontWeight: 600,
              marginBottom: 12,
            }}>
              <Gift size={12} strokeWidth={2.2} />
              7日間 完全無料
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
            {/* v100 LP Trust Cliff audit (handover §100点 multi-review、 マーケター verdict):
                旧「✓ 決算前自動分析」 は cron + analyze trigger + Resend email が未実装、 LP 訴求と
                実装の不一致が確定 Trust Cliff。 path B (release 速度優先) で「(近日提供予定)」 grace
                表記に変更。 footer §今後の予定「決算前メール通知」 と idiom 統一。
                release 後 1-2 週で実装後、 grace 削除 + 訴求復活。 */}
            <li>✓ 分析数 <strong style={{ color: 'rgb(56, 189, 248)' }}>無制限</strong></li>
            <li>✓ 市場の声 フル表示</li>
            <li>✓ AI 詳細レポート</li>
            <li>✓ Insider 取引 (Form 4 経営者売買)</li>
            <li>✓ ウォッチリスト無制限</li>
            <li style={{ color: 'var(--text-muted)' }}>
              ⌛ 決算前自動分析 <span style={{ fontSize: 11, fontWeight: 600 }}>(近日提供予定)</span>
            </li>
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
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              width: '100%',
            }}>
              <Lock size={11} strokeWidth={2.2} />
              Stripe で安全に決済 / いつでも解約可
            </div>
            <PrimaryCTA onClick={onProCheckout} fullWidth>
              7日間無料で試す →
            </PrimaryCTA>
            {/* Fix 3: 年払いバッジを目立つシアン pill に強化 */}
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(34,211,238,0.12)',
                border: '1px solid rgba(34,211,238,0.35)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 12,
                color: 'rgb(56, 189, 248)',
                fontWeight: 600,
              }}>
                <Tag size={12} strokeWidth={2.2} />
                年払いで2ヶ月分お得（¥1,960節約）
              </span>
            </div>
          </div>
        </div>

        {/* Premium プラン — v138.7 Phase 2 (2026-05-30): 「近日公開」 teaser 列。
            背景: アプリ内で Cup-Handle / 売り買いゾーン等を Premium gate しているのに LP に Premium の
            説明がなく、 lock を踏んだ user が解除手段を見つけられない dead-end funnel を解消。
            funnel-cro 判断: Pro (おすすめ + cyan) の主役性を保つため Premium は cyan/おすすめバッジを
            使わず amber 控えめ差別化。 CTA は disabled「近日公開」 で「まだ買えない」 を明示 (Trust Cliff 回避)。
            Stripe Premium checkout 配線 + スクリーナー実 gate 強化は販売開始時 (別 sprint)。 既存 panel-card
            流用で新規 glow host を作らない (CLAUDE.md「触ると危険な箇所」 発光系)。 */}
        <div
          className="panel-card"
          style={{
            position: 'relative',
            padding: '28px 22px',
            borderRadius: 12,
            background: 'var(--bg-card)',
            border: '1px solid color-mix(in srgb, var(--color-warning) 30%, var(--border))',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          {/* 「近日公開」 バッジ (amber、 Pro の cyan「おすすめ」 と差別化) */}
          <div style={{
            position: 'absolute',
            top: 12,
            right: 12,
            padding: '3px 10px',
            borderRadius: 9999,
            background: 'color-mix(in srgb, var(--color-warning) 16%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-warning) 40%, transparent)',
            color: 'var(--color-warning)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.05em',
            zIndex: 2,
          }}>
            近日公開
          </div>
          {/* 上部エリア: Free/Pro と minHeight 揃え */}
          <div>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8,
              color: 'var(--color-warning)',
            }}>
              <Crown size={18} strokeWidth={2} />
            </div>
            <h3 className="section-heading" style={{ fontSize: 16, marginBottom: 4 }}>
              Premium
            </h3>
            <div style={{
              fontSize: 26, fontWeight: 700,
              color: 'var(--text-primary)', marginBottom: 4,
            }}>
              ¥3,980<span style={{
                fontSize: 13, fontWeight: 400, color: 'var(--text-muted)',
              }}>/月</span>
            </div>
            <div style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginTop: 8,
              marginBottom: 0,
              lineHeight: 1.5,
            }}>
              Pro のすべて + テクニカル分析で<br />
              「買うタイミング」 まで掴む。
            </div>
          </div>
          {/* 中部: ✓ リスト — Free/Pro と水平揃え */}
          <ul style={{
            listStyle: 'none', padding: 0, margin: '12px 0 22px',
            fontSize: 13, lineHeight: 2, color: 'var(--text-secondary)',
          }}>
            <li>✓ Pro のすべての機能</li>
            <li>✓ <strong style={{ color: 'var(--color-warning)' }}>カップ・ウィズ・ハンドル</strong> 検出</li>
            <li>✓ 売り／買いゾーン・支持線・ピボット価格</li>
            <li>✓ Insider 取引・13F 機関保有</li>
          </ul>
          {/* 下部: disabled CTA で「まだ買えない」 を明示 (Trust Cliff 回避) */}
          <div style={{ marginTop: 'auto' }}>
            <div style={{
              padding: '12px',
              borderRadius: 8,
              textAlign: 'center',
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--color-warning)',
              border: '1px solid color-mix(in srgb, var(--color-warning) 35%, transparent)',
              background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
              cursor: 'default',
            }}
            aria-disabled="true"
            >
              近日公開予定
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
          color: 'rgb(56, 189, 248)',
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
        a="はい。トライアル期間中（7日間）であれば、Stripe 経由でいつでも解約でき、料金は一切発生しません。Stripe マイページからトライアル終了日と解約手順がいつでも確認できます。"
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
        まず、１銘柄。
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
      {/* v62: 「決算の近い銘柄」を「今日の注目」直下へ繰り上げ */}
      <UpcomingEarningsSection onTickerClick={onTickerClick} />
      {/* v62: 以前に調べた銘柄 (localStorage bs_analyzed 上位 3 件、無ければ自動非表示) */}
      <RecentlyAnalyzedSection onTickerClick={onTickerClick} />
      {/* リピート訪問者用 — 過去分析した銘柄で決算が近いもの (緊急 amber 強調) */}
      <MissedSection onTickerClick={onTickerClick} />
      <SampleAnalysisSection onTickerClick={onTickerClick} onProCheckout={handleProClick} />
      <FeaturesSection />
      <PricingSection onFreeStart={onSignIn} onProCheckout={handleProClick} />
      <FAQSection />
      {/* v40+: データソース表記 + 開発ロードマップ (透明性で「進化し続ける製品感」を訴求) */}
      <div style={{
        textAlign: 'center',
        fontSize: 11,
        color: 'var(--text-muted)',
        padding: '16px 20px',
        borderTop: '1px solid var(--border)',
        lineHeight: 1.8,
      }}>
        <div>
          Powered by Financial Modeling Prep · Yahoo Finance · Anthropic Claude
        </div>
        <div style={{ marginTop: 4, opacity: 0.85 }}>
          🛠 今後の予定: 決算前メール通知 · アラート · ポートフォリオ管理
        </div>
      </div>
      <FooterCTASection onFreeStart={onSignIn} />
    </div>
  );
}
