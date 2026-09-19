Stanford Course Registry finds Autumn 2026 courses using semantic search, with an
archived Spring 2026 experience at `/spring-2026`.

Run locally
```bash
npm install
npm run dev
```

Data pipeline

```bash
node scripts/gather.js autumn26
node scripts/dedup.js autumn26
node scripts/generate-expanded-descriptions.js autumn26
node scripts/generate-and-load-embeddings.js autumn26 --generate-only
```

Apply `supabase/migrations/010_create_autumn26_catalog.sql` to the configured
Autumn Supabase project. Configure `AUTUMN26_SUPABASE_URL`,
`AUTUMN26_SUPABASE_ANON_KEY`, and `AUTUMN26_SUPABASE_SERVICE_ROLE_KEY` locally,
then upload the
validated embedding cache with:

```bash
npm run load:embeddings -- autumn26
```

Descriptions under 30 words are expanded before embedding, matching the Spring
registry pipeline. The embedding command uses Fireworks Qwen3 embeddings resized
to 2,560 dimensions and requires the configured Supabase service-role key for
database writes. `--generate-only` creates a resumable local cache without
requiring Supabase write access.
# courseregistry
# courseregistry
