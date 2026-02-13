-- Morning Brief Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- PROFILES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  categories TEXT[] DEFAULT ARRAY['Technology', 'Business'],
  expertise TEXT[] DEFAULT ARRAY[]::TEXT[],
  companies TEXT[] DEFAULT ARRAY[]::TEXT[],
  paywalled_sources TEXT[] DEFAULT ARRAY[]::TEXT[],
  blocked_sources TEXT[] DEFAULT ARRAY[]::TEXT[],
  max_articles_per_section INTEGER DEFAULT 5,
  summary_style TEXT DEFAULT 'brief',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- DIGESTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.digests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  sections JSONB NOT NULL,
  article_count INTEGER NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digests ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Digests policies
CREATE POLICY "Users can view their own digests"
  ON public.digests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own digests"
  ON public.digests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own digests"
  ON public.digests FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(id);
CREATE INDEX IF NOT EXISTS idx_digests_user_id ON public.digests(user_id);
CREATE INDEX IF NOT EXISTS idx_digests_generated_at ON public.digests(generated_at DESC);

-- =============================================
-- FUNCTIONS & TRIGGERS
-- =============================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for profiles table
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- SAMPLE QUERIES (for testing)
-- =============================================

-- View all profiles
-- SELECT * FROM public.profiles;

-- View all digests with user info
-- SELECT d.*, p.categories
-- FROM public.digests d
-- JOIN public.profiles p ON d.user_id = p.id
-- ORDER BY d.generated_at DESC;

-- Count digests per user
-- SELECT user_id, COUNT(*) as digest_count
-- FROM public.digests
-- GROUP BY user_id;

-- Get user's most recent digest
-- SELECT * FROM public.digests
-- WHERE user_id = auth.uid()
-- ORDER BY generated_at DESC
-- LIMIT 1;
