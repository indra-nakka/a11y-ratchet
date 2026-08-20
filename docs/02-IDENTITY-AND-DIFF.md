# 02 — Identity and Diff

**The core of the project. Design and test it before writing the crawler.**

---

## 1. The problem

To say "this violation is new," you must say "this is the same one as last time." Every
naive approach fails:

| Approach | Fails when |
|---|---|
| CSS selector | anyone adds a wrapper, reorders siblings, or renames a class |
| `nth-child` path | a list gains an item |
| `outerHTML` hash | any text or attribute changes |
| `ruleId` + URL | multiple instances of one rule on a page |

A selector-based diff reports sixty regressions the first time someone refactors a
component. The team disables the gate. Everything else is downstream of this.

## 2. Goals, in priority order

1. **No false regressions.** A persisting finding must never be reported as new. This is
   the trust-critical direction — a false "new violation" blocks a PR for no reason.
2. **No false fixes.** A persisting finding must not be reported as fixed.
3. **Stable across cosmetic change.** Wrappers, reordering, class renames, generated IDs.
4. **Sensitive to genuine relocation.** Footer → header is `moved`, not `unchanged` — but
   also not `new + fixed`.

3 and 4 pull against each other. Resolve toward 1: prefer over-matching (`moved`) to
under-matching (`new`).

## 3. Fingerprint construction

A hash over **tiered element identity**, deliberately excluding the raw CSS selector.

### 3.1 Identity tiers — first available wins

```
Tier 1  authored id      element.id, if it survives the generated-id filter
Tier 2  test hook        data-testid | data-test | data-qa | data-cy
Tier 3  accessible name  computed AccName, normalised (§3.3)
Tier 4  semantic path    role/landmark path from nearest landmark ancestor
Tier 5  structural path  tag + same-tag sibling index from nearest stable ancestor
```

Tier 5 is restricted to **same-tag sibling index** (`3rd <li> among <li> siblings`), not
absolute position. Absolute index breaks when an unrelated `<div>` is inserted; same-tag
index survives it. Record the tier on the finding.

Handle these node types explicitly or Tier 4/5 will produce garbage:

- **Shadow DOM** — identity path crosses host boundaries; record `shadowPath` (§`01 §6.1`).
- **SVG** — `element.className` is an `SVGAnimatedString`, not a string. Use
  `getAttribute('class')`. `<use>` references have no meaningful subtree.
- **Pseudo-elements** — axe reports the originating element; nothing extra needed, but
  don't attempt to path into `::before`.
- **iframes** — frame path is a separate axis, already in `frameSelector`.

### 3.2 Generated-id filter

Framework IDs are worse than none: stable within a run, different between builds. Reject:

```
/^:r[0-9a-z]+:$/i     React useId          /^radix-/         Radix
/^headlessui-/        Headless UI          /^mui-/           MUI
/^:[a-z0-9]+:$/i      generic scoped id    /[0-9a-f]{8,}/i   embedded hash
/\d{5,}/              long numeric run     /^(ember|ng-)/    Ember / Angular
```

Config-extensible via `identity.ignoredIdPatterns`. You will not guess every framework.

### 3.3 Normalisation

```
collapse whitespace · trim · lowercase · strip zero-width and directional marks
mask every embedded digit run    ->  "#"
mask ISO dates/times             ->  "#date"
mask currency amounts            ->  "#money"
truncate to 80 chars
```

**Corrected during Day 5's golden pairs (`DECISIONS.md` D33):** the original text said
"digit runs of length >= 2," leaving single-digit counts unmasked. Golden case 5 ("3
results" → "17 results" must be `persisting`) shows that's wrong — a one-digit count is
exactly as common as a two-digit one, and the worked example below already masks both
regardless of length. Every embedded digit run masks now, no length threshold.

**Exception, added after review:** if the normalised string consists *entirely* of digits
and punctuation, do **not** mask it. Otherwise a pagination bar labelled "10 11 12 13 14"
collapses all five controls into one fingerprint and 1-to-1 diff pairing breaks.

The rule is: mask digits *embedded in* text ("page # of #"), preserve digits that *are*
the text ("12").

### 3.4 Context signal

```
nearestLandmark   role of nearest landmark ancestor, or 'none'
headingContext    normalised text of nearest preceding heading, or 'none'
inFrame           frame path
```

Context distinguishes "unlabelled button in the nav" from "unlabelled button in the cookie
banner." Note that `headingContext` is per-page by nature — which is why it must **not**
appear in `groupKey` (§4).

### 3.5 The hash, and collisions

```ts
fingerprint = sha256([
  ruleId, source, identityTier, identityValue, contextSignal, urlTemplate
]).slice(0, 16);
```

Excluded from identity: raw CSS selector, `outerHTML`, absolute sibling indices, axe
`impact` (it changes between axe versions — track it as a *change*, not an identity), and
attributes other than the identity hooks.

**Collision disambiguation.** Genuine ties remain — three identical unlabelled icon buttons
in one toolbar. When N findings on a page share a fingerprint, suffix each with its ordinal
in document order: `a1b2c3d4#0`, `a1b2c3d4#1`. Ordinals are stable as long as the group's
size and order are, and when the group changes size the fuzzy pass (§5) handles the
remainder. Without this, N-to-1 collapse silently loses findings.

## 4. Group key

Corrected from the first draft, where `groupKey` inherited `headingContext` and therefore
varied per page — defeating its only purpose. Grouping needs a **strictly weaker** signal:

```ts
groupKey = sha256([ ruleId, source, accessibleName ?? identityValue, landmarkRole ]);
```

No heading, no URL template, no structural path, no ordinal. Verify empirically that a site
nav produces one group across all pages before trusting the Day 14 audit estimate.

## 5. URL templating

```
/product/1234       -> /product/:id
/users/8f3e-...     -> /users/:uuid
/a/9f8e7d6c5b       -> /a/:hash
/2026/08/20/post    -> /:year/:month/:day/post
trailing slash      -> normalised off
query params        -> sorted; utm_*/fbclid/gclid/ref stripped; ?page=2 preserved
fragment            -> stripped unless config.hashRouting = true
```

SPAs with hash routing need `hashRouting: true` or every route collapses to one.

## 6. Matching — two passes

### Pass 1 — exact

Index baseline by fingerprint. Present → `persisting`. Remove both from the pools. On a
healthy codebase this resolves 90%+.

### Pass 2 — fuzzy, over the remainder

Only candidates sharing `ruleId` **and** `source`. Revised weights:

| Signal | Weight | Note |
|---|---|---|
| accessible name equal (normalised) | 0.35 | |
| context signal equal | 0.25 | landmark + heading |
| normalised text content equal | 0.20 | |
| same `urlTemplate` | 0.10 | |
| DOM depth distance (`1 / (1 + |Δdepth|)`) | 0.10 | replaces selector Jaccard |

Selector token Jaccard was dropped: under CSS-modules or Tailwind class-hash churn — the
exact scenario fuzzy matching exists for — Jaccard drops to near zero, so the signal
vanishes precisely when needed. DOM depth distance survives class renames. Landmark
lineage was *not* added as a separate signal because it already lives in `contextSignal`;
adding it would double-count.

Greedy assignment by descending score; accept at **≥ 0.65**. Tune against the goldens,
record the tuning, expose as `diff.matchThreshold`.

Matched in pass 2 → `moved` (identity changed) or `impact-changed` (only impact differs).

**Pass 2 is optional.** If Days 4–6 overrun, ship exact-match only and report the remainder
as `unclassified` rather than `new`. That degrades safely: no false regressions, just less
information. Do not ship a half-tuned fuzzy matcher.

### Pass 3 — remainder

Unmatched current → `new`. Unmatched baseline → `fixed`.

## 7. Page-set changes

If `/pricing` 404s this run, its findings vanish. Naively that's twelve "fixes" — the
report celebrates a regression. Partition pages *before* diffing findings:

```
pagesInBoth      -> diff normally
pagesOnlyInBase  -> 'unknown-page-removed', NOT 'fixed'
pagesOnlyInHead  -> 'unknown-page-added',   NOT 'new'
pagesErrored     -> 'unknown-page-error'; errors reported separately
```

`unknown-*` never affects the exit code by default. `newPagePolicy` (`fail|warn|ignore`,
default `warn`) can promote `unknown-page-added`.

A page that errored in one run and loaded in the other is the highest-value warning the
diff emits — it usually means the crawl is broken, not the site.

## 8. Gate semantics

Undefined in the first draft. `gate.passed` is false when **any** of:

| Category | Gates by default | Rationale |
|---|---|---|
| `new` (violation, source=axe) | **yes** | the core contract |
| `new` (needs-review) | no | inconclusive by definition |
| `new` (source=probe) | no | heuristic; see `01 §6.4` |
| `impact-changed`, severity increased | **yes** | moderate → critical on the same element is a regression |
| `impact-changed`, severity decreased | no | improvement |
| `moved` | no | same defect, different place — report it, don't block on it |
| `unknown-page-added` | per `newPagePolicy` (default warn) | |
| `unknown-page-removed` / `-error` | no | but surfaced prominently |

All configurable under `gate.*`. `gate.reason` must read like a sentence a person wrote —
*"3 new serious violations on 2 pages (1.4.3, 4.1.2); 1 moved; 2 fixed."* That string is
what most people will ever see of this tool.

## 9. Golden fixtures

Table-driven, built **before** the matcher.

**Must be `persisting`** (zero tolerance — these are the false-regression guards):

1. Wrap the element in a `<div class="wrapper">`
2. Add three unrelated siblings before it
3. Rename all CSS classes (CSS-modules hash change)
4. Change a React `useId` (`:r1:` → `:r7:`)
5. Change "3 results" to "17 results"
6. Reorder two unrelated page sections
8. Page moves `/product/1` → `/product/2`
9. Whitespace-only reflow of the document
10. **Add an unrelated new violation elsewhere on the page**
11. Move the element into an open shadow root
12. Add `scroll-margin-top` to an unrelated element

**Must be `new`:** 13. second unlabelled button in a different landmark · 14. unlabelled
button, different accessible name, same landmark · 15. passing image loses its `alt`

**Must be `fixed`:** 16. label added · 17. element removed

**Must be `moved`:**

18. same control relocated `<footer>` → `<header>`
7. **Corrected during Day 5/6 (`DECISIONS.md` D35, D42):** `<div role="button">` →
   `<button>`, same defect. Originally listed under "must be `persisting`," but axe-core
   genuinely reports this pair under two different rule ids (`aria-command-name` vs
   `button-name`), and `ruleId` is a fingerprint input by design (`§3.5`) — no amount of
   identity-layer cleverness makes two different rules hash the same without breaking the
   far more important guarantee that distinct rules on one element stay distinct. Moved
   here: pass 2's `ruleEquivalence` table (`wcag/ruleMap.ts`, Day 6) treats
   `aria-command-name`/`button-name` as equivalent for fuzzy-match candidacy, so the
   matcher classifies it `moved` — same element (`identity.value` unchanged), different
   rule label. Not `persisting`; the rule genuinely changed. Not `new`+`fixed` either,
   which would hide that it's the same defect.

**Must be `impact-changed`:** 19. contrast 4.4:1 → 2.1:1 on the same element

**Must pair 1-to-1:** 20. pagination "10 11 12 13 14" → "20 21 22 23 24" — five findings in,
five out, no collapse (the §3.3 masking exception)

**Case 10 is the one people get wrong.** Adding a violation must not perturb the identity
of existing ones. Any document-global input to the fingerprint breaks this.

## 10. Diff output

```ts
interface DiffResult {
  base: { runId; startedAt; toolVersion; axeCoreVersion; mode };
  head: { runId; startedAt; toolVersion; axeCoreVersion; mode };
  engineDrift: boolean;
  modeMismatch: boolean;
  pages: { inBoth: number; onlyInBase: string[]; onlyInHead: string[]; errored: string[] };
  findings: {
    new; fixed; persisting; unclassified;
    moved: Array<{ from: Finding; to: Finding }>;
    impactChanged: Array<{ from: Finding; to: Finding }>;
    unknown: Finding[];
  };
  gate: { passed: boolean; reason: string; countedAgainstGate: number };
}
```
