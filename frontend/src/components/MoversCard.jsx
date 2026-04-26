import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

function Card({ m, onSelect }) {
  const isUp = m.direction === "up";

  return (
    <div
      onClick={() => onSelect && onSelect(m.ticker)}
      style={{
        background: "var(--bg-secondary)",
        borderLeft: `3px solid ${isUp ? "#3b82f6" : "#ef4444"}`,
        borderRight: "none",
        borderTop: "none",
        borderBottom: "none",
        borderRadius: "0 8px 8px 0",
        padding: "10px 12px",
        cursor: "pointer",
      }}
    >
      {/* 1行目: ティッカー・株価・騰落率 */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "baseline", marginBottom: "4px",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
          <span style={{ fontWeight: 700, fontSize: "14px",
                         color: "var(--text-primary)" }}>{m.ticker}</span>
          {m.price != null && (
            <span style={{ fontSize: "11px",
                           color: "var(--text-secondary)" }}>${m.price}</span>
          )}
        </div>
        <span style={{ fontWeight: 700, fontSize: "13px",
                       color: isUp ? "#3b82f6" : "#ef4444" }}>
          {m.pct > 0 ? "+" : ""}{m.pct}%
        </span>
      </div>

      {/* 2行目: キーワード */}
      {m.keyword && (
        <div style={{
          fontSize: "13px", fontWeight: 700,
          color: "var(--text-primary)", marginBottom: "3px",
        }}>
          {m.keyword}
        </div>
      )}

      {/* 3行目: detail */}
      {m.detail && (
        <div style={{
          fontSize: "11px",
          color: "var(--text-secondary)",
          lineHeight: 1.5,
          marginBottom: "5px",
        }}>
          {m.detail}
        </div>
      )}

      {/* 4行目: ソースpill */}
      {m.source_name && m.source_url && (
        <div
          onClick={(e) => { e.stopPropagation(); window.open(m.source_url, "_blank"); }}
          style={{
            display: "inline-block",
            fontSize: "10px",
            color: "var(--text-secondary)",
            background: "var(--bg-primary)",
            border: "0.5px solid var(--border)",
            borderRadius: "4px",
            padding: "1px 6px",
            cursor: "pointer",
          }}
        >
          {m.source_name}
        </div>
      )}
    </div>
  );
}

function Section({ title, list, onSelect }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ fontSize: "11px", fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: "8px", paddingLeft: "2px" }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
        {list.map((m) => <Card key={m.ticker} m={m} onSelect={onSelect} />)}
      </div>
    </div>
  );
}

export default function MoversCard({ onSelect }) {
  const [movers, setMovers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);

    fetch(`${API_BASE}/api/movers`)
      .then((r) => r.json())
      .then((d) => { setMovers(d.movers); setLoading(false); clearInterval(timer); })
      .catch(() => { setLoading(false); clearInterval(timer); });

    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: "13px", fontWeight: 700,
                      color: "var(--text-primary)", marginBottom: "12px" }}>
          ⚡ 本日の注目銘柄
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
  if (!movers || movers.length === 0) return null;

  const ups   = movers.filter((m) => m.direction === "up");
  const downs = movers.filter((m) => m.direction === "down");

  return (
    <div style={{ padding: "16px 16px 4px", borderBottom: "1px solid var(--border)" }}>
      <div style={{ fontSize: "13px", fontWeight: 700,
                    color: "var(--text-primary)", marginBottom: "12px" }}>
        ⚡ 本日の注目銘柄
      </div>
      {ups.length   > 0 && <Section title="🔵 急騰" list={ups}   onSelect={onSelect} />}
      {downs.length > 0 && <Section title="🔴 急落" list={downs} onSelect={onSelect} />}
    </div>
  );
}
