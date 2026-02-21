-- Migration: Add has_seen_intro field to users table
-- Date: 2026-02-21
-- Description: Tracks whether user has seen the introduction dialog

-- Add has_seen_intro column
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_seen_intro BOOLEAN DEFAULT FALSE;

-- Set all existing users to have seen intro (they're not new users)
-- Comment out the next line if you want existing users to see the intro
-- UPDATE users SET has_seen_intro = TRUE WHERE has_seen_intro IS NULL;

-- Verify the column was added
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'users' AND column_name = 'has_seen_intro';
