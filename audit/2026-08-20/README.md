# Real-site audit — 2026-08-20

Raw material for hand verification. **No verdicts are recorded here.** The `verdict`
column in both TSVs is empty by design — classifying a finding as a true or false positive
requires opening the page, and that judgement is made separately from this data.

## Method

| | |
|---|---|
| Tool | a11y-ratchet 0.1.0 |
| axe-core | 4.13.0 (pinned exactly) |
| Browser | Chromium 151.0.7922.34 |
| Mode | `audit` (third-party requests allowed — say so, since `ci` mode's network blocklist would make some findings, e.g. 2.4.11 obscured-focus on ad content, artifacts of the blocklist rather than the page) |
| robots.txt | respected (default on) |
| Concurrency | 3 |
| Politeness delay | 250ms (default) |
| Date | 2026-08-20 |

Sites and page caps:

| Site | Shape | Pages (attempted/scanned) | Notes |
|---|---|---|---|
| vuejs.org | docs + marketing | 40/40 | Continuity run — CSP-bypass path and a 2.1.2 (keyboard-trap) finding on `/tutorial/` and `/examples/` established in an earlier session; both were re-confirmed present in this run (see chat reply, not reproduced here). |
| ocw.mit.edu | course catalogue | 40/40 | Selected from three proposed candidates (MIT OpenCourseWare, Smithsonian collections, UK National Archives Discovery). Publishes an institutional accessibility statement at `accessibility.mit.edu` (HTTP 200, checked before scanning). |
| gov.uk | — (item 5 zero-check only, not templated here) | 10/10 | Required `--bypass-csp`: default run refused with `axe-injection-failed` (exit 3) against gov.uk's `script-src` CSP, no `unsafe-inline`/hash/nonce match for the injected tag. Re-run with the flag; `run.bypassCSP: true` recorded on the report. **10 pages, but roughly 3 distinct page templates, not 10 independent samples**: 7 of the 10 URLs are `/browse/<category>` pages sharing GOV.UK's browse-category template (`benefits`, `births-deaths-marriages`, `childcare-parenting`, `business`, `citizenship`, `justice`, `disabilities`); the remaining 3 are `/` (homepage), `/browse` (the browse index itself), and `/help/cookies` — each its own template. The zero-finding result is evidence about at most 3 templates, not 10. Not included as a TSV — see the chat reply for the passes/inapplicable diagnostic that backs the zero-finding result. |

Each site was scanned twice, back to back, with identical settings, to measure fingerprint
stability between runs. Results are in the chat reply that accompanies this commit, not
reproduced here.

## Files

- `vuejs.org.tsv` — 108 template groups, run 1.
- `ocw.mit.edu.tsv` — 48 template groups, run 1.
- Columns: `#, ruleId, bucket, impact, SC, instances, pages, exampleUrl, selector,
  accessibleName, stratum, verdict`. Sorted by `instances` descending. `verdict` is empty
  throughout.

Full report JSON (both runs, both sites, plus the base→head diffs used for the stability
check) is **not** committed — vuejs.org's three JSON files run 6.5–7.4MB each (~21MB
total), which doesn't belong in git history for a per-day audit snapshot. They're on disk
locally at:

```
<session temp>/scratchpad/day14/vuejs-run1.json
<session temp>/scratchpad/day14/vuejs-run2.json
<session temp>/scratchpad/day14/vuejs-diff.json
<session temp>/scratchpad/day14/mitocw-run1.json
<session temp>/scratchpad/day14/mitocw-run2.json
<session temp>/scratchpad/day14/mitocw-diff.json
```

gov.uk's report (6.6KB) and the passes/inapplicable diagnostic run against it (9.7KB) are
small enough that they're committed alongside this README:
`govuk-run1.json`, `govuk-diagnostic.json`.

## Verification strata

Marked in the `stratum` column of both TSVs, so tomorrow's hand-verification work is
scoped, not open-ended:

- **Stratum A** — every template with **≥ 10 instances**. 46 of 108 rows on vuejs.org, 6 of
  48 on ocw.mit.edu.
- **Stratum B** — a random sample of **15** templates from the remainder (< 10 instances
  each), seeded for reproducibility. Seed: **`20260820`** (the scan date as an integer),
  drawn with a mulberry32 PRNG (deterministic, not `Math.random()` — same seed reproduces
  the same sample on any machine). Fisher-Yates shuffle over the remainder sorted by
  `templateKey` (a stable, run-independent order) before taking the first 15. 15 of the
  remaining 62 rows on vuejs.org, 15 of the remaining 42 on ocw.mit.edu — the sample is
  smaller than 15 nowhere here, so no site hit the "fewer than 15 remain" edge case.
- **Everything else is unmarked and unverified.** 47 of 108 vuejs.org templates and 27 of
  48 ocw.mit.edu templates carry no stratum and are explicitly out of scope for the current
  verification pass — not silently dropped, just not sampled. A future pass could draw
  another seeded sample from what's left, or extend stratum A's threshold down.

## What this can and cannot measure

**Precision, not recall.** Whatever fraction of stratum A + B ends up verified as a true
positive is an honest, empirically-measured precision figure — *of N findings hand-checked,
M were real*. It is not a recall figure, and none of this material should be read as one:
the fixture suite's planted-defect count is a regression metric over fixture design (how
many unautomatable defects were chosen to plant), not a measured catch rate (`03-EVIDENCE.md
§2.5`) — a different set of planted defects produces a different number from the same tool.
The published 30–40% industry catch-rate figure is cited and attributed elsewhere in this
project; it is not re-derived from this data, and this data doesn't attempt to.

## Ethics

`robots.txt` respected on every site (checked before running, not assumed). Concurrency 3,
250ms delay, page caps at or under the 25–50 range for the two full crawls. Every finding
in the TSVs is reported as "the tool flagged X, on this selector, on this page" — not as a
conformance claim about either site. No finding here has been characterised as genuine or
spurious; that is deliberately left blank for hand verification.
