// Overnight builds (Build 26, BB-2026-10-04-night-builds).
//
// Overnight is a TAG on a plan, not a status: plans.overnight marks a brief as one the
// night runner may pick up once it is queued. plans.after_plan_ids lists plans that must
// have LANDED (status succeeded and its newest night_runs row is not deploy-red — see the
// plan_landed() SQL function) before this one builds. plans.target_repo names the repo a
// build writes to, so two builds never run in one repo at once.
//
// The ordering itself lives in the database: the overnight_line view ranks queued
// overnight briefs (position), says whether each is ready, and names what it is waiting on.
// A trigger on plans refuses self-reference, unknown ids, and loops in after_plan_ids with
// plain-words errors; those messages are passed through as-is (see plainDbError).

import { SupabaseClient } from '@supabase/supabase-js';

type Args = Record<string, any>;

export const NIGHT_RESULTS = ['built', 'skipped', 'stuck', 'deploy-red', 'interrupted', 'night-start'];
/** Build 27.1: the runner's every-night start marker — the only result written without a plan_id. */
export const NIGHT_START = 'night-start';
export const NIGHT_LINE_MAX = 120;
export const NIGHT_TIME_ZONE = 'America/Indiana/Indianapolis';

const OVERNIGHT_LINE_FIELDS = 'plan_id, plain_title, target_repo, queued_at, position, ready, waiting_on';
const NIGHT_RUN_FIELDS = 'id, night, plan_id, started_at, ended_at, result, line, created_at';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Strip any Postgres-style prefix ("ERROR:", "ERROR:  P0001:") from a database error so a
 * trigger's plain-words refusal reaches the caller exactly as written.
 */
export function plainDbError(message: unknown): string {
  const text = typeof message === 'string' ? message : String(message ?? '');
  return text.replace(/^\s*ERROR:\s*/i, '').replace(/^[0-9A-Z]{5}:\s+/, '').trim();
}

/**
 * Read the optional overnight fields (overnight, after, target_repo) from a write_plan /
 * update_plan_content / update_plan_labels call. Only fields the caller actually passed are
 * returned, so an update never touches the ones it was not given.
 *   overnight   -> plans.overnight (true/false)
 *   after       -> plans.after_plan_ids (list of plan ids; empty list or null clears it)
 *   target_repo -> plans.target_repo (empty string or null clears it)
 */
export function readOvernightFields(args: Args): Record<string, any> {
  const out: Record<string, any> = {};
  if (args.overnight !== undefined) {
    if (typeof args.overnight !== 'boolean') throw new Error('overnight must be true or false.');
    out.overnight = args.overnight;
  }
  if (args.after !== undefined) {
    if (args.after === null) {
      out.after_plan_ids = [];
    } else if (!Array.isArray(args.after)) {
      throw new Error('after must be a list of plan ids.');
    } else {
      const ids: string[] = [];
      for (const raw of args.after) {
        const id = typeof raw === 'string' ? raw.trim() : '';
        if (!UUID_RE.test(id)) {
          throw new Error('after must be a list of plan ids; "' + String(raw) + '" is not a plan id.');
        }
        if (!ids.includes(id.toLowerCase())) ids.push(id.toLowerCase());
      }
      out.after_plan_ids = ids;
    }
  }
  if (args.target_repo !== undefined) {
    if (args.target_repo !== null && typeof args.target_repo !== 'string') {
      throw new Error('target_repo must be a repo name like owner/repo (or empty to clear it).');
    }
    const repo = typeof args.target_repo === 'string' ? args.target_repo.trim() : '';
    out.target_repo = repo.length > 0 ? repo : null;
  }
  return out;
}

/**
 * The "night" a run belongs to, in America/Indiana/Indianapolis: the local calendar date,
 * except that anything before 12:00 noon local belongs to the previous date (a run at
 * 2 a.m. on the 5th is part of the night of the 4th).
 */
export function nightFor(when: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NIGHT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(when);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const y = get('year');
  const m = get('month');
  const d = get('day');
  const hour = get('hour');
  let ms = Date.UTC(y, m - 1, d);
  if (hour < 12) ms -= 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function parseOptionalTimestamp(raw: unknown, fieldName: string): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw new Error(fieldName + ' must be an ISO 8601 time if given.');
  if (raw.trim().length === 0) return null;
  const d = new Date(raw.trim());
  if (isNaN(d.getTime())) throw new Error(fieldName + ' is not a valid time: "' + raw + '"');
  return d.toISOString();
}

/** Position in the overnight line for each given plan id (null when not in the line). */
export async function overnightPositions(
  supabase: SupabaseClient, planIds: string[]
): Promise<Map<string, number>> {
  const positions = new Map<string, number>();
  if (planIds.length === 0) return positions;
  const { data, error } = await supabase
    .from('overnight_line')
    .select('plan_id, position')
    .in('plan_id', planIds);
  if (error) throw new Error(plainDbError(error.message));
  for (const row of (data ?? []) as any[]) positions.set(row.plan_id, row.position);
  return positions;
}

export async function setOvernight(supabase: SupabaseClient, args: Args): Promise<string> {
  const planId = typeof args.plan_id === 'string' ? args.plan_id.trim() : '';
  if (!planId) throw new Error('plan_id is required.');
  if (!UUID_RE.test(planId)) throw new Error('plan_id "' + planId + '" is not a plan id.');
  if (typeof args.overnight !== 'boolean') throw new Error('overnight is required and must be true or false.');

  const { data: plan, error } = await supabase
    .from('plans')
    .update({ overnight: args.overnight })
    .eq('id', planId)
    .select('id, title, plain_title, status, overnight, after_plan_ids, target_repo')
    .maybeSingle();
  if (error) throw new Error(plainDbError(error.message));
  if (!plan) throw new Error('Plan not found: ' + planId);

  const response: any = {
    plan_id: plan.id,
    plain_title: plan.plain_title ?? plan.title,
    status: plan.status,
    overnight: plan.overnight,
    after: plan.after_plan_ids ?? [],
    target_repo: plan.target_repo ?? null,
  };
  if (plan.overnight) {
    const { data: row, error: lineErr } = await supabase
      .from('overnight_line')
      .select(OVERNIGHT_LINE_FIELDS)
      .eq('plan_id', plan.id)
      .maybeSingle();
    if (lineErr) throw new Error('Overnight was set, but reading the overnight line failed: ' + plainDbError(lineErr.message));
    response.overnight_line = row ?? null;
    if (!row) {
      response.note = 'Tagged overnight, but not in the overnight line yet: the line only holds queued build briefs. It joins the line once it is queued.';
    }
  }
  return JSON.stringify(response, null, 2);
}

export async function overnightLine(supabase: SupabaseClient, _args: Args): Promise<string> {
  const { data: line, error } = await supabase
    .from('overnight_line')
    .select(OVERNIGHT_LINE_FIELDS)
    .order('position', { ascending: true });
  if (error) throw new Error(plainDbError(error.message));

  const { data: newest, error: nErr } = await supabase
    .from('night_runs')
    .select('night')
    .order('night', { ascending: false })
    .limit(1);
  if (nErr) throw new Error(plainDbError(nErr.message));
  const night: string | null = newest && newest.length > 0 ? (newest[0] as any).night : null;

  let runs: any[] = [];
  if (night) {
    const { data, error: rErr } = await supabase
      .from('night_runs')
      .select(NIGHT_RUN_FIELDS)
      .eq('night', night)
      .order('created_at', { ascending: true });
    if (rErr) throw new Error(plainDbError(rErr.message));
    runs = data ?? [];
    const ids = Array.from(new Set(runs.map((r) => r.plan_id).filter((id): id is string => typeof id === 'string')));
    const titles = new Map<string, string | null>();
    if (ids.length > 0) {
      const { data: plans, error: pErr } = await supabase
        .from('plans')
        .select('id, title, plain_title')
        .in('id', ids);
      if (pErr) throw new Error(plainDbError(pErr.message));
      for (const p of (plans ?? []) as any[]) titles.set(p.id, p.plain_title ?? p.title ?? null);
    }
    runs = runs.map((r) => ({ ...r, plain_title: r.plan_id ? titles.get(r.plan_id) ?? null : null }));
  }

  return JSON.stringify({
    count: line?.length ?? 0,
    line: line ?? [],
    last_night: { night, runs },
  }, null, 2);
}

export async function nightLog(supabase: SupabaseClient, args: Args): Promise<string> {
  if (typeof args.result !== 'string' || !NIGHT_RESULTS.includes(args.result)) {
    throw new Error('result must be one of: ' + NIGHT_RESULTS.join(', ') + ' (got "' + String(args.result) + '").');
  }
  const isStart = args.result === NIGHT_START;
  const planId = typeof args.plan_id === 'string' ? args.plan_id.trim() : '';
  if (isStart) {
    if (planId) throw new Error('night-start is the runner\'s own start marker — leave plan_id out.');
  } else {
    if (!planId) throw new Error('plan_id is required (only a night-start marker goes without one).');
    if (!UUID_RE.test(planId)) throw new Error('plan_id "' + planId + '" is not a plan id.');
  }
  const line = typeof args.line === 'string' ? args.line.trim() : '';
  if (!line) throw new Error('line is required: one plain sentence about what happened.');
  if (line.length > NIGHT_LINE_MAX) {
    throw new Error('line is ' + line.length + ' characters; keep it to ' + NIGHT_LINE_MAX + ' or fewer.');
  }
  const startedAt = parseOptionalTimestamp(args.started_at, 'started_at');
  const endedAt = parseOptionalTimestamp(args.ended_at, 'ended_at');
  const night = nightFor(startedAt ? new Date(startedAt) : new Date());

  const row: any = { night, plan_id: isStart ? null : planId, result: args.result, line };
  if (startedAt) row.started_at = startedAt;
  if (endedAt) row.ended_at = endedAt;

  const { data, error } = await supabase.from('night_runs').insert(row).select(NIGHT_RUN_FIELDS).single();
  if (error) {
    if ((error as any).code === '23503') throw new Error('Plan not found: ' + planId);
    throw new Error(plainDbError(error.message));
  }
  return JSON.stringify(data, null, 2);
}
