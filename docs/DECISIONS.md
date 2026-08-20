# Decisions

Deviations from the design docs, and choices the docs left open. Each entry says
what was decided and why, so a later reader can tell a considered change from a
drift.

---

## 2026-08-20 — Day 1

### D1. Tool name: `a11y-ratchet`

`00 §10` gave `a11y-regress` as a placeholder. Settled on `a11y-ratchet`. Avoids
"axe" (Deque trademark) and implies no certification. Baked into `package.json`
`name` and `bin`, and read at runtime from `src/meta.ts` rather than hardcoded in
help text.

### D2. `baseline` is a sixth command group

`00 §4` and the Day 1 scope list five commands. `01 §11` requires
`baseline update | regenerate | check`, and Day 12 depends on it. Registered now,
stubbed, so `--help` reads like the finished tool. Not a scope increase — the
work is still Day 12.

### D3. `Finding` carries its identity evidence

**Added:** `Finding.identity: FindingIdentity` — normalised identity value,
collision ordinal, context signal (landmark + heading + frame path), DOM depth,
normalised text content.

`02 §6`'s fuzzy pass scores candidates on accessible name, context signal,
normalised text content, url template and DOM depth distance. A baseline is a
`Report` on disk, so anything the matcher needs must be serialised on the
finding. Without this, Day 6 cannot match a head run against a baseline at all —
which is exactly the failure `01 §1` warns about.

`identityTier` stays at the top level as the docs specify; it is not repeated
inside `identity`.

### D4. `Finding.bestPractice: boolean`

`01 §7` wants best-practice rules reported with `criteria: []`; `03 §2.4` wants
the clean page to assert zero best-practice findings. But `Bucket` is
`violation | needs-review` and `02 §8` gates on `new + violation + source=axe`, so
a `region` finding as specified would block a PR as a WCAG violation.

Not modelled as a third `Bucket` value: `bucket` mirrors which axe result array a
finding came from, and a best-practice rule can land in either. The two axes are
orthogonal.

Set from the rule's tags, **not** derived from `criteria.length === 0` — a gap in
the rule map would otherwise relabel a real WCAG failure as "not a WCAG failure".

Gate predicate: `bucket === 'violation' && source === 'axe' && !bestPractice`.

### D5. `RunInfo` records the full rendering context

`01 §5` requires viewport, locale and colour scheme to be configurable and
recorded, but the `Report` shape in `01 §3` carries only `viewport`. Added
`locale`, `timezoneId`, `colorScheme`, `deviceScaleFactor`, `reducedMotion`,
`concurrency`, `settle` and `probesEnabled`.

Diffing a light-mode baseline against a dark-mode head produces phantom contrast
regressions of the same class as engine drift, and `01 §9` says concurrency above
~8 destabilises results. If it can change a finding without the site changing, the
envelope has to record it.

### D6. Types the docs reference but never define

`SuccessCriterion`, `PageResult`, `Summary`, `GroupIndex` and `SuppressionRef`
were used in `01 §3` without definitions. Designed in `src/types.ts`. Notable
choices:

- `PageResult.error` is a typed `PageError` with a `kind`, not a string, so the
  diff can act on `02 §7`'s errored-vs-loaded asymmetry and exit code 3 stays
  distinct from a page-level failure.
- `PageResult.probeBlindRegions` gives `01 §6.1`'s `probe-blind` marking a home.
  It had none in the data model.
- `PageResult.probesRun` — a page with no probe findings because probes were
  disabled is not a page that passed them.
- `GroupIndex` is `Record<groupKey, FindingGroup>`; each group carries the highest
  impact among its members, so grouping never hides a critical.

### D7. `DiffResult` corrections

- `schemaVersion: '1.0'` added. It is a written artefact like `Report`.
- `findings.unknown` is `Array<{ reason; finding }>` rather than `Finding[]`.
  `02 §7` defines three distinct unknown categories and `02 §8` gates
  `unknown-page-added` per `newPagePolicy`; a flat array cannot express that.
- `gate.warnings: string[]` added, so `newPagePolicy: 'warn'` — the default — has
  somewhere to land.

### D8. Suppressed findings: partitioned in the report, pooled in the matcher

`01 §3` has both `Finding.suppressed?` and `Report.suppressed: Finding[]` without
saying whether a suppressed finding appears in `findings` too.

Kept the docs' shape: `findings` is the actionable set, `suppressed` holds the
rest, tagged and retained. **The matcher must pool both when building candidate
sets.** Otherwise adding a suppression between two runs makes the finding leave
`findings` and pass 3 classifies it `fixed` — a false fix, goal 2 in `02 §2`.
Suppression is applied at the gate, never at match time. Recorded as a binding
comment on the `Report` type.

### D9. Types included ahead of their day

`CoverageEntry`, `ManualCheck`, `PageFeatures`, `CoverageCounts` (`03 §1.8`) and
the library option interfaces are in `types.ts` now, though `coverage.ts` is Day 3
and config is Day 8. They are contract, and the point of writing types on day one
is not having to re-plumb later. No logic came with them.

`PageFeatures` and `ManualCheck.appliesWhen` support a feature that was **cut**
(`00 §4`, context-derived manual items). The type is here; the derivation is not,
and the comment says so.

### D10. TypeScript pinned to 5.9.3, not 7.x

TypeScript 7 (the native rewrite) is current, but `typescript-eslint@8` declares
`typescript: '>=4.8.4 <6.1.0'` and tsup 8 is not proven against it. A 15-day
budget should not absorb a toolchain migration. Revisit after v1.

`exactOptionalPropertyTypes` is on alongside `strict`. It is stricter than the
working agreement requires, and it catches the class of bug where an optional
field is explicitly set to `undefined` and silently lost on serialisation — which
matters for a tool whose first invariant is that findings are never dropped.

### D11. Fixture expectations are predictions until Day 2

`test/fixtures/pages/manifest.json` records 25 planted defects across the four
first-pass pages, with an expectation for each. Those expectations were written
from the WCAG criteria and from axe's documented rule behaviour — they have not
been executed against axe yet, because scanning is Day 2.

Day 2's done-when is precisely "scanning a fixture page matches its manifest". If
an expectation is wrong, the fix is to correct the manifest and record why, not to
weaken the assertion.

`manifest.json` records the axe-core version it was written against, and a test
fails if that drifts from the pinned dependency.

### D13. `Report.suppressed` removed — `findings` is the single array (corrects D8)

D8 kept the docs' two-array shape (`01 §3`: `findings` + `suppressed`) and
required the matcher to pool both when building candidate sets, to stop an
added suppression reading as a `fixed` finding.

That safeguard is real but fragile: every future consumer of the shape — the
matcher, the summary builder, the report renderer, any external reader of the
JSON — has to remember to pool both arrays, and forgetting once reproduces
exactly the false-fix bug D8 was written to prevent. Reviewed on Day 1 while
the type is still cheap to change.

`Report.suppressed` is removed. `Report.findings` is now the single complete
array; a suppressed finding stays in place with `suppressed: SuppressionRef`.
There is nothing left to pool, so there is nothing to forget to pool.
`Finding.suppressed` and `Summary.findings.suppressed` are unchanged — the tag
and the count were already inline. `docs/01-ARCHITECTURE.md §3` still shows
the original two-array snippet; per the established pattern (D3–D9), the doc
snippet is left as the historical first draft and this file is the
correction.

### D14. `DiffResult` exit-6 generalised beyond mode mismatch

`01 §5` and the working notes for this build both describe exit code 6 as
covering more than scan mode: a light-mode baseline diffed against a
dark-mode head is the same class of phantom regression as an engine-drift
diff (D5), and `01 §5`'s context settings — viewport, locale, colour scheme —
are exactly the fields D5 added to `RunInfo` because they can change a
finding without the site changing.

`DiffResult.modeMismatch: boolean` is replaced with
`incompatibleRunConfig: RunIncompatibility[]`, where `RunIncompatibility` is
`{ reason: 'mode' | 'viewport' | 'locale' | 'colorScheme'; base: string; head:
string }`. Any entry refuses the diff at exit 6, with no override flag —
unlike `engineDrift`, which has `--allow-engine-drift`. `concurrency` and
`settle` differences deliberately do **not** appear here: `01 §9` treats those
as a stability concern, not a correctness one, so they land in
`gate.warnings` instead. The classification logic itself is Day 4–6 work;
this is the type-contract half only.

### D15. Fixture manifest: `missReason` on every miss

`03-EVIDENCE.md` documents misses with prose `rationale` only. That collapses
two different claims into one field: "no rule, existing or hypothetical,
could evaluate this without understanding page content" (e.g.
`images-filename-alt`) versus "a rule exists and would catch this, but this
tool doesn't enable it by default" (e.g. `contrast-aaa-only`, gated on the
A/AA scope decision in `01 §7`; `structure-skipped-heading-level`, gated on
best-practice rules being off by default). Conflating them risks the
coverage matrix eventually counting a deliberate scope exclusion as a
detection gap — the same failure class `01 §7`'s `bestPractice` flag exists
to prevent for rule output, just at the fixture-authoring layer instead.

Added `missReason: 'unautomatable' | 'out-of-scope'` to every `"expectation":
"missed"` entry in `test/fixtures/pages/manifest.json` (six unautomatable,
two out-of-scope), and a `manifest.test.ts` assertion that it is present on
every miss and absent everywhere else. Not added to `types.ts` — the manifest
is test fixture data, not part of the shipped type contract.

### D16. LICENSE copyright holder

Set to `Anudeep`, inferred from the git author email. Correct it before the repo
is published.

---

## 2026-08-20 — Day 2

### D17. `wcag22aa` / `target-size` verified against axe-core 4.13.0

`03-EVIDENCE.md`'s claim — `target-size` exists, is off by default, and needs
the `wcag22aa` tag — is correct for 4.13.0, checked directly against
`axe.getRules()` before writing `scan/axe.ts`, not assumed:
`{ ruleId: 'target-size', tags: ['cat.sensory-and-visual-cues', 'wcag22aa',
'wcag258'], enabled: false }`.

One thing the matrix doesn't say explicitly, worth recording because it
shapes `axe.ts`'s config: `runOnly` tag selection overrides a rule's own
`enabled: false`, for every rule, not just `target-size`. Running with
`runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa',
'wcag22aa'] }` also sweeps in several experimental/disabled-by-default rules
that share those tags — `css-orientation-lock`, `label-content-name-mismatch`
— which is exactly what the matrix's 1.3.4 and 2.5.3 rows already assume are
active. Confirmed empirically against the fixture pages, not inferred from
the rule list alone.

### D18. Two manifest expectations corrected against real 4.13.0 behaviour

Running the intended axe config against the Day 1 fixtures surfaced two
mismatches between the manifest and actual axe-core 4.13.0 output. Per this
project's own rule (D11, and the manifest's `$honesty` note): the fix is to
correct the manifest and record why, not weaken the scan or the assertion.

- `structure-th-without-data-cells` (02-structure): expected `"detected"`
  (a `violations` result). Axe puts it in `incomplete` instead — a header
  describing zero data cells because every row is one cell short is
  apparently ambiguous enough that the check declines to assert rather than
  infer. Corrected to `"needs-review"`. The rule still fires; it lands in the
  other bucket.
- `01-images` produces an unpredicted `color-contrast` incomplete result on
  `#star-rating`. Isolated by testing four minimal variants (plain
  div/`role="img"` × plain text/star glyphs): the star glyphs (`★★★★☆`) are
  the cause, not `role="img"` — axe can't resolve a confident contrast ratio
  for these particular Unicode symbol glyphs, regardless of role. Added as
  `images-star-rating-contrast-incomplete` rather than engineered away:
  rating widgets built from character glyphs are a realistic pattern, and
  this is genuine, reproducible tool behaviour worth a regression test for.
  `01-images`'s `criteria` list gained `1.4.3` accordingly.

### D19. Identity tier resolution moved into `normalise.ts`, ahead of Day 4

The Day 1 plan puts "tiered identity" in `identity/fingerprint.ts`, Day 4.
Populating `Finding.identity` and `identityTier` fully — required to produce
a valid `Finding` at all — meant resolving which tier wins now, in
`scan/normalise.ts`, rather than waiting. `fingerprint`/`groupKey` (the hash,
generated-id filtering, collision-ordinal assignment) stay Day 4, unhashed
placeholders (`unset:day-4-fingerprint` / `unset:day-4-groupkey`).

Tiers 1-3 (authored id, test hook, accessible name) are resolved from real
per-node data captured in the browser alongside the axe run (`node.element`
via `elementRef: true`, which cannot survive the trip back to Node — see the
comment in `axe.ts`). Tiers 4-5 (semantic path, structural path) are
simplified to a one- or two-segment path rather than the full ancestor chain
`02 §3.1` specifies, and the generated-id filter (`02 §3.2`) isn't applied.
None of the Day 1 fixtures exercise tiers 4-5 or the filter — every planted
defect has an authored id, so tier 1 always wins in this suite. Day 4's own
done-when ("unit tests on each tier pass") is where this gets its own
fixtures and gets hardened; flagged here so it isn't mistaken for finished.

`Finding.criteria` and `Finding.remediation` are also placeholders
(`criteria: []`, a literal `TODO(Day 3)` string) — `wcag/criteria.ts` and
`wcag/remediation.ts` don't exist yet. Every `Summary` tally that depends on
`criteria` (`byCriterion`, `byLevel`) is correctly zero, not fabricated.

### D20. `axe.commons.text.accessibleText` needs a try/catch

Found by the integration test, not by reasoning about it in advance: calling
`axe.commons.text.accessibleText(element)` from `scan/axe.ts` threw
(`Cannot read properties of null (reading 'props')`, inside axe-core's
internal `prepareContext`) for the `<area>` element inside `01-images`'
image map, when called this way — outside axe's own rule-evaluation
lifecycle — against axe-core 4.13.0. One element's accessible-name lookup
must never fail the whole page scan, so it's wrapped; a failure now yields
`accessibleName: undefined` for that node instead of a `navigation-failed`
`PageResult.error`. Worth re-checking whether this is fixed upstream on the
next axe-core bump.

### D21. `src/cli/commands/scan.ts` still only passes `seed.url` through

The CLI defines every `scan` flag (`--mode`, `--viewport`, `--concurrency`,
etc.) with the right defaults, but the action handler doesn't thread them
into `ScanOptions` yet — only the URL argument. Wiring the rest, plus
`--out`/`--html` output, reads more naturally alongside report rendering
(Day 3/10/11) than as a Day 2 concern, so it's left as-is rather than done
partially. The library itself (`scan()`) takes the full `ScanOptions` and is
exercised directly by the integration test.

---

## 2026-08-20 — Day 3

### D22. `wcag/criteria.ts` covers all 86 SCs; `since` reconstructed, not transcribed

`03-EVIDENCE.md` Part 1 enumerates the 55 A/AA criteria row by row but never
lists the 31 AAA criteria, and states the `since` split only in prose ("six
of the nine new criteria are A or AA... the other three are AAA"). Both were
needed regardless — `criteria.ts` has to resolve an AAA-tagged rule
(`color-contrast-enhanced` → 1.4.6) to something real, or `wcag/ruleMap.ts`
drops it.

The 31 AAA rows and the full 2.0/2.1/2.2 `since` split for all 86 come from
general WCAG 2.1/2.2 knowledge, cross-checked against the doc's own
arithmetic (31+24+31=86; 61 since-2.0 + 17 since-2.1 + 9 since-2.2 − 1
removed = 86) rather than copied from a table in this repo. `test/wcag/
criteria.test.ts` asserts both splits so a transcription slip fails loudly.
Worth an independent spot-check against the W3C Recommendation before
publishing — flagged rather than silently trusted.

### D23. Five rows in `03-EVIDENCE.md` Part 1 don't match axe-core 4.13.0

Building `wcag/coverage.ts` meant checking every row's named rules against
`axe.getRules()` and a live run — the doc's own epigraph ("verify every row
... rule IDs drift between minor versions"). Five did not hold up. Two
mechanics explain most of them:

- Tag-based `runOnly` overrides a rule's own `enabled: false` (D17), but a
  `deprecated`-tagged rule is excluded regardless — verified empirically (a
  two-id-collision fixture did not fire `duplicate-id` under the tag config
  that fires `target-size`). `audio-caption`, `aria-roledescription`,
  `duplicate-id`, `duplicate-id-active` never run under this config.
- A rule's *name* isn't its WCAG tag. Several rules the doc credited to one
  SC are tagged for a different one:
  - **2.1.1** doc credits `nested-interactive`; it's tagged 4.1.2, not
    wcag211. (2.1.1 keeps real coverage via the other two rules.)
  - **2.2.2** doc credits `no-autoplay-audio`; it's tagged 1.4.2 only.
    (2.2.2 keeps `blink`/`marquee`.)
  - **2.4.1** doc credits `skip-link`; it's best-practice-only, no WCAG tag
    at all. (2.4.1 keeps `bypass`.)
  - **3.3.2** doc credits `label`, `select-name`, `aria-input-field-name`;
    all three are tagged 4.1.2 only ("has a name" vs 3.3.2's "has
    instructions" are different questions axe answers differently). The
    only rule actually tagged 3.3.2 is `form-field-multiple-labels` — a much
    narrower check. Status stays Partial on that rule alone, but the
    substantive coverage claim in the doc was materially overstated.
  - **`images-area-no-alt`** in the Day 1 fixture manifest expected 1.1.1;
    `area-alt` is tagged 2.4.4 and 4.1.2, not 1.1.1 — an `<area>` is
    link-like (it has an `href`), so its `alt` is its accessible name, same
    category as `link-name`. Corrected in the manifest with a rationale.

Two rows lost their *only* claimed signal and changed status from Partial to
Manual, not just their rule list:

- **2.4.6** Headings and Labels: `empty-heading` and `heading-order` are
  BOTH best-practice-only in 4.13.0 — neither carries any WCAG tag, so
  neither ever produces evidence for this SC, best-practice enabled or not.
- **3.3.8** Accessible Authentication (Minimum): no axe-core rule exists.
  The doc described a hypothetical custom rule (`onpaste` blocking on a
  password field) as if it were shipped coverage; it isn't in this codebase.
- **4.1.3** Status Messages: no axe-core 4.13.0 rule carries a `wcag413`
  tag, and no rule description mentions live regions or announcement,
  despite the common assumption that ARIA live-region presence implies
  coverage.

`wcag/coverage.ts`'s `axeRules` lists and `status` values reflect verified
reality, not the doc text. `03-EVIDENCE.md` should be corrected to match —
not done here, since Part 1's prose (the "26 of 55" sentence, `03 §1.7`'s
example figures) would need rewriting alongside it, and that's a doc edit,
not a Day 3 code task.

### D24. Check 2: generated counts vs `03-EVIDENCE.md §1.7`

`npm run docs:coverage` on the corrected data (`test/wcag/coverage.test.ts`
asserts the same numbers so this can't silently drift):

```
Level A + AA:        55
  Detectable   4    1.4.3 · 2.4.2 · 3.1.1 · 4.1.2
  Probe        2    2.1.2 · 2.4.11
  Partial     17          (doc states 20)
  Manual      32          (doc states 29)
  Any signal  23  (42%)   (doc states 26, 47%)
  Certifiable  0
```

Detectable and Probe match the doc exactly — both rely on rules the doc
described correctly. Partial/Manual/Any signal disagree by exactly 3, which
is exactly the three rows D23 moved from Partial to Manual (2.4.6, 3.3.8,
4.1.3). Per this project's own rule (`03 §1.7`: never hardcode a count; D11:
correct the source and record why, not weaken the assertion) — the code is
right and the doc's example figures are stale. `03-EVIDENCE.md §1.7`'s
worked numbers and the "26 of 55... 47%" sentence need updating before the
README is written (Day 15), sourced from `npm run docs:coverage`, not
hand-edited to a new hardcoded figure.

### D25. `report/summary.ts` has no grouped view yet

`Report.groups` is still the Day 4/6 placeholder `{}` (`scan/run.ts`), so
the terminal summary renders a flat, sorted list (bucket, then impact, then
rule id) rather than `01 §8`'s grouped view. `--ungrouped`'s eventual
renderer is the same function — once `groups` is real, the flat list still
needs to exist as a fallback, so nothing here is thrown away when Day 6/10
lands the grouped view.

### D26. `~40` remediation notes became 55

Every rule `wcag/coverage.ts` actually references now has an authored note,
rather than picking ~40 and leaving some matrix rows pointing at the generic
fallback. Slightly over the plan's approximate figure; the alternative was
an arbitrary cut that would have left, e.g., `frame-title-unique` or
`aria-valid-attr-value` — both genuinely common — without one.

---

## 2026-08-20 — Day 4

### D27. Split: DOM-dependent candidate gathering in `axe.ts`, pure logic in `identity/fingerprint.ts`

`page.evaluate` can't ship a live `Element` back to Node, so any DOM-walking
(tier 4/5 ancestor paths, shadow-crossing, heading search) has to happen in
`scan/axe.ts`'s in-page code, same constraint as Day 2 (D19's `RawFinding`).
`identity/fingerprint.ts` never touches a DOM: `scan/axe.ts` now gathers
`semanticPath` and `structuralPath` as full, already-built path strings
(previously Day 2's one/two-segment shortcut), and
`identity/fingerprint.ts`'s `resolveIdentityTier` just picks a winner among
already-known candidate values. This is also why generated-id filtering
lives in `identity/fingerprint.ts` and not `axe.ts`: `authoredId` arrives
raw and unfiltered, so the filter itself is pure and unit-testable without a
browser at all - the entire tier/normalisation/hash/collision surface has
zero Playwright dependency now, which is what let Day 4 be "unit tests
only" per the plan.

### D28. "Nearest stable ancestor" (Tier 5) interpreted, not found in the docs

`02 §3.1` names tier 5 "tag + same-tag sibling index from nearest stable
ancestor" without defining "stable". Interpreted as: the nearest ancestor
with its own `id`, or a landmark role, or `<body>` as the final fallback -
something that gives the path a fixed reference point even when the target
element has none of its own. `structuralPath` excludes the anchor's own
segment (it's a reference point, not part of the element's structural
description), mirroring how `semanticPath` includes the landmark's role
specifically because that DOES identify which landmark this is.

Flagged rather than assumed correct: no current fixture exercises tier 5 (D30
below), so this definition is untested against a real page shape. Worth a
second look once Day 9's shadow/frame fixtures or a real-site run produce an
actual tier-5 finding.

### D29. Shadow DOM: ancestor walks cross the boundary, heading search doesn't

`elementParent()` in `scan/axe.ts` crosses a shadow root's host boundary
(`element.getRootNode() instanceof ShadowRoot ? root.host : null`) - used by
every ancestor walk (landmark search, tier 4/5 path building, DOM depth), so
none of them silently stop dead at a component boundary the way plain
`.parentElement` would.

`nearestPrecedingHeadingText` is scoped differently: it searches only within
the element's own shadow root (or the top document, outside one), never
crossing OUT into the host page. A heading outside a component's shadow
boundary isn't really "context" for content encapsulated inside it - a
defensible scope decision, not a proven-correct one. No current fixture has
a shadow root (09-shadow is a later fixture per `03-EVIDENCE.md §2.2`), so
none of this shadow-DOM handling has been exercised against a real page -
implemented against the spec's explicit instruction ("identity path crosses
host boundaries") rather than against a test that could fail if it were
wrong. Worth writing a targeted `page.setContent()` unit test with an open
shadow root before Day 9 needs this to actually be right, not just
plausible.

SVG's `.className` (an `SVGAnimatedString`, not a string) never comes up:
every attribute read in `axe.ts` uses `getAttribute()`, which behaves
identically across HTML and SVG elements. Nothing to fix, but worth stating
explicitly since it was called out as a landmine to check for.

### D30. Check 1: tier distribution across the fixture suite

19 findings, scanned across all four Day 1 fixture pages:

```
Tier 1 (authored id):     18   (95%)
Tier 2 (test hook):        0
Tier 3 (accessible name):  0
Tier 4 (semantic path):    1   (5%)
Tier 5 (structural path):  0
```

Tier 1 dominates, as Day 2 already flagged: every planted defect has an id
(`manifest.test.ts` requires `selector.startsWith('#')`). **This fixture
suite cannot demonstrate tier distribution under real-world conditions** -
it measures fixture-authoring convention, not identity robustness, the same
caveat `03-EVIDENCE.md §2.5` already makes about the coverage-regression
metric. Tiers 2, 3 and 5 are completely unexercised by anything checked in.
Real signal on this will come from the Day 14 real-site audit, or purpose-
built tier-specific fixtures if Day 5's goldens want to force the question
before then.

The one Tier 4 case is a genuine artifact, not synthetic: `03-contrast`'s
translucent-scrim defect is `<div id="contrast-scrim"><span
class="scrim">...</span></div>` — axe's `color-contrast` check targets the
inner `<span>` (no id), not the `id`-bearing wrapper the manifest names.
Correctly falls through to tier 4 (`main > ... > span`, semantic path)
rather than inventing an id that isn't there. A small, real illustration of
exactly why the tier system exists: even a hand-authored fixture produces an
element with no helpful id once you look at what the rule actually targets.

### D31. Check 2: groupKey verified to collapse a repeated element across pages

The Day 1 fixtures have no shared defect across pages to test this against —
checked directly against the fixture HTML before assuming anything: each
page's header/nav is either unique (`01-images`) or clean
(`02-structure`/`03-contrast`/`10-clean` share an unbroken skip-link nav).
Reported rather than guessed.

Built a small synthetic two-page test instead of leaving the question
unanswered (`test/identity/cross-page-group.test.ts`): two pages, an
identical broken nav link (`link-name`) on both, everything else different
(heading, body content, path). Result: same `groupKey` on both pages,
different `fingerprint` (headingContext and urlTemplate both feed the
fingerprint, neither feeds groupKey) — confirmed empirically, not just by
construction, since the test asserts headingContext and urlTemplate
actually differ between the two runs. This is a real, if minimal, positive
answer to `01 §8`'s dependency and the Day 14 audit estimate — but it is one
synthetic pair, not the real-site diversity that estimate assumes. Verify
again against an actual multi-page site before trusting the 20-40 distinct
findings assumption.

### D32. URL templating: a few judgment calls `02 §5` doesn't fully specify

- **Digit-vs-hash ambiguity.** A path segment that's all digits (e.g.
  `12345678`) is ambiguous between `:id` and `:hash`. Resolved by checking
  digits-only first — `:hash` only ever fires on a hex string containing at
  least one letter, since a pure-digit string is already claimed. Matches
  the doc's own examples (`1234` → `:id`, `9f8e7d6c5b` → `:hash`, and the
  second contains letters the first doesn't).
- **Date triplet vs single-segment templating.** An implausible date (month
  99) doesn't get the `:year/:month/:day` treatment, but each segment still
  independently templates as `:id` (all-digit) — `/2026/99/99/post` →
  `/:id/:id/:id/post`, not `/:year/99/99/post`. Not explicitly specified;
  the alternative (leaving implausible-but-numeric segments untemplated)
  seemed more likely to cause an unwanted difference between visually
  similar routes.
- **`hashRouting` semantics.** `01 §5`'s single line ("SPAs with hash
  routing need `hashRouting: true` or every route collapses to one") implies
  more than "don't strip the fragment" - the fragment IS the route for a
  hash-routed SPA. Implemented as: when `hashRouting` is set, the fragment's
  path portion is templated the same way as a normal path and appended
  (`/app/#/product/1234` → `/app/#/product/:id`); when unset, the fragment
  is stripped entirely, matching the doc's default. Untested against a real
  SPA fixture - no such fixture exists yet.

---

## 2026-08-20 — Day 5

### D33. Two real bugs found by the golden pairs, before touching `fingerprint.ts` further

Written and run as failing tests first, per the day's instruction. 17/20 passed
immediately; three didn't, and two of the three were genuine bugs rather
than test-authoring mistakes:

**`axe.commons.text.accessibleText` was silently broken since Day 2, for
almost every element.** `safeAccessibleText`'s try/catch (added Day 2 for
one `<area>` case) was masking a much bigger problem: `accessibleText`
depends on axe's internal tree cache (`axe._tree`), and `axe.run()` tears
that cache down internally before its own promise resolves. Calling
`accessibleText` afterward — which is what `buildRawFinding` always does —
threw for a plain `<button>` and a plain `<a>` with ordinary text content,
not just the `<area>` edge case. The catch swallowed it every time,
silently returning `accessibleName: undefined`. **This means Tier 3
(accessible name) has been effectively unreachable since it was written on
Day 4** — the Day 4 tier-distribution report (D30: 18 Tier 1, 0 Tier 2, 0
Tier 3, 1 Tier 4, 0 Tier 5) undercounted Tier 3 for this reason, not only
because the fixtures mostly have ids. Fixed: `axe.setup(document)` before
the per-node identity loop rebuilds the cache; `axe.teardown()` after
restores the page to how `axe.run()` would have left it.
`scan/axe.ts` now depends on `axe.setup`/`axe.teardown`, both public
axe-core API, not internals.

**Digit masking (`§3.3`) only masked runs of 2+ digits, per the doc's
literal bullet text.** Golden case 5 ("3 results" → "17 results" must be
`persisting`) exposed that a single-digit count was left unmasked while a
two-digit one wasn't, so the two sides normalised differently and the
fingerprints diverged. Corrected to mask every embedded digit run
regardless of length — matching the doc's own worked example ("page # of
#", which masks both instances) over the isolated ">= 2" bullet, which
this case makes clear can't be literally correct. The whole-string
exception (case 20, pagination) is unaffected — it never depended on the
run-length threshold, only on the entire-string check.

Case 11 (element moves into an open shadow root) found a third bug, in the
shadow-DOM handling from Day 4 specifically — see D29's follow-up below.

### D34. `nearestPrecedingHeadingText`'s shadow scoping was wrong (D29 revisited)

D29 (Day 4) scoped heading search to the element's own shadow root,
reasoning that a heading outside a component's boundary isn't "context" for
content inside it - flagged at the time as "a defensible scope decision,
not a proven-correct one," since no fixture exercised it. Golden case 11
(persisting across a move into an open shadow root) is exactly that
fixture, and it failed: moving an element with no heading of its own into
an empty shadow root flipped `headingContext` from a real value to `'none'`
even though nothing about the element's position in the page had actually
changed from a reader's point of view.

Corrected: `nearestPrecedingHeadingText` now searches the element's own
scope first, and if nothing precedes it there, escalates to the shadow
HOST's position in the enclosing scope, recursing outward through nested
shadow roots. `compareDocumentPosition` doesn't work across a shadow
boundary, so each scope is searched independently rather than as one
flattened tree - the escalation step is what stitches them together.

### D35. Golden case 7 cannot be satisfied at the fingerprint layer - a real limitation, documented rather than forced

`div[role="button"]` and a native `<button>` with the same missing-name
defect resolve to two DIFFERENT axe-core 4.13.0 rules:
`aria-command-name` for the ARIA-role version, `button-name` for the
native one. `ruleId` is a fingerprint input by design (`§3.5`) — correctly,
since a different rule firing on the same element usually IS a different
defect. That means case 7, taken literally ("same defect" implies
`persisting`), cannot be made to produce equal fingerprints without
weakening a guarantee that matters far more (two distinct rules on one
element must never collapse to one identity).

Not treated as a bug to route around. The test now asserts the real,
verified behaviour (different `ruleId`, different `fingerprint`, but the
same `identity.value` since the element's id didn't change) and documents
why: fixing this would require Day 6's matcher to treat certain rule-id
PAIRS as equivalent, which `§6`'s current design doesn't support (fuzzy
candidates are restricted to matching `ruleId` and `source`). Worth raising
before Day 6's matcher design is finalised, not silently absorbed.

### D36. Golden pairs written as inline HTML, not `test/fixtures/diff-pairs/`

`03-EVIDENCE.md §2.2` documents `diff-pairs/` as a real directory of before/
after files. Used inline template-literal HTML in one test file instead —
40 small files for content this size would be pure authoring overhead
(every case is 5-15 lines) without the review benefit that payoff assumes
for the larger fixture pages. Each case's HTML sits directly next to its
expectations and rationale, which reads more like the "table-driven"
framing `§9` asks for than a directory of same-named `before.html`/
`after.html` pairs would. Flagged as a deviation from the documented
layout, per the working agreement, rather than assumed harmless.

### D37. Case 20 revealed the `<a>`/`<button>` accessibleText bug empirically

Worth recording separately from D33's general fix: case 20 (pagination) was
the case that actually surfaced the accessibleText bug during test-writing,
before the cause was understood - every one of the five links resolved to
Tier 4 (`"navigation > link"`) instead of Tier 3 (`"10"`, `"11"`, …),
which was the first concrete symptom investigated. Recorded here because
it's a second, independent confirmation (alongside case 5) that Tier 3 was
dead, from a completely different code path (a link's computed name vs a
button's) - not a one-off.

### D38. Tier distribution is a standing field, not a one-off measurement

`Summary.findings.byTier: Record<IdentityTier, number>` added, computed in
`scan/run.ts`'s `buildSummary` alongside the existing `byRule`/`byImpact`/
etc tallies, and rendered as a line in `report/summary.ts`'s header on every
run (`identity tiers (5→1): …`). A run landing mostly at tiers 4-5 is
exactly the kind of thing that should be visible by default, not something
that requires remembering to write an investigation script - which is
precisely what happened twice this session (D30's fixture check, and the
real-site smoke below) before this existed. `Report.schemaVersion` bumped
`'1.0'` → `'1.1'` for the added field, per this file's own rule for schema
changes (`src/types.ts`'s header comment). `DiffResult.schemaVersion` is
unaffected — its shape didn't change.

### D39. Fixture-suite tier distribution, rechecked post-accessibleText-fix

D30 (Day 4) reported 18/0/0/1/0 across tiers 1-5, using the broken
`accessibleText`. Rechecked after D33's fix and the 09-shadow addition (one
more finding than D30 had): **18/0/1/1/0** — one finding moved from Tier 4
to Tier 3. The fixture suite still overwhelmingly measures Tier 1, for the
same reason D30 gave: every planted defect has an id. D30's caveat stands —
this suite cannot demonstrate tier distribution under real conditions; the
real-site smoke below is what actually does.

### D40. Real-site smoke — methodology, and a site swapped mid-session

`00 §9`'s High/Critical risk mitigation, moved up from Day 14 per today's
instruction. `robots.txt` checked before scanning either site (`curl`, by
hand, before writing a line of scan code for either).

First attempt: `gov.uk`, 10 `/browse/*` category pages, `--mode=audit`,
concurrency 3, 250ms delay between requests. **Zero findings, on every
page.** Plausible on its own merits — GOV.UK's design system is a widely-
cited accessibility exemplar — but useless for an identity-ROBUSTNESS probe
specifically: with no findings, there's no identity to measure. Swapped to
`en.wikipedia.org` (also robots.txt-checked, general crawling of article
pages is allowed), 10 well-known articles, same mode/concurrency/delay.
4,218 findings across the 10 pages — a real, messy, high-volume result to
measure tier distribution and grouping against. `10-page cap, concurrency
3, 250ms delay` matches `01 §9`'s crawl-politeness numbers even though
Day 7's crawler doesn't exist yet — these 10 `scan()` calls were run by
hand, one URL each, batched three at a time with the same delay a real
crawler would use, not fired simultaneously.

No verification of findings and no manual review were performed, per this
task's own instruction — this is an identity-robustness probe, not an
audit. The 15-day plan's real accuracy audit is Day 14.

### D41. Real-site smoke — results (Wikipedia, 10 pages, audit mode)

```
Findings: 4,218 across 10 pages

Tier distribution (before the MediaWiki id-pattern fix below):
  Tier 1: 3,529 (81%)   Tier 2: 0   Tier 3: 788 (18%)   Tier 4: 31 (1%)   Tier 5: 0

Tier distribution (after):
  Tier 1: 114 (3%)   Tier 2: 0   Tier 3: 3,759 (89%)   Tier 4: 345 (8%)   Tier 5: 0
```

**A real, previously-uncaught gap in the generated-id filter.** MediaWiki
(the software running Wikipedia, and a large share of wiki-style sites
generally, not just this one) assigns ids to interactive chrome elements in
a short base64-ish counter scheme — `mwAQ`, `mwBg`, `mwCA`, etc. None of
the 8 built-in `GENERATED_ID_PATTERNS` matched it. A site-wide id-hygiene
pass (a separate, ad-hoc Playwright script — `scan()`'s public API doesn't
expose which candidate ids the filter rejected, only the winning tier) found
41,179 elements with an id across the 10 pages; only 1% would have been
rejected under the original 8 patterns, vs **78% once the MediaWiki pattern
was added** (`/^mw[A-Za-z0-9]{2,6}$/`, verified against real examples before
being written, with `mwSection`-length ids checked as a true negative).
Added to the built-in list, not left for `identity.ignoredIdPatterns`
config extensibility (Day 8) to cover alone — MediaWiki is common enough to
warrant the same built-in treatment as React/Radix/Ember/Angular already
get, and this is exactly the "you will not guess every framework" case
`02 §3.2` names as the reason the config escape hatch exists at all.

**What this means for tier distribution, reported plainly per the day's
instruction: real-site findings do NOT land mostly at tiers 4-5.** After the
fix, they land overwhelmingly at Tier 3 (accessible name, 89%) once
Tier 1's churny ids are correctly filtered out — Tier 4 (semantic path)
picks up a further 8%, and **Tier 5 (structural path, the weakest and least
tested tier) never fired once, across 4,218 real findings on a real site.**
This is good news for Day 6's matcher design specifically: fuzzy-match
weighting that leans on accessible-name equality (`§6`'s 0.35 weight, the
single highest of the five signals) is well-matched to what real identity
resolution actually produces, at least for this site. It is one site,
though — `en.wikipedia.org` uses MediaWiki's own template system, which is
unusually consistent for a "real" site; a modern JS-framework-heavy site
(React/Vue SPA) was not tried and would be a natural next data point before
leaning too hard on this result.

**groupKey collapse, confirmed on a real site, not just the D31 synthetic
pair.** 103 groups span more than one of the 10 pages — the largest,
`color-contrast` in the `main` landmark, spans 9 of 10. This is the same
site-wide-nav-defect collapse `01 §8` and the Day 14 audit estimate depend
on, now observed on real markup rather than only demonstrated by
construction.

---

## 2026-08-20 — Day 6

### D42. `02-IDENTITY-AND-DIFF.md` synced to D33/D35 - the doc, not just DECISIONS.md

`§3.3`'s digit-masking rule and `§9` case 7 are corrected in the design doc
itself now, not only recorded here: masking is "every embedded digit run,"
not "length >= 2," and case 7 moved from the `persisting` list to the
`moved` list, with a note explaining why it can't be satisfied at the
identity layer at all (`DECISIONS.md` D35) and how `ruleEquivalence`
(below) resolves it at the matcher layer instead.

### D43. Collision-ordinal statistics, before writing the matcher (per today's instruction)

Rerun against the same 10 Wikipedia pages as Day 5, this time counting how
many findings shared a base fingerprint (pre-ordinal-suffix) with at least
one other finding on the same page:

```
Total findings: 4,218
Required collision-ordinal disambiguation: 1,730 (41%)
Largest collision group: 194  (color-contrast, Tier 3, "archived" -
                                a citation link repeated across a huge
                                reference section on /wiki/Wikipedia)
```

**41% is common, not rare — ordinal drift is the dominant churn risk the
matcher has to handle, exactly as anticipated.** A group of 194 near-
identical findings (same rule, same tier, same accessible-name value
"archived", same landmark, same page) means pass 1's exact match — which
depends on `base#ordinal` matching exactly, i.e. the group's SIZE and
ORDER staying identical between runs — breaks for every member from the
first insertion/removal point onward: one citation added mid-list on a
real, actively-edited Wikipedia page shifts every subsequent ordinal by
one, turning up to 193 genuinely-unchanged findings into spurious
new+fixed pairs under exact matching alone.

This also means pass 2 (fuzzy) can't fully rescue a group this uniform:
every member scores identically on accessible name, context, and usually
text content too — DOM depth distance is the only signal with any spread,
and it's not enough to recover a specific instance-to-instance pairing.
`match.ts` (below) accepts this rather than fighting it: greedy assignment
within a tied-score family still produces SOME valid bijection between old
and new members, which is what matters for avoiding false regressions
(case 10's guarantee) even though it can't promise a particular "archived"
link tracks the same specific citation across runs. Precise per-instance
tracking within a large near-duplicate family is not a goal this design
can meet, and isn't pretended to be.

### D44. Second smoke: react.dev (JS-framework SPA), before tuning the threshold

`robots.txt` fully open. 10 real pages (`/`, `/learn`, `/reference/react`,
`/reference/react-dom`, and six more `/learn/*` and `/community` pages).

```
Findings: 381 across 10 pages

Tier distribution:
  Tier 1: 0 (0%)   Tier 2: 0   Tier 3: 368 (97%)   Tier 4: 13 (3%)   Tier 5: 0

Collision-ordinal disambiguation: 50/381 (13%). Largest group: 6.

Site-wide id hygiene: 177/396 ids (45%) would be rejected - mostly React
useId (":R1sq8q6:", already covered) and SVG export tool ids
("clip0_10_21081", "paint0_linear_627_396207" - both caught by the
existing long-numeric-run pattern; no new gap found here, unlike
Wikipedia's MediaWiki surprise).

groupKey collapse: 34 groups span more than one page; the top 3 (a shared
nav search widget) span all 10.
```

**Tier 1 is 0% here** — every element carrying an axe finding on react.dev
either has no id or a React-generated one; Tier 3 (accessible name) picks
up 97%. Combined with Wikipedia's 89%, **Tier 3 dominance holds across two
structurally very different real sites** (an encyclopedia's MediaWiki
templates vs a Next.js/React documentation site) — this is the strongest
evidence yet that Day 6's fuzzy-match weighting (accessible name at 0.35,
the highest of the five signals) is aimed at the right target. Tier 5 still
never fired, across 4,599 combined real findings on two sites.

**Collision rate varies a lot by site shape, and that's the point of a
second smoke, not a contradiction of the first.** 13% here vs 41% on
Wikipedia, largest group 6 vs 194. Wikipedia's citation-heavy reference
sections are a genuine stress case for ordinal-based identity, not
representative of "real sites" generally — react.dev's curated
documentation pages barely exercise collision handling at all. The
threshold and matcher below are tuned against both, not calibrated to
whichever one happened to run first.

### D45. The matcher: threshold kept at the doc's 0.65, not re-tuned numerically

`diff/match.ts` implements `§6` exactly as specified — pass 1 exact by full
(suffixed) fingerprint, pass 2 fuzzy restricted to candidates sharing
`source` and an equivalent `ruleId` (`wcag/ruleMap.ts`'s `ruleEquivalence`,
D42), greedy assignment by descending score, `DEFAULT_MATCH_THRESHOLD =
0.65`. "Tuned against the goldens and both smokes" turned out to mean
*validated*, not *numerically adjusted*: all 21 golden-pair tests (20 cases
+ 18b) pass at the doc's own 0.65 threshold, and neither real-site smoke
surfaced a false match or a false miss that pointed at a specific different
number. Changing the threshold without a concrete failure driving the
change would be tuning against noise, not evidence — so it stays at the
documented value, and the two limitations below (D48, D49) are the honest
finding instead of a threshold tweak that wouldn't actually fix them (see
each: neither is fixable by moving 0.65, since one is fully accounted for
by construction and the other's ceiling is ~0.20, nowhere near any
threshold below 0.65 that would still be safe against unrelated matches).

`classify.ts` compares the fingerprint WITHOUT its collision-ordinal suffix
to separate a real identity change from mere renumbering (D43's 41%/194
finding) — applies identically to a pass-1 or pass-2 match, since a pass-1
match's suffixed fingerprints are equal by definition, so its unsuffixed
ones trivially are too.

### D46. Case 8 (page URL change) is `persisting` at the identity layer only — page partitioning doesn't recognise it

`§7` partitions pages by exact URL, with no mention of `urlTemplate`-based
matching. Running case 8 through the full `diff()` pipeline (rather than
just checking fingerprints, as the Day 5 version of this test did) shows
what that means concretely: `/product/1` → `/product/2` produces
`unknown-page-removed` + `unknown-page-added`, not `persisting` — the two
URLs are correctly treated as two different pages, exactly as a real crawl
of a real site would report them if a product's URL changed between runs.

This is not a bug. `urlTemplate` exists as a *fingerprint input*, for
within-page identity — it was never specified as a page-matching key, and
guessing that two different URLs are "the same page" would be exactly the
kind of confident-but-wrong inference invariant #4 exists to prevent (a
templated match could easily be wrong — `/product/1` and `/product/2` might
be genuinely different products with genuinely different defects). Case
8's identity-layer guarantee (verified in `test/identity/fingerprint.test.ts`
and the Day 5 portion of the golden-pairs test: `urlTemplateFor` produces
the same value, and the underlying fingerprint stack is stable) is real and
correctly protects against something else: if a future crawler feature
matched pages by template, THIS is the property it would need. It isn't
built, and isn't needed for anything shipped today.

### D47. Case 19 (impact-changed): axe-core assigns a FIXED impact per rule, not graded by severity

Checked before writing the golden assertion, not assumed: `color-contrast`
reports `serious` for both a 2.85:1 ratio and a much worse one on the same
markup shape; `target-size` reports the same impact regardless of how far
under the minimum a target is. Neither rule's impact is computed from HOW
BAD the violation is — axe-core 4.13.0's impact comes from fixed check
metadata, not a per-instance severity calculation.

This means golden case 19, read literally ("contrast worsens on the same
element" → `impact-changed`), does not naturally occur against real
axe-core behaviour. The test now asserts what actually happens
(`persisting`, since impact is identical) and states why, rather than
forcing a false positive to make the case "pass." The `impact-changed`
CLASSIFICATION itself is real, implemented, and directly verified against
constructed `Finding` pairs in `test/diff/classify.test.ts` — impact
genuinely can differ between two runs in principle (an axe rule-config
change between versions, or a probe assigning its own impact), even though
this specific golden scenario doesn't produce a natural instance of it.

### D48. Case 20 (pagination): 1-to-1 pairing does not happen with the current signals — an honest degradation, not a bug

`§9`'s pagination case wants "10 11 12 13 14" → "20 21 22 23 24" to "pair
1-to-1." The masking exception (`§3.3`) does its job — all 10 identity
values stay distinct, so nothing collapses into a shared fingerprint. But
run through the full matcher, none of the 5 pairs actually match: "10" and
"20" are different accessible-name values, so the highest-weighted signal
(0.35) contributes nothing for every candidate; landmark+heading context
and `urlTemplate` still match (0.25 + 0.10), and DOM depth is close (up to
0.10) — call it ~0.45 at best, short of the 0.65 threshold. Result: 5 `new`
+ 5 `fixed`, not 5 `moved`.

This is the safe degradation `§6` explicitly allows ("less information, not
false regressions") — no pair is falsely called `persisting`, which is the
actual invariant that matters. It is NOT the 1-to-1 pairing the doc
describes as the goal. Lowering the threshold to make this pass would also
make genuinely unrelated findings pair on landmark+context+depth alone in
other scenarios — not a safe trade. Reported as a real gap between the
doc's aspiration and current behaviour, not patched around.

### D49. Case 18 (moved): relocation detection depends entirely on the accessible name being present

First run with the Day 5 icon-only (unlabelled) button fixture: FAILED.
Investigated rather than patched immediately — `scoreCandidate`'s weight
table has no signal for "identity.value equality" at all (only accessible
name, context, text content, urlTemplate, DOM depth), so a stable,
non-generated id (Tier 1) earns a relocated element nothing in pass 2.
Accessible name (0.35) and context (0.25) are 0.60 of the table between
them; a relocation definitionally changes context, so an unlabelled
element's ceiling is urlTemplate + DOM depth, ~0.15-0.20 — no threshold
choice both accepts that and keeps rejecting unrelated pairs.

Fixed the golden case itself, not the matcher: case 18 now uses a named
control (`color-contrast` on a "Contact us" button, not `button-name` on an
icon), which is also the *representative* scenario — Tier 3 (accessible
name) is the dominant real-site identity tier (D41, D44), so most real
relocations look like this, not like the unlabelled worst case. That
version passes (`moved`, 1). The unlabelled variant is kept as its own case,
`18b`, specifically to demonstrate the limitation rather than let it go
unstated: it degrades to 1 `new` + 1 `fixed`, same safe-degradation
property as D48, same underlying cause (no signal rewards stable
`identity.value` when the two biggest-weighted signals both fail).

**Combined finding for Day 6, stated plainly per the task's instruction:**
the matcher works as specified and passes zero-tolerance on all 12
false-regression guards plus the new/fixed/moved/impact-changed cases that
have a real accessible name to work with. Its two honest gaps — pagination-
style repeated elements with no name (D48) and relocated elements with no
name (D49) — share one root cause: `§6`'s five signals don't reward a
stable, non-generated `identity.value` on its own. Worth considering for a
future revision of the weight table; not changed today, since that would be
a spec change made under end-of-day pressure rather than considered
design.

---

## 2026-08-20 — Day 7

### D50. Collision-group multiset semantics when size changes — verified, not assumed

Day 7 asked this before any crawler code: does a 194-member collision group
shrinking to 190 yield 190 persisting + 4 fixed, or does it get treated as
one atomic "persisting group"? Written as two direct tests
(`test/diff/collision-multiset.test.ts`) against the real
`identity/fingerprint.ts` + `diff/match.ts` + `diff/classify.ts` stack,
rather than reasoned through and assumed correct.

**Confirmed: 194 → 190 (4 removed from scattered positions, not just the
tail) yields exactly 190 `persisting` + 4 `fixed`, never a false `moved`,
with every base finding accounted for.** No new code was needed — this
falls directly out of D45's architecture: pass 1 matches whatever ordinals
happen to still align exactly (only the prefix before the first removal, in
practice — everything after any removal point shifts, per D43), pass 2's
fuzzy pass recovers the rest (every remaining member ties at ~0.80+ on
name+context+text alone, comfortably above 0.65), and `classify.ts`
compares UNSUFFIXED fingerprints, so every recovered pair reads as
`persisting` rather than `moved` despite arriving via pass 2. Classification
is per-finding throughout the pipeline; nothing ever treats a collision
group as one unit.

**The within-group limitation, made concrete and documented, not left
implicit:** within a family where every member ties on every fuzzy signal,
pass 1 exact-matches only the members before the first removal point (3 of
10 in the smaller test case); everything after is recovered by pass 2's
greedy assignment, which pairs base and head members in whatever order
candidates happen to be iterated — NOT by which specific original element a
survivor "really" is. The aggregate count (190 persisting, 4 fixed) is
correct and is the only claim this system makes. **"Citation instance #47
specifically persisted" is not a claim a 194-member uniform family supports
— only "190 of these 194 persisted, in aggregate" is.** Worth stating
explicitly in any future report/CLI text that surfaces per-finding detail
within a large group: individual identity within an indistinguishable
family is not tracked, by design, not by oversight.

### D51. The crawler: sitemap/url-list as exact page sets, BFS as the plain fallback

Built `crawl/frontier.ts`, `crawl/sitemap.ts`, `crawl/filters.ts`, and wired
all three into `scan/run.ts` as a real worker pool (default concurrency 3,
`BrowserPool`'s existing recycle-every-25-pages reused unchanged) with a
per-host rate limiter (default 250ms, plain `Map<host, nextAvailableAt>`,
no cleverness). `seed.sitemap` and `seed.urlList` populate the frontier
with an exact depth-0 page set and are **never followed for further
links** — that is the whole reason to prefer them over BFS (`00 §4`), and
letting a sitemap seed also crawl forward would quietly reintroduce the
"guess the page set" problem it exists to avoid. Only `seed.url` runs BFS,
discovering same-origin `<a href>` links after each page settles and
enqueueing them at `depth + 1`.

**URL normalisation for the visited-set is a deliberate subset of `02 §5`'s
templating, not a reuse of the whole thing.** Exported
`canonicaliseUrlForCrawling()` from `identity/fingerprint.ts`, sharing only
the trailing-slash and query-canonicalisation logic (`templateQuery`) with
`urlTemplateFor()`. It deliberately skips the numeric/UUID/hash/date-segment
templating: the fingerprint *wants* `/product/1` and `/product/2` to look
identical (that is what makes cross-page grouping work), but the frontier's
dedup must not — collapsing them would mean the crawler silently visits
only one of two genuinely different pages. Two functions, not one made
configurable, because the two callers want opposite answers to the same
question ("are these the same page?") and a boolean flag threading that
distinction through `urlTemplateFor()` would obscure exactly the design
tension worth keeping visible.

**Worker-pool coordination is a plain poll loop, not a priority queue or
adaptive strategy** (Day 7's explicit instruction: no clever exploration
heuristics). Each of `concurrency` workers dequeues, and if the queue is
momentarily empty but another worker is still mid-page (and might discover
more links), it polls every 10ms rather than exiting — exits only once
nothing is in flight anywhere. Simple and correct; not fast in the
worst case, but the fixture and real-site runs below show it does not need
to be.

**Fixture surprise, corrected in the fixture, not the code:** the original
`test/fixtures/pages/crawl-site/page-a.html` linked back to the index via
`<a href="./index.html">`, intending to exercise "revisit, already in the
visited set." It does not — `/crawl-site/` (the seed, a directory URL) and
`/crawl-site/index.html` (the explicit filename) are different URLs, and
`canonicaliseUrlForCrawling()` correctly treats them as different, because a
generic crawler cannot assume a site's directory index is named
`index.html` without site-specific knowledge it does not have. This is the
technically correct, conservative behaviour — the same non-assumption
`urlTemplateFor()` already makes. Fixed by changing the fixture's link to
`./` (the actual same URL as the seed) rather than loosening the frontier's
notion of "same page."

**`--url-list` was kept, not renamed to `--urls`.** The task described the
flag by its purpose ("`--urls <file>` for explicit lists"); the CLI
already had `--url-list <path>` from Day 1, functionally identical.
Renaming an existing, working, self-describing flag to match incidental
wording in a task description would be change for its own sake.

**CLI wiring stayed scoped to the crawler itself, not the whole D21 gap.**
`cli/commands/scan.ts` now threads seed selection (`url`/`--sitemap`/
`--url-list`), `--include`/`--exclude`/`--max-depth`/`--max-pages`/
`--no-robots`/`--delay`, `--concurrency`, `--mode` and `--storage-state`
into `ScanOptions` — everything today's scope touches. `--out`, `--html`,
`--ungrouped`, `--fail-on`, `--quiet`, `--probes`/`--no-probes`,
`--viewport`, `--locale`, `--color-scheme`, `--settle-strategy` and
`--settle-quiet-ms` remain unwired: they belong to the report renderer
(Days 10-11), the scan threshold gate (Day 13) and interaction probes
(Day 9) respectively, none of which are today's scope. Verified via the
built CLI directly (`node dist/cli/index.js scan --sitemap
<missing-path>` surfaces that exact path in its error, proving the flag
value reaches the library) plus a direct run of the built `dist/index.js`
`scan()` against the fixture site for the seed-mode assertions themselves.

**`PageError.kind` now distinguishes `navigation-timeout` from
`navigation-failed`** (checking the caught error's message against
`/timeout/i`) rather than always reporting `navigation-failed` regardless
of cause. Verified against a real connection-refused target
(`http://127.0.0.1:1/...`), which correctly reports `navigation-failed`
with zero-count buckets and the page recorded in `summary.pages.errored`,
never silently dropped and never read as a zero-violation page.

**Test-infrastructure fix, not a Day 7 feature, but required to land Day
7's tests without flakiness:** `vitest.config.ts` previously claimed
"threads are fine; the server module refcounts" for
`test/fixtures/server.ts`'s fixed-port static server. That was wrong —
Vitest gives each test *file* its own isolated module registry even
inside a shared worker thread, so `server`/`refCount` are per-file, not
process-wide, and two files' `start()` calls race for the same OS-level
port if Vitest schedules them concurrently. With only two server-dependent
files (`integration.test.ts`, `smoke/server.test.ts`) this apparently
never collided in practice; adding a third (`test/crawl/crawler.test.ts`)
made the race fire on nearly every `npm test` run (`EADDRINUSE`, a
different file losing each time). Fixed at the root cause: `test.
fileParallelism: false` in `vitest.config.ts`, which serialises test-file
execution so no two files ever hold the port at once. 184/184 tests pass
repeatably after the fix (confirmed across three consecutive runs).

### D52. Real-site crawl verification — 30 pages, both items from Day 7's ask

Both of Day 7's "verify and report" items were run against a real site
(`https://books.toscrape.com/`, a site built for scraping/crawling
practice — no `robots.txt` present, so `NO_ROBOTS_RULES` fail-open applies
honestly, and it is exactly the kind of automated-friendly target this
check should hit rather than a production site that did not opt in),
30 pages, default settings (`concurrency: 3`, `delayMs: 250`,
`mode: 'ci'`), via the **built** `dist/index.js` (not source imports) so
the numbers reflect what actually ships.

**1. Wall-clock and per-page settle time.** 30 pages in 25.8s wall-clock
(`run.durationMs` and script-measured wall-clock agreed to within 100ms).
Per-page settle time (`PageResult.durationMs`, the full `settle()` call —
navigation + fonts + rAF×2 + image-decode + mutation-quiet): min 1053ms,
median 1341ms, mean 1516ms, max 4870ms (one outlier page; the rest cluster
tightly between 1.05s and 1.9s). **`01 §5`'s replacement of
`networkidle` holds up in practice**: no page hung waiting on the 2s
mutation-quiet hard cap or the 1.5s image-decode cap — the tight
clustering around 1.3s says the default 150ms quiet period is doing the
real work, not the caps. This is one real site, not a general performance
guarantee, but it is the first real number this project has for "01 §5
wasn't just faster in theory."

**2. `groupKey` collapse at 30-page scale, confirmed — extends Day 6's
10-page check.** Several real defects each collapsed into exactly ONE
`groupKey` spanning all 30 crawled pages: `link-in-text-block` (shared nav
styling), four distinct `color-contrast` groups, and two `target-size`
groups — each one `groupKey`, 30 pages, not 30 separate groups. Of 4,899
total findings and 521 distinct `groupKey`s, the site-wide shared-chrome
defects are exactly the ones `01 §8`'s grouped report view and the Day 14
audit estimate depend on collapsing — confirmed, not just plausible from
the 10-page test.

---

## 2026-08-20 — Day 8

### D53. Carryover: Day 7's 30-page crawl produced 521 distinct groups, not 20–40

Day 8 asked this reported before any new code: `00 §9` and `03 §2` size the
Day 14 audit budget on an assumption of 20–40 distinct findings per site.
D52's real 30-page crawl (`books.toscrape.com`) produced **521 distinct
`groupKey`s** from 4,899 total findings — roughly 13× the assumption.

This is not a grouping-correctness problem. D52 already confirmed the
mechanism works exactly as designed: several genuinely shared defects
(`link-in-text-block` on the nav, four `color-contrast` groups, two
`target-size` groups) each collapsed to exactly one `groupKey` across all
30 pages. The gap is that most of this site's 521 groups are **not**
shared-chrome defects at all — `books.toscrape.com` is a product-catalogue
site where most contrast/link findings are on a per-book element with a
per-book accessible name (the book title), so `groupKey`'s `accessibleName`
component correctly keeps each book's finding distinct rather than
collapsing them. `groupKey` was never designed to collapse *distinct*
elements that merely share a rule; it collapses one *recurring* element
(nav, footer) across pages, which is a narrower thing.

**The 20–40 estimate holds for a mostly-static marketing/docs site with a
shared header/footer and few repeated per-item components. It does not
hold for a catalogue/listing site** (product grids, search results,
paginated cards) where each item plausibly contributes its own distinct
group. `00 §9`/`03 §2` should either scope the estimate explicitly to the
former site shape, or the Day 14 audit budget should plan for a
higher-variance range. Not changed today — Day 8's scope is config and
suppression, not the audit-day plan — but flagged now rather than
discovered as a surprise on Day 14.

### D54. Ephemeral fixture-server port, not a fixed one — the real fix for D51's race

Day 7 (D51) "fixed" an `EADDRINUSE` race between test files sharing
`test/fixtures/server.ts`'s fixed port 4173 by setting `fileParallelism:
false` in `vitest.config.ts`, serialising every test file in the suite.
That was the wrong fix for the actual cause: the race is that two files can
each try to bind the *same* port, which holds regardless of whether that
port is fixed or OS-assigned. Today: `server.ts` now binds `listen(0, ...)`
(ephemeral) and returns the resolved origin from `start()`; every consumer
(`pageUrl()`, the smoke test, the crawler tests' generated sitemap/url-list
fixtures) reads the *actual* origin at runtime instead of assuming one.
`fileParallelism: false` is removed.

Safe because `urlTemplateFor()` (`02 §5`) is deliberately path-only — origin
and port were never a fingerprint input, so nothing about determinism
depended on the port being fixed; that part of D51's original comment was
never actually load-bearing. Verified: full suite passes repeatably across
several consecutive `npm test` runs, and wall-clock dropped from ~39–43s
(serialised) back to ~17s (parallel) — confirming the serialisation really
was pure cost, not a needed safeguard.

### D55. `document.fonts.ready` bounded (3s cap), `PageResult.settleDegraded` added

`01 §5`'s readiness contract bounds steps 4 (image decode, 1.5s) and 5
(mutation quiet, 2s hard cap) but left step 2 (`document.fonts.ready`)
unbounded — a page with one `@font-face` source that never resolves (blocked
origin, broken font file, dead CDN) hung it, and everything after it,
forever, with no typed error to show for it. The exact silent-hang shape
steps 4 and 5 already guard against, just missed on step 2.

Fixed the same way: `SettleSettings.fontsReadyCapMs` (default 3000ms),
enforced via a Node-side `Promise.race` (not an in-page one — `fonts.ready`
is a single flat await with no per-call timeout of its own to hook). A cap
hit leaves the in-page promise to resolve on its own time; harmless, since
nothing downstream depends on it.

Because a capped wait means the page may not have been fully settled when
scanned, `PageResult.settleDegraded: boolean` was added — true if *any* of
the three bounded waits (fonts, image-decode, mutation-quiet) hit its cap.
Not an error (the page still scanned, findings are still real) but a
"scanned, possibly early" signal a report reader should be able to tell
apart from "scanned cleanly." `Report.schemaVersion` bumped `1.1` → `1.2`
for the new field, per the standing rule in `types.ts`.

Verified with a real fixture (`test/fixtures/pages/settle-degraded/`, one
`@font-face` pointing at a route the fixture server deliberately never
responds to) rather than asserted: `settle()` reports `fontsReadyCapHit`
and returns well within the cap, and a full `scan()` surfaces
`settleDegraded: true` on that page and `false` on an ordinary one.

### D56. `SuppressionCategory` stays four values, not the three today's brief listed

Today's instruction enumerated `category` as `'false-positive' |
'accepted-risk' | 'third-party'`. `types.ts` already defines a fourth value,
`'deferred'`, established on an earlier day. Asked rather than silently
picking one: confirmed `types.ts` stays authoritative and the brief's list
was shorthand, not an intentional narrowing. `config/schema.ts`'s zod enum
uses all four, pinned to `SuppressionCategory` via a `satisfies` check so
the two can't silently drift apart again.

### D57. Config file convention corrected: discovery, not a fixed `.a11y/` path

`src/meta.ts` exported `DEFAULT_CONFIG_PATH = '.a11y/config.json'` since
Day 1, used as the CLI's `--config` default — but no code ever implemented
discovery against it, and it matches neither `docs/README.md`'s own
`a11y-ratchet.config.ts` example nor today's explicit instruction (file
discovery for `a11y-ratchet.config.{ts,js,json}`). It was an ungrounded
placeholder, not a considered convention. Replaced with `CONFIG_BASENAME =
'a11y-ratchet.config'`, used by the new `config/load.ts`'s discovery (tried
in order `.ts`, `.js`, `.json`; first one present wins). `scan --config`
and `check-config`'s config argument both lost their hardcoded
`.a11y/config.json` defaults so omitting them actually triggers discovery
instead of always pointing at a file discovery was never wired to find.

### D58. `.ts` config loading: discovered, but no bundler added to load it — asked, and a Node-version surprise found while verifying

Loading `a11y-ratchet.config.ts` at runtime needs something to strip
TypeScript syntax; Node 20 (the project's stated minimum, `CLAUDE.md`
Stack) has no built-in support. `esbuild` is available transitively via
`tsup` but isn't a declared runtime dependency, and `CLAUDE.md`'s Stack
section is a deliberately closed list. Asked rather than silently adding a
dependency: chose NOT to add `esbuild`. `config/load.ts` discovers `.ts`
files and attempts a plain `import()`; on Node versions with no TypeScript
support this throws, and the error is rewritten to name the real cause
("this process has no TypeScript loader registered... run under tsx/
ts-node, or use a .js or .json config") rather than surfacing a generic
import failure.

**Verifying this manually surfaced something the design decision didn't
anticipate:** the actual Node installed here is v24.16.0, and Node 23.6+
enabled TypeScript type-stripping *by default*, with no flag. A `.ts`
config using only plain data (the documented README example, and
realistically almost every suppression config, since they're data
literals) loads out of the box on this Node version — the "no TS loader"
error path is real but dormant here. Confirmed it still fires correctly for
genuine TS-only runtime syntax that erasure-only stripping can't handle
(tested with a `.ts` config using a numeric `enum`): `Could not load
...: this process has no TypeScript loader registered ... (TypeScript enum
is not supported in strip-only mode)`. Not retested inside the Vitest
suite itself — Vitest's own Vite-powered environment transparently
transforms any `.ts` file it dynamically imports, including ones outside
the project tree, so the failure path can only be observed by shelling out
to the built CLI under plain `node`, not from within `vitest run`.

### D59. Suppression matching design: five independent-AND matchers, config-side `reason` vs report-side `justification`

`config/suppress.ts` matches a config entry against a `Finding` by whichever
of `rule` / `criterion` / `selector` / `urlPattern` / `fingerprint` the
entry sets — ALL set ones must match (AND); the schema already refuses an
entry with none set (`03 Part 3 §11`'s "must match on at least one"
requirement). Matching against `Finding.selector` is not a `CLAUDE.md`
invariant-2 violation: that invariant governs finding *identity*
(fingerprint/groupKey), never what a human-authored suppression is allowed
to filter on — a suppression is a decision about a specific place in the
DOM, and a CSS-selector glob is a reasonable way for a person to describe
that place.

The config file's field is named `reason` (matching `docs/README.md`'s own
example); `types.ts`'s `SuppressionRef.justification` is a different,
already-established name for the same value on the *report* side. Kept
both names rather than renaming one to match the other — `SuppressionRef`
predates today and other code already depends on `justification`; the
config schema is new today and `reason` is what the docs already show
users. `config/suppress.ts::toSuppressionRef()` is the one place that maps
between them.

### D60. Baseline lifecycle: `update` diffs-then-overwrites, `regenerate` overwrites unconditionally, `check` never writes

`01 §11`'s table names four situations but doesn't spell out exactly what
`update` keeps versus discards. Read literally — "drop findings that no
longer occur, keep the rest" — and since a fresh `Report` by construction
contains only findings that currently occur, "keep the rest" reduces to
"the new baseline is the fresh report, in full." So `updateBaseline()` and
`regenerateBaseline()` end up writing the same content; the difference is
in what each is *allowed* to do to get there:　

- `updateBaseline()` requires an existing baseline (refuses with exit 3,
  naming `regenerate`, if there isn't one) and runs `diff()` against it
  first — for its refusals: engine drift and incompatible run config both
  propagate exactly as `diff()` throws them, so `update` cannot be used to
  silently paper over an axe-core bump. That's what `regenerate` is for.
- `regenerateBaseline()` skips the read and the diff entirely — unconditional
  overwrite, works even with no prior baseline (the first-ever baseline for
  a new project) or across an engine bump.
- `checkBaseline()` requires an existing baseline (same exit-3 refusal) and
  returns `diff()`'s `DiffResult` untouched — it never writes. The "print
  the local command to run" behaviour (`01 §11`: CI never writes to the
  repo) lives in `cli/commands/baseline.ts`'s `check` action, not the
  library function, matching where `01 §10`'s exit-code decisions already
  live (`exitCodeForDiff`, `exitCodeForConfigCheck`).

`updateBaseline()` deliberately does NOT refuse when the diff shows gating
regressions (new violations, impact increases) — it's explicitly a local,
human-run command (never CI), and the CLI already prints the diff summary
first. Refusing would add friction the docs never asked for, for a
developer who may be baselining a first scan with known, backlogged issues.

### D61. Suppression end-to-end, verified for the first time: does not read as `fixed`

Day 8 asked this verified, not assumed — D13 (suppressed findings stay
pooled, tagged, never dropped) was built as an architectural property back
when the diff/match/gate layer was written, but nothing had ever driven a
real suppression through the real pipeline end to end. Built
`test/config/suppress-end-to-end.test.ts`: a real `scan()` of the same
fixture page (`01-images`, real `image-alt` finding) run twice — once with
no config, once with a config suppressing that rule — then a real `diff()`
between the two.

**Confirmed:** the suppressed run's finding carries a fully-populated
`SuppressionRef` and stays in `Report.findings` (not moved to a second
array, not dropped — `counts.suppressed` reflects it). Diffing the
unsuppressed run as base against the suppressed run as head: the finding
does **not** appear in `findings.fixed` (the false-fix D13 exists to
prevent), does not appear in `findings.new` either, and correctly appears
in `findings.persisting` — proof the matcher pooled base and head despite
the `suppressed` tag difference between them and classified the pair
correctly rather than losing the match. `gate.countedAgainstGate` is `0`
and `gate.passed` is `true`, since the gate predicate excludes
`suppressed` findings (`diff/gate.ts`, already built). No production code
changed to make this pass — same story as D50: the architecture already
had this property; today supplied the config layer that could exercise it,
and the test that proves it.

---

## 2026-08-20 — Day 9

### D62. Focus-path probe identity: duplicated, not shared with `scan/axe.ts`

`scan/probes/focusPath.ts` needs the same tiered-identity candidate
extraction (`identity/fingerprint.ts`'s `IdentityCandidates`) `axe.ts`
already computes, so probe findings fingerprint and group consistently
with axe findings. Considered extracting the shared in-page tree-walking
helpers (`nearestLandmarkRole`, `buildSemanticPath`, `buildStructuralPath`,
`nearestPrecedingHeadingText`, `nearestStableAncestor`, …) into one
injectable module both files call into, instead of `focusPath.ts` growing
its own ~250-line copy.

Decided against it, for today: `identity/fingerprint.ts`'s own docstring
calls it "the highest-risk module in the build," and `axe.ts`'s DOM-reading
half of it is settled, bug-fixed code (D28's stable-ancestor fix, D33's
heading-context fix) that Day 9's scope never named. Refactoring it on a
probe-focused day, right before Day 10's `templateKey` work also touches
`structuralPath`, risked exactly the kind of disturbance `CLAUDE.md`'s
working agreement warns against ("the plan is sequenced so the
highest-risk component is designed against a settled type contract").
Duplicated instead, with two deliberate departures from a byte-for-byte
copy:

- `buildSemanticPath` is simplified — raw explicit role or tag name per
  ancestor level, not `axe.ts`'s fuller implicit-role table (`ul` → `list`,
  etc.). Tier 4/5 only matter for a focusable element with NO accessible
  name at all, which is already rare (most are links/buttons/inputs, and an
  unlabelled one is usually already a separate axe violation) - full
  parity buys little for that case.
- The `(c)` cycle-detection heuristic (see D63 below) doesn't need
  `nearestStableAncestor`'s generated-id filtering logic duplicated for its
  own sake; `buildStructuralPath` still uses it because Tier 5 genuinely
  needs a stable anchor, so `isIdGenerated`/`GENERATED_ID_PATTERNS` (the
  latter already a shared export, not duplicated) came along.

Left as an explicit follow-up, not silently accepted: if `axe.ts`'s
identity extraction changes again, `focusPath.ts`'s copy will not notice.
A future day should extract the shared subset once both call sites have
enough real mileage to know which parts are actually worth sharing.

### D63. Chromium's focus-scroll centres the target, it does not snap to an edge — found while building the sticky-header fixture, not assumed

`01 §6.2`'s obscured-focus check needed a fixture with a control the
browser would scroll to a specific, obscured position when Tab-focused.
First attempt: a normal-height (60px) sticky header, an unmitigated link
below the fold, and a second link with `scroll-margin-top: 76px`. It did
not reproduce anything — empirically (`page.evaluate`, not assumption) the
unmitigated link landed at `rect.top ≈ 389px` on an 800px-tall viewport,
nowhere near the header, and neither link was covered.

The reason: Chromium's focus-triggered scroll does not snap the target
flush to the nearest viewport edge (what a naive reading of "scroll it
into view" suggests) - it **centres** the target vertically in the
viewport. `rect.top ≈ 389` on an 800px viewport is consistent with
`scrollY ≈ elementCenterY − 400`, confirmed by recomputing the element's
absolute page position and matching it against the observed `scrollY`.
This means a slim nav-height sticky header will rarely obscure anything
under Tab-only focus movement in practice - it would need the target to
sit very near the top of the whole document (where the centring
calculation clamps against `scrollY = 0`) to land under a short header.

Fixed the fixture, not the detection logic (`checkObscured` itself needed
no change - it measures the ACTUAL rendered position after scroll settles,
whatever produced it, which is the only way to be correct regardless of
which scroll algorithm a given browser uses): made the sticky element tall
enough (440px) to reach the vertical band centring lands elements in at
this viewport size, and increased the "correct fix" link's
`scroll-margin-top` to 500px, tuned empirically against this exact layout
via a throwaway script, not derived analytically from the 440px figure (the
relationship isn't 1:1 — a 76px margin only shifted the rendered position
by about half that). Documented in the fixture's own comment so a future
reader doesn't "simplify" it back to a slim header and silently break the
test. A large sticky promo/consent banner - not a slim nav bar - is also a
realistic real-world shape for this exact bug, so the fixture is honest as
well as reliable.

**Consequence for the algorithm, not just the fixture:** §6.3(c)'s literal
wording ("focus cycles without covering all known tabbables") turned out
to describe the wrong condition once modelled against a two-element modal
trap (`#modal-input`, `#modal-save`, nothing else tabbable on the page).
Native Tab reaching the true end of a page's tab sequence always exits the
document (`left-document`); it never revisits an earlier element on its
own. A cycle back to an already-visited element can therefore only happen
via the page's own JS redirecting focus - which is always suspicious,
`visited.length < tabbableCount` or not. Comparing against the tabbable
count would have exempted the worst case (a trap that covers every
tabbable element on the page, leaving nothing else reachable at all) from
ever being flagged. Implemented as "any cycle is a trap candidate,"
dropping the count comparison; `01 §6.3` should be corrected to match on a
day that revisits the probe spec.

### D64. Focus-path probe: verified against the fixtures AND a real site, not trusted on green tests alone

**Fixtures (`test/scan/probes/focusPath.test.ts`), all four planted
cases plus the clean-page and closed-shadow negatives:**

- `07-focus-sticky`: the unmitigated link is flagged (`probe/focus-obscured`,
  2.4.11, needs-review); the `scroll-margin-top`-corrected link is not.
- `08-focus-trap`: the escape-less modal (no Escape handler, no close
  button reachable by keyboard) is flagged (`probe/keyboard-trap`, 2.1.2);
  the WAI-ARIA APG roving-tabindex toolbar is not, and no probe finding of
  any kind traces back to it (checked via `html` content, not just
  selector, since the toolbar's own buttons carry no id).
- `10-clean` and every pre-existing Day 1-8 fixture: zero probe findings,
  confirmed as a side effect of the full suite passing once probes ran by
  default (no fixture needed a "must not flag" test written for it
  retroactively - none of them have anything `position: fixed`/`sticky` or
  any focus-trapping JS to begin with, verified by grep before trusting
  that).
- `09-shadow`'s closed shadow host is recorded as a `probeBlindRegion`
  (`reason: 'closed-shadow-root'`, `unevaluatedCriteria: ['2.4.11',
  '2.1.2']`), not silently skipped or misread as zero findings.

**Real site, per the explicit instruction not to trust green tests alone:**
crawled 8 pages of `vuejs.org`'s own documentation (`--mode audit`, a real
`position: fixed` header, 55px) - chosen after `developer.mozilla.org`'s
strict CSP (`script-src` with no `unsafe-inline` and no matching hash)
turned out to block axe-core's `addScriptTag` injection outright, failing
the page before the probe ever ran (a real, pre-existing tool limitation
this surfaced, not a Day 9 regression - noted here since Day 9 is what
found it, not fixed here since fixing it means switching axe's injection
strategy, out of scope for a probe day).

**Result: 2 findings across 8 pages, both `probe/keyboard-trap`, both on
the same CodeMirror-based embedded code editor's hidden input `<textarea>`
(`/tutorial/` and `/examples/`) - both verified genuine, not assumed.**
Manually drove the same element with Playwright outside the scan: focused
the textarea, pressed Escape (focus stayed), then Tab (focus still did not
move) - no documented escape mechanism (`aria-label`, `title`, `role` were
all empty on the element). This is a real, undocumented keyboard trap on
Vue's own docs site, not a probe false positive. Zero `probe/focus-obscured`
findings despite the real fixed header - plausible true negative rather
than a missed detection, since VitePress (the site's generator) is known
to handle scroll offset for its own fixed nav correctly, and D63's fixture
work already proved the geometry check fires when genuine obscuring
exists.

**Honest framing of what this does and doesn't prove:** 2 findings from 8
pages is too small a sample to publish as a false-positive RATE (`01 §6.4`
commits to publishing the rate, not to this run standing in for it - a
real, larger multi-site audit is `03-EVIDENCE.md`'s real-site-audit
work, not Day 9's). What it does establish: on this run, every finding
that fired was genuine on manual inspection, and the probe did not
misfire on a real, non-trivial site's real fixed header. The known,
accepted false-positive shape from `01 §6.4` (roving-tabindex widgets
where focus legitimately stays on a container) did not appear in this
sample at all - Vue's docs happen not to have one in the crawled pages -
so this run cannot speak to that failure mode's real-world rate either;
`08-focus-trap`'s fixture is what demonstrates the probe gets that
specific case right, not this crawl.

---

## 2026-08-20 — Day 10

### D65. Carryover: `bypassCSP` — a run-config field, not silently always-on

Day 9 found that `developer.mozilla.org`'s strict `script-src` CSP (no
`unsafe-inline`, no matching hash) silently blocks axe-core's
`addScriptTag` injection, failing the page before anything scans. Added
`ScanOptions.bypassCSP` (default `false`, threaded through
`scan/browser.ts`'s `BrowserPool` into Playwright's `newContext({
bypassCSP })`), recorded unconditionally in `RunInfo.bypassCSP`, and added
as a fifth `RunIncompatibilityReason` alongside mode/viewport/locale/
colorScheme (`diff/run.ts`) - a bypassed CSP changes what the page can
execute, the same class of phantom-regression risk, not a stability
concern like concurrency/settle.

**Verified, not assumed:** re-ran the exact MDN page from Day 9 through
the built CLI/library both ways. Without `bypassCSP`: `error.kind:
'navigation-failed'`, same as Day 9. With it: `error` absent, 5 real
findings. `run.bypassCSP` correctly `false`/`true` on each side.

One note on today's instruction: it referenced "(paste block above)" for
this field's shape, which did not arrive in this conversation. Implemented
by pattern-matching the existing run-config fields
(`viewport`/`locale`/`colorScheme`/`storageState`) rather than guessing at
unseen syntax, since the intent (a boolean, off by default, recorded and
diff-incompatible) was unambiguous from the rest of the sentence. Flagged
here rather than silently assumed complete.

### D66. Carryover: the focus-path probe already measures geometry on every step, scroll or not — verified against the Vue crawl, not assumed

Today's first carryover asked what fraction of Day 9's Vue.js Tab steps
involved no scroll at all, and whether the probe evaluated geometry on
those steps regardless - because a probe that only measures post-scroll is
blind to the more common real case: an element already on-screen (no
scroll needed) sitting under a permanently-fixed overlay (a cookie banner,
a promo bar) rather than one freshly scrolled under a sticky header.

**Measured, via a standalone Playwright script against the same 8 Vue.js
pages (not the shipped probe's own code path, to avoid begging the
question):** of 458 total Tab steps, **416 (90.8%) involved no scroll at
all**, and all 416 still returned a valid, non-empty `getBoundingClientRect()`.

**Then confirmed against the actual shipped code, not just the
measurement:** `src/scan/probes/focusPath.ts`'s `probeStepInPage` calls
`checkObscured(el)` unconditionally for every `'stepped'` result (line
~666-667) - it is never gated on whether `waitForScrollSettleInPage`
detected movement. The scroll-settle wait itself always runs first
regardless (`§6.2`'s literal instruction), and simply returns almost
immediately when there is nothing to wait for. **The probe was never
blind to the no-scroll case; Day 9 built it right without this specific
number being checked at the time.** Worth having checked anyway - "the
code looks like it should be unconditional" and "90.8% of real steps
confirm it actually is" are different kinds of confidence.

### D67. Carryover: the precise keyboard-trap cycle predicate, stated plainly

Today's second carryover asked for the exact condition that separates a
legitimate tab-order wrap from a genuine trap, stated precisely rather than
left implicit in D63's prose. From `probeStepInPage`'s actual logic:

> A step classifies as a **cycle** iff the shadow-aware deep active element
> read after a real `Tab` press (1) is not `null`/`document.body` (has not
> left the document - that path is `'left-document'`, handled separately),
> (2) is not reference-equal to the immediately-previous visited element
> (that path is `'unchanged'`, `§6.3`(b) - a different signal), and (3) IS
> reference-equal to some element already present in this page's
> `visited` set from earlier in the same traversal.

This relies on one invariant about unmodified browsers, not asserted by
this codebase but relied on by it: native Tab-order traversal is
monotonic and terminates by leaving the document - it does not, on its
own, revisit an element it has already visited in one direction. A cycle
back to an earlier element is therefore only reachable via the page's own
script redirecting focus, which is either a deliberate (possibly
escape-less) focus trap or a bug; `§6.3`(c)'s literal "without covering
all known tabbables" qualifier was already found wrong and dropped for
this reason on Day 9 (D63) - restated here as the exact predicate, not
just the conclusion.

### D68. Carryover: the Vue keyboard trap — drafted, not filed

Asked before posting: filing a public GitHub issue is an externally
visible, unilateral action taken on the user's behalf under their
authenticated account, not a reversible local edit. Drafted the issue
(repo `vuejs/docs`, title "Embedded code editor traps keyboard focus (no
way out via Tab or Escape)", reproduction steps, and the manual
verification from D64) and asked whether to file it. Answered: draft
only. Saved to the session scratchpad, not filed, not committed to this
repo (it is not project content).

### D69. `templateKey` and the two group indexes `Report.groups`/`Report.templateGroups` were never actually built

`identity/group.ts` gains `computeTemplateKey()` per `01 §8`: strips the
`[N]` same-tag-sibling-index suffix from each `structuralPath` segment
(`li[3] > article[0] > a[0]` → `li > article > a`), then hashes
`[ruleId, source, landmarkRole, indexStrippedStructuralPath]` - strictly
weaker than `groupKey`, which still varies per instance since different
instances of a template correctly have different accessible names.
Wired into both finding producers (`scan/normalise.ts` for axe,
`scan/probes/focusPath.ts` for the probe - the latter needed
`CandidateFinding` to carry `structuralPath` through to `buildFinding`,
which it didn't before today).

**Found while wiring it in: `Report.groups` had been a hardcoded `{}`
since Day 4/6 - the `GroupIndex`/`FindingGroup` types existed, nothing
ever built them.** `identity/group.ts` now exports `buildGroupIndex()` and
`buildTemplateIndex()`, both called from `scan/run.ts` in place of the old
stub. `Summary.groups` was also hardcoded `0`; now a real count. Neither
gap was in any single day's stated scope before today, so neither was
"someone's bug" - `groupKey`/`templateKey` simply had no consumer to
expose it not being wired until the report needed one.

**One field's exact meaning had to be decided, not just implemented:**
`FindingGroup.uniqueElementCount`, from `01 §8`'s own worked example
("Affects 43 pages · 1 unique element"). Counting distinct (unsuffixed)
fingerprints does NOT give "1" for that example - `urlTemplate` and
`headingContext` are both fingerprint inputs and both vary per page for a
shared nav/footer element, so a 43-page group would count 43 there, not
1. Implemented as the count of distinct `Finding.selector` values instead
- a display-only answer to a display-only question ("how many differently
SHAPED occurrences," not "how many pages") - documented inline as an
interpretation, since the field predates today and its exact intended
semantics were never written down beyond the one worked example.

**Second bug the report's own tests caught, not reasoned through in
advance:** `buildGroupIndex`/`buildTemplateIndex` originally grouped ALL
findings, including suppressed ones. A group/template built entirely from
a suppressed finding rendered as an empty shell in the HTML report - "1
template defect (1 instance)" with a completely empty instance list under
it, since `report/html/render.ts` separately (and correctly) excludes
suppressed findings when populating each group's instance list. Fixed by
excluding suppressed findings from both index-builders, mirroring the
gate's own `!finding.suppressed` filter (`diff/gate.ts`) - these two
indexes represent the actionable defect landscape; `Report.findings`
alone is still the complete, nothing-dropped array (`CLAUDE.md` invariant
2 is about that array, not about every derived view).

`Report.schemaVersion` bumped `1.2` → `1.3` for `Finding.templateKey` and
`Report.templateGroups`.

### D70. `gate.reason` counts at template level, with instance counts alongside — never "N violations" for one repeated defect

`diff/gate.ts`'s `buildReasonSentence` rewritten to group `gatingNew` /
`impactIncreased` / `moved` / `fixed` by `templateKey` before describing
them: `"1 new template defect (43 instances) on 12 pages (1.4.3)"`, never
`"43 new violations"`. `countedAgainstGate` (what actually decides
pass/fail) is unchanged - every individual finding still counts and still
blocks; only the SENTENCE describing that count changed, so a
43-page-wide template regression reads as the one bug it is rather than
as 43 separate ones. Applied uniformly to all four categories (new,
impact-increased, moved, fixed) for internal consistency, not just the
"new" case the instruction's example named.

### D71. The self-contained HTML report (`report/html/render.ts`)

Default view is the TEMPLATE tier (`01 §8`), expandable to `groupKey`,
expandable to individual instance - implemented as nested native
`<details>`/`<summary>` disclosure widgets, zero JavaScript. This was the
direct, load-bearing reason for choosing that markup, not a stylistic
preference: a disclosure widget's accessible name, expand/collapse state
and keyboard operability (Enter/Space on the `<summary>`) are all native
browser behaviour, so "report polish is cut line #1" (`00 §7`) and "the
report's own accessibility is never cut" (same section) stop being in
tension - the interactive part IS the accessible part, for free, instead
of something to build and then separately verify.

Suppressed findings get their own collapsed section (reason, category,
owner, expiry always visible once opened) and are excluded from the main
template/group/instance tree - tagged and retained in `Report.findings`
per invariant 2, but not presented as "defects to look at" in the same
table as unsuppressed ones. `PageResult.settleDegraded` and
`probeBlindRegions` are surfaced per page as inline flags, not folded into
a generic "warnings" bucket a reader could skim past. Identity tier
distribution (`Summary.findings.byTier`) is shown as its own table in the
Summary section, matching `report/summary.ts`'s existing terminal
rendering of the same signal (D38).

**Verified against a real, non-trivial report, not a synthetic empty
one:** `test/report/html/self-scan.test.ts` scans `01-images` (real
planted defects) with a real suppression configured, renders the report,
writes it to a temp file, and scans THAT FILE (`file://`, not a network
request - consistent with "no test touches the network") with the actual
shipped `scan()`. **Zero violations, zero best-practice findings on the
first run**, exercising the findings tree, the suppressed table, and the
summary section all at once - not just an empty-report shell that would
pass trivially by having nothing to render. Full self-test enforcement (a
release gate) is still Day 11's job; today verified honestly rather than
deferring the check itself along with the gate.

**`--html`/`--out` wired into `cli/commands/scan.ts`** (previously
neither was - `scan()`'s result was discarded entirely, a D21-style gap).
`--quiet`/default terminal printing wired alongside them, since a report
you cannot produce is not meaningfully "built." `--ungrouped`,
`--fail-on`, and the rest of the still-dangling flags (`--viewport`,
`--probes`, …) are unchanged - out of today's stated scope
(`report/html/` and `templateKey`), not silently expanded into.

### D72. `templateKey` real-site verification: 521 groups → 14 templates, 37.2×

Today's scope's own acceptance test: re-ran the exact Day 7 crawl (`books.
toscrape.com`, 30 pages, same settings) that produced 521 `groupKey`s, and
counted `templateKey`s over the identical result. **521 → 14, a 37.2×
reduction** - comfortably "roughly an order of magnitude fewer," and
inside the 20-40-per-site range `00 §9`/`03 §2` budget for, not above it.
The largest single template (`color-contrast`, 50 groups collapsed to one
row) alone accounts for 1,473 instances across all 30 pages - exactly the
"50 regressions for one template bug" failure shape `01 §8` describes,
now collapsed to one line in both the gate reason and the report's
findings tree.

---

## 2026-08-20 — Day 11

### D73. Case 20 fixed for real: digit-masked accessible-name credit at reduced weight, correcting D48

D48 (Day 6) documented pagination-style repeated controls ("10 11 12 13
14" → "20 21 22 23 24") degrading to 5 `new` + 5 `fixed` as a deliberate,
safe non-fix - lowering the global match threshold to catch it was
rejected as unsafe (it would let genuinely unrelated findings pair on
landmark+context+depth alone). Revisited today because it is a **live
false-regression source** (goal 1's zero-tolerance category, `02 §2`), not
merely an aspirational gap: a site with pagination, a numbered carousel,
or any control whose visible/accessible content is otherwise-identical
except for a number would show a phantom regression on every single scan
that happened to land on a different page/slide than the baseline.

**Fixed with a narrower tool than a threshold change:** `diff/match.ts`
gains a second, weaker accessible-name signal. `"10"` and `"20"` never
match at the full 0.35 (they are genuinely different strings, and
`identity/fingerprint.ts`'s `normaliseText` deliberately does NOT mask a
whole-string-digits value - `02 §3.3`'s masking exception, precisely so a
pagination bar's five buttons don't collapse into one fingerprint in the
first place). But masked with NO exception (every digit run replaced,
including a whole-digits string) they become equal - `"10"` and `"20"`
both become `"#"`, `"Item 10 of 50"` and `"Item 20 of 60"` both become
`"Item # of #"`. That equality is awarded 0.20, not 0.35: a deliberately
weaker signal, since the names really did change and this must not, on
its own, be enough to push an unrelated pair over threshold (verified:
`test/diff/match.test.ts`'s "small enough alone" case constructs a
worst-case unrelated pair with matching digit-masked names and confirms
it stays under 0.65 without help from other signals).

**Result, verified against the real fixture, not just the arithmetic:**
case 20 now classifies as 5 `moved`, not 5 new + 5 fixed - the identity
value genuinely changed ("10" is not "20"), so `moved` is the correct
classification, not `persisting`. All 12 zero-tolerance false-regression
guards and the other 19 golden pairs still pass unchanged (D48's original
concern - a threshold change destabilising unrelated matches - does not
apply here, since this signal only ever fires when both names are
digit-masked-equal, a narrow and specific condition). Full suite: 286/286.

D48's entry is left in place, not deleted - it correctly recorded that a
threshold-based fix would have been unsafe; today's fix is a different
mechanism, not a reversal of that finding.

### D74. Experimental axe rules (`css-orientation-lock`, `label-content-name-mismatch`): stay on by default

Both already run today, as a side effect of `scan/axe.ts`'s tag-based
`runOnly` selection overriding their individual `enabled: false` default
in axe-core 4.13.0 - not a deliberate per-rule allowlist. Asked whether
that should become explicit-and-on or explicit-and-off. Decided: **stay
on**, made explicit rather than left as a side effect.

Reasoning: they are the only automated signal `wcag/coverage.ts` has for
two of the matrix's 17 `partial` rows (1.3.4 Orientation, 2.5.3 Label in
Name) - turning them off would not make the tool MORE honest, it would
make it silently detect less while the coverage matrix kept claiming
partial coverage that no longer fires. The actual risk "experimental"
names - detection logic more likely to change or be withdrawn between
axe-core versions than a stable rule's (`DECISIONS.md` D17) - is already
the exact thing `CoverageEntry.experimental: true` exists to flag to a
reader of the matrix; disabling the rules would remove that risk by
removing the coverage they document, which is a worse trade than
surfacing the risk and keeping the coverage. Nothing changed in code;
`scan/axe.ts`'s existing comment already reasoned through this - this
entry is that reasoning formalised with a decision number, per today's
request, not a new behaviour.

### D75. Focus-path probe: a tab-order wrap is not a keyboard trap

The requested guard, one probe-quality item alongside today's other work.
`runFocusPathProbe` (`scan/probes/focusPath.ts`) previously flagged every
`'cycle'` step (Tab returning to an already-visited element) as a trap
candidate. That is correct for a real trap - a modal that never releases
focus cycles through its own handful of elements over and over - but a
headless Chromium page has no browser chrome to hand focus off to when
the traversal reaches the true end of the tab sequence, so a completely
correct, non-trapping page could in principle wrap back to its own first
element instead of exiting. Not observed in this project's fixtures or
real-site scans (2 findings in 458 real probe steps, both genuine), but a
false positive of this shape would fire on every single page of a site if
it ever did happen, since it is a property of the runtime, not the page.

Added `isCleanTraversalWrap(cycle, tabbableCount)`: a cycle is a clean
wrap, not a trap, iff it revisited the traversal's own FIRST element
(`wrappedToFirst`) after covering exactly as many elements as the page's
static tabbable-count estimate (`cycleLength === tabbableCount`). Both
conditions matter - `wrappedToFirst` alone would exempt a short trap that
happens to start at element 1; `cycleLength` alone would exempt a trap
whose cycle length happens to match the page's total tabbable count by
coincidence. Exported as a standalone pure function specifically because
the real-browser condition it guards against cannot be reproduced on
demand in a test, so the boundary logic is verified with direct synthetic
inputs (`test/scan/probes/focusPath.test.ts`) instead of a fixture that
would have to fake headless Chromium's chrome-less state. Re-ran the
existing trap fixture (`08-focus-trap`) afterward to confirm the guard
does not accidentally exempt a real trap: its cycle length (2, the
modal's own two elements) never equals the page's full tabbable count
(4, includes the toolbar and the link after the modal), so it still
flags. Full suite: 290/290 after this change.

### D76. `exitCodeForScan()` pulled forward from Day 13

`--fail-on` was named explicitly in today's scope alongside `--ungrouped`
("Wire the remaining CLI flags on scan and diff"), but `exitCodeForScan()`
was an explicit Day 13 stub - and `test/smoke/library.test.ts` had a
dedicated "unimplemented entry points" block built specifically around it
staying a stub "the longest," documenting the day-boundary discipline as
test infrastructure, not just a comment. Flagged the conflict rather than
silently resolving it either way (`CLAUDE.md`: "when a task is ambiguous,
ask one question"). Asked; told to implement it now.

The function itself is small enough that pulling it forward carries little
of the risk day-sequencing exists to avoid: no baseline, no matching, just
`report.summary.findings.violation > failOn ? 5 : 0`, with `failOn`
omitted meaning no threshold configured (never a silent pass disguised as
a real one). `report.summary.findings.violation` already excludes
best-practice and suppressed findings (`report/summary.ts`,
`identity/group.ts`), so this can't gate on either by construction.
`manualChecklist` becomes the new last-standing Day 13 stub;
`library.test.ts`'s "unimplemented entry points" block now targets it,
its rationale comment updated in place rather than deleted, since the
pattern itself (a smoke test tracking which entry points still throw) is
still worth keeping for whatever stays a stub next. New unit coverage in
`test/exitCodeForScan.test.ts`: no-threshold, at-threshold, over-threshold,
and the `--fail-on 0` edge case (any violation at all fails).

Without this, `--fail-on` was a flag `scan.ts`'s action handler declared
and documented in `--help` but never read - accepted silently, did
nothing. A CLI flag that silently no-ops is a worse failure mode than one
that is missing or one that errs loudly, which is what made this worth
resolving today rather than carrying the gap forward a second time.

### D77. Diff HTML view (`report/html/renderDiff.ts`)

Restores the item dropped from Day 10's plan row by a bullet-list error
(the user's own words: "my bullet list dropped it; that was my error").
`gate.reason` sits at the top in a colour-coded banner (redundant colour
+ text, not colour alone, for the same reason the scan report never
relies on colour-only signalling). Below it: new / fixed / moved /
impact-changed sections, each grouped by `templateKey` with the same
phrasing discipline as `gate.reason` and the scan report's default view -
"N templates, M instances", never a raw instance count standing in for
"N violations." `persisting` is a one-line count, not an expandable
section (`report/diffSummary.ts` already treats it the same way, and a
site with thousands of unchanged findings should not have to render
thousands of unchanged `<details>` blocks). `unclassified` and `unknown`
get their own always-flat sections, shown whenever non-empty regardless
of the template-tier framing above them - `CLAUDE.md` invariant 4 exists
specifically to keep these visible rather than folded into "new", so they
must never be silently absorbed into a template count that would make
them look gated the same way a real new-violation template is.

Shares CSS and helpers with the scan report via a new
`report/html/shared.ts` (`escapeHtml`/`e`/`criteriaLabel`/
`sortByImpactDesc`/`plural`/`STYLE`) rather than duplicating ~90 lines of
inlined CSS a second time; `render.ts` now imports from it too, with no
behaviour change (verified: its own existing tests and the self-scan test
still pass unchanged). Each instance line shows its `ruleId` directly
(`<code>${ruleId}</code>`), not only at the template-group summary level -
needed for the `unclassified`/`unknown` sections, which are flat lists
with no per-template grouping to hang a rule id off of, so it was added
uniformly rather than as a special case for just those two sections.

Verified two ways: unit tests against synthetic `DiffResult` fixtures
covering every section, including HTML-escaping and the "no changes at
all" empty state (`test/report/html/renderDiff.test.ts`, 12 tests); and an
accessibility self-scan against a REAL diff from two real scans with
genuine new/fixed/persisting findings, same discipline as Day 10's scan
report self-test (`test/report/html/diff-self-scan.test.ts`) - zero
violations, zero best-practice findings on the rendered page itself.

### D78. `renderReport({format: 'json'})`, CLI wiring scoped to `--ungrouped`, `--fail-on` and diff `--html`

`report/json.ts`'s existing `sortKeysStably` is now exposed as
`toStableJson()`, shared by `writeReport()` and the new
`renderReport({format: 'json'})` branch so the two paths can never quietly
diverge on key ordering (`01 §11` - a committed baseline needs to diff
cleanly in a PR, which depends on that ordering staying stable).
`renderDiff()` was NOT given a `'json'` branch - not named in today's
scope (`renderReport({format:'json'})` was; `renderDiff` json was not),
and `DiffResult` isn't a committed artefact the way a baseline is, so
there's no stable-ordering requirement pulling it in for free. Left as a
`NotImplementedError` naming Day 12, alongside the CI job-summary
markdown that's already deferred there.

CLI: `scan --ungrouped` now reaches `renderReport`'s summary call;
`scan --fail-on <n>` sets `process.exitCode` via the newly-implemented
`exitCodeForScan()` (D76). `diff` gains `--html <path>`, mirroring
`scan`'s `--out`/`--html` pair, writing `renderDiff(result, {format:
'html'})` to disk - without it, the diff HTML view built today (D77)
would have no CLI surface at all, which would make "built" a stretch for
what the README's own words call the Action's actual value.

**Not in today's scope, and left that way deliberately, not silently:**
`--probes`/`--no-probes`, `--viewport`, `--locale`, `--color-scheme`,
`--settle-strategy`, `--settle-quiet-ms` and `--include-best-practice` on
`scan` remain declared-but-unwired, same state D21 and the Day 7 crawler
wiring entry left them in. Today's instruction was "`--ungrouped`,
`--fail-on`, and anything left unwired since Day 6 **pending a
renderer**" - `--fail-on` was named explicitly (D76 covers why it needed
more than just CLI wiring); the rest of that list depend on a renderer
existing, and now do (`--ungrouped` via `report/summary.ts`'s
`SummaryOptions`, both `--html` flags via `renderReportHtml`/
`renderDiffHtml`). The still-dangling flags above were never blocked on a
renderer - they were deferred to whichever day shipped what they
configure (probes: Day 9, done; viewport/locale/colour-scheme/settle:
never actually assigned a day in `00 §6`'s table). Wiring them was not
asked for today and isn't free (each is either a `ScanOptions` passthrough
with its own validation - `--viewport WxH` parsing, `--color-scheme`
enum-checking - or, for `--probes`, needs to compose correctly with
`--no-probes`), so rather than guess at scope, this is recorded as a
known, real gap for a future day to pick up explicitly.

### D79. Library public API verified through the BUILT package, not source

`00 §7` cut line 5: "if this can't ship, delete the CLI+library claim from
the README rather than ship it untested." It ships: `tsup.config.ts`
already had `dts: true` from an earlier day, and `npm run build` emits a
clean `dist/index.d.ts` (38.68 KB, all 23 public exports present) with no
new errors from today's changes (`renderDiffHtml`, `toStableJson`,
`exitCodeForScan`, the `SummaryOptions` second parameter).

New `test/smoke/built-package.test.ts` imports `dist/index.js` -
literally the file an external consumer's `import` would resolve to, not
`src/index.js` and not a shelled-out CLI subprocess (every other test in
the suite imports source, which proves the library's logic works but says
nothing about whether `tsup`'s bundling, the `playwright`/`axe-core`
externals, or declaration-file generation actually produce an importable
package). Runs `npm run build` in its own `beforeAll` rather than assuming
a prior build step, so it's correct regardless of script ordering or a
stale `dist/` left over from an earlier run. The dynamic `import()` target
is a runtime-computed `file://` URL, not a literal `'../../dist/index.js'`
string - a literal specifier is exactly what `tsc` tries to resolve
module types against, which would make `npm run typecheck` fail on a
fresh checkout before the first build; verified by temporarily moving
`dist/` aside and re-running `npm run typecheck` clean. Covers: every
named export present as a live binding (not just listed in the `.d.ts`),
identity matches `package.json`, and a full scan → every report format →
self-diff → diff HTML round trip, all through the built entry point.

Not done today: a `.d.ts`-shape assertion tool (e.g. `tsd` or `dtslint`)
was considered and skipped - the existing declaration-file test already
checks every export name is present in both the `.d.ts` text and the
runtime module, which is the gap `00 §7` cut line 5 is actually worried
about (a broken build, not a subtly wrong type signature); a full
type-level assertion suite is more machinery than today's scope asked
for and would be its own, separately-scoped addition.

---

## 2026-08-21 — Day 12

### D80. Pre-flight, before the repo went public

Checked, not assumed, per D16's own instruction to correct the LICENSE
"before the repo is published" - this is that moment.

- **LICENSE copyright holder**: was `Anudeep` (D16: inferred from an old
  git config, flagged then for exactly this check). Every actual commit is
  authored `Indra D Nakka <indra-nakka@users.noreply.github.com>`, and the
  GitHub repo is `indra-nakka/a11y-ratchet` - a real mismatch, not a
  formality. Asked; corrected to `Indra D Nakka`.
- **storageState / session cookies in history**: none. Checked the
  working tree, every file path ever committed across the full history
  (`git log --all --pretty=format: --name-only`) for
  auth/session/cookie/credential-shaped names, and pickaxed the entire
  history (`git log --all -S`) for Playwright's storageState JSON
  signature (`"cookies"`, `"origins"` as top-level keys) - zero matches
  either way.
- **Committed scan artefacts / baselines from the Wikipedia, react.dev,
  books.toscrape, Vue and MDN real-site runs**: none exist, in the working
  tree or anywhere in history. Those runs (D41-D44, D52-53, D63ish,
  D72) live in `DECISIONS.md` as numbers and prose, generated via
  scratchpad scripts against a locally built `dist/`, never committed as
  files - confirmed by listing every path ever committed outside
  `src/`/`test/`/`docs/`/`.github/`/`scripts/` and finding nothing
  report-or-baseline-shaped. Nothing to publish "deliberately, not by
  accident" here because nothing was ever at risk of the accident.
- **`.gitignore`**: `node_modules/`, `dist/`, `coverage/`,
  `*.tsbuildinfo`, `.a11y/*.local.json`, editor/OS cruft and `.env*`
  (with `.env.example` explicitly un-ignored) were already in place from
  earlier days. `.a11y/*.local.json` deliberately does NOT ignore
  `.a11y/baseline.json` itself (`01 §11`: the baseline is meant to be
  committed) - confirmed this is intentional, not a gap, before today's
  own baseline (D84) landed in that same directory.
- **Repo visibility, description, topics, Issues**: was private, no
  description, no topics. Asked whether to flip visibility now or leave
  it for later; told to flip now. Set to public, description added,
  topics `accessibility`/`wcag`/`axe-core`/`playwright`/`a11y` added.
  Issues was already enabled.

### D81. `playwright` pinned exact; a pre-existing `npm run typecheck` failure found and fixed

`playwright` was `^1.62.1` in `package.json` (a caret range) while
`axe-core` has been exact-pinned (`4.13.0`, no caret) since Day 1
specifically so a dependency bump can't silently shift results - the
Chromium binary Playwright installs is tied to the `playwright` package
version, so the same reasoning applies to it now that a public CI
consumer could `npm ci` and land a newer Chromium than whatever main was
verified against. Repinned to `1.62.1` exact (already what was locked),
regenerated `package-lock.json` (`npm install --package-lock-only` -
one-line diff, no transitive changes since it was already resolving to
that exact version).

Separately, `npm run typecheck` was already failing on a clean `main`
before any of today's changes (confirmed with `git stash`):
`test/fixtures/server.ts`'s `start()` returned a module-scope `let
origin: string | null`, and TS's control-flow analysis does not retain a
`while`-loop-body narrowing of a mutable outer-scope variable across the
loop's exit, even though the only exit path (`server = instance; origin =
...`) always sets both together. Not something today's changes caused,
but pre-flight for a public repo has to mean "does the build actually
pass," not just "did I break it further" - fixed by returning the
computed origin directly from inside the loop (a `throw
new Error('unreachable')` after it satisfies the return type without a
non-null assertion papering over the gap). Verified: `npm run typecheck`
clean both before and after this fix relative to today's other changes
(isolated with `git stash`).

### D82. `report/diffTemplateGroups.ts` — the template-tier grouping extracted, not duplicated a third time

The CI job-summary markdown (D84) needs the same "group a diff bucket by
`templateKey`, highest impact wins" logic Day 11's HTML diff view
(`report/html/renderDiff.ts`) already has inline. Extracted into its own
module (`groupFindingsByTemplate`/`groupPairsByTemplate`/
`diffGroupInstanceCount`) rather than copy the ~50 lines a second time or
have the markdown renderer reach into the HTML module's internals.
`report/html/renderDiff.ts` now imports from it too - verified zero
behaviour change (its own 12 tests and the real-catalogue self-scan test
still pass unchanged).

### D83. The Action's engine-drift input is `allow-engine-drift`, not `allow-incompatible` — and it maps to exit 4, not exit 6

Today's task described the axe-core-version escape hatch as hitting
"exit 6" and asked for an `allow-incompatible` input. Both `01 §3`
("Engine-drift guard") and the existing library code disagree with that,
consistently with each other: diffing across `axe-core` versions is exit
**4** (`Engine drift without --allow-engine-drift`), and the Action input
`01 §3` itself specifies is named `allow-engine-drift: true`. Exit **6**
is a different guard entirely - `incompatibleRunConfig`
(`mode`/`viewport`/`locale`/`colorScheme`/`bypassCSP` mismatches, D5) -
and `types.ts`'s own comment on it is explicit: "refuses the diff (exit
code 6) — always, with no override flag, **unlike engineDrift**." D5's
reasoning: a light-mode baseline diffed against a dark-mode head produces
"phantom contrast regressions of the same class as engine drift," so
allowing an override here would reopen exactly the false-regression risk
the guard exists to close - unlike engine drift, where the override is
safe because the PR is *deliberately* bumping a version and the banner
makes that visible in the report.

Followed the docs rather than the task's wording (`CLAUDE.md`: docs are
authoritative; deviate from a doc and note why, not from a request that
conflicts with one that's already settled and self-consistent across two
independent sources). The Action's `allow-engine-drift` input maps to
`--allow-engine-drift` / exit 4, exactly as `01 §3` specifies. No input
exists for exit 6, and none should - see the final report on whether
exit 6 is recoverable in CI for what that means in practice for someone
who hits it.

### D84. CI job-summary markdown (`report/stepSummary.ts`) and the composite Action

`renderDiffStepSummary(result, headReport)` is a standalone library
export, not a third `renderDiff()` format - it needs the HEAD run's
`Report` for its per-page `error`/`settleDegraded`/`probeBlindRegions`
section, which a bare `DiffResult` does not carry (only page URL lists,
not per-page detail), so it doesn't fit `renderReport`/`renderDiff`'s
uniform `(data, ReportOptions)` shape. Wired to the CLI as `diff --format
markdown` instead, since the `diff` command already has both `base` and
`head` loaded off disk. Order, fixed: `gate.reason` first, then
template-tier counts (a table, filtered to non-empty rows; persisting and
unknown as one-line counts, unknown broken down by reason so a page-error
never reads the same as a page-added), then a pages table containing
ONLY pages that carry a flag - not the full page list, so a summary for a
real crawl doesn't bury the pages that need a look under dozens of clean
ones.

`action.yml`: a composite action wrapping the built CLI, not a bundled TS
action - `npm run build` inside the Action's own steps IS the release
process, nothing to separately publish or keep in sync. Inputs: `url`,
`baseline` (default `.a11y/baseline.json`), `max-depth`, `mode`,
`config`, `allow-engine-drift` (D83). Steps, in order: setup Node, cache
+ install the Action's OWN dependencies (`${{ github.action_path
}}/node_modules`, keyed on its `package-lock.json` hash), cache + install
Chromium (`~/.cache/ms-playwright`, same key - D81's exact pin is what
makes this cache key exact too), build, check the baseline file exists
BEFORE the slow scan step (a missing baseline fails in seconds, prints
the exact local `scan --out` command per `01 §11`'s "never writes to the
repository" rule, never generates one silently), scan, diff (captures its
own exit code via `set +e; ...; exit $code` so the step's outcome IS
a11y-ratchet's real exit code - 0/1/3/4/6, never miscategorised as a
generic failure), then an `if: always()` step that writes
`$GITHUB_STEP_SUMMARY` from the markdown on success OR from the
captured error + exit-code-specific guidance when the diff was refused
outright (3/4/6) and no `DiffResult` exists at all to render.
`github.action_path` used for every reference to the Action's own
files/dependencies; caller-relative paths (baseline, config) used
un-prefixed, so the same `action.yml` is correct both for this repo's own
demo workflow (`uses: ./`) and for an external consumer
(`uses: indra-nakka/a11y-ratchet@<ref>`, where the two directories are
genuinely different on disk).

### D85. Demo PRs, a real caching bug, and exit 6 in practice

Two live PRs against this repo's own demo workflow, per the task's "done
when": [#1](https://github.com/indra-nakka/a11y-ratchet/pull/1) (a member
photo added without `alt`) fails the gate, exit 1, confirmed from the
Action's own logs, not just expected from the diff logic in isolation.
[#2](https://github.com/indra-nakka/a11y-ratchet/pull/2) (a text-only
content addition) passes, exit 0. Both linked from the README's GitHub
Action section.

The first real run of `action.yml` (against #1) failed immediately, on
`Cache a11y-ratchet's own dependencies` - `hashFiles()` cannot read paths
under `github.action_path`, only `$GITHUB_WORKSPACE`; the double-slash in
`format('{0}/package-lock.json', github.action_path)` was a symptom, not
the cause. This would have failed identically for an external consumer
(`uses: owner/repo@ref`, where the Action's own checkout is a genuinely
different directory from the workspace, not merely a formatting quirk of
a local `uses: ./`). Fixed by hashing the lockfile by hand
(`sha256sum`, `id: cache-key`) from a step that actually runs with
`working-directory: ${{ github.action_path }}`, which has no such
restriction - only the `hashFiles()` *expression function* is
workspace-scoped, not shell commands. This is exactly the kind of gap a
demo PR is supposed to catch before an external user does; caught within
the first live run, not shipped.

**Whether exit 6 can actually be triggered and recovered from in CI:**
triggered, yes - trivially. Base and head runs need only differ in
`mode`/viewport/locale/colour-scheme/`bypassCSP` for `diff()` to refuse
(`types.ts`'s `RunIncompatibility`). In this Action's own shape that
means: someone edits the `mode:` input on `action.yml`'s calling
workflow (or a config file changes `viewport`/`colorScheme` defaults)
without regenerating the baseline under the new settings. **Recovered
from, yes, but not via any flag** - by design, per D83, there is no
`allow-*` input for this the way there is for engine drift. The actual
recovery path is: run `a11y-ratchet baseline regenerate` locally under
the SAME settings the workflow now uses, and commit the result. The
Action's job summary (`report/stepSummary.ts`'s fallback branch, exit
3/4/6 case) prints this explicitly rather than leaving a bare stack
trace, specifically because this is "the path most likely to strand a
real user" - someone who doesn't already know the baseline is
settings-sensitive would otherwise have no way to guess that changing
one workflow input broke the gate outright with no override to reach
for. The one real gap: nothing in this Action *warns* when a workflow's
own `mode`/`config` input changes in the same PR that would trigger this
- it is only caught when the diff actually runs and refuses. Acceptable
for today's scope (the refusal itself is correct and loud, `01 §10`'s
whole point), but a pre-emptive lint/warning on `action.yml` input
changes would be a natural Day 13+ addition if this proves to strand
people in practice.
