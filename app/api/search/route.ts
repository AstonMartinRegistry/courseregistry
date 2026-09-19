import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

export const runtime = "nodejs";

const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY;
const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || "fireworks/qwen3-embedding-8b";
const FIREWORKS_API_URL = "https://api.fireworks.ai/inference/v1/embeddings";
const EMBEDDING_DIMENSIONS = 2560;
const gunzipAsync = promisify(gunzip);

type LocalCourse = {
  courseCodes?: string;
  courseTitle?: string | null;
  courseDescr?: string | null;
  instructors?: string | null;
};

function getSupabaseConfig(term: SearchTerm) {
  if (term === "autumn26") {
    return {
      url: process.env.AUTUMN26_SUPABASE_URL,
      anonKey: process.env.AUTUMN26_SUPABASE_ANON_KEY,
    };
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

function supabaseHeaders(key: string) {
  return {
    apikey: key,
    ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
  };
}

let localCatalogPromise: Promise<LocalCourse[]> | null = null;
let localIndexPromise: Promise<Int16Array> | null = null;

function getLocalCatalog() {
  if (!localCatalogPromise) {
    const file = path.join(process.cwd(), "data", "autumn26", "ultimate-expanded.json");
    localCatalogPromise = readFile(file, "utf8").then((raw) => JSON.parse(raw));
  }
  return localCatalogPromise;
}

function getLocalIndex() {
  if (!localIndexPromise) {
    const file = path.join(process.cwd(), "data", "autumn26", "embeddings.int16.gz");
    localIndexPromise = readFile(file)
      .then((compressed) => gunzipAsync(compressed))
      .then((bytes) => {
        const copy = new Uint8Array(bytes);
        return new Int16Array(copy.buffer);
      });
  }
  return localIndexPromise;
}

async function searchLocalAutumnCatalog(
  embedding: number[],
  limit: number,
  lastScore: number | null,
  lastId: number | null,
  excludeIds: number[] | null,
) {
  const [courses, index] = await Promise.all([getLocalCatalog(), getLocalIndex()]);
  const expectedValues = courses.length * EMBEDDING_DIMENSIONS;
  if (index.length !== expectedValues) {
    throw new Error(`Local search index is invalid: ${index.length}/${expectedValues} values`);
  }

  const excluded = new Set(excludeIds || []);
  const matches = [];
  for (let row = 0; row < courses.length; row++) {
    const id = row + 1;
    if (excluded.has(id)) continue;
    const offset = row * EMBEDDING_DIMENSIONS;
    let similarity = 0;
    for (let column = 0; column < EMBEDDING_DIMENSIONS; column++) {
      similarity += embedding[column] * (index[offset + column] / 32767);
    }
    const isAfterCursor =
      lastScore === null ||
      similarity < lastScore ||
      (Math.abs(similarity - lastScore) < 1e-12 && id > (lastId ?? 0));
    if (!isAfterCursor) continue;
    const course = courses[row];
    matches.push({
      id,
      course_codes: course.courseCodes || "",
      course_title: course.courseTitle || null,
      course_descr: course.courseDescr || null,
      instructors: course.instructors || null,
      similarity,
    });
  }

  return matches
    .sort((a, b) => b.similarity - a.similarity || a.id - b.id)
    .slice(0, limit);
}

async function generateEmbedding(text: string): Promise<number[]> {
  if (!FIREWORKS_API_KEY) {
    throw new Error("FIREWORKS_API_KEY is not set");
  }

  const response = await fetch(FIREWORKS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FIREWORKS_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Fireworks API request failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  const result = await response.json();

  // Handle OpenAI-compatible embeddings response format
  if (result.data && Array.isArray(result.data) && result.data.length > 0) {
    const embedding = result.data[0].embedding;
    if (Array.isArray(embedding)) {
      return embedding;
    }
  }

  throw new Error("Unexpected embedding response format");
}

// Normalize a vector to unit length (L2 normalization)
function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) return vector;
  return vector.map((val) => val / magnitude);
}

const SEARCH_RPCS = {
  autumn26: "search_courses_autumn26_by_embedding_paginated",
  spring26: "search_courses_spring26_by_embedding_paginated",
} as const;

type SearchTerm = keyof typeof SEARCH_RPCS;

async function searchCourses(
  embedding: number[],
  term: SearchTerm,
  limit: number = 3,
  lastScore: number | null = null,
  lastId: number | null = null,
  excludeIds: number[] | null = null,
) {
  const { url, anonKey } = getSupabaseConfig(term);
  if (!url || !anonKey) {
    throw new Error(`${term} Supabase credentials are not set`);
  }

  const response = await fetch(
    `${url}/rest/v1/rpc/${SEARCH_RPCS[term]}`,
    {
      method: "POST",
      headers: {
        ...supabaseHeaders(anonKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query_embedding: embedding,
        limit_count: limit,
        last_score: lastScore,
        last_id: lastId,
        exclude_ids: excludeIds,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Supabase request failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return await response.json();
}

export async function POST(request: NextRequest) {
  try {
    const { query, limit, lastScore, lastId, excludeIds, term = "autumn26" } = await request.json();
    console.log("🔍 API: Received search request", { query, limit, lastScore, lastId, excludeIds });

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      console.error("❌ API: Invalid query");
      return NextResponse.json(
        { error: "Query is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    if (!(term in SEARCH_RPCS)) {
      return NextResponse.json({ error: "Unsupported course term" }, { status: 400 });
    }

    // Generate embedding for the query
    const tEmbedStart = Date.now();
    console.log("📊 API: [TIMING] Generating embedding for query:", query.trim());
    const embedding = await generateEmbedding(query.trim());
    console.log("✅ API: [TIMING] Embedding done in", ((Date.now() - tEmbedStart) / 1000).toFixed(2), "s, length:", embedding.length);

    // Normalize the embedding to ensure fair comparison
    const normalizedEmbedding = normalizeVector(embedding);

    // Search for similar courses with pagination
    const searchLimit = Math.max(1, Math.min(Number(limit) || 3, 20));
    const tSearchStart = Date.now();
    console.log("🔎 API: [TIMING] Searching courses with limit:", searchLimit);
    let usedLocalFallback = false;
    let results;
    try {
      results = await searchCourses(
        normalizedEmbedding,
        term as SearchTerm,
        searchLimit,
        lastScore ?? null,
        lastId ?? null,
        excludeIds ?? null,
      );
    } catch (databaseError) {
      if (term !== "autumn26") throw databaseError;
      usedLocalFallback = true;
      console.warn("Autumn Supabase search unavailable; using local semantic index");
      results = await searchLocalAutumnCatalog(
        normalizedEmbedding,
        searchLimit,
        lastScore ?? null,
        lastId ?? null,
        excludeIds ?? null,
      );
    }
    console.log("✅ API: [TIMING] Search done in", ((Date.now() - tSearchStart) / 1000).toFixed(2), "s, results:", results.length);
    console.log("📋 API: Course titles:", results.map((r: any) => r.course_title));

    // Return results immediately without explanations (explanations streamed separately)
    const sortedResults = [...results].sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));

    // Increment popularity for each course that appeared in search results
    if (!usedLocalFallback && sortedResults.length > 0) {
      const courseIds = sortedResults.map((r: { id: number }) => r.id);
      try {
        const { url, anonKey } = getSupabaseConfig(term as SearchTerm);
        if (!url || !anonKey) throw new Error(`${term} Supabase credentials are not set`);
        const popularityRpc = term === "autumn26"
          ? "increment_course_popularity_autumn26"
          : "increment_course_popularity";
        const popRes = await fetch(`${url}/rest/v1/rpc/${popularityRpc}`, {
          method: "POST",
          headers: {
            ...supabaseHeaders(anonKey),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ course_ids: courseIds }),
        });
        if (!popRes.ok) {
          const errText = await popRes.text();
          console.warn("Course popularity RPC failed:", popRes.status, errText);
        }
      } catch (e) {
        console.warn("Failed to increment course popularity:", e);
      }
    }

    // Determine if there are more results
    const hasMore = results.length === searchLimit;
    const lastResult = sortedResults[sortedResults.length - 1];
    const nextLastScore = lastResult?.similarity || null;
    const nextLastId = lastResult?.id || null;

    const tTotal = Date.now() - tEmbedStart;
    console.log("📤 API: [TIMING] Total search API:", (tTotal / 1000).toFixed(2), "s");

    return NextResponse.json({
      results: sortedResults,
      pagination: {
        hasMore,
        lastScore: nextLastScore,
        lastId: nextLastId,
      },
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred" },
      { status: 500 },
    );
  }
}
