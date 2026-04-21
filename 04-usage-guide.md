# Daily-use guide — Project State MCP

The MCP's value comes from a simple posture: **capture freely, retrieve intelligently, curate at read-time, not write-time.** Log loose thoughts as notes. Promote them later if they earn it. Let semantic search surface what's relevant when you need it instead of trying to organize everything upfront.

This replaces the earlier "classify everything into the right entity" rigid ledger. That version didn't match how thinking actually happens — you rarely know at write-time whether something will turn out to be a decision, an assumption, or just a passing observation. The rewrite below bakes that in.

---

## The three habits

### Habit 1: Bootstrap every project chat

Opening line of a new chat working on any project:

> Pull state for [project-slug] via the project-state MCP. Summarize the latest snapshot, open blockers, recent next moves, and any recent notes or lessons. Also run search_state for any topic I mention in this chat.

`get_project_state` now returns recent notes and lessons alongside the structured entities. Claude gets a richer picture in one call than the old version gave.

### Habit 2: Log liberally mid-chat

As you work, tell Claude to capture things in the moment. Don't classify — just say "log this":

> Log a note that Joe is pushing back on the LLC structure — feels like he wants more time than I do. Topic: ridgeworks-ops.

> Log a note that I noticed the stop reordering is janky on mobile when the bench is open. Topic: vibe-planning.

> Log a lesson: we built the trip-day card for landscape and the 3-column view broke on mobile. Lesson: prototype mobile-first for any new card component going forward. Applies to: ui-patterns.

Notes are cheap. You can always promote a useful one to a decision or blocker later via `promote_note`. Most won't need promotion — they'll just sit there as retrievable context. That's the point.

### Habit 3: Search before assuming you haven't logged something

When you're about to start a new piece of thinking and there's any chance you've touched it before:

> Search state for "authentication" or anything related to user identity in Family Trip App.

`search_state` runs semantic search across decisions, assumptions, blockers, next moves, notes, lessons, snapshots, and plans. It finds by meaning, not keyword match — "user identity" will surface a blocker that asked about "family members' distinct accounts" even though no word overlaps.

---

## When to use each entity (reframed)

The old framing was "pick the right entity." The new framing is: **most things go in notes**. Structured entities are for things that have earned the structure.

| What you have | Where it goes |
|---------------|---------------|
| Any observation, thought, context, passing mention | **note** (low friction, always safe) |
| A genuinely settled call you'll reference later | **decision** (graduates from a note or goes straight here when clear) |
| An active assumption that might change | **assumption** (use for "we're running with X for now") |
| An unresolved question blocking progress | **blocker** (specific, actionable, halts work if unanswered) |
| A concrete action on the todo | **next_move** |
| A retrospective — "we tried X, learned Y" | **lesson** |
| Point-in-time "where are we now" | **status_snapshot** (write one per substantive session) |
| Multi-phase build specification | **plan** (for Level 3 orchestrator work) |

**When in doubt, make it a note.** Notes can be promoted. You never lose anything. The other entity types are optimizations of notes that have earned promotion.

---

## Source conventions

Every write has a `source` field. Use something recognizable:

- `charles` — you typed it directly
- `chat:short-description` — a chat extracted it (e.g. `chat:vibe-punchlist-review`)
- `orchestrator`, `executor`, `validator` — future agent roles

Don't overthink it.

---

## Promotion: from note to structure

When a note turns out to matter more than you thought:

> Promote note [id] to a decision. Title: "Use MapLibre GL over Leaflet." Rationale: "[paste from note plus any added context]." Alternatives considered: Leaflet, Mapbox.

The note stays, but gets a `promoted_to_entity` pointer. Queries can then follow the chain: "this decision came from this original note, which referenced this lesson..."

Use promotion sparingly. Most notes stay as notes. Promotion is for the 10% that earn it.

---

## Supersession: when a decision changes

Don't edit old decisions. Supersede them:

> Supersede decision [id] with a new one. New title: "Use vector tiles from Mapbox, not MapLibre." New rationale: "..." Source: charles.

The old decision stays in the DB with a pointer from the new one. History preserved. A query for "current decisions" shows only the latest; a query for "how did this decision evolve" walks the chain.

---

## Write-back at end of session

Before closing a substantive chat:

> Before we end: write a fresh status snapshot for [project-slug] summarizing today's work. Log any clear decisions we landed on. Promote any notes that have earned promotion. Log lessons if anything went wrong or taught me something. Source everything as chat:[short-description-of-this-session].

Let Claude judge what's a note vs. a decision. If Claude logs something wrong, you can tell it to re-classify or delete.

---

## Cross-chat continuity, by scenario

**Scenario 1 — Picking up yesterday's work.**
You: *"Pull state for family-trip-app."*
Claude returns structured entities plus the 20 most recent notes and 10 most recent lessons. You have full context from the last session in 30 seconds.

**Scenario 2 — "I'm pretty sure we decided something about X."**
You: *"Search state for [X]."*
`search_state` returns the relevant rows across all entity types, ranked by semantic similarity. You don't have to remember where you logged it.

**Scenario 3 — Cross-project thinking.**
You: *"Search state for 'authentication' across all projects."*
Omit `project_slug`. Results span Family Trip App, Property Analyzer, anything else — with entity_type tagged per result.

**Scenario 4 — Retroactive seeding from old chats.**
Open a chat with the MCP enabled. Tell Claude to read specific old chats (via conversation_search) and `add_note` liberally for every substantive point — classify as notes first. Low bar for inclusion. In a subsequent session, review the accumulated notes and promote the ones that clearly belong as decisions/lessons.

---

## Retrieval tips

- **Semantic over keyword.** `search_state("how are we handling user identity")` finds rows about auth even if they don't use the word "identity." Write queries as natural-language descriptions of what you're looking for.
- **Entity filters narrow the search.** `entity_types: ['decision', 'lesson']` when you specifically want settled thinking, not in-progress observations.
- **Recent-notes beats search for "what happened yesterday."** The notes list from `get_project_state` is chronological; use it for recency. Search for topicality.
- **Combine both.** "Pull state, then search for 'photos' across all entity types, then summarize what's relevant before I start."

---

## What this system is NOT

- **Not a ticket tracker.** Next moves are for your own reference, not a kanban. Don't force workflow state ("in-progress," "in-review") into the schema; keep it lightweight.
- **Not a chat log.** Don't dump full conversations. Extract the substance.
- **Not a replacement for code comments or docs.** CLAUDE.md in each repo handles how-the-code-works. This holds how-the-project-is-thinking.
- **Not a second brain you organize.** It's a working memory you consult. Curation happens at read, not write.

---

## Graduation signals

*You're using it well if:* You rarely re-explain project context at chat start. You find yourself saying "search state for..." before starting new work. Old chats' substance is discoverable without rereading them.

*You're using it poorly if:* You forget to write back for a week. You pile up notes and never promote any of them. You bootstrap but don't consult search mid-chat. You're creating structured entities when a note would do.

*Graduation to Step B (plan discipline):* When state writing is reflexive, start treating features as plan documents. Ask for a plan, review, bless, execute, report back. The plans live in state, so review history compounds.

*Graduation to Step C (agents):* When you've shipped 3-5 features via plan documents and the plan generation itself feels rote, automate the Orchestrator. At that point, agents read and write state the same way you do — the interaction contract stays the same, the human just steps back.
