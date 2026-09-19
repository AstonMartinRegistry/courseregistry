// Expand descriptions shorter than 30 words before embedding.
// Reads data/{term}/ultimate.json and writes:
//   data/{term}/expanded-descriptions2.json
//   data/{term}/ultimate-expanded.json
//
// Usage: node scripts/generate-expanded-descriptions.js [term]

const fs = require("node:fs/promises");
const path = require("node:path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const term = process.argv[2] || "autumn26";
const dataDir = path.join(__dirname, "..", "data", term);
const inputFile = path.join(dataDir, "ultimate.json");
const resultsFile = path.join(dataDir, "expanded-descriptions2.json");
const mergedFile = path.join(dataDir, "ultimate-expanded.json");
const apiKey = process.env.FIREWORKS_API_KEY;
const apiUrl = "https://api.fireworks.ai/inference/v1/chat/completions";
const model =
  process.env.FIREWORKS_TEXT_MODEL ||
  "accounts/fireworks/models/gpt-oss-120b";
const thresholdWords = 30;
const concurrency = Number(process.env.AUGMENT_CONCURRENCY || 8);

if (!apiKey) {
  console.error("Error: FIREWORKS_API_KEY must be set");
  process.exit(1);
}

function countWords(text) {
  if (!text || typeof text !== "string") return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function courseKey(course) {
  return JSON.stringify([
    course.courseCodes || course.course_codes || "",
    course.courseTitle || course.course_title || "",
    course.courseDescr || course.original_descr || "",
  ]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function expandCourse(course, attempt = 0) {
  const title = course.courseTitle || "Untitled course";
  const description = course.courseDescr || "";
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You edit university catalog descriptions. Expand sparse copy without inventing requirements, schedules, instructors, outcomes, or facts. Preserve every prerequisite and restriction exactly. Return only the revised description, with no heading or commentary.",
        },
        {
          role: "user",
          content: `Course title: ${title}\nOriginal description: ${description}\n\nExpand this to 90–110 words. Keep the original meaning and all concrete facts. Do not invent details.`,
        },
      ],
      temperature: 0.2,
      max_tokens: 420,
      reasoning_effort: "low",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await sleep(1500 * (attempt + 1));
      return expandCourse(course, attempt + 1);
    }
    throw new Error(`Fireworks ${response.status}: ${detail.slice(0, 240)}`);
  }

  const data = await response.json();
  const expanded = data.choices?.[0]?.message?.content?.trim();
  if (!expanded) throw new Error("Fireworks returned no description");
  const words = countWords(expanded);

  if ((words < 70 || words > 130) && attempt < 2) {
    return expandCourse(course, attempt + 1);
  }
  if (words < 70 || words > 130) {
    throw new Error(`Fireworks returned ${words} words after retries`);
  }
  return expanded;
}

async function main() {
  const courses = JSON.parse(await fs.readFile(inputFile, "utf8"));
  const shortCourses = courses.filter(
    (course) => countWords(course.courseDescr) < thresholdWords,
  );

  let saved = [];
  try {
    saved = JSON.parse(await fs.readFile(resultsFile, "utf8"));
    if (!Array.isArray(saved)) saved = [];
  } catch {
    saved = [];
  }

  // Old experiments can contain truncated reasoning-model outputs. Only reuse
  // an expansion when it is long enough to add useful semantic context.
  const validSaved = saved.filter((entry) => {
    const words = countWords(entry.expanded_descr);
    return entry.provider_model === model && words >= 70 && words <= 130;
  });
  const completed = new Map(validSaved.map((entry) => [courseKey(entry), entry]));
  const pending = shortCourses.filter((course) => !completed.has(courseKey(course)));
  console.log(`Catalog: ${courses.length} courses`);
  console.log(`Under ${thresholdWords} words: ${shortCourses.length}`);
  console.log(`Already expanded: ${shortCourses.length - pending.length}`);
  console.log(`Pending: ${pending.length}`);
  console.log(`Model: ${model}\n`);

  let cursor = 0;
  let failures = 0;
  async function worker(workerId) {
    while (cursor < pending.length) {
      const index = cursor++;
      const course = pending[index];
      const label = course.courseCodes || course.courseTitle || `course ${index + 1}`;
      try {
        const expanded = await expandCourse(course);
        const entry = {
          courseCodes: course.courseCodes,
          courseTitle: course.courseTitle,
          courseDescr: course.courseDescr,
          course_codes: course.courseCodes,
          course_title: course.courseTitle,
          original_descr: course.courseDescr,
          original_word_count: countWords(course.courseDescr),
          expanded_descr: expanded,
          expanded_word_count: countWords(expanded),
          provider_model: model,
        };
        completed.set(courseKey(course), entry);
        console.log(`[${index + 1}/${pending.length}] ${label}: ${entry.expanded_word_count} words`);
      } catch (error) {
        failures++;
        console.error(`[worker ${workerId}] ${label}: ${error.message}`);
      }

      if ((index + 1) % 10 === 0 || index === pending.length - 1) {
        await fs.writeFile(
          resultsFile,
          JSON.stringify(Array.from(completed.values()), null, 2),
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, (_, index) => worker(index + 1)),
  );

  const results = Array.from(completed.values());
  await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));
  const expansions = new Map(results.map((entry) => [courseKey(entry), entry.expanded_descr]));
  const merged = courses.map((course) => ({
    ...course,
    courseDescr: expansions.get(courseKey(course)) || course.courseDescr,
  }));
  await fs.writeFile(mergedFile, JSON.stringify(merged, null, 2));

  console.log(`\nExpanded: ${results.length}/${shortCourses.length}`);
  console.log(`Failures: ${failures}`);
  console.log(`Wrote ${mergedFile}`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
