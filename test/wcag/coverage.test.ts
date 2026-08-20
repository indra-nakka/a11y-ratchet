import { describe, expect, it } from 'vitest';

import { computeCoverageCounts, WCAG_COVERAGE } from '../../src/wcag/coverage.js';
import { criterionById } from '../../src/wcag/criteria.js';

describe('WCAG_COVERAGE', () => {
  it('covers exactly the 55 A/AA criteria, uniquely - the scope of an AA claim', () => {
    expect(WCAG_COVERAGE).toHaveLength(55);
    expect(new Set(WCAG_COVERAGE.map((e) => e.criterion)).size).toBe(55);
    for (const entry of WCAG_COVERAGE) {
      const criterion = criterionById(entry.criterion);
      expect(criterion, `${entry.criterion} not in wcag/criteria.ts`).toBeDefined();
      expect(criterion?.level, entry.criterion).not.toBe('AAA');
    }
  });

  it('marks exactly the two D17 experimental rules, per axe-core 4.13.0', () => {
    const experimental = WCAG_COVERAGE.filter((e) => e.experimental).map((e) => e.criterion);
    expect(experimental.sort()).toEqual(['1.3.4', '2.5.3']);
  });

  it('every entry has at least one manual check stub', () => {
    for (const entry of WCAG_COVERAGE) {
      expect(entry.manualChecks.length, entry.criterion).toBeGreaterThan(0);
    }
  });

  it('probe entries name a probe id and no axe rule', () => {
    const probeEntries = WCAG_COVERAGE.filter((e) => e.status === 'probe');
    expect(probeEntries.map((e) => e.criterion).sort()).toEqual(['2.1.2', '2.4.11']);
    for (const entry of probeEntries) {
      expect(entry.axeRules).toEqual([]);
      expect(entry.probeIds.length).toBeGreaterThan(0);
    }
  });
});

describe('computeCoverageCounts — check 2 against 03-EVIDENCE.md §1.7', () => {
  it('matches on Detectable and Probe, the two doc figures that turned out to be correct', () => {
    const counts = computeCoverageCounts(['A', 'AA']);
    expect(counts.total).toBe(55);
    expect(counts.byStatus.detectable).toBe(4);
    expect(counts.byStatus.probe).toBe(2);
  });

  it('disagrees with the doc on Partial/Manual/Any signal - 3 rows reclassified, verified against real axe-core 4.13.0 tags, not the doc text', () => {
    // 03-EVIDENCE.md §1.7 states Partial 20, Manual 29, Any signal 26 (47%).
    // Verified against axe.getRules() + a live run, three rows the doc
    // credited with automated signal have none in 4.13.0 and were moved
    // Partial -> Manual (DECISIONS.md D22):
    //   - 2.4.6 Headings and Labels: empty-heading and heading-order are
    //     BOTH best-practice-only, no WCAG tag at all.
    //   - 3.3.8 Accessible Authentication (Minimum): no axe rule exists;
    //     the doc described a hypothetical custom rule, not shipped code.
    //   - 4.1.3 Status Messages: no axe-core rule carries a wcag413 tag.
    // This is the doc disagreeing with reality, not a bug in this file -
    // 03-EVIDENCE.md should be corrected to these figures, not the reverse.
    const counts = computeCoverageCounts(['A', 'AA']);
    expect(counts.byStatus.partial).toBe(17);
    expect(counts.byStatus.manual).toBe(32);
    expect(counts.anySignal).toBe(23);
  });

  it('every count is generated, never hardcoded elsewhere (03-EVIDENCE.md §1.7)', () => {
    const counts = computeCoverageCounts(['A', 'AA']);
    const total = Object.values(counts.byStatus).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(counts.total);
    expect(counts.certifiable).toBe(0);
  });
});
