// Scratch verification for Build 23 (BB-2026-10-04-shelf-design-board): the pure
// staleness helper behind the board_reminder soft nudge.
//
// No test framework is installed in this repo, so (like verify-tag-fix.ts) this is a
// standalone script. Run:
//   npx tsc --outDir dist --module commonjs --target ES2022 --esModuleInterop --skipLibCheck scripts/verify-board-reminder.ts
//   node dist/scripts/verify-board-reminder.js   (dist/ is gitignored; run from repo root so node_modules resolves)
// Prints PASS/FAIL per assertion and exits nonzero if anything failed.

import { isBoardLineStale, BOARD_REMINDER_STALE_MINUTES } from '../lib/handlers';

let failures = 0;
function check(pass: boolean, label: string): void {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${label}`);
  if (!pass) failures++;
}

const now = new Date('2026-10-04T12:00:00Z');
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

check(BOARD_REMINDER_STALE_MINUTES === 45, 'threshold constant is 45 minutes');
check(isBoardLineStale(null, now) === true, 'missing line (null) is stale');
check(isBoardLineStale(undefined, now) === true, 'missing line (undefined) is stale');
check(isBoardLineStale('', now) === true, 'missing line (empty string) is stale');
check(isBoardLineStale('not-a-date', now) === true, 'unparseable timestamp is stale');
check(isBoardLineStale(minsAgo(5), now) === false, 'line written 5 min ago is fresh');
check(isBoardLineStale(minsAgo(45), now) === false, 'line written exactly 45 min ago is fresh (boundary)');
check(isBoardLineStale(minsAgo(46), now) === true, 'line written 46 min ago is stale');
check(isBoardLineStale(minsAgo(600), now) === true, 'line written 10 h ago is stale');
check(isBoardLineStale(new Date(now.getTime() - 10 * 60_000), now) === false, 'Date input 10 min ago is fresh');
check(isBoardLineStale(minsAgo(20), now, 15) === true, 'custom threshold honored');

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
