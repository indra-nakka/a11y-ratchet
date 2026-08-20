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
