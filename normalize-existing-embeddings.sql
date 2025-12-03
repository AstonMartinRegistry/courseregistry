-- Normalize all existing embeddings in the courses table
-- This ensures fair comparison regardless of text length
--
-- Run this in your Supabase SQL Editor to normalize all existing embeddings
--
-- Note: pgvector's cosine distance already normalizes during comparison,
-- but normalizing stored vectors ensures consistency and can help with ranking

-- Create a function to normalize a vector to unit length (L2 normalization)
CREATE OR REPLACE FUNCTION normalize_vector(v vector) 
RETURNS vector AS $$
DECLARE
  magnitude float;
  v_array float[];
BEGIN
  -- Get magnitude using <-> (L2 distance from zero vector)
  -- Actually, let's calculate it properly
  SELECT sqrt(sum(pow(unnest(v::float[]), 2))) INTO magnitude;
  
  IF magnitude > 1e-10 THEN
    -- Normalize: divide each element by magnitude
    SELECT array_agg(val / magnitude ORDER BY ordinality)
    INTO v_array
    FROM unnest(v::float[]) WITH ORDINALITY AS t(val, ordinality);
    
    RETURN v_array::vector;
  ELSE
    RETURN v;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update all embeddings to be normalized
UPDATE courses
SET embedding = normalize_vector(embedding)
WHERE embedding IS NOT NULL;

-- Verify normalization: magnitude should be close to 1.0 for normalized vectors
-- Run this to check:
-- SELECT 
--   id, 
--   course_codes,
--   sqrt(sum(pow(unnest(embedding::float[]), 2))) as magnitude
-- FROM courses 
-- WHERE embedding IS NOT NULL 
-- GROUP BY id, course_codes 
-- LIMIT 10;

