import { describe, expect, it } from 'vitest';

import {
  assignFingerprints,
  computeBaseFingerprint,
  isGeneratedId,
  normaliseText,
  resolveIdentityTier,
  urlTemplateFor,
  type FingerprintInput,
  type IdentityCandidates,
} from '../../src/identity/fingerprint.js';
import type { ContextSignal } from '../../src/types.js';

const NONE_CONTEXT: ContextSignal = { nearestLandmark: 'none', headingContext: 'none', inFrame: [] };

describe('normaliseText', () => {
  it('collapses whitespace, trims and lowercases', () => {
    expect(normaliseText('  Search   the   Report  ')).toBe('search the report');
  });

  it('strips zero-width and directional marks', () => {
    expect(normaliseText('sa\u200Ble\u200Cs')).toBe('sales');
  });

  it('masks every embedded digit run, including single digits (corrected per golden case 5, DECISIONS.md D33)', () => {
    // A single-digit count is exactly as common as a two-digit one - "3
    // results" -> "17 results" must normalise identically, and the doc's
    // own "page # of #" example masks both regardless of digit count.
    expect(normaliseText('page 5 of 10')).toBe('page # of #');
    expect(normaliseText('3 results')).toBe(normaliseText('17 results'));
  });

  it('masks ISO dates', () => {
    expect(normaliseText('Filed on 2026-08-20')).toBe('filed on #date');
  });

  it('masks currency amounts', () => {
    expect(normaliseText('Total: $12.34')).toBe('total: #money');
  });

  it('does not mask a string that is entirely digits (the pagination exception)', () => {
    // 02 §3.3: masking a bare "12" would collapse a pagination bar
    // ("10 11 12 13 14") into one fingerprint - the exact 1-to-1 pairing
    // the masking rule exists to protect (02 §9 case 20).
    expect(normaliseText('12')).toBe('12');
    expect(normaliseText('10 11 12 13 14')).toBe('10 11 12 13 14');
  });

  it('truncates to 80 characters', () => {
    const long = 'a'.repeat(120);
    expect(normaliseText(long)).toHaveLength(80);
  });
});

describe('isGeneratedId', () => {
  it('rejects React useId output', () => {
    expect(isGeneratedId(':r1:')).toBe(true);
    expect(isGeneratedId(':r7a:')).toBe(true);
  });

  it('rejects Radix, Headless UI and MUI prefixes', () => {
    expect(isGeneratedId('radix-:r0:')).toBe(true);
    expect(isGeneratedId('headlessui-menu-items-2')).toBe(true);
    expect(isGeneratedId('mui-42')).toBe(true);
  });

  it('rejects a generic scoped id, an embedded hash, and a long numeric run', () => {
    expect(isGeneratedId(':abc123:')).toBe(true);
    expect(isGeneratedId('field-8f3e2b1a')).toBe(true);
    expect(isGeneratedId('item-48213')).toBe(true);
  });

  it('rejects Ember and Angular ids', () => {
    expect(isGeneratedId('ember482')).toBe(true);
    expect(isGeneratedId('ng-serverapp-c123')).toBe(true);
  });

  it('rejects MediaWiki ids (found via the Day 5 real-site smoke against Wikipedia)', () => {
    expect(isGeneratedId('mwAyc')).toBe(true);
    expect(isGeneratedId('mwA28')).toBe(true);
    expect(isGeneratedId('mwSection')).toBe(false); // too long to be the mw counter scheme
  });

  it('accepts an ordinary authored id', () => {
    expect(isGeneratedId('main-nav')).toBe(false);
    expect(isGeneratedId('turbidity-chart')).toBe(false);
  });

  it('is extensible via extra patterns, without disabling the built-in ones', () => {
    expect(isGeneratedId('custom-widget-x1', [/^custom-widget-/])).toBe(true);
    expect(isGeneratedId(':r1:', [/^custom-widget-/])).toBe(true);
    expect(isGeneratedId('main-nav', [/^custom-widget-/])).toBe(false);
  });
});

describe('resolveIdentityTier', () => {
  const base: IdentityCandidates = {
    landmarkRole: 'none',
    semanticPath: 'none',
    structuralPath: 'div[0]',
  };

  it('Tier 1: an authored id that survives the generated-id filter', () => {
    expect(resolveIdentityTier({ ...base, authoredId: 'main-nav' })).toEqual({ tier: 1, value: 'main-nav' });
  });

  it('falls through Tier 1 when the id is generated, to Tier 2', () => {
    expect(resolveIdentityTier({ ...base, authoredId: ':r1:', testHookValue: 'submit-button' })).toEqual({
      tier: 2,
      value: 'submit-button',
    });
  });

  it('Tier 2: a test hook, when no usable id exists', () => {
    expect(resolveIdentityTier({ ...base, testHookValue: 'submit-button' })).toEqual({
      tier: 2,
      value: 'submit-button',
    });
  });

  it('Tier 3: the accessible name, normalised', () => {
    expect(resolveIdentityTier({ ...base, accessibleName: '  Submit Order  ' })).toEqual({
      tier: 3,
      value: 'submit order',
    });
  });

  it('does not select Tier 3 for a whitespace-only accessible name', () => {
    expect(
      resolveIdentityTier({ ...base, accessibleName: '   ', landmarkRole: 'navigation', semanticPath: 'navigation > link' }),
    ).toEqual({ tier: 4, value: 'navigation > link' });
  });

  it('Tier 4: the semantic path, when a landmark ancestor exists', () => {
    expect(
      resolveIdentityTier({ ...base, landmarkRole: 'navigation', semanticPath: 'navigation > list > listitem > link' }),
    ).toEqual({ tier: 4, value: 'navigation > list > listitem > link' });
  });

  it('Tier 5: the structural path, as the last resort', () => {
    expect(resolveIdentityTier({ ...base, structuralPath: 'section[1] > div[2]' })).toEqual({
      tier: 5,
      value: 'section[1] > div[2]',
    });
  });

  it('accepts extra ignored-id patterns (02 §3.2 config extensibility)', () => {
    expect(
      resolveIdentityTier({ ...base, authoredId: 'legacy-widget-9', testHookValue: 'fallback' }, [/^legacy-widget-/]),
    ).toEqual({ tier: 2, value: 'fallback' });
  });
});

describe('urlTemplateFor', () => {
  it('templates a numeric path segment as :id', () => {
    expect(urlTemplateFor('https://example.com/product/1234')).toBe('/product/:id');
  });

  it('templates a UUID path segment as :uuid', () => {
    expect(urlTemplateFor('https://example.com/users/8f3e2b1a-4c5d-4e6f-8a9b-0c1d2e3f4a5b')).toBe('/users/:uuid');
  });

  it('templates a non-numeric hex hash segment as :hash', () => {
    expect(urlTemplateFor('https://example.com/a/9f8e7d6c5b')).toBe('/a/:hash');
  });

  it('templates a plausible year/month/day triplet', () => {
    expect(urlTemplateFor('https://example.com/2026/08/20/post')).toBe('/:year/:month/:day/post');
  });

  it('does not template an implausible date (month 99) as a date triplet - each numeric segment still templates individually as :id', () => {
    expect(urlTemplateFor('https://example.com/2026/99/99/post')).toBe('/:id/:id/:id/post');
  });

  it('normalises off a trailing slash', () => {
    expect(urlTemplateFor('https://example.com/about/')).toBe('/about');
  });

  it('templates the root path as /', () => {
    expect(urlTemplateFor('https://example.com/')).toBe('/');
    expect(urlTemplateFor('https://example.com')).toBe('/');
  });

  it('sorts query params and strips tracking params, keeping page numbers', () => {
    expect(urlTemplateFor('https://example.com/search?utm_source=x&page=2&b=1&a=1')).toBe('/search?a=1&b=1&page=2');
  });

  it('strips gclid/fbclid/ref specifically', () => {
    expect(urlTemplateFor('https://example.com/x?gclid=1&fbclid=2&ref=3&keep=yes')).toBe('/x?keep=yes');
  });

  it('drops an empty query string entirely once tracking params are stripped', () => {
    expect(urlTemplateFor('https://example.com/x?utm_source=a&utm_medium=b')).toBe('/x');
  });

  it('strips the fragment by default', () => {
    expect(urlTemplateFor('https://example.com/app#/product/1234')).toBe('/app');
  });

  it('templates the fragment as a route when hashRouting is enabled', () => {
    expect(urlTemplateFor('https://example.com/app#/product/1234', { hashRouting: true })).toBe(
      '/app#/product/:id',
    );
  });

  it('does not template the fragment when hashRouting is disabled, even if present', () => {
    expect(urlTemplateFor('https://example.com/app#/product/1234', { hashRouting: false })).toBe('/app');
  });
});

describe('computeBaseFingerprint', () => {
  const input: FingerprintInput = {
    ruleId: 'color-contrast',
    source: 'axe',
    identityTier: 1,
    identityValue: 'contrast-body',
    context: NONE_CONTEXT,
    urlTemplate: '/03-contrast',
  };

  it('is deterministic for identical input', () => {
    expect(computeBaseFingerprint(input)).toBe(computeBaseFingerprint({ ...input }));
  });

  it('is 16 lowercase hex characters', () => {
    expect(computeBaseFingerprint(input)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('changes when ruleId changes', () => {
    expect(computeBaseFingerprint({ ...input, ruleId: 'link-name' })).not.toBe(computeBaseFingerprint(input));
  });

  it('changes when identityValue changes', () => {
    expect(computeBaseFingerprint({ ...input, identityValue: 'contrast-large' })).not.toBe(
      computeBaseFingerprint(input),
    );
  });

  it('changes when identityTier changes, even with the same value (excludes selector, but tier still matters)', () => {
    expect(computeBaseFingerprint({ ...input, identityTier: 3 })).not.toBe(computeBaseFingerprint(input));
  });

  it('changes when urlTemplate changes', () => {
    expect(computeBaseFingerprint({ ...input, urlTemplate: '/other-page' })).not.toBe(computeBaseFingerprint(input));
  });

  it('does not collide across a naive-concatenation boundary shift', () => {
    // ['ab', 'c'] vs ['a', 'bc'] would produce the same string under plain
    // concatenation - the whole reason inputs are joined via JSON.stringify.
    const a = computeBaseFingerprint({ ...input, ruleId: 'ab', identityValue: 'c' });
    const b = computeBaseFingerprint({ ...input, ruleId: 'a', identityValue: 'bc' });
    expect(a).not.toBe(b);
  });
});

describe('assignFingerprints', () => {
  const make = (overrides: Partial<FingerprintInput>): FingerprintInput => ({
    ruleId: 'button-name',
    source: 'axe',
    identityTier: 5,
    identityValue: 'toolbar > button[0]',
    context: NONE_CONTEXT,
    urlTemplate: '/toolbar',
    ...overrides,
  });

  it('leaves a unique finding unsuffixed, at ordinal 0', () => {
    const [result] = assignFingerprints([make({})]);
    expect(result!.ordinal).toBe(0);
    expect(result!.fingerprint).not.toContain('#');
  });

  it('suffixes a genuine collision with document-order ordinals (three identical icon buttons)', () => {
    const inputs = [
      make({ identityValue: 'toolbar > button[0]' }),
      make({ identityValue: 'toolbar > button[0]' }),
      make({ identityValue: 'toolbar > button[0]' }),
    ];
    const results = assignFingerprints(inputs);
    expect(results.map((r) => r.ordinal)).toEqual([0, 1, 2]);
    const base = results[0]!.fingerprint.split('#')[0];
    expect(results.map((r) => r.fingerprint)).toEqual([`${base}#0`, `${base}#1`, `${base}#2`]);
  });

  it('does not perturb existing fingerprints when an unrelated finding is added elsewhere on the page (02 §9 case 10)', () => {
    const before = assignFingerprints([make({ identityValue: 'a' }), make({ identityValue: 'b' })]);
    const after = assignFingerprints([
      make({ identityValue: 'a' }),
      make({ identityValue: 'b' }),
      make({ ruleId: 'color-contrast', identityValue: 'unrelated' }),
    ]);
    expect(after[0]!.fingerprint).toBe(before[0]!.fingerprint);
    expect(after[1]!.fingerprint).toBe(before[1]!.fingerprint);
  });

  it('keeps distinct findings distinct when they do not collide', () => {
    const results = assignFingerprints([make({ identityValue: 'a' }), make({ identityValue: 'b' })]);
    expect(results[0]!.fingerprint).not.toBe(results[1]!.fingerprint);
  });
});
