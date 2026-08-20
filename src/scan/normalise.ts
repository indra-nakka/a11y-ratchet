/**
 * Raw axe output → `Finding[]` (`01 §2`).
 *
 * Populates `Finding.identity` fully — tier resolution (`identity/
 * fingerprint.ts`), context signal, DOM depth, normalised text content
 * (`DECISIONS.md` D3) — and, as of Day 4, real `fingerprint` and `groupKey`
 * values (`identity/fingerprint.ts`, `identity/group.ts`).
 *
 * Two passes over one page's raw findings, not one: collision-ordinal
 * assignment (`02 §3.5`) needs every finding's base fingerprint at once, so
 * tier resolution and context-building happen first for the whole page,
 * THEN fingerprints are assigned across the resulting set. `raw` must
 * already be in document order - `scan/axe.ts` sorts it there, since this
 * module never has a live DOM to compute document position itself.
 *
 * `criteria` and `remediation` are real as of Day 3 — `wcag/ruleMap.ts` and
 * `wcag/remediation.ts`.
 */

import type { RawFinding } from './axe.js';
import { computeGroupKey } from '../identity/group.js';
import {
  assignFingerprints,
  normaliseText,
  resolveIdentityTier,
  type FingerprintInput,
  type IdentityCandidates,
} from '../identity/fingerprint.js';
import { criteriaForTags, isBestPractice } from '../wcag/ruleMap.js';
import { remediationFor } from '../wcag/remediation.js';
import type { Bucket, ContextSignal, Finding, FindingIdentity } from '../types.js';

const HTML_TRUNCATE_LENGTH = 400;

export interface PageContext {
  url: string;
  /** Computed once per page by the caller via `identity/fingerprint.ts`'s `urlTemplateFor` (`02 §5`). */
  urlTemplate: string;
}

export interface NormaliseOptions {
  /** `02 §3.2`: config-extensible generated-id patterns. Wiring from `config/schema.ts` is Day 8. */
  ignoredIdPatterns?: RegExp[];
}

/** `raw` must be in document order (`scan/axe.ts` guarantees this). */
export function normaliseRawFindings(raw: RawFinding[], page: PageContext, options: NormaliseOptions = {}): Finding[] {
  const resolved = raw.map((entry) => resolveOne(entry, page, options.ignoredIdPatterns ?? []));

  const fingerprintInputs: FingerprintInput[] = resolved.map((entry) => ({
    ruleId: entry.raw.ruleId,
    source: 'axe',
    identityTier: entry.identityTier,
    identityValue: entry.identityValue,
    context: entry.context,
    urlTemplate: page.urlTemplate,
  }));
  const assignments = assignFingerprints(fingerprintInputs);

  return resolved.map((entry, index) => buildFinding(entry, assignments[index]!));
}

interface ResolvedEntry {
  raw: RawFinding;
  identityTier: Finding['identityTier'];
  identityValue: string;
  context: ContextSignal;
  textContent: string | undefined;
  selector: string;
  frameSelector: string[] | undefined;
  shadowPath: string[] | undefined;
  normalisedAccessibleName: string | undefined;
  page: PageContext;
}

function resolveOne(raw: RawFinding, page: PageContext, ignoredIdPatterns: RegExp[]): ResolvedEntry {
  const { selector, frameSelector, shadowPath } = parseTarget(raw.target);

  const candidates: IdentityCandidates = {
    ...(raw.authoredId !== undefined ? { authoredId: raw.authoredId } : {}),
    ...(raw.testHookValue !== undefined ? { testHookValue: raw.testHookValue } : {}),
    ...(raw.accessibleName !== undefined ? { accessibleName: raw.accessibleName } : {}),
    landmarkRole: raw.landmarkRole,
    semanticPath: raw.semanticPath,
    structuralPath: raw.structuralPath,
  };
  const { tier, value } = resolveIdentityTier(candidates, ignoredIdPatterns);

  const context: ContextSignal = {
    nearestLandmark: raw.landmarkRole,
    headingContext: normaliseText(raw.headingContext),
    inFrame: frameSelector ?? [],
  };

  return {
    raw,
    identityTier: tier,
    identityValue: value,
    context,
    textContent: raw.rawTextContent.trim() ? normaliseText(raw.rawTextContent) : undefined,
    selector,
    frameSelector,
    shadowPath,
    normalisedAccessibleName: raw.accessibleName !== undefined ? normaliseText(raw.accessibleName) : undefined,
    page,
  };
}

function buildFinding(entry: ResolvedEntry, assignment: { fingerprint: string; ordinal: number }): Finding {
  const { raw } = entry;

  const identity: FindingIdentity = {
    value: entry.identityValue,
    ordinal: assignment.ordinal,
    context: entry.context,
    domDepth: raw.domDepth,
    ...(entry.textContent !== undefined ? { textContent: entry.textContent } : {}),
  };

  const groupKey = computeGroupKey({
    ruleId: raw.ruleId,
    source: 'axe',
    ...(entry.normalisedAccessibleName !== undefined ? { accessibleName: entry.normalisedAccessibleName } : {}),
    identityValue: entry.identityValue,
    landmarkRole: raw.landmarkRole,
  });

  return {
    fingerprint: assignment.fingerprint,
    groupKey,
    identityTier: entry.identityTier,
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
    url: entry.page.url,
    urlTemplate: entry.page.urlTemplate,
    selector: entry.selector,
    ...(entry.frameSelector ? { frameSelector: entry.frameSelector } : {}),
    ...(entry.shadowPath ? { shadowPath: entry.shadowPath } : {}),
    html: raw.html.slice(0, HTML_TRUNCATE_LENGTH),
    ...(entry.normalisedAccessibleName !== undefined ? { accessibleName: entry.normalisedAccessibleName } : {}),
    remediation: remediationFor(raw.ruleId),
    helpUrl: raw.helpUrl,
  };
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
