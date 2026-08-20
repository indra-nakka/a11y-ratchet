/**
 * The WCAG 2.2 A/AA coverage matrix, as data (`03-EVIDENCE.md` Part 1).
 *
 * Scoped to the 55 A/AA criteria — an AA conformance claim's scope
 * (`03-EVIDENCE.md §1.1`) — not all 86. AAA criteria have no entry here; they
 * still resolve through `wcag/criteria.ts` when a rule tags one, but this
 * tool doesn't claim coverage of them.
 *
 * Every `axeRules` list and every `status` below was checked against
 * `axe.getRules()` output for the pinned 4.13.0 build and against a live run
 * with this project's actual `runOnly` tag set (`wcag2a`, `wcag2aa`,
 * `wcag21a`, `wcag21aa`, `wcag22aa`) — not transcribed from the doc without
 * checking. Five rows disagreed with `03-EVIDENCE.md`'s draft text; each is
 * called out below and in `DECISIONS.md` D22-D23. Two verified mechanics
 * that drove several of these corrections:
 *
 *   - A rule's own `enabled: false` is overridden by tag-based `runOnly`
 *     selection (`DECISIONS.md` D17) — `target-size`, `css-orientation-lock`
 *     and `label-content-name-mismatch` all run under this config despite
 *     being off by default.
 *   - A `deprecated`-tagged rule is excluded even so — `duplicate-id`,
 *     `duplicate-id-active`, `aria-roledescription` and `audio-caption`
 *     never run under this config, tag selection notwithstanding. Verified
 *     empirically (a two-id-collision fixture did not fire `duplicate-id`),
 *     not inferred from the tag list alone.
 */

import { criterionById } from './criteria.js';
import type { CoverageCounts, CoverageEntry, CoverageStatus, Level, ManualMethod } from '../types.js';

/** Day 13 writes the real prompts; this only needs to exist. */
const MANUAL_PROMPT_PLACEHOLDER = 'TODO(Day 13): manual-check prompt.';

function entry(
  criterion: string,
  status: CoverageStatus,
  axeRules: string[],
  note: string,
  options: { probeIds?: string[]; experimental?: boolean; manualMethod?: ManualMethod } = {},
): CoverageEntry {
  return {
    criterion,
    status,
    axeRules,
    probeIds: options.probeIds ?? [],
    note,
    experimental: options.experimental ?? false,
    manualChecks: [
      {
        id: `${criterion}-manual`,
        prompt: MANUAL_PROMPT_PLACEHOLDER,
        method: options.manualMethod ?? 'visual',
      },
    ],
  };
}

export const WCAG_COVERAGE: CoverageEntry[] = [
  // --- Perceivable ---
  entry(
    '1.1.1',
    'partial',
    ['image-alt', 'input-image-alt', 'area-alt', 'role-img-alt', 'svg-img-alt', 'object-alt', 'aria-meter-name', 'aria-progressbar-name'],
    "Detects absence of a text alternative. Cannot judge whether alt text is accurate - alt=\"DSC_0421.jpg\" passes every one of these rules and fails the criterion anyway. The most common real failure is invisible to all of them.",
    { manualMethod: 'screen-reader' },
  ),
  entry('1.2.1', 'manual', [], 'No automated signal. axe ships a deprecated audio-caption rule for this SC, but deprecated rules never run, tag selection or not.', { manualMethod: 'flow' }),
  entry('1.2.2', 'partial', ['video-caption'], 'Detects a missing <track>, not caption quality, sync, or speaker identification.', { manualMethod: 'flow' }),
  entry('1.2.3', 'manual', [], 'No automated signal; requires knowing what the media conveys.', { manualMethod: 'flow' }),
  entry('1.2.4', 'manual', [], 'No automated signal.', { manualMethod: 'flow' }),
  entry('1.2.5', 'manual', [], 'No automated signal.', { manualMethod: 'flow' }),
  entry(
    '1.3.1',
    'partial',
    ['list', 'listitem', 'dlitem', 'td-headers-attr', 'th-has-data-cells', 'aria-required-children', 'aria-required-parent', 'aria-hidden-body', 'definition-list'],
    'Catches markup errors (a div in a list, a header describing no cells) - not visually-implied relationships absent from the DOM, like a CSS-grid layout that reads as a table to a sighted user only. Three more rules (p-as-heading, table-fake-caption, td-has-header) are tagged for this SC but are experimental and off by default.',
    { manualMethod: 'screen-reader' },
  ),
  entry('1.3.2', 'manual', [], 'DOM order vs visual order; no automated signal.', { manualMethod: 'visual' }),
  entry('1.3.3', 'manual', [], '"The button on the right" - instructions relying on shape, position or sound. No automated signal.', { manualMethod: 'visual' }),
  entry('1.3.4', 'partial', ['css-orientation-lock'], 'Flags CSS that locks orientation. Experimental rule in axe-core 4.13.0.', { experimental: true, manualMethod: 'visual' }),
  entry('1.3.5', 'partial', ['autocomplete-valid'], 'Detects an invalid autocomplete token, not a missing one.', { manualMethod: 'visual' }),
  entry('1.4.1', 'manual', ['link-in-text-block'], 'link-in-text-block covers one narrow case (a link distinguished from body text by colour alone). Colour-only status indicators, legends and required-field marking are invisible to it.', { manualMethod: 'visual' }),
  entry('1.4.2', 'partial', ['no-autoplay-audio'], 'Flags autoplaying audio outright; cannot verify a stop mechanism exists on audio that autoplays briefly.', { manualMethod: 'flow' }),
  entry('1.4.3', 'detectable', ['color-contrast'], 'Highest-yield check in the tool. Returns needs-review over images, gradients and transparency - a real limit, not a bug, and those results are never dropped.', { manualMethod: 'visual' }),
  entry('1.4.4', 'partial', ['meta-viewport'], 'Flags a viewport meta tag that blocks zoom. Actual reflow and readability at 200% is untested.', { manualMethod: 'zoom' }),
  entry('1.4.5', 'manual', [], 'No automated signal; requires judging whether text was rendered as an image without necessity.', { manualMethod: 'visual' }),
  entry('1.4.10', 'manual', [], 'Needs rendering at 320px CSS width and checking for loss of content or function. Candidate future probe.', { manualMethod: 'zoom' }),
  entry('1.4.11', 'manual', [], 'No axe rule. Widely and wrongly assumed to be covered by color-contrast, which only checks text.', { manualMethod: 'visual' }),
  entry('1.4.12', 'partial', ['avoid-inline-spacing'], 'Flags inline styles that block user text-spacing overrides. Does not test the actual result of applying the WCAG-specified spacing values.', { manualMethod: 'zoom' }),
  entry('1.4.13', 'manual', [], 'Content appearing on hover/focus that cannot be dismissed, hoverable, or persistent. Candidate future probe.', { manualMethod: 'keyboard' }),

  // --- Operable ---
  entry(
    '2.1.1',
    'partial',
    ['scrollable-region-focusable', 'frame-focusable-content', 'server-side-image-map'],
    'Catches specific keyboard-reachability gaps (a scrollable region with no focusable descendant, an inert frame, a server-side-only image map). nested-interactive is tagged 4.1.2 in axe-core 4.13.0, not 2.1.1, despite the name suggesting otherwise - corrected from an earlier draft of this table that listed it here.',
    { manualMethod: 'keyboard' },
  ),
  entry('2.1.2', 'probe', [], 'No axe rule - structurally out of reach for a static scanner. Cycle analysis with false positives on roving-tabindex widgets (01 §6.4).', { probeIds: ['probe/keyboard-trap'], manualMethod: 'keyboard' }),
  entry('2.1.4', 'manual', [], 'No automated signal; requires knowing whether a single-key shortcut can be remapped or disabled.', { manualMethod: 'keyboard' }),
  entry('2.2.1', 'partial', ['meta-refresh'], 'Flags a timed meta-refresh. Session timeouts and JS-driven timers are invisible.', { manualMethod: 'flow' }),
  entry('2.2.2', 'partial', ['blink', 'marquee'], 'Catches the deprecated <blink>/<marquee> elements outright. Auto-advancing carousels and animated GIFs - the common real failure - are not detected. no-autoplay-audio is tagged 1.4.2 only, not 2.2.2 - corrected from an earlier draft that listed it here.', { manualMethod: 'flow' }),
  entry('2.3.1', 'manual', [], 'No automated signal; requires measuring flash rate and area.', { manualMethod: 'visual' }),
  entry('2.4.1', 'partial', ['bypass'], 'Checks that a bypass mechanism (skip link or landmark) exists, not that it works. skip-link, despite the name, is a best-practice-only rule with no WCAG tag in axe-core 4.13.0 - it contributes nothing here, corrected from an earlier draft that listed it.', { manualMethod: 'keyboard' }),
  entry('2.4.2', 'detectable', ['document-title'], 'Detects absence of a <title>. Not whether the title actually describes the page.', { manualMethod: 'screen-reader' }),
  entry('2.4.3', 'manual', [], 'tabindex (best-practice, off by default) flags a positive tabindex value; not a substitute for evaluating the actual focus order. Probe cut from v1 - roadmap.', { manualMethod: 'keyboard' }),
  entry('2.4.4', 'partial', ['link-name', 'area-alt'], 'link-name detects an empty link. "Read more" passes the rule and fails the criterion - the link\'s destination still isn\'t clear out of context.', { manualMethod: 'screen-reader' }),
  entry('2.4.5', 'manual', [], 'Site-level: does more than one way exist to find this page? No automated signal.', { manualMethod: 'flow' }),
  entry(
    '2.4.6',
    'manual',
    [],
    'No automated signal in axe-core 4.13.0. empty-heading and heading-order look like candidates, but both are tagged best-practice only - neither carries a WCAG tag, so neither produces evidence here even with best-practice rules enabled. Corrected from an earlier draft that classified this Partial.',
    { manualMethod: 'screen-reader' },
  ),
  entry('2.4.7', 'manual', [], 'Demoted from Probe (01 §6, roadmap). Requires handling :focus-visible, descendant outlines, box-shadow, border and background changes, and custom SVG indicators - a computed-style read misfires constantly.', { manualMethod: 'keyboard' }),
  entry('2.4.11', 'probe', [], "New in 2.2. Deque has stated this will not be added to axe-core. Requires scroll-settled measurement and scroll-margin awareness (01 §6.2). This tool's flagship differentiator.", { probeIds: ['probe/focus-obscured'], manualMethod: 'keyboard' }),
  entry('2.5.1', 'manual', [], 'No automated signal; requires exercising the actual gesture-driven interaction.', { manualMethod: 'flow' }),
  entry('2.5.2', 'manual', [], 'No automated signal; requires exercising down-event vs up-event activation.', { manualMethod: 'flow' }),
  entry('2.5.3', 'partial', ['label-content-name-mismatch'], "Flags when an element's visible text isn't contained in its accessible name - the case that breaks speech-input users clicking \"what they can see\". Experimental rule in axe-core 4.13.0.", { experimental: true, manualMethod: 'screen-reader' }),
  entry('2.5.4', 'manual', [], 'No automated signal; requires exercising device-motion-triggered actions.', { manualMethod: 'flow' }),
  entry('2.5.7', 'manual', [], 'New in 2.2. Detecting that a drag interaction exists is possible; verifying an adequate single-pointer alternative is not. No axe rule.', { manualMethod: 'flow' }),
  entry('2.5.8', 'partial', ['target-size'], 'New in 2.2. Off by default - needs the wcag22aa tag, which this tool enables. Inline, essential, and equivalent-control exceptions generate false positives the rule cannot resolve.', { manualMethod: 'visual' }),

  // --- Understandable ---
  entry('3.1.1', 'detectable', ['html-has-lang', 'html-lang-valid', 'html-xml-lang-mismatch'], 'Detects a missing, invalid, or mismatched lang attribute reliably.', { manualMethod: 'screen-reader' }),
  entry('3.1.2', 'partial', ['valid-lang'], 'Validates a lang attribute that is present; cannot detect one that should exist but is missing on a foreign-language passage.', { manualMethod: 'screen-reader' }),
  entry('3.2.1', 'manual', [], 'No automated signal; requires exercising focus and observing whether context changes unexpectedly.', { manualMethod: 'flow' }),
  entry('3.2.2', 'manual', [], 'No automated signal; requires exercising input and observing whether context changes unexpectedly.', { manualMethod: 'flow' }),
  entry('3.2.3', 'manual', [], 'Cross-page consistency. Candidate: the crawler already visits every page\'s nav, so this could become derivable - not built in v1.', { manualMethod: 'flow' }),
  entry('3.2.4', 'manual', [], 'Cross-page consistency, same candidate reasoning as 3.2.3. Not built in v1.', { manualMethod: 'flow' }),
  entry('3.2.6', 'manual', [], 'New in 2.2. Cross-page consistency of help mechanisms. No automated signal.', { manualMethod: 'flow' }),
  entry('3.3.1', 'manual', [], 'Requires submitting a form and reading the resulting error state - invisible to a crawler that never submits anything.', { manualMethod: 'flow' }),
  entry(
    '3.3.2',
    'partial',
    ['form-field-multiple-labels'],
    "The only axe-core rule actually tagged 3.3.2 in 4.13.0. label, select-name and aria-input-field-name test whether a control has ANY accessible name at all - that's 4.1.2's requirement, not 3.3.2's \"are instructions provided\", even though the two are intuitively related. Corrected from an earlier draft that credited those three rules to this SC. Placeholder-as-label passes all of them regardless.",
    { manualMethod: 'screen-reader' },
  ),
  entry('3.3.3', 'manual', [], 'Requires submitting a form and judging whether the suggested correction is adequate.', { manualMethod: 'flow' }),
  entry('3.3.4', 'manual', [], 'Legal/financial/data-modifying submissions: requires exercising the flow and checking for reversal, confirmation, or checking.', { manualMethod: 'flow' }),
  entry('3.3.7', 'manual', [], 'New in 2.2. Requires traversing a multi-step flow and checking whether previously-entered information is re-requested.', { manualMethod: 'flow' }),
  entry(
    '3.3.8',
    'manual',
    [],
    "New in 2.2. No axe-core rule exists yet. Detecting onpaste/ondrop blocking on a password field would be a legitimate custom rule this project could write; cognitive-function-test detection would not. Roadmap, not shipped coverage - corrected from an earlier draft that classified this Partial on the strength of an idea rather than an implementation.",
    { manualMethod: 'flow' },
  ),

  // --- Robust ---
  entry(
    '4.1.2',
    'detectable',
    ['button-name', 'link-name', 'select-name', 'frame-title', 'frame-title-unique', 'input-button-name', 'input-image-alt', 'label', 'nested-interactive', 'summary-name', 'duplicate-id-aria', 'aria-allowed-attr', 'aria-required-attr', 'aria-valid-attr', 'aria-valid-attr-value', 'aria-roles', 'aria-hidden-focus', 'aria-hidden-body', 'aria-input-field-name', 'aria-command-name', 'aria-tab-name', 'aria-toggle-field-name', 'aria-tooltip-name', 'aria-braille-equivalent', 'aria-conditional-attr', 'aria-prohibited-attr', 'area-alt'],
    'The largest cluster in the tool by rule count. High yield - detects missing or invalid names/roles/ARIA states reliably. Does not detect a name that is present but wrong (a "Submit" button actually labelled "Cancel").',
    { manualMethod: 'screen-reader' },
  ),
  entry(
    '4.1.3',
    'manual',
    [],
    'No axe-core 4.13.0 rule carries a WCAG 4.1.3 tag, and no rule description mentions live regions or status-message announcement. Detects nothing currently, despite the common assumption that ARIA live-region presence implies coverage - corrected from an earlier draft that classified this Partial.',
    { manualMethod: 'screen-reader' },
  ),
];

const DEFAULT_LEVELS: Level[] = ['A', 'AA'];

/**
 * Coverage totals for the requested levels, generated from `WCAG_COVERAGE` —
 * never written by hand (`03-EVIDENCE.md §1.7`). Defaults to A+AA, the
 * matrix's own scope; narrower requests (e.g. `['A']`) filter by each
 * entry's criterion level via `wcag/criteria.ts`.
 */
export function computeCoverageCounts(levels: Level[] = DEFAULT_LEVELS): CoverageCounts {
  const included = WCAG_COVERAGE.filter((coverageEntry) => {
    const criterion = criterionById(coverageEntry.criterion);
    return criterion !== undefined && levels.includes(criterion.level);
  });

  const byStatus: Record<CoverageStatus, number> = { detectable: 0, partial: 0, probe: 0, manual: 0 };
  for (const coverageEntry of included) {
    byStatus[coverageEntry.status] += 1;
  }

  return {
    levels,
    total: included.length,
    byStatus,
    anySignal: byStatus.detectable + byStatus.partial + byStatus.probe,
    certifiable: 0,
  };
}
