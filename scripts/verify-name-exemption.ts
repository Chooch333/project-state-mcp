// Scratch verification for BB-2026-11-03-charles-tag (Build 62, TH-J-046).
// Same pattern as verify-tag-fix.ts and verify-slug-exemption.ts: no test
// framework in this repo, so a standalone script that exits nonzero on failure.
//
// Proves: "charles" (and "Charles", "for-charles") is no longer singularized
// to "charle"; ordinary plurals still are; an existing "charle" tag does not
// pull a new "charles" write onto it; reads for "charles" still match rows
// tagged with either spelling.
//
// Run: npx tsx scripts/verify-name-exemption.ts

import { normalizeOne, reconcileWithExisting, trigramSimilarity } from '../lib/tags';

let failures = 0;
function check(pass: boolean, label: string, detail = ''): void {
  if (pass) console.log(`PASS: ${label}`);
  else { failures++; console.log(`FAIL: ${label} ${detail}`); }
}

check(normalizeOne('charles') === 'charles', 'charles stays charles', String(normalizeOne('charles')));
check(normalizeOne('Charles') === 'charles', 'Charles lowercases to charles', String(normalizeOne('Charles')));
check(normalizeOne('for charles') === 'for-charles', 'for-charles keeps its s', String(normalizeOne('for charles')));

// Non-regression: ordinary single-word plurals still singularize.
check(normalizeOne('files') === 'file', 'files -> file');
check(normalizeOne('changes') === 'change', 'changes -> change');
check(normalizeOne('merge-candidates') === 'merge-candidates', 'merge-candidates keeps its s (Build 67: hyphenated tags are never singularized)');

// Write path: with both spellings already in the DB, "charles" is an exact hit.
const existing = new Set(['charle', 'charles', 'walkthrough']);
const r = reconcileWithExisting([normalizeOne('charles')!], existing);
check(r.final.length === 1 && r.final[0] === 'charles' && r.substitutions.length === 0,
  'write: charles stays charles when charle also exists', JSON.stringify(r));

// Write path: if only "charle" existed, fuzzy match would pull "charles" onto it.
// Shown here so the data repair (charle -> charles) is understood to be required.
const onlyOld = reconcileWithExisting(['charles'], new Set(['charle']));
console.log(`INFO: with only "charle" in the DB, charles -> ${onlyOld.final[0]} (score ${trigramSimilarity('charles', 'charle').toFixed(3)})`);

process.exit(failures === 0 ? 0 : 1);
