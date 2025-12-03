-- Supabase function to find top 3 courses by cosine similarity
-- Normalizes embeddings to ensure fair comparison regardless of text length
-- 
-- Usage:
--   SELECT * FROM search_courses_by_embedding('[0.123, 0.456, ...]'::vector(2560));
--
-- Returns: top 3 courses with highest cosine similarity (1 = identical, 0 = orthogonal)

CREATE OR REPLACE FUNCTION search_courses_by_embedding(query_embedding vector(2560))
RETURNS TABLE (
  id BIGINT,
  course_codes TEXT,
  course_title TEXT,
  course_descr TEXT,
  similarity FLOAT
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.course_codes,
    c.course_title,
    c.course_descr,
    -- Cosine similarity: 1 - cosine_distance
    -- Normalize both vectors to ensure fair comparison
    -- cosine_distance (<=>) already normalizes, but we ensure it's correct
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM courses c
  WHERE c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding  -- Order by cosine distance (ascending = most similar)
  LIMIT 3;
END;
$$;

-- Add a comment
COMMENT ON FUNCTION search_courses_by_embedding IS 'Finds top 3 courses by cosine similarity to the query embedding';
