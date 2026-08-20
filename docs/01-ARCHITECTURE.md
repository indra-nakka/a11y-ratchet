# 01 — Architecture

---

## 1. Principle: types first

Write `src/types.ts` on day one. The `Finding` shape and report envelope are the contract
every other module negotiates with — diff, report, Action, and any external consumer of
the JSON. Discovering on day 9 that identity needs the accessible name means re-plumbing
the scanner.

## 2. Module layout

```
src/
  index.ts            # PUBLIC LIBRARY API. The only file external consumers import.
  types.ts            # Shared types. No sibling imports. Zero logic.
  config/             # schema.ts (zod) · load.ts · suppress.ts
  crawl/              # frontier.ts · sitemap.ts · filters.ts
  scan/
    browser.ts        # Playwright lifecycle, context pool, storageState
    modes.ts          # ci | audit — see §5
    settle.ts         # The readiness contract. One place, no exceptions.
    axe.ts            # injection, config, all-frames, raw capture
    probes/
      focusPath.ts    # the v1 probe — §6
    normalise.ts      # raw -> Finding[]; computes fingerprint + groupKey
  identity/           # fingerprint.ts · group.ts   ← see 02-IDENTITY-AND-DIFF.md
  diff/               # match.ts · classify.ts · gate.ts
  wcag/               # criteria.ts · ruleMap.ts · remediation.ts · coverage.ts
  report/             # summary.ts · json.ts · html/ · manual.ts
  cli/                # index.ts + commands/ — argument parsing and formatting ONLY
```

`cli/` contains no logic. Every command is `parse args → call library → format`. This is
what makes the "CLI + library" claim true rather than decorative — and it needs a test that
imports `src/index.ts` directly, not one that shells out to the binary.

## 3. Data model

```ts
type Level = 'A' | 'AA' | 'AAA';
type Impact = 'minor' | 'moderate' | 'serious' | 'critical';
type Bucket = 'violation' | 'needs-review';
type Source = 'axe' | 'probe';

interface Finding {
  fingerprint: string;    // stable across RUNS      — 02 §3
  groupKey: string;       // stable across PAGES     — 02 §4
  identityTier: 1|2|3|4|5;
  source: Source;
  ruleId: string;         // axe rule id, or "probe/focus-obscured"
  bucket: Bucket;
  impact: Impact;
  criteria: SuccessCriterion[];   // empty for best-practice rules
  url: string;
  urlTemplate: string;
  selector: string;       // DISPLAY ONLY — never part of identity
  frameSelector?: string[];
  shadowPath?: string[];  // host chain, when inside shadow DOM
  html: string;           // truncated outerHTML
  accessibleName?: string;
  remediation: string;    // yours, not axe's help text
  helpUrl?: string;
  suppressed?: SuppressionRef;
}
```

`identityTier` is recorded deliberately: tier 5 findings are known-fragile, the report can
flag them, and the matcher can be more generous with them. Exposing your own confidence is
a feature.

The envelope carries enough to make a diff defensible:

```ts
interface Report {
  schemaVersion: '1.0';
  tool: { name; version; axeCoreVersion; playwrightVersion; browser; browserVersion };
  run: {
    id; startedAt; durationMs; configHash; baseUrl;
    mode: 'ci' | 'audit';                    // §5 — MUST be recorded
    viewport: { width; height };
    blockedOrigins: string[];                // what was suppressed at network level
  };
  pages: PageResult[];    // including pages that errored, with the error
  findings: Finding[];
  suppressed: Finding[];  // kept, not deleted — visibility matters
  groups: GroupIndex;     // consumers shouldn't re-derive grouping
  summary: Summary;
}
```

### Engine-drift guard

Diffing across `axe-core` versions produces phantom regressions: a rule tightens, forty
"new" violations appear that were always there. `diff` compares `axeCoreVersion` and
**refuses by default**, requiring `--allow-engine-drift`, which banners the report.

**Document the escape hatch.** A PR that legitimately bumps `axe-core` will hit exit 4 and
be unable to merge. The Action needs a documented `allow-engine-drift: true` input and a
note that such PRs should regenerate the baseline (§11) rather than force the flag
permanently.

## 4. Pipeline

```
config load → frontier (sitemap | url-list | BFS) ── concurrency-limited
  → per URL: newPage → navigate → settle(§5) → axe.run ⊕ probes.run
  → normalise (fingerprint + groupKey) → suppression tagging (tag, don't drop)
  → Report → { json | html | summary } or diff vs baseline
```

## 5. Scan modes — resolving the determinism/probe conflict

The first draft blocked third-party requests by default for stability, while making
obscured-focus detection the flagship feature. Those contradict: cookie banners, consent
overlays, and chat widgets are third-party, and they are the single most common cause of
focus being obscured in the wild. Default-blocking guarantees the probe's best findings
never fire.

Two modes. Every report records which one produced it, and mixed-mode diffs are refused.

| | `--mode=ci` (default) | `--mode=audit` |
|---|---|---|
| Third-party requests | blocked (allowlist in config) | allowed |
| Purpose | diffable, low-variance, gate-safe | honest picture of the real page |
| Probes | run, but expect fewer overlay findings | full fidelity |
| Diff | supported | supported only against another `audit` run |

**The three real-site runs in the README must be `audit` mode**, and say so. A clean 2.4.11
result from a CI-mode run would be an artifact of the network blocklist, not a finding.

### Context settings (both modes)

```ts
viewport: { width: 1280, height: 800 }   // configurable, recorded
deviceScaleFactor: 1
locale: 'en-US'                          // configurable, recorded
timezoneId: 'UTC'
colorScheme: 'light'                     // configurable, recorded
reducedMotion: 'reduce'
```

Plus an injected stylesheet zeroing all animation and transition durations and delays.

### The readiness contract (`scan/settle.ts`)

Do **not** use `waitForLoadState('networkidle')`. It never fires on sites with polling,
websockets, or analytics beacons — so you eat the full timeout on exactly the sites you
most want to scan — and it costs seconds per page even when it does fire.

```
1. goto(url, { waitUntil: 'domcontentloaded' })
2. await document.fonts.ready                    // contrast depends on rendered text
3. await 2 × requestAnimationFrame               // layout + paint settled
4. await images in viewport decoded (bounded, 1.5s cap)
5. mutation quiet period: 150ms with no mutations, 2s hard cap
6. proceed
```

Step 5 is short by design. Extend it to 500ms only for fixture determinism tests, via
`settle.quietMs`. Expose `--settle-strategy` for sites where this is wrong.

## 6. The focus-path probe

The one probe shipping in v1. Two detections: obscured focus (2.4.11) and keyboard trap
(2.1.2). Both default to `bucket: 'needs-review'` and **never gate**.

### 6.1 Reading the focused element — shadow-aware

`document.activeElement` stops at the shadow host boundary. On any Web Component it
returns the host, not the focused leaf — which breaks both bounding-box accuracy and trap
detection. Recurse:

```js
function deepActiveElement() {
  let el = document.activeElement;
  const path = [];
  while (el?.shadowRoot?.activeElement) {
    path.push(hostDescriptor(el));
    el = el.shadowRoot.activeElement;
  }
  return { el, shadowPath: path };
}
```

**Closed shadow roots are unreachable.** No traversal fixes this. Detect their presence
where possible, mark those regions `probe-blind` in the report, and route them to the
manual checklist. Saying "I could not see inside this component" is more useful than
silently reporting zero findings.

### 6.2 Measure after scroll settles — not before

Focusing an element triggers the browser's scroll-into-view. Measuring the bounding box
immediately captures geometry from before the scroll completes, and the element appears
obscured when it is not.

Worse: `scroll-margin-top` is *the* correct fix for sticky headers. A page that solved the
problem properly gets flagged, and the probe's false positives concentrate on
well-implemented pages — the worst possible failure distribution.

```
press Tab
await scrollend  (or: 2 × rAF, then poll scrollY stable for 2 frames, 500ms cap)
read deepActiveElement()
read getBoundingClientRect()
read computed scroll-margin-* on the focused element
```

Then, before flagging: if the element's `scroll-margin` box clears the obscuring element,
it is not a violation. This check is what makes the probe credible rather than noisy.

### 6.3 Detections

```
(a) focus left the document              -> stop traversal
(b) activeElement unchanged after Tab    -> TRAP candidate (2.1.2)
(c) focus cycles without covering all
    known tabbables                      -> TRAP candidate (2.1.2)
(d) focused element's scroll-margin box
    fully covered by a visible
    fixed/sticky element of higher
    stacking order                       -> OBSCURED (2.4.11)
```

### 6.4 Known false positives — state these in code and README

- (d) misfires on skip links that are hidden until focused, and on `opacity: 0` overlays
  that remain `position: fixed`. Filter on computed visibility and non-zero opacity; expect
  residual misses either way.
- (b)/(c) misfire on roving-tabindex widgets — menus, toolbars, grids, tab lists — where
  focus legitimately stays on a container. This is why probes never gate.
- The probe cannot evaluate focus indicator *adequacy* (2.4.13, AAA). Don't claim it.
- Virtualised lists and carousels produce spurious geometry.

## 7. WCAG mapping

Parse axe `tags` (`wcag143` → `1.4.3`) and join against `wcag/criteria.ts`. Three cases to
handle explicitly:

1. **Rules with no SC tag** (`region`, `heading-order` — `best-practice` only). Report with
   `criteria: []`, labelled "Best practice — not a WCAG failure." Off by default. Tools
   that present these as WCAG violations are a major reason practitioners distrust scanners.
2. **Rules mapping to multiple SCs.** `link-name` is 2.4.4 *and* 4.1.2. Keep the array.
3. **WCAG 2.2 reality.** `target-size` (2.5.8) ships **off by default** — you must opt into
   the `wcag22aa` tag. Deque has stated it is likely the only new 2.2 rule axe-core will
   add. Your config enables it; your README must not imply broad 2.2 coverage.

## 8. Cross-page grouping

**Corrected from the first draft.** `groupKey` was defined as the fingerprint minus
`urlTemplate` — but the fingerprint's context signal includes `headingContext` (nearest
preceding heading), which for a nav or footer element resolves to each page's own `<h1>`.
The findings grouping exists to collapse are exactly the ones that wouldn't have collapsed.

Grouping needs a **strictly weaker** signal than per-page identity:

```ts
groupKey = sha256([ ruleId, source, accessibleName ?? identityValue, landmarkRole ]);
// headingContext, urlTemplate, and sibling structure all deliberately excluded
```

Default report view is grouped:

```
[serious] color-contrast — 1.4.3 Contrast (Minimum) [AA]
  Affects 43 pages · 1 unique element
  .site-footer a.legal-link
  Examples: /about, /pricing, /contact  (+40 more)
```

`--ungrouped` for the flat list. **Verify grouping actually collapses on a live site by
Day 10** — the Day 14 audit budget assumes 20–40 distinct findings per site, not 200.

## 9. Concurrency

One `BrowserContext` per worker, reused; fresh `Page` per URL. Recycle contexts every ~25
pages to bound memory. Default concurrency 3; above ~8 results destabilise on modest
hardware, which corrupts diffs — document that. Per-page timeout with a recorded
`PageResult.error`, never a silent skip: a page that failed to load is not a page with zero
violations, and the diff must know the difference.

## 10. Exit codes

The first draft overloaded code 1 across two different meanings, in a document whose
stated rationale is that overloading exit codes teaches teams to ignore the gate.

| Code | Meaning |
|---|---|
| 0 | Pass |
| 1 | **Diff gate failed** — new violations vs baseline |
| 2 | Config invalid, or expired suppressions |
| 3 | Tool error — browser launch, unreachable base URL, unreadable baseline |
| 4 | Engine drift without `--allow-engine-drift` |
| 5 | **Scan threshold exceeded** — absolute violation count, no baseline involved |
| 6 | Mode mismatch — attempted diff across `ci` and `audit` runs |

CI must be able to distinguish "the site regressed" from "the tool broke."

## 11. Baseline lifecycle

Undesigned in the first draft, and it matters more than the HTML report: this workflow *is*
the day-to-day experience of the tool and determines whether a team keeps it.

**Storage:** committed file at `.a11y/baseline.json`, not a CI artifact. Artifacts expire,
aren't reviewable, and can't be diffed in a PR. A committed baseline shows up in review,
which is the point.

**Update paths:**

| Situation | Mechanism |
|---|---|
| A fix merges; violations disappear | `<tool> baseline update` locally, committed with the fix. Stale `fixed` entries in a baseline are harmless but noisy. |
| A violation is deliberately accepted | Not a baseline update — a **suppression** with justification and expiry. Baseline records reality; config records decisions. Keeping these separate is the whole point. |
| `axe-core` is bumped | `baseline regenerate` in the same PR; reviewers see the churn as a diff. |
| Baseline drifts from `main` | Action runs `baseline check` on a schedule and opens an issue when the committed baseline no longer matches a fresh scan. |

**Rule:** the Action never writes to the repository. A CI job that commits to your branch
is a surprise nobody wants. It fails the gate and prints the exact local command to run.
