// Scratch verification for BB-2026-08-18-tag-substitution-fix (C-055/C-056).
//
// No test framework is installed in this repo (no jest/vitest/mocha in
// package.json), so this is a standalone script rather than a suite. It
// empirically proves two things with real Set inputs:
//
//   1. Identifier-style tags (wg-017 vs wg-013/wg-017/wg-018, e-223 vs e-045)
//      no longer get fuzzy-substituted into each other by
//      reconcileWithExisting -- including confirming, via trigramSimilarity,
//      that the wg-* pairs really do score >= SIMILARITY_THRESHOLD (0.55),
//      i.e. this is the actual bug precondition from C-055/C-056, not a
//      vacuous test.
//   2. The pre-existing ordinary-word fuzzy reconciliation path (the
//      "photos" -> "photo" example from this module's top-of-file comment)
//      is genuinely unaffected by the identifier-pattern guard. Ordinary
//      words never match IDENTIFIER_TAG_PATTERN (no digits), so they must
//      still flow through the original fuzzy-match loop untouched.
//
// Run: compile with `npx tsc` (or equivalent) then `node` the output -- see
// the verification notes in the task report for the exact command used.
// Prints PASS/FAIL per assertion and exits nonzero if anything failed.

import { reconcileWithExisting, trigramSimilarity, normalizeOne } from '../lib/tags';

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

console.log('=== BB-2026-08-18-tag-substitution-fix verification ===\n');

// ---------------------------------------------------------------------
// Part 1: identifier tags stay distinct (the actual bug: C-055/C-056)
// ---------------------------------------------------------------------

// Sanity-check the bug precondition itself: wg-017/wg-013/wg-018 really do
// score at/above SIMILARITY_THRESHOLD (0.55) by trigram similarity -- this
// is *why* they used to collapse pre-fix. If any of these printed < 0.55,
// the scenario below would not actually be exercising the bug.
const wgSim1 = trigramSimilarity('wg-017', 'wg-013');
const wgSim2 = trigramSimilarity('wg-018', 'wg-013');
const wgSim3 = trigramSimilarity('wg-018', 'wg-017');
console.log(`INFO: trigramSimilarity('wg-017','wg-013') = ${wgSim1.toFixed(4)}`);
console.log(`INFO: trigramSimilarity('wg-018','wg-013') = ${wgSim2.toFixed(4)}`);
console.log(`INFO: trigramSimilarity('wg-018','wg-017') = ${wgSim3.toFixed(4)}`);
assertTrue(wgSim1 >= 0.55, 'bug precondition: wg-017/wg-013 trigram score >= 0.55 (would have collapsed pre-fix)', `score=${wgSim1}`);
assertTrue(wgSim2 >= 0.55, 'bug precondition: wg-018/wg-013 trigram score >= 0.55 (would have collapsed pre-fix)', `score=${wgSim2}`);
assertTrue(wgSim3 >= 0.55, 'bug precondition: wg-018/wg-017 trigram score >= 0.55 (would have collapsed pre-fix)', `score=${wgSim3}`);

// wg-017 against existing {wg-013} -- must stay wg-017, no substitution.
{
  const existing = new Set(['wg-013']);
  const { final, substitutions } = reconcileWithExisting(['wg-017'], existing);
  assertTagSet(final, ['wg-017'], 'wg-017 vs existing {wg-013}: final tags unchanged');
  assertTrue(substitutions.length === 0, 'wg-017 vs existing {wg-013}: no substitutions recorded', `substitutions=${JSON.stringify(substitutions)}`);
}

// wg-018 against existing {wg-013, wg-017} -- must stay wg-018, no
// substitution against either near-neighbor.
{
  const existing = new Set(['wg-013', 'wg-017']);
  const { final, substitutions } = reconcileWithExisting(['wg-018'], existing);
  assertTagSet(final, ['wg-018'], 'wg-018 vs existing {wg-013, wg-017}: final tags unchanged');
  assertTrue(substitutions.length === 0, 'wg-018 vs existing {wg-013, wg-017}: no substitutions recorded', `substitutions=${JSON.stringify(substitutions)}`);
}

// e-223 against existing {e-045} -- must stay e-223, no substitution.
{
  const eSim = trigramSimilarity('e-223', 'e-045');
  console.log(`INFO: trigramSimilarity('e-223','e-045') = ${eSim.toFixed(4)} (informational -- below 0.55, so this specific pair was never independently at risk from the fuzzy loop; this assertion instead confirms the pattern guard exempts identifier-shaped tags unconditionally, not only ones close enough to have collided)`);
  const existing = new Set(['e-045']);
  const { final, substitutions } = reconcileWithExisting(['e-223'], existing);
  assertTagSet(final, ['e-223'], 'e-223 vs existing {e-045}: final tags unchanged');
  assertTrue(substitutions.length === 0, 'e-223 vs existing {e-045}: no substitutions recorded', `substitutions=${JSON.stringify(substitutions)}`);
}

// ---------------------------------------------------------------------
// Part 2: ordinary-word fuzzy reconciliation is unaffected
// ---------------------------------------------------------------------

// First establish, empirically, what normalizeOne actually does with
// "Photos". This module's own top-of-file comment cites "photos" -> "photo"
// as the canonical example of fuzzy reconciliation, but singularize()'s
// skip-list (['ss','us','is','os','as']) means words ending in "os" --
// which includes "photos" -- are deliberately NOT singularized by
// normalizeOne itself (same reason "tempos"/"cosmos" aren't). So the
// "photos" -> "photo" collapse actually happens in reconcileWithExisting's
// fuzzy loop, not in normalizeOne. Confirm this empirically before asserting
// against whichever function turns out to actually be responsible.
const normalizedPhotos = normalizeOne('Photos');
console.log(`\nINFO: normalizeOne('Photos') = ${JSON.stringify(normalizedPhotos)}`);
assertTrue(normalizedPhotos !== null, 'normalizeOne("Photos") produces a non-null tag', `got ${JSON.stringify(normalizedPhotos)}`);

if (normalizedPhotos !== null) {
  const photoSim = trigramSimilarity(normalizedPhotos, 'photo');
  console.log(`INFO: trigramSimilarity(${JSON.stringify(normalizedPhotos)}, 'photo') = ${photoSim.toFixed(4)}`);

  const existing = new Set(['photo']);
  const { final, substitutions } = reconcileWithExisting([normalizedPhotos], existing);
  assertTagSet(final, ['photo'], `ordinary word ${JSON.stringify(normalizedPhotos)} vs existing {photo}: resolves to existing canonical tag`);

  if (normalizedPhotos === 'photo') {
    // normalizeOne already collapsed it to an exact match -- this would
    // exercise the exact-match branch, not the fuzzy loop.
    console.log('INFO: normalizeOne fully collapsed "Photos" to "photo" -- exact-match branch exercised, not the fuzzy loop.');
    assertTrue(substitutions.length === 0, 'exact-match branch: no substitution recorded (input already equals existing)', `substitutions=${JSON.stringify(substitutions)}`);
  } else {
    // Distinct string after normalization (expected, per the analysis
    // above) -- this is the genuine pre-existing fuzzy branch, the exact
    // code path the identifier-pattern guard sits next to. It must behave
    // exactly as before the fix, since "photo"/"photos" contain no digits
    // and never match IDENTIFIER_TAG_PATTERN.
    assertTrue(substitutions.length === 1, 'fuzzy branch exercised: exactly one substitution recorded', `substitutions=${JSON.stringify(substitutions)}`);
    if (substitutions.length === 1) {
      assertTrue(
        substitutions[0].from === normalizedPhotos && substitutions[0].to === 'photo',
        'fuzzy substitution recorded correctly (normalized input -> existing canonical tag)',
        `got ${JSON.stringify(substitutions[0])}`
      );
    }
  }
}

// ---------------------------------------------------------------------
console.log(`\n${failures === 0 ? 'ALL ASSERTIONS PASSED' : `${failures} ASSERTION(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
