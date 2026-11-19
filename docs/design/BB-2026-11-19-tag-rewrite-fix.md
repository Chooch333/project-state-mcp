# Build Brief — BB-2026-11-19-tag-rewrite-fix

**Git home:** Chooch333/project-state-mcp · `docs/design/BB-2026-11-19-tag-rewrite-fix.md`
**Project State plan:** `a67775cc-3390-4733-b3a2-734bff55ff26` on `cbrain`
**Build:** 91
**Skills:** orchestrate-build
**Seated:** revision 1, report CB-625, seats c-stack, oversight, lanes, data-homes, services, ai-system-design
**Stack Flow:** edits the Project State door's side panel text in cbrain `concepts/stack-map.md` ("new hyphenated tags are stored as written").
**Step map:** no change.
**Overnight:** yes · **target_repo:** Chooch333/project-state-mcp · **after:** Builds 88, 89
**Cost:** subscription only; existing Vercel function, no new meter.

**What this is:** Project State stops quietly changing a brand-new tag into a near-match (it turned the Sunday expert run's tag into a "failed" tag two weeks running).
**What I'll do (build chat):** the five steps below.
**What you'll do:** nothing.

## Asked for — Charles (frozen)
> 2026-11-03: "don't design around something in the stack that is clearly broken … fix it." (ways of working). Found while checking the engine-room plan, 2026-11-19.

## Current state going in (checked 2026-11-19)
- **[verified]** `ce-dispatch` was stored as `ce-dispatch-failed` on 11-08 and 11-15 (EB-085, EB-198); the reply reported it in `tag_substitutions`, but nobody read it.
- **[verified]** `lib/tags.ts` → `reconcileWithExisting` near-matches new tags to existing ones; Build 67 already treats hyphenated tags as names for the trailing-s cut (D-063).
- **[verified]** Every chat, build and scheduled run writes through this server.

## Directive
1. `lib/tags.ts`: skip the near-match branch for hyphenated tags (store as written). Single words keep reconciling (photos → photo). Confirm the trailing-s cut is also gone for hyphenated tags; if the 2026-09-09 next move about `project-lens` → `project-len` is still open and now fixed, complete it.
2. Write replies (through `normalizeAndReconcile`'s callers in `lib/handlers.ts`): add `new_tags` (tags not yet used on the project) beside `tag_substitutions`.
3. Extend `scripts/verify-hyphen-tags.ts`: `ce-dispatch` against an existing `ce-dispatch-failed` stays `ce-dispatch`; a negative control for a single word. Leave no test rows behind.
4. Leave `expandForQuery` (search) alone, and no backfill of old rows.
5. Push to main; poll Vercel `list_deployments` until production is READY for that commit. Run this build last in the night; a bad deploy is undone with a Vercel rollback (a revert commit would need the tool that broke).

## Acceptance
1. Script passes both cases; production READY.
2. Handed off, no action: the next real write of a new hyphenated tag (Sunday's expert run) reads back exactly. No test notes are written.
3. Map text updated.

## Decisions
- [Claude-per-doctrine] Narrow to hyphenated tags; keep single-word reconcile. Seat: services. Ruled out: storing every tag as written (would undo the reconciler's purpose; nobody chose to remove it).
- [Claude-per-doctrine] Last in the night; rollback as the undo. Seat: lanes.
- Parked: the login check that fails open when its secret is unset (EB-107) — for a security session, not this build.

## Pasteable prompt
> Build 91 — execute Build Brief BB-2026-11-19-tag-rewrite-fix. Pull the plan from Project State (plan_id a67775cc-3390-4733-b3a2-734bff55ff26, project cbrain, status queued — set it to running when you claim it). Git copy at Chooch333/project-state-mcp/docs/design/BB-2026-11-19-tag-rewrite-fix.md. Follow the brief's fork-handling rules: answer forks autonomously with judgment-call tags; escalate only at hard gates (none in this brief).
