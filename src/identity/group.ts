/**
 * `groupKey` (`02-IDENTITY-AND-DIFF.md §4`) and `templateKey` (`01 §8`, added
 * Day 10) — two signals strictly weaker than the fingerprint, and strictly
 * weaker than each other (`templateKey` weaker than `groupKey`), so the
 * same defect collapses to one row at whichever tier a reader is looking at.
 *
 * `groupKey` corrected from the first draft, where it inherited
 * `headingContext` and therefore varied per page — defeating its only
 * purpose. This is why both keys are computed from their own narrow input,
 * not derived from a `Finding` or a `FingerprintInput` directly: reusing
 * either of those types would make it too easy to accidentally widen the
 * signal back to something page- or instance-specific the next time a field
 * gets added to one of them.
 *
 * This module also builds the two report-facing indexes (`GroupIndex`,
 * `TemplateGroupIndex`) — the types existed since Day 4/6 but nothing built
 * them yet; `Report.groups` shipped as a hardcoded `{}` until today.
 */

import { createHash } from 'node:crypto';

import type { Finding, FindingGroup, GroupIndex, Impact, Source, TemplateGroup, TemplateGroupIndex } from '../types.js';

export interface GroupKeyInput {
  ruleId: string;
  source: Source;
  /**
   * Accessible name wins when present; otherwise the resolved identity
   * value (already normalised by the caller - `resolveIdentityTier`'s
   * `value`, or `Finding.accessibleName`, both `normaliseText`-passed
   * upstream). This function does not re-normalise.
   */
  accessibleName?: string;
  identityValue: string;
  landmarkRole: string;
}

const GROUP_KEY_HASH_LENGTH = 16;

/**
 * `groupKey = sha256([ruleId, source, accessibleName ?? identityValue,
 * landmarkRole])` (`§4`). Deliberately excludes: `headingContext` (per-page
 * by nature), `urlTemplate`, structural path, ordinal.
 */
export function computeGroupKey(input: GroupKeyInput): string {
  const nameOrValue = input.accessibleName?.trim() ? input.accessibleName : input.identityValue;
  const tuple = [input.ruleId, input.source, nameOrValue, input.landmarkRole];
  return createHash('sha256').update(JSON.stringify(tuple)).digest('hex').slice(0, GROUP_KEY_HASH_LENGTH);
}

export interface TemplateKeyInput {
  ruleId: string;
  source: Source;
  landmarkRole: string;
  /** Tier 5 candidate, e.g. `"li[3] > article[0] > a[0]"` (`identity/fingerprint.ts`'s `buildStructuralPath`). */
  structuralPath: string;
}

const SIBLING_INDEX_SUFFIX = /\[\d+\]$/;

/** `01 §8`: `main>ol>li:3>article>a>img` -> `main>ol>li>article>a>img` — strips the `[N]` same-tag-sibling-index suffix from each segment, keeping the tag chain itself. */
function stripSiblingIndices(structuralPath: string): string {
  if (!structuralPath) return structuralPath;
  return structuralPath
    .split(' > ')
    .map((segment) => segment.replace(SIBLING_INDEX_SUFFIX, ''))
    .join(' > ');
}

/**
 * `templateKey = sha256([ruleId, source, landmarkRole,
 * indexStrippedStructuralPath])` (`01 §8`). Strictly weaker than `groupKey`:
 * no accessible name / identity value at all, so N instances of one
 * templated component - each with a different name, and therefore
 * correctly a different `groupKey` - still collapse to one `templateKey`.
 */
export function computeTemplateKey(input: TemplateKeyInput): string {
  const tuple = [input.ruleId, input.source, input.landmarkRole, stripSiblingIndices(input.structuralPath)];
  return createHash('sha256').update(JSON.stringify(tuple)).digest('hex').slice(0, GROUP_KEY_HASH_LENGTH);
}

const IMPACT_SEVERITY: Record<Impact, number> = { minor: 0, moderate: 1, serious: 2, critical: 3 };

function highestImpact(findings: readonly Finding[]): Impact {
  return findings.reduce<Impact>(
    (highest, finding) => (IMPACT_SEVERITY[finding.impact] > IMPACT_SEVERITY[highest] ? finding.impact : highest),
    findings[0]!.impact,
  );
}

/** Insertion-order-preserving distinct values — `Set` already does this; named for readability at call sites. */
function distinct<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

function groupBy<T, K extends string>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/**
 * Builds `Report.groups`, keyed by `groupKey`. `findings` must already be in
 * a stable, meaningful order (crawl order) - `urls`/`exampleSelector` take
 * their order and "first member" from it, not from re-sorting.
 */
export function buildGroupIndex(findings: readonly Finding[]): GroupIndex {
  const index: GroupIndex = {};
  // Suppressed findings stay in Report.findings (CLAUDE.md invariant 2 -
  // tagged, never dropped) but are excluded HERE: these indexes represent
  // the actionable defect landscape, the same "!suppressed" cut the gate
  // itself already makes (diff/gate.ts). Without this, a group/template
  // built entirely from suppressed members renders as an empty shell -
  // "1 template defect (1 instance)" with nothing under it - since the
  // report's own findings tree also skips suppressed members when it
  // populates each group (report/html/render.ts).
  const actionable = findings.filter((f) => !f.suppressed);
  for (const [groupKey, members] of groupBy(actionable, (f) => f.groupKey)) {
    const first = members[0]!;
    index[groupKey] = {
      groupKey,
      ruleId: first.ruleId,
      source: first.source,
      bucket: first.bucket,
      bestPractice: first.bestPractice,
      impact: highestImpact(members),
      criteria: first.criteria,
      ...(first.accessibleName !== undefined ? { accessibleName: first.accessibleName } : {}),
      exampleSelector: first.selector,
      fingerprints: distinct(members.map((f) => f.fingerprint)),
      urls: distinct(members.map((f) => f.url)),
      pageCount: distinct(members.map((f) => f.url)).length,
      // "Unique element" (`01 §8`'s worked example: "Affects 43 pages · 1
      // unique element") is a display-only notion, deliberately NOT derived
      // from fingerprint: the fingerprint's own urlTemplate/headingContext
      // components already vary per page for a shared nav/footer element,
      // so counting distinct fingerprints here would print "43", not "1",
      // for the exact case the example is illustrating. Counted from
      // `selector` instead - display-only data answering a display-only
      // question: how many differently-SHAPED occurrences (not how many
      // pages) does this group actually contain.
      uniqueElementCount: distinct(members.map((f) => f.selector)).length,
    } satisfies FindingGroup;
  }
  return index;
}

/**
 * Builds `Report.templateGroups`, keyed by `templateKey` - the report's
 * default tier (`01 §8`). Same crawl-order assumption and same
 * suppressed-findings exclusion as `buildGroupIndex`.
 */
export function buildTemplateIndex(findings: readonly Finding[]): TemplateGroupIndex {
  const index: TemplateGroupIndex = {};
  const actionable = findings.filter((f) => !f.suppressed);
  for (const [templateKey, members] of groupBy(actionable, (f) => f.templateKey)) {
    const first = members[0]!;
    const fingerprints = distinct(members.map((f) => f.fingerprint));
    index[templateKey] = {
      templateKey,
      ruleId: first.ruleId,
      source: first.source,
      bucket: first.bucket,
      bestPractice: first.bestPractice,
      impact: highestImpact(members),
      criteria: first.criteria,
      exampleSelector: first.selector,
      groupKeys: distinct(members.map((f) => f.groupKey)),
      fingerprints,
      urls: distinct(members.map((f) => f.url)),
      pageCount: distinct(members.map((f) => f.url)).length,
      instanceCount: fingerprints.length,
    } satisfies TemplateGroup;
  }
  return index;
}
