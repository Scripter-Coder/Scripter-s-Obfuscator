-- 0002_script_lifetime.sql
--
-- Adds the metadata half of moving script BYTES off Cloudflare onto the owner's PC.
--
-- The bytes go to the Storage Keeper service. What stays here is the record of the
-- script and when it stops being valid: id, size, hash, and the deadline the browser
-- counts down to. That is enough for the dashboard to render a countdown without ever
-- asking the storage service a question it could answer wrongly, and it means losing
-- the PC does not lose the list of what should exist.
--
-- DELIBERATELY NOT ENFORCED HERE.
-- This column is for display and for auditing. It is NOT the authority on whether a
-- script may run - the Storage Keeper service decides that, on read, from the file it
-- actually holds. A row that says "expires in 3 days" while the file is already gone
-- produces a countdown that hits zero and then reports the script as gone, which is the
-- correct outcome. The reverse - a file that is somehow still present past this instant -
-- is caught by the service's one-year hard cap, which is enforced independently of
-- anything written here.
--
-- Writing the deadline in two places would be the obvious design and the wrong one: two
-- clocks that agree until the day they do not, and a disagreement is indistinguishable
-- from a bug in whichever one you happen to be looking at.

ALTER TABLE scripts ADD COLUMN expires_at INTEGER;      -- unix SECONDS; NULL = no timer
ALTER TABLE scripts ADD COLUMN storage_backend TEXT NOT NULL DEFAULT 'kv';
    -- 'kv'      bytes in Cloudflare KV (the historical behaviour)
    -- 'keeper'  bytes on the owner's PC via the Storage Keeper service
ALTER TABLE scripts ADD COLUMN byte_size INTEGER;        -- bytes as stored, for the dashboard
ALTER TABLE scripts ADD COLUMN byte_sha256 TEXT;        -- integrity, matched against the service
ALTER TABLE scripts ADD COLUMN migrated_at INTEGER;     -- when the bytes moved to the service

CREATE INDEX IF NOT EXISTS idx_scripts_expires ON scripts(expires_at);

-- Backfill: every pre-existing script keeps working exactly as it did. storage_backend
-- defaults to 'kv', which is TRUE for all of them - they are all still in KV - so
-- switching the backend on does not orphan anything. Rows are never deleted here.
UPDATE scripts SET storage_backend = 'kv' WHERE storage_backend IS NULL OR storage_backend = '';