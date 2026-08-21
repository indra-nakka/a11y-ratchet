# STATE

**Updated:** 2026-08-21 · **Update this every session.**

---

## Next action

> **External review remediation, task 6** — identity duplication assessment
> (`src/scan/probes/focusPath.ts` re-implements a subset of `src/scan/axe.ts`'s candidate
> extraction, `docs/DECISIONS.md` D62). **Write an assessment only, no code**: can the two
> be reconciled behind a single string-serialised helper injected once per page, what does
> it cost, what's the blast radius on the golden-pairs suite. If "yes and it's contained,"
> propose it as a post-1.0 Roadmap item rather than doing it under freeze. Tasks 1-5 done.
>
> **Task 5 done, commits `bbee8c9`/`60ab947`.** `probe/keyboard-trap` now tries Escape,
> then Shift+Tab, before reporting a cycle as a trap — D67's cycle predicate itself is
> unchanged, this only gates what happens between detection and reporting. Needed two
> attempts at "did it actually escape": comparing against a single stashed element failed
> against the EXISTING escape-less fixture once the new escapable one was added alongside
> it (its own handler intercepts Shift+Tab too, bouncing between its two fields — caught by
> running the suite, not by re-reading the logic). Fixed by comparing against
> `state.visited` instead. `docs/DECISIONS.md` D97. Full suite 361/361.
>
> R3 (human verification in a browser) is still the separate, still-open blocker
> underneath all of this — unaffected by the review remediation work. See below.

## External review remediation (2026-08-21, task list from a cloned-repo review)

- **Task 1 — Quickstart fix, done, commit `359e34b`.** `registry.npmjs.org/a11y-ratchet`
  genuinely 404s (not yet published, deliberately — publishing isn't this agent's call).
  The README's literal `npx a11y-ratchet scan ...` therefore fails for every real reader.
  The R1.7 Quickstart "verification" (`npm pack` + `npm install <tarball>` + `npx`) didn't
  catch this: `npx` resolves a locally-installed package before hitting the registry, so
  it verified a working local install, not the README's actual instructions. Replaced the
  Quickstart with a clone → `npm install` → `npm run build` → `npm link` path, executed
  end to end against a fresh clone of the pushed repo (not the working copy) before
  writing it. `brain/TASKS.md` T9 marked `superseded`, not silently corrected in place —
  the original claim is wrong and stays visible as wrong, not rewritten as if it were
  always right.
- **Task 2 — CI on the tool itself, done, commit `c7c34cc`.** Added
  `.github/workflows/ci.yml`: `npm ci` → cached Chromium install → `npm run check`
  (typecheck+lint+test) → `npm run build`, on push to `main` and every PR. Reused
  `action.yml`'s hand-hashed `sha256sum package-lock.json` cache-key approach verbatim,
  same key names, so the two workflows' caches are interchangeable. **Pushed and watched
  the real run** (`gh run watch 32448977537`) rather than trusting the YAML alone: green
  in 1m51s on a cold cache, and the log confirms it was a real run, not a skip — `Test
  Files 39 passed (39)`, `Tests 360 passed (360)`, on GitHub's own runner, browser tests
  included (the exact thing the reviewer's sandbox couldn't do). One pre-existing,
  unrelated annotation carried over from `a11y-demo.yml`'s own runs: a Node.js 20
  deprecation notice about the Actions runtime itself (not this project's `node-version:
  '20'` input) — not a failure, not introduced by this change, left alone.
- **Task 3 — `NotImplementedError` messages, done, commit `181dd10`.** The class's second
  constructor argument changed from `plannedDay` to `guidance` (same error type, same
  exit code 3 — the reviewer's explicit constraint). `renderReport()`'s unreachable-format
  branch now names the three real formats; `renderDiff()`'s `format: 'json'` case — the
  one a real caller can actually hit, since `'json'` is a valid `ReportFormat` value this
  function deliberately doesn't implement, per its own doc comment — now points at
  `JSON.stringify(result, null, 2)`, matching what `diff --format json` already does on
  the CLI. Verified both throw paths directly against the built `dist/index.js`, not just
  by reading the diff.
- **Task 4 — churn-resistance demo, done, did not come out clean.** `demo/churn-resistance`
  (pushed, no PR). Introduced 3 real defects (2× `image-alt`, 1× `color-contrast`) on the
  demo site, then wholesale-refactored it (hash classes, wrapper divs, DOM-reordered
  sibling cards with visual order preserved — verified via `getBoundingClientRect`, not
  assumed) while keeping the same defects. **Not** diffed against the committed
  `.a11y/baseline.json`, which has zero findings — that would have been vacuous; used the
  branch's own pre/post pair instead, and said so plainly rather than silently picking a
  reading of an ambiguous instruction. Real result: gate FAILED, 1 new + 1 fixed + 1 moved
  for defects that never changed. Traced the exact mechanism through the identity data
  (two compounding causes — see `BUGS.md` B8) rather than reporting just the summary line.
  Reported raw, no fix applied — the decision was the human's per their own instruction.
  **User said "fix now"; fixed, commits `7124b9f`/`9fddefb`.** Two changes:
  `buildSemanticPath` skips roleless wrapper ancestors instead of using their tag name
  (cause 1, direct fix); Pass 2 gained a `groupKey`-equality alternate acceptance path
  (cause 2 — this is D48/D49's Day-6-deferred gap, implemented now with the golden suite
  to check it against; used `groupKey` specifically, not raw `identity.value`, after
  confirming raw value-equality would have wrongly turned golden case 18b into a `moved`
  match). Golden case 21 added and confirmed via `git stash` to fail without the fix and
  pass with it — a real regression guard, not a coincidence. Full suite 361/361. Re-ran
  the actual demo against the fixed code (not just trusted the golden suite): gate now
  PASSES, 0 new, 0 fixed. One new finding deliberately deferred, not bundled in: `BUGS.md`
  B9 (`scoreCandidate` credits two empty accessible names as a match — real, but fixing it
  removes scoring headroom other cases currently lean on; needs its own rebalancing pass
  with the same rigor, not a rushed patch).
- **Task 5 — trap-probe conservatism, done, commits `bbee8c9`/`60ab947`.** Both trap-
  candidate branches in `runFocusPathProbe` now call `tryEscape(page)` first: presses
  Escape, then Shift+Tab if that alone didn't move focus, checks after each whether focus
  landed on genuinely new ground before giving up and reporting a trap. D67's cycle
  predicate itself untouched; invariant 3 untouched (still `needs-review`/`critical`, never
  gating) — this only decides whether a cycle a keyboard user CAN escape gets reported at
  all. First "did it escape" design (compare against one stashed stuck-element reference)
  failed its own existing fixture once the new escapable one was added alongside it — the
  escape-less modal's handler intercepts Shift+Tab too, bouncing between its two fields,
  wrongly read as escaped. Fixed by comparing against `state.visited` instead (same signal
  `probeStepInPage` already uses). Extended the existing fixture with `#modal-escapable`
  rather than adding a new file; tightened the existing test's assertion, which would have
  passed even with the escape check silently broken. Confirmed via `git stash` that the
  tightened assertion fails without the fix. Full suite 361/361. `docs/DECISIONS.md` D97.

## Prior session (2026-08-21): R0, R1, R2, R6 done

- **R0** — repo verified against every claim in this file before trusting it: last commit
  at start `ba9f1ca`, tree clean, typecheck/test/build all exit 0, CLI has all 6 command
  groups with no stubs, `docs:coverage` was print-only (the literal cause of B1).
- **R1**, commit `8178dc0` — `scripts/coverage-report.mjs` now writes `README.md` and
  `docs/03-EVIDENCE.md` in place between `GENERATED` markers (confirmed idempotent); B1-B5
  fixed. Quickstart smoke test **was wrong, corrected 2026-08-21** — see next entry.
- **R2**, commit `80cfaa6` — `docs/DECISIONS.md` D91-D95 backfilled for Day 14, every
  figure re-derived from the raw run/diff JSON still on disk this session, not from
  memory. Caught and corrected one own claim that didn't hold up under re-check (a settle
  race said to "resolve after ~2s" — the file said ~370ms; re-measured live instead of
  shipped as remembered). `RUNBOOK.md` R2 pointed at a `SESSION-EXPORT.md` that doesn't
  exist in this repo — corrected in place.
- **R6**, commit `adc3fb8` — Roadmap section completed (8 items added), every `TODO(` in
  README/docs/action.yml swept. The HTML-report screenshot is real
  (`docs/img/html-report.png`, from the ocw.mit.edu Day 14 data). The CI-job-summary
  screenshot surfaced a real, unresolved finding instead of getting faked — see B6 below.

---

## Where the project is

`a11y-ratchet` — TypeScript CLI + library. Crawls with Playwright, runs axe-core plus
keyboard-interaction probes, maps findings to WCAG 2.2, diffs two runs so CI can fail a PR
on new violations. Portfolio / credibility artifact: the value is demonstrated judgement,
not a market play.

| | |
|---|---|
| Day | 14 of 15 |
| Feature freeze | Day 13 — **in force**, no new features |
| Repo | `github.com/indra-nakka/a11y-ratchet`, public |
| Version | 0.1.0 |
| Pins | axe-core 4.13.0 exact · Playwright 1.62.1 exact · TS 5.9.3 · Chromium 151.0.7922.34 |
| Demo PRs | #1 fails the gate, #2 passes — both live, but see B6 on logged-out visibility |
| Last commit | `adc3fb8` |

Verify all of the above against the repo before trusting it (`RUNBOOK.md` R0) — this row
included.

---

## Registers

| | Count | Where |
|---|---|---|
| Open bugs | 1 (B6) — B1-B5 fixed this session | `BUGS.md` |
| Open tasks | see file, `Now`/`Blocking` sections | `TASKS.md` |
| Verification rows outstanding | 25 of 26 | `audit/2026-08-20/verification-queue.tsv` |

Only **row 26** (the churn cluster) has an established verdict. A discarded pending
suggestion in an earlier session's queue-construction pass claimed a second — "the 6
nav-bar `bgOverlap` findings" — but the only `bgOverlap` row actually **in the queue** is
row 18 (`.link-text` on `/examples/`, 305 instances, a different element and page from the
live `/partners/` mechanism D94 documents). Row 18 still needs verification like every
other unestablished row.

---

## Invariants — never break these

From `CLAUDE.md`, unchanged:

1. The raw CSS selector is never part of finding identity.
2. Findings are never silently dropped. Suppressed findings are tagged and retained. Pages
   that error are recorded as errors, not as zero-violation pages.
3. Probes never gate CI. Default bucket `needs-review`.
4. No false regressions. If identity is uncertain: `unclassified` or `moved`, never `new`.
5. **Never hardcode a coverage count, recall figure, or percentage.** Generate from
   `src/wcag/coverage.ts`. (Was violated in production — B1, fixed this session.)
6. The tool never claims conformance.
7. Tests never touch the network.
8. `src/cli/` contains no logic.
9. Do not patch axe-core source (MPL-2.0).

Plus: report findings, not assumptions · flag doc contradictions rather than silently
complying · if a done-when isn't met, name which cut to take rather than pushing everything
right.

---

## The verdict boundary

Neither an agent nor a human without a browser fills in a verification verdict. A
`color-contrast` verdict needs rendered pixels; a `link-name` verdict needs an open
accessibility tree.

Four hypotheses about this codebase were killed by measurement before this session; three
more (D93, this session) came from an assistant reasoning from a stated hypothesis rather
than checking it directly. Report findings, not assumptions — including about your own
prior session's claims; see the settle-race correction above.

---

## Known-stale artifacts

- Doc edits made in an assistant workspace have failed to reach the repo before. Assume
  nothing synced; check the file.
