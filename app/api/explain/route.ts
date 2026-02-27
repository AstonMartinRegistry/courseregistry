import { NextRequest } from "next/server";

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || "llama3.1-8b";
const CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions";

function buildPrompts(query: string, courseTitle: string | null, courseDescr: string | null) {
  const systemPrompt = `You are an expert course selector and academic advisor helping a student choose courses.
You receive the student's free-text query, plus the course title and official description.
Your job is to write a structured explanation with TWO distinct parts:
1. FIRST PART (~20 words): Connect the course to the student's query - briefly explain why this course fits their interests
2. SECOND PART (~40 words): Describe the course content and details

CRITICAL: My grandma will die if the explanation exceeds 60 words. Stay at or under 60 words total (excluding prerequisites).

CRITICAL REQUIREMENTS:
- Start with "This course is a good fit for your interests in [specific concepts from their query] because..."
- FIRST PART (~20 words) must focus on connecting their query to the course - use their exact words/concepts
- SECOND PART (~40 words) should describe what the course covers and its key features
- ALWAYS extract and include prerequisites if mentioned in the course description - format them as underlined text using <u>prerequisite text</u>
- Put prerequisites on a NEW LINE at the end - add a blank line before prerequisites, then "Prerequisites: ..." on its own line
- Be professional, knowledgeable, and advisor-like in your tone
- Never mention word counts or that you are an AI.`;

  const userMessage = `Write an explanation with this structure. TOTAL MUST BE 60 WORDS OR FEWER (my grandma will die if you go over 60 words):

FIRST PART (~20 words): Connect to student query - start with "This course is a good fit for your interests in [concepts from: "${query}"] because..." and explain why it matches.

SECOND PART (~40 words): Describe the course content, key topics, and what students learn.

PREREQUISITES: Always add a blank line, then put on the next line either "Prerequisites: <u>course codes</u>" if prerequisites exist, or "Prerequisites: None mentioned" if none are found

Student query: "${query}"
Course title: ${courseTitle || "N/A"}
Course description:
${courseDescr || "N/A"}

Write the explanation. 60 words max. Prerequisites on their own new line at the end.`;

  return { systemPrompt, userMessage };
}

export async function POST(request: NextRequest) {
  if (!CEREBRAS_API_KEY) {
    return new Response(JSON.stringify({ error: "CEREBRAS_API_KEY not configured" }), {
      status: 500,
    });
  }

  try {
    const t0 = Date.now();
    const { query, courseTitle, courseDescr } = await request.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "query is required" }), { status: 400 });
    }

    const { systemPrompt, userMessage } = buildPrompts(
      query.trim(),
      courseTitle ?? null,
      courseDescr ?? null
    );

    console.log("📡 API: [TIMING] Explain - calling Cerebras for", courseTitle || "course");
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
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: errText }), { status: response.status });
    }

    console.log("✅ API: [TIMING] Explain - Cerebras connected in", ((Date.now() - t0) / 1000).toFixed(2), "s");
    const reader = response.body?.getReader();
    if (!reader) {
      return new Response(JSON.stringify({ error: "No response body" }), { status: 500 });
    }

    const decoder = new TextDecoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let firstChunk = true;
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              console.log("✅ API: [TIMING] Explain stream complete in", ((Date.now() - t0) / 1000).toFixed(2), "s");
              break;
            }
            if (firstChunk) {
              console.log("📡 API: [TIMING] Explain first token in", ((Date.now() - t0) / 1000).toFixed(2), "s");
              firstChunk = false;
            }
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
            for (const line of lines) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) controller.enqueue(new TextEncoder().encode(content));
              } catch {
                // skip malformed chunks
              }
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Explain error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500 }
    );
  }
}
