# Build Brief — BB-2026-08-19-identifier-tag-exemption-extension

**Git home:** Chooch333/project-state-mcp · `docs/design/BB-2026-08-19-identifier-tag-exemption-extension.md`
**Project State plan:** `77d40fe3-19ed-470b-bc88-30a3ed75d401` on `context-database`
**Resolves:** next_move **D-064** (`14264bd9-12b1-454f-b94c-b6d36419fa08`) on context-database
**What this is:** One-item follow-on to D-062. Extend the identifier-tag fuzzy-substitution exemption to cover BB-ID / brief-slug style compound tags, and fix the deterministic-singularization case that silently drops a trailing "s" on those tags. Charles approved this (option a of D-064) on 2026-08-19.

**Fresh build chat required:** the MCP tool being edited (`lib/tags.ts`) is not callable in the session that edits it, and this is the same class of change as D-062.

---

## Background (all verified, 2026-08-19)

D-062 (BB-2026-08-18-tag-substitution-fix, plan 545d6d80, live in production via deployment `dpl_5mzW66eL7vDUkcc25dNVTuDrGMxz`, commit e990f76) added `IDENTIFIER_TAG_PATTERN = /^[a-z]+-?\d+$/` and exempted matching tags from trigram fuzzy substitution in both `reconcileWithExisting` (write) and `expandForQuery` (read). That closed the highest-severity class — short numeric identifiers like `wg-017`/`wg-013`.

It did **not** cover slug/BB-ID compound tags. Two residual gaps were reproduced **live** during the very next build (BB-2026-08-19-review-corrections, plan 6ce99f17) and recorded in D-064:

**Gap 1 — deterministic singularization, silent, no substitution report.** `normalizeOne`'s `singularize()` strips a trailing "s" on compound slug tags. Observed twice: `review-corrections` → `review-correction` (on plan 6ce99f17's own write) and `bb-2026-08-18-hygiene-census-fixes` → `bb-2026-08-18-hygiene-census-fix` (on an add_note). This is D-024's intended plural-handling behavior, and it emits **no** `tag_substitutions` entry — but a brief-slug / BB-ID is a stable reference, not a natural-language plural, so it should not be singularized at all.

**Gap 2 — trigram fuzzy-collision on near-superset compound tags, still live post-D-062.** Attempting the D-061 workaround — append a distinctive suffix — was itself silently collapsed: adding `bb-2026-08-18-hygiene-census-fixes-brief` substituted to the existing shorter `bb-2026-08-18-hygiene-census-fix` at trigram score 0.762 (correctly reported this time). This proves the "append a distinctive suffix" advice is unreliable when the new tag is a near-superset of an existing one: trigram similarity stays high no matter what you append, because the appended text is a small fraction of the shared n-grams.

## Root cause pointers (confirm by reading the code)

- `lib/tags.ts`: `normalizeOne` (calls `singularize()`), `reconcileWithExisting` (write-path fuzzy substitution), `expandForQuery` (read-path fuzzy expansion), `SIMILARITY_THRESHOLD` (0.55), `IDENTIFIER_TAG_PATTERN` (from D-062), `trigramSimilarity`.
- The two behaviors are **different code paths**: Gap 1 is deterministic singularization inside normalization; Gap 2 is trigram reconciliation. Both must be handled, and D-062's existing pattern only guards the trigram path for the narrow `^[a-z]+-?\d+$` shape.

## Directive

Autonomous per PROTOCOL.md — decide the exact predicate and where each guard sits, log the fork, halt only at a genuine hard gate (none expected).

1. **Define a slug/BB-ID tag shape** broad enough to catch `bb-2026-08-18-hygiene-census-fixes`, `review-corrections`, `wg-eighteen-hygiene`, date-stamped brief slugs, etc., without swallowing ordinary word tags that *should* still reconcile (`photos`→`photo`, `merge-candidates`→`merge-candidate`). This is the core judgment call — a reasonable starting predicate: a tag containing a date fragment (`\d{4}-\d{2}`) OR a `bb-`/`wg-`/`e-`/`d-`/BB-style prefix OR ≥3 hyphen-separated segments reads as a structured reference, not a natural-language noun. Decide the precise rule, log it with its false-positive/false-negative reasoning.
2. **Exempt matching tags from singularization** (Gap 1) — they pass through `normalizeOne` with the trailing "s" intact.
3. **Exempt matching tags from trigram substitution** in both `reconcileWithExisting` and `expandForQuery` (Gap 2), read/write symmetric, exactly as D-062 did for its pattern. Consider whether this simply widens `IDENTIFIER_TAG_PATTERN` or is a second, separate exemption constant — decide and log.
4. **Update the standing workaround guidance.** Amend D-061's lesson text (and/or the tag-hygiene note in PROTOCOL.md — put it wherever the D-061 guidance is actually consumed; check) to state: appending a distinctive **suffix** does NOT reliably dodge the threshold when the base is a near-superset; the reliable dodge is a genuinely distinctive **stem**. Log this as a decision.
5. **Tests** proving: the new slug/BB-ID tags survive both singularization and trigram substitution unchanged; `photos`→`photo` and ordinary word reconciliation still collapse; D-062's `wg-017`/`wg-013` guarantees still hold (non-regression). Negative control as D-062 did.
6. **Deploy + verify live** via Vercel MCP (deployment READY/production at the fix commit = typecheck/build clean and genuinely live).

Out of scope: no retroactive repair of already-substituted historical tags (note as optional follow-up if wanted); no change to the ordinary word-reconciliation threshold or behavior.

## Acceptance criteria

- Slug/BB-ID-shaped tags are neither singularized nor trigram-substituted, on both read and write paths (test-proven, including the two exact live cases: `review-corrections`, `bb-2026-08-18-hygiene-census-fixes`).
- `photos`→`photo` and other genuine word reconciliation still collapse (test-proven).
- D-062's numeric-identifier guarantees intact (non-regression test).
- D-061 / PROTOCOL.md workaround guidance amended re: near-superset suffixes; decision logged.
- Deployed, Vercel deployment READY/production at the fix commit.
- Session Log on context-database referencing BB-2026-08-19-identifier-tag-exemption-extension with commit SHAs + the chosen predicate; mark D-064 complete citing this plan; flip plan `77d40fe3-19ed-470b-bc88-30a3ed75d401` to succeeded.

## Inputs

`lib/tags.ts` and its write-path callers in `lib/handlers.ts` (Chooch333/project-state-mcp); D-062 (identifier-pattern exemption, the direct precedent), D-024 (original 0.55 fuzzy-reconciliation + singularization design), D-061 (workaround lesson to amend), next_move D-064 (the spec, with both live repro cases). Reconcile against live Project State on start — DB is truth.

## Pasteable prompt

> Fetch and follow `docs/design/BB-2026-08-19-identifier-tag-exemption-extension.md` from Chooch333/project-state-mcp via Custom GitHub MCP `get_file_contents`. First read PROTOCOL.md (Chooch333/chat-protocol) per standing rules and reconcile against live Project State — DB is truth. This extends D-062: the identifier-tag exemption didn't cover slug/BB-ID compound tags, so (gap 1) deterministic singularize() silently drops the trailing "s" on tags like `bb-2026-08-18-hygiene-census-fixes`→`...-fix` and `review-corrections`→`review-correction` with no tag_substitutions entry, and (gap 2) trigram substitution still collapses near-superset compound tags (`bb-...-fixes-brief`→`bb-...-fix`, score 0.762), which is why "append a distinctive suffix" is unreliable. Define a slug/BB-ID tag shape, exempt it from BOTH singularization and trigram substitution (read + write paths, as D-062 did), keep `photos`→`photo` working, and amend the D-061/PROTOCOL.md workaround guidance to say a distinctive stem — not a suffix on a near-superset — is the reliable dodge. Execute autonomously: decide the predicate, log the fork, halt only at a hard gate (none expected). Test the two live repro cases + non-regression on D-062's wg-017/wg-013. Deploy and confirm READY/production via Vercel MCP. Close with a Session Log on context-database referencing BB-2026-08-19-identifier-tag-exemption-extension, mark D-064 complete, and flip plan 77d40fe3-19ed-470b-bc88-30a3ed75d401 to succeeded.
