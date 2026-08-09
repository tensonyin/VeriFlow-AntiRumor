-- DDL script to create the fact-check answer cache table in Supabase.
-- Run this in your Supabase SQL Editor (https://supabase.com dashboard -> SQL Editor)

CREATE TABLE IF NOT EXISTS fact_check_cache (
    id SERIAL PRIMARY KEY,
    cache_key VARCHAR(32) UNIQUE NOT NULL, -- MD5(query_text + ":" + sorted_file_md5s)
    query TEXT NOT NULL,
    file_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(50) NOT NULL,           -- "Verified" | "Fake" | "Doubtful"
    content TEXT NOT NULL,                 -- Main report text
    elderly_content TEXT,                  -- Optional elderly report text
    latex_poster TEXT,                     -- Optional LaTeX poster code/text
    mermaid_chart TEXT,                    -- Optional mermaid chart code
    steps JSONB NOT NULL DEFAULT '[]'::jsonb, -- JSON array of workflow steps
    image_url TEXT,                        -- Optional Dify output image URL
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index on the cache_key for fast lookups
CREATE INDEX IF NOT EXISTS idx_fact_check_cache_key ON fact_check_cache(cache_key);

-- Disable Row Level Security (RLS) so the anon key can read/write this public cache table
ALTER TABLE fact_check_cache DISABLE ROW LEVEL SECURITY;
