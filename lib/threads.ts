// Open threads — the Next steps list (Build 44, BB-2026-10-20-next-steps-dev-tab;
// checked status, chat links and projects: BB-2026-10-21-next-steps-panel rev 5).
//
// Every skill that leaves work open reports where it stands with `checkin`
// (rule: agent-library references/thread-checkin.md). The night runner re-checks
// open cards and writes `context` + `checked_at`. The list is read on cbrain's Dev tab.
//
// The database does the bookkeeping (table open_threads, trigger
// open_threads_before_write / open_threads_after_write):
//   - next_step / plain_name / any text inside context containing ids or codes
//     (TH-004, BB-2026...) are refused with "Write this without ids like TH-004 — say what it is."
//   - moved_at only moves, and a history row is only written, when next_step or
//     waiting_on actually changes. A context rewrite never moves the card.
// This module adds: no write at all when nothing changed, chats merged by url
// (never dropped), and no reopening a done/dropped thread unless reopen: true.
//
// project and campaign are Charles's fields, set only on cbrain's Dev tab.
// No tool here writes them. checkin still accepts project_label so older chats
// don't error, but ignores it.

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
export const CHAT_ROLES = ['designed-in', 'last-worked-in', 'build-session', 'other'] as const;
export const VERDICTS = ['open', 'looks-done', 'stale-reason'] as const;
const SOURCES = ['chat', 'sweep', 'job'] as const;

const THREAD_COLUMNS =
  'id, thread_key, kind, plain_name, project, campaign, next_step, waiting_on, links, chat_url, chats, context, checked_at, opened_at, moved_at, status, closed_how, closed_at, source, updated_at';

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

type Chat = { label: string; url: string; role: string };

function readChats(raw: unknown): Chat[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) throw new Error('chats must be a list of {label, url, role}.');
  return raw.map((c: any, i: number) => {
    const label = typeof c?.label === 'string' ? c.label.trim() : '';
    const url = typeof c?.url === 'string' ? c.url.trim() : '';
    const role = typeof c?.role === 'string' ? c.role.trim() : 'other';
    if (!label || !url) throw new Error(`chats[${i}] needs both label and url.`);
    if (!(CHAT_ROLES as readonly string[]).includes(role)) {
      throw new Error(`chats[${i}].role must be one of: ${CHAT_ROLES.join(', ')}.`);
    }
    return { label, url, role };
  });
}

// Merge by url: existing entries are never dropped; an incoming entry with a url
// already present updates that entry's label and role; new urls are appended.
function mergeChats(existing: Chat[], incoming: Chat[]): Chat[] {
  const out = existing.map((c) => ({ ...c }));
  for (const c of incoming) {
    const hit = out.find((e) => e.url === c.url);
    if (hit) {
      hit.label = c.label;
      hit.role = c.role;
    } else {
      out.push(c);
    }
  }
  return out;
}

type Line = { text: string; checked: boolean };
type Context = { stand: string; done: Line[]; left: Line[]; watch: Line[]; recommend: string; verdict: string };

function readLines(raw: unknown, field: string): Line[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error(`context.${field} must be a list of {text, checked}.`);
  return raw.map((l: any, i: number) => {
    const text = typeof l?.text === 'string' ? l.text.trim() : '';
    if (!text) throw new Error(`context.${field}[${i}] needs text.`);
    return { text, checked: l?.checked === true };
  });
}

function readContext(raw: unknown): Context | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('context must be {stand, done, left, watch, recommend, verdict}.');
  }
  const r = raw as Record<string, any>;
  const stand = typeof r.stand === 'string' ? r.stand.trim() : '';
  if (!stand) throw new Error('context.stand is required: one sentence on where it stands.');
  const verdict = typeof r.verdict === 'string' ? r.verdict.trim() : 'open';
  if (!(VERDICTS as readonly string[]).includes(verdict)) {
    throw new Error(`context.verdict must be one of: ${VERDICTS.join(', ')}.`);
  }
  const ctx: Context = {
    stand,
    done: readLines(r.done, 'done'),
    left: readLines(r.left, 'left'),
    watch: readLines(r.watch, 'watch'),
    recommend: typeof r.recommend === 'string' ? r.recommend.trim() : '',
    verdict,
  };
  if (ctx.done.length + ctx.left.length + ctx.watch.length > 8) {
    throw new Error('Keep the status to 8 lines or fewer across done, left and watch.');
  }
  return ctx;
}

// Key-order-independent comparison (jsonb returns keys in its own order).
function canon(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v ?? null);
}

function readCheckedAt(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' || isNaN(Date.parse(raw))) throw new Error('checked_at must be an ISO date-time.');
  return new Date(raw).toISOString();
}

export async function checkin(supabase: SupabaseClient, args: Args): Promise<string> {
  const thread_key = reqText(args, 'thread_key');
  const kind = reqText(args, 'kind');
  if (!(THREAD_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`kind must be one of: ${THREAD_KINDS.join(', ')}.`);
  }
  // project_label is accepted (older chats still send it) but ignored: projects are Charles's.
  const plain_name = reqText(args, 'plain_name');
  const next_step = reqText(args, 'next_step');
  const waiting_on = reqText(args, 'waiting_on');
  if (!(WAITING_ON as readonly string[]).includes(waiting_on)) {
    throw new Error(`waiting_on must be one of: ${WAITING_ON.join(', ')}.`);
  }
  const links = readLinks(args.links);
  const chat_url =
    typeof args.chat_url === 'string' && args.chat_url.trim().length > 0 ? args.chat_url.trim() : undefined;
  const context = readContext(args.context);
  const checked_at = readCheckedAt(args.checked_at);
  let incomingChats = readChats(args.chats) ?? [];
  if (chat_url !== undefined && !incomingChats.some((c) => c.url === chat_url)) {
    incomingChats = [...incomingChats, { label: 'Chat', url: chat_url, role: 'last-worked-in' }];
  }
  const source = (SOURCES as readonly string[]).includes(args.source) ? args.source : 'chat';
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
      plain_name,
      next_step,
      waiting_on,
      source,
      chats: incomingChats,
    };
    if (links !== undefined) row.links = links;
    if (chat_url !== undefined) row.chat_url = chat_url;
    if (context !== undefined) row.context = context;
    if (checked_at !== undefined) row.checked_at = checked_at;
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
  if (existing.plain_name !== plain_name) patch.plain_name = plain_name;
  if (existing.next_step !== next_step) patch.next_step = next_step;
  if (existing.waiting_on !== waiting_on) patch.waiting_on = waiting_on;
  if (links !== undefined && canon(existing.links ?? []) !== canon(links)) patch.links = links;
  if (chat_url !== undefined && existing.chat_url !== chat_url) patch.chat_url = chat_url;
  if (incomingChats.length > 0) {
    const merged = mergeChats((existing.chats as Chat[]) ?? [], incomingChats);
    if (canon(merged) !== canon(existing.chats ?? [])) patch.chats = merged;
  }
  if (context !== undefined && canon(existing.context) !== canon(context)) patch.context = context;
  // A re-check records when it looked even if it found the same thing; it never moves the card.
  if (
    checked_at !== undefined &&
    (!existing.checked_at || Date.parse(checked_at) > Date.parse(existing.checked_at as string))
  ) {
    patch.checked_at = checked_at;
  }
  // A chat check-in takes ownership of a row the sweep made; the sweep never takes a chat's row.
  if (source === 'chat' && existing.source !== 'chat') patch.source = 'chat';
  if (existing.status !== 'open') {
    patch.status = 'open';
    patch.closed_how = null;
    patch.closed_at = null;
  }

  if (Object.keys(patch).length === 0) {
    return JSON.stringify(
      { result: 'unchanged', note: 'Same as before — nothing written; the list keeps the old line and its date.', thread: existing },
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
