# a11y-ratchet

> **Status: pre-release. Not yet functional.** Day 1 of a 15-day build. Sections marked
> `TODO(Day N)` contain no data yet and must not be filled in with estimates. See
> [`docs/00-BRIEF-AND-PLAN.md`](docs/00-BRIEF-AND-PLAN.md) for the plan.

Crawls a site, runs [axe-core](https://github.com/dequelabs/axe-core) and keyboard-interaction
probes on every page, maps each finding to its WCAG 2.2 success criterion, and diffs two runs
so CI can fail a PR on new violations. A ratchet turns one way: violations may be fixed,
never added.

It detects a **minority** of accessibility defects. See [Coverage](#coverage) for exactly
which ones and [What this cannot catch](#what-this-cannot-catch) for the rest.

---

## Quickstart

```bash
npx a11y-ratchet scan https://example.com --depth 2 --out .a11y/baseline.json
npx a11y-ratchet scan https://example.com --depth 2 --out head.json
npx a11y-ratchet diff .a11y/baseline.json head.json --html report.html
```

> `TODO(Day 13)` — verify from a clean machine before publishing.

<!-- TODO(Day 11): screenshot of the HTML report and the CI job summary -->

## Coverage

<!-- GENERATED:coverage — regenerate with `npm run docs:coverage`. Do not hand-edit. -->

WCAG 2.2 has 86 success criteria; an AA conformance claim covers the 55 at Level A and AA.[^1]

| | Criteria | |
|---|---:|---|
| Detectable | 4 | 1.4.3 · 2.4.2 · 3.1.1 · 4.1.2 |
| Probe (this tool, not axe) | 2 | 2.1.2 · 2.4.11 |
| Partial | 20 | narrow subclass caught; most real failures invisible |
| Manual only | 29 | no meaningful automated signal |
| **Any automated signal** | **26** | **47% of A/AA** |
| **Certifiable** | **0** | — |

<!-- /GENERATED:coverage -->

This tool produces evidence for 26 of the 55 A/AA criteria and can certify none of them.
Two of those 26 come from interaction probes a static DOM scanner cannot perform. The
remaining 29 require a human — `ratchet manual` will generate you a checklist.

Full matrix: [`docs/03-EVIDENCE.md`](docs/03-EVIDENCE.md#part-1--wcag-22-coverage-matrix).

[^1]: 86, not 87. WCAG 2.1 had 78; 2.2 adds 9 and removes 4.1.1 Parsing as obsolete.
Checklists reporting 87 are double-counting a criterion that no longer exists.

## What this cannot catch

Automated tools catch roughly 30–40% of WCAG failures ([WebAIM](https://webaim.org/projects/million/),
[Deque](https://www.deque.com/)). Everything else needs a person with a keyboard and a
screen reader. Concretely — all of these pass every automated check and fail WCAG:

| Defect | Passes | Fails |
|---|---|---|
| `alt="DSC_0421.jpg"` | `image-alt` | 1.1.1 Non-text Content |
| A "Read more" link | `link-name` | 2.4.4 Link Purpose |
| Required fields marked only in red | everything | 1.4.1 Use of Color |
| Visually reordered flex layout | everything | 1.3.2 Meaningful Sequence |
| `aria-live` on a region that never updates | everything | 4.1.3 Status Messages |

**The state problem.** This tool sees each page as it first renders. Modals, dropdowns,
validation errors, loading states, and toasts are never scanned — and in most applications
that is where the serious defects live. Interaction states are a v2 feature.

**Other boundaries.** Chromium only. No screen reader is involved at any point. Closed
shadow roots are unreachable and are reported as `probe-blind` rather than as zero findings.

**What a passing run means.** No *detected* violations. Not conformance, not a VPAT, not a
legal defence.

## Real-world results

> `TODO(Day 14–15)` — two sites, run in `--mode=audit`, every distinct finding verified by
> hand. Report pages crawled, distinct findings, true positives, false positives, arguable,
> with the mechanism behind each false positive named. **Do not populate from a run that
> wasn't manually verified.**

## Diff mode

The hard part of a regression gate isn't finding violations — it's deciding that *this*
violation is the same one as last time. Selector-based identity reports sixty regressions
the first time someone adds a wrapper `<div>`, the team disables the gate, and the tool is
dead. `a11y-ratchet` fingerprints findings from tiered element identity — authored ID, test
hook, accessible name, semantic path, structural path — deliberately excluding the raw CSS
selector.

| Class | Gates CI | |
|---|---|---|
| `new` | yes (axe violations only) | absent from baseline |
| `impact-changed` ↑ | yes | same element, higher severity |
| `moved` | no | same defect, relocated |
| `impact-changed` ↓ | no | improvement |
| `persisting` / `fixed` | no | |
| `unknown-page-*` | per `newPagePolicy` | see below |

**Page-set changes are handled separately.** If a page 404s between runs, its findings are
`unknown-page-removed`, never `fixed` — otherwise the report celebrates a regression.

**Runs must be comparable.** Diffing across `axe-core` versions, scan modes, or render
config (viewport, colour scheme, locale) produces phantom regressions, so it is refused by
default. Bump `axe-core` and regenerate the baseline in the same PR rather than forcing
`--allow-engine-drift` permanently.

Design detail: [`docs/02-IDENTITY-AND-DIFF.md`](docs/02-IDENTITY-AND-DIFF.md).

## Scan modes

| | `--mode=ci` (default) | `--mode=audit` |
|---|---|---|
| Third-party requests | blocked | allowed |
| For | diffable, low-variance gating | an honest picture of the real page |

Cookie banners and chat widgets are third-party *and* the most common cause of obscured
focus, so CI mode will under-report 2.4.11. Every report records its mode; cross-mode diffs
are refused.

## Baseline workflow

The baseline is a committed file (`.a11y/baseline.json`), not a CI artifact — artifacts
expire and can't be reviewed in a PR. **CI never writes to your repository**; it fails the
gate and prints the command to run locally.

| Situation | Command |
|---|---|
| A fix merged | `ratchet baseline update` |
| `axe-core` bumped | `ratchet baseline regenerate` |
| Drift from `main` | `ratchet baseline check` |
| A violation deliberately accepted | *Not a baseline change* — add a suppression |

Baselines record reality; config records decisions. Keeping them separate is the point.

## Configuration

Suppressions require a justification, an owner, and an expiry. `ratchet check-config` exits
non-zero on expired entries, so a suppression is a dated decision rather than a mute button.

```ts
// a11y-ratchet.config.ts
export default {
  mode: 'ci',
  suppressions: [{
    id: 'stripe-iframe-contrast',
    rule: 'color-contrast',
    urlPattern: '/checkout*',
    category: 'third-party',          // false-positive | accepted-risk | third-party
    reason: 'Inside Stripe Elements iframe; not ours to fix. Raised as Stripe #12345.',
    owner: '@you',
    expires: '2026-12-01',
  }],
};
```

Suppressed findings stay in the report, tagged — never dropped.

## GitHub Action

```yaml
- uses: <owner>/a11y-ratchet@v1
  with:
    url: https://staging.example.com
    baseline: .a11y/baseline.json
    depth: 2
```

> `TODO(Day 12)` — link one PR that fails the gate and one that passes.

### Exit codes

`0` pass · `1` new violations vs baseline · `2` invalid config or expired suppressions ·
`3` tool error · `4` engine drift · `5` scan threshold exceeded · `6` incompatible run
configuration

CI must be able to tell "the site regressed" from "the tool broke."

## Manual mode

`ratchet manual` emits a Markdown checklist for the criteria automation can't reach, plus
every inconclusive finding routed in for human review.

> `TODO(Day 13)` — replace with real generated output.

## Comparison

[`axe-core` CLI](https://github.com/dequelabs/axe-core-npm),
[pa11y-ci](https://github.com/pa11y/pa11y-ci), [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci),
[IBM Equal Access](https://github.com/IBMa/equal-access), and axe DevTools all cover this
ground, and several already have baselines. The differences here are interaction probes
that reach criteria axe structurally cannot, finding identity that survives DOM churn, and
a published coverage boundary.

If you need commercial support and guided manual testing, buy axe DevTools Pro.

## Roadmap

Focus-visible (2.4.7), tab-order (2.4.3) and off-screen-focus probes · interaction states
via user-supplied scripts · `--repeat` instability detection · cross-page consistency
checks (3.2.3/3.2.4/3.2.6) · report filters · non-Chromium engines.

## Licence

MIT. Depends on [`axe-core`](https://github.com/dequelabs/axe-core) (MPL-2.0), used
unmodified. "axe" is a trademark of Deque Systems; this project is unaffiliated with and
not endorsed by Deque.
