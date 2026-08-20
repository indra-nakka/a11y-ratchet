/**
 * Tiered element identity and the fingerprint hash (`02-IDENTITY-AND-DIFF.md
 * §3`). The highest-risk module in the build — every other module depends on
 * getting this right (`01 §1`).
 *
 * DOM-dependent work (walking ancestors to build the tier 4/5 candidate
 * paths, reading the accessible name) happens in the browser, in
 * `scan/axe.ts` — Playwright's `page.evaluate` can't ship a live `Element`
 * back to Node, so this module never sees one. What it receives instead is
 * `IdentityCandidates`: every tier's already-computed raw value, gathered in
 * one browser pass. This module's job is the part that doesn't need a DOM:
 * choosing which tier wins, normalising the chosen value, filtering
 * generated ids, and hashing. That split is also why it's fast to unit test
 * — no browser required for anything in this file.
 */

import { createHash } from 'node:crypto';

import type { ContextSignal, IdentityTier, Source } from '../types.js';

/* -------------------------------------------------------------------------- */
/* §3.2 — Generated-id filter                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Framework-generated ids are worse than none: stable within a run,
 * different between builds. An authored id matching any of these is
 * rejected for Tier 1, and resolution falls through to Tier 2.
 */
export const GENERATED_ID_PATTERNS: readonly RegExp[] = [
  /^:r[0-9a-z]+:$/i, // React useId
  /^radix-/, // Radix
  /^headlessui-/, // Headless UI
  /^mui-/, // MUI
  /^:[a-z0-9]+:$/i, // generic scoped id
  /[0-9a-f]{8,}/i, // embedded hash
  /\d{5,}/, // long numeric run
  /^(ember|ng-)/, // Ember / Angular
];

export function isGeneratedId(id: string, extraPatterns: readonly RegExp[] = []): boolean {
  return [...GENERATED_ID_PATTERNS, ...extraPatterns].some((pattern) => pattern.test(id));
}

/* -------------------------------------------------------------------------- */
/* §3.3 — Normalisation                                                       */
/* -------------------------------------------------------------------------- */

/** Zero-width spaces/joiners, directional embedding/override marks, directional isolates. */
const ZERO_WIDTH_AND_DIRECTIONAL = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;
const ISO_DATETIME =
  /\b\d{4}-\d{2}-\d{2}(?:[t ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:?\d{2})?)?\b/gi;
const CLOCK_TIME = /\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:am|pm)?\b/gi;
const CURRENCY = /[$£€¥]\s?\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s?(?:usd|gbp|eur|jpy)\b/gi;
const DIGIT_RUN = /\d{2,}/g;
/** Whole string is only digits, punctuation and whitespace: masking is skipped (`§3.3` exception). */
const ONLY_DIGITS_AND_PUNCTUATION = /^[\d\s\p{P}]+$/u;

const NORMALISED_MAX_LENGTH = 80;

/**
 * `§3.3`: collapse whitespace, trim, lowercase, strip zero-width and
 * directional marks, mask digit runs / dates / currency — except when the
 * whole string IS digits and punctuation ("12" must stay "12", or a
 * pagination bar labelled "10 11 12 13 14" collapses all five controls into
 * one fingerprint). The rule is: mask digits EMBEDDED IN text ("page # of
 * #"), preserve digits that ARE the text ("12"). Truncates to 80 chars.
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

/* -------------------------------------------------------------------------- */
/* §3.1 — Tiered identity                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every tier's raw candidate value, gathered from the live DOM in
 * `scan/axe.ts`. `semanticPath` and `structuralPath` are already full
 * ancestor-to-element paths (role-or-tag per level; tag+same-tag-sibling-
 * index per level) — this module picks a winner, it doesn't build paths.
 */
export interface IdentityCandidates {
  /** Raw `element.id`, unfiltered — the generated-id filter runs here, not in the browser. */
  authoredId?: string;
  testHookValue?: string;
  /** Raw accessible name, unnormalised. */
  accessibleName?: string;
  /** `'none'` if the element has no landmark ancestor. */
  landmarkRole: string;
  /** Role-or-tag path from the nearest landmark ancestor to the element, e.g. `"navigation > list > listitem > link"`. */
  semanticPath: string;
  /** tag[same-tag-sibling-index] path from the nearest stable ancestor to the element. */
  structuralPath: string;
}

export interface ResolvedIdentity {
  tier: IdentityTier;
  /** Normalised for Tier 3 (accessible name); tiers 1, 2, 4, 5 are structural/authored tokens, not prose - not run through `normaliseText`. */
  value: string;
}

/**
 * First available tier wins (`§3.1`). Tiers 4 and 5 always resolve to
 * something — `semanticPath`/`structuralPath` are built in the browser
 * specifically so this function never has to say "no identity at all".
 */
export function resolveIdentityTier(
  candidates: IdentityCandidates,
  extraIgnoredIdPatterns: readonly RegExp[] = [],
): ResolvedIdentity {
  if (candidates.authoredId && !isGeneratedId(candidates.authoredId, extraIgnoredIdPatterns)) {
    return { tier: 1, value: candidates.authoredId };
  }
  if (candidates.testHookValue) {
    return { tier: 2, value: candidates.testHookValue };
  }
  if (candidates.accessibleName?.trim()) {
    return { tier: 3, value: normaliseText(candidates.accessibleName) };
  }
  if (candidates.landmarkRole !== 'none') {
    return { tier: 4, value: candidates.semanticPath };
  }
  return { tier: 5, value: candidates.structuralPath };
}

/* -------------------------------------------------------------------------- */
/* §5 — URL templating                                                        */
/* -------------------------------------------------------------------------- */

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGITS_ONLY_SEGMENT = /^\d+$/;
/** Only matches once digits-only segments are already claimed above - never fires on a pure-digit id. */
const HASH_SEGMENT = /^[0-9a-f]{8,}$/i;
const YEAR_SEGMENT = /^\d{4}$/;
const TWO_DIGIT_SEGMENT = /^\d{2}$/;

const TRACKING_PARAM_NAMES = new Set(['fbclid', 'gclid', 'ref']);
const isUtmParam = (key: string): boolean => key.toLowerCase().startsWith('utm_');
const isTrackingParam = (key: string): boolean => TRACKING_PARAM_NAMES.has(key.toLowerCase()) || isUtmParam(key);

function isPlausibleDatePart(month: string, day: string): boolean {
  const monthNum = Number(month);
  const dayNum = Number(day);
  return monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31;
}

function templateSegments(segments: readonly string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!;
    const next1 = segments[i + 1];
    const next2 = segments[i + 2];

    if (
      next1 !== undefined &&
      next2 !== undefined &&
      YEAR_SEGMENT.test(segment) &&
      TWO_DIGIT_SEGMENT.test(next1) &&
      TWO_DIGIT_SEGMENT.test(next2) &&
      isPlausibleDatePart(next1, next2)
    ) {
      result.push(':year', ':month', ':day');
      i += 2;
      continue;
    }

    if (UUID_SEGMENT.test(segment)) {
      result.push(':uuid');
    } else if (DIGITS_ONLY_SEGMENT.test(segment)) {
      result.push(':id');
    } else if (HASH_SEGMENT.test(segment)) {
      result.push(':hash');
    } else {
      result.push(segment);
    }
  }
  return result;
}

function templateQuery(search: URLSearchParams): string {
  const kept = [...search.entries()]
    .filter(([key]) => !isTrackingParam(key))
    .sort(([a], [b]) => a.localeCompare(b));
  if (kept.length === 0) return '';
  return '?' + kept.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
}

export interface UrlTemplateOptions {
  /** SPAs with hash routing need this, or every route collapses to one (`§5`). */
  hashRouting?: boolean;
}

/**
 * `§5`: numeric/UUID/hash path segments templated, date triplets collapsed,
 * trailing slash normalised off, query params sorted with tracking
 * parameters stripped, fragment stripped unless `hashRouting`. Path-only
 * (plus hash/query) - no origin, matching the doc's own example
 * (`/product/:id`, not `https://example.com/product/:id`).
 */
export function urlTemplateFor(url: string, options: UrlTemplateOptions = {}): string {
  const parsed = new URL(url);
  const pathSegments = parsed.pathname.split('/').filter((segment) => segment.length > 0);
  const templatedPath = templateSegments(pathSegments);
  const pathStr = templatedPath.length > 0 ? `/${templatedPath.join('/')}` : '/';

  let hashStr = '';
  if (options.hashRouting && parsed.hash.length > 1) {
    const hashSegments = parsed.hash
      .slice(1)
      .split('/')
      .filter((segment) => segment.length > 0);
    if (hashSegments.length > 0) {
      hashStr = `#/${templateSegments(hashSegments).join('/')}`;
    }
  }

  return pathStr + hashStr + templateQuery(parsed.searchParams);
}

/* -------------------------------------------------------------------------- */
/* §3.5 — The hash, and collisions                                            */
/* -------------------------------------------------------------------------- */

export interface FingerprintInput {
  ruleId: string;
  source: Source;
  identityTier: IdentityTier;
  identityValue: string;
  context: ContextSignal;
  urlTemplate: string;
}

const FINGERPRINT_HASH_LENGTH = 16;

/**
 * `sha256([ruleId, source, identityTier, identityValue, contextSignal,
 * urlTemplate]).slice(0, 16)` (`§3.5`). Deliberately excludes: raw CSS
 * selector, `outerHTML`, absolute sibling indices, `impact`.
 *
 * Inputs are joined via `JSON.stringify` of the tuple, not string
 * concatenation - concatenating `['ab', 'c']` and `['a', 'bc']` produces the
 * same string and would silently collide two different identities.
 */
export function computeBaseFingerprint(input: FingerprintInput): string {
  const tuple = [
    input.ruleId,
    input.source,
    String(input.identityTier),
    input.identityValue,
    JSON.stringify(input.context),
    input.urlTemplate,
  ];
  return createHash('sha256').update(JSON.stringify(tuple)).digest('hex').slice(0, FINGERPRINT_HASH_LENGTH);
}

export interface FingerprintAssignment {
  /** Base hash, or `${baseHash}#${ordinal}` when this page has a collision. */
  fingerprint: string;
  ordinal: number;
}

/**
 * Assigns final fingerprints for one page's findings, resolving collisions
 * by document-order ordinal (`§3.5`). `inputs` MUST already be in document
 * order — `scan/axe.ts` sorts raw findings by `Node.compareDocumentPosition`
 * before this is ever reached, since a live DOM comparison isn't available
 * here.
 *
 * A finding whose base hash is unique on the page gets that hash unsuffixed
 * and `ordinal: 0`. Only an actual collision (two or more findings sharing a
 * base hash - e.g. three identical unlabelled icon buttons in one toolbar)
 * gets the `#0`, `#1`, … suffix. Without this, N-to-1 collapse would
 * silently lose N-1 findings.
 */
export function assignFingerprints(inputs: readonly FingerprintInput[]): FingerprintAssignment[] {
  const baseHashes = inputs.map(computeBaseFingerprint);

  const totalByHash = new Map<string, number>();
  for (const hash of baseHashes) {
    totalByHash.set(hash, (totalByHash.get(hash) ?? 0) + 1);
  }

  const seenByHash = new Map<string, number>();
  return baseHashes.map((hash) => {
    if (totalByHash.get(hash) === 1) {
      return { fingerprint: hash, ordinal: 0 };
    }
    const ordinal = seenByHash.get(hash) ?? 0;
    seenByHash.set(hash, ordinal + 1);
    return { fingerprint: `${hash}#${ordinal}`, ordinal };
  });
}
