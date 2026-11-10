// Public heartbeat (Build 27.1, BB-2026-10-07-stack-checks-claude-side).
//
// GET /api/heartbeat — unauthenticated, read-only, no tool or MCP surface. The cbrain
// stack checker (cbrain services/api/cron/stack-status.ts, every 15 min) reads it with
// its URL heartbeat check, so it can watch the Claude-run pieces without a Project State
// login of its own. It answers with timestamps, booleans and one result word ONLY —
// never titles, text or ids.
//
//   { ok, checked_at, db_ok,
//     rules_inspector: { last_walk },   newest punch_checkpoints.created_at, agent='inspector'
//     rules_repairer:  { last_run },    newest punch_checkpoints.created_at, agent='repairer'
//                                       (or the newest repairer-authored punch note, if later —
//                                       runs before Build 27.1 left only notes)
//     night_runner:    { last_night, last_result },  newest night_runs row
//     expert_ce:       { last_receipt },  (Build 68, BB-2026-11-03-expert-ce) newest
//                                       notes.created_at on project slug 'expert-bench' whose
//                                       tags contain 'expert-ce' AND 'ce-receipt' and NOT
//                                       'ce-attempt' (a receipt that read more than 0 items)
//     step_in_scorer:  { last_receipt } }  (Build 74, BB-2026-11-09-step-in-scorer) newest
//                                       notes.created_at on project slug 'total-harness' whose
//                                       tags contain 'step-in-receipt' and NOT 'step-in-attempt'
//                                       (a receipt that read more than 0 chats)
//
// A missing value is null, never omitted. On a database error: 200 with ok:false,
// db_ok:false and a short error string (no stack trace).

import type { IncomingMessage, ServerResponse } from 'http';
import { getSupabase } from '../lib/supabase';

const RESULT_WORDS = new Set(['built', 'skipped', 'stuck', 'deploy-red', 'interrupted', 'night-start']);

const EXPERT_CE_PROJECT_SLUG = 'expert-bench';
const STEP_IN_PROJECT_SLUG = 'total-harness';

function iso(v: unknown): string | null {
  if (typeof v !== 'string' || v.length === 0) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function later(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

async function newest(
  table: string,
  column: string,
  filter: [string, string] | null,
  extra = ''
): Promise<Record<string, any> | null> {
  const sb = getSupabase();
  let q: any = sb.from(table).select(column + (extra ? ', ' + extra : ''));
  if (filter) q = q.eq(filter[0], filter[1]);
  const { data, error } = await q.order(column, { ascending: false, nullsFirst: false }).limit(1);
  if (error) throw new Error(table + ': ' + error.message);
  return data && data.length > 0 ? (data[0] as Record<string, any>) : null;
}

// Newest note on a project (looked up by slug) whose tags contain every tag in `withTags`
// and not `withoutTag`. The project id is used only inside this query — it never appears
// in the response.
async function newestTaggedNote(
  projectSlug: string,
  withTags: string[],
  withoutTag: string
): Promise<Record<string, any> | null> {
  const sb = getSupabase();
  const proj = await sb.from('projects').select('id').eq('slug', projectSlug).limit(1);
  if (proj.error) throw new Error('projects: ' + proj.error.message);
  const projectId = proj.data && proj.data.length > 0 ? (proj.data[0] as any).id : null;
  if (!projectId) return null;
  const { data, error } = await sb
    .from('notes')
    .select('created_at')
    .eq('project_id', projectId)
    .contains('tags', withTags)
    .not('tags', 'cs', '{' + withoutTag + '}')
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw new Error('notes: ' + error.message);
  return data && data.length > 0 ? (data[0] as Record<string, any>) : null;
}

// Newest expert-ce receipt note on the expert-bench project.
function newestExpertCeReceipt(): Promise<Record<string, any> | null> {
  return newestTaggedNote(EXPERT_CE_PROJECT_SLUG, ['expert-ce', 'ce-receipt'], 'ce-attempt');
}

// Newest step-in scorer receipt that read chats, on the total-harness project.
function newestStepInReceipt(): Promise<Record<string, any> | null> {
  return newestTaggedNote(STEP_IN_PROJECT_SLUG, ['step-in-receipt'], 'step-in-attempt');
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  const checkedAt = new Date().toISOString();
  try {
    const [inspector, repairerCp, repairerNote, night, ceReceipt, stepInReceipt] = await Promise.all([
      newest('punch_checkpoints', 'created_at', ['agent', 'inspector']),
      newest('punch_checkpoints', 'created_at', ['agent', 'repairer']),
      newest('punch_item_notes', 'created_at', ['author', 'repairer']),
      newest('night_runs', 'created_at', null, 'result'),
      newestExpertCeReceipt(),
      newestStepInReceipt(),
    ]);
    const lastResult = night && typeof night.result === 'string' && RESULT_WORDS.has(night.result) ? night.result : null;
    const body = {
      ok: true,
      checked_at: checkedAt,
      db_ok: true,
      rules_inspector: { last_walk: iso(inspector?.created_at) },
      rules_repairer: { last_run: later(iso(repairerCp?.created_at), iso(repairerNote?.created_at)) },
      night_runner: { last_night: iso(night?.created_at), last_result: lastResult },
      expert_ce: { last_receipt: iso(ceReceipt?.created_at) },
      step_in_scorer: { last_receipt: iso(stepInReceipt?.created_at) },
    };
    res.statusCode = 200;
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(body));
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? 'database error').split('\n')[0].slice(0, 200);
    const body = {
      ok: false,
      checked_at: checkedAt,
      db_ok: false,
      error: msg,
      rules_inspector: { last_walk: null },
      rules_repairer: { last_run: null },
      night_runner: { last_night: null, last_result: null },
      expert_ce: { last_receipt: null },
      step_in_scorer: { last_receipt: null },
    };
    res.statusCode = 200;
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(body));
  }
}
