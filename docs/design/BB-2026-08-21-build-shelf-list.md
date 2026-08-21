# Build Brief — BB-2026-08-21-build-shelf-list

**Git home:** Chooch333/project-state-mcp · `docs/design/BB-2026-08-21-build-shelf-list.md`
**Project State plan:** `99cd9231-1d6c-4fc2-b524-eefc92cc1f96` on `context-database`

**What this is:** A "Build shelf" list on the Project State dashboard — every Build Brief in the work queue, grouped Next up / In flight / Blocked, with plain-language titles, project chips, and age stamps. Statuses resolved live on every load. Placement (Charles-approved 2026-08-21): a section on the Build Map tab, directly below the map.

**What I'll do (receiving chat):** Add the shelf list to dashboard.html per the approved mock; no server changes.

**What you'll do (Charles):** Nothing during execution. No hard gates.

---

## Current state going in

- The shelf, verified live 2026-08-21 by listing plans on every project that has them: 1 queued BB (BB-2026-08-21-youtube-rss-discovery, world-graph — queued same day by a parallel chat), 3 running (build-map-tab, claimed within minutes of shelving; graphiti-pilot, 7 days; attia-intake, 38 days — the shelf view's first catch), 1 blocked (youtube-transcript-conduit, on WG-045 PC relay).
- [verified] Two `queued` plans are NOT builds: Master Roadmap and Intake Source Parking Lot (platform-program) — deliberately parked reference documents. **Shelf filter: status ∈ {queued, running, blocked} AND (title starts with "BB-" OR tags include "build-brief").** All 14 build-brief plans inspected in the authoring session follow the BB- title convention; the two data docs don't. [Claude-per-doctrine] The data docs keep their `queued` status — filtering beats re-statusing a load-bearing convention.
- [verified] Data path: the page already has `callMcp`; shelf needs `list_projects` then `list_plans` per project (parallel, cached per load, shared with the Build Map tab's fetches). ~14 light calls per load — acceptable for a personal dashboard; no server change.
- **Upstream dependency:** BB-2026-08-21-build-map-tab (plan `71adb7c8-8f8b-4bf9-bdd5-053c21ff4e06`, context-database) was RUNNING at authoring time and edits the same file. This build must not start until that plan is terminal.

## Receiving chat

New autonomous build chat, after build-map-tab completes.

## Scope

**In scope:** Shelf list rendered per the approved mock — three groups (Next up = queued oldest-first with a "next up" badge on the oldest; In flight = running with age, amber emphasis past 14 days; Blocked = with reason line pulled from executor_report, red "waiting on you" badge when the reason names Charles); one row per brief: BB id (mono chip), plain title (text after the em-dash), project chip, age; count strip in the header; mounted on the Build Map tab directly below the map; shares that tab's 60s refresh.

**Out of scope (forks pre-answered):** separate tab (placement resolved: Build Map tab section) · re-statusing the two queued data documents (filter handles them) · server/API changes · editing plans from the page · showing succeeded/abandoned history (the per-project Plans tab already covers history).

## Directive

1. Verify upstream: `Project State:get_plan` plan_id 71adb7c8-8f8b-4bf9-bdd5-053c21ff4e06 — if status is not `succeeded`, set THIS plan `blocked` with an executor_report naming the dependency and stop; re-queue when clear.
2. `Custom GitHub:get_file_contents` owner=Chooch333 repo=project-state-mcp path=public/dashboard.html — read the current file (it will contain the Build Map tab by then).
3. `Custom GitHub:replace_in_file`: add `renderShelf()` — `list_projects`, then parallel `list_plans` per project (Promise.all, cached per load, reuse the Build Map's per-load cache where present); filter per the shelf rule; group and render per mock using the file's existing palette variables and escapeHtml on every rendered string; blocked-reason line = first sentence of executor_report; "waiting on you" badge when that text matches /charles|only he|web-ui|credential/i, else a neutral blocked badge. Mount below the Build Map on the buildmap tab; hook into its refresh interval.
4. Re-read the committed file; confirm edits landed (write-before-done).
5. Smoke test: confirm whatever is live-queued renders under Next up (DB is truth — the authoring-time snapshot above is illustration only) and the two platform-program data docs do NOT render.
6. Close: Session Log on `context-database` referencing this Brief ID; `update_plan_status` this plan → succeeded; disclosures via `post_judgment_call` bound to this plan_id.

## Inputs

- Approved mock (DA chat 2026-08-21) — the visual contract: card header with count strip ("N queued · N in flight · N blocked"); group headers with muted explainers; rows of mono id chip + title + project pill + age.
- public/dashboard.html [verified] — Chooch333/project-state-mcp.
- MCP tools list_projects / list_plans [verified sufficient — no server change].

## Acceptance criteria

1. The shelf answers "what's queued, what's being built, what's stuck" in one glance, plain language, no prose reading.
2. Queuing or claiming a brief anywhere changes the list on next load/refresh with zero manual upkeep.
3. Reference documents parked in `queued` never appear.
4. In-flight builds older than 14 days are visually flagged.
5. Blocked builds show why, and "waiting on you" is unmistakable.

## Decision domains (all eleven)

Authority: **Answered** — full autonomy, no hard gates. Data contract: **Answered** — shelf filter rule. UI/UX: **Answered** — approved mock + placement (Build Map tab section). Hosting/deploy: **Answered** — same file, same Vercel project, $0. Security: **Defaulted** — escapeHtml on all new strings, auth unchanged. Testing: **Answered** — step 5 smoke test. Rollback: **Defaulted** — git revert of a single file. Cost: **Answered** — $0. Dependencies: **Answered** — build-map-tab must be terminal; step 1 enforces. Observability: **Defaulted** — fetch failures render an inline error row, never a blank card. Docs: **N-A** — no convention changes. None silent.

## Pasteable prompt

> Execute Build Brief BB-2026-08-21-build-shelf-list. Pull the plan from Project State (plan_id 99cd9231-1d6c-4fc2-b524-eefc92cc1f96, project context-database, status queued — set it to running when you claim it). Git copy at Chooch333/project-state-mcp/docs/design/BB-2026-08-21-build-shelf-list.md. Upstream dependency BB-2026-08-21-build-map-tab (plan 71adb7c8-8f8b-4bf9-bdd5-053c21ff4e06) must be succeeded before you edit dashboard.html — if it isn't, set this plan blocked and stop. Follow the brief's fork-handling rules: answer forks autonomously with judgment-call tags; escalate only at hard gates (none in this brief).