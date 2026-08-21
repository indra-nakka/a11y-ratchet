# STATE

**Updated:** 2026-08-21 · **Update this every session.**

---

## Next action

> **External review remediation, task 3** — `NotImplementedError` at `src/index.ts:168`/
> `:192` throws `'Day 11'`/`'Day 12'` as context; replace with something actionable for a
> library consumer, same error type, same exit-code mapping. Tasks 1-2 done. Stopping and
> reporting after each numbered task per the reviewer's explicit instruction, not running
> ahead.
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
