-- 05-canonical-lifecycle-migration.sql
-- BB-2026-07-10-canonical-plan-lifecycle
-- Applied live via Supabase MCP apply_migration on 2026-07-10, project ujditldbqdiqigazkcak.
-- Renames the plan lifecycle from draft/blessed/executing/complete/abandoned to
-- canonical work-queue states: draft/queued/running/succeeded/failed/blocked/abandoned.
-- Kept here as a historical record alongside 02-migration.sql — do not re-run.

-- Drop old check constraint
alter table plans drop constraint plans_status_check;

-- Migrate existing blessed row(s) to queued
update plans set status = 'queued' where status = 'blessed';

-- Add new check constraint with canonical work-queue states
alter table plans add constraint plans_status_check
  check (status = any (array['draft','queued','running','succeeded','failed','blocked','abandoned']));

-- Rename blessed_at to queued_at
alter table plans rename column blessed_at to queued_at;
