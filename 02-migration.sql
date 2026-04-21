-- Project State Schema — Migration 001
-- Run this in the new Supabase project's SQL Editor
-- Creates all tables, indexes, and the one extension needed

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────
-- projects
-- ─────────────────────────────────────────────────────────
create table projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  repo_url text,
  supabase_project_id text,
  vercel_project_id text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_slug_idx on projects (slug);
create index projects_status_idx on projects (status);

-- ─────────────────────────────────────────────────────────
-- decisions
-- ─────────────────────────────────────────────────────────
create table decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  rationale text not null,
  alternatives_considered text,
  decided_at timestamptz not null default now(),
  source text not null,
  supersedes uuid references decisions(id),
  created_at timestamptz not null default now()
);

create index decisions_project_active_idx on decisions (project_id)
  where supersedes is null;
create index decisions_project_all_idx on decisions (project_id, decided_at desc);

-- ─────────────────────────────────────────────────────────
-- assumptions
-- ─────────────────────────────────────────────────────────
create table assumptions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  statement text not null,
  alternatives text,
  status text not null default 'active' check (status in ('active', 'confirmed', 'invalidated')),
  status_changed_at timestamptz,
  status_reason text,
  source text not null,
  created_at timestamptz not null default now()
);

create index assumptions_project_active_idx on assumptions (project_id, status);

-- ─────────────────────────────────────────────────────────
-- blockers
-- ─────────────────────────────────────────────────────────
create table blockers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  question text not null,
  context text,
  answer text,
  resolved_at timestamptz,
  source text not null,
  created_at timestamptz not null default now()
);

create index blockers_project_open_idx on blockers (project_id)
  where resolved_at is null;

-- ─────────────────────────────────────────────────────────
-- next_moves
-- ─────────────────────────────────────────────────────────
create table next_moves (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  description text not null,
  priority text not null default 'normal' check (priority in ('urgent', 'normal', 'someday')),
  estimated_effort text check (estimated_effort in ('small', 'medium', 'large') or estimated_effort is null),
  completed_at timestamptz,
  completed_by_plan_id uuid,
  source text not null,
  created_at timestamptz not null default now()
);

create index next_moves_project_open_idx on next_moves (project_id, priority)
  where completed_at is null;

-- ─────────────────────────────────────────────────────────
-- plans
-- ─────────────────────────────────────────────────────────
create table plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'blessed', 'executing', 'complete', 'abandoned')),
  content text not null,
  executor_report text,
  source text not null,
  created_at timestamptz not null default now(),
  blessed_at timestamptz,
  completed_at timestamptz
);

create index plans_project_status_idx on plans (project_id, status);
create index plans_project_recent_idx on plans (project_id, created_at desc);

-- Add the FK from next_moves to plans now that plans exists
alter table next_moves
  add constraint next_moves_plan_fk
  foreign key (completed_by_plan_id) references plans(id) on delete set null;

-- ─────────────────────────────────────────────────────────
-- status_snapshots
-- ─────────────────────────────────────────────────────────
create table status_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  narrative text not null,
  source text not null,
  created_at timestamptz not null default now()
);

create index status_snapshots_project_recent_idx on status_snapshots (project_id, created_at desc);

-- ─────────────────────────────────────────────────────────
-- updated_at trigger for projects
-- ─────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on projects
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────
-- Done. Verify with:
-- select table_name from information_schema.tables
--   where table_schema = 'public' order by table_name;
-- ─────────────────────────────────────────────────────────
