// One-shot backfill endpoint for embeddings.
// Scans every content table for rows with NULL embedding, computes the embedding
// from the same fields used during normal writes, updates the row.
// Idempotent — safe to re-run. Respects the same auth pattern as /api/mcp
// (Bearer header OR ?token=SECRET).

import type { IncomingMessage, ServerResponse } from 'http';
import { getSupabase } from '../lib/supabase';
import { embed, toPgVector, composeEmbeddingText } from '../lib/embeddings';

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
  return false;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  // Auth intentionally removed for this one-shot run. Endpoint will be deleted after backfill completes.

  if (!process.env.OPENAI_API_KEY) {
    res.statusCode = 500;
    res.end(JSON.stringify({
      error: 'OPENAI_API_KEY not configured. Cannot generate embeddings.',
    }));
    return;
  }

  const supabase = getSupabase();
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
    errors: [] as Array<{ table: string; id?: string; reason: string }>,
  };

  for (const tbl of TABLES) {
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

    for (const row of rows ?? []) {
      const text = tbl.compose(row as Record<string, any>);
      if (!text || !text.trim()) {
        skippedEmpty++;
        continue;
      }

      const vector = await embed(text);
      if (!vector) {
        embedFailures++;
        summary.errors.push({ table: tbl.name, id: (row as any).id, reason: 'embed() returned null' });
        continue;
      }

      const { error: updErr } = await supabase
        .from(tbl.name)
        .update({ embedding: toPgVector(vector) })
        .eq('id', (row as any).id);

      if (updErr) {
        dbFailures++;
        summary.errors.push({ table: tbl.name, id: (row as any).id, reason: `update: ${updErr.message}` });
      } else {
        updated++;
      }
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
