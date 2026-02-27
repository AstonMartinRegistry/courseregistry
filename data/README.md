# Course data

- **winter26/** – Winter 2026 course data (archived)
- **spring26/** – Spring 2026 course data (active)

Each term folder (Winter 26 pipeline):
- `raw.json` – Scraped from Stanford Navigate (Algolia)
- `filtered.json` – Schema transform (same count)
- `filtered-deduped.json` – Deduped by (courseCode, instructors)
- `ultimate.json` – Grouped by identical description, courseCodes joined with " / "
