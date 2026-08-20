/**
 * Suppression matching (`01 §2`: `config/suppress.ts`).
 *
 * Matches by rule, success criterion, selector glob, URL glob, or exact
 * fingerprint - whichever a config entry sets, ALL of them must match
 * (`schema.ts` already refuses an entry that sets none). Matching against
 * `Finding.selector` is not a CLAUDE.md invariant-2 violation: that
 * invariant is about finding IDENTITY (fingerprint/groupKey), never about
 * what a human-authored config file is allowed to filter on.
 *
 * Suppression is applied at scan time, tagging `Finding.suppressed` - never
 * at diff/match time (`DECISIONS.md` D13, `diff/gate.ts`). `diff/match.ts`
 * already pools suppressed findings in with everything else, so this module
 * only needs to produce the tag; the "don't false-fix" property upstream is
 * already built.
 */

import type { Finding, SuppressionRef } from '../types.js';
import type { SuppressionEntry } from './schema.js';

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

function matches(entry: SuppressionEntry, finding: Finding): boolean {
  if (entry.rule !== undefined && entry.rule !== finding.ruleId) return false;
  if (entry.criterion !== undefined && !finding.criteria.some((criterion) => criterion.id === entry.criterion)) {
    return false;
  }
  if (entry.selector !== undefined && !globToRegExp(entry.selector).test(finding.selector)) return false;
  if (entry.urlPattern !== undefined && !globToRegExp(entry.urlPattern).test(finding.url)) return false;
  if (entry.fingerprint !== undefined && entry.fingerprint !== finding.fingerprint) return false;
  return true;
}

/** The first config entry (in declared order) that matches `finding`, if any. */
export function findMatchingSuppression(
  entries: readonly SuppressionEntry[],
  finding: Finding,
): SuppressionEntry | undefined {
  return entries.find((entry) => matches(entry, finding));
}

/** `entry.expires` compared against `now` - `Date`-only, no time-of-day ambiguity. */
export function isExpired(expires: string, now: Date): boolean {
  return new Date(`${expires}T00:00:00Z`).getTime() <= now.getTime();
}

export function toSuppressionRef(entry: SuppressionEntry, now: Date): SuppressionRef {
  return {
    ruleRef: entry.id,
    justification: entry.reason,
    owner: entry.owner,
    expires: entry.expires,
    category: entry.category,
    expired: isExpired(entry.expires, now),
  };
}

/**
 * Tags every finding matched by a suppression entry with `suppressed`,
 * leaving the rest untouched. Findings are never dropped or reordered -
 * only `suppressed` is added (`CLAUDE.md` invariant 2).
 */
export function applySuppressions(findings: readonly Finding[], entries: readonly SuppressionEntry[], now: Date): Finding[] {
  if (entries.length === 0) return [...findings];
  return findings.map((finding) => {
    const match = findMatchingSuppression(entries, finding);
    return match ? { ...finding, suppressed: toSuppressionRef(match, now) } : finding;
  });
}
