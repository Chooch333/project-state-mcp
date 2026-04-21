# Seed: Family Trip App

Paste this into a chat with the `project-state` MCP connected, and ask Claude to execute the tool calls to populate the database.

---

## Instructions for the chat

Use the `project-state` MCP to seed the database with Family Trip App data. Run these calls in order. If any call returns an error about a missing project, create it first.

### Step 1: Create the project

Call `create_project` with:
- `slug`: `family-trip-app`
- `name`: `Family Trip App`
- `description`: `Next.js + Supabase + Vercel trip planning app with Claude.ai-inspired TripLayout and AI-powered itinerary curation via Anthropic API tool use.`
- `repo_url`: `https://github.com/Chooch333/Family-Trip-App`
- `supabase_project_id`: `ksewwcnshxatsprgwmev`
- `vercel_project_id`: `prj_ivzKiI3PcfZ1H8dhDvZtEY84DrKW`

### Step 2: Log decisions

Call `log_decision` for each of these. Use source `charles` for all.

1. **Title:** TripLayout is the canonical shell
   **Rationale:** Claude.ai-inspired layout (sidebar rail, stops panel, chat center, map right) is the unified shell for all trip views. Vibe planning is no longer a separate page.
   **Alternatives considered:** Separate vibe planning page (rejected for UI fragmentation)

2. **Title:** MapLibre GL over Leaflet.js
   **Rationale:** MapLibre GL provides better vector tile performance and modern styling control needed for the trip map experience.
   **Alternatives considered:** Leaflet.js (original), Mapbox (licensing concerns)

3. **Title:** Per-day accommodations, not trip-level
   **Rationale:** Travel days and multi-stop trips need per-day hotel/lodging tracking. A single trip-level accommodation doesn't handle real trip shapes.

4. **Title:** dnd-kit for stop reordering
   **Rationale:** Mature React drag-and-drop library with good accessibility and mobile touch support. Needed for stop sequencing within a day.

5. **Title:** Anthropic API with tool use for itinerary edits
   **Rationale:** Claude edits the itinerary via surgical tool calls (replace_stop, add_stop, remove_stop) rather than producing free-text that has to be parsed. Reduces hallucination and makes edits auditable.

6. **Title:** Use .maybeSingle() on Supabase single-row queries
   **Rationale:** .single() throws on zero rows; .maybeSingle() returns null. Zero-row cases are common (new users, missing relations) and should be handled gracefully, not as exceptions. Standing rule across the codebase.

7. **Title:** Supabase MCP calls must pass project ID on every invocation
   **Rationale:** The MCP doesn't infer project context. Explicit `ksewwcnshxatsprgwmev` on each call prevents accidental writes to the wrong project. Standing rule.

### Step 3: Add assumptions

Call `add_assumption` for each. Source `charles`.

1. **Statement:** Family members accessing a trip are authenticated users with distinct accounts
   **Alternatives:** Shared-link model where anyone with the URL can view; magic-link email auth for lighter-weight access

2. **Statement:** Google Places API will eventually be the canonical source for stop photos and metadata
   **Alternatives:** Stay with Nominatim for geocoding and user-uploaded photos only; use Foursquare

3. **Statement:** Build Manager artifact (storage key trip-app-project-v24) is the authoritative feature tracker
   **Alternatives:** Migrate to this state MCP's plans table; use GitHub issues

### Step 4: Add open blockers

Call `add_blocker` for each. Source `charles`.

1. **Question:** Should we get a Google Places API key now, or continue with Nominatim + placeholder photos?
   **Context:** Nominatim handles geocoding well. Photos are the current gap. Places API has free tier (first $200/mo) but requires billing setup and key management. Build Manager has this as a to-do.

2. **Question:** How should the Build Manager artifact relate to the new state MCP?
   **Context:** Build Manager currently holds all feature items, stars, and Claude Code prompts. State MCP has plans table. Need to decide whether to migrate, dual-run, or deprecate Build Manager over time.

### Step 5: Add next moves

Call `add_next_move` for each. Source `charles`. Priority as noted.

1. **Description:** Continue punch list on vibe planning environment (18-item list from April 9 session)
   **Priority:** urgent
   **Estimated effort:** large

2. **Description:** Apply pending Supabase schema change: add `trips.trip_summary` (text, nullable) column
   **Priority:** normal
   **Estimated effort:** small

3. **Description:** Review whether to move Build Manager content into state MCP plans table
   **Priority:** normal
   **Estimated effort:** medium

4. **Description:** Evaluate adding per-stop photo uploads feature (see example plan from planning session)
   **Priority:** someday
   **Estimated effort:** medium

### Step 6: Write initial status snapshot

Call `write_status_snapshot` with:
- `project_slug`: `family-trip-app`
- `source`: `charles`
- `narrative`: `Vibe planning environment live on family-trip-app-two.vercel.app. Active punch list of 18 items covering layout, day state logic, bench behavior, and missing features. TripLayout shell is stable. Supabase + Vercel MCPs connected. Main next block: working through punch list. Migrating chat-based continuity onto this state MCP is a parallel workstream.`

---

## Verification

After running these calls, test with:
- `list_projects` — should show `family-trip-app`
- `get_project_state('family-trip-app')` — should return 7 decisions, 3 assumptions, 2 blockers, 4 next moves, 1 snapshot

If counts match, seeding succeeded.
