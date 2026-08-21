# Churn-resistance demo — raw result

External review task 4. Tests the README's Diff-section claim directly: does a
wholesale, cosmetic-only refactor of a page (wrapper divs, hash-renamed classes, DOM
reorder that doesn't change visual order) get correctly diffed as no change, the way
selector-based identity famously cannot?

**It did not come out clean.** Reported raw, not fixed up, per instruction.

## The two states

- `pre-refactor.json` — commit `ce8b009`. The clean demo site (`../index.html`'s
  pre-refactor form) with three real defects introduced: `alt` removed from Amara's and
  Priya's portraits (2× `image-alt`, 1.1.1), footer text colour lowered to `#b3b3b3`
  (`color-contrast`, 1.4.3).
- `post-refactor.json` — commit `e4e9533`. The same three defects, on a wholesale
  structural refactor of the same page: every class renamed to a hash-shaped name, an
  extra wrapper `<div>` around every top-level section, and the three member cards
  reordered in the DOM (visual order preserved via CSS `order`, verified with
  `getBoundingClientRect` before scanning — not assumed).

Not diffed against the repo's own committed `.a11y/baseline.json` — that file has zero
findings (the demo site's clean state), so a diff against it would be vacuous for this
purpose. This pair is the comparison point instead.

## The diff (`diff.json`, `a11y-ratchet diff pre-refactor.json post-refactor.json`)

Gate: **FAILED**. 1 new, 1 fixed, 1 moved, 1 persisting — for three defects that never
actually changed.

| Defect | Result |
|---|---|
| `color-contrast`, footer `<p>` | `persisting` — exact fingerprint match |
| `image-alt`, Amara's photo | half of a `moved` pair (misclassified — see below) |
| `image-alt`, Priya's photo | the other half of the same `moved` pair, plus a spurious `new` and a spurious `fixed` |

## Root cause, traced through the identity data directly

**Part 1 — the wrapper `<div>` alone changes Tier 4 identity.** Both alt-less images have
an empty accessible name (the `alt` attribute is entirely absent, not `alt=""`), so they
resolve at Tier 4 ("semantic path"), never reaching Tier 3. `buildSemanticPath()`
(`src/scan/axe.ts`) walks the ancestor chain from the nearest landmark and calls
`roleForElement()` on each node; a plain `<div>` has no ARIA role and no implicit role, so
`roleForElement()` falls back to the literal tag name (`IMPLICIT_ROLES[tag] ?? tag`). One
extra wrapper `<div>` therefore adds one extra literal `"div"` segment to the path
(`main > div > div > img` → `main > div > div > div > img`), which changes `groupKey`,
`templateKey`, *and* the fingerprint — not a cosmetic difference, a real identity change.

The existing "must be persisting" golden fixture for exactly this case
(`test/identity/golden-pairs.test.ts`, `/01-wrapper/`) does not catch this, because its
target element is `<img id="chart" ...>` — an authored `id` resolves at Tier 1 and never
reaches Tier 4 at all. The golden suite's wrapper-div guarantee is real for elements with
a stronger identity signal; it was never exercised for a Tier-4 element, and this demo is
the first place that happened.

**Part 2 — the reorder then cross-wires the fuzzy match.** With exact fingerprints broken
by Part 1, Pass 2 (fuzzy matching, `02 §6`) is what's left, and `headingContext`
("nearest preceding heading" — part of both the exact-match `contextSignal` and a 0.25
fuzzy weight) is itself DOM-order-dependent: each image sits *before* its own `<h3>`, so
its heading context is whichever *previous* card's name precedes it in document order.
Reordering the cards changes that value for both images. Compared directly
(`identity.context.headingContext`):

| | pre-refactor | post-refactor |
|---|---|---|
| Amara's image | `"this term's officers"` | `"devon ruiz"` |
| Priya's image | `"devon ruiz"` | `"amara osei"` |

Post-refactor Amara's headingContext (`"devon ruiz"`) coincides with pre-refactor Priya's
(`"devon ruiz"`) — pure coincidence of the reorder, not a real relationship between the
two images. The greedy fuzzy matcher pairs them as `moved`, leaving pre-refactor Amara
unmatched (→ `fixed`) and post-refactor Priya unmatched (→ `new`). Two real, unchanged
defects; one reads as a regression and one reads as a fix that never happened.

No fix is proposed here — reported raw, as asked.
