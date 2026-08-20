import { describe, expect, it } from 'vitest';

import {
  buildGroupIndex,
  buildTemplateIndex,
  computeGroupKey,
  computeTemplateKey,
  type GroupKeyInput,
  type TemplateKeyInput,
} from '../../src/identity/group.js';
import { computeBaseFingerprint, type FingerprintInput } from '../../src/identity/fingerprint.js';
import type { ContextSignal, Finding } from '../../src/types.js';

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

describe('computeTemplateKey', () => {
  const base: TemplateKeyInput = {
    ruleId: 'color-contrast',
    source: 'axe',
    landmarkRole: 'main',
    structuralPath: 'li[3] > article[0] > a[0]',
  };

  it('is deterministic and 16 lowercase hex characters', () => {
    const key = computeTemplateKey(base);
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(computeTemplateKey({ ...base })).toBe(key);
  });

  it('is identical for two structuralPaths that differ only in sibling index', () => {
    const first = computeTemplateKey({ ...base, structuralPath: 'li[3] > article[0] > a[0]' });
    const second = computeTemplateKey({ ...base, structuralPath: 'li[47] > article[0] > a[0]' });
    expect(first).toBe(second);
  });

  it('is strictly weaker than groupKey: two instances with different accessible names share a templateKey but not a groupKey', () => {
    const groupKeyA = computeGroupKey({
      ruleId: 'color-contrast',
      source: 'axe',
      accessibleName: 'The Great Gatsby',
      identityValue: 'the great gatsby',
      landmarkRole: 'main',
    });
    const groupKeyB = computeGroupKey({
      ruleId: 'color-contrast',
      source: 'axe',
      accessibleName: 'Brave New World',
      identityValue: 'brave new world',
      landmarkRole: 'main',
    });
    expect(groupKeyA).not.toBe(groupKeyB);

    const templateKeyA = computeTemplateKey({ ...base, structuralPath: 'li[3] > article[0] > a[0]' });
    const templateKeyB = computeTemplateKey({ ...base, structuralPath: 'li[7] > article[0] > a[0]' });
    expect(templateKeyA).toBe(templateKeyB);
  });

  it('changes when ruleId, source, landmarkRole, or the non-index part of structuralPath changes', () => {
    const key = computeTemplateKey(base);
    expect(computeTemplateKey({ ...base, ruleId: 'link-name' })).not.toBe(key);
    expect(computeTemplateKey({ ...base, source: 'probe' })).not.toBe(key);
    expect(computeTemplateKey({ ...base, landmarkRole: 'navigation' })).not.toBe(key);
    expect(computeTemplateKey({ ...base, structuralPath: 'li[3] > article[0] > img[0]' })).not.toBe(key);
  });
});

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    fingerprint: 'aaaaaaaaaaaaaaaa',
    groupKey: 'group-a',
    templateKey: 'template-a',
    identityTier: 3,
    identity: { value: 'x', ordinal: 0, context: { nearestLandmark: 'main', headingContext: 'none', inFrame: [] }, domDepth: 3 },
    source: 'axe',
    ruleId: 'color-contrast',
    bucket: 'violation',
    bestPractice: false,
    impact: 'serious',
    criteria: [],
    tags: [],
    url: 'https://example.com/page',
    urlTemplate: '/page',
    selector: '#x',
    html: '<div id="x"></div>',
    remediation: '',
    ...overrides,
  };
}

describe('buildGroupIndex', () => {
  it('collapses members sharing a groupKey into one row, keyed by groupKey', () => {
    const findings = [
      finding({ groupKey: 'g1', fingerprint: 'f1', url: 'https://example.com/a' }),
      finding({ groupKey: 'g1', fingerprint: 'f2', url: 'https://example.com/b' }),
      finding({ groupKey: 'g2', fingerprint: 'f3', url: 'https://example.com/a' }),
    ];
    const index = buildGroupIndex(findings);
    expect(Object.keys(index).sort()).toEqual(['g1', 'g2']);
    expect(index.g1?.fingerprints).toEqual(['f1', 'f2']);
    expect(index.g1?.urls).toEqual(['https://example.com/a', 'https://example.com/b']);
    expect(index.g1?.pageCount).toBe(2);
  });

  it('reports the highest impact among members, never hiding a critical behind a lower one', () => {
    const findings = [
      finding({ groupKey: 'g1', fingerprint: 'f1', impact: 'minor' }),
      finding({ groupKey: 'g1', fingerprint: 'f2', impact: 'critical' }),
      finding({ groupKey: 'g1', fingerprint: 'f3', impact: 'moderate' }),
    ];
    expect(buildGroupIndex(findings).g1?.impact).toBe('critical');
  });

  it('takes exampleSelector and other display fields from the first member in array order', () => {
    const findings = [
      finding({ groupKey: 'g1', fingerprint: 'f1', selector: '#first' }),
      finding({ groupKey: 'g1', fingerprint: 'f2', selector: '#second' }),
    ];
    expect(buildGroupIndex(findings).g1?.exampleSelector).toBe('#first');
  });

  it('returns an empty index for no findings', () => {
    expect(buildGroupIndex([])).toEqual({});
  });
});

describe('buildTemplateIndex', () => {
  it('collapses members sharing a templateKey into one row, even across different groupKeys', () => {
    const findings = [
      finding({ templateKey: 't1', groupKey: 'g1', fingerprint: 'f1', url: 'https://example.com/books/1' }),
      finding({ templateKey: 't1', groupKey: 'g2', fingerprint: 'f2', url: 'https://example.com/books/2' }),
      finding({ templateKey: 't1', groupKey: 'g3', fingerprint: 'f3', url: 'https://example.com/books/3' }),
    ];
    const index = buildTemplateIndex(findings);
    expect(Object.keys(index)).toEqual(['t1']);
    expect(index.t1?.groupKeys.sort()).toEqual(['g1', 'g2', 'g3']);
    expect(index.t1?.instanceCount).toBe(3);
    expect(index.t1?.pageCount).toBe(3);
  });

  it('collapses the 521-groupKey shape down to a small number of templates: N differently-named instances of one template is 1 row, not N', () => {
    const bookTitles = Array.from({ length: 200 }, (_, i) => `Book Title ${i}`);
    const findings = bookTitles.map((title, i) =>
      finding({
        templateKey: 'catalogue-card-alt-text',
        groupKey: `group-for-${title}`, // each title hashes to its own groupKey, as it would for real
        fingerprint: `fp-${i}`,
        url: `https://example.com/catalogue/page-${Math.floor(i / 20) + 1}`,
      }),
    );
    const groups = buildGroupIndex(findings);
    const templates = buildTemplateIndex(findings);
    expect(Object.keys(groups)).toHaveLength(200); // groupKey alone: 200 distinct rows
    expect(Object.keys(templates)).toHaveLength(1); // templateKey: 1 row, 200 instances
    expect(templates['catalogue-card-alt-text']?.instanceCount).toBe(200);
  });

  it('reports the highest impact among members', () => {
    const findings = [
      finding({ templateKey: 't1', fingerprint: 'f1', impact: 'moderate' }),
      finding({ templateKey: 't1', fingerprint: 'f2', impact: 'critical' }),
    ];
    expect(buildTemplateIndex(findings).t1?.impact).toBe('critical');
  });

  it('returns an empty index for no findings', () => {
    expect(buildTemplateIndex([])).toEqual({});
  });
});
