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

-- =========================================================================
-- ACCOUNT & CREDIT SYSTEM TABLES
-- =========================================================================

-- 1. Guest Profiles Table
CREATE TABLE IF NOT EXISTS guest_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address VARCHAR(100),
    credits INTEGER DEFAULT 3 CHECK (credits >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure column exists if table was already created
ALTER TABLE guest_profiles ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100);

-- Disable RLS for guest profiles so the server can query/update it via anon key if needed
ALTER TABLE guest_profiles DISABLE ROW LEVEL SECURITY;

-- 2. User Profiles Table
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY,
    credits INTEGER DEFAULT 10 CHECK (credits >= 0),
    last_check_in DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Disable RLS for user profiles
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;

-- 3. User History Table (Stores user's private report snapshots)
CREATE TABLE IF NOT EXISTS user_history (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    status VARCHAR(50) NOT NULL,
    time VARCHAR(100) NOT NULL,
    cache_key VARCHAR(32) NOT NULL,
    mode VARCHAR(20) DEFAULT 'normal',
    content TEXT,
    elderly_content TEXT,
    latex_poster TEXT,
    mermaid_chart TEXT,
    steps JSONB DEFAULT '[]'::jsonb,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure snapshot columns exist if table was already created
ALTER TABLE user_history ADD COLUMN IF NOT EXISTS mode VARCHAR(20) DEFAULT 'normal';
ALTER TABLE user_history ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE user_history ADD COLUMN IF NOT EXISTS elderly_content TEXT;
ALTER TABLE user_history ADD COLUMN IF NOT EXISTS latex_poster TEXT;
ALTER TABLE user_history ADD COLUMN IF NOT EXISTS mermaid_chart TEXT;
ALTER TABLE user_history ADD COLUMN IF NOT EXISTS steps JSONB DEFAULT '[]'::jsonb;
ALTER TABLE user_history ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Deduplicate existing historical records before creating unique constraint
DELETE FROM user_history a USING user_history b
WHERE a.id < b.id
  AND a.user_id = b.user_id
  AND a.cache_key = b.cache_key;

-- Add unique constraint for (user_id, cache_key) to support Upsert and deduplication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_history_user_cache'
    ) THEN
        ALTER TABLE user_history ADD CONSTRAINT uq_user_history_user_cache UNIQUE (user_id, cache_key);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_history_user_id ON user_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_history_created_at ON user_history(created_at DESC);

-- Disable RLS for user history
ALTER TABLE user_history DISABLE ROW LEVEL SECURITY;

-- 4. Auth User Profile Trigger
-- Automatically creates a user_profile when a new user registers in Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, credits)
  VALUES (new.id, 10)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

