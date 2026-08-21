# BUGS

Append-only. Never delete an entry; change its status.

**Status:** `open` · `fixed` · `wontfix` · `not-a-bug` (kept, with what was learned)

Every `fixed` needs a commit SHA. Every `open` needs a file and line.

---

## The pattern these share

B1–B5 are all one species: **a correction was made in one place and never propagated to
another.** None is a logic error; all are internal contradictions between two documents, or
between a document and the code.

No test catches these, and every one of them is visible to a person reading two sections in
sequence. That is worth a standing habit: **before release, read the README start to finish
as a stranger**, and when you fix a fact, `grep` for every other place it appears.

Candidate structural fix, post-release: a docs-consistency test that asserts (a) no
backticked `ratchet ` appears without the `a11y-` prefix, (b) no coverage number appears
outside `GENERATED` markers, and (c) `npm run docs:coverage` produces no diff on a clean
tree. That converts this whole class from "spot it by reading" to "CI catches it."

---

## B1 — README coverage counts are the pre-correction hand count

**Status:** fixed, commit `8178dc0` · **Severity:** high — public, and undermines the project's core claim
**File:** `README.md`, the `<!-- GENERATED:coverage -->` block
**Fix:** `RUNBOOK.md` R1.1

The README's coverage table shows `Partial 20 · Manual 29 · Any signal 26 (47%)`. The
generated truth from `src/wcag/coverage.ts` is `Partial 17 · Manual 32 · Any signal 23
(42%)`.

The delta is exactly D23/D24 — 2.4.6, 3.3.8 and 4.1.3 de-credited from Partial to Manual.
The README carries the numbers from before that correction. The session record shows a
"README coverage synced" patch that never reached the repo.

**Why this is the worst one:** the block sits inside `GENERATED` markers, so it *asserts*
it was machine-generated when it was hand-typed. A reader who knows the convention trusts
it more, not less. And a project whose central claim is honesty about coverage limits is
currently overstating its own coverage by three criteria and five percentage points, on its
front page.

**Root cause:** the generator targets `docs/03-EVIDENCE.md` but apparently not `README.md`,
so the markers there are decorative. Fixing the number without fixing the generator
guarantees a recurrence.

---

## B1b — the coverage sentence sits outside the markers

**Status:** fixed, commit `8178dc0` · **Severity:** high · **File:** `README.md`, directly under the table
**Fix:** `RUNBOOK.md` R1.2

The prose sentence restating the counts ("evidence for 26 of the 55…") is outside the
`GENERATED` block, hand-typed, and drifted independently of the table above it.

Direct violation of invariant 5: *never hardcode a coverage count, recall figure, or
percentage.* Same sentence is flagged in `03-EVIDENCE.md §1.7` as "the sentence that does
the work" — i.e. it is the one most likely to be quoted elsewhere.

---

## B2 — status banner contradicts its own file

**Status:** fixed, commit `8178dc0` · **Severity:** medium · **File:** `README.md`, top banner
**Fix:** `RUNBOOK.md` R1.3

Banner says "Day 12 of a 15-day build" and that `a11y-ratchet manual` "is the one remaining
stub." The Manual mode section of the same README prints real generated output from that
command.

D90 records correcting this banner on Day 13 — the "Day 1 → Day 12" half of the edit landed,
the stub claim didn't. Verify with `grep -rn "NotImplemented" src/` before rewriting.

**Correction to the verification check:** that grep returns 2 hits, not 0 — both are
`never`-typed exhaustiveness guards in `src/index.ts` (`renderReport`/`renderDiff`), dead
code satisfying TS's switch-completeness check, not unimplemented commands. Confirmed by
reading the surrounding branches: every format is implemented. The banner fix is correct;
the literal "returns nothing" check in the runbook isn't quite right and should read
"returns only the two `index.ts` exhaustiveness guards, nothing else."

---

## B3 — config example uses the one format with no loader

**Status:** fixed, commit `8178dc0` · **Severity:** medium — it is the most-copied snippet in the file
**File:** `README.md` config section; also the Action YAML block
**Fix:** `RUNBOOK.md` R1.4

The headline example is `a11y-ratchet.config.ts`. Per D58, `.ts` config is *discovered and
attempted* but no transpiler is bundled — esbuild was rejected as a runtime dependency. It
works on Node 24 via type-stripping and fails elsewhere in the supported range.

Structurally identical to the bare-`ratchet` bug: the most copy-pasted example is the one
that breaks, and only on some machines, which is worse than breaking on all of them.

Two sub-defects in the same block:
- The category comment lists three values; D56 kept **four**. `deferred` is missing.
- The Action YAML has the same `.ts` path in a comment.

---

## B4 — "interaction states are a v2 feature" contradicts the plan

**Status:** fixed, commit `8178dc0` · **Severity:** low-medium · **File:** `README.md` §5 and Roadmap
**Fix:** `RUNBOOK.md` R1.5

`00-BRIEF-AND-PLAN.md §4` lists states behind interaction under **never in scope**. The
README promises them as v2 in one place and via user-supplied scripts in another. Three
documents, two positions.

The docs are right, and the reason is good: driving the application produces a
non-deterministic page set, and a diff over a non-deterministic page set reports regressions
that are only a different traversal. Say that instead of promising the feature.

---

## B5 — bare `ratchet` survives in a design doc

**Status:** fixed, commit `8178dc0` · **Severity:** medium — staged to re-ship
**File:** `docs/03-EVIDENCE.md:165`
**Fix:** `RUNBOOK.md` R1.6

Day 13's `npx` smoke test found `ratchet <command>` in seven README locations; only
`a11y-ratchet` is a registered bin, so every one would have failed with "command not found."
D90 records fixing the README.

It was **not** fixed in `03-EVIDENCE.md`, and that line is the sentence §1.7 stages for
pasting into the README — so the bug is queued to ship a second time through the same route
that shipped it the first time.

---

## Known gaps — not bugs, but named

| Item | Note |
|---|---|
| ~~`docs/DECISIONS.md` ends at D90~~ | Fixed, commit `80cfaa6` — D91-D95 backfilled. |
| Settle contract layout-stability gap | 150ms mutation quiet misses a third-party iframe landing after the quiet window. Roadmap, not a v1 fix. |
| `checks[].data` discarded at normalise | Loses `fgColor`/`bgColor`/`contrastRatio`/`messageKey`. Roadmap. |
| `PageErrorKind` `probe-failed` / `page-crashed` | Typed but never produced. Already in the README roadmap. |
| Network-timeout classification | D89 — "very likely correct," not re-verified. Roadmap. |
| Faceted-search URL templating | Query params preserved by design; faceted search breaks the assumption. Roadmap. |
| Within-collision-group tracking | Cannot identify which member of a tied family changed. Documented limitation. |
