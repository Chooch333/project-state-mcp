import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase, resolveProjectId } from './supabase';

type Args = Record<string, any>;

export async function callTool(name: string, args: Args): Promise<string> {
  const supabase = getSupabase();

  switch (name) {
    case 'list_projects':
      return listProjects(supabase, args);
    case 'get_project_state':
      return getProjectState(supabase, args);
    case 'create_project':
      return createProject(supabase, args);
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

  const [decisions, assumptions, blockers, nextMoves, snapshot, project] = await Promise.all([
    supabase.from('decisions').select('id, title, rationale, alternatives_considered, decided_at, source').eq('project_id', projectId).is('supersedes', null).order('decided_at', { ascending: false }),
    supabase.from('assumptions').select('id, statement, alternatives, source, created_at').eq('project_id', projectId).eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('blockers').select('id, question, context, source, created_at').eq('project_id', projectId).is('resolved_at', null).order('created_at', { ascending: false }),
    supabase.from('next_moves').select('id, description, priority, estimated_effort, source, created_at').eq('project_id', projectId).is('completed_at', null).order('created_at', { ascending: false }),
    supabase.from('status_snapshots').select('narrative, source, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('projects').select('name, description, repo_url, supabase_project_id, vercel_project_id').eq('id', projectId).maybeSingle(),
  ]);

  const errors = [decisions.error, assumptions.error, blockers.error, nextMoves.error, snapshot.error, project.error].filter(Boolean);
  if (errors.length) throw new Error(errors.map((e) => e!.message).join('; '));

  const state = {
    project: project.data,
    latest_snapshot: snapshot.data,
    active_decisions: decisions.data ?? [],
    active_assumptions: assumptions.data ?? [],
    open_blockers: blockers.data ?? [],
    open_next_moves: nextMoves.data ?? [],
    counts: {
      decisions: decisions.data?.length ?? 0,
      assumptions: assumptions.data?.length ?? 0,
      blockers: blockers.data?.length ?? 0,
      next_moves: nextMoves.data?.length ?? 0,
    },
  };
  return JSON.stringify(state, null, 2);
}

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

async function logDecision(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const { data, error } = await supabase.from('decisions').insert({
    project_id: projectId,
    title: args.title,
    rationale: args.rationale,
    alternatives_considered: args.alternatives_considered ?? null,
    source: args.source,
  }).select().single();
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}

async function supersedeDecision(supabase: SupabaseClient, args: Args): Promise<string> {
  // Look up the old decision's project first
  const { data: oldRow, error: oldErr } = await supabase.from('decisions').select('project_id').eq('id', args.old_decision_id).maybeSingle();
  if (oldErr) throw new Error(oldErr.message);
  if (!oldRow) throw new Error(`Decision not found: ${args.old_decision_id}`);

  const { data, error } = await supabase.from('decisions').insert({
    project_id: oldRow.project_id,
    title: args.new_title,
    rationale: args.new_rationale,
    alternatives_considered: args.new_alternatives_considered ?? null,
    source: args.source,
    supersedes: args.old_decision_id,
  }).select().single();
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}

async function addAssumption(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const { data, error } = await supabase.from('assumptions').insert({
    project_id: projectId,
    statement: args.statement,
    alternatives: args.alternatives ?? null,
    source: args.source,
  }).select().single();
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

async function addBlocker(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const { data, error } = await supabase.from('blockers').insert({
    project_id: projectId,
    question: args.question,
    context: args.context ?? null,
    source: args.source,
  }).select().single();
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

async function addNextMove(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const { data, error } = await supabase.from('next_moves').insert({
    project_id: projectId,
    description: args.description,
    priority: args.priority ?? 'normal',
    estimated_effort: args.estimated_effort ?? null,
    source: args.source,
  }).select().single();
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

async function writePlan(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const { data, error } = await supabase.from('plans').insert({
    project_id: projectId,
    title: args.title,
    content: args.content,
    source: args.source,
  }).select().single();
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
    return JSON.stringify(data, null, 2);
  }
  if (args.project_slug) {
    const projectId = await resolveProjectId(supabase, args.project_slug);
    const { data, error } = await supabase.from('plans').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`No plans found for project: ${args.project_slug}`);
    return JSON.stringify(data, null, 2);
  }
  throw new Error('Must provide either plan_id or project_slug.');
}

async function writeStatusSnapshot(supabase: SupabaseClient, args: Args): Promise<string> {
  const projectId = await resolveProjectId(supabase, args.project_slug);
  const { data, error } = await supabase.from('status_snapshots').insert({
    project_id: projectId,
    narrative: args.narrative,
    source: args.source,
  }).select().single();
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}
