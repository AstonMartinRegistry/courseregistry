// Load courses from data/{term}/ultimate.json into Supabase.
//
// Usage: node scripts/load-courses.js [term]
//   e.g. node scripts/load-courses.js spring26  → loads to courses_spring26
//   e.g. node scripts/load-courses.js winter26  → loads to courses
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const fs = require("node:fs/promises");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const TABLE_BY_TERM = {
  autumn26: "courses_autumn26",
  spring26: "courses_spring26",
  winter26: "courses",
};

async function main() {
  const term = process.argv[2] || "spring26";
  const tableName = TABLE_BY_TERM[term];
  if (!tableName) throw new Error(`Unsupported term: ${term}`);
  const expandedPath = path.join(__dirname, "..", "data", term, "ultimate-expanded.json");
  const basePath = path.join(__dirname, "..", "data", term, "ultimate.json");
  let inputPath = expandedPath;
  try {
    await fs.access(expandedPath);
  } catch {
    inputPath = basePath;
  }

  const isAutumn = term === "autumn26";
  const supabaseUrl = isAutumn
    ? process.env.AUTUMN26_SUPABASE_URL
    : process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = isAutumn
    ? process.env.AUTUMN26_SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error(`Error: ${term} Supabase URL and service-role key required (the anon key cannot load catalog rows)`);
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Reading ${inputPath}...`);
  const raw = await fs.readFile(inputPath, "utf8");
  const courses = JSON.parse(raw);
  if (!Array.isArray(courses)) throw new Error("Expected array");

  console.log(`Found ${courses.length} courses to insert into ${tableName}...\n`);

  const records = courses.map((c) => ({
    course_descr: c.courseDescr || null,
    course_title: c.courseTitle || null,
    course_codes: c.courseCodes || "",
    instructors: c.instructors || null,
  }));

  const BATCH_SIZE = 1000;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(records.length / BATCH_SIZE);
    console.log(`Inserting batch ${batchNum}/${totalBatches} (${batch.length} records)...`);

    const { error } = await supabase.from(tableName).insert(batch).select();
    if (error) {
      console.error(`Error batch ${batchNum}:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
      console.log(`✓ Inserted ${batch.length} records`);
    }
    if (i + BATCH_SIZE < records.length) await new Promise((r) => setTimeout(r, 100));
  }

  console.log("\n=== Summary ===");
  console.log(`Inserted: ${inserted}, Errors: ${errors}`);
  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
