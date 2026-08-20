/**
 * The focus-path probe (`01 §6`) — the one probe shipping in v1. Two
 * detections only: obscured focus (2.4.11) and keyboard trap (2.1.2).
 * Tab-order, off-screen, and focus-visible are cut to roadmap (`00 §4`).
 *
 * Drives REAL keyboard input (`page.keyboard.press('Tab')`) — a page that
 * intercepts Tab to build a custom widget only misbehaves for a real key
 * event, never for a synthetic one dispatched from `page.evaluate`. Control
 * flow lives here, in Node, one `Tab` press at a time; only geometry and DOM
 * reads happen in the page.
 *
 * `bucket: 'needs-review'` always, `impact` decided by this project, never
 * axe — probes never gate (`CLAUDE.md` invariant 3, `01 §6`). Config can
 * promote a probe finding, same as any other suppression-adjacent decision;
 * this module has no opinion on that.
 *
 * IDENTITY, DUPLICATED, NOT SHARED: this file re-implements a subset of the
 * tiered-identity candidate extraction `scan/axe.ts` already has (`identity/
 * fingerprint.ts` is "the highest-risk module in the build" — its
 * DOM-reading counterpart in `axe.ts` is settled, bug-fixed code this file
 * does not touch). `buildStructuralPath`/`nearestPrecedingHeadingText` below
 * are close copies; `buildSemanticPath`'s per-level role is simplified (raw
 * tag/explicit-role only, not axe.ts's full implicit-role table) since a
 * focusable element with no accessible name is already rare enough that
 * Tier 4/5 precision matters less here than it does for axe findings.
 * Documented as a known duplication in `DECISIONS.md` D62, with a
 * consolidation suggestion for a later day, rather than left silent.
 */

import type { Page } from 'playwright';

import { TEST_HOOK_ATTRIBUTES } from '../axe.js';
import { computeGroupKey, computeTemplateKey } from '../../identity/group.js';
import {
  assignFingerprints,
  GENERATED_ID_PATTERNS,
  normaliseText,
  resolveIdentityTier,
  type FingerprintInput,
  type IdentityCandidates,
} from '../../identity/fingerprint.js';
import { criterionById } from '../../wcag/criteria.js';
import { remediationFor } from '../../wcag/remediation.js';
import type { ContextSignal, Finding, FindingIdentity, Impact, ProbeBlindRegion } from '../../types.js';

export const FOCUS_OBSCURED_RULE_ID = 'probe/focus-obscured';
export const KEYBOARD_TRAP_RULE_ID = 'probe/keyboard-trap';

/** Hard cap regardless of the tabbable-count estimate — bounds worst-case runtime on a pathological page. */
const MAX_TAB_PRESSES = 300;
/** `§6.2`: 2 × rAF, then poll scrollY stable for 2 frames, 500ms cap. */
const SCROLL_SETTLE_QUIET_FRAMES = 2;
const SCROLL_SETTLE_CAP_MS = 500;

export interface PageContext {
  url: string;
  urlTemplate: string;
}

export interface FocusPathProbeResult {
  findings: Finding[];
  blindRegions: ProbeBlindRegion[];
}

export async function runFocusPathProbe(page: Page, pageContext: PageContext): Promise<FocusPathProbeResult> {
  // Start from a known point - a mid-page focused element from some earlier
  // step would make the very first Tab press's "did focus change" check
  // meaningless.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());

  const generatedIdPatterns = GENERATED_ID_PATTERNS.map((pattern) => ({ source: pattern.source, flags: pattern.flags }));

  const snapshot = await page.evaluate(collectProbeSnapshot);
  const blindRegions: ProbeBlindRegion[] = snapshot.closedShadowSelectors.map((selector) => ({
    selector,
    reason: 'closed-shadow-root',
    unevaluatedCriteria: ['2.4.11', '2.1.2'],
  }));

  const maxPresses = Math.min(MAX_TAB_PRESSES, Math.max(50, snapshot.tabbableCount * 2));

  const candidates: CandidateFinding[] = [];
  let consecutiveUnchanged = 0;

  for (let i = 0; i < maxPresses; i += 1) {
    await page.keyboard.press('Tab');
    await page.evaluate(waitForScrollSettleInPage, { quietFrames: SCROLL_SETTLE_QUIET_FRAMES, capMs: SCROLL_SETTLE_CAP_MS });

    const step = await page.evaluate(probeStepInPage, { generatedIdPatterns, testHookAttributes: TEST_HOOK_ATTRIBUTES });

    if (step.kind === 'left-document') break;

    if (step.kind === 'unchanged') {
      consecutiveUnchanged += 1;
      // §6.3(b): confirmed twice, not once - a single evaluate round-trip
      // landing on the same element could in principle be a timing fluke;
      // two in a row pressing the SAME key is the real signal.
      if (consecutiveUnchanged >= 2 && step.snapshot) {
        candidates.push(buildTrapCandidate(step.snapshot));
        break; // nothing more to learn from a page that will not move focus.
      }
      continue;
    }
    consecutiveUnchanged = 0;

    if (step.kind === 'cycle') {
      // §6.3(c): a plain Tab press landed back on an element already seen
      // this page, without ever leaving the document. Native Tab traversal
      // reaching the true last element always exits the document (that's
      // `left-document`, handled above) - it never revisits an earlier
      // element on its own. A cycle only happens when the page's own JS
      // redirects focus, which is either a deliberate (and possibly
      // escape-less) modal trap or a genuine bug; either way it is a trap
      // candidate regardless of how much of the page it covered first -
      // including the worst case, a trap that covers every tabbable element
      // on the page and leaves nothing else reachable at all.
      if (step.snapshot) {
        candidates.push(buildTrapCandidate(step.snapshot));
      }
      break;
    }

    // step.kind === 'stepped'
    if (step.obscured) {
      candidates.push(buildObscuredCandidate(step.snapshot));
    }
  }

  const fingerprintInputs: FingerprintInput[] = candidates.map((candidate) => ({
    ruleId: candidate.ruleId,
    source: 'probe',
    identityTier: candidate.identityTier,
    identityValue: candidate.identityValue,
    context: candidate.context,
    urlTemplate: pageContext.urlTemplate,
  }));
  const assignments = assignFingerprints(fingerprintInputs);

  const findings = candidates.map((candidate, index) => buildFinding(candidate, assignments[index]!, pageContext));

  return { findings, blindRegions };
}

/* -------------------------------------------------------------------------- */
/* Node-side: turning one step's raw snapshot into Finding material           */
/* -------------------------------------------------------------------------- */

interface CandidateFinding {
  ruleId: string;
  impact: Impact;
  identityTier: Finding['identityTier'];
  identityValue: string;
  context: ContextSignal;
  /** Tier 5 candidate, kept through to `buildFinding` for `templateKey` (`01 §8`) - not part of `identity`/the fingerprint's own identity value unless Tier 5 actually won. */
  structuralPath: string;
  domDepth: number;
  textContent?: string;
  accessibleName?: string;
  selector: string;
  html: string;
  shadowPath?: string[];
}

function resolveCandidate(ruleId: string, impact: Impact, snapshot: InPageSnapshot): CandidateFinding {
  const candidates: IdentityCandidates = {
    ...(snapshot.authoredId !== undefined ? { authoredId: snapshot.authoredId } : {}),
    ...(snapshot.testHookValue !== undefined ? { testHookValue: snapshot.testHookValue } : {}),
    ...(snapshot.accessibleName !== undefined ? { accessibleName: snapshot.accessibleName } : {}),
    landmarkRole: snapshot.landmarkRole,
    semanticPath: snapshot.semanticPath,
    structuralPath: snapshot.structuralPath,
  };
  const { tier, value } = resolveIdentityTier(candidates);

  const context: ContextSignal = {
    nearestLandmark: snapshot.landmarkRole,
    headingContext: normaliseText(snapshot.headingContext),
    inFrame: [],
  };

  return {
    ruleId,
    impact,
    identityTier: tier,
    identityValue: value,
    context,
    structuralPath: snapshot.structuralPath,
    domDepth: snapshot.domDepth,
    ...(snapshot.textContent.trim() ? { textContent: normaliseText(snapshot.textContent) } : {}),
    ...(snapshot.accessibleName !== undefined ? { accessibleName: normaliseText(snapshot.accessibleName) } : {}),
    selector: snapshot.selector,
    html: snapshot.html,
    ...(snapshot.shadowPath.length > 0 ? { shadowPath: snapshot.shadowPath } : {}),
  };
}

/** §6.3(d): a real, likely user-facing keyboard-navigation blocker, but not usually catastrophic - the page can still be operated. */
const OBSCURED_IMPACT: Impact = 'serious';
/** §6.3(b)/(c): a keyboard-only user can get stuck with no way to proceed. */
const TRAP_IMPACT: Impact = 'critical';

function buildObscuredCandidate(snapshot: InPageSnapshot): CandidateFinding {
  return resolveCandidate(FOCUS_OBSCURED_RULE_ID, OBSCURED_IMPACT, snapshot);
}

function buildTrapCandidate(snapshot: InPageSnapshot): CandidateFinding {
  return resolveCandidate(KEYBOARD_TRAP_RULE_ID, TRAP_IMPACT, snapshot);
}

const HTML_TRUNCATE_LENGTH = 400;

function buildFinding(
  candidate: CandidateFinding,
  assignment: { fingerprint: string; ordinal: number },
  pageContext: PageContext,
): Finding {
  const identity: FindingIdentity = {
    value: candidate.identityValue,
    ordinal: assignment.ordinal,
    context: candidate.context,
    domDepth: candidate.domDepth,
    ...(candidate.textContent !== undefined ? { textContent: candidate.textContent } : {}),
  };

  const groupKey = computeGroupKey({
    ruleId: candidate.ruleId,
    source: 'probe',
    ...(candidate.accessibleName !== undefined ? { accessibleName: candidate.accessibleName } : {}),
    identityValue: candidate.identityValue,
    landmarkRole: candidate.context.nearestLandmark,
  });
  const templateKey = computeTemplateKey({
    ruleId: candidate.ruleId,
    source: 'probe',
    landmarkRole: candidate.context.nearestLandmark,
    structuralPath: candidate.structuralPath,
  });

  const criterionId = candidate.ruleId === FOCUS_OBSCURED_RULE_ID ? '2.4.11' : '2.1.2';
  const criterion = criterionById(criterionId);

  return {
    fingerprint: assignment.fingerprint,
    groupKey,
    templateKey,
    identityTier: candidate.identityTier,
    identity,
    source: 'probe',
    ruleId: candidate.ruleId,
    // §6, invariant 3: probes never gate. Always needs-review, never violation.
    bucket: 'needs-review',
    bestPractice: false,
    impact: candidate.impact,
    criteria: criterion ? [criterion] : [],
    tags: [],
    url: pageContext.url,
    urlTemplate: pageContext.urlTemplate,
    selector: candidate.selector,
    ...(candidate.shadowPath ? { shadowPath: candidate.shadowPath } : {}),
    html: candidate.html.slice(0, HTML_TRUNCATE_LENGTH),
    ...(candidate.accessibleName !== undefined ? { accessibleName: candidate.accessibleName } : {}),
    remediation: remediationFor(candidate.ruleId),
  };
}

/* -------------------------------------------------------------------------- */
/* In-page code below this line. Runs in the browser, not in Node.            */
/* Each exported-to-evaluate function must be fully self-contained - no       */
/* references to module-scope helpers, per `scan/axe.ts`'s own note on why.   */
/* -------------------------------------------------------------------------- */

interface InPageSnapshot {
  authoredId?: string;
  testHookValue?: string;
  accessibleName?: string;
  landmarkRole: string;
  semanticPath: string;
  structuralPath: string;
  headingContext: string;
  domDepth: number;
  textContent: string;
  selector: string;
  html: string;
  shadowPath: string[];
}

interface ObscuredInfo {
  coveringSelector: string;
}

type ProbeStepResult =
  | { kind: 'left-document' }
  | { kind: 'unchanged'; snapshot: InPageSnapshot | null }
  | { kind: 'cycle'; snapshot: InPageSnapshot | null }
  | { kind: 'stepped'; snapshot: InPageSnapshot; obscured: ObscuredInfo | null };

interface ProbeSnapshotResult {
  /** Approximate count of elements a plain Tab-only traversal should reach (`§6.3`'s "known tabbables"). */
  tabbableCount: number;
  /** Display-only selectors for closed shadow-root hosts, for `PageResult.probeBlindRegions`. */
  closedShadowSelectors: string[];
}

/**
 * `page.evaluate(fn)` ships only `fn`'s own source text — no closures over
 * other module-scope functions (`scan/axe.ts` notes the same constraint).
 * `describeElement`/`isVisible`/etc. are therefore nested INSIDE every
 * function actually passed to `evaluate`, not shared at module scope, even
 * though that means near-identical small helpers appear more than once in
 * this file.
 */
function collectProbeSnapshot(): ProbeSnapshotResult {
  /** Standard focusable-elements heuristic - not the full HTML-AAM algorithm, same spirit as `axe.ts`'s landmark walk. */
  const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
    'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

  function isVisible(el: Element): boolean {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /** Recurses into open shadow roots (focus can reach them); cannot and does not recurse into closed ones. */
  function countFocusableRecursive(root: ParentNode): number {
    let count = 0;
    for (const el of root.querySelectorAll(FOCUSABLE_SELECTOR)) {
      if (isVisible(el)) count += 1;
    }
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) count += countFocusableRecursive(el.shadowRoot);
    }
    return count;
  }

  function describeElement(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const classAttr = el.getAttribute('class');
    const classes = classAttr ? `.${classAttr.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${tag}${id}${classes}`;
  }

  const tabbableCount = countFocusableRecursive(document);

  const closedHosts =
    (window as unknown as { __a11yRatchetClosedShadowHosts?: Element[] }).__a11yRatchetClosedShadowHosts ?? [];
  const closedShadowSelectors = closedHosts
    .filter((host) => document.contains(host))
    .map((host) => describeElement(host));

  return { tabbableCount, closedShadowSelectors };
}

/** `§6.2`. Not `scrollend` - it never fires when a Tab press needed no scrolling at all, which is the common case. */
function waitForScrollSettleInPage(args: { quietFrames: number; capMs: number }): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const startedAt = performance.now();
        let lastY = window.scrollY;
        let stableFrames = 0;

        function poll(): void {
          if (performance.now() - startedAt > args.capMs) {
            resolve();
            return;
          }
          const y = window.scrollY;
          if (y === lastY) {
            stableFrames += 1;
            if (stableFrames >= args.quietFrames) {
              resolve();
              return;
            }
          } else {
            stableFrames = 0;
            lastY = y;
          }
          requestAnimationFrame(poll);
        }
        poll();
      }),
    );
  });
}

function probeStepInPage(args: {
  generatedIdPatterns: Array<{ source: string; flags: string }>;
  testHookAttributes: string[];
}): ProbeStepResult {
  /* ---- helpers first, main logic last (all inside probeStepInPage - evaluate()
     ships one function's source only). Not just style: helpers below include
     `const` lookup tables (LANDMARK_TAG_ROLES etc.), and `const` is not
     hoisted the way `function` declarations are - the main logic's early
     returns call into these helpers, so the helpers' consts must already be
     initialised by the time control reaches that code, not merely declared
     later in the same function body. ---- */

  function describeElement(node: Element): string {
    const tag = node.tagName.toLowerCase();
    const id = node.id ? `#${node.id}` : '';
    const classAttr = node.getAttribute('class');
    const classes = classAttr ? `.${classAttr.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${tag}${id}${classes}`;
  }

  function elementParent(node: Element): Element | null {
    const parent = node.parentElement;
    if (parent) return parent;
    const root = node.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  }

  const LANDMARK_TAG_ROLES: Record<string, string> = {
    header: 'banner',
    footer: 'contentinfo',
    main: 'main',
    nav: 'navigation',
    aside: 'complementary',
  };
  const EXPLICIT_LANDMARK_ROLES = new Set([
    'banner', 'complementary', 'contentinfo', 'form', 'main', 'navigation', 'region', 'search',
  ]);
  const SECTIONING_ANCESTOR_SELECTOR = 'article, aside, main, nav, section';

  function implicitLandmarkRole(node: Element): string | null {
    const explicitRole = node.getAttribute('role');
    if (explicitRole && EXPLICIT_LANDMARK_ROLES.has(explicitRole)) return explicitRole;
    const tag = node.tagName.toLowerCase();
    if (tag === 'header' || tag === 'footer') {
      return node.closest(SECTIONING_ANCESTOR_SELECTOR) ? null : (LANDMARK_TAG_ROLES[tag] ?? null);
    }
    if (tag === 'form' || tag === 'section') {
      const named = node.hasAttribute('aria-label') || node.hasAttribute('aria-labelledby');
      if (!named) return null;
      return tag === 'form' ? 'form' : 'region';
    }
    return LANDMARK_TAG_ROLES[tag] ?? null;
  }

  function nearestLandmarkAncestor(node: Element): Element | null {
    let cursor = elementParent(node);
    while (cursor) {
      if (implicitLandmarkRole(cursor)) return cursor;
      cursor = elementParent(cursor);
    }
    return null;
  }

  function nearestLandmarkRole(node: Element): string {
    const landmark = nearestLandmarkAncestor(node);
    return landmark ? implicitLandmarkRole(landmark)! : 'none';
  }

  const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, [role="heading"]';

  // Same escalate-through-shadow-scopes approach as scan/axe.ts (DECISIONS.md
  // D33) - a heading outside a shadow boundary is still "context" for
  // content inside it.
  function nearestPrecedingHeadingText(node: Element): string {
    let anchor: Element | null = node;
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
          break;
        }
      }
      if (candidate) return candidate.textContent ?? 'none';
      anchor = root instanceof ShadowRoot ? root.host : null;
    }
    return 'none';
  }

  function elementDomDepth(node: Element): number {
    let depth = 0;
    let cursor = elementParent(node);
    while (cursor) {
      depth += 1;
      cursor = elementParent(cursor);
    }
    return depth;
  }

  const MAX_PATH_DEPTH = 8;
  function capPathDepth(chain: string[]): string[] {
    return chain.length > MAX_PATH_DEPTH ? chain.slice(chain.length - MAX_PATH_DEPTH) : chain;
  }

  // Simplified vs. axe.ts's buildSemanticPath: raw explicit role or tag name
  // per level, not the fuller implicit-role table. A focusable element with
  // no accessible name (the only case this path actually matters for) is
  // rare enough that this is an acceptable Tier 4 approximation.
  function buildSemanticPath(node: Element): string {
    const landmark = nearestLandmarkAncestor(node);
    if (!landmark) return 'none';
    const chain: string[] = [];
    let cursor: Element | null = node;
    while (cursor && cursor !== landmark) {
      chain.unshift(cursor.getAttribute('role') ?? cursor.tagName.toLowerCase());
      cursor = elementParent(cursor);
    }
    return [implicitLandmarkRole(landmark) ?? landmark.tagName.toLowerCase(), ...capPathDepth(chain)].join(' > ');
  }

  const generatedIdPatterns = args.generatedIdPatterns.map((p) => new RegExp(p.source, p.flags));
  function isIdGenerated(id: string): boolean {
    return generatedIdPatterns.some((pattern) => pattern.test(id));
  }

  function nearestStableAncestor(node: Element): Element {
    let cursor = elementParent(node);
    while (cursor) {
      if ((cursor.id && !isIdGenerated(cursor.id)) || implicitLandmarkRole(cursor) || cursor === document.body) {
        return cursor;
      }
      cursor = elementParent(cursor);
    }
    return document.body;
  }

  function sameTagSiblingIndex(node: Element): number {
    let index = 0;
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === node.tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    return index;
  }

  function buildStructuralPath(node: Element): string {
    const anchor = nearestStableAncestor(node);
    const chain: string[] = [];
    let cursor: Element | null = node;
    while (cursor && cursor !== anchor) {
      chain.unshift(`${cursor.tagName.toLowerCase()}[${sameTagSiblingIndex(cursor)}]`);
      cursor = elementParent(cursor);
    }
    return capPathDepth(chain).join(' > ');
  }

  function testHookValue(node: Element): string | undefined {
    for (const attribute of args.testHookAttributes) {
      const value = node.getAttribute(attribute);
      if (value) return value;
    }
    return undefined;
  }

  function safeAccessibleText(node: Element): string | undefined {
    const axe = (window as unknown as { axe?: { commons: { text: { accessibleText(e: Element): string } }; setup(n: Document): unknown; teardown(): void } }).axe;
    if (!axe) return undefined;
    try {
      axe.setup(document);
      try {
        return axe.commons.text.accessibleText(node);
      } finally {
        axe.teardown();
      }
    } catch {
      return undefined;
    }
  }

  /**
   * `§6.3(d)`: samples the focused element's SCROLL-MARGIN box (the rect
   * expanded outward by computed `scroll-margin-*`, per `§6.2` - the correct
   * fix for a sticky header, checked BEFORE flagging) at five points. If
   * every sampled point's topmost hit is a different, visible, non-zero-
   * opacity `position: fixed`/`sticky` element, the target is obscured.
   * Filtering on visibility/opacity is `§6.4`'s named false-positive guard:
   * a `display:none` skip-link or an `opacity:0` fixed overlay must not
   * count as "covering" anything.
   */
  function checkObscured(target: Element): ObscuredInfo | null {
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const style = getComputedStyle(target);
    const marginTop = parseFloat(style.scrollMarginTop) || 0;
    const marginRight = parseFloat(style.scrollMarginRight) || 0;
    const marginBottom = parseFloat(style.scrollMarginBottom) || 0;
    const marginLeft = parseFloat(style.scrollMarginLeft) || 0;

    const box = {
      top: rect.top - marginTop,
      right: rect.right + marginRight,
      bottom: rect.bottom + marginBottom,
      left: rect.left - marginLeft,
    };

    const points: Array<[number, number]> = [
      [box.left + 1, box.top + 1],
      [box.right - 1, box.top + 1],
      [box.left + 1, box.bottom - 1],
      [box.right - 1, box.bottom - 1],
      [(box.left + box.right) / 2, (box.top + box.bottom) / 2],
    ];

    let coveringSelector: string | null = null;
    for (const [x, y] of points) {
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue; // off-viewport corner, not this check's concern
      const top = document.elementFromPoint(x, y);
      if (!top) return null; // a sample point resolved to nothing - can't confirm full coverage
      if (top === target || target.contains(top) || top.contains(target)) return null; // target itself is on top here - clears at this point

      const topStyle = getComputedStyle(top);
      const isFixedOrSticky = topStyle.position === 'fixed' || topStyle.position === 'sticky';
      const isVisibleCovering =
        topStyle.display !== 'none' && topStyle.visibility !== 'hidden' && Number(topStyle.opacity) !== 0;
      if (!isFixedOrSticky || !isVisibleCovering) return null; // covered by something, but not a qualifying obscurer at this point

      coveringSelector ??= describeElement(top);
    }

    return coveringSelector ? { coveringSelector } : null;
  }

  function buildSnapshot(node: Element, path: string[]): InPageSnapshot {
    const hookValue = testHookValue(node);
    const accessibleName = safeAccessibleText(node);
    return {
      ...(node.id ? { authoredId: node.id } : {}),
      ...(hookValue !== undefined ? { testHookValue: hookValue } : {}),
      ...(accessibleName !== undefined ? { accessibleName } : {}),
      landmarkRole: nearestLandmarkRole(node),
      semanticPath: buildSemanticPath(node),
      structuralPath: buildStructuralPath(node),
      headingContext: nearestPrecedingHeadingText(node),
      domDepth: elementDomDepth(node),
      textContent: node.textContent ?? '',
      selector: describeElement(node),
      html: node.outerHTML,
      shadowPath: path,
    };
  }

  /* ---- main logic: every helper above is fully initialised by this point ---- */

  type ProbeState = { visited: Element[] };
  const state = ((window as unknown as { __a11yRatchetProbeState?: ProbeState }).__a11yRatchetProbeState ??= {
    visited: [],
  });

  /* §6.1: shadow-aware deep active element */
  let el: Element | null = document.activeElement;
  const shadowPath: string[] = [];
  while (el?.shadowRoot?.activeElement) {
    shadowPath.push(describeElement(el));
    el = el.shadowRoot.activeElement;
  }

  if (!el || el === document.body) {
    return { kind: 'left-document' };
  }

  const last = state.visited[state.visited.length - 1];
  if (last === el) {
    return { kind: 'unchanged', snapshot: buildSnapshot(el, shadowPath) };
  }

  if (state.visited.includes(el)) {
    return { kind: 'cycle', snapshot: buildSnapshot(el, shadowPath) };
  }

  state.visited.push(el);
  const obscured = checkObscured(el);
  return { kind: 'stepped', snapshot: buildSnapshot(el, shadowPath), obscured };
}
