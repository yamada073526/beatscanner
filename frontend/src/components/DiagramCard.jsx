/**
 * DiagramCard — React DOM-based visualization panel.
 * Replaces VizPanel's dangerouslySetInnerHTML SVG rendering with proper React elements.
 * Business model flow uses CSS flexbox; charts use inline JSX SVG (no string templates).
 *
 * handover v82 Phase 4: 出典 footer + degraded_mode banner を DiagramCitation で attach
 * (multi-review 6 体合議 verdict、 局所介入 +5 行で 2,027 → 2,033 行)。
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { FileBarChart2, Banknote, Calendar, CheckCircle2, XCircle, AlertTriangle, Shield, TrendingUp, TrendingDown, Info, Layers, PieChart, HelpCircle } from 'lucide-react';
import DiagramCitation from './DiagramCitation.jsx';
import Chip from './ui/Chip.jsx';
import { sanitizeDiagramData, findBlocklistHits, sanitizeText } from '../lib/blocklist.js';
import { translateSegmentName } from '../lib/segmentNames.js';
// handover v82 Phase 5.5: ConditionRow click → DiagramCard pulse 連携 (multi-review 6 体合議 verdict)。
import { useWorkspaceStore } from '../state/workspaceStore.js';
import { isStepPulsingForCondition } from '../lib/condition-mapping.js';
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
          marginTop: '28px',
          marginBottom: '0',
          opacity: 0.5,
        }} />
      )}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '7px',
        fontSize: '13px', fontWeight: '700', letterSpacing: '0.5px',
        color: '#38BDF8', marginBottom: sub ? '3px' : '10px', marginTop: first ? '32px' : '14px',
      }}>
        {Icon && <Icon size={15} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />}
        <span>{text}</span>
      </div>
      {sub && (
        <div style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          lineHeight: 1.55,
          marginBottom: '11px',
        }}>
          {sub}
        </div>
      )}
    </>
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
  const displayName = translateSegmentName(rawName);
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
        {/* narrative-only は「数値レンジ未開示」 が仕様であって精度不足ではない → 精度 chip を出さない
            (3体合議 frontend verdict: 中立注記と amber「精度:低」 chip の併存は誤読を招く) */}
        {!narrativeOnly && confidenceChip}
      </div>

      {/* narrative-only (構造化レンジなし): 中立トーンで「数値レンジ未開示・経営陣の言及は以下」 を案内。
          通常の low (構造化試行したが精度不足) はアンバー警告で原文確認を促す。 */}
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
      ) : confidence === 'low' && (
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
              ? '抽出精度が不足しています。 下記の発言原文でご確認ください。'
              : '抽出精度が不足しています。 原文 (出典 link) で確認してください。'}
          </div>
        </div>
      )}

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
        const beatLabel = d.beat === true ? '▲BEAT' : d.beat === false ? '▼MISS' : null;
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
                {tooltip.beat ? '▲BEAT' : '▼MISS'} {tooltip.beatMargin > 0 ? '+' : ''}{tooltip.beatMargin.toFixed(1)}% vs Est
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
        const beatLabel = d.beat === true ? '▲BEAT' : d.beat === false ? '▼MISS' : null;
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
                {tooltip.beat ? '▲BEAT' : '▼MISS'} {tooltip.beatMargin > 0 ? '+' : ''}{tooltip.beatMargin.toFixed(1)}% vs Est
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
      <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
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
      <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
        {dividend.yield}%
      </div>
      {dividend.buyback && (
        <div style={{ fontSize: '10px', color: '#38BDF8' }}>🔄 自社株買い</div>
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
      <span style={{
        fontSize: '11px', color: 'var(--text-muted)',
        transition: 'transform 0.2s',
        display: 'inline-block',
        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
      }}>
        ▼
      </span>
    </div>
  );
}

export default function DiagramCard({
  data: rawData, ticker, onDownload, onYearsChange, selectedYears = 3,
  showCoach = false,         // R2v3: 年セレクター直上の吹き出し表示 ON/OFF（HomeTab 制御・初回のみ）
  onSelectorVisible,         // R2v2: 年セレクターが80%可視になった時に1度だけ呼ばれる
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
        diagramEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  // (NVDA dogfood 5/30) でも button を hide せず「5 条件 詳細 ▼」 default label で常に表示。
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
  // strengths(強み・リスク)=展開 / bullbear(ブル・ベア)=折りたたみ維持 (強み・リスクと意味的に冗長なため)。
  const [openSections, setOpenSections] = useState({ strengths: true, bullbear: false });
  const toggleSection = (key) =>
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  // じっちゃま5条件 = 図解の主役データ → デフォルト展開 (HERO FAIL バッジ直下、 2秒原則)。 toggle は残す。
  const [showConditions, setShowConditions] = useState(true);
  const [showUnknownTip, setShowUnknownTip] = useState(false);  // R4: 判定不可バッジのツールチップ

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
    // v125 P4-1: data-testid="diagram-card-wrapper" を outer wrapper に追加。
    // 既存 diagram-section-* testid (内部 7 section) は変更なし、 outer は単独 QA selector 用。
    // L895 の `if (!data) return null` は null return のため testid 不可 (component 不在 = absent)。
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
                fontSize: 'clamp(18px, 5vw, 28px)',
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
                lineHeight: 1.2,
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
                <span style={{
                  fontSize: '10px',
                  transition: 'transform 0.2s',
                  display: 'inline-block',
                  transform: showConditions ? 'rotate(180deg)' : 'rotate(0deg)',
                }}>▼</span>
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
              <div className="narrative-appear" style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
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
            <span style={{ fontSize: '13px' }}>🏢</span>
            <span>事業フローを精査しています</span>
          </div>
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
              <span style={{ color: '#10B981', fontWeight: '700' }}>▲BEAT</span>
              {' / '}
              <span style={{ color: '#ef4444', fontWeight: '700' }}>▼MISS</span>
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
                          {latest.beat ? '▲BEAT' : '▼MISS'} {latest.beatMargin > 0 ? '+' : ''}{latest.beatMargin.toFixed(1)}%
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
                      <span style={{ fontWeight: '700' }}>${d.value}B</span>
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
                      <span style={{ fontWeight: '700', color: '#fb923c' }}>${d.value}B</span>
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
            <span style={{ fontSize: '13px' }}>📊</span>
            <span>バリュエーション情報は次回開示でお届けします</span>
          </div>
        )}

        {/* ── 還元: 資本政策 (配当 + 自社株買い 実行額) v138 Phase 2C / v153 で株価の後ろへ ── */}
        {data.capitalReturnDataAvailable && (
          <div data-testid="diagram-section-capital-return" style={{ marginTop: '16px' }}>
            <CapitalReturnSection capitalReturn={data.capitalReturn} />
          </div>
        )}

        {/* ── 将来: 次 Q ガイダンス (SEC 8-K LLM 抽出) v138 Phase 2D / v153 で還元の後ろへ ── */}
        {data.guidanceExtractedAvailable && (
          <div data-testid="diagram-section-guidance" style={{ marginTop: '16px' }}>
            <GuidanceSection guidance={data.guidanceExtracted} />
          </div>
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
            <span style={{ fontSize: '13px' }}>⚖️</span>
            <span>強み・リスク要因を整理しています</span>
          </div>
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
            <div style={{
              borderRadius: '10px',
              border: '1px solid var(--border)',
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
  );
}
