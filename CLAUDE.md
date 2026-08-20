# Project context

Building an accessibility regression tool: a TypeScript CLI + library that crawls a site
with Playwright, runs axe-core per page, runs keyboard-interaction probes axe cannot run,
maps findings to WCAG 2.2 success criteria, and diffs two runs so CI can fail a PR on new
violations.

This is a portfolio/credibility artifact, not a product. Its value is demonstrated domain
judgement — an honest coverage boundary, a diff that doesn't produce false regressions, and
probes that reach criteria a static DOM scanner cannot. Polish serves that; features don't.

## The design docs are authoritative

- `docs/00-BRIEF-AND-PLAN.md` — scope, cut list, 15-day plan, risk register
- `docs/01-ARCHITECTURE.md` — modules, data model, scan modes, probe spec, baseline lifecycle
- `docs/02-IDENTITY-AND-DIFF.md` — fingerprinting and the diff algorithm (the core)
- `docs/03-EVIDENCE.md` — WCAG coverage matrix, testing strategy, README skeleton

Read the relevant doc before implementing anything. These were written after two rounds of
review and several specifics are counterintuitive corrections to earlier mistakes — the
scroll-margin handling, the groupKey weakening, the digit-masking exception, the scan-mode
split. If something looks wrong or over-engineered, it may be. **Say so and ask. Do not
silently simplify.**

If you deviate from a doc, note it in `docs/DECISIONS.md` with the reason.

## Non-negotiable invariants

1. **The raw CSS selector is never part of finding identity.** Display only.
2. **Findings are never silently dropped.** Suppressed findings are tagged and retained in
   the report. Pages that error are recorded as errors, not as zero-violation pages.
3. **Probes never gate CI.** Default bucket is `needs-review`.
4. **No false regressions.** If identity is uncertain, classify as `unclassified` or
   `moved` — never `new`. A false "new violation" blocks a PR for no reason and is the one
   failure that kills the tool.
5. **Never hardcode a coverage count, recall figure, or percentage.** Generate from
   `src/wcag/coverage.ts`. An earlier draft hardcoded numbers that didn't match the table.
6. **The tool never claims conformance.** No "compliant", no "ensures accessibility", no
   green checks — in output, docs, or code comments.
7. **Tests never touch the network.** Local fixture server only.
8. **`src/cli/` contains no logic.** Parse args → call library → format.
9. **Don't patch axe-core source** (MPL-2.0). Use its config API.

## Working agreement

- Small commits, one concern each. Conventional commit messages.
- TypeScript strict. No `any` without a comment explaining why.
- Write the test with the code, not after the phase.
- When a task is ambiguous, ask one question rather than guessing across three files.
- Stop at the end of each planned day's scope and report. Do not run ahead into the next
  day's work — the plan is sequenced so the highest-risk component (identity) is designed
  against a settled type contract.
- If a day's "done when" condition isn't met, say so plainly and propose which cut from
  `00 §7` to take. Don't quietly carry the deficit forward.

## Stack

TypeScript (strict), Playwright, axe-core (pinned exactly), Commander, Zod, Vitest.
Node 20+. No framework, no bundler beyond `tsup`.