// Gather (scrape) classes from Stanford Navigate Algolia index.
// Queries by (day, career) to work around Algolia's 1000-hit limit.
//
// Usage: TERM="Spring 2026" node scripts/gather.js
//   or:  node scripts/gather.js spring26   (defaults to Spring 2026)
//
// Output: data/{term}/raw.json  (e.g. data/spring26/raw.json)

const fs = require("node:fs/promises");
const path = require("node:path");

const ALGOLIA_URL = "https://RXGHAPCKOF-dsn.algolia.net/1/indexes/*/queries";
const ALGOLIA_APP_ID = "RXGHAPCKOF";
let algoliaApiKey = "";
const INDEX_NAME = "classes";
const HITS_PER_PAGE = 100;

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const CAREERS = ["Undergraduate", "Graduate", "Graduate School of Business", "Law", "Medicine"];

const TERM_MAP = {
  autumn26: "Autumn 2026",
  spring26: "Spring 2026",
  winter26: "Winter 2026",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAlgoliaPageFor(termOffered, day, career, page) {
  const body = {
    requests: [
      {
        indexName: INDEX_NAME,
        facetFilters: [
          `acadCareerDescr:${career}`,
          [`meetings.daysOfWeekList:${day}`],
          [`termOffered:${termOffered}`],
        ],
        facets: [
          "acadCareerDescr", "acadGroupDescr", "campus.lvl0", "campus.lvl1",
          "classEnrlOptionList", "curatedClassList", "deptName", "family.lvl1",
          "format", "geRequirements", "langInstr", "meetings.daysOfWeekList",
          "meetings.instructors.displayName", "meetings.startTimeInMinutes",
          "termOffered", "units",
        ],
        highlightPostTag: "__/ais-highlight__",
        highlightPreTag: "__ais-highlight__",
        hitsPerPage: HITS_PER_PAGE,
        maxValuesPerFacet: 500,
        page,
        query: "",
      },
      {
        indexName: INDEX_NAME,
        analytics: false,
        clickAnalytics: false,
        facetFilters: [`acadCareerDescr:${career}`, [`termOffered:${termOffered}`]],
        facets: "meetings.daysOfWeekList",
        highlightPostTag: "__/ais-highlight__",
        highlightPreTag: "__ais-highlight__",
        hitsPerPage: 0,
        maxValuesPerFacet: 500,
        page: 0,
        query: "",
      },
      {
        indexName: INDEX_NAME,
        analytics: false,
        clickAnalytics: false,
        facetFilters: [`acadCareerDescr:${career}`, [`meetings.daysOfWeekList:${day}`]],
        facets: "termOffered",
        highlightPostTag: "__/ais-highlight__",
        highlightPreTag: "__ais-highlight__",
        hitsPerPage: 0,
        maxValuesPerFacet: 500,
        page: 0,
        query: "",
      },
    ],
  };

  const res = await fetch(ALGOLIA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-algolia-application-id": ALGOLIA_APP_ID,
      "x-algolia-api-key": algoliaApiKey,
      "x-algolia-agent":
        "Algolia for JavaScript (5.37.0); Lite (5.37.0); Browser; instantsearch.js (4.81.0); react (18.3.0-canary-178c267a4e-20241218); react-instantsearch (7.17.0); react-instantsearch-core (7.17.0); next.js (14.2.33); JS Helper (3.26.0)",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(
      `Algolia request failed for day=${day}, career=${career}, page=${page}: ${res.status} ${res.statusText}`,
    );
  }

  const json = await res.json();
  const result = json.results?.[0];
  if (!result) throw new Error("Unexpected Algolia response shape");
  return result;
}

async function refreshAlgoliaKey() {
  const response = await fetch("https://navigator.stanford.edu/api/generate-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Could not obtain Stanford Navigator search key: ${response.status}`);
  }
  const data = await response.json();
  if (!data.securedApiKey) throw new Error("Stanford Navigator returned no search key");
  algoliaApiKey = data.securedApiKey;
}

async function scrapeBucket(termOffered, day, career, allById) {
  console.log(`\n=== Bucket day=${day}, career=${career} ===`);
  let page = 0;
  const first = await fetchAlgoliaPageFor(termOffered, day, career, page);
  console.log(`Page ${page}: got ${first.hits.length} hits (nbPages=${first.nbPages})`);

  for (const hit of first.hits) {
    if (hit?.objectID) allById.set(hit.objectID, hit);
  }

  for (page = 1; page < first.nbPages; page++) {
    const delay = 500 + Math.floor(Math.random() * 1500);
    console.log(`Waiting ${delay}ms before fetching page ${page}...`);
    await sleep(delay);
    const result = await fetchAlgoliaPageFor(termOffered, day, career, page);
    console.log(`Page ${page}: got ${result.hits.length} hits`);
    for (const hit of result.hits) {
      if (hit?.objectID) allById.set(hit.objectID, hit);
    }
  }
}

async function main() {
  const termArg = process.argv[2] || process.env.TERM || "spring26";
  const termKey = termArg.toLowerCase().replace(/\s/g, "");
  const termOffered = TERM_MAP[termKey] || termArg;
  const dataDir = path.join(__dirname, "..", "data", termKey);
  const outputPath = path.join(dataDir, "raw.json");

  await fs.mkdir(dataDir, { recursive: true });
  console.log(`Gathering ${termOffered} classes → ${outputPath}\n`);

  await refreshAlgoliaKey();

  const allById = new Map();
  for (const day of DAYS) {
    for (const career of CAREERS) {
      await scrapeBucket(termOffered, day, career, allById);
      console.log(`Accumulated unique hits: ${allById.size}`);
    }
  }
  const allHits = Array.from(allById.values());
  console.log(`\nTotal unique hits: ${allHits.length}`);
  await fs.writeFile(outputPath, JSON.stringify(allHits, null, 2), "utf8");
  console.log(`Wrote ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
