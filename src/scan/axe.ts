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

import { GENERATED_ID_PATTERNS } from '../identity/fingerprint.js';
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

/** Shared with `scan/probes/focusPath.ts` - both need the same Tier 2 candidate list. */
export const TEST_HOOK_ATTRIBUTES = ['data-testid', 'data-test', 'data-qa', 'data-cy'];

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
  /** Raw accessible name — `identity/fingerprint.ts` normalises it. */
  accessibleName?: string;
  /** Raw `element.id` — `identity/fingerprint.ts` runs the generated-id filter, not this file. */
  authoredId?: string;
  testHookValue?: string;
  /** Role of the nearest landmark ancestor, or `'none'` (`02 §3.4`). */
  landmarkRole: string;
  /** Raw text of the nearest preceding heading, or `'none'` — normalised later. */
  headingContext: string;
  domDepth: number;
  rawTextContent: string;
  /** Tier 4 candidate: role-or-tag path from the nearest landmark ancestor to the element (`02 §3.1`). */
  semanticPath: string;
  /** Tier 5 candidate: tag[same-tag-sibling-index] path from the nearest stable ancestor (`02 §3.1`). */
  structuralPath: string;
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
  // RegExp objects don't survive page.evaluate's serialisation - source/flags
  // do. This keeps GENERATED_ID_PATTERNS defined exactly once, in
  // identity/fingerprint.ts, rather than duplicating the pattern list here
  // for the Tier 5 stable-ancestor check (DECISIONS.md D28's fix).
  const generatedIdPatterns = GENERATED_ID_PATTERNS.map((pattern) => ({
    source: pattern.source,
    flags: pattern.flags,
  }));
  return page.evaluate(collectRawFindings, { tags, testHookAttributes: TEST_HOOK_ATTRIBUTES, generatedIdPatterns });
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
  /** Builds the internal tree cache `accessibleText` needs. Throws if already set up. */
  setup(node: Document): unknown;
  teardown(): void;
}

async function collectRawFindings(args: {
  tags: string[];
  testHookAttributes: string[];
  generatedIdPatterns: Array<{ source: string; flags: string }>;
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
  // Common implicit roles beyond landmarks, for Tier 4's semantic path
  // (02 §3.1). Not the full HTML-AAM algorithm - a pragmatic subset covering
  // what real pages actually use. `a` is handled separately (link only with
  // an href) since its role depends on an attribute, not just its tag.
  const IMPLICIT_ROLES: Record<string, string> = {
    button: 'button',
    ul: 'list',
    ol: 'list',
    li: 'listitem',
    table: 'table',
    tr: 'row',
    td: 'cell',
    th: 'columnheader',
    form: 'form',
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    h5: 'heading',
    h6: 'heading',
    img: 'img',
    select: 'listbox',
    textarea: 'textbox',
  };
  // header/footer are only banner/contentinfo at the top level — nested
  // inside a sectioning element they have no implicit landmark role.
  const SECTIONING_ANCESTOR_SELECTOR = 'article, aside, main, nav, section';
  const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, [role="heading"]';

  // Crosses shadow-root host boundaries (02 §3.1: "identity path crosses
  // host boundaries"). el.parentElement is null at a shadow root's top, but
  // the tree logically continues at the host. Used by every ancestor walk
  // below so landmark/heading/path resolution doesn't stop dead at a
  // component boundary. Never crosses an IFRAME boundary - that's a
  // separate document, and Element.parentElement already can't reach it,
  // which is exactly right: frame path is a separate axis, in frameSelector.
  function elementParent(el: Element): Element | null {
    const parent = el.parentElement;
    if (parent) return parent;
    const root = el.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  }

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

  // SVG elements' `.className` is an SVGAnimatedString, not a string
  // (02 §3.1). This file never reads `.className` anywhere, on purpose -
  // `getAttribute('class')`/`getAttribute('role')` are used throughout
  // instead, which behave uniformly across HTML and SVG elements.
  function roleForElement(el: Element): string {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const landmark = implicitLandmarkRole(el);
    if (landmark) return landmark;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a' && el.hasAttribute('href')) return 'link';
    return IMPLICIT_ROLES[tag] ?? tag;
  }

  function nearestLandmarkAncestor(el: Element): Element | null {
    let node = elementParent(el);
    while (node) {
      if (implicitLandmarkRole(node)) return node;
      node = elementParent(node);
    }
    return null;
  }

  // Best-effort landmark walk — not the full HTML-AAM algorithm. Hardened in Day 4.
  function nearestLandmarkRole(el: Element): string {
    const landmark = nearestLandmarkAncestor(el);
    return landmark ? implicitLandmarkRole(landmark)! : 'none';
  }

  // Raw text - normalisation (02 §3.3) happens in Node, in identity/fingerprint.ts.
  //
  // Corrected per golden case 11 (DECISIONS.md D33): the first version
  // searched only within the element's own shadow root, reasoning that a
  // heading outside a component's shadow boundary isn't "context" for
  // content encapsulated inside it. That broke identity across exactly the
  // move the case exists to test - moving an element into a shadow root
  // with no heading of its own made headingContext flip from a real value
  // to 'none', when nothing about the element's position actually changed.
  //
  // Searches the element's own scope (shadow root or document) first; if no
  // heading precedes it there, escalates to the HOST element's position in
  // the enclosing scope, recursing outward through nested shadow roots.
  // compareDocumentPosition doesn't work across a shadow boundary, so each
  // scope is searched independently rather than as one flattened tree.
  function nearestPrecedingHeadingText(el: Element): string {
    let anchor: Element | null = el;
    while (anchor) {
      const root = anchor.getRootNode();
      const searchRoot = root instanceof ShadowRoot ? root : document;
      const headings = Array.from(searchRoot.querySelectorAll(HEADING_SELECTOR));
      let candidate: Element | null = null;
      for (const heading of headings) {
        const position = heading.compareDocumentPosition(anchor);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
          candidate = heading;
        } else {
          break; // headings are in document order; none after this one can precede `anchor`.
        }
      }
      if (candidate) return candidate.textContent ?? 'none';
      anchor = root instanceof ShadowRoot ? root.host : null;
    }
    return 'none';
  }

  function elementDomDepth(el: Element): number {
    let depth = 0;
    let node = elementParent(el);
    while (node) {
      depth += 1;
      node = elementParent(node);
    }
    return depth;
  }

  // axe.commons.text.accessibleText needs axe's internal tree cache
  // (axe._tree), which axe.run() tears down internally before its promise
  // resolves - calling this after awaiting axe.run() throws for almost
  // every element (root cause found via the Day 5 golden pairs: cases 5 and
  // 20 both silently fell through to Tier 4/5 before this fix, because
  // Tier 3 was unreachable). axe.setup(document) rebuilds that cache; see
  // the call site below. One element's accessible-name computation must
  // still never take down the whole scan, so this stays defensive even
  // with setup in place.
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

  // Tier 4 (02 §3.1): role-or-tag path from the nearest landmark ancestor
  // down to and including the element, e.g. "navigation > list > listitem >
  // link". The landmark's own role leads the path so it's self-contained -
  // no need to cross-reference landmarkRole separately to know which
  // landmark this is.
  function buildSemanticPath(el: Element): string {
    const landmark = nearestLandmarkAncestor(el);
    if (!landmark) return 'none';
    const chain: string[] = [];
    let node: Element | null = el;
    while (node && node !== landmark) {
      chain.unshift(roleForElement(node));
      node = elementParent(node);
    }
    // The landmark's own role always survives capping - it identifies WHICH
    // landmark this is, unlike the intermediate chain.
    return [roleForElement(landmark), ...capPathDepth(chain)].join(' > ');
  }

  const generatedIdPatterns = args.generatedIdPatterns.map((p) => new RegExp(p.source, p.flags));
  function isIdGenerated(id: string): boolean {
    return generatedIdPatterns.some((pattern) => pattern.test(id));
  }

  // "Nearest stable ancestor" (02 §3.1), corrected per DECISIONS.md D28: the
  // nearest ancestor with a NON-generated id (a React useId etc churns every
  // build - anchoring Tier 5 to one is worse than anchoring to nothing), or
  // a landmark, or <body> as the final fallback.
  function nearestStableAncestor(el: Element): Element {
    let node = elementParent(el);
    while (node) {
      if ((node.id && !isIdGenerated(node.id)) || implicitLandmarkRole(node) || node === document.body) {
        return node;
      }
      node = elementParent(node);
    }
    return document.body;
  }

  // Caps how many ancestor levels Tier 4/5 paths record, keeping both the N
  // CLOSEST-TO-ELEMENT segments (the specific, identifying end of the path)
  // and dropping any excess from the anchor end (the vague, "which general
  // area" end) - a pathologically deep tree shouldn't produce an unbounded
  // path string.
  const MAX_PATH_DEPTH = 8;
  function capPathDepth(chain: string[]): string[] {
    return chain.length > MAX_PATH_DEPTH ? chain.slice(chain.length - MAX_PATH_DEPTH) : chain;
  }

  // Tier 5 (02 §3.1): tag[same-tag-sibling-index] path from the nearest
  // stable ancestor to the element - same-tag index, NOT absolute position,
  // so an unrelated sibling insertion elsewhere doesn't perturb it. The
  // anchor's own segment is deliberately excluded: it's a reference point,
  // not part of the element's own structural description.
  function buildStructuralPath(el: Element): string {
    const anchor = nearestStableAncestor(el);
    const chain: string[] = [];
    let node: Element | null = el;
    while (node && node !== anchor) {
      chain.unshift(`${node.tagName.toLowerCase()}[${sameTagSiblingIndex(node)}]`);
      node = elementParent(node);
    }
    return capPathDepth(chain).join(' > ');
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
      semanticPath: el ? buildSemanticPath(el) : 'none',
      structuralPath: el ? buildStructuralPath(el) : '',
    };
  }

  const results = await axe.run(document, {
    resultTypes: ['violations', 'incomplete'],
    runOnly: { type: 'tag', values: args.tags },
    elementRef: true,
    iframes: true,
  });

  // Collect (rule, node, bucket) triples first and sort by document
  // position while live elements are still available - identity/
  // fingerprint.ts's collision-ordinal assignment needs document order, and
  // it never sees a live Element to compute that itself.
  const entries: Array<{ rule: InPageRuleResult; node: InPageNodeResult; bucket: 'violation' | 'needs-review' }> = [];
  for (const rule of results.violations) {
    for (const node of rule.nodes) entries.push({ rule, node, bucket: 'violation' });
  }
  for (const rule of results.incomplete) {
    for (const node of rule.nodes) entries.push({ rule, node, bucket: 'needs-review' });
  }

  entries.sort((a, b) => {
    const elA = a.node.element;
    const elB = b.node.element;
    // Elements without a live reference (cross-frame results) sort after
    // every same-document one; relative order among themselves is left as
    // axe returned it (stable sort).
    if (!elA || !elB) return elA ? -1 : elB ? 1 : 0;
    const position = elA.compareDocumentPosition(elB);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  // Rebuild axe's tree cache - axe.run() already tore its own down - so
  // buildRawFinding's accessibleText calls actually work (see
  // safeAccessibleText above). Torn down again afterwards so this page is
  // left the way axe.run() would leave it.
  axe.setup(document);
  try {
    return entries.map(({ rule, node, bucket }) => buildRawFinding(rule, node, bucket));
  } finally {
    axe.teardown();
  }
}
