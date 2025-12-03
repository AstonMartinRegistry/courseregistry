"use client";

import { useState, useEffect } from "react";

interface CourseResult {
  id: number;
  course_codes: string;
  course_title: string | null;
  course_descr: string | null;
  similarity: number;
  explanation?: string | null;
}

export default function Home() {
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

  const runSearch = async () => {
    if (!query.trim()) {
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);
    setHasSearched(true);
    setPagination({ hasMore: false, lastScore: null, lastId: null });

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: query.trim(), limit: 3 }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Search failed");
      }

      setResults(data.results || []);
      setPagination(data.pagination || { hasMore: false, lastScore: null, lastId: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!query.trim() || loadingMore || !pagination.hasMore) {
      return;
    }

    setLoadingMore(true);
    setError(null);

    try {
      const excludeIds = results.map((r) => r.id);
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: query.trim(),
          limit: 3,
          lastScore: pagination.lastScore,
          lastId: pagination.lastId,
          excludeIds,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Load more failed");
      }

      setResults((prev) => [...prev, ...(data.results || [])]);
      setPagination(data.pagination || { hasMore: false, lastScore: null, lastId: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
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
    setPagination({ hasMore: false, lastScore: null, lastId: null });
  };

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
        @media (max-width: 768px) {
          .mobile-fixed {
            height: 100vh;
            overflow: hidden;
          }
          .mobile-scrollable {
            overflow-y: auto;
          }
          .mobile-title {
            font-size: 1.5em !important;
          }
          .mobile-search-container {
            width: 95% !important;
            max-width: none !important;
          }
          .mobile-results-container {
            width: 95% !important;
            max-width: none !important;
          }
          .mobile-container {
            padding-top: 10px !important;
            padding-right: 10px !important;
            padding-bottom: 10px !important;
            padding-left: 10px !important;
          }
        }
      `}</style>
      <div 
        className={`${!hasSearched ? "mobile-fixed" : "mobile-scrollable"} mobile-container`}
        style={{
          ...styles.container,
          ...((loading || hasSearched) ? { justifyContent: "flex-start", paddingTop: "0px" } : {})
        }}
      >
        {!hasSearched && (
          <div style={styles.aboutContainer}>
            <div style={styles.aboutText}>About</div>
          </div>
        )}
      <div style={styles.watercolorWrapper}>
        <div style={styles.watercolorBlock}></div>
        <div style={styles.grainOverlay}></div>
        <div style={styles.glassSquares}></div>
      </div>
      {!hasSearched && (
        <div style={styles.contentWrapper}>
          <h1 className="mobile-title" style={styles.title}>Stanford Course<br />Registry</h1>
          <div style={styles.subtitle}>Winter 26 Edition</div>
          <form onSubmit={handleSearch} className="mobile-search-container" style={styles.searchContainer}>
            <textarea
              placeholder="Describe your dream course"
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
                  e.currentTarget.style.backgroundColor = "#000000";
                  e.currentTarget.style.color = "#FFFFFF";
                  e.currentTarget.style.boxShadow = "none";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = "#8e0202";
                  e.currentTarget.style.color = "#FFFFFF";
                  e.currentTarget.style.boxShadow =
                    "-3px 3px 0px rgba(0, 0, 0, 0.75)";
                }
              }}
            >
              {loading ? "..." : "→"}
            </button>
          </form>
        </div>
      )}

      {loading && (
        <div className="mobile-results-container" style={styles.resultsContainer}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={styles.resultCard}>
              <div style={styles.skeleton}>
                <div style={styles.skeletonHeader}>
                  <div style={styles.skeletonContent}>
                    <div style={styles.skeletonTitle}></div>
                    <div style={{ ...styles.skeletonTitle, width: "70%" }}></div>
                  </div>
                  <div style={styles.skeletonScore}></div>
                </div>
                <div style={styles.skeletonContent}>
                  <div style={styles.skeletonLine}></div>
                  <div style={styles.skeletonLine}></div>
                  <div style={{ ...styles.skeletonLine, width: "70%" }}></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      {!loading && results.length > 0 && (
        <div className="mobile-results-container" style={styles.resultsContainer}>
          {results.map((course, index) => (
            <CourseResultCard
              key={course.id}
              course={course}
              index={index}
            />
          ))}
          {loadingMore && (
            <>
              {[1, 2, 3].map((i) => (
                <div key={`skeleton-${i}`} style={styles.resultCard}>
                  <div style={styles.skeleton}>
                    <div style={styles.skeletonHeader}>
                      <div style={styles.skeletonContent}>
                        <div style={styles.skeletonTitle}></div>
                        <div style={{ ...styles.skeletonTitle, width: "70%" }}></div>
                      </div>
                      <div style={styles.skeletonScore}></div>
                    </div>
                    <div style={styles.skeletonContent}>
                      <div style={styles.skeletonLine}></div>
                      <div style={styles.skeletonLine}></div>
                      <div style={{ ...styles.skeletonLine, width: "70%" }}></div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
          {!loadingMore && (
            <div style={styles.buttonContainer}>
              {pagination.hasMore && (
                <button
                  onClick={loadMore}
                  style={styles.actionButton}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = "-2px 2px 0px rgba(0, 0, 0, 0.5)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "-4px 4px 0px rgba(0, 0, 0, 0.65)";
                  }}
                >
                  Load More
                </button>
              )}
              <button
                onClick={handleNewSearch}
                style={styles.actionButton}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "-2px 2px 0px rgba(0, 0, 0, 0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "-4px 4px 0px rgba(0, 0, 0, 0.65)";
                }}
              >
                New Search
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && hasSearched && results.length === 0 && !error && (
        <div style={styles.error}>No results found. Try a different search.</div>
      )}

      {!hasSearched && <div style={styles.footerText}>Ver Natus</div>}
      </div>
    </>
  );
}

function CourseResultCard({
  course,
  index,
}: {
  course: CourseResult;
  index: number;
}) {
  const [wordsVisible, setWordsVisible] = useState(false);
  const [hoveredCodeIndex, setHoveredCodeIndex] = useState<number | null>(null);

  useEffect(() => {
    // Start word-by-word animation after component mounts
    setWordsVisible(true);
  }, []);

  // Parse course codes by "/"
  const courseCodes = course.course_codes.split("/").map((code) => code.trim()).filter((code) => code.length > 0);

  const baseText =
    (course.explanation && course.explanation.trim().length > 0
      ? course.explanation
      : course.course_descr) || "";

  // Parse text to handle <u> tags for underlined prerequisites and separate prerequisites line
  const parseTextWithUnderline = (text: string) => {
    // First, check if prerequisites exist and split the text
    const prereqPattern = /\b(?:prerequisites?:|prerequisite|prereq)\s*[:.]?\s*/i;
    const match = text.match(prereqPattern);
    
    let mainText = text;
    let prerequisitesText = "";
    
    if (match) {
      const index = match.index!;
      mainText = text.substring(0, index).trim();
      prerequisitesText = text.substring(index).trim();
    }

    const parts: Array<{ text: string; underlined: boolean; isNewLine: boolean }> = [];
    
    // Helper function to parse a section and handle underline tags
    const parseSection = (sectionText: string) => {
      let remaining = sectionText.trim();
      
      while (remaining.length > 0) {
        const openTag = remaining.indexOf("<u>");
        const closeTag = remaining.indexOf("</u>");

        if (openTag === -1 && closeTag === -1) {
          // No more tags, add remaining text
          const words = remaining.split(/\s+/).filter((w) => w.length > 0);
          words.forEach((word) => {
            parts.push({ text: word, underlined: false, isNewLine: false });
          });
          break;
        }

        if (openTag !== -1 && (closeTag === -1 || openTag < closeTag)) {
          // Add text before the open tag
          const before = remaining.substring(0, openTag).trim();
          const words = before.split(/\s+/).filter((w) => w.length > 0);
          words.forEach((word) => {
            parts.push({ text: word, underlined: false, isNewLine: false });
          });

          // Add underlined text
          const afterOpen = remaining.substring(openTag + 3);
          const closeIdx = afterOpen.indexOf("</u>");
          if (closeIdx !== -1) {
            const underlinedText = afterOpen.substring(0, closeIdx).trim();
            const words = underlinedText.split(/\s+/).filter((w) => w.length > 0);
            words.forEach((word) => {
              parts.push({ text: word, underlined: true, isNewLine: false });
            });
            remaining = afterOpen.substring(closeIdx + 4).trim();
          } else {
            // Malformed, just add as normal text
            const words = remaining.split(/\s+/).filter((w) => w.length > 0);
            words.forEach((word) => {
              parts.push({ text: word, underlined: false, isNewLine: false });
            });
            break;
          }
        } else {
          // Close tag without open, skip it
          remaining = remaining.substring(closeTag + 4);
        }
      }
    };

    // Helper function to parse prerequisites without underlining (strip all <u> tags)
    const parsePrerequisites = (sectionText: string) => {
      // Remove all underline tags from prerequisites
      let cleanText = sectionText.replace(/<u>/g, "").replace(/<\/u>/g, "");
      const words = cleanText.split(/\s+/).filter((w) => w.length > 0);
      words.forEach((word) => {
        parts.push({ text: word, underlined: false, isNewLine: false });
      });
    };

    // Parse main text (with underlining allowed)
    parseSection(mainText);
    
    // Add newline and parse prerequisites if they exist (without underlining)
    if (prerequisitesText) {
      parts.push({ text: "", underlined: false, isNewLine: true });
      parsePrerequisites(prerequisitesText);
    }

    return parts;
  };

  const textParts = parseTextWithUnderline(baseText);

  return (
    <div style={styles.resultCard}>
      <div style={styles.resultHeader}>
        <div>
          <div style={styles.courseCodesContainer}>
            {courseCodes.map((code, codeIndex) => {
              const navigatorUrl = `https://navigator.stanford.edu/classes?classes%5BrefinementList%5D%5BtermOffered%5D%5B0%5D=Winter%202026&classes%5Bquery%5D=${encodeURIComponent(
                code,
              )}`;
              const isHovered = hoveredCodeIndex === codeIndex;
              
              return (
                <span key={codeIndex}>
                  <a
                    href={navigatorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      ...styles.courseCodes,
                      ...(isHovered ? styles.courseCodesHovered : {}),
                    }}
                    onMouseEnter={() => setHoveredCodeIndex(codeIndex)}
                    onMouseLeave={() => setHoveredCodeIndex(null)}
                  >
                    {code}
                    <span style={styles.courseArrow}>↗</span>
                  </a>
                  {codeIndex < courseCodes.length - 1 && (
                    <span style={styles.courseCodeSeparator}> / </span>
                  )}
                </span>
              );
            })}
          </div>
          {course.course_title && (
            <div style={styles.courseTitle}>{course.course_title}</div>
          )}
        </div>
        <div style={styles.similarity}>
          {(course.similarity * 100).toFixed(1)}% match
        </div>
      </div>
      {baseText && (
        <div style={styles.courseDescr}>
          {textParts.map((part, wordIndex) => {
            if (part.isNewLine) {
              return <div key={wordIndex} style={{ display: "block", marginTop: "12px", height: "1px" }}></div>;
            }
            return (
              <span
                key={wordIndex}
                style={{
                  ...styles.descriptionWord,
                  ...(part.underlined ? { textDecoration: "underline" } : {}),
                  opacity: wordsVisible ? 1 : 0,
                  transition: `opacity 0.2s ease ${wordIndex * 0.01}s`,
                }}
              >
                {part.text}{" "}
              </span>
            );
          })}
        </div>
      )}
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
    fontFamily: "'JetBrains Mono', monospace",
    backgroundColor: "#FFFFFF",
    color: "#000000",
    position: "relative",
  },
  aboutContainer: {
    position: "absolute",
    top: "20px",
    right: "20px",
    zIndex: 10,
  },
  aboutText: {
    fontSize: "0.9rem",
    color: "#1a1a1a",
    cursor: "pointer",
    transition: "opacity 0.2s",
  },
  contentWrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    position: "relative",
    zIndex: 1,
  },
  watercolorWrapper: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    zIndex: 0,
    overflow: "hidden",
    pointerEvents: "none",
  },
  watercolorBlock: {
    position: "absolute",
    width: "110%",
    height: "70%",
    bottom: "-10%",
    left: "-5%",
    background:
      "linear-gradient(to top, rgba(100, 10, 20, 0.9), rgba(120, 15, 25, 0.7), rgba(140, 20, 30, 0.5), transparent)",
    filter: "blur(60px) contrast(1.4) saturate(1.6)",
  },
  grainOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='8' numOctaves='1' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.8'/%3E%3C/svg%3E")`,
    backgroundSize: "20px 20px",
    opacity: 0.4,
    pointerEvents: "none",
  },
  glassSquares: {
    position: "absolute",
    top: "35%",
    left: 0,
    width: "100%",
    height: "65%",
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='300' height='300' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='glassPattern' width='300' height='300' patternUnits='userSpaceOnUse'%3E%3Crect width='300' height='300' fill='rgba(255,255,255,0.03)'/%3E%3Cg fill='url(%23glassGradient)'%3E%3Crect x='0' y='0' width='140' height='140'/%3E%3Crect x='80' y='40' width='140' height='140'/%3E%3Crect x='160' y='100' width='140' height='140'/%3E%3Crect x='40' y='120' width='140' height='140'/%3E%3Crect x='200' y='20' width='140' height='140'/%3E%3Crect x='20' y='200' width='140' height='140'/%3E%3Crect x='120' y='210' width='140' height='140'/%3E%3Crect x='220' y='180' width='140' height='140'/%3E%3C/g%3E%3C/pattern%3E%3ClinearGradient id='glassGradient' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='rgba(255,255,255,0.45)'/%3E%3Cstop offset='40%25' stop-color='rgba(255,255,255,0.12)'/%3E%3Cstop offset='100%25' stop-color='rgba(220,220,220,0.15)'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='url(%23glassPattern)'/%3E%3C/svg%3E")`,
    opacity: 0.8,
    pointerEvents: "none",
    mixBlendMode: "overlay",
  },
  title: {
    fontSize: "2.5em",
    marginBottom: "0.5rem",
    marginTop: "0",
    letterSpacing: "0.1em",
    lineHeight: 1.2,
    padding: "0.5rem 1rem",
    textAlign: "center",
    color: "#1a1a1a",
    textShadow:
      "0 0 1px rgba(255,255,255,0.7), 0 0 2px rgba(255,255,255,0.6), -1px -1px 0 rgba(255,255,255,0.4), 1px -1px 0 rgba(255,255,255,0.4), -1px 1px 0 rgba(255,255,255,0.4), 1px 1px 0 rgba(255,255,255,0.4)",
  },
  subtitle: {
    fontSize: "0.9rem",
    color: "#666666",
    marginBottom: "2.5rem",
    textAlign: "center",
  },
  searchContainer: {
    width: "80%",
    maxWidth: "700px",
    position: "relative",
    paddingBottom: "10px",
  },
  searchInput: {
    width: "100%",
    padding: "0.8rem",
    paddingRight: "100px",
    minHeight: "100px",
    border: "1px solid rgba(240, 240, 240, 0.7)",
    background:
      "linear-gradient(135deg, rgba(255, 255, 255, 0.35), rgba(250, 250, 250, 0.25), rgba(245, 245, 245, 0.2))",
    color: "rgb(23, 23, 23)",
    borderRadius: "6px",
    fontSize: "12px",
    outline: "none",
    boxSizing: "border-box",
    resize: "none",
    backdropFilter: "blur(14px) saturate(1.1)",
    boxShadow: "-4px 4px 0px rgba(0, 0, 0, 0.65)",
    lineHeight: "1.3",
  },
  searchButton: {
    position: "absolute",
    right: "12px",
    bottom: "25px",
    padding: 0,
    height: "36px",
    width: "36px",
    border: "1px solid #f0f0f0",
    background: "#8e0202",
    color: "#FFFFFF",
    borderRadius: "5px",
    fontSize: "0.8rem",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "background-color 0.2s, color 0.2s, box-shadow 0.1s",
    backdropFilter: "blur(10px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "-3px 3px 0px rgba(0, 0, 0, 0.75)",
  },
  error: {
    marginTop: "20px",
    padding: "1.5rem",
    border: "1px solid #f0f0f0",
    background:
      "linear-gradient(135deg, rgba(255, 254, 254, 0.8), rgba(255, 253, 253, 0.8), rgba(255, 252, 252, 0.8))",
    color: "rgb(23, 23, 23)",
    boxShadow: "-6.5px 6.5px 0px rgba(0, 0, 0, 0.75)",
    backdropFilter: "blur(10px)",
    borderRadius: "8px",
    maxWidth: "700px",
    width: "80%",
    fontSize: "0.8rem",
  },
  resultsContainer: {
    marginTop: "20px",
    width: "44%",
    maxWidth: "800px",
    fontSize: "0.8rem",
  },
  resultsTitle: {
    fontSize: "1rem",
    fontWeight: "bold",
    marginBottom: "20px",
  },
  resultCard: {
    padding: "1.5rem",
    border: "1px solid rgba(240, 240, 240, 0.7)",
    boxShadow: "-6.5px 6.5px 0px rgba(0, 0, 0, 0.75)",
    textAlign: "left",
    marginBottom: "20px",
    borderRadius: "8px",
    background:
      "linear-gradient(135deg, rgba(255, 255, 255, 0.35), rgba(250, 250, 250, 0.25), rgba(245, 245, 245, 0.2))",
    fontSize: "0.8rem",
    position: "relative",
    backdropFilter: "blur(10px)",
    color: "rgb(23, 23, 23)",
  },
  resultHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.6rem",
    marginBottom: "12px",
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
    marginLeft: "0.4rem",
    fontSize: "1.2em",
    color: "inherit",
    fontWeight: "100",
    fontFamily: "inherit",
    lineHeight: "1",
  },
  courseTitle: {
    fontSize: "0.9rem",
    color: "rgb(23, 23, 23)",
    marginBottom: "8px",
  },
  similarity: {
    marginLeft: "auto",
    fontSize: "0.85em",
    fontWeight: "normal",
    color: "#8e0202",
    background: "rgba(142, 2, 2, 0.1)",
    padding: "0.2em 0.8em",
    borderRadius: "10px",
    minWidth: "6em",
    flexShrink: 0,
    height: "1.5em",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "nowrap",
  },
  courseDescr: {
    fontSize: "0.8rem",
    color: "rgb(23, 23, 23)",
    lineHeight: "1.3",
    marginTop: "18px",
    paddingTop: "1rem",
    borderTop: "1px solid #ddd",
  },
  descriptionWord: {
    display: "inline-block",
    whiteSpace: "pre",
  },
  skeleton: {
    position: "relative",
    overflow: "hidden",
  },
  skeletonHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.6rem",
    marginBottom: "12px",
  },
  skeletonContent: {
    flex: 1,
  },
  skeletonTitle: {
    width: "80%",
    height: "20px",
    background: "linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)",
    backgroundSize: "200% 100%",
    borderRadius: "4px",
    marginBottom: "0.5rem",
    animation: "shimmer 1.5s ease-in-out infinite",
  },
  skeletonScore: {
    width: "80px",
    height: "24px",
    background: "linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)",
    backgroundSize: "200% 100%",
    borderRadius: "10px",
    marginLeft: "auto",
    animation: "shimmer 1.5s ease-in-out infinite",
  },
  skeletonLine: {
    width: "100%",
    height: "16px",
    background: "linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)",
    backgroundSize: "200% 100%",
    borderRadius: "4px",
    marginBottom: "0.5rem",
    animation: "shimmer 1.5s ease-in-out infinite",
  },
  footerText: {
    position: "absolute",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: "0.9rem",
    color: "#1a1a1a",
    zIndex: 10,
  },
  buttonContainer: {
    display: "flex",
    flexDirection: "row",
    gap: "1rem",
    justifyContent: "center",
    alignItems: "center",
    marginTop: "20px",
    width: "100%",
  },
  actionButton: {
    padding: "0.8rem 2rem",
    border: "1px solid rgba(240, 240, 240, 0.7)",
    background:
      "linear-gradient(135deg, rgba(255, 255, 255, 0.35), rgba(250, 250, 250, 0.25), rgba(245, 245, 245, 0.2))",
    color: "rgb(23, 23, 23)",
    borderRadius: "6px",
    fontSize: "0.8rem",
    fontWeight: "normal",
    cursor: "pointer",
    transition: "background-color 0.2s, box-shadow 0.1s",
    backdropFilter: "blur(14px) saturate(1.1)",
    boxShadow: "-4px 4px 0px rgba(0, 0, 0, 0.65)",
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
  },
};


