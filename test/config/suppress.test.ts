/**
 * `config/suppress.ts`: matching by rule, SC, selector glob, URL glob, or
 * fingerprint - ALL of an entry's set matchers must match (AND) - plus
 * `applySuppressions` tagging findings without dropping or reordering any
 * of them (`CLAUDE.md` invariant 2), and `toSuppressionRef`'s expiry flag.
 */

import { describe, expect, it } from 'vitest';

import { applySuppressions, findMatchingSuppression, isExpired, toSuppressionRef } from '../../src/config/suppress.js';
import type { SuppressionEntry } from '../../src/config/schema.js';
import type { Finding } from '../../src/types.js';

function entry(overrides: Partial<SuppressionEntry>): SuppressionEntry {
  return {
    id: 'test-entry',
    reason: 'test reason',
    category: 'accepted-risk',
    owner: '@owner',
    expires: '2099-01-01',
    ...overrides,
  };
}

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    fingerprint: 'aaaaaaaaaaaaaaaa',
    groupKey: 'bbbbbbbbbbbbbbbb',
    templateKey: 'cccccccccccccccc',
    identityTier: 1,
    identity: { value: 'x', ordinal: 0, context: { nearestLandmark: 'main', headingContext: 'none', inFrame: [] }, domDepth: 3 },
    source: 'axe',
    ruleId: 'color-contrast',
    bucket: 'violation',
    bestPractice: false,
    impact: 'serious',
    criteria: [{ id: '1.4.3', title: 'Contrast (Minimum)', level: 'AA', since: '2.0', url: 'https://example.com' }],
    tags: ['wcag2aa', 'wcag143'],
    url: 'https://example.com/checkout/step-1',
    urlTemplate: '/checkout/step-1',
    selector: '.site-footer a.legal-link',
    html: '<a class="legal-link">Terms</a>',
    remediation: '',
    ...overrides,
  };
}

describe('findMatchingSuppression', () => {
  it('matches by rule', () => {
    const e = entry({ rule: 'color-contrast' });
    expect(findMatchingSuppression([e], finding())).toBe(e);
    expect(findMatchingSuppression([entry({ rule: 'image-alt' })], finding())).toBeUndefined();
  });

  it('matches by success criterion', () => {
    const e = entry({ criterion: '1.4.3' });
    expect(findMatchingSuppression([e], finding())).toBe(e);
    expect(findMatchingSuppression([entry({ criterion: '2.4.4' })], finding())).toBeUndefined();
  });

  it('matches by selector glob', () => {
    const e = entry({ selector: '.site-footer *' });
    expect(findMatchingSuppression([e], finding())).toBe(e);
    expect(findMatchingSuppression([entry({ selector: '.site-header *' })], finding())).toBeUndefined();
  });

  it('matches by URL glob', () => {
    const e = entry({ urlPattern: '*/checkout/*' });
    expect(findMatchingSuppression([e], finding())).toBe(e);
    expect(findMatchingSuppression([entry({ urlPattern: '*/pricing/*' })], finding())).toBeUndefined();
  });

  it('matches by exact fingerprint', () => {
    const e = entry({ fingerprint: 'aaaaaaaaaaaaaaaa' });
    expect(findMatchingSuppression([e], finding())).toBe(e);
    expect(findMatchingSuppression([entry({ fingerprint: 'ffffffffffffffff' })], finding())).toBeUndefined();
  });

  it('requires ALL set matchers to match (AND), not any one of them', () => {
    const matchesBoth = entry({ rule: 'color-contrast', criterion: '1.4.3' });
    expect(findMatchingSuppression([matchesBoth], finding())).toBe(matchesBoth);

    const ruleMatchesButCriterionDoesNot = entry({ rule: 'color-contrast', criterion: '2.4.4' });
    expect(findMatchingSuppression([ruleMatchesButCriterionDoesNot], finding())).toBeUndefined();
  });

  it('returns the first matching entry in declared order', () => {
    const first = entry({ id: 'first', rule: 'color-contrast' });
    const second = entry({ id: 'second', rule: 'color-contrast' });
    expect(findMatchingSuppression([first, second], finding())?.id).toBe('first');
  });
});

describe('isExpired', () => {
  it('is true once expires has passed', () => {
    expect(isExpired('2020-01-01', new Date('2026-08-20T00:00:00Z'))).toBe(true);
  });

  it('is false while expires is still in the future', () => {
    expect(isExpired('2099-01-01', new Date('2026-08-20T00:00:00Z'))).toBe(false);
  });

  it('treats the expiry date itself as already expired (end of that day has passed)', () => {
    expect(isExpired('2026-08-20', new Date('2026-08-20T00:00:00Z'))).toBe(true);
  });
});

describe('toSuppressionRef', () => {
  it('carries every config field across, plus the computed expired flag', () => {
    const e = entry({ id: 'ref-test', rule: 'color-contrast', reason: 'why', owner: '@bob', expires: '2020-01-01', category: 'false-positive' });
    const ref = toSuppressionRef(e, new Date('2026-08-20T00:00:00Z'));
    expect(ref).toEqual({
      ruleRef: 'ref-test',
      justification: 'why',
      owner: '@bob',
      expires: '2020-01-01',
      category: 'false-positive',
      expired: true,
    });
  });
});

describe('applySuppressions', () => {
  it('tags a matched finding with suppressed, leaving everything else unchanged', () => {
    const matching = finding({ fingerprint: 'match-me-000000' });
    const other = finding({ fingerprint: 'leave-me-alone00', ruleId: 'image-alt' });
    const e = entry({ id: 'the-match', fingerprint: 'match-me-000000' });

    const result = applySuppressions([matching, other], [e], new Date('2026-08-20T00:00:00Z'));

    expect(result).toHaveLength(2); // never dropped
    expect(result[0]?.suppressed?.ruleRef).toBe('the-match');
    expect(result[1]?.suppressed).toBeUndefined();
  });

  it('returns findings unchanged (same length, same order) when there are no suppression entries', () => {
    const findings = [finding({ fingerprint: 'a' }), finding({ fingerprint: 'b' })];
    const result = applySuppressions(findings, [], new Date());
    expect(result.map((f) => f.fingerprint)).toEqual(['a', 'b']);
    expect(result.every((f) => f.suppressed === undefined)).toBe(true);
  });
});
