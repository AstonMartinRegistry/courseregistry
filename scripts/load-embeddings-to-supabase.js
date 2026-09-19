// Load embeddings into Supabase course_embeddings table
//
// Expected input format: JSON file with array of objects:
// [
//   {
//     "course_id": "uuid-string",
//     "source_type": "description" | "q1" | "q2" | "q3" | "q4",
//     "embedding": [0.123, 0.456, ...] // array of 1024 numbers
//   },
//   ...
// ]
//
// Prerequisites:
//   1. Install @supabase/supabase-js: npm install @supabase/supabase-js
//   2. Set environment variables:
//      - SUPABASE_URL
//      - SUPABASE_SERVICE_ROLE_KEY
//
// Usage (from project root):
//   SUPABASE_URL=your-url SUPABASE_SERVICE_ROLE_KEY=your-key node scripts/load-embeddings-to-supabase.js [input-file.json]

const fs = require("node:fs/promises");
const { createClient } = require("@supabase/supabase-js");

// Get Supabase credentials from environment
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set as environment variables",
  );
  console.error(
    "Example: SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/load-embeddings-to-supabase.js embeddings.json",
  );
  process.exit(1);
}

// Get input file from command line argument
const INPUT_FILE = process.argv[2] || "embeddings.json";

// Create Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  console.log(`Reading ${INPUT_FILE}...`);
  const raw = await fs.readFile(INPUT_FILE, "utf8");
  const embeddings = JSON.parse(raw);

  if (!Array.isArray(embeddings)) {
    throw new Error(`Expected ${INPUT_FILE} to contain an array`);
  }

  console.log(`Found ${embeddings.length} embeddings to insert...\n`);

  // Validate and transform data
  const records = embeddings.map((emb, idx) => {
    if (!emb.course_id) {
      throw new Error(`Embedding at index ${idx} missing course_id`);
    }
    if (!emb.source_type) {
      throw new Error(`Embedding at index ${idx} missing source_type`);
    }
    if (!Array.isArray(emb.embedding)) {
      throw new Error(`Embedding at index ${idx} missing or invalid embedding array`);
    }
    if (emb.embedding.length !== 1024) {
      throw new Error(
        `Embedding at index ${idx} has length ${emb.embedding.length}, expected 1024`,
      );
    }

    return {
      course_id: emb.course_id,
      source_type: emb.source_type,
      embedding: emb.embedding, // Keep as array - Supabase will handle conversion
    };
  });

  // Insert in batches of 500 (vectors are larger, so smaller batches)
  const BATCH_SIZE = 500;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(records.length / BATCH_SIZE);

    console.log(
      `Inserting batch ${batchNum}/${totalBatches} (${batch.length} embeddings)...`,
    );

    const { data, error } = await supabase
      .from("course_embeddings")
      .insert(batch)
      .select();

    if (error) {
      console.error(`Error inserting batch ${batchNum}:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
      console.log(`✓ Successfully inserted ${batch.length} embeddings`);
    }

    // Small delay to avoid rate limiting
    if (i + BATCH_SIZE < records.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Total embeddings: ${records.length}`);
  console.log(`Successfully inserted: ${inserted}`);
  console.log(`Errors: ${errors}`);

  if (errors > 0) {
    console.error("\n⚠ Some embeddings failed to insert. Check the errors above.");
    process.exit(1);
  } else {
    console.log("\n✓ All embeddings loaded successfully!");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

