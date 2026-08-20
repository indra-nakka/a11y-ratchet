/**
 * The matcher (`02-IDENTITY-AND-DIFF.md §6`). Two passes over one page's
 * findings at a time — the caller (`diff/run.ts`) scopes each call to a
 * single page pairing; matching across pages would let two structurally
 * identical pages accidentally pair each other's findings, since
 * `urlTemplate` (a fingerprint input) is the only page-identifying signal a
 * fingerprint carries and two different pages can share it (`/product/1`
 * and `/product/2` both template to `/product/:id`).
 *
 * Pass 1 (exact) and pass 2 (fuzzy) hand `diff/classify.ts` the same shape
 * either way — a `MatchedPair` — because classification only cares about
 * comparing the *unsuffixed* fingerprint, not which pass produced the
 * match (`DECISIONS.md` D45).
 */

import { areRulesEquivalent } from '../wcag/ruleMap.js';
import type { Finding } from '../types.js';

export interface MatchedPair {
  base: Finding;
  head: Finding;
}

export interface MatchResult {
  matched: MatchedPair[];
  /** Unmatched after both passes (or after pass 1 alone, if `exactOnly`). */
  unmatchedBase: Finding[];
  unmatchedHead: Finding[];
}

export interface MatchOptions {
  /** `§6`: accept a pass-2 candidate at this score or above. */
  matchThreshold?: number;
  /** `§6`: "Pass 2 is optional." Skips fuzzy matching entirely. */
  exactOnly?: boolean;
}

/** Tuned against the 20 goldens and both real-site smokes (`DECISIONS.md` D45). */
export const DEFAULT_MATCH_THRESHOLD = 0.65;

const WEIGHT_ACCESSIBLE_NAME = 0.35;
/**
 * `DECISIONS.md` D73, correcting D48: two accessible names that are each
 * pure digits (`normaliseText`'s `§3.3` whole-string exception keeps "10"
 * as "10", not "#") never equal each other outright, so a repeated,
 * unlabelled-except-for-its-number control (pagination, a numbered
 * carousel) scored zero on the highest-weighted signal for every
 * candidate - a real, observed false-regression source ("10 11 12 13 14"
 * -> "20 21 22 23 24" degrading to 5 new + 5 fixed), not a hypothetical
 * one. Awarded at reduced credit, not full: this is a WEAKER signal than
 * literal equality (the names genuinely did change), so it must not, on
 * its own, be able to push an otherwise-unrelated pair over threshold the
 * way full credit could.
 */
const WEIGHT_ACCESSIBLE_NAME_DIGIT_MASKED = 0.2;
const WEIGHT_CONTEXT = 0.25;
const WEIGHT_TEXT_CONTENT = 0.2;
const WEIGHT_URL_TEMPLATE = 0.1;
const WEIGHT_DOM_DEPTH = 0.1;

const DIGIT_RUN = /\d+/g;

/**
 * Masks EVERY digit run, including the whole-string case `identity/
 * fingerprint.ts`'s `normaliseText` deliberately exempts for identity
 * itself (`§3.3`) - used only as this module's own weaker fallback
 * matching signal, never as an identity value.
 */
function fullyMaskDigits(value: string): string {
  return value.replace(DIGIT_RUN, '#');
}

/**
 * `§6`'s revised weights. Selector token Jaccard is deliberately not a
 * signal — dropped in the design doc for going to near-zero under exactly
 * the CSS-modules/Tailwind class-hash churn fuzzy matching exists to
 * survive. Landmark lineage isn't a separate signal either; it already
 * lives inside the context-signal comparison, and adding it again would
 * double-count.
 */
export function scoreCandidate(base: Finding, head: Finding): number {
  let score = 0;

  if (base.accessibleName !== undefined && base.accessibleName === head.accessibleName) {
    score += WEIGHT_ACCESSIBLE_NAME;
  } else if (
    base.accessibleName !== undefined &&
    head.accessibleName !== undefined &&
    fullyMaskDigits(base.accessibleName) === fullyMaskDigits(head.accessibleName)
  ) {
    // Reaching this branch already implies the two names differ (the `if`
    // above would have matched otherwise) and that masking made them equal
    // - i.e. they differ only in embedded/whole digit content.
    score += WEIGHT_ACCESSIBLE_NAME_DIGIT_MASKED;
  }

  if (
    base.identity.context.nearestLandmark === head.identity.context.nearestLandmark &&
    base.identity.context.headingContext === head.identity.context.headingContext
  ) {
    score += WEIGHT_CONTEXT;
  }

  if (base.identity.textContent !== undefined && base.identity.textContent === head.identity.textContent) {
    score += WEIGHT_TEXT_CONTENT;
  }

  if (base.urlTemplate === head.urlTemplate) {
    score += WEIGHT_URL_TEMPLATE;
  }

  const depthDelta = Math.abs(base.identity.domDepth - head.identity.domDepth);
  score += WEIGHT_DOM_DEPTH * (1 / (1 + depthDelta));

  return score;
}

/**
 * Matches one page's base findings against its head findings. `findings`
 * pools include suppressed findings on both sides (`DECISIONS.md` D13) —
 * the caller must not pre-filter them out, or an added suppression between
 * runs makes its finding vanish from the head pool and misclassify as
 * `fixed`. Suppression is applied at the gate, never here.
 */
export function matchFindings(
  baseFindings: readonly Finding[],
  headFindings: readonly Finding[],
  options: MatchOptions = {},
): MatchResult {
  const threshold = options.matchThreshold ?? DEFAULT_MATCH_THRESHOLD;
  const matched: MatchedPair[] = [];

  // Pass 1 - exact, indexed by full fingerprint (including any collision
  // ordinal suffix). On a healthy codebase this resolves 90%+ (§6).
  const baseByFingerprint = new Map<string, Finding[]>();
  for (const finding of baseFindings) {
    const queue = baseByFingerprint.get(finding.fingerprint) ?? [];
    queue.push(finding);
    baseByFingerprint.set(finding.fingerprint, queue);
  }

  let unmatchedHead: Finding[] = [];
  for (const headFinding of headFindings) {
    const queue = baseByFingerprint.get(headFinding.fingerprint);
    const baseFinding = queue?.shift();
    if (baseFinding) {
      matched.push({ base: baseFinding, head: headFinding });
    } else {
      unmatchedHead.push(headFinding);
    }
  }
  let unmatchedBase = [...baseByFingerprint.values()].flat();

  if (options.exactOnly) {
    return { matched, unmatchedBase, unmatchedHead };
  }

  // Pass 2 - fuzzy, over the remainder. Candidates restricted to pairs
  // sharing `source` and an equivalent `ruleId` (exact, or via
  // wcag/ruleMap.ts's ruleEquivalence table - `§6` originally said "sharing
  // ruleId exactly"; widened for golden case 7, DECISIONS.md D35/D42).
  const candidates: Array<{ base: Finding; head: Finding; score: number }> = [];
  for (const base of unmatchedBase) {
    for (const head of unmatchedHead) {
      if (base.source !== head.source) continue;
      if (!areRulesEquivalent(base.ruleId, head.ruleId)) continue;
      const score = scoreCandidate(base, head);
      if (score >= threshold) candidates.push({ base, head, score });
    }
  }

  // Greedy assignment by descending score (§6).
  candidates.sort((a, b) => b.score - a.score);
  const usedBase = new Set<Finding>();
  const usedHead = new Set<Finding>();
  for (const candidate of candidates) {
    if (usedBase.has(candidate.base) || usedHead.has(candidate.head)) continue;
    matched.push({ base: candidate.base, head: candidate.head });
    usedBase.add(candidate.base);
    usedHead.add(candidate.head);
  }

  unmatchedBase = unmatchedBase.filter((finding) => !usedBase.has(finding));
  unmatchedHead = unmatchedHead.filter((finding) => !usedHead.has(finding));

  return { matched, unmatchedBase, unmatchedHead };
}
