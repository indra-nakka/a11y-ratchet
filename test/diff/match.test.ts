import { describe, expect, it } from 'vitest';

import { DEFAULT_MATCH_THRESHOLD, matchFindings, scoreCandidate } from '../../src/diff/match.js';
import type { ContextSignal, Finding } from '../../src/types.js';

function context(overrides: Partial<ContextSignal> = {}): ContextSignal {
  return { nearestLandmark: 'main', headingContext: 'none', inFrame: [], ...overrides };
}

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    fingerprint: 'aaaaaaaaaaaaaaaa',
    groupKey: 'bbbbbbbbbbbbbbbb',
    identityTier: 1,
    identity: { value: 'x', ordinal: 0, context: context(), domDepth: 5 },
    source: 'axe',
    ruleId: 'image-alt',
    bucket: 'violation',
    bestPractice: false,
    impact: 'serious',
    criteria: [],
    tags: [],
    url: 'https://example.com/page',
    urlTemplate: '/page',
    selector: '#x',
    html: '<img id="x">',
    remediation: '',
    ...overrides,
  };
}

describe('scoreCandidate', () => {
  it('sums to 1.0 when every signal matches', () => {
    const base = finding({ accessibleName: 'Submit', identity: { value: 'x', ordinal: 0, context: context(), domDepth: 5, textContent: 'submit' } });
    const head = finding({ accessibleName: 'Submit', identity: { value: 'y', ordinal: 0, context: context(), domDepth: 5, textContent: 'submit' } });
    expect(scoreCandidate(base, head)).toBeCloseTo(1.0, 5);
  });

  it('scores 0 when nothing matches and depth is far apart', () => {
    const base = finding({ accessibleName: 'A', urlTemplate: '/a', identity: { value: 'x', ordinal: 0, context: context({ nearestLandmark: 'navigation' }), domDepth: 2 } });
    const head = finding({ accessibleName: 'B', urlTemplate: '/b', identity: { value: 'y', ordinal: 0, context: context({ nearestLandmark: 'contentinfo' }), domDepth: 50 } });
    expect(scoreCandidate(base, head)).toBeLessThan(0.05);
  });

  it('does not treat two missing accessible names as a match', () => {
    const base = finding({ identity: { value: 'x', ordinal: 0, context: context({ nearestLandmark: 'navigation' }), domDepth: 3 } });
    const head = finding({ identity: { value: 'y', ordinal: 0, context: context({ nearestLandmark: 'contentinfo' }), domDepth: 3 } });
    // Neither has accessibleName; that must contribute 0, not 0.35.
    expect(scoreCandidate(base, head)).toBeLessThan(0.35);
  });

  it('DOM depth distance uses 1 / (1 + |Δdepth|), weighted at 0.10', () => {
    const base = finding({ urlTemplate: '/a', identity: { value: 'x', ordinal: 0, context: context({ nearestLandmark: 'navigation' }), domDepth: 5 } });
    const head = finding({ urlTemplate: '/b', identity: { value: 'y', ordinal: 0, context: context({ nearestLandmark: 'contentinfo' }), domDepth: 6 } });
    // Only depth contributes: 0.10 * (1 / (1 + 1)) = 0.05.
    expect(scoreCandidate(base, head)).toBeCloseTo(0.05, 5);
  });
});

describe('matchFindings — pass 1 (exact)', () => {
  it('matches identical fingerprints and removes both from the pools', () => {
    const base = [finding({ fingerprint: 'same' })];
    const head = [finding({ fingerprint: 'same' })];
    const result = matchFindings(base, head);
    expect(result.matched).toHaveLength(1);
    expect(result.unmatchedBase).toHaveLength(0);
    expect(result.unmatchedHead).toHaveLength(0);
  });

  it('leaves non-matching fingerprints unmatched when they also fail pass 2', () => {
    const base = [finding({ fingerprint: 'base-only', ruleId: 'image-alt' })];
    const head = [finding({ fingerprint: 'head-only', ruleId: 'link-name' })];
    const result = matchFindings(base, head);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatchedBase).toEqual(base);
    expect(result.unmatchedHead).toEqual(head);
  });
});

describe('matchFindings — pass 2 (fuzzy)', () => {
  it('matches via accessible name + context above the default threshold', () => {
    const base = [
      finding({
        fingerprint: 'base-fp',
        accessibleName: 'Contact us',
        identity: { value: 'contact-old', ordinal: 0, context: context({ nearestLandmark: 'contentinfo' }), domDepth: 4 },
      }),
    ];
    const head = [
      finding({
        fingerprint: 'head-fp',
        accessibleName: 'Contact us',
        identity: { value: 'contact-new', ordinal: 0, context: context({ nearestLandmark: 'contentinfo' }), domDepth: 4 },
      }),
    ];
    const result = matchFindings(base, head);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.base.identity.value).toBe('contact-old');
    expect(result.matched[0]!.head.identity.value).toBe('contact-new');
  });

  it('does not match below the threshold', () => {
    const base = [finding({ fingerprint: 'base-fp', accessibleName: 'Contact us', identity: { value: 'a', ordinal: 0, context: context({ nearestLandmark: 'navigation' }), domDepth: 2 } })];
    const head = [finding({ fingerprint: 'head-fp', accessibleName: 'Something else entirely', identity: { value: 'b', ordinal: 0, context: context({ nearestLandmark: 'contentinfo' }), domDepth: 40 } })];
    const result = matchFindings(base, head, { matchThreshold: DEFAULT_MATCH_THRESHOLD });
    expect(result.matched).toHaveLength(0);
  });

  it('restricts candidates to the same source', () => {
    const base = [finding({ fingerprint: 'b', source: 'axe', accessibleName: 'Same', identity: { value: 'x', ordinal: 0, context: context(), domDepth: 1 } })];
    const head = [finding({ fingerprint: 'h', source: 'probe', accessibleName: 'Same', identity: { value: 'x', ordinal: 0, context: context(), domDepth: 1 } })];
    const result = matchFindings(base, head);
    expect(result.matched).toHaveLength(0);
  });

  it('restricts candidates to equivalent rule ids (wcag/ruleMap.ts)', () => {
    const base = [finding({ fingerprint: 'b', ruleId: 'aria-command-name', accessibleName: 'Same', identity: { value: 'x', ordinal: 0, context: context(), domDepth: 1 } })];
    const head = [finding({ fingerprint: 'h', ruleId: 'button-name', accessibleName: 'Same', identity: { value: 'x', ordinal: 0, context: context(), domDepth: 1 } })];
    const result = matchFindings(base, head);
    expect(result.matched).toHaveLength(1);
  });

  it('does NOT match unrelated rule ids even with identical everything else', () => {
    const base = [finding({ fingerprint: 'b', ruleId: 'image-alt', accessibleName: 'Same', identity: { value: 'x', ordinal: 0, context: context(), domDepth: 1 } })];
    const head = [finding({ fingerprint: 'h', ruleId: 'color-contrast', accessibleName: 'Same', identity: { value: 'x', ordinal: 0, context: context(), domDepth: 1 } })];
    const result = matchFindings(base, head);
    expect(result.matched).toHaveLength(0);
  });

  it('exactOnly skips pass 2 entirely - fuzzy-matchable pairs stay unmatched', () => {
    const base = [finding({ fingerprint: 'b', accessibleName: 'Same', identity: { value: 'x', ordinal: 0, context: context(), domDepth: 1 } })];
    const head = [finding({ fingerprint: 'h', accessibleName: 'Same', identity: { value: 'y', ordinal: 0, context: context(), domDepth: 1 } })];
    const result = matchFindings(base, head, { exactOnly: true });
    expect(result.matched).toHaveLength(0);
    expect(result.unmatchedBase).toHaveLength(1);
    expect(result.unmatchedHead).toHaveLength(1);
  });

  it('greedy assignment does not double-assign a base or head finding to two candidates', () => {
    // Two base findings, both plausible matches for one head finding - only one may win.
    const base = [
      finding({ fingerprint: 'b1', accessibleName: 'Search', identity: { value: 'a', ordinal: 0, context: context(), domDepth: 4 } }),
      finding({ fingerprint: 'b2', accessibleName: 'Search', identity: { value: 'b', ordinal: 0, context: context(), domDepth: 5 } }),
    ];
    const head = [finding({ fingerprint: 'h1', accessibleName: 'Search', identity: { value: 'c', ordinal: 0, context: context(), domDepth: 4 } })];
    const result = matchFindings(base, head);
    expect(result.matched).toHaveLength(1);
    expect(result.unmatchedBase).toHaveLength(1);
  });
});
