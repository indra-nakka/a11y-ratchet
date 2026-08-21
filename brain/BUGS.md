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

## B7 — the Quickstart's first command 404s for every real reader

**Status:** fixed, commit `359e34b` · **Severity:** high — it's the first command in the
README · **File:** `README.md` Quickstart · **Found by:** external review, 2026-08-21

`registry.npmjs.org/a11y-ratchet` returns 404 — the package has never been published (on
purpose; publishing is the human's call, not this agent's). The README's literal first
command, `npx a11y-ratchet scan https://example.com ...`, therefore fails for every reader
who hasn't already installed something locally.

**Why R1.7's verification missed this:** it ran `npm pack`, installed the tarball into a
fresh directory (`npm install ./a11y-ratchet-0.1.0.tgz`), then ran `npx a11y-ratchet` from
that same directory. `npx` checks the local `node_modules/.bin` before it ever considers
the registry, so that test exercised a working local install and never touched the
registry path the README actually instructs a reader to take. Verified a different thing
than the README says — same species as B1-B5 (a check that sounds like it covers the
claim but doesn't), just not caught by any of the five, because this one is about a
runtime resolution path, not a stale hand-typed fact.

**Fix:** replaced the Quickstart with a clone → `npm install` → `npm run build` → `npm
link` path, executed end to end against a fresh clone of the pushed repo (not the local
working copy — a genuinely independent check) before it was written into the README.

---

## B6 — the linked demo-PR CI runs may not be visible to a logged-out reader

**Status:** open, unresolved · **Severity:** medium — undercuts a credibility claim the
README makes about itself · **File:** `README.md` GitHub Action section

The README argues "a CI feature nobody can see running is a claim; a linked PR is
evidence," and links both demo PRs' Actions runs as that evidence. Checked directly this
session, unauthenticated (fresh Playwright browser, no cookies, no `gh` auth): the run
page for PR #1's failing run
(`github.com/indra-nakka/a11y-ratchet/actions/runs/32399787931`) — both the run-overview
page and the individual job page — shows the workflow graph and step list, but **no step
or job summary content at all**. The page's top-right corner reads "Sign in to view
logs," which is expected to gate raw logs; it appears to also gate the custom Markdown
job summary the composite action writes.

**Confirmed this isn't a tool-side failure to write the summary**, via authenticated
`gh run view 32399787931 --log`: the "Write job summary" step (`action.yml`'s own step
name) is present in the real run log and its `cat ... >> $GITHUB_STEP_SUMMARY` line
executed. The content exists server-side; it did not render for an unauthenticated
Playwright session.

**Not yet resolved:** whether this is (a) a genuine, general GitHub Actions behaviour —
job summaries requiring sign-in on public repos, independent of this project — or (b) a
setting specific to this repo/account (e.g. a private-by-default Actions visibility
option) that could be changed. Needs checking from an actual signed-in browser, which
this agent doesn't have. If (a), the README's "a linked PR is evidence" framing needs a
caveat: evidence for a signed-in reader, not any reader. If (b), it's a one-time repo
setting fix.

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
