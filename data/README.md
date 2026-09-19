# Course data

- **winter26/** – Winter 2026 course data (archived)
- **spring26/** – Spring 2026 course data (archived)
- **autumn26/** – Autumn 2026 course data (active)

Each term folder:
- `raw.json` – Scraped from Stanford Navigate (Algolia)
- `filtered.json` – Schema transform (same count)
- `filtered-deduped.json` – Deduped by (courseCode, instructors)
- `ultimate.json` – Grouped by identical description, courseCodes joined with " / "
- `expanded-descriptions2.json` – Fireworks expansions for descriptions under 30 words
- `ultimate-expanded.json` – Final catalog used for embeddings and Supabase loading

Autumn 2026 snapshot: 2,871 raw sections, 2,616 instructor-aware deduplicated records,
and 1,861 grouped courses. The scraper obtains a short-lived public search key from
Stanford Navigator at runtime instead of storing one in the repository.
