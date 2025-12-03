-- Supabase function to find courses by cosine similarity with pagination
-- Uses cursor-based pagination for efficient results
-- 
-- Usage:
--   SELECT * FROM search_courses_by_embedding_paginated(
--     '[0.123, 0.456, ...]'::vector(2560),
--     3,  -- limit_count
--     NULL,  -- last_score (NULL for first page)
--     NULL,  -- last_id (NULL for first page)
--     NULL   -- exclude_ids (array of IDs to exclude)
--   );

CREATE OR REPLACE FUNCTION search_courses_by_embedding_paginated(
    query_embedding vector(2560),
    limit_count int DEFAULT 3,
    last_score float DEFAULT NULL,
    last_id bigint DEFAULT NULL,
    exclude_ids bigint[] DEFAULT NULL
)
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
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM courses c
  WHERE 
    c.embedding IS NOT NULL
    AND (last_score IS NULL OR (1 - (c.embedding <=> query_embedding)) <= last_score)
    AND (exclude_ids IS NULL OR c.id != ALL(exclude_ids))
    AND (last_id IS NULL OR 
      ((1 - (c.embedding <=> query_embedding)) = last_score AND c.id > last_id) OR 
      (1 - (c.embedding <=> query_embedding)) < last_score
    )
  ORDER BY c.embedding <=> query_embedding, c.id ASC
  LIMIT limit_count;
END;
$$;

COMMENT ON FUNCTION search_courses_by_embedding_paginated IS 'Finds courses by cosine similarity with cursor-based pagination';

