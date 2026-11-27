# Build Brief — BB-2026-11-27-adv-106-waiting-on-filter

**Plan id:** 77b04133-c7d0-46fe-921d-9280b28964b8 (Project State, project cbrain)
**Build:** unnumbered (Stack Advisor)
**Seated:** revision 1, report CB-815, seats services
**Overnight:** yes · **target_repo:** Chooch333/project-state-mcp · **after:** none

**What this is:** The Next steps reader (`list_open_threads`) has no filter, so every status check pulls all open cards (~81k characters today) and the Stack Chief of Staff must script a filter. Add one optional `waiting_on` input.
**What I'll do:** Two small edits in project-state-mcp, a live proof, and one line in the Stack Chief of Staff skill.
**What you'll do:** Nothing — click Declined on the Stack screen to stop it.

## Current state going in
### Asked for
- Stack Advisor idea ADV-106 ("Let the Next steps reader fetch only cards waiting on you").
- Checked live 2026-11-27: `lib/threads.ts` `listOpenThreads` only filters `status = 'open'` unless `include_closed`; `lib/tools.ts` `list_open_threads` schema has only `include_closed`. `open_threads`: 52 open, 41 waiting on Charles (full rows ~63k of ~81k chars). Callers wanting only Charles's cards: Stack Chief of Staff step 1 (Next steps bullet), Stack Repairer step 7 recap.
- Trimmed to: one optional input on the existing tool plus one skill line. No new tool, screen, timer, account or cost.
## Receiving chat
The night runner.
## Scope
In: optional `waiting_on` on `list_open_threads`; the Stack Chief of Staff's Next steps bullet passes it, with fallback. Out: output formatting (pretty-printing), a `kind` filter, every other tool, the Stack Repairer skill.
**Stack Flow:** no change, because no part is added or re-routed; an existing door gains one input.
**Cost:** two Vercel production builds of project-state-mcp (one per commit); $0 money; plan usage per status check drops about a fifth.
## Directive
1. `lib/threads.ts` `listOpenThreads`: read optional `args.waiting_on`; if present and not in `WAITING_ON`, throw `waiting_on must be one of: you, claude, a-build, nobody.`; else add `.eq('waiting_on', args.waiting_on)`. Commit this file alone first (it must build on its own; no [skip ci] markers — CB-742).
2. Poll the production deploy to READY on `project-state-mcp.vercel.app`.
3. `lib/tools.ts` `list_open_threads`: add `waiting_on: { type: 'string', enum: ['you','claude','a-build','nobody'] }` and one clause to its description ("waiting_on: only cards waiting on that party"). Commit alone; poll to READY.
4. Prove from a fresh session: `list_open_threads({waiting_on:'you'})` count equals `select count(*) from open_threads where status='open' and waiting_on='you'`; `waiting_on:'bogus'` is refused in plain words; no input returns all open cards as before.
5. agent-library `skills/stack-chief-of-staff/SKILL.md`, step 1 Next steps bullet: call `list_open_threads` with `waiting_on: "you"`; if the input is refused or ignored (a chat holding the old schema returns cards not waiting on him), keep today's save-and-filter step. Update the matching pitfall line and add a changelog entry (0.1.3, a skill edit allowed by this brief).
6. Undo path: roll back project-state-mcp to the deploy before step 1.
7. Last step: mark the LEDGER row ADV-106 `addressed` ("done for you — built YYYY-MM-DD, BB-2026-11-27-adv-106-waiting-on-filter").
## Acceptance
1. Step 4's three calls behave as stated, with the SQL count matching.
2. Both production deploys READY; existing callers with no input unchanged.
3. The Stack Chief of Staff bullet passes `waiting_on: "you"` and keeps the fallback.
## Pasteable prompt
> Execute Build Brief BB-2026-11-27-adv-106-waiting-on-filter. Pull the plan from Project State (plan_id 77b04133-c7d0-46fe-921d-9280b28964b8, project cbrain). Answer forks yourself; stop only at hard gates. Standing rules CB-185, CB-121, CB-103 apply.
