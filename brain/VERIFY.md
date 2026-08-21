# VERIFY — human + browser protocol

**You need:** Chrome or Edge (Chromium), DevTools, roughly 2–3 hours.

Every row below is a **template** — one defect pattern — not a single element. Row 1 covers
268 instances. You verify the pattern once, on the example element given, and the verdict
applies to the template.

Nobody and nothing else can do this. A verdict requires rendered pixels or a live
accessibility tree; inferring one from a selector string is the exact failure this project
exists to argue against.

---

## Correction to the earlier count — read this first

The session record said "24 rows need verdicts, 2 already established." Checking that against
the actual queue, only **one** row is clearly established: **row 26**, the churn cluster.

The second "established" verdict was recorded as *"the 6 nav-bar `bgOverlap` findings."*
The only `bgOverlap` row in the queue is **row 18** — but row 18 is `.link-text` "hello
world" on `/examples/`, 305 instances. Not the nav bar, not 6 findings, different page.

Same axe `messageKey`, different element. A traced mechanism for the nav bar does not
transfer to a different element on a different page just because the error code matches —
that is reasoning from a label instead of from a measurement.

**Treat row 18 as needing verification. 25 rows, not 24.** If you find it *is* the same
mechanism, say so explicitly and record how you established it.

---

## R3.0 — Before opening a browser

```bash
cd a11y-ratchet
cp audit/2026-08-20/verification-queue.tsv audit/2026-08-20/verification-queue.backup.tsv
mkdir -p audit/2026-08-20/evidence
```

The file has 17 columns and 26 data rows. Column 17 is `verdict`, empty throughout. Columns
12–15 (`fgColor`, `bgColor`, `contrastRatio`, `colorNote`) are populated for Group 2 only.

Add four columns to the right of `verdict` — **add, never overwrite**:

| Column | Values |
|---|---|
| `mechanism` | required for `false-positive` and `arguable`. One sentence: *why* the tool was wrong |
| `evidence` | screenshot path under `audit/2026-08-20/evidence/` |
| `verified_by` | your name or handle |
| `verified_at` | ISO date |

**Verdict vocabulary:**

| Verdict | Means |
|---|---|
| `true-positive` | Reproduced, and it genuinely fails the criterion |
| `false-positive` | Reproduced, and it does not fail. `mechanism` required |
| `arguable` | Reproduced, turns on an exception or an interpretation. `mechanism` required |
| `not-reproduced` | Not present on the live site today |

---

## R3.1 — Match the scan conditions

1. **Turn off ad blockers and privacy extensions** for vuejs.org and ocw.mit.edu. The scan
   ran in `audit` mode with third-party requests **allowed**. Third-party content is
   directly implicated in rows 7, 18 and 26 — blocking it changes the answer.
2. DevTools → device toolbar (`Ctrl/Cmd+Shift+M`) → **Responsive, 1280 × 800**, zoom 100%.
3. DevTools → `Ctrl/Cmd+Shift+P` → "Show Rendering" → **Emulate prefers-color-scheme:
   light**.
4. The scan ran **2026-08-20**. These are live sites.

> `not-reproduced` is a real verdict, not a failure. A defect that was fixed and one that was
> never real look identical from here, and folding them together corrupts the precision
> figure. Record it and move on.

---

## R3.2 — Group 1: 13 structural templates

All checkable in the accessibility tree. The loop for every row:

1. Open the `exampleUrl`.
2. `Ctrl/Cmd+F` **inside the Elements panel**, paste the selector. No match → try the
   distinctive class alone → still nothing → `not-reproduced`.
3. Select the element, open the **Accessibility** pane (Elements → right sidebar →
   `Accessibility`; if hidden, `>>`).
4. Read **Computed Properties**: `Name`, `Role`, warnings.
5. Screenshot, record.

| # | Rule | Instances | URL | Selector | What decides it |
|---|---|---:|---|---|---|
| 1 | `link-name` | 268 | `/about/team.html` | `a[href="https://github.com/yyx990803"]` | **Start here.** Is `Name` empty? Check for `title`, `aria-label`, or a visually-hidden `<span>` inside the `<a>`. Empty name on a link is the defect. |
| 2 | `target-size` | 66 | `/about/team.html` | `.desc-link.vt-link` (long nth-child chain; the accessible name is `vue-devtools`) | Measure the element box in the Elements pane. Under 24×24 CSS px fails 2.5.8 — **unless** it is inline text within a sentence, which is an exception axe cannot evaluate. If inline → `arguable`, mechanism "inline exception." |
| 3 | `link-in-text-block` | 64 | `/about/team.html` | `a[href$="livestorm.co/"]` | 1.4.1. Is the link distinguished from surrounding text by **anything other than colour**? Underline, weight, icon. Hover doesn't count — it must be distinguishable at rest. |
| 4 | `list` | 29 | `ocw.mit.edu/search/` | `.nav` | Expand it. Are the direct children of the `<ul>`/`<ol>` anything other than `<li>`, `<script>`, `<template>`? A `<div>` wrapper is the classic true positive. |
| 5 | `aria-required-children` | 29 | `ocw.mit.edu/search/` | `section` (name: "opencourseware search results") | What role does it declare, and does it contain that role's required children? Read `Role` in the Accessibility pane, then check the children. |
| 6 | `link-in-text-block` | 26 | `/ecosystem/themes.html` | `.link[href$="ui.nuxt.com/"]` | Same test as row 3. Likely the same underlying cause — note if so. |
| 7 | `frame-title` | 24 | `vuejs.org/` | `iframe` | Does the `<iframe>` have a `title`? Then: **is it third-party?** An untitled ad frame is a true positive about the page but not first-party remediable — record `true-positive` and note "third-party" in `mechanism`. |
| 8 | `target-size` | 20 | `ocw.mit.edu/courses/wgs-160j-…-fall-2019/` | `#nav-button_desktop_015aad82-9b9e-…` | Measure the box. Same 24×24 test and same inline exception as row 2. |
| 9 | `select-name` | 3 | `/guide/essentials/forms.html` | `.demo:nth-child(49) > select` | Does the `<select>` have an accessible name — `<label for>`, `aria-label`, wrapping `<label>`? These are docs demos; an unlabelled demo control is still a real 4.1.2 failure. |
| 10 | `probe/keyboard-trap` | 2 | `/tutorial/` | `textarea` | **See R3.5 — do not verdict this from the Elements panel.** This one needs the key-sequence test. |
| 11 | `label` | 2 | `/tutorial/` | `textarea` | Same element as row 10, different rule. Does the CodeMirror `<textarea>` have a label? Independent of the trap question — verdict it separately. |
| 12 | `target-size` | 2 | `ocw.mit.edu/courses/wgs-160j-…` | `.course-info-department.strip-link-offline` (name: "women's and gender studies") | Box measurement. This one is plain inline text in a metadata list — the inline exception is very likely to apply. Expect `arguable`. |
| 13 | `duplicate-id-aria` | 1 | `ocw.mit.edu/courses/22-081j-…-fall-2010/` | `.partial-collapse.collapse` | Read the element's `id`, then run `document.querySelectorAll('[id="THAT_ID"]').length` in the Console. Greater than 1, **and** the id is referenced by an ARIA attribute → true positive. |

**Note on row 8.** That id embeds a UUID (`015aad82-9b9e-…`). The generated-id filter has a
`[0-9a-f]{8,}` pattern that should reject it. The selector column is display-only so this
may be harmless — but if the fingerprint took it as Tier 1 identity, it would churn between
builds. OCW was byte-identical across both runs, so it evidently didn't. Worth a
`brain/BUGS.md` note and a check of `identityTier` for that finding in the report JSON.

---

## R3.3 — Group 2: 12 `color-contrast` templates

All on vuejs.org. Ten carry real colour data; two do not.

### Per row

1. Open the URL, confirm 1280×800 and light scheme.
2. Find the element, then in the **Styles** pane click the colour swatch next to `color`.
   DevTools shows the contrast ratio with AA/AAA markers.
3. **Check the computed font size and weight before deciding.** This is where verification
   usually goes wrong:

| Text | Required at AA (1.4.3) |
|---|---|
| Normal | **4.5 : 1** |
| Large — ≥ 24px, **or** ≥ 18.66px and bold | **3 : 1** |

4. Screenshot the picker showing the ratio.

| # | Inst. | URL | Selector / name | fg | bg | Ratio | The question |
|---|---:|---|---|---|---|---:|---|
| 14 | 140 | `/about/team.html` | `.org` — "creator @ vue.js" | `#757575` | `#f9f9f9` | **4.37** | **Marginal — 0.13 under.** Confirm the font is not large. If normal, it fails. |
| 15 | 18 | `/ecosystem/themes.html` | `.action-link` — "see more themes from nuxt ui" | `#42b883` | `#ffffff` | 2.49 | Vue brand green on white. Clear fail unless large text. |
| 16 | 113 | `vuejs.org/` | `.vt-flyout-button-text` — "docs" | — | — | — | `colorNote`: **not reproduced on live re-check.** Try once more; if still absent → `not-reproduced`. |
| 17 | 19 | `/examples/` | `.options-label` — "options" | `#bbbbbb` | `#f9f9f9` | 1.82 | Very low. Check whether it labels an *active* control — 1.4.3 exempts inactive UI components. |
| 18 | 305 | `/examples/` | `a[href$="examples/#hello-world"] > .link-text` | — | — | **0** | `messageKey: bgOverlap`. **See the correction at the top of this file — verify, don't assume.** Watch the page for ~3s after load; if the ratio resolves once layout settles, that is the artifact. Then check it in `ci` mode too. |
| 19 | 44 | `/about/team.html` | `a[href$="evanyou.me"]` | `#42b883` | `#f9f9f9` | 2.37 | Brand green again. |
| 20 | 278 | `/about/team.html` | `.desc-link` — "vuejs/*" | `#42b883` | `#f9f9f9` | 2.37 | Brand green again. |
| 21 | 237 | `/guide/introduction.html` | `.outline-link` — "what is vue?" | `#777777` | `#ffffff` | **4.47** | **The most marginal row — 0.03 under.** Sidebar outline links, small text. Check size/weight carefully; DevTools rounding may show 4.5. If it lands exactly on the line, `arguable` with the measured value. |
| 22 | 78 | `vuejs.org/` | `kbd:nth-child(1)` — "ctrl" | `#bfbfbf` | `#ffffff` | 1.83 | Keyboard-shortcut hint. Informational, not an inactive control — but check. |
| 23 | 52 | `/guide/introduction.html` | `p > a` — "javascript" | `#42b883` | `#f9f9f9` | 2.37 | Brand green in body text. Related to rows 3 and 6. |
| 24 | 121 | `/guide/introduction.html` | `.language-template > .lang` | `#707376` | `#24292e` | 3.07 | Code-block language label on dark. Fails at normal size, passes at large. Measure it. |
| 25 | 224 | `/guide/introduction.html` | `p:nth-child(21) > a` — "ways of using vue" | `#42b883` | `#ffffff` | 2.49 | Brand green again. |

### The pattern to write up

**Five of the twelve rows are the same colour: `#42b883`, Vue's brand green, on white or
near-white.** Rows 15, 19, 20, 23, 25 — plus rows 3 and 6 (`link-in-text-block`) are the
1.4.1 consequence of the same decision.

That is one design-token choice producing seven queue rows and roughly 400 instances. If
your verdicts confirm it, it is the single most useful thing in README §6: not "the tool
found 2,892 contrast violations" but "one brand colour, chosen once, is most of them."
Grouping is what makes that visible, and demonstrating it is the point of the whole
`templateKey` tier.

---

## R3.4 — Group 3: row 26, the churn cluster

Verdict established: measurement artifact. 130 findings appearing as `new` between two
identical back-to-back runs.

The selector column carries the breakdown: 44 nav-bar elements, 44 Carbon-Ads-named classes,
11 srcless ad-shaped iframes, 9 on `/partners/` from new partner-card content.

Record `false-positive`, mechanism: *third-party ad iframe transiently overlaps the nav bar;
axe cannot resolve a background under an overlapping element and returns contrastRatio 0;
resolves once layout settles and is absent entirely in `ci` mode.*

Note the 9 `/partners/` members separately — new partner card content between runs is a
**genuine content change**, not the overlap mechanism. Two causes in one cluster.

---

## R3.5 — The Esc-then-Tab test

**The highest-value 15 minutes in the pass.** It decides row 10's verdict *and* whether an
issue gets filed against Vue at all.

**URLs:** `https://vuejs.org/tutorial/` and `https://vuejs.org/examples/`

Day 9's probe pressed Escape and Tab **independently** — never in sequence. CodeMirror 5 and
6 both document Esc-then-Tab as their escape affordance. WCAG 2.1.2 requires only that a
documented method exists.

Run in this order and record each step:

| # | Do | Record |
|---|---|---|
| 1 | Tab until focus lands inside the code editor | Did focus enter? |
| 2 | Press **Tab** alone, repeatedly | Focus stays, or a tab character is inserted? |
| 3 | Press **Shift+Tab** alone | Does focus escape backwards? |
| 4 | Press **Esc**, then **Tab** | **Does focus leave the editor?** |
| 5 | Press **Ctrl+M**, then **Tab** | Does focus leave? |
| 6 | If any escape worked | Is it discoverable? Any on-screen hint, help text, `aria-describedby`? |

**Reading the result:**
- Step 4 or 5 escapes → **not a 2.1.2 trap.** Row 10 is `false-positive`, mechanism "escape
  via documented modifier sequence, which Tab-only traversal cannot detect." If step 6 finds
  nothing, it is a 3.3.2 discoverability issue instead — note it, don't file it as 2.1.2.
- Nothing escapes → genuine trap. Row 10 is `true-positive`.

**Either result goes into the tool's documentation.** The limitation outranks the finding: a
Tab-only traversal structurally cannot distinguish "trapped" from "escapable via a documented
modifier." That belongs in `01-ARCHITECTURE.md §6.4`'s false-positive list and in the
remediation text of every trap finding the tool emits.

**If you file:** no tool attribution. The finding reads better standing alone.

---

## Recording

Fill the TSV as you go, one row at a time, saved. Screenshots to
`audit/2026-08-20/evidence/<row#>-<rule>.png`.

For a false positive, `mechanism` is the entire value of the row. Not "wrong" — *why*:

```
verdict      false-positive
mechanism    Third-party ad iframe transiently overlaps the element; axe cannot resolve a
             background under an overlapping element and returns contrastRatio 0. Resolves
             at ~2.3s once layout settles; absent entirely in ci mode.
evidence     audit/2026-08-20/evidence/18-color-contrast.png
```

That sentence is what gets quoted in README §6. **A false positive with a traced mechanism
is a stronger portfolio result than a true positive** — it shows you understood your own
tool's failure modes rather than trusting its output.

### When you're done

```bash
git add audit/2026-08-20/verification-queue.tsv audit/2026-08-20/evidence/
git commit -m "audit: verification verdicts for the 2026-08-20 queue"
```

Update `brain/STATE.md` — next action **R4** — and hand back. Nothing after this needs a
browser.

---

## Two things to hold onto

**You are not auditing these sites.** You are verifying a tool's output. Every result is
"the tool flagged X, on this selector, on this page" — never "vuejs.org violates WCAG." No
conformance evaluation has been performed and claiming otherwise is both inaccurate and
unwise.

**Precision is counted over templates, with instances reported alongside.** A false positive
at 305 instances and one at 1 instance are not the same result, and a precision figure that
hides the difference is misleading in the direction that flatters the tool.
