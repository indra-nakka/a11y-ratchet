/**
 * Day 7's first question: what happens to a large collision group's
 * classification when its SIZE changes between runs? 194 -> 190 should
 * yield 190 persisting + 4 fixed, not "one persisting group" treated as a
 * unit, and never a false `moved`.
 */

import { describe, expect, it } from 'vitest';

import { classifyMatchedPair } from '../../src/diff/classify.js';
import { matchFindings } from '../../src/diff/match.js';
import { assignFingerprints, type FingerprintInput } from '../../src/identity/fingerprint.js';
import type { ContextSignal, Finding } from '../../src/types.js';

const CONTEXT: ContextSignal = { nearestLandmark: 'main', headingContext: 'none', inFrame: [] };

/** Builds `count` findings sharing identical rule/identity/context - a large collision family like Wikipedia's "archived" links (DECISIONS.md D43). */
function buildFamily(count: number): Finding[] {
  const inputs: FingerprintInput[] = Array.from({ length: count }, () => ({
    ruleId: 'color-contrast',
    source: 'axe',
    identityTier: 3,
    identityValue: 'archived',
    context: CONTEXT,
    urlTemplate: '/wiki/Wikipedia',
  }));
  const assignments = assignFingerprints(inputs);
  return assignments.map((assignment) => ({
    fingerprint: assignment.fingerprint,
    groupKey: 'group-key',
    templateKey: 'template-key',
    identityTier: 3,
    identity: { value: 'archived', ordinal: assignment.ordinal, context: CONTEXT, domDepth: 6, textContent: 'archived' },
    source: 'axe',
    ruleId: 'color-contrast',
    bucket: 'violation',
    bestPractice: false,
    impact: 'serious',
    criteria: [],
    tags: [],
    url: 'https://en.wikipedia.org/wiki/Wikipedia',
    urlTemplate: '/wiki/Wikipedia',
    selector: 'span',
    html: '<span>archived</span>',
    remediation: '',
    accessibleName: 'archived',
  }));
}

describe('collision-group multiset semantics when group size changes (DECISIONS.md D50)', () => {
  it('194 -> 190 (4 removed from scattered positions) yields 190 persisting + 4 fixed, never a false moved', () => {
    const base = buildFamily(194);

    // Remove 4 from scattered positions, not just the tail - this is what
    // actually cascades ordinals for everything after each removal point
    // (D43), the harder case than removing a clean suffix.
    const removedIndices = new Set([9, 49, 99, 149]);
    const survivors = base.filter((_, i) => !removedIndices.has(i));
    expect(survivors).toHaveLength(190);

    // A real re-scan assigns FRESH ordinals to the head run's own document
    // order - simulate that rather than reusing base's ordinals, which
    // would understate the ordinal-drift problem this test exists to check.
    const headInputs: FingerprintInput[] = survivors.map(() => ({
      ruleId: 'color-contrast',
      source: 'axe',
      identityTier: 3,
      identityValue: 'archived',
      context: CONTEXT,
      urlTemplate: '/wiki/Wikipedia',
    }));
    const headAssignments = assignFingerprints(headInputs);
    const head = survivors.map((finding, i) => ({
      ...finding,
      fingerprint: headAssignments[i]!.fingerprint,
      identity: { ...finding.identity, ordinal: headAssignments[i]!.ordinal },
    }));

    const result = matchFindings(base, head);

    // Every base finding accounted for - none silently dropped.
    expect(result.matched.length + result.unmatchedBase.length).toBe(194);
    expect(result.unmatchedHead).toHaveLength(0);

    // The actual multiset claim: 190 matched (persisting-family), 4 fixed -
    // not "one persisting group" and not a partial/fuzzy count.
    expect(result.matched).toHaveLength(190);
    expect(result.unmatchedBase).toHaveLength(4);

    // Every matched pair classifies as persisting (same identity family,
    // ordinal-only difference) - NEVER moved. A false `moved` here would
    // mean 190 phantom relocations reported for one deleted citation.
    const classifications = result.matched.map(({ base: b, head: h }) => classifyMatchedPair(b, h));
    expect(classifications.every((c) => c === 'persisting')).toBe(true);
  });

  it('the SPECIFIC pairing within a tied-score family is not meaningful - only the aggregate count is (documents the within-group limitation)', () => {
    // Ten members, tied on every fuzzy signal (identical name/context/text/
    // urlTemplate/depth) - remove the ones at index 3 and 7 (middle of the
    // family), forcing ordinal drift for everything after each.
    const base = buildFamily(10);
    const survivors = base.filter((_, i) => i !== 3 && i !== 7);
    const headInputs: FingerprintInput[] = survivors.map(() => ({
      ruleId: 'color-contrast',
      source: 'axe',
      identityTier: 3,
      identityValue: 'archived',
      context: CONTEXT,
      urlTemplate: '/wiki/Wikipedia',
    }));
    const head = survivors.map((finding, i) => ({
      ...finding,
      fingerprint: assignFingerprints(headInputs)[i]!.fingerprint,
    }));

    const result = matchFindings(base, head);
    expect(result.matched).toHaveLength(8);
    expect(result.unmatchedBase).toHaveLength(2);

    // The limitation, made concrete: pass 1 exact-matches only the members
    // BEFORE the first removal (index 0-2, whose ordinals didn't shift).
    // Everything from index 4 onward has a different ordinal in head than
    // in base (shifted down by 1, then by 2 after the second removal), so
    // those pairs are recovered by pass 2's fuzzy scoring - which, with
    // every signal tied, pairs base and head members in whatever order
    // they were iterated, not by which original element a survivor
    // "really" was. The aggregate (8 persisting, 2 fixed) is correct and
    // is the only claim this system makes; "element originally at index 5
    // is base[5]'s same element" is NOT a claim it can support once
    // several members tie on every signal. A 194-member family has this
    // same property at scale - only the count is trustworthy, not the
    // per-instance identity within it.
    const pass1MatchCount = base
      .slice(0, 3)
      .filter((b) => head.some((h) => h.fingerprint === b.fingerprint)).length;
    expect(pass1MatchCount).toBe(3);
  });
});
