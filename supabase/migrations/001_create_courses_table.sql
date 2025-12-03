-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create courses table for Winter 2026 course descriptions
-- This table stores unique course descriptions with their associated course codes

CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_descr TEXT NOT NULL,
  course_title TEXT,
  course_codes TEXT NOT NULL -- Course codes separated by " / "
);

-- Create embeddings table for course vector embeddings
-- Each course can have up to 5 embeddings (one for description + 4 generated)
CREATE TABLE IF NOT EXISTS course_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL, -- 'description', 'q1', 'q2', 'q3', 'q4'
  embedding vector(1024) NOT NULL
);

-- Create HNSW index for fast vector similarity search
CREATE INDEX IF NOT EXISTS idx_course_embeddings_hnsw 
ON course_embeddings 
USING hnsw (embedding vector_cosine_ops);

