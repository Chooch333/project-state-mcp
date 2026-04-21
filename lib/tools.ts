// Tool schemas exposed to MCP clients.
// Each entry defines name, description, and input schema (JSON Schema).

export const TOOLS = [
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
    description: 'Timeline of what happened in a date range. Returns a chronological list of events: decisions added/superseded, assumptions added/confirmed/invalidated, blockers raised/resolved, next_moves added/completed, plans added/status-changed, notes added, lessons added, status snapshots written. Use when the person asks anything like "what did we do last week," "catch me up on X since Wednesday," "what has changed in the last 4 days," "what happened on this project recently." Default window is the last 7 days if no since or relative_days is given.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string', description: 'Optional: limit to one project. Omit for cross-project activity.' },
        since: { type: 'string', description: 'ISO date/datetime for start of window. If omitted, uses relative_days.' },
        until: { type: 'string', description: 'ISO date/datetime for end of window. Defaults to now.' },
        relative_days: { type: 'number', description: 'Shortcut for since = now - N days. Default 7. Ignored if since is set.' },
        entity_types: {
          type: 'array',
          items: { type: 'string', enum: ['decision', 'assumption', 'blocker', 'next_move', 'plan', 'snapshot', 'note', 'lesson'] },
          description: 'Optional: filter to specific entity types.',
        },
        event_types: {
          type: 'array',
          items: { type: 'string', enum: ['added', 'completed', 'resolved', 'confirmed', 'invalidated', 'superseded', 'plan_status_changed'] },
          description: 'Optional: filter to specific event types.',
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
    description: 'Semantic search across all project-state content. Returns the most relevant rows by meaning, not just keyword match.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        project_slug: { type: 'string' },
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
    description: 'Exact-tag retrieval across all entity types. Faster and deterministic compared to search_state.',
    inputSchema: {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' } },
        match_mode: { type: 'string', enum: ['any', 'all'], description: 'Default: any.' },
        project_slug: { type: 'string' },
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
    description: 'Register a new project in the state database.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        repo_url: { type: 'string' },
        supabase_project_id: { type: 'string' },
        vercel_project_id: { type: 'string' },
      },
      required: ['slug', 'name'],
    },
  },
  {
    name: 'add_note',
    description: 'Low-friction capture. Use for anything worth remembering that does not yet fit a structured entity.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        content: { type: 'string' },
        topic: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
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
    description: 'Record a retrospective observation.',
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
      },
      required: ['project_slug', 'situation', 'lesson', 'source'],
    },
  },
  {
    name: 'log_decision',
    description: 'Record a closed decision with rationale. Immutable once written; to change, use supersede_decision.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        title: { type: 'string' },
        rationale: { type: 'string' },
        alternatives_considered: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
      },
      required: ['project_slug', 'title', 'rationale', 'source'],
    },
  },
  {
    name: 'supersede_decision',
    description: 'Replace an existing decision with a new one. The old decision remains in history. You must supply BOTH new_rationale (why the new decision is right on its own terms) AND change_reason (why you are moving from the old decision to the new one). The change_reason creates the breadcrumb trail so future readers can see how the thinking evolved — without it, the supersession chain loses its meaning.',
    inputSchema: {
      type: 'object',
      properties: {
        old_decision_id: { type: 'string' },
        new_title: { type: 'string' },
        new_rationale: { type: 'string', description: 'Why the new decision is right on its own terms.' },
        new_alternatives_considered: { type: 'string' },
        change_reason: { type: 'string', description: 'Why we are moving from the old decision to this new one. What changed or became clear. This is REQUIRED.' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
      },
      required: ['old_decision_id', 'new_title', 'new_rationale', 'change_reason', 'source'],
    },
  },
  {
    name: 'get_decision_chain',
    description: 'Walk the supersession history for a decision. Given any decision ID, returns the full chain: every predecessor decision (walking backward via supersedes pointers) and every successor decision (walking forward by finding decisions that supersede this one). Each transition shows the change_reason, so you can see how thinking evolved. Use when the person asks "how did we land on X," "what was the original decision about X," "why did we change from Y to Z," or anything about a decision''s history.',
    inputSchema: {
      type: 'object',
      properties: {
        decision_id: { type: 'string', description: 'Any decision in the chain — the walker finds both ancestors and descendants.' },
      },
      required: ['decision_id'],
    },
  },
  {
    name: 'add_assumption',
    description: 'Record an active assumption with alternatives.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        statement: { type: 'string' },
        alternatives: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
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
    description: 'Log an open question or external dependency blocking progress.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        question: { type: 'string' },
        context: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
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
    description: 'Add a concrete next action.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['urgent', 'normal', 'someday'] },
        estimated_effort: { type: 'string', enum: ['small', 'medium', 'large'] },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
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
    description: 'Store a build plan document.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
      },
      required: ['project_slug', 'title', 'content', 'source'],
    },
  },
  {
    name: 'update_plan_status',
    description: 'Transition a plan through its lifecycle.',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string' },
        new_status: { type: 'string', enum: ['blessed', 'executing', 'complete', 'abandoned'] },
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
    name: 'write_status_snapshot',
    description: 'Write a brief narrative summary of where the project is right now.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        narrative: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
      },
      required: ['project_slug', 'narrative', 'source'],
    },
  },
] as const;
