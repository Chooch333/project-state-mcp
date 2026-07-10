# Build Brief — BB-2026-07-10-canonical-plan-lifecycle
*Updated: 2026-07-10 · Design Assist session · build-ready pending Charles approval*

**What this is:** Rename the Project State plan lifecycle to canonical work-queue states and align every file that speaks the old vocabulary, so the Build Brief shelf works the way the orchestrator expects.

**What I'll do (receiving chat):** Migrate the live database, update the MCP code and dashboard, rewrite the orchestrate-build skill, add one line to the Design Assist skill, and verify end-to-end.

**What you'll do:** Approve this brief, paste the prompt into a build chat, review the Session Log after.

---

## Current state going in

The plan lifecycle today is `draft → blessed → executing → complete / abandoned` **[verified — live check constraint read 2026-07-10]**. The orchestrate-build skill references statuses that don't exist (`queued`, `in-progress`, `completed`) **[verified]**, so the first orchestrator run would find nothing on the shelf. Charles has chosen to adopt canonical work-queue states rather than map onto the old names.

**New lifecycle:** `draft → queued → running → succeeded | failed | blocked | abandoned`
- `draft` — being written (DA sessions)
- `queued` — approved, on the shelf, orchestrator may pick it up
- `running` — orchestrator claimed it and is building
- `succeeded` — built and verified
- `failed` — build errored out; error text in `executor_report`; may be re-queued after review
- `blocked` — halted at a hard gate (credentials / money / destructive action), awaiting Charles
- `abandoned` — intentionally killed

**Existing data migration [verified — 5 rows total]:** `draft`→`draft` (3 rows), `blessed`→`queued` (1 row: Family Trip roadmap), `abandoned`→`abandoned` (1 row). No rows in `executing` or `complete` exist.

## Receiving chat

New build chat (interactive — Charles present).

## Scope

**In scope:**
1. Supabase migration on project `ujditldbqdiqigazkcak`: update `plans_status_check` constraint, migrate the 1 `blessed` row to `queued`, rename column `blessed_at` → `queued_at`.
2. `Chooch333/project-state-mcp`: update `lib/tools.ts` (enum + descriptions), grep and update `lib/handlers.ts` (status validation, transitions, timestamp logic, `plan_status_changed` activity events), grep and update `public/dashboard.html` labels, grep `01-schema-design.md`, `04-usage-guide.md`, `README.md` for stale status words. Add a new migration file (do NOT edit `02-migration.sql` — it is a historical record).
3. `Chooch333/agent-library`: rewrite `skills/orchestrate-build/SKILL.md` step 1 and step 7 to the new vocabulary (pick oldest `queued` → flip to `running` → close as `succeeded`; on error set `failed` with error in executor_report; on hard gate set `blocked`). Add one sentence to `roles/design-assist/SKILL.md` step 10: at handoff, the finished brief's Project State plan is set to `queued`.
4. Verification pass (see Acceptance criteria).

**Out of scope:** No changes to the Build Brief template or completeness framework (verified status-agnostic). No new build_queue table (single-orchestrator system; Project State plans ARE the queue — decided this session). No changes to PROTOCOL.md (verified clean). No retry-counter or claimed_by columns (deferred until failure evidence exists).

## Directive

1. **Supabase MCP `apply_migration`** on `ujditldbqdiqigazkcak`, name `canonical_plan_lifecycle`: drop old check constraint; `update plans set status='queued' where status='blessed'`; add new constraint with the seven states; `alter table plans rename column blessed_at to queued_at`. (Order matters: constraint off → data migrate → constraint on.)
2. **Custom GitHub MCP** on `project-state-mcp`: `get_file_contents` each in-scope file, apply edits via `replace_in_file` / `create_or_update_file` (with current sha). Every occurrence of the five old status words in code paths gets its canonical replacement; `blessed_at` → `queued_at` everywhere. Commit a new SQL file `05-canonical-lifecycle-migration.sql` recording the migration.
3. **Redeploy check:** confirm Vercel auto-deploys the MCP on push (**Vercel MCP `list_deployments`**, project `prj_HWieneNHl3YH0adDgZ4bidsNqn7Q`); if not, flag.
4. **Custom GitHub MCP** on `agent-library`: rewrite orchestrate-build SKILL.md status language; add the one-line queued-at-handoff rule to design-assist SKILL.md step 10 and bump its changelog (0.2.2).
5. **Write-before-done:** re-read every committed file after writing (standing convention — silent str_replace no-ops are a known failure mode).
6. Close with a Session Log on project `context-database`, referencing BB-2026-07-10-canonical-plan-lifecycle.

## Inputs

- Live constraint + row inventory **[verified 2026-07-10, this session]**
- File inventory: tools.ts (read in full), handlers.ts / dashboard.html / doc files **[assumed to contain status words — grep at start; staleness rule applies: live files are truth]**
- Repo paths and Supabase/Vercel project IDs above **[verified]**

## Acceptance criteria

1. `update_plan_status` accepts `queued/running/succeeded/failed/blocked/abandoned` and rejects `blessed/executing/complete` — proven by one live call each way on a throwaway draft plan.
2. `select distinct status from plans` returns only canonical states.
3. `list_plans` on `family-trip-app` shows the roadmap as `queued` with `queued_at` populated.
4. Dashboard renders without error and shows new status labels.
5. Zero occurrences of `blessed`, `executing`, or plan-status `complete` in project-state-mcp code (grep evidence in Session Log).
6. orchestrate-build SKILL.md loop reads correctly against the real enum (quote the updated step 1 in the Session Log).

## Assumptions

- Vercel auto-deploy on push is wired for project-state-mcp (confirm in step 3; if false, deployment becomes a gated item).

---

## Pasteable prompt

This is a build chat. Read PROTOCOL.md first (Custom GitHub MCP: owner=Chooch333, repo=chat-protocol, path=PROTOCOL.md).

Then fetch and execute Build Brief BB-2026-07-10-canonical-plan-lifecycle at docs/design/BB-2026-07-10-canonical-plan-lifecycle.md in Chooch333/project-state-mcp (Custom GitHub MCP get_file_contents).

Task in one line: rename the Project State plan lifecycle to canonical queue states (draft → queued → running → succeeded | failed | blocked | abandoned) across the live Supabase database (project ujditldbqdiqigazkcak), the project-state-mcp code and dashboard, and the orchestrate-build + design-assist skills in Chooch333/agent-library — per the brief's Directive, exactly.

Rules: MCP-first; grep before editing (handlers.ts, dashboard.html, and the doc files were not fully scanned at design time — live files are truth); do not edit 02-migration.sql; re-read every file after writing to verify the change landed; batch any forks with recommendations; close with a Session Log on project context-database referencing the Brief ID and covering all six acceptance criteria with evidence.
