// Scratch verification for BB-2026-11-03-stack-fix-log (Build 67). Same
// pattern as the other verify-*.ts scripts: no test framework in this repo,
// so a standalone script that exits nonzero on failure.
//
// Proves: hyphenated tags are never shortened, by the normalizer or by fuzzy
// reconciliation; single-word singularizing still happens and is reported;
// near-match substitutions are still reported; clean-up of case and spacing
// is not reported.
//
// Run: npx tsx scripts/verify-hyphen-tags.ts

import { normalizeOne, normalizeTagsReporting, normalizeAndReconcile, reconcileWithExisting } from '../lib/tags';

let failures = 0;
function check(pass: boolean, label: string, detail = ''): void {
  if (pass) console.log(`PASS: ${label}`);
  else { failures++; console.log(`FAIL: ${label} ${detail}`); }
}

for (const t of ['expert-lanes', 'stack-fixes', 'github-actions', 'needs-charles', 'next-steps', 'party-dependencies']) {
  check(normalizeOne(t) === t, `${t} is stored as written`, String(normalizeOne(t)));
}
check(normalizeOne('Expert Lanes') === 'expert-lanes', 'Expert Lanes -> expert-lanes');
check(normalizeOne('expert_lanes') === 'expert-lanes', 'expert_lanes -> expert-lanes');

// Single words still singularize, and the change is reported.
check(normalizeOne('files') === 'file', 'files -> file');
check(normalizeOne('charles') === 'charles', 'charles stays charles');
{
  const r = normalizeTagsReporting(['Files', 'Build Manager', 'expert-lanes']);
  check(JSON.stringify(r.tags) === JSON.stringify(['file', 'build-manager', 'expert-lanes']), 'tags normalized', JSON.stringify(r.tags));
  check(r.substitutions.length === 1 && r.substitutions[0].from === 'files' && r.substitutions[0].to === 'file'
    && r.substitutions[0].reason === 'singularized', 'only the singularized word is reported', JSON.stringify(r.substitutions));
}

// Fuzzy reconciliation must not do the shortening the normalizer stopped doing.
{
  const r = reconcileWithExisting(['expert-lanes'], new Set(['expert-lane']));
  check(r.final[0] === 'expert-lanes' && r.substitutions.length === 0, 'expert-lanes is not pulled onto expert-lane', JSON.stringify(r));
}
{
  const r = reconcileWithExisting(['stack-fixes'], new Set(['stack-fix']));
  check(r.final[0] === 'stack-fixes' && r.substitutions.length === 0, 'stack-fixes is not pulled onto stack-fix', JSON.stringify(r));
}
// Other near-matches still reconcile, and are reported.
{
  const r = reconcileWithExisting(['photos'], new Set(['photo']));
  check(r.final[0] === 'photo' && r.substitutions[0]?.reason === 'near-match', 'photos -> photo is still a reported near-match', JSON.stringify(r));
}

// The whole write pipeline carries both kinds of report.
const fakeSupabase = {
  from() {
    return { select() { return Promise.resolve({ data: [{ tags: ['photo', 'expert-lane'] }], error: null }); } };
  },
} as any;

normalizeAndReconcile(fakeSupabase, ['expert-lanes', 'Photos', 'Files'], null).then((r) => {
  check(r.tags.includes('expert-lanes') && !r.tags.includes('expert-lane'), 'pipeline stores expert-lanes', JSON.stringify(r.tags));
  check(r.substitutions.some((s) => s.from === 'files' && s.to === 'file'), 'pipeline reports files -> file', JSON.stringify(r.substitutions));
  check(r.substitutions.some((s) => s.from === 'photos' && s.to === 'photo'), 'pipeline reports photos -> photo', JSON.stringify(r.substitutions));
  check(r.substitutions.length === 2, 'pipeline reports nothing else', JSON.stringify(r.substitutions));
  process.exit(failures === 0 ? 0 : 1);
});
