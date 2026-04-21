# Project State — Schema Design

## Design principles

1. **One row = one fact.** A decision is a row. An assumption is a row. A blocker is a row. No JSONB blobs of mixed content.
2. **Everything scoped to a project.** Every row has `project_id`. Multi-project support is automatic; filtering is a where-clause.
3. **Source tracking on every row.** Who wrote this — you, a chat, a Claude Code session, a future Orchestrator, an Executor? `source` column, free-text for now.
4. **Immutable history.** Decisions and assumptions that change get new rows with a `supersedes` pointer to the old one, not UPDATEs. You keep an audit trail for free.
5. **Soft status, not hard deletes.** Blockers get `resolved_at`, not DELETE. Next moves get `completed_at`. You can always see what the state was on a given date.

## Tables

### `projects`
The top-level container. One row per project.

```sql
create table projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,              -- 'family-trip-app', 'property-analyzer'
  name text not null,                      -- 'Family Trip App'
  description text,
  repo_url text,                           -- github url if applicable
  supabase_project_id text,                -- if the project has its own supabase
  vercel_project_id text,                  -- if deployed on vercel
  status text not null default 'active',   -- 'active' | 'paused' | 'archived'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Rationale: `slug` is a stable human-readable identifier — chats will use `family-trip-app` not a uuid. `supabase_project_id` and `vercel_project_id` let the MCP return these to a chat that needs to run tool calls against the app's infrastructure, so you don't have to retype IDs.

### `decisions`
Closed decisions with rationale. Once written, not edited — superseded if changed.

```sql
create table decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,                     -- short: 'Photos stored in Supabase Storage'
  rationale text not null,                 -- why this was decided
  alternatives_considered text,            -- what else was on the table
  decided_at timestamptz not null default now(),
  source text not null,                    -- 'charles', 'chat:trip-app-v24', etc
  supersedes uuid references decisions(id),-- null unless this replaces an earlier decision
  created_at timestamptz not null default now()
);

create index decisions_project_active_idx on decisions (project_id)
  where supersedes is null;  -- active (not-yet-superseded) decisions only
```

Rationale: Supersession chain preserves history. A query for "current decisions" filters `where supersedes is null`. A query for "how did this decision evolve" walks the chain backward.

### `assumptions`
Things currently assumed true. Unlike decisions, these are lower-conviction and may get flipped during plan review.

```sql
create table assumptions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  statement text not null,                 -- 'Max upload size: 10MB'
  alternatives text,                       -- '5MB stricter; 25MB permissive'
  status text not null default 'active',   -- 'active' | 'confirmed' | 'invalidated'
  status_changed_at timestamptz,
  status_reason text,                      -- why it was confirmed or invalidated
  source text not null,
  created_at timestamptz not null default now()
);

create index assumptions_project_active_idx on assumptions (project_id, status);
```

Rationale: Assumptions are squishier than decisions. They start `active`, get promoted to `confirmed` when evidence supports them, or `invalidated` when proven wrong. The `status_reason` explains what changed.

### `blockers`
Open questions or external dependencies halting progress.

```sql
create table blockers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  question text not null,                  -- 'Should photos require auth or shared link?'
  context text,                            -- what we know, what options exist
  answer text,                             -- filled in when resolved
  resolved_at timestamptz,
  source text not null,
  created_at timestamptz not null default now()
);

create index blockers_project_open_idx on blockers (project_id)
  where resolved_at is null;
```

Rationale: Open blockers are the most actionable state — a chat starting up asks "any open blockers?" and gets the live list. Answered blockers stay in the table as historical record.

### `next_moves`
Concrete next actions. Unlike blockers (which are questions), next_moves are tasks.

```sql
create table next_moves (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  description text not null,               -- 'Add photo gallery to stop detail'
  priority text not null default 'normal', -- 'urgent' | 'normal' | 'someday'
  estimated_effort text,                   -- 'small' | 'medium' | 'large' — rough
  completed_at timestamptz,
  completed_by_plan_id uuid,               -- optional link to the plan that completed it
  source text not null,
  created_at timestamptz not null default now()
);

create index next_moves_project_open_idx on next_moves (project_id, priority)
  where completed_at is null;
```

Rationale: Simple todo surface. `priority` is a soft bucket, not a numeric rank, to avoid the "everything is urgent" failure mode. `completed_by_plan_id` links a completed next move to the plan document that delivered it — traceability for free.

### `plans`
Full build plan documents. The artifact I showed you in the last example. Stored as markdown text.

```sql
create table plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,                     -- 'Per-stop photo uploads'
  status text not null default 'draft',    -- 'draft' | 'blessed' | 'executing' | 'complete' | 'abandoned'
  content text not null,                   -- full markdown plan
  executor_report text,                    -- validator's output after execution
  source text not null,
  created_at timestamptz not null default now(),
  blessed_at timestamptz,
  completed_at timestamptz
);

create index plans_project_status_idx on plans (project_id, status);
```

Rationale: Plans are bigger than other entities (the example plan is ~250 lines), so a separate table makes sense. Status transitions are the lifecycle: draft → blessed (by you) → executing (Executor picks up) → complete (Validator signs off) or abandoned. `executor_report` is where the Validator writes deltas and observations.

### `status_snapshots`
Point-in-time narrative summaries — the "one paragraph of where things are." Optional but useful for the morning-brief agent later.

```sql
create table status_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  narrative text not null,                 -- 'Photos feature shipped. Working on search.'
  source text not null,
  created_at timestamptz not null default now()
);

create index status_snapshots_project_recent_idx on status_snapshots (project_id, created_at desc);
```

Rationale: Chats often want a quick "where are we" that's human-authored or chat-summarized, not derived from rows. Latest snapshot per project is the cheap answer to "what's the status."

## What's NOT in the schema (and why)

- **No user/auth tables.** You're the only user. The MCP itself will be auth'd via a shared secret; rows don't need per-user access control.
- **No tags or custom fields.** Tempting to add a generic "tags text[]" column everywhere. Skip it — you'll start using tags inconsistently, and filtering becomes ambiguous. Add specific columns when a real need emerges.
- **No JSONB metadata columns.** Same reason. If a new field matters, add a column. If it doesn't matter, don't store it.
- **No chat transcripts or full session logs.** The state is the distilled output of conversations, not the raw conversations. Raw chat history lives in claude.ai's storage. State holds the decisions and assumptions extracted from it.

## How queries will look

**"Pull state for Family Trip App"** (chat bootstrap):
```sql
-- active decisions
select title, rationale from decisions
where project_id = :id and supersedes is null
order by decided_at desc;

-- active assumptions
select statement, alternatives from assumptions
where project_id = :id and status = 'active';

-- open blockers
select question, context from blockers
where project_id = :id and resolved_at is null;

-- open next moves
select description, priority from next_moves
where project_id = :id and completed_at is null
order by case priority when 'urgent' then 1 when 'normal' then 2 else 3 end;

-- latest narrative
select narrative from status_snapshots
where project_id = :id
order by created_at desc limit 1;
```

The MCP wraps this as a single tool call: `get_project_state('family-trip-app')`.

**"Log a decision"**:
```sql
insert into decisions (project_id, title, rationale, source)
values (:id, 'Use Supabase Storage for photos', '...reasoning...', 'chat:trip-app-v27');
```

MCP tool: `log_decision(project_slug, title, rationale, alternatives?, source)`.

---

*End of schema design. Review before MCP server implementation proceeds.*
