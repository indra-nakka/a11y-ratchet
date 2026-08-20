import { describe, expect, it } from 'vitest';

import { criteriaForTags, isBestPractice } from '../../src/wcag/ruleMap.js';

describe('criteriaForTags', () => {
  it('parses a single wcag tag to its dotted SC id', () => {
    expect(criteriaForTags(['cat.color', 'wcag2aa', 'wcag143']).map((c) => c.id)).toEqual(['1.4.3']);
  });

  it('parses a two-digit trailing criterion number (wcag1412 -> 1.4.12)', () => {
    expect(criteriaForTags(['wcag21aa', 'wcag1412']).map((c) => c.id)).toEqual(['1.4.12']);
  });

  it('keeps the array for a multi-SC rule (link-name: 2.4.4 and 4.1.2)', () => {
    const ids = criteriaForTags(['cat.name-role-value', 'wcag2a', 'wcag244', 'wcag412']).map((c) => c.id);
    expect(ids.sort()).toEqual(['2.4.4', '4.1.2']);
  });

  it('resolves an AAA-tagged rule instead of falling through', () => {
    expect(criteriaForTags(['wcag2aaa', 'wcag146']).map((c) => c.id)).toEqual(['1.4.6']);
  });

  it('returns an empty array for a best-practice-only rule', () => {
    expect(criteriaForTags(['cat.semantics', 'best-practice'])).toEqual([]);
  });

  it('drops a wcag-shaped tag naming a criterion that no longer exists (wcag411 -> removed 4.1.1)', () => {
    expect(criteriaForTags(['wcag2a-obsolete', 'wcag411', 'deprecated'])).toEqual([]);
  });

  it('ignores non-SC wcag tags (level/version tags like wcag2a, wcag22aa)', () => {
    expect(criteriaForTags(['wcag2a', 'wcag21aa', 'wcag22aa'])).toEqual([]);
  });

  it('sorts numerically, not lexically (1.4.3 before 1.4.12)', () => {
    const ids = criteriaForTags(['wcag1412', 'wcag143']).map((c) => c.id);
    expect(ids).toEqual(['1.4.3', '1.4.12']);
  });
});

describe('isBestPractice', () => {
  it('is true only when the best-practice tag is present', () => {
    expect(isBestPractice(['cat.semantics', 'best-practice'])).toBe(true);
    expect(isBestPractice(['cat.color', 'wcag2aa', 'wcag143'])).toBe(false);
  });

  // DECISIONS.md D4: never derived from criteria.length === 0 - a rule with
  // no WCAG tag but also no best-practice tag (shouldn't happen in practice,
  // but the function must not silently invent bestPractice: true for it).
  it('is false for a rule with neither a WCAG tag nor best-practice', () => {
    expect(isBestPractice(['cat.parsing'])).toBe(false);
  });
});
