# Build Brief — BB-2026-08-21-build-map-tab

**Git home:** Chooch333/project-state-mcp · `docs/design/BB-2026-08-21-build-map-tab.md`
**Project State plan:** `71adb7c8-8f8b-4bf9-bdd5-053c21ff4e06` on `context-database`

**What this is:** Add a program-level "Build Map" tab to the existing Project State dashboard — a five-lane visual map of the whole platform build where every step is a status-colored dot resolved live from the database on each load. This executes D8 (Thin Master UI v0) from the Master Roadmap decision queue.

**What I'll do (receiving chat):** Seed the Build Map Skeleton plan on platform-program, add the tab + renderer + live status resolvers to dashboard.html, verify by re-reading the committed file, smoke-test against the live MCP, close with a Session Log.

**What you'll do (Charles):** Nothing during execution. No hard gates expected in this brief. Review the map afterward.

---

## Current state going in

- Dashboard today [verified 2026-08-21]: single static file `public/dashboard.html` in Chooch333/project-state-mcp, served by Vercel at the project-state URL. Seven tabs; vanilla HTML/CSS/JS; calls `/api/mcp` via `callMcp()` with a bearer token in browser localStorage. Decision D-004 (single static file, no framework) STANDS — this build extends the file, it does not rebuild.
- Approved architecture [Charles 2026-08-21]: **skeleton + live overlay.** The map skeleton (lanes, steps, order) is curated JSON stored as a plan on platform-program. Each step optionally carries an evidence pointer to a real Project State record. Status is computed at read time from those pointers and NEVER stored in the map — per the Master Roadmap prime directive and the ratified "derived, never copied" ontology principle.
- Approved visual [Charles 2026-08-21, from in-chat mock]: five horizontal tracks stacked L4 (Expression) top → L0 (Operations) bottom; stations as 16px dots on a 2px track line; two-line labels (bold short title + status word); summary strip above the map (steps done · you-are-here · waiting-on-you count); D1–D8 decision pill row below; legend. Status colors reuse the file's existing CSS variables: done = green filled; building now = amber with a pulse animation; queued/on-the-shelf = blue; waiting-on-Charles = red dashed border; not-yet-scoped = gray hollow; blocked/failed = red filled.
- D8 is ratified on platform-program as of this brief's shelving (decision logged there; PP-002 completed). The Build Map tab itself, once built, is evidence for its own L4 "Build map v0" dot.

## Receiving chat

New autonomous build chat.

## Scope

**In scope:**
1. "Build Map Skeleton" plan on `platform-program` (format + seed below).
2. New "Build Map" tab in `public/dashboard.html`: fetch skeleton by its plan id, resolve every evidence pointer live, render the approved visual.
3. Auto-refresh every 60 seconds while the Build Map tab is the active tab (clear the interval when another tab is selected).
4. One-line addition to the Master Roadmap's OPERATING MODEL section: chats revising the roadmap's map/queue also update the Build Map Skeleton plan (one `update_plan_content` call).

**Out of scope (forks pre-answered):** rebuilding the dashboard as an app (D-004 stands) · editing/writing data from the page (read-only stands) · Supabase Realtime push (D-033 stays parked; polling chosen) · D-011's v2 viewers (decision chains, plan revisions) · any server/API change (existing MCP tools suffice — verified) · any change to member projects' data.

## Directive

1. `Project State:write_plan` on `platform-program` — title "Build Map Skeleton", tags [build-map, d8, skeleton], content = the JSON skeleton seeded per Inputs. Record the returned plan id; it gets hardcoded into the dashboard in step 3. Leave this plan in status `draft` permanently — it is a data document, not a queue entry (same pattern as the Intake Source Parking Lot plan; do not queue it).
2. `Custom GitHub:get_file_contents` owner=Chooch333, repo=project-state-mcp, path=public/dashboard.html — read the current file before editing.
3. `Custom GitHub:replace_in_file` (surgical, repeatable) on public/dashboard.html:
   a. Add a "Build Map" tab button in `nav.tabs` (position: immediately after Overview) and a matching `buildmap-tab` panel div.
   b. Add `renderBuildMap()`: fetch the skeleton via `callMcp('get_plan', { plan_id: '<skeleton id from step 1>' })`; parse its content as JSON; collect the distinct project slugs referenced by evidence pointers; batch-fetch per project (one `get_project_state` and one `list_plans` per referenced slug, cached for the load); resolve each step's status: plan succeeded→done, running→building-now, queued→on-the-shelf, blocked|failed→blocked; next_move completed→done, open with "waiting" flag in the skeleton or tag needs-charles→waiting-on-you, open otherwise→on-the-shelf; decision found→done; evidence type "manual"→use the literal status in the skeleton; pointer missing→not-yet-scoped; pointer fails to resolve→render gray with a title-attribute tooltip naming the pointer (degrade, never blank the map).
   c. Render the approved visual using the file's existing CSS variable palette and escapeHtml on every rendered string (D-026 discipline applies to all new code).
   d. Summary strip computed from resolved statuses: done count / total, the building-now step names, waiting-on-you count.
   e. Decision pill row rendered from the skeleton's decision_queue array.
   f. 60s `setInterval` refresh active only while the tab is selected; register the tab in the `loadCurrentTab` switch and tab wiring.
4. Re-read the committed file after every commit (write-before-done) and confirm the edits landed.
5. Smoke test: fetch the skeleton via MCP and confirm it parses; resolve at least one pointer per lane; confirm every seed pointer resolves against live state, correcting stale ids from live data (DB is truth; the seed below is a creation-time snapshot).
6. Close: Session Log on `context-database` referencing BB-2026-08-21-build-map-tab; `update_plan_status` this brief's plan → succeeded; post any judgment calls via `post_judgment_call` bound to this plan_id.

## Inputs

- This brief's plan on context-database (id in header) — the queue entry.
- Master Roadmap plan `31fdcb9b-3dd7-4c6c-8049-7362d91e746f` on platform-program — map source; per its own prime directive, do NOT treat member-project statuses written in its prose as live.
- Current dashboard file [verified 2026-08-21]: Chooch333/project-state-mcp `public/dashboard.html` — tab pattern, `callMcp()`, palette variables, escapeHtml all already present to extend.
- MCP tools callable from the page [verified sufficient — no server change]: list_projects, get_project_dashboard, get_project_state, list_plans, get_plan.
- **Skeleton JSON format:**
```json
{ "version": 1,
  "lanes": [ { "id": "L1", "name": "Intake", "steps": [
    { "label": "YouTube conduit", "sub": "PC relay install",
      "evidence": { "type": "next_move", "project": "world-graph", "ref": "WG-045" },
      "waiting_on_charles": true } ] } ],
  "decision_queue": [ { "id": "D8", "label": "Master UI", "status": "resolved" } ] }
```
`evidence.type` ∈ plan | decision | next_move | manual. For type manual, a literal `"status"` field replaces resolution. `ref` is a display_id for decisions/next_moves or a plan id (full or unambiguous prefix) for plans.
- **23-step seed [verified 2026-08-21 — re-verify pointers at build time]:**
  - **L4 Expression:** Stack advisor (manual, done) · Build map v0 (plan = this brief's plan id, context-database) · Query UX (manual, not-yet-scoped, sub "D4") · X pipeline (manual, not-yet-scoped, sub "D7") · PM backbone (manual, blocked, sub "gated on D6")
  - **L3 Memory:** cbrain (manual, done, sub "live") · Security check (manual, done, sub "RLS verified")
  - **L2 Understanding:** Graphiti pilot (decision WG-020, world-graph) · Type registry (plan "BB-2026-08-18-entity-type-registry" / 792db56d, world-graph) · Hygiene census (plan "BB-2026-08-18-graph-hygiene-workflow", world-graph) · Census fixes (plan 9ae797c7, world-graph) · Supersede check (next_move WG-019, world-graph)
  - **L1 Intake:** Email watcher (manual, done, sub "live") · YouTube conduit (next_move WG-045, world-graph, waiting_on_charles) · Paid sources (plan c58865b5, subscription-content — verify slug via list_projects at build time) · Free feeds (plan a584a5c3, platform-program, sub "slot 3") · IG + X (manual, not-yet-scoped, sub "slot 4")
  - **L0 Operations:** CI self-repair (manual, done, sub "live") · Courier fix (decision PP-006, platform-program) · 2nd-opinion wiring (decision A-067, agent-build-out) · Create Routine (next_move PP-012, platform-program, waiting_on_charles) · Verify Routine (next_move PP-013, platform-program) · Key cap (manual, waiting-on-you, sub "email watcher")
  - **Decision queue:** D1 resolved · D2 dissolved · D3 resolved · D4 open · D5 open · D6 gate · D7 open · D8 resolved

## Acceptance criteria

1. Opening the Build Map tab answers "what's done / where am I / what's next / what's waiting on me" in under five seconds, with zero prose reading.
2. A status change anywhere (e.g., the census-fixes plan → succeeded) recolors its dot on next load/refresh with no edit to the map.
3. Steps waiting on Charles are visually unmistakable (red dashed) and counted in the summary strip.
4. Adding a step to the map = one edit to the skeleton plan; zero code changes.
5. The tab is program-level: all five layers plus the D1–D8 queue.

## Decision domains (completeness framework, all eleven)

Authority: **Answered** — full autonomy; hard gates only (none expected). Data contract: **Answered** — skeleton format above. UI/UX: **Answered** — approved mock. Hosting/deploy: **Answered** — same file, same Vercel project, $0. Security: **Defaulted** — existing token auth unchanged; escapeHtml on all new rendered strings. Testing: **Answered** — step 5 smoke test. Rollback: **Defaulted** — git revert of a single file. Cost: **Answered** — $0. Dependencies: **Answered** — none upstream; all inputs live. Observability: **Defaulted** — resolution failures degrade to gray-with-tooltip, console errors otherwise. Docs: **Answered** — roadmap operating-model line (Scope item 4). None silent.

## Pasteable prompt

> Execute Build Brief BB-2026-08-21-build-map-tab. Pull the plan from Project State (plan_id 71adb7c8-8f8b-4bf9-bdd5-053c21ff4e06, project context-database, status queued — set it to running when you claim it). Git copy at Chooch333/project-state-mcp/docs/design/BB-2026-08-21-build-map-tab.md. No upstream dependencies. Follow the brief's fork-handling rules: answer forks autonomously with judgment-call tags; escalate only at hard gates (none in this brief). Reconcile the 23-step seed's evidence pointers against live Project State before writing the skeleton — the DB is truth, the seed is a snapshot.