"use client";

import { useState, useEffect } from "react";
import { CourseTerm, STANFORD_NAVIGATOR_URL } from "../lib/constants";

type LeaderboardEntry = {
  course_id: number;
  course_codes: string;
  course_title: string | null;
  search_count: number;
};

type LeaderboardData = {
  leaderboard: LeaderboardEntry[];
  totalRows: number;
};

const leaderboardCache = new Map<CourseTerm, LeaderboardData>();
const leaderboardRequests = new Map<CourseTerm, Promise<LeaderboardData>>();

export function prefetchLeaderboard(term: CourseTerm): Promise<LeaderboardData> {
  const cached = leaderboardCache.get(term);
  if (cached) return Promise.resolve(cached);

  const existing = leaderboardRequests.get(term);
  if (existing) return existing;

  const request = fetch(`/api/leaderboard?term=${term}`)
    .then((response) => response.json())
    .then((data): LeaderboardData => {
      const normalized = {
        leaderboard: data.leaderboard ?? [],
        totalRows: data.totalRows ?? 0,
      };
      leaderboardCache.set(term, normalized);
      return normalized;
    })
    .finally(() => leaderboardRequests.delete(term));

  leaderboardRequests.set(term, request);
  return request;
}

type Props = {
  onClose: () => void;
  isMobile?: boolean;
  term?: CourseTerm;
  totalCourses?: number;
};

export function LeaderboardPanel({ onClose, isMobile, term = "spring26" }: Props) {
  const cached = leaderboardCache.get(term);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(cached?.leaderboard ?? []);
  const [totalRows, setTotalRows] = useState(cached?.totalRows ?? 0);
  const [loading, setLoading] = useState(!cached);
  const autumnBack = term === "autumn26";
  const ruleColor = autumnBack ? "rgba(91, 67, 39, 0.22)" : "#ddd";

  useEffect(() => {
    const existing = leaderboardCache.get(term);
    if (existing) {
      setLeaderboard(existing.leaderboard);
      setTotalRows(existing.totalRows);
      setLoading(false);
      return;
    }

    setLoading(true);
    const request = prefetchLeaderboard(term);

    let active = true;
    request
      .then((data) => {
        if (!active) return;
        setLeaderboard(data.leaderboard);
        setTotalRows(data.totalRows);
      })
      .catch(() => {
        if (active) setLeaderboard([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [term]);

  return (
    <div
      data-leaderboard
      style={{
        position: "absolute",
        top: 0,
        left: autumnBack ? "14px" : 0,
        right: autumnBack ? "14px" : 0,
        bottom: autumnBack ? "14px" : 0,
        marginTop: autumnBack ? "14px" : 0,
        background: autumnBack
          ? "transparent"
          : "#fff",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minHeight: 0,
        borderRadius: autumnBack ? "12px" : 0,
        border: "none",
        boxShadow: autumnBack
          ? "inset 0 0 24px rgba(94, 69, 42, 0.12), 0 2px 8px rgba(45, 31, 19, 0.2)"
          : "none",
      }}
    >
      <div
        style={{
          padding: autumnBack ? "1rem 2px" : "1rem 1.5rem",
          borderBottom: autumnBack ? "none" : "1px solid #eee",
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
            backgroundImage: autumnBack
              ? "none"
              : "url(/dithered-image-5.jpeg)",
            backgroundSize: autumnBack ? "auto" : "170%",
            backgroundPosition: autumnBack ? "center" : "-50% 20%",
            opacity: 1,
          }}
        />
        <div style={{ position: "relative", zIndex: 1, textAlign: "left" }}>
          <h2
            style={{
              fontSize: autumnBack ? (isMobile ? "1.9em" : "2em") : (isMobile ? "1.5em" : "1.4em"),
              margin: 0,
              fontFamily: '"Jersey 15", sans-serif',
              color: "#1a1a1a",
              letterSpacing: autumnBack ? "0.04em" : undefined,
            }}
          >
            Top 200 searched
          </h2>
        </div>
        <button
          type="button"
          className="autumn-black-grain"
          onClick={onClose}
          style={{
            fontFamily: '"Roboto Mono", monospace',
            fontSize: isMobile ? "11px" : "10px",
            padding: isMobile ? "0.35rem 0.5rem" : "0.25rem 0.5rem",
            background: "#000000",
            color: "#f0f0f0",
            border: "none",
            borderRadius: "8px",
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
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          padding: "1rem 1.5rem",
          background: autumnBack ? "#ffffff" : undefined,
          margin: autumnBack ? "10px 2px 2px" : 0,
          borderRadius: autumnBack ? "12px" : 0,
          color: autumnBack ? "#18130f" : undefined,
          textShadow: "none",
        }}
      >
        {loading ? (
          <div
            style={{
              margin: 0,
              fontSize: "11px",
              fontFamily: '"Roboto Mono", monospace',
              textAlign: "left",
              flex: 1,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                paddingBottom: "0.5rem",
                borderBottom: `1px solid ${ruleColor}`,
                marginBottom: "0.5rem",
              }}
            >
              <span style={{ minWidth: "2em", flexShrink: 0 }}>#</span>
              <span style={{ flex: 1 }}>class name</span>
              <span style={{ flexShrink: 0 }}>searches</span>
            </div>
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i}>
                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "baseline",
                  }}
                >
                  <span style={{ minWidth: "2em", flexShrink: 0, color: "#ccc" }}>
                    {i + 1}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        height: "11px",
                        width: `${45 + (i % 5) * 10}%`,
                        background:
                          "linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)",
                        backgroundSize: "200% 100%",
                        animation: "skeleton-shimmer 1.5s ease-in-out infinite",
                        borderRadius: "2px",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      width: "2em",
                      height: "11px",
                      flexShrink: 0,
                      marginLeft: "auto",
                      background:
                        "linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)",
                      backgroundSize: "200% 100%",
                      animation: "skeleton-shimmer 1.5s ease-in-out infinite",
                      borderRadius: "2px",
                    }}
                  />
                </div>
                <div
                  style={{
                    height: 1,
                    background: ruleColor,
                    marginTop: "0.5rem",
                    marginBottom: "0.5rem",
                  }}
                />
              </div>
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
            {/* <div
              style={{
                paddingBottom: "0.5rem",
                borderBottom: `1px solid ${ruleColor}`,
                marginBottom: "0.25rem",
              }}
            >
              Total results generated: {leaderboard.reduce((sum, e) => sum + e.search_count, 0).toLocaleString()}
            </div>
            <div
              style={{
                paddingBottom: "0.5rem",
                borderBottom: "1px solid #ddd",
                marginBottom: "0.5rem",
              }}
            >
              Total courses discovered: {totalRows.toLocaleString()} / 1973 ({(totalRows / 1973 * 100).toFixed(1)}%)
            </div> */}
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                paddingBottom: "0.5rem",
                borderBottom: `1px solid ${ruleColor}`,
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
                          href={STANFORD_NAVIGATOR_URL(code, term)}
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
                    background: ruleColor,
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
