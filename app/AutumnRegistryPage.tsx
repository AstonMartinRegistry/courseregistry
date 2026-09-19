"use client";

import { useState, useEffect, useRef } from "react";
import type { CourseResult } from "./lib/types";
import { STANFORD_NAVIGATOR_URL } from "./lib/constants";
import { explainCourses } from "./lib/explainCourse";
import { LeaderboardPanel, prefetchLeaderboard } from "./components/LeaderboardPanel";

type BookPhase =
  | "idle"
  | "shifting"
  | "opening"
  | "open"
  | "closing"
  | "recentering";
type BackPhase = "idle" | "to-back" | "back" | "to-front";
type OpenBackPhase = "idle" | "closing" | "centering";
type MobilePage = "left" | "right";
type PageTurnSnapshot = {
  results: CourseResult[];
  explanations: Record<number, string>;
};
type PageTurnDirection = "forward" | "backward";

export default function AutumnRegistryPage() {
  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingMobileRight, setLoadingMobileRight] = useState(false);
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
  const [backPhase, setBackPhase] = useState<BackPhase>("idle");
  const [openBackPhase, setOpenBackPhase] = useState<OpenBackPhase>("idle");
  const [openBackSnapshot, setOpenBackSnapshot] = useState<PageTurnSnapshot | null>(null);
  const [openBackMobileSource, setOpenBackMobileSource] = useState<MobilePage>("left");
  const [resultsHistory, setResultsHistory] = useState<Array<{
    results: CourseResult[];
    explanations: Record<number, string>;
    pagination: { hasMore: boolean; lastScore: number | null; lastId: number | null };
  }>>([]);
  const [forwardHistory, setForwardHistory] = useState<Array<{
    results: CourseResult[];
    explanations: Record<number, string>;
    pagination: { hasMore: boolean; lastScore: number | null; lastId: number | null };
  }>>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [mobilePage, setMobilePage] = useState<MobilePage>("left");
  const [bookPhase, setBookPhase] = useState<BookPhase>("idle");
  const [pageTurnSnapshot, setPageTurnSnapshot] = useState<PageTurnSnapshot | null>(null);
  const [pageTurnDirection, setPageTurnDirection] = useState<PageTurnDirection>("forward");
  const [reversePageTurnTarget, setReversePageTurnTarget] = useState<PageTurnSnapshot | null>(null);
  const mobileSwipeStart = useRef<{ x: number; y: number; startedAt: number } | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(typeof window !== "undefined" && window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    void prefetchLeaderboard("autumn26").catch(() => {});
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

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.backgroundColor;
    const prevBodyBg = body.style.backgroundColor;
    const prevHtmlOverscroll = html.style.overscrollBehaviorY;
    const prevBodyOverscroll = body.style.overscrollBehaviorY;
    const prevHtmlOverflowX = html.style.overflowX;
    const prevBodyOverflowX = body.style.overflowX;
    html.style.backgroundColor = "#000000";
    body.style.backgroundColor = "#000000";
    html.style.overscrollBehaviorY = "none";
    body.style.overscrollBehaviorY = "none";
    html.style.overflowX = "hidden";
    body.style.overflowX = "hidden";
    return () => {
      html.style.backgroundColor = prevHtmlBg;
      body.style.backgroundColor = prevBodyBg;
      html.style.overscrollBehaviorY = prevHtmlOverscroll;
      body.style.overscrollBehaviorY = prevBodyOverscroll;
      html.style.overflowX = prevHtmlOverflowX;
      body.style.overflowX = prevBodyOverflowX;
    };
  }, []);

  useEffect(() => {
    if (!["shifting", "opening", "closing", "recentering"].includes(bookPhase)) return;
    const timeout = window.setTimeout(() => {
      if (bookPhase === "shifting") setBookPhase("opening");
      if (bookPhase === "opening") setBookPhase("open");
      if (bookPhase === "closing") beginRecentering();
      if (bookPhase === "recentering") finishNewSearch();
    }, bookPhase === "shifting" || bookPhase === "recentering" ? 650 : 1000);
    return () => window.clearTimeout(timeout);
  }, [bookPhase]);

  useEffect(() => {
    if (backPhase !== "to-back" && backPhase !== "to-front") return;
    const timeout = window.setTimeout(
      () => setBackPhase(backPhase === "to-back" ? "back" : "idle"),
      900,
    );
    return () => window.clearTimeout(timeout);
  }, [backPhase]);

  useEffect(() => {
    if (openBackPhase !== "closing" && openBackPhase !== "centering") return;
    const timeout = window.setTimeout(() => {
      if (openBackPhase === "closing") {
        setOpenBackPhase("centering");
      } else {
        finishOpenToBack();
      }
    }, openBackPhase === "closing" ? 900 : 650);
    return () => window.clearTimeout(timeout);
  }, [openBackPhase]);

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
    const mobileView = typeof window !== "undefined" && window.innerWidth <= 768;
    window.scrollTo(0, 0);
    const t0 = performance.now();
    console.log("🔍 [TIMING] Search started at", new Date().toISOString());
    setLoading(true);
    setError(null);
      setResults([]);
    setExplanations({});
    setResultsHistory([]);
    setForwardHistory([]);
    setPageTurnSnapshot(null);
    setLoadingMobileRight(false);
    setMobilePage("left");
    setBookPhase(mobileView ? "opening" : "shifting");
    setHasSearched(true);
    setPagination({ hasMore: false, lastScore: null, lastId: null });

    try {
      const requestBody = { query: query.trim(), limit: mobileView ? 2 : 4, term: "autumn26" };
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

      await explainCourses(
        courses,
        query.trim(),
        setExplanations,
        { animateReveal: true },
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
    const mobileView = typeof window !== "undefined" && window.innerWidth <= 768;

    if (results.length > 0) {
      setResultsHistory((prev) => [...prev, { results, explanations, pagination }]);
    }
    setForwardHistory([]);
    setPageTurnSnapshot({ results, explanations });
    setLoadingMore(true);
    setError(null);
    const turnStartedAt = performance.now();
    if (mobileView) {
      requestAnimationFrame(() => setMobilePage("left"));
    }

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: query.trim(),
          term: "autumn26",
          limit: mobileView ? 2 : 4,
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
      setExplanations({});
      setResults(newCourses);
      setPagination(data.pagination || { hasMore: false, lastScore: null, lastId: null });

      const remainingTurnTime = Math.max(0, 820 - (performance.now() - turnStartedAt));
      await new Promise((resolve) => window.setTimeout(resolve, remainingTurnTime));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      setPageTurnSnapshot(null);
      setLoadingMore(false);

      await explainCourses(newCourses, query.trim(), setExplanations, {
        animateReveal: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoadingMore(false);
      setPageTurnSnapshot(null);
    }
  };

  const loadMobileRightPage = async () => {
    if (
      !query.trim() ||
      loadingMobileRight ||
      loadingMore ||
      !pagination.hasMore
    ) {
      return;
    }

    setMobilePage("right");
    setLoadingMobileRight(true);
    setError(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          term: "autumn26",
          limit: 2,
          lastScore: pagination.lastScore,
          lastId: pagination.lastId,
          excludeIds: results.map((course) => course.id),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Load more failed");
      }

      const rightCourses: CourseResult[] = data.results || [];
      setResults((current) => [...current.slice(0, 2), ...rightCourses]);
      setPagination(data.pagination || { hasMore: false, lastScore: null, lastId: null });
      setLoadingMobileRight(false);
      await explainCourses(rightCourses, query.trim(), setExplanations, {
        animateReveal: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoadingMobileRight(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await runSearch();
  };

  function finishNewSearch() {
    setQuery("");
    setResults([]);
    setExplanations({});
    setError(null);
    setHasSearched(false);
    setBookPhase("idle");
    setPagination({ hasMore: false, lastScore: null, lastId: null });
    setResultsHistory([]);
    setForwardHistory([]);
    setPageTurnSnapshot(null);
    setLoadingMobileRight(false);
    setMobilePage("left");
  }

  function beginRecentering() {
    setQuery("");
    setBookPhase("recentering");
  }

  const handleNewSearch = () => {
    if (bookPhase === "open") {
      setBookPhase("closing");
    }
  };

  const handleLeaderboardOpen = () => {
    if (backPhase !== "idle") return;
    if (hasSearched && bookPhase === "open") {
      setOpenBackSnapshot({ results, explanations });
      setOpenBackMobileSource(mobilePage);
      setOpenBackPhase("closing");
      if (isMobile && mobilePage === "right") {
        requestAnimationFrame(() => setMobilePage("left"));
      }
      return;
    }
    if (!hasSearched && bookPhase === "idle") {
      setBackPhase("to-back");
    }
  };

  function finishOpenToBack() {
    finishNewSearch();
    setOpenBackSnapshot(null);
    setOpenBackPhase("idle");
    setBackPhase("back");
  }

  const goBack = () => {
    if (resultsHistory.length === 0) return;
    setForwardHistory((f) => [...f, { results, explanations, pagination }]);
    const prev = resultsHistory[resultsHistory.length - 1];
    setResultsHistory((h) => h.slice(0, -1));
    setResults(prev.results);
    setExplanations(prev.explanations);
    setPagination(prev.pagination);
    setMobilePage("left");
  };

  const goBackWithAnimation = () => {
    if (!isMobile || resultsHistory.length === 0 || pageTurnSnapshot) {
      goBack();
      return;
    }

    const previous = resultsHistory[resultsHistory.length - 1];
    setForwardHistory((current) => [...current, { results, explanations, pagination }]);
    setResultsHistory((current) => current.slice(0, -1));
    setPageTurnSnapshot({ results, explanations });
    setReversePageTurnTarget({
      results: previous.results,
      explanations: previous.explanations,
    });
    setPageTurnDirection("backward");
    setResults(previous.results);
    setExplanations(previous.explanations);
    setPagination(previous.pagination);

    requestAnimationFrame(() => setMobilePage("right"));
    window.setTimeout(() => {
      setPageTurnSnapshot(null);
      setReversePageTurnTarget(null);
      setPageTurnDirection("forward");
    }, 800);
  };

  const goForward = () => {
    if (forwardHistory.length === 0) return;
    setResultsHistory((h) => [...h, { results, explanations, pagination }]);
    const next = forwardHistory[forwardHistory.length - 1];
    setForwardHistory((f) => f.slice(0, -1));
    setResults(next.results);
    setExplanations(next.explanations);
    setPagination(next.pagination);
    setMobilePage("left");
  };

  const goForwardWithAnimation = () => {
    if (forwardHistory.length === 0 || pageTurnSnapshot) return;

    const next = forwardHistory[forwardHistory.length - 1];
    setResultsHistory((current) => [...current, { results, explanations, pagination }]);
    setForwardHistory((current) => current.slice(0, -1));
    setPageTurnSnapshot({ results, explanations });
    setReversePageTurnTarget(null);
    setPageTurnDirection("forward");
    setResults(next.results);
    setExplanations(next.explanations);
    setPagination(next.pagination);

    if (isMobile) {
      requestAnimationFrame(() => setMobilePage("left"));
    } else {
      setMobilePage("left");
    }

    window.setTimeout(() => {
      setPageTurnSnapshot(null);
    }, 800);
  };

  const mobileNavigationIsBusy =
    !isMobile ||
    !hasSearched ||
    bookPhase !== "open" ||
    backPhase !== "idle" ||
    openBackPhase !== "idle" ||
    loading ||
    loadingMore ||
    loadingMobileRight ||
    pageTurnSnapshot !== null;

  const handleMobileSwipeStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (mobileNavigationIsBusy || event.touches.length !== 1) {
      mobileSwipeStart.current = null;
      return;
    }

    const touch = event.touches[0];
    mobileSwipeStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      startedAt: performance.now(),
    };
  };

  const handleMobileSwipeEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = mobileSwipeStart.current;
    mobileSwipeStart.current = null;
    if (!start || mobileNavigationIsBusy || event.changedTouches.length !== 1) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const distanceX = Math.abs(deltaX);
    const distanceY = Math.abs(deltaY);
    const elapsed = Math.max(performance.now() - start.startedAt, 1);
    const velocityX = distanceX / elapsed;
    const distanceThreshold = Math.min(64, window.innerWidth * 0.14);
    const isDeliberateHorizontalSwipe =
      distanceX > distanceY * 1.25 &&
      (distanceX >= distanceThreshold || (distanceX >= 28 && velocityX >= 0.45));

    if (!isDeliberateHorizontalSwipe) return;
    event.preventDefault();

    if (deltaX < 0) {
      // Swipe left: reveal the right-hand page, then advance to the next spread.
      if (mobilePage === "left") {
        if (results.length > 2) {
          setMobilePage("right");
        } else if (pagination.hasMore) {
          void loadMobileRightPage();
        } else if (forwardHistory.length > 0) {
          goForwardWithAnimation();
        }
      } else if (forwardHistory.length > 0) {
        goForwardWithAnimation();
      } else if (pagination.hasMore) {
        void loadMore();
      }
      return;
    }

    // Swipe right: reveal the left-hand page, then return to the previous spread.
    if (mobilePage === "right") {
      setMobilePage("left");
    } else if (resultsHistory.length > 0) {
      goBackWithAnimation();
    }
  };

  const cancelMobileSwipe = () => {
    mobileSwipeStart.current = null;
  };

  const barBtnStyle = {
    ...styles.resultsBottomBarBtn,
    ...(isMobile ? { fontSize: "10px", padding: "0.45rem 0.55rem" } : {}),
  };

  return (
    <>
      <a href="/spring-2026" className="autumn-corner-pill autumn-corner-pill-left">
        <span>Spring 26</span>
      </a>
      <button
        type="button"
        className="autumn-corner-pill autumn-corner-pill-right"
        onClick={handleLeaderboardOpen}
      >
        <span>Most searched</span>
      </button>
      <a
        href="https://vernatus.com"
        target="_blank"
        rel="noopener noreferrer"
        className="autumn-corner-pill mobile-ver-natus"
      >
        <span>Ver Natus</span>
      </a>
      <style>{`
        button,
        a,
        textarea,
        input {
          -webkit-tap-highlight-color: transparent;
        }

        button:focus,
        a:focus,
        textarea:focus,
        input:focus {
          outline: none;
        }

        button:focus-visible,
        a:focus-visible {
          outline: 2px solid #8a8a8a;
          outline-offset: 2px;
        }

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

        .autumn-black-grain,
        .autumn-results-controls button,
        .autumn-meta-percentage,
        .book-transition-credit,
        .book-transition-edition,
        .book-transition-search::after {
          background-color: #080808 !important;
          background-image:
            linear-gradient(rgba(8, 8, 8, 0.76), rgba(8, 8, 8, 0.76)),
            radial-gradient(ellipse 80% 60% at 14% 10%, rgba(255,255,255,0.08), transparent 55%),
            radial-gradient(ellipse 70% 50% at 90% 88%, rgba(255,255,255,0.05), transparent 58%),
            url("/autumn-film-grain.png") !important;
          background-size: 100% 100%, 100% 100%, 100% 100%, 72px 72px !important;
          background-repeat: no-repeat, no-repeat, no-repeat, repeat !important;
        }

        .autumn-corner-pill {
          --pill-pad: 3.5px;
          position: fixed;
          top: max(16px, env(safe-area-inset-top));
          z-index: 100;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 35px;
          min-width: 76px;
          padding: 0 14px;
          box-sizing: border-box;
          border: 0.5px solid rgba(255, 255, 255, 0.25);
          border-radius: 999px;
          background: rgba(24, 24, 24, 0.8);
          color: #050505 !important;
          -webkit-text-fill-color: #050505;
          font: 10px "Roboto Mono", monospace;
          text-decoration: none;
          cursor: pointer;
          -webkit-backdrop-filter: blur(24px) saturate(1.25);
          backdrop-filter: blur(24px) saturate(1.25);
          box-shadow:
            0 10px 30px rgba(0, 0, 0, 0.16),
            inset 0 1px 2px rgba(255, 255, 255, 0.2),
            inset 0 -1px 1px rgba(255, 255, 255, 0.08);
          transition: transform 180ms ease;
        }

        .autumn-corner-pill-left {
          left: 20px;
        }

        .autumn-corner-pill-right {
          right: 20px;
        }

        .autumn-corner-pill::before {
          content: "";
          position: absolute;
          inset: var(--pill-pad);
          border-radius: 999px;
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.93), rgba(255, 255, 255, 0.66));
          box-shadow:
            0 2px 5px rgba(0, 0, 0, 0.08),
            inset 0 1px 1px #fff;
          transition: background 250ms ease;
          pointer-events: none;
        }

        .autumn-corner-pill span {
          position: relative;
          z-index: 1;
        }

        .autumn-corner-pill:focus-visible {
          outline: 2px solid #8a8a8a;
          outline-offset: 2px;
        }

        .mobile-ver-natus {
          display: none;
        }

        @media (max-width: 600px), (pointer: coarse) {
          .autumn-corner-pill {
            --pill-pad: 3px;
            top: max(12px, env(safe-area-inset-top));
            height: 42px;
            padding: 0 13px;
            font-size: 10px;
          }
        }

        @keyframes autumn-book-shift {
          from { transform: translate(-50%, -50%); }
          to { transform: translate(calc(-50% + 240px), -50%); }
        }

        @keyframes autumn-book-open {
          from { transform: rotateY(0deg); }
          to { transform: rotateY(-178deg); }
        }

        @keyframes autumn-book-close {
          from { transform: rotateY(-178deg); }
          to { transform: rotateY(0deg); }
        }

        @keyframes autumn-book-recenter {
          from { transform: translate(calc(-50% + 240px), -50%); }
          to { transform: translate(-50%, -50%); }
        }

        @keyframes autumn-book-recenter-mobile {
          from { transform: translate(-50%, -50%); }
          to { transform: translate(-50%, -50%); }
        }

        @keyframes autumn-mobile-camera-close {
          from { transform: translate(calc(-50% + min(90vw, 480px)), -50%); }
          to { transform: translate(-50%, -50%); }
        }

        @keyframes autumn-book-to-back {
          from { transform: rotateY(0deg); }
          to { transform: rotateY(-180deg); }
        }

        @keyframes autumn-book-to-front {
          from { transform: rotateY(-180deg); }
          to { transform: rotateY(0deg); }
        }

        @keyframes autumn-open-page-to-back {
          from { transform: rotateY(0deg); }
          to { transform: rotateY(-180deg); }
        }

        @keyframes autumn-closed-back-center {
          from { transform: translate(0, -50%); }
          to { transform: translate(240px, -50%); }
        }

        @keyframes autumn-closed-back-center-mobile {
          from { transform: translate(min(45vw, 240px), -50%); }
          to { transform: translate(min(45vw, 240px), -50%); }
        }

        @keyframes autumn-book-shift-mobile {
          from { transform: translate(-50%, -50%); }
          to { transform: translate(calc(-50% + min(90vw, 480px)), -50%); }
        }

        @keyframes autumn-mobile-camera-open {
          from { transform: translate(-50%, -50%); }
          to { transform: translate(calc(-50% + min(90vw, 480px)), -50%); }
        }

        @keyframes autumn-mobile-pages-follow {
          0% {
            opacity: 0;
            transform: translateX(calc(-50% + 12px));
          }
          12% {
            opacity: 0;
          }
          22% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes autumn-mobile-pages-close {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }

        @keyframes autumn-pages-reveal {
          from {
            opacity: 0;
            transform: scale(0.985);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes autumn-page-turn {
          from { transform: rotateY(0deg); }
          to { transform: rotateY(-180deg); }
        }

        @keyframes autumn-page-turn-backward {
          from { transform: rotateY(0deg); }
          to { transform: rotateY(180deg); }
        }

        @keyframes autumn-word-reveal {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }

        @keyframes autumn-meta-reveal {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .autumn-meta-reveal {
          animation: autumn-meta-reveal 420ms ease-out both;
        }

        .autumn-meta-title {
          animation-delay: 70ms;
        }

        .autumn-meta-instructors {
          animation-delay: 140ms;
        }

        .autumn-meta-percentage {
          animation-delay: 105ms;
        }

        .autumn-reveal-word {
          display: inline-block;
          animation: autumn-word-reveal 360ms ease-out both;
          will-change: opacity;
        }

        @media (prefers-reduced-motion: reduce) {
          .autumn-reveal-word {
            animation: none;
          }
          .autumn-meta-reveal {
            animation: none;
          }
        }

        .mobile-fixed {
          height: 100vh;
          overflow: hidden;
        }

        .autumn-cover-stage {
          background-image:
            radial-gradient(ellipse 780px 680px at calc(50% - 90px) 44%, #8b857c 0%, #56514c 30%, #292725 55%, #0b0b0b 78%, #000000 100%),
            linear-gradient(115deg, #181818 0%, #000000 65%);
          background-attachment: fixed, fixed;
          background-position: center, center;
          background-repeat: no-repeat, no-repeat;
          background-color: #000000;
        }

        .search-box-wrapper.cover-mode::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 3;
          border-radius: 0 18px 18px 0;
          box-shadow:
            inset 2px 2px 1px rgba(255, 255, 255, 0.52),
            inset -5px -4px 5px rgba(0, 0, 0, 0.3),
            1px 2px 1px rgba(255, 255, 255, 0.1);
          pointer-events: none;
        }

        .search-box-wrapper.cover-mode .box-image {
          border-radius: 0 18px 18px 0;
          box-shadow:
            18px 22px 24px rgba(0, 0, 0, 0.78),
            7px 9px 9px rgba(0, 0, 0, 0.58),
            -5px -5px 18px rgba(255, 244, 226, 0.16);
        }

        .search-box-wrapper.cover-mode .box-image::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background:
            linear-gradient(112deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.04) 27%, transparent 48%),
            linear-gradient(90deg, transparent 92%, rgba(0, 0, 0, 0.16) 100%);
          mix-blend-mode: soft-light;
          pointer-events: none;
        }

        .book-transition {
          position: fixed;
          top: 50%;
          left: 50%;
          width: 480px;
          height: 600px;
          z-index: 80;
          pointer-events: none;
          perspective: 1500px;
          transform: translate(-50%, -50%);
        }

        .back-book-transition {
          position: fixed;
          top: 50%;
          left: 50%;
          width: 480px;
          height: 600px;
          z-index: 80;
          pointer-events: none;
          perspective: 1500px;
          transform: translate(-50%, -50%);
        }

        .back-book-transition.back {
          pointer-events: auto;
        }

        .back-book-rig {
          position: absolute;
          inset: 0;
          transform-style: preserve-3d;
        }

        .back-book-transition.to-back .back-book-rig {
          animation: autumn-book-to-back 820ms cubic-bezier(0.42, 0, 0.2, 1) forwards;
        }

        .back-book-transition.back .back-book-rig {
          transform: rotateY(-180deg);
        }

        .back-book-transition.to-front .back-book-rig {
          animation: autumn-book-to-front 820ms cubic-bezier(0.42, 0, 0.2, 1) forwards;
        }

        .back-book-face {
          position: absolute;
          inset: 0;
          overflow: hidden;
          border-radius: 18px;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          box-shadow:
            18px 22px 24px rgba(0, 0, 0, 0.72),
            inset 2px 2px 1px rgba(255, 255, 255, 0.35);
        }

        .back-book-front {
          display: flex;
          flex-direction: column;
          align-items: center;
          border-radius: 0 18px 18px 0;
          background: url("/dithered-background-autumn.png") center / cover no-repeat;
        }

        .back-book-back {
          transform: rotateY(180deg);
          pointer-events: none;
          border-radius: 18px 0 0 18px;
          background:
            linear-gradient(rgba(15, 14, 13, 0.08), rgba(15, 14, 13, 0.08)),
            url("/dithered-background-autumn.png") center / cover no-repeat;
        }

        .back-book-transition.back .back-book-back {
          z-index: 2;
          pointer-events: auto;
        }

        .open-to-back-transition {
          position: fixed;
          top: 50%;
          left: 50%;
          width: 480px;
          height: 600px;
          z-index: 82;
          perspective: 1500px;
          pointer-events: none;
          transform: translate(0, -50%);
        }

        .open-to-back-transition.centering {
          animation: autumn-closed-back-center 480ms cubic-bezier(0.22, 0.78, 0.24, 1) forwards;
        }

        .open-to-back-sheet {
          position: absolute;
          inset: 0;
          border-radius: 26px;
          transform-origin: left center;
          transform-style: preserve-3d;
          will-change: transform;
        }

        .open-to-back-transition.closing .open-to-back-sheet {
          animation: autumn-open-page-to-back 820ms cubic-bezier(0.42, 0, 0.2, 1) forwards;
        }

        .open-to-back-transition.centering .open-to-back-sheet {
          transform: rotateY(-180deg);
        }

        .open-to-back-face {
          position: absolute;
          inset: 0;
          box-sizing: border-box;
          overflow: hidden;
          border-radius: 0 26px 26px 0;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          background:
            repeating-linear-gradient(0deg, rgba(102, 77, 48, 0.022) 0 1px, transparent 1px 5px),
            linear-gradient(90deg, #fffdf8, #fffaf1 92%, #eee4d5);
        }

        .open-to-back-front {
          padding: 1.7rem 1.75rem 3.4rem 1.2rem;
        }

        .open-to-back-back {
          transform: rotateY(180deg);
          border-radius: 26px 0 0 26px;
          background:
            linear-gradient(rgba(15, 14, 13, 0.08), rgba(15, 14, 13, 0.08)),
            url("/dithered-background-autumn.png") center / cover no-repeat;
          box-shadow:
            18px 22px 24px rgba(0, 0, 0, 0.72),
            inset 2px 2px 1px rgba(255, 255, 255, 0.35);
        }

        .search-box-wrapper.back-view-hidden {
          visibility: hidden;
        }

        .search-box-wrapper.back-view-hidden > .autumn-results-book {
          visibility: hidden !important;
          opacity: 0 !important;
          animation: none !important;
        }

        .search-box-wrapper.open-back-closing > .autumn-results-book {
          clip-path: inset(0 50% 0 0);
        }

        .book-transition.shifting {
          animation: autumn-book-shift 480ms cubic-bezier(0.22, 0.78, 0.24, 1) forwards;
        }

        .book-transition.opening,
        .book-transition.closing {
          transform: translate(calc(-50% + 240px), -50%);
        }

        .book-transition.recentering {
          animation: autumn-book-recenter 480ms cubic-bezier(0.22, 0.78, 0.24, 1) forwards;
        }

        .book-cover-rig {
          position: absolute;
          inset: 0;
          transform-origin: left center;
          transform-style: preserve-3d;
        }

        .book-transition.opening .book-cover-rig {
          animation: autumn-book-open 820ms cubic-bezier(0.42, 0, 0.2, 1) forwards;
        }

        .book-transition.closing .book-cover-rig {
          animation: autumn-book-close 820ms cubic-bezier(0.42, 0, 0.2, 1) forwards;
        }

        .book-transition.recentering .book-cover-rig {
          transform: rotateY(0deg);
        }

        .book-cover-face {
          position: absolute;
          inset: 0;
          overflow: hidden;
          border-radius: 18px;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }

        .book-cover-front {
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          border-radius: 0 18px 18px 0;
          background: url("/dithered-background-autumn.png") center / cover no-repeat;
          box-shadow:
            inset 2px 2px 1px rgba(255, 255, 255, 0.48),
            inset -5px -4px 5px rgba(0, 0, 0, 0.3),
            18px 22px 24px rgba(0, 0, 0, 0.72);
        }

        .book-cover-inside {
          transform: rotateY(180deg);
          border-radius: 18px 0 0 18px;
          background:
            repeating-linear-gradient(0deg, rgba(90, 72, 52, 0.035) 0 1px, transparent 1px 4px),
            linear-gradient(90deg, #d6c6ae 0%, #f5ecdd 8%, #fbf6ec 72%, #e7dac6 100%);
          box-shadow:
            inset -18px 0 28px rgba(85, 62, 40, 0.16),
            inset 2px 0 rgba(255, 255, 255, 0.6);
        }

        .book-cover-inside::after {
          content: "Stanford Course Registry · Autumn 2026";
          position: absolute;
          right: 28px;
          bottom: 26px;
          color: rgba(64, 48, 35, 0.42);
          font: 9px "Roboto Mono", monospace;
          letter-spacing: 0.04em;
        }

        .book-transition-title {
          position: absolute;
          top: 56px;
          left: 0;
          right: 0;
          margin: 0;
          padding: 0.5rem 1rem;
          color: #1a1a1a;
          font: normal 3.2em/1.2 "Jersey 15", sans-serif;
          letter-spacing: 0.1em;
          text-align: center;
          box-sizing: border-box;
        }

        .book-transition-credit,
        .book-transition-edition {
          position: absolute;
          z-index: 3;
          color: #f0f0f0;
          background: #000;
          font: 9px "Roboto Mono", monospace;
        }

        .book-transition-credit {
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          padding: 0.4rem 0.7rem;
          border-radius: 0 0 10px 10px;
          white-space: nowrap;
        }

        .book-transition-edition {
          top: 18px;
          right: 0;
          padding: 0.4rem 0.5rem;
          border-radius: 10px 0 0 10px;
          writing-mode: vertical-rl;
        }

        .book-transition-search {
          position: absolute;
          left: 50%;
          width: 80%;
          max-width: 384px;
          bottom: 55px;
          min-height: 72px;
          transform: translateX(-50%);
          box-sizing: border-box;
          padding: 0.6rem 3.2rem 0.6rem 0.65rem;
          overflow: hidden;
          border-radius: 12px;
          background: #f0f0f0;
          color: #171717;
          font: 11px/1.3 "Roboto Mono", monospace;
          text-align: left;
        }

        .book-transition-search::after {
          content: "⌕";
          position: absolute;
          right: 8px;
          bottom: 10px;
          width: 28px;
          height: 28px;
          display: grid;
          place-items: center;
          padding-top: 3px;
          border-radius: 8px;
          background: #000;
          color: #fff;
          font-size: 17px;
        }

        .search-box-wrapper.book-pages-hidden > .autumn-results-book {
          visibility: hidden;
          opacity: 0 !important;
          animation: none !important;
          transition: none !important;
        }

        .autumn-results-book {
          opacity: 1;
          background: transparent !important;
          box-shadow: none;
          overflow: visible !important;
        }

        .results-page-surface {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 50%;
          z-index: 1;
          border-radius: 18px;
          background: linear-gradient(90deg, #eee4d5, #fffaf1 8%, #fffdf8);
          box-shadow: 0 18px 28px rgba(0, 0, 0, 0.5);
          pointer-events: none;
        }

        .results-page-surface::after {
          content: "";
          position: absolute;
          inset: 18px 14px 26px;
          border-radius: 8px;
          background: repeating-linear-gradient(
            0deg,
            rgba(102, 77, 48, 0.022) 0 1px,
            transparent 1px 5px
          );
        }

        .results-page-surface-left {
          left: 0;
          border-radius: 18px 0 0 18px;
        }

        .results-page-surface-right {
          right: 0;
          border-radius: 0 18px 18px 0;
          background: linear-gradient(90deg, #fffdf8, #fffaf1 92%, #eee4d5);
        }

        .results-page-surface-right::after {
          background-position: 0 2px;
        }

        .autumn-results-book > .results-list {
          position: relative;
          z-index: 2;
        }

        .autumn-results-book > .autumn-results-controls {
          position: relative;
          z-index: 5;
        }

        .autumn-results-book::after {
          content: "";
          position: absolute;
          top: 18px;
          bottom: 18px;
          left: 50%;
          width: 14px;
          z-index: 3;
          opacity: 0.4;
          transform: translateX(-50%);
          background: linear-gradient(
            90deg,
            #f4eadc,
            #b9a287 35%,
            #80684f 48%,
            #fff9ef 56%,
            #e8dac7
          );
          box-shadow: inset 2px 0 5px rgba(73, 52, 31, 0.14);
          pointer-events: none;
        }

        .page-turn-scene {
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          left: 50%;
          z-index: 12;
          perspective: 1500px;
          pointer-events: none;
        }

        .page-turn-static-left {
          position: absolute;
          top: 0;
          right: 50%;
          bottom: 0;
          left: 0;
          z-index: 11;
          box-sizing: border-box;
          overflow: hidden;
          border-radius: 18px 0 0 18px;
          clip-path: inset(0 round 18px);
          -webkit-clip-path: inset(0 round 18px);
          padding: 1.7rem 1.2rem 3.4rem 1.75rem;
          pointer-events: none;
          background:
            repeating-linear-gradient(
              0deg,
              rgba(102, 77, 48, 0.022) 0 1px,
              transparent 1px 5px
            ),
            linear-gradient(90deg, #eee4d5, #fffaf1 8%, #fffdf8);
        }

        .page-turn-sheet {
          position: absolute;
          inset: 0;
          border-radius: 26px;
          transform-origin: left center;
          transform-style: preserve-3d;
          will-change: transform;
          animation: autumn-page-turn 780ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        .page-turn-scene.page-turn-scene-backward {
          right: 50%;
          left: 0;
        }

        .page-turn-scene-backward .page-turn-sheet {
          transform-origin: right center;
          animation-name: autumn-page-turn-backward;
        }

        .page-turn-scene-backward .page-turn-front {
          padding: 1.7rem 1.2rem 3.4rem 1.75rem;
        }

        .page-turn-scene-backward .page-turn-back {
          padding: 1.7rem 1.75rem 3.4rem 1.2rem;
        }

        .page-turn-face {
          position: absolute;
          inset: 0;
          box-sizing: border-box;
          overflow: hidden;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          background:
            repeating-linear-gradient(
              0deg,
              rgba(102, 77, 48, 0.022) 0 1px,
              transparent 1px 5px
            ),
            linear-gradient(90deg, #fffdf8, #fffaf1 92%, #eee4d5);
        }

        .page-turn-front {
          border-radius: 0 26px 26px 0;
          padding: 1.7rem 1.75rem 3.4rem 1.2rem;
          box-shadow:
            inset 12px 0 18px rgba(91, 67, 39, 0.08),
            -3px 0 8px rgba(75, 53, 31, 0.16);
        }

        .page-turn-back {
          transform: rotateY(180deg);
          border-radius: 26px 0 0 26px;
          padding: 1.7rem 1.2rem 3.4rem 1.75rem;
          background:
            repeating-linear-gradient(
              0deg,
              rgba(102, 77, 48, 0.022) 0 1px,
              transparent 1px 5px
            ),
            linear-gradient(90deg, #eee4d5, #fffaf1 8%, #fffdf8);
          box-shadow: inset -14px 0 22px rgba(91, 67, 39, 0.1);
        }

        .page-turn-scene-backward .page-turn-front {
          border-radius: 26px 0 0 26px;
        }

        .page-turn-scene-backward .page-turn-back {
          border-radius: 0 26px 26px 0;
        }

        .page-turn-cards {
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .page-turn-card {
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }

        .autumn-results-book .results-page {
          position: relative;
          padding: 0.2rem 0.25rem;
          z-index: 2;
          background: transparent;
          transition: opacity 180ms ease-out;
          overflow: hidden;
          border-radius: 0;
        }

        .autumn-results-book .results-page:first-child {
          border-radius: 0;
          padding-left: 0.25rem;
          padding-right: 1.5rem;
        }

        .autumn-results-book .results-page:last-child {
          border-radius: 0;
          padding-left: 1.5rem;
          padding-right: 0.25rem;
        }

        .search-box-wrapper.book-opening .autumn-results-book .results-page:first-child,
        .search-box-wrapper.book-closing .autumn-results-book .results-page:first-child {
          opacity: 0;
        }

        .search-box-wrapper.book-opening > .autumn-results-book,
        .search-box-wrapper.book-closing > .autumn-results-book {
          clip-path: inset(0 0 0 50%);
        }

        .search-box-wrapper:not(.book-pages-hidden) > .autumn-results-book {
          visibility: visible;
          animation: autumn-pages-reveal 500ms ease-out both;
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
            width: 14px !important;
            height: auto !important;
            min-height: 100% !important;
            margin: 0 0.35rem !important;
            background: transparent !important;
            box-shadow: none;
          }
          .search-box-wrapper.has-results {
            width: 960px !important;
            height: 600px !important;
          }
          .search-box-wrapper.has-leaderboard {
            width: 480px !important;
            height: 600px !important;
            aspect-ratio: auto !important;
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
          .search-box-wrapper.has-results,
          .search-box-wrapper.has-leaderboard {
            border-radius: 18px;
          }
          .search-box-wrapper.has-results {
            overflow: visible !important;
          }
          .search-box-wrapper.has-leaderboard {
            overflow: hidden !important;
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
            border-radius: 18px;
            overflow: hidden;
          }
          .box-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center;
            image-rendering: pixelated;
            display: block;
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
          .mobile-ver-natus {
            position: fixed;
            top: auto;
            left: 50%;
            right: auto;
            bottom: calc(max(12px, env(safe-area-inset-bottom)) + 6px);
            z-index: 100;
            display: inline-flex;
            transform: translateX(-50%);
            color: #ffffff !important;
            -webkit-text-fill-color: #ffffff;
            background: transparent;
            border-color: transparent;
            box-shadow: none;
            -webkit-backdrop-filter: none;
            backdrop-filter: none;
            white-space: nowrap;
          }
          .mobile-ver-natus::before {
            background: transparent;
            box-shadow: none;
          }
          .mobile-ver-natus span {
            color: #ffffff !important;
            -webkit-text-fill-color: #ffffff;
          }

          .search-box-wrapper.book-opening > .autumn-results-book {
            visibility: visible;
            opacity: 0;
            clip-path: inset(0 0 0 50%);
            animation: autumn-mobile-pages-follow 820ms cubic-bezier(0.42, 0, 0.2, 1) both !important;
          }
          .search-box-wrapper.book-closing > .autumn-results-book {
            visibility: visible;
            animation: autumn-mobile-pages-close 820ms cubic-bezier(0.42, 0, 0.2, 1) both !important;
          }
          .search-box-wrapper.open-back-closing > .autumn-results-book {
            visibility: visible;
            clip-path: none;
            box-shadow: none;
            overflow: visible !important;
          }
          .search-box-wrapper.open-back-closing > .autumn-results-book::after {
            opacity: 0;
          }
          .search-box-wrapper.open-back-closing .results-list-mobile > .results-page:last-child {
            visibility: hidden;
          }
          .search-box-wrapper.open-back-closing .results-page-surface-right {
            visibility: hidden;
          }
          .book-transition {
            width: 90%;
            max-width: 480px;
            height: auto;
            aspect-ratio: 4 / 6.4;
          }
          .back-book-transition {
            width: 90%;
            max-width: 480px;
            height: auto;
            aspect-ratio: 4 / 6.4;
          }
          .open-to-back-transition {
            width: 90%;
            max-width: 480px;
            height: auto;
            aspect-ratio: 4 / 6.4;
            transform: translate(min(45vw, 240px), -50%);
          }
          .open-to-back-transition.closing.follow-mobile-page {
            animation: autumn-mobile-camera-open 820ms cubic-bezier(0.42, 0, 0.2, 1) forwards;
          }
          .open-to-back-transition.centering {
            animation-name: autumn-closed-back-center-mobile;
          }
          .open-to-back-front {
            padding: 1.5rem;
          }
          /* Mirror the real pages, including their 0.2rem top inset and half the 12px spine divider. */
          .page-turn-front {
            padding: 1.7rem 1.75rem 3.4rem calc(1.5rem + 6px);
          }
          .page-turn-back {
            padding: 1.7rem calc(1.5rem + 6px) 3.4rem 1.75rem;
          }
          .page-turn-static-left {
            padding: 1.7rem calc(1.5rem + 6px) 3.4rem 1.75rem;
          }
          .page-turn-scene-backward .page-turn-front {
            padding: 1.7rem calc(1.5rem + 6px) 3.4rem 1.75rem;
          }
          .page-turn-scene-backward .page-turn-back {
            padding: 1.7rem 1.75rem 3.4rem calc(1.5rem + 6px);
          }
          .book-transition.shifting {
            animation-name: autumn-book-shift-mobile;
          }
          .book-transition.opening {
            animation: autumn-mobile-camera-open 820ms cubic-bezier(0.42, 0, 0.2, 1) forwards;
          }
          .book-transition.closing {
            animation: autumn-mobile-camera-close 820ms cubic-bezier(0.42, 0, 0.2, 1) forwards;
          }
          .book-transition.recentering {
            animation: autumn-book-recenter-mobile 80ms linear forwards;
          }
          .book-transition-title {
            top: 13%;
            font-size: 2.3em;
          }
          .book-transition-search {
            bottom: 9%;
            width: 95%;
            max-width: none;
          }
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
            font-size: 2.3em !important;
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
            overflow-x: hidden !important;
          }
          .mobile-footer {
            position: fixed !important;
            bottom: 20px !important;
          }
          .search-box-wrapper {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 480px;
            aspect-ratio: 4 / 6.4;
            padding: 0;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            overflow: visible;
            z-index: 2;
          }
          .search-box-wrapper.cover-mode .box-image img {
            transform: scale(1.16);
            transform-origin: center;
          }
          .book-cover-front {
            background-size: auto 116%;
          }
          .back-book-front {
            background-size: auto 116%;
          }
          .back-book-back,
          .open-to-back-back {
            background-size: auto, auto 128%;
          }
          .search-box-wrapper.has-results,
          .search-box-wrapper.has-leaderboard {
            position: fixed !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            aspect-ratio: auto !important;
            width: 90% !important;
            max-width: 480px !important;
            height: min(144vw, 768px) !important;
            border-radius: 18px;
          }
          .search-box-wrapper.has-results {
            overflow: visible !important;
          }
          .search-box-wrapper.has-results.mobile-book {
            width: 180vw !important;
            max-width: 960px !important;
            transition: transform 620ms cubic-bezier(0.22, 0.78, 0.24, 1);
            will-change: transform;
          }
          .search-box-wrapper.has-results.mobile-book.mobile-page-turning {
            transition-duration: 780ms;
            transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
          }
          .search-box-wrapper.has-results.mobile-book.mobile-page-left {
            transform: translate(-25%, -50%) !important;
          }
          .search-box-wrapper.has-results.mobile-book.mobile-page-right {
            transform: translate(-75%, -50%) !important;
          }
          .search-box-wrapper.has-results.mobile-book.open-back-following {
            transition-duration: 780ms;
            transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
          }
          .search-box-wrapper.has-results.mobile-book.book-opening {
            transition: none !important;
          }
          .search-box-wrapper.has-leaderboard {
            overflow: hidden !important;
          }
          .search-box-wrapper.has-results::before,
          .search-box-wrapper.has-results::after {
            left: 0;
            top: 50%;
            width: 100%;
            height: min(600px, 112.5vw);
            translate: 0 -50%;
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
            border-radius: 18px;
            overflow: hidden;
          }
          .box-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center;
            image-rendering: pixelated;
            display: block;
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
            flex-direction: row !important;
            width: 100% !important;
          }
          .autumn-results-book {
            touch-action: pan-y pinch-zoom;
            overscroll-behavior-x: contain;
          }
          .search-box-wrapper:not(.book-pages-hidden) > .autumn-results-book {
            animation: none;
          }
          .results-list-mobile .results-page-divider {
            display: block !important;
            width: 12px !important;
            height: auto !important;
            min-height: 100% !important;
            flex: 0 0 12px !important;
            background: transparent !important;
          }
          .search-box-wrapper.book-closing .results-list-mobile .results-page-divider {
            width: 0 !important;
            flex-basis: 0 !important;
          }
          .mobile-open-to-back-back {
            padding: 0 !important;
            background:
              linear-gradient(rgba(15, 14, 13, 0.08), rgba(15, 14, 13, 0.08)),
              url("/dithered-background-autumn.png") center / auto 128% no-repeat !important;
            box-shadow:
              18px 22px 24px rgba(0, 0, 0, 0.72),
              inset 2px 2px 1px rgba(255, 255, 255, 0.35);
          }
          .results-list-mobile .results-page {
            flex: 1 1 0 !important;
            min-width: 0 !important;
          }
          .mobile-two-page-bar {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            width: 100%;
          }
          .mobile-page-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 0.25rem;
            box-sizing: border-box;
          }
          .mobile-page-bar-left {
            padding-right: 1.5rem;
          }
          .mobile-page-bar-right {
            padding-left: 1.5rem;
          }
          .results-list-mobile .simple-card-descr {
            min-height: 240px !important;
            height: auto !important;
            max-height: 280px !important;
            overflow-y: auto !important;
          }
        }
      `}</style>
      {bookPhase !== "idle" && bookPhase !== "open" && (
        <BookTransition
          phase={bookPhase}
          query={query}
          onShiftComplete={() => setBookPhase("opening")}
          onOpenComplete={() => setBookPhase("open")}
          onCloseComplete={beginRecentering}
          onRecenterComplete={finishNewSearch}
        />
      )}
      {backPhase !== "idle" && (
        <BackCoverTransition
          phase={backPhase}
          query={query}
          isMobile={isMobile}
          onBack={() => setBackPhase("back")}
          onFront={() => setBackPhase("idle")}
          onClose={() => setBackPhase("to-front")}
        />
      )}
      {openBackPhase !== "idle" && openBackSnapshot && (!isMobile || openBackPhase === "centering") && (
        <OpenToBackTransition
          phase={openBackPhase}
          snapshot={openBackSnapshot}
          isMobile={isMobile}
          followMobilePage={openBackMobileSource === "right"}
          onClosed={() => setOpenBackPhase("centering")}
          onCentered={finishOpenToBack}
        />
      )}
      <div 
        className={`${!hasSearched || (hasSearched && (loading || loadingMore || results.length > 0)) ? "mobile-fixed" : "mobile-scrollable"} mobile-container autumn-cover-stage${isMobile && hasSearched && (loading || loadingMore || results.length > 0) ? " mobile-has-results" : ""}`}
        style={{
          ...styles.container,
          ...((loading || hasSearched) && !isMobile ? { justifyContent: "flex-start", paddingTop: "0px" } : {})
        }}
      >
      <div
        className={`search-box-wrapper ${!hasSearched ? "cover-mode" : ""} ${backPhase !== "idle" || openBackPhase === "centering" ? "back-view-hidden" : ""} ${openBackPhase === "closing" ? "open-back-closing" : ""} ${openBackPhase === "closing" && openBackMobileSource === "right" ? "open-back-following" : ""} ${hasSearched ? "has-results" : ""} ${isMobile && hasSearched ? `mobile-book mobile-page-${mobilePage}` : ""} ${isMobile && pageTurnSnapshot ? "mobile-page-turning" : ""} ${hasSearched && (bookPhase === "shifting" || bookPhase === "recentering") ? "book-pages-hidden" : ""} ${bookPhase === "opening" ? "book-opening" : ""} ${bookPhase === "closing" ? "book-closing" : ""}`}
        style={
          wrapperSize && hasSearched && !loading && !loadingMore && results.length === 0
              ? {
                  width: wrapperSize.width,
                  height: wrapperSize.height,
                }
              : undefined
        }
      >
        {!hasSearched ? (
          <>
            <div className="autumn-black-grain" style={styles.creatorByBox}>
              Campus Curiosities Vol 5 |{" "}
              <a
                href="https://stanfordlabregistry.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "underline", color: "inherit" }}
              >
                stanfordlabregistry.com
              </a>
            </div>
            <div className="box-image">
              <img
                src="/dithered-background-autumn.png"
                alt=""
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
                }}
              />
            </div>
            <div className="box-overlay-1">
              <h1 className="mobile-title" style={styles.title}>Stanford<br />Course Registry</h1>
            </div>
            <div className="autumn-black-grain" style={styles.spring26Badge}>Autumn 26 Edition</div>
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
                  className="autumn-black-grain"
                  style={styles.searchButton}
                  disabled={loading}
                >
                  <span>
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
                  </span>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div
            className={`autumn-results-book ${pageTurnSnapshot ? "page-turning" : ""}`}
            style={styles.resultsBox}
            onTouchStart={handleMobileSwipeStart}
            onTouchEnd={handleMobileSwipeEnd}
            onTouchCancel={cancelMobileSwipe}
          >
            <div className="results-page-surface results-page-surface-left" aria-hidden="true" />
            <div className="results-page-surface results-page-surface-right" aria-hidden="true" />
            {isMobile && openBackPhase === "closing" && openBackSnapshot && (
              <MobileOpenToBackOverlay
                snapshot={openBackSnapshot}
                onClosed={() => setOpenBackPhase("centering")}
              />
            )}
            {pageTurnSnapshot && (
              <PageTurnOverlay
                snapshot={pageTurnSnapshot}
                isMobile={isMobile}
                direction={pageTurnDirection}
                target={reversePageTurnTarget}
              />
            )}
            {(loading || loadingMore) ? (
              <div style={styles.resultsList} className={`results-list ${isMobile ? "results-list-mobile" : ""}`}>
                <div style={styles.resultsPage} className="results-page">
                  {[0, 1].map((i) => (
                    <div key={i} style={styles.resultItemWrapper}>
                      <AutumnLoadingSkeletonCard />
                    </div>
                  ))}
                </div>
                <>
                  <div style={styles.resultsPageDivider} className="results-page-divider" />
                  <div style={styles.resultsPage} className="results-page">
                    {(isMobile ? [] : [2, 3]).map((i) => (
                      <div key={i} style={styles.resultItemWrapper}>
                        <AutumnLoadingSkeletonCard />
                      </div>
                    ))}
                  </div>
                </>
              </div>
            ) : error ? (
              <div style={styles.loadingText}>{error}</div>
            ) : results.length === 0 ? (
              <div style={styles.loadingText}>No results found.</div>
            ) : (
              <>
                <div style={styles.resultsList} className={`results-list ${isMobile ? "results-list-mobile" : ""}`}>
                  <div style={styles.resultsPage} className="results-page">
                    {results.filter((_, i) => Math.floor(i / 2) % 2 === 0).map((course) => (
                      <div key={course.id} style={styles.resultItemWrapper}>
                        <SimpleCourseCard
                          course={course}
                          explanation={explanations[course.id]}
                        />
                      </div>
                    ))}
                  </div>
                  {(isMobile || results.length > 2) && (
                    <>
                      <div style={styles.resultsPageDivider} className="results-page-divider" />
                      <div style={styles.resultsPage} className="results-page">
                        {loadingMobileRight
                          ? [0, 1].map((index) => (
                              <div key={index} style={styles.resultItemWrapper}>
                                <AutumnLoadingSkeletonCard />
                              </div>
                            ))
                          : results.filter((_, i) => Math.floor(i / 2) % 2 === 1).map((course) => (
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
                {isMobile ? (
                  <div style={styles.resultsBottomBar} className="mobile-two-page-bar autumn-results-controls">
                    {mobilePage === "left" && (
                      <div className="mobile-page-bar mobile-page-bar-left">
                        <button type="button" className="autumn-black-grain" style={barBtnStyle} onClick={handleNewSearch}>
                          <span>New query</span>
                        </button>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          {resultsHistory.length > 0 && (
                            <button type="button" className="autumn-black-grain" style={barBtnStyle} onClick={goBackWithAnimation}>
                              <span>Back</span>
                            </button>
                          )}
                          {(results.length > 2 || pagination.hasMore) && (
                            <button
                              type="button"
                              className="autumn-black-grain"
                              style={{
                                ...barBtnStyle,
                                ...(loadingMobileRight ? { opacity: 0.7, cursor: "wait" } : {}),
                              }}
                              onClick={() => {
                                if (results.length > 2) {
                                  setMobilePage("right");
                                } else {
                                  void loadMobileRightPage();
                                }
                              }}
                              disabled={loadingMobileRight}
                            >
                              <span>
                                {loadingMobileRight ? "Loading…" : results.length > 2 ? "Forward" : "Load more"}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {mobilePage === "right" && (
                      <div className="mobile-page-bar mobile-page-bar-right" style={{ gridColumn: 2 }}>
                        <button type="button" className="autumn-black-grain" style={barBtnStyle} onClick={() => setMobilePage("left")}>
                          <span>Back</span>
                        </button>
                        {(forwardHistory.length > 0 || loadingMobileRight || pagination.hasMore) && (
                          <button
                            type="button"
                            className="autumn-black-grain"
                            style={{
                              ...barBtnStyle,
                              ...(loadingMore || loadingMobileRight ? { opacity: 0.7, cursor: "wait" } : {}),
                            }}
                            onClick={forwardHistory.length > 0 ? goForwardWithAnimation : loadMore}
                            disabled={loadingMore || loadingMobileRight}
                          >
                            <span>
                              {loadingMore || loadingMobileRight
                                ? "Loading…"
                                : forwardHistory.length > 0
                                  ? "Forward"
                                  : "Load more"}
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={styles.resultsBottomBar} className="autumn-results-controls">
                    <button type="button" className="autumn-black-grain" style={barBtnStyle} onClick={handleNewSearch}>
                      <span>New query</span>
                    </button>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      {resultsHistory.length > 0 && (
                        <button type="button" className="autumn-black-grain" style={barBtnStyle} onClick={goBack}>
                          <span>Back</span>
                        </button>
                      )}
                      {forwardHistory.length > 0 ? (
                        <button type="button" className="autumn-black-grain" style={barBtnStyle} onClick={goForwardWithAnimation}>
                          <span>Forward</span>
                        </button>
                      ) : pagination.hasMore ? (
                        <button
                          type="button"
                          className="autumn-black-grain"
                          style={{
                            ...barBtnStyle,
                            ...(loadingMore ? { opacity: 0.7, cursor: "wait" } : {}),
                          }}
                          onClick={loadMore}
                          disabled={loadingMore}
                        >
                          <span>{loadingMore ? "Loading…" : "Load more"}</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      </div>
    </>
  );
}

function BookTransition({
  phase,
  query,
  onShiftComplete,
  onOpenComplete,
  onCloseComplete,
  onRecenterComplete,
}: {
  phase: "shifting" | "opening" | "closing" | "recentering";
  query: string;
  onShiftComplete: () => void;
  onOpenComplete: () => void;
  onCloseComplete: () => void;
  onRecenterComplete: () => void;
}) {
  return (
    <div
      className={`book-transition ${phase}`}
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (
          phase === "shifting" &&
          event.currentTarget === event.target
        ) {
          onShiftComplete();
        }
        if (
          phase === "recentering" &&
          event.currentTarget === event.target
        ) {
          onRecenterComplete();
        }
      }}
    >
      <div
        className="book-cover-rig"
        onAnimationEnd={(event) => {
          if (
            phase === "opening" &&
          event.currentTarget === event.target
          ) {
            onOpenComplete();
          }
          if (
            phase === "closing" &&
            event.currentTarget === event.target
          ) {
            onCloseComplete();
          }
        }}
      >
        <div className="book-cover-face book-cover-front">
          <div className="autumn-black-grain" style={styles.creatorByBox}>
            Campus Curiosities Vol 5 | stanfordlabregistry.com
          </div>
          <div className="box-overlay-1">
            <h2 className="mobile-title" style={styles.title}>
              Stanford
              <br />
              Course Registry
            </h2>
          </div>
          <div className="autumn-black-grain" style={styles.spring26Badge}>Autumn 26 Edition</div>
          <div className="box-overlay-2">
            <div className="mobile-search-container" style={styles.searchContainer}>
              <textarea
                aria-hidden="true"
                tabIndex={-1}
                readOnly
                rows={4}
                placeholder="Describe your dream course..."
                value={query}
                style={styles.searchInput}
              />
              <span className="autumn-black-grain" style={{ ...styles.searchButton, cursor: "default" }}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <line x1="16.5" y1="16.5" x2="21" y2="21" />
                </svg>
              </span>
            </div>
          </div>
        </div>
        <div className="book-cover-face book-cover-inside" />
      </div>
    </div>
  );
}

function PageTurnOverlay({
  snapshot,
  isMobile,
  direction,
  target,
}: {
  snapshot: PageTurnSnapshot;
  isMobile: boolean;
  direction: PageTurnDirection;
  target: PageTurnSnapshot | null;
}) {
  const isBackward = direction === "backward";
  const stationaryCourses = snapshot.results.filter(
    (_, index) => Math.floor(index / 2) % 2 === 0,
  );
  const turningCourses = isBackward
    ? snapshot.results.slice(0, 2)
    : isMobile
      ? snapshot.results.slice(2, 4)
      : snapshot.results.filter((_, index) => Math.floor(index / 2) % 2 === 1);
  const backCourses = isBackward ? target?.results.slice(2, 4) ?? [] : [];

  return (
    <>
      {!isBackward && (
        <div className="page-turn-static-left" aria-hidden="true">
          <div className="page-turn-cards">
            {stationaryCourses.map((course) => (
              <div className="page-turn-card" key={course.id}>
                <SimpleCourseCard
                  course={course}
                  explanation={snapshot.explanations[course.id]}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      <div className={`page-turn-scene ${isBackward ? "page-turn-scene-backward" : ""}`} aria-hidden="true">
        <div className="page-turn-sheet">
          <div className="page-turn-face page-turn-front">
            <div className="page-turn-cards">
              {turningCourses.map((course) => (
                <div className="page-turn-card" key={course.id}>
                  <SimpleCourseCard
                    course={course}
                    explanation={snapshot.explanations[course.id]}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="page-turn-face page-turn-back">
            <div className="page-turn-cards">
              {isBackward
                ? backCourses.map((course) => (
                    <div className="page-turn-card" key={course.id}>
                      <SimpleCourseCard
                        course={course}
                        explanation={target?.explanations[course.id]}
                      />
                    </div>
                  ))
                : [0, 1].map((index) => (
                    <div className="page-turn-card" key={index}>
                      <AutumnLoadingSkeletonCard />
                    </div>
                  ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function BackCoverTransition({
  phase,
  query,
  isMobile,
  onBack,
  onFront,
  onClose,
}: {
  phase: BackPhase;
  query: string;
  isMobile: boolean;
  onBack: () => void;
  onFront: () => void;
  onClose: () => void;
}) {
  return (
    <div className={`back-book-transition ${phase}`}>
      <div
        className="back-book-rig"
        onAnimationEnd={(event) => {
          if (event.currentTarget !== event.target) return;
          if (phase === "to-back") onBack();
          if (phase === "to-front") onFront();
        }}
      >
        <div className="back-book-face back-book-front" aria-hidden={phase === "back"}>
          <div className="autumn-black-grain" style={styles.creatorByBox}>
            Campus Curiosities Vol 5 | stanfordlabregistry.com
          </div>
          <div className="box-overlay-1">
            <h2 className="mobile-title" style={styles.title}>
              Stanford
              <br />
              Course Registry
            </h2>
          </div>
          <div className="autumn-black-grain" style={styles.spring26Badge}>Autumn 26 Edition</div>
          <div className="box-overlay-2">
            <div className="mobile-search-container" style={styles.searchContainer}>
              <textarea
                aria-hidden="true"
                tabIndex={-1}
                readOnly
                rows={4}
                placeholder="Describe your dream course..."
                value={query}
                style={styles.searchInput}
              />
              <span className="autumn-black-grain" style={{ ...styles.searchButton, cursor: "default" }}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <line x1="16.5" y1="16.5" x2="21" y2="21" />
                </svg>
              </span>
            </div>
          </div>
        </div>
        <div className="back-book-face back-book-back">
          <LeaderboardPanel onClose={onClose} isMobile={isMobile} term="autumn26" />
        </div>
      </div>
    </div>
  );
}

function OpenToBackTransition({
  phase,
  snapshot,
  isMobile,
  followMobilePage,
  onClosed,
  onCentered,
}: {
  phase: Exclude<OpenBackPhase, "idle">;
  snapshot: PageTurnSnapshot;
  isMobile: boolean;
  followMobilePage: boolean;
  onClosed: () => void;
  onCentered: () => void;
}) {
  const rightPageCourses = isMobile
    ? snapshot.results.slice(2, 4)
    : snapshot.results.filter((_, index) => Math.floor(index / 2) % 2 === 1);

  return (
    <div
      className={`open-to-back-transition ${phase} ${followMobilePage ? "follow-mobile-page" : ""}`}
      onAnimationEnd={(event) => {
        if (phase === "centering" && event.currentTarget === event.target) {
          onCentered();
        }
      }}
    >
      <div
        className="open-to-back-sheet"
        onAnimationEnd={(event) => {
          if (
            phase === "closing" &&
            event.currentTarget === event.target
          ) {
            onClosed();
          }
        }}
      >
        <div className="open-to-back-face open-to-back-front">
          <div className="page-turn-cards">
            {rightPageCourses.map((course) => (
              <div className="page-turn-card" key={course.id}>
                <SimpleCourseCard
                  course={course}
                  explanation={snapshot.explanations[course.id]}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="open-to-back-face open-to-back-back">
          <LeaderboardPanel onClose={() => {}} isMobile={isMobile} term="autumn26" />
        </div>
      </div>
    </div>
  );
}

function MobileOpenToBackOverlay({
  snapshot,
  onClosed,
}: {
  snapshot: PageTurnSnapshot;
  onClosed: () => void;
}) {
  const rightPageCourses = snapshot.results.slice(2, 4);

  return (
    <div className="page-turn-scene" aria-hidden="true">
      <div
        className="page-turn-sheet"
        onAnimationEnd={(event) => {
          if (event.currentTarget === event.target) onClosed();
        }}
      >
        <div className="page-turn-face page-turn-front">
          <div className="page-turn-cards">
            {rightPageCourses.map((course) => (
              <div className="page-turn-card" key={course.id}>
                <SimpleCourseCard
                  course={course}
                  explanation={snapshot.explanations[course.id]}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="page-turn-face page-turn-back mobile-open-to-back-back">
          <LeaderboardPanel onClose={() => {}} isMobile term="autumn26" />
        </div>
      </div>
    </div>
  );
}

function RevealedText({ text }: { text: string }) {
  let wordIndex = 0;
  return (
    <>
      {text.split(/(\s+)/).map((part, index) => {
        if (!part || /^\s+$/.test(part)) return part;
        const delay = (wordIndex++ % 2) * 38;
        return (
          <span
            className="autumn-reveal-word"
            style={{ animationDelay: `${delay}ms` }}
            key={`${index}-${part}`}
          >
            {part}
          </span>
        );
      })}
    </>
  );
}

function AutumnLoadingSkeletonCard() {
  return (
    <div style={styles.loadingSkeletonCard}>
      <div style={styles.metadataSkeletonRow}>
        <div style={styles.metadataSkeletonLines}>
          <div style={{ ...styles.metadataSkeletonLine, width: "34%", height: "14px" }} />
          <div style={{ ...styles.metadataSkeletonLine, width: "68%", height: "12px" }} />
          <div style={{ ...styles.metadataSkeletonLine, width: "46%", height: "8px" }} />
        </div>
        <div style={styles.percentageSkeleton} />
      </div>
      <div style={styles.skeletonDescr}>
        <div style={styles.skeletonDescrLine} />
        <div style={{ ...styles.skeletonDescrLine, width: "85%" }} />
        <div style={{ ...styles.skeletonDescrLine, width: "70%" }} />
      </div>
    </div>
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
  const prereqDisplayRaw = prereqContent ? clean(rawPrereq) : "";
  const prereqDisplay = prereqDisplayRaw.replace(/^(Prerequisites:\s*)+/i, "Prerequisites: ");
  const isLoading = explanation === undefined;

  return (
    <div style={styles.simpleCard}>
      <div style={styles.simpleCardHeader}>
        <div style={styles.simpleCardHeaderLeft}>
          <div style={styles.courseCodesContainer}>
            {codes.map((code, codeIndex) => {
              const navigatorUrl = STANFORD_NAVIGATOR_URL(code, "autumn26");
              const isHovered = hoveredCodeIndex === codeIndex;
              return (
                <span key={codeIndex}>
                  <a
                    href={navigatorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="autumn-meta-reveal autumn-meta-code"
                    style={{
                      ...styles.courseCodes,
                      ...styles.simpleCardCodes,
                      ...(isHovered ? styles.courseCodesHovered : {}),
                    }}
                    onMouseEnter={() => setHoveredCodeIndex(codeIndex)}
                    onMouseLeave={() => setHoveredCodeIndex(null)}
                  >
                    {code}
                    <span style={styles.courseArrow}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </span>
                  </a>
                  {codeIndex < codes.length - 1 && (
                    <span className="autumn-meta-reveal autumn-meta-code" style={styles.courseCodeSeparator}> / </span>
                  )}
                </span>
              );
            })}
          </div>
          <span className="autumn-meta-reveal autumn-meta-title" style={styles.simpleCardTitle}>
            {course.course_title || "N/A"}
          </span>
          <span className="autumn-meta-reveal autumn-meta-instructors" style={styles.simpleCardProfs}>
            {course.instructors || "N/A"}
          </span>
        </div>
        {typeof course.similarity === "number" && (
          <span className="autumn-meta-reveal autumn-meta-percentage autumn-black-grain" style={styles.simpleCardSimilarity}>
            <span>{(course.similarity * 100).toFixed(1)}%</span>
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
          {clean(mainText) && <RevealedText text={clean(mainText)} />}
          {clean(mainText) && prereqDisplay && (
            <>
              <br />
              <br />
            </>
          )}
          {prereqDisplay && <RevealedText text={prereqDisplay} />}
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
    backgroundColor: "#000000",
    color: "#000000",
    position: "relative",
  },
  creatorByBox: {
    position: "absolute",
    top: 0,
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: "9px",
    color: "#f0f0f0",
    fontFamily: '"Roboto Mono", monospace',
    textAlign: "center",
    padding: "0.4rem 0.7rem",
    background: "#000000",
    borderRadius: "0 0 10px 10px",
    boxShadow: "0 4px 9px rgba(0, 0, 0, 0.42)",
    boxSizing: "border-box",
    whiteSpace: "nowrap",
    zIndex: 10,
  },
  title: {
    fontSize: "3.2em",
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
    top: "max(0px, calc((min(90vw, 480px) - (50ch + 1.4rem)) / 2))",
    right: 0,
    background: "#000000",
    color: "#f0f0f0",
    fontSize: "9px",
    padding: "0.4rem 0.5rem",
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    whiteSpace: "nowrap",
    borderRadius: "10px 0 0 10px",
    boxShadow: "0 4px 9px rgba(0, 0, 0, 0.42)",
    boxSizing: "border-box",
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
    borderRadius: "12px",
    fontSize: "11px",
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
    padding: "3px 0 0",
    height: "28px",
    width: "28px",
    border: "none",
    background: "#000000",
    color: "#FFFFFF",
    borderRadius: "8px",
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
    borderRadius: "18px",
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
    borderRadius: "8px",
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
    borderRadius: "6px",
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
  metadataSkeletonRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "0.75rem",
    width: "100%",
  },
  metadataSkeletonLines: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "5px",
    minWidth: 0,
  },
  metadataSkeletonLine: {
    background: "linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)",
    backgroundSize: "200% 100%",
    animation: "skeleton-shimmer 1.5s ease-in-out infinite",
    borderRadius: "6px",
  },
  percentageSkeleton: {
    width: "42px",
    height: "18px",
    flexShrink: 0,
    background: "linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)",
    backgroundSize: "200% 100%",
    animation: "skeleton-shimmer 1.5s ease-in-out infinite",
    borderRadius: "999px",
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
    borderRadius: "6px",
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
    display: "inline-flex",
    alignItems: "center",
    color: "inherit",
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
