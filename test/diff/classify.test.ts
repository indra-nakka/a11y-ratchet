import { describe, expect, it } from 'vitest';

import { classifyMatchedPair } from '../../src/diff/classify.js';
import type { Finding } from '../../src/types.js';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    fingerprint: 'aaaaaaaaaaaaaaaa',
    groupKey: 'bbbbbbbbbbbbbbbb',
    identityTier: 1,
    identity: { value: 'x', ordinal: 0, context: { nearestLandmark: 'main', headingContext: 'none', inFrame: [] }, domDepth: 5 },
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

describe('classifyMatchedPair', () => {
  it('classifies an identical pair as persisting', () => {
    const base = finding({ fingerprint: 'same' });
    const head = finding({ fingerprint: 'same' });
    expect(classifyMatchedPair(base, head)).toBe('persisting');
  });

  it('classifies same identity family, different impact, as impact-changed', () => {
    const base = finding({ fingerprint: 'same', impact: 'moderate' });
    const head = finding({ fingerprint: 'same', impact: 'critical' });
    expect(classifyMatchedPair(base, head)).toBe('impact-changed');
  });

  it('classifies a different identity family as moved', () => {
    const base = finding({ fingerprint: 'family-a' });
    const head = finding({ fingerprint: 'family-b' });
    expect(classifyMatchedPair(base, head)).toBe('moved');
  });

  // DECISIONS.md D43/D45: a collision group's ordinal shifting between runs
  // (194-member groups observed on Wikipedia) must not read as a move -
  // it's the same identity family, just renumbered.
  it('treats a same-family ordinal shift as persisting, not moved (D43/D45)', () => {
    const base = finding({ fingerprint: 'archived-family#5' });
    const head = finding({ fingerprint: 'archived-family#4' });
    expect(classifyMatchedPair(base, head)).toBe('persisting');
  });

  it('treats a same-family ordinal shift with an impact change as impact-changed, not moved', () => {
    const base = finding({ fingerprint: 'archived-family#5', impact: 'moderate' });
    const head = finding({ fingerprint: 'archived-family#4', impact: 'serious' });
    expect(classifyMatchedPair(base, head)).toBe('impact-changed');
  });

  it('classifies golden case 7 (rule-equivalence match) as moved', () => {
    // Same element (identity.value unchanged), different rule id via
    // ruleEquivalence - fingerprint necessarily differs since ruleId feeds it.
    const base = finding({ fingerprint: 'aria-command-name-family', ruleId: 'aria-command-name', identity: { value: 'submit-order', ordinal: 0, context: { nearestLandmark: 'main', headingContext: 'none', inFrame: [] }, domDepth: 3 } });
    const head = finding({ fingerprint: 'button-name-family', ruleId: 'button-name', identity: { value: 'submit-order', ordinal: 0, context: { nearestLandmark: 'main', headingContext: 'none', inFrame: [] }, domDepth: 3 } });
    expect(classifyMatchedPair(base, head)).toBe('moved');
  });
});
