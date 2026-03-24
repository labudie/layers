-- Standalone: ensure avatar column exists (idempotent with later migrations).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
