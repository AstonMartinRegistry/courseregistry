// Generate rewritten descriptions for courses using Cerebras Llama 70B
// Tests the first prompt: "Rewrite this class description in terms of the problems it solves or challenges it helps with."
//
// Prerequisites:
//   1. Install dotenv: npm install dotenv
//   2. Set CEREBRAS_API_KEY in .env.local file
//
// Usage (from project root):
//   node scripts/generate-rewritten-descriptions.js

// Load environment variables from .env.local
require("dotenv").config({ path: ".env.local" });

const fs = require("node:fs/promises");

const path = require("node:path");
const term = process.argv[2] || "spring26";
const INPUT_FILE = path.join(__dirname, "..", "data", term, "ultimate.json");
const OUTPUT_FILE = path.join(__dirname, "..", "data", term, "ultimate-with-rewritten.json");

// Cerebras API configuration
const CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions";
// Get model name from environment (set CEREBRAS_MODEL in .env.local)
const MODEL = process.env.CEREBRAS_MODEL || "llama-3.3-70b";

// Prompts for the 4 different rewrites - designed to generate distinct perspectives
const PROMPTS = [
  "Identify a single physical object or artifact that embodies or exemplifies a key idea, principle, or theme of this course, and explain why its characteristics, design, or use make it a meaningful representation.",
  "Select one historical event, case study, or significant occurrence that illuminates a central theme of this course, and describe the specific aspects, actions, or outcomes of this event that make it a compelling example.",
  "Choose one cultural practice, social ritual, or community behavior that reveals insights into the concepts explored in this course, and explain how its traditions, patterns, or social functions reflect underlying course themes.",
  "Name one concept, idea, or phenomenon that is not explicitly covered in this course but connects to its core themes, and describe how understanding this related idea can deepen or expand comprehension of the subject matter.",
];

// Get API key from environment
const apiKey = process.env.CEREBRAS_API_KEY;

if (!apiKey) {
  console.error(
    "Error: CEREBRAS_API_KEY must be set as an environment variable",
  );
  console.error(
    "Example: CEREBRAS_API_KEY=your-key node scripts/generate-rewritten-descriptions.js",
  );
  process.exit(1);
}

async function generateRewrittenDescription(courseTitle, courseDescr, promptIndex, retryCount = 0) {
  const prompt = PROMPTS[promptIndex];
  
  const systemPrompt = `You are a helpful assistant that rewrites course descriptions. 
Given a course title and description, follow the specific instruction provided exactly.
Your response must be exactly 80 words. Count your words carefully and ensure the response is precisely 80 words.`;

  const userMessage = `Course Title: ${courseTitle || "N/A"}

Original Description: ${courseDescr}

Instruction: ${prompt}

IMPORTANT: Your response must be exactly 80 words. No more, no less. Provide only your answer, without any additional commentary or explanation.`;

  const MAX_RETRIES = 100; // Retry up to 100 times
  const RETRY_DELAY = 1000; // 1 second delay on retry

  try {
    const response = await fetch(CEREBRAS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // If rate limited or any error, retry with 1 second delay
      if (retryCount < MAX_RETRIES) {
        console.log(`    ⚠ Error (${response.status}), waiting 1s before retry ${retryCount + 1}/${MAX_RETRIES}...`);
        await sleep(RETRY_DELAY);
        return generateRewrittenDescription(courseTitle, courseDescr, promptIndex, retryCount + 1);
      }
      
      throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const rewritten = data.choices?.[0]?.message?.content?.trim();
    
    // If no response content, retry
    if (!rewritten) {
      if (retryCount < MAX_RETRIES) {
        console.log(`    ⚠ No response content, waiting 1s before retry ${retryCount + 1}/${MAX_RETRIES}...`);
        await sleep(RETRY_DELAY);
        return generateRewrittenDescription(courseTitle, courseDescr, promptIndex, retryCount + 1);
      }
      throw new Error("No response from API after max retries");
    }
    
    return rewritten;
  } catch (error) {
    // Retry on any error up to MAX_RETRIES times
    if (retryCount < MAX_RETRIES) {
      console.log(`    ⚠ Error: ${error.message}, waiting 1s before retry ${retryCount + 1}/${MAX_RETRIES}...`);
      await sleep(RETRY_DELAY);
      return generateRewrittenDescription(courseTitle, courseDescr, promptIndex, retryCount + 1);
    }
    
    console.error(`Error generating rewrite after ${MAX_RETRIES} retries:`, error.message);
    return null;
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`Reading ${INPUT_FILE}...`);
  const raw = await fs.readFile(INPUT_FILE, "utf8");
  const courses = JSON.parse(raw);

  if (!Array.isArray(courses)) {
    throw new Error(`Expected ${INPUT_FILE} to contain an array`);
  }

  // Process courses in batches of 1000, but save after every 100 courses
  const START_INDEX = 401;
  const BATCH_SIZE = 1000;
  const SAVE_INTERVAL = 100; // Save to file after every 100 courses
  const coursesToProcess = courses.slice(START_INDEX, START_INDEX + BATCH_SIZE);

  console.log(`Found ${courses.length} total courses in file`);
  console.log(`Processing courses ${START_INDEX + 1} to ${START_INDEX + coursesToProcess.length} (${coursesToProcess.length} courses)...\n`);
  console.log(`Using model: ${MODEL}`);
  console.log(`Generating all ${PROMPTS.length} rewritten descriptions for each course:\n`);
  PROMPTS.forEach((prompt, idx) => {
    console.log(`  Q${idx + 1}: ${prompt}`);
  });
  console.log();

  const results = [];
  let successCount = 0;
  let errorCount = 0;

  // Read existing file if it exists
  let existingResults = [];
  try {
    const existingRaw = await fs.readFile(OUTPUT_FILE, "utf8");
    existingResults = JSON.parse(existingRaw);
    if (!Array.isArray(existingResults)) {
      existingResults = [];
    }
  } catch (err) {
    // File doesn't exist yet, start fresh
    existingResults = [];
  }

  for (let i = 0; i < coursesToProcess.length; i++) {
    const course = coursesToProcess[i];
    const courseNum = i + 1;

    console.log(
      `[${courseNum}/${coursesToProcess.length}] Processing: ${course.courseTitle || course.courseCodes}...`,
    );

    const rewrittenDescriptions = {};
    // Initialize all prompt fields
    for (let idx = 0; idx < PROMPTS.length; idx++) {
      rewrittenDescriptions[`rewritten_descr_q${idx + 1}`] = null;
    }

    // Generate descriptions sequentially with 200ms delay between each
    for (let promptIdx = 0; promptIdx < PROMPTS.length; promptIdx++) {
      console.log(`  Generating Q${promptIdx + 1}...`);
      
      const rewritten = await generateRewrittenDescription(
        course.courseTitle,
        course.courseDescr,
        promptIdx,
      );

      if (rewritten) {
        rewrittenDescriptions[`rewritten_descr_q${promptIdx + 1}`] = rewritten;
        console.log(`    ✓ Generated (${rewritten.length} chars)`);
        successCount++;
      } else {
        console.log(`    ✗ Failed to generate`);
        errorCount++;
      }

      // Wait 500ms before next prompt (or before next course if this is the last prompt)
      if (promptIdx < PROMPTS.length - 1 || i < coursesToProcess.length - 1) {
        await sleep(500);
      }
    }

    results.push({
      ...course,
      ...rewrittenDescriptions,
    });

    console.log(`  ✓ Completed all ${PROMPTS.length} descriptions for this course\n`);

    // Take a 2 second break after every 5 courses to avoid rate limits
    if ((i + 1) % 5 === 0 && i < coursesToProcess.length - 1) {
      console.log(`  ⏸ Taking a 2 second break after ${i + 1} courses...\n`);
      await sleep(2000);
    }

    // Save to file after every SAVE_INTERVAL courses to avoid losing progress
    if ((i + 1) % SAVE_INTERVAL === 0 || i === coursesToProcess.length - 1) {
      const allResults = [...existingResults, ...results];
      console.log(`\n  💾 Saving progress: ${allResults.length} total courses (${results.length} new)...`);
      await fs.writeFile(OUTPUT_FILE, JSON.stringify(allResults, null, 2));
      console.log(`  ✓ Saved to ${OUTPUT_FILE}\n`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Processed: ${coursesToProcess.length} courses`);
  console.log(`Total descriptions generated: ${successCount} / ${coursesToProcess.length * PROMPTS.length}`);
  console.log(`Errors: ${errorCount}`);

  // Final save (in case the last batch wasn't exactly SAVE_INTERVAL)
  const allResults = [...existingResults, ...results];
  if (results.length > 0 && results.length % SAVE_INTERVAL !== 0) {
    console.log(`\n  💾 Final save: ${allResults.length} total courses...`);
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(allResults, null, 2));
    console.log(`  ✓ Saved to ${OUTPUT_FILE}`);
  }

  console.log(
    `\nProcessed courses ${START_INDEX + 1} to ${START_INDEX + coursesToProcess.length} (${coursesToProcess.length} courses)`,
  );
  if (START_INDEX + BATCH_SIZE < courses.length) {
    console.log(
      `Remaining courses: ${courses.length - (START_INDEX + BATCH_SIZE)}`,
    );
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

