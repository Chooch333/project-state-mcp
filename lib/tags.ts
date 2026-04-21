// Tag normalization and fuzzy reconciliation.
//
// Design principles:
//   - The user (and Claude) never has to tag consistently by hand.
//   - Tags are normalized at write time to a canonical form (lowercase, hyphenated, singularized).
//   - Before writing, the server checks if a similar tag already exists; if so, it uses the existing
//     tag instead of creating a near-duplicate ("photos" → "photo" when "photo" already exists).
//   - At read time, the same fuzzy expansion is applied to input tags so searches catch near-matches.

import { SupabaseClient } from '@supabase/supabase-js';

const ENTITY_TABLES = [
  'decisions', 'assumptions', 'blockers', 'next_moves',
  'plans', 'status_snapshots', 'notes', 'lessons',
];

const SIMILARITY_THRESHOLD = 0.55;

// ─────────────────────────────────────────────────────────
// Normalization: shape a raw string into a canonical tag.
// ─────────────────────────────────────────────────────────

/**
 * Normalize a single tag string to canonical form.
 * Returns null if the input isn't a usable tag (empty after cleaning).
 *
 * Examples:
 *   "Photos"         → "photo"
 *   "Build Manager"  → "build-manager"
 *   "build_manager"  → "build-manager"
 *   " Photos  "      → "photo"
 *   "user's data!"   → "users-data"  // apostrophe/punctuation stripped, s at end dropped
 *   "stress"         → "stress"      // not singularized (ends in ss)
 */
export function normalizeOne(tag: unknown): string | null {
  if (typeof tag !== 'string') return null;
  let t = tag.trim().toLowerCase();
  if (!t) return null;

  // Spaces, underscores, consecutive whitespace → single hyphen
  t = t.replace(/[\s_]+/g, '-');
  // Strip anything that isn't alphanumeric or hyphen
  t = t.replace(/[^a-z0-9-]/g, '');
  // Collapse multiple hyphens
  t = t.replace(/-+/g, '-');
  // Trim leading/trailing hyphens
  t = t.replace(/^-+|-+$/g, '');
  if (!t) return null;

  // Conservative singularization on the final hyphenated segment.
  // This handles "stop-photos" → "stop-photo" without touching the stem.
  const parts = t.split('-');
  parts[parts.length - 1] = singularize(parts[parts.length - 1]);
  t = parts.join('-');

  return t;
}

/**
 * Conservative English singularization — avoids false conversions on words
 * ending in 'ss', 'us', 'is', 'os', or 'as' (stress, focus, axis, tempos, atlas).
 * Only applies to words with 4+ characters.
 */
function singularize(word: string): string {
  if (word.length < 4) return word;

  // "ies" → "y": parties → party, dependencies → dependency
  if (word.endsWith('ies') && word.length >= 5) {
    return word.slice(0, -3) + 'y';
  }

  // "es" → "": boxes → box, dishes → dish, matches → match, buzzes → buzz
  // Only apply when preceded by a sibilant cluster that takes "es" naturally.
  if (word.endsWith('es') && word.length >= 5) {
    const stem = word.slice(0, -2);
    if (
      stem.endsWith('ch') || stem.endsWith('sh') ||
      stem.endsWith('x') || stem.endsWith('z') || stem.endsWith('ss')
    ) {
      return stem;
    }
    // Otherwise drop just the trailing "s" — changes → change, files → file
    return word.slice(0, -1);
  }

  // Trailing "s" → drop, but skip common non-plural patterns
  if (word.endsWith('s')) {
    const lastTwo = word.slice(-2);
    const skip = ['ss', 'us', 'is', 'os', 'as'];
    if (!skip.includes(lastTwo)) {
      return word.slice(0, -1);
    }
  }

  return word;
}

/**
 * Normalize an array of raw tag strings. Returns unique, canonicalized tags.
 */
export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out = new Set<string>();
  for (const t of tags) {
    const norm = normalizeOne(t);
    if (norm) out.add(norm);
  }
  return Array.from(out);
}

// ─────────────────────────────────────────────────────────
// Trigram similarity — used for fuzzy tag reconciliation.
// Matches Postgres pg_trgm's approach so behavior is predictable.
// ─────────────────────────────────────────────────────────

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `; // pg_trgm pads with 2 leading spaces and 1 trailing
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/**
 * Jaccard similarity of trigram sets. Returns 0-1.
 */
export function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const ga = trigrams(a);
  const gb = trigrams(b);
  let intersection = 0;
  for (const g of ga) if (gb.has(g)) intersection++;
  const union = ga.size + gb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ─────────────────────────────────────────────────────────
// Reconciliation: replace near-duplicate tags with existing canonical form.
// ─────────────────────────────────────────────────────────

/**
 * Load every tag currently used in the DB (optionally project-scoped).
 * Returns a Set for O(1) exact lookups.
 */
export async function loadExistingTags(
  supabase: SupabaseClient,
  projectId: string | null
): Promise<Set<string>> {
  const existing = new Set<string>();
  for (const table of ENTITY_TABLES) {
    let q = supabase.from(table).select('tags');
    if (projectId) q = q.eq('project_id', projectId);
    const { data, error } = await q;
    if (error) continue; // non-fatal — partial reconciliation is better than none
    for (const row of data ?? []) {
      for (const tag of row.tags ?? []) {
        if (typeof tag === 'string' && tag.length > 0) existing.add(tag);
      }
    }
  }
  return existing;
}

/**
 * Given input tags (already normalized), return the set to actually persist.
 * Exact matches pass through. Near-matches above threshold are replaced with
 * the existing canonical tag (prevents photo/photos drift).
 * Tags with no close match are kept as-is — they become the canonical version
 * for future writes.
 */
export function reconcileWithExisting(
  inputTags: string[],
  existingTags: Set<string>,
  threshold = SIMILARITY_THRESHOLD
): { final: string[]; substitutions: Array<{ from: string; to: string; score: number }> } {
  const final = new Set<string>();
  const substitutions: Array<{ from: string; to: string; score: number }> = [];

  for (const inp of inputTags) {
    if (existingTags.has(inp)) {
      final.add(inp);
      continue;
    }
    // Find best fuzzy match above threshold
    let best: { tag: string; score: number } | null = null;
    for (const existing of existingTags) {
      const score = trigramSimilarity(inp, existing);
      if (score >= threshold && (!best || score > best.score)) {
        best = { tag: existing, score };
      }
    }
    if (best) {
      final.add(best.tag);
      substitutions.push({ from: inp, to: best.tag, score: Number(best.score.toFixed(3)) });
    } else {
      final.add(inp);
    }
  }

  return { final: Array.from(final), substitutions };
}

/**
 * Full reconciliation pipeline for writes: normalize the raw input,
 * then reconcile against existing tags.
 */
export async function normalizeAndReconcile(
  supabase: SupabaseClient,
  rawTags: unknown,
  projectId: string | null
): Promise<{ tags: string[]; substitutions: Array<{ from: string; to: string; score: number }> }> {
  const normalized = normalizeTags(rawTags);
  if (normalized.length === 0) return { tags: [], substitutions: [] };
  const existing = await loadExistingTags(supabase, projectId);
  const { final, substitutions } = reconcileWithExisting(normalized, existing);
  return { tags: final, substitutions };
}

/**
 * Expansion pipeline for reads: given input tags, return the set to query with.
 * Includes the input tag itself plus any existing tags within the fuzzy threshold.
 * This is how find_by_tags handles "photo" matching rows tagged "photos".
 */
export async function expandForQuery(
  supabase: SupabaseClient,
  rawTags: unknown,
  projectId: string | null,
  threshold = SIMILARITY_THRESHOLD
): Promise<{ tags: string[]; expansions: Array<{ input: string; matched: string[] }> }> {
  const normalized = normalizeTags(rawTags);
  if (normalized.length === 0) return { tags: [], expansions: [] };

  const existing = await loadExistingTags(supabase, projectId);
  const expandedSet = new Set<string>();
  const expansions: Array<{ input: string; matched: string[] }> = [];

  for (const inp of normalized) {
    expandedSet.add(inp);
    const matched: string[] = [];
    for (const existingTag of existing) {
      if (existingTag === inp) continue;
      if (trigramSimilarity(inp, existingTag) >= threshold) {
        expandedSet.add(existingTag);
        matched.push(existingTag);
      }
    }
    if (matched.length > 0) {
      expansions.push({ input: inp, matched });
    }
  }

  return { tags: Array.from(expandedSet), expansions };
}
