/**
 * DiagramCard — React DOM-based visualization panel.
 * Replaces VizPanel's dangerouslySetInnerHTML SVG rendering with proper React elements.
 * Business model flow uses CSS flexbox; charts use inline JSX SVG (no string templates).
 *
 * handover v82 Phase 4: 出典 footer + degraded_mode banner を DiagramCitation で attach
 * (multi-review 6 体合議 verdict、 局所介入 +5 行で 2,027 → 2,033 行)。
 */
import { useState, useEffect, useRef, useMemo, createContext, useContext } from 'react';
import { FileBarChart2, Banknote, Calendar, CheckCircle2, XCircle, AlertTriangle, Shield, TrendingUp, TrendingDown, Info, Layers, PieChart, HelpCircle, RefreshCw, Building2, Scale, Target, Landmark, UserCheck, ChevronDown } from 'lucide-react';
import DiagramCitation from './DiagramCitation.jsx';
import Chip from './ui/Chip.jsx';
import { sanitizeDiagramData, findBlocklistHits, sanitizeText } from '../lib/blocklist.js';
import { displaySegmentName } from '../lib/segmentNames.js';
// B7 第一手 (2026-06-14): 図解最上段「一言で言うと」L1 essence hero (flag ?diagram_essence=1, default OFF)。
import { isDiagramEssence } from './diagramEssence.js';
import { isNonEquityTicker } from '../lib/tickerUtils.js';
// handover v82 Phase 5.5: ConditionRow click → DiagramCard pulse 連携 (multi-review 6 体合議 verdict)。
import { useWorkspaceStore } from '../state/workspaceStore.js';
import { isStepPulsingForCondition } from '../lib/condition-mapping.js';
import { smoothScrollToElement } from '../lib/smoothScroll.js';
import Toast from './Toast.jsx';
// Sprint 4 (Phase 2): 案8 DiagramCard step reveal — expanded 時 7 要素 80ms stagger fade-in
// m.* (LazyMotion 経由)、motion.* (Eager) は禁止
// DiagramCard は HomeTab / DetailReport からも呼ばれるため、
// LazyMotion scope を self-contained にするため MotionProvider を local wrap する
import { m, useReducedMotion } from 'framer-motion';
import MotionProvider from './MotionProvider.jsx';

// v138.6 Bug 1 Fix 1-C: LLM が headline に「データ不足で判定不可」 等の fallback 文言を返すと、
// 5 条件カード (Python aggregator 4/5 PASS) と食い違う UX を生む。 これらは headline ではなく
// 状況説明 (= narrative ではない) なので、 frontend で render 時に suppress する。
// 「キャッチコピー」 として意味のある headline は通す。 backend で対応すべきだが stale cache 対応で
// frontend にも guard。 完全な suppress (headline 文字列で構成された全 fallback pattern を網羅) は
// 不可能なので、 明白な fallback 句のみ対象とする。
// v154 図解 vibe 提案システム: figure のデザイン「気分」 (見出しフォント / 余白 / accent) を切替えて
// vision-eval スコア向上候補を比較するための仕組み。 production は vibe={} (= 現状の見た目で完全不変)、
// preview ハーネスのみ 案 A 等を渡して「現状 vs 案」 を並べる。 VizSectionLabel / headline が context で読む。
const VibeContext = createContext({});
function useVibe() { return useContext(VibeContext) || {}; }
// v155: user が案A を採択 (2026-06-03) → 本番デフォルトを「編集的」 (Noto Serif JP 見出し + ゆとり余白、
// ブランド色 cyan 維持) に。 production の全 caller (DetailReport / HomeTab / StickyDiagramAccordion) は
// vibe を渡さない → この既定が適用される。 preview ハーネスのみ各案を明示的に渡して比較する。
const DEFAULT_VIBE = { headingFont: 'serif', spacing: 'loose' };
function vibeHeadingFont(vibe) {
  return vibe && vibe.headingFont === 'serif' ? "'Noto Serif JP', serif" : undefined;
}
function vibeAccent(vibe) {
  // #d4af37 = gold (ALLOWED-HEX, Chip elite tone)、 #38BDF8 = cyan (ALLOWED-HEX, --color-accent dark)
  return vibe && vibe.accent === 'gold' ? '#d4af37' : '#38BDF8';
}

function isFallbackHeadline(headline) {
  if (typeof headline !== 'string') return true;
  const text = headline.trim();
  if (!text) return true;
  const FALLBACK_PATTERNS = [
    /データ不足/,
    /判定不可/,
    /生成中/,
    /分析中/,
    /^N\/A$/i,
    /情報なし/,
  ];
  return FALLBACK_PATTERNS.some((p) => p.test(text));
}

function VizSectionLabel({ text, first = false, icon: Icon = null, sub = null }) {
  // v154 vibe: 見出しフォント (serif) / 余白 (loose) / accent (gold) を context から読む。 default = 現状不変。
  const vibe = useVibe();
  const loose = vibe.spacing === 'loose';
  const headingFont = vibeHeadingFont(vibe);
  const accentColor = vibeAccent(vibe);
  // デザインレビュー (4体合議 2026-06-03): section 間を広げ「ここで切れる」を明示 (20→28px)、
  // 見出し→中身は詰める (16→14px) で強弱コントラストを作る (模範解答の「呼吸」)。
  // icon prop で見出しにアイコンを添え「記事図解 → アプリ」の品格差を埋める (brand verdict D①)。
  // Round 2-B (handover v152): sub prop で見出し直下に 1 行 sub-caption を添える。
  //   模範解答 (Surprise Stories) の編集的「導入文」相当で、 各 section が何を語るかを 2 秒で示す。
  //   ⚠️ 静的文言のみ (LLM 非経由 = 景表法/§38 risk なし)。 断定的将来予測・最上級は含めない定性記述に限定。
  return (
    <>
      {/* Sprint 3: Saga-like scroll narrative — section 間 1px hairline divider (Linear 流) */}
      {!first && (
        <div style={{
          height: '1px',
          background: 'var(--border)',
          marginTop: loose ? '44px' : '28px',
          marginBottom: '0',
          opacity: 0.5,
        }} />
      )}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '7px',
        fontSize: loose ? '14px' : '13px', fontWeight: '700',
        letterSpacing: headingFont ? '0.01em' : '0.5px',
        fontFamily: headingFont,
        color: accentColor,
        marginBottom: sub ? '3px' : (loose ? '14px' : '10px'),
        marginTop: first ? (loose ? '40px' : '32px') : (loose ? '22px' : '14px'),
      }}>
        {Icon && <Icon size={15} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />}
        <span>{text}</span>
      </div>
      {sub && (
        <div style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          lineHeight: 1.55,
          marginBottom: loose ? '15px' : '11px',
        }}>
          {sub}
        </div>
      )}
    </>
  );
}

// v153 Round 2 模範解答レベル化 (design review verdict 62→目標78+): 物語の接続と事実要約。
// 模範解答「Surprise Stories」 の核心 = 「節と節の間に『だから?』 (因果の接続)」 + 「黒い結論バーで折り畳む」。
// ⚠️ §38/§5: NarrativeBridge は静的 dict、 SectionConclusion は backend 数値の JS 算数のみ (LLM 非経由)。
//    断定的将来予測・投資勧誘・最上級は含めない。 事実の整理に限定。

// セクション間の「だから次を読む」 動線。 中央寄せ転換句 (静的) + 下向き矢印。
function NarrativeBridge({ text, isMobile = false }) {
  if (!text) return null;
  // 3体合議 3/3 (v158): PC の 760px 幅では 11px が sub 見出しと同化し「つなぎ」 が読み飛ばされる
  // (体感 9px 相当)。 PC は 13px / 矢印 14px に引き上げ、 mobile は 11px / 13px を維持。
  // 色は var(--text-muted) のままで「つなぎが主役 (section) を食わない」 を担保。
  const textSize = isMobile ? '11px' : '13px';
  const arrowSize = isMobile ? '13px' : '14px';
  return (
    <div
      aria-hidden="true"
      data-testid="diagram-bridge"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
        margin: '18px 0 2px', userSelect: 'none', pointerEvents: 'none',
      }}
    >
      <span style={{
        fontSize: textSize, color: 'var(--text-muted)', fontWeight: 500,
        letterSpacing: '0.02em', textAlign: 'center', lineHeight: 1.4,
      }}>
        {text}
      </span>
      <span style={{ color: 'var(--text-muted)', opacity: 0.5, fontSize: arrowSize, lineHeight: 1 }}>↓</span>
    </div>
  );
}

// 各セクション末尾の「事実要約バー」。 模範解答の黒い結論バー相当だが、 §38 のため断定・将来予測・
// 推奨・最上級は禁止、 過去の数値の事実要約のみ。 text は呼出側で backend data から JS で算出した
// 事実文字列を渡す (LLM 非経由)。 cyan 左 accent で「ここが要点」 を明示。
function SectionConclusion({ text }) {
  if (!text) return null;
  return (
    <div data-testid="diagram-conclusion" style={{
      marginTop: '10px', padding: '9px 12px', borderRadius: '8px',
      background: 'var(--bg-subtle)', border: '1px solid var(--border)',
      borderLeft: '3px solid var(--color-accent)',
      display: 'flex', alignItems: 'center', gap: '9px',
    }}>
      <span style={{
        flexShrink: 0, fontSize: '9px', fontWeight: 800, letterSpacing: '0.05em',
        color: 'var(--color-accent)', background: 'rgba(56,189,248,0.10)',
        border: '1px solid rgba(56,189,248,0.25)', padding: '2px 8px', borderRadius: '20px',
        whiteSpace: 'nowrap',
      }}>
        要点
      </span>
      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.45 }}>
        {text}
      </span>
    </div>
  );
}

// v154 FMP②: アナリスト予想 section (金融アナリスト review verdict)。 backend build_analyst_view の
// §38-safe 数値 (target_range / rating_distribution / recent_changes) を表示。 数値は Python 計算 (LLM 非経由)。
// ⚠️ §38/§5: 上昇余地% は出さない (煽り)、 個別 firm の "Strong Buy" バッジも出さない (最上級)。
//    レンジ・分布・修正件数の「事実」 + 免責のみ。
function AnalystConsensusSection({ analyst }) {
  if (!analyst) return null;
  const tr = analyst.targetRange;
  const rd = analyst.ratingDistribution;
  const rc = analyst.recentChanges;
  const cur = analyst.currentPrice;
  const hasTarget = tr && tr.median != null && tr.high != null && tr.low != null;
  const hasRating = rd && rd.total;
  if (!hasTarget && !hasRating) return null;

  const fmtUsd = (v) => (v == null ? '—' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
  let medianPos = null, curPos = null;
  if (hasTarget && tr.high > tr.low) {
    medianPos = Math.min(1, Math.max(0, (tr.median - tr.low) / (tr.high - tr.low)));
    if (cur != null) curPos = Math.min(1, Math.max(0, (cur - tr.low) / (tr.high - tr.low)));
  }

  return (
    <div data-testid="diagram-section-analyst" style={{ marginTop: '16px' }}>
      <VizSectionLabel text="アナリスト予想" icon={Target} sub="市場（アナリスト）が見込む水準" />
      {hasTarget && (
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            {/* v156 content-audit: count(=擬似4field数) でなく analystCount(実人数) のみ表示。 欠損なら人数省略。 */}
            目標株価レンジ{tr.analystCount != null ? `（アナリスト${tr.analystCount}名）` : ''}
          </div>
          {/* レンジバー: 各マーカー (中央値=上 / 現在値=下) に直接ラベルを置き位置と一致させる。
              §38: レンジ・現在値の位置は事実、 上昇余地% は出さない。 */}
          <div style={{ position: 'relative', height: '42px' }}>
            <div style={{ position: 'absolute', top: '22px', left: 0, right: 0, height: '4px', borderRadius: '2px', background: 'var(--bg-muted)' }} />
            {medianPos != null && (
              <div style={{ position: 'absolute', top: 0, left: `${medianPos * 100}%`, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--color-accent)', fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>中央 {fmtUsd(tr.median)}</span>
                <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: 'var(--color-accent)', marginTop: '3px' }} />
              </div>
            )}
            {curPos != null && (
              <div style={{ position: 'absolute', top: '17px', left: `${curPos * 100}%`, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '2px', height: '14px', background: 'var(--text-secondary)' }} />
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', marginTop: '2px' }}>現在 {fmtUsd(cur)}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            <span>安値 {fmtUsd(tr.low)}</span>
            <span>高値 {fmtUsd(tr.high)}</span>
          </div>
        </div>
      )}
      {hasRating && (() => {
        const buy = rd.buy || 0, hold = rd.hold || 0, sell = rd.sell || 0;
        const total = rd.total || (buy + hold + sell) || 1;
        const pct = (n) => (n / total) * 100;
        return (
          <div style={{ marginBottom: rc ? '10px' : '8px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>アナリスト評価の分布</div>
            <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: 'var(--bg-muted)' }}>
              {buy > 0 && <div style={{ width: `${pct(buy)}%`, background: 'var(--color-gain)' }} />}
              {hold > 0 && <div style={{ width: `${pct(hold)}%`, background: 'var(--text-muted)' }} />}
              {sell > 0 && <div style={{ width: `${pct(sell)}%`, background: 'var(--color-loss)' }} />}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '5px', fontSize: '11px', fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ color: 'var(--color-gain)' }}>強気 {buy}</span>
              <span style={{ color: 'var(--text-muted)' }}>中立 {hold}</span>
              <span style={{ color: 'var(--color-loss)' }}>弱気 {sell}</span>
            </div>
          </div>
        );
      })()}
      {rc && (rc.upgrades != null || rc.downgrades != null) && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', fontVariantNumeric: 'tabular-nums' }}>
          直近{rc.window_days || 90}日: 上方修正 {rc.upgrades || 0}件 ・ 下方修正 {rc.downgrades || 0}件
        </div>
      )}
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.5, display: 'flex', gap: '5px', alignItems: 'flex-start' }}>
        <Info size={11} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, marginTop: '1px' }} />
        <span>アナリスト予想の中央値であり、株価や将来の成果を保証するものではありません。</span>
      </div>
    </div>
  );
}

// v154 FMP③: 決算後株価反応 (金融アナリスト review verdict、 じっちゃま「決算は中身より反応を見ろ」)。
// backend compute_reaction の過去 8Q event study (Beat時/Miss時の決算後±5営業日 平均リターン)。
// ⚠️ §38: 過去実績の集計のみ、 将来予測でない。 免責付き。 数値は Python 計算 (LLM 非経由)。
function EarningsReactionBar({ reaction }) {
  if (!reaction) return null;
  const beat = reaction.avgBeatReturnPct;
  const miss = reaction.avgMissReturnPct;
  const bc = reaction.beatCount || 0;
  const mc = reaction.missCount || 0;
  if (beat == null && miss == null) return null;
  const fmtPct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`);
  // v156 content-audit: 投資業界の色ルールは「値の符号」 で決まる。 Beat/Miss は category label に
  // すぎず、 NVDA のように Beat時でもマイナス (good news が効かない) があるため、 値が負なら必ず赤。
  // (旧実装は Beat=緑固定で「Beat時 -5.14%」 を緑表示 = 色ルール違反だった)
  const signColor = (v) => (v == null ? 'var(--text-muted)' : v > 0 ? 'var(--color-gain)' : v < 0 ? 'var(--color-loss)' : 'var(--text-muted)');
  return (
    <div data-testid="diagram-earnings-reaction" style={{
      marginTop: '10px', padding: '10px 12px', borderRadius: '8px',
      background: 'var(--bg-subtle)', border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '7px' }}>
        決算後 ±5営業日の株価反応（過去実績）
      </div>
      <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
        {beat != null && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Beat時 平均</span>
            <span style={{ fontSize: '15px', fontWeight: 700, color: signColor(beat), fontVariantNumeric: 'tabular-nums' }}>{fmtPct(beat)}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>n={bc}</span>
          </div>
        )}
        {miss != null && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Miss時 平均</span>
            <span style={{ fontSize: '15px', fontWeight: 700, color: signColor(miss), fontVariantNumeric: 'tabular-nums' }}>{fmtPct(miss)}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>n={mc}</span>
          </div>
        )}
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
        過去の決算後の株価変化の集計であり、将来の値動きを示すものではありません。
      </div>
    </div>
  );
}

// Sprint 4 案8: stagger variants (feedback_motion_timing_recipes.md §stagger 80ms upper bound)
// expanded 時のみ発火 (DiagramCard mount = expanded 後に render)
const STEP_CONTAINER_VARIANTS = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08, // 80ms stagger (最大 upper bound、 7 要素まで)
      delayChildren: 0.05, // 最初の要素 50ms delay で「一呼吸置いてから」演出
    },
  },
};

const STEP_ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.2, 0.8, 0.2, 1] } },
};

function FlowBox({ step, stepIndex, isPulsing }) {
  const label  = step.label  || '';
  const detail = step.detail || step.sub || '';
  return (
    <m.div
      variants={STEP_ITEM_VARIANTS}
      className="diagram-step"
      data-step-index={stepIndex}
      data-pulsing={isPulsing ? 'true' : undefined}
      style={{
        flex: '0 0 auto', width: '120px',
        padding: '10px 8px', backgroundColor: '#38BDF8',
        borderRadius: '10px', textAlign: 'center',
        position: 'relative',
      }}
    >
      <div style={{
        fontSize: '14px', fontWeight: '800', color: '#0F172A',
        marginBottom: detail ? '4px' : 0, lineHeight: 1.3,
        wordBreak: 'keep-all', overflowWrap: 'anywhere',
      }}>
        {label}
      </div>
      {detail && (
        <div style={{
          fontSize: '11px', color: '#1E3A5F', lineHeight: 1.4,
          wordBreak: 'keep-all', overflowWrap: 'anywhere',
        }}>
          {detail}
        </div>
      )}
    </m.div>
  );
}

// ── Segment row (e.g. Intelligent Cloud / P&BP / MPC) ─────────────────────
function SegmentBar({ seg }) {
  const yoyColor = (seg.yoy_pct ?? 0) >= 0 ? '#10B981' : '#ef4444';
  // segment 名を和文化 (会社概要 ProfileCard と共有 dictionary、 user dogfood「英文でなく和文に」)。
  // 未登録は英語のまま graceful。 翻訳された場合は title で原文を併記。
  const rawName = String(seg.name || '');
  const displayName = displaySegmentName(seg);
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
      padding: '7px 10px',
      borderRadius: '6px',
      background: 'var(--bg-subtle)',
      border: '1px solid var(--border)',
      gap: '8px',
    }}>
      <div
        style={{
          fontSize: '11px', color: 'var(--text-muted)',
          flex: '1 1 0', minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
        title={displayName !== rawName ? `原文: ${rawName}` : undefined}
      >
        {displayName}
      </div>
      <div style={{
        fontSize: '13px', fontWeight: '700',
        color: 'var(--text-primary)', flexShrink: 0,
      }}>
        ${seg.value_b}B
      </div>
      {seg.yoy_pct !== undefined && (
        <div style={{
          fontSize: '11px', fontWeight: '700',
          color: yoyColor,
          background: `${yoyColor}18`,
          padding: '2px 7px', borderRadius: '4px',
          flexShrink: 0,
        }}>
          {seg.yoy_pct >= 0 ? '+' : ''}{seg.yoy_pct}%
        </div>
      )}
    </div>
  );
}

// ── v138 Phase 2C: 資本政策 (配当 + 自社株買い 実行額) ───────────────────────
// backend `parsed["capitalReturn"]` (helper: get_capital_return_data) を render。
// raw fact のみ表示、 「announcement」 等の strong words は使わない (Phase 2D SEC 8-K 完了後 unlock)。
// trend chip: increase/decrease = 投資業界色ルール (緑/赤)、 stable = 中立 muted。
function CapitalReturnRow({ icon, label, primary, secondary, trendChip }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 10px',
      borderRadius: '6px',
      background: 'var(--bg-subtle)',
      border: '1px solid var(--border)',
      gap: '8px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        flex: '1 1 0', minWidth: 0,
      }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} aria-hidden="true">{icon}</span>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{
            fontSize: '11px', color: 'var(--text-muted)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{label}</div>
          {secondary && (
            <div style={{
              fontSize: '10px', color: 'var(--text-muted)',
              opacity: 0.7,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{secondary}</div>
          )}
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: '13px', fontWeight: 700,
          color: 'var(--text-primary)',
        }}>{primary}</div>
        {trendChip}
      </div>
    </div>
  );
}

function CapitalReturnSection({ capitalReturn }) {
  if (!capitalReturn) return null;
  const div = capitalReturn.dividend || null;
  const bb = capitalReturn.buyback || null;
  if (!div && !bb) return null;

  // trend chip: increase (緑) / decrease (赤) / stable (中立)
  let divTrendChip = null;
  if (div?.trend) {
    const trendMap = {
      increase: { label: '増配傾向', color: 'var(--color-gain)' },
      decrease: { label: '減配傾向', color: 'var(--color-loss)' },
      stable: { label: '横ばい', color: 'var(--text-muted)' },
    };
    const cfg = trendMap[div.trend];
    if (cfg) {
      divTrendChip = (
        <div style={{
          fontSize: '10px', fontWeight: 700,
          color: cfg.color,
          background: `${cfg.color === 'var(--text-muted)' ? 'rgba(148,163,184,0.12)' : (cfg.color === 'var(--color-gain)' ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)')}`,
          padding: '2px 7px', borderRadius: '4px',
          whiteSpace: 'nowrap',
        }}>
          {cfg.label}
        </div>
      );
    }
  }

  return (
    <>
      <VizSectionLabel text="資本政策（配当・自社株買い 実行額）" icon={Banknote} sub="配当と自社株買いによる株主への還元状況" />
      <div style={{
        fontSize: '10px', color: 'var(--text-muted)',
        marginBottom: '8px',
      }}>
        直近四半期 実績ベース（出典: FMP cash-flow / dividend-history）
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {div && (
          <CapitalReturnRow
            icon="◆"
            label="四半期配当（1 株あたり）"
            secondary={div.latestDate ? `直近 ex-div: ${div.latestDate}` : null}
            primary={`$${div.latestAmount.toFixed(4)}`}
            trendChip={divTrendChip}
          />
        )}
        {bb && (
          <CapitalReturnRow
            icon="◇"
            label="自社株買い 直近 Q 実行"
            secondary={bb.latestQDate ? `Q 末: ${bb.latestQDate}${bb.trailingTTMAmountB != null ? ` ／ TTM 累計 $${bb.trailingTTMAmountB}B` : ''}` : null}
            primary={`$${bb.latestQAmountB}B`}
            trendChip={null}
          />
        )}
      </div>
    </>
  );
}

// ── ①13F 機関投資家の動き (Round 3-B FMP Ultimate、 O'Neil "I" / 機関スポンサー) ──────
// backend parsed["institutionalOwnership"] = {trend:[{date, ownershipPercent, investorsHolding}],
//   latest:{date, ownershipPercent, prevOwnershipPercent, ownershipDeltaPt, investorsHolding,
//           newPositions, closedPositions, increasedPositions, reducedPositions}, source, delayDays}
// 数値は backend 純 Python 集計 (LLM 非経由)、 narration は静的 (Phase 5.5 path)。
// ⚠️ §38 / §5 厳守: 個社名なし・上昇余地%なし・最上級なし・断定将来予測なし。
//    保有比率の方向 (sign color) + 増減社数の事実集計のみ。 45日遅延を明記。
// sparkline は overflow safety (Number.isFinite guard) + SVG は presentation でなく style で var() 解決。
function InstitutionalSection({ institutional }) {
  if (!institutional) return null;
  const trendRaw = Array.isArray(institutional.trend) ? institutional.trend : [];
  const latest = institutional.latest || null;
  const pts = trendRaw.filter((t) => t && Number.isFinite(Number(t.ownershipPercent)));
  if (pts.length < 1 && !latest) return null;

  const fmtPct1 = (v) => (Number.isFinite(Number(v)) ? `${Number(v).toFixed(1)}%` : '—');
  const fmtInt = (v) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString('en-US') : '—');
  // 四半期短縮ラベル "26Q1" (FMP の date は四半期末日: 03/06/09/12)
  const qLabel = (dateStr) => {
    if (typeof dateStr !== 'string') return '';
    const m = dateStr.match(/^(\d{4})-(\d{2})/);
    if (!m) return '';
    const q = { '03': 1, '06': 2, '09': 3, '12': 4 }[m[2]] || Math.ceil(parseInt(m[2], 10) / 3);
    return `${m[1].slice(2)}Q${q}`;
  };

  // 直近の方向 (投資業界色ルール: 増=緑 / 減=赤 / 横ばい=中立)。 事実の符号のみ、 判定語は付けない。
  const deltaPt = latest && Number.isFinite(Number(latest.ownershipDeltaPt)) ? Number(latest.ownershipDeltaPt) : null;
  const deltaColor = deltaPt == null ? 'var(--text-muted)' : deltaPt > 0 ? 'var(--color-gain)' : deltaPt < 0 ? 'var(--color-loss)' : 'var(--text-muted)';
  const deltaBg = deltaPt == null ? 'rgba(148,163,184,0.12)' : deltaPt > 0 ? 'rgba(34,197,94,0.14)' : deltaPt < 0 ? 'rgba(239,68,68,0.14)' : 'rgba(148,163,184,0.12)';
  const accumColor = 'var(--color-gain)'; // 新規建て / 増やした = 買い手側 (集計事実)
  const distColor = 'var(--color-loss)';  // 解消 / 減らした = 売り手側 (集計事実)

  // sparkline geometry: viewBox 0..100 + preserveAspectRatio none で HTML 重ね合わせと座標一致。
  const vals = pts.map((t) => Number(t.ownershipPercent));
  const vmin = vals.length ? Math.min(...vals) : 0;
  const vmax = vals.length ? Math.max(...vals) : 1;
  const span = vmax - vmin || 1;
  const leftPct = (i) => (pts.length <= 1 ? 50 : 6 + (i / (pts.length - 1)) * 88); // 6%..94% (端の dot/label clip 回避)
  const topPct = (v) => 22 + (1 - (Number(v) - vmin) / span) * 60; // 22%..82% (上に % label 余白)
  const polyPoints = pts.map((t, i) => `${leftPct(i).toFixed(1)},${topPct(t.ownershipPercent).toFixed(1)}`).join(' ');

  const hasCounts = latest && (
    Number.isFinite(Number(latest.newPositions)) || Number.isFinite(Number(latest.increasedPositions))
  );

  return (
    <div data-testid="diagram-section-institutional" style={{ marginTop: '16px' }}>
      <VizSectionLabel text="機関投資家の動き" icon={Building2} sub="13F報告に基づく機関投資家の保有状況（提出に最大45日の遅れ）" />

      {/* 直近の保有比率 + 前期比 */}
      {latest && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: pts.length >= 2 ? '12px' : '10px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>機関保有比率</span>
          <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtPct1(latest.ownershipPercent)}
          </span>
          {deltaPt != null && (
            <span style={{ fontSize: '11px', fontWeight: 700, color: deltaColor, background: deltaBg, padding: '2px 7px', borderRadius: '4px', fontVariantNumeric: 'tabular-nums' }}>
              前期比 {deltaPt > 0 ? '+' : ''}{deltaPt.toFixed(1)}pt
            </span>
          )}
          {latest.date && (
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {qLabel(latest.date)} 報告 ・ 報告機関 {fmtInt(latest.investorsHolding)}社
            </span>
          )}
        </div>
      )}

      {/* 保有比率の推移 (sparkline) — 2Q 以上で表示 */}
      {pts.length >= 2 && (
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
            保有比率の推移（直近{pts.length}四半期）
          </div>
          <div style={{ position: 'relative', height: '56px' }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
              <polyline points={polyPoints} vectorEffect="non-scaling-stroke" strokeWidth="2"
                strokeLinejoin="round" strokeLinecap="round"
                style={{ fill: 'none', stroke: 'var(--color-accent)' }} />
            </svg>
            {pts.map((t, i) => {
              const isLast = i === pts.length - 1;
              const l = leftPct(i), tp = topPct(t.ownershipPercent);
              return (
                <div key={i}>
                  <span style={{
                    position: 'absolute', left: `${l}%`, top: `${tp}%`,
                    transform: 'translate(-50%, -150%)', whiteSpace: 'nowrap',
                    fontSize: '9px', fontWeight: isLast ? 700 : 500,
                    color: isLast ? 'var(--color-accent)' : 'var(--text-muted)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>{Number(t.ownershipPercent).toFixed(1)}</span>
                  <span style={{
                    position: 'absolute', left: `${l}%`, top: `${tp}%`,
                    transform: 'translate(-50%, -50%)',
                    width: isLast ? '9px' : '7px', height: isLast ? '9px' : '7px',
                    borderRadius: '50%', boxSizing: 'border-box',
                    background: isLast ? 'var(--color-accent)' : 'var(--bg-subtle)',
                    border: '1.5px solid var(--color-accent)',
                  }} />
                </div>
              );
            })}
          </div>
          <div style={{ position: 'relative', height: '12px' }}>
            {pts.map((t, i) => (
              <span key={i} style={{
                position: 'absolute', left: `${leftPct(i)}%`, top: 0,
                transform: 'translateX(-50%)', whiteSpace: 'nowrap',
                fontSize: '8.5px', color: 'var(--text-muted)',
              }}>{qLabel(t.date)}</span>
            ))}
          </div>
        </div>
      )}

      {/* 直近四半期に動いた機関の数。 v158 dogfood: 文字列の羅列が「文字壁」 に見えるため
          2×2 スタットタイル (ラベル小 + 数値大、 方向で緑/赤) に再設計し 2 秒で scan 可能に。 */}
      {hasCounts && (() => {
        const tiles = [
          { label: '新規建て', value: latest.newPositions, color: accumColor },
          { label: '解消', value: latest.closedPositions, color: distColor },
          { label: '保有を増やした', value: latest.increasedPositions, color: accumColor },
          { label: '減らした', value: latest.reducedPositions, color: distColor },
        ].filter((t) => Number.isFinite(Number(t.value)));
        if (tiles.length === 0) return null;
        return (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>直近四半期に動いた機関の数</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {tiles.map((t, i) => (
                <div key={i} style={{
                  display: 'flex', flexDirection: 'column', gap: '2px',
                  padding: '8px 10px', borderRadius: '8px',
                  background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{t.label}</span>
                  <span style={{ fontSize: '17px', fontWeight: 800, color: t.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>
                    {fmtInt(t.value)}<span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginLeft: '2px' }}>社</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* §38 免責 */}
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.5, display: 'flex', gap: '5px', alignItems: 'flex-start' }}>
        <Info size={11} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, marginTop: '1px' }} />
        <span>13F報告は提出に最大45日の遅れがあり、過去の保有状況を示すものです。個別の保有機関や将来の値動きを示すものではありません。（出典: FMP 13F）</span>
      </div>
    </div>
  );
}

// ── ④ インサイダー Form4 買い (Round 3-B FMP Ultimate、 経営陣の自社株買い) ──────────
// backend parsed["insiderBuys"] = {recent:[{name, roleLabel, shares, price, value, date}],
//   summary:{purchaseCount, totalValue, buyerCount, windowMonths}, source, delayDays}
// 数値/事実は backend 純 Python 整形 (LLM 非経由)、 narration は静的。
// ⚠️ §38 / §5 厳守 (user 決定 2026-06-03): P (open-market 購入) のみ・売却/権利行使は混ぜない。
//   「経営陣が買った=買いシグナル / 買い時」 の因果断定・推奨は **しない** (事実の提示のみ)。
//   買いが無ければ非表示 (大型株は通常 0) = 稀少 = 出た時だけ高シグナルを断定せず surface。
function InsiderBuysSection({ insider }) {
  if (!insider) return null;
  const recent = Array.isArray(insider.recent) ? insider.recent : [];
  const summary = insider.summary || null;
  if (recent.length === 0) return null;

  const fmtUsdC = (v) => {
    if (!Number.isFinite(Number(v))) return '—';
    const n = Number(v);
    // $995k 以上は M 表記に丸める ($1000k のような崩れを回避)
    if (n >= 995000) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
    return `$${Math.round(n)}`;
  };
  const fmtShares = (v) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString('en-US') : '—');
  const fmtDate = (d) => {
    if (typeof d !== 'string') return '';
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}/${m[2]}/${m[3]}` : d;
  };

  return (
    <div data-testid="diagram-section-insider" style={{ marginTop: '16px' }}>
      <VizSectionLabel
        text="経営陣の自社株買い"
        icon={UserCheck}
        sub="経営陣・取締役によるオープンマーケットでの自社株購入（Form 4・取引後2営業日以内に開示）"
      />

      {/* 過去window集計 (neutral 表記、 §38: 緑の投資色を使わず事実として提示) */}
      {summary && Number.isFinite(Number(summary.purchaseCount)) && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', flexWrap: 'wrap', marginBottom: '10px', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>過去{summary.windowMonths || 12}ヶ月</span>
          {Number.isFinite(Number(summary.buyerCount)) && (
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>買い手 <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{summary.buyerCount}</strong>名</span>
          )}
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>計 <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{summary.purchaseCount}</strong>件</span>
          {Number.isFinite(Number(summary.totalValue)) && summary.totalValue > 0 && (
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>総額 <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmtUsdC(summary.totalValue)}</strong></span>
          )}
        </div>
      )}

      {/* 直近の買い (役職 + 取得額 + 株数 + 氏名 + 日付) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {recent.map((t, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
            padding: '7px 10px', borderRadius: '6px',
            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
          }}>
            <span style={{
              flexShrink: 0, fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)',
              background: 'var(--bg-muted)', padding: '2px 7px', borderRadius: '4px',
            }}>{t.roleLabel || '関係者'}</span>
            {Number.isFinite(Number(t.value)) && t.value > 0 && (
              <span style={{ flexShrink: 0, fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmtUsdC(t.value)}</span>
            )}
            {Number.isFinite(Number(t.shares)) && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtShares(t.shares)}株</span>
            )}
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0 }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
              <span style={{ flexShrink: 0, fontSize: '10px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtDate(t.date)}</span>
            </span>
          </div>
        ))}
      </div>

      {/* §38 免責 */}
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.5, display: 'flex', gap: '5px', alignItems: 'flex-start', marginTop: '8px' }}>
        <Info size={11} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, marginTop: '1px' }} />
        <span>経営陣・取締役による自社株購入（オープンマーケット）の公開開示情報です。投資判断のシグナルや売買の推奨を示すものではありません。（出典: FMP Form 4）</span>
      </div>
    </div>
  );
}

// ── ⑤ 議員取引 (Round 3-B FMP Ultimate、 話題枠 / engagement) ───────────────────
// backend parsed["congressTrades"] = {recent:[{name, chamber('senate'|'house'), type('buy'|'sell'),
//   typeLabel('購入'|'売却'), amount, transactionDate, disclosureDate}], summary:{buyCount, sellCount,
//   totalCount, windowMonths}, source, delayDays}
// 数値/事実は backend 純 Python 整形 (LLM 非経由)、 narration は静的。
// ⚠️ §38 / §5 厳守 (user 決定 2026-06-03): これは engagement / 話題枠。
//   「議員が買った=買いシグナル」 の因果断定は **しない**。 議員名は公開開示で表示可。
//   買い/売りは投資業界色 (緑/赤) を使わず neutral 表記 (signal を匂わせない)。 45日遅延を明記。
function CongressTradesSection({ congress }) {
  if (!congress) return null;
  const recent = Array.isArray(congress.recent) ? congress.recent : [];
  const summary = congress.summary || null;
  if (recent.length === 0) return null;

  const chamberLabel = (c) => (c === 'senate' ? '上院' : c === 'house' ? '下院' : '議会');
  const fmtDate = (d) => {
    if (typeof d !== 'string') return '';
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}/${m[2]}/${m[3]}` : d;
  };

  return (
    <div data-testid="diagram-section-congress" style={{ marginTop: '16px' }}>
      <VizSectionLabel
        text="話題: 議員の開示取引"
        icon={Landmark}
        sub="米議会議員による株式売買の公開開示（提出に最大45日の遅れ）"
      />

      {/* 過去12ヶ月の集計 (neutral 表記、 §38: 緑/赤の投資色は使わない) */}
      {summary && (Number.isFinite(Number(summary.buyCount)) || Number.isFinite(Number(summary.sellCount))) && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', flexWrap: 'wrap', marginBottom: '10px', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>過去{summary.windowMonths || 12}ヶ月の開示</span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>購入 <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{summary.buyCount ?? 0}</strong>件</span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>売却 <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{summary.sellCount ?? 0}</strong>件</span>
        </div>
      )}

      {/* 直近の開示取引 (議員名 + 院 + 購入/売却 + 金額レンジ + 開示日) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {recent.map((t, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
            padding: '7px 10px', borderRadius: '6px',
            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
          }}>
            {/* 院 chip (neutral) */}
            <span style={{
              flexShrink: 0, fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)',
              background: 'var(--bg-muted)', padding: '2px 7px', borderRadius: '4px',
            }}>{chamberLabel(t.chamber)}</span>
            {/* 購入/売却 (neutral、 投資色なし) */}
            <span style={{ flexShrink: 0, fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{t.typeLabel || (t.type === 'buy' ? '購入' : '売却')}</span>
            {/* 金額レンジ */}
            {t.amount && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{t.amount}</span>}
            {/* 議員名 + 開示日 (右寄せ) */}
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0 }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
              <span style={{ flexShrink: 0, fontSize: '10px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtDate(t.disclosureDate)}</span>
            </span>
          </div>
        ))}
      </div>

      {/* §38 免責 */}
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.5, display: 'flex', gap: '5px', alignItems: 'flex-start', marginTop: '8px' }}>
        <Info size={11} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, marginTop: '1px' }} />
        <span>議員による株式売買の公開開示情報です。最大45日の遅れがあり、投資判断のシグナルや売買の推奨を示すものではありません。（出典: FMP 議員取引開示）</span>
      </div>
    </div>
  );
}

// ── v138 Phase 2D Sprint 2b: 次 Q ガイダンス (SEC 8-K LLM 抽出) ──────────────
// backend `parsed["guidanceExtracted"]` (visualizer/sec_guidance.extract_guidance) を render。
// raw fact のみ表示、 「確実」 「必ず」 等の §38 断定 / §5 最上級は backend NEGATIVES + frontend
// BLOCKLIST_REGEX (blocklist.js) で 2 重 sanitize 済。
// extraction_confidence: high=緑 chip / medium=muted chip / low=warning banner (出典確認誘導)。
const MARGIN_TYPE_LABEL = { gross: '粗利率', operating: '営業利益率', net: '純利益率' };

function formatRevenueRange(rev) {
  if (!rev) return null;
  const lo = rev.low_b;
  const hi = rev.high_b;
  if (lo == null && hi == null) return null;
  const fmt = (v) => `$${(typeof v === 'number' ? v : 0).toFixed(1)}B`;
  if (lo != null && hi != null && lo !== hi) return `${fmt(lo)} - ${fmt(hi)}`;
  return fmt(lo ?? hi);
}

function formatMarginRange(mg) {
  if (!mg) return null;
  const lo = mg.low_pct;
  const hi = mg.high_pct;
  if (lo == null && hi == null) return null;
  const fmt = (v) => `${(typeof v === 'number' ? v : 0).toFixed(1)}%`;
  if (lo != null && hi != null && lo !== hi) return `${fmt(lo)} - ${fmt(hi)}`;
  return fmt(lo ?? hi);
}

function GuidanceRow({ icon, label, primary, secondaryChip, consensusDiffPct }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 10px',
      borderRadius: '6px',
      background: 'var(--bg-subtle)',
      border: '1px solid var(--border)',
      gap: '8px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        flex: '1 1 0', minWidth: 0,
      }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} aria-hidden="true">{icon}</span>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{
            fontSize: '11px', color: 'var(--text-muted)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{label}</div>
          {consensusDiffPct != null && (
            <div style={{
              fontSize: '10px',
              color: consensusDiffPct > 0 ? 'var(--color-gain)' : consensusDiffPct < 0 ? 'var(--color-loss)' : 'var(--text-muted)',
              opacity: 0.85,
              whiteSpace: 'nowrap',
            }}>
              consensus 比 {consensusDiffPct > 0 ? '+' : ''}{consensusDiffPct.toFixed(1)}%
            </div>
          )}
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: '13px', fontWeight: 700,
          color: 'var(--text-primary)',
        }}>{primary}</div>
        {secondaryChip}
      </div>
    </div>
  );
}

function GuidanceSection({ guidance }) {
  if (!guidance) return null;
  // §38 belt-and-suspenders: narrative は backend NEGATIVES + sanitize 済だが、 transcript 由来は
  // hallucination risk が高いため frontend でも BLOCKLIST sentence-drop を再適用 (3 層目防御)。
  const narrative = sanitizeText(guidance.narrative_jp || '');
  const sourceUrl = guidance.source_url || '';
  const confidence = guidance.extraction_confidence || 'low';
  // ⑩ Phase 1: source 種別 (8k / transcript / policy)。 transcript は FMP 非公開 URL のため
  // 外部 link を出さず、 source_label + 発言原文 (source_quote) を citation 主体にする (Trust Cliff 回避)。
  const sourceType = guidance.source_type || '8k';
  const isTranscript = sourceType === 'transcript';
  const sourceLabel = guidance.source_label || '';
  const sourceQuote = isTranscript ? (guidance.source_quote || '') : '';
  // Option A: 構造化レンジなし narrative-only (MSFT 型 opex/capex/margin-direction)。
  // 「精度不足」 でなく「総売上/margin の数値レンジは未開示・経営陣の言及は以下」 と中立に伝える。
  const narrativeOnly = guidance.narrative_only === true;
  const qRev = formatRevenueRange(guidance.q_revenue);
  const qMg = formatMarginRange(guidance.q_margin);
  const fyRev = formatRevenueRange(guidance.fy_revenue);
  const fyMg = formatMarginRange(guidance.fy_margin);
  const hasAnyStructured = qRev || qMg || fyRev || fyMg;
  if (!narrative && !hasAnyStructured) return null;

  const confidenceCfg = {
    high: { label: '精度: 高', color: 'var(--color-gain)', bg: 'rgba(34,197,94,0.14)' },
    medium: { label: '精度: 中', color: 'var(--text-muted)', bg: 'rgba(148,163,184,0.12)' },
    low: { label: '精度: 低', color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.14)' },
  }[confidence] || null;
  const confidenceChip = confidenceCfg ? (
    <div style={{
      fontSize: '10px', fontWeight: 700,
      color: confidenceCfg.color,
      background: confidenceCfg.bg,
      padding: '2px 7px', borderRadius: '4px',
      whiteSpace: 'nowrap',
    }}>
      {confidenceCfg.label}
    </div>
  ) : null;

  const marginTypeChip = (mg) => {
    if (!mg?.type) return null;
    const tyLabel = MARGIN_TYPE_LABEL[mg.type];
    if (!tyLabel) return null;
    return (
      <div style={{
        fontSize: '10px', fontWeight: 600,
        color: 'var(--text-muted)',
        background: 'rgba(148,163,184,0.12)',
        padding: '2px 7px', borderRadius: '4px',
        whiteSpace: 'nowrap',
      }}>
        {tyLabel}
      </div>
    );
  };

  return (
    <>
      <VizSectionLabel text="次 Q ガイダンス（経営陣の見通し）" icon={Calendar} sub="経営陣が決算説明会・開示で示した次の期間の見通し" />
      <div style={{
        fontSize: '10px', color: 'var(--text-muted)',
        marginBottom: '8px',
        display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
      }}>
        <span>
          {isTranscript
            ? (sourceLabel ? `${sourceLabel}の経営陣発言から抽出` : '決算カンファレンスコールの経営陣発言から抽出')
            : 'SEC 8-K プレスリリースから抽出'}
        </span>
        {/* 精度 chip は「構造化数値を抽出できた」 時だけ。 数値ゼロ (= ソースに数値ガイダンスなし) や
            narrative_only で「精度: 低」 を出すと「アプリの抽出失敗」 と誤読される (user dogfood NKE 2026-06-04) */}
        {!narrativeOnly && hasAnyStructured && confidenceChip}
      </div>

      {/* ガイダンス注記の 3 分岐 (user dogfood NKE 2026-06-04 Trust Cliff fix):
          ① narrative_only: 数値レンジ未開示だが経営陣が定性的に言及 (MSFT 型) → 中立 info。
          ② 構造化数値ゼロ (hasAnyStructured=false): ソースに数値ガイダンスの記載なし (NKE 型) →
             中立 info。 「抽出精度が不足」=アプリ不具合 の誤読を排除し、「決算で開示されない場合もある」 と明示。
          ③ 数値あり + confidence=low: 抽出した数値の確度が低い → amber で原文確認を促す (数値の caveat)。 */}
      {narrativeOnly ? (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '8px',
          padding: '8px 10px', borderRadius: '6px',
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border)',
          marginBottom: '8px',
        }}>
          <Info size={14} strokeWidth={2} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            売上高・マージンの公式ガイダンスは公開されていません。 代わりに、 経営陣が決算カンファレンスコールで述べた見通しを引用します（当社の予測ではありません）。
          </div>
        </div>
      ) : !hasAnyStructured ? (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '8px',
          padding: '8px 10px', borderRadius: '6px',
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border)',
          marginBottom: '8px',
        }}>
          <Info size={14} strokeWidth={2} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {isTranscript
              ? 'この決算説明会では、次期の具体的な数値ガイダンスは確認できませんでした。 企業が次期の数値見通しを非開示とする場合があります。 経営陣の発言は下記をご確認ください。'
              : 'このリリースには次期の数値ガイダンスの記載が見当たりませんでした。 企業が次期の数値見通しを非開示とする場合があります。 原文（出典）でご確認ください。'}
          </div>
        </div>
      ) : confidence === 'low' ? (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '8px',
          padding: '8px 10px', borderRadius: '6px',
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.32)',
          marginBottom: '8px',
        }}>
          <AlertTriangle size={14} strokeWidth={2} color="var(--color-warning)" style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
          <div style={{ fontSize: '11px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
            {isTranscript
              ? '抽出した数値は確度が低い可能性があります。 下記の発言原文でご確認ください。'
              : '抽出した数値は確度が低い可能性があります。 原文（出典）でご確認ください。'}
          </div>
        </div>
      ) : null}

      {narrative && (
        // デザインレビュー (4体合議 2026-06-03、 user 指摘1): 本文がプレーンテキストだと「どの section の
        // 内容か」 が曖昧 → 他 section と同じく枠に格納 (bg-subtle + border + 左 accent)。 glow host は
        // 増やさず inline style のみ (design_recipes §C-1 入れ子 surface-card 禁止 遵守)。
        <div style={{
          fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.6,
          marginBottom: (hasAnyStructured || sourceQuote) ? '10px' : '0',
          whiteSpace: 'pre-line',
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border)',
          borderLeft: '3px solid var(--color-accent)',
          borderRadius: '0 6px 6px 0',
          padding: '10px 14px',
        }}>
          {narrative}
        </div>
      )}

      {/* ⑩ Phase 1: 発言原文 (source_quote) — 数値の根拠となる経営陣の英語発言を逐語引用。
          FMP transcript は非公開 URL のため、 この blockquote が citation の検証主体になる。 */}
      {sourceQuote && (
        <blockquote style={{
          margin: '0 0 10px 0',
          padding: '8px 12px',
          borderLeft: '3px solid var(--color-accent)',
          background: 'var(--bg-subtle)',
          borderRadius: '0 6px 6px 0',
        }}>
          <div style={{
            fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: 'var(--text-muted)',
            marginBottom: '3px',
          }}>
            発言原文
          </div>
          {/* 引用符はハードコードせず CSS quotes で付与 (source_quote 内に " が含まれる二重引用回避、
              3体合議 frontend verdict)。 */}
          <q style={{
            fontSize: '11px', color: 'var(--text-secondary)',
            lineHeight: 1.55, fontStyle: 'italic',
          }}>
            {sourceQuote}
          </q>
        </blockquote>
      )}

      {hasAnyStructured && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {qRev && (
            <GuidanceRow
              icon="◆"
              label="次 Q 売上高"
              primary={qRev}
              consensusDiffPct={guidance.q_revenue?.consensus_diff_pct}
            />
          )}
          {qMg && (
            <GuidanceRow
              icon="◆"
              label="次 Q マージン"
              primary={qMg}
              secondaryChip={marginTypeChip(guidance.q_margin)}
            />
          )}
          {fyRev && (
            <GuidanceRow
              icon="◇"
              label="通期 売上高"
              primary={fyRev}
              consensusDiffPct={guidance.fy_revenue?.consensus_diff_pct}
            />
          )}
          {fyMg && (
            <GuidanceRow
              icon="◇"
              label="通期 マージン"
              primary={fyMg}
              secondaryChip={marginTypeChip(guidance.fy_margin)}
            />
          )}
        </div>
      )}

      {/* 出典: 8-K は SEC filing への外部 link。 transcript は FMP 非公開 URL のため
          link 化せず source_label をテキスト表示 (壊れた link を出さない = Trust Cliff 回避)。 */}
      {isTranscript ? (
        <div style={{
          marginTop: '10px',
          fontSize: '10px', color: 'var(--text-muted)',
        }}>
          出典: {sourceLabel || '決算カンファレンスコール（経営陣発言）'}
        </div>
      ) : sourceUrl ? (
        <div style={{
          marginTop: '10px',
          fontSize: '10px', color: 'var(--text-muted)',
        }}>
          出典: <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}
          >
            原文を開く
          </a>
        </div>
      ) : null}
    </>
  );
}

function BarChartPanel({ trend, operatingMargins }) {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, value: null, period: null, yoy: null, beat: null, beatMargin: null });

  if (!trend?.data?.length) return null;
  const pts = (trend.data || []).filter(d => d.value != null);
  if (!pts.length) return null;

  const vals   = pts.map(d => d.value);
  const maxV   = Math.max(...vals);
  const minV   = Math.min(0, Math.min(...vals));
  const range  = maxV - minV || 1;

  const n            = pts.length;
  const BAR_W        = n >= 5 ? 32 : n >= 4 ? 38 : 44;
  const SPACING      = n >= 5 ? 12 : n >= 4 ? 16 : 20;
  const LEFT_PAD     = 40;
  const RIGHT_PAD    = 10;
  const YOY_AREA_TOP = 32;   // YoY label clamp ceiling
  const BAR_AREA_TOP = 54;   // bars start here (leaves room for YoY labels above)
  const BAR_CHART_H  = 120;
  const AXIS_Y       = BAR_AREA_TOP + BAR_CHART_H;  // 174
  const XLAB_Y       = AXIS_Y + 20;                  // 194
  const BEAT_Y       = XLAB_Y + 18;                  // 212
  const SVG_W        = LEFT_PAD + n * BAR_W + (n - 1) * SPACING + RIGHT_PAD;
  const SVG_H        = BEAT_Y + 14;                  // ≒ 226（vs Est 副ラベル廃止に伴い縮小）

  const bxArr = pts.map((_, i) => LEFT_PAD + i * (BAR_W + SPACING));
  const cxArr = bxArr.map(bx => bx + BAR_W / 2);

  const isRevenue = trend.metric === '売上高';
  const mData     = isRevenue && operatingMargins
    ? operatingMargins.filter(d => d.value != null).slice(0, pts.length)
    : [];
  const hasMargin = mData.length >= 2;

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {/* Y-axis max label */}
      <text x={LEFT_PAD - 4} y={BAR_AREA_TOP + 8} textAnchor="end" fontSize="10" fontWeight="600" fill="#9ca3af">
        {maxV}
      </text>
      {/* ── Y軸グリッドライン（3本）と目盛りラベル ── */}
      {[0.25, 0.5, 0.75].map(ratio => {
        const gridY = AXIS_Y - BAR_CHART_H * ratio;
        const gridV = minV + range * ratio;
        return (
          <g key={ratio}>
            <line
              x1={LEFT_PAD} y1={gridY}
              x2={SVG_W - RIGHT_PAD} y2={gridY}
              stroke="#334155" strokeWidth="0.5" strokeDasharray="3,3"
            />
            <text
              x={LEFT_PAD - 4} y={gridY + 4}
              textAnchor="end" fontSize="9" fill="#475569"
            >
              {gridV >= 1000 ? `${(gridV / 1000).toFixed(0)}k`
                : gridV >= 1 ? gridV.toFixed(0)
                : gridV.toFixed(2)}
            </text>
          </g>
        );
      })}
      {/* Axis line */}
      <line x1={LEFT_PAD} y1={AXIS_Y} x2={SVG_W - RIGHT_PAD} y2={AXIS_Y} stroke="#e2e8f0" strokeWidth="1" />

      {/* ── パス1：バー（rect）+ ホバーイベント ── */}
      {pts.map((d, i) => {
        const barH     = Math.max(4, Math.round(((d.value - minV) / range) * BAR_CHART_H));
        const bx       = bxArr[i];
        const by       = AXIS_Y - barH;
        const isLatest = i === pts.length - 1;
        const fill     = isLatest ? '#38BDF8' : '#64748b';
        const prev     = i > 0 ? pts[i - 1] : null;
        const yoy      = prev?.value ? ((d.value - prev.value) / Math.abs(prev.value) * 100) : null;
        return (
          <rect
            key={`bar-${i}`}
            x={bx} y={by} width={BAR_W} height={barH} rx="3" fill={fill}
            style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = '0.75';
              setTooltip({ visible: true, x: bxArr[i] + BAR_W / 2, y: by, value: d.value, period: d.period, yoy, beat: d.beat, beatMargin: d.beatMargin });
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = '1';
              setTooltip(prev => ({ ...prev, visible: false }));
            }}
          />
        );
      })}

      {/* ── パス2：全ラベル（前面） ── */}
      {pts.map((d, i) => {
        const barH     = Math.max(4, Math.round(((d.value - minV) / range) * BAR_CHART_H));
        const by       = AXIS_Y - barH;
        const cx       = cxArr[i];
        const isLatest = i === pts.length - 1;

        const prev      = i > 0 ? pts[i - 1] : null;
        const yoy       = prev?.value ? ((d.value - prev.value) / Math.abs(prev.value) * 100) : null;
        const beatLabel = d.beat === true ? '↑BEAT' : d.beat === false ? '↓MISS' : null;
        const beatFill  = d.beat === true ? '#10B981' : '#ef4444';

        // ── YoY label placement (常にバー外側上部・BarChartWithMargin と統一) ──
        const insideBar = false;
        const yoyFill   = '#38BDF8';
        const yoyY      = yoy !== null
          ? Math.max(YOY_AREA_TOP, by - 18)
          : null;

        // ── Value label placement ──
        // 値は常にバー内部下寄せ（高さが十分な場合）またはバー外側上部
        const valInside = barH >= 22;
        const valY = valInside
          ? AXIS_Y - 8   // バー内部の最下部付近
          : by - 4;      // バー外側上部
        const valFill = valInside ? 'white' : (isLatest ? '#38BDF8' : '#94a3b8');

        return (
          <g key={`label-${i}`}>
            {/* YoY（1行） */}
            {yoyY !== null && (
              <text
                x={cx} y={yoyY} textAnchor="middle"
                fontSize={n >= 5 ? 9 : 11}
                fontWeight="700" fill={yoyFill}
              >
                {yoy >= 0 ? '+' : ''}{yoy.toFixed(1)}% YoY
              </text>
            )}
            {/* 絶対値 */}
            <text x={cx} y={valY} textAnchor="middle" fontSize="11" fontWeight="700" fill={valFill}>
              {d.value}
            </text>
            {/* 期間ラベル */}
            <text x={cx} y={XLAB_Y} textAnchor="middle" fontSize={n >= 5 ? 10 : 12} fontWeight="600" fill="#6b7280">
              {String(d.period).replace('FY', '')}
            </text>
            {/* BEAT/MISS（乖離率があれば併記） */}
            {beatLabel && (
              <>
                <text x={cx} y={BEAT_Y} textAnchor="middle" fontSize="11" fontWeight="700" fill={beatFill}>
                  {beatLabel}
                </text>
                {/* 「vs Est」副ラベルは横方向の重なりが避けられないため、
                    バー直下のSVGテキスト描画を廃止し、ホバーツールチップに集約 */}
              </>
            )}
          </g>
        );
      })}

      {/* ── ツールチップ ── */}
      {tooltip.visible && (
        <foreignObject
          x={Math.min(Math.max(tooltip.x - 60, LEFT_PAD), SVG_W - 125)}
          y={Math.max(tooltip.y - 72, 0)}
          width="120" height="80"
          style={{ pointerEvents: 'none', overflow: 'visible' }}
        >
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '7px',
            padding: '6px 10px',
            fontSize: '11px',
            color: '#e2e8f0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
          }}>
            <div style={{ fontWeight: '700', color: '#38BDF8', marginBottom: '2px' }}>
              {String(tooltip.period).replace('FY', '')}
            </div>
            <div style={{ marginBottom: '2px' }}>
              {tooltip.value}{trend.unit || ''}
            </div>
            {tooltip.yoy !== null && (
              <div style={{ color: tooltip.yoy >= 0 ? '#10B981' : '#ef4444', marginBottom: '2px' }}>
                YoY {tooltip.yoy >= 0 ? '+' : ''}{tooltip.yoy.toFixed(1)}%
              </div>
            )}
            {tooltip.beatMargin != null && (
              <div style={{ color: tooltip.beat ? '#10B981' : '#ef4444', fontSize: '10px' }}>
                {tooltip.beat ? '↑BEAT' : '↓MISS'} {tooltip.beatMargin > 0 ? '+' : ''}{tooltip.beatMargin.toFixed(1)}% vs Est
              </div>
            )}
          </div>
        </foreignObject>
      )}
    </svg>
  );
}

/**
 * BarChartWithMargin — revenue chart with operating margin sparkline overlay.
 *
 * Vertical layout (Y positions):
 *   Y=28        : 「営業利益率▶」legend  (MARGIN_LABEL_Y)
 *   Y=[38, 62]  : margin sparkline band  (OP_AREA_TOP / OP_AREA_BTM)
 *                 dots scaled by opToY(); labels at dotY - 6
 *   Y=62+       : YoY labels  (by - 10, min = BAR_AREA_TOP - 10 = 62 → touches band bottom, no overlap)
 *   Y=72        : bar area starts  (BAR_AREA_TOP)
 *   Y=182       : axis line  (BAR_AREA_TOP + BAR_CHART_H)
 *   Y=196       : period labels
 *   Y=210       : BEAT/MISS labels
 */
function BarChartWithMargin({ trend, operatingMargins }) {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, value: null, period: null, yoy: null, beat: null, beatMargin: null });

  if (!trend?.data?.length) return null;
  const pts = (trend.data || []).filter(d => d.value != null);
  if (!pts.length) return null;

  const vals  = pts.map(d => d.value);
  const maxV  = Math.max(...vals);
  const minV  = Math.min(0, Math.min(...vals));
  const range = maxV - minV || 1;

  const n            = pts.length;
  const BAR_W        = n >= 5 ? 32 : n >= 4 ? 38 : 44;
  const SPACING      = n >= 5 ? 12 : n >= 4 ? 16 : 20;
  const LEFT_PAD     = 40;
  const RIGHT_PAD    = 10;
  const MARGIN_LABEL_Y = 32;   // 「営業利益率▶」legend
  const OP_AREA_TOP    = 46;   // sparkline band top
  const OP_AREA_BTM    = 72;   // sparkline band bottom
  const BAR_AREA_TOP   = 86;   // bars start (gap above = 86-72 = 14px; YoY at by-10, min=76 > 72 ✓)
  const BAR_CHART_H    = 120;
  const AXIS_Y         = BAR_AREA_TOP + BAR_CHART_H;  // 206
  const XLAB_Y         = AXIS_Y + 20;                  // 226
  const BEAT_Y         = XLAB_Y + 18;                  // 244
  const SVG_W          = LEFT_PAD + n * BAR_W + (n - 1) * SPACING + RIGHT_PAD;
  const SVG_H          = BEAT_Y + 14;                  // ≒ 258（vs Est 副ラベル廃止）

  const bxArr = pts.map((_, i) => LEFT_PAD + i * (BAR_W + SPACING));
  const cxArr = bxArr.map(bx => bx + BAR_W / 2);

  const mData     = (operatingMargins || []).filter(d => d.value != null).slice(0, pts.length);
  const hasMargin = mData.length >= 2;

  // Build opToY scale from actual margin values (±5% padding so line isn't flat-edge)
  let opToY = null;
  if (hasMargin) {
    const mVals   = mData.map(d => d.value);
    const opMin   = Math.min(...mVals) * 0.95;
    const opMax   = Math.max(...mVals) * 1.05;
    const opRange = Math.max(opMax - opMin, 0.01);
    opToY = v => OP_AREA_BTM - ((v - opMin) / opRange) * (OP_AREA_BTM - OP_AREA_TOP);
  }

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {/* Y-axis max label */}
      <text x={LEFT_PAD - 4} y={BAR_AREA_TOP + 8} textAnchor="end" fontSize="10" fontWeight="600" fill="#9ca3af">
        {maxV}
      </text>
      {/* ── Y軸グリッドライン（3本）と目盛りラベル ── */}
      {[0.25, 0.5, 0.75].map(ratio => {
        const gridY = AXIS_Y - BAR_CHART_H * ratio;
        const gridV = minV + range * ratio;
        return (
          <g key={ratio}>
            <line
              x1={LEFT_PAD} y1={gridY}
              x2={SVG_W - RIGHT_PAD} y2={gridY}
              stroke="#334155" strokeWidth="0.5" strokeDasharray="3,3"
            />
            <text
              x={LEFT_PAD - 4} y={gridY + 4}
              textAnchor="end" fontSize="9" fill="#475569"
            >
              {gridV >= 1000 ? `${(gridV / 1000).toFixed(0)}k`
                : gridV >= 1 ? gridV.toFixed(0)
                : gridV.toFixed(2)}
            </text>
          </g>
        );
      })}
      {/* Axis line */}
      <line x1={LEFT_PAD} y1={AXIS_Y} x2={SVG_W - RIGHT_PAD} y2={AXIS_Y} stroke="#e2e8f0" strokeWidth="1" />

      {/* ── Operating margin sparkline band y=[38, 62] ── */}
      {hasMargin && opToY && (
        <g>
          {/* Legend with dashed-line sample (TASK 3) */}
          <line
            x1={LEFT_PAD} y1={MARGIN_LABEL_Y - 3}
            x2={LEFT_PAD + 14} y2={MARGIN_LABEL_Y - 3}
            stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="4,3"
          />
          <text x={LEFT_PAD + 17} y={MARGIN_LABEL_Y}
            textAnchor="start" fontSize="10" fontWeight="700" fill="#F59E0B">
            営業利益率
          </text>
          {/* Dashed polyline — scaled by opToY so line tilts with actual margin changes */}
          <polyline
            points={mData.map((d, i) => `${cxArr[i].toFixed(1)},${opToY(d.value).toFixed(1)}`).join(' ')}
            stroke="#F59E0B" strokeWidth="1.5" fill="none" strokeDasharray="4,3" />
          {/* Dot + value label for each period */}
          {mData.map((d, i) => {
            const dy = opToY(d.value);
            return (
              <g key={i}>
                <circle cx={cxArr[i]} cy={dy} r="3.5"
                  fill="#F59E0B" stroke="white" strokeWidth="1" />
                <text x={cxArr[i]} y={dy - 6}
                  textAnchor="middle" fontSize="10" fontWeight="700" fill="#F59E0B">
                  {d.value}%
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* ── パス1：バー（rect）+ ホバーイベント ── */}
      {pts.map((d, i) => {
        const barH     = Math.max(4, Math.round(((d.value - minV) / range) * BAR_CHART_H));
        const bx       = bxArr[i];
        const by       = AXIS_Y - barH;
        const isLatest = i === pts.length - 1;
        const fill     = isLatest ? '#38BDF8' : '#64748b';
        const prev     = i > 0 ? pts[i - 1] : null;
        const yoy      = prev?.value ? ((d.value - prev.value) / Math.abs(prev.value) * 100) : null;
        return (
          <rect
            key={`bar-${i}`}
            x={bx} y={by} width={BAR_W} height={barH} rx="3" fill={fill}
            style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = '0.75';
              setTooltip({ visible: true, x: bxArr[i] + BAR_W / 2, y: by, value: d.value, period: d.period, yoy, beat: d.beat, beatMargin: d.beatMargin });
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = '1';
              setTooltip(prev => ({ ...prev, visible: false }));
            }}
          />
        );
      })}

      {/* ── パス2：全ラベル（前面） ── */}
      {pts.map((d, i) => {
        const barH     = Math.max(4, Math.round(((d.value - minV) / range) * BAR_CHART_H));
        const by       = AXIS_Y - barH;
        const cx       = cxArr[i];
        const isLatest = i === pts.length - 1;

        const prev      = i > 0 ? pts[i - 1] : null;
        const yoy       = prev?.value ? ((d.value - prev.value) / Math.abs(prev.value) * 100) : null;
        const beatLabel = d.beat === true ? '↑BEAT' : d.beat === false ? '↓MISS' : null;
        const beatFill  = d.beat === true ? '#10B981' : '#ef4444';

        // ── YoY label placement (mobile-safe) ──
        // 仕様: bar高 >= 60 → バー内表示（現状維持）/ < 60 → バー外側上部に1行表示
        const insideBar = barH >= 60;
        const yoyFill   = insideBar ? 'rgba(255,255,255,0.9)' : '#38BDF8';
        const yoyBaseY  = yoy !== null
          ? (insideBar ? by + 16 : Math.max(BAR_AREA_TOP - 4, by - 18))
          : null;

        // ── Value label placement ──
        const valInside = barH >= 22;
        const valY = valInside
          ? by + (insideBar ? barH - 8 : Math.min(14, barH - 6))
          : by - 4;
        const valFill = valInside ? 'white' : (isLatest ? '#38BDF8' : '#94a3b8');

        return (
          <g key={`label-${i}`}>
            {/* YoY（1行） */}
            {yoyBaseY !== null && (
              <text
                x={cx} y={yoyBaseY} textAnchor="middle"
                fontSize={n >= 5 ? 9 : 11}
                fontWeight="700" fill={yoyFill}
              >
                {yoy >= 0 ? '+' : ''}{yoy.toFixed(1)}% YoY
              </text>
            )}
            {/* 絶対値 */}
            <text x={cx} y={valY} textAnchor="middle" fontSize="11" fontWeight="700" fill={valFill}>
              {d.value}
            </text>
            {/* 期間ラベル */}
            <text x={cx} y={XLAB_Y} textAnchor="middle" fontSize={n >= 5 ? 10 : 12} fontWeight="600" fill="#6b7280">
              {String(d.period).replace('FY', '')}
            </text>
            {/* BEAT/MISS（乖離率があれば併記） */}
            {beatLabel && (
              <>
                <text x={cx} y={BEAT_Y} textAnchor="middle" fontSize="11" fontWeight="700" fill={beatFill}>
                  {beatLabel}
                </text>
                {/* 「vs Est」副ラベルは横方向の重なりが避けられないため、
                    バー直下のSVGテキスト描画を廃止し、ホバーツールチップに集約 */}
              </>
            )}
          </g>
        );
      })}

      {/* ── ツールチップ ── */}
      {tooltip.visible && (
        <foreignObject
          x={Math.min(Math.max(tooltip.x - 60, LEFT_PAD), SVG_W - 125)}
          y={Math.max(tooltip.y - 72, 0)}
          width="120" height="80"
          style={{ pointerEvents: 'none', overflow: 'visible' }}
        >
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '7px',
            padding: '6px 10px',
            fontSize: '11px',
            color: '#e2e8f0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
          }}>
            <div style={{ fontWeight: '700', color: '#38BDF8', marginBottom: '2px' }}>
              {String(tooltip.period).replace('FY', '')}
            </div>
            <div style={{ marginBottom: '2px' }}>
              {tooltip.value}{trend.unit || ''}
            </div>
            {tooltip.yoy !== null && (
              <div style={{ color: tooltip.yoy >= 0 ? '#10B981' : '#ef4444', marginBottom: '2px' }}>
                YoY {tooltip.yoy >= 0 ? '+' : ''}{tooltip.yoy.toFixed(1)}%
              </div>
            )}
            {tooltip.beatMargin != null && (
              <div style={{ color: tooltip.beat ? '#10B981' : '#ef4444', fontSize: '10px' }}>
                {tooltip.beat ? '↑BEAT' : '↓MISS'} {tooltip.beatMargin > 0 ? '+' : ''}{tooltip.beatMargin.toFixed(1)}% vs Est
              </div>
            )}
          </div>
        </foreignObject>
      )}
    </svg>
  );
}

// ── Valuation tooltip card ──────────────────────────────────────────────────
const VALUATION_CRITERIA = {
  PER: {
    low: '15x以下', high: '30x以上',
    note: '同業種平均と比較。成長株は高め。',
    basis: 'S&P500 IT平均 ≒ 28x（2025年）',
    industryAvg: 28,
  },
  PBR: {
    low: '1x以下',  high: '4x以上',
    note: '純資産対比。1x割れは解散価値以下。',
    basis: 'S&P500 IT平均 ≒ 8x（2025年）',
    industryAvg: 8,
  },
  PSR: {
    low: '2x以下',  high: '8x以上',
    note: '売上高対比。SaaS等は高め許容。',
    basis: 'S&P500 IT平均 ≒ 5x（2025年）',
    industryAvg: 5,
  },
  'EV/EBITDA': {
    low: '8x以下',  high: '18x以上',
    note: '企業価値対営業利益（償却前）。買収妥当性の代理指標。',
    basis: 'S&P500 IT平均 ≒ 16x（2025年）',
    industryAvg: 16,
  },
  PEG: {
    low: '1x以下',  high: '2x以上',
    note: 'PER ÷ EPS成長率。1x以下は成長を考慮すると割安。',
    basis: 'PEG = PER ÷ EPS成長率（Non-GAAP・NTMベース）',
    industryAvg: 1.5,
  },
};

function ValuationCard({ label, value, judge, dynamicBasis }) {
  const [showTip, setShowTip] = useState(false);
  // フォールバック（中立・やや高/割高 など）はニュートラルグレーに統一。
  // 青色だと PASS / Beat の系統色と混同されやすいため、
  // バリュエーションは Beat/Miss 判定とは別軸であることをカラー的にも示す。
  const judgeColor = judge === '割安' ? '#10B981' : judge === '割高' ? '#F87171' : '#94a3b8';
  // グレー帯の場合は「中立」を必ず明示（壊れている表示と誤認されないため）。
  // judge が空文字 / null / undefined のときは「中立」単独で表示し、
  // 既存ラベル（高 / やや割高 等）があればその横に補足タグを置く。
  const isNeutral = judge !== '割安' && judge !== '割高';
  const displayJudge = judge || '中立';
  const showNeutralTag = isNeutral && judge && judge !== '中立';
  const crit = VALUATION_CRITERIA[label];
  return (
    <div
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      style={{
        flex: '1 1 72px', borderRadius: '8px',
        border: '1px solid var(--border)', padding: '10px 8px',
        textAlign: 'center', background: 'var(--bg-subtle)',
        position: 'relative', cursor: 'help',
      }}
    >
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
        {label}
        <span style={{
          marginLeft: '4px',
          fontSize: '11px',
          color: '#38BDF8',
          opacity: 0.8,
          fontWeight: '600',
          cursor: 'help',
        }}>ⓘ</span>
      </div>
      <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px', fontVariantNumeric: 'tabular-nums' }}>
        {value}x
      </div>
      <div style={{
        fontSize: '10px', fontWeight: '700', color: judgeColor,
        background: `${judgeColor}22`, borderRadius: '4px',
        padding: '2px 6px', display: 'inline-flex',
        alignItems: 'center', gap: '4px',
      }}>
        <span>{displayJudge}</span>
        {showNeutralTag && (
          <span style={{ fontSize: '9px', fontWeight: 500, opacity: 0.75 }}>
            （中立）
          </span>
        )}
      </div>
      {showTip && crit && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '6px', zIndex: 10,
          background: '#1e293b', border: '1px solid #334155',
          borderRadius: '8px', padding: '8px 10px',
          width: '160px', textAlign: 'left',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: '#38BDF8', marginBottom: '4px' }}>
            {label} 判断基準
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: 1.6 }}>
            <span style={{ color: '#10B981' }}>割安：</span>{crit.low}<br/>
            <span style={{ color: '#F87171' }}>割高：</span>{crit.high}<br/>
            <span style={{ color: '#64748b' }}>{crit.note}</span>
            {crit.basis && (
              <>
                <br/>
                <span style={{ color: '#475569', fontSize: '9px' }}>
                  参考：{crit.basis}
                </span>
              </>
            )}
            {dynamicBasis && (
              <>
                <br/>
                <span style={{ color: '#38BDF8', fontSize: '9px', fontWeight: '600' }}>
                  実値：{dynamicBasis}
                </span>
              </>
            )}
            {crit.industryAvg != null && value != null && (() => {
              const numVal = parseFloat(value);
              if (isNaN(numVal)) return null;
              const diff = ((numVal - crit.industryAvg) / crit.industryAvg * 100).toFixed(0);
              const isAbove = numVal > crit.industryAvg;
              const color = isAbove ? '#F87171' : '#10B981';
              return (
                <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #334155' }}>
                  <span style={{
                    fontSize: '10px', fontWeight: '700',
                    color: color,
                    background: `${color}22`,
                    padding: '2px 6px', borderRadius: '3px',
                  }}>
                    IT平均比 {isAbove ? '+' : ''}{diff}%
                  </span>
                  <span style={{ fontSize: '9px', color: '#64748b', marginLeft: '4px' }}>
                    (平均 {crit.industryAvg}x)
                  </span>
                </div>
              );
            })()}
            {/* Beat/Miss 判定との切り分け注記 */}
            <div style={{
              marginTop: '6px', paddingTop: '6px',
              borderTop: '1px solid #334155',
              fontSize: '9px', color: '#64748b', lineHeight: 1.5,
            }}>
              ※ バリュエーションはアナリスト予想との Beat/Miss 判定とは別軸の評価です。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dividend yield card with hover tooltip ─────────────────────────────────
function DividendCard({ dividend }) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      style={{
        flex: '1 1 72px', borderRadius: '8px',
        border: '1px solid var(--border)', padding: '10px 8px',
        textAlign: 'center', background: 'var(--bg-subtle)',
        position: 'relative', cursor: 'help',
      }}
    >
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
        配当利回り
        <span style={{
          marginLeft: '4px',
          fontSize: '11px',
          color: '#38BDF8',
          opacity: 0.8,
          fontWeight: '600',
          cursor: 'help',
        }}>ⓘ</span>
      </div>
      <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px', fontVariantNumeric: 'tabular-nums' }}>
        {dividend.yield}%
      </div>
      {dividend.buyback && (
        // v153 aman: emoji 🔄 → lucide RefreshCw (icon_brand_consistency: Aman 級品格、 emoji 禁止)
        <div style={{ fontSize: '10px', color: '#38BDF8', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <RefreshCw size={10} strokeWidth={2.2} aria-hidden="true" />自社株買い
        </div>
      )}
      {showTip && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '6px', zIndex: 10,
          background: '#1e293b', border: '1px solid #334155',
          borderRadius: '8px', padding: '8px 10px',
          width: '160px', textAlign: 'left',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: '#38BDF8', marginBottom: '4px' }}>
            配当利回り
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: 1.6 }}>
            <span style={{ color: '#10B981' }}>高め：</span>3%以上<br/>
            <span style={{ color: '#F87171' }}>低め：</span>0.5%未満<br/>
            <span style={{ color: '#64748b' }}>株価÷年間配当額。高配当≠割安に注意。</span>
            {dividend.buyback && (
              <>
                <br/>
                <span style={{ color: '#38BDF8' }}>自社株買いと合算した株主還元利回りも確認推奨。</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Accordion header ─────────────────────────────────────────────────────────
function AccordionHeader({ label, isOpen, onToggle }) {
  return (
    <div
      onClick={onToggle}
      onMouseEnter={e => {
        e.currentTarget.style.backgroundColor = 'rgba(56,189,248,0.08)';
        e.currentTarget.style.borderColor = 'rgba(56,189,248,0.40)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.backgroundColor = 'var(--bg-subtle)';
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
      style={{
        cursor: 'pointer',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '9px 14px',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        background: 'var(--bg-subtle)',
        marginBottom: isOpen ? '8px' : '0',
        transition: 'background-color 0.15s, border-color 0.15s',
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)' }}>
        {label}
      </span>
      <ChevronDown
        size={14}
        aria-hidden
        style={{
          color: 'var(--text-muted)',
          transition: 'transform 0.2s',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
        }}
      />
    </div>
  );
}

export default function DiagramCard({
  data: rawData, ticker, onDownload, onYearsChange, selectedYears = 3,
  showCoach = false,         // R2v3: 年セレクター直上の吹き出し表示 ON/OFF（HomeTab 制御・初回のみ）
  onSelectorVisible,         // R2v2: 年セレクターが80%可視になった時に1度だけ呼ばれる
  vibe = DEFAULT_VIBE,       // v155: 既定=案A (serif見出し+ゆとり余白)。 preview のみ各案を明示的に上書き
  guidance = null,           // B7 第一手: essence hero の今期 Beat/Miss 用 (既存 guidance verdict mirror、未渡し時は判定材料待ち)
}) {
  // handover v82 Phase 4.5: frontend BLOCKLIST sanitize 適用 (BAD-5 / BAD-6 表示前削除)。
  // NEGATIVE_EXAMPLES + few-shot で 87.5% 抑制、 残 12.5% を frontend で sentence 単位削除。
  // memory: feedback_diagram_quality_guard.md
  const data = useMemo(() => {
    if (!rawData) return null;
    const sanitized = sanitizeDiagramData(rawData);
    if (sanitized?._sanitized) {
      // log only — Phase 5+ で Sentry breadcrumb 送信予定
      const hits = findBlocklistHits(JSON.stringify(rawData));
      if (hits.length > 0 && typeof console !== 'undefined') {
        console.warn('[DiagramCard] sanitized blocklist hits:', hits.slice(0, 8));
      }
    }
    return sanitized;
  }, [rawData]);

  // Sprint 4 案8: prefers-reduced-motion チェック (stagger variants の initial を 'visible' に切替)
  const reduce = useReducedMotion();

  // handover v82 Phase 5.5: ConditionRow click → 該当 condition + step を pulse highlight。
  // selector subscribe (primitive shallow、 不要 re-render 回避)、 timer は useEffect 内で
  // 2800ms auto-unset (Web 設計 + 開発 reviewer 一致 verdict)。
  const pulsingConditionIndex = useWorkspaceStore((s) => s.pulsingConditionIndex);
  const setPulsingConditionIndex = useWorkspaceStore((s) => s.setPulsingConditionIndex);
  const [toastMessage, setToastMessage] = useState(null);

  useEffect(() => {
    if (pulsingConditionIndex == null) return undefined;
    // condition 4 (営業利益増、 sentinel 'all_steps') は全 step 該当 → toast fallback
    if (pulsingConditionIndex === 'all_steps') {
      setToastMessage('営業利益増は全工程に影響します');
    }
    // mobile auto-scroll (≤768px、 マーケ verdict、 視覚連携切断防止)
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      const diagramEl = document.getElementById('sec-diagram');
      if (diagramEl) {
        smoothScrollToElement(diagramEl, { offset: 72 });
      }
    }
    // 2800ms 後 auto-unset (UI/UX cadence 1.8s × 1.5 周期)。
    // 連続 click で [pulsingConditionIndex] 変わると cleanup で前 timer 自動 cancel。
    const t = setTimeout(() => setPulsingConditionIndex(null), 2800);
    return () => clearTimeout(t);
  }, [pulsingConditionIndex, setPulsingConditionIndex]);

  if (!data) return null;

  const isGenerating = data?._phase === 'instant';  // Phase1中（narrative生成待ち）

  // R4: verdict が 'unknown' / 未設定 + overallPass も無い場合は「判定不可」扱い
  const isVerdictUnknown = data.verdict === 'unknown'
    || (data.verdict == null && data.overallPass == null);

  const passColor = isVerdictUnknown
    ? '#94a3b8'
    : (data.overallPass ? '#22c55e' : '#ef4444');
  const passBg = isVerdictUnknown
    ? 'rgba(148,163,184,0.08)'
    : (data.overallPass ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)');

  const steps     = data.businessFlowSteps || [];
  const trends    = data.trends            || [];
  const strengths = data.strengths         || [];

  // v130 P0 #1 → v132 P0-A: LLM 出力で passCount/totalCount/conditions が全て欠落するケース
  // (NVDA dogfood 5/30) でも button を hide せず「5 条件 詳細」+ chevron default label で常に表示。
  // user dogfood: 完全 hide はバッジ自体消失で「分析されていない」 と誤読される、
  // default label で「click すれば見れる」 と user に約束する。
  const effectivePassCount = Number.isFinite(data.passCount)
    ? data.passCount
    : (Array.isArray(data.conditions) ? data.conditions.filter(c => c?.pass).length : null);
  const effectiveTotalCount = Number.isFinite(data.totalCount)
    ? data.totalCount
    : (Array.isArray(data.conditions) && data.conditions.length > 0 ? data.conditions.length : 5);
  const showConditionsButton = true; // 常に表示
  const risks     = data.risks             || [];
  const bullCase  = data.bullCase          || [];
  const bearCase  = data.bearCase          || [];
  const valuation = data.valuation         || null;
  // v127: 投資家への問いを「角度タグ付き 2-3 問」配列で render。
  // 新 schema = investorQuestions: [{angle, question}]。stale cache / 旧 response 互換のため、
  // 配列が無く単一文字列 investorQuestion だけある場合は 1 件配列に正規化する。
  const investorQuestions = (() => {
    const arr = data.investorQuestions;
    if (Array.isArray(arr) && arr.length > 0) {
      return arr
        .map((q) => (typeof q === 'string' ? { angle: '', question: q } : q))
        .filter((q) => q && typeof q.question === 'string' && q.question.trim());
    }
    if (typeof data.investorQuestion === 'string' && data.investorQuestion.trim()) {
      return [{ angle: '', question: data.investorQuestion }];
    }
    return [];
  })();
  const dividend  = data.dividend          || null;

  // handover v82 Phase 5.5: pulsingConditionIndex に応じて該当 step に pulse 適用。
  // condition 4 (sentinel 'all_steps') は toast fallback で個別 pulse なし。
  const isStepPulsing = (stepIdx) => {
    if (pulsingConditionIndex == null) return false;
    if (pulsingConditionIndex === 'all_steps') return false; // toast fallback
    return isStepPulsingForCondition(stepIdx, pulsingConditionIndex, steps.length);
  };

  // Build flow items as a flat array so keys work cleanly
  const flowItems = steps.flatMap((step, i) => {
    const items = [<FlowBox key={`box-${i}`} step={step} stepIndex={i} isPulsing={isStepPulsing(i)} />];
    if (i < steps.length - 1) {
      items.push(
        <span key={`arrow-${i}`} style={{ color: '#94a3b8', fontSize: '20px', lineHeight: 1, flexShrink: 0 }}>→</span>
      );
    }
    return items;
  });

  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 480
  );
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 480);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // デザインレビュー (4体合議 2026-06-03): 核心データはデフォルト展開で「click 不要」(user 指摘3)。
  // strengths(強み・リスク)=展開。 bullbear(ブル・ベア) も v158 で default 展開に統一。
  // 3体合議 3/3 (2026-06-03): 隣接する同型 accordion の非対称は「壊れてる/見なくていい」 誤シグナル
  // + 認知コスト。 かつ 強み・リスク=事実ベース / ブル・ベア=投資判断の枠組み で内容は冗長でなく別物
  // (旧コメントの「冗長だから畳む」 前提が弱い)。 CLS はむしろ改善方向。
  const [openSections, setOpenSections] = useState({ strengths: true, bullbear: true });
  const toggleSection = (key) =>
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  // じっちゃま5条件 = 図解の主役データ → デフォルト展開 (HERO FAIL バッジ直下、 2秒原則)。 toggle は残す。
  const [showConditions, setShowConditions] = useState(true);
  const [showUnknownTip, setShowUnknownTip] = useState(false);  // R4: 判定不可バッジのツールチップ
  // B7 第二手 (C 累進開示): essence flag ON 時、下層 (成長ストーリー以降) を「詳しく見る」で畳む。
  // default 閉 (初心者は L1 essence + L2 ビジネスモデルで 2 秒理解、上級者は展開で深掘り)。flag OFF では無効。
  const [l3Open, setL3Open] = useState(false);
  // 「詳しく見る」累進開示 (下層 L3 を畳む) の有効判定。flag ?diagram_essence=1、default OFF・可逆。
  // 1 度だけ評価 (render 毎の localStorage 重複読み解消)。非 equity (指数/ETF/為替) は従来のフラット表示。
  const l3Enabled = useMemo(() => isDiagramEssence() && !isNonEquityTicker(ticker), [ticker]);

  // R3拡張: アコーディオン展開時の共通フェードインスタイル
  // 各アイテムを 40ms ずつスタガードして 150ms かけて opacity 0→1 + Y 6→0
  const fadeInStyle = (index) => ({
    animation: 'condition-fade-in 150ms ease-out both',
    animationDelay: `${index * 40}ms`,
  });

  // ── 年切替時のフラッシュ演出（300ms シアン outline）
  const [flashTrigger, setFlashTrigger] = useState(0);
  const flashRef = useRef(null);
  useEffect(() => {
    if (flashTrigger === 0) return;
    const el = flashRef.current;
    if (!el) return;
    el.classList.remove('section-flash');
    // reflow を強制してアニメーションを再起動
    void el.offsetWidth;
    el.classList.add('section-flash');
    const tid = setTimeout(() => {
      if (flashRef.current) flashRef.current.classList.remove('section-flash');
    }, 350);
    return () => clearTimeout(tid);
  }, [flashTrigger]);

  // R2v2: 年セレクターが80%可視になったら一度だけ onSelectorVisible を呼ぶ
  const selectorRef = useRef(null);
  const observerFiredRef = useRef(false);
  useEffect(() => {
    if (!onSelectorVisible) return;
    const el = selectorRef.current;
    if (!el) return;
    if (observerFiredRef.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      // フォールバック（古環境）：即座に発火
      observerFiredRef.current = true;
      onSelectorVisible();
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !observerFiredRef.current) {
          observerFiredRef.current = true;
          onSelectorVisible();
          observer.disconnect();
        }
      },
      { threshold: 0.8 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onSelectorVisible]);

  // R2v2: アクティブボタンのスケールパルス（手動・自動どちらでも発火）
  const [pulseY, setPulseY] = useState(null);
  useEffect(() => {
    if (selectedYears == null) return;
    setPulseY(selectedYears);
    const t = setTimeout(() => setPulseY(null), 240);
    return () => clearTimeout(t);
  }, [selectedYears]);

  const handleYearsChange = (y) => {
    onYearsChange?.(y);
    setFlashTrigger(k => k + 1);
    // 手動クリックで現状と同じ年を押した場合も視覚フィードバックを出すため、
    // 強制的に pulseY を再セット（useEffect は selectedYears 変化のみ追うので）
    setPulseY(null);
    requestAnimationFrame(() => setPulseY(y));
    setTimeout(() => setPulseY(null), 240);
  };

  return (
    // v154: vibe (デザイン提案切替) を context で配下の VizSectionLabel / headline に供給。 default = 現状不変。
    <VibeContext.Provider value={vibe}>
    {/* v125 P4-1: data-testid="diagram-card-wrapper" を outer wrapper に追加。
        既存 diagram-section-* testid (内部 7 section) は変更なし、 outer は単独 QA selector 用。 */}
    <div
      data-testid="diagram-card-wrapper"
      style={{
        position: 'relative',
        borderRadius: '12px', border: '1px solid var(--border)',
        background: 'var(--bg-primary)', marginTop: '16px', overflow: 'hidden',
      }}
    >
      {/* スケルトンアニメーション定義（shimmer） */}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        @keyframes fade-in-narrative {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .skeleton {
          background: linear-gradient(
            90deg,
            rgba(148,163,184,0.08) 0%,
            rgba(148,163,184,0.18) 40%,
            rgba(148,163,184,0.08) 80%
          );
          background-size: 800px 100%;
          animation: shimmer 1.6s ease-in-out infinite;
          border-radius: 6px;
        }
        .narrative-appear {
          animation: fade-in-narrative 0.5s ease-out;
        }
        @keyframes section-flash {
          0%   { outline: 2px solid #38BDF8; outline-offset: 4px; }
          100% { outline: 2px solid transparent; outline-offset: 4px; }
        }
        .section-flash {
          animation: section-flash 320ms ease-out;
          border-radius: 8px;
        }
        /* B7 第二手 (C 累進開示): 下層 L3 を「詳しく見る」で畳む。grid 0fr/1fr で高さを滑らかにアニメ
           (user feedback ③、display:none の瞬間消えを解消)。flag OFF では本 class は付かない (従来通り)。 */
        .diagram-l3-anim {
          display: grid;
          grid-template-rows: 1fr;
          transition: grid-template-rows 0.34s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .diagram-l3-anim.is-collapsed { grid-template-rows: 0fr; }
        .diagram-l3-anim-inner { overflow: hidden; min-height: 0; }
        @media (prefers-reduced-motion: reduce) {
          .diagram-l3-anim { transition: none; }
        }
        @keyframes btn-pulse {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.18); }
          100% { transform: scale(1); }
        }
        .btn-pulse {
          animation: btn-pulse 220ms ease-out;
        }
        @keyframes hint-fade {
          0%   { opacity: 0; }
          15%  { opacity: 1; }
          70%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes coach-fade-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes condition-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 10px', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
            ビジュアル分析
          </span>
          {/* SAMPLE バッジ（デモデータ時のみ）— ヘッダー左内のインラインバッジ */}
          {data._isDemo && (
            <span
              aria-hidden="true"
              style={{
                background: 'rgba(148,163,184,0.15)',
                border: '1px solid #475569',
                fontSize: '10px',
                fontWeight: 700,
                color: '#94a3b8',
                padding: '1px 6px',
                borderRadius: '4px',
                letterSpacing: '0.05em',
                lineHeight: 1.4,
              }}
            >
              SAMPLE
            </span>
          )}
        </div>
        {/* レンジセレクターは Growth Story セクション直上に移動した */}
        {onDownload && (
          <button
            onClick={onDownload}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(56,189,248,0.08)';
              e.currentTarget.style.borderColor = '#38BDF8';
              e.currentTarget.style.color = '#38BDF8';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '5px 10px', borderRadius: '6px',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600',
              cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            SVG保存
          </button>
        )}
      </div>

      <div style={{ padding: '4px 16px 20px' }}>

        {/* ── Section 1: Headline (story) ── */}
        <div
          data-testid="diagram-section-story"
          style={{
            position: 'relative',
            margin: '16px 0 4px', padding: '18px 20px',
            borderRadius: '10px', background: passBg, textAlign: 'center',
          }}
        >
          {/* X (Twitter) シェアボタン — narrative 完成後のみ表示 */}
          {!isGenerating && data.headline && (
            <button
              onClick={() => {
                const decision = isVerdictUnknown
                  ? 'UNKNOWN'
                  : (data.overallPass ? 'PASS' : 'FAIL');
                const url = `https://beatscanner-production.up.railway.app/?t=${ticker}`;
                const text =
                  `$${ticker}「${data.headline}」\n` +
                  `decision: ${decision}\n` +
                  `${url}\n` +
                  `#beatscanner`;
                const intentUrl =
                  `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
                window.open(intentUrl, '_blank', 'noopener,noreferrer');
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#1f1f1f'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#000'; }}
              title="X(Twitter)でシェア"
              aria-label="X(Twitter)でシェア"
              style={{
                position: 'absolute', top: '10px', right: '10px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '30px', height: '30px',
                borderRadius: '6px',
                background: '#000', color: '#fff',
                border: 'none', cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </button>
          )}
          {(data.companyName || data.period) && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
              {data.companyName && data.period
                ? `${data.companyName} · ${data.period}`
                : (data.companyName || data.period)}
            </div>
          )}
          {isGenerating ? (
            <div className="skeleton" style={{ height: '28px', width: '55%', margin: '0 auto 12px' }} />
          ) : (
            // v138.6 Bug 1 Fix 1-C: LLM が「データ不足」「判定不可」 等 fallback 文言を返した場合は
            // headline を suppress。 5 条件判定は aggregator が独占 (Fix 1-A/B)、 LLM の「データ不足」
            // 文言は 5 条件カード (4/5) と食い違う UX を生む。 backend で suppress すべきだが、 stale cache
            // 対応で frontend にも guard を入れる。 「キャッチコピー」 でなく状況説明文字列は suppress。
            data.headline && !isFallbackHeadline(data.headline) && (
              <div className="narrative-appear" style={{
                // v154 vibe: serif 案では headline を Noto Serif JP + やや大きく (editorial hero)。 default 不変。
                fontSize: vibe.headingFont === 'serif' ? 'clamp(20px, 5.5vw, 32px)' : 'clamp(18px, 5vw, 28px)',
                fontWeight: vibe.headingFont === 'serif' ? 700 : 600,
                fontFamily: vibeHeadingFont(vibe),
                letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
                lineHeight: 1.25,
                marginBottom: '8px',
              }}>
                {data.headline}
              </div>
            )
          )}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            {isVerdictUnknown ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <span
                  onMouseEnter={() => setShowUnknownTip(true)}
                  onMouseLeave={() => setShowUnknownTip(false)}
                  onClick={() => setShowUnknownTip(v => !v)}
                  style={{
                    background: '#4b5563', color: '#d1d5db',
                    fontSize: '13px', fontWeight: '800',
                    padding: '3px 10px', borderRadius: '6px',
                    cursor: 'help', userSelect: 'none',
                  }}
                >
                  推定値なし
                </span>
                {showUnknownTip && (
                  <div
                    role="tooltip"
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 8px)',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: '#0f172a',
                      color: '#f1f5f9',
                      fontSize: '12px',
                      lineHeight: 1.6,
                      padding: '8px 12px',
                      borderRadius: '8px',
                      whiteSpace: 'nowrap',
                      zIndex: 10,
                      boxShadow: '0 4px 12px rgba(15,23,42,0.30)',
                      pointerEvents: 'none',
                      textAlign: 'left',
                    }}
                  >
                    アナリスト予想データが取得できないため<br />
                    Beat / Miss の判定ができません。<br />
                    <span style={{ color: 'var(--text-muted)' }}>
                      順次データ拡充予定です。
                    </span>
                    {/* 下向き三角 */}
                    <div style={{
                      position: 'absolute',
                      bottom: '-6px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 0,
                      height: 0,
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderTop: '6px solid #0f172a',
                    }} />
                  </div>
                )}
              </div>
            ) : (
              <span style={{
                fontSize: '13px', fontWeight: '800', color: passColor,
                background: `${passColor}1a`, borderRadius: '6px', padding: '3px 10px',
              }}>
                {data.overallPass ? 'PASS' : 'FAIL'}
              </span>
            )}
            {showConditionsButton && (
              <button
                onClick={() => setShowConditions(v => !v)}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = 'rgba(56,189,248,0.15)';
                  e.currentTarget.style.borderColor = '#38BDF8';
                  e.currentTarget.style.color = '#38BDF8';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'rgba(56,189,248,0.08)';
                  e.currentTarget.style.borderColor = 'rgba(56,189,248,0.40)';
                  e.currentTarget.style.color = '#38BDF8';
                }}
                style={{
                  background: 'rgba(56,189,248,0.08)',
                  border: '1px solid rgba(56,189,248,0.40)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  padding: '3px 10px',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#38BDF8',
                  transition: 'background-color 0.15s, border-color 0.15s',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {effectivePassCount != null
                  ? `${effectivePassCount}/${effectiveTotalCount} 条件クリア`
                  : `${effectiveTotalCount} 条件 詳細`}
                <ChevronDown
                  size={12}
                  aria-hidden
                  style={{
                    transition: 'transform 0.2s',
                    transform: showConditions ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              </button>
            )}
          </div>

          {/* ── 条件一覧の展開 ── */}
          {showConditions && data.conditions?.length > 0 && (
            <div style={{
              marginTop: '10px', textAlign: 'left',
              background: 'var(--bg-primary)', borderRadius: '8px',
              border: '1px solid var(--border)', padding: '10px 12px',
            }}>
              {data.conditions.map((c, i) => (
                <div
                  key={`cond-${showConditions}-${i}`}
                  className="diagram-condition"
                  data-condition-index={i}
                  data-pulsing={pulsingConditionIndex === i ? 'true' : undefined}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '8px',
                    fontSize: '12px', color: 'var(--text-primary)',
                    lineHeight: 1.6, marginBottom: i < data.conditions.length - 1 ? '6px' : 0,
                    position: 'relative',
                    ...fadeInStyle(i),
                  }}
                >
                  {/* v132 P0-E (user dogfood 5/30): emoji ✅❌ → lucide CheckCircle2/XCircle で
                      [[feedback-icon-brand-consistency]] Aman 級品格遵守、 全 OS で一貫レンダリング。 */}
                  <span aria-hidden="true" style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', lineHeight: 1.4 }}>
                    {c.pass
                      ? <CheckCircle2 size={14} strokeWidth={2.2} color="var(--color-gain)" />
                      : <XCircle size={14} strokeWidth={2.2} color="var(--color-loss)" />}
                  </span>
                  <span>
                    <span style={{ fontWeight: 600 }}>{c.name || c.label}</span>
                    {c.detail && (
                      <>
                        <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>:</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                          {c.detail}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {isGenerating ? (
            <div className="skeleton" style={{ height: '12px', width: '75%', margin: '8px auto 0' }} />
          ) : (
            data.summary && (
              // v153 模範解答化: headline 直下の summary を「サブタイトル」格に格上げ
              // (12px/secondary → 14px/primary/500 + 中央カラム)、 hero の「宙に浮く」 感を解消。
              <div className="narrative-appear" style={{
                fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500,
                lineHeight: 1.55, maxWidth: '480px', margin: '10px auto 0', padding: '0 8px',
              }}>
                {data.summary}
              </div>
            )
          )}
        </div>

        {/* ── Section 3: Business Model ── */}
        {isGenerating ? (
          <div data-testid="diagram-section-business-flow">
            <VizSectionLabel text="ビジネスモデル" icon={Layers} sub="この企業がどこで稼いでいるかの全体像" />
            <div style={{
              display: 'flex', gap: '8px', padding: '14px 12px',
              background: 'var(--bg-subtle)', borderRadius: '8px',
              alignItems: 'center', overflowX: 'auto',
            }}>
              {[120, 100, 110, 105].flatMap((w, i) => {
                const items = [
                  <div key={`box-${i}`} className="skeleton" style={{
                    width: `${w}px`, height: '72px',
                    borderRadius: '10px', flexShrink: 0,
                  }} />
                ];
                if (i < 3) {
                  items.push(
                    <span key={`arr-${i}`} style={{ color: 'rgba(148,163,184,0.2)', fontSize: '18px', flexShrink: 0 }}>→</span>
                  );
                }
                return items;
              })}
            </div>
          </div>
        ) : flowItems.length > 0 ? (
          <div className="narrative-appear" data-testid="diagram-section-business-flow">
            <VizSectionLabel text="ビジネスモデル" icon={Layers} sub="この企業がどこで稼いでいるかの全体像" />
            {isMobile && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                ← スクロールして全体を確認
              </div>
            )}
            <div style={{
              overflowX: 'auto', WebkitOverflowScrolling: 'touch',
              borderRadius: '8px', background: 'var(--bg-subtle)', padding: '14px 12px',
            }}>
              {/* Sprint 4 案8: step reveal — expanded 時 7 要素 80ms stagger fade-in
                  MotionProvider で LazyMotion scope を self-contained に wrap
                  (DiagramCard は HomeTab / DetailReport など複数 context から呼ばれるため)
                  m.div variants="STEP_CONTAINER_VARIANTS" で staggerChildren 制御 */}
              <MotionProvider>
                <m.div
                  variants={STEP_CONTAINER_VARIANTS}
                  // prefers-reduced-motion: reduce なら 'visible' で即表示 (stagger skip)
                  initial={reduce ? 'visible' : 'hidden'}
                  animate="visible"
                  style={{
                    display: 'flex', alignItems: 'center', flexWrap: 'nowrap',
                    gap: '8px', width: 'fit-content', margin: '0 auto',
                  }}
                >
                  {flowItems}
                </m.div>
              </MotionProvider>
            </div>
          </div>
        ) : (
          /* businessFlowSteps なし — empty state */
          <div
            data-testid="diagram-section-business-flow"
            style={{
              marginTop: '16px', padding: '10px 14px',
              borderRadius: '8px',
              border: '1px dashed var(--border)',
              background: 'var(--bg-subtle)',
              fontSize: '12px', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <Building2 size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />
            <span>事業フローを精査しています</span>
          </div>
        )}

        {/* v153 模範解答化: NarrativeBridge (因果の接続)。 下の section に content がある時のみ表示。 */}
        {!isGenerating && data.segmentSummary?.segments?.length > 0 && (
          <NarrativeBridge text="ではどの事業が今期を牽引したか" isMobile={isMobile} />
        )}

        {/* ── Section 3.5: セグメント別売上 ── */}
        {data.segmentSummary?.segments?.length > 0 && (
          <>
            <VizSectionLabel text="セグメント別売上" icon={PieChart} sub="今期を牽引した事業の構成" />
            <div style={{
              fontSize: '10px', color: 'var(--text-muted)',
              marginBottom: '8px',
            }}>
              直近四半期 {data.segmentSummary.date} ／ 前年同期比
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {data.segmentSummary.segments.map((seg, i) => (
                <SegmentBar key={i} seg={seg} />
              ))}
            </div>
          </>
        )}

        {/* ── B7 第二手 (C 累進開示): ここから下層 L3 を「詳しく見る」で畳む (essence flag ON 時のみ) ──
            toggle は .diagram-l3-toggle (図解生成ボタンと同 idiom: hover lift + glow + :active press)。 */}
        {l3Enabled && (
          <button
            type="button"
            onClick={() => setL3Open((v) => !v)}
            aria-expanded={l3Open}
            aria-controls="diagram-l3-group"
            data-testid="diagram-l3-toggle"
            className="diagram-l3-toggle"
          >
            <Layers size={16} strokeWidth={2} aria-hidden="true" />
            <span className="diagram-l3-toggle__text">
              <span className="diagram-l3-toggle__title">{l3Open ? '閉じる' : '詳しく見る'}</span>
              {!l3Open && <span className="diagram-l3-toggle__sub">成長トレンド・アナリスト予想・強み / リスク など</span>}
            </span>
            <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className="diagram-l3-toggle__chev" />
          </button>
        )}
        {/* L3 group: grid 0fr/1fr で滑らかに展開 (user feedback ③)。flag OFF では class なし = 従来通り。
            id="diagram-l3-group" は toggle の aria-controls 対象 (3体監査 P1 a11y)。 */}
        <div id="diagram-l3-group" data-testid="diagram-l3-group" className={l3Enabled ? `diagram-l3-anim${l3Open ? '' : ' is-collapsed'}` : undefined}>
        <div className={l3Enabled ? 'diagram-l3-anim-inner' : undefined}>

        {!isGenerating && trends.length > 0 && (
          <NarrativeBridge text="数年の推移で全体像を見ると" isMobile={isMobile} />
        )}

        {/* ── Section 4: Growth Story (yearly) ── */}
        {trends.length > 0 ? (
          <div ref={flashRef} data-testid="diagram-section-yearly">
            {/* user 指摘2: 見出し (hairline) を期間トグルの前に置き、 ガイダンスと本 section を明確に分離。
                旧構造はトグルがガイダンス直下に浮き、 hairline がトグルの下に来ていた (所属が曖昧)。 */}
            <VizSectionLabel text="数字で見る成長ストーリー" icon={TrendingUp} sub="売上・利益・キャッシュフローの数年の推移" />
            {/* レンジセレクター（見出し直下：操作と結果を視覚的に近接させる）*/}
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', flexWrap: 'wrap',
              gap: '8px', marginTop: '4px', marginBottom: '6px',
            }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                fontSize: '11px', color: 'var(--text-muted)',
                fontWeight: 600, letterSpacing: '0.02em',
              }}>
                <Calendar size={12} strokeWidth={2} aria-hidden="true" />
                表示期間
              </div>
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'flex-end', gap: '2px',
              }}>
                {/* R2v3: コーチマーク（初回ユーザーのみ・ボタン直上に吹き出し）*/}
                {showCoach && (
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'relative',
                      marginBottom: '8px',
                      display: 'flex',
                      justifyContent: 'center',
                      animation: 'coach-fade-in 0.3s ease forwards',
                      pointerEvents: 'none',
                    }}
                  >
                    <div style={{
                      background: '#0f172a',
                      color: '#f1f5f9',
                      fontSize: '12px',
                      lineHeight: 1.6,
                      padding: '8px 14px',
                      borderRadius: '8px',
                      whiteSpace: 'nowrap',
                      position: 'relative',
                      boxShadow: '0 4px 12px rgba(15,23,42,0.30)',
                    }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Calendar size={12} strokeWidth={2} aria-hidden="true" />
                        期間を切り替えると、 グラフが連動して変わります
                      </span>
                      {/* 下向き三角 */}
                      <div style={{
                        position: 'absolute',
                        bottom: '-6px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 0,
                        height: 0,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderTop: '6px solid #0f172a',
                      }} />
                    </div>
                  </div>
                )}
                <div
                  ref={selectorRef}
                  style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
                >
                  {[1, 3, 5].map(y => (
                  <button
                    key={y}
                    className={pulseY === y ? 'btn-pulse' : undefined}
                    onClick={() => handleYearsChange(y)}
                    onMouseEnter={e => {
                      if (selectedYears !== y) {
                        e.currentTarget.style.borderColor = 'rgba(56,189,248,0.5)';
                        e.currentTarget.style.color = '#38BDF8';
                      }
                    }}
                    onMouseLeave={e => {
                      if (selectedYears !== y) {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.color = 'var(--text-muted)';
                      }
                    }}
                    style={{
                      padding: '3px 10px',
                      borderRadius: '5px',
                      border: selectedYears === y
                        ? '1px solid #38BDF8'
                        : '1px solid var(--border)',
                      background: selectedYears === y
                        ? 'rgba(56,189,248,0.15)'
                        : 'transparent',
                      color: selectedYears === y ? '#38BDF8' : 'var(--text-muted)',
                      fontSize: '12px', fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s, background-color 0.15s, color 0.15s',
                    }}
                  >
                    {y}Y
                  </button>
                  ))}
                </div>
              </div>
            </div>
            {data.partialPeriod && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 10px', marginBottom: '8px',
                borderRadius: '6px',
                background: 'rgba(239,159,39,0.10)',
                border: '1px solid rgba(239,159,39,0.30)',
                fontSize: '11px', color: '#854F0B',
              }}>
                <AlertTriangle size={14} strokeWidth={2} color="#854F0B" aria-hidden="true" />
                <span>
                  <strong>{data.partialPeriod.period}</strong> は通期未完了のため年次比較から除外しています
                  （{data.partialPeriod.note}）
                </span>
              </div>
            )}
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              <span style={{ color: '#10B981', fontWeight: '700' }}>↑BEAT</span>
              {' / '}
              <span style={{ color: '#ef4444', fontWeight: '700' }}>↓MISS</span>
              {' = Wall Street アナリスト予想比'}
              {data.consensusSource && (
                <span style={{
                  marginLeft: '6px', fontSize: '10px',
                  color: '#475569', background: 'rgba(71,85,105,0.15)',
                  padding: '1px 6px', borderRadius: '3px',
                }}>
                  Source: {data.consensusSource}
                </span>
              )}
            </div>
            {isMobile && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                ← スクロールして全体を確認
              </div>
            )}
            {selectedYears === 1 ? (
              /* ★ 1Y時はKPIカード表示（YoY%・前年値付き） */
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                {trends.slice(0, 4).map((trend, i) => {
                  const pts = trend.data || [];
                  const latest = pts[pts.length - 1];
                  const prev   = pts.length >= 2 ? pts[pts.length - 2] : null;
                  if (!latest) return null;

                  const yoy = (latest.value != null && prev?.value != null && prev.value !== 0)
                    ? ((latest.value - prev.value) / Math.abs(prev.value) * 100)
                    : null;
                  const yoyColor = yoy == null ? '#94a3b8' : yoy >= 0 ? '#10B981' : '#ef4444';
                  const beatColor = latest.beat === true ? '#10B981' : latest.beat === false ? '#ef4444' : null;

                  return (
                    <div key={i} style={{
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      padding: '14px 12px',
                      background: 'var(--bg-subtle)',
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: '600' }}>
                        {trend.metric || ''}
                        {trend.unit && <span style={{ fontSize: '9px', marginLeft: '3px' }}>({trend.unit})</span>}
                      </div>
                      {/* 主値 */}
                      <div style={{ fontSize: '24px', fontWeight: '800', color: '#38BDF8', marginBottom: '4px' }}>
                        {latest.value}
                      </div>
                      {/* YoY */}
                      {yoy != null && (
                        <div style={{ fontSize: '12px', fontWeight: '700', color: yoyColor, marginBottom: '4px' }}>
                          {yoy >= 0 ? '+' : ''}{yoy.toFixed(1)}% <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '400' }}>YoY</span>
                        </div>
                      )}
                      {/* 前年値 */}
                      {prev?.value != null && (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          前年: {prev.value}
                        </div>
                      )}
                      {/* Beat/Miss */}
                      {beatColor && latest.beatMargin != null && (
                        <div style={{ fontSize: '11px', fontWeight: '700', color: beatColor, marginTop: '4px' }}>
                          {latest.beat ? '↑BEAT' : '↓MISS'} {latest.beatMargin > 0 ? '+' : ''}{latest.beatMargin.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
              {trends.slice(0, 4).map((trend, i) => (
                <div key={i} style={{
                  borderRadius: '8px', border: '1px solid var(--border)',
                  padding: '12px 10px', background: 'var(--bg-subtle)',
                }}>
                  <div style={{
                    fontSize: '13px', fontWeight: '700', color: '#38BDF8',
                    marginBottom: '6px', textAlign: 'center',
                  }}>
                    {(() => {
                      const m = trend.metric || '';
                      const unit = trend.unit
                        || (m.includes('売上') ? '$B'
                          : m.includes('CFPS') ? '$'
                          : m.includes('EPS') ? '$'
                          : m.includes('営業CF') || m.includes('CF') ? '$B'
                          : null);
                      return (
                        <>
                          {m}
                          {unit && (
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px', fontWeight: '400' }}>
                              ({unit})
                            </span>
                          )}
                          {trend.epsType && (
                            <span style={{
                              fontSize: '9px', color: '#64748b', marginLeft: '4px',
                              background: 'rgba(100,116,139,0.15)', padding: '1px 5px', borderRadius: '3px',
                              fontWeight: '600',
                            }}>
                              {trend.epsType}
                            </span>
                          )}
                          {(trend.metric || '').includes('EPS') && !trend.epsType && (
                            <span style={{
                              fontSize: '9px', color: '#94a3b8', marginLeft: '4px',
                              background: 'rgba(148,163,184,0.12)', padding: '1px 5px', borderRadius: '3px',
                              fontWeight: '600',
                            }}>
                              Non-GAAP
                            </span>
                          )}
                          {(trend.metric || '').includes('EPS') && data.epsSourceNote === 'GAAP' && (
                            <span style={{
                              fontSize: '9px', color: '#854F0B',
                              background: 'rgba(239,159,39,0.15)',
                              padding: '1px 5px', borderRadius: '3px',
                              marginLeft: '4px', fontWeight: '600',
                            }}>
                              GAAP(yf)
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  {i === 0
                    ? <BarChartWithMargin trend={trend} operatingMargins={data.operatingMargins} />
                    : <BarChartPanel trend={trend} operatingMargins={null} />
                  }
                  {(trend.metric || '').includes('EPS') && (
                    <>
                      <div style={{
                        fontSize: '9px', color: '#64748b',
                        marginTop: '6px', textAlign: 'center',
                        lineHeight: 1.5,
                      }}>
                        ※ Non-GAAP EPS（SBC等を除く調整後）
                        <br />
                        GAAP EPSとは$1〜2/株程度乖離する場合があります
                      </div>

                      {/* ★ GAAP/Non-GAAP調整テーブル */}
                      {data.gaapAdjustment && (
                        <div style={{
                          marginTop: '10px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          overflow: 'hidden',
                          fontSize: '11px',
                        }}>
                          <div style={{
                            background: 'var(--bg-subtle)',
                            padding: '5px 10px',
                            fontWeight: '700',
                            color: 'var(--text-muted)',
                            borderBottom: '1px solid var(--border)',
                            fontSize: '10px',
                            letterSpacing: '0.3px',
                          }}>
                            GAAP / Non-GAAP 調整（直近四半期）
                            <span style={{
                              fontSize: '9px', color: 'var(--text-muted)',
                              marginLeft: '6px', fontWeight: '400',
                            }}>
                              ※ 年次EPSとは単位が異なります
                            </span>
                          </div>
                          {[
                            {
                              label: 'Non-GAAP EPS',
                              value: data.gaapAdjustment.nonGaapEps,
                              color: '#38BDF8',
                              prefix: '+',
                            },
                            {
                              label: 'SBC調整',
                              value: data.gaapAdjustment.sbcAdjustment,
                              color: '#ef4444',
                              prefix: '',
                            },
                            {
                              label: 'その他調整',
                              value: data.gaapAdjustment.otherAdjustment,
                              color: '#94a3b8',
                              prefix: '',
                            },
                            {
                              label: 'GAAP EPS',
                              value: data.gaapAdjustment.gaapEps,
                              color: 'var(--text-primary)',
                              prefix: '',
                            },
                          ]
                            .filter(row => row.value !== null && row.value !== undefined)
                            .map((row, idx, arr) => (
                              <div key={row.label} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '5px 10px',
                                borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none',
                              }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                  {row.label}
                                </span>
                                <span style={{ fontWeight: '700', color: row.color, fontSize: '12px' }}>
                                  {typeof row.value === 'number'
                                    ? `${row.value > 0 && row.prefix === '+' ? '+' : ''}$${Math.abs(row.value).toFixed(2)}`
                                    : row.value
                                  }
                                </span>
                              </div>
                            ))
                          }
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
            )}
          </div>
        ) : (
          /* trends なし — empty state (yearly) */
          <div
            data-testid="diagram-section-yearly"
            style={{
              marginTop: '16px', padding: '10px 14px',
              borderRadius: '8px',
              border: '1px dashed var(--border)',
              background: 'var(--bg-subtle)',
              fontSize: '12px', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            {/* v127: 汎用 emoji 📈 → lucide FileBarChart2 (icon brand consistency: Aman 級品格、 emoji 禁止) */}
            <FileBarChart2 size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />
            {/* v126 R13-1: 旧「決算データを集約しています」 (進行中表現) が user に「ロード中で止まっている」 と誤読される dogfood 5/29
                → 「決算データなし」 (empty state 明示) に変更。 backend response trends 配列が空 = 必要な決算データ未提供。 */}
            <span>決算データなし</span>
          </div>
        )}

        {/* v153 模範解答化: SectionConclusion (事実要約バー)。 backend data から JS 算数のみ、 LLM 非経由。 */}
        {!isGenerating && trends.length > 0 && (() => {
          const rev = trends.find(t => t.metric === '売上高') || trends[0];
          const pts = (rev?.data || []).filter(d => d.value != null);
          if (pts.length < 2) return null;
          const first = pts[0], last = pts[pts.length - 1];
          const unit = rev.unit || '';
          return <SectionConclusion text={`売上高は${first.period}の${first.value}${unit}から${last.period}の${last.value}${unit}へ推移`} />;
        })()}

        {/* v154 FMP③: 決算後株価反応 (成長ストーリーの下、 「決算は中身より反応を見ろ」) */}
        {!isGenerating && data.earningsReaction && (
          <EarningsReactionBar reaction={data.earningsReaction} />
        )}

        {/* ── Section 4.5: FCF・CapEx ── */}
        {/* データあり → 表示 / フラグだけある（false）→ N/A表示 / どちらもなし → 非表示 */}
        {(data.fcfTrend?.length > 0 || data.capexTrend?.length > 0 || data.fcfDataAvailable === false) ? (
          <div data-testid="diagram-section-fcf">
            <VizSectionLabel text="FCF・設備投資（CapEx）" icon={Banknote} sub="長期の競争力を左右する現金の使い道" />
            {!(data.fcfTrend?.length > 0 || data.capexTrend?.length > 0) ? (
              <div style={{
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-subtle)',
                fontSize: '12px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '4px',
              }}>
                <AlertTriangle size={14} strokeWidth={2} color="var(--text-muted)" aria-hidden="true" />
                <span>
                  FCF・CapExデータは現在準備中です
                </span>
              </div>
            ) : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
              {/* FCF */}
              {data.fcfTrend?.length > 0 && (
                <div style={{
                  flex: '1 1 140px', borderRadius: '8px',
                  border: '1px solid var(--border)', padding: '10px 12px',
                  background: 'var(--bg-subtle)',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#38BDF8', marginBottom: '6px' }}>
                    FCF <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: '400' }}>($B)</span>
                  </div>
                  {data.fcfTrend.map((d, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: '12px', color: 'var(--text-primary)',
                      padding: '2px 0',
                      borderBottom: i < data.fcfTrend.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {String(d.period).replace('FY', '')}
                      </span>
                      <span style={{ fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>${d.value}B</span>
                    </div>
                  ))}
                </div>
              )}
              {/* CapEx */}
              {data.capexTrend?.length > 0 && (
                <div style={{
                  flex: '1 1 140px', borderRadius: '8px',
                  border: '1px solid rgba(251,146,60,0.4)', padding: '10px 12px',
                  background: 'rgba(251,146,60,0.06)',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#fb923c', marginBottom: '6px' }}>
                    CapEx <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: '400' }}>($B・AIインフラ投資)</span>
                  </div>
                  {data.capexTrend.map((d, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: '12px', color: 'var(--text-primary)',
                      padding: '2px 0',
                      borderBottom: i < data.capexTrend.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {String(d.period).replace('FY', '')}
                      </span>
                      <span style={{ fontWeight: '700', color: '#fb923c', fontVariantNumeric: 'tabular-nums' }}>${d.value}B</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}
            {/* FCFマージン + FCF利回り（データ取得成功時のみ） */}
            {data.fcfTrend?.length > 0 && (() => {
              const latestFcf = data.fcfTrend[data.fcfTrend.length - 1]?.value;
              const latestRev = data.trends?.find(t => t.metric === '売上高')?.data?.slice(-1)[0]?.value;
              const fcfMargin = (latestFcf && latestRev)
                ? ((latestFcf / latestRev) * 100).toFixed(1)
                : null;
              const fcfYield = data.fcfYield;
              if (fcfMargin == null && fcfYield == null) return null;
              return (
                <div style={{
                  display: 'flex', gap: '16px', flexWrap: 'wrap',
                  fontSize: '11px', color: 'var(--text-muted)',
                  marginTop: '6px',
                }}>
                  {fcfMargin != null && (
                    <span>
                      FCFマージン（直近）：
                      <span style={{ color: '#38BDF8', fontWeight: '700' }}>{fcfMargin}%</span>
                    </span>
                  )}
                  {fcfYield != null && (
                    <span>
                      FCF利回り：
                      <span style={{ color: '#38BDF8', fontWeight: '700' }}>{fcfYield}%</span>
                      <span style={{ fontSize: '10px', marginLeft: '3px', opacity: 0.6 }}>(FCF÷時価総額)</span>
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          /* fcf データなし — empty state */
          <div
            data-testid="diagram-section-fcf"
            style={{
              marginTop: '16px', padding: '10px 14px',
              borderRadius: '8px',
              border: '1px dashed var(--border)',
              background: 'var(--bg-subtle)',
              fontSize: '12px', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            {/* v127: 汎用 emoji 💵 → lucide Banknote (icon brand consistency: Aman 級品格、 emoji 禁止) */}
            <Banknote size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />
            {/* v126 R13-1: 旧「キャッシュフロー詳細を整理しています」 (進行中表現) → empty state 明示「FCF/CapEx データなし」 */}
            <span>FCF/CapEx データなし</span>
          </div>
        )}

        {/* v153 模範解答化: FCF 事実要約 + 株価への転換 bridge */}
        {!isGenerating && data.fcfTrend?.length > 0 && (() => {
          const latest = data.fcfTrend[data.fcfTrend.length - 1]?.value;
          const rev = data.trends?.find(t => t.metric === '売上高')?.data?.filter(d => d.value != null).slice(-1)[0]?.value;
          const margin = (latest != null && rev) ? ((latest / rev) * 100).toFixed(1) : null;
          let text = `直近FCFは$${latest}B`;
          if (margin) text += `、FCFマージンは${margin}%`;
          return <SectionConclusion text={text} />;
        })()}
        {!isGenerating && (valuation || dividend) && (
          <NarrativeBridge text="この稼ぐ力に対し、株価はどう評価されているか" isMobile={isMobile} />
        )}

        {/* ══ v153 Round 2-A: IA 順序入替 (事業理解→実績→株価→将来→論点→締め) ══
            バリュエーション(株価) / 資本政策(還元) / ガイダンス(将来) を 実績(成長+FCF) の
            「後ろ」 に移動。 旧位置 = 判定直後 / セグメント直後。 logic 不変、 JSX ブロック移動のみ。 */}

        {/* ── 株価: バリュエーション + 配当 (v153 で実績の後ろへ移動) ── */}
        {(valuation || dividend) ? (
          <div data-testid="diagram-section-valuation">
            {/* Sprint 3: Saga-like section divider */}
            <div style={{ height: '1px', background: 'var(--border)', marginTop: '20px', opacity: 0.5 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', letterSpacing: '0.5px', color: '#38BDF8' }}>
                バリュエーション
              </span>
              {valuation?.dataSource && (() => {
                const isFmp = valuation.dataSource === 'FMP TTM';
                return (
                  <span style={{
                    fontSize: '9px',
                    fontWeight: '600',
                    color: isFmp ? '#10b981' : '#94a3b8',
                    background: isFmp ? 'rgba(16,185,129,0.10)' : 'rgba(148,163,184,0.12)',
                    border: isFmp
                      ? '1px solid rgba(16,185,129,0.25)'
                      : '1px solid rgba(148,163,184,0.25)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    letterSpacing: '0.02em',
                  }}>
                    {isFmp ? 'FMP実データ' : 'LLM推定'}
                  </span>
                );
              })()}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {valuation && [
                { label: 'PER',       value: valuation.per,       judge: valuation.perJudge },
                { label: 'PBR',       value: valuation.pbr,       judge: valuation.pbrJudge },
                { label: 'PSR',       value: valuation.psr,       judge: valuation.psrJudge },
                { label: 'EV/EBITDA', value: valuation.evEbitda,  judge: valuation.evEbitdaJudge },
                {
                  label: 'PEG',
                  value: valuation.peg,
                  judge: valuation.pegJudge,
                  // PEG = PER ÷ EPS成長率 → 実数表示で算出根拠を明示
                  dynamicBasis: (valuation.per != null && valuation.peg)
                    ? `PER(${valuation.per}x) ÷ EPS成長率(${(valuation.per / valuation.peg).toFixed(1)}%)`
                    : null,
                },
              ].filter(item => item.value != null).map(item => (
                <ValuationCard key={item.label} {...item} />
              ))}
              {dividend?.yield != null && (
                <DividendCard dividend={dividend} />
              )}
            </div>
          </div>
        ) : (
          /* valuation データなし — empty state */
          <div
            data-testid="diagram-section-valuation"
            style={{
              marginTop: '16px', padding: '10px 14px',
              borderRadius: '8px',
              border: '1px dashed var(--border)',
              background: 'var(--bg-subtle)',
              fontSize: '12px', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <FileBarChart2 size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />
            <span>バリュエーション情報は次回開示でお届けします</span>
          </div>
        )}

        {/* v153 模範解答化: バリュエーション 事実要約 (数値のみ、 割高/割安 等の判断語は含めず §38-safe) */}
        {!isGenerating && valuation && (() => {
          const parts = [];
          if (valuation.per != null) parts.push(`PER ${valuation.per}倍`);
          if (valuation.peg != null) parts.push(`PEG ${valuation.peg}`);
          if (dividend?.yield != null) parts.push(`配当利回り ${dividend.yield}%`);
          if (parts.length === 0) return null;
          return <SectionConclusion text={parts.join(' ・ ')} />;
        })()}

        {/* ── 還元: 資本政策 (配当 + 自社株買い 実行額) v138 Phase 2C / v153 で株価の後ろへ ── */}
        {data.capitalReturnDataAvailable && (
          <div data-testid="diagram-section-capital-return" style={{ marginTop: '16px' }}>
            <CapitalReturnSection capitalReturn={data.capitalReturn} />
          </div>
        )}

        {/* ── 実績: ①13F 機関投資家の動き (Round 3-B、 資本政策の直後・将来ブロックの手前) ── */}
        {!isGenerating && data.institutionalOwnership && (
          <InstitutionalSection institutional={data.institutionalOwnership} />
        )}

        {/* ── 実績: ④ 経営陣の自社株買い (Round 3-B、 機関投資家の直後・買いがある時のみ) ── */}
        {!isGenerating && data.insiderBuys && (
          <InsiderBuysSection insider={data.insiderBuys} />
        )}

        {/* ── 将来: 次 Q ガイダンス (SEC 8-K LLM 抽出) v138 Phase 2D / v153 で還元の後ろへ ── */}
        {data.guidanceExtractedAvailable && (
          <div data-testid="diagram-section-guidance" style={{ marginTop: '16px' }}>
            <GuidanceSection guidance={data.guidanceExtracted} />
          </div>
        )}

        {/* ── 将来: アナリスト予想 (v154 FMP②、 会社見通し=ガイダンスの隣に市場見通しを置く) ── */}
        {!isGenerating && data.analystConsensus && (
          <AnalystConsensusSection analyst={data.analystConsensus} />
        )}

        {/* ── Section 5: Strengths / Risks ── */}
        {isGenerating ? (
          <div data-testid="diagram-section-strengths-risks">
            <VizSectionLabel text="強み・リスク対比" icon={Shield} sub="今回の決算で確認できた事実ベースの優位と懸念" />
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
              {[
                { color: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.15)', label: '強み',   widths: [85, 70, 78], dot: 'rgba(34,197,94,0.25)', text: 'rgba(34,197,94,0.5)' },
                { color: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.15)', label: 'リスク', widths: [80, 90, 65], dot: 'rgba(239,68,68,0.25)', text: 'rgba(239,68,68,0.5)' },
              ].map((side, si) => (
                <div key={si} style={{
                  borderRadius: '8px', padding: '12px',
                  background: side.color,
                  border: `1px solid ${side.border}`,
                }}>
                  <div style={{
                    fontSize: '11px', fontWeight: '700',
                    color: side.text, marginBottom: '10px',
                  }}>
                    {side.label}
                  </div>
                  {side.widths.map((w, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: '6px',
                      marginBottom: i < 2 ? '8px' : 0, alignItems: 'center',
                    }}>
                      <div style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: side.dot, flexShrink: 0,
                      }} />
                      <div className="skeleton" style={{ height: '11px', width: `${w}%`, flex: 1 }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (strengths.length > 0 || risks.length > 0) ? (
          <div className="narrative-appear" data-testid="diagram-section-strengths-risks">
            <VizSectionLabel text="強み・リスク対比" icon={Shield} sub="今回の決算で確認できた事実ベースの優位と懸念" />
            <AccordionHeader
              label={`強み ${strengths.length}件 / リスク ${risks.length}件`}
              isOpen={openSections.strengths}
              onToggle={() => toggleSection('strengths')}
            />
            {openSections.strengths && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '4px' }}>
                <div style={{
                  borderRadius: '8px', background: 'rgba(34,197,94,0.12)',
                  border: '1px solid rgba(34,197,94,0.30)', padding: '12px',
                }}>
                  {/* Round 2-D (handover v152): 見出しを Chip primitive の pill に統一 (chip_primitive_canonical)。 */}
                  <div style={{ marginBottom: '8px' }}>
                    <Chip variant="solid" size="xs" tone="gain" icon={<Shield size={11} strokeWidth={2.2} aria-hidden="true" />}>強み</Chip>
                  </div>
                  {strengths.map((s, i) => (
                    <div
                      key={`str-${openSections.strengths}-${i}`}
                      style={{
                        fontSize: '12px', color: 'var(--text-primary)',
                        lineHeight: 1.6, display: 'flex', gap: '5px',
                        ...fadeInStyle(i),
                      }}
                    >
                      <span style={{ color: '#22c55e', flexShrink: 0 }}>•</span>
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
                <div style={{
                  borderRadius: '8px', background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.30)', padding: '12px',
                }}>
                  <div style={{ marginBottom: '8px' }}>
                    <Chip variant="solid" size="xs" tone="loss" icon={<AlertTriangle size={11} strokeWidth={2.2} aria-hidden="true" />}>リスク</Chip>
                  </div>
                  {risks.map((r, i) => (
                    <div
                      key={`risk-${openSections.strengths}-${i}`}
                      style={{
                        fontSize: '12px', color: 'var(--text-primary)',
                        lineHeight: 1.6, display: 'flex', gap: '5px',
                        ...fadeInStyle(i),
                      }}
                    >
                      <span style={{ color: '#ef4444', flexShrink: 0 }}>•</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* strengths/risks なし — empty state */
          <div
            data-testid="diagram-section-strengths-risks"
            style={{
              marginTop: '16px', padding: '10px 14px',
              borderRadius: '8px',
              border: '1px dashed var(--border)',
              background: 'var(--bg-subtle)',
              fontSize: '12px', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <Scale size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />
            <span>強み・リスク要因を整理しています</span>
          </div>
        )}

        {!isGenerating && (bullCase.length > 0 || bearCase.length > 0) && (
          <NarrativeBridge text="この事実を市場参加者はどう見ているか" isMobile={isMobile} />
        )}

        {/* ── 論点: ブル・ベア対比 (v153 で Section 6 から分離、 強み・リスクと隣接) ──
            旧 Section 6 は「投資家への問い + ブル/ベア」 を 1 ブロック同居。 v153 IA reorder で
            ブル・ベア (論点) を 強み・リスクの直後へ、 投資家への問い (締め) を末尾 §38 カードの直前へ分離。 */}
        {!isGenerating && (bullCase.length > 0 || bearCase.length > 0) && (
          <div className="narrative-appear" data-testid="diagram-section-bullbear">
            <VizSectionLabel text="ブル・ベア対比" icon={TrendingUp} sub="強気・弱気それぞれの見立て" />
            <AccordionHeader
              label={`ブル ${bullCase.length}件 / ベア ${bearCase.length}件`}
              isOpen={openSections.bullbear}
              onToggle={() => toggleSection('bullbear')}
            />
            {openSections.bullbear && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
                {bullCase.length > 0 && (
                  <div style={{
                    borderRadius: '8px', background: 'rgba(34,197,94,0.12)',
                    border: '1px solid rgba(34,197,94,0.30)', padding: '12px',
                  }}>
                    <div style={{ marginBottom: '8px' }}>
                      <Chip variant="solid" size="xs" tone="gain" icon={<TrendingUp size={11} strokeWidth={2.2} aria-hidden="true" />}>ブル派の根拠</Chip>
                    </div>
                    {bullCase.map((s, i) => (
                      <div
                        key={`bull-${openSections.bullbear}-${i}`}
                        style={{
                          fontSize: '12px', color: 'var(--text-primary)',
                          lineHeight: 1.6, display: 'flex', gap: '5px',
                          ...fadeInStyle(i),
                        }}
                      >
                        <span style={{ color: 'var(--color-gain)', flexShrink: 0 }}>•</span>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
                {bearCase.length > 0 && (
                  <div style={{
                    borderRadius: '8px', background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.30)', padding: '12px',
                  }}>
                    <div style={{ marginBottom: '8px' }}>
                      <Chip variant="solid" size="xs" tone="loss" icon={<TrendingDown size={11} strokeWidth={2.2} aria-hidden="true" />}>ベア派の根拠</Chip>
                    </div>
                    {bearCase.map((r, i) => (
                      <div
                        key={`bear-${openSections.bullbear}-${i}`}
                        style={{
                          fontSize: '12px', color: 'var(--text-primary)',
                          lineHeight: 1.6, display: 'flex', gap: '5px',
                          ...fadeInStyle(i),
                        }}
                      >
                        <span style={{ color: 'var(--color-loss)', flexShrink: 0 }}>•</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── 締め前: 投資家への問い (v153 で Section 6 から分離して末尾へ、 §38 締めカードの直前) ── */}
        {isGenerating ? (
          <div data-testid="diagram-section-investor-questions">
            <VizSectionLabel text="投資家への問い" icon={HelpCircle} sub="次の決算までに見ておきたい着眼点" />
            <div style={{
              borderRadius: '8px', padding: '14px 16px',
              background: 'var(--bg-subtle)', border: '1px solid var(--border)',
              borderLeft: '3px solid rgba(56,189,248,0.2)',
            }}>
              {[88, 95, 72].map((w, i) => (
                <div key={i} className="skeleton" style={{
                  height: '12px', width: `${w}%`,
                  marginBottom: i < 2 ? '8px' : 0,
                }} />
              ))}
            </div>
          </div>
        ) : investorQuestions.length > 0 ? (
          <div className="narrative-appear" data-testid="diagram-section-investor-questions">
            <VizSectionLabel text="投資家への問い" icon={HelpCircle} sub="次の決算までに見ておきたい着眼点" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* v127: 角度タグ (収益性 / 資本効率 / マクロ 等) + 非断定の問い。各問いは §38/§5 safe。 */}
              {investorQuestions.map((q, i) => (
                <div key={i} style={{
                  borderRadius: '8px', background: 'var(--bg-subtle)',
                  border: '1px solid var(--border)',
                  borderLeft: '3px solid var(--color-accent)',
                  padding: '12px 14px',
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                }}>
                  {q.angle ? (
                    <Chip variant="display" size="xs" tone="accent">{q.angle}</Chip>
                  ) : null}
                  <span style={{
                    fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.7,
                  }}>{q.question}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* ── 話題: ⑤ 議員の開示取引 (Round 3-B、 締めカードの手前、 engagement 枠) ── */}
        {!isGenerating && data.congressTrades && (
          <CongressTradesSection congress={data.congressTrades} />
        )}

        </div>
        </div>
        {/* ── B7 第二手: 下層 L3 group ここまで (締めの「この決算のチェックポイント」は visible 維持) ── */}

        {/* ── 締め: この決算のチェックポイント (Round 2-C, handover v152) ──
            模範解答 (Surprise Stories) の「結論 + 今日やること」 相当の締めカード。
            ⚠️ 「結論」 を断定すると金商法 §38 (断定的判断の提供)、 最上級は景表法 §5 抵触のため、
            「自問形式の確認観点 + 免責」 に限定する。 全文 静的 dictionary (LLM 非経由) で
            Trust Cliff を物理層回避 ([[feedback_diagram_quality_guard]] / [[feedback_sell_zone_static_dict]])。
            銘柄非依存の汎用観点なので全 ticker で同一文言。 */}
        {!isGenerating && (
          <div data-testid="diagram-section-checkpoint">
            <VizSectionLabel
              text="この決算のチェックポイント"
              icon={CheckCircle2}
              sub="投資判断の前に、自分の視点で確かめておきたい観点"
            />
            {/* v153 模範解答化: 締めカードは cyan accent border で「ここが結び」 を 1 段強調
                ([[feedback_minimalism_over_additive]] 遵守で強調は本 section のみ、 過剰適用しない)。 */}
            <div style={{
              borderRadius: '10px',
              border: '1px solid rgba(56,189,248,0.22)',
              background: 'var(--bg-subtle)',
              padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  // §38 法務レビュー (2026-06-03): 「上回ったか」 は暗に「上回る=良い」 を含意し 4 項目中
                  // 最も誘導寄り → 「市場予想と比べてどうか」 で中立化 (疑問文のまま §38-safe を強化)。
                  '来期ガイダンスは市場予想と比べてどうか',
                  'FCF マージンは前年から改善しているか',
                  '強みは一時的でなく構造的か',
                  '株価バリュエーションは過去レンジ内か',
                ].map((q, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    {/* チェックボックス風の □ (装飾、 操作不可)。 raw hex は使わず token 由来。 */}
                    <span
                      aria-hidden="true"
                      style={{
                        flexShrink: 0,
                        width: '15px',
                        height: '15px',
                        marginTop: '2px',
                        borderRadius: '4px',
                        border: '1.5px solid var(--color-accent)',
                        opacity: 0.7,
                      }}
                    />
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                      {q}
                    </span>
                  </div>
                ))}
              </div>
              {/* 免責 (§38/§5 物理回避の明示)。 上に hairline で区切る。 */}
              <div style={{
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: '1px solid var(--border)',
                fontSize: '11px',
                color: 'var(--text-muted)',
                lineHeight: 1.6,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
              }}>
                <Info size={12} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  表示内容は公開情報の整理であり、特定銘柄の売買を推奨するものではありません。過去の実績は将来の成果を保証しません。最終的な投資判断はご自身の責任で行ってください。
                </span>
              </div>
            </div>
          </div>
        )}

        {/* handover v82 Phase 4: 出典 footer + degraded_mode banner */}
        <DiagramCitation
          materialFacts={data?.material_facts || []}
          degradedMode={data?.degraded_mode === true}
          signalQuality={data?.signal_quality || null}
        />
      </div>
      {/* handover v82 Phase 5.5: 営業利益増 (condition 4) 全 step fallback toast (UI/UX verdict) */}
      <Toast
        message={toastMessage}
        duration={2800}
        onDismiss={() => setToastMessage(null)}
      />
    </div>
    </VibeContext.Provider>
  );
}
