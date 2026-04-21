import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase, resolveProjectId } from './supabase';
import { embed, toPgVector, composeEmbeddingText } from './embeddings';

type Args = Record<string, any>;

// Normalize incoming tags: coerce undefined/null to [], strip empty strings, deduplicate, lowercase for consistency.
function normTags(tags: any): string[] {
  if (!Array.isArray(tags)) return [];
  const cleaned = tags
    .filter((t) => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.trim().toLowerCase());
  return Array.from(new Set(cleaned));
}

// Table names per entity type (single source of truth)
const ENTITY_TABLE: Record<string, string> = {
  decision: 'decisions',
  assumption: 'assumptions',
  blocker: 'blockers',
  next_move: 'next_moves',
  plan: 'plans',
  snapshot: 'status_snapshots',
  note: 'notes',
  lesson: 'lessons',
};

export async function callTool(name: string, args: Args): Promise<string> {
  const supabase = getSupabase();

  switch (name) {
    case 'list_projects':
      return listProjects(supabase, args);
    case 'get_project_state':
      return getProjectState(supabase, args);
    case 'search_state':
      return searchState(supabase, args);
    case 'find_by_tags':
      return findByTags(supabase, args);
    case 'list_tags':
      return listTags(supabase, args);
    case 'add_tags':
      return addTagsToRow(supabase, args);
    case 'create_project':
      return createProject(supabase, args);
    case 'add_note':
      return addNote(supabase, args);
    case 'promote_note':
      return promoteNote(supabase, args);
    case 'add_lesson':
      return addLesson(supabase, args);
    case 'log_decision':
      return logDecision(supabase, args);
    case 'supersede_decision':
      return supersedeDecision(supabase, args);
    case 'add_assumption':
      return addAssumption(supabase, args);
    case 'update_assumption':
      return updateAssumption(supabase, args);
    case 'add_blocker':
      return addBlocker(supabase, args);
    case 'resolve_blocker':
      return resolveBlocker(supabase, args);
    case 'add_next_move':
      return addNextMove(supabase, args);
    case 'complete_next_move':
      return completeNextMove(supabase, args);
    case 'write_plan':
      return writePlan(supabase, args);
    case 'update_plan_status':
      return updatePlanStatus(supabase, args);
    case 'get_plan':
      return getPlan(supabase, args);
    case 'write_status_snapshot':
      return writeStatusSnapshot(supabase, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─────────────────────────────────────────────────────────
// Project listing and state bootstrap
// ─────────────────────────────────────────────────────────

async function listProjects(supabase: SupabaseClient, args: Args): Promise<string> {
  const includeArchived = args.include_archived === true;
  let query = supabase.from('projects').select('slug, name, description, status, repo_url, supabase_project_id, vercel_project_id');
  if (!includeArchived) query = query.neq('status', 'archived');
  const { data, error } = await query.order('name');
  if (error) throw new Error(error.message);
  return JSON.stringify(data ?? [], null, 2);
}

async function getProjectState(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const notesLimit = args.recent_notes_limit ?? 20;
  const lessonsLimit = args.recent_lessons_limit ?? 10;

  const [decisions, assumptions, blockers, nextMoves, snapshot, notes, lessons, project] = await Promise.all([
    supabase.from('decisions').select('id, title, rationale, alternatives_considered, tags, decided_at, source').eq('project_id', projectId).is('supersedes', null).order('decided_at', { ascending: false }),
    supabase.from('assumptions').select('id, statement, alternatives, tags, source, created_at').eq('project_id', projectId).eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('blockers').select('id, question, context, tags, source, created_at').eq('project_id', projectId).is('resolved_at', null).order('created_at', { ascending: false }),
    supabase.from('next_moves').select('id, description, priority, estimated_effort, tags, source, created_at').eq('project_id', projectId).is('completed_at', null).order('created_at', { ascending: false }),
    supabase.from('status_snapshots').select('narrative, tags, source, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('notes').select('id, content, topic, tags, source, created_at, promoted_to_entity, promoted_to_id').eq('project_id', projectId).order('created_at', { ascending: false }).limit(notesLimit),
    supabase.from('lessons').select('id, situation, lesson, applies_to, severity, tags, source, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(lessonsLimit),
    supabase.from('projects').select('name, description, repo_url, supabase_project_id, vercel_project_id').eq('id', projectId).maybeSingle(),
  ]);

  const errors = [decisions.error, assumptions.error, blockers.error, nextMoves.error, snapshot.error, notes.error, lessons.error, project.error].filter(Boolean);
  if (errors.length) throw new Error(errors.map((e) => e!.message).join('; '));

  const state = {
    project: project.data,
    latest_snapshot: snapshot.data,
    active_decisions: decisions.data ?? [],
    active_assumptions: assumptions.data ?? [],
    open_blockers: blockers.data ?? [],
    open_next_moves: nextMoves.data ?? [],
    recent_notes: notes.data ?? [],
    recent_lessons: lessons.data ?? [],
    counts: {
      decisions: decisions.data?.length ?? 0,
      assumptions: assumptions.data?.length ?? 0,
      blockers: blockers.data?.length ?? 0,
      next_moves: nextMoves.data?.length ?? 0,
      notes: notes.data?.length ?? 0,
      lessons: lessons.data?.length ?? 0,
    },
  };
  return JSON.stringify(state, null, 2);
}

// ─────────────────────────────────────────────────────────
// Semantic search across all entity types
// ─────────────────────────────────────────────────────────

async function searchState(supabase: SupabaseClient, args: Args): Promise<string> {
  const query: string = args.query;
  if (!query?.trim()) throw new Error('query is required');

  const limit = Math.max(1, Math.min(args.limit ?? 10, 50));
  const entityTypes: string[] | undefined = args.entity_types;

  const queryEmbedding = await embed(query);
  const hasEmbedding = queryEmbedding !== null;

  let projectId: string | null = null;
  if (args.project_slug) {
    projectId = await resolveProjectId(supabase, args.project_slug);
  }

  const allowed = (t: string) => !entityTypes || entityTypes.includes(t);
  const results: any[] = [];

  const runSearch = async (
    entityType: string,
    table: string,
    selectFields: string,
    orderField: string
  ) => {
    if (!allowed(entityType)) return;

    let q = supabase.from(table).select(`${selectFields}, embedding, tags, created_at`);
    if (projectId) q = q.eq('project_id', projectId);

    const { data, error } = await q.order(orderField, { ascending: false }).limit(200);
    if (error) throw new Error(`${entityType} search: ${error.message}`);
    if (!data) return;

    for (const row of data) {
      let score = 0;
      if (hasEmbedding && row.embedding) {
        score = cosineSimilarity(queryEmbedding!, parseEmbedding(row.embedding));
      } else {
        const content = extractContent(entityType, row);
        const lowerQ = query.toLowerCase();
        score = content.toLowerCase().includes(lowerQ) ? 0.5 : 0.0;
      }
      if (score > 0.3) {
        const { embedding, ...rest } = row;
        results.push({
          entity_type: entityType,
          similarity: Number(score.toFixed(4)),
          ...rest,
        });
      }
    }
  };

  await Promise.all([
    runSearch('decision', 'decisions', 'id, title, rationale, alternatives_considered, source, decided_at', 'decided_at'),
    runSearch('assumption', 'assumptions', 'id, statement, alternatives, status, source', 'created_at'),
    runSearch('blocker', 'blockers', 'id, question, context, answer, resolved_at, source', 'created_at'),
    runSearch('next_move', 'next_moves', 'id, description, priority, estimated_effort, completed_at, source', 'created_at'),
    runSearch('plan', 'plans', 'id, title, status, source', 'created_at'),
    runSearch('snapshot', 'status_snapshots', 'id, narrative, source', 'created_at'),
    runSearch('note', 'notes', 'id, content, topic, promoted_to_entity, promoted_to_id, source', 'created_at'),
    runSearch('lesson', 'lessons', 'id, situation, lesson, applies_to, severity, source', 'created_at'),
  ]);

  results.sort((a, b) => b.similarity - a.similarity);
  const top = results.slice(0, limit);

  return JSON.stringify({
    query,
    method: hasEmbedding ? 'semantic' : 'keyword-fallback',
    result_count: top.length,
    results: top,
  }, null, 2);
}

// ─────────────────────────────────────────────────────────
// Tag-based retrieval
// ─────────────────────────────────────────────────────────

async function findByTags(supabase: SupabaseClient, args: Args): Promise<string> {
  const inputTags = normTags(args.tags);
  if (inputTags.length === 0) throw new Error('tags array must contain at least one non-empty tag');

  const matchMode = args.match_mode === 'all' ? 'all' : 'any';
  const entityTypes: string[] | undefined = args.entity_types;
  const limit = Math.max(1, Math.min(args.limit ?? 50, 200));

  let projectId: string | null = null;
  if (args.project_slug) {
    projectId = await resolveProjectId(supabase, args.project_slug);
  }

  const allowed = (t: string) => !entityTypes || entityTypes.includes(t);
  const results: any[] = [];

  const runTagQuery = async (
    entityType: string,
    table: string,
    selectFields: string,
    orderField: string
  ) => {
    if (!allowed(entityType)) return;

    let q = supabase.from(table).select(`${selectFields}, tags, created_at`);
    if (projectId) q = q.eq('project_id', projectId);
    // Postgres array operators via Supabase:
    //   @> (contains) for match_mode=all  — row.tags contains ALL inputTags
    //   && (overlaps) for match_mode=any  — row.tags overlaps with inputTags
    if (matchMode === 'all') {
      q = q.contains('tags', inputTags);
    } else {
      q = q.overlaps('tags', inputTags);
    }

    const { data, error } = await q.order(orderField, { ascending: false }).limit(limit);
    if (error) throw new Error(`${entityType} find_by_tags: ${error.message}`);
    if (!data) return;

    for (const row of data) {
      results.push({ entity_type: entityType, ...row });
    }
  };

  await Promise.all([
    runTagQuery('decision', 'decisions', 'id, title, rationale, alternatives_considered, source, decided_at', 'decided_at'),
    runTagQuery('assumption', 'assumptions', 'id, statement, alternatives, status, source', 'created_at'),
    runTagQuery('blocker', 'blockers', 'id, question, context, answer, resolved_at, source', 'created_at'),
    runTagQuery('next_move', 'next_moves', 'id, description, priority, estimated_effort, completed_at, source', 'created_at'),
    runTagQuery('plan', 'plans', 'id, title, status, source', 'created_at'),
    runTagQuery('snapshot', 'status_snapshots', 'id, narrative, source', 'created_at'),
    runTagQuery('note', 'notes', 'id, content, topic, promoted_to_entity, promoted_to_id, source', 'created_at'),
    runTagQuery('lesson', 'lessons', 'id, situation, lesson, applies_to, severity, source', 'created_at'),
  ]);

  return JSON.stringify({
    match_mode: matchMode,
    tags: inputTags,
    result_count: results.length,
    results,
  }, null, 2);
}

async function listTags(supabase: SupabaseClient, args: Args): Promise<string> {
  let projectId: string | null = null;
  if (args.project_slug) {
    projectId = await resolveProjectId(supabase, args.project_slug);
  }

  // For each entity table, pull tags arrays and aggregate.
  const tables = Object.values(ENTITY_TABLE);
  const tagCounts = new Map<string, number>();

  for (const table of tables) {
    let q = supabase.from(table).select('tags');
    if (projectId) q = q.eq('project_id', projectId);
    const { data, error } = await q;
    if (error) throw new Error(`${table} list_tags: ${error.message}`);
    if (!data) continue;

    for (const row of data) {
      const rowTags: string[] = row.tags ?? [];
      for (const tag of rowTags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }
  }

  const sorted = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));

  return JSON.stringify({ project_slug: args.project_slug ?? 'all', tag_count: sorted.length, tags: sorted }, null, 2);
}

async function addTagsToRow(supabase: SupabaseClient, args: Args): Promise<string> {
  const entityType: string = args.entity_type;
  const id: string = args.id;
  const newTags = normTags(args.tags);

  const table = ENTITY_TABLE[entityType];
  if (!table) throw new Error(`Unknown entity_type: ${entityType}`);
  if (newTags.length === 0) throw new Error('tags array must contain at least one non-empty tag');

  // Fetch existing tags, merge, dedupe, update
  const { data: row, error: fetchErr } = await supabase.from(table).select('tags').eq('id', id).maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!row) throw new Error(`${entityType} not found: ${id}`);

  const merged = Array.from(new Set([...(row.tags ?? []), ...newTags]));
  const { data, error } = await supabase.from(table).update({ tags: merged }).eq('id', id).select('id, tags').single();
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function parseEmbedding(raw: any): number[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const clean = raw.trim().replace(/^\[|\]$/g, '');
      return clean.split(',').map(Number).filter(n => !isNaN(n));
    } catch {
      return [];
    }
  }
  return [];
}

function extractContent(entityType: string, row: any): string {
  switch (entityType) {
    case 'decision': return [row.title, row.rationale].filter(Boolean).join(' ');
    case 'assumption': return [row.statement, row.alternatives].filter(Boolean).join(' ');
    case 'blocker': return [row.question, row.context, row.answer].filter(Boolean).join(' ');
    case 'next_move': return row.description ?? '';
    case 'plan': return row.title ?? '';
    case 'snapshot': return row.narrative ?? '';
    case 'note': return [row.topic, row.content].filter(Boolean).join(' ');
    case 'lesson': return [row.situation, row.lesson, row.applies_to].filter(Boolean).join(' ');
    default: return '';
  }
}

// ─────────────────────────────────────────────────────────
// Project registration
// ─────────────────────────────────────────────────────────

async function createProject(supabase: SupabaseClient, args: Args): Promise<string> {
  const { data, error } = await supabase.from('projects').insert({
    slug: args.slug,
    name: args.name,
    description: args.description ?? null,
    repo_url: args.repo_url ?? null,
    supabase_project_id: args.supabase_project_id ?? null,
    vercel_project_id: args.vercel_project_id ?? null,
  }).select().single();
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}

// ─────────────────────────────────────────────────────────
// Notes (low-friction capture)
// ─────────────────────────────────────────────────────────

async function addNote(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const embedding = await embed(composeEmbeddingText.note(args.content, args.topic));
  const tags = normTags(args.tags);
  const { data, error } = await supabase.from('notes').insert({
    project_id: projectId,
    content: args.content,
    topic: args.topic ?? null,
    tags,
    source: args.source,
    embedding: toPgVector(embedding),
  }).select('id, content, topic, tags, source, created_at').single();
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}

async function promoteNote(supabase: SupabaseClient, args: Args): Promise<string> {
  const { note_id, target_entity, source } = args;

  // Fetch the note (including tags and topic for carryover)
  const { data: note, error: noteErr } = await supabase.from('notes').select('project_id, tags, topic, promoted_to_entity, promoted_to_id').eq('id', note_id).maybeSingle();
  if (noteErr) throw new Error(noteErr.message);
  if (!note) throw new Error(`Note not found: ${note_id}`);
  if (note.promoted_to_entity) throw new Error(`Note already promoted to ${note.promoted_to_entity}:${note.promoted_to_id}`);

  const projectId = note.project_id;
  // Default: carry over note's tags (including topic as tag if present) unless caller supplied tags
  const incoming = normTags(args.tags);
  const carryoverTags = note.tags ?? [];
  const topicAsTag = note.topic ? [note.topic.toLowerCase()] : [];
  const tags = incoming.length > 0 ? incoming : Array.from(new Set([...carryoverTags, ...topicAsTag]));

  let newRow: any;

  if (target_entity === 'decision') {
    if (!args.title || !args.rationale) throw new Error('title and rationale required for decision promotion');
    const emb = await embed(composeEmbeddingText.decision(args.title, args.rationale, args.alternatives_considered));
    const r = await supabase.from('decisions').insert({
      project_id: projectId,
      title: args.title,
      rationale: args.rationale,
      alternatives_considered: args.alternatives_considered ?? null,
      tags,
      source,
      embedding: toPgVector(emb),
    }).select().single();
    if (r.error) throw new Error(r.error.message);
    newRow = r.data;
  } else if (target_entity === 'assumption') {
    if (!args.statement) throw new Error('statement required for assumption promotion');
    const emb = await embed(composeEmbeddingText.assumption(args.statement, args.alternatives));
    const r = await supabase.from('assumptions').insert({
      project_id: projectId,
      statement: args.statement,
      alternatives: args.alternatives ?? null,
      tags,
      source,
      embedding: toPgVector(emb),
    }).select().single();
    if (r.error) throw new Error(r.error.message);
    newRow = r.data;
  } else if (target_entity === 'blocker') {
    if (!args.question) throw new Error('question required for blocker promotion');
    const emb = await embed(composeEmbeddingText.blocker(args.question, args.context));
    const r = await supabase.from('blockers').insert({
      project_id: projectId,
      question: args.question,
      context: args.context ?? null,
      tags,
      source,
      embedding: toPgVector(emb),
    }).select().single();
    if (r.error) throw new Error(r.error.message);
    newRow = r.data;
  } else if (target_entity === 'next_move') {
    if (!args.description) throw new Error('description required for next_move promotion');
    const emb = await embed(composeEmbeddingText.nextMove(args.description));
    const r = await supabase.from('next_moves').insert({
      project_id: projectId,
      description: args.description,
      priority: args.priority ?? 'normal',
      estimated_effort: args.estimated_effort ?? null,
      tags,
      source,
      embedding: toPgVector(emb),
    }).select().single();
    if (r.error) throw new Error(r.error.message);
    newRow = r.data;
  } else if (target_entity === 'lesson') {
    if (!args.situation || !args.lesson) throw new Error('situation and lesson required for lesson promotion');
    const emb = await embed(composeEmbeddingText.lesson(args.situation, args.lesson, args.applies_to));
    const r = await supabase.from('lessons').insert({
      project_id: projectId,
      situation: args.situation,
      lesson: args.lesson,
      applies_to: args.applies_to ?? null,
      severity: args.severity ?? 'normal',
      tags,
      source,
      embedding: toPgVector(emb),
    }).select().single();
    if (r.error) throw new Error(r.error.message);
    newRow = r.data;
  } else {
    throw new Error(`Invalid target_entity: ${target_entity}`);
  }

  const { error: updateErr } = await supabase.from('notes').update({
    promoted_to_entity: target_entity,
    promoted_to_id: newRow.id,
  }).eq('id', note_id);
  if (updateErr) throw new Error(updateErr.message);

  return JSON.stringify({
    promoted_from_note: note_id,
    promoted_to_entity: target_entity,
    new_row: newRow,
  }, null, 2);
}

// ─────────────────────────────────────────────────────────
// Lessons
// ─────────────────────────────────────────────────────────

async function addLesson(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const embedding = await embed(composeEmbeddingText.lesson(args.situation, args.lesson, args.applies_to));
  const tags = normTags(args.tags);
  const { data, error } = await supabase.from('lessons').insert({
    project_id: projectId,
    situation: args.situation,
    lesson: args.lesson,
    applies_to: args.applies_to ?? null,
    severity: args.severity ?? 'normal',
    tags,
    source: args.source,
    embedding: toPgVector(embedding),
  }).select('id, situation, lesson, applies_to, severity, tags, source, created_at').single();
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}

// ─────────────────────────────────────────────────────────
// Decisions
// ─────────────────────────────────────────────────────────

async function logDecision(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const embedding = await embed(composeEmbeddingText.decision(args.title, args.rationale, args.alternatives_considered));
  const tags = normTags(args.tags);
  const { data, error } = await supabase.from('decisions').insert({
    project_id: projectId,
    title: args.title,
    rationale: args.rationale,
    alternatives_considered: args.alternatives_considered ?? null,
    tags,
    source: args.source,
    embedding: toPgVector(embedding),
  }).select('id, title, rationale, alternatives_considered, tags, source, decided_at').single();
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}

async function supersedeDecision(supabase: SupabaseClient, args: Args): Promise<string> {
  const { data: oldRow, error: oldErr } = await supabase.from('decisions').select('project_id, tags').eq('id', args.old_decision_id).maybeSingle();
  if (oldErr) throw new Error(oldErr.message);
  if (!oldRow) throw new Error(`Decision not found: ${args.old_decision_id}`);

  const embedding = await embed(composeEmbeddingText.decision(args.new_title, args.new_rationale, args.new_alternatives_considered));
  const incoming = normTags(args.tags);
  const tags = incoming.length > 0 ? incoming : (oldRow.tags ?? []);
  const { data, error } = await supabase.from('decisions').insert({
    project_id: oldRow.project_id,
    title: args.new_title,
    rationale: args.new_rationale,
    alternatives_considered: args.new_alternatives_considered ?? null,
    tags,
    source: args.source,
    supersedes: args.old_decision_id,
    embedding: toPgVector(embedding),
  }).select('id, title, rationale, tags, source, supersedes, decided_at').single();
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}

// ─────────────────────────────────────────────────────────
// Assumptions
// ─────────────────────────────────────────────────────────

async function addAssumption(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const embedding = await embed(composeEmbeddingText.assumption(args.statement, args.alternatives));
  const tags = normTags(args.tags);
  const { data, error } = await supabase.from('assumptions').insert({
    project_id: projectId,
    statement: args.statement,
    alternatives: args.alternatives ?? null,
    tags,
    source: args.source,
    embedding: toPgVector(embedding),
  }).select('id, statement, alternatives, status, tags, source, created_at').single();
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}

async function updateAssumption(supabase: SupabaseClient, args: Args): Promise<string> {
  const { data, error } = await supabase.from('assumptions').update({
    status: args.new_status,
    status_changed_at: new Date().toISOString(),
    status_reason: args.reason,
  }).eq('id', args.assumption_id).select().single();
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}

// ─────────────────────────────────────────────────────────
// Blockers
// ─────────────────────────────────────────────────────────

async function addBlocker(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const embedding = await embed(composeEmbeddingText.blocker(args.question, args.context));
  const tags = normTags(args.tags);
  const { data, error } = await supabase.from('blockers').insert({
    project_id: projectId,
    question: args.question,
    context: args.context ?? null,
    tags,
    source: args.source,
    embedding: toPgVector(embedding),
  }).select('id, question, context, tags, source, created_at').single();
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}

async function resolveBlocker(supabase: SupabaseClient, args: Args): Promise<string> {
  const { data, error } = await supabase.from('blockers').update({
    answer: args.answer,
    resolved_at: new Date().toISOString(),
  }).eq('id', args.blocker_id).select().single();
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}

// ─────────────────────────────────────────────────────────
// Next moves
// ─────────────────────────────────────────────────────────

async function addNextMove(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const embedding = await embed(composeEmbeddingText.nextMove(args.description));
  const tags = normTags(args.tags);
  const { data, error } = await supabase.from('next_moves').insert({
    project_id: projectId,
    description: args.description,
    priority: args.priority ?? 'normal',
    estimated_effort: args.estimated_effort ?? null,
    tags,
    source: args.source,
    embedding: toPgVector(embedding),
  }).select('id, description, priority, estimated_effort, tags, source, created_at').single();
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}

async function completeNextMove(supabase: SupabaseClient, args: Args): Promise<string> {
  const update: any = { completed_at: new Date().toISOString() };
  if (args.completed_by_plan_id) update.completed_by_plan_id = args.completed_by_plan_id;
  const { data, error } = await supabase.from('next_moves').update(update).eq('id', args.next_move_id).select().single();
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}

// ─────────────────────────────────────────────────────────
// Plans
// ─────────────────────────────────────────────────────────

async function writePlan(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const embedding = await embed(composeEmbeddingText.plan(args.title, args.content));
  const tags = normTags(args.tags);
  const { data, error } = await supabase.from('plans').insert({
    project_id: projectId,
    title: args.title,
    content: args.content,
    tags,
    source: args.source,
    embedding: toPgVector(embedding),
  }).select('id, title, status, tags, source, created_at').single();
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}

async function updatePlanStatus(supabase: SupabaseClient, args: Args): Promise<string> {
  const update: any = { status: args.new_status };
  if (args.new_status === 'blessed') update.blessed_at = new Date().toISOString();
  if (args.new_status === 'complete' || args.new_status === 'abandoned') update.completed_at = new Date().toISOString();
  if (args.executor_report) update.executor_report = args.executor_report;

  const { data, error } = await supabase.from('plans').update(update).eq('id', args.plan_id).select().single();
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}

async function getPlan(supabase: SupabaseClient, args: Args): Promise<string> {
  if (args.plan_id) {
    const { data, error } = await supabase.from('plans').select('*').eq('id', args.plan_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Plan not found: ${args.plan_id}`);
    const { embedding, ...rest } = data;
    return JSON.stringify(rest, null, 2);
  }
  if (args.project_slug) {
    const projectId = await resolveProjectId(supabase, args.project_slug);
    const { data, error } = await supabase.from('plans').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`No plans found for project: ${args.project_slug}`);
    const { embedding, ...rest } = data;
    return JSON.stringify(rest, null, 2);
  }
  throw new Error('Must provide either plan_id or project_slug.');
}

// ─────────────────────────────────────────────────────────
// Status snapshots
// ─────────────────────────────────────────────────────────

async function writeStatusSnapshot(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const embedding = await embed(composeEmbeddingText.snapshot(args.narrative));
  const tags = normTags(args.tags);
  const { data, error } = await supabase.from('status_snapshots').insert({
    project_id: projectId,
    narrative: args.narrative,
    tags,
    source: args.source,
    embedding: toPgVector(embedding),
  }).select('id, narrative, tags, source, created_at').single();
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}
