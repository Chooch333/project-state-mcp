import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase, resolveProjectId } from './supabase';
import { embed, toPgVector, composeEmbeddingText } from './embeddings';
import {
  normalizeTags,
  normalizeAndReconcile,
  expandForQuery,
} from './tags';

type Args = Record<string, any>;

// Kept as a thin fallback for call sites that don't need DB-side reconciliation.
// Most write paths should use normalizeAndReconcile (async) instead.
function normTags(tags: any): string[] {
  return normalizeTags(tags);
}

/**
 * Parse an optional ISO 8601 timestamp override.
 * Returns:
 *   - null if the arg is undefined/null/empty (caller should use DB default now())
 *   - a valid ISO string if the arg parses
 * Throws on malformed input — we prefer an explicit error to a silent default.
 */
function parseOverrideTimestamp(raw: unknown, fieldName: string): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') {
    throw new Error(`${fieldName} must be an ISO 8601 string if provided (got ${typeof raw})`);
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) {
    throw new Error(`${fieldName} is not a valid ISO 8601 timestamp: "${raw}"`);
  }
  return d.toISOString();
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
    case 'get_project_dashboard':
      return getProjectDashboard(supabase, args);
    case 'get_activity':
      return getActivity(supabase, args);
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
    case 'get_decision_chain':
      return getDecisionChain(supabase, args);
    case 'update_change_reason':
      return updateChangeReason(supabase, args);
    case 'update_provenance':
      return updateProvenance(supabase, args);
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
    case 'update_plan_content':
      return updatePlanContent(supabase, args);
    case 'get_plan_revisions':
      return getPlanRevisions(supabase, args);
    case 'update_plan_status':
      return updatePlanStatus(supabase, args);
    case 'get_plan':
      return getPlan(supabase, args);
    case 'list_plans':
      return listPlans(supabase, args);
    case 'write_status_snapshot':
      return writeStatusSnapshot(supabase, args);
    case 'describe_capabilities':
      return describeCapabilities(supabase, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─────────────────────────────────────────────────────────
// AT-A-GLANCE DASHBOARD
// Fixed-shape summary for natural-language queries like
// "how is X going" or "what's up with X".
// ─────────────────────────────────────────────────────────

async function getProjectDashboard(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    project,
    snapshot,
    allOpenBlockers,
    urgentMoves,
    otherOpenMoves,
    recentDecisions,
    recentNotes,
    recentLessons,
    recentBlockersRaised,
    recentBlockersResolved,
    recentMovesCompleted,
    scaleCounts,
  ] = await Promise.all([
    supabase.from('projects').select('name, description, repo_url, status').eq('id', projectId).maybeSingle(),
    supabase.from('status_snapshots').select('narrative, created_at, source').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('blockers').select('id, display_id, question, context, tags, created_at').eq('project_id', projectId).is('resolved_at', null).order('created_at', { ascending: false }),
    supabase.from('next_moves').select('id, display_id, description, priority, estimated_effort, tags, created_at').eq('project_id', projectId).is('completed_at', null).eq('priority', 'urgent').order('created_at', { ascending: false }),
    supabase.from('next_moves').select('id, display_id, description, priority, estimated_effort, tags, created_at').eq('project_id', projectId).is('completed_at', null).neq('priority', 'urgent').order('created_at', { ascending: false }).limit(3),
    supabase.from('decisions').select('id, display_id, title, decided_at').eq('project_id', projectId).is('supersedes', null).gte('decided_at', sevenDaysAgo).order('decided_at', { ascending: false }),
    supabase.from('notes').select('id, display_id, content, topic, tags, created_at').eq('project_id', projectId).gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(10),
    supabase.from('lessons').select('id, display_id, situation, lesson, severity, created_at').eq('project_id', projectId).gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }),
    supabase.from('blockers').select('id, display_id, question, created_at').eq('project_id', projectId).gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }),
    supabase.from('blockers').select('id, display_id, question, resolved_at').eq('project_id', projectId).not('resolved_at', 'is', null).gte('resolved_at', sevenDaysAgo).order('resolved_at', { ascending: false }),
    supabase.from('next_moves').select('id, display_id, description, completed_at').eq('project_id', projectId).not('completed_at', 'is', null).gte('completed_at', sevenDaysAgo).order('completed_at', { ascending: false }),
    // Scale counts — total active entities.
    // Decisions need the full list (not head-only count) so we can filter out
    // any that have been superseded by another decision.
    Promise.all([
      supabase.from('decisions').select('id, supersedes').eq('project_id', projectId),
      supabase.from('assumptions').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('status', 'active'),
      supabase.from('blockers').select('id', { count: 'exact', head: true }).eq('project_id', projectId).is('resolved_at', null),
      supabase.from('next_moves').select('id', { count: 'exact', head: true }).eq('project_id', projectId).is('completed_at', null),
      supabase.from('notes').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      supabase.from('plans').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    ]),
  ]);

  if (!project.data) throw new Error(`Project not found: ${args.project_slug}`);

  const [decisionsAll, assumptionsCt, blockersCt, nextMovesCt, notesCt, lessonsCt, plansCt] = scaleCounts;

  // Active decisions = those not superseded by any other decision.
  const supersededDecIds = new Set((decisionsAll.data ?? []).map((d: any) => d.supersedes).filter(Boolean));
  const activeDecisionsCount = (decisionsAll.data ?? []).filter((d: any) => !supersededDecIds.has(d.id)).length;

  // Synthesize a one-line status if no snapshot exists
  const statusLine =
    snapshot.data?.narrative ??
    `No status snapshot yet. Project has ${activeDecisionsCount} active decisions and ${nextMovesCt.count ?? 0} open next moves.`;

  const statusAge = snapshot.data?.created_at
    ? daysAgo(new Date(snapshot.data.created_at), now)
    : null;

  // Top attention items: open urgent next moves + all open blockers (blockers always count as attention)
  const attention = {
    open_blockers: (allOpenBlockers.data ?? []).map((b) => ({
      id: b.id,
      display_id: b.display_id,
      question: b.question,
      context: b.context,
      tags: b.tags ?? [],
      days_open: daysAgo(new Date(b.created_at), now),
    })),
    urgent_next_moves: (urgentMoves.data ?? []).map((m) => ({
      id: m.id,
      display_id: m.display_id,
      description: m.description,
      estimated_effort: m.estimated_effort,
      tags: m.tags ?? [],
      days_old: daysAgo(new Date(m.created_at), now),
    })),
    other_open_next_moves_sample: (otherOpenMoves.data ?? []).map((m) => ({
      id: m.id,
      display_id: m.display_id,
      description: m.description,
      priority: m.priority,
    })),
  };

  const last_7_days = {
    window: `${sevenDaysAgo} → ${now.toISOString()}`,
    counts: {
      decisions_added: recentDecisions.data?.length ?? 0,
      notes_added: recentNotes.data?.length ?? 0,
      lessons_added: recentLessons.data?.length ?? 0,
      blockers_raised: recentBlockersRaised.data?.length ?? 0,
      blockers_resolved: recentBlockersResolved.data?.length ?? 0,
      next_moves_completed: recentMovesCompleted.data?.length ?? 0,
    },
    decisions: recentDecisions.data ?? [],
    notes_sample: recentNotes.data ?? [],
    lessons: recentLessons.data ?? [],
    blockers_raised: recentBlockersRaised.data ?? [],
    blockers_resolved: recentBlockersResolved.data ?? [],
    next_moves_completed: recentMovesCompleted.data ?? [],
  };

  const scale = {
    active_decisions: activeDecisionsCount,
    active_assumptions: assumptionsCt.count ?? 0,
    open_blockers: blockersCt.count ?? 0,
    open_next_moves: nextMovesCt.count ?? 0,
    notes_total: notesCt.count ?? 0,
    lessons_total: lessonsCt.count ?? 0,
    plans_total: plansCt.count ?? 0,
  };

  const dashboard = {
    project: {
      slug: args.project_slug,
      name: project.data.name,
      description: project.data.description,
      status: project.data.status,
      repo_url: project.data.repo_url,
    },
    status: {
      line: statusLine,
      days_old: statusAge,
      source: snapshot.data?.source ?? null,
    },
    attention,
    last_7_days,
    scale,
    rendered_at: now.toISOString(),
  };

  return JSON.stringify(dashboard, null, 2);
}

function daysAgo(then: Date, now: Date): number {
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

// ─────────────────────────────────────────────────────────
// ACTIVITY TIMELINE
// Chronological list of events across entity types.
// ─────────────────────────────────────────────────────────

async function getActivity(supabase: SupabaseClient, args: Args): Promise<string> {
  // Guardrail: require explicit scope choice.
  if (!args.project_slug && args.all_projects !== true) {
    throw new Error(
      'Scope is required. Pass project_slug to see activity within one project, ' +
      'or pass all_projects=true to explicitly see activity across every project. ' +
      'This guardrail prevents accidental cross-project leakage.'
    );
  }

  const now = new Date();
  const relativeDays = typeof args.relative_days === 'number' ? args.relative_days : 7;
  const since = args.since ? new Date(args.since) : new Date(now.getTime() - relativeDays * 24 * 60 * 60 * 1000);
  const until = args.until ? new Date(args.until) : now;
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();
  const limit = Math.max(1, Math.min(args.limit ?? 100, 500));

  const entityTypes: string[] | undefined = args.entity_types;
  const eventTypes: string[] | undefined = args.event_types;
  const allowEntity = (t: string) => !entityTypes || entityTypes.includes(t);
  const allowEvent = (t: string) => !eventTypes || eventTypes.includes(t);

  let projectFilter: { project_id?: string } | null = null;
  if (args.project_slug) {
    const projectId = await resolveProjectId(supabase, args.project_slug);
    projectFilter = { project_id: projectId };
  }

  // Also resolve slug map so events can carry project_slug back when scanning all projects
  const { data: projectRows } = await supabase.from('projects').select('id, slug');
  const idToSlug = new Map<string, string>();
  (projectRows ?? []).forEach((p: any) => idToSlug.set(p.id, p.slug));

  const events: any[] = [];
  const applyProjectFilter = (q: any) => (projectFilter ? q.eq('project_id', projectFilter.project_id) : q);

  // Helper to push one event
  const pushEvent = (evt: {
    timestamp: string;
    entity_type: string;
    event_type: string;
    entity_id: string;
    display_id?: string | null;
    project_id: string;
    summary: string;
    source?: string | null;
    extra?: Record<string, any>;
  }) => {
    if (!allowEntity(evt.entity_type)) return;
    if (!allowEvent(evt.event_type)) return;
    events.push({
      timestamp: evt.timestamp,
      entity_type: evt.entity_type,
      event_type: evt.event_type,
      entity_id: evt.entity_id,
      display_id: evt.display_id ?? null,
      project_slug: idToSlug.get(evt.project_id) ?? evt.project_id,
      summary: evt.summary,
      source: evt.source ?? null,
      ...(evt.extra ?? {}),
    });
  };

  // ── Decisions: added or superseded ──
  if (allowEntity('decision')) {
    const { data: decisions, error } = await applyProjectFilter(
      supabase.from('decisions').select('id, display_id, project_id, title, rationale, source, supersedes, decided_at')
        .gte('decided_at', sinceIso).lte('decided_at', untilIso)
    );
    if (error) throw new Error(`decisions activity: ${error.message}`);
    (decisions ?? []).forEach((d: any) => {
      pushEvent({
        timestamp: d.decided_at,
        entity_type: 'decision',
        event_type: d.supersedes ? 'superseded' : 'added',
        entity_id: d.id,
        display_id: d.display_id,
        project_id: d.project_id,
        summary: d.supersedes ? `Superseded decision: ${d.title}` : `Decision: ${d.title}`,
        source: d.source,
        extra: d.supersedes ? { supersedes: d.supersedes } : undefined,
      });
    });
  }

  // ── Assumptions: added, confirmed, invalidated ──
  if (allowEntity('assumption')) {
    // Added
    const { data: added, error: addedErr } = await applyProjectFilter(
      supabase.from('assumptions').select('id, display_id, project_id, statement, source, created_at')
        .gte('created_at', sinceIso).lte('created_at', untilIso)
    );
    if (addedErr) throw new Error(`assumptions added: ${addedErr.message}`);
    (added ?? []).forEach((a: any) => {
      pushEvent({
        timestamp: a.created_at,
        entity_type: 'assumption',
        event_type: 'added',
        entity_id: a.id,
        display_id: a.display_id,
        project_id: a.project_id,
        summary: `Assumption: ${a.statement}`,
        source: a.source,
      });
    });

    // Confirmed/invalidated
    const { data: changed, error: changedErr } = await applyProjectFilter(
      supabase.from('assumptions').select('id, display_id, project_id, statement, status, status_reason, source, status_changed_at')
        .not('status_changed_at', 'is', null).gte('status_changed_at', sinceIso).lte('status_changed_at', untilIso)
    );
    if (changedErr) throw new Error(`assumptions status-changes: ${changedErr.message}`);
    (changed ?? []).forEach((a: any) => {
      const evType = a.status === 'confirmed' ? 'confirmed' : a.status === 'invalidated' ? 'invalidated' : 'added';
      pushEvent({
        timestamp: a.status_changed_at,
        entity_type: 'assumption',
        event_type: evType,
        entity_id: a.id,
        display_id: a.display_id,
        project_id: a.project_id,
        summary: `Assumption ${a.status}: ${a.statement}${a.status_reason ? ` (${a.status_reason})` : ''}`,
        source: a.source,
      });
    });
  }

  // ── Blockers: raised (added), resolved ──
  if (allowEntity('blocker')) {
    const { data: added, error: addedErr } = await applyProjectFilter(
      supabase.from('blockers').select('id, display_id, project_id, question, source, created_at')
        .gte('created_at', sinceIso).lte('created_at', untilIso)
    );
    if (addedErr) throw new Error(`blockers added: ${addedErr.message}`);
    (added ?? []).forEach((b: any) => {
      pushEvent({
        timestamp: b.created_at,
        entity_type: 'blocker',
        event_type: 'added',
        entity_id: b.id,
        display_id: b.display_id,
        project_id: b.project_id,
        summary: `Blocker raised: ${b.question}`,
        source: b.source,
      });
    });

    const { data: resolved, error: resolvedErr } = await applyProjectFilter(
      supabase.from('blockers').select('id, display_id, project_id, question, answer, source, resolved_at')
        .not('resolved_at', 'is', null).gte('resolved_at', sinceIso).lte('resolved_at', untilIso)
    );
    if (resolvedErr) throw new Error(`blockers resolved: ${resolvedErr.message}`);
    (resolved ?? []).forEach((b: any) => {
      pushEvent({
        timestamp: b.resolved_at,
        entity_type: 'blocker',
        event_type: 'resolved',
        entity_id: b.id,
        display_id: b.display_id,
        project_id: b.project_id,
        summary: `Blocker resolved: ${b.question}${b.answer ? ` — ${b.answer}` : ''}`,
        source: b.source,
      });
    });
  }

  // ── Next moves: added, completed ──
  if (allowEntity('next_move')) {
    const { data: added, error: addedErr } = await applyProjectFilter(
      supabase.from('next_moves').select('id, display_id, project_id, description, priority, source, created_at')
        .gte('created_at', sinceIso).lte('created_at', untilIso)
    );
    if (addedErr) throw new Error(`next_moves added: ${addedErr.message}`);
    (added ?? []).forEach((m: any) => {
      pushEvent({
        timestamp: m.created_at,
        entity_type: 'next_move',
        event_type: 'added',
        entity_id: m.id,
        display_id: m.display_id,
        project_id: m.project_id,
        summary: `Next move added (${m.priority}): ${m.description}`,
        source: m.source,
      });
    });

    const { data: completed, error: completedErr } = await applyProjectFilter(
      supabase.from('next_moves').select('id, display_id, project_id, description, source, completed_at, completed_by_plan_id')
        .not('completed_at', 'is', null).gte('completed_at', sinceIso).lte('completed_at', untilIso)
    );
    if (completedErr) throw new Error(`next_moves completed: ${completedErr.message}`);
    (completed ?? []).forEach((m: any) => {
      pushEvent({
        timestamp: m.completed_at,
        entity_type: 'next_move',
        event_type: 'completed',
        entity_id: m.id,
        display_id: m.display_id,
        project_id: m.project_id,
        summary: `Next move completed: ${m.description}`,
        source: m.source,
        extra: m.completed_by_plan_id ? { completed_by_plan_id: m.completed_by_plan_id } : undefined,
      });
    });
  }

  // ── Plans: added, status changed ──
  if (allowEntity('plan')) {
    const { data: added, error: addedErr } = await applyProjectFilter(
      supabase.from('plans').select('id, project_id, title, status, source, created_at')
        .gte('created_at', sinceIso).lte('created_at', untilIso)
    );
    if (addedErr) throw new Error(`plans added: ${addedErr.message}`);
    (added ?? []).forEach((p: any) => {
      pushEvent({
        timestamp: p.created_at,
        entity_type: 'plan',
        event_type: 'added',
        entity_id: p.id,
        project_id: p.project_id,
        summary: `Plan created: ${p.title} (${p.status})`,
        source: p.source,
      });
    });

    const { data: blessed, error: blessedErr } = await applyProjectFilter(
      supabase.from('plans').select('id, project_id, title, status, source, blessed_at')
        .not('blessed_at', 'is', null).gte('blessed_at', sinceIso).lte('blessed_at', untilIso)
    );
    if (blessedErr) throw new Error(`plans blessed: ${blessedErr.message}`);
    (blessed ?? []).forEach((p: any) => {
      pushEvent({
        timestamp: p.blessed_at,
        entity_type: 'plan',
        event_type: 'plan_status_changed',
        entity_id: p.id,
        project_id: p.project_id,
        summary: `Plan blessed: ${p.title}`,
        source: p.source,
        extra: { new_status: 'blessed' },
      });
    });

    const { data: completedPlans, error: cpErr } = await applyProjectFilter(
      supabase.from('plans').select('id, project_id, title, status, source, completed_at')
        .not('completed_at', 'is', null).gte('completed_at', sinceIso).lte('completed_at', untilIso)
    );
    if (cpErr) throw new Error(`plans completed: ${cpErr.message}`);
    (completedPlans ?? []).forEach((p: any) => {
      pushEvent({
        timestamp: p.completed_at,
        entity_type: 'plan',
        event_type: 'plan_status_changed',
        entity_id: p.id,
        project_id: p.project_id,
        summary: `Plan ${p.status}: ${p.title}`,
        source: p.source,
        extra: { new_status: p.status },
      });
    });
  }

  // ── Notes: added ──
  if (allowEntity('note')) {
    const { data: notes, error } = await applyProjectFilter(
      supabase.from('notes').select('id, display_id, project_id, content, topic, source, created_at')
        .gte('created_at', sinceIso).lte('created_at', untilIso)
    );
    if (error) throw new Error(`notes activity: ${error.message}`);
    (notes ?? []).forEach((n: any) => {
      const preview = n.content.length > 120 ? n.content.slice(0, 117) + '...' : n.content;
      pushEvent({
        timestamp: n.created_at,
        entity_type: 'note',
        event_type: 'added',
        entity_id: n.id,
        display_id: n.display_id,
        project_id: n.project_id,
        summary: `Note${n.topic ? ` [${n.topic}]` : ''}: ${preview}`,
        source: n.source,
      });
    });
  }

  // ── Lessons: added ──
  if (allowEntity('lesson')) {
    const { data: lessons, error } = await applyProjectFilter(
      supabase.from('lessons').select('id, display_id, project_id, situation, lesson, severity, source, created_at')
        .gte('created_at', sinceIso).lte('created_at', untilIso)
    );
    if (error) throw new Error(`lessons activity: ${error.message}`);
    (lessons ?? []).forEach((l: any) => {
      pushEvent({
        timestamp: l.created_at,
        entity_type: 'lesson',
        event_type: 'added',
        entity_id: l.id,
        display_id: l.display_id,
        project_id: l.project_id,
        summary: `Lesson (${l.severity}): ${l.lesson}`,
        source: l.source,
      });
    });
  }

  // ── Status snapshots: added ──
  if (allowEntity('snapshot')) {
    const { data: snaps, error } = await applyProjectFilter(
      supabase.from('status_snapshots').select('id, display_id, project_id, narrative, source, created_at')
        .gte('created_at', sinceIso).lte('created_at', untilIso)
    );
    if (error) throw new Error(`snapshots activity: ${error.message}`);
    (snaps ?? []).forEach((s: any) => {
      const preview = s.narrative.length > 120 ? s.narrative.slice(0, 117) + '...' : s.narrative;
      pushEvent({
        timestamp: s.created_at,
        entity_type: 'snapshot',
        event_type: 'added',
        entity_id: s.id,
        display_id: s.display_id,
        project_id: s.project_id,
        summary: `Status snapshot: ${preview}`,
        source: s.source,
      });
    });
  }

  // Sort chronologically, most recent first
  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const truncated = events.slice(0, limit);

  // Counts by event_type for the header
  const counts: Record<string, number> = {};
  for (const e of events) {
    const key = `${e.entity_type}.${e.event_type}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return JSON.stringify({
    window: { since: sinceIso, until: untilIso },
    scope: args.project_slug ? { project_slug: args.project_slug } : { all_projects: true },
    filters: {
      entity_types: entityTypes ?? null,
      event_types: eventTypes ?? null,
    },
    total_events: events.length,
    returned: truncated.length,
    counts_by_entity_event: counts,
    events: truncated,
  }, null, 2);
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

  const [allDecisions, assumptions, blockers, nextMoves, snapshot, notes, lessons, project] = await Promise.all([
    supabase.from('decisions').select('id, display_id, title, rationale, alternatives_considered, change_reason, provenance, supersedes, tags, decided_at, source').eq('project_id', projectId).order('decided_at', { ascending: false }),
    supabase.from('assumptions').select('id, display_id, statement, alternatives, tags, source, created_at').eq('project_id', projectId).eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('blockers').select('id, display_id, question, context, tags, source, created_at').eq('project_id', projectId).is('resolved_at', null).order('created_at', { ascending: false }),
    supabase.from('next_moves').select('id, display_id, description, priority, estimated_effort, tags, source, created_at').eq('project_id', projectId).is('completed_at', null).order('created_at', { ascending: false }),
    supabase.from('status_snapshots').select('id, display_id, narrative, tags, source, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('notes').select('id, display_id, content, topic, tags, source, created_at, promoted_to_entity, promoted_to_id').eq('project_id', projectId).order('created_at', { ascending: false }).limit(notesLimit),
    supabase.from('lessons').select('id, display_id, situation, lesson, applies_to, severity, tags, source, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(lessonsLimit),
    supabase.from('projects').select('name, description, repo_url, supabase_project_id, vercel_project_id').eq('id', projectId).maybeSingle(),
  ]);

  const errors = [allDecisions.error, assumptions.error, blockers.error, nextMoves.error, snapshot.error, notes.error, lessons.error, project.error].filter(Boolean);
  if (errors.length) throw new Error(errors.map((e) => e!.message).join('; '));

  // Filter decisions: keep only those that haven't been superseded by another decision.
  // (A decision is "currently active" when no other row has supersedes = its id.)
  const supersededIds = new Set((allDecisions.data ?? []).map((d: any) => d.supersedes).filter(Boolean));
  const activeDecisions = (allDecisions.data ?? []).filter((d: any) => !supersededIds.has(d.id));

  const state = {
    project: project.data,
    latest_snapshot: snapshot.data,
    active_decisions: activeDecisions,
    active_assumptions: assumptions.data ?? [],
    open_blockers: blockers.data ?? [],
    open_next_moves: nextMoves.data ?? [],
    recent_notes: notes.data ?? [],
    recent_lessons: lessons.data ?? [],
    counts: {
      decisions: activeDecisions.length,
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

  // Guardrail: require explicit scope choice. Pass project_slug to scope to one project,
  // or all_projects=true to explicitly search across every project. Omitting both is an error
  // to prevent accidental cross-project leakage when a user is working within a single project.
  if (!args.project_slug && args.all_projects !== true) {
    throw new Error(
      'Scope is required. Pass project_slug to search within one project, ' +
      'or pass all_projects=true to explicitly search across every project. ' +
      'This guardrail prevents accidental cross-project leakage.'
    );
  }

  const limit = Math.max(1, Math.min(args.limit ?? 10, 50));
  const entityTypes: string[] | undefined = args.entity_types;

  const queryEmbedding = await embed(query);
  const hasEmbedding = queryEmbedding !== null;

  let projectId: string | null = null;
  if (args.project_slug) {
    projectId = await resolveProjectId(supabase, args.project_slug);
  }

  // Resolve project slug map for labeling results (when scanning all projects)
  const { data: projectRows } = await supabase.from('projects').select('id, slug');
  const idToSlug = new Map<string, string>();
  (projectRows ?? []).forEach((p: any) => idToSlug.set(p.id, p.slug));

  const allowed = (t: string) => !entityTypes || entityTypes.includes(t);
  const results: any[] = [];

  const runSearch = async (
    entityType: string,
    table: string,
    selectFields: string,
    orderField: string
  ) => {
    if (!allowed(entityType)) return;

    let q = supabase.from(table).select(`${selectFields}, embedding, tags, project_id, created_at`);
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
        const { embedding, project_id, ...rest } = row;
        results.push({
          entity_type: entityType,
          project_slug: idToSlug.get(project_id) ?? project_id,
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

  // Count results by project for cross-project searches
  const projectCounts: Record<string, number> = {};
  for (const r of top) {
    projectCounts[r.project_slug] = (projectCounts[r.project_slug] ?? 0) + 1;
  }

  return JSON.stringify({
    query,
    scope: args.project_slug ? { project_slug: args.project_slug } : { all_projects: true },
    method: hasEmbedding ? 'semantic' : 'keyword-fallback',
    result_count: top.length,
    project_counts: projectCounts,
    results: top,
  }, null, 2);
}

// ─────────────────────────────────────────────────────────
// Tag-based retrieval
// ─────────────────────────────────────────────────────────

async function findByTags(supabase: SupabaseClient, args: Args): Promise<string> {
  // Guardrail: require explicit scope choice.
  if (!args.project_slug && args.all_projects !== true) {
    throw new Error(
      'Scope is required. Pass project_slug to search within one project, ' +
      'or pass all_projects=true to explicitly search across every project. ' +
      'This guardrail prevents accidental cross-project leakage.'
    );
  }

  // Resolve project scope first so expansion is project-aware
  let projectId: string | null = null;
  if (args.project_slug) {
    projectId = await resolveProjectId(supabase, args.project_slug);
  }

  // Resolve project slug map for labeling results
  const { data: projectRows } = await supabase.from('projects').select('id, slug');
  const idToSlug = new Map<string, string>();
  (projectRows ?? []).forEach((p: any) => idToSlug.set(p.id, p.slug));

  // Normalize and fuzzy-expand the input tags against existing DB tags (scoped to project or global based on projectId)
  const { tags: expandedTags, expansions } = await expandForQuery(supabase, args.tags, projectId);
  if (expandedTags.length === 0) throw new Error('tags array must contain at least one non-empty tag after normalization');

  const matchMode = args.match_mode === 'all' ? 'all' : 'any';
  const entityTypes: string[] | undefined = args.entity_types;
  const limit = Math.max(1, Math.min(args.limit ?? 50, 200));

  const allowed = (t: string) => !entityTypes || entityTypes.includes(t);
  const results: any[] = [];

  const runTagQuery = async (
    entityType: string,
    table: string,
    selectFields: string,
    orderField: string
  ) => {
    if (!allowed(entityType)) return;

    let q = supabase.from(table).select(`${selectFields}, tags, project_id, created_at`);
    if (projectId) q = q.eq('project_id', projectId);
    if (matchMode === 'all') {
      q = q.contains('tags', expandedTags);
    } else {
      q = q.overlaps('tags', expandedTags);
    }

    const { data, error } = await q.order(orderField, { ascending: false }).limit(limit);
    if (error) throw new Error(`${entityType} find_by_tags: ${error.message}`);
    if (!data) return;

    for (const row of data) {
      const { project_id, ...rest } = row;
      results.push({
        entity_type: entityType,
        project_slug: idToSlug.get(project_id) ?? project_id,
        ...rest,
      });
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

  // Count results by project for cross-project searches
  const projectCounts: Record<string, number> = {};
  for (const r of results) {
    projectCounts[r.project_slug] = (projectCounts[r.project_slug] ?? 0) + 1;
  }

  return JSON.stringify({
    scope: args.project_slug ? { project_slug: args.project_slug } : { all_projects: true },
    match_mode: matchMode,
    tags_queried: expandedTags,
    tag_expansions: expansions,
    result_count: results.length,
    project_counts: projectCounts,
    results,
  }, null, 2);
}

async function listTags(supabase: SupabaseClient, args: Args): Promise<string> {
  let projectId: string | null = null;
  if (args.project_slug) {
    projectId = await resolveProjectId(supabase, args.project_slug);
  }

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

  const table = ENTITY_TABLE[entityType];
  if (!table) throw new Error(`Unknown entity_type: ${entityType}`);

  // Fetch existing row for project scope and current tags
  const { data: row, error: fetchErr } = await supabase.from(table).select('tags, project_id').eq('id', id).maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!row) throw new Error(`${entityType} not found: ${id}`);

  // Reconcile the new tags against existing tags in the same project scope
  const { tags: reconciled, substitutions } = await normalizeAndReconcile(supabase, args.tags, row.project_id);
  if (reconciled.length === 0) throw new Error('tags array must contain at least one non-empty tag after normalization');

  const merged = Array.from(new Set([...(row.tags ?? []), ...reconciled]));
  const { data, error } = await supabase.from(table).update({ tags: merged }).eq('id', id).select('id, tags').single();
  if (error) throw new Error(error.message);
  return JSON.stringify({ ...data, tag_substitutions: substitutions }, null, 2);
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
  const { tags, substitutions } = await normalizeAndReconcile(supabase, args.tags, projectId);
  const createdAt = parseOverrideTimestamp(args.created_at, 'created_at');
  const insertRow: any = {
    project_id: projectId,
    content: args.content,
    topic: args.topic ?? null,
    tags,
    source: args.source,
    embedding: toPgVector(embedding),
  };
  if (createdAt) insertRow.created_at = createdAt;
  const { data, error } = await supabase.from('notes').insert(insertRow)
    .select('id, content, topic, tags, source, created_at').single();
  if (error) throw new Error(error.message);
  return JSON.stringify({ ...data, tag_substitutions: substitutions }, null, 2);
}

async function promoteNote(supabase: SupabaseClient, args: Args): Promise<string> {
  const { note_id, target_entity, source } = args;

  const { data: note, error: noteErr } = await supabase.from('notes').select('project_id, tags, topic, promoted_to_entity, promoted_to_id').eq('id', note_id).maybeSingle();
  if (noteErr) throw new Error(noteErr.message);
  if (!note) throw new Error(`Note not found: ${note_id}`);
  if (note.promoted_to_entity) throw new Error(`Note already promoted to ${note.promoted_to_entity}:${note.promoted_to_id}`);

  const projectId = note.project_id;
  // Tags: if caller passes tags, normalize and reconcile them. Otherwise carry over note's tags + topic.
  let tags: string[];
  let substitutions: Array<{ from: string; to: string; score: number }> = [];
  if (args.tags && Array.isArray(args.tags) && args.tags.length > 0) {
    const result = await normalizeAndReconcile(supabase, args.tags, projectId);
    tags = result.tags;
    substitutions = result.substitutions;
  } else {
    const carryoverTags = note.tags ?? [];
    const topicAsTag = note.topic ? [note.topic.toLowerCase()] : [];
    tags = Array.from(new Set([...carryoverTags, ...topicAsTag]));
  }

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
    tag_substitutions: substitutions,
  }, null, 2);
}

// ─────────────────────────────────────────────────────────
// Lessons
// ─────────────────────────────────────────────────────────

async function addLesson(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const embedding = await embed(composeEmbeddingText.lesson(args.situation, args.lesson, args.applies_to));
  const { tags, substitutions } = await normalizeAndReconcile(supabase, args.tags, projectId);
  const createdAt = parseOverrideTimestamp(args.created_at, 'created_at');
  const insertRow: any = {
    project_id: projectId,
    situation: args.situation,
    lesson: args.lesson,
    applies_to: args.applies_to ?? null,
    severity: args.severity ?? 'normal',
    tags,
    source: args.source,
    embedding: toPgVector(embedding),
  };
  if (createdAt) insertRow.created_at = createdAt;
  const { data, error } = await supabase.from('lessons').insert(insertRow)
    .select('id, situation, lesson, applies_to, severity, tags, source, created_at').single();
  if (error) throw new Error(error.message);
  return JSON.stringify({ ...data, tag_substitutions: substitutions }, null, 2);
}

// ─────────────────────────────────────────────────────────
// Decisions
// ─────────────────────────────────────────────────────────

async function logDecision(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const embedding = await embed(composeEmbeddingText.decision(args.title, args.rationale, args.alternatives_considered));
  const { tags, substitutions } = await normalizeAndReconcile(supabase, args.tags, projectId);

  // provenance: optional. If provided, clean and store. If not, store null and warn.
  const provenance = (typeof args.provenance === 'string' && args.provenance.trim().length > 0)
    ? args.provenance.trim()
    : null;

  const decidedAt = parseOverrideTimestamp(args.decided_at, 'decided_at');

  const insertRow: any = {
    project_id: projectId,
    title: args.title,
    rationale: args.rationale,
    alternatives_considered: args.alternatives_considered ?? null,
    provenance,
    tags,
    source: args.source,
    embedding: toPgVector(embedding),
  };
  if (decidedAt) insertRow.decided_at = decidedAt;

  const { data, error } = await supabase.from('decisions').insert(insertRow)
    .select('id, title, rationale, alternatives_considered, provenance, tags, source, decided_at').single();
  if (error) throw new Error(error.message);

  const response: any = { ...data, tag_substitutions: substitutions };
  if (!provenance) {
    response.warning =
      'provenance was not provided. The decision is recorded but "how we got here" is not captured. ' +
      'If you can articulate what you consulted (web search, MCP tool calls, uploaded files, prior decisions) or if the user knows, ' +
      'call update_provenance with decision_id ' + data.id + ' to fill it in.';
  }
  return JSON.stringify(response, null, 2);
}

async function supersedeDecision(supabase: SupabaseClient, args: Args): Promise<string> {
  // change_reason is strongly preferred but not strictly required.
  const providedReason = (typeof args.change_reason === 'string' && args.change_reason.trim().length > 0)
    ? args.change_reason.trim()
    : null;

  // provenance follows the same pattern: optional, null-default, warning if missing.
  const provenance = (typeof args.provenance === 'string' && args.provenance.trim().length > 0)
    ? args.provenance.trim()
    : null;

  const { data: oldRow, error: oldErr } = await supabase.from('decisions').select('project_id, tags').eq('id', args.old_decision_id).maybeSingle();
  if (oldErr) throw new Error(oldErr.message);
  if (!oldRow) throw new Error(`Decision not found: ${args.old_decision_id}`);

  const embedding = await embed(composeEmbeddingText.decision(args.new_title, args.new_rationale, args.new_alternatives_considered));

  // If caller passed tags, reconcile them. Otherwise keep the old decision's tags as-is.
  let tags: string[];
  let substitutions: Array<{ from: string; to: string; score: number }> = [];
  if (args.tags && Array.isArray(args.tags) && args.tags.length > 0) {
    const result = await normalizeAndReconcile(supabase, args.tags, oldRow.project_id);
    tags = result.tags;
    substitutions = result.substitutions;
  } else {
    tags = oldRow.tags ?? [];
  }

  const decidedAt = parseOverrideTimestamp(args.decided_at, 'decided_at');

  const insertRow: any = {
    project_id: oldRow.project_id,
    title: args.new_title,
    rationale: args.new_rationale,
    alternatives_considered: args.new_alternatives_considered ?? null,
    change_reason: providedReason,
    provenance,
    tags,
    source: args.source,
    supersedes: args.old_decision_id,
    embedding: toPgVector(embedding),
  };
  if (decidedAt) insertRow.decided_at = decidedAt;

  const { data, error } = await supabase.from('decisions').insert(insertRow)
    .select('id, title, rationale, change_reason, provenance, tags, source, supersedes, decided_at').single();
  if (error) throw new Error(error.message);

  const response: any = { ...data, tag_substitutions: substitutions };
  const warnings: string[] = [];
  if (!providedReason) {
    warnings.push(
      'change_reason was not provided. The supersession succeeded but the reasoning breadcrumb is missing. ' +
      'Ask the user why the change was made and call update_change_reason with decision_id ' + data.id + ' to fill it in.'
    );
  }
  if (!provenance) {
    warnings.push(
      'provenance was not provided. If you can articulate what you consulted to reach this decision, ' +
      'call update_provenance with decision_id ' + data.id + ' to fill it in.'
    );
  }
  if (warnings.length > 0) response.warnings = warnings;
  return JSON.stringify(response, null, 2);
}

// ─────────────────────────────────────────────────────────
// Update the provenance on a decision or plan.
// Use when provenance was skipped at write time, or when a better
// articulation of "how we got here" emerges later.
// ─────────────────────────────────────────────────────────

async function updateProvenance(supabase: SupabaseClient, args: Args): Promise<string> {
  if (!args.entity_id) throw new Error('entity_id is required');
  if (!args.entity_type || (args.entity_type !== 'decision' && args.entity_type !== 'plan')) {
    throw new Error('entity_type must be "decision" or "plan"');
  }
  if (typeof args.provenance !== 'string' || args.provenance.trim().length === 0) {
    throw new Error('provenance must be a non-empty string');
  }

  const table = args.entity_type === 'decision' ? 'decisions' : 'plans';
  const selectFields = args.entity_type === 'decision'
    ? 'id, title, provenance'
    : 'id, title, provenance';

  // Fetch existing to preserve previous value in response
  const { data: existing, error: fetchErr } = await supabase
    .from(table)
    .select(selectFields)
    .eq('id', args.entity_id)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!existing) throw new Error(`${args.entity_type} not found: ${args.entity_id}`);

  const previousValue = (existing as any).provenance;
  const { data, error } = await supabase
    .from(table)
    .update({ provenance: args.provenance.trim() })
    .eq('id', args.entity_id)
    .select(selectFields)
    .single();
  if (error) throw new Error(error.message);

  return JSON.stringify({
    ...data,
    entity_type: args.entity_type,
    previous_value: previousValue,
    updated: true,
  }, null, 2);
}

// ─────────────────────────────────────────────────────────
// Update the change_reason on a supersession.
// Use when change_reason was skipped at write time, or when a better
// articulation emerges later. Requires that the decision has a supersedes
// pointer (original decisions have no predecessor to explain).
// ─────────────────────────────────────────────────────────

async function updateChangeReason(supabase: SupabaseClient, args: Args): Promise<string> {
  if (!args.decision_id) throw new Error('decision_id is required');
  if (typeof args.change_reason !== 'string' || args.change_reason.trim().length === 0) {
    throw new Error('change_reason must be a non-empty string');
  }

  // Verify this decision supersedes another (otherwise change_reason has nothing to explain)
  const { data: row, error: fetchErr } = await supabase
    .from('decisions')
    .select('id, title, supersedes, change_reason')
    .eq('id', args.decision_id)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!row) throw new Error(`Decision not found: ${args.decision_id}`);
  if (!row.supersedes) {
    throw new Error(
      `Decision ${args.decision_id} is an original (does not supersede another). ` +
      'change_reason explains the transition FROM a previous decision — original decisions have no transition to explain.'
    );
  }

  const previousValue = row.change_reason;
  const { data, error } = await supabase
    .from('decisions')
    .update({ change_reason: args.change_reason.trim() })
    .eq('id', args.decision_id)
    .select('id, title, supersedes, change_reason')
    .single();
  if (error) throw new Error(error.message);

  return JSON.stringify({
    ...data,
    previous_value: previousValue,
    updated: true,
  }, null, 2);
}

// ─────────────────────────────────────────────────────────
// Decision chain walker
// Given any decision ID, returns the full supersession history:
// ancestors (via backward walk of `supersedes` pointers) + descendants
// (via forward walk of decisions that supersede this one).
// Each transition includes the change_reason so the reader can see
// how the thinking evolved.
// ─────────────────────────────────────────────────────────

async function getDecisionChain(supabase: SupabaseClient, args: Args): Promise<string> {
  if (!args.decision_id) throw new Error('decision_id is required');

  // Anchor: fetch the starting decision
  const { data: anchor, error: anchorErr } = await supabase
    .from('decisions')
    .select('id, project_id, title, rationale, alternatives_considered, change_reason, provenance, tags, source, supersedes, decided_at')
    .eq('id', args.decision_id)
    .maybeSingle();
  if (anchorErr) throw new Error(anchorErr.message);
  if (!anchor) throw new Error(`Decision not found: ${args.decision_id}`);

  // Walk backward through ancestors
  const ancestors: any[] = [];
  let cursor: any = anchor;
  const visited = new Set<string>([anchor.id]); // cycle guard (shouldn't happen, but safe)
  while (cursor.supersedes) {
    if (visited.has(cursor.supersedes)) break;
    visited.add(cursor.supersedes);
    const { data: parent, error } = await supabase
      .from('decisions')
      .select('id, project_id, title, rationale, alternatives_considered, change_reason, provenance, tags, source, supersedes, decided_at')
      .eq('id', cursor.supersedes)
      .maybeSingle();
    if (error) throw new Error(`Chain walk backward: ${error.message}`);
    if (!parent) break;
    ancestors.push(parent);
    cursor = parent;
  }

  // Walk forward through descendants
  const descendants: any[] = [];
  let forwardCursor: any = anchor;
  const forwardVisited = new Set<string>([anchor.id]);
  while (true) {
    const { data: child, error } = await supabase
      .from('decisions')
      .select('id, project_id, title, rationale, alternatives_considered, change_reason, provenance, tags, source, supersedes, decided_at')
      .eq('supersedes', forwardCursor.id)
      .maybeSingle();
    if (error) throw new Error(`Chain walk forward: ${error.message}`);
    if (!child) break;
    if (forwardVisited.has(child.id)) break;
    forwardVisited.add(child.id);
    descendants.push(child);
    forwardCursor = child;
  }

  // Build the full ordered chain: oldest ancestor → ... → anchor → ... → newest descendant
  // ancestors is already ordered newest→oldest from the walk, so reverse it
  const chain = [...ancestors.reverse(), anchor, ...descendants];

  // Build transition list: pairs of (from → to) with change_reason
  const transitions = [];
  for (let i = 1; i < chain.length; i++) {
    const prev = chain[i - 1];
    const curr = chain[i];
    transitions.push({
      from_decision_id: prev.id,
      from_title: prev.title,
      to_decision_id: curr.id,
      to_title: curr.title,
      transition_date: curr.decided_at,
      change_reason: curr.change_reason,
    });
  }

  // The current (active) decision is the last one in the chain — the one NOT superseded by anything
  const currentDecision = chain[chain.length - 1];
  const isAnchorCurrent = currentDecision.id === anchor.id;

  return JSON.stringify({
    anchor_id: anchor.id,
    anchor_is_current: isAnchorCurrent,
    current_decision_id: currentDecision.id,
    chain_length: chain.length,
    chain,
    transitions,
  }, null, 2);
}

// ─────────────────────────────────────────────────────────
// Assumptions
// ─────────────────────────────────────────────────────────

async function addAssumption(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const embedding = await embed(composeEmbeddingText.assumption(args.statement, args.alternatives));
  const { tags, substitutions } = await normalizeAndReconcile(supabase, args.tags, projectId);
  // observed_at is the user-facing name (you observe assumptions, not "create" them); stored in created_at.
  const observedAt = parseOverrideTimestamp(args.observed_at, 'observed_at');
  const insertRow: any = {
    project_id: projectId,
    statement: args.statement,
    alternatives: args.alternatives ?? null,
    tags,
    source: args.source,
    embedding: toPgVector(embedding),
  };
  if (observedAt) insertRow.created_at = observedAt;
  const { data, error } = await supabase.from('assumptions').insert(insertRow)
    .select('id, statement, alternatives, status, tags, source, created_at').single();
  if (error) throw new Error(error.message);
  return JSON.stringify({ ...data, tag_substitutions: substitutions }, null, 2);
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
  const { tags, substitutions } = await normalizeAndReconcile(supabase, args.tags, projectId);
  // raised_at is the user-facing name (blockers are raised); stored in created_at.
  const raisedAt = parseOverrideTimestamp(args.raised_at, 'raised_at');
  const insertRow: any = {
    project_id: projectId,
    question: args.question,
    context: args.context ?? null,
    tags,
    source: args.source,
    embedding: toPgVector(embedding),
  };
  if (raisedAt) insertRow.created_at = raisedAt;
  const { data, error } = await supabase.from('blockers').insert(insertRow)
    .select('id, question, context, tags, source, created_at').single();
  if (error) throw new Error(error.message);
  return JSON.stringify({ ...data, tag_substitutions: substitutions }, null, 2);
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
  const { tags, substitutions } = await normalizeAndReconcile(supabase, args.tags, projectId);
  const createdAt = parseOverrideTimestamp(args.created_at, 'created_at');
  const insertRow: any = {
    project_id: projectId,
    description: args.description,
    priority: args.priority ?? 'normal',
    estimated_effort: args.estimated_effort ?? null,
    tags,
    source: args.source,
    embedding: toPgVector(embedding),
  };
  if (createdAt) insertRow.created_at = createdAt;
  const { data, error } = await supabase.from('next_moves').insert(insertRow)
    .select('id, description, priority, estimated_effort, tags, source, created_at').single();
  if (error) throw new Error(error.message);
  return JSON.stringify({ ...data, tag_substitutions: substitutions }, null, 2);
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
  const { tags, substitutions } = await normalizeAndReconcile(supabase, args.tags, projectId);

  const provenance = (typeof args.provenance === 'string' && args.provenance.trim().length > 0)
    ? args.provenance.trim()
    : null;

  const createdAt = parseOverrideTimestamp(args.created_at, 'created_at');

  const insertRow: any = {
    project_id: projectId,
    title: args.title,
    content: args.content,
    provenance,
    tags,
    source: args.source,
    embedding: toPgVector(embedding),
  };
  if (createdAt) insertRow.created_at = createdAt;

  const { data, error } = await supabase.from('plans').insert(insertRow)
    .select('id, title, status, provenance, tags, source, current_revision, created_at').single();
  if (error) throw new Error(error.message);

  // Seed revision 1 with the initial content. Change_reason is implicit ("initial write") on revision 1.
  // Backdate the revision to match the plan if an override was given, so history stays consistent.
  const revRow: any = {
    plan_id: data.id,
    revision_number: 1,
    title: args.title,
    content: args.content,
    change_reason: 'Initial plan.',
    source: args.source,
  };
  if (createdAt) revRow.created_at = createdAt;
  const { error: revErr } = await supabase.from('plan_revisions').insert(revRow);
  if (revErr) {
    console.error('Failed to seed revision 1:', revErr.message);
  }

  const response: any = { ...data, tag_substitutions: substitutions };
  if (!provenance) {
    response.warning =
      'provenance was not provided. The plan is recorded but "how we got here" is not captured. ' +
      'If you can articulate what you consulted to produce this plan, call update_provenance with plan_id ' + data.id + ' to fill it in.';
  }
  return JSON.stringify(response, null, 2);
}

// ─────────────────────────────────────────────────────────
// Plan content updates — creates a new revision snapshot every time.
// Each call:
//   1. Loads the current plan's title/content/current_revision
//   2. Writes the CURRENT state (pre-update) into plan_revisions as revision N+1
//      (wait — see note below; we actually snapshot the NEW content as the new current revision)
//   3. Updates the plan row with the new title/content and increments current_revision
//   4. Regenerates the plan's embedding
//
// Clarification on revision numbering:
//   Revision N represents the Nth "version" of the plan's content. write_plan seeds revision 1.
//   update_plan_content moves the plan from revision N to revision N+1:
//     - The plan row is updated to the new content
//     - A new plan_revisions row is inserted with revision_number = N+1 capturing the new state
//   This way plan_revisions is a complete history: every revision that ever existed is there,
//   including the current one. Walking "plan at version N" = SELECT from plan_revisions WHERE revision_number = N.
// ─────────────────────────────────────────────────────────

async function updatePlanContent(supabase: SupabaseClient, args: Args): Promise<string> {
  if (!args.plan_id) throw new Error('plan_id is required');
  if (typeof args.new_content !== 'string' || args.new_content.trim().length === 0) {
    throw new Error('new_content is required and must be non-empty');
  }

  // change_reason follows the same soft-requirement pattern used for supersede/provenance
  const changeReason = (typeof args.change_reason === 'string' && args.change_reason.trim().length > 0)
    ? args.change_reason.trim()
    : null;

  // Load current plan to get title and current revision number
  const { data: plan, error: fetchErr } = await supabase
    .from('plans')
    .select('id, title, content, current_revision, source')
    .eq('id', args.plan_id)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!plan) throw new Error(`Plan not found: ${args.plan_id}`);

  const newTitle = (typeof args.new_title === 'string' && args.new_title.trim().length > 0)
    ? args.new_title.trim()
    : plan.title;
  const newRevisionNumber = plan.current_revision + 1;
  const source = args.source ?? plan.source;

  // Regenerate embedding from new content so search reflects current state
  const embedding = await embed(composeEmbeddingText.plan(newTitle, args.new_content));

  // Update the plan row
  const { data: updated, error: updateErr } = await supabase
    .from('plans')
    .update({
      title: newTitle,
      content: args.new_content,
      current_revision: newRevisionNumber,
      embedding: toPgVector(embedding),
    })
    .eq('id', args.plan_id)
    .select('id, title, status, current_revision, source, created_at')
    .single();
  if (updateErr) throw new Error(updateErr.message);

  // Insert the new revision snapshot. Non-fatal if this fails (plan is already updated).
  const { error: revErr } = await supabase.from('plan_revisions').insert({
    plan_id: args.plan_id,
    revision_number: newRevisionNumber,
    title: newTitle,
    content: args.new_content,
    change_reason: changeReason,
    source,
  });
  if (revErr) {
    console.error(`Failed to insert revision ${newRevisionNumber} for plan ${args.plan_id}:`, revErr.message);
  }

  const response: any = {
    ...updated,
    previous_revision: plan.current_revision,
  };
  if (!changeReason) {
    response.warning =
      'change_reason was not provided. The edit succeeded but the reason for the change is not captured. ' +
      'Ask the user what prompted this revision and record it — future readers will need to know why the plan evolved.';
  }
  return JSON.stringify(response, null, 2);
}

// ─────────────────────────────────────────────────────────
// Get all revisions for a plan — walk the evolution.
// ─────────────────────────────────────────────────────────

async function getPlanRevisions(supabase: SupabaseClient, args: Args): Promise<string> {
  if (!args.plan_id) throw new Error('plan_id is required');

  // Fetch the plan for context (title, current_revision)
  const { data: plan, error: planErr } = await supabase
    .from('plans')
    .select('id, title, status, current_revision, created_at')
    .eq('id', args.plan_id)
    .maybeSingle();
  if (planErr) throw new Error(planErr.message);
  if (!plan) throw new Error(`Plan not found: ${args.plan_id}`);

  // Order newest → oldest so the caller sees current state first
  const includeContent = args.include_content === true;
  const selectFields = includeContent
    ? 'id, plan_id, revision_number, title, content, change_reason, source, created_at'
    : 'id, plan_id, revision_number, title, change_reason, source, created_at';

  const { data: revisions, error: revErr } = await supabase
    .from('plan_revisions')
    .select(selectFields)
    .eq('plan_id', args.plan_id)
    .order('revision_number', { ascending: false });
  if (revErr) throw new Error(revErr.message);

  return JSON.stringify({
    plan: {
      id: plan.id,
      title: plan.title,
      status: plan.status,
      current_revision: plan.current_revision,
      created_at: plan.created_at,
    },
    revision_count: revisions?.length ?? 0,
    content_included: includeContent,
    revisions: revisions ?? [],
  }, null, 2);
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

async function listPlans(supabase: SupabaseClient, args: Args): Promise<string> {
  if (!args.project_slug) throw new Error('project_slug is required');
  const projectId = await resolveProjectId(supabase, args.project_slug);

  const includeContent = args.include_content === true;
  const selectFields = includeContent
    ? 'id, title, status, content, provenance, tags, source, current_revision, created_at, blessed_at, completed_at'
    : 'id, title, status, provenance, tags, source, current_revision, created_at, blessed_at, completed_at';

  const { data, error } = await supabase
    .from('plans')
    .select(selectFields)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  return JSON.stringify({
    project_slug: args.project_slug,
    count: data?.length ?? 0,
    content_included: includeContent,
    plans: data ?? [],
  }, null, 2);
}

// ─────────────────────────────────────────────────────────
// Status snapshots
// ─────────────────────────────────────────────────────────

async function writeStatusSnapshot(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const embedding = await embed(composeEmbeddingText.snapshot(args.narrative));
  const { tags, substitutions } = await normalizeAndReconcile(supabase, args.tags, projectId);
  // observed_at describes the moment the narrative captures; stored in created_at.
  const observedAt = parseOverrideTimestamp(args.observed_at, 'observed_at');
  const insertRow: any = {
    project_id: projectId,
    narrative: args.narrative,
    tags,
    source: args.source,
    embedding: toPgVector(embedding),
  };
  if (observedAt) insertRow.created_at = observedAt;
  const { data, error } = await supabase.from('status_snapshots').insert(insertRow)
    .select('id, narrative, tags, source, created_at').single();
  if (error) throw new Error(error.message);
  return JSON.stringify({ ...data, tag_substitutions: substitutions }, null, 2);
}

// ─────────────────────────────────────────────────────────
// describe_capabilities — self-introspection.
// When a fresh Claude encounters this MCP, one call to this tool
// replaces reading 30+ tool descriptions. It returns:
//   - What the system is for
//   - What entities it tracks (and how they relate)
//   - Standing principles (soft requirements, no fabrication, explicit scope)
//   - Tool categories (dashboard/activity/search/write/update)
//   - Currently-registered projects (dynamic)
//   - Tips for using it well
// ─────────────────────────────────────────────────────────

async function describeCapabilities(supabase: SupabaseClient, _args: Args): Promise<string> {
  // Pull current projects so the response is self-documenting
  const { data: projects } = await supabase
    .from('projects')
    .select('slug, name, description, status')
    .neq('status', 'archived')
    .order('name');

  const overview =
    'A cross-chat memory system. Every project you work on has state — decisions made, ' +
    'assumptions active, blockers open, next moves queued, plans in flight, lessons learned, ' +
    'snapshots of where things stand. This system persists that state in a shared database so ' +
    'a conversation picked up a week later starts where the last one ended. It is accessed ' +
    'through an MCP server that runs alongside every Claude chat.';

  const entities = {
    project: 'The top-level container. Everything else belongs to a project. Each project has a slug (e.g. family-trip-app) and optional repo URL / Supabase ID / Vercel ID.',
    decision: 'A closed commitment that shapes what gets built. Immutable once written — to change, supersede it. Carries rationale, optional change_reason (why we moved from the old decision), and optional provenance (what you consulted).',
    assumption: 'Something believed to be true without verification. Status: active / confirmed / invalidated. Transitions through update_assumption.',
    blocker: 'An open question or external dependency stopping progress. Resolves when someone answers or the dependency lifts.',
    next_move: 'A concrete action. Has priority (urgent/normal/someday) and estimated_effort (small/medium/large). Completes when done.',
    plan: 'A structured document describing how something will be built. Goes through lifecycle: draft → blessed → executing → complete (or abandoned). Content is versioned — every edit creates a new entry in plan_revisions.',
    note: 'Low-friction capture. Use for anything worth remembering that does not yet fit a structured entity. Can later be promoted into a decision / assumption / blocker / next_move / lesson.',
    lesson: 'A retrospective observation. What happened, what to do differently. Carries severity (minor/normal/major).',
    snapshot: 'A narrative summary of where a project is right now. Written periodically to capture the feel of the moment, not just the structured state.',
  };

  const standing_principles = [
    'System carries discipline, not user. Server normalizes tags, reconciles near-duplicates, regenerates embeddings, defaults to safe behavior. You tag and write however is natural.',
    'Silent-work, visible-narration pattern. Server does the work; response includes fields describing what was done (tag_substitutions, warnings, project_counts). Claude relays to the user conversationally.',
    'Never fabricate defaults. If change_reason or provenance is unknown, store null and return a warning. A null field is more honest than a meaningless placeholder. Ask the user rather than inventing.',
    'Explicit opt-in for cross-project. Any read that could span projects (search_state, find_by_tags, get_activity) requires either project_slug or all_projects=true. Omitting both is an error.',
    'Soft-requirement pattern: fields like change_reason and provenance are strongly preferred but not strictly required. Missing surfaces a warning with the ID needed to fill it in later — never blocks the write.',
    'Results carry project_slug. Every cross-project result row includes which project it came from. Responses include project_counts so the caller sees the breakdown at a glance.',
  ];

  const tool_categories = {
    overview: 'Use get_project_dashboard for "how is X going" queries (fast, fixed-shape). Use get_project_state for full dumps. Use get_activity for "what happened" timelines.',
    search: 'search_state for semantic search ("find things about X"). find_by_tags for exact/fuzzy tag retrieval. list_tags to see what tags exist. Both require scope (project_slug or all_projects).',
    write_capture: 'add_note for low-friction capture. promote_note to convert a note into a structured entity. log_decision, add_assumption, add_blocker, add_next_move, add_lesson, write_plan, write_status_snapshot for direct structured writes.',
    update_lifecycle: 'update_assumption (status change), resolve_blocker, complete_next_move, update_plan_status, update_plan_content (creates revision), supersede_decision (replaces an old decision).',
    update_fill_gaps: 'update_change_reason fills in a missing reason on a supersession. update_provenance fills in missing provenance on a decision or plan. add_tags appends tags.',
    history_walkers: 'get_decision_chain walks supersession history for a decision. get_plan_revisions walks a plan\'s edit history. Both show how thinking evolved.',
    project_registration: 'create_project to register a new project. list_projects to see what exists.',
  };

  const usage_tips = [
    'When the user asks "what are we doing on X", call get_project_dashboard first. It is cheap, fast, and fixed-shape. Only call get_project_state when they explicitly want the full dump.',
    'When you are not sure whether something is a decision, assumption, or note — write a note. Promotion is easy. Reclassification after writing the wrong entity is costly.',
    'Always pass source. It names who made this write (e.g. "claude-chat-2026-04-21-trip-app"). Future readers will want to know where the entry came from.',
    'Tag liberally. The server reconciles near-duplicates automatically ("Photos" → "photo", "Build Manager" → "build-manager"), so you never need to be consistent by hand. Tags make future retrieval cheap.',
    'Warnings in responses are for the user, not just for you. If the server warns that change_reason is missing, ask the user — do not guess.',
    'For cross-project work, always pass all_projects=true explicitly. The error message you get otherwise is designed to remind you to be intentional about scope.',
  ];

  return JSON.stringify({
    name: 'Project State MCP',
    version: 'live',
    overview,
    entities,
    standing_principles,
    tool_categories,
    usage_tips,
    projects_registered: projects ?? [],
  }, null, 2);
}
