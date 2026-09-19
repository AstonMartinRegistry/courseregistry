import { NextRequest } from "next/server";

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || "gpt-oss-120b";
const CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions";
const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY;
const FIREWORKS_TEXT_MODEL =
  process.env.FIREWORKS_TEXT_MODEL || "accounts/fireworks/models/gpt-oss-120b";
const FIREWORKS_API_URL = "https://api.fireworks.ai/inference/v1/chat/completions";

function buildPrompts(query: string, courseTitle: string | null, courseDescr: string | null) {
  const systemPrompt = `You are an expert course selector and academic advisor helping a student choose courses.
You receive the student's free-text query, plus the course title and official description.
Your job is to write a structured explanation with TWO distinct parts:
1. FIRST PART (~20 words): Connect the course to the student's query - briefly explain why this course fits their interests
2. SECOND PART (~40 words): Describe the course content and details

Keep the explanation at or under 60 words total (excluding prerequisites).

CRITICAL REQUIREMENTS:
- Start with "This course is a good fit for your interests in [specific concepts from their query] because..."
- FIRST PART (~20 words) must focus on connecting their query to the course - use their exact words/concepts
- SECOND PART (~40 words) should describe what the course covers and its key features
- ALWAYS extract and include prerequisites if mentioned in the course description - format them as underlined text using <u>prerequisite text</u>
- Put prerequisites on a NEW LINE at the end - add a blank line, then exactly one of: "Prerequisites: <u>course codes</u>" OR "Prerequisites: None mentioned". Never write "Prerequisites:" twice.
- Be professional, knowledgeable, and advisor-like in your tone
- Never mention word counts or that you are an AI.`;

  const userMessage = `Write an explanation with this structure. TOTAL MUST BE 60 WORDS OR FEWER:

FIRST PART (~20 words): Connect to student query - start with "This course is a good fit for your interests in [concepts from: "${query}"] because..." and explain why it matches.

SECOND PART (~40 words): Describe the course content, key topics, and what students learn.

PREREQUISITES: Add a blank line, then a single line: either "Prerequisites: <u>course codes</u>" if prerequisites exist, or "Prerequisites: None mentioned" if none. Output the line exactly once—do not repeat "Prerequisites:".

Student query: "${query}"
Course title: ${courseTitle || "N/A"}
Course description:
${courseDescr || "N/A"}

Write the explanation. 60 words max. Prerequisites on their own new line at the end.`;

  return { systemPrompt, userMessage };
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const record = part as { text?: unknown; content?: unknown };
          return asText(record.text ?? record.content);
        }
        return "";
      })
      .join("");
  }
  return "";
}

function extractContent(data: unknown): string {
  const choice = (data as {
    choices?: Array<{
      text?: unknown;
      message?: { content?: unknown; reasoning?: unknown };
    }>;
    output_text?: unknown;
  }) ?? {};
  const message = choice.choices?.[0]?.message;
  return (
    asText(message?.content) ||
    asText(choice.choices?.[0]?.text) ||
    asText(choice.output_text)
  ).trim();
}

function summarizePayload(data: unknown) {
  const record = data as {
    choices?: Array<{
      finish_reason?: string;
      message?: Record<string, unknown>;
    }>;
    usage?: Record<string, unknown>;
  };
  const message = record.choices?.[0]?.message;
  return {
    finish: record.choices?.[0]?.finish_reason ?? null,
    messageKeys: message ? Object.keys(message) : [],
    contentType: message ? typeof message.content : null,
    contentLen: asText(message?.content).length,
    reasoningLen: asText(message?.reasoning).length,
    usage: record.usage ?? null,
  };
}

async function completeExplanation(
  provider: "cerebras" | "fireworks",
  url: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
) {
  const t0 = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 2048,
      stream: false,
      reasoning_effort: "low",
    }),
  });
  const httpMs = Date.now() - t0;
  const raw = await response.text();
  const readMs = Date.now() - t0;
  if (!response.ok) {
    console.warn(`📡 API: [TIMING] Explain ${provider} HTTP ${response.status} in ${(httpMs / 1000).toFixed(2)} s:`, raw.slice(0, 240));
    throw new Error(`${provider} ${response.status}: ${raw.slice(0, 240)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`📡 API: [TIMING] Explain ${provider} returned non-JSON in ${(readMs / 1000).toFixed(2)} s, ${raw.length} bytes`);
    throw new Error(`${provider} returned non-JSON`);
  }

  const text = extractContent(parsed);
  const summary = summarizePayload(parsed);
  console.log(
    `📡 API: [TIMING] Explain ${provider} ok in ${(readMs / 1000).toFixed(2)} s (http ${(httpMs / 1000).toFixed(2)} s) chars=${text.length} finish=${summary.finish} contentType=${summary.contentType} contentLen=${summary.contentLen} reasoningLen=${summary.reasoningLen} usage=${JSON.stringify(summary.usage)} keys=${summary.messageKeys.join(",")}`,
  );
  return text;
}

export async function POST(request: NextRequest) {
  try {
    const t0 = Date.now();
    const { query, courseTitle, courseDescr } = await request.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "query is required" }), { status: 400 });
    }

    const { systemPrompt, userMessage } = buildPrompts(
      query.trim(),
      courseTitle ?? null,
      courseDescr ?? null,
    );

    let text = "";
    let source = "";

    if (CEREBRAS_API_KEY) {
      try {
        text = await completeExplanation(
          "cerebras",
          CEREBRAS_API_URL,
          CEREBRAS_API_KEY,
          CEREBRAS_MODEL,
          systemPrompt,
          userMessage,
        );
        if (text) source = "cerebras";
        else console.warn("📡 API: [TIMING] Explain Cerebras returned empty content");
      } catch (error) {
        console.warn("📡 API: [TIMING] Explain Cerebras failed, falling back:", error instanceof Error ? error.message : error);
      }
    }

    if (!text && FIREWORKS_API_KEY) {
      const fallbackAt = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(`📡 API: [TIMING] Explain Fireworks fallback starting at ${fallbackAt} s for`, courseTitle || "course");
      text = await completeExplanation(
        "fireworks",
        FIREWORKS_API_URL,
        FIREWORKS_API_KEY,
        FIREWORKS_TEXT_MODEL,
        systemPrompt,
        userMessage,
      );
      if (text) source = "fireworks";
    }

    if (!text) {
      console.warn(`📡 API: [TIMING] Explain unavailable after ${((Date.now() - t0) / 1000).toFixed(2)} s for`, courseTitle || "course");
      return new Response(JSON.stringify({ error: "Explanation unavailable" }), { status: 502 });
    }

    console.log(
      `✅ API: [TIMING] Explain done via ${source} in ${((Date.now() - t0) / 1000).toFixed(2)} s, ${text.length} chars for`,
      courseTitle || "course",
    );
    return new Response(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Explain error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500 },
    );
  }
}
