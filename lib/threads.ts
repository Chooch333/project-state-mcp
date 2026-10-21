// Open threads — the Next steps list (Build 44, BB-2026-10-20-next-steps-dev-tab).
//
// Every with-Charles chat that can be left mid-way reports where it stands with
// `checkin`; the 5 am Next steps sweep backfills what chats did not report.
// The list is read oldest-first on cbrain's Dev tab.
//
// The database does the bookkeeping (table open_threads, trigger
// open_threads_before_write / open_threads_after_write):
//   - next_step / plain_name containing ids or codes (TH-004, BB-2026...) are refused
//     with "Write this without ids like TH-004 — say what it is."
//   - moved_at only moves, and a history row is only written, when next_step or
//     waiting_on actually changes.
// This module adds: no write at all when nothing changed, and no reopening a
// done/dropped thread unless reopen: true.

import { SupabaseClient } from '@supabase/supabase-js';
import { plainDbError } from './overnight';

type Args = Record<string, any>;

export const THREAD_KINDS = [
  'design-assist',
  'build-chat',
  'tech-discovery',
  'tech-review',
  'speed-run',
  'block-chat',
  'game-maker',
  'plan-review',
  'folder-chat',
  'job',
] as const;

export const WAITING_ON = ['you', 'claude', 'a-build', 'nobody'] as const;

const THREAD_COLUMNS =
  'id, thread_key, kind, project_label, plain_name, next_step, waiting_on, links, chat_url, opened_at, moved_at, status, closed_how, closed_at, source, updated_at';

function reqText(args: Args, field: string): string {
  const v = args[field];
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new Error(`${field} is required (plain words).`);
  }
  return v.trim();
}

function readLinks(raw: unknown): { label: string; url: string }[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) throw new Error('links must be a list of {label, url}.');
  return raw.map((l: any, i: number) => {
    const label = typeof l?.label === 'string' ? l.label.trim() : '';
    const url = typeof l?.url === 'string' ? l.url.trim() : '';
    if (!label || !url) throw new Error(`links[${i}] needs both label and url.`);
    return { label, url };
  });
}

function sameLinks(a: any, b: any): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

export async function checkin(supabase: SupabaseClient, args: Args): Promise<string> {
  const thread_key = reqText(args, 'thread_key');
  const kind = reqText(args, 'kind');
  if (!(THREAD_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`kind must be one of: ${THREAD_KINDS.join(', ')}.`);
  }
  const project_label = reqText(args, 'project_label');
  const plain_name = reqText(args, 'plain_name');
  const next_step = reqText(args, 'next_step');
  const waiting_on = reqText(args, 'waiting_on');
  if (!(WAITING_ON as readonly string[]).includes(waiting_on)) {
    throw new Error(`waiting_on must be one of: ${WAITING_ON.join(', ')}.`);
  }
  const links = readLinks(args.links);
  const chat_url =
    typeof args.chat_url === 'string' && args.chat_url.trim().length > 0 ? args.chat_url.trim() : undefined;
  const source = args.source === 'sweep' ? 'sweep' : 'chat';
  const reopen = args.reopen === true;

  const { data: existing, error: readErr } = await supabase
    .from('open_threads')
    .select(THREAD_COLUMNS)
    .eq('thread_key', thread_key)
    .maybeSingle();
  if (readErr) throw new Error(plainDbError(readErr.message));

  if (!existing) {
    const row: Record<string, any> = {
      thread_key,
      kind,
      project_label,
      plain_name,
      next_step,
      waiting_on,
      source,
    };
    if (links !== undefined) row.links = links;
    if (chat_url !== undefined) row.chat_url = chat_url;
    const { data, error } = await supabase.from('open_threads').insert(row).select(THREAD_COLUMNS).single();
    if (error) throw new Error(plainDbError(error.message));
    return JSON.stringify({ result: 'opened', thread: data }, null, 2);
  }

  if (existing.status !== 'open' && !reopen) {
    return JSON.stringify(
      {
        result: 'closed-left-alone',
        note: `This thread was closed (${existing.status}${existing.closed_how ? ': ' + existing.closed_how : ''}). Nothing was changed. Pass reopen: true to open it again.`,
        thread: existing,
      },
      null,
      2
    );
  }

  const patch: Record<string, any> = {};
  if (existing.kind !== kind) patch.kind = kind;
  if (existing.project_label !== project_label) patch.project_label = project_label;
  if (existing.plain_name !== plain_name) patch.plain_name = plain_name;
  if (existing.next_step !== next_step) patch.next_step = next_step;
  if (existing.waiting_on !== waiting_on) patch.waiting_on = waiting_on;
  if (links !== undefined && !sameLinks(existing.links, links)) patch.links = links;
  if (chat_url !== undefined && existing.chat_url !== chat_url) patch.chat_url = chat_url;
  // A chat check-in takes ownership of a row the sweep made; the sweep never takes a chat's row.
  if (source === 'chat' && existing.source !== 'chat') patch.source = 'chat';
  if (existing.status !== 'open') {
    patch.status = 'open';
    patch.closed_how = null;
    patch.closed_at = null;
  }

  if (Object.keys(patch).length === 0) {
    return JSON.stringify(
      { result: 'unchanged', note: 'Same line as before — nothing written; the list keeps the old line and its date.', thread: existing },
      null,
      2
    );
  }

  const { data, error } = await supabase
    .from('open_threads')
    .update(patch)
    .eq('id', existing.id)
    .select(THREAD_COLUMNS)
    .single();
  if (error) throw new Error(plainDbError(error.message));

  const moved = 'next_step' in patch || 'waiting_on' in patch;
  return JSON.stringify(
    {
      result: existing.status !== 'open' ? 'reopened' : moved ? 'moved' : 'details-updated',
      changed: Object.keys(patch),
      thread: data,
    },
    null,
    2
  );
}

export async function closeThread(supabase: SupabaseClient, args: Args): Promise<string> {
  const thread_key = reqText(args, 'thread_key');
  const closed_how = reqText(args, 'closed_how');
  const status = args.status === 'dropped' ? 'dropped' : 'done';

  const { data: existing, error: readErr } = await supabase
    .from('open_threads')
    .select('id, status')
    .eq('thread_key', thread_key)
    .maybeSingle();
  if (readErr) throw new Error(plainDbError(readErr.message));
  if (!existing) throw new Error(`No thread with key "${thread_key}". Use list_open_threads to see the keys.`);

  const { data, error } = await supabase
    .from('open_threads')
    .update({ status, closed_how, closed_at: new Date().toISOString() })
    .eq('id', existing.id)
    .select(THREAD_COLUMNS)
    .single();
  if (error) throw new Error(plainDbError(error.message));
  return JSON.stringify({ result: status, thread: data }, null, 2);
}

export async function listOpenThreads(supabase: SupabaseClient, args: Args): Promise<string> {
  let q = supabase.from('open_threads').select(THREAD_COLUMNS).order('opened_at', { ascending: true });
  if (args.include_closed !== true) q = q.eq('status', 'open');
  const { data, error } = await q;
  if (error) throw new Error(plainDbError(error.message));
  const rows = data ?? [];
  return JSON.stringify(
    {
      count: rows.length,
      order: 'oldest opened first',
      threads: rows,
    },
    null,
    2
  );
}
