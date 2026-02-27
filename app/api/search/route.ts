import { NextRequest, NextResponse } from "next/server";

const DEEPINFRA_API_KEY = process.env.DEEPINFRA_API_KEY;
const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || "Qwen/Qwen3-Embedding-4B";
const DEEPINFRA_API_URL = "https://api.deepinfra.com/v1/embeddings";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function generateEmbedding(text: string): Promise<number[]> {
  if (!DEEPINFRA_API_KEY) {
    throw new Error("DEEPINFRA_API_KEY is not set");
  }

  const response = await fetch(DEEPINFRA_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPINFRA_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `DeepInfra API request failed: ${response.status} ${response.statusText} - ${errorText}`,
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

  // Handle DeepInfra native format
  if (result.embeddings && Array.isArray(result.embeddings) && result.embeddings.length > 0) {
    const embedding = result.embeddings[0];
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

const SEARCH_TERM = process.env.NEXT_PUBLIC_SEARCH_TERM || "spring26";
const SEARCH_RPC =
  SEARCH_TERM === "spring26"
    ? "search_courses_spring26_by_embedding_paginated"
    : "search_courses_by_embedding_paginated";

async function searchCourses(
  embedding: number[],
  limit: number = 3,
  lastScore: number | null = null,
  lastId: number | null = null,
  excludeIds: number[] | null = null,
) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase credentials are not set");
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/${SEARCH_RPC}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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
    const { query, limit, lastScore, lastId, excludeIds } = await request.json();
    console.log("🔍 API: Received search request", { query, limit, lastScore, lastId, excludeIds });

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      console.error("❌ API: Invalid query");
      return NextResponse.json(
        { error: "Query is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    // Generate embedding for the query
    const tEmbedStart = Date.now();
    console.log("📊 API: [TIMING] Generating embedding for query:", query.trim());
    const embedding = await generateEmbedding(query.trim());
    console.log("✅ API: [TIMING] Embedding done in", ((Date.now() - tEmbedStart) / 1000).toFixed(2), "s, length:", embedding.length);

    // Normalize the embedding to ensure fair comparison
    const normalizedEmbedding = normalizeVector(embedding);

    // Search for similar courses with pagination
    const searchLimit = limit || 3;
    const tSearchStart = Date.now();
    console.log("🔎 API: [TIMING] Searching courses with limit:", searchLimit);
    const results = await searchCourses(
      normalizedEmbedding,
      searchLimit,
      lastScore ?? null,
      lastId ?? null,
      excludeIds ?? null,
    );
    console.log("✅ API: [TIMING] Search done in", ((Date.now() - tSearchStart) / 1000).toFixed(2), "s, results:", results.length);
    console.log("📋 API: Course titles:", results.map((r: any) => r.course_title));

    // Return results immediately without explanations (explanations streamed separately)
    const sortedResults = [...results].sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));

    // Increment popularity for each course that appeared in search results
    if (sortedResults.length > 0 && SUPABASE_URL && SUPABASE_ANON_KEY) {
      const courseIds = sortedResults.map((r: { id: number }) => r.id);
      try {
        const popRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_course_popularity`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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

