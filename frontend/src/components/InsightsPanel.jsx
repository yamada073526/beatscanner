import { useState, useEffect } from "react";
import InfoModal from "./InfoModal.jsx";
import LockedSection, { InsightsGhost } from "./LockedSection.jsx";
import { BarChart3, Search } from "lucide-react";

// CLAUDE.md「投資業界の色ルール」準拠:
// 強気(Bullish)=緑 / 弱気(Bearish)=赤 / 中立=グレー / 強弱混在=amber
// シアンはブランド色のため方向性 (positive/negative) には使わない.
const SENTIMENT = {
  positive: { label: "強気",     color: "var(--color-gain)" },
  negative: { label: "弱気",     color: "var(--color-loss)" },
  neutral:  { label: "中立",     color: "var(--text-muted)" },
  mixed:    { label: "強弱混在", color: "var(--color-warning)" },
};

// 「市場の声」見出し横の ? — ConditionCard と統一スタイル + クリックでモーダル表示
function InfoButton({ onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-[9px] font-bold transition-colors"
      style={{
        background: "rgba(56, 189, 248,0.15)",
        color: "rgb(56, 189, 248)",
        border: "1px solid rgba(56, 189, 248,0.4)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(56, 189, 248,0.30)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(56, 189, 248,0.15)"; }}
      aria-label="市場の声についての説明を表示"
    >
      ?
    </button>
  );
}

// 「市場の声とは」モーダル — 5セクション構成
function InsightsInfoModal({ onClose }) {
  return (
    <InfoModal title="市場の声とは" onClose={onClose}>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">📌 概要</p>
        <p className="text-sm leading-relaxed text-slate-700">
          本アプリの「市場の声」は、複数の投資家・アナリストの見解を
          AIが統合した独自分析です。大衆の推奨銘柄を真似するためではなく、
          市場参加者の心理（センチメント）を客観的に観察し、
          <span style={{ color: 'rgb(56, 189, 248)', fontWeight: 500 }}>大衆の逆を突く</span>ための判断材料として活用してください。
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">🔥 大衆の熱狂は最大の売りシグナル</p>
        <p className="text-sm leading-relaxed text-slate-700">
          SNSで投資家が熱狂し「ガチホだ！」と力んでいる銘柄は、
          買いたい人が全員買ってしまっており、
          将来の潜在的な売り圧力が溜まっている危険な状態です。
        </p>
        <p className="mt-2 text-sm italic leading-relaxed text-slate-600">
          「強気相場は総悲観の中で生まれ、多幸感に包まれた時頓死する」
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">🏚 誰も注目しない場所にこそ機会がある</p>
        <p className="text-sm leading-relaxed text-slate-700">
          みんなが同じテーマに群がっている「満員の映画館」では
          大きな利益を得るのは困難です。
          誰も見向きもしない銘柄・セクターにこそ
          真の投資機会が転がっています。
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">😰 葛藤なきポジションに大勝ちはない</p>
        <p className="text-sm leading-relaxed text-slate-700">
          相場が暴落して誰もが悲観している時、
          「この株を買うのは怖いな…」と手が震えるような
          <span style={{ color: 'rgb(56, 189, 248)', fontWeight: 500 }}>葛藤を抱えながら建てたポジション</span>こそが、
          後にお宝銘柄へと育つケースが多いです。
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">📈 株価が語りかける声に耳を澄ます</p>
        <p className="text-sm leading-relaxed text-slate-700">
          株式市場には「先見性」があり、実体経済のデータよりも
          何ヶ月も先を読んで動きます。
          「良いニュースが出たのに株価が下がる」場合は、
          好材料が既に織り込まれ尽くしたサインです。
          <span style={{ color: 'rgb(56, 189, 248)', fontWeight: 500 }}>「相場は相場に聞け」</span>の精神で、
          株価が発する違和感を素直に受け止める柔軟性が重要です。
        </p>
      </div>
    </InfoModal>
  );
}

// 進捗ステップ表示（楽観的タイマー）
// elapsed >= 3 で表示開始 → 「ちゃんと動いている感」を演出
// elapsed >= 15 で「初回分析は最大60秒かかる」案内を追加
function ProgressSteps({ loading }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return;
    }
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  if (elapsed < 3) return null;

  const steps = [
    { label: "ニュースを収集", done: elapsed >= 3 },
    { label: "AI で統合分析中", done: elapsed >= 8 },
    { label: "強気・弱気材料を抽出", done: elapsed >= 15 },
  ];

  return (
    <div style={{
      marginTop: 'var(--space-4, 16px)',
      padding: 'var(--space-3, 12px)',
      background: "rgba(56, 189, 248,0.06)",
      border: "1px solid rgba(56, 189, 248,0.20)",
      borderRadius: 8,
      fontSize: 12,
      color: "var(--text-muted)",
    }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 'var(--space-2, 8px)', alignItems: "center", marginBottom: 'var(--space-1, 4px)' }}>
          <span style={{ width: 14, color: s.done ? "rgb(56, 189, 248)" : "var(--text-muted)" }}>
            {s.done ? "✓" : "⟳"}
          </span>
          <span style={{ color: s.done ? "var(--text-secondary)" : "var(--text-muted)" }}>
            {s.label}
          </span>
        </div>
      ))}
      {elapsed >= 15 && (
        <div style={{ marginTop: 'var(--space-2, 8px)', color: "var(--text-muted)", fontSize: 11, lineHeight: 1.6 }}>
          ℹ️ 初めて分析する銘柄のため、通常より時間がかかっています（最大60秒）
          <br />📌 次回からは即座に表示されます
        </div>
      )}
    </div>
  );
}

// 実コンテンツ形状のスケルトン: ヘッダー + summary 3行 + 強気/弱気 2カラム
function InsightsSkeleton() {
  const skel = {
    background: "var(--bg-subtle)",
    borderRadius: 4,
    animation: "pulse 1.5s ease-in-out infinite",
  };
  const subSkel = {
    background: "rgba(255,255,255,0.08)",
    borderRadius: 4,
  };
  return (
    <div>
      {/* サマリー行 3 本 */}
      <div style={{
        padding: 'var(--space-4, 16px)',
        borderRadius: 10,
        background: "rgba(56, 189, 248,0.04)",
        border: "1px solid rgba(56, 189, 248,0.15)",
        marginBottom: 'var(--space-4, 16px)',
      }}>
        {[100, 92, 70].map((w, i) => (
          <div key={i} style={{ ...skel, width: `${w}%`, height: 12, marginBottom: i < 2 ? 10 : 0 }} />
        ))}
      </div>
      {/* 強気 / 弱気 2 カラム */}
      <div className="md:grid-cols-2" style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 'var(--space-3, 12px)',
      }}>
        {[0, 1].map((i) => (
          <div key={i} style={{
            padding: 'var(--space-3, 12px) var(--space-4, 16px)',
            borderRadius: 10,
            background: i === 0 ? "rgba(56, 189, 248,0.04)" : "rgba(248,113,113,0.04)",
            border: `1px solid ${i === 0 ? "rgba(56, 189, 248,0.15)" : "rgba(248,113,113,0.15)"}`,
          }}>
            <div style={{ ...skel, width: 70, height: 12, marginBottom: 'var(--space-3, 12px)' }} />
            {[80, 65, 75].map((w, j) => (
              <div key={j} style={{ ...subSkel, width: `${w}%`, height: 10, marginBottom: 'var(--space-2, 8px)' }} />
            ))}
          </div>
        ))}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>
    </div>
  );
}

function SentimentBadge({ sentiment }) {
  const sc = SENTIMENT[sentiment] || SENTIMENT.neutral;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      fontSize: 11,
      fontWeight: 500,
      letterSpacing: "0.02em",
      color: sc.color,
      background: `${sc.color}1f`,           // ≈ 0.12 alpha
      border: `1px solid ${sc.color}66`,     // ≈ 0.40 alpha
      borderRadius: 9999,
      padding: "3px 10px",
    }}>
      {sc.label}
    </span>
  );
}

// Pro 会員向けフル表示（統合見解 + 強気/弱気 2カラム + 注目指標）
function FullView({ data }) {
  return (
    <>
      {/* 統合見解（400字） — v40+: panel-card で LP と同じ発光・ホバー演出 */}
      {data.summary && (
        <div className="panel-card" style={{
          padding: 'var(--space-4, 16px)',
          borderRadius: 10,
          background: "rgba(56, 189, 248,0.07)",
          border: "1px solid rgba(56, 189, 248,0.25)",
          fontSize: 13,
          lineHeight: 1.75,
          marginBottom: 'var(--space-4, 16px)',
          color: "var(--text-primary)",
        }}>
          {data.summary}
        </div>
      )}

      {/* 強気 / 弱気 2カラム — v40+: panel-card で発光・ホバー演出 */}
      {(data.bull_points?.length > 0 || data.bear_points?.length > 0) && (
        <div
          className="md:grid-cols-2"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 'var(--space-3, 12px)',
            marginBottom: 'var(--space-4, 16px)',
          }}
        >
          {data.bull_points?.length > 0 && (
            <div className="panel-card" style={{
              padding: 'var(--space-3, 12px) var(--space-4, 16px)',
              borderRadius: 10,
              background: "rgba(56, 189, 248,0.07)",
              border: "1px solid rgba(56, 189, 248,0.25)",
            }}>
              <div style={{
                fontSize: 11, fontWeight: 500, color: "rgb(56, 189, 248)",
                letterSpacing: "0.06em", marginBottom: 'var(--space-2, 8px)',
              }}>
                🟢 強気材料
              </div>
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                {data.bull_points.map((p, i) => (
                  <li key={i} style={{
                    display: "flex", gap: 'var(--space-2, 8px)', fontSize: 12.5,
                    lineHeight: 1.65, color: "var(--text-primary)",
                    marginBottom: 'var(--space-1, 4px)',
                  }}>
                    <span style={{ color: "rgb(56, 189, 248)", flexShrink: 0 }}>・</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.bear_points?.length > 0 && (
            <div className="panel-card" style={{
              padding: 'var(--space-3, 12px) var(--space-4, 16px)',
              borderRadius: 10,
              background: "rgba(248,113,113,0.07)",
              border: "1px solid rgba(248,113,113,0.25)",
            }}>
              <div style={{
                fontSize: 11, fontWeight: 500, color: "#f87171",
                letterSpacing: "0.06em", marginBottom: 'var(--space-2, 8px)',
              }}>
                🔴 弱気材料
              </div>
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                {data.bear_points.map((p, i) => (
                  <li key={i} style={{
                    display: "flex", gap: 'var(--space-2, 8px)', fontSize: 12.5,
                    lineHeight: 1.65, color: "var(--text-primary)",
                    marginBottom: 'var(--space-1, 4px)',
                  }}>
                    <span style={{ color: "#f87171", flexShrink: 0 }}>・</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 注目指標 pill */}
      {data.key_metrics?.length > 0 && (
        <div>
          <div style={{
            fontSize: 11, fontWeight: 500, color: "var(--text-muted)",
            letterSpacing: "0.06em", marginBottom: 'var(--space-2, 8px)',
          }}>
            📌 注目指標
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 'var(--space-2, 8px)' }}>
            {data.key_metrics.map((m, i) => (
              <span key={i} style={{
                display: "inline-block", fontSize: 11.5,
                color: "var(--text-secondary)",
                background: "var(--bg-subtle)",
                border: "1px solid var(--border)",
                borderRadius: 9999, padding: "3px 10px",
              }}>
                {m}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// 未ログイン向けチラ見せ表示
// - センチメントバッジ（結論だけ公開）
// - summary 冒頭 80 文字を平文 + 続きを blur(4px) でぼかし表示
// - 「Googleで続ける（30秒・無料）」CTA で signInWithGoogle を直接トリガー
function NonLoggedTeaserView({ data, ticker, onSignIn }) {
  const hasData = data && data.found && data.summary;
  const fullSummary = hasData ? data.summary : "";
  const previewClear = fullSummary.slice(0, 80);
  const previewBlurred = fullSummary.slice(80, 220) || "次の段落の分析がここに続きます。強気・弱気の理由、注目すべきキー指標などをログイン後にご覧いただけます。";

  return (
    <div>
      {/* データあり: チラ見せ。データなし: 価値訴求のみ */}
      {hasData && (
        <div style={{ position: "relative", marginBottom: 'var(--space-4, 16px)' }}>
          {/* 平文プレビュー（最初の80文字） */}
          <div style={{
            padding: 'var(--space-4, 16px) var(--space-4, 16px) var(--space-2, 8px)',
            borderRadius: "10px 10px 0 0",
            background: "rgba(56, 189, 248,0.07)",
            border: "1px solid rgba(56, 189, 248,0.25)",
            borderBottom: "none",
            fontSize: 13,
            lineHeight: 1.75,
            color: "var(--text-primary)",
          }}>
            {previewClear}…
          </div>
          {/* ぼかし続き（blur(4px) + マスクで自然にフェードアウト） */}
          <div style={{
            position: "relative",
            padding: '0 var(--space-4, 16px) var(--space-4, 16px)',
            borderRadius: "0 0 10px 10px",
            background: "rgba(56, 189, 248,0.07)",
            borderLeft: "1px solid rgba(56, 189, 248,0.25)",
            borderRight: "1px solid rgba(56, 189, 248,0.25)",
            borderBottom: "1px solid rgba(56, 189, 248,0.25)",
            fontSize: 13,
            lineHeight: 1.75,
            color: "var(--text-primary)",
            filter: "blur(4px)",
            userSelect: "none",
            pointerEvents: "none",
            maxHeight: 60,
            overflow: "hidden",
            WebkitMaskImage: "linear-gradient(to bottom, black 0%, transparent 95%)",
            maskImage: "linear-gradient(to bottom, black 0%, transparent 95%)",
          }}>
            {previewBlurred}
          </div>
        </div>
      )}

      {/* 価値訴求 + Google ログイン CTA */}
      <div style={{
        padding: 'var(--space-5, 20px)',
        borderRadius: 12,
        border: "1px solid rgba(56, 189, 248,0.35)",
        background: "rgba(56, 189, 248,0.07)",
        textAlign: "center",
      }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: "rgb(56, 189, 248)",
          marginBottom: 'var(--space-3, 12px)',
        }}>
          ✅ ログインすると見られる内容
        </div>
        <div style={{
          fontSize: 12, color: "var(--text-muted)",
          marginBottom: 'var(--space-4, 16px)', lineHeight: 1.9, textAlign: "left",
          display: "inline-block",
        }}>
          ・全銘柄の市場分析を毎朝更新<br />
          ・強気/弱気の理由を構造化表示<br />
          ・注目すべきキー指標を抽出
        </div>
        <div>
          <button
            type="button"
            onClick={onSignIn}
            style={{
              padding: 'var(--space-3, 12px) var(--space-8, 32px)',
              borderRadius: 10,
              border: "none",
              background: "rgb(56, 189, 248)",
              color: "#0f172a",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 'var(--space-2, 8px)',
              boxShadow: "0 0 12px rgba(56, 189, 248,0.30)",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#06b6d4"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgb(56, 189, 248)"; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#0f172a" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#0f172a" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#0f172a" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#0f172a" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Googleで続ける（30秒・無料）
          </button>
        </div>
      </div>
    </div>
  );
}

// Free 会員向けチラ見せ表示
//   v40+: 統合見解の冒頭 1 文を実データで表示し、その下に Pro 時の構造
//   (強気/弱気 2カラム + 注目指標 pill) を ghost skeleton で再現。
//   下部に向かって veil でフェード、aurora 発光 + CTA chip 1個。
function TeaserView({ data, onUpgrade }) {
  // 「。」「.」で区切って冒頭 1 文だけを抽出 (最大 70 文字でクリップ)
  const summary = data.summary || "";
  const firstSentenceRaw = summary.split(/[。\.]/)[0] || "";
  const previewSentence = firstSentenceRaw
    ? firstSentenceRaw.slice(0, 70) + (firstSentenceRaw.length > 70 ? "…" : "。")
    : `${data.ticker || "この銘柄"} の市場の声を分析しました。`;

  return (
    <LockedSection
      ctaLabel="続きを読む"
      onUpgrade={onUpgrade}
      minHeight={380}
    >
      <InsightsGhost previewSentence={previewSentence} />
    </LockedSection>
  );
}

export default function InsightsPanel({ ticker, user, isPro, onUpgradeClick, onSignIn }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // 「もう一度分析する」ボタン用: refetchKey が変わると useEffect が再実行され、
  // ?refresh=1 を付けて全キャッシュ層をバイパスして再取得する。
  const [refetchKey, setRefetchKey] = useState(0);
  // ? ボタンクリックで「市場の声とは」モーダルを開く
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  // 未ログインでもキャッシュ済みデータがあればチラ見せできるよう fetch する。
  // BE 側 /api/insights/{ticker} は認証不要（5層フォールバック内で Supabase の
  // キャッシュデータがあれば即返、なければオンデマンド RSS）。
  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setData(null);
    setError(null);
    // AbortController で 75 秒タイムアウト（BE は 60 秒で found:false 返却するが念のため）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 75000);
    const url = refetchKey > 0
      ? `/api/insights/${ticker}?refresh=1`
      : `/api/insights/${ticker}`;
    fetch(url, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => {
        if (cancelled) return;
        if (err && err.name === "AbortError") {
          setError("分析に時間がかかっています。しばらくしてから再度お試しください");
        } else {
          setError("取得に失敗しました");
        }
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [ticker, user, refetchKey]);

  // Pro CTA: App.jsx から渡された UpgradeModal オープナーを呼ぶ
  // （Stripe チェックアウトボタンへの導線）
  const handleUpgrade = onUpgradeClick || (() => {});

  // 未ログイン: チラ見せ + センチメントバッジ + Google ログイン CTA
  if (!user) {
    return (
      <div style={{ margin: 'var(--space-6, 24px) 0' }}>
        {/* ヘッダー: タイトル + ? + センチメントバッジ（結論だけ公開） */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 'var(--space-2, 8px)',
          marginBottom: 'var(--space-4, 16px)',
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-2, 8px)' }}>
            <span className="section-heading" style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <span className="section-header-icon" aria-hidden="true">
                <BarChart3 size={18} strokeWidth={1.5} />
              </span>
              市場の声
            </span>
            <InfoButton onOpen={() => setIsInfoOpen(true)} />
          </div>
          {data && data.found && !loading && (
            <SentimentBadge sentiment={data.overall_sentiment} />
          )}
        </div>

        {/* ローディング中: 実コンテンツ形状スケルトン + 進捗ステップ */}
        {loading && (
          <>
            <InsightsSkeleton />
            <ProgressSteps loading={loading} />
          </>
        )}

        {/* データ取得後: チラ見せビュー */}
        {!loading && (
          <NonLoggedTeaserView
            data={data && data.found ? data : null}
            ticker={ticker}
            onSignIn={onSignIn}
          />
        )}

        {/* 「市場の声とは」モーダル */}
        {isInfoOpen && <InsightsInfoModal onClose={() => setIsInfoOpen(false)} />}
      </div>
    );
  }

  return (
    <div style={{ margin: "24px 0" }}>
      {/* ヘッダー: タイトル + ? + センチメントバッジ */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 'var(--space-2, 8px)',
        marginBottom: 'var(--space-4, 16px)',
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-2, 8px)' }}>
          <span className="section-heading" style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <span className="section-header-icon" aria-hidden="true">
              <BarChart3 size={18} strokeWidth={1.5} />
            </span>
            市場の声
          </span>
          <InfoButton onOpen={() => setIsInfoOpen(true)} />
        </div>
        {data && data.found && !loading && (
          <SentimentBadge sentiment={data.overall_sentiment} />
        )}
      </div>

      {/* ローディング: 実コンテンツ形状スケルトン + 進捗ステップ */}
      {loading && (
        <>
          <InsightsSkeleton />
          <ProgressSteps loading={loading} />
        </>
      )}

      {/* エラー */}
      {error && (
        <div style={{ color: "#f87171", fontSize: 13 }}>{error}</div>
      )}

      {/* データなし - Pro なら準備中表示+再分析ボタン / Free なら Teaser CTA */}
      {data && !data.found && !loading && (
        isPro ? (
          <div style={{
            padding: 'var(--space-5, 20px) var(--space-4, 16px)',
            borderRadius: 10,
            background: "var(--bg-subtle)",
            border: "1px solid var(--border)",
            fontSize: 13,
            color: "var(--text-secondary)",
            textAlign: "center",
            lineHeight: 1.75,
          }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 'var(--space-2, 8px)', color: "var(--text-muted)" }}>
              <Search size={24} strokeWidth={1.5} />
            </div>
            <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 'var(--space-2, 8px)' }}>
              {ticker} の市場データを準備しています
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 'var(--space-4, 16px)' }}>
              現在この銘柄の情報を収集中です。<br />
              しばらく経ってから再度ご確認いただくか、<br />
              ウォッチリストに追加すると次回から優先的に分析されます。
            </div>
            <button
              type="button"
              onClick={() => setRefetchKey((k) => k + 1)}
              style={{
                background: "rgba(56, 189, 248,0.12)",
                color: "rgb(56, 189, 248)",
                border: "1px solid rgba(56, 189, 248,0.4)",
                borderRadius: 8,
                padding: 'var(--space-2, 8px) var(--space-5, 20px)',
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(56, 189, 248,0.20)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(56, 189, 248,0.12)"; }}
            >
              🔄 もう一度分析する
            </button>
          </div>
        ) : (
          <TeaserView
            data={{ summary: `${ticker} の市場の声を分析しています。` }}
            onUpgrade={handleUpgrade}
          />
        )
      )}

      {/* データあり: Pro→FullView / Free→TeaserView */}
      {data && data.found && !loading && (
        isPro
          ? <FullView data={data} />
          : <TeaserView data={data} onUpgrade={handleUpgrade} />
      )}

      {/* 「市場の声とは」モーダル */}
      {isInfoOpen && <InsightsInfoModal onClose={() => setIsInfoOpen(false)} />}
    </div>
  );
}
