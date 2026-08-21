# HANDOFF — paste this into a fresh CLI session

Copy everything between the fences.

---

```
You are picking up a11y-ratchet cold, at Day 14 of a 15-day build. Feature freeze has been
in force since Day 13 — no new features, no scope additions.

FIRST: read brain/STATE.md. It is short and ends with a single next action. Then read the
phase of brain/RUNBOOK.md that STATE.md points you at. Do not read the whole brain/
directory; it is designed so you don't have to.

brain/README.md explains the system. The short version:
- STATE.md is a snapshot, rewritten each session.
- TASKS.md and BUGS.md are append-only — change a status, never delete a row.
- The brain stores state, never derived facts. No coverage counts, no test counts, no
  percentages live in brain/ — only pointers to the command that computes them. This is a
  direct response to bug B1, where a hand-copied number went stale on a public page.
- docs/DECISIONS.md is the permanent published record. Real judgement calls graduate there
  as new D-numbers; brain/ is the working layer.

START WITH R0. Do not skip it. You are inheriting this repo and every document describing
it — including brain/ — may have drifted from the code. R0 is four commands that establish
what is actually true. If R0 contradicts STATE.md, reality wins and you correct STATE.md
before doing anything else.

THEN R1: five defects in the public README and docs, all the same species — a correction
made in one place and never propagated to another. B1 is the important one: the README's
coverage table shows the pre-correction hand count, overstating the project's own coverage
by three criteria and five percentage points, on the front page of a project whose entire
argument is honesty about coverage limits. Fix it by making the generator target the README,
not by typing the numbers in. They have been wrong twice already and both errors survived
review.

HARD CONSTRAINTS, non-negotiable:

1. Never hardcode a coverage count, recall figure, or percentage anywhere. Generate from
   src/wcag/coverage.ts via `npm run docs:coverage`. If a number needs to appear in prose,
   it goes inside GENERATED markers.
2. The verdict boundary is absolute. brain/VERIFY.md contains 26 rows awaiting human
   verification in a browser. You do not fill in a verdict, suggest a likely verdict, or
   pre-populate the column. A color-contrast verdict needs rendered pixels; a link-name
   verdict needs a live accessibility tree. When you reach R3, stop and hand back.
   Everything after R3 that doesn't depend on verdicts (R6, most of R7) you can do.
3. Report findings, not assumptions. Four hypotheses about this codebase have already been
   killed by measurement; three came from an assistant reasoning confidently from text.
   When you state something, say whether it is assumed, measured, or verified.
4. The nine standing rules in brain/STATE.md are invariants. Rule 5 has already been
   violated in production — that is B1.
5. Feature freeze. If something needs building, it goes to the roadmap, not into v1.
6. If a doc contradicts another doc or the code, flag it rather than silently picking one.
   Every bug found so far in this repo is exactly that shape.

TONE FOR ANYTHING PUBLIC-FACING: no "fully WCAG compliant", no "ensures accessibility", no
green checkmarks. Prefer detected over found, evidence over proof, flagged over violated.
Every number carries its method. Never write a percentage you have not computed or
attributed. If a sentence would make a working auditor wince, cut it.

END OF SESSION: update brain/STATE.md with the next action and any new blockers, append new
tasks to brain/TASKS.md and new defects to brain/BUGS.md with evidence (a commit SHA, a
command you ran, or a file path — "I think I did this" is not done), and commit brain/
alongside the work rather than separately.

Start now with R0.1.
```

---

## Shorter version, for a quick session

```
Picking up a11y-ratchet. Read brain/STATE.md, then the RUNBOOK phase it points to.

Rules: never hardcode a coverage number (generate from coverage.ts); never fill in a
verification verdict (that needs a human with a browser); feature freeze is in force; flag
doc contradictions instead of silently resolving them; say whether a claim is assumed,
measured, or verified.

Run R0 first — verify the repo actually matches what the docs say before changing anything.
```
