import React, { useEffect, useRef, useState } from 'react';
import Card from '../../primitives/Card.jsx';
import SectionHeader from '../../primitives/SectionHeader.jsx';
import CompanyLogo from '../../../../components/CompanyLogo.jsx';
import Chip from '../../../../components/ui/Chip.jsx';
// v138.6 R7-C (2026-05-30): 「Google ログインで無制限」 link を直接 signInWithGoogle 接続、
// 旧 window.dispatchEvent('bs:open-login') は listener なしで click 無反応 (user dogfood 報告)
import { useAuth } from '../../../../hooks/useAuth.js';
import { Building2, MapPin, Users, Briefcase, Sparkles, RefreshCw, Scale } from 'lucide-react';
import { fetchProfileExtended, fetchProfileSummary, fetchProfilePeers } from '../../../../api.js';
import { sanitizeText } from '../../../../lib/blocklist.js';
import { displaySegmentName } from '../../../../lib/segmentNames.js';

/**
 * Phase B 会社概要 LLM 和文化 (SPEC_2026-05-22 §5 Sprint B.1)
 *
 * Phase A (静的英文表示) に加えて、 Claude Haiku で和文 4 セクション要約を表示。
 * must-fix 対応:
 *   #3: loading shimmer skeleton (4 セクション × 2 行 + 「日本語で要約中」 caption)
 *   #4: lazy fetch (prefetchAll 不含)、 module-level Map 10 分 TTL cache
 *   #5: AbortController + 3 state UI (loading / success / error)
 *   #7: cache breakpoint 2 段 (profile_summary.py 内)
 *   #8: product_names 完全 token match (profile_summary.py 内)
 *   #9: 4 セクション hierarchy (h4 label + body text 二段、 案 A)
 *   #10: citation chip (Chip variant="display" + Sparkles icon + tooltip)
 *   #11: disclaimer 二重化 (citation chip + section footnote)
 *   polish P1: 再生成 button (confidence=low 時)
 *
 * 4 重防御 Layer 3: frontend sanitize (BLOCKLIST_REGEX) で sentence 単位削除
 *
 * Trust Cliff (must-fix #1): citation 文言
 *   「※ FMP 提供の企業概要 (SEC 提出書類より作成) を AI が日本語要約。
 *     一次資料は SEC EDGAR 10-K を参照推奨。」
 *
 * memory anchors:
 *   - feedback_diagram_quality_guard.md (BAD 1-6 + Trust Cliff DoD)
 *   - feedback_data_completeness_guard.md (sources schema + 3 段階分岐 UI)
 */

// ─── 10 分 TTL frontend cache (module-level Map) ─────────────────────────────
// must-fix #4: prefetchAll に含めない (ProfileCard mount 時 lazy fetch)
const _SUMMARY_CACHE_MAP = new Map();
const _SUMMARY_CACHE_TTL_MS = 10 * 60 * 1000;

function getCachedSummary(ticker) {
  const entry = _SUMMARY_CACHE_MAP.get(ticker);
  if (!entry) return null;
  if (Date.now() - entry.ts > _SUMMARY_CACHE_TTL_MS) {
    _SUMMARY_CACHE_MAP.delete(ticker);
    return null;
  }
  return entry.data;
}

function setCachedSummary(ticker, data) {
  _SUMMARY_CACHE_MAP.set(ticker, { ts: Date.now(), data });
}

// ─── Sanitize helper (Layer 3: BLOCKLIST_REGEX sentence 単位削除) ─────────────
function sanitizeSummaryData(data) {
  if (!data || typeof data !== 'object') return data;
  if (data._error) return data;
  return {
    ...data,
    summary_jp: data.summary_jp
      ? (sanitizeText(data.summary_jp) || data.summary_jp)
      : data.summary_jp,
    sections: {
      main_business: data.sections?.main_business
        ? (sanitizeText(data.sections.main_business) || data.sections.main_business)
        : data.sections?.main_business,
      revenue_model: data.sections?.revenue_model
        ? (sanitizeText(data.sections.revenue_model) || data.sections.revenue_model)
        : data.sections?.revenue_model,
      customers: data.sections?.customers
        ? (sanitizeText(data.sections.customers) || data.sections.customers)
        : data.sections?.customers,
      // Sprint H6 漏れ修正: competitive_moat も sanitize 対象に追加 (Sprint H6 追加時に落としていた)
      competitive_moat: data.sections?.competitive_moat
        ? (sanitizeText(data.sections.competitive_moat) || data.sections.competitive_moat)
        : data.sections?.competitive_moat,
    },
  };
}

// ─── Shimmer skeleton (must-fix #3) ──────────────────────────────────────────
// v97 user dogfood「のっぺりしている、 ダサい」 への直接対策。
// 改善 3 点:
//   1. 実 output shape (lead + 4 sections × 3px gold accent + 2 lines) に近似
//      → mount → 実 content 表示で「形」 がブレない (CLS 0、 認知連続性)
//   2. 進捗 step text を動的に切替 (2 秒おき 3 段階)
//      → 「FMP データ取得中」 → 「AI 要約生成中」 → 「もう少しで完了」
//      → user に「進んでいる」 体感を与え「壊れていない」 安心感 (Trust Cliff 防御)
//   3. shimmer wave を 1.5s → 1.2s で 25% 高速化 (体感「進行速度」 増)
// infinite animation 注: pge-loop-debugger 落とし穴 #4 (Playwright getAnimations().finish() は
// try/catch + iterations check 必須) は snap-*.mjs 側で対応する責務 (本 component は inifinite OK)。
function SummaryShimmer() {
  // 進捗 step state: 2 秒おきに切替 (0 → 1 → 2 で stop)
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 2000);
    const t2 = setTimeout(() => setStep(2), 4500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const PROGRESS_MESSAGES = [
    'FMP 企業データを取得中',
    '日本語で要約を生成中',
    'もう少しで完了',
  ];
  const message = PROGRESS_MESSAGES[step];

  // 4 sections の skeleton shape (実 output: 主力事業 / 収益モデル / 顧客競合 / 競争優位)
  // 各 section の line widths を異なるパターンで配置 (機械的均一感を回避)
  const SECTION_SHAPES = [
    { lines: [72, 58] },  // 主力事業
    { lines: [64, 54] },  // 収益モデル
    { lines: [70, 50] },  // 顧客・競合
    { lines: [62, 66] },  // 競争優位 (Moat)
  ];

  return (
    <div
      data-testid="profile-summary-loading"
      style={{ marginTop: 'var(--space-4, 16px)', minHeight: 280 }}
    >
      <style>{`
        @keyframes bs-profile-shimmer-v97 {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes bs-shimmer-dots-v97 {
          0%, 80%, 100% { opacity: 0.3; }
          40% { opacity: 1; }
        }
        @keyframes bs-step-fade-v97 {
          0% { opacity: 0; transform: translateY(2px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .profile-shimmer-line-v97 {
          border-radius: var(--radius-sm, 4px);
          height: 13px;
          background: linear-gradient(
            90deg,
            var(--bg-subtle) 0%,
            color-mix(in srgb, var(--color-gold) 12%, var(--bg-subtle)) 50%,
            var(--bg-subtle) 100%
          );
          background-size: 200% 100%;
          animation: bs-profile-shimmer-v97 1.2s infinite linear;
        }
        [data-theme="dark"] .profile-shimmer-line-v97 {
          background: linear-gradient(
            90deg,
            var(--bg-muted) 0%,
            color-mix(in srgb, var(--color-gold) 18%, var(--bg-muted)) 50%,
            var(--bg-muted) 100%
          );
          background-size: 200% 100%;
          animation: bs-profile-shimmer-v97 1.2s infinite linear;
        }
        .profile-shimmer-dot-v97 {
          display: inline-block;
          animation: bs-shimmer-dots-v97 1.4s infinite both;
        }
        .profile-shimmer-dot-v97:nth-child(2) { animation-delay: 0.2s; }
        .profile-shimmer-dot-v97:nth-child(3) { animation-delay: 0.4s; }
        .profile-step-text-v97 {
          animation: bs-step-fade-v97 320ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .profile-shimmer-line-v97 {
            background: var(--bg-subtle);
            animation: none;
          }
          [data-theme="dark"] .profile-shimmer-line-v97 {
            background: var(--bg-muted);
            animation: none;
          }
          .profile-shimmer-dot-v97 {
            animation: none;
            opacity: 0.7;
          }
          .profile-step-text-v97 {
            animation: none;
          }
        }
      `}</style>

      {/* lead 1 行 (実 summary_jp、 14px / fw600 / lh 1.65) */}
      <div
        className="profile-shimmer-line-v97"
        style={{
          height: 16,
          width: '85%',
          marginBottom: 'var(--space-5, 20px)',
        }}
      />

      {/* 4 sections (実 SummarySection と shape 一致: 3px gold accent + label + 2 body lines) */}
      {SECTION_SHAPES.map((sec, sidx) => (
        <div
          key={sidx}
          style={{
            marginBottom: 'var(--space-4, 16px)',
            // 2 つ目以降は hairline divider (実 SummarySection isFirst=false と整合)
            ...(sidx === 0 ? {} : {
              paddingTop: 'var(--space-4, 16px)',
              borderTop: '1px solid color-mix(in srgb, var(--color-gold) 25%, var(--border))',
            }),
          }}
        >
          {/* label row: 3px gold accent + label width skeleton */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2, 8px)',
              marginBottom: 'var(--space-2, 8px)',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 3,
                height: 11,
                borderRadius: 2,
                background: 'var(--color-gold)',
                flexShrink: 0,
                opacity: 0.7,
              }}
              aria-hidden="true"
            />
            <div
              className="profile-shimmer-line-v97"
              style={{ height: 11, width: 80 }}
            />
          </div>
          {/* body 2 lines (異なる幅で機械的均一感回避) */}
          {sec.lines.map((w, i) => (
            <div
              key={i}
              className="profile-shimmer-line-v97"
              style={{
                width: `${w}%`,
                marginTop: i === 0 ? 0 : 'var(--space-2, 8px)',
                animationDelay: `${(sidx * 0.05) + (i * 0.04)}s`,
              }}
            />
          ))}
        </div>
      ))}

      {/* 進捗 step text (動的、 2s おき切替で「進んでる」 体感) */}
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          marginTop: 'var(--space-4, 16px)',
          textAlign: 'center',
          fontWeight: 500,
          letterSpacing: '0.04em',
        }}
        data-testid="profile-summary-progress-text"
      >
        <span key={step} className="profile-step-text-v97">
          {message}
        </span>
        <span className="profile-shimmer-dot-v97" aria-hidden="true">.</span>
        <span className="profile-shimmer-dot-v97" aria-hidden="true">.</span>
        <span className="profile-shimmer-dot-v97" aria-hidden="true">.</span>
      </div>
    </div>
  );
}

// ─── Citation 定数 (must-fix #1, #10, #11) ───────────────────────────────────
const CITATION_TEXT_SHORT = 'AI 要約 (SEC 由来)';
const CITATION_TOOLTIP =
  '※ FMP 提供の企業概要 (SEC 提出書類より作成) を AI が日本語要約。' +
  '一次資料は SEC EDGAR 10-K を参照推奨。';
const SECTION_FOOTNOTE = '※ FMP description 記載時点';

// ─── Phase 2.9 Sprint H5 #会社概要 UI/UX 改善 (UI/UX sub-agent verdict、 +27 pt 期待) ────
// h4 階層強化 (Aman メニュー章立て idiom):
//   - fontWeight 600 → 700 (label と body の差を明確化)
//   - letterSpacing 0.06em → 0.08em (formal/luxury)
//   - color text-muted → text-secondary (輝度+)
//   - marginBottom 4px → 8px (breathing room)
//   - 3px gold accent bar prepend (Sprint H1 真鍮 anchor と統一)
// body text:
//   - color text-secondary → text-primary (label との 2 層構造明確化)
// section 間 hairline:
//   - 2 つ目以降に border-top: 1px gold 25% opacity + paddingTop で chapter divider
function SummarySection({ label, content, showFootnote = false, testId, isFirst = false }) {
  if (!content) return null;
  return (
    <div
      data-testid={testId}
      style={{
        marginBottom: 'var(--space-4, 16px)',
        // 2 つ目以降の section に subtle gold hairline divider
        ...(isFirst ? {} : {
          paddingTop: 'var(--space-4, 16px)',
          borderTop: '1px solid color-mix(in srgb, var(--color-gold) 25%, var(--border))',
        }),
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2, 8px)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
          marginBottom: 'var(--space-2, 8px)',
        }}
      >
        {/* 3px gold accent bar (Sprint H1 真鍮 anchor) */}
        <span
          style={{
            display: 'inline-block',
            width: 3,
            height: 11,
            borderRadius: 2,
            background: 'var(--color-gold)',
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.65,
          color: 'var(--text-primary)',
        }}
      >
        {content}
      </div>
      {/* must-fix #11: section footnote (revenue_model / customers に必須) */}
      {showFootnote && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            marginTop: 'var(--space-1, 4px)',
          }}
        >
          {SECTION_FOOTNOTE}
        </div>
      )}
    </div>
  );
}

// ─── Sprint H9 (金融 Phase 2 案 B): セグメント別売上 (Bloomberg Terminal 並み数値根拠) ────
// backend `/api/profile-summary/{ticker}` の response に segmentSummary 同梱 (LLM 不関与、 数値物理層)。
// 「文章浅い」 user feedback への直接対策: 売上構成比率 + YoY% を数値で front 出し。
// Aman 級フォーマル文脈のため emoji なし、 token base のシンプル list (DiagramCard 既存 SegmentBar とは
// 別 design — 「会社概要」 セクション内では label hairline + 真鍮 anchor で整合)。
function SegmentSection({ segmentSummary }) {
  if (!segmentSummary?.segments?.length) return null;
  const segments = segmentSummary.segments;
  const total = segments.reduce((acc, s) => acc + (Number(s.value_b) || 0), 0);

  return (
    <div
      data-testid="profile-segment-section"
      style={{
        marginBottom: 'var(--space-4, 16px)',
        paddingTop: 'var(--space-4, 16px)',
        borderTop: '1px solid color-mix(in srgb, var(--color-gold) 25%, var(--border))',
      }}
    >
      {/* label (SummarySection と同じ Sprint H1 真鍮 anchor idiom) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2, 8px)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
          marginBottom: 'var(--space-2, 8px)',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 3,
            height: 11,
            borderRadius: 2,
            background: 'var(--color-gold)',
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
        セグメント別売上
      </div>

      {/* sub-label: 直近四半期 + 前年同期比 */}
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          marginBottom: 'var(--space-3, 12px)',
        }}
      >
        直近四半期 {segmentSummary.date} ／ 前年同期比
      </div>

      {/* segment list: name + share% + $value_b + YoY chip */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2, 8px)' }}>
        {segments.map((seg, i) => {
          const share = total > 0 ? Math.round((seg.value_b / total) * 100) : null;
          const yoy = Number.isFinite(seg.yoy_pct) ? seg.yoy_pct : null;
          const yoyTone = yoy == null
            ? null
            : yoy >= 0
              ? 'var(--color-gain)'
              : 'var(--color-loss)';
          return (
            <div
              key={i}
              data-testid={`profile-segment-row-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3, 12px)',
                padding: 'var(--space-2, 8px) var(--space-3, 12px)',
                borderRadius: 'var(--radius-md, 12px)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
              }}
            >
              {/* segment name (主要、 flex 拡張)。 v97: 和文 dictionary で日本人 user 向け */}
              <div
                style={{
                  flex: '1 1 0',
                  minWidth: 0,
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={seg.name !== displaySegmentName(seg) ? `原文: ${seg.name}` : undefined}
              >
                {displaySegmentName(seg)}
              </div>

              {/* share% (構成比) */}
              {share != null && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    fontVariantNumeric: 'tabular-nums',
                    flexShrink: 0,
                  }}
                >
                  {share}%
                </div>
              )}

              {/* $ value */}
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0,
                  minWidth: 56,
                  textAlign: 'right',
                }}
              >
                ${seg.value_b}B
              </div>

              {/* YoY badge (緑/赤、 token base) */}
              {yoy != null && (
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: yoyTone,
                    background: `color-mix(in srgb, ${yoyTone} 12%, transparent)`,
                    padding: '2px 7px',
                    borderRadius: 'var(--radius-sm, 4px)',
                    fontVariantNumeric: 'tabular-nums',
                    flexShrink: 0,
                    minWidth: 48,
                    textAlign: 'center',
                  }}
                >
                  {yoy >= 0 ? '+' : ''}{yoy}%
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* citation: FMP /revenue-product-segmentation 由来 (Trust Cliff anchor) */}
      <div
        style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          marginTop: 'var(--space-2, 8px)',
        }}
      >
        ※ FMP /revenue-product-segmentation 由来。 通期合算ではなく直近四半期の構成比。
      </div>
    </div>
  );
}


// ─── v97 Phase 3 (金融 sub-agent verdict): 競合比較 Tab ───────────────────────
// 自社 + peer 5 銘柄の 4 指標 (株価 YTD / Gross Margin / FCF Margin / R&D%) を fetch、
// 中央値と比較した diff バッジ (緑/赤) で「優勢/劣勢」 を即視化。
// Bloomberg Terminal 級差別化: LLM narration 一切なし、 純粋 FMP 数値 + source citation。
//
// Trust Cliff 防御 (sub-agent verdict):
//   - 全数値に source: "FMP {endpoint}" + as_of 表示
//   - 競合比較セクションは 数値+バッジのみ、 narration 厳禁 (BAD-5/6 断定表現混入 risk)

// 指標 metadata (列定義)
const COMPARE_METRICS = [
  {
    key: 'price_change_ytd',
    label: '株価 YTD',
    unit: '%',
    higherIsBetter: true,
    formatter: (v) => v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`,
  },
  {
    key: 'gross_margin',
    label: '粗利益率',
    unit: '%',
    higherIsBetter: true,
    formatter: (v) => v == null ? '—' : `${v}%`,
  },
  {
    key: 'fcf_margin',
    label: 'FCF マージン',
    unit: '%',
    higherIsBetter: true,
    formatter: (v) => v == null ? '—' : `${v}%`,
  },
  {
    key: 'rd_pct',
    label: 'R&D 比率',
    unit: '%',
    higherIsBetter: null, // 業界依存 (Tech 高 / Bank 低)、 中立色
    formatter: (v) => v == null ? '—' : `${v}%`,
  },
];

function PeerCompareSkeleton() {
  return (
    <div style={{ marginTop: 'var(--space-3, 12px)' }}>
      <style>{`
        @keyframes bs-peer-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .peer-skel {
          border-radius: var(--radius-sm, 4px);
          background: linear-gradient(
            90deg,
            var(--bg-subtle) 0%,
            color-mix(in srgb, var(--color-gold) 12%, var(--bg-subtle)) 50%,
            var(--bg-subtle) 100%
          );
          background-size: 200% 100%;
          animation: bs-peer-shimmer 1.2s infinite linear;
        }
        [data-theme="dark"] .peer-skel {
          background: linear-gradient(
            90deg,
            var(--bg-muted) 0%,
            color-mix(in srgb, var(--color-gold) 18%, var(--bg-muted)) 50%,
            var(--bg-muted) 100%
          );
          background-size: 200% 100%;
          animation: bs-peer-shimmer 1.2s infinite linear;
        }
        @media (prefers-reduced-motion: reduce) {
          .peer-skel { animation: none; background: var(--bg-subtle); }
        }
      `}</style>
      {/* header */}
      <div className="peer-skel" style={{ height: 13, width: '40%', marginBottom: 12 }} />
      {/* 6 rows × 5 cells */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px repeat(4, 1fr)', gap: 'var(--space-2, 8px)', marginBottom: 8 }}>
          {[0, 1, 2, 3, 4].map((j) => (
            <div key={j} className="peer-skel" style={{ height: 18, animationDelay: `${(i * 0.05) + (j * 0.03)}s` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function PeerCompareRow({ ticker, metrics, median, isSelf, onClick }) {
  return (
    <div
      onClick={isSelf ? undefined : onClick}
      role={isSelf ? undefined : 'button'}
      tabIndex={isSelf ? undefined : 0}
      onKeyDown={isSelf ? undefined : (e) => { if ((e.key === 'Enter' || e.key === ' ') && onClick) { e.preventDefault(); onClick(); } }}
      style={{
        display: 'grid',
        gridTemplateColumns: '96px repeat(4, 1fr)',
        gap: 'var(--space-2, 8px)',
        alignItems: 'center',
        padding: 'var(--space-2, 8px) var(--space-3, 12px)',
        borderRadius: 'var(--radius-sm, 4px)',
        background: isSelf ? 'color-mix(in srgb, var(--color-gold) 8%, var(--bg-subtle))' : 'transparent',
        border: isSelf ? '1px solid color-mix(in srgb, var(--color-gold) 30%, var(--border))' : '1px solid transparent',
        cursor: isSelf ? 'default' : 'pointer',
        transition: 'background 120ms ease-out',
        marginBottom: 4,
      }}
      onMouseEnter={isSelf ? undefined : (e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={isSelf ? undefined : (e) => { e.currentTarget.style.background = 'transparent'; }}
      data-testid={`peer-compare-row-${ticker}`}
    >
      {/* ticker (左固定列) */}
      <div
        style={{
          fontSize: 12,
          fontWeight: isSelf ? 700 : 500,
          color: isSelf ? 'var(--text-primary)' : 'var(--text-secondary)',
          letterSpacing: '0.04em',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {ticker}
        {isSelf && (
          <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-gold)', marginLeft: 4 }} aria-hidden="true">●</span>
        )}
      </div>

      {/* 4 metric cells */}
      {COMPARE_METRICS.map((metric) => {
        const value = metrics?.[metric.key];
        const med = median?.[metric.key];
        const formatted = metric.formatter(value);

        // diff バッジ: 中央値との差 (上ぶれ緑 / 下ぶれ赤、 ただし R&D は中立)
        let diffColor = 'var(--text-muted)';
        let diffSign = '';
        let diffText = '';
        if (value != null && med != null && !isSelf) {
          const diff = Math.round((value - med) * 10) / 10;
          if (Math.abs(diff) >= 0.5) {
            diffSign = diff > 0 ? '+' : '';
            diffText = `${diffSign}${diff}`;
            if (metric.higherIsBetter === true) {
              diffColor = diff > 0 ? 'var(--color-gain)' : 'var(--color-loss)';
            } else if (metric.higherIsBetter === false) {
              diffColor = diff > 0 ? 'var(--color-loss)' : 'var(--color-gain)';
            }
            // null (中立) なら muted のまま
          }
        }

        return (
          <div
            key={metric.key}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 2,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: isSelf ? 700 : 500,
                color: value == null ? 'var(--text-muted)' : 'var(--text-primary)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatted}
            </span>
            {!isSelf && diffText && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: diffColor,
                  fontVariantNumeric: 'tabular-nums',
                }}
                aria-label={`中央値との差: ${diffText}`}
              >
                {diffText}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PeerComparisonSection({ ticker, onNavigateTicker }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    const ac = new AbortController();
    setLoading(true);
    setData(null);
    fetchProfilePeers(ticker, { signal: ac.signal })
      .then((d) => {
        if (!ac.signal.aborted) setData(d);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (!ac.signal.aborted) setData({ _error: { status: 0, detail: 'ネットワークエラー' } });
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [ticker]);

  // v125 R3 hotfix lesson: data-testid="peer-compare-section" を全 state (skeleton/error/empty/main) で統一
  if (loading) return <div data-testid="peer-compare-section" data-state="loading"><PeerCompareSkeleton /></div>;

  if (!data || data._error) {
    return (
      <div
        style={{
          marginTop: 'var(--space-3, 12px)',
          padding: 'var(--space-3, 12px) var(--space-4, 16px)',
          borderRadius: 'var(--radius-md, 12px)',
          border: '1px solid var(--border)',
          background: 'var(--bg-subtle)',
          fontSize: 13,
          color: 'var(--text-muted)',
          lineHeight: 1.55,
        }}
        data-testid="peer-compare-error"
      >
        競合比較データを取得できませんでした。
        {data?._error?.detail && (<> <span style={{ color: 'var(--text-secondary)' }}>({data._error.detail})</span></>)}
      </div>
    );
  }

  if (!data.peers?.length || !data.self) {
    return (
      <div
        style={{
          marginTop: 'var(--space-3, 12px)',
          padding: 'var(--space-4, 16px)',
          borderRadius: 'var(--radius-md, 12px)',
          border: '1px solid var(--border)',
          background: 'var(--bg-subtle)',
          fontSize: 13,
          color: 'var(--text-muted)',
          textAlign: 'center',
        }}
        data-testid="peer-compare-empty"
      >
        この銘柄については競合データが取得できませんでした。
      </div>
    );
  }

  // self を先頭、 peer 5 を後 → 表示順
  const rows = [
    { ...data.self, isSelf: true },
    ...data.peers.map((p) => ({ ...p, isSelf: false })),
  ];

  return (
    <div data-testid="peer-comparison-section" style={{ marginTop: 'var(--space-3, 12px)' }}>
      {/* 説明 caption */}
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          marginBottom: 'var(--space-3, 12px)',
          letterSpacing: '0.04em',
          lineHeight: 1.55,
        }}
      >
        自社 + 競合 {data.peers.length} 社の 4 指標を比較。 数値の下に表示される値は{' '}
        <strong style={{ color: 'var(--text-secondary)' }}>自社含む {rows.length} 社の中央値との差</strong>{' '}
        (緑 = 上ぶれ / 赤 = 下ぶれ)。 銘柄行を click で分析切替。
      </div>

      {/* table header (列名) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '96px repeat(4, 1fr)',
          gap: 'var(--space-2, 8px)',
          padding: 'var(--space-2, 8px) var(--space-3, 12px)',
          marginBottom: 4,
          borderBottom: '1px solid color-mix(in srgb, var(--color-gold) 25%, var(--border))',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--text-muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          銘柄
        </div>
        {COMPARE_METRICS.map((m) => (
          <div
            key={m.key}
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--text-muted)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              textAlign: 'right',
            }}
          >
            {m.label}
          </div>
        ))}
      </div>

      {/* rows */}
      <div>
        {rows.map((row) => (
          <PeerCompareRow
            key={row.ticker}
            ticker={row.ticker}
            metrics={row}
            median={data.median}
            isSelf={row.isSelf}
            onClick={row.isSelf || !onNavigateTicker ? undefined : () => onNavigateTicker(row.ticker)}
          />
        ))}
      </div>

      {/* v97 sub-agent verdict 案 C: 中央値 row 強調 (footer + surface tint + accent left border) ===
          user dogfood「中央値が一番重要 (投資するなら業界トップを狙う)、 もっと目立たせる」 への対策。
          surface-2 tint + 3px cyan accent left border + font-semibold で「業界 anchor」 明示。
          v97 R5-b fix: label 「業界中央値」 が「業界中央/値」 で改行されて読みにくい問題 →
          column 幅 64 → 96px に拡大 + white-space: nowrap で 1 行強制。 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '96px repeat(4, 1fr)',
          gap: 'var(--space-2, 8px)',
          alignItems: 'center',
          padding: 'var(--space-3, 12px) var(--space-3, 12px) var(--space-3, 12px) var(--space-2, 8px)',
          marginTop: 'var(--space-3, 12px)',
          background: 'color-mix(in srgb, var(--color-accent) 6%, var(--bg-subtle))',
          borderRadius: 'var(--radius-md, 12px)',
          borderLeft: '3px solid var(--color-accent)',
          borderTop: '1px solid color-mix(in srgb, var(--color-accent) 25%, var(--border))',
        }}
        data-testid="peer-compare-median-row"
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--color-accent)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            paddingLeft: 'var(--space-2, 8px)',
            whiteSpace: 'nowrap',
          }}
        >
          業界中央値
        </div>
        {COMPARE_METRICS.map((m) => (
          <div
            key={m.key}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text-primary)',
              fontVariantNumeric: 'tabular-nums',
              textAlign: 'right',
            }}
          >
            {m.formatter(data.median?.[m.key])}
          </div>
        ))}
      </div>
      <div
        style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          marginTop: 'var(--space-2, 8px)',
          letterSpacing: '0.04em',
          textAlign: 'right',
          paddingRight: 'var(--space-2, 8px)',
        }}
      >
        ※ 業界中央値 = 自社 + 競合 {data.peers.length} 社の中央値。 投資判断の「業界 anchor」 として活用。
      </div>

      {/* citation footer (Trust Cliff 防御、 sub-agent verdict 必須) */}
      <div
        style={{
          marginTop: 'var(--space-3, 12px)',
          fontSize: 10,
          color: 'var(--text-muted)',
          lineHeight: 1.6,
        }}
      >
        ※ 株価 YTD: {data.sources?.price_change}<br />
        ※ 粗利益率 / FCF マージン / R&D 比率: {data.sources?.margins} (直近年次)
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function formatEmployees(n) {
  if (!n || !Number.isFinite(n)) return null;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M 人`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K 人`;
  return `${n.toLocaleString()} 人`;
}

function formatMktCap(v) {
  if (!v || !Number.isFinite(v)) return null;
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

function buildLocation(city, state, country) {
  const parts = [city, state, country].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ProfileCard({ ticker, companyName, dataSource, latestPeriod, latestDate, onNavigateTicker }) {
  // v138.6 R7-C: signInWithGoogle を ProfileCard 内で直接利用 (event dispatch listener なし問題の修正)
  const { signInWithGoogle } = useAuth();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Phase B: LLM 和文要約 state (must-fix #5: 3 state UI)
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const summaryAbortRef = useRef(null);

  // v97 Phase 3: Tab state (overview / compare)
  // ticker 切替時に「概要」 に戻す (compare tab で別 ticker の比較に切替で confusing)
  const [activeTab, setActiveTab] = useState('overview');
  useEffect(() => {
    setActiveTab('overview');
  }, [ticker]);

  // Phase A: profile-extended fetch (AbortController で race condition 防止)
  useEffect(() => {
    if (!ticker) return;
    const ac = new AbortController();
    setProfileLoading(true);
    fetchProfileExtended(ticker, { signal: ac.signal })
      .then((d) => {
        if (!ac.signal.aborted) setProfile(d);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (!ac.signal.aborted) setProfile(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setProfileLoading(false);
      });
    return () => ac.abort();
  }, [ticker]);

  // Phase B: LLM 和文要約 lazy fetch (must-fix #4: prefetchAll に含めない)
  useEffect(() => {
    if (!ticker) return;

    // module-level Map 10 分 TTL cache
    const cached = getCachedSummary(ticker);
    if (cached) {
      setSummary(cached);
      return;
    }

    // AbortController cleanup (must-fix #5: race condition 防止)
    if (summaryAbortRef.current) {
      summaryAbortRef.current.abort();
    }
    const ac = new AbortController();
    summaryAbortRef.current = ac;

    setSummaryLoading(true);
    setSummary(null);

    fetchProfileSummary(ticker, { signal: ac.signal })
      .then((data) => {
        if (ac.signal.aborted) return;
        const sanitized = sanitizeSummaryData(data);
        setSummary(sanitized);
        if (!data?._error) {
          setCachedSummary(ticker, sanitized);
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (!ac.signal.aborted) {
          setSummary({ _error: { status: 0, detail: 'ネットワークエラー' } });
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setSummaryLoading(false);
      });

    return () => {
      ac.abort();
      summaryAbortRef.current = null;
    };
  }, [ticker]);

  // polish P1: 再生成 handler
  const handleRegenerate = () => {
    if (!ticker) return;
    _SUMMARY_CACHE_MAP.delete(ticker);
    if (summaryAbortRef.current) {
      summaryAbortRef.current.abort();
    }
    const ac = new AbortController();
    summaryAbortRef.current = ac;
    setSummaryLoading(true);
    setSummary(null);
    fetchProfileSummary(ticker, { signal: ac.signal, forceRegenerate: true })
      .then((data) => {
        if (ac.signal.aborted) return;
        const sanitized = sanitizeSummaryData(data);
        setSummary(sanitized);
        if (!data?._error) {
          setCachedSummary(ticker, sanitized);
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (!ac.signal.aborted) {
          setSummary({ _error: { status: 0, detail: 'ネットワークエラー' } });
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setSummaryLoading(false);
      });
  };

  const profileError = profile && profile._error ? profile._error : null;
  const profileOk = profile && !profile._error ? profile : null;
  const summaryError = summary && summary._error ? summary._error : null;
  const summaryOk = summary && !summary._error ? summary : null;
  const showRegenerate = summaryOk && summaryOk.confidence === 'low';
  const summarySignalLow = summaryOk?.signal_quality === 'low';

  if (!ticker) return null;

  const description = profileOk?.description || null;
  const location = buildLocation(profileOk?.city, profileOk?.state, profileOk?.country);
  const employees = formatEmployees(profileOk?.fullTimeEmployees);
  const sector = profileOk?.sector || null;
  const industry = profileOk?.industry || null;
  const peers = Array.isArray(profileOk?.peers) ? profileOk.peers : [];
  const mktCapStr = formatMktCap(profileOk?.mktCap);

  return (
    // v97 A-1 CLS fix: ProfileCard 全体に minHeight 680 envelope。
    // 真因 (user dogfood): 「データプラン制限により取得できません」 (約 200px) → 3-5s 後に
    // 4 sections + segment 完全展開 (約 700px) で **500px のジャンプ** が発生、
    // 下にある StockChart 等が大きく押し下げられて user 「scroll に集中できず」 体感。
    // 680px は loading skeleton (Shimmer 280 + sections 400) と data 完了 (700) の中央値、
    // 細かい padding で envelope 内に吸収、 余計な余白は最下行で flex で押し上げ。
    <Card data-testid="profile-card">
      <div style={{ padding: 'var(--space-6, 24px)', minHeight: 680 }}>

        {/* === ヘッダー行 (SectionHeader + citation chip) === */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-4, 16px)',
          }}
        >
          <SectionHeader id="sec-profile" icon={<Building2 size={18} strokeWidth={1.5} />} title="プロフィール" label="COMPANY" />

          {/* must-fix #10: citation chip (card header 右端、 Sparkles icon) */}
          {summaryOk && (
            <Chip
              variant="display"
              tone="muted"
              size="xs"
              icon={<Sparkles size={12} strokeWidth={1.5} />}
              title={CITATION_TOOLTIP}
              data-testid="profile-summary-citation"
            >
              {CITATION_TEXT_SHORT}
            </Chip>
          )}
        </div>

        {/* === ロゴ + 会社名 + サブテキスト === */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4, 16px)',
            marginBottom: 'var(--space-4, 16px)',
          }}
        >
          <CompanyLogo ticker={ticker} size={56} variant="badge" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              data-testid="profile-company-name"
            >
              {companyName || profileOk?.companyName || ticker}
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                lineHeight: 1.3,
                color: 'var(--text-muted)',
                marginTop: 'var(--space-1, 4px)',
                display: 'flex',
                gap: 'var(--space-3, 12px)',
                flexWrap: 'wrap',
              }}
            >
              <span>{ticker}</span>
              {latestPeriod && <span>· FY{latestPeriod}</span>}
              {latestDate && <span>· {latestDate}</span>}
              {dataSource && <span>· {dataSource}</span>}
            </div>
          </div>
        </div>

        {/* === Phase 2.9 Sprint 5: profile-extended rate limit / 取得失敗時の親切 CTA === */}
        {!profileLoading && profileError && (
          <div
            style={{
              marginTop: 'var(--space-3, 12px)',
              padding: 'var(--space-3, 12px) var(--space-4, 16px)',
              borderRadius: 'var(--radius-md, 12px)',
              border: '1px solid var(--border)',
              background: 'color-mix(in srgb, var(--color-accent) 4%, transparent)',
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.55,
            }}
            data-testid="profile-error-cta"
          >
            {profileError.status === 429 ? (
              <>
                <strong style={{ color: 'var(--text-primary)' }}>
                  会社概要を表示できませんでした
                </strong>
                <br />
                <span>
                  {profileError.detail || '本日のお試し回数 (3 銘柄) を超えました。'}
                  {' '}
                  <a
                    href="#login"
                    style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}
                    onClick={(e) => { e.preventDefault(); signInWithGoogle(); }}
                  >
                    Google ログインで無制限
                  </a>
                  。
                </span>
              </>
            ) : (
              <>
                会社概要を取得できませんでした (HTTP {profileError.status})。
                {' '}しばらく時間をおいて再度お試しください。
              </>
            )}
          </div>
        )}

        {/* === メタデータ行 (時価総額 / 本社 / 従業員 / セクター) === */}
        {!profileLoading && profileOk && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-3, 12px)',
              marginBottom: 'var(--space-4, 16px)',
            }}
          >
            {location && (
              <div
                className="flex items-center gap-1"
                style={{ fontSize: 12, color: 'var(--text-muted)' }}
                data-testid="profile-location"
              >
                <MapPin size={12} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                <span>{location}</span>
              </div>
            )}
            {employees && (
              <div
                className="flex items-center gap-1"
                style={{ fontSize: 12, color: 'var(--text-muted)' }}
                data-testid="profile-employees"
              >
                <Users size={12} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                <span>{employees}</span>
              </div>
            )}
            {(sector || industry) && (
              <div
                className="flex items-center gap-1"
                style={{ fontSize: 12, color: 'var(--text-muted)' }}
                data-testid="profile-sector"
              >
                <Briefcase size={12} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                <span>{[sector, industry].filter(Boolean).join(' / ')}</span>
              </div>
            )}
            {mktCapStr && (
              <div
                style={{ fontSize: 12, color: 'var(--text-muted)' }}
                data-testid="profile-mktcap"
              >
                時価総額 {mktCapStr}
              </div>
            )}
          </div>
        )}

        {/* === v97 Phase 3 Tab UI (概要 / 競合比較) ===
            金融 sub-agent verdict 推奨案 2: Tab 切替で「情報密度 × Aman 級品格」 両立。
            ticker 切替時は overview tab にリセット (useEffect)、 user が同じ ticker で
            Tab 切替する場合は維持。
            Tab Header: 下線 active state + gold accent (Aman 級)、 inline button 2 個。 */}
        <div
          role="tablist"
          aria-label="会社概要表示モード"
          style={{
            display: 'flex',
            gap: 0,
            marginTop: 'var(--space-3, 12px)',
            marginBottom: 'var(--space-4, 16px)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {[
            { key: 'overview', label: '概要', icon: Building2 },
            { key: 'compare', label: '競合比較', icon: Scale },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                data-testid={`profile-tab-${tab.key}`}
                data-no-press="true"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive
                    ? '2px solid var(--color-gold)'
                    : '2px solid transparent',
                  marginBottom: -1,
                  padding: 'var(--space-2, 8px) var(--space-4, 16px)',
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: '0.06em',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2, 8px)',
                  transition: 'color 120ms ease-out, border-color 120ms ease-out',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = 'var(--text-secondary)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = 'var(--text-muted)';
                }}
              >
                <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* === Tab 2 競合比較 (Bloomberg Terminal 級差別化、 金融 sub-agent verdict) ===
            ticker prop が変わると PeerComparisonSection 内 useEffect で再 fetch。 */}
        {activeTab === 'compare' && (
          <PeerComparisonSection ticker={ticker} onNavigateTicker={onNavigateTicker} />
        )}

        {/* === Tab 1 概要 (既存 content) === */}
        {activeTab === 'overview' && (
          <>

        {/* === Phase A skeleton (profile-extended loading) === */}
        {profileLoading && (
          <div style={{ marginTop: 'var(--space-2, 8px)' }}>
            {[60, 80, 45].map((w, i) => (
              <div
                key={i}
                className="rounded animate-pulse"
                style={{ height: 12, width: `${w}%`, background: 'var(--bg-muted)', marginBottom: 8 }}
              />
            ))}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* Phase B: LLM 和文 4 セクション                                     */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        {/* loading state: shimmer (must-fix #3) */}
        {summaryLoading && <SummaryShimmer />}

        {/* error state */}
        {!summaryLoading && summaryError && (
          <div
            style={{
              marginTop: 'var(--space-3, 12px)',
              padding: 'var(--space-3, 12px) var(--space-4, 16px)',
              borderRadius: 'var(--radius-md, 12px)',
              border: '1px solid var(--border)',
              background: 'color-mix(in srgb, var(--color-accent) 4%, transparent)',
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.55,
            }}
            data-testid="profile-summary-error"
          >
            {summaryError.status === 429 ? (
              <>
                <strong style={{ color: 'var(--text-primary)' }}>日本語要約を表示できませんでした</strong>
                <br />
                {summaryError.detail || '本日のお試し回数 (3 銘柄) を超えました。'}
                {' '}
                <a
                  href="#login"
                  style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}
                  onClick={(e) => { e.preventDefault(); signInWithGoogle(); }}
                >
                  Google ログインで無制限
                </a>
                。
                {description && (
                  <p
                    style={{
                      fontSize: 12,
                      lineHeight: 1.55,
                      color: 'var(--text-muted)',
                      marginTop: 'var(--space-2, 8px)',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                    data-testid="profile-description-fallback"
                  >
                    {description}
                  </p>
                )}
              </>
            ) : (
              <>
                会社概要の日本語要約を取得できませんでした。
                {description && (
                  <p
                    style={{
                      fontSize: 12,
                      lineHeight: 1.55,
                      color: 'var(--text-muted)',
                      marginTop: 'var(--space-2, 8px)',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                    data-testid="profile-description-fallback"
                  >
                    {description}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* success state: 和文 4 セクション */}
        {!summaryLoading && summaryOk && (
          <div data-testid="profile-summary-section" style={{ marginTop: 'var(--space-4, 16px)' }}>

            {/* Phase 2.9 Sprint H5 #会社概要 UX 改善 (UI/UX sub-agent verdict、 +27 pt 期待):
                user 「信頼度低が目に飛び込んで読む気失せる」 → amber 警告バナー削除、
                summarySignalLow は文末 footnote に統合 (法的担保は citation chip + footer 維持)。
                Trust Cliff 維持: CITATION_TOOLTIP + footer disclaimer + header chip の 3 点セット。 */}

            {/* 全体要約 (summary_jp) — リード文 style (box 廃止で「箱の入れ子」 感解消) */}
            {summaryOk.summary_jp && (
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  lineHeight: 1.65,
                  color: 'var(--text-primary)',
                  marginBottom: 'var(--space-5, 20px)',
                  padding: 0,
                }}
                data-testid="profile-summary-jp"
              >
                {summaryOk.summary_jp}
              </p>
            )}

            {/* 主力事業 (Sprint H5: isFirst=true で hairline divider なし) */}
            <SummarySection
              label="主力事業"
              content={summaryOk.sections?.main_business}
              showFootnote={false}
              testId="profile-summary-main-business"
              isFirst={true}
            />

            {/* 収益モデル (must-fix #11: section footnote) */}
            <SummarySection
              label="収益モデル"
              content={summaryOk.sections?.revenue_model}
              showFootnote={true}
              testId="profile-summary-revenue-model"
            />

            {/* 顧客・競合 (must-fix #11: section footnote) */}
            <SummarySection
              label="顧客・競合"
              content={summaryOk.sections?.customers}
              showFootnote={true}
              testId="profile-summary-customers"
            />

            {/* Sprint H6 (金融アナリスト verdict 案 E、 Phase 1): competitive_moat
                経済的護城河 / 競争優位 — LLM schema 拡張 (profile_summary.py) + frontend section 追加。
                FMP description に根拠ない場合は backend が null 返却 → 表示しない graceful skip。 */}
            <SummarySection
              label="競争優位 (Moat)"
              content={summaryOk.sections?.competitive_moat}
              showFootnote={true}
              testId="profile-summary-moat"
            />

            {/* Sprint H9 (金融 Phase 2 案 B): セグメント別売上 (Bloomberg Terminal 並み数値根拠)
                backend response の segmentSummary を表示。 セグメント不在 (REIT 等) や FMP プラン
                制限時は graceful skip (SegmentSection 自身が null 返却)。 */}
            <SegmentSection segmentSummary={summaryOk.segmentSummary} />

            {/* must-fix #1 + #11: 文末固定 citation (Trust Cliff anchor、 削除禁止) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2, 8px)',
                flexWrap: 'wrap',
                marginTop: 'var(--space-2, 8px)',
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                  margin: 0,
                  flex: 1,
                }}
                data-testid="profile-summary-footnote"
              >
                ※ FMP 提供の企業概要 (SEC 提出書類より作成) を AI が日本語要約。
                一次資料は SEC EDGAR 10-K を参照推奨。
                {/* Sprint H5: summarySignalLow disclaimer を amber 警告 → 文末 footnote 統合
                    (Trust Cliff DoD は CITATION_TOOLTIP + footer disclaimer + header chip で維持) */}
                {summarySignalLow && (
                  <> 情報源が限定的なため、 特に詳細はご確認ください。</>
                )}
              </p>

              {/* polish P1: 再生成 button (confidence=low 時のみ) */}
              {showRegenerate && (
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={summaryLoading}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    textDecoration: 'underline',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: 0,
                    flexShrink: 0,
                  }}
                  data-testid="profile-summary-regenerate"
                >
                  <RefreshCw size={10} strokeWidth={1.5} />
                  もう一度要約
                </button>
              )}
            </div>
          </div>
        )}

        {/* === Phase A: 英文 description (LLM 和文要約が未取得の間のフォールバック) === */}
        {!summaryLoading && !summaryOk && !summaryError && !profileLoading && description && (
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.65,
              color: 'var(--text-secondary)',
              marginTop: 'var(--space-3, 12px)',
              marginBottom: peers.length > 0 ? 'var(--space-4, 16px)' : 0,
              display: '-webkit-box',
              WebkitLineClamp: 5,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
            data-testid="profile-description"
          >
            {description}
          </p>
        )}

        {/* === 競合 ticker chips (3-5 件) === */}
        {!profileLoading && peers.length > 0 && (
          <div style={{ marginTop: summaryOk ? 'var(--space-4, 16px)' : 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: 'var(--space-2, 8px)',
              }}
            >
              競合
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2, 8px)' }}>
              {peers.map((peer) => (
                <Chip
                  key={peer}
                  variant="filter"
                  tone="accent"
                  size="xs"
                  onClick={onNavigateTicker ? () => onNavigateTicker(peer) : undefined}
                  ariaLabel={`${peer} の分析を表示`}
                  data-testid={`profile-peer-chip-${peer}`}
                >
                  {peer}
                </Chip>
              ))}
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </Card>
  );
}
