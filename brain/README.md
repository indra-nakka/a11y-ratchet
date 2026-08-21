# brain — persistent working memory for a11y-ratchet

A small set of files that survive between sessions so an agent (or a human returning cold)
can pick up in one read instead of reconstructing context from the whole repo.

Place at repo root. Commit it. It is part of the project, not scratch.

---

## Read order, and what it costs

| Order | File | When | Rough size |
|---|---|---|---|
| 1 | `STATE.md` | **every session, always** | keep under 100 lines |
| 2 | `RUNBOOK.md` | when picking up work | read only the current phase |
| 3 | `TASKS.md` | when choosing what to do next | grep by status |
| 4 | `BUGS.md` | when touching a file that has open bugs | grep by file |
| 5 | `VERIFY.md` | only during human verification | read once, then work from it |

**Do not read the whole `brain/` directory at session start.** `STATE.md` alone should tell
you where you are and what the next action is. If it doesn't, `STATE.md` is out of date and
fixing that is the next action.

`docs/DECISIONS.md` is the permanent, published record. `brain/` is the working layer.
Decisions graduate from `brain/` to `DECISIONS.md`; they never move back.

---

## The three rules

### Rule 1 — the brain stores state, never derived facts

This project has already shipped one bug of exactly this kind: coverage counts were
hand-copied into the README, the underlying data changed, and the copy silently went stale
on a public page (see `BUGS.md` B1).

So: **no coverage counts, no test counts, no percentages, no finding totals in `brain/`.**
Store a pointer to the command that computes them.

```
WRONG   Coverage is 23 of 55 (42%).
RIGHT   Coverage counts: run `npm run docs:coverage`. Sole source is src/wcag/coverage.ts.
```

The only numbers allowed in `brain/` are counts of `brain/`'s own contents — open tasks,
open bugs, rows remaining in the verification queue — because those are not derived from
anywhere else.

### Rule 2 — append, don't rewrite

`TASKS.md`, `BUGS.md`, and the decision log are append-only. Change a status field; never
delete an entry. A task that turned out to be wrong becomes `dropped` with a reason. The
history of what was believed and later disproved is the most valuable thing here — three
hypotheses about the diff instability were killed by measurement, and knowing which three
is what stops someone re-proposing them.

`STATE.md` is the exception: it is a snapshot and gets rewritten every session.

### Rule 3 — every claim carries its evidence

A status of `done` needs a commit SHA, a command that was run, or a file path. A bug marked
`fixed` needs the same. A verification verdict needs a screenshot path.

"I believe X" and "I measured X" are different states and must look different on the page.
Use `assumed` / `measured` / `verified` explicitly.

---

## The verdict boundary — absolute

Neither an agent nor a human-without-a-browser fills in a verification verdict.

A `color-contrast` verdict requires rendered pixels. A `link-name` verdict requires an open
accessibility tree. Anything else is inference from a selector string, which is the exact
failure mode this project exists to argue against.

An agent may: prepare the queue, write the protocol, compute arithmetic over verdicts a
human has already recorded, and draft prose from them. An agent may not: guess a verdict,
suggest a "likely" verdict, or pre-fill a verdict column with anything.

---

## Session protocol

**Start**
1. Read `STATE.md`.
2. Confirm the repo matches it — `git log --oneline -3`, `git status`.
3. If they disagree, reconcile `STATE.md` first. Do not start work on a stale picture.

**End**
1. Update `STATE.md`: next action, blockers, what changed.
2. Append any new task to `TASKS.md`, any new bug to `BUGS.md`.
3. Anything that was a real judgement call goes to `docs/DECISIONS.md` as a new D-number,
   not into `brain/`.
4. Commit `brain/` with the work, not separately.

---

## File map

```
brain/
  README.md    this file — how the system works
  STATE.md     hot snapshot; read every session
  RUNBOOK.md   numbered steps R0–R7 to finish the build
  TASKS.md     task register, T-numbered, append-only
  BUGS.md      defect register, B-numbered, append-only
  VERIFY.md    human + browser verification protocol
```
