# 00 — Brief and Build Plan

**Budget:** 15 working days, single developer, full-time
**Purpose:** portfolio / credibility artifact
**Status:** scope cut to fit the budget — see §4 for what was removed and why

---

## 1. What this is

A CLI and library that crawls a site with Playwright, runs `axe-core` per page, runs
**interaction probes** that axe structurally cannot run, maps every finding to a WCAG 2.2
success criterion, and diffs two runs to identify regressions — with a GitHub Action that
fails a PR on new violations.

## 2. What it is for

Not a market play. Automated accessibility scanning is crowded and solved: `axe-core` CLI,
`pa11y-ci`, Lighthouse CI, IBM Equal Access, axe DevTools. Several already have baselines.

The artifact's value is **demonstrated domain judgement**, expressed as three things a
typical scanner project does not do:

1. **A published coverage matrix** — all 55 WCAG 2.2 A/AA criteria, each marked with what
   the tool can and cannot detect, and why.
2. **Interaction probes** — focus-path traversal detecting criteria axe cannot reach. This
   is the *reason* to build on Playwright rather than wrap the axe CLI.
3. **A diff that doesn't lie** — stable finding identity that survives DOM churn, so the
   CI gate stays enabled past week two.

If a reviewer reads only the README, they should think "this person has run audits," not
"this person can call a library."

## 3. Positioning

> This tool detects a minority of accessibility defects. That is not a limitation of this
> implementation — it is the nature of automated accessibility testing. Automated tools
> catch roughly 30–40% of WCAG failures. Everything else requires a human with a keyboard
> and a screen reader. This README documents which criteria fall on which side of that
> line, and what the tool found — including false positives — on real sites.

**Do not invert the statistic.** The common error is "30–40% needs a human." It is the
reverse: 30–40% is what automation *catches*. Attribute it (WebAIM/Deque publish it);
do not substitute your own fixture number for it — see `03-EVIDENCE.md §3.4` for why that
substitution is circular.

## 4. Scope

### In (v1)

| Area | Detail |
|---|---|
| CLI | `scan`, `diff`, `report`, `check-config`, `manual` |
| Library | Typed public API; CLI is a thin shell over it |
| Crawl | sitemap.xml, URL list file, BFS with include/exclude globs, depth + page cap, robots.txt |
| Engine | Playwright (Chromium), `axe-core` all-frames |
| Probes | Focus-path: obscured focus (2.4.11), keyboard trap (2.1.2) |
| Buckets | `violation`, `needs-review` (axe `incomplete`) |
| Output | Versioned JSON, static HTML report, terminal summary |
| Diff | Stable fingerprints; new / fixed / persisting / moved / impact-changed; page-set aware |
| Config | Ignore rules with mandatory justification, owner, expiry |
| CI | Composite GitHub Action, job summary, exit-code gate, documented baseline lifecycle |
| Docs | Coverage matrix, `--manual` checklist, honest README |
| Auth | `--storage-state` |

### Cut from the original scope to fit 15 days

| Cut | Rationale |
|---|---|
| Third demo site | Two honestly-verified sites beat three skimmed ones. Frees ~1.5 days. |
| Probe detections: tab-order (2.4.3), off-screen focus, focus-visible (2.4.7) | 2.4.7 in particular needs `:focus-visible`, descendant outlines, box-shadow, border shifts, and custom SVG indicators handled correctly. A computed-style read will misfire constantly. Roadmap. |
| Report filters, in-report coverage section | Grouped table + diff view is enough. Coverage lives in the README. |
| `--repeat N` instability detection | Valuable, not load-bearing. Roadmap. |
| PR comment (keeping job summary) | Job summary demonstrates the CI story at a tenth the cost. |
| Context-derived `--manual` items | Ship criterion-keyed checklist + `needs-review` routing. Derive from page features only if Day 13 has slack. |

### Never in scope — state in the README

Conformance claims, VPATs, auto-remediation, hosted service, non-Chromium browsers,
exploratory "click everything" crawling, and **states behind interaction** (modals, error
states, toasts). That last one is a real limitation and the most serious defects usually
live there. Document it; don't hide it.

## 5. Honest schedule note

Full original scope is a **22–25 day** build, not 15. Both independent reviews of the first
draft converged on this. The plan below fits 15 days *because* of the cuts in §4. Even so
it assumes no unknown-unknowns, which is optimistic for a project whose core component
(identity) is research-flavoured.

If you would rather have the full scope, budget five weeks and stop reading here.

## 6. The 15-day plan

Each day has a **done-when**. If it isn't met by end of day, take the next cut in §7
rather than pushing everything right.

| Day | Work | Done when |
|---|---|---|
| 1 | Repo, TS strict, Vitest, `types.ts` complete, fixture server, first fixture pass (images, structure, contrast, clean) | `npm test` green; `scan --help` prints the real interface |
| 2 | Playwright lifecycle, determinism contract (both modes, §`01 §5`), axe injection all-frames, raw → `Finding[]` | Scanning a fixture page matches its manifest |
| 3 | `wcag/criteria.ts` (86 SCs), tag parsing, multi-SC handling, your own remediation notes for the top ~40 rules, terminal table | Every finding carries correct SC + level |
| 4 | `identity/fingerprint.ts`: tiered identity, generated-id filter, normalisation, context, collision ordinals | Unit tests on each tier pass |
| 5 | The 17 golden pairs; tune threshold against them | All 17 pass; cases 1–10 at zero tolerance |
| 6 | Matcher (two-pass), page-set partitioning, gate semantics, `diff` command | `diff base.json head.json` produces a correct `DiffResult` |
| 7 | Crawler: frontier, sitemap + index parsing, URL list, globs, robots, caps, concurrency pool, context recycling | Depth-2 crawl finds exactly the expected page set |
| 8 | Config schema, suppression matching, `check-config` with expiry + staleness | Expired suppression exits 2; missing justification fails validation |
| 9 | Focus-path probe: scroll-settled traversal, shadow-aware `activeElement`, obscured + trap detection, dedicated fixtures | Probe finds planted defects and reports **nothing** on the clean page |
| 10 | HTML report: grouped view, diff view, self-contained | Renders a real run readably |
| 11 | Report accessibility pass + self-test; library public API, exports, `.d.ts`, a test that imports rather than shells out | Report scans clean; library test passes |
| 12 | Composite Action, baseline lifecycle (`01 §11`), job summary, exit codes, demo repo PRs | One PR fails the gate, one passes |
| 13 | `manual` command; error paths; npm packaging; `npx` smoke test from clean dir. **Feature freeze.** | Every error path gives a useful message and the right exit code |
| 14 | Real-site audit, site 1 + start site 2: run, verify every distinct finding by hand, write rationales | Verdict table for site 1 complete |
| 15 | Finish site 2; README against `03-EVIDENCE.md §4`; tag; release | All boxes in §8 ticked |

**Fixture authoring is spread across days 1, 5, and 9** rather than budgeted as a block.
`03-EVIDENCE.md §2` specifies thirteen fixture directories; if you author them all at once
it is a day and a half you do not have.

## 7. Cut lines, in order

1. Report polish → plain grouped table.
2. `manual` command → static Markdown per criterion, no page derivation.
3. Trap detection in the probe → ship obscured-focus only.
4. Second demo site → one site, verified exhaustively.
5. Library `.d.ts` surface → document as "CLI first, library API in v1.1" and delete the
   claim from the README rather than shipping an untested one.

**Never cut:** the golden diff fixtures, the coverage matrix, hand-verification of
real-site findings, the "what this cannot catch" section, the report's own accessibility.
Those five *are* the artifact.

## 8. Definition of done

- [ ] `npx <tool> scan https://example.com` works from a clean machine in one command.
- [ ] Test suite runs fully offline.
- [ ] Diff produces zero false regressions across the DOM-churn goldens.
- [ ] Same page scanned 5× produces byte-identical fingerprints.
- [ ] Coverage matrix covers all 55 A/AA criteria, no TBD rows, counts generated from data.
- [ ] README documents real-site runs with false positives named and mechanisms explained.
- [ ] The statistic appears in the correct direction, attributed.
- [ ] The Action fails a deliberately-broken PR and passes a clean one, both linked.
- [ ] The HTML report passes its own scan with zero violations.

## 9. Risk register

| Risk | L | I | Mitigation |
|---|---|---|---|
| Fingerprint churns on real sites despite passing goldens | High | Critical | Run against one real site on **Day 5**, not Day 14. Add every failure as a new golden. |
| Identity work overruns Days 4–6 | High | High | Pass 2 fuzzy matching is optional. Ship exact-match-only diff and report unmatched findings as `unclassified` rather than `new`. Degrades safely. |
| Probe false-positive rate too high to ship | Medium | Medium | Default `needs-review`, never gating. Publish the FP rate. |
| Real-site verification overruns | High | High | Grouping must demonstrably collapse findings before Day 14. Verify that on Day 10 with a live run. |
| Scope creep into "one more probe" | High | Medium | Freeze Day 13. Roadmap absorbs the rest. |
| axe bump mid-build shifts fixture expectations | Low | Medium | Pin `axe-core` exactly; record version in every report. |

## 10. Naming and licensing

- **Do not put "axe" in the name.** Deque's trademark.
- `axe-core` is MPL-2.0; unmodified npm consumption imposes no copyleft. Don't patch axe
  source — use its config API.
- Avoid names implying certification (`wcag-certify`, `a11y-compliant`); they undercut the
  entire pitch. Placeholder: `a11y-regress`.

## 11. Ethics for the real-site section

Respect `robots.txt` (default on). Concurrency 3, 250ms delay, 25–50 page cap. Prefer
sites with published accessibility statements — government, large OSS, universities.
Frame every finding as **"the tool flagged X"**, never "site Y violates WCAG": you have
not performed a conformance evaluation, and saying otherwise is inaccurate and unwise.
Date every run and record tool + axe versions. Consider notifying the site before
publishing anything severe.
