// Convert the full-precision embedding checkpoint into a compact int16 index
// that the search API can use while Supabase is unavailable.
//
// Usage: node scripts/build-local-search-index.js [term]

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const term = process.argv[2] || "autumn26";
const dataDir = path.join(__dirname, "..", "data", term);
const inputPath = path.join(dataDir, "embeddings.json.gz");
const outputPath = path.join(dataDir, "embeddings.int16.gz");
const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(inputPath)));

if (!Array.isArray(rows) || !rows.length) throw new Error("Embedding cache is empty");
const dimensions = rows[0].embedding.length;
const values = new Int16Array(rows.length * dimensions);

for (let row = 0; row < rows.length; row++) {
  const embedding = rows[row].embedding;
  if (!Array.isArray(embedding) || embedding.length !== dimensions) {
    throw new Error(`Invalid embedding at row ${row}`);
  }
  const offset = row * dimensions;
  for (let column = 0; column < dimensions; column++) {
    values[offset + column] = Math.max(-32767, Math.min(32767, Math.round(embedding[column] * 32767)));
  }
}

const compressed = zlib.gzipSync(Buffer.from(values.buffer), { level: 9 });
fs.writeFileSync(outputPath, compressed);
console.log(`Wrote ${rows.length} × ${dimensions} int16 embeddings to ${outputPath}`);
