import React, { useEffect, useRef, useState } from 'react';
import Card from '../../primitives/Card.jsx';
import SectionHeader from '../../primitives/SectionHeader.jsx';
import CompanyLogo from '../../../../components/CompanyLogo.jsx';
import Chip from '../../../../components/ui/Chip.jsx';
import { Building2, MapPin, Users, Briefcase, Sparkles, RefreshCw } from 'lucide-react';
import { fetchProfileExtended, fetchProfileSummary } from '../../../../api.js';
import { sanitizeText } from '../../../../lib/blocklist.js';

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
    },
  };
}

// ─── Shimmer skeleton (must-fix #3) ──────────────────────────────────────────
// infinite animation: pge-loop-debugger 落とし穴 #4 の教訓より
// Playwright snap-*.mjs で getAnimations().finish() を呼ぶ場合は try/catch + iterations check 必須
function SummaryShimmer() {
  return (
    <div
      data-testid="profile-summary-loading"
      style={{ marginTop: 'var(--space-4, 16px)' }}
    >
      <style>{`
        @keyframes bs-profile-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .profile-shimmer-line {
            background: linear-gradient(
              90deg,
              var(--bg-surface-2) 25%,
              var(--bg-surface-3) 50%,
              var(--bg-surface-2) 75%
            );
            background-size: 200% 100%;
            animation: bs-profile-shimmer 1.5s infinite linear;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .profile-shimmer-line {
            background: var(--bg-surface-2);
          }
        }
        .profile-shimmer-line {
          border-radius: var(--radius-sm, 4px);
          height: 12px;
          margin-bottom: 8px;
        }
      `}</style>
      {[70, 55, 65, 50, 60, 45, 70, 40].map((w, i) => (
        <div
          key={i}
          className="profile-shimmer-line"
          style={{ width: `${w}%` }}
        />
      ))}
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          marginTop: 'var(--space-2, 8px)',
          textAlign: 'center',
        }}
      >
        日本語で要約中
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
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Phase B: LLM 和文要約 state (must-fix #5: 3 state UI)
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const summaryAbortRef = useRef(null);

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
    <Card data-testid="profile-card">
      <div style={{ padding: 'var(--space-6, 24px)' }}>

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
                    onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('bs:open-login')); }}
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
                  onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('bs:open-login')); }}
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
      </div>
    </Card>
  );
}
