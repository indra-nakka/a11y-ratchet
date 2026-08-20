/**
 * The group key (`02-IDENTITY-AND-DIFF.md §4`) — a signal STRICTLY WEAKER
 * than the fingerprint, so the same defect collapses to one group across
 * every page it appears on.
 *
 * Corrected from the first draft, where `groupKey` inherited `headingContext`
 * and therefore varied per page — defeating its only purpose. This is why
 * `groupKey` is computed from its own narrow input, not derived from a
 * `Finding` or a `FingerprintInput` directly: reusing either of those types
 * would make it too easy to accidentally widen the signal back to something
 * page-specific the next time a field gets added to one of them.
 */

import { createHash } from 'node:crypto';

import type { Source } from '../types.js';

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
