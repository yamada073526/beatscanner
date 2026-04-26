import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

function Card({ m, onSelect }) {
  const isUp = m.direction === "up";

  return (
    <div
      style={{
        background: "var(--bg-secondary)",
        borderLeft: `3px solid ${isUp ? "#3b82f6" : "#ef4444"}`,
        borderRadius: "0 8px 8px 0",
        padding: "10px 12px",
        marginBottom: "8px",
      }}
    >
      {/* 1行目: ティッカー（クリックで詳細）・株価・騰落率 */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "baseline", marginBottom: "6px",
      }}>
        <div
          onClick={() => onSelect && onSelect(m.ticker)}
          style={{ display: "flex", alignItems: "baseline", gap: "6px", cursor: "pointer" }}
        >
          <span style={{
            fontWeight: 500, fontSize: "14px",
            color: "#2563eb",
            textDecoration: "underline",
            textUnderlineOffset: "2px",
          }}>{m.ticker}</span>
          {m.price != null && (
            <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>${m.price}</span>
          )}
        </div>
        <span style={{ fontWeight: 700, fontSize: "13px",
                       color: isUp ? "#3b82f6" : "#ef4444" }}>
          {m.pct > 0 ? "+" : ""}{m.pct}%
        </span>
      </div>

      {/* 2行目: keyword → 記事リンク */}
      {m.keyword && (
        m.source_url
          ? <a
              href={m.source_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--text-primary)",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
                textDecorationColor: "var(--border)",
              }}
            >
              {m.keyword}
            </a>
          : <span style={{ display: "block", fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
              {m.keyword}
            </span>
      )}
    </div>
  );
}

export default function MoversCard({ onSelect }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  const today = new Date();
  const dateLabel = `${today.getMonth() + 1}月${today.getDate()}日`;

  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);

    fetch(`${API_BASE}/api/movers`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); clearInterval(timer); })
      .catch(() => { setLoading(false); clearInterval(timer); });

    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: "13px", fontWeight: 700,
                      color: "var(--text-primary)", marginBottom: "12px" }}>
          ⚡ {dateLabel}の急騰・急落銘柄 Top 5
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-secondary)",
                      display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            display: "inline-block", width: "12px", height: "12px",
            borderRadius: "50%",
            border: "2px solid var(--text-secondary)",
            borderTopColor: "transparent",
            animation: "spin 0.8s linear infinite",
          }} />
          市場データを取得中... ({elapsed}秒)
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const gainers = data?.gainers ?? [];
  const losers  = data?.losers  ?? [];
  if (!gainers.length && !losers.length) return null;

  return (
    <div style={{ padding: "24px 16px 4px", borderBottom: "1px solid var(--border)", marginBottom: "24px" }}>
      <div style={{ fontSize: "13px", fontWeight: 700,
                    color: "var(--text-primary)", marginBottom: "12px" }}>
        ⚡ {dateLabel}の急騰・急落銘柄 Top 5
      </div>
      <style>{`
        @media (max-width: 600px) {
          .movers-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div
        className="movers-grid"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", alignItems: "start" }}
      >
        {/* 左列: gainers */}
        <div>
          <div style={{
            display: "inline-block", fontSize: "11px", fontWeight: 700,
            background: "#EAF3DE", color: "#3B6D11",
            borderRadius: "4px", padding: "2px 8px", marginBottom: "8px",
          }}>▲ 急騰 Top 5</div>
          {gainers.map((m) => <Card key={m.ticker} m={m} onSelect={onSelect} />)}
        </div>

        {/* 右列: losers */}
        <div>
          <div style={{
            display: "inline-block", fontSize: "11px", fontWeight: 700,
            background: "#FCEBEB", color: "#A32D2D",
            borderRadius: "4px", padding: "2px 8px", marginBottom: "8px",
          }}>▼ 急落 Top 5</div>
          {losers.map((m) => <Card key={m.ticker} m={m} onSelect={onSelect} />)}
        </div>
      </div>
    </div>
  );
}
