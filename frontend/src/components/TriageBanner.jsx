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
 * memory:
 *   - project_pane3_visual_explainer_redesign.md (Phase 5 plan)
 *   - feedback_diagram_quality_guard.md (Trust Cliff DoD)
 *   - feedback_data_completeness_guard.md (per-source data namespace)
 *   - chip_primitive_canonical.md (Chip primitive 流用、 新 tone 追加禁止)
 */
import { useEffect, useState } from 'react';
import { fetchTriage } from '../api.js';
import { canUse } from '../lib/planGating.js';
import { supabase } from '../lib/supabase.js';
import { sanitizeText } from '../lib/blocklist.js';
import Chip from './ui/Chip.jsx';

const PASS_COUNT_THRESHOLD = 5; // 「他 N 件」 の閾値 (PASS 5/5)

function formatShares(shares) {
  if (!Number.isFinite(shares)) return '—';
  const abs = Math.abs(shares);
  if (abs >= 10000) return `${(shares / 10000).toFixed(1)}万`;
  if (Number.isInteger(shares)) return String(shares);
  return shares.toFixed(2);
}

function buildBannerText(data) {
  if (!data) return null;
  const parts = [];
  const holdings = data.data?.holdings;
  const signal = data.data?.pattern_signals;
  const peers = data.data?.peers;

  if (holdings?.owns && holdings.shares > 0) {
    parts.push(`保有 ${formatShares(holdings.shares)} 株`);
  } else if (holdings && holdings.owns === false) {
    parts.push('未保有');
  }

  if (signal?.state_label) {
    // sanitize layer (Phase 4.5) 適用 — backend STATE_LABEL_JP は static dict だが
    // 念のため pipeline 整合性のため通す
    const label = sanitizeText(signal.state_label) || signal.state_label;
    parts.push(`Cup-Handle: ${label}`);
  }

  return parts.length > 0 ? parts.join(' / ') : null;
}

function ProTeaser({ onUpgrade }) {
  return (
    <div className="triage-banner triage-banner-locked">
      <span className="triage-locked-icon" aria-hidden="true">🔒</span>
      <span className="triage-locked-text">
        Pro で「保有 × 5 条件 × Cup-Handle」 を 1 画面に統合
      </span>
      {onUpgrade && (
        <button type="button" className="triage-locked-cta" onClick={onUpgrade}>
          Pro で解放
        </button>
      )}
    </div>
  );
}

function NoSessionHint() {
  return (
    <div className="triage-banner triage-banner-muted">
      <span aria-hidden="true">·</span>
      <span>ログインすると、 保有銘柄の 5 条件 / Cup-Handle 状態を確認できます</span>
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} props.ticker
 * @param {object|null} props.user - Supabase user (useAuth() から)
 * @param {'free'|'pro'|'premium'} props.plan
 * @param {Function} [props.onUpgrade]
 * @param {Function} [props.onJumpToScanner] - 「他 N 件」 click 時、 Pane 2 ヒートマップ (PASS 5/5 filter) jump
 */
export default function TriageBanner({
  ticker,
  user,
  plan = 'free',
  onUpgrade,
  onJumpToScanner,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

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
    return <NoSessionHint />;
  }

  if (!allowed) {
    return <ProTeaser onUpgrade={onUpgrade} />;
  }

  if (loading && !data) {
    return (
      <div className="triage-banner triage-banner-muted" aria-busy>
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
      <div className="triage-banner triage-banner-muted">
        <Chip variant="display" tone="muted" size="xs">データ取得失敗</Chip>
        <span>少し待って再読込してください</span>
      </div>
    );
  }

  const bannerText = buildBannerText(data);
  const peersCount = data.data?.peers?.passing_count;
  const hasPeers = Number.isFinite(peersCount) && peersCount > 0;
  const confidence = data.signal_quality?.confidence;
  // handover v84 dogfood 3 (2026-05-19): 「全 fatal の時のみ hide」 という memory
  // feedback_triage_banner_pattern.md の本来仕様に合わせ、 condition を再緩和。
  // - 全 source が error/timeout → silent hide (本来仕様)
  // - 1 つでも非 fatal source あり → hint 表示 (Trust Cliff 回避)
  const sourceVals = data.sources ? Object.values(data.sources) : [];
  const allSourcesFatal = sourceVals.length > 0
    && sourceVals.every((s) => s === 'error' || s === 'timeout');
  const hasFatal = sourceVals.some((s) => s === 'error' || s === 'timeout');

  if (!bannerText && !hasPeers) {
    if (allSourcesFatal) {
      // 真因 B': 全 source error/timeout → 既存仕様通り hide
      return null;
    }
    // 真因 B: 1 つ以上の source が non-fatal (ok or empty) → hint 表示
    return (
      <div className="triage-banner triage-banner-muted">
        {hasFatal && <Chip variant="display" tone="muted" size="xs">一部データ取得失敗</Chip>}
        <span aria-hidden="true">·</span>
        <span>取引履歴未登録 / 該当パターン無し / 同条件 PASS 0 件</span>
      </div>
    );
  }

  return (
    <div className="triage-banner">
      {bannerText && (
        <span className="triage-banner-body">{bannerText}</span>
      )}
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
