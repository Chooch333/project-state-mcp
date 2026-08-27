# Build Brief — BB-2026-08-27-comms-hub-plumbing
**Git home:** Chooch333/project-state-mcp · `docs/design/BB-2026-08-27-comms-hub-plumbing.md`
**Project State plan:** `2e6c19f1-c8b5-4b53-a555-315982394ea5` on `context-database`

**What this is:** Give every build and every loose-end note a human label layer — plain title, one-liner, campaign, design-source, review record — enforced softly (warn, never block), plus the rule-book changes that make chats use it. Part 1 of 2; the dashboard rebuild (BB-2026-08-27-comms-hub-faces) sits on top of this.

**What I'll do:** Ship the database migration, the MCP tool extensions and new tools, a one-time labeling pass over all 43 existing plans, and the PROTOCOL.md + skill edits. Close with executor report, fork log, and disclosures (dogfooding the new plain-sentence rule).

**What you'll do:** Nothing. No hard gates in this build.

---

## Current state going in

**[verified 2026-08-27, live reads]** 43 plans across 17 projects on Supabase `ujditldbqdiqigazkcak`. `plans` has no plain-title, campaign, design-source, or review fields; `build_questions` has no plain-summary or action flag. Grouping rides loose tags. The Comms Table works (29 disclosures, 25 reviewed) — the gaps are language, routing discipline, staleness, and review, not the channel. Dashboard.html (sha 3ba9909c) already splits Program/Project tabs. Charles has ruled: **no plain-English rubric, no hard validation, and nothing lands nameless** — a build must never fight to get on the board, but every chat always takes its best shot at a plain name at creation; a nameless landing is a chat defect for chats to fix, never a naming task for Charles; bad names are fixed by renaming.

## Receiving chat

New build chat (orchestrator pulls oldest queued on `context-database` — this brief first, faces second).

## Scope

**In scope (effort M, real-money cost: none):**

1. **Schema migration** — Supabase MCP `apply_migration` on `ujditldbqdiqigazkcak`:
   - New table `campaigns`: `id uuid pk default gen_random_uuid()`, `slug text unique not null`, `title text not null`, `purpose text`, `sort_order int default 100`, `status text not null default 'active' check (status in ('active','done','parked'))`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`.
   - `plans` add: `plain_title text`, `plain_summary text`, `campaign_id uuid references campaigns(id)`, `designed_in text`, `reviewed_at timestamptz`, `reviewed_by text`, `review_notes text`.
   - `build_questions` add: `plain_summary text`, `action_needed text check (action_needed in ('needs-charles','needs-design-check','fyi'))`.
2. **MCP server extensions** (repo `Chooch333/project-state-mcp`, `api/` + `lib/`, GitHub MCP for commits):
   - `write_plan` / `update_plan_content`: accept optional `plain_title`, `plain_summary`, `campaign` (slug), `designed_in`. If a plan tagged `build-brief` lands without `plain_title` or `campaign`, the tool **succeeds and returns a warning line addressed to the writing chat** ("unnamed builds show as *(needs a name)* on the board — add your best-shot plain name now via `update_plan_labels`"). Never reject — the warning is an instruction to the chat, not a note for Charles.
   - `post_judgment_call`: accept optional `plain_summary` (one sentence for Charles) and `action_needed`; missing values default `action_needed` to `fyi` and return the same style of warning instructing the chat to supply its best-shot sentence. Never reject.
   - New tools: `list_campaigns`; `create_campaign` (slug, title, purpose, sort_order?); `update_campaign` (retitle / repurpose / re-order / park / mark done); `update_plan_labels` (any of plain_title, plain_summary, campaign slug, designed_in on an existing plan — this is both the rename tool and the recategorize tool); `review_plan` (sets reviewed_at/reviewed_by/review_notes; valid only on `succeeded` plans, returns an error otherwise).
   - Tool descriptions state the fluidity rule: campaigns are DA-chat authority — rename, recategorize, fork a new campaign out of an existing one freely, logged as judgment calls; Charles is never asked.
3. **One-time labeling pass** — via the new tools (fall back to direct SQL only if a tool misbehaves; re-read after):
   - Create nine campaigns: `youtube-intake` "YouTube intake — get transcripts of videos Charles taps (and followed channels) into the brain" · `email-intake` "Email intake — forwarded emails become brain entries, no human gate" · `paid-content-intake` "Paid-content intake — pull paid subscriptions (Attia first) into the brain" · `librarian` "The Librarian — the knowledge graph that understands and organizes what comes in" · `command-hub` "Command Hub — the board Charles runs everything from" · `crew` "The Crew — self-running build/repair agents and their rails" · `picture-maker` "Picture Maker — image generation for any project that needs art" · `cbrain-site` "cbrain site — the website for browsing the brain" · `side-projects` "Side projects — Family Trip App, Elliott's math game, Dislocation Scanner".
   - Assign every existing plan a campaign by its project + content: world-graph YouTube/RSS/relay plans → youtube-intake; world-graph Graphiti/registry/hygiene/pilot plans → librarian; email-interface-build → email-intake; paywall-mcp + health-intake → paid-content-intake; context-database + chat-protocol → command-hub; agent-build-out → crew; image-gen-mcp → picture-maker; cbrain → cbrain-site; family-trip-app, dislocation-scanner, and any stray personal-app plans → side-projects; platform-program plans → command-hub (they steer the program Charles reads from the board). Ambiguous cases: decide, log in the fork log.
   - Write `plain_title` + `plain_summary` for **all 43 plans — zero exceptions; nothing may leave this pass nameless**. No rubric, by Charles's order. The only instruction: one line you would say out loud to Charles — no filing codes, no display IDs, no tool names unless the tool is the point. When torn, plainer wins. Example: *"BB-2026-08-27-rss-discovery-relocation — … closes WG-061, unblocks WG-055"* becomes plain_title *"Move channel-watching onto the home PC"*, plain_summary *"The cloud job that watches your followed YouTube channels kept failing silently; this moves it to the home relay and makes failures loud."* Set `designed_in` where the plan's source/provenance names a session; otherwise leave empty.
4. **Rule-book edits** (GitHub MCP `replace_in_file` / `create_or_update_file`; re-read every file after writing):
   - `Chooch333/chat-protocol` → `PROTOCOL.md`: add (a) **the closing rule** — a build chat's final chat message may only say the build is done and everything else is on the Board; every judgment call, loose end, follow-up, or FYI goes to the Comms Table with a `plain_summary` and `action_needed` flag, never into chat text; (b) **the review rule** — a plan that reaches `succeeded` is *unchecked* until a DA/planning chat audits it (verify executor claims against live code/data, dispose its disclosures, and fill or fix any missing or weak plain labels — nameless items get named here at the latest, never by Charles) and calls `review_plan`; DA chats pull succeeded-unreviewed plans at session start alongside the disclosure inbox; (c) **campaigns and the naming rule** — campaign definition, the label fields, DA-chat fluidity authority, and the naming rule: every chat that creates a plan or files a note writes its best-shot plain name / plain sentence **at creation, every time** — there is no tool gate, but naming is mandatory chat behavior; "(needs a name)" on the board is a chat defect, fixed by the next chat that touches the item, and Charles is never the one who generates a name; (d) a one-paragraph **naming legend** (builds carry a BB filing code for the chats' cross-referencing; Charles never needs it; plain titles are the human names) marked as the text the dashboard displays.
   - `Chooch333/agent-library` → `roles/design-assist/SKILL.md`: Step 1 intake adds pulling succeeded-unreviewed plans as the audit list next to the disclosure inbox (label-filling included); Step 10 shelving adds setting plain_title, plain_summary, campaign, designed_in (session name + date). Changelog entry, version bump.
   - `Chooch333/agent-library` → `skills/orchestrate-build/SKILL.md` and `skills/execute-build-task/SKILL.md`: closing rule + every plan or disclosure a build creates carries its best-shot plain_title/plain_summary and action_needed **at creation** — never left blank for someone else to fill. Changelog entries.

**Out of scope:** the dashboard itself (next brief); the Nudge List system; any change to plan lifecycle states, the shelf-queue mechanics, or BB filing codes — all stay exactly as they are; hard validation or naming rubrics (explicitly rejected by Charles).

## Directive

1. Read this brief's plan row and set status `running` (Project State `update_plan_status`). Reconcile against live schema before migrating (Supabase `execute_sql` on information_schema) — if any column already exists, skip it and log.
2. Apply the migration (Supabase `apply_migration`, name `comms_hub_labels`). Verify by re-querying information_schema.
3. Extend the MCP server per Scope 2; commit to `Chooch333/project-state-mcp`; re-read every committed file; verify the Vercel deploy is READY (Vercel MCP) and round-trip each new/changed tool against live data (create a `smoke-test` campaign, label a real plan, un-label, delete the smoke campaign).
4. Run the labeling pass per Scope 3. Verify with one SQL sweep: zero plans with null `campaign_id` AND zero plans with null `plain_title` — this pass has no permitted exceptions.
5. Make the rule-book edits per Scope 4; re-read each file after commit.
6. Dogfood: close this build per the new closing rule — disclosures with plain sentences, fork log, executor report; set plan `succeeded`.

## Inputs

- Supabase project `ujditldbqdiqigazkcak`, tables `plans`, `build_questions`, `projects` **[verified — live schema read 2026-08-27]**
- Repo `Chooch333/project-state-mcp` (`api/`, `lib/`, root sha listing read) **[verified]**
- `PROTOCOL.md` sha `1a85e0ed…` **[verified]**; DA `SKILL.md` v0.2.7 sha `4b907f05…` **[verified]**; `skills/orchestrate-build/` and `skills/execute-build-task/` exist **[verified — directory listing]**
- The 43-plan inventory with projects and statuses **[verified — full SQL read this session]**

## Acceptance criteria

1. Campaigns table live with the nine campaigns; every one of the 43 plans has a campaign; a SQL sweep shows it.
2. Every plan has a plain_title — zero nulls after the labeling pass, no exceptions.
3. Shelving a test plan without labels succeeds and returns the chat-directed warning — proven by doing it once, showing the response, then labeling it.
4. Each new tool round-trips against live data.
5. All four rule-book files re-read post-commit and contain the new rules, including the naming rule (best-shot names at creation, mandatory behavior, no tool gate, Charles never names).
6. This build's own close obeys the closing rule (its disclosures all carry plain sentences and flags).

## Assumptions

- Build chats will follow the closing rule and naming rule once the skills carry them — confirmable only by observing the next builds (the faces brief's acceptance re-checks it).

## Design intent narrative

This exists because Charles cannot read his own command center. The prime quality to protect: **nothing ever fights its way onto the board, and nothing lands nameless** — soft warnings, never rejections, no naming rubric, but every chat always takes its best shot at a plain name at creation; a wrong name is cheap to fix by renaming, a blocked write is not, and Charles never generates names — at most he corrects one he dislikes. Second quality: **derived, never copied** — never store anything the board can compute at read time. Campaigns are working labels, not architecture: keep them fluid, cheap to rename, cheap to fork; when torn between a clever taxonomy and the words Charles already uses, use his words. When a fork appears, choose the option that keeps chats autonomous and Charles out of the loop, and log it.

## Eleven-domain status

| Domain | State | Where |
|---|---|---|
| 1 Purpose & users | Answered (personal daily-use; Charles reads, chats write) | What this is / Intent |
| 2 Acceptance criteria | Answered | §Acceptance |
| 3 Runtime & execution | Defaulted (existing Vercel + Supabase stack, repo conventions) | §Directive |
| 4 Data — schema | Answered | §Scope 1 |
| 5 Data — storage & recall | Answered (Supabase tables; exact lookup + existing dashboards) | §Scope 1 |
| 6 Interconnectivity | Answered (Supabase MCP, GitHub MCP, Vercel deploy; boundaries named per step) | §Directive |
| 7 Access & hard gates | Answered (repos/tables named; hard gates: none) | §Scope / §Directive |
| 8 Skills & tools | Answered (each step names its MCP) | §Directive |
| 9 Sequence & dependencies | Answered (migration → server → labels → rule-book; no upstream) | §Directive |
| 10 Assumptions & risks | Answered | §Assumptions |
| 11 Design intent | Answered | §Intent |

## Pasteable prompt

> Execute Build Brief BB-2026-08-27-comms-hub-plumbing. Pull the plan from Project State (plan_id 2e6c19f1-c8b5-4b53-a555-315982394ea5, project context-database, status queued — set it to running when you claim it). Git copy at Chooch333/project-state-mcp/docs/design/BB-2026-08-27-comms-hub-plumbing.md. No upstream dependencies. Follow the brief's fork-handling rules: answer forks autonomously with judgment-call tags; escalate only at hard gates (none in this brief). Soft enforcement is a design requirement — never make labels mandatory at write time — but every plan and note you create gets your best-shot plain name at creation; nothing lands nameless.
