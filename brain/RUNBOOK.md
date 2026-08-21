# RUNBOOK — finishing a11y-ratchet

Numbered steps from "inherited this repo cold" to "tagged and released."

Each step names **who** does it, what must be true first, the exact action, how you know
it's done, and what to write back to `brain/`.

**Do them in order.** R3 is the only one that needs a human with a browser; R1, R2, R6 and
most of R7 do not, so they can run while verification is in progress.

| Phase | What | Who | Blocked by |
|---|---|---|---|
| R0 | Inherit and verify the repo | agent | — |
| R1 | Fix the README drift bugs | agent | R0 |
| R2 | Backfill Day 14 decisions | agent | R0 |
| R3 | **Verify findings in a browser** | **human** | R0 |
| R4 | Compute precision | agent | R3 |
| R5 | Write README §6 | agent | R4 |
| R6 | Roadmap + remaining TODOs | agent | R1 |
| R7 | Release | both | all |

---

# R0 — Inherit and verify

**Who:** agent · **Needs:** repo checkout, Node 20+

Do not trust any document about this repo, including `brain/`, until these pass. Documents
have drifted from code here before — that is the substance of R1.

### R0.1 — Get oriented

```bash
git clone https://github.com/indra-nakka/a11y-ratchet && cd a11y-ratchet
git log --oneline -15
git status
ls docs/ audit/2026-08-20/
```

**Done when:** you can name the last commit and the working tree is clean.

### R0.2 — Confirm it builds and passes

```bash
npm ci
npm run typecheck
npm test
npm run build
```

**Done when:** all four exit 0. Record the actual test count in your session notes — do
**not** write it into `brain/` (Rule 1: no derived facts).

**If tests fail:** stop. Open a bug in `BUGS.md`, fix it, and do not proceed to R1. A
red suite on an inherited repo is the first thing to resolve.

### R0.3 — Confirm the CLI is real

```bash
node dist/cli/index.js --help
node dist/cli/index.js scan --help
```

**Done when:** six command groups appear (`scan`, `diff`, `report`, `check-config`,
`manual`, `baseline`) and no command prints a `NotImplemented` stub.

### R0.4 — Establish the coverage ground truth

```bash
npm run docs:coverage
git diff
```

This regenerates the coverage tables in `docs/03-EVIDENCE.md` from `src/wcag/coverage.ts`.

**Read the output.** Whatever it prints is the truth for this project. Every count in every
document must match it. Note it down for R1.

**If the generator errors or writes nothing:** that is a higher-priority bug than anything
in R1. Open it in `BUGS.md` and fix the generator first — a hand-maintained coverage table
is the root cause of B1 and cannot be the fix for it.

### R0.5 — Locate the verification queue

```bash
head -1 audit/2026-08-20/verification-queue.tsv | tr '\t' '\n' | nl
wc -l audit/2026-08-20/verification-queue.tsv
```

**Done when:** you can state the column list and the row count. Expect 26 data rows and a
`verdict` column that is empty throughout. If the file is missing, see R3.0.

**Brain update:** rewrite `STATE.md` with what R0 actually found. If reality disagrees with
`STATE.md` as shipped, reality wins and `STATE.md` gets corrected.

---

# R1 — Fix the README drift bugs

**Who:** agent · **Needs:** R0.4 complete

Five defects, all the same species: a correction was made in one place and never propagated.
Full detail and evidence in `BUGS.md` B1–B5.

### R1.1 — B1: coverage counts (**the important one**)

The public README's coverage table shows the pre-correction hand count. The code says
otherwise. The block is wrapped in `<!-- GENERATED:coverage -->` markers, so it currently
*asserts* it was generated when it was not — which makes a reader trust it more, not less.

1. Run `npm run docs:coverage`.
2. If it does not update `README.md`, extend it so it does. The README block already has
   the markers; the generator just isn't targeting them.
3. Regenerate. Confirm the README table matches R0.4's output exactly.

**Do not hand-type the numbers, even if you are confident you know them.** They have been
wrong twice in this project's history and both errors survived review.

**Done when:** `README.md` coverage table is byte-identical to generator output, and
re-running the generator produces no diff.

### R1.2 — B1b: the sentence below the table

Directly under the coverage table is a hand-typed sentence restating the same counts in
prose ("evidence for N of the 55…"). It sits *outside* the generated markers, so it drifted
independently. This is a direct violation of invariant 5.

Move it inside markers so it cannot drift again:

```markdown
<!-- GENERATED:coverage-sentence -->
This tool produces evidence for {anySignal} of the 55 A/AA criteria and can certify none of
them. {probeCount} of those {anySignal} come from interaction probes a static DOM scanner
cannot perform. The remaining {manualCount} require a human — `a11y-ratchet manual` will
generate you a checklist.
<!-- /GENERATED:coverage-sentence -->
```

Add `coverage-sentence` as a second target in `npm run docs:coverage`.

**Done when:** no coverage number anywhere in `README.md` sits outside generated markers.
Check with `grep -n "of the 55\|% of A/AA" README.md`.

### R1.3 — B2: the status banner contradicts the file it's on

The banner says the build is at Day 12 and that `a11y-ratchet manual` "is the one remaining
stub" — but the Manual mode section further down the same README prints real generated
output from that command. D90 records fixing this banner; half the edit landed.

Replace with:

```markdown
> **Status: pre-release, Day 14 of a 15-day build.** Feature-frozen since Day 13. Scan,
> diff, baseline lifecycle, the HTML/JSON/terminal reports, `manual`, and the GitHub Action
> are functional and tested; no stubs remain in `src/`. The section marked `TODO(Day 14–15)`
> contains no data yet and must not be filled in with estimates. See
> [`docs/00-BRIEF-AND-PLAN.md`](docs/00-BRIEF-AND-PLAN.md) for the plan.
```

**Verify before pasting:** `grep -rn "NotImplemented" src/` must return nothing. If it
returns something, the banner is right and this step is wrong.

### R1.4 — B3: the config example uses the one format that doesn't load

The headline copy-pasteable config example is `a11y-ratchet.config.ts`. Per D58, `.ts` is
discovered and attempted but **no transpiler is bundled** — it happens to work on Node 24
via type-stripping and fails elsewhere in the supported range. This is the same shape as the
bare-`ratchet` bug: the most-copied example is the one that breaks.

Replace with `.js` plus JSDoc typing:

```javascript
// a11y-ratchet.config.js
/** @type {import('a11y-ratchet').Config} */
export default {
  mode: 'ci',
  suppressions: [{
    id: 'stripe-iframe-contrast',
    rule: 'color-contrast',
    urlPattern: '/checkout*',
    // false-positive | accepted-risk | third-party | deferred
    category: 'third-party',
    reason: 'Inside Stripe Elements iframe; not ours to fix. Raised as Stripe #12345.',
    owner: '@you',
    expires: '2026-12-01',
  }],
};
```

Two sub-fixes in the same pass:
- The category comment lists three values; D56 kept **four**. `deferred` is missing.
- The GitHub Action YAML block has `# config: a11y-ratchet.config.ts` — same change.

**Done when:** `grep -n "config.ts" README.md` returns nothing.

### R1.5 — B4: "Interaction states are a v2 feature"

`docs/00-BRIEF-AND-PLAN.md §4` lists states behind interaction under **never in scope**. The
README promises them as v2, and the Roadmap section promises them again via user-supplied
scripts. Three documents, two positions.

The docs are right and "never, and here's why" is the stronger sentence. Replace that clause:

> Scanning them requires driving the application, which produces a non-deterministic page
> set — and a diff over a non-deterministic page set reports regressions that are only a
> different traversal.

Remove the matching promise from the Roadmap section.

### R1.6 — B5: bare `ratchet` survives in a design doc

Day 13's `npx` smoke test found `ratchet <command>` used in seven places in the README; only
`a11y-ratchet` is a registered bin. D90 records fixing the README. It was **not** fixed in
`docs/03-EVIDENCE.md:165`, and that line is the sentence §1.7 stages for pasting into the
README — so it is set up to ship the bug a second time.

```bash
grep -rn '`ratchet ' docs/ README.md *.md
```

Fix every hit. Then, to stop it recurring, consider a test asserting no doc contains a
backticked `ratchet ` not preceded by `a11y-`.

### R1.7 — Resolve the Quickstart TODO

`TODO(Day 13)` sits above the Quickstart block. D90 records the verification already
happening: `npm pack`, install the tarball into a fresh directory outside the repo, run all
three commands via `npx a11y-ratchet`. All three worked.

Re-run it now anyway — you are inheriting this repo and the packing config may have moved:

```bash
npm pack
mkdir -p /tmp/ratchet-smoke && cd /tmp/ratchet-smoke
npm install /path/to/a11y-ratchet-0.1.0.tgz
npx a11y-ratchet --help
```

Then delete the TODO line. **Do not delete it without re-running.**

**R1 brain update:** mark B1–B5 `fixed` in `BUGS.md` with the commit SHA. Update `STATE.md`
next-action to R2.

---

# R2 — Backfill Day 14 decisions

**Who:** agent · **Needs:** R0

`docs/DECISIONS.md` ends at D90 (Day 13). Day 14 — the real-site audit — is unrecorded. This
matters because `DECISIONS.md` is published and is part of the artifact's argument, and Day
14 is the day measurement killed three hypotheses in a row.

Append D91 onward, following the existing entry format exactly (read D86–D90 first for
house style). **Correction, found 2026-08-21:** this section originally said "source
material is §9 of the session export," but no `SESSION-EXPORT.md` exists anywhere in this
repo. D91-D95 (done, commit `80cfaa6`) were written instead directly from the raw run/diff
JSON left in that session's own scratchpad — primary data, not a secondhand summary. If
that JSON is gone by the time this is read again, the committed `audit/2026-08-20/` TSVs
and README, plus D91-D95 themselves, are what's left; treat anything not re-derivable from
those as `reported, not re-derived`. Cover, at minimum:

| Topic | Substance |
|---|---|
| The audit run | Three sites, `audit` mode, robots respected, concurrency 3, 250ms delay, pinned versions, start timestamp |
| gov.uk zero is real | Passes/inapplicable diagnostic proves axe ran — but 7 of 10 URLs are `/browse/*`, so it is evidence about ~3 templates, not 10 pages |
| OCW page-count artifact | 29 of 40 crawled URLs are `/search/` with distinct query strings; only 11 genuinely distinct pages. Query params preserved by design; faceted search breaks that assumption |
| **Three hypotheses killed** | CodeMirror highlighting (zero `cm-` matches across 430 members) · Carbon Ads rotation (only 44 of 130 carry carbon classes) · first-party fingerprint churn (sampled identity objects byte-identical across runs) |
| **The `bgOverlap` mechanism** | Third-party ad iframe transiently overlaps the nav bar; axe's `color-contrast` cannot resolve a background under an overlapping element, returns `contrastRatio: 0` with no fg/bg colour and 6 `needs-review` findings; resolves once layout settles |
| Consequence 1 | The two-mode split is now empirically justified with a traced mechanism, not just a design rationale |
| Consequence 2 | **The settle contract has a layout-stability gap** — 150ms mutation quiet does not catch an iframe landing after the quiet window and reflowing |
| Consequence 3 | `checks[].data` is discarded at normalise time, so `fgColor`/`bgColor`/`contrastRatio`/`messageKey` are lost — the difference between "contrast issue here" and "4.2:1, needs 4.5:1" |
| Sampling method | Group 2 drawn weighted-random-without-replacement over 69 eligible templates, `mulberry32(20260820)`; all 12 landed on vuejs.org |

**Write each entry as a decision with its evidence**, in the house style: what was believed,
what was measured, what changed. Where the export gives a figure, re-derive it from the
report JSON if that JSON is still on disk; if it isn't, cite the export and mark the figure
`reported, not re-derived`.

**Done when:** `DECISIONS.md` covers Day 14, and every hypothesis that was killed says
explicitly that it was killed and by what measurement.

---

# R3 — Verify findings in a browser

**Who:** HUMAN · **Needs:** R0.5

**This is the blocking step.** Full protocol in `VERIFY.md` — read that file, not this
section, before starting. The summary:

- **R3.0** — confirm the queue file exists and back it up
- **R3.1** — set up the browser to match the scan conditions (viewport, colour scheme)
- **R3.2** — Group 1: 13 structural templates (rows 1–13)
- **R3.3** — Group 2: 12 `color-contrast` templates (rows 14–25)
- **R3.4** — Group 3: row 26, the churn cluster (verdict established; confirm and record)
- **R3.5** — the Vue keyboard-trap **Esc-then-Tab** test (decides row 10)

`VERIFY.md` spells out every row: URL, selector, and the specific question that decides its
verdict. It also corrects the earlier "24 rows, 2 established" count — only row 26 is
actually established, so it is **25 rows**.

Start with row 1, `link-name` on `vuejs.org/about/team.html`. 268 instances, one clean
mechanism, and the strongest single result in the audit.

**Nobody but a human at a browser writes in the verdict column.** If an agent is running
this runbook and reaches R3, it stops and hands back.

---

# R4 — Compute precision

**Who:** agent · **Needs:** R3 complete

### R4.1 — Compute per rule, over templates, not overall

```
precision(rule) = true-positive / (true-positive + false-positive)
```

The unit is the **template**, not the instance — each queue row is one defect pattern. Report
instance counts alongside every figure: a false positive at 305 instances and one at 1
instance are not the same result, and a precision number that hides the difference is
misleading in the direction that flatters the tool.

`not-reproduced` rows are **excluded from the denominator** and reported separately. A
finding that can't be found on the live site today is evidence about site churn, not about
the tool.

`arguable` rows are reported as their own count, never silently folded into either bucket.

### R4.2 — State the sampling method inline, every time

A precision figure without its sampling method is noise. Every published number carries:

> Of N distinct templates hand-checked — all templates with ≥10 instances, plus a seeded
> random sample of 15 from the remainder (mulberry32, seed 20260820) — M were true
> positives.

### R4.3 — Do not compute recall

The fixture suite cannot measure recall (`03-EVIDENCE.md §2.5`); the planted-defect count is
determined by fixture design. The 30–40% industry figure is cited and attributed, never
re-derived from this data.

If a percentage appears in the README that is not (a) generated from `coverage.ts`,
(b) computed from recorded verdicts with its method stated, or (c) externally attributed
with a link — it does not ship.

**Done when:** a per-rule precision table exists, with denominators, exclusions, and method.

---

# R5 — Write README §6, "Real-world results"

**Who:** agent · **Needs:** R4

Replace the `TODO(Day 14–15)` block. Required by `03-EVIDENCE.md §3` item 6:

- Two sites, dated, with tool + axe-core versions, **run in `audit` mode — say so**
- Per site: pages crawled, distinct findings, true positives, false positives, arguable
- Prose naming each false positive and **explaining its mechanism**

Framing rule, from `00-BRIEF-AND-PLAN.md §11`: **"the tool flagged X"**, never "site Y
violates WCAG." No conformance evaluation was performed and saying otherwise is both
inaccurate and unwise.

Carry the caveats into the section rather than into a footnote:
- gov.uk's zero is evidence about ~3 templates, not 10 pages
- OCW's 40 pages contain 11 genuinely distinct URLs
- The `bgOverlap` findings are measurement artifacts with a traced mechanism — this is a
  *strength* to write up, not an embarrassment to bury

Then verify the "what this cannot catch" section above it is complete. It needs six
build-established limitations that measurement produced: escape-modifier blindness in
Tab-only traversal, faceted-search page inflation, closed shadow roots, the third-party
settle gap, the collision-group limitation, and precision-not-recall.

---

# R6 — Roadmap and remaining TODOs

**Who:** agent · **Needs:** R1

### R6.1 — Complete the Roadmap section

The current Roadmap is missing items that are known and named. Add:

- Settle contract layout-stability gap (the `bgOverlap` mechanism)
- `checks[].data` extraction — `fgColor` / `bgColor` / `contrastRatio` / `messageKey`
- Faceted-search URL templating
- Tab-only traversal cannot detect documented escape modifiers
- `a11y-ratchet doctor <url>` — auto-detect generated-id patterns by double-loading a page
  and diffing ids, more robust than a hand-maintained pattern list
- `--repeat N` instability detection
- Within-collision-group limitation: cannot identify which member of a tied family changed
- Network-timeout classification not empirically re-verified (D89)

Label honestly. Nothing here is promised for a date.

### R6.2 — Sweep every remaining placeholder

```bash
grep -rn "TODO(" README.md docs/ action.yml
```

Each one either gets real data or gets deleted. **A `TODO(Day N)` in a released README is
worse than the section not existing.**

The screenshot placeholder (`TODO(Day 11)`) needs two real images: the HTML report and the
CI job summary. `03-EVIDENCE.md §3` item 3 notes readers decide here.

---

# R7 — Release

**Who:** both

Walk `00-BRIEF-AND-PLAN.md §8` — Definition of Done — as a literal checklist. Every box gets
a command that was run, not a recollection:

- [ ] `npx a11y-ratchet scan https://example.com` works from a clean machine, one command
- [ ] Test suite runs fully offline (`npm test` with the network off — actually turn it off)
- [ ] Diff produces zero false regressions across the DOM-churn goldens
- [ ] Same page scanned 5× produces byte-identical fingerprints
- [ ] Coverage matrix covers all 55 A/AA criteria, no TBD rows, **counts generated from data**
- [ ] README documents real-site runs with false positives named and mechanisms explained
- [ ] The 30–40% statistic appears in the correct direction, attributed
- [ ] The Action fails a deliberately-broken PR and passes a clean one, both linked
- [ ] The HTML report passes its own scan with zero violations

Then: tag `v0.1.0`, publish, and record the release in `DECISIONS.md`.

**Last check before tagging** — re-read the README start to finish as a stranger. The three
bugs found in it so far were all internal contradictions that no test could catch, and each
was visible to anyone reading two sections in sequence.
