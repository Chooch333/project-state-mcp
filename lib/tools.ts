// Tool schemas exposed to MCP clients.
// Each entry defines name, description, and input schema (JSON Schema).

export const TOOLS = [
  {
    name: 'list_projects',
    description: 'List all projects tracked in the state database. Returns slug, name, status, and key infrastructure IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        include_archived: { type: 'boolean', description: 'Include archived projects in results. Defaults to false.' },
      },
    },
  },
  {
    name: 'get_project_state',
    description: 'Pull the full current state of a project: active decisions, active assumptions, open blockers, open next_moves, the latest status snapshot, recent notes, and recent lessons. This is the "bootstrap a new chat" call.',
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
    description: 'Semantic search across all project-state content. Returns the most relevant rows by meaning, not just keyword match. Use when you need to find things related to a topic without knowing exactly where they were logged. For exact-tag retrieval (faster, deterministic), use find_by_tags instead.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for. A question, topic, or description.' },
        project_slug: { type: 'string', description: 'Optional: limit search to one project.' },
        entity_types: {
          type: 'array',
          items: { type: 'string', enum: ['decision', 'assumption', 'blocker', 'next_move', 'plan', 'snapshot', 'note', 'lesson'] },
          description: 'Optional: filter to specific entity types.',
        },
        limit: { type: 'number', description: 'Max results. Default 10.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'find_by_tags',
    description: 'Exact-tag retrieval across all entity types. Faster and deterministic compared to search_state. Use when you have a specific tag and want all rows matching.',
    inputSchema: {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' }, description: 'One or more tags to match.' },
        match_mode: { type: 'string', enum: ['any', 'all'], description: 'any = row has at least one of the given tags; all = row has every given tag. Default: any.' },
        project_slug: { type: 'string', description: 'Optional: limit to one project.' },
        entity_types: {
          type: 'array',
          items: { type: 'string', enum: ['decision', 'assumption', 'blocker', 'next_move', 'plan', 'snapshot', 'note', 'lesson'] },
          description: 'Optional: filter to specific entity types.',
        },
        limit: { type: 'number', description: 'Max results per entity type. Default 50.' },
      },
      required: ['tags'],
    },
  },
  {
    name: 'list_tags',
    description: 'List all tags currently used across a project (or all projects), with counts. Useful for discovering what tags already exist so you stay consistent.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string', description: 'Optional: limit to one project.' },
      },
    },
  },
  {
    name: 'add_tags',
    description: 'Add tags to an existing row without changing any other content. Use when you realize after logging that a row should carry additional tags.',
    inputSchema: {
      type: 'object',
      properties: {
        entity_type: { type: 'string', enum: ['decision', 'assumption', 'blocker', 'next_move', 'plan', 'snapshot', 'note', 'lesson'] },
        id: { type: 'string', description: 'The row id.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to add. Duplicates with existing tags are ignored.' },
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
        slug: { type: 'string', description: 'Stable, kebab-case identifier.' },
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
    description: 'Low-friction capture. Use for anything worth remembering that does not yet fit a structured entity. Can be promoted later via promote_note.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string' },
        content: { type: 'string', description: 'The note text. Any length.' },
        topic: { type: 'string', description: 'Optional single-string topic label.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for retrieval (multi-tag supported).' },
        source: { type: 'string' },
      },
      required: ['project_slug', 'content', 'source'],
    },
  },
  {
    name: 'promote_note',
    description: 'Convert an existing note into a structured entity. The original note is preserved with a pointer to the promoted entity. Tags carry over unless overridden.',
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
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional: override tags for the promoted row. Default: copy from the note.' },
        source: { type: 'string' },
      },
      required: ['note_id', 'target_entity', 'source'],
    },
  },
  {
    name: 'add_lesson',
    description: 'Record a retrospective observation: what happened, what we learned.',
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
    description: 'Replace an existing decision with a new one. The old decision remains in history.',
    inputSchema: {
      type: 'object',
      properties: {
        old_decision_id: { type: 'string' },
        new_title: { type: 'string' },
        new_rationale: { type: 'string' },
        new_alternatives_considered: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' },
      },
      required: ['old_decision_id', 'new_title', 'new_rationale', 'source'],
    },
  },
  {
    name: 'add_assumption',
    description: 'Record an active assumption with alternatives if the assumption turns out wrong.',
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
    description: 'Change the status of an assumption to confirmed or invalidated, with a reason.',
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
    description: 'Add a concrete next action to take on the project.',
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
    description: 'Transition a plan through its lifecycle: draft → blessed → executing → complete/abandoned.',
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
