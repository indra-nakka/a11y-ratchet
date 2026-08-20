/**
 * Day 2's done-when: scanning a fixture page produces findings matching its
 * manifest entry. Runs a real Playwright + axe-core scan against the local
 * fixture server (`03-EVIDENCE.md §2.3`: no test touches the network).
 *
 * Checked at rule×bucket granularity — the manifest doesn't specify node
 * counts, and node counts are a matching-layer concern (Day 4-6), not this
 * layer's. What this DOES catch: a rule firing that the manifest doesn't
 * predict (exactly how the star-rating contrast-incomplete and the
 * th-has-data-cells bucket correction were found while building this).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { scan } from '../../src/index.js';
import { MANIFEST_PATH, pageUrl, start, stop } from '../fixtures/server.js';
import type { Finding } from '../../src/types.js';

interface Defect {
  id: string;
  selector: string;
  criterion: string;
  level: 'A' | 'AA' | 'AAA';
  expectation: 'detected' | 'needs-review' | 'missed';
  expectedRules: string[];
}

interface ManifestPage {
  path: string;
  defects: Defect[];
  expectZeroFindings?: boolean;
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as { pages: ManifestPage[] };

function expectedRuleBucketPairs(page: ManifestPage): Set<string> {
  const pairs = new Set<string>();
  for (const defect of page.defects) {
    if (defect.expectation === 'missed') continue;
    const bucket = defect.expectation === 'detected' ? 'violation' : 'needs-review';
    for (const rule of defect.expectedRules) pairs.add(`${rule}::${bucket}`);
  }
  return pairs;
}

function actualRuleBucketPairs(findings: Finding[]): Set<string> {
  return new Set(findings.map((finding) => `${finding.ruleId}::${finding.bucket}`));
}

// Populated across the per-page tests below, for the check-#1 assertion that
// runs after them: does every axe rule that fires anywhere in the fixture
// suite map to at least one SC or to bestPractice: true? Shared module state
// is safe here because vitest runs `it`s within a `describe` sequentially by
// default - this suite never opts into `concurrent`.
const allFindingsAcrossFixtures: Finding[] = [];

describe('scan() against the fixture manifest', () => {
  beforeAll(async () => {
    await start();
  }, 30_000);

  afterAll(async () => {
    await stop();
  });

  for (const page of manifest.pages) {
    const dir = page.path.split('/')[0]!;

    it(
      `${dir}: findings match the manifest at rule×bucket granularity`,
      async () => {
        const report = await scan({
          seed: { url: pageUrl(dir) },
          // 01 §5: raise the mutation-quiet period for fixture determinism.
          settle: { quietMs: 500 },
        });

        expect(report.pages).toHaveLength(1);
        expect(report.pages[0]?.error).toBeUndefined();

        const actual = actualRuleBucketPairs(report.findings);
        const expected = expectedRuleBucketPairs(page);

        expect([...actual].sort(), `${dir}: unexpected rule×bucket set`).toEqual([...expected].sort());

        if (page.expectZeroFindings) {
          expect(report.findings).toEqual([]);
        }

        // Day 3 done-when: every finding carries a correct SC number and
        // level. Checked against the manifest's own criterion/level per
        // defect, not just that SOME criteria array is non-empty.
        for (const defect of page.defects) {
          if (defect.expectation === 'missed') continue;
          const matches = report.findings.filter((finding) => defect.expectedRules.includes(finding.ruleId));
          expect(matches.length, `${dir}/${defect.id}: no finding for ${defect.expectedRules.join(',')}`).toBeGreaterThan(0);
          const hasCorrectCriterion = matches.some((finding) =>
            finding.criteria.some((criterion) => criterion.id === defect.criterion && criterion.level === defect.level),
          );
          expect(hasCorrectCriterion, `${dir}/${defect.id}: expected ${defect.criterion} [${defect.level}]`).toBe(true);
        }

        allFindingsAcrossFixtures.push(...report.findings);
      },
      30_000,
    );
  }

  it('check 1: every fired rule maps to at least one SC or to bestPractice: true', () => {
    expect(allFindingsAcrossFixtures.length).toBeGreaterThan(0);
    const unmapped = allFindingsAcrossFixtures.filter(
      (finding) => finding.criteria.length === 0 && !finding.bestPractice,
    );
    const unmappedRuleIds = [...new Set(unmapped.map((finding) => finding.ruleId))];
    expect(unmappedRuleIds, 'rules mapping to neither an SC nor bestPractice: true').toEqual([]);
  });

  it('populates identity.value with the raw id for tier-1 findings', async () => {
    const report = await scan({ seed: { url: pageUrl('01-images') } });
    const imageAlt = report.findings.find((finding) => finding.ruleId === 'image-alt');
    expect(imageAlt?.identityTier).toBe(1);
    expect(imageAlt?.identity.value).toBe('turbidity-chart');
    expect(imageAlt?.selector).toContain('turbidity-chart');
  }, 30_000);

  it('sets bestPractice from tags, and never includes best-practice rules by default', async () => {
    const report = await scan({ seed: { url: pageUrl('02-structure') } });
    expect(report.findings.every((finding) => !finding.bestPractice)).toBe(true);
    // heading-order (best-practice) must not fire without --include-best-practice.
    expect(report.findings.some((finding) => finding.ruleId === 'heading-order')).toBe(false);
  }, 30_000);

  it('computes real, well-formed, distinct fingerprints and group keys (Day 4)', async () => {
    const report = await scan({ seed: { url: pageUrl('03-contrast') } });
    expect(report.findings.length).toBeGreaterThan(0);
    for (const finding of report.findings) {
      expect(finding.fingerprint).toMatch(/^[0-9a-f]{16}(#\d+)?$/);
      expect(finding.groupKey).toMatch(/^[0-9a-f]{16}$/);
    }
    // No planted defect on this page shares an element with another - every
    // fingerprint should be distinct, with no collision ordinal needed.
    const fingerprints = report.findings.map((finding) => finding.fingerprint);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
    expect(report.findings.every((finding) => finding.identity.ordinal === 0)).toBe(true);
  }, 30_000);

  it('reports the identity tier distribution across the fixture suite', async () => {
    const tierCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const page of manifest.pages) {
      const dir = page.path.split('/')[0]!;
      const report = await scan({ seed: { url: pageUrl(dir) } });
      for (const finding of report.findings) {
        tierCounts[finding.identityTier] = (tierCounts[finding.identityTier] ?? 0) + 1;
      }
    }
    const total = Object.values(tierCounts).reduce((sum, n) => sum + n, 0);
    // Day 4 explicitly asks for this reported, not just asserted.
    console.log('Identity tier distribution across the fixture suite:', tierCounts, `(${total} findings)`);
    expect(total).toBeGreaterThan(0);
    // Every Day 1 fixture defect has an authored id (manifest.test.ts
    // enforces `selector.startsWith('#')`), so Tier 1 should dominate here -
    // this suite alone can't demonstrate real-world tier distribution.
    expect(tierCounts[1]).toBeGreaterThan(0);
  }, 60_000);
});
