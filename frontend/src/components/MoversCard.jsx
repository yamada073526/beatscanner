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
      {/* 1行目: ティッカーピル・株価・騰落率 */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: "6px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            onClick={() => onSelect && onSelect(m.ticker)}
            style={{
              fontSize: 12, fontWeight: 500,
              color: "#2563eb",
              background: "#dbeafe",
              padding: "2px 8px", borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {m.ticker}
          </span>
          {m.price != null && (
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              ${m.price}
            </span>
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
                fontSize: 14, fontWeight: 500,
                color: "var(--text-primary)",
                textDecoration: "none",
                borderBottom: "1.5px solid #378ADD",
                paddingBottom: "1px",
              }}
            >
              {m.keyword}
            </a>
          : <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
              {m.keyword}
            </span>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{
      background: "var(--bg-secondary)",
      borderLeft: "3px solid var(--border)",
      borderRadius: "0 8px 8px 0",
      padding: "10px 12px",
      marginBottom: "8px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
        <div style={{ width: 48, height: 18, borderRadius: 4, background: "var(--border)", animation: "pulse 1.5s ease-in-out infinite" }} />
        <div style={{ width: 36, height: 16, borderRadius: 4, background: "var(--border)", animation: "pulse 1.5s ease-in-out infinite" }} />
      </div>
      <div style={{ width: "70%", height: 14, borderRadius: 4, background: "var(--border)", animation: "pulse 1.5s ease-in-out infinite" }} />
    </div>
  );
}

export default function MoversCard({ onSelect }) {
  const [gainers, setGainers] = useState([]);
  const [losers,  setLosers]  = useState([]);
  const [done,    setDone]    = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const today = new Date();
  const dateLabel = `${today.getMonth() + 1}月${today.getDate()}日`;

  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);

    const es = new EventSource(`${API_BASE}/api/movers/stream`);

    es.onmessage = (e) => {
      if (e.data === "[DONE]") {
        setDone(true);
        es.close();
        clearInterval(timer);
        return;
      }
      try {
        const stock = JSON.parse(e.data);
        if (stock.direction === "up") {
          setGainers((prev) =>
            [...prev, stock].sort((a, b) => b.pct - a.pct)
          );
        } else {
          setLosers((prev) =>
            [...prev, stock].sort((a, b) => a.pct - b.pct)
          );
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      setDone(true);
      clearInterval(timer);
    };

    return () => {
      es.close();
      clearInterval(timer);
    };
  }, []);

  const isEmpty = gainers.length === 0 && losers.length === 0;

  // 初回ロード中（1件も届いていない）
  if (isEmpty && !done) {
    return (
      <div style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: "13px", fontWeight: 700,
                      color: "var(--text-primary)", marginBottom: "12px" }}>
          ⚡ {dateLabel}の急騰・急落銘柄 Top 5
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-secondary)",
                      display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          <span style={{
            display: "inline-block", width: "12px", height: "12px",
            borderRadius: "50%",
            border: "2px solid var(--text-secondary)",
            borderTopColor: "transparent",
            animation: "spin 0.8s linear infinite",
          }} />
          市場データを取得中... ({elapsed}秒)
        </div>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        `}</style>
      </div>
    );
  }

  if (isEmpty) return null;

  // 残りスロット数（最大5枚、まだ届いていない分をスケルトンで埋める）
  const gainerSlots = done ? 0 : Math.max(0, 5 - gainers.length);
  const loserSlots  = done ? 0 : Math.max(0, 5 - losers.length);

  return (
    <div style={{ padding: "24px 16px 4px", borderBottom: "1px solid var(--border)", marginBottom: "24px" }}>
      <div style={{ fontSize: "13px", fontWeight: 700,
                    color: "var(--text-primary)", marginBottom: "12px" }}>
        ⚡ {dateLabel}の急騰・急落銘柄 Top 5
      </div>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
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
          {Array.from({ length: gainerSlots }).map((_, i) => <SkeletonCard key={`gs-${i}`} />)}
        </div>

        {/* 右列: losers */}
        <div>
          <div style={{
            display: "inline-block", fontSize: "11px", fontWeight: 700,
            background: "#FCEBEB", color: "#A32D2D",
            borderRadius: "4px", padding: "2px 8px", marginBottom: "8px",
          }}>▼ 急落 Top 5</div>
          {losers.map((m) => <Card key={m.ticker} m={m} onSelect={onSelect} />)}
          {Array.from({ length: loserSlots }).map((_, i) => <SkeletonCard key={`ls-${i}`} />)}
        </div>
      </div>
    </div>
  );
}
