-- Autumn 2026 catalog, semantic search, and term-scoped popularity.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS courses_autumn26 (
  id BIGSERIAL PRIMARY KEY,
  course_descr TEXT NOT NULL,
  course_title TEXT,
  course_codes TEXT NOT NULL,
  instructors TEXT,
  embedding vector(2560)
);

-- pgvector's HNSW and IVFFlat indexes support at most 2,000 dimensions.
-- This catalog uses 2,560-dimensional Fireworks embeddings, so searches use
-- an exact cosine scan. With 1,861 rows this is small and avoids lossy vectors.
DROP INDEX IF EXISTS idx_courses_autumn26_hnsw;

-- Descriptions can exceed PostgreSQL's B-tree entry size, so use the compact,
-- grouped course-code string as the stable upsert key.
DROP INDEX IF EXISTS idx_courses_autumn26_course_descr_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_autumn26_course_codes_unique
ON courses_autumn26 (course_codes);

ALTER TABLE courses_autumn26 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courses_autumn26_select_policy" ON courses_autumn26;
CREATE POLICY "courses_autumn26_select_policy"
  ON courses_autumn26 FOR SELECT TO anon, authenticated USING (true);

-- Loading is deliberately service-role-only. Do not expose public INSERT/UPDATE.
GRANT SELECT ON courses_autumn26 TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON courses_autumn26 TO service_role;
GRANT USAGE, SELECT ON SEQUENCE courses_autumn26_id_seq TO service_role;

CREATE OR REPLACE FUNCTION search_courses_autumn26_by_embedding_paginated(
  query_embedding vector(2560),
  limit_count integer DEFAULT 4,
  last_score double precision DEFAULT NULL,
  last_id bigint DEFAULT NULL,
  exclude_ids bigint[] DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  course_descr text,
  course_title text,
  course_codes text,
  instructors text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.course_descr,
    c.course_title,
    c.course_codes,
    c.instructors,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM courses_autumn26 c
  WHERE c.embedding IS NOT NULL
    AND (exclude_ids IS NULL OR NOT (c.id = ANY(exclude_ids)))
    AND (
      last_score IS NULL
      OR (1 - (c.embedding <=> query_embedding)) < last_score
      OR (
        (1 - (c.embedding <=> query_embedding)) = last_score
        AND c.id > last_id
      )
    )
  ORDER BY c.embedding <=> query_embedding, c.id ASC
  LIMIT GREATEST(1, LEAST(limit_count, 20));
$$;

-- Autumn popularity is intentionally separate from the original registry.
-- Nothing below modifies course_popularity or its Spring RPCs.
CREATE TABLE IF NOT EXISTS public.course_popularity_autumn26 (
  course_id bigint PRIMARY KEY REFERENCES public.courses_autumn26(id) ON DELETE CASCADE,
  search_count bigint NOT NULL DEFAULT 0
);

ALTER TABLE public.course_popularity_autumn26 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read Autumn leaderboard" ON public.course_popularity_autumn26;
CREATE POLICY "Anyone can read Autumn leaderboard"
  ON public.course_popularity_autumn26 FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.course_popularity_autumn26 TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.course_popularity_autumn26 FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_popularity_autumn26 TO service_role;

CREATE OR REPLACE FUNCTION increment_course_popularity_autumn26(
  course_ids bigint[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.course_popularity_autumn26 AS popularity (course_id, search_count)
  SELECT unnest(course_ids), 1
  ON CONFLICT (course_id)
  DO UPDATE SET search_count = popularity.search_count + 1;
END;
$$;

CREATE OR REPLACE FUNCTION get_leaderboard_autumn26(
  limit_count integer DEFAULT 200
)
RETURNS TABLE (
  course_id bigint,
  course_codes text,
  course_title text,
  search_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.course_id, c.course_codes, c.course_title, cp.search_count
  FROM public.course_popularity_autumn26 cp
  JOIN public.courses_autumn26 c ON c.id = cp.course_id
  ORDER BY cp.search_count DESC, cp.course_id ASC
  LIMIT GREATEST(1, LEAST(limit_count, 200));
$$;

CREATE OR REPLACE FUNCTION get_popularity_count_autumn26()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint FROM public.course_popularity_autumn26;
$$;

REVOKE ALL ON FUNCTION search_courses_autumn26_by_embedding_paginated(vector, integer, double precision, bigint, bigint[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION increment_course_popularity_autumn26(bigint[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_leaderboard_autumn26(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_popularity_count_autumn26() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION search_courses_autumn26_by_embedding_paginated(vector, integer, double precision, bigint, bigint[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_course_popularity_autumn26(bigint[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_leaderboard_autumn26(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_popularity_count_autumn26() TO anon, authenticated;
