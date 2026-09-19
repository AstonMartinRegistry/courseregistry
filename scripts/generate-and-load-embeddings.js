// Generate normalized Fireworks embeddings, checkpoint them locally, and
// optionally upsert the finished catalog into Supabase.
//
// Usage:
//   node scripts/generate-and-load-embeddings.js autumn26 --generate-only
//   node scripts/generate-and-load-embeddings.js autumn26

const fs = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");
const { promisify } = require("node:util");

require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const dimensions = 2560;
const batchSize = Math.max(1, Number(process.env.EMBEDDING_BATCH_SIZE || 32));
const model = process.env.EMBEDDING_MODEL || "fireworks/qwen3-embedding-8b";
const apiUrl = "https://api.fireworks.ai/inference/v1/embeddings";
const apiKey = process.env.FIREWORKS_API_KEY;
const generateOnly = process.argv.includes("--generate-only");
const term = process.argv.find((arg) => !arg.startsWith("--") && arg !== process.argv[0] && arg !== process.argv[1]) || "autumn26";

const tableByTerm = {
  autumn26: "courses_autumn26",
  spring26: "courses_spring26",
  winter26: "courses",
};

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function normalize(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) throw new Error("Fireworks returned a zero-length embedding");
  return vector.map((value) => value / magnitude);
}
function courseKey(course) {
  return JSON.stringify([course.courseCodes || course.course_codes || "", course.courseTitle || course.course_title || "", course.courseDescr || course.course_descr || ""]);
}
function toRecord(course, embedding) {
  return {
    course_codes: course.courseCodes || course.course_codes || "",
    course_title: course.courseTitle || course.course_title || null,
    course_descr: course.courseDescr || course.course_descr || "",
    instructors: course.instructors || null,
    embedding,
  };
}

async function requestEmbeddings(texts, attempt = 0) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: texts, dimensions }),
  });
  if (!response.ok) {
    const detail = await response.text();
    if ((response.status === 429 || response.status >= 500) && attempt < 5) {
      await sleep(1200 * (attempt + 1));
      return requestEmbeddings(texts, attempt + 1);
    }
    throw new Error(`Fireworks ${response.status}: ${detail.slice(0, 300)}`);
  }
  const body = await response.json();
  const rows = Array.isArray(body.data) ? [...body.data].sort((a, b) => a.index - b.index) : [];
  if (rows.length !== texts.length) throw new Error(`Expected ${texts.length} embeddings, received ${rows.length}`);
  return rows.map((row) => {
    if (!Array.isArray(row.embedding) || row.embedding.length !== dimensions) {
      throw new Error(`Expected ${dimensions} embedding dimensions`);
    }
    return normalize(row.embedding);
  });
}

async function readCache(cachePath) {
  try {
    const compressed = await fs.readFile(cachePath);
    const parsed = JSON.parse((await gunzip(compressed)).toString("utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeCache(cachePath, records) {
  const compressed = await gzip(JSON.stringify(records), { level: 6 });
  await fs.writeFile(cachePath, compressed);
}

function supabaseHeaders(key) {
  return {
    apikey: key,
    ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
  };
}

async function upload(records, tableName, targetTerm) {
  const isAutumn = targetTerm === "autumn26";
  const supabaseUrl = isAutumn
    ? process.env.AUTUMN26_SUPABASE_URL
    : process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = isAutumn
    ? process.env.AUTUMN26_SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(`${targetTerm} loading requires its Supabase URL and service-role key`);
  }

  const probe = await fetch(`${supabaseUrl}/rest/v1/${tableName}?select=id&limit=0`, {
    headers: supabaseHeaders(serviceKey),
  });
  if (!probe.ok) {
    const detail = await probe.text();
    throw new Error(`Supabase table check failed (${probe.status}): ${detail.slice(0, 240)}. Apply the Autumn migration first.`);
  }

  const uploadBatchSize = 20;
  for (let index = 0; index < records.length; index += uploadBatchSize) {
    const batch = records.slice(index, index + uploadBatchSize);
    const response = await fetch(`${supabaseUrl}/rest/v1/${tableName}?on_conflict=course_codes`, {
      method: "POST",
      headers: {
        ...supabaseHeaders(serviceKey),
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    });
    if (!response.ok) throw new Error(`Supabase upload failed at ${index}: ${response.status} ${(await response.text()).slice(0, 260)}`);
    console.log(`Uploaded ${Math.min(index + batch.length, records.length)}/${records.length}`);
  }
}

async function main() {
  if (!apiKey) throw new Error("FIREWORKS_API_KEY is required");
  const tableName = tableByTerm[term];
  if (!tableName) throw new Error(`Unsupported term: ${term}`);
  const dataDir = path.join(__dirname, "..", "data", term);
  const expandedPath = path.join(dataDir, "ultimate-expanded.json");
  const basePath = path.join(dataDir, "ultimate.json");
  const cachePath = path.join(dataDir, "embeddings.json.gz");
  let inputPath = expandedPath;
  try { await fs.access(expandedPath); } catch { inputPath = basePath; }

  const courses = JSON.parse(await fs.readFile(inputPath, "utf8"));
  if (!Array.isArray(courses)) throw new Error("Course input must be an array");
  const cached = await readCache(cachePath);
  const byKey = new Map(cached.filter((row) => Array.isArray(row.embedding) && row.embedding.length === dimensions).map((row) => [courseKey(row), row]));
  const pending = courses.filter((course) => !byKey.has(courseKey(course)));

  console.log(`Input: ${inputPath}`);
  console.log(`Courses: ${courses.length}; cached: ${courses.length - pending.length}; pending: ${pending.length}`);
  console.log(`Model: ${model}; dimensions: ${dimensions}; request batch: ${batchSize}`);

  for (let index = 0; index < pending.length; index += batchSize) {
    const batch = pending.slice(index, index + batchSize);
    const texts = batch.map((course) => [course.courseTitle, course.courseDescr].filter(Boolean).join(". "));
    const embeddings = await requestEmbeddings(texts);
    batch.forEach((course, offset) => byKey.set(courseKey(course), toRecord(course, embeddings[offset])));
    const completed = Math.min(index + batch.length, pending.length);
    const currentTotal = courses.length - pending.length + completed;
    console.log(`Embedded ${completed}/${pending.length} pending (${currentTotal}/${courses.length} total)`);
    if (completed % (batchSize * 5) === 0 || completed === pending.length) {
      await writeCache(cachePath, courses.map((course) => byKey.get(courseKey(course))).filter(Boolean));
    }
  }

  const records = courses.map((course) => byKey.get(courseKey(course))).filter(Boolean);
  if (records.length !== courses.length) throw new Error(`Cache is incomplete: ${records.length}/${courses.length}`);
  await writeCache(cachePath, records);
  console.log(`Verified local cache: ${records.length} embeddings at ${cachePath}`);

  if (generateOnly) {
    console.log("Generate-only mode: skipped Supabase upload.");
    return;
  }
  await upload(records, tableName, term);
  console.log(`Loaded ${records.length} rows into ${tableName}.`);
}

main().catch((error) => { console.error(`Fatal: ${error.message}`); process.exit(1); });
