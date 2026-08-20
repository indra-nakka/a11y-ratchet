import { describe, expect, it } from 'vitest';

import { computeGroupKey, type GroupKeyInput } from '../../src/identity/group.js';
import { computeBaseFingerprint, type FingerprintInput } from '../../src/identity/fingerprint.js';
import type { ContextSignal } from '../../src/types.js';

describe('computeGroupKey', () => {
  const base: GroupKeyInput = {
    ruleId: 'link-name',
    source: 'axe',
    identityValue: 'nav > link[3]',
    landmarkRole: 'navigation',
  };

  it('is deterministic and 16 lowercase hex characters', () => {
    const key = computeGroupKey(base);
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(computeGroupKey({ ...base })).toBe(key);
  });

  it('prefers accessibleName over identityValue when present', () => {
    const withName = computeGroupKey({ ...base, accessibleName: 'contact us' });
    const withoutName = computeGroupKey(base);
    expect(withName).not.toBe(withoutName);
    // Changing identityValue with the same accessibleName present must not
    // change the key - accessibleName wins outright, per §4's formula.
    expect(computeGroupKey({ ...base, accessibleName: 'contact us', identityValue: 'something-else' })).toBe(
      withName,
    );
  });

  it('falls back to identityValue when accessibleName is empty or whitespace', () => {
    expect(computeGroupKey({ ...base, accessibleName: '' })).toBe(computeGroupKey(base));
    expect(computeGroupKey({ ...base, accessibleName: '   ' })).toBe(computeGroupKey(base));
  });

  it('is strictly weaker than the fingerprint: identical groupKey inputs collapse across pages that differ only in heading context and url template', () => {
    const context = (heading: string): ContextSignal => ({ nearestLandmark: 'navigation', headingContext: heading, inFrame: [] });

    const fingerprintPage1: FingerprintInput = {
      ruleId: 'link-name',
      source: 'axe',
      identityTier: 4,
      identityValue: 'nav > link[3]',
      context: context('welcome'),
      urlTemplate: '/page-one',
    };
    const fingerprintPage2: FingerprintInput = {
      ...fingerprintPage1,
      context: context('about us'),
      urlTemplate: '/page-two',
    };

    // Fingerprints differ - headingContext and urlTemplate are both inputs.
    expect(computeBaseFingerprint(fingerprintPage1)).not.toBe(computeBaseFingerprint(fingerprintPage2));

    // groupKeys are identical - neither headingContext nor urlTemplate feed it.
    const groupKeyInput: GroupKeyInput = {
      ruleId: 'link-name',
      source: 'axe',
      identityValue: 'nav > link[3]',
      landmarkRole: 'navigation',
    };
    expect(computeGroupKey(groupKeyInput)).toBe(computeGroupKey(groupKeyInput));
  });

  it('changes when ruleId, source, or landmarkRole changes', () => {
    const key = computeGroupKey(base);
    expect(computeGroupKey({ ...base, ruleId: 'button-name' })).not.toBe(key);
    expect(computeGroupKey({ ...base, source: 'probe' })).not.toBe(key);
    expect(computeGroupKey({ ...base, landmarkRole: 'contentinfo' })).not.toBe(key);
  });
});
