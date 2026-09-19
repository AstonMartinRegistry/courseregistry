// Compatibility helper: merge a completed expansion file into the local
// catalog. New runs normally do this automatically in
// generate-expanded-descriptions.js.
//
// Usage: node scripts/apply-expanded-descriptions.js [term]

const fs = require("node:fs/promises");
const path = require("node:path");

const term = process.argv[2] || "autumn26";
const dataDir = path.join(__dirname, "..", "data", term);
const coursesPath = path.join(dataDir, "ultimate.json");
const expansionsPath = path.join(dataDir, "expanded-descriptions2.json");
const outputPath = path.join(dataDir, "ultimate-expanded.json");

function key(course) {
  return JSON.stringify([
    course.courseCodes || course.course_codes || "",
    course.courseTitle || course.course_title || "",
    course.courseDescr || course.original_descr || "",
  ]);
}

async function main() {
  const courses = JSON.parse(await fs.readFile(coursesPath, "utf8"));
  const expansions = JSON.parse(await fs.readFile(expansionsPath, "utf8"));
  if (!Array.isArray(courses) || !Array.isArray(expansions)) throw new Error("Expected JSON arrays");
  const byKey = new Map(expansions.filter((entry) => entry.expanded_descr).map((entry) => [key(entry), entry.expanded_descr]));
  const merged = courses.map((course) => ({ ...course, courseDescr: byKey.get(key(course)) || course.courseDescr }));
  await fs.writeFile(outputPath, JSON.stringify(merged, null, 2));
  console.log(`Merged ${byKey.size} expanded descriptions into ${outputPath}`);
}

main().catch((error) => { console.error(error.message); process.exit(1); });
