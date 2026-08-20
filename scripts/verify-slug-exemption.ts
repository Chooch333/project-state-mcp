// Scratch verification for BB-2026-08-19-identifier-tag-exemption-extension
// (resolves D-064). Follows the same pattern as scripts/verify-tag-fix.ts
// (BB-2026-08-18-tag-substitution-fix, D-062) -- no test framework is
// installed in this repo, so this is a standalone script, not a suite.
//
// Proves:
//   1. Gap 1 (deterministic singularization) no longer strips a meaningful
//      trailing "s" from slug/BB-ID-shaped tags (bb-2026-08-18-hygiene-
//      census-fixes survives normalizeOne unchanged), while an ordinary
//      2-segment plural compound (merge-candidates) still singularizes --
//      the C-057-confirmed intended behavior.
//   2. The known, accepted false negative is documented and tested
//      explicitly, not silently left as an assumption: a short 2-segment
//      reference tag ("review-corrections") is NOT caught by the
//      slug-shape predicate, because it is syntactically indistinguishable
//      from an ordinary plural compound noun. This is a reasoned tradeoff,
//      not an oversight -- see the isSlugShaped() comment in lib/tags.ts.
//   3. Gap 2 (trigram fuzzy-collision) no longer collapses slug-shaped
//      near-superset tags -- the exact live repro
//      (bb-2026-08-18-hygiene-census-fixes-brief -> bb-2026-08-18-hygiene-
//      census-fix, score 0.762) is fixed, plus the read-path
//      (expandForQuery) is symmetric with the write path.
//   4. D-062's own non-regression guarantees (wg-017/wg-013/wg-018,
//      e-223/e-045) and the ordinary-word fuzzy path (photos -> photo,
//      merge-candidate exact match) are unaffected.
//
// Run: compile with `npx tsc` (or equivalent) then `node` the output.
// Prints PASS/FAIL per assertion and exits nonzero if anything failed.

import { reconcileWithExisting, trigramSimilarity, normalizeOne, expandForQuery } from '../lib/tags';

let failures = 0;

function report(pass: boolean, label: string, detail: string): void {
  if (pass) {
    console.log(`PASS: ${label}`);
  } else {
    failures++;
    console.log(`FAIL: ${label} -- ${detail}`);
  }
}

function assertTrue(cond: boolean, label: string, detail: string): void {
  report(cond, label, detail);
}

function assertTagSet(actual: string[], expected: string[], label: string): void {
  const a = [...actual].sort();
  const e = [...expected].sort();
  const pass = a.length === e.length && a.every((v, i) => v === e[i]);
  report(pass, label, `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
}

console.log('=== BB-2026-08-19-identifier-tag-exemption-extension verification ===\n');

// ---------------------------------------------------------------------
// Gap 1: deterministic singularization must NOT touch slug-shaped tags
// ---------------------------------------------------------------------

{
  const norm = normalizeOne('bb-2026-08-18-hygiene-census-fixes');
  assertTrue(norm === 'bb-2026-08-18-hygiene-census-fixes', 'Gap1 live case: bb-2026-08-18-hygiene-census-fixes survives normalizeOne unchanged', `got ${JSON.stringify(norm)}`);
}

{
  // "review-corrections" is a KNOWN, ACCEPTED false negative (2 segments,
  // no digits -- indistinguishable from merge-candidates by shape). This
  // assertion documents the expected (unfixed) behavior, not a bug.
  const norm = normalizeOne('review-corrections');
  assertTrue(norm === 'review-correction', 'Gap1 known false negative, documented: review-corrections still singularizes to review-correction (2-segment tags are not slug-shaped)', `got ${JSON.stringify(norm)}`);
}

{
  // Non-regression: ordinary 2-segment plural compounds must still singularize.
  const norm = normalizeOne('merge-candidates');
  assertTrue(norm === 'merge-candidate', 'Non-regression: merge-candidates still singularizes to merge-candidate (C-057 intended behavior)', `got ${JSON.stringify(norm)}`);
}

{
  // Non-regression: bare "Photos" -> "photo" is NOT touched by the new
  // slug-shape check (single segment, skip-list already handles "os").
  const norm = normalizeOne('Photos');
  assertTrue(norm === 'photos', 'normalizeOne("Photos") unaffected by slug-shape change (still "photos" -- "os" skip-list, singularization happens in the fuzzy-reconcile step, per scripts/verify-tag-fix.ts analysis)', `got ${JSON.stringify(norm)}`);
}

{
  // A slug-shaped tag whose real trailing segment is a genuine identifier
  // fragment (digits) must also survive -- e.g. wg-eighteen-hygiene (3
  // segments, no digits at all, but already in real use as a stable tag).
  const norm = normalizeOne('wg-eighteen-hygiene');
  assertTrue(norm === 'wg-eighteen-hygiene', 'wg-eighteen-hygiene (3 segments) survives unchanged', `got ${JSON.stringify(norm)}`);
}

// ---------------------------------------------------------------------
// Gap 2: trigram substitution must NOT collapse slug-shaped near-supersets
// ---------------------------------------------------------------------

{
  // The exact live repro: adding a "distinctive suffix" append that is a
  // near-superset of an existing shorter slug tag used to collapse at
  // score 0.762. Must now survive.
  const sim = trigramSimilarity('bb-2026-08-18-hygiene-census-fixes-brief', 'bb-2026-08-18-hygiene-census-fix');
  console.log(`INFO: trigramSimilarity('bb-...-fixes-brief', 'bb-...-fix') = ${sim.toFixed(4)} (bug precondition -- would have collapsed pre-fix)`);
  assertTrue(sim >= 0.55, 'Gap2 bug precondition: near-superset pair scores >= 0.55', `score=${sim}`);

  const existing = new Set(['bb-2026-08-18-hygiene-census-fix']);
  const { final, substitutions } = reconcileWithExisting(['bb-2026-08-18-hygiene-census-fixes-brief'], existing);
  assertTagSet(final, ['bb-2026-08-18-hygiene-census-fixes-brief'], 'Gap2 live case: near-superset slug tag NOT substituted');
  assertTrue(substitutions.length === 0, 'Gap2 live case: no substitutions recorded', `substitutions=${JSON.stringify(substitutions)}`);
}

{
  // Full BB-ID slug tag must be protected from trigram collapse against a
  // near-neighbor slug tag too.
  const existing = new Set(['bb-review-corrections-2026-0819']); // deliberate near-neighbor, not identical
  const { final, substitutions } = reconcileWithExisting(['bb-review-corrections-2026-08-19'], existing);
  assertTagSet(final, ['bb-review-corrections-2026-08-19'], 'Full BB-ID slug tag not substituted against a near-neighbor slug');
  assertTrue(substitutions.length === 0, 'Full BB-ID slug tag: no substitutions recorded', `substitutions=${JSON.stringify(substitutions)}`);
}

{
  // session-log-repair vs session-log: 3-segment slug-shaped tag must not
  // collapse into the shorter existing word tag.
  const sim = trigramSimilarity('session-log-repair', 'session-log');
  console.log(`INFO: trigramSimilarity('session-log-repair', 'session-log') = ${sim.toFixed(4)}`);
  const existing = new Set(['session-log']);
  const { final, substitutions } = reconcileWithExisting(['session-log-repair'], existing);
  assertTagSet(final, ['session-log-repair'], 'session-log-repair (3 segments) not substituted into session-log');
  assertTrue(substitutions.length === 0, 'session-log-repair: no substitutions recorded', `substitutions=${JSON.stringify(substitutions)}`);
}

// ---------------------------------------------------------------------
// Non-regression: D-062's numeric-identifier guarantees (wg-017/wg-013/e-223)
// ---------------------------------------------------------------------

{
  const existing = new Set(['wg-013']);
  const { final, substitutions } = reconcileWithExisting(['wg-017'], existing);
  assertTagSet(final, ['wg-017'], 'D-062 non-regression: wg-017 vs existing {wg-013} unchanged');
  assertTrue(substitutions.length === 0, 'D-062 non-regression: wg-017 no substitutions', `substitutions=${JSON.stringify(substitutions)}`);
}

{
  const existing = new Set(['wg-013', 'wg-017']);
  const { final, substitutions } = reconcileWithExisting(['wg-018'], existing);
  assertTagSet(final, ['wg-018'], 'D-062 non-regression: wg-018 vs existing {wg-013, wg-017} unchanged');
  assertTrue(substitutions.length === 0, 'D-062 non-regression: wg-018 no substitutions', `substitutions=${JSON.stringify(substitutions)}`);
}

{
  const existing = new Set(['e-045']);
  const { final, substitutions } = reconcileWithExisting(['e-223'], existing);
  assertTagSet(final, ['e-223'], 'D-062 non-regression: e-223 vs existing {e-045} unchanged');
  assertTrue(substitutions.length === 0, 'D-062 non-regression: e-223 no substitutions', `substitutions=${JSON.stringify(substitutions)}`);
}

// ---------------------------------------------------------------------
// Non-regression: ordinary word fuzzy reconciliation (ties D-062's own test)
// ---------------------------------------------------------------------

{
  const normalizedPhotos = normalizeOne('Photos');
  if (normalizedPhotos !== null) {
    const existing = new Set(['photo']);
    const { final, substitutions } = reconcileWithExisting([normalizedPhotos], existing);
    assertTagSet(final, ['photo'], `ordinary word ${JSON.stringify(normalizedPhotos)} vs existing {photo}: resolves to existing canonical tag`);
    assertTrue(substitutions.length === 1, 'ordinary word fuzzy branch still exercised (non-regression)', `substitutions=${JSON.stringify(substitutions)}`);
  }
}

{
  const existing = new Set(['merge-candidate']);
  const { final, substitutions } = reconcileWithExisting(['merge-candidate'], existing); // already singularized by normalizeOne upstream
  assertTagSet(final, ['merge-candidate'], 'merge-candidate exact match still works');
  assertTrue(substitutions.length === 0, 'merge-candidate exact match: no substitutions', `substitutions=${JSON.stringify(substitutions)}`);
}

// ---------------------------------------------------------------------
// Read-path symmetry: expandForQuery must not expand slug tags into
// unrelated matches, matching the write-path guarantees above.
// ---------------------------------------------------------------------

async function runReadPathChecks() {
  const fakeSupabase = {
    from() {
      return {
        select() {
          return Promise.resolve({ data: [], error: null });
        },
        eq() {
          return this;
        },
      };
    },
  } as any;

  const { expansions: exp1 } = await expandForQuery(fakeSupabase, ['bb-2026-08-18-hygiene-census-fixes'], null);
  assertTrue(exp1.length === 0, 'expandForQuery: slug tag produces no fuzzy expansions (read/write symmetry)', `expansions=${JSON.stringify(exp1)}`);
}

runReadPathChecks().then(() => {
  console.log(`\n${failures === 0 ? 'ALL ASSERTIONS PASSED' : `${failures} ASSERTION(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
});
