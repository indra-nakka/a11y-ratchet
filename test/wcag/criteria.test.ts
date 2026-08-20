import { describe, expect, it } from 'vitest';

import { criterionById, WCAG_CRITERIA } from '../../src/wcag/criteria.js';

describe('WCAG_CRITERIA', () => {
  it('has all 86 WCAG 2.2 success criteria, uniquely', () => {
    expect(WCAG_CRITERIA).toHaveLength(86);
    expect(new Set(WCAG_CRITERIA.map((c) => c.id)).size).toBe(86);
  });

  it('splits 31 A / 24 AA / 31 AAA (03-EVIDENCE.md §1.1)', () => {
    const byLevel = { A: 0, AA: 0, AAA: 0 };
    for (const criterion of WCAG_CRITERIA) byLevel[criterion.level] += 1;
    expect(byLevel).toEqual({ A: 31, AA: 24, AAA: 31 });
  });

  it('splits 60 since-2.0 / 17 since-2.1 / 9 since-2.2', () => {
    const bySince = { '2.0': 0, '2.1': 0, '2.2': 0 };
    for (const criterion of WCAG_CRITERIA) bySince[criterion.since] += 1;
    // 61 (WCAG 2.0) - 1 (4.1.1 Parsing, removed in 2.2) = 60 "since 2.0".
    expect(bySince).toEqual({ '2.0': 60, '2.1': 17, '2.2': 9 });
  });

  it('does not include the removed 4.1.1 Parsing', () => {
    expect(criterionById('4.1.1')).toBeUndefined();
  });

  it('marks exactly the nine 2.2 additions, matching 03-EVIDENCE.md §1.1', () => {
    const newIn22 = WCAG_CRITERIA.filter((c) => c.since === '2.2')
      .map((c) => c.id)
      .sort();
    expect(newIn22).toEqual(
      ['2.4.11', '2.4.12', '2.4.13', '2.5.7', '2.5.8', '3.2.6', '3.3.7', '3.3.8', '3.3.9'].sort(),
    );
  });

  it('looks up a criterion by id', () => {
    expect(criterionById('1.4.3')).toMatchObject({ id: '1.4.3', title: 'Contrast (Minimum)', level: 'AA' });
  });
});
