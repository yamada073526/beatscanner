/**
 * TriageBanner — handover v82 Phase 5 (三層トリアージ「保有 × 5 条件 × Cup-Handle」)
 *
 * @no-llm — このコンポーネントは Anthropic SDK / Claude API を一切呼ばない。
 * narration は static dictionary (backend STATE_LABEL_JP) + sanitize layer (Phase 4.5)。
 *
 * multi-review 6 体合議 (2026-05-17) verdict:
 * - UI/UX B 案: ConditionGrid 直前 hint 1 行 (hero / sticky でない)
 * - 金融: 「他 N 件」 は数字のみ + click 無効 (Pane 2 ヒートマップ jump、 推薦 modal でない)
 * - Web 設計: Phase 3 sources schema 統一、 partial_failure に応じて inline 表示
 * - Anthropic: Phase 4.5 sanitize layer を narration にも適用
 * - マーケ: 三層トリアージは最強訴求素材 → Pro 全 4 機能 (A 案)
 *
 * Sprint 5 (SPEC 2026-05-19 Item 5) 拡張:
 * - 保有情報 2 行 grid (株数/平均取得価格/含み損益 + 初回買付日/新規買付 button)
 * - 含み損益: var(--color-gain) 緑 / var(--color-loss) 赤 (投資業界色ルール厳守)
 * - 新規買付 button: onOpenAddTransaction callback 経由 (ManualEntryModal 相当)
 * - v84 hasFatal 条件維持 (絶対変更禁止)
 *
 * memory:
 *   - project_pane3_visual_explainer_redesign.md (Phase 5 plan)
 *   - feedback_diagram_quality_guard.md (Trust Cliff DoD)
 *   - feedback_data_completeness_guard.md (per-source data namespace)
 *   - chip_primitive_canonical.md (Chip primitive 流用、 新 tone 追加禁止)
 *   - feedback_triage_banner_pattern.md (hasFatal SSOT)
 *   - portfolio_account_schema.md (transactions schema、type='buy' / shares)
 */
import { useEffect, useState } from 'react';
import { fetchTriage } from '../api.js';
import { canUse } from '../lib/planGating.js';
import { supabase } from '../lib/supabase.js';
import { sanitizeText } from '../lib/blocklist.js';
import { aggregateWithTransactions } from '../lib/holdings.js';
import Chip from './ui/Chip.jsx';
import { Lock } from 'lucide-react';
// v138.6 R7-C (2026-05-30): NoSessionHint click で直接 signInWithGoogle、 plain text 廃止
import { useAuth } from '../hooks/useAuth.js';

const PASS_COUNT_THRESHOLD = 5; // 「他 N 件」 の閾値 (PASS 5/5)

function formatShares(shares) {
  if (!Number.isFinite(shares)) return '—';
  const abs = Math.abs(shares);
  if (abs >= 10000) return `${(shares / 10000).toFixed(1)}万`;
  if (Number.isInteger(shares)) return String(shares);
  return shares.toFixed(2);
}

/** USD 金額を $X,XXX.XX 形式にフォーマット */
function formatUSD(val) {
  if (!Number.isFinite(val)) return '—';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : val > 0 ? '+' : '';
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 含み損益 % を +X.X% / -X.X% 形式にフォーマット */
function formatPct(pct) {
  if (!Number.isFinite(pct)) return '';
  const sign = pct > 0 ? '+' : '';
  return `(${sign}${pct.toFixed(1)}%)`;
}

/** YYYY-MM-DD を M/D 形式に変換 */
function formatDateShort(iso) {
  if (!iso) return '—';
  try {
    const [, m, d] = String(iso).split('-');
    return `${Number(m)}/${Number(d)}`;
  } catch {
    return iso;
  }
}

/**
 * ticker-specific transactions を Supabase から直接取得し、
 * aggregateWithTransactions で avgCost / shares / firstBuyDate を返す hook。
 * backend / migration を触らず frontend 側で計算 (SPEC §6 禁止事項遵守)。
 */
function useTickerTransactionSummary({ ticker, user }) {
  const [summary, setSummary] = useState(null);
  const [refetchKey, setRefetchKey] = useState(0);

  // bs:transactions:changed イベントで refetchKey をインクリメントし useEffect を再 fire
  useEffect(() => {
    const onChanged = () => setRefetchKey((k) => k + 1);
    window.addEventListener('bs:transactions:changed', onChanged);
    return () => window.removeEventListener('bs:transactions:changed', onChanged);
  }, []);

  useEffect(() => {
    if (!ticker || !user?.id || !supabase) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const t = String(ticker).trim().toUpperCase();
        const { data, error } = await supabase
          .from('transactions')
          .select('id, type, shares, price, fee, trade_date, created_at')
          .eq('user_id', user.id)
          .eq('ticker', t)
          .order('trade_date', { ascending: true })
          .order('created_at', { ascending: true });
        if (cancelled) return;
        if (error || !Array.isArray(data) || data.length === 0) {
          setSummary(null);
          return;
        }
        // aggregateWithTransactions: buy/sell/dividend/split/fee を移動平均で集計
        const agg = aggregateWithTransactions(data);
        // firstBuyDate: trade_date asc ソート済なので最初の buy の日付
        const firstBuy = data.find((r) => String(r.type || '').toLowerCase() === 'buy');
        setSummary({
          shares: agg.shares,
          avgCost: agg.avgCost,
          firstBuyDate: firstBuy?.trade_date || null,
        });
      } catch {
        if (!cancelled) setSummary(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticker, user?.id, refetchKey]);

  return summary;
}

/**
 * bannerText: Cup-Handle signal label のみ残す (保有株数は 2 行 grid に移管)
 * v84 hasFatal 条件は不変 (絶対触らない)
 */
function buildSignalText(data) {
  if (!data) return null;
  const signal = data.data?.pattern_signals;
  if (signal?.state_label) {
    const label = sanitizeText(signal.state_label) || signal.state_label;
    return `Cup-Handle: ${label}`;
  }
  return null;
}

/** 保有情報が表示可能かどうかを判定 (owns=true + shares > 0) */
function hasHoldings(data) {
  const h = data?.data?.holdings;
  return !!(h?.owns && h.shares > 0);
}

/** 未保有 hint を表示するか判定 (owns=false) */
function isNoHolding(data) {
  const h = data?.data?.holdings;
  return h && h.owns === false;
}

function ProTeaser({ onUpgrade, frameClass = '' }) {
  return (
    <div className={`triage-banner triage-banner-locked ${frameClass}`.trim()}>
      {/* icon 規則 (feedback_icon_brand_consistency): 大衆 emoji 🔒 → lucide Lock (outline)。
          text 修正 (funnel-cro / Trust Cliff): 「Cup-Handle」 は Premium 看板機能 (cup_handle_detection=
          PLAN.PREMIUM) のため Pro teaser で名指しすると tier 不整合 (Pro?Premium?)。triage_banner 自体が
          解放する「保有銘柄 × 5 条件 × トレンド状態の 1 画面統合」 を Premium 用語を使わず訴求する。 */}
      <span className="triage-locked-icon" aria-hidden="true">
        <Lock size={14} strokeWidth={1.75} />
      </span>
      <span className="triage-locked-text">
        Pro で「保有 × 5 条件 × トレンド」 を 1 画面に統合
      </span>
      {onUpgrade && (
        <button type="button" className="triage-locked-cta" onClick={onUpgrade}>
          Pro で解放
        </button>
      )}
    </div>
  );
}

function NoSessionHint({ frameClass = '' }) {
  // v86 R3 → revert (color_hierarchy -6 の主因が triage-banner-cta bg accent 8% tint)
  //  - bg/border は R2 concierge (左 cyan→transparent 4% gradient) に戻す
  //  - 「ログイン →」 affordance は Vision が肯定的だったので残置 (accent-cyan fw600)
  // v138.6 R7-C 🟠 P1 (2026-05-30): user dogfood「クリックできない」 → button 化 + 直接 signInWithGoogle 接続。
  const { signInWithGoogle } = useAuth();
  return (
    <button
      type="button"
      onClick={() => { signInWithGoogle(); }}
      className={`triage-banner triage-banner-muted triage-banner-concierge ${frameClass}`.trim()}
      style={{
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        font: 'inherit',
        color: 'inherit',
      }}
      aria-label="Googleでログインして全機能を解放"
    >
      <span className="triage-pulse-dot" aria-hidden="true" />
      <span style={{ flex: 1 }}>ログインすると、 保有銘柄の 5 条件 / Cup-Handle 状態を確認できます</span>
      <span className="triage-cta-affordance" aria-hidden="true">ログイン →</span>
    </button>
  );
}

/**
 * @param {object} props
 * @param {string} props.ticker
 * @param {object|null} props.user - Supabase user (useAuth() から)
 * @param {'free'|'pro'|'premium'} props.plan
 * @param {Function} [props.onUpgrade]
 * @param {Function} [props.onJumpToScanner] - 「他 N 件」 click 時、 Pane 2 ヒートマップ (PASS 5/5 filter) jump
 * @param {number|null} [props.currentPrice] - 現在株価 (含み損益計算用、JudgmentDetail から渡す)
 * @param {Function} [props.onOpenAddTransaction] - 「新規買付」 button click 時の callback (TransactionEntryModal 起動)
 */
export default function TriageBanner({
  ticker,
  user,
  plan = 'free',
  onUpgrade,
  onJumpToScanner,
  currentPrice = null,
  onOpenAddTransaction,
  frameless = false,
}) {
  // Phase G Phase 2: frameless mode で background / border 透明化 (unified section 内)
  const frameClass = frameless ? 'is-frameless' : '';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Sprint 5: ticker-specific transactions summary (avgCost / shares / firstBuyDate)
  // user がいる場合のみ取得 (未ログインは null)
  const txSummary = useTickerTransactionSummary({ ticker, user });

  const allowed = canUse('triage_banner', plan);

  useEffect(() => {
    if (!ticker || !user || !allowed) {
      setData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchTriage(ticker, supabase, PASS_COUNT_THRESHOLD);
        if (!cancelled) setData(res);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ticker, user, allowed]);

  if (!ticker) return null;

  if (!user) {
    return <NoSessionHint frameClass={frameClass} />;
  }

  if (!allowed) {
    return <ProTeaser onUpgrade={onUpgrade} frameClass={frameClass} />;
  }

  if (loading && !data) {
    return (
      <div className={`triage-banner triage-banner-muted ${frameClass}`.trim()} aria-busy>
        <span aria-hidden="true">·</span>
        <span>トリアージを取得中…</span>
      </div>
    );
  }

  // handover v83 P0 fix (2026-05-18 dogfood で AMZN にて DOM null 発覚):
  // 旧 silent fail (`return null`) → Trust Cliff 直撃 (機能無しと user 誤認)。
  // memory feedback_data_completeness_guard.md の「カバー外 / 一時失敗 / データあり」
  // 3 段階分岐に整合させて hint chip 表示。
  // - 真因 A (data === null): fetch fail (HTTP error / token expired / network)
  // - 真因 B (data 取得成功 + 内容空): 未保有 + パターン無し + peers 0
  // - 真因 B' (全 source error): 既存仕様通り hide (memory feedback_triage_banner_pattern.md)
  if (!data) {
    return (
      <div className={`triage-banner triage-banner-muted ${frameClass}`.trim()}>
        <Chip variant="display" tone="muted" size="xs">データ取得失敗</Chip>
        <span>少し待って再読込してください</span>
      </div>
    );
  }

  const signalText = buildSignalText(data);
  const peersCount = data.data?.peers?.passing_count;
  const hasPeers = Number.isFinite(peersCount) && peersCount > 0;
  // handover v84 dogfood 3 (2026-05-19): 「全 fatal の時のみ hide」 という memory
  // feedback_triage_banner_pattern.md の本来仕様に合わせ、 condition を再緩和。
  // - 全 source が error/timeout → silent hide (本来仕様)
  // - 1 つでも非 fatal source あり → hint 表示 (Trust Cliff 回避)
  const sourceVals = data.sources ? Object.values(data.sources) : [];
  const allSourcesFatal = sourceVals.length > 0
    && sourceVals.every((s) => s === 'error' || s === 'timeout');
  const hasFatal = sourceVals.some((s) => s === 'error' || s === 'timeout');

  // Sprint 5: 含み損益計算 (txSummary + currentPrice)
  // 投資業界色ルール: gain=緑 / loss=赤 / neutral=secondary
  const hasHoldingData = hasHoldings(data);
  const isNoHold = isNoHolding(data);

  let unrealizedPnl = null;
  let unrealizedPnlPct = null;
  let pnlStatus = 'neutral'; // 'gain' | 'loss' | 'neutral'
  if (
    hasHoldingData &&
    txSummary &&
    Number.isFinite(txSummary.avgCost) && txSummary.avgCost > 0 &&
    Number.isFinite(txSummary.shares) && txSummary.shares > 0 &&
    Number.isFinite(currentPrice) && currentPrice > 0
  ) {
    unrealizedPnl = (currentPrice - txSummary.avgCost) * txSummary.shares;
    unrealizedPnlPct = ((currentPrice - txSummary.avgCost) / txSummary.avgCost) * 100;
    if (Math.abs(unrealizedPnlPct) > 0.5) {
      pnlStatus = unrealizedPnlPct > 0 ? 'gain' : 'loss';
    }
  }

  const pnlColor = pnlStatus === 'gain'
    ? 'var(--color-gain)'
    : pnlStatus === 'loss'
    ? 'var(--color-loss)'
    : 'var(--text-secondary)';

  // 保有なし + peers なし + signal なし の場合の分岐 (v84 hasFatal 条件は絶対不変)
  if (!hasHoldingData && !isNoHold && !hasPeers && !signalText) {
    if (allSourcesFatal) {
      // 真因 B': 全 source error/timeout → 既存仕様通り hide
      return null;
    }
    // 真因 B: 1 つ以上の source が non-fatal (ok or empty) → hint 表示
    return (
      <div className={`triage-banner triage-banner-muted ${frameClass}`.trim()}>
        {hasFatal && <Chip variant="display" tone="muted" size="xs">一部データ取得失敗</Chip>}
        <span aria-hidden="true">·</span>
        <span>取引履歴未登録 / 該当パターン無し / 同条件 PASS 0 件</span>
      </div>
    );
  }

  return (
    <div className={`triage-banner triage-banner-sprint5 ${frameClass}`.trim()}>
      {/* Sprint 5: 保有情報 2 行 grid */}
      {hasHoldingData && (
        <div className="triage-holdings-grid">
          {/* 1 行目: 株数 / 平均取得価格 / 含み損益 */}
          <div className="triage-holdings-row triage-holdings-row--top">
            <span className="triage-holdings-cell">
              <span className="triage-holdings-label">保有</span>
              <span className="triage-holdings-value">
                {formatShares(txSummary?.shares ?? data.data?.holdings?.shares)} 株
              </span>
            </span>
            {txSummary && Number.isFinite(txSummary.avgCost) && txSummary.avgCost > 0 && (
              <span className="triage-holdings-cell">
                <span className="triage-holdings-label">平均取得</span>
                <span className="triage-holdings-value">
                  ${txSummary.avgCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </span>
            )}
            {unrealizedPnl !== null && (
              <span className="triage-holdings-cell">
                <span className="triage-holdings-label">含み損益</span>
                <span
                  className="triage-holdings-value triage-holdings-pnl"
                  style={{ color: pnlColor }}
                >
                  {formatUSD(unrealizedPnl)} {formatPct(unrealizedPnlPct)}
                </span>
              </span>
            )}
          </div>
          {/* 2 行目: 初回買付日 / 新規買付 button */}
          <div className="triage-holdings-row triage-holdings-row--bottom">
            {txSummary?.firstBuyDate && (
              <span className="triage-holdings-cell">
                <span className="triage-holdings-label">初回買付</span>
                <span className="triage-holdings-value">
                  {formatDateShort(txSummary.firstBuyDate)}
                </span>
              </span>
            )}
            {/* 新規買付 button: user ありの場合のみ表示 (Trust Cliff 回避) */}
            {typeof onOpenAddTransaction === 'function' && (
              <Chip
                variant="filter"
                tone="accent"
                size="xs"
                onClick={() => onOpenAddTransaction(ticker)}
                className="triage-add-tx-btn"
              >
                新規買付
              </Chip>
            )}
          </div>
        </div>
      )}

      {/* 未保有 hint + 新規買付 button (Trust Cliff: 「保有を追加」 の誘導) */}
      {!hasHoldingData && isNoHold && (
        <div className="triage-holdings-row triage-holdings-row--noholding">
          <span className="triage-holdings-label triage-holdings-label--muted">未保有</span>
          {typeof onOpenAddTransaction === 'function' && (
            <Chip
              variant="filter"
              tone="muted"
              size="xs"
              onClick={() => onOpenAddTransaction(ticker)}
              className="triage-add-tx-btn"
            >
              保有を追加
            </Chip>
          )}
        </div>
      )}

      {/* Cup-Handle signal テキスト (保有 grid と横並び) */}
      {signalText && (
        <span className="triage-banner-body triage-signal-text">{signalText}</span>
      )}

      {/* peers button */}
      {hasPeers && (
        <button
          type="button"
          className="triage-banner-peers"
          onClick={() => onJumpToScanner?.(PASS_COUNT_THRESHOLD)}
          title="Pane 2 ヒートマップで全銘柄を確認"
        >
          同条件 PASS 他に <strong>{peersCount}</strong> 件
          <span aria-hidden="true"> →</span>
        </button>
      )}
      {/* handover v84 dogfood 4 (2026-05-19): chip 条件を hasFatal に絞る。
          backend signal_quality は empty を non-ok 扱いで confidence=medium にするが、
          empty は「fetch 成功 + データ無し」 で失敗ではない → 「取得失敗」 表示は
          誤誘導 (例: AMZN は pattern_signals='empty' (Cup-Handle 未形成) で
          「保有 110 株一部データ取得失敗」 と表示される問題)。 */}
      {hasFatal && (
        <Chip variant="display" tone="muted" size="xs">
          {allSourcesFatal ? 'データ取得失敗' : '一部データ取得失敗'}
        </Chip>
      )}
    </div>
  );
}
