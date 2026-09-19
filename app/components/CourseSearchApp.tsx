"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { CourseResult } from "../lib/types";
import {
  CourseTerm,
  STANFORD_NAVIGATOR_URL,
  TERM_LABELS,
} from "../lib/constants";
import { LeaderboardPanel } from "./LeaderboardPanel";

type Pagination = {
  hasMore: boolean;
  lastScore: number | null;
  lastId: number | null;
};

type PageSnapshot = {
  results: CourseResult[];
  explanations: Record<number, string>;
  pagination: Pagination;
};

const EMPTY_PAGINATION: Pagination = {
  hasMore: false,
  lastScore: null,
  lastId: null,
};

export function CourseSearchApp({ term }: { term: CourseTerm }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseResult[]>([]);
  const [explanations, setExplanations] = useState<Record<number, string>>({});
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [history, setHistory] = useState<PageSnapshot[]>([]);
  const [forwardHistory, setForwardHistory] = useState<PageSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const requestId = useRef(0);

  const pageSize = 4;
  const totalCourses = term === "spring26" ? 1973 : 1861;

  useEffect(() => {
    return () => {
      requestId.current += 1;
    };
  }, []);

  async function explainCourses(courses: CourseResult[], activeRequest: number, searchQuery: string) {
    await Promise.all(
      courses.map(async (course) => {
        try {
          const response = await fetch("/api/explain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: searchQuery,
              courseTitle: course.course_title,
              courseDescr: course.course_descr,
            }),
          });
          if (!response.ok || !response.body) throw new Error("Explanation unavailable");
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let text = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
            if (requestId.current === activeRequest) {
              setExplanations((current) => ({ ...current, [course.id]: text }));
            }
          }
        } catch {
          if (requestId.current === activeRequest) {
            setExplanations((current) => ({
              ...current,
              [course.id]: course.course_descr || "",
            }));
          }
        }
      }),
    );
  }

  async function fetchPage(options?: {
    more?: boolean;
    lastScore?: number | null;
    lastId?: number | null;
    excludeIds?: number[];
  }) {
    const trimmed = query.trim();
    if (!trimmed || loading || loadingMore) return;

    const isMore = Boolean(options?.more);
    const activeRequest = ++requestId.current;
    isMore ? setLoadingMore(true) : setLoading(true);
    setError(null);
    setHasSearched(true);

    if (!isMore) {
      setResults([]);
      setExplanations({});
      setPagination(EMPTY_PAGINATION);
      setHistory([]);
      setForwardHistory([]);
    }

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmed,
          term,
          limit: pageSize,
          lastScore: options?.lastScore ?? null,
          lastId: options?.lastId ?? null,
          excludeIds: options?.excludeIds ?? null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed");
      if (requestId.current !== activeRequest) return;

      const courses = data.results || [];
      setResults(courses);
      setExplanations({});
      setPagination(data.pagination || EMPTY_PAGINATION);
      setLoading(false);
      setLoadingMore(false);
      await explainCourses(courses, activeRequest, trimmed);
    } catch (caught) {
      if (requestId.current === activeRequest) {
        const detail = caught instanceof Error ? caught.message : "Search failed";
        setError(
          detail.includes("function") || detail.includes("relation")
            ? `${TERM_LABELS[term]} data is still being prepared. Please try again shortly.`
            : detail,
        );
      }
    } finally {
      if (requestId.current === activeRequest) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    fetchPage();
  }

  function loadMore() {
    if (!pagination.hasMore) return;
    setHistory((current) => [...current, { results, explanations, pagination }]);
    setForwardHistory([]);
    fetchPage({
      more: true,
      lastScore: pagination.lastScore,
      lastId: pagination.lastId,
      excludeIds: results.map((result) => result.id),
    });
  }

  function goBack() {
    const previous = history.at(-1);
    if (!previous) return;
    setForwardHistory((current) => [...current, { results, explanations, pagination }]);
    setHistory((current) => current.slice(0, -1));
    setResults(previous.results);
    setExplanations(previous.explanations);
    setPagination(previous.pagination);
  }

  function goForward() {
    const next = forwardHistory.at(-1);
    if (!next) return;
    setHistory((current) => [...current, { results, explanations, pagination }]);
    setForwardHistory((current) => current.slice(0, -1));
    setResults(next.results);
    setExplanations(next.explanations);
    setPagination(next.pagination);
  }

  function reset() {
    requestId.current += 1;
    setQuery("");
    setResults([]);
    setExplanations({});
    setPagination(EMPTY_PAGINATION);
    setHistory([]);
    setForwardHistory([]);
    setError(null);
    setHasSearched(false);
    setLoading(false);
    setLoadingMore(false);
  }

  const busy = loading || loadingMore;

  return (
    <main className="registry-shell">
      <header className="site-header">
        <Link href="/spring-2026">← Spring 2026</Link>
        <button type="button" onClick={() => setLeaderboardOpen(true)}>
          Most searched
        </button>
      </header>

      <section className={`search-page ${hasSearched ? "searched" : ""}`}>
        <div className="search-intro">
          <p>{TERM_LABELS[term]}</p>
          <h1>Course Registry</h1>
          <form className="search-form" onSubmit={handleSubmit}>
            <label htmlFor={`course-query-${term}`} className="sr-only">
              Describe the course you want to find
            </label>
            <input
              id={`course-query-${term}`}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="What do you want to learn?"
              maxLength={600}
              disabled={busy}
            />
            <button type="submit" disabled={busy || !query.trim()}>
              {busy ? "Searching…" : "Search"}
            </button>
          </form>
        </div>

        {hasSearched && (
          <section className="results-section" aria-live="polite" aria-busy={busy}>
            <div className="results-heading">
              <h2>Results</h2>
              <button type="button" onClick={reset}>Clear</button>
            </div>

            {error ? (
              <div className="message-card">
                <p>{error}</p>
                <button type="button" onClick={() => fetchPage()}>Try again</button>
              </div>
            ) : busy ? (
              <p className="loading-message">Searching…</p>
            ) : results.length ? (
              <div className="course-list">
                {results.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    explanation={explanations[course.id]}
                    term={term}
                  />
                ))}
              </div>
            ) : (
              <div className="message-card"><p>No matches found.</p></div>
            )}

            {!error && !busy && results.length > 0 && (
              <nav className="result-pagination" aria-label="Search result pages">
                <button type="button" onClick={goBack} disabled={!history.length}>← Back</button>
                <span>{history.length + 1}</span>
                <button
                  type="button"
                  onClick={forwardHistory.length ? goForward : loadMore}
                  disabled={!forwardHistory.length && !pagination.hasMore}
                >
                  {forwardHistory.length ? "Forward" : "More"} →
                </button>
              </nav>
            )}
          </section>
        )}
      </section>

      {leaderboardOpen && (
        <LeaderboardPanel
          onClose={() => setLeaderboardOpen(false)}
          term={term}
          totalCourses={totalCourses}
        />
      )}
    </main>
  );
}

function CourseCard({
  course,
  explanation,
  term,
}: {
  course: CourseResult;
  explanation?: string;
  term: CourseTerm;
}) {
  const codes = (course.course_codes || "").split("/").map((code) => code.trim()).filter(Boolean);
  const fit = typeof course.similarity === "number" ? Math.round(course.similarity * 100) : null;
  const clean = (value: string) => value.replace(/<[^>]+>/g, "").replace(/_([^_]*)_/g, "$1").trim();
  const copy = clean(explanation || course.course_descr || "");

  return (
    <article className="course-card">
      <div className="course-codes">
        {codes.map((code) => (
          <a key={code} href={STANFORD_NAVIGATOR_URL(code, term)} target="_blank" rel="noreferrer">
            {code} ↗
          </a>
        ))}
      </div>
      <h3>{course.course_title || "Untitled course"}</h3>
      <p className="course-meta">
        {course.instructors || "Instructor TBA"}{fit !== null ? ` · ${fit}% match` : ""}
      </p>
      <p className="course-explanation">{copy}</p>
    </article>
  );
}
