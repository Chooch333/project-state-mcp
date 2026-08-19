# Build Brief — BB-2026-08-18-tag-substitution-fix

**Git home:** Chooch333/project-state-mcp · `docs/design/BB-2026-08-18-tag-substitution-fix.md`
**Project State plan:** on the project-state-mcp project · status `queued`
**What this is:** Fix the recurring tag fuzzy-substitution bug in the Project State MCP that silently rewrites identifier-style tags (e.g. `wg-017` → `wg-013`, `wg-018` → `wg-017`) on write. Third+ observed occurrence (logged C-055/C-056) — past rule-of-three.

## Root cause (verified by reading the code)

In `lib/tags.ts`, `reconcileWithExisting()` replaces a new tag with an existing one whenever `trigramSimilarity` ≥ `SIMILARITY_THRESHOLD` (0.55). Trigram (pg_trgm-style) similarity is **blind to short numeric discriminators**: `wg-017` and `wg-013` share almost all trigrams (`wg-`, `g-0`, `-01`) and differ only in the final digit, scoring ~0.56 — over threshold. So the very tags used as stable identifiers (a shared alpha stem + a short distinguishing suffix) are exactly the pattern this matcher collapses. It's not that the threshold is globally wrong — it's right for the intended `photos`→`photo` de-duplication — it's that identifier tags should be **exempt from fuzzy substitution entirely**.

## Scope

**In scope:** stop fuzzy-substituting identifier-pattern tags, while preserving the existing photo/photos-style reconciliation for ordinary word tags. The fix lives in `lib/tags.ts` (and wherever `reconcileWithExisting` / `normalizeAndReconcile` is called on write, if a guard is cleaner there).

**Out of scope:** no change to read-time `expandForQuery` behavior beyond what's needed for consistency; no schema change; no retroactive repair of already-substituted tags (call that out as a possible follow-up, don't do it here).

## Directive

Autonomous per PROTOCOL.md — decide the exact predicate, log it, proceed; halt only at a hard gate (none expected). Re-read after edit; this is a deployed Vercel MCP, so confirm the build/typecheck is clean.

**Recommended fix (decide + log; adjust if a cleaner predicate emerges):** in `reconcileWithExisting`, before accepting a fuzzy match, skip substitution when the input tag matches an **identifier pattern** — an alphabetic prefix followed by a separator and a numeric (or alphanumeric-with-digits) suffix, e.g. `/^[a-z]+-?\d+$/` (catches `wg-017`, `e-223`, `bb-2026`, `pp-018`, etc.). Identifier tags pass through as-is (they become their own canonical form). Ordinary word tags keep today's behavior. Two guards worth considering, pick per what the code makes clean:
1. **Pattern exemption** (above) — narrow, targeted, low-risk. Preferred.
2. **Suffix-sensitivity**: additionally, never substitute when both tags share a stem but differ in a trailing digit run — defends against identifier pairs that slip the pattern. Optional belt-and-suspenders.

Add a couple of unit-style checks (or a scratch test) proving `wg-017`/`wg-018`/`wg-013` and `e-223`/`e-045` no longer collapse into each other, while `photos`→`photo` still reconciles.

## Inputs

- `lib/tags.ts` (`reconcileWithExisting`, `normalizeAndReconcile`, `SIMILARITY_THRESHOLD`, `trigramSimilarity`) and its write-path callers in `lib/handlers.ts` — Chooch333/project-state-mcp.
- Observed failures: C-055 / C-056 on the platform/cbrain projects; this session saw `wg-017`→`wg-013` and `wg-018`→`wg-017` (scores ~0.556). Every write returns a `tag_substitutions` array — that's the signal to check against.
- Reconcile against live Project State on start.

## Acceptance criteria

- Identifier-pattern tags (`^[a-z]+-?\d+$` and similar) are never fuzzy-substituted on write — verified by a test asserting `wg-017`, `wg-018`, `wg-013` stay distinct.
- Ordinary reconciliation still works — `photos`→`photo` (or equivalent) still collapses.
- Typecheck/build clean; deployed. Session Log on the project-state-mcp project references BB-2026-08-18-tag-substitution-fix with the commit SHA and the chosen predicate. Note the un-repaired historical substitutions as an optional follow-up.

## Pasteable prompt

> Fetch and follow `docs/design/BB-2026-08-18-tag-substitution-fix.md` from Chooch333/project-state-mcp via Custom GitHub MCP get_file_contents. First read PROTOCOL.md (Chooch333/chat-protocol). The bug: lib/tags.ts reconcileWithExisting fuzzy-substitutes identifier tags like wg-017→wg-013 because trigram similarity is blind to short numeric suffixes (score ~0.556 > 0.55 threshold). Fix: exempt identifier-pattern tags (^[a-z]+-?\d+$) from fuzzy substitution while keeping photos→photo reconciliation for ordinary tags. Execute autonomously: decide the exact predicate, log it, halt only at a hard gate (none expected). Add tests proving wg-017/wg-018/wg-013 stay distinct and photos→photo still collapses. Confirm typecheck/build clean (deployed Vercel MCP). Close with a Session Log on the project-state-mcp project referencing BB-2026-08-18-tag-substitution-fix.
