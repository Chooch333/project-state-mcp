// Tool schemas exposed to MCP clients.
// Each entry defines name, description, and input schema (JSON Schema).

export const TOOLS = [
  {
    name: 'describe_capabilities',
    description: 'Returns a compact self-description of this MCP: what it is for, what entities it tracks, what standing principles govern behavior, what tool categories exist, currently-registered projects, and tips for using it well. Call this FIRST in a new chat if you are unfamiliar with this system — one call gives you the full picture instead of reading 30+ tool descriptions piecemeal. Safe to call anytime; no side effects.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_project_dashboard',
    description: 'AT-A-GLANCE summary of a project. Returns a fixed-shape dashboard: one-sentence status, top urgent blocker, top urgent next_move, what is new in the last 7 days, and counts. Use this when the person asks anything resembling "how is X going," "what is up with X," "give me a rundown on X," "state of X." Prefer this over get_project_state for quick overviews; use get_project_state only when they explicitly want the full dump.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
      },
      required: ['project_slug'],
    },
  },
  {
    name: 'get_activity',
    description: 'Timeline of what happened in a date range. Returns a chronological list of events: decisions added/superseded, assumptions added/confirmed/invalidated, blockers raised/resolved, next_moves added/completed, plans added/status-changed, notes added, lessons added, status snapshots written. Use when the person asks anything like "what did we do last week," "catch me up on X since Wednesday," "what has changed in the last 4 days." Default window is the last 7 days if no since or relative_days is given. SCOPE: you must pass project_slug to see one project, or all_projects=true to explicitly see all projects. Omitting both is an error — this prevents accidental cross-project leakage.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string', description: 'Limit to one project.' },
        all_projects: { type: 'boolean', description: 'Explicitly opt into cross-project activity. Set true ONLY when the user explicitly wants activity across every project.' },
        since: { type: 'string', description: 'ISO date/datetime for start of window. If omitted, uses relative_days.' },
        until: { type: 'string', description: 'ISO date/datetime for end of window. Defaults to now.' },
        relative_days: { type: 'number', description: 'Shortcut for since = now - N days. Default 7. Ignored if since is set.' },
        entity_types: {
          type: 'array',
          items: { type: 'string', enum: ['decision', 'assumption', 'blocker', 'next_move', 'plan', 'snapshot', 'note', 'lesson'] },
        },
        event_types: {
          type: 'array',
          items: { type: 'string', enum: ['added', 'completed', 'resolved', 'confirmed', 'invalidated', 'superseded', 'plan_status_changed'] },
        },
        limit: { type: 'number', description: 'Max events returned. Default 100.' },
      },
    },
  },
  {
    name: 'list_projects',
    description: 'List all projects tracked in the state database.',
    inputSchema: {
      type: 'object',
      properties: {
        include_archived: { type: 'boolean', description: 'Include archived projects. Defaults to false.' },
      },
    },
  },
  {
    name: 'get_project_state',
    description: 'FULL state dump: every active decision, assumption, open blocker, open next_move, latest snapshot, recent notes, recent lessons. Verbose. Use only when the person needs a complete picture. For quick overviews prefer get_project_dashboard.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        recent_notes_limit: { type: 'number', description: 'How many recent notes to include. Default 20.' },
        recent_lessons_limit: { type: 'number', description: 'How many recent lessons to include. Default 10.' },
      },
      required: ['project_slug'],
    },
  },
  {
    name: 'search_state',
    description: 'Semantic search across project-state content. Returns the most relevant rows by meaning, not just keyword match. SCOPE: you must pass project_slug to search within one project, or all_projects=true to explicitly search across every project. Omitting both is an error — this prevents accidental cross-project leakage. Each result row includes project_slug so you can see which project it came from.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        project_slug: { type: 'string', description: 'Limit search to one project.' },
        all_projects: { type: 'boolean', description: 'Explicitly opt into cross-project search. Set true ONLY when the user explicitly asks for cross-project search.' },
        entity_types: {
          type: 'array',
          items: { type: 'string', enum: ['decision', 'assumption', 'blocker', 'next_move', 'plan', 'snapshot', 'note', 'lesson'] },
        },
        limit: { type: 'number', description: 'Max results. Default 10.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'find_by_tags',
    description: 'Exact-tag retrieval across entity types, with fuzzy expansion so "photo" also matches rows tagged "photos" or "photo-upload". SCOPE: you must pass project_slug to search within one project, or all_projects=true to explicitly search across every project. Omitting both is an error. Each result row includes project_slug.',
    inputSchema: {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' } },
        match_mode: { type: 'string', enum: ['any', 'all'], description: 'Default: any.' },
        project_slug: { type: 'string', description: 'Limit to one project.' },
        all_projects: { type: 'boolean', description: 'Explicitly opt into cross-project tag search.' },
        entity_types: {
          type: 'array',
          items: { type: 'string', enum: ['decision', 'assumption', 'blocker', 'next_move', 'plan', 'snapshot', 'note', 'lesson'] },
        },
        limit: { type: 'number', description: 'Default 50.' },
      },
      required: ['tags'],
    },
  },
  {
    name: 'list_tags',
    description: 'List all tags currently used across a project (or all projects), with counts.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
      },
    },
  },
  {
    name: 'add_tags',
    description: 'Add tags to an existing row without changing any other content.',
    inputSchema: {
      type: 'object',
      properties: {
        entity_type: { type: 'string', enum: ['decision', 'assumption', 'blocker', 'next_move', 'plan', 'snapshot', 'note', 'lesson'] },
        id: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['entity_type', 'id', 'tags'],
    },
  },
  {
    name: 'create_project',
    description: 'Register a new project in the state database. Pass letter_code to set the project\'s display-ID prefix at creation time (otherwise display_id assignment will fail until letter_code is set via SQL — see D-060).',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        repo_url: { type: 'string' },
        deployment_url: { type: 'string', description: 'Live deployment URL (e.g., Vercel production URL). Distinct from repo_url which points to source.' },
        supabase_project_id: { type: 'string' },
        vercel_project_id: { type: 'string' },
        letter_code: { type: 'string', description: 'Single-letter (or 2-3 char) prefix for human-readable display IDs (e.g. "G" → G-001, G-002). Must be unique across projects. Stored as upper-case. Strongly recommended at creation time.' },
      },
      required: ['slug', 'name'],
    },
  },
  {
    name: 'add_note',
    description: 'Low-friction capture. Use for anything worth remembering that does not yet fit a structured entity. Pass optional created_at (ISO 8601) to backdate the note — useful when seeding from old conversations.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        content: { type: 'string' },
        topic: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
        created_at: { type: 'string', description: 'Optional ISO 8601 timestamp override. Use to backdate when seeding historical notes from old chats. Defaults to now() if omitted.' },
      },
      required: ['project_slug', 'content', 'source'],
    },
  },
  {
    name: 'promote_note',
    description: 'Convert a note into a structured entity. Tags carry over unless overridden.',
    inputSchema: {
      type: 'object',
      properties: {
        note_id: { type: 'string' },
        target_entity: { type: 'string', enum: ['decision', 'assumption', 'blocker', 'next_move', 'lesson'] },
        title: { type: 'string' },
        rationale: { type: 'string' },
        alternatives_considered: { type: 'string' },
        statement: { type: 'string' },
        alternatives: { type: 'string' },
        question: { type: 'string' },
        context: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['urgent', 'normal', 'someday'] },
        estimated_effort: { type: 'string', enum: ['small', 'medium', 'large'] },
        situation: { type: 'string' },
        lesson: { type: 'string' },
        applies_to: { type: 'string' },
        severity: { type: 'string', enum: ['minor', 'normal', 'major'] },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
      },
      required: ['note_id', 'target_entity', 'source'],
    },
  },
  {
    name: 'add_lesson',
    description: 'Record a retrospective observation. Pass optional created_at to backdate when seeding from old chats.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        situation: { type: 'string' },
        lesson: { type: 'string' },
        applies_to: { type: 'string' },
        severity: { type: 'string', enum: ['minor', 'normal', 'major'] },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
        created_at: { type: 'string', description: 'Optional ISO 8601 timestamp override. Defaults to now().' },
      },
      required: ['project_slug', 'situation', 'lesson', 'source'],
    },
  },
  {
    name: 'log_decision',
    description: 'Record a closed decision with rationale. Immutable once written; to change, use supersede_decision. Always try to supply provenance — a short note on what you consulted to reach this decision (web searches, MCP tool calls, uploaded files, prior decisions). If you can not articulate it, ask the user or leave it empty and the response will warn you to fill it in later. Never fabricate a generic placeholder. Pass optional decided_at to backdate when seeding decisions from old chats.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        title: { type: 'string' },
        rationale: { type: 'string' },
        alternatives_considered: { type: 'string' },
        provenance: { type: 'string', description: 'Show your work: what you consulted (web searches, MCP tools, uploaded files, prior decisions). Strongly preferred; ask the user if unclear; never fabricate.' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
        decided_at: { type: 'string', description: 'Optional ISO 8601 timestamp override — use when the decision was actually made on a prior date (seeding from old chats). Defaults to now().' },
      },
      required: ['project_slug', 'title', 'rationale', 'source'],
    },
  },
  {
    name: 'supersede_decision',
    description: 'Replace an existing decision with a new one. The old decision remains in history. Always try to supply change_reason (why moving from old to new) and provenance (what you consulted). Both are preferred; if unclear, ASK the user rather than fabricating a placeholder. If left empty the response will include warnings you should relay to the user. Pass optional decided_at when seeding a historical supersession.',
    inputSchema: {
      type: 'object',
      properties: {
        old_decision_id: { type: 'string' },
        new_title: { type: 'string' },
        new_rationale: { type: 'string', description: 'Why the new decision is right on its own terms.' },
        new_alternatives_considered: { type: 'string' },
        change_reason: { type: 'string', description: 'Why we are moving from the old decision to this new one. Ask the user if unclear.' },
        provenance: { type: 'string', description: 'Show your work: what you consulted. Ask the user if unclear.' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
        decided_at: { type: 'string', description: 'Optional ISO 8601 timestamp override. Defaults to now().' },
      },
      required: ['old_decision_id', 'new_title', 'new_rationale', 'source'],
    },
  },
  {
    name: 'get_decision_chain',
    description: 'Walk the supersession history for a decision. Given any decision ID, returns the full chain: every predecessor decision (walking backward via supersedes pointers) and every successor decision (walking forward by finding decisions that supersede this one). Each transition shows the change_reason, so you can see how thinking evolved. Use when the person asks "how did we land on X," "what was the original decision about X," "why did we change from Y to Z," or anything about decision history.',
    inputSchema: {
      type: 'object',
      properties: {
        decision_id: { type: 'string', description: 'Any decision in the chain — the walker finds both ancestors and descendants.' },
      },
      required: ['decision_id'],
    },
  },
  {
    name: 'update_change_reason',
    description: 'Fill in or amend the change_reason on a superseding decision. Use when change_reason was skipped at supersession time (got a warning about it), when the user later clarifies WHY the transition happened, or when a better articulation of the reason emerges. Only works on decisions that actually supersede another (originals have no transition to explain).',
    inputSchema: {
      type: 'object',
      properties: {
        decision_id: { type: 'string' },
        change_reason: { type: 'string' },
      },
      required: ['decision_id', 'change_reason'],
    },
  },
  {
    name: 'update_provenance',
    description: 'Fill in or amend the provenance on a decision or plan. Use when provenance was skipped at write time, the user clarifies what was consulted, or a better articulation emerges. Works on both decisions and plans — pass entity_type to specify.',
    inputSchema: {
      type: 'object',
      properties: {
        entity_type: { type: 'string', enum: ['decision', 'plan'] },
        entity_id: { type: 'string' },
        provenance: { type: 'string' },
      },
      required: ['entity_type', 'entity_id', 'provenance'],
    },
  },
  {
    name: 'add_assumption',
    description: 'Record an active assumption with alternatives. Pass optional observed_at to backdate.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        statement: { type: 'string' },
        alternatives: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
        observed_at: { type: 'string', description: 'Optional ISO 8601 timestamp override — when the assumption was first observed. Defaults to now().' },
      },
      required: ['project_slug', 'statement', 'source'],
    },
  },
  {
    name: 'update_assumption',
    description: 'Change the status of an assumption to confirmed or invalidated.',
    inputSchema: {
      type: 'object',
      properties: {
        assumption_id: { type: 'string' },
        new_status: { type: 'string', enum: ['confirmed', 'invalidated'] },
        reason: { type: 'string' },
      },
      required: ['assumption_id', 'new_status', 'reason'],
    },
  },
  {
    name: 'add_blocker',
    description: 'Log an open question or external dependency blocking progress. Pass optional raised_at to backdate.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        question: { type: 'string' },
        context: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
        raised_at: { type: 'string', description: 'Optional ISO 8601 timestamp override — when the blocker was first raised. Defaults to now().' },
      },
      required: ['project_slug', 'question', 'source'],
    },
  },
  {
    name: 'resolve_blocker',
    description: 'Mark a blocker as resolved and record the answer.',
    inputSchema: {
      type: 'object',
      properties: {
        blocker_id: { type: 'string' },
        answer: { type: 'string' },
      },
      required: ['blocker_id', 'answer'],
    },
  },
  {
    name: 'add_next_move',
    description: 'Add a concrete next action. Pass optional created_at to backdate.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['urgent', 'normal', 'someday'] },
        estimated_effort: { type: 'string', enum: ['small', 'medium', 'large'] },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
        created_at: { type: 'string', description: 'Optional ISO 8601 timestamp override. Defaults to now().' },
      },
      required: ['project_slug', 'description', 'source'],
    },
  },
  {
    name: 'complete_next_move',
    description: 'Mark a next move as completed.',
    inputSchema: {
      type: 'object',
      properties: {
        next_move_id: { type: 'string' },
        completed_by_plan_id: { type: 'string' },
      },
      required: ['next_move_id'],
    },
  },
  {
    name: 'write_plan',
    description: 'Store a build plan document. Always try to supply provenance — what you consulted to produce this plan. Also accepts optional board-facing labels: plain_title, plain_summary, designed_in (free text), and campaign (a campaign slug — see list_campaigns/create_campaign — resolved server-side to campaign_id; an unrecognized slug is a caller error and the write fails naming it, it is never silently dropped). Campaigns are DA-chat authority: DA/planning chats may rename, recategorize, or fork a new campaign out of an existing one freely, at their own discretion — these changes are logged as judgment calls via post_judgment_call, and Charles is never asked to approve a campaign change. Soft enforcement is a hard design requirement here: this call NEVER fails for missing labels — but if the plan is tagged build-brief and lands without a plain_title or a campaign, the response carries an additional label_warning string addressed to the calling chat (never to Charles), instructing it to add its best-shot plain name via update_plan_labels. Pass optional created_at to backdate. When backdating, revision 1 is also backdated to keep history consistent.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        provenance: { type: 'string', description: 'Show your work. Strongly preferred.' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
        created_at: { type: 'string', description: 'Optional ISO 8601 timestamp override. Defaults to now().' },
        plain_title: { type: 'string', description: 'Plain-English board-facing name for the build, distinct from the technical title. Optional but strongly encouraged on build-brief-tagged plans — see the soft label_warning behavior above.' },
        plain_summary: { type: 'string', description: 'One-sentence plain-English summary of what this plan is, for the board.' },
        campaign: { type: 'string', description: 'Campaign slug to file this plan under (see list_campaigns). Resolved to campaign_id server-side; an unrecognized slug errors rather than being silently dropped. Campaigns are DA-chat authority — fluid, judgment-call territory, never needing Charles\'s approval.' },
        designed_in: { type: 'string', description: 'Free-text pointer to where this plan was designed (e.g. a DA-chat session identifier), for provenance on the board.' },
      },
      required: ['project_slug', 'title', 'content', 'source'],
    },
  },
  {
    name: 'update_plan_content',
    description: 'Edit a plan\'s content, creating a new revision snapshot. Every time you call this, the plan\'s current_revision increments and a row is added to plan_revisions capturing the new state. Use when the plan has evolved — the user iterated on the approach, refined the scope, or added detail. Do NOT use for status transitions (draft → queued → running → succeeded/failed/blocked/abandoned); use update_plan_status for that. Always try to supply change_reason — a short explanation of why the plan evolved. If unclear, ask the user; the response will warn you if you leave it empty. new_title is optional and defaults to the current title. Also accepts optional board-facing labels — plain_title, plain_summary, designed_in, and campaign (a slug — see list_campaigns/create_campaign) — only the fields you actually pass are changed, everything else keeps its current value; pass an empty string or null for campaign to explicitly clear it, and note an unrecognized campaign slug is a caller error, never silently dropped. Campaigns are DA-chat authority: DA/planning chats may rename, recategorize, or fork a new campaign out of an existing one freely, at their own discretion — logged as judgment calls via post_judgment_call, never needing Charles\'s approval. Soft enforcement is a hard design requirement: this call NEVER fails for missing labels — but if the plan is tagged build-brief and still lacks a plain_title or a campaign after the edit, the response carries an additional label_warning string addressed to the calling chat (never to Charles), instructing it to add its best-shot plain name via update_plan_labels.',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string' },
        new_content: { type: 'string', description: 'The full new content of the plan. This replaces the current content entirely; the previous content is preserved in plan_revisions.' },
        new_title: { type: 'string', description: 'Optional new title. Defaults to the current title if omitted.' },
        change_reason: { type: 'string', description: 'Why the plan was edited. Strongly preferred; ask the user if unclear; never fabricate.' },
        source: { type: 'string', description: 'Who/what made this revision. Defaults to the plan\'s existing source.' },
        plain_title: { type: 'string', description: 'Plain-English board-facing name for the build. Only updated if passed.' },
        plain_summary: { type: 'string', description: 'One-sentence plain-English summary for the board. Only updated if passed.' },
        campaign: { type: 'string', description: 'Campaign slug to file this plan under (see list_campaigns). Only updated if passed; empty string or null clears it. Unrecognized slug errors rather than being silently dropped.' },
        designed_in: { type: 'string', description: 'Free-text pointer to where this plan was designed. Only updated if passed.' },
      },
      required: ['plan_id', 'new_content'],
    },
  },
  {
    name: 'get_plan_revisions',
    description: 'Walk the revision history of a plan. Returns all revisions ordered newest-first, each with its revision_number, title, change_reason, source, and creation time. By default returns metadata only (no content) to keep responses compact; pass include_content=true to fetch the actual content of every revision. Use when the person asks "how has this plan evolved," "what did version 2 say," "when did we change the plan," or anything about a plan\'s history.',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string' },
        include_content: { type: 'boolean', description: 'If true, include the full content of every revision in the response. Default false (metadata only).' },
      },
      required: ['plan_id'],
    },
  },
  {
    name: 'update_plan_status',
    description: 'Transition a plan through its lifecycle: draft (initial write) → queued (approved, on the shelf) → running (orchestrator claimed it) → succeeded | failed | blocked | abandoned. failed and blocked are not terminal — a plan may be re-queued after review or after a hard gate clears.',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string' },
        new_status: { type: 'string', enum: ['queued', 'running', 'succeeded', 'failed', 'blocked', 'abandoned'] },
        executor_report: { type: 'string' },
      },
      required: ['plan_id', 'new_status'],
    },
  },
  {
    name: 'get_plan',
    description: 'Retrieve a specific plan by id, or the most recent plan for a project.',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string' },
        project_slug: { type: 'string' },
      },
    },
  },
  {
    name: 'list_plans',
    description: 'List all plans for a project, ordered newest-first. Returns plan metadata (title, status, timestamps) without content by default; pass include_content=true for full bodies.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        include_content: { type: 'boolean', description: 'Include the full content of every plan. Default false.' },
      },
      required: ['project_slug'],
    },
  },
  {
    name: 'update_plan_labels',
    description: 'Rename and/or recategorize a plan\'s board-facing labels: plain_title, plain_summary, campaign, and designed_in. This is both the rename tool and the recategorize tool — only the fields you actually pass are updated, everything else keeps its current value. campaign is a campaign slug (see list_campaigns/create_campaign), resolved server-side to campaign_id; pass an empty string or null to clear the plan\'s current campaign, and note an unrecognized slug is a caller error, never silently dropped. This is the tool the soft label_warning on write_plan/update_plan_content points the calling chat back to. Campaigns are DA-chat authority: DA/planning chats may rename or recategorize a plan into a different (or newly forked) campaign freely, at their own discretion — these changes are logged as judgment calls via post_judgment_call, and Charles is never asked to approve a campaign change.',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string' },
        plain_title: { type: 'string' },
        plain_summary: { type: 'string' },
        campaign: { type: 'string', description: 'Campaign slug to file this plan under. Pass an empty string or null to clear the current campaign.' },
        designed_in: { type: 'string' },
      },
      required: ['plan_id'],
    },
  },
  {
    name: 'review_plan',
    description: 'Record a design review on a completed plan: sets reviewed_at (now), reviewed_by, and optional review_notes. Valid ONLY when the plan\'s current status is succeeded — for any other status this returns a clear error and does NOT set the review fields.',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string' },
        reviewed_by: { type: 'string' },
        review_notes: { type: 'string' },
      },
      required: ['plan_id', 'reviewed_by'],
    },
  },
  {
    name: 'list_campaigns',
    description: 'List all campaigns (id, slug, title, purpose, sort_order, status), ordered by sort_order then title. Campaigns are board-facing groupings for plans. Campaigns are DA-chat authority: DA/planning chats may create, rename, recategorize, or fork a new campaign out of an existing one freely, at their own discretion — these changes are logged as judgment calls via post_judgment_call, and Charles is never asked to approve a campaign change.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'create_campaign',
    description: 'Create a new campaign — a board-facing grouping for plans. Campaigns are DA-chat authority: DA/planning chats may create, rename, recategorize, or fork a new campaign out of an existing one freely, at their own discretion — these changes are logged as judgment calls via post_judgment_call, and Charles is never asked to approve a campaign change. Errors clearly if slug already exists — use update_campaign to change the existing campaign instead of retrying create.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        title: { type: 'string' },
        purpose: { type: 'string' },
        sort_order: { type: 'number', description: 'Board ordering; lower sorts first. Defaults to 100 if omitted.' },
      },
      required: ['slug', 'title'],
    },
  },
  {
    name: 'update_campaign',
    description: 'Update an existing campaign\'s slug, title, purpose, sort_order, or status (active/done/parked). Identify the campaign with slug or id; only the fields you actually pass are changed. Campaigns are DA-chat authority: DA/planning chats may rename, recategorize, or fork a new campaign out of an existing one freely, at their own discretion — these changes are logged as judgment calls via post_judgment_call, and Charles is never asked to approve a campaign change.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Current slug identifying the campaign. Provide this or id.' },
        id: { type: 'string', description: 'Campaign uuid. Provide this or slug.' },
        new_slug: { type: 'string' },
        title: { type: 'string' },
        purpose: { type: 'string' },
        sort_order: { type: 'number' },
        status: { type: 'string', enum: ['active', 'done', 'parked'] },
      },
    },
  },
  {
    name: 'write_status_snapshot',
    description: 'Write a brief narrative summary of where the project is right now. Pass optional observed_at to describe a prior moment when seeding from old chats.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        narrative: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
        observed_at: { type: 'string', description: 'Optional ISO 8601 timestamp override — when the narrative describes (not when you wrote it). Defaults to now().' },
      },
      required: ['project_slug', 'narrative', 'source'],
    },
  },
  {
    name: 'post_judgment_call',
    description: 'Post a disclosure to the build-to-Charles Q-channel: something a build chat wants Charles to see that is neither a blocking question nor a clean "done, nothing to flag" close — a judgment call made on its own authority, a loose end, an FYI. Returns a prefixed display_id (e.g. CBR-J-003) to hand to Charles, who can carry it into a design-assist chat for optional, non-blocking review. Always bound to the originating build brief via plan_id. Distinct from the blocking-question Q-channel (open/answered/discussing/resolved) — disclosures are born already non-blocking (status noted) and never gate a build or a DA session start. Also accepts optional plain_summary (one plain-English sentence for Charles) and action_needed (needs-charles / needs-design-check / fyi). Soft enforcement, never a rejection: action_needed defaults to "fyi" if omitted or unrecognized, and if plain_summary is omitted the response carries an additional warning string addressed to the calling chat (never to Charles) asking it to supply its own best-shot plain sentence next time. A campaign-related disclosure (a DA/planning chat renaming, recategorizing, or forking a campaign) is exactly the kind of thing this tool exists for — campaigns are DA-chat authority and Charles is never asked to approve the change itself, only informed of it here if the chat judges it worth a note.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        plan_id: { type: 'string', description: 'The build brief (plan) this disclosure belongs to. Required — every disclosure is bound to the brief that produced it.' },
        title: { type: 'string' },
        context: { type: 'string', description: 'The what/why/what-it-touched, in plain English.' },
        tags: { type: 'array', items: { type: 'string' }, description: '"judgment-call" is always added automatically; pass additional tags here.' },
        asked_by: { type: 'string', description: 'Optional identifier for the posting build chat/session.' },
        plain_summary: { type: 'string', description: 'One-sentence plain-English summary of this disclosure, for Charles. Optional but encouraged — omitting it never rejects the call, just triggers a soft warning in the response.' },
        action_needed: { type: 'string', enum: ['needs-charles', 'needs-design-check', 'fyi'], description: 'What kind of attention this disclosure needs. Defaults to "fyi" if omitted or unrecognized — never rejected for a missing value.' },
      },
      required: ['project_slug', 'plan_id', 'title', 'context'],
    },
  },
  {
    name: 'list_judgment_calls',
    description: 'List disclosures posted to the build-to-Charles Q-channel for a project — the "Calls to review" inbox. Defaults to status=noted (the unreviewed, actionable inbox); pass status="all" to see the full disclosure history including already-disposed items. Never includes blocking questions (origin build/charles-directed) — use this only for the build-judgment disclosure channel.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        status: { type: 'string', description: 'Filter by status: "noted" (default — the review inbox), "reviewed-agree", "reviewed-corrected", or "all".' },
      },
      required: ['project_slug'],
    },
  },
  {
    name: 'list_questions',
    description: 'List BLOCKING questions from the build-to-Charles Q-channel — the questions lane (origin build/charles-directed), whose statuses run open → answered/discussing → resolved. Defaults to the active queue (open + discussing); pass status="all" for the full history, or an exact status to filter. project_slug is OPTIONAL here, unlike the other list tools: omit it to read the blocking queue across every project in one call, and every row comes back labeled with its own project_slug. NEVER returns disclosures (origin build-judgment) — those are a separate, born-non-blocking channel with its own reader, list_judgment_calls; use that tool, not this one, for the "Calls to review" inbox.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string', description: 'Optional — omit to query across all projects.' },
        status: { type: 'string', description: 'Filter by status: omit for open+discussing (default, the active queue), or pass open/answered/discussing/resolved/all.' },
      },
    },
  },
  {
    name: 'dispose_judgment_call',
    description: 'Mark a disclosure reviewed: reviewed-agree (a DA chat looked, concurs, nothing more to do) or reviewed-corrected (a DA chat disagreed and logged a correcting Decision — linked_decision is required in that case, mirroring the resolve-needs-decision rule on blocking questions). Appends a message to the disclosure\'s thread recording what the reviewer did. Operates only on build-judgment-origin rows.',
    inputSchema: {
      type: 'object',
      properties: {
        display_id: { type: 'string', description: 'The disclosure\'s display_id, e.g. CBR-J-003. Globally unique — always cite in full.' },
        disposition: { type: 'string', enum: ['reviewed-agree', 'reviewed-corrected'] },
        linked_decision: { type: 'string', description: 'Required when disposition is reviewed-corrected. The id of the correcting Decision.' },
        resolved_decision_project: { type: 'string', description: 'Project slug the linked decision lives on, if different from the disclosure\'s own project.' },
        message: { type: 'string', description: 'What the reviewer found/decided — appended to the disclosure\'s message thread.' },
        author: { type: 'string', description: 'Who is reviewing. Defaults to "da".' },
      },
      required: ['display_id', 'disposition', 'message'],
    },
  },
] as const;
