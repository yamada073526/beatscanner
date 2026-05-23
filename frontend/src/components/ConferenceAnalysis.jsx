import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { streamConferenceText } from '../api.js';
import LockedSection, { ConferenceGhost } from './LockedSection.jsx';
import { AccordionSection } from '../features/judgment/primitives/index.js';

// Phase 2.6 hotfix #9: font-semibold (fw600) → font-medium (fw500) で他 section SectionHeader と整合。
// Stat fw700 / Header fw500 / Body fw400 の 3 階層に合わせ、h2/h3/p[isSection]/strong を fw500 に統一。
// chip 化 (bg-subtle + padding) は維持 (情報階層の visual 区切りとして必要)。
// bg-slate-100 → CSS token var(--bg-subtle) でダークモード対応。
// v100 真の QA #4-3 (handover v100、 user dogfood 再 feedback):
// 旧実装は strong: text-slate-900 / ul: text-slate-700 で dark 非対応、
// h2/h3/p (section heading) が同 idiom + section heading の差別化なし → user「野暮ったい」 認識。
// dark token (var(--text-primary/secondary/--color-accent)) + hierarchy 強化版に統一。
// DetailReport.jsx mdComponents (v100 commit d0c10a7) と 1:1 mirror。
const mdComponents = {
  h2: ({ children }) => (
    <h2 style={{
      fontSize: '15px', fontWeight: 700,
      color: 'var(--text-primary)',
      background: 'var(--bg-subtle)',
      borderRadius: '6px',
      padding: '8px 12px',
      marginTop: '24px', marginBottom: '10px',
      borderLeft: '3px solid var(--color-accent, #38BDF8)',
      lineHeight: 1.4,
    }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 style={{
      fontSize: '13px', fontWeight: 700,
      color: 'var(--text-primary)',
      marginTop: '16px', marginBottom: '4px',
      lineHeight: 1.4,
    }}>{children}</h3>
  ),
  p: ({ children }) => {
    const text = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : '';
    // v40+: 旧 ①②③④⑤ 番号と新 【...】見出しの両方をハイライト
    const isSection = /^[①②③④⑤]/.test(text) || /^【.+】/.test(text);
    if (isSection) {
      return (
        <p style={{
          fontSize: '14px', fontWeight: 700,
          color: 'var(--text-primary)',
          background: 'var(--bg-subtle)',
          borderRadius: '6px',
          padding: '8px 12px',
          marginTop: '20px', marginBottom: '8px',
          borderLeft: '3px solid var(--color-accent, #38BDF8)',
          lineHeight: 1.4,
        }}>
          {children}
        </p>
      );
    }
    return <p style={{
      fontSize: '13px',
      color: 'var(--text-secondary)',
      marginBottom: '12px',
      lineHeight: 1.7,
    }}>{children}</p>;
  },
  strong: ({ children }) => (
    <strong style={{
      fontWeight: 700,
      color: 'var(--color-accent, #38BDF8)',
    }}>{children}</strong>
  ),
  ul: ({ children }) => (
    <ul style={{
      fontSize: '13px',
      color: 'var(--text-secondary)',
      marginBottom: '12px',
      paddingLeft: '20px',
      listStyleType: 'disc',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    }}>{children}</ul>
  ),
  li: ({ children }) => (
    <li style={{ lineHeight: 1.7 }}>{children}</li>
  ),
};

/* ─── ConferenceCard（内部コンテンツのみ） ─── */
/* handover v100 release MVP item 1 (2026-05-23 着地):
 *   旧自前 AccordionSection (94-156 行) を共通 primitive
 *   (features/judgment/primitives/AccordionSection) に置換。
 *   width クリッピング問題は共通 primitive 側 panelInner + symmetric padding で完全解消。
 *   badgeColor + streaming props は共通 primitive に追加済 (release MVP item 1)。
 */
function ConferenceCard({ ticker, onStreamingChange }) {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    const controller = new AbortController();
    setStreaming(true);
    setDone(false);
    setError(null);
    setText('');
    onStreamingChange?.(true);

    streamConferenceText(ticker, (chunk) => {
      setText((prev) => prev + chunk);
    }, controller.signal)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setStreaming(false);
          setDone(true);
          onStreamingChange?.(false);
        }
      });

    return () => {
      controller.abort();
      onStreamingChange?.(false);
    };
  }, [ticker]);

  return (
    <>
      {streaming && !text && <p className="text-sm text-slate-500 animate-pulse">カンファレンスコール分析を生成中...</p>}
      {error && <p className="text-sm text-red-500">データ取得に失敗しました: {error}</p>}
      {streaming && text && <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{text}</p>}
      {done && text && <ReactMarkdown components={mdComponents}>{text}</ReactMarkdown>}
    </>
  );
}

/* handover v83 P2 (2026-05-18): AnalystCard + 周辺 helper (formatFiscalQuarter / fmtEps / fmtSurprisePct)
   は AnalystPanel (Phase 3 着地、 features/judgment/components/detail/JudgmentDetail.jsx:267-275) 移行により
   完全 dead code 化。 219 行削除、 bundle 削減 5-8 KB 見込み。
   再表示が必要になったら git history から復元可能。 */

/* ─── ConferenceAnalysis（アコーディオン統合） ─── */
export default function ConferenceAnalysis({ ticker, onStreamingChange, isPro = true, onUpgrade }) {
  // handover v83 P2 (2026-05-18): analyst / analystData / analystLoading state + useEffect (旧 AnalystCard 用) は
  // AnalystPanel 移行で完全 dead 化、 削除。 confStreaming のみ ConferenceCard streaming 用に維持。
  const [confStreaming, setConfStreaming] = useState(false);

  const handleConfStreaming = (v) => {
    setConfStreaming(v);
    onStreamingChange?.(v);
  };

  return (
    <>
      <AccordionSection
        id="conference-analysis"
        tier={2}
        title="決算ハイライト分析"
        badge={isPro ? "AI分析" : "PRO"}
        badgeColor={isPro ? "var(--badge-ai-bg)" : "var(--badge-pro-bg)"}
        streaming={isPro && confStreaming}
      >
        {isPro ? (
          <ConferenceCard ticker={ticker} onStreamingChange={handleConfStreaming} />
        ) : (
          <LockedSection
            ctaLabel="ハイライトを見る"
            onUpgrade={onUpgrade}
            minHeight={300}
            hint="四半期業績・コンセンサス乖離・マージン軌道をアナリスト視点で要約"
          >
            <ConferenceGhost />
          </LockedSection>
        )}
      </AccordionSection>

      {/* handover v83 P2 (2026-05-18 dogfood): 「アナリストの視点 EPS Beat/Miss履歴」
          AccordionSection は新 UI AnalystPanel (Phase 3 着地、 features/judgment/components/detail/JudgmentDetail.jsx:267-275)
          と内容完全重複のため削除。 fetchAnalystData の useEffect は streaming 等の副作用
          として残置 (ConferenceCard が依存する場合の安全側)。 削除前: 23 行 + AnalystCard / AnalystGhost import。 */}
    </>
  );
}
