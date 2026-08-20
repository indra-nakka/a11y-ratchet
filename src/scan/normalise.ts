/**
 * Raw axe output → `Finding[]` (`01 §2`).
 *
 * Populates `Finding.identity` fully — tier resolution, context signal, DOM
 * depth, normalised text content (`DECISIONS.md` D3). `fingerprint` and
 * `groupKey` are left as documented placeholders: hashing tiered identity
 * into a stable string, generated-id filtering and collision-ordinal
 * assignment across a page are `identity/fingerprint.ts` and
 * `identity/group.ts`, Day 4.
 *
 * `criteria` and `remediation` are real as of Day 3 — `wcag/ruleMap.ts` and
 * `wcag/remediation.ts`.
 */

import type { RawFinding } from './axe.js';
import { criteriaForTags, isBestPractice } from '../wcag/ruleMap.js';
import { remediationFor } from '../wcag/remediation.js';
import type { Bucket, ContextSignal, Finding, FindingIdentity, IdentityTier } from '../types.js';

/** Day 4 (`identity/fingerprint.ts`, `identity/group.ts`) computes the real hash. */
export const FINGERPRINT_PLACEHOLDER = 'unset:day-4-fingerprint';
export const GROUP_KEY_PLACEHOLDER = 'unset:day-4-groupkey';

const HTML_TRUNCATE_LENGTH = 400;

export interface PageContext {
  url: string;
  /**
   * Day 4–6 (`02 §5`) builds real URL templating from the crawler. Until then
   * this equals `url` - every page is its own template.
   */
  urlTemplate: string;
}

export function normaliseRawFindings(raw: RawFinding[], page: PageContext): Finding[] {
  return raw.map((entry) => buildFinding(entry, page));
}

function buildFinding(raw: RawFinding, page: PageContext): Finding {
  const { selector, frameSelector, shadowPath } = parseTarget(raw.target);
  const { tier, value } = resolveIdentityTier(raw);
  const normalisedTextContent = raw.rawTextContent.trim() ? normaliseText(raw.rawTextContent) : undefined;

  const context: ContextSignal = {
    nearestLandmark: raw.landmarkRole,
    headingContext: normaliseText(raw.headingContext),
    inFrame: frameSelector ?? [],
  };

  const identity: FindingIdentity = {
    value,
    // Day 4: collision-ordinal assignment when several findings on one page
    // share an identity value. Every finding is ordinal 0 until then.
    ordinal: 0,
    context,
    domDepth: raw.domDepth,
    ...(normalisedTextContent !== undefined ? { textContent: normalisedTextContent } : {}),
  };

  return {
    fingerprint: FINGERPRINT_PLACEHOLDER,
    groupKey: GROUP_KEY_PLACEHOLDER,
    identityTier: tier,
    identity,
    source: 'axe',
    ruleId: raw.ruleId,
    bucket: raw.bucket satisfies Bucket,
    // Set from tags, not from criteria.length === 0 (DECISIONS.md D4) - a gap
    // in wcag/criteria.ts must never silently read as "not a WCAG failure".
    bestPractice: isBestPractice(raw.tags),
    impact: raw.impact,
    criteria: criteriaForTags(raw.tags),
    tags: raw.tags,
    url: page.url,
    urlTemplate: page.urlTemplate,
    selector,
    ...(frameSelector ? { frameSelector } : {}),
    ...(shadowPath ? { shadowPath } : {}),
    html: raw.html.slice(0, HTML_TRUNCATE_LENGTH),
    ...(raw.accessibleName !== undefined ? { accessibleName: normaliseText(raw.accessibleName) } : {}),
    remediation: remediationFor(raw.ruleId),
    helpUrl: raw.helpUrl,
  };
}

/**
 * Identity tiers, first available wins (`02 §3.1`). Tiers 1–3 are resolved
 * from real per-node data. Tiers 4–5 use a simplified one- or two-segment
 * path rather than the full ancestor chain the docs specify — none of the
 * Day 1 fixtures fall through that far (every planted defect has an id), so
 * building and testing the full path walk is left to Day 4, alongside the
 * generated-id filter this also doesn't apply yet (`02 §3.2`).
 */
function resolveIdentityTier(raw: RawFinding): { tier: IdentityTier; value: string } {
  if (raw.authoredId) {
    return { tier: 1, value: raw.authoredId };
  }
  if (raw.testHookValue) {
    return { tier: 2, value: raw.testHookValue };
  }
  if (raw.accessibleName && raw.accessibleName.trim()) {
    return { tier: 3, value: normaliseText(raw.accessibleName) };
  }
  if (raw.landmarkRole !== 'none') {
    return { tier: 4, value: `${raw.landmarkRole} > ${raw.tagName}` };
  }
  return { tier: 5, value: `${raw.tagName}[${raw.siblingIndex}]` };
}

/**
 * axe's cross-tree `target`: a frame-crossing selector chain, possibly with a
 * shadow-DOM chain as its last entry. Maps to `Finding.selector` (display),
 * `frameSelector` and `shadowPath` (`01 §6.1`, `02 §3.1`).
 */
function parseTarget(target: Array<string | string[]>): {
  selector: string;
  frameSelector?: string[];
  shadowPath?: string[];
} {
  const frameSelector: string[] = [];
  let shadowPath: string[] | undefined;
  let selector = '';

  target.forEach((entry, index) => {
    const isLast = index === target.length - 1;
    if (Array.isArray(entry)) {
      if (isLast) {
        shadowPath = entry.slice(0, -1);
        selector = entry[entry.length - 1] ?? '';
      } else {
        // A shadow chain that isn't the final frame level - best-effort
        // display only, not used for identity.
        frameSelector.push(entry.join(' >>> '));
      }
    } else if (isLast) {
      selector = entry;
    } else {
      frameSelector.push(entry);
    }
  });

  return {
    selector,
    ...(frameSelector.length ? { frameSelector } : {}),
    ...(shadowPath ? { shadowPath } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Text normalisation (`02 §3.3`)                                             */
/* -------------------------------------------------------------------------- */

/** Zero-width spaces/joiners, directional embedding/override marks, directional isolates. */
const ZERO_WIDTH_AND_DIRECTIONAL = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;
const ISO_DATETIME =
  /\b\d{4}-\d{2}-\d{2}(?:[t ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:?\d{2})?)?\b/gi;
const CLOCK_TIME = /\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:am|pm)?\b/gi;
const CURRENCY =
  /[$£€¥]\s?\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s?(?:usd|gbp|eur|jpy)\b/gi;
const DIGIT_RUN = /\d{2,}/g;
/** Whole string is only digits, punctuation and whitespace: masking is skipped (`02 §3.3` exception). */
const ONLY_DIGITS_AND_PUNCTUATION = /^[\d\s\p{P}]+$/u;

const NORMALISED_MAX_LENGTH = 80;

/**
 * `02 §3.3`: collapse whitespace, trim, lowercase, strip zero-width and
 * directional marks, mask digit runs / dates / currency — except when the
 * whole string IS digits and punctuation ("12" must stay "12", or a
 * pagination bar collapses every control to one fingerprint). Truncates to
 * 80 chars.
 */
export function normaliseText(raw: string, maxLength = NORMALISED_MAX_LENGTH): string {
  let text = raw.replace(ZERO_WIDTH_AND_DIRECTIONAL, '');
  text = text.replace(/\s+/g, ' ').trim().toLowerCase();

  if (text.length > 0 && ONLY_DIGITS_AND_PUNCTUATION.test(text)) {
    return text.slice(0, maxLength);
  }

  text = text.replace(ISO_DATETIME, '#date');
  text = text.replace(CLOCK_TIME, '#date');
  text = text.replace(CURRENCY, '#money');
  text = text.replace(DIGIT_RUN, '#');

  return text.slice(0, maxLength);
}
