# 03 — Evidence: Coverage, Tests, README

These three were separate documents. They are one concern: how the project's claims are
made checkable. The coverage matrix defines the boundary, the fixtures measure against it,
the README publishes it. Same data, three surfaces.

---

# Part 1 — WCAG 2.2 Coverage Matrix

Ships as data (`src/wcag/coverage.ts`), renders into the report, drives `--manual`, and
appears in the README.

> **Verify every row against axe-core's published rule descriptions before shipping.** Rule
> IDs drift between minor versions. A wrong rule ID in a coverage matrix is worse than no
> matrix.

## 1.1 The arithmetic

WCAG 2.2 has **86** success criteria: **31 A**, **24 AA**, **31 AAA**. An AA conformance
claim covers A + AA = **55**.

WCAG 2.1 had 78; 2.2 adds 9 and removes 1 (4.1.1 Parsing, obsolete) → 86. Checklists
claiming 87 / 56-at-AA are double-counting 4.1.1. State the number correctly and note why
others get it wrong — a one-sentence proof you read the spec rather than a blog post.

Six of the nine new criteria are A or AA: 2.4.11 Focus Not Obscured (Minimum), 2.5.7
Dragging Movements, 2.5.8 Target Size (Minimum), 3.2.6 Consistent Help, 3.3.7 Redundant
Entry, 3.3.8 Accessible Authentication (Minimum). The other three (2.4.12, 2.4.13, 3.3.9)
are AAA.

## 1.2 Status vocabulary

Nothing is ever "full" — a criterion is a requirement about meaning and experience; a
machine checks proxies for it.

| Status | Meaning |
|---|---|
| **Detectable** | A common, important failure class is reliably caught. Still not conformance. |
| **Partial** | A narrow subclass is caught; most real failures are invisible. |
| **Probe** | Not covered by axe; covered by this tool's interaction probes. |
| **Manual** | No meaningful automated signal. Goes to the checklist. |

## 1.3 Perceivable

| SC | Title | Lvl | Status | Notes |
|---|---|---|---|---|
| 1.1.1 | Non-text Content | A | Partial | `image-alt`, `input-image-alt`, `area-alt`, `role-img-alt`, `svg-img-alt`, `object-alt`. Detects *absence*; cannot judge whether alt text is accurate — the most common real failure. |
| 1.2.1 | Audio-only / Video-only | A | Manual | |
| 1.2.2 | Captions (Prerecorded) | A | Partial | `video-caption` (needs-review). Detects missing `<track>`; not quality, sync, or speaker ID. |
| 1.2.3 | Audio Description or Media Alternative | A | Manual | |
| 1.2.4 | Captions (Live) | AA | Manual | |
| 1.2.5 | Audio Description (Prerecorded) | AA | Manual | |
| 1.3.1 | Info and Relationships | A | Partial | `list`, `listitem`, `dlitem`, `td-headers-attr`, `th-has-data-cells`, `aria-required-children/parent`. Catches markup errors; not visually-implied relationships absent from the DOM. |
| 1.3.2 | Meaningful Sequence | A | Manual | DOM order vs *visual* order. |
| 1.3.3 | Sensory Characteristics | A | Manual | "the button on the right" |
| 1.3.4 | Orientation | AA | Partial | `css-orientation-lock` |
| 1.3.5 | Identify Input Purpose | AA | Partial | `autocomplete-valid`. Detects invalid tokens, not a *missing* autocomplete. |
| 1.4.1 | Use of Color | A | Manual | `link-in-text-block` covers one narrow case. Colour-only status, legends, required-field marking: invisible. |
| 1.4.2 | Audio Control | A | Partial | `no-autoplay-audio` |
| 1.4.3 | Contrast (Minimum) | AA | **Detectable** | `color-contrast`. Highest-yield check. Returns needs-review over images, gradients, transparency — do not drop those silently. |
| 1.4.4 | Resize Text | AA | Partial | `meta-viewport`. Actual reflow at 200% untested. |
| 1.4.5 | Images of Text | AA | Manual | |
| 1.4.10 | Reflow | AA | Manual | Needs rendering at 320px. *Candidate future probe.* |
| 1.4.11 | Non-text Contrast | AA | Manual | No axe rule. Widely and wrongly assumed covered by `color-contrast`. |
| 1.4.12 | Text Spacing | AA | Partial | `avoid-inline-spacing` |
| 1.4.13 | Content on Hover or Focus | AA | Manual | *Candidate future probe.* |

## 1.4 Operable

| SC | Title | Lvl | Status | Notes |
|---|---|---|---|---|
| 2.1.1 | Keyboard | A | Partial | `scrollable-region-focusable`, `frame-focusable-content`. (`nested-interactive` maps to 4.1.2, not here.) |
| 2.1.2 | No Keyboard Trap | A | **Probe** | No axe rule. Cycle analysis. False-positives on roving-tabindex widgets. |
| 2.1.4 | Character Key Shortcuts | A | Manual | |
| 2.2.1 | Timing Adjustable | A | Partial | `meta-refresh` only. Session/JS timeouts invisible. |
| 2.2.2 | Pause, Stop, Hide | A | Partial | `blink`, `marquee`. (`no-autoplay-audio` maps to 1.4.2.) Auto-advancing carousels — the common failure — not detected. |
| 2.3.1 | Three Flashes | A | Manual | |
| 2.4.1 | Bypass Blocks | A | Partial | `bypass` only; `skip-link` is best-practice-tagged and does not count as WCAG signal. Presence, not function. |
| 2.4.2 | Page Titled | A | **Detectable** | `document-title`. Absence, not descriptiveness. |
| 2.4.3 | Focus Order | A | Manual | `tabindex` (best-practice) flags positive tabindex. **Probe cut from v1** — roadmap. |
| 2.4.4 | Link Purpose (In Context) | A | Partial | `link-name` detects empty links. "Read more" passes and fails the criterion. |
| 2.4.5 | Multiple Ways | AA | Manual | Site-level |
| 2.4.6 | Headings and Labels | AA | Manual | **Corrected (D23).** `empty-heading` and `heading-order` are both best-practice-tagged in 4.13.0 — no WCAG-tagged rule maps here. Descriptiveness was never judgeable anyway. |
| 2.4.7 | Focus Visible | AA | Manual | **Demoted from Probe.** Requires handling `:focus-visible`, descendant outlines, box-shadow, border shifts, background changes, custom SVG indicators. A computed-style read misfires constantly. Roadmap. |
| 2.4.11 | Focus Not Obscured (Min) | AA | **Probe** | New in 2.2. Deque has said this will not be added to axe-core. Requires scroll-settled measurement and `scroll-margin` awareness (`01 §6.2`). **The flagship differentiator.** |
| 2.5.1 | Pointer Gestures | A | Manual | |
| 2.5.2 | Pointer Cancellation | A | Manual | |
| 2.5.3 | Label in Name | A | Partial | `label-content-name-mismatch` |
| 2.5.4 | Motion Actuation | A | Manual | |
| 2.5.7 | Dragging Movements | AA | Manual | New in 2.2. Detecting a drag is possible; verifying an adequate alternative is not. |
| 2.5.8 | Target Size (Minimum) | AA | Partial | New in 2.2. `target-size` — **off by default**, needs the `wcag22aa` tag. Inline/essential/equivalent exceptions generate false positives. |

## 1.5 Understandable

| SC | Title | Lvl | Status | Notes |
|---|---|---|---|---|
| 3.1.1 | Language of Page | A | **Detectable** | `html-has-lang`, `html-lang-valid`, `html-xml-lang-mismatch` |
| 3.1.2 | Language of Parts | AA | Partial | `valid-lang` validates present attributes; cannot detect a missing one. |
| 3.2.1 | On Focus | A | Manual | |
| 3.2.2 | On Input | A | Manual | |
| 3.2.3 | Consistent Navigation | AA | Manual | Cross-page. *Candidate — the crawler already has every page's nav.* |
| 3.2.4 | Consistent Identification | AA | Manual | Same. |
| 3.2.6 | Consistent Help | A | Manual | New in 2.2. Cross-page consistency. |
| 3.3.1 | Error Identification | A | Manual | Requires submitting a form — invisible to a crawler. |
| 3.3.2 | Labels or Instructions | A | Partial | `form-field-multiple-labels` only. (`label`, `select-name`, `aria-input-field-name` all map to 4.1.2.) Placeholder-as-label often passes. |
| 3.3.3 | Error Suggestion | AA | Manual | |
| 3.3.4 | Error Prevention | AA | Manual | |
| 3.3.7 | Redundant Entry | A | Manual | New in 2.2. Multi-step flow traversal. |
| 3.3.8 | Accessible Authentication (Min) | AA | Manual | **Corrected (D24).** New in 2.2. axe has no rule here. The earlier Partial credited an `onpaste`-blocking check that is a *custom rule we would have to write* — crediting unwritten code. Returns to Partial only if that rule ships. |

## 1.6 Robust

| SC | Title | Lvl | Status | Notes |
|---|---|---|---|---|
| 4.1.2 | Name, Role, Value | A | **Detectable** | Largest cluster: `button-name`, `link-name`, `aria-*`, `select-name`, `frame-title`. High yield; detects missing/invalid, not incorrect-but-valid. |
| 4.1.3 | Status Messages | AA | Manual | **Corrected (D23).** No WCAG-tagged rule in 4.13.0. Live-region *presence* is observable, but nothing in axe asserts it. |

*(4.1.1 Parsing was removed in 2.2. Markup problems that used to fail it now fail 1.3.1 or 4.1.2.)*

## 1.7 Counts

**These numbers have been wrong twice.** The first draft fabricated figures that did not
match its own table. The second hand-counted the table and still over-credited three
criteria, because the table itself was wrong about which axe rules carry WCAG tags. Both
errors survived review. In a document whose purpose is honesty about coverage, that is the
worst possible failure mode, and it has a structural cause: this table and `coverage.ts`
are duplicate sources of the same facts, and a hand-maintained duplicate always drifts.

**Fix: `coverage.ts` is the sole source of truth.** `npm run docs:coverage` regenerates
both the counts block and the §1.3–§1.6 matrix tables between markers. Do not hand-edit
either. The figures below are the generated output as of axe-core 4.13.0, kept inline only
so the document reads standalone.

<!-- GENERATED:counts -->
```
Level A + AA:        55
  Detectable          4    1.4.3 · 2.4.2 · 3.1.1 · 4.1.2
  Probe               2    2.1.2 · 2.4.11        (3rd cut: 2.4.3 -> roadmap)
  Partial            17
  Manual             32
  Any signal         23  (42%)
  Certifiable         0
```
<!-- /GENERATED:counts -->

Corrections from the hand-counted draft (D23/D24), verified against `axe.getRules()` and a
live run rather than assumed:

| SC | Was | Now | Why |
|---|---|---|---|
| 2.4.6 Headings and Labels | Partial | Manual | `empty-heading` and `heading-order` are best-practice-tagged; no WCAG-tagged rule maps here |
| 3.3.8 Accessible Authentication | Partial | Manual | credited an `onpaste` check that is a custom rule we have not written |
| 4.1.3 Status Messages | Partial | Manual | no WCAG-tagged rule in 4.13.0 |

Four further rows kept their status but named the wrong rules: 2.1.1 (`nested-interactive`
is 4.1.2), 2.2.2 (`no-autoplay-audio` is 1.4.2), 2.4.1 (`skip-link` is best-practice-only),
3.3.2 (`label`, `select-name`, `aria-input-field-name` are all 4.1.2; only
`form-field-multiple-labels` remains).

Then the sentence that does the work:

> This tool produces evidence for 23 of the 55 WCAG 2.2 A/AA success criteria and can
> certify none of them. Two of those 23 come from interaction probes a static DOM scanner
> cannot perform. The remaining 32 require a human, and `ratchet manual` will generate you
> a checklist for them.

**Experimental rules.** Tag-based `runOnly` overrides a rule's own `enabled: false`
(D17), so `css-orientation-lock` (1.3.4) and `label-content-name-mismatch` (2.5.3) run
under the default config despite being experimental in axe. `CoverageEntry.experimental`
marks them and the generated table surfaces it. Two of the seventeen Partial rows rest on
rules Deque has not stabilised, and a reader deserves to know which.

## 1.8 Data shape

```ts
interface CoverageEntry {
  criterion: string;
  status: 'detectable' | 'partial' | 'probe' | 'manual';
  axeRules: string[];
  probeIds: string[];
  note: string;                 // why it's limited — the substance
  manualChecks: ManualCheck[];
}

interface ManualCheck {
  id: string;
  prompt: string;               // imperative, testable in under a minute
  method: 'keyboard' | 'screen-reader' | 'visual' | 'zoom' | 'flow';
  appliesWhen?: (page: PageFeatures) => boolean;
}
```

`manualChecks` is what makes the matrix generative rather than decorative: one data source
produces the README table, the report section, and the checklist.

---

# Part 2 — Testing

## 2.1 Fixture design principle

**Author fixtures from the criteria, not from the axe rule list.** If you write pages by
enumerating axe rules, every planted violation is found, and the result proves only that
axe works. Instead: pick a criterion, write several realistic ways real sites fail it,
record which ones the tool catches. The misses populate the matrix, the checklist, and the
README.

## 2.2 Layout

```
test/fixtures/
  pages/
    01-images/        1.1.1 — missing alt, decorative-with-alt, alt="DSC_0421.jpg", CSS bg
    02-structure/     1.3.1 — fake tables, fake headings, unassociated labels
    03-contrast/      1.4.3 — failing text, on gradient, on image, AAA-only
    04-forms/         3.3.2 — unlabelled, placeholder-as-label, orphan label
    05-names/         4.1.2 — icon buttons, custom roles, aria-labelledby to missing id
    06-lang/          3.1.1 / 3.1.2
    07-focus-sticky/  2.4.11 — sticky header obscuring focus, PLUS a scroll-margin
                              variant that must NOT be flagged
    08-focus-trap/    2.1.2 — modal without escape, PLUS a roving-tabindex toolbar
                              that must NOT be flagged
    09-shadow/        open shadow root containing a violation; closed root (probe-blind)
    10-clean/         ZERO violations. The most important page in the suite.
    11-frames/        violations in same-origin iframes
    12-pagination/    "10 11 12 13 14" — the masking-exception case (02 §3.3)
    13-manual-only/   colour-only links, "click here", bad alt, drag-only slider,
                      redundant entry — defects the tool MUST NOT claim to find
    manifest.json
  diff-pairs/         the 20 golden pairs from 02 §9
  reports/            canned Report JSON for pure diff unit tests
```

`manifest.json` records per planted defect: `criterion`, `level`, `description`,
`expectation` (`detected` | `needs-review` | `missed`), `expectedRules`, and for misses a
`rationale`.

## 2.3 Layers

| Layer | Scope |
|---|---|
| Unit | fingerprint, normalisation, URL templating, tag parsing, suppression, classification |
| Golden | the 20 diff pairs |
| Integration | scan → `Finding[]` against manifest, via local fixture server |
| Determinism | same page ×5, fingerprint sets identical |
| Contract | JSON schema shape, `--help`, exit codes |
| Library | imports `src/index.ts` directly — not a shell-out |
| Self-test | scan the generated HTML report, assert zero violations |
| Coverage regression | manifest expectations vs actual (§2.5) |

**No test touches the network.** A suite that depends on a third party's website fails on
someone else's deploy.

## 2.4 The tests that matter

**The clean-page test.** `10-clean/` must produce zero violations, zero probe findings,
zero best-practice findings. Every scanner has false positives; the ones that survive are
the ones with a clean-page regression test. Add to this page every time you fix a false
positive found in the wild.

**The must-not-detect test.** `13-manual-only/` asserts the tool does *not* report
genuinely unautomatable defects as violations. Frame it honestly in a comment: this asserts
a property of *this axe version*, not a correctness invariant. When axe adds a heuristic
that catches one, the test fails — that is a signal to update the matrix, not to delete the
test in a hurry. Write that instruction into the file.

**The scroll-margin test.** `07-focus-sticky/` must contain both a genuinely obscured
control and one that clears the sticky header via `scroll-margin-top`. The second must not
be flagged. This is the probe's highest-risk false positive and it concentrates on
*well-implemented* pages — the worst possible distribution.

**The determinism test.** Five scans of a page containing an animation, a lazy image, and a
`setTimeout`-injected element; fingerprint sets must be identical.

## 2.5 The coverage-regression metric — and what it is not

The suite emits:

```
Planted defects: 42 across 19 criteria
  detected 16 · needs-review 5 · missed 21
  unexpected misses 0 · unexpected detections 0
```

**This is a regression metric, not a catch rate.** The first draft recommended publishing
it as "our measured recall, which conveniently lands near the published 30–40%." That
reasoning is circular: the number is fully determined by how many unautomatable defects you
chose to plant. Plant differently and you get any figure you like. It measures fixture
design, not real-world performance.

Legitimate uses: *did a refactor lose us coverage* (`unexpected misses > 0`), and *did an
over-eager heuristic start claiming coverage it doesn't have* (`unexpected detections > 0`).

For the real-world figure, cite the published 30–40% and attribute it. Do not present a
fixture number as an empirical catch rate. If you want an empirical number, it comes from
the real-site audits: *of N distinct findings I hand-verified, M were true positives* — a
precision figure, which is honestly measurable, rather than a recall figure, which is not.

## 2.6 Not tested — say so in `CONTRIBUTING.md`

Real-world DOM chaos (goldens cover the mutations I thought of; the real-site runs are the
empirical check and are not automated) · cross-browser rendering (Chromium only) · screen
reader behaviour (nothing here tests what is announced) · performance at scale (the fixture
site is small; 5,000-page behaviour is untested and unclaimed) · closed shadow roots.

---

# Part 3 — README skeleton

The README *is* the portfolio piece; the code is evidence for it. Write it last, know its
shape from day one. Target 800–1,200 words plus tables. Front-load the honesty.

**1. Description and caveat in the same paragraph.** Not the caveat at the bottom.

**2. Quickstart** — three copy-pasteable commands that work from a clean machine.

**3. Screenshot** — the report and the job summary. People decide here.

**4. Coverage** — generated counts, collapsed matrix, link to the full table. Footnote the
"86, not 87" point.

**5. What this cannot catch** ⚠️ — the most important section. Required content:

- The statistic, correct direction, attributed.
- Concrete examples that pass automated checks and fail WCAG — these land harder than
  percentages: `alt="DSC_0421.jpg"` passes `image-alt`, fails 1.1.1 · a "Read more" link
  passes `link-name`, fails 2.4.4 · required fields marked only in red pass everything and
  fail 1.4.1 · a visually-reordered flex layout fails 1.3.2 · `aria-live` on a region that
  never updates fails 4.1.3.
- **The state problem.** The tool sees the page as rendered. Modals, dropdowns, validation
  errors, loading states, toasts are never scanned, and in most applications that is where
  the serious defects live.
- Chromium only; no screen reader is involved at any point.
- What "passing" means: no *detected* violations. Not conformance, not a VPAT, not a legal
  defence.

**6. Real-world results** — two sites, dated, with tool + axe versions, **run in `audit`
mode** (say so — a clean 2.4.11 from `ci` mode is an artifact of the network blocklist).
Per site: pages crawled, distinct findings, verified true positives, false positives,
arguable. Then prose naming the false positives and explaining the mechanism:

> `target-size` flagged 14 inline footer icons. Twelve were genuine 20×20 targets. Two fall
> under the inline-content exception, which axe cannot evaluate — a false positive inherent
> to the rule, not the implementation. Documented in config with
> `category: 'false-positive'` rather than suppressed silently.

Frame everything as "the tool flagged," never "site Y violates WCAG."

**7. Diff mode** — explain the identity problem in three sentences; most readers don't know
it exists. Classification table, page-set handling, engine-drift guard and its escape hatch.

**8. GitHub Action** — working YAML, plus links to the two demo PRs. A CI feature nobody
can see running is a claim; a linked PR is evidence.

**9. Baseline workflow** — the four update paths from `01 §11`. This is what determines
whether a team keeps the tool.

**10. Manual mode** — sample output, clearly page-specific rather than generic.

**11. Config** — a suppression with all four required fields; `check-config` failing on
expiry.

**12. Comparison** — name `axe-core` CLI, `pa11y-ci`, Lighthouse CI, IBM Equal Access, axe
DevTools. State honestly that several already do baselines and that the differences here
are interaction probes, identity stability, and a published coverage boundary. Ending with
"if you need commercial support and guided manual testing, buy axe DevTools Pro" costs
nothing and buys a great deal.

**13. Limitations, roadmap, licence** — everything cut from v1, honestly labelled.
axe-core MPL-2.0 attribution; "axe" is Deque's trademark; this project is unaffiliated.

## Tone rules

No "fully WCAG 2.2 compliant," no "ensures accessibility," no green-check imagery. Prefer
*detected* over *found*, *evidence* over *proof*, *flagged* over *violated*. Every number
gets a method — "38% recall" is noise; "38% of planted fixture defects, spanning 19
criteria" is a claim. Never write a percentage you haven't computed or attributed. If a
sentence would make a working auditor wince, cut it.
