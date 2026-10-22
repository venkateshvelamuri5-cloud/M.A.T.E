-- Large document handling: documents are processed once at upload into section-sized chunks
-- with a full-text index, and each query retrieves only the relevant sections.

-- 1. Ingestion status on user_files
ALTER TABLE public.user_files ADD COLUMN IF NOT EXISTS ingest_status VARCHAR(20);        -- null (legacy), 'queued', 'processing', 'ready', 'failed'
ALTER TABLE public.user_files ADD COLUMN IF NOT EXISTS ingest_error TEXT;
ALTER TABLE public.user_files ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.user_files ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);          -- SHA-256 of the file bytes
ALTER TABLE public.user_files ADD COLUMN IF NOT EXISTS page_count INTEGER;
ALTER TABLE public.user_files ADD COLUMN IF NOT EXISTS token_count INTEGER;
ALTER TABLE public.user_files ADD COLUMN IF NOT EXISTS section_count INTEGER;
ALTER TABLE public.user_files ADD COLUMN IF NOT EXISTS chunk_structure VARCHAR(20);       -- 'numbered', 'markdown', 'chapter', 'windows'
ALTER TABLE public.user_files ADD COLUMN IF NOT EXISTS ocr_page_count INTEGER DEFAULT 0;
ALTER TABLE public.user_files ADD COLUMN IF NOT EXISTS redact_pii BOOLEAN;                -- null = default by scope (user files on, knowledge base off)
ALTER TABLE public.user_files ADD COLUMN IF NOT EXISTS pii_redacted BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS user_files_content_hash_idx ON public.user_files (content_hash);

-- 2. Chunks
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES public.user_files(id) ON DELETE CASCADE NOT NULL,
    chunk_index INTEGER NOT NULL,
    heading_path TEXT NOT NULL DEFAULT '',
    page_from INTEGER,
    page_to INTEGER,
    content TEXT NOT NULL,
    token_count INTEGER NOT NULL,
    tsv TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english'::regconfig, coalesce(heading_path, '')), 'A') ||
        setweight(to_tsvector('english'::regconfig, content), 'B')
    ) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (file_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS document_chunks_tsv_idx ON public.document_chunks USING GIN (tsv);
CREATE INDEX IF NOT EXISTS document_chunks_file_idx ON public.document_chunks (file_id, chunk_index);

-- Chunks are readable by whoever can read the parent file (the server uses the service role).
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow reading chunks of readable files" ON public.document_chunks FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.user_files f
        WHERE f.id = document_chunks.file_id
          AND (
            f.user_id = auth.uid()
            OR f.file_type = 'knowledge_base'
            OR f.agent_id IS NOT NULL
            OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'analyst')
          )
    )
);

-- 3. Ranked full-text search across a set of files. Terms are OR-ed so a long question still matches.
CREATE OR REPLACE FUNCTION public.search_document_chunks(p_file_ids UUID[], p_terms TEXT[], p_limit INTEGER DEFAULT 40)
RETURNS TABLE (
    id UUID, file_id UUID, chunk_index INTEGER, heading_path TEXT,
    page_from INTEGER, page_to INTEGER, content TEXT, token_count INTEGER, rank REAL
)
LANGUAGE sql STABLE AS $$
    WITH q AS (
        SELECT to_tsquery('english', string_agg(t, ' | ')) AS query
        FROM (
            SELECT DISTINCT regexp_replace(lower(term), '[^a-z0-9]', '', 'g') AS t
            FROM unnest(p_terms) AS term
        ) terms
        WHERE t <> ''
    )
    SELECT c.id, c.file_id, c.chunk_index, c.heading_path, c.page_from, c.page_to, c.content, c.token_count,
           ts_rank_cd(c.tsv, q.query, 1) AS rank
    FROM public.document_chunks c, q
    WHERE q.query IS NOT NULL
      AND c.file_id = ANY (p_file_ids)
      AND c.tsv @@ q.query
    ORDER BY rank DESC
    LIMIT p_limit;
$$;

-- 4. Reuse chunks of an identical, already processed file instead of processing it again.
CREATE OR REPLACE FUNCTION public.copy_document_chunks(p_source_file_id UUID, p_target_file_id UUID)
RETURNS INTEGER
LANGUAGE sql AS $$
    WITH copied AS (
        INSERT INTO public.document_chunks (file_id, chunk_index, heading_path, page_from, page_to, content, token_count)
        SELECT p_target_file_id, chunk_index, heading_path, page_from, page_to, content, token_count
        FROM public.document_chunks
        WHERE file_id = p_source_file_id
        RETURNING 1
    )
    SELECT count(*)::INTEGER FROM copied;
$$;

REVOKE EXECUTE ON FUNCTION public.copy_document_chunks(UUID, UUID) FROM PUBLIC, anon, authenticated;
