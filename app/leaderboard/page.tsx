"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { STANFORD_NAVIGATOR_URL } from "../lib/constants";

type LeaderboardEntry = {
  course_id: number;
  course_codes: string;
  course_title: string | null;
  search_count: number;
};

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => setLeaderboard(d.leaderboard ?? []))
      .catch(() => setLeaderboard([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        fontFamily: '"Jersey 15", sans-serif',
        backgroundColor: "#f5f5f5",
        color: "#1a1a1a",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          height: 600,
          background: "#fff",
          border: "2px solid #1a1a1a",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "1.5rem 1.5rem 0.75rem",
            borderBottom: "1px solid #eee",
            flexShrink: 0,
          }}
        >
          <h1
            style={{
              fontSize: "1.8em",
              margin: 0,
              textAlign: "center",
              fontFamily: '"Jersey 15", sans-serif',
            }}
          >
            Top 100 most searched
          </h1>
          <Link
            href="/"
            style={{
              display: "block",
              textAlign: "center",
              marginTop: "0.5rem",
              fontSize: "11px",
              fontFamily: '"Roboto Mono", monospace',
              color: "#666",
              textDecoration: "underline",
            }}
          >
            ← back to search
          </Link>
        </div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1rem 1.5rem",
          }}
        >
          {loading ? (
            <div
              style={{
                fontFamily: '"Roboto Mono", monospace',
                fontSize: "11px",
                color: "#666",
                textAlign: "center",
                padding: "2rem",
              }}
            >
              Loading...
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
            <ol
              style={{
                margin: 0,
                paddingLeft: "1.25rem",
                fontSize: "11px",
                fontFamily: '"Roboto Mono", monospace',
              }}
            >
              {leaderboard.map((entry) => (
                <li key={entry.course_id} style={{ marginBottom: "0.6rem" }}>
                  <a
                    href={STANFORD_NAVIGATOR_URL(
                      entry.course_codes?.split("/")[0]?.trim() || ""
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#1a1a1a", textDecoration: "none" }}
                  >
                    {entry.course_codes}
                  </a>
                  {" — "}
                  <span style={{ color: "#333" }}>
                    {entry.course_title || "N/A"}
                  </span>
                  <span style={{ color: "#999", marginLeft: "0.25rem" }}>
                    ({entry.search_count})
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
