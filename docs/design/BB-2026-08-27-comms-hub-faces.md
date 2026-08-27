# Build Brief — BB-2026-08-27-comms-hub-faces
**Git home:** Chooch333/project-state-mcp · `docs/design/BB-2026-08-27-comms-hub-faces.md`
**Project State plan:** `1b0627ed-17e3-4515-851d-e1bd5fa7a90b` on `context-database`

**What this is:** Rebuild the dashboard's human surface on the new label layer: the Build Shelf upgraded in place with plain names and campaign grouping, the Build Map redrawn as campaign lanes with every node tied to its build, a new Notes Board tab, and the chat-facing project tabs folded into a Machine room. Part 2 of 2; depends on BB-2026-08-27-comms-hub-plumbing.

**What I'll do:** Ship all four surfaces in `public/dashboard.html`, restructure the Build Map skeleton doc to milestones-only, verify against live data, close per the closing rule.

**What you'll do:** Nothing during the build. Afterward: open the board and read it — your reading is the real acceptance test.

---

## Current state going in

**[verified 2026-08-27]** `public/dashboard.html` (repo `Chooch333/project-state-mcp`, sha 3ba9909c) has a Program tab group (Build Map, Build Shelf) and per-project tabs, 60s refresh via `programTabInterval`, a shared `sweepAllProjectPlans()` helper, and `findBlockedReasonSentence()` scraping blocked reasons from executor reports. The Build Map tab renders from a hand-maintained skeleton doc (plan `076b64ca…`, platform-program) whose nodes carry cryptic labels and raw ID pointers. After the plumbing build **[dependency]**, plans carry plain_title / plain_summary / campaign_id / designed_in / review fields, disclosures carry plain_summary + action_needed, and a campaigns table exists.

## Receiving chat

New build chat. **Verify the plumbing plan (`2e6c19f1…`) shows `succeeded` before starting; if not, halt and set this plan `blocked` naming it.**

## Scope

**In scope (effort M–L, real-money cost: none):** all in `public/dashboard.html` unless noted.

1. **Shelf v2 — upgrade in place** (the Build Shelf tab stays; queue mechanics untouched):
   - Cards grouped by campaign (campaign title + purpose as group headers, sort_order order; a final group for plans with no campaign, headed "Not yet filed").
   - Each card: **plain_title** (fallback: "*(needs a name)*" + the plan's real title in fine print); stage in plain words — `draft` "Being designed" · `queued` "Ready to build" · `running` "Building" · `succeeded`+unreviewed "Done — awaiting design check" · `succeeded`+reviewed "Done ✓ checked {date}" · `failed` "Stuck — failed" · `blocked` "Stuck — waiting" · `abandoned` "Shelved for good"; the one-line plain_summary; "Designed in: {designed_in}" when present; for stuck cards, the plain_summary of the newest Comms Table note bound to the plan, else the existing `findBlockedReasonSentence()` fallback; BB filing code in fine print.
   - The **naming legend** paragraph (text now canonical in PROTOCOL.md, per the plumbing build) rendered once at the top of the Shelf.
2. **Map v2 — campaign lanes:**
   - One lane per `active` campaign, ordered by sort_order; lane header = campaign title + purpose.
   - Nodes = that campaign's plans, ordered by created_at, colored by the same stage words, labeled by plain_title (same "(needs a name)" fallback, flagged visibly, never hidden); click scrolls/switches to the build's Shelf card.
   - **Milestones:** restructure the skeleton doc (plan `076b64ca…`, `update_plan_content`) to campaign-keyed *milestone entries only* — non-build steps like "PC relay installed on the home computer", each with a plain label, a one-liner, and optionally one live evidence pointer (next_move / decision ref) for status. All build steps are dropped from the skeleton — build nodes now come straight from the database (derived, never copied). Milestones missing a plain label render with a red "needs a label" flag.
   - Platform layer (Intake / Understanding / Memory / Expression / Operations) appears only as a small badge on lanes where it's knowable; it is not the structure.
3. **Notes Board — new tab in the Program group:**
   - Three sections: **Needs you** (Comms Table rows status `open`/`discussing`, plus disclosures flagged `needs-charles` still `noted`); **Waiting for a design check** (disclosures flagged `needs-design-check` still `noted`, plus succeeded-unreviewed plans); **FYI** (`fyi` disclosures still `noted`).
   - Every row: the plain_summary (fallback: title + "*(not yet in plain words)*"), its campaign, its build's plain_title, date. Grouped by campaign inside each section.
   - **"May be outdated" badge, computed at render, never stored:** a still-`noted` disclosure whose bound plan is `abandoned`, or `succeeded` *and already reviewed*, gets the badge "from a finished build — may be outdated". Notes on succeeded-but-unreviewed builds get no badge — they are the review queue itself.
4. **Machine room:** the per-project tab group (Overview, Decisions, Assumptions, Plans, Notes, Lessons) is relabeled "Machine room — the chats' working views" and collapsed behind one toggle by default. Nothing inside changes.
5. 60s Program refresh covers the Notes Board; fresh-browser/no-project-selected case works on every Program tab (guard shipped in f02d71ae — do not regress it).

**Out of scope:** any MCP/server/schema change (all shipped by plumbing); the Nudge List; queue mechanics, lifecycle states, BB filing codes; cbrain-ui.

## Directive

1. Claim the plan (`update_plan_status` → running) after verifying the plumbing dependency succeeded (`get_plan` on `2e6c19f1…`).
2. Read the live dashboard.html from GitHub (never from memory of this brief); reconcile against live schema (Supabase `execute_sql`) before writing a line.
3. Ship Scope 1–5 as surgical commits to `Chooch333/project-state-mcp`; re-read every commit.
4. Restructure the skeleton doc per Scope 2 (`update_plan_content`, change_reason naming this brief).
5. Verify: Vercel deploy READY; fetch the live page and confirm the tab set ("Build Map, Build Shelf, Notes Board, Machine room…"); trace at least one real plan per stage word from database → rendered card by hand; trace one disclosure per Notes Board section; confirm the outdated-badge logic against a real closed-build disclosure (CD-J-006 or CD-J-007 qualify — both reviewed on a succeeded plan). If the sandbox blocks live-page fetch, substitute source-level verification and disclose it (precedent CD-J-007).
6. Close per the closing rule; set `succeeded`.

## Inputs

- Everything the plumbing build ships **[dependency — verify at claim]**
- `public/dashboard.html` current structure and helpers **[verified via executor reports of 71adb7c8 / 99cd9231 / f02d71ae + repo sha match]**
- Skeleton doc plan `076b64ca…` current JSON shape **[verified — read this session]**
- Live Comms Table contents for badge testing **[verified — read this session]**

## Acceptance criteria

1. Charles opens the board cold and can say, for every active build: what it is, its stage, its campaign — no IDs needed.
2. Every Map node shows a plain title or a visible "(needs a name)" flag; one click reaches its Shelf card.
3. Every Notes Board row reads as one plain sentence in the right section; a closed-build disclosure shows the outdated badge; a succeeded-unreviewed build appears under "Waiting for a design check".
4. Succeeded builds display "awaiting design check" vs "✓ checked {date}" correctly against live review fields.
5. The Shelf still shows the identical queue set (queued/running/blocked plans) it showed before — grouping changed, contents didn't.
6. No regression of the no-project-selected guard or the 60s refresh.

## Assumptions

- None. Everything here is checkable at build time.

## Design intent narrative

The board is for Charles's eyes; the database stays for the chats. Protect three qualities in every fork: **plain words beat clever structure** (when a label choice is close, pick the one Charles would say out loud); **derived, never copied** (compute badges and stages at render; store nothing the database already implies); **nothing hidden** (missing names get flags, not filtering — an ugly board that tells the truth beats a clean board that omits). Campaigns are fluid working labels — render whatever the table says today, assume it changes tomorrow. The Shelf is beloved: upgrade it in place, never replace or rename it.

## Eleven-domain status

| Domain | State | Where |
|---|---|---|
| 1 Purpose & users | Answered (Charles, daily, phone + desktop browser) | What this is / Intent |
| 2 Acceptance criteria | Answered | §Acceptance |
| 3 Runtime & execution | Defaulted (static dashboard.html on existing Vercel deploy) | §Current state |
| 4 Data — schema | N/A (consumes plumbing's schema; creates none) | §Scope |
| 5 Data — storage & recall | Answered (reads Supabase via existing dashboard data path; skeleton doc holds milestones only) | §Scope 2 |
| 6 Interconnectivity | Answered (reads plans/campaigns/Comms Table; writes only dashboard.html + skeleton doc) | §Directive |
| 7 Access & hard gates | Answered (one repo file + one plan doc; hard gates: none) | §Directive |
| 8 Skills & tools | Answered (GitHub MCP, Supabase MCP, Vercel MCP, Project State per step) | §Directive |
| 9 Sequence & dependencies | Answered (blocked-halt rule on plumbing) | §Receiving chat |
| 10 Assumptions & risks | Answered (none unverifiable; sandbox-fetch risk pre-answered with substitution rule) | §Directive 5 |
| 11 Design intent | Answered | §Intent |

## Pasteable prompt

> Execute Build Brief BB-2026-08-27-comms-hub-faces. Pull the plan from Project State (plan_id 1b0627ed-17e3-4515-851d-e1bd5fa7a90b, project context-database, status queued — set it to running when you claim it). Git copy at Chooch333/project-state-mcp/docs/design/BB-2026-08-27-comms-hub-faces.md. Upstream dependency BB-2026-08-27-comms-hub-plumbing (plan 2e6c19f1-c8b5-4b53-a555-315982394ea5) must show succeeded before you start — if it doesn't, set this plan blocked naming it and stop. Follow the brief's fork-handling rules: answer forks autonomously with judgment-call tags; escalate only at hard gates (none in this brief). Plain words beat clever structure; missing names get flags, never filtering.
