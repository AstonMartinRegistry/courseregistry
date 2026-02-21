import { NextRequest, NextResponse } from "next/server";

const DEEPINFRA_API_KEY = process.env.DEEPINFRA_API_KEY;
const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || "Qwen/Qwen3-Embedding-4B";
const DEEPINFRA_API_URL = "https://api.deepinfra.com/v1/embeddings";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || "llama3.1-8b";
const CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions";

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
    `${SUPABASE_URL}/rest/v1/rpc/search_courses_by_embedding_paginated`,
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

async function generateCourseExplanation(params: {
  query: string;
  courseTitle: string | null;
  courseDescr: string | null;
}): Promise<string | null> {
  if (!CEREBRAS_API_KEY) {
    // If not configured, skip explanations without breaking search
    return null;
  }

  const { query, courseTitle, courseDescr } = params;

  const systemPrompt = `You are an expert course selector and academic advisor helping a student choose courses.
You receive the student's free-text query, plus the course title and official description.
Your job is to write a structured explanation (exactly 100 words) with TWO distinct parts:
1. FIRST HALF (~50 words): Connect the course to the student's query - analyze their query and explain why this course fits their interests
2. SECOND HALF (~50 words): Describe the course content and details

CRITICAL REQUIREMENTS:
- Start with "This course is a good fit for your interests in [specific concepts from their query] because..."
- FIRST HALF must focus on connecting their query "${query}" to the course - use their exact words/concepts
- SECOND HALF should describe what the course covers and its key features
- ALWAYS extract and include prerequisites if mentioned in the course description - format them as underlined text using <u>prerequisite text</u>
- Be professional, knowledgeable, and advisor-like in your tone
- Never mention word counts or that you are an AI.`;

  const userMessage = `CRITICAL STRUCTURE REQUIREMENTS:
Write an explanation in EXACTLY 100 words with this structure:

FIRST HALF (~50 words): Connect to student query
- Start with "This course is a good fit for your interests in [use specific words/concepts from: "${query}"] because..."
- Focus ONLY on how the course relates to what the student is looking for in "${query}"
- Use the student's exact query language and concepts
- Explain why this course matches their interests/goals

SECOND HALF (~50 words): Describe the course
- Describe what the course covers, its key topics, and what students will learn
- Mention important course details, format, or structure

PREREQUISITES:
- Search the course description below for any mention of prerequisites, requirements, or recommended courses
- If prerequisites exist, ALWAYS include them at the end and format them as: "Prerequisites: <u>MATH 19, 20, 21</u>"
- Underline the prerequisite courses using <u> tags
- Include prerequisites even if it means the explanation slightly exceeds 100 words

Student query: "${query}"

Course title: ${courseTitle || "N/A"}

Course description:
${courseDescr || "N/A"}

Write the explanation following the structure above. First half connects to "${query}", second half describes the course, and always include prerequisites if mentioned.`;

  const maxRetries = 5;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(CEREBRAS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CEREBRAS_API_KEY}`,
        },
        body: JSON.stringify({
          model: CEREBRAS_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          temperature: 0.7,
          max_tokens: 260,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        lastError = new Error(
          `Cerebras API request failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
        console.warn(
          `Cerebras attempt ${attempt + 1}/${maxRetries} failed:`,
          response.status,
          errorText,
        );
        // If it's a non-retryable error (like 400 Bad Request), don't retry
        if (response.status >= 400 && response.status < 500) {
          return null;
        }
        // Otherwise, retry after a delay
        if (attempt < maxRetries - 1) {
          await sleep(1000 * (attempt + 1)); // Exponential backoff: 1s, 2s, 3s, 4s, 5s
          continue;
        }
        return null;
      }

      const data = await response.json();
      const content: string | undefined =
        data.choices?.[0]?.message?.content?.trim();

      return content || null;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `Cerebras attempt ${attempt + 1}/${maxRetries} failed:`,
        lastError.message,
      );
      // Retry after a delay if we have attempts left
      if (attempt < maxRetries - 1) {
        await sleep(1000 * (attempt + 1)); // Exponential backoff
        continue;
      }
      // If we've exhausted all retries, return null
      console.error("Cerebras generation failed after all retries:", lastError);
      return null;
    }
  }

  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    console.log("📊 API: Generating embedding for query:", query.trim());
    const embedding = await generateEmbedding(query.trim());
    console.log("✅ API: Embedding generated, length:", embedding.length);

    // Normalize the embedding to ensure fair comparison
    const normalizedEmbedding = normalizeVector(embedding);
    console.log("✅ API: Embedding normalized");

    // Search for similar courses with pagination
    const searchLimit = limit || 3;
    console.log("🔎 API: Searching courses with limit:", searchLimit);
    const results = await searchCourses(
      normalizedEmbedding,
      searchLimit,
      lastScore || null,
      lastId || null,
      excludeIds || null,
    );
    console.log("📦 API: Raw search results:", results.length, "courses");
    console.log("📋 API: Course titles:", results.map((r: any) => r.course_title));

    // Enrich each result with a personalized explanation (best-effort, sequential to avoid rate limits)
    const enrichedResults: any[] = [];
    for (let i = 0; i < results.length; i++) {
      const course: any = results[i];
      console.log(`💭 API: Generating explanation for course ${i + 1}/${results.length}: ${course.course_title}`);

      const explanation = await generateCourseExplanation({
        query: query.trim(),
        courseTitle: course.course_title ?? null,
        courseDescr: course.course_descr ?? null,
      });

      // Only include courses with successfully generated explanations
      if (explanation && explanation.trim().length > 0) {
        console.log(`✅ API: Explanation generated for: ${course.course_title}`);
        enrichedResults.push({
          ...course,
          explanation,
        });
      } else {
        console.warn(`⚠️ API: No explanation generated for: ${course.course_title}`);
      }

      // Small delay between calls to be kinder to Cerebras rate limits
      // (Retry logic will handle failures, so we keep a minimal delay here)
      if (i < results.length - 1) {
        await sleep(300);
      }
    }

    // Determine if there are more results
    const hasMore = results.length === searchLimit;
    const lastResult = enrichedResults[enrichedResults.length - 1];
    const nextLastScore = lastResult?.similarity || null;
    const nextLastId = lastResult?.id || null;

    console.log("📤 API: Returning response with", enrichedResults.length, "enriched results");
    console.log("📊 API: Pagination:", { hasMore, nextLastScore, nextLastId });

    return NextResponse.json({
      results: enrichedResults,
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

