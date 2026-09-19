// Full Winter 26–style pipeline: filter → dedupe by (courseCode, instructors) → group by description.
//
// Usage: node scripts/dedup.js [term]
//   e.g. node scripts/dedup.js spring26
//
// Input:  data/{term}/raw.json (or allwinter26.json for winter26)
// Output: data/{term}/filtered.json, filtered-deduped.json, ultimate.json

const fs = require("node:fs/promises");
const path = require("node:path");

function getInstructorKey(hit) {
  const names = new Set();
  for (const m of hit.meetings || []) {
    for (const i of m.instructors || []) {
      const name = i.displayName || i.name || "";
      if (name) names.add(name);
    }
  }
  return Array.from(names).sort().join("|");
}

function getDedupeKey(hit) {
  const code = hit.courseCode || "";
  return `${code}::${getInstructorKey(hit)}`;
}

// Transform Algolia hit to filtered schema (like winter26filtered)
function toFiltered(hit) {
  return {
    school: hit.acadGroupDescr || null,
    department: hit.deptName || hit.acadOrgDescr || null,
    courseCode: hit.courseCode || "",
    courseTitle: hit.courseTitle || null,
    courseDescr: hit.courseDescr || null,
    format: hit.format || null,
    gradingBasisDescr: hit.gradingBasisDescr || null,
    units: hit.units || [],
    strm: hit.strm || null,
    classNbr: hit.classNbr || null,
    meetings: (hit.meetings || []).map((m) => ({
      facilityDescr: m.facilityDescr,
      room: m.room,
      startTime: m.startTime,
      endTime: m.endTime,
      startTimeInMinutes: m.startTimeInMinutes,
      endTimeInMinutes: m.endTimeInMinutes,
      daysOfWeek: m.daysOfWeek,
      instructors: m.instructors || [],
    })),
  };
}

async function main() {
  const term = process.argv[2] || "spring26";
  const dataDir = path.join(__dirname, "..", "data", term);

  let raw;
  const tryFiles = ["raw.json", "allwinter26.json"];
  for (const name of tryFiles) {
    try {
      raw = await fs.readFile(path.join(dataDir, name), "utf8");
      if (name !== "raw.json") console.log(`(Using ${name} as input)`);
      break;
    } catch {
      continue;
    }
  }
  if (!raw) {
    console.error(`Error: Could not read raw data from data/${term}/`);
    console.error(`Run gather first: node scripts/gather.js ${term}`);
    process.exit(1);
  }

  const hits = JSON.parse(raw);
  if (!Array.isArray(hits)) throw new Error("Expected array");

  console.log(`\n=== Pipeline for ${term} ===\n`);
  console.log(`Raw hits: ${hits.length}`);

  // Step 1: Filter + transform (like winter26filtered)
  const filtered = hits.map(toFiltered);
  const withDescr = filtered.filter((h) => h.courseDescr && String(h.courseDescr).trim().length > 0);
  console.log(`With description: ${withDescr.length}`);

  const filteredPath = path.join(dataDir, "filtered.json");
  await fs.writeFile(filteredPath, JSON.stringify(filtered, null, 2), "utf8");
  console.log(`Wrote ${path.basename(filteredPath)}`);

  // Step 2: Dedupe by (courseCode, instructors), keep longest description
  const byDedupeKey = new Map();
  for (const h of withDescr) {
    const key = getDedupeKey(h);
    const existing = byDedupeKey.get(key);
    const descLen = (h.courseDescr || "").length;
    if (!existing || descLen > (existing.courseDescr || "").length) {
      byDedupeKey.set(key, h);
    }
  }
  const deduped = Array.from(byDedupeKey.values());
  console.log(`After dedupe (courseCode+instructors): ${deduped.length}`);

  const dedupedPath = path.join(dataDir, "filtered-deduped.json");
  await fs.writeFile(dedupedPath, JSON.stringify(deduped, null, 2), "utf8");
  console.log(`Wrote ${path.basename(dedupedPath)}`);

  // Step 3: Group by identical courseDescr, join courseCodes and instructors
  const byDescr = new Map();
  for (const h of deduped) {
    const key = (h.courseDescr || "").trim();
    if (!key) continue;
    if (!byDescr.has(key)) byDescr.set(key, { codes: [], instructors: new Set() });
    const entry = byDescr.get(key);
    entry.codes.push(h.courseCode || "");
    for (const m of h.meetings || []) {
      for (const i of m.instructors || []) {
        const name = i.displayName || i.name || "";
        if (name) entry.instructors.add(name);
      }
    }
  }

  // Format instructors: max 3, then "et al"; use "N/A" when empty
  function formatInstructors(names) {
    const arr = [...names].filter(Boolean).sort();
    if (arr.length === 0) return "N/A";
    if (arr.length <= 3) return arr.join(", ");
    return arr.slice(0, 3).join(", ") + " et al";
  }

  const ultimate = [];
  byDescr.forEach((entry, descr) => {
    const first = deduped.find((d) => (d.courseDescr || "").trim() === descr);
    ultimate.push({
      courseTitle: first?.courseTitle || "N/A",
      courseDescr: descr,
      courseCodes: [...new Set(entry.codes)].filter(Boolean).sort().join(" / ") || "N/A",
      instructors: formatInstructors(entry.instructors),
    });
  });
  console.log(`After group by description: ${ultimate.length}`);

  const ultimatePath = path.join(dataDir, "ultimate.json");
  await fs.writeFile(ultimatePath, JSON.stringify(ultimate, null, 2), "utf8");
  console.log(`Wrote ${path.basename(ultimatePath)} (${ultimate.length} courses)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
