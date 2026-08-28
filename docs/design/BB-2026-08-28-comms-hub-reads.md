# Build Brief — BB-2026-08-28-comms-hub-reads
**Git home:** Chooch333/project-state-mcp · `docs/design/BB-2026-08-28-comms-hub-reads.md`
**Project State plan:** `3338d822-cea6-4bc1-910d-e5e90af1d409` on `context-database`

**What this is:** Small follow-up to the dashboard rebuild. The faces build found three read-side gaps in the MCP server (verified live during its external review): list_plans doesn't return the new label columns, list_judgment_calls doesn't return plain_summary/action_needed even though the columns are populated, and nothing reads blocking Comms Table questions in bulk. This brief fixes the reads, switches the Notes Board's real three-section sorting on, restores the platform-layer badge, and cheapens refreshes. Closes the follow-ups promised in CD-J-015/016/019/020/022/023.

**What you'll do:** Nothing. No hard gates.

## Current state going in
**[verified 2026-08-28, external review session]** Dashboard live and reviewed (plan 1b0627ed). list_judgment_calls returns disclosures without plain_summary/action_needed (reproduced firsthand); list_plans lacks the label columns, forcing one get_plan per plan (embedding payload riding along) on every 60s refresh (CD-J-015); no tool lists blocking build_questions (CD-J-020); campaigns carry no platform-layer field so the Map badge has no live source (CD-J-022); Notes Board ships with forward-compatible section markup but sorts everything into one honest "Other notes" list (CD-J-019).

## Receiving chat
New build chat. No upstream dependency — plumbing and faces are both succeeded and reviewed.

## Scope
**In (effort S–M, real-money cost: none):**
1. **MCP read fixes** (repo `Chooch333/project-state-mcp`): `list_plans` additionally returns plain_title, plain_summary, campaign_id, designed_in, reviewed_at, reviewed_by, executor_report — and never embedding vectors; `list_judgment_calls` additionally returns plain_summary and action_needed; new read-only tool `list_questions` (blocking lane only, origin='build'/'charles-directed': filter by project_slug optional + status, default open+discussing; returns display_id, title, plain fields where present, status, plan_id, created_at; never disclosures).
2. **campaigns.layer**: optional text column; backfill: youtube-intake/email-intake/paid-content-intake → Intake; librarian → Understanding; command-hub/crew → Operations; picture-maker/cbrain-site → Expression; side-projects → none. `create_campaign`/`update_campaign`/`list_campaigns` gain the optional field.
3. **Dashboard** (`public/dashboard.html`): swap the per-plan get_plan fan-out for enriched list_plans (keep get_plan only where a single plan is opened); switch Notes Board to its real three sections using action_needed + list_questions (Needs you = open/discussing questions + needs-charles noted disclosures; Waiting for a design check = needs-design-check noted disclosures + succeeded-unreviewed plans; FYI = the rest), keeping the honest fallback text only when a tool call fails; render the layer badge on Map lanes where campaigns.layer is set; unify the unnamed-item placeholder wording to "(needs a name)" everywhere.
**Out:** everything else — no schema beyond campaigns.layer, no write-tool changes, no new tabs, no queue/lifecycle changes.

## Directive
1. Claim (`update_plan_status` → running). Reconcile against live schema and live tool responses before writing a line.
2. Ship the server changes; commit surgically; re-read every commit; verify Vercel READY; round-trip each changed/new tool against live data and show the new fields actually coming back (CD-J-016's test is the template).
3. Apply the campaigns.layer migration + backfill; SQL-verify.
4. Ship the dashboard changes; re-read; verify by tracing one real item into each Notes Board section — file one disposable test blocking question to light up "Needs you", verify it renders, then resolve and clean it up (log the cleanup).
5. Close per the closing rule (disclosures with plain sentences + flags, born `noted` — never self-disposed); set `succeeded`.

## Acceptance criteria
1. A live list_judgment_calls call returns plain_summary and action_needed on disclosures that have them.
2. A live list_plans call returns the label columns and contains no embedding data.
3. list_questions returns the test blocking question while open, and nothing after cleanup.
4. Notes Board shows three genuinely-sorted sections against live data; the test question appeared under "Needs you" while it existed.
5. Map lanes show layer badges for the eight mapped campaigns and none for side-projects.
6. One Program-tab refresh performs one list_plans per project and zero per-plan get_plan fan-out (code trace).

## Design intent
Same three qualities as the faces brief: plain words beat clever structure; derived, never copied; nothing hidden. Add one: **read tools return what write tools accept** — any field a write tool takes should come back out of the matching list tool, so no future build has to work around its own data again.

## Pasteable prompt
> Execute Build Brief BB-2026-08-28-comms-hub-reads. Pull the plan from Project State (plan_id 3338d822-cea6-4bc1-910d-e5e90af1d409, project context-database, status queued — set it to running when you claim it). Git copy at Chooch333/project-state-mcp/docs/design/BB-2026-08-28-comms-hub-reads.md. No upstream dependencies. Answer forks autonomously with judgment-call tags; escalate only at hard gates (none in this brief). Never self-dispose your disclosures or set your own review fields — external review only.
