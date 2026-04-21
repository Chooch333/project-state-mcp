# Daily-use guide — Project State MCP

The MCP is only useful if you (and Claude) actually use it consistently. These are the habits that make it pay off.

## The two habits

### Habit 1: Bootstrap every Family Trip App chat

When you open a new chat to work on Family Trip App, paste this as your opening line:

> Pull state for family-trip-app via the project-state MCP. Summarize the current decisions, active assumptions, open blockers, open next moves, and the latest status snapshot before we start working.

Claude will call `get_project_state`, read the JSON, and give you a summary. This replaces 20 minutes of "here's what we've decided, here's where we are, here's what's pending." Now it's 30 seconds.

For multi-project awareness, you can also say:

> List all projects via project-state and summarize the open blockers across all of them.

### Habit 2: Write back at the end of each session

Before closing a substantive chat, say:

> Before we end: update project state for family-trip-app. Log any decisions we made, add new assumptions if any surfaced, record new blockers if any came up, add new next moves, and write a fresh status snapshot summarizing where we are.

Claude will make the writes. This is where the system earns its keep — without writeback, state goes stale and next session's bootstrap is useless.

## Source conventions

Every write has a `source` field. Keep it meaningful so you can query "what did I decide in chat X":

- `charles` — Charles typed this directly or explicitly dictated it
- `chat:short-description` — A chat session came to this conclusion (e.g. `chat:vibe-punchlist`, `chat:photo-feature-planning`)
- `orchestrator` — Future: the Orchestrator agent wrote this as part of plan generation
- `executor` — Future: the Executor logged this during autonomous build
- `validator` — Future: the Validator noted this during final review

Don't agonize over the exact string — just use something future-you can recognize.

## When to use which entity

| If you're recording... | Use |
|------------------------|-----|
| A settled call with reasoning ("we decided X because Y") | **decision** |
| A current working assumption that might change ("we're assuming X for now") | **assumption** |
| An open question or external dependency blocking progress | **blocker** |
| A concrete next action to take | **next move** |
| A free-form summary of where things are right now | **status snapshot** |
| A detailed multi-phase build specification | **plan** |

Common traps:

- *Don't log "add photos feature" as a decision.* That's a next move. Decisions are about how something is done, not what to do.
- *Don't log "is this going to work?" as a blocker.* Blockers are specific unknowns with actionable answers. Vague worries should stay in your head or become next moves like "prototype X to find out."
- *Don't let assumptions pile up without revisiting.* If an assumption has been `active` for months, ask whether evidence has emerged to confirm or invalidate it. The `update_assumption` call exists for this.

## When an existing decision changes

Don't edit the old decision — supersede it. Call `supersede_decision` with the old decision's id and the new title/rationale. The old row stays in the database with a pointer from the new one. This means you always have history.

## Cross-chat continuity examples

**Scenario 1: Picking up yesterday's work**
Chat opens. You say: *"Pull state for family-trip-app."*
Claude: *"You have 2 open blockers: the Google Places API decision and the Build Manager migration question. Top priority next move is the vibe planning punch list. Latest snapshot says..."*
You: *"Let's tackle blocker #1. Here's what I'm thinking..."*
[Work happens. Decision gets made.]
You: *"Log this decision and resolve the blocker. Update status snapshot."*

**Scenario 2: Jumping between projects**
Chat for Family Trip App ended an hour ago. Now you're in a new chat thinking about Property Analyzer.
You: *"Pull state for property-analyzer."*
Claude: *[summarizes Property Analyzer state — which is completely different from Family Trip App's]*
No context bleed. Each project has its own rows.

**Scenario 3: "What were we thinking on X?"**
You: *"Pull the decision history for how we landed on MapLibre over Leaflet. Use the decisions table."*
Claude queries the table, returns the decision row with rationale. If there's a supersession chain, walks it.

## What to expect in the first week

- **Day 1:** Seeding works. Bootstrap calls work. You'll feel mild friction remembering to write back. That's normal.
- **Days 2-4:** You'll forget to write back a few times. The next session's bootstrap will be stale, you'll notice, and the habit will sharpen.
- **End of week 1:** You'll feel the difference on multi-chat projects. The "seven chats deep" problem will have started to dissolve.
- **Week 2-3:** You'll notice what's missing — probably tags, probably search, probably some field you wish you'd logged. That's signal, not failure. Iterate on the schema.

## Graduation criteria for Step B (plan-gate discipline)

Once state-writing feels habitual, start treating new feature work as plan documents. Ask Claude to draft a plan, store it via `write_plan`, review, bless via `update_plan_status`. This is the practice muscle for Step C's Orchestrator.

## Graduation criteria for Step C (Orchestrator/Executor/Validator)

When you've shipped 3-5 features using the plan-document workflow manually, and you notice the plan-generation itself becoming repetitive, that's when automating the Orchestrator starts paying off. Not before.
