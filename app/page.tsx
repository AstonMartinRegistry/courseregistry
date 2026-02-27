"use client";

import { useState, useEffect } from "react";
import type { CourseResult } from "./lib/types";
import { STANFORD_NAVIGATOR_URL } from "./lib/constants";
import { LeaderboardPanel } from "./components/LeaderboardPanel";

export default function Home() {
  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [pagination, setPagination] = useState<{
    hasMore: boolean;
    lastScore: number | null;
    lastId: number | null;
  }>({
    hasMore: false,
    lastScore: null,
    lastId: null,
  });
  const [explanations, setExplanations] = useState<Record<number, string>>({});
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [wrapperSize, setWrapperSize] = useState<{ width: number; height: number } | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [showSecretPage, setShowSecretPage] = useState(false);
  const [saladEmail, setSaladEmail] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(typeof window !== "undefined" && window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Scale wrapper to fit viewport
  useEffect(() => {
    if (!imageSize) return;
    const updateSize = () => {
      const maxW = typeof window !== "undefined" ? Math.min(480, window.innerWidth - 48) : 480;
      const maxH = typeof window !== "undefined" ? Math.min(600, window.innerHeight - 48) : 600;
      const scale = Math.min(1, maxW / imageSize.width, maxH / imageSize.height);
      setWrapperSize({
        width: Math.round(imageSize.width * scale),
        height: Math.round(imageSize.height * scale),
      });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [imageSize]);

  // Lock scroll when on home view
  useEffect(() => {
    if (!hasSearched) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      document.body.style.height = "100vh";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.height = "";
    }
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.height = "";
    };
  }, [hasSearched]);

  const runSearch = async () => {
    if (!query.trim()) {
      return;
    }
    window.scrollTo(0, 0);
    if (Math.random() < 1 / 72) {
      setLoading(false);
      setError(null);
      setResults([]);
      setExplanations({});
      setHasSearched(true);
      setShowSecretPage(true);
      setPagination({ hasMore: false, lastScore: null, lastId: null });
      return;
    }
    const t0 = performance.now();
    console.log("🔍 [TIMING] Search started at", new Date().toISOString());
    setLoading(true);
    setError(null);
      setResults([]);
    setExplanations({});
    setHasSearched(true);
    setShowSecretPage(false);
    setPagination({ hasMore: false, lastScore: null, lastId: null });

    try {
      const requestBody = { query: query.trim(), limit: isMobile ? 2 : 4 };
      console.log("📤 Sending request:", requestBody);
      
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const t1 = performance.now();
      console.log("📥 [TIMING] Search API response:", ((t1 - t0) / 1000).toFixed(2), "s");
      const data = await response.json();

      if (!response.ok) {
        console.error("❌ Response not OK:", data.error);
        throw new Error(data.error || "Search failed");
      }

      console.log("✅ [TIMING] Results received:", data.results?.length || 0, "courses");
      const courses = data.results || [];
      setResults(courses);
      setPagination(data.pagination || { hasMore: false, lastScore: null, lastId: null });
      setLoading(false);

      const t2 = performance.now();
      console.log("⏱️ [TIMING] Starting explain streams (courses visible at", ((t2 - t0) / 1000).toFixed(2), "s)");

      // Wait for phase 2 skeleton to paint and stay visible briefly
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 400));

      // Stream explanations for each course in parallel
      await Promise.all(
        courses.map(async (course) => {
          const tCourse = performance.now();
          try {
            const res = await fetch("/api/explain", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query: query.trim(),
                courseTitle: course.course_title ?? null,
                courseDescr: course.course_descr ?? null,
              }),
            });
            if (!res.ok) throw new Error("Explain failed");
            const tFirstByte = performance.now();
            console.log("📡 [TIMING] Explain started for", course.course_codes, "at", ((tFirstByte - t0) / 1000).toFixed(2), "s");
            const reader = res.body?.getReader();
            if (!reader) return;
            const decoder = new TextDecoder();
            let text = "";
            const MIN_CHARS_BEFORE_SHOW = 80;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              text += decoder.decode(value, { stream: true });
              if (text.length >= MIN_CHARS_BEFORE_SHOW || done) {
                setExplanations((prev) => ({ ...prev, [course.id]: text }));
              }
            }
            if (text.length > 0) {
              setExplanations((prev) => ({ ...prev, [course.id]: text }));
            }
            const tCourseDone = performance.now();
            console.log("✅ [TIMING] Explain done for", course.course_codes, "in", ((tCourseDone - tCourse) / 1000).toFixed(2), "s");
          } catch (err) {
            console.warn("Explain failed for course", course.id, err);
            setExplanations((prev) => ({ ...prev, [course.id]: course.course_descr || "" }));
          }
        })
      );

      const t3 = performance.now();
      console.log("⏱️ [TIMING] Total search + explain:", ((t3 - t0) / 1000).toFixed(2), "s");
    } catch (err) {
      console.error("💥 Search error:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!query.trim() || loadingMore || !pagination.hasMore) {
      return;
    }

    const excludeIds = results.map((r) => r.id);
    const lastScore = pagination.lastScore;
    const lastId = pagination.lastId;

    setResults([]);
    setExplanations({});
    setLoadingMore(true);
    setError(null);
    setShowSecretPage(false);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: query.trim(),
          limit: isMobile ? 2 : 4,
          lastScore,
          lastId,
          excludeIds,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Load more failed");
      }

      const newCourses = data.results || [];
      setResults(newCourses);
      setPagination(data.pagination || { hasMore: false, lastScore: null, lastId: null });
      setLoadingMore(false);

      // Wait for phase 2 skeleton to paint and stay visible briefly
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 400));

      // Stream explanations for new courses in parallel (cards already visible with names)
      await Promise.all(
        newCourses.map(async (course: CourseResult) => {
          try {
            const res = await fetch("/api/explain", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query: query.trim(),
                courseTitle: course.course_title ?? null,
                courseDescr: course.course_descr ?? null,
              }),
            });
            if (!res.ok) throw new Error("Explain failed");
            const reader = res.body?.getReader();
            if (!reader) return;
            const decoder = new TextDecoder();
            let text = "";
            const MIN_CHARS_BEFORE_SHOW = 80;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              text += decoder.decode(value, { stream: true });
              if (text.length >= MIN_CHARS_BEFORE_SHOW || done) {
                setExplanations((prev) => ({ ...prev, [course.id]: text }));
              }
            }
            if (text.length > 0) {
              setExplanations((prev) => ({ ...prev, [course.id]: text }));
            }
          } catch (err) {
            console.warn("Explain failed for course", course.id, err);
            setExplanations((prev) => ({ ...prev, [course.id]: course.course_descr || "" }));
          }
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoadingMore(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await runSearch();
  };

  const handleNewSearch = () => {
    setQuery("");
    setResults([]);
    setError(null);
    setHasSearched(false);
    setShowSecretPage(false);
    setPagination({ hasMore: false, lastScore: null, lastId: null });
  };

  const handleSaladEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (saladEmail.trim()) {
      fetch("/api/salad-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: saladEmail.trim() }),
      }).catch(() => {});
      setSaladEmail("");
    }
  };

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: "16px",
          right: "20px",
          zIndex: 100,
        }}
      >
        <button
          type="button"
          onClick={() => setLeaderboardOpen(true)}
          style={{
            fontFamily: '"Roboto Mono", monospace',
            fontSize: "10px",
            padding: "0.35rem 0.6rem",
            background: "#1a1a1a",
            color: "#f0f0f0",
            border: "none",
            cursor: "pointer",
            borderRadius: 0,
          }}
        >
          Most searched
        </button>
      </div>
      <style>{`
        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .mobile-fixed {
          height: 100vh;
          overflow: hidden;
        }

        @media (min-width: 769px) {
          .results-list {
            flex-direction: row !important;
          }
          .results-page {
            flex: 1 !important;
            min-width: 0 !important;
          }
          .results-page-divider {
            width: 1px !important;
            height: auto !important;
            min-height: 100% !important;
            margin: 0 1rem !important;
          }
          .search-box-wrapper.has-results {
            width: 900px !important;
            height: 600px !important;
          }
          .search-box-wrapper {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 480px;
            aspect-ratio: 4 / 5;
            padding: 0;
            text-align: center;
            z-index: 2;
            display: flex;
            flex-direction: column;
            align-items: center;
            overflow: visible;
          }
          .box-image {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
          }
          .box-image img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            object-position: center;
            image-rendering: pixelated;
          }
          .box-overlay-1,
          .box-overlay-2 {
            position: relative;
            z-index: 1;
            width: 100%;
            box-sizing: border-box;
            padding: 1rem 1.5rem;
          }
          .box-overlay-1 {
            padding-top: 1.5rem;
            margin-top: 2rem;
          }
          .box-overlay-2 {
            margin-top: auto;
            margin-bottom: 2.75rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding-bottom: 0;
          }
        }

        @media (max-width: 768px) {
          .mobile-fixed {
            /* Use small viewport height - stable when URL bar shows/hides, prevents cover jump on refresh */
            height: 100vh; /* Fallback for browsers without svh */
            height: 100svh;
            overflow: hidden;
            position: relative;
          }
          .mobile-scrollable {
            overflow-y: auto;
            min-height: 100vh; /* Fallback for browsers without svh */
            min-height: 100svh;
            position: relative;
          }
          .mobile-title {
            font-size: 2.1em !important;
          }
          .mobile-search-container {
            width: 95% !important;
            max-width: none !important;
          }
          .mobile-results-container {
            width: 95% !important;
            max-width: none !important;
          }
          .mobile-content {
            width: 100% !important;
            max-width: none !important;
          }
          .mobile-container {
            padding-top: 24px !important;
            padding-right: 10px !important;
            padding-bottom: 60px !important;
            padding-left: 10px !important;
          }
          .mobile-footer {
            position: fixed !important;
            bottom: 20px !important;
          }
          .search-box-wrapper {
            position: relative;
            width: 90%;
            max-width: 480px;
            aspect-ratio: 4 / 5;
            padding: 0;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            overflow: visible;
          }
          .search-box-wrapper.has-results {
            aspect-ratio: auto !important;
            min-height: 75dvh !important;
            max-height: 85dvh !important;
          }
          .box-image {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
          }
          .box-image img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            object-position: center;
            image-rendering: pixelated;
          }
          .box-overlay-1,
          .box-overlay-2 {
            position: relative;
            z-index: 1;
            width: 100%;
            box-sizing: border-box;
            padding: 1rem 1.5rem;
          }
          .box-overlay-1 {
            padding-top: 1.5rem;
            margin-top: 2rem;
          }
          .box-overlay-2 {
            margin-top: auto;
            margin-bottom: 1rem;
            padding-top: 1.5rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding-bottom: 0;
          }
          .results-list-mobile {
            flex-direction: column !important;
            width: 100% !important;
          }
          .results-list-mobile .results-page-divider {
            display: none !important;
          }
          .results-list-mobile .simple-card-descr {
            min-height: 240px !important;
            height: auto !important;
            max-height: 280px !important;
            overflow-y: auto !important;
          }
        }
      `}</style>
      <div 
        className={`${!hasSearched || (hasSearched && (loading || loadingMore || results.length > 0 || showSecretPage)) ? "mobile-fixed" : "mobile-scrollable"} mobile-container${isMobile && hasSearched && (loading || loadingMore || results.length > 0 || showSecretPage) ? " mobile-has-results" : ""}`}
        style={{
          ...styles.container,
          ...((loading || hasSearched) && !isMobile ? { justifyContent: "flex-start", paddingTop: "0px" } : {})
        }}
      >
      <div
        className={`search-box-wrapper ${leaderboardOpen ? "" : hasSearched && (loading || loadingMore || results.length > 0 || showSecretPage) ? "has-results" : ""}`}
        style={
          leaderboardOpen || showSecretPage
            ? undefined
            : wrapperSize && hasSearched && !loading && !loadingMore && results.length === 0
              ? {
                  width: wrapperSize.width,
                  height: wrapperSize.height,
                }
              : undefined
        }
      >
        {leaderboardOpen ? (
          <LeaderboardPanel onClose={() => setLeaderboardOpen(false)} />
        ) : showSecretPage ? (
          <div style={styles.resultsBox}>
            <div style={styles.resultsList} className="results-list">
              <div style={styles.resultsPage} className="results-page">
                <div style={styles.secretPageContent}>
                  <p style={styles.secretPageText}>
                    Yippee, welcome to this cozy corner of the registry. Sorry no classes womp womp. But consider yourself a lucky one, this page has a 1/72 chance of appearing.
                  </p>
                  <img src="/dithered-image-5.jpeg" alt="" style={{ maxWidth: "100%", imageRendering: "pixelated" }} />
                  <p style={styles.secretPageText}>What&apos;s up with the salads???</p>
                </div>
              </div>
              <div style={styles.resultsPageDivider} className="results-page-divider" />
              <div style={styles.resultsPage} className="results-page">
                <div style={styles.secretPageContent}>
                  <p style={styles.secretPageText}>
                    This registry&apos;s sole aim is to encourage salad makers to make good salads. One will not know that apples and olives work well in a salad until one has discovered their nature and embraced their union. Whether the salad maker will use the ingredients at their disposal is another question. However, a well stocked pantry with a complete list should be made available for the salad makers so they may cook. Perhaps some more pickles or even some pomegranates?
                  </p>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <img src="/dithered-image-6.jpeg" alt="" style={{ maxWidth: "75%", imageRendering: "pixelated" }} />
                  </div>
                  <p style={styles.secretPageText}>
                    You also get an invitation to join the salad bar!!
                  </p>
                  <form onSubmit={handleSaladEmailSubmit} style={styles.saladEmailForm}>
                    <input
                      type="email"
                      placeholder="Drop your email for a surprise"
                      value={saladEmail}
                      onChange={(e) => setSaladEmail(e.target.value)}
                      style={styles.saladEmailInput}
                    />
                    <button type="submit" style={styles.saladEmailButton}>
                      →
                    </button>
                  </form>
                </div>
              </div>
            </div>
            <div style={styles.resultsBottomBar}>
              <button type="button" style={styles.resultsBottomBarBtn} onClick={handleNewSearch}>
                ← new query
              </button>
              <button type="button" style={styles.resultsBottomBarBtn} onClick={() => runSearch()}>
                load more →
              </button>
            </div>
          </div>
        ) : !hasSearched ? (
          <>
            <div style={styles.creatorByBox}>
              {isMobile ? (
                <>
                  Campus Curiosities Vol 4 |{" "}
                  <a
                    href="https://stanfordlabregistry.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ textDecoration: "underline", color: "inherit" }}
                  >
                    stanfordlabregistry.com
                  </a>
                </>
              ) : (
                <>
                  Campus Curiosities Vol 4 /{" "}
                  <a
                    href="https://stanfordlabregistry.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ textDecoration: "underline", color: "inherit" }}
                  >
                    stanfordlabregistry.com
                  </a>
                  {" / "}
                  <a
                    href="https://stanfordbikeregistry.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ textDecoration: "underline", color: "inherit" }}
                  >
                    stanfordbikeregistry.com
                  </a>
                </>
              )}
            </div>
            <div className="box-image">
              <img
                src="/dithered-background.jpeg"
                alt=""
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
                }}
              />
            </div>
            <div className="box-overlay-1">
              <h1 className="mobile-title" style={styles.title}>Stanford Course<br />Registry</h1>
            </div>
            <div style={styles.spring26Badge}>Spring 26 Edition</div>
            <div className="box-overlay-2">
              <form onSubmit={handleSearch} className="mobile-search-container" style={styles.searchContainer}>
                <textarea
                  placeholder="Describe your dream course..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !loading) {
                      e.preventDefault();
                      runSearch();
                    }
                  }}
                  style={styles.searchInput}
                  disabled={loading}
                  rows={4}
                />
                <button
                  type="submit"
                  style={styles.searchButton}
                  disabled={loading}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.background = "#333333";
                      e.currentTarget.style.color = "#FFFFFF";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!loading) {
                      e.currentTarget.style.background = "#000000";
                      e.currentTarget.style.color = "#FFFFFF";
                    }
                  }}
                >
                  {loading ? (
                    "..."
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <line x1="16.5" y1="16.5" x2="21" y2="21" />
                    </svg>
                  )}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div style={styles.resultsBox}>
            {(loading || loadingMore) ? (
              <div style={styles.resultsList} className={`results-list ${isMobile ? "results-list-mobile" : ""}`}>
                <div style={styles.resultsPage} className="results-page">
                  {(isMobile ? [0, 1] : [0, 1]).map((i) => (
                    <div key={i} style={styles.resultItemWrapper}>
                      <div style={styles.loadingSkeletonCard}>
                        <div style={styles.loadingSkeletonHeader} />
                        <div style={styles.skeletonDescr}>
                          <div style={styles.skeletonDescrLine} />
                          <div style={{ ...styles.skeletonDescrLine, width: "85%" }} />
                          <div style={{ ...styles.skeletonDescrLine, width: "70%" }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {!isMobile && (
                  <>
                    <div style={styles.resultsPageDivider} className="results-page-divider" />
                    <div style={styles.resultsPage} className="results-page">
                      {[2, 3].map((i) => (
                        <div key={i} style={styles.resultItemWrapper}>
                          <div style={styles.loadingSkeletonCard}>
                            <div style={styles.loadingSkeletonHeader} />
                            <div style={styles.skeletonDescr}>
                              <div style={styles.skeletonDescrLine} />
                              <div style={{ ...styles.skeletonDescrLine, width: "85%" }} />
                              <div style={{ ...styles.skeletonDescrLine, width: "70%" }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : error ? (
              <div style={styles.loadingText}>{error}</div>
            ) : results.length === 0 ? (
              <div style={styles.loadingText}>No results found.</div>
            ) : (
              <>
                <div style={styles.resultsList} className={`results-list ${isMobile ? "results-list-mobile" : ""}`}>
                  <div style={styles.resultsPage} className="results-page">
                    {(isMobile ? results.slice(0, 2) : results.filter((_, i) => Math.floor(i / 2) % 2 === 0)).map((course) => (
                      <div key={course.id} style={styles.resultItemWrapper}>
                        <SimpleCourseCard
                          course={course}
                          explanation={explanations[course.id]}
                        />
                      </div>
                    ))}
                  </div>
                  {!isMobile && results.length > 2 && (
                    <>
                      <div style={styles.resultsPageDivider} className="results-page-divider" />
                      <div style={styles.resultsPage} className="results-page">
                        {results.filter((_, i) => Math.floor(i / 2) % 2 === 1).map((course) => (
                          <div key={course.id} style={styles.resultItemWrapper}>
                            <SimpleCourseCard
                              course={course}
                              explanation={explanations[course.id]}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div style={styles.resultsBottomBar}>
                  <button type="button" style={styles.resultsBottomBarBtn} onClick={handleNewSearch}>
                    ← new query
                  </button>
                  {pagination.hasMore && (
                    <button
                      type="button"
                      style={{
                        ...styles.resultsBottomBarBtn,
                        ...(loadingMore ? { opacity: 0.7, cursor: "wait" } : {}),
                      }}
                      onClick={loadMore}
                      disabled={loadingMore}
                    >
                      {loadingMore ? "loading…" : "load more →"}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mobile-footer" style={styles.footerText}>
        Ver Natus
      </div>
      </div>
    </>
  );
}

function SimpleCourseCard({
  course,
  explanation,
}: {
  course: CourseResult;
  explanation?: string;
}) {
  const [hoveredCodeIndex, setHoveredCodeIndex] = useState<number | null>(null);
  const codes = (course.course_codes || "").split("/").map((c) => c.trim()).filter(Boolean);
  const text = (explanation && explanation.trim().length > 0
    ? explanation
    : (course.explanation && course.explanation.trim().length > 0 ? course.explanation : course.course_descr)) || "";
  const clean = (s: string) =>
    s.replace(/<[^>]+>/g, "").replace(/_([^_]*)_/g, "$1").trim();
  const prereqIdx = text.toLowerCase().indexOf("prerequisites:");
  const mainText = prereqIdx >= 0 ? text.slice(0, prereqIdx).trim() : text;
  const rawPrereq = prereqIdx >= 0 ? text.slice(prereqIdx).trim() : "";
  const prereqContent = clean(rawPrereq).replace(/^prerequisites:?\s*/i, "").trim();
  const prereqDisplayRaw = prereqContent ? clean(rawPrereq) : "Prerequisites: None mentioned";
  const prereqDisplay = prereqDisplayRaw.replace(/^(Prerequisites:\s*)+/i, "Prerequisites: ");
  const hasCompleteExplanation =
    typeof explanation === "string" &&
    (explanation.toLowerCase().includes("prereq") || explanation.length >= 80);
  const isLoading = explanation === undefined || !hasCompleteExplanation;

  return (
    <div style={styles.simpleCard}>
      <div style={styles.simpleCardHeader}>
        <div style={styles.simpleCardHeaderLeft}>
          <div style={styles.courseCodesContainer}>
            {codes.map((code, codeIndex) => {
              const navigatorUrl = STANFORD_NAVIGATOR_URL(code);
              const isHovered = hoveredCodeIndex === codeIndex;
              return (
                <span key={codeIndex}>
                  <a
                    href={navigatorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      ...styles.courseCodes,
                      ...styles.simpleCardCodes,
                      ...(isHovered ? styles.courseCodesHovered : {}),
                    }}
                    onMouseEnter={() => setHoveredCodeIndex(codeIndex)}
                    onMouseLeave={() => setHoveredCodeIndex(null)}
                  >
                    {code}
                    <span style={styles.courseArrow}>↗</span>
                  </a>
                  {codeIndex < codes.length - 1 && (
                    <span style={styles.courseCodeSeparator}> / </span>
                  )}
                </span>
              );
            })}
          </div>
          <span style={styles.simpleCardTitle}>{course.course_title || "N/A"}</span>
          <span style={styles.simpleCardProfs}>{course.instructors || "N/A"}</span>
        </div>
        {typeof course.similarity === "number" && (
          <span style={styles.simpleCardSimilarity}>
            {(course.similarity * 100).toFixed(1)}%
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="simple-card-descr" style={styles.skeletonDescr}>
          <div style={styles.skeletonDescrLine} />
          <div style={styles.skeletonDescrLine} />
          <div style={{ ...styles.skeletonDescrLine, width: "95%" }} />
          <div style={{ ...styles.skeletonDescrLine, width: "90%" }} />
          <div style={{ ...styles.skeletonDescrLine, width: "75%" }} />
        </div>
      ) : (clean(mainText) || prereqDisplay) ? (
        <div style={styles.simpleCardDescr}>
          {clean(mainText) && <span>{clean(mainText)}</span>}
          {clean(mainText) && (
            <>
              <br />
              <br />
            </>
          )}
          <span>{prereqDisplay}</span>
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: "20px",
    paddingRight: "20px",
    paddingBottom: "20px",
    paddingLeft: "20px",
    boxSizing: "border-box",
    fontFamily: '"Jersey 15", sans-serif',
    backgroundColor: "#f5f5f5",
    color: "#000000",
    position: "relative",
  },
  creatorByBox: {
    position: "absolute",
    bottom: "100%",
    left: 0,
    right: 0,
    fontSize: "9px",
    color: "#1a1a1a",
    fontFamily: '"Roboto Mono", monospace',
    textAlign: "center",
    padding: "0.5rem 1rem",
    background: "#ffffff",
    whiteSpace: "nowrap",
    zIndex: 10,
  },
  title: {
    fontSize: "2.8em",
    marginBottom: "0.5rem",
    marginTop: "0",
    letterSpacing: "0.1em",
    lineHeight: 1.2,
    padding: "0.5rem 1rem",
    textAlign: "center",
    color: "#1a1a1a",
    fontWeight: "normal",
  },
  spring26Badge: {
    position: "absolute",
    top: "1px",
    right: 0,
    background: "#000000",
    color: "#f0f0f0",
    fontSize: "9px",
    padding: "0.4rem 0.5rem",
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    whiteSpace: "nowrap",
    zIndex: 10,
    fontFamily: '"Roboto Mono", monospace',
  },
  searchContainer: {
    width: "85%",
    maxWidth: "384px",
    position: "relative",
    paddingBottom: "10px",
  },
  searchInput: {
    width: "100%",
    padding: "0.5rem",
    paddingRight: "72px",
    minHeight: "72px",
    border: "none",
    background: "#f0f0f0",
    color: "rgb(23, 23, 23)",
    borderRadius: 0,
    fontSize: "10px",
    fontFamily: '"Roboto Mono", monospace',
    outline: "none",
    boxSizing: "border-box",
    resize: "none",
    lineHeight: "1.3",
  },
  searchButton: {
    position: "absolute",
    right: "8px",
    bottom: "20px",
    padding: 0,
    height: "28px",
    width: "28px",
    border: "none",
    background: "#000000",
    color: "#FFFFFF",
    borderRadius: 0,
    fontSize: "12px",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "background 0.2s, color 0.2s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  resultsBox: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "#ffffff",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    padding: "1.5rem",
    boxSizing: "border-box",
    overflow: "auto",
  },
  secretPageContent: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    padding: "0.5rem 0",
    width: "100%",
    textAlign: "left",
  },
  secretPageText: {
    fontFamily: '"Roboto Mono", monospace',
    fontSize: "11px",
    color: "#333",
    lineHeight: 1.5,
    margin: 0,
    textAlign: "left",
  },
  saladEmailForm: {
    display: "flex",
    gap: "0.5rem",
    marginTop: "0.5rem",
  },
  saladEmailInput: {
    flex: 1,
    padding: "0.4rem 0",
    fontSize: "11px",
    fontFamily: '"Roboto Mono", monospace',
    border: "none",
    borderBottom: "1px solid #333",
    borderRadius: 0,
    background: "transparent",
    outline: "none",
  },
  saladEmailButton: {
    padding: "0.4rem 0.6rem",
    fontSize: "11px",
    fontFamily: '"Roboto Mono", monospace',
    background: "#1a1a1a",
    color: "#f0f0f0",
    border: "none",
    cursor: "pointer",
  },
  loadingText: {
    fontFamily: '"Roboto Mono", monospace',
    textAlign: "left",
    padding: "2rem",
    alignSelf: "flex-start",
  },
  resultsBottomBar: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    flexShrink: 0,
  },
  resultsBottomBarBtn: {
    fontFamily: '"Roboto Mono", monospace',
    fontSize: "9px",
    color: "#f0f0f0",
    background: "#000000",
    border: "none",
    cursor: "pointer",
    padding: "0.4rem 0.5rem",
  },
  resultsList: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflow: "hidden",
    width: "100%",
    alignItems: "stretch",
  },
  resultsPage: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  resultsPageDivider: {
    width: "100%",
    height: 1,
    background: "#1a1a1a",
    flexShrink: 0,
  },
  resultItemWrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    width: "100%",
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    paddingTop: 0,
    paddingBottom: "0.25rem",
  },
  simpleCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "0.35rem",
    textAlign: "left",
    maxWidth: "100%",
    width: "100%",
    minWidth: 0,
  },
  simpleCardHeader: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "0.5rem",
    width: "100%",
  },
  simpleCardHeaderLeft: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "0.25rem",
  },
  simpleCardSimilarity: {
    fontFamily: '"Roboto Mono", monospace',
    fontSize: "10px",
    color: "#f0f0f0",
    background: "#000000",
    padding: "0.2em 0.5em",
    flexShrink: 0,
  },
  simpleCardCodes: {
    fontFamily: '"Jersey 15", sans-serif',
    fontSize: "1.2em",
    color: "#1a1a1a",
  },
  simpleCardTitle: {
    fontFamily: '"Jersey 15", sans-serif',
    fontSize: "1em",
    color: "#1a1a1a",
  },
  simpleCardProfs: {
    fontFamily: '"Roboto Mono", monospace',
    fontSize: "11px",
    color: "#666",
  },
  simpleCardDescr: {
    fontFamily: '"Roboto Mono", monospace',
    fontSize: "10px",
    color: "#333",
    lineHeight: 1.2,
    textAlign: "left",
    minHeight: "160px",
    flex: 1,
    overflow: "hidden",
    width: "100%",
  },
  loadingSkeletonCard: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    gap: "0.5rem",
  },
  loadingSkeletonHeader: {
    height: "14px",
    width: "60%",
    background: "linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)",
    backgroundSize: "200% 100%",
    animation: "skeleton-shimmer 1.5s ease-in-out infinite",
    borderRadius: "2px",
  },
  skeletonDescr: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginTop: "4px",
    height: "160px",
    minHeight: "160px",
    flexShrink: 0,
    width: "100%",
    minWidth: "100%",
  },
  skeletonDescrLine: {
    height: "12px",
    width: "100%",
    background: "linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)",
    backgroundSize: "200% 100%",
    animation: "skeleton-shimmer 1.5s ease-in-out infinite",
    borderRadius: "2px",
  },
  courseCodesContainer: {
    display: "inline-flex",
    alignItems: "center",
    marginBottom: "0.3rem",
    flexWrap: "wrap",
  },
  courseCodes: {
    fontSize: "1rem",
    fontWeight: "bold",
    textDecoration: "none",
    color: "inherit",
    cursor: "pointer",
  },
  courseCodesHovered: {
    color: "#555555",
  },
  courseCodeSeparator: {
    fontSize: "1rem",
    fontWeight: "bold",
    color: "inherit",
    margin: "0 0.2rem",
  },
  courseArrow: {
    marginLeft: "0.25rem",
    fontSize: "0.75em",
    color: "inherit",
    fontWeight: "700",
    fontFamily: "inherit",
    lineHeight: "1",
  },
  footerText: {
    position: "fixed",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: "11px",
    color: "#1a1a1a",
    zIndex: 10,
    fontFamily: '"Roboto Mono", monospace',
  },
};


