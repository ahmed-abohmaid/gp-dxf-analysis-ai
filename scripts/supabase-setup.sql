-- ── Supabase Setup for Electrical Load Calculator RAG ────────────────────────
-- Run this entire file once in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
--
-- gemini-embedding-001 produces 3072-dimensional vectors.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Enable pgvector (may already be enabled on newer Supabase projects)
create extension if not exists vector with schema extensions;

-- 2. Documents table — stores text chunks + their vector embeddings
create table if not exists documents (
  id        uuid primary key default gen_random_uuid(),
  content   text,
  metadata  jsonb,
  embedding vector(3072)
);

-- Note: HNSW index is not used because pgvector limits it to 2000 dimensions
-- and gemini-embedding-001 outputs 3072. Sequential scan is fast enough for
-- the small number of SBC 401 chunks (~105 rows).

-- 3. match_documents — called by LangChain SupabaseVectorStore
--    Returns chunks ordered by cosine similarity to the query embedding.
create or replace function match_documents(
  query_embedding vector(3072),
  match_count     int   default 10,
  filter          jsonb default '{}'
)
returns table (
  id         uuid,
  content    text,
  metadata   jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where documents.metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
