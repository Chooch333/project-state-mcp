# What This System Does

A cross-chat memory system for the projects you work on with Claude.

## The problem

Every Claude conversation starts empty. If you've been building the Family Trip App across seven chats over three weeks, conversation number eight has no idea what the seven before it decided, assumed, blocked on, or completed. You end up either re-pasting massive context blobs at the start of every new chat, maintaining out-of-band artifacts like "Build Manager" documents that try to summarize state, or simply forgetting what was already figured out.

This MCP gives Claude a shared persistent memory. Every project has state — decisions made, assumptions held, blockers open, next moves queued, plans drafted, lessons learned, status snapshots written. That state lives in a Postgres database and is available to every Claude conversation that has this MCP connected. A chat picked up next week starts where the last one ended.

## What gets tracked

Eight entity types, ordered roughly by commitment level:

**Note** is low-friction capture. Anything worth remembering that doesn't yet fit a structured shape. "I think the accommodation-per-day thing might be worth revisiting" — that's a note. A note can later be promoted into any of the structured entities below when its shape becomes clear.

**Assumption** is something believed to be true without verification. "Users will mostly add stops before deciding on accommodations." Assumptions have a status — active, confirmed, or invalidated — that transitions as reality pushes back.

**Blocker** is an open question or external dependency stopping progress. "Should we use Google Places for photos or upload our own?" A blocker resolves when someone answers or the dependency lifts.

**Next move** is a concrete action. Has a priority (urgent, normal, someday) and an estimated effort (small, medium, large). Completes when done.

**Decision** is a closed commitment that shapes what gets built. Immutable once written — to change a decision, you supersede it, which leaves the old one in history and adds a new one that points back. Each decision carries rationale (why this is correct on its own terms), optional change_reason (when superseding: why we moved from the old to the new), and optional provenance (what was consulted — web searches, MCP queries, uploaded files, prior decisions).

**Plan** is a structured document describing how something will be built. Goes through a lifecycle: draft → blessed → executing → complete (or abandoned). Plan content is versioned — every edit creates a new entry in plan_revisions, so you can walk back through the evolution of a plan.

**Lesson** is a retrospective observation. What happened, what to do differently. Carries severity (minor, normal, major).

**Snapshot** is a narrative summary of where a project is right now. Written periodically to capture the feel of the moment, not just the structured state.

## Standing principles

Six principles govern how the system behaves. These are not optional polish; they're what makes it useable.

**The system carries discipline, not the user.** You should not have to remember which tag canonical form is correct, or whether you already used "photo" versus "photos" in a past chat. The server normalizes incoming tags (lowercase, hyphenated, singularized), reconciles near-duplicates against existing tags in the same project scope, regenerates embeddings on content changes, and defaults to safe behavior. You tag and write however is natural.

**Silent work, visible narration.** When the server does something nontrivial — substituting "photos" with the existing "photo" tag, warning that change_reason is missing, counting results by project — it surfaces what it did in the response. Claude relays this to you conversationally without making you ask. The contract: you never track any of it, but you're never kept in the dark.

**Never fabricate defaults.** If change_reason or provenance is unknown, the server stores null and returns a warning. A null field is more honest than a meaningless placeholder like "general improvement." When Claude doesn't know, Claude is expected to ask you — not guess.

**Explicit opt-in for cross-project work.** Any read that could span multiple projects (search_state, find_by_tags, get_activity) requires either project_slug or all_projects=true. Omitting both is a hard error. This prevents accidental leakage when you're working within a single project and Claude forgets to scope. Results across projects always carry the project_slug on every row, and responses include a project_counts breakdown so Claude can tell you which project each hit came from.

**Soft-requirement pattern for reasoning fields.** Fields like change_reason and provenance are strongly preferred but not strictly required. Missing surfaces a warning with the exact tool call needed to fill it in later — never blocks the write. This keeps the system from becoming a friction machine when you're mid-flow and don't yet have the full articulation.

**Timestamp overrides for retroactive logging.** Most write tools accept an optional timestamp (decided_at, observed_at, raised_at, created_at) so you can seed historical data from old chats without everything getting stamped with "now." When seeding, the ordering of past events is preserved.

## Tool categories

**Overview tools** — get_project_dashboard for fast "how is X going" queries (fixed shape, cheap to call). get_project_state for the full dump when you need a complete picture. get_activity for "what happened in the last week" chronological timelines.

**Search tools** — search_state for semantic search ("find things about X"). find_by_tags for exact and fuzzy tag retrieval. list_tags to see what tags exist. Both require explicit scope.

**Write tools** — add_note for low-friction capture. promote_note to convert a note into a structured entity. log_decision, add_assumption, add_blocker, add_next_move, add_lesson, write_plan, write_status_snapshot for direct structured writes. All accept optional timestamp overrides for retroactive logging.

**Lifecycle updates** — update_assumption (status change), resolve_blocker, complete_next_move, update_plan_status, update_plan_content (creates a new revision), supersede_decision (replaces an old decision with a new one, preserving history).

**Gap-fill tools** — update_change_reason fills in a missing reason on a supersession. update_provenance fills in missing provenance on a decision or plan. add_tags appends tags to an existing row.

**History walkers** — get_decision_chain walks the supersession history for a decision (ancestors and descendants). get_plan_revisions walks a plan's edit history. Both show how thinking evolved over time.

**Project management** — create_project to register a new project. list_projects to see what exists.

**Self-introspection** — describe_capabilities returns this overview in structured form, dynamically including the current project list. A fresh Claude in a new chat can call it once and get oriented.

## Using it well

**Default to notes when unsure.** If you're not sure whether something is a decision, an assumption, or just a thought worth capturing — write a note. Promotion to a structured entity is easy. Reclassification after writing the wrong entity is costly. Let the shape become clear before you commit it.

**Write sources that identify you.** Every write takes a source field naming who made the entry (e.g. "claude-chat-2026-04-21-trip-app"). Future readers — you, or another Claude, or Joe — will want to know where entries came from. Make sources legible.

**Tag liberally.** The server reconciles near-duplicates automatically, so you don't need to maintain a canonical vocabulary by hand. Tag things when you think of tags; the system keeps the namespace clean. Rich tagging makes future retrieval cheap.

**Treat warnings as prompts for you, not errors.** If the server warns that change_reason is missing after a supersession, that's a signal to ask you why the change happened. Relay the warning; don't guess.

**For seeding historical data**, use the timestamp overrides. When you're importing seven old Trip App chats, each decision logged should carry the decided_at from when you actually made it — not the timestamp of when you're seeding it now. This keeps chronological ordering meaningful.

**Cross-project intentionality.** When searching or filtering, always be explicit about scope. If you're asking "what's happening on my projects this week," pass all_projects=true. If you're asking about Family Trip App specifically, pass project_slug. The system will refuse ambiguous queries — this is on purpose.

## What this system doesn't do

It doesn't plan for you. It captures thinking you've already done. If you sit down to figure out the Blue Grass RFQ response, this system won't generate ideas — it'll just remember what you came up with and make it retrievable later.

It doesn't impose structure on how you think. No WBS, no Gantt views, no strategy canvas. If you need shaped thinking tools, use them alongside this system and feed the outputs in as notes or decisions.

It doesn't model relationships between ideas. "Decision A depends on assumption B" isn't a graph edge — it's prose in the rationale. Most work doesn't need more than that. If you hit a ceiling where it does, we'll know because you'll feel it.

It doesn't substitute for your judgment. Claude will ask you when provenance or reasoning is unclear. You're the source of truth. The system is scaffolding for your thinking, not replacement.

## Technical shape (for the curious)

Postgres on Supabase, with pgvector for semantic search (OpenAI text-embedding-3-small, 1536 dimensions) and pg_trgm for tag similarity. The MCP server is a single Next.js / Vercel Lambda endpoint. Auth is a shared secret passed either via `?token=` query string (for Claude.ai) or a Bearer header (for Claude Code / curl).

Every content entity carries an embedding, tags array, and the standard source / created_at fields. Embeddings regenerate when content changes (e.g. plan edits). Trigram indexes on tags and provenance make both fuzzy tag matching and source-based decision retrieval cheap.

Migrations live in `supabase/migrations/` in the repo. Handler logic in `lib/handlers.ts`. Tool schemas in `lib/tools.ts`. Tag logic in `lib/tags.ts`.
