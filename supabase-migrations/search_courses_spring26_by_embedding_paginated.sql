-- Search Spring 26 courses by cosine similarity with pagination

CREATE OR REPLACE FUNCTION search_courses_spring26_by_embedding_paginated(
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
    instructors TEXT,
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
    c.instructors,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM courses_spring26 c
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
