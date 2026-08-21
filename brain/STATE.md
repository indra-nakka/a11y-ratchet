# STATE

**Updated:** 2026-08-21 · **Update this every session.**

---

## Next action

> **R2 in `RUNBOOK.md`** — backfill Day 14 decisions into `docs/DECISIONS.md` (D91+).
> No browser needed. No verdicts needed.

**R0 ran this session, confirmed:** last commit `ba9f1ca` at session start, tree clean (only
`brain/` itself untracked — expected, not yet committed). Typecheck/tests/build all exit 0
(39 test files pass). CLI has all 6 command groups, no stub commands. `npm run docs:coverage`
printed to stdout only — confirmed by reading `scripts/coverage-report.mjs`: no
`writeFileSync` call existed in it at all. It did not touch `README.md` or
`docs/03-EVIDENCE.md` (`git diff` after running was empty). That was the exact B1 root
cause, not a symptom of a half-implemented generator — the generator was never wired to a
file.

**R1 done this session, commit `8178dc0`.** Extended `scripts/coverage-report.mjs` to write
both `README.md` and `docs/03-EVIDENCE.md` in place between their `GENERATED` markers,
confirmed idempotent (second run, byte-identical output) and confirmed the regenerated
README table matches `npm run docs:coverage`'s stdout output exactly. B1–B5 all fixed; see
`BUGS.md`. Quickstart TODO re-verified live: `npm pack`, fresh install in a temp dir outside
the repo, all three Quickstart commands run via `npx a11y-ratchet` against a live site,
TODO line removed.

**One nuance R1.3's literal check missed** (now corrected in `BUGS.md` B2): `grep -rn
"NotImplemented" src/` returns 2 hits, not 0 — both are `never`-typed exhaustiveness guards
in `src/index.ts` (`renderReport`/`renderDiff`), not unimplemented commands. Confirmed by
reading the surrounding code: all format branches are implemented; the throw is unreachable
dead code satisfying TS's exhaustiveness check. The banner fix itself was still correct.

---

## Where the project is

`a11y-ratchet` — TypeScript CLI + library. Crawls with Playwright, runs axe-core plus
keyboard-interaction probes, maps findings to WCAG 2.2, diffs two runs so CI can fail a PR
on new violations.

It is a portfolio / credibility artifact, not a market play. The value is demonstrated
judgement: a published coverage boundary, probes that reach criteria axe structurally
cannot, and a diff that does not report false regressions.

| | |
|---|---|
| Day | 14 of 15 |
| Feature freeze | Day 13 — **in force**, no new features |
| Repo | `github.com/indra-nakka/a11y-ratchet`, public |
| Version | 0.1.0 |
| Pins | axe-core 4.13.0 exact · Playwright 1.62.1 exact · TS 5.9.3 · Chromium 151.0.7922.34 |
| Demo PRs | #1 fails the gate, #2 passes — both live |

Verify all of the above against the repo before trusting it (`RUNBOOK.md` R0).

---

## Blocked on a human with a browser

**25 rows** in `audit/2026-08-20/verification-queue.tsv` need verdicts. Nothing downstream
of them can proceed: README §6 "Real-world results", the precision figures, and the release
tag all wait on this.

Protocol with all 26 rows spelled out is in `brain/VERIFY.md`. Start with row 1,
`link-name` on `vuejs.org/about/team.html` — 268 instances, the strongest single result.

Also blocked on a browser: the Vue keyboard-trap issue cannot be filed until the
**Esc-then-Tab** sequence is tested (`RUNBOOK.md` R3.5).

---

## Registers

| | Count | Where |
|---|---|---|
| Open bugs | 5 | `BUGS.md` |
| Open tasks | see file | `TASKS.md` |
| Verification rows outstanding | 25 of 26 | `audit/2026-08-20/verification-queue.tsv` |

Only **row 26** (the churn cluster) has an established verdict. The session record claimed a
second — "the 6 nav-bar `bgOverlap` findings" — but the only `bgOverlap` row in the queue is
row 18, which is `.link-text` on `/examples/`, 305 instances. Same axe messageKey, different
element, different page. Row 18 needs verification. See the correction at the top of
`brain/VERIFY.md`.

---

## Invariants — never break these

From `CLAUDE.md`, unchanged:

1. The raw CSS selector is never part of finding identity.
2. Findings are never silently dropped. Suppressed findings are tagged and retained. Pages
   that error are recorded as errors, not as zero-violation pages.
3. Probes never gate CI. Default bucket `needs-review`.
4. No false regressions. If identity is uncertain: `unclassified` or `moved`, never `new`.
5. **Never hardcode a coverage count, recall figure, or percentage.** Generate from
   `src/wcag/coverage.ts`.
6. The tool never claims conformance.
7. Tests never touch the network.
8. `src/cli/` contains no logic.
9. Do not patch axe-core source (MPL-2.0).

Plus: report findings, not assumptions · flag doc contradictions rather than silently
complying · if a done-when isn't met, name which cut to take rather than pushing everything
right.

**Rule 5 has already been violated in production.** See `BUGS.md` B1.

---

## The verdict boundary

Neither an agent nor a human without a browser fills in a verification verdict. A
`color-contrast` verdict needs rendered pixels; a `link-name` verdict needs an open
accessibility tree.

Four hypotheses about this codebase have already been killed by measurement. Three of them
came from an assistant reasoning confidently from text. Report findings, not assumptions.

---

## Known-stale artifacts

- `docs/DECISIONS.md` ends at **D90 (Day 13)**. Day 14 is unrecorded — see `RUNBOOK.md` R2.
- The session reconstruction (`SESSION-EXPORT.md`) is organised for resumption, not a
  byte-exact transcript. Treat its figures as leads to verify, not as source of truth.
- Doc edits made in an assistant workspace have failed to reach the repo before. Assume
  nothing synced; check the file.
