"use client";

import { useState, useEffect } from "react";
import { STANFORD_NAVIGATOR_URL } from "../lib/constants";

type LeaderboardEntry = {
  course_id: number;
  course_codes: string;
  course_title: string | null;
  search_count: number;
};

type Props = {
  onClose: () => void;
  isMobile?: boolean;
};

export function LeaderboardPanel({ onClose, isMobile }: Props) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => setLeaderboard(d.leaderboard ?? []))
      .catch(() => setLeaderboard([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      data-leaderboard
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "1rem 1.5rem",
          borderBottom: "1px solid #eee",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: "url(/dithered-image-5.jpeg)",
            backgroundSize: "170%",
            backgroundPosition: "-50% 20%",
            opacity: 1,
          }}
        />
        <h2
          style={{
            fontSize: isMobile ? "1.5em" : "1.4em",
            margin: 0,
            fontFamily: '"Jersey 15", sans-serif',
            color: "#1a1a1a",
            position: "relative",
            zIndex: 1,
          }}
        >
          Top 100 most searched
        </h2>
        <button
          type="button"
          onClick={onClose}
          style={{
            fontFamily: '"Roboto Mono", monospace',
            fontSize: isMobile ? "11px" : "10px",
            padding: isMobile ? "0.35rem 0.5rem" : "0.25rem 0.5rem",
            background: "#1a1a1a",
            color: "#f0f0f0",
            border: "none",
            cursor: "pointer",
            position: "relative",
            zIndex: 1,
          }}
        >
          Back
        </button>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem 1.5rem",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {loading ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              flex: 1,
            }}
          >
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: "16px",
                  flex: "1 1 16px",
                  maxHeight: "16px",
                  width: `${70 + (i % 3) * 10}%`,
                  background:
                    "linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)",
                  backgroundSize: "200% 100%",
                  animation: "skeleton-shimmer 1.5s ease-in-out infinite",
                  borderRadius: "2px",
                }}
              />
            ))}
          </div>
        ) : leaderboard.length === 0 ? (
          <div
            style={{
              fontFamily: '"Roboto Mono", monospace',
              fontSize: "11px",
              color: "#666",
              textAlign: "center",
              padding: "2rem",
            }}
          >
            No data yet. Search for courses to build the leaderboard!
          </div>
        ) : (
          <div
            style={{
              margin: 0,
              fontSize: "11px",
              fontFamily: '"Roboto Mono", monospace',
              textAlign: "left",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                paddingBottom: "0.5rem",
                borderBottom: "1px solid #ddd",
                marginBottom: "0.5rem",
              }}
            >
              <span style={{ minWidth: "2em", flexShrink: 0 }}>#</span>
              <span style={{ flex: 1 }}>class name</span>
              <span style={{ flexShrink: 0 }}>searches</span>
            </div>
            {leaderboard.map((entry, idx) => {
              const codes = (entry.course_codes || "")
                .split("/")
                .map((c) => c.trim())
                .filter(Boolean);
              return (
              <div key={entry.course_id}>
                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "baseline",
                  }}
                >
                  <span style={{ minWidth: "2em", flexShrink: 0 }}>
                    {idx + 1}
                  </span>
                  <span style={{ flex: 1, display: "inline" }}>
                    {codes.map((code, i) => (
                      <span key={`${code}-${i}`}>
                        <a
                          href={STANFORD_NAVIGATOR_URL(code)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "#1a1a1a",
                            textDecoration: "underline",
                          }}
                        >
                          {code}
                        </a>
                        {i < codes.length - 1 ? " / " : ""}
                      </span>
                    ))}
                    {entry.course_title ? ` — ${entry.course_title}` : ""}
                  </span>
                  <span style={{ flexShrink: 0 }}>
                    {entry.search_count}
                  </span>
                </div>
                <div
                  style={{
                    height: 1,
                    background: "#ddd",
                    marginTop: "0.5rem",
                    marginBottom: "0.5rem",
                  }}
                />
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
