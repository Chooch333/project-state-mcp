# Build Brief — BB-2026-08-21-program-section

**Git home:** Chooch333/project-state-mcp · `docs/design/BB-2026-08-21-program-section.md`
**Project State plan:** `f02d71ae-9ef7-4d44-8471-4fb8f9c61bd3` on `context-database`

**What this is:** A change order to the shipped dashboard: split the tab row into a **Program** section (non-project tabs: Build Map, Build Shelf) and a **Project** section (everything else), move the Build shelf out of the Build Map tab into its own tab in the Program section, and fix the blocked-badge logic that CD-J-004 proved misfires. Charles-directed 2026-08-21: "Make the build shelf a separate tab… Is there a non-project section of the dashboard? The build shelf should be there." No non-project section existed [verified by full file read]; this creates it.

**What I'll do (receiving chat):** Restructure the tab row, relocate the shelf, fix the badge logic, verify, close.

**What you'll do (Charles):** Nothing during execution. No hard gates.

---

## Current state going in [all verified 2026-08-21 by full read of public/dashboard.html, sha 8501a6b]

- One tab row, no grouping: Overview · Build Map · Decisions · Assumptions · Plans · Notes · Lessons · About. Project selector always visible in the header, even on Build Map (which ignores it — it's program-level). About is also project-independent (renders an embedded doc).
- The shelf (BB-2026-08-21-build-shelf-list, succeeded 19:49) renders inside `#buildmap-content`, below the lane map. `loadBuildMapTab()` does one shared sweep — `list_projects` + `list_plans` per project (`plansCache`) — feeding both the lane map's plan-evidence resolution and `renderShelfSection(plansCache)`. Blocked rows each get one scoped `get_plan` for `executor_report` (CD-J-005).
- `loadCurrentTab()` guard is `if (!currentProject && currentTab !== 'about') return;` — program tabs currently depend on a project being selected even though they don't use it.
- Auto-refresh: `buildMapInterval`, 60s, active only while `currentTab === 'buildmap'`.
- **Known defect to fix (CD-J-004, evidence attached to that disclosure):** blocked-reason line and "waiting on you" badge use only the FIRST sentence of executor_report. Against the two real blocked briefs today: BB-2026-08-18-second-opinion-routine badges waiting-on-you off a generic first sentence ("…Charles out of the loop…") while the real reason (Routine creation is web-UI/CLI-only) sits later; BB-2026-08-20-youtube-transcript-conduit badges neutral because its first sentence is a staleness note, though it genuinely waits on Charles (WG-045 PC relay, tagged hard-gate).

## Receiving chat
New autonomous build chat. No upstream dependency — no other build touches dashboard.html right now [verified: no queued/running BB targets this file].

## Scope

**In scope:**
1. **Tab-row split.** Order: small muted uppercase caption "Program" · Build Map · Build Shelf · thin vertical divider · caption "Project" · Overview · Decisions · Assumptions · Plans · Notes · Lessons · About. Captions ~11px, `--text-subtle`, non-clickable. (About stays at the end of the Project group — it's documentation, not program state; moving it is churn. [Claude-per-doctrine])
2. **Build Shelf tab.** New `buildshelf-tab` panel + `loadBuildShelfTab()`. Extract the sweep (`list_projects` + per-project `list_plans`) into a shared helper both program tabs call; `renderShelfSection` moves to the new tab essentially as-is; the Build Map tab drops the shelf mount and keeps everything else unchanged.
3. **Non-project behavior.** Project selector hidden while a Program tab is active (preserve header layout — visibility, not removal), restored on Project tabs. `loadCurrentTab()` guard updated so Program tabs and About render with no project selected.
4. **Refresh.** Generalize the 60s interval to whichever Program tab is active (clear on leave), same mechanism as today.
5. **Badge/reason fix (closes CD-J-004).** Scan the FULL executor_report, not the first sentence. The reason line shown must be the sentence that actually states the block. Exact extraction rule is the build chat's call (post a judgment call naming it) — but it must pass the two live test cases in Acceptance 3.

**Out of scope:** any change to Project-tab rendering · server/API changes · map skeleton changes · new shelf groups or columns · editing from the page.

## Directive

1. `Custom GitHub:get_file_contents` owner=Chooch333 repo=project-state-mcp path=public/dashboard.html — read current file first; anchor strings below must be re-verified against it.
2. `Custom GitHub:replace_in_file`, surgical, in this order: (a) nav markup per Scope 1 (Build Map button moves from its current slot into the Program group); (b) new panel div; (c) shared sweep helper + `loadBuildShelfTab()`; (d) remove shelf mount from `loadBuildMapTab()` (delete the `renderShelfSection` call and shelf-specific comment block there — keep the shared cache); (e) badge/reason fix inside `renderShelfSection`; (f) tab routing: `buildshelf` case, generalized interval, selector visibility toggle, updated guard.
3. Re-read the committed file after each commit; confirm every edit (write-before-done).
4. Smoke test against live data: Build Shelf tab renders the real queue; Build Map tab no longer contains the shelf; project tabs unchanged; page works with localStorage project cleared (fresh-browser case) when landing on a Program tab.
5. Close: Session Log on `context-database`; `update_plan_status` → succeeded; judgment calls via `post_judgment_call` bound to this plan_id (the badge-rule call at minimum).

## Inputs
- Live file: Chooch333/project-state-mcp `public/dashboard.html` (sha 8501a6b at authoring) — full structure verified, summarized in Current state.
- CD-J-004 disclosure on context-database — the two-test-case evidence for the badge fix.
- Existing CSS variables and `.tab-btn` / `.badge` / `.tag` classes — reuse; escapeHtml on all new strings (D-026 discipline).

## Acceptance criteria
1. Build Shelf is its own tab; the Build Map tab shows the map, legend, and decision queue only.
2. The tab row visibly reads as two groups (Program | Project); the project picker vanishes on Program tabs and returns on Project tabs; Program tabs render even when no project is selected.
3. Both briefs blocked in the database today render **waiting on you** with a reason line naming the actual need — the Routine-creation step for second-opinion-routine, the WG-045 PC-relay install for youtube-transcript-conduit — not a generic or staleness sentence. (If either has changed status by build time, reconstruct the case from CD-J-004's quoted text and verify the logic against it directly.)
4. Shelf behavior otherwise unchanged: live resolve, data-doc exclusion, stale flag, 60s refresh while active.
5. No regression on any Project tab.

## Decision domains (all eleven)
Authority: **Answered** — full autonomy, no hard gates; badge extraction rule delegated with acceptance tests. Data contract: **Answered** — no schema changes; same sweep. UI/UX: **Answered** — Scope 1 layout; shelf visuals unchanged. Hosting: **Answered** — same file, $0. Security: **Defaulted** — escapeHtml, auth unchanged. Testing: **Answered** — step 4 + Acceptance 3 live cases. Rollback: **Defaulted** — git revert. Cost: **Answered** — $0. Dependencies: **Answered** — none; file uncontended [verified]. Observability: **Defaulted** — existing error rows. Docs: **N-A**. None silent.

## Pasteable prompt
> Execute Build Brief BB-2026-08-21-program-section. Pull the plan from Project State (plan_id f02d71ae-9ef7-4d44-8471-4fb8f9c61bd3, project context-database, status queued — set it to running when you claim it). Git copy at Chooch333/project-state-mcp/docs/design/BB-2026-08-21-program-section.md. No upstream dependencies. Follow the brief's fork-handling rules: answer forks autonomously with judgment-call tags; escalate only at hard gates (none in this brief). Re-verify all anchor strings against the live file before editing — the DB and the live file are truth, the brief's snapshot is authoring-time.