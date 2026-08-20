/**
 * Classifies a matched pair as `persisting`, `moved`, or `impact-changed`
 * (`02 §6`). Applies identically to a pass-1 (exact) or pass-2 (fuzzy)
 * match — see `diff/match.ts`'s header for why one function covers both.
 *
 * The key insight (`DECISIONS.md` D43, D45): comparing the fingerprint
 * WITHOUT its collision-ordinal suffix separates a real identity change
 * from mere ordinal renumbering. A pass-1 match always has identical
 * suffixed fingerprints, so it trivially has identical unsuffixed ones too.
 * A pass-2 match can reach this function with identical unsuffixed
 * fingerprints when the ONLY thing that changed is which ordinal a
 * collision group assigned it (D43: 41% of a real page's findings needed
 * ordinal disambiguation, in groups up to 194) - that is bookkeeping, not a
 * relocation, and must not read as `moved`.
 */

import type { Finding } from '../types.js';

export type MatchedPairClassification = 'persisting' | 'moved' | 'impact-changed';

function unsuffixedFingerprint(finding: Finding): string {
  return finding.fingerprint.split('#')[0]!;
}

export function classifyMatchedPair(base: Finding, head: Finding): MatchedPairClassification {
  const sameIdentityFamily = unsuffixedFingerprint(base) === unsuffixedFingerprint(head);

  if (sameIdentityFamily) {
    // Same underlying identity - either truly unchanged, or the pass-1
    // exact match missed only because a collision group's ordinal shifted.
    // Either way, not a relocation.
    return base.impact !== head.impact ? 'impact-changed' : 'persisting';
  }

  // Fingerprint differs beyond ordinal bookkeeping: context/landmark
  // shifted (case 18: footer -> header), or the rule id changed within an
  // equivalence class (case 7: aria-command-name -> button-name) while the
  // element itself stayed the same (`identity.value` unchanged). Either
  // way, `§9` calls this `moved` - it deliberately does not also check
  // impact here, since a moved defect whose impact ALSO changed is still,
  // first and foremost, moved.
  return 'moved';
}
