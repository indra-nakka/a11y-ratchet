/**
 * axe-core injection and execution (`01 §4`, `01 §7`).
 *
 * Injects the exact pinned axe-core build (never patched — `axe-core` is
 * MPL-2.0, consumed only through its config API) into every frame, runs it
 * with `incomplete` included so ambiguous results become `needs-review`
 * rather than silently vanishing, and enables the `wcag22aa` tag so
 * `target-size` — off by default in 4.13.0 — actually runs.
 *
 * This module also captures per-node identity raw material (accessible name,
 * landmark/heading context, DOM depth, raw text) in the SAME browser
 * evaluation that runs axe. `elementRef: true` gives each node a live
 * `Element` reference, but that reference cannot survive the trip back to
 * Node — Playwright's return value is serialised. Everything that needs the
 * live element has to happen here; `normalise.ts` works only with the
 * serialisable `RawFinding[]` this produces.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from 'playwright';

import type { Impact } from '../types.js';

const require = createRequire(import.meta.url);

/** The exact pinned build (`package.json`: `axe-core: 4.13.0`), read once. */
const AXE_SOURCE = readFileSync(require.resolve('axe-core'), 'utf8');

/**
 * Full A/AA net across every WCAG version axe-core knows about, plus the 2.2
 * tag `target-size` needs to run at all (`01 §7`). `runOnly` selection
 * overrides a rule's own `enabled: false` default — this is exactly why
 * `target-size` and a few experimental-but-matrix-relevant rules
 * (`css-orientation-lock`, `label-content-name-mismatch`) run under this
 * config despite being off by default individually. Verified empirically
 * against axe-core 4.13.0, not assumed.
 */
const WCAG_A_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BEST_PRACTICE_TAG = 'best-practice';

const TEST_HOOK_ATTRIBUTES = ['data-testid', 'data-test', 'data-qa', 'data-cy'];

export interface AxeRunOptions {
  /** `01 §7`: best-practice rules are off by default — never WCAG failures. */
  includeBestPractice: boolean;
}

/** One axe node result, enriched with identity raw material. Not yet a `Finding`. */
export interface RawFinding {
  ruleId: string;
  bucket: 'violation' | 'needs-review';
  impact: Impact;
  tags: string[];
  helpUrl: string;
  html: string;
  /** axe's cross-tree target: frame-crossing selectors, possibly a shadow-DOM chain at the end. */
  target: Array<string | string[]>;
  failureSummary?: string;
  accessibleName?: string;
  authoredId?: string;
  testHookValue?: string;
  /** Role of the nearest landmark ancestor, or `'none'`. */
  landmarkRole: string;
  /** Normalised-later text of the nearest preceding heading, or `'none'`. */
  headingContext: string;
  domDepth: number;
  rawTextContent: string;
  /** Lower-cased tag name — Tier 4/5 fallback path material (`02 §3.1`). */
  tagName: string;
  /** Index among same-tag siblings under the immediate parent (`02 §3.1`, Tier 5). */
  siblingIndex: number;
}

/**
 * Inject axe-core into every frame of the page (`01 §4`: "all-frames").
 * Cross-origin frames reject script injection; those are recorded as
 * unreachable rather than causing the scan to fail, so axe's own cross-frame
 * results simply omit them.
 */
export async function injectAxeIntoAllFrames(page: Page): Promise<void> {
  await Promise.all(
    page.frames().map(async (frame) => {
      try {
        await frame.addScriptTag({ content: AXE_SOURCE });
      } catch {
        // Cross-origin frame, or the frame detached mid-injection. Not fatal:
        // axe's iframe messaging protocol simply gets no reply from it.
      }
    }),
  );
}

/**
 * Run axe against the page and return raw, serialisable per-node results —
 * violations and incomplete, with identity raw material attached.
 */
export async function runAxe(page: Page, options: AxeRunOptions): Promise<RawFinding[]> {
  const tags = options.includeBestPractice ? [...WCAG_A_AA_TAGS, BEST_PRACTICE_TAG] : WCAG_A_AA_TAGS;
  return page.evaluate(collectRawFindings, { tags, testHookAttributes: TEST_HOOK_ATTRIBUTES });
}

/* -------------------------------------------------------------------------- */
/* In-page code below this line. Runs in the browser, not in Node.            */
/*                                                                            */
/* Playwright's page.evaluate serialises ONLY the function passed to it — it  */
/* does not capture closures over other module-scope functions or constants. */
/* Every helper this needs must be declared INSIDE collectRawFindings, or it  */
/* is `undefined` in the page and throws at scan time. The type checker      */
/* cannot catch this — it has no notion that evaluate() only ships the one   */
/* function's source text, so a module-scope helper still type-checks fine.  */
/* -------------------------------------------------------------------------- */

interface InPageNodeResult {
  html: string;
  impact: Impact | null;
  target: Array<string | string[]>;
  failureSummary?: string;
  element?: Element;
}

interface InPageRuleResult {
  id: string;
  impact: Impact | null;
  tags: string[];
  helpUrl: string;
  nodes: InPageNodeResult[];
}

/** Ambient: injected into the page by `injectAxeIntoAllFrames` before this runs. */
interface InPageAxe {
  run(
    context: Document,
    options: Record<string, unknown>,
  ): Promise<{ violations: InPageRuleResult[]; incomplete: InPageRuleResult[] }>;
  commons: { text: { accessibleText(element: Element): string } };
}

async function collectRawFindings(args: {
  tags: string[];
  testHookAttributes: string[];
}): Promise<RawFinding[]> {
  const axe = (window as unknown as { axe: InPageAxe }).axe;

  const LANDMARK_TAG_ROLES: Record<string, string> = {
    header: 'banner',
    footer: 'contentinfo',
    main: 'main',
    nav: 'navigation',
    aside: 'complementary',
  };
  const EXPLICIT_LANDMARK_ROLES = new Set([
    'banner',
    'complementary',
    'contentinfo',
    'form',
    'main',
    'navigation',
    'region',
    'search',
  ]);
  // header/footer are only banner/contentinfo at the top level — nested
  // inside a sectioning element they have no implicit landmark role.
  const SECTIONING_ANCESTOR_SELECTOR = 'article, aside, main, nav, section';
  const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, [role="heading"]';

  function implicitLandmarkRole(el: Element): string | null {
    const explicitRole = el.getAttribute('role');
    if (explicitRole && EXPLICIT_LANDMARK_ROLES.has(explicitRole)) return explicitRole;

    const tag = el.tagName.toLowerCase();
    if (tag === 'header' || tag === 'footer') {
      return el.closest(SECTIONING_ANCESTOR_SELECTOR) ? null : (LANDMARK_TAG_ROLES[tag] ?? null);
    }
    if (tag === 'form' || tag === 'section') {
      const named = el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby');
      if (!named) return null;
      return tag === 'form' ? 'form' : 'region';
    }
    return LANDMARK_TAG_ROLES[tag] ?? null;
  }

  // Best-effort landmark walk — not the full HTML-AAM algorithm. Hardened in Day 4.
  function nearestLandmarkRole(el: Element): string {
    let node: Element | null = el.parentElement;
    while (node) {
      const role = implicitLandmarkRole(node);
      if (role) return role;
      node = node.parentElement;
    }
    return 'none';
  }

  // Raw text - normalisation (02 §3.3) happens in Node, in normalise.ts.
  function nearestPrecedingHeadingText(el: Element): string {
    const headings = Array.from(document.querySelectorAll(HEADING_SELECTOR));
    let candidate: Element | null = null;
    for (const heading of headings) {
      const position = heading.compareDocumentPosition(el);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        candidate = heading;
      } else {
        break; // headings are in document order; none after this one can precede `el`.
      }
    }
    return candidate?.textContent ?? 'none';
  }

  function elementDomDepth(el: Element): number {
    let depth = 0;
    let node: Element | null = el.parentElement;
    while (node) {
      depth += 1;
      node = node.parentElement;
    }
    return depth;
  }

  // axe.commons.text.accessibleText can throw for some element/attribute
  // shapes when called outside an active axe.run() evaluation (observed on
  // an <area> inside an image map, against axe-core 4.13.0) - one element's
  // accessible-name computation must never take down the whole page scan.
  function safeAccessibleText(el: Element): string | undefined {
    try {
      return axe.commons.text.accessibleText(el);
    } catch {
      return undefined;
    }
  }

  function testHookValue(el: Element): string | undefined {
    for (const attribute of args.testHookAttributes) {
      const value = el.getAttribute(attribute);
      if (value) return value;
    }
    return undefined;
  }

  function sameTagSiblingIndex(el: Element): number {
    let index = 0;
    let sibling = el.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === el.tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    return index;
  }

  function buildRawFinding(
    rule: InPageRuleResult,
    node: InPageNodeResult,
    bucket: 'violation' | 'needs-review',
  ): RawFinding {
    const el = node.element;
    // exactOptionalPropertyTypes forbids assigning `undefined` to an optional
    // field directly - each optional value is resolved first, then the key is
    // included only when it is actually present.
    const hookValue = el ? testHookValue(el) : undefined;
    const accessibleName = el ? safeAccessibleText(el) : undefined;

    return {
      ruleId: rule.id,
      bucket,
      // node-level impact wins when axe supplies one; rule-level otherwise.
      // Both can be null (e.g. some incomplete results) - default to 'minor'
      // rather than fabricate certainty the tool doesn't have.
      impact: node.impact ?? rule.impact ?? 'minor',
      tags: rule.tags,
      helpUrl: rule.helpUrl,
      html: node.html,
      target: node.target,
      ...(node.failureSummary !== undefined ? { failureSummary: node.failureSummary } : {}),
      ...(accessibleName !== undefined ? { accessibleName } : {}),
      ...(el?.id ? { authoredId: el.id } : {}),
      ...(hookValue !== undefined ? { testHookValue: hookValue } : {}),
      landmarkRole: el ? nearestLandmarkRole(el) : 'none',
      headingContext: el ? nearestPrecedingHeadingText(el) : 'none',
      domDepth: el ? elementDomDepth(el) : 0,
      rawTextContent: el?.textContent ?? '',
      tagName: el ? el.tagName.toLowerCase() : '',
      siblingIndex: el ? sameTagSiblingIndex(el) : 0,
    };
  }

  const results = await axe.run(document, {
    resultTypes: ['violations', 'incomplete'],
    runOnly: { type: 'tag', values: args.tags },
    elementRef: true,
    iframes: true,
  });

  const out: RawFinding[] = [];
  for (const rule of results.violations) {
    for (const node of rule.nodes) out.push(buildRawFinding(rule, node, 'violation'));
  }
  for (const rule of results.incomplete) {
    for (const node of rule.nodes) out.push(buildRawFinding(rule, node, 'needs-review'));
  }
  return out;
}
