-- ==========================================
-- 🛡️ SQL MIGRATION: DROP PROBLEMATIC CHECK CONSTRAINT
-- Execute this SQL in your Supabase Dashboard SQL Editor to fix HTTP 400 errors when setting AI sample status.
-- ==========================================

BEGIN;

-- Physically eliminates the buggy constraint blocking admin state transitions
ALTER TABLE public.maps 
DROP CONSTRAINT IF EXISTS check_ai_flag;

COMMIT;
