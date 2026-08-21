# TASKS

Append-only. Change the status field; never delete a row.

**Status:** `todo` · `doing` · `blocked` · `done` · `dropped`
**Who:** `agent` (no browser needed) · `human` (browser required) · `both`

`done` requires evidence — a commit SHA, a command that was run, or a file path. Put it in
the Evidence column. "I think I did this" is not `done`.

---

## Now

| ID | Task | Who | Step | Status | Evidence |
|---|---|---|---|---|---|
| T1 | Clone, build, test, confirm the repo matches `STATE.md` | agent | R0 | done | `git log -1` → `ba9f1ca` at start; `npm ci`, `npm run typecheck`, `npm test`, `npm run build` all exit 0 |
| T2 | Run `docs:coverage`, establish the coverage ground truth | agent | R0.4 | done | ran `npm run docs:coverage`; confirmed `git diff` was empty before R1 (generator wrote to stdout only) |
| T3 | **Fix B1 — README coverage table drift** | agent | R1.1 | done | commit `8178dc0` |
| T4 | Fix B1b — move the coverage sentence inside markers | agent | R1.2 | done | commit `8178dc0` |
| T5 | Fix B2 — status banner | agent | R1.3 | done | commit `8178dc0` |
| T6 | Fix B3 — config example `.ts` → `.js`, add `deferred` | agent | R1.4 | done | commit `8178dc0` |
| T7 | Fix B4 — remove the v2 interaction-states promise | agent | R1.5 | done | commit `8178dc0` |
| T8 | Fix B5 — bare `ratchet` in `03-EVIDENCE.md:165` | agent | R1.6 | done | commit `8178dc0` |
| T9 | Re-run the `npx` clean-machine smoke, clear the Quickstart TODO | agent | R1.7 | superseded | commit `8178dc0` verified `npm install <tarball>` then `npx a11y-ratchet` — but `npx` resolves the locally-installed package first, so it never actually hit the registry. `registry.npmjs.org/a11y-ratchet` is a real 404; the README's literal `npx a11y-ratchet` fails for every reader who hasn't installed something first. Found by external review, fixed in T37. |
| T37 | Fix the Quickstart: registry.npmjs.org/a11y-ratchet 404s, `npx a11y-ratchet` fails for a real reader | agent | external review #1 | done | commit `359e34b` — clone+`npm link` path, executed end to end against a fresh clone of the pushed repo |
| T38 | Add CI for the tool itself (typecheck/lint/test/build on push+PR), reuse action.yml's cache-key approach, badge | agent | external review #2 | done | commit `c7c34cc` — pushed, watched the real run go green: `gh run watch 32448977537`, 1m51s, `Test Files 39 passed (39)`, `Tests 360 passed (360)` on GitHub's runner, browser tests included |
| T39 | `NotImplementedError` messages leak build-day vocabulary (`Day 11`/`Day 12`) — replace with actionable guidance, same error type/exit code | agent | external review #3 | done | commit `181dd10` — verified both throw paths directly against `dist/index.js` |
| T40 | Build the churn-resistance demo (wholesale demo-site refactor, same defects), report the diff raw before opening anything | agent | external review #4 | done, awaiting your read | branch `demo/churn-resistance` (pushed, no PR) — did NOT come out clean, see `BUGS.md` B8 |
| T41 | Decide what to do with B8 (Tier 4 wrapper-div gap): fix now, roadmap it, or something else | human | — | done | you said "fix now" |
| T42 | Fix B8 for real: buildSemanticPath wrapper-div transparency + groupKey Pass-2 acceptance path | agent | external review #4 fix | done | commits `7124b9f`/`9fddefb`, `docs/DECISIONS.md` D96 - golden case 21 added, full suite 361/361, re-ran the actual demo against the fix (gate now passes) |
| T43 | Rebalance `scoreCandidate`'s weight table to fix the empty-accessible-name credit bug (B9) without regressing nameless-element matching | agent | post-B8 | todo | `BUGS.md` B9 - needs the same full-golden-suite rigor as D96, not a quick patch |
| T10 | Backfill D91+ — Day 14 decisions | agent | R2 | done | commit `80cfaa6` — D91-D95, every figure re-derived from the raw run/diff JSON on disk this session |

## Blocking — human with a browser

| ID | Task | Who | Step | Status | Evidence |
|---|---|---|---|---|---|
| T11 | Back up the queue, add verdict columns | human | R3.0 | todo | |
| T12 | Verify Group 1 — 13 structural templates (rows 1–13) | human | R3.2 | todo | |
| T13 | Verify Group 2 — 12 `color-contrast` templates (rows 14–25) | human | R3.3 | todo | |
| T14 | Record Group 3 — row 26 churn cluster (verdict established) | human | R3.4 | todo | |
| T15 | **Test Esc-then-Tab on the Vue CodeMirror editor** | human | R3.5 | todo | |

## Downstream of verification

| ID | Task | Who | Step | Status | Evidence |
|---|---|---|---|---|---|
| T16 | Compute per-rule precision, method stated inline | agent | R4 | blocked on T12–T14 | |
| T17 | Write README §6 "Real-world results" | agent | R5 | blocked on T16 | |
| T18 | Complete the "what this cannot catch" section | agent | R5 | todo | |
| T19 | File or drop the Vue keyboard-trap issue | human | R3.5 | blocked on T15 | |
| T20 | Document the escape-modifier limitation in `01 §6.4` | agent | R3.5 | blocked on T15 | |

## Release

| ID | Task | Who | Step | Status | Evidence |
|---|---|---|---|---|---|
| T21 | Complete the Roadmap section — 8 named items | agent | R6.1 | todo | |
| T22 | Sweep every remaining `TODO(` placeholder | agent | R6.2 | todo | |
| T23 | Capture the two screenshots — report + job summary | agent/human | R6.2 | doing | HTML-report screenshot done, `docs/img/html-report.png`, real ocw.mit.edu Day 14 data. Job-summary screenshot blocked — see B6 (T36) |
| T36 | Confirm whether GitHub gates job summaries behind sign-in generally, or just this repo; fix if it's a setting; screenshot signed-in either way | human | R6.2 | todo | `BUGS.md` B6 |
| T24 | Walk the Definition of Done as a literal checklist | both | R7 | blocked | |
| T25 | Tag v0.1.0, publish, record the release | both | R7 | blocked on T24 | |

## Opened by reading the queue

| ID | Task | Who | Status | Note |
|---|---|---|---|---|
| T34 | Check `identityTier` for row 8's finding in the report JSON | agent | todo | Its id embeds a UUID (`015aad82-…`) that the `[0-9a-f]{8,}` generated-id filter should reject. OCW was byte-identical across runs so it evidently didn't churn — but confirm the filter caught it rather than assuming. |
| T35 | Write up the `#42b883` finding for README §6 | agent | blocked on T13 | Five of twelve contrast rows plus two `link-in-text-block` rows are one brand colour on white. One design-token decision, ~400 instances, seven queue rows. This is what `templateKey` exists to make visible. |

## Post-release candidates

| ID | Task | Who | Status | Note |
|---|---|---|---|---|
| T26 | Docs-consistency test — bin name, coverage markers, generator diff | agent | todo | Converts the B1–B5 class from "spot it by reading" to "CI catches it." The highest-value item here. |
| T27 | Extract `checks[].data` at normalise time | agent | todo | `fgColor`/`bgColor`/`contrastRatio`/`messageKey`. Turns "contrast issue here" into "4.2:1, needs 4.5:1." |
| T28 | Close the settle layout-stability gap | agent | todo | Poll bounding-box stability, or raise `settle.quietMs` when `mode === 'audit'`. |
| T29 | `a11y-ratchet doctor <url>` | agent | todo | Auto-detect generated-id patterns by double-loading and diffing ids. More robust than a hand-maintained pattern list. |
| T30 | Faceted-search URL templating | agent | todo | |
| T31 | `--repeat N` instability detection | agent | todo | |
| T32 | Probes cut from v1 — 2.4.3, 2.4.7, off-screen focus | agent | todo | |
| T33 | Re-verify network-timeout classification (D89) | agent | todo | |

---

## Dropped

*(nothing yet — when something is dropped, move it here with the reason, don't delete it)*
