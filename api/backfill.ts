// Backfill endpoint for embeddings. Runs daily on a Vercel cron (vercel.json) and can
// still be called by hand.
// Scans every content table for rows with NULL embedding, computes the embedding
// from the same fields used during normal writes, updates the row.
// Idempotent — safe to re-run. Respects the same auth pattern as /api/mcp
// (Bearer header OR ?token=SECRET), and also accepts Vercel's cron call, which
// arrives as Authorization: Bearer $CRON_SECRET (BB-2026-11-04-stack-fix-project-state).
//
// A run stops starting new work after TIME_BUDGET_MS so it finishes inside the
// function's 60-second limit; whatever is left is picked up by the next run, and the
// summary says stopped_early: true.

import type { IncomingMessage, ServerResponse } from 'http';
import { getSupabase } from '../lib/supabase';
import { embed, toPgVector, composeEmbeddingText } from '../lib/embeddings';

const TIME_BUDGET_MS = 45_000;
const CONCURRENCY = 8;

type ComposeFn = (row: Record<string, any>) => string;

interface TableSpec {
  name: string;
  columns: string[]; // columns to SELECT besides id + embedding
  compose: ComposeFn;
}

const TABLES: TableSpec[] = [
  {
    name: 'decisions',
    columns: ['title', 'rationale', 'alternatives_considered'],
    compose: (r) => composeEmbeddingText.decision(r.title, r.rationale, r.alternatives_considered),
  },
  {
    name: 'assumptions',
    columns: ['statement', 'alternatives'],
    compose: (r) => composeEmbeddingText.assumption(r.statement, r.alternatives),
  },
  {
    name: 'blockers',
    columns: ['question', 'context'],
    compose: (r) => composeEmbeddingText.blocker(r.question, r.context),
  },
  {
    name: 'next_moves',
    columns: ['description'],
    compose: (r) => composeEmbeddingText.nextMove(r.description),
  },
  {
    name: 'notes',
    columns: ['content', 'topic'],
    compose: (r) => composeEmbeddingText.note(r.content, r.topic),
  },
  {
    name: 'lessons',
    columns: ['situation', 'lesson', 'applies_to'],
    compose: (r) => composeEmbeddingText.lesson(r.situation, r.lesson, r.applies_to),
  },
  {
    name: 'status_snapshots',
    columns: ['narrative'],
    compose: (r) => composeEmbeddingText.snapshot(r.narrative),
  },
  {
    name: 'plans',
    columns: ['title', 'content'],
    compose: (r) => composeEmbeddingText.plan(r.title, r.content),
  },
];

function extractQueryToken(req: IncomingMessage): string | null {
  try {
    const parsed = new URL(req.url ?? '', 'http://placeholder');
    return parsed.searchParams.get('token');
  } catch {
    return null;
  }
}

function checkAuth(req: IncomingMessage): boolean {
  const expected = process.env.MCP_SHARED_SECRET;
  if (!expected) return true;
  const auth = req.headers['authorization'];
  if (auth && auth === `Bearer ${expected}`) return true;
  const queryToken = extractQueryToken(req);
  if (queryToken && queryToken === expected) return true;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  return false;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (!checkAuth(req)) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.statusCode = 500;
    res.end(JSON.stringify({
      error: 'OPENAI_API_KEY not configured. Cannot generate embeddings.',
    }));
    return;
  }

  const supabase = getSupabase();
  const deadline = Date.now() + TIME_BUDGET_MS;
  const summary = {
    started_at: new Date().toISOString(),
    tables: [] as Array<{
      table: string;
      candidates: number;
      updated: number;
      skipped_empty: number;
      embed_failures: number;
      db_failures: number;
    }>,
    total_candidates: 0,
    total_updated: 0,
    total_failures: 0,
    stopped_early: false,
    errors: [] as Array<{ table: string; id?: string; reason: string }>,
  };

  for (const tbl of TABLES) {
    if (Date.now() >= deadline) {
      summary.stopped_early = true;
      break;
    }

    const selectCols = ['id', ...tbl.columns].join(',');
    const { data: rows, error } = await supabase
      .from(tbl.name)
      .select(selectCols)
      .is('embedding', null);

    if (error) {
      summary.errors.push({ table: tbl.name, reason: `select: ${error.message}` });
      summary.tables.push({
        table: tbl.name,
        candidates: 0, updated: 0, skipped_empty: 0, embed_failures: 0, db_failures: 0,
      });
      continue;
    }

    const candidates = rows?.length ?? 0;
    let updated = 0;
    let skippedEmpty = 0;
    let embedFailures = 0;
    let dbFailures = 0;

    const processRow = async (row: Record<string, any>) => {
      const text = tbl.compose(row);
      if (!text || !text.trim()) {
        skippedEmpty++;
        return;
      }

      const vector = await embed(text);
      if (!vector) {
        embedFailures++;
        summary.errors.push({ table: tbl.name, id: row.id, reason: 'embed() returned null' });
        return;
      }

      const { error: updErr } = await supabase
        .from(tbl.name)
        .update({ embedding: toPgVector(vector) })
        .eq('id', row.id);

      if (updErr) {
        dbFailures++;
        summary.errors.push({ table: tbl.name, id: row.id, reason: `update: ${updErr.message}` });
      } else {
        updated++;
      }
    };

    const list = (rows ?? []) as unknown as Array<Record<string, any>>;
    for (let i = 0; i < list.length; i += CONCURRENCY) {
      if (Date.now() >= deadline) {
        summary.stopped_early = true;
        break;
      }
      await Promise.all(list.slice(i, i + CONCURRENCY).map(processRow));
    }

    summary.total_candidates += candidates;
    summary.total_updated += updated;
    summary.total_failures += embedFailures + dbFailures;
    summary.tables.push({
      table: tbl.name,
      candidates, updated, skipped_empty: skippedEmpty,
      embed_failures: embedFailures, db_failures: dbFailures,
    });
  }

  (summary as any).finished_at = new Date().toISOString();
  res.statusCode = 200;
  res.end(JSON.stringify(summary, null, 2));
}
