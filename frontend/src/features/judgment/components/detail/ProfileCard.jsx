import React, { useEffect, useState } from 'react';
import Card from '../../primitives/Card.jsx';
import SectionHeader from '../../primitives/SectionHeader.jsx';
import CompanyLogo from '../../../../components/CompanyLogo.jsx';
import Chip from '../../../../components/ui/Chip.jsx';
import { Building2, MapPin, Users, Briefcase } from 'lucide-react';
import { fetchProfileExtended } from '../../../../api.js';

/**
 * Phase A 会社概要静的拡張 (SPEC_2026-05-21 §5-4)
 *
 * 表示項目:
 *   - ロゴ (CompanyLogo primitive 流用) + 会社名 + ticker
 *   - description (FMP 英語 ~300-800 字、Phase A は翻訳なし)
 *   - 本社所在地 (city, state, country)
 *   - 従業員数 (fullTimeEmployees、桁区切り)
 *   - セクター / 業界 (sector / industry)
 *   - 競合 ticker chips (peers 3-5 件、click で銘柄 navigate)
 *
 * Trust Cliff 解消: LP「AI 詳細レポート」 vs 現状「会社名のみ」 を静的拡張で最低限解消。
 * LLM 不使用・Hallucination Guard Layer 1 のみ (aggregator/*.py 変更 0 件)。
 * design_system.md §B-2 (Heading 18px / fw500) に準拠。
 * 投資業界色ルール: chip は brand cyan tint OK (上昇/下落の意味なし)。
 */

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

export default function ProfileCard({ ticker, companyName, dataSource, latestPeriod, latestDate, onNavigateTicker }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    // Phase 2.6 Evaluator FAIL-3 hotfix: race condition 対策。
    // AAPL → NVDA 高速切替時の古い response が新 ticker state を上書きする問題を AbortController で防ぐ。
    const ac = new AbortController();
    setLoading(true);
    fetchProfileExtended(ticker, { signal: ac.signal })
      .then((d) => {
        if (!ac.signal.aborted) setProfile(d);
      })
      .catch((err) => {
        // AbortError は無視 (race condition cleanup の正常動作)
        if (err?.name === 'AbortError') return;
        if (!ac.signal.aborted) setProfile(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [ticker]);

  if (!ticker) return null;

  const description = profile?.description || null;
  const location = buildLocation(profile?.city, profile?.state, profile?.country);
  const employees = formatEmployees(profile?.fullTimeEmployees);
  const sector = profile?.sector || null;
  const industry = profile?.industry || null;
  const peers = Array.isArray(profile?.peers) ? profile.peers : [];
  const mktCapStr = formatMktCap(profile?.mktCap);

  return (
    <Card>
      <div style={{ padding: 'var(--space-6, 24px)' }}>
        <SectionHeader id="sec-profile" icon={<Building2 size={18} strokeWidth={1.5} />} title="プロフィール" label="COMPANY" />

        {/* === ロゴ + 会社名 + サブテキスト === */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4, 16px)',
            marginBottom: 'var(--space-4, 16px)',
          }}
        >
          {/* CompanyLogo は 3 段フォールバック (TV → FMP → 頭文字円) で自動解決 */}
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
              {companyName || profile?.companyName || ticker}
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

        {/* === メタデータ行 (時価総額 / 本社 / 従業員 / セクター) === */}
        {!loading && profile && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-3, 12px)',
              marginBottom: description || peers.length > 0 ? 'var(--space-4, 16px)' : 0,
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

        {/* === description (英語、Phase A 翻訳なし) === */}
        {!loading && description && (
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.65,
              color: 'var(--text-secondary)',
              marginBottom: peers.length > 0 ? 'var(--space-4, 16px)' : 0,
              /* 最大 5 行で truncate (読み手負担軽減原則 §1) */
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

        {/* === loading skeleton === */}
        {loading && (
          <div style={{ marginTop: 'var(--space-2, 8px)' }}>
            <div
              className="rounded animate-pulse"
              style={{ height: 12, width: '60%', background: 'var(--bg-muted)', marginBottom: 8 }}
            />
            <div
              className="rounded animate-pulse"
              style={{ height: 12, width: '80%', background: 'var(--bg-muted)', marginBottom: 8 }}
            />
            <div
              className="rounded animate-pulse"
              style={{ height: 12, width: '45%', background: 'var(--bg-muted)' }}
            />
          </div>
        )}

        {/* === 競合 ticker chips (3-5 件) === */}
        {!loading && peers.length > 0 && (
          <div>
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
