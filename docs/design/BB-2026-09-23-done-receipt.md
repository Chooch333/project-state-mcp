# Build Brief — BB-2026-09-23-done-receipt
**Git home:** Chooch333/project-state-mcp · `docs/design/BB-2026-09-23-done-receipt.md`
**Project State plan:** `4e1ea505-2ce6-4e31-bd32-a6c189697831` on `agent-build-out`
**Build:** unnumbered
**skills:** orchestrate-build v1.2 (this build upgrades it to v1.3), execute-build-task v1.1
**Origin:** ADV-034 (Stack Advisor, P-0060) — adopting narrower

**What this is:** A database-enforced receipt for marking a Project State plan `succeeded`, plus the skill and protocol updates that tell builds how to fill it in.

**What I'll do:** Add the gate to the Project State database, teach `update_plan_status` to carry the receipt, update orchestrate-build (v1.3), PROTOCOL.md and the brief template, prove the gate with throwaway test plans, and close this build through its own gate.

**What you'll do:** Nothing after pasting the prompt. No keys, no money.

---

## Current state going in

- [verified] `update_plan_status` (project-state-mcp `lib/handlers.ts`, `updatePlanStatus`) writes any status with no report, evidence or Session Log required. The `plans` table has no triggers; its only rule is the allowed-status list.
- [verified] All 78 succeeded plans carry an `executor_report` — habit, not enforcement.
- [verified] Incident: plan 102b5f53 (BB-2026-09-21-inspector-repairer) closed `succeeded` at 8 of 9 acceptance checks. The build honestly disclosed criterion 7 as unresolved (ABO-J-007); the external review diagnosed it (A-084); the leftover became BB-2026-09-22-tier2-repair-logs a day later. The defect is that the status said done while one check was unproven.
- [verified] PROTOCOL.md's standing rule sends chats to direct SQL when a Project State write tool fails — so a tool-only gate would be bypassed. The gate must live in the database.
- [verified] Session Logs land in `status_snapshots` or `notes` (each has `display_id`, `project_id`, `created_at`; neither links to a plan).
- [verified] heartbeat-orchestrator (the future daily build-runner) does not exist yet; a database gate covers it automatically.
- [assumed] Nothing in cbrain-ui writes plan status (code search covers `main` only; app code lives on `review`). Directive step 1 checks.

## Receiving chat

New Claude Code build session running orchestrate-build (`go build <plan-id> on agent-build-out`).

## Scope

**In scope:**
- Database (Project State, `ujditldbqdiqigazkcak`): `done_receipt` (jsonb) and `started_at` (timestamptz) columns on `plans`; a BEFORE UPDATE trigger enforcing the five rules below when status changes to `succeeded`.
- `update_plan_status` tool: optional `done_receipt` parameter; stamps `started_at` on `running`; passes the gate's refusal message through verbatim; description updated.
- agent-library `skills/orchestrate-build/SKILL.md` → v1.3.
- chat-protocol `PROTOCOL.md`: one paragraph in the Build Brief return contract; one line on the SQL-fallback standing rule.
- agent-library `roles/design-assist/references/build-brief-template.md`: acceptance criteria numbered.

**Out of scope (forks pre-answered):**
- Checking that evidence is *correct* (e.g. a test aimed at the wrong run) — stays with the external review gate.
- Auto re-queueing or flagging plans stalled in `running` — separate triage, handled by the DA chat.
- Verifying git commits or LEDGER edits from the database — it can't see GitHub; orchestrate-build's read-back rule covers these.
- Back-filling receipts on past succeeded plans.
- Any new status value, dashboard, Board or cbrain-ui change.
- An override/bypass switch — deliberately none; an override is the bypass this build removes.

## The gate — five rules (fire only when status changes TO `succeeded`)

1. `executor_report` is non-empty.
2. `done_receipt` is present with a non-empty `acceptance` array.
3. Every acceptance item has `result` = `pass` (with non-empty `evidence` naming a commit, run, query result or URL) or `handed-off` (with `follow_up_plan` = the uuid of a plan that exists, is not this plan, and is in `draft`/`queued`/`running`/`blocked`). Any other result is refused — a failed check means the plan is `failed`, not `succeeded`.
4. `done_receipt.session_log` is a `display_id` found in `status_snapshots` or `notes` on the same `project_id`, with `created_at` ≥ `started_at` (fall back to `queued_at` when `started_at` is null).
5. Every id in `done_receipt.disclosures` (optional) exists in `build_questions` with `plan_id` = this plan.

On failure: raise an exception whose message names the rule number and what's missing, in plain words. On success: set `completed_at` if null.

Receipt shape:
```
{
  "session_log": "A-090",
  "acceptance": [
    {"n": 1, "criterion": "…", "result": "pass", "evidence": "commit abc1234; SELECT returned 0 rows"},
    {"n": 7, "criterion": "…", "result": "handed-off", "evidence": "why it couldn't be proven", "follow_up_plan": "<uuid>"}
  ],
  "disclosures": ["ABO-J-009"]
}
```

## Directive

1. **Look first.** Custom GitHub MCP `get_file_contents` on `Chooch333/cbrain-ui` with `ref: review` and `ref: main`, and on `Chooch333/project-state-mcp`: find every writer of `plans.status`. Any writer other than `update_plan_status` and the SQL fallback gets routed through the receipt or disclosed.
2. **Database.** Supabase MCP `apply_migration` on `ujditldbqdiqigazkcak` (name `plans_done_receipt_gate`): add the two columns and the trigger implementing rules 1–5. Also set `started_at = now()` in the trigger when status changes to `running` and `started_at` is null (so the SQL-fallback path stamps it too). Verify with `execute_sql` (trigger present, function body read back). Also commit the migration SQL to project-state-mcp as `06-done-receipt-gate.sql`.
3. **Status tool.** project-state-mcp `lib/tools.ts` + `lib/handlers.ts`: add optional `done_receipt` (object) to `update_plan_status`; include it in the update; surface Postgres error text unchanged; update the description to explain the receipt. Commit as Chooch333 via GitHub MCP; read files back.
4. **Skill + protocol.**
   - `skills/orchestrate-build/SKILL.md` → v1.3: step 7 close-out order becomes (a) write Session Log, (b) post disclosures, (c) for each acceptance check that can't be proven, `write_plan` a draft follow-up plan on the same project and mark it `handed-off`, (d) `update_plan_status` → `succeeded` with the receipt. If any check failed outright → `failed`. Standing rule "Write-before-done" now points at the gate. Changelog line.
   - `PROTOCOL.md`: return contract paragraph — "Marking a plan succeeded requires a done receipt (Session Log id + every acceptance check passed with evidence or handed off to a new plan); the database refuses otherwise." SQL-fallback rule: add "the done receipt is still required on a direct-SQL flip to succeeded."
   - `build-brief-template.md`: acceptance criteria written as a numbered list so the receipt maps one-to-one.
   Read each back after commit.
5. **Prove it.** Create throwaway plans on agent-build-out tagged `gate-test`; run acceptance checks 1–6 below by direct SQL (a newly added tool parameter is not callable in the session that deployed it — standing rule), then set test plans to `abandoned` and delete any throwaway session-log rows you created for tests.
6. **Close through the gate.** Write the Session Log; post disclosures (`post_judgment_call`); update cbrain `docs/advisor/LEDGER.md` row ADV-034 to `addressed` with the actual response; then flip this plan to `succeeded` **with a receipt**. If the gate refuses, fix the receipt — never the gate.

## Inputs

- [verified] ADV-034 write-up: `Chooch333/cbrain` `docs/advisor/ADV-2026-09-23.md`
- [verified] Incident: decision A-084 (agent-build-out), disclosure ABO-J-007, plan `102b5f53-383b-4184-b98d-2e5d8bb56d1d` executor report
- [verified] Status tool: `Chooch333/project-state-mcp` `lib/handlers.ts` (`updatePlanStatus`), `lib/tools.ts` (`update_plan_status`)
- [verified] Build lead: `Chooch333/agent-library` `skills/orchestrate-build/SKILL.md` v1.2
- [verified] Session Log tables: `status_snapshots`, `notes`; disclosures: `build_questions` (`plan_id`, `display_id`)

## Acceptance criteria

1. A direct-SQL flip of a test plan to `succeeded` with no receipt is refused, and the message names rule 2.
2. A receipt with a check whose result is neither `pass` nor `handed-off` is refused (rule 3); a `handed-off` check pointing at a nonexistent plan is refused (rule 3).
3. A receipt whose Session Log predates the plan's start, or sits on another project, is refused (rule 4).
4. A receipt listing a disclosure bound to a different plan is refused (rule 5).
5. A complete receipt is accepted; `completed_at` is set; `done_receipt` is stored on the plan.
6. The count and `executor_report`/`completed_at` values of all pre-existing succeeded plans are unchanged.
7. orchestrate-build v1.3, PROTOCOL.md and build-brief-template.md read back with the new text.
8. This build's own flip to `succeeded` passes the gate with a real receipt.

## Decision domains

| Domain | State | Where |
|---|---|---|
| 1 Purpose & users | Answered — personal production system; users are build and design chats plus future heartbeat-orchestrator | Current state |
| 2 Acceptance criteria | Answered | Acceptance |
| 3 Runtime & execution | Defaulted — Postgres trigger (plpgsql) + TypeScript per repo convention; Vercel auto-deploy of project-state-mcp | Directive 2–3 |
| 4 Data — schema | Answered — two new nullable columns on `plans`; migration named | Scope, Directive 2 |
| 5 Data — storage & recall | Answered — receipt stored on the plan (jsonb); recall by plan id | Gate |
| 6 Interconnectivity | Answered — reads `status_snapshots`, `notes`, `build_questions`, `plans`; failure = refuse with message | Gate |
| 7 Access & hard gates | Answered — Supabase MCP, GitHub MCP only; no credentials, no money; no data destroyed (new nullable columns; test rows abandoned) | Directive |
| 8 Skills & tools | Answered — orchestrate-build, execute-build-task | Header |
| 9 Build sequence | Answered — look → DB → tool → docs → prove → close | Directive |
| 10 Assumptions & risks | Answered — one checked assumption (cbrain-ui writer); risk: gate blocks a legitimate close → message says exactly what's missing | Current state |
| 11 Design intent | Answered | below |

## Design intent

"Done" should be something the database grants, not something a build says about itself. Protect three things when trade-offs appear: (1) no route around the gate — tool, SQL fallback, design chat and future unattended runner all hit the same rule, so no override switch; (2) honesty over green — an unprovable check becomes its own visible plan rather than fine print under a green status (Charles's decision, 2026-09-23); (3) plain refusals — a blocked close must say in one sentence what's missing so the next chat fixes the receipt, not the gate. Prefer simple presence checks the database can verify on its own; anything it can't see (GitHub, correctness of evidence) stays with read-back and external review. Don't touch past plans.

## Pasteable prompt

```
Build (unnumbered) — execute Build Brief BB-2026-09-23-done-receipt.
go build 4e1ea505-2ce6-4e31-bd32-a6c189697831 on agent-build-out.
Fetch the brief from Chooch333/project-state-mcp at docs/design/BB-2026-09-23-done-receipt.md — do not trust pasted text. Follow skills/orchestrate-build/SKILL.md from Chooch333/agent-library.
```
