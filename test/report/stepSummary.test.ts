/**
 * `report/stepSummary.ts` (`01 §11`, `03 Part 3.8`, Day 12) — the
 * `$GITHUB_STEP_SUMMARY` markdown wired to `diff --format markdown`.
 * `gate.reason` first, then template-tier counts, then only the pages
 * that carry a flag from the HEAD run.
 */

import { describe, expect, it } from 'vitest';

import { renderDiffStepSummary } from '../../src/report/stepSummary.js';
import type { DiffResult, Finding, PageResult, Report, RunRef } from '../../src/types.js';

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
    criteria: [{ id: '1.4.3', title: 'Contrast (Minimum)', level: 'AA', since: '2.0', url: 'https://example.com' }],
    tags: [],
    url: 'https://example.com/page',
    urlTemplate: '/page',
    selector: '#x',
    html: '<div id="x"></div>',
    remediation: 'Darken the text.',
    ...overrides,
  };
}

function runRef(overrides: Partial<RunRef> = {}): RunRef {
  return { runId: 'run-1', startedAt: '2026-08-21T00:00:00.000Z', toolVersion: '0.1.0', axeCoreVersion: '4.13.0', mode: 'ci', ...overrides };
}

function diffResult(overrides: Partial<DiffResult> = {}): DiffResult {
  return {
    schemaVersion: '1.0',
    base: runRef({ runId: 'base-1' }),
    head: runRef({ runId: 'head-1' }),
    engineDrift: false,
    incompatibleRunConfig: [],
    pages: { inBoth: 1, onlyInBase: [], onlyInHead: [], errored: [] },
    findings: { new: [], fixed: [], persisting: [], unclassified: [], moved: [], impactChanged: [], unknown: [] },
    gate: { passed: true, reason: 'No new violations.', countedAgainstGate: 0, warnings: [] },
    ...overrides,
  };
}

function page(overrides: Partial<PageResult> = {}): PageResult {
  return {
    url: 'https://example.com/page',
    urlTemplate: '/page',
    depth: 0,
    startedAt: '2026-08-21T00:00:00.000Z',
    durationMs: 100,
    probesRun: true,
    probeBlindRegions: [],
    counts: { violation: 0, needsReview: 0, bestPractice: 0, suppressed: 0 },
    settleDegraded: false,
    ...overrides,
  };
}

// Only `pages` is read by renderDiffStepSummary(); the rest of `Report`
// would add nothing here, same reasoning as `test/exitCodeForScan.test.ts`.
function headReportWithPages(pages: PageResult[]): Report {
  return { pages } as unknown as Report;
}

describe('renderDiffStepSummary', () => {
  it('puts gate.reason first, before the template-tier section', () => {
    const md = renderDiffStepSummary(
      diffResult({ gate: { passed: true, reason: '1 new template defect (3 instances)', countedAgainstGate: 3, warnings: [] } }),
      headReportWithPages([page()]),
    );
    expect(md.startsWith('## Gate: PASSED')).toBe(true);
    expect(md).toContain('1 new template defect (3 instances)');
    expect(md.indexOf('1 new template defect')).toBeLessThan(md.indexOf('Template-tier changes'));
  });

  it('renders FAILED for a failed gate, with its reason and warnings', () => {
    const md = renderDiffStepSummary(
      diffResult({ gate: { passed: false, reason: '2 new serious violations on 1 page (1.4.3)', countedAgainstGate: 2, warnings: ['1 page removed since base'] } }),
      headReportWithPages([]),
    );
    expect(md).toContain('Gate: FAILED');
    expect(md).toContain('2 new serious violations on 1 page (1.4.3)');
    expect(md).toContain('1 page removed since base');
  });

  it('flags engine drift and incompatible run configuration distinctly', () => {
    const md = renderDiffStepSummary(
      diffResult({
        engineDrift: true,
        incompatibleRunConfig: [{ reason: 'mode', base: 'ci', head: 'audit' }],
      }),
      headReportWithPages([]),
    );
    expect(md).toContain('axe-core version drift');
    expect(md).toContain('Incompatible run configuration');
    expect(md).toContain('**mode**');
    expect(md).toContain('base `ci`, head `audit`');
  });

  it('reports template-tier counts, not raw instance counts, for new/fixed/moved/impact-changed', () => {
    const md = renderDiffStepSummary(
      diffResult({
        findings: {
          ...diffResult().findings,
          new: [finding({ fingerprint: 'f1', templateKey: 't1' }), finding({ fingerprint: 'f2', templateKey: 't1' })],
          fixed: [finding({ fingerprint: 'f3', ruleId: 'image-alt', templateKey: 't2' })],
        },
      }),
      headReportWithPages([]),
    );
    expect(md).toMatch(/\|\s*New\s*\|\s*1\s*\|\s*2\s*\|/);
    expect(md).toMatch(/\|\s*Fixed\s*\|\s*1\s*\|\s*1\s*\|/);
  });

  it('summarises persisting as a count across templates, never listed individually', () => {
    const md = renderDiffStepSummary(
      diffResult({
        findings: {
          ...diffResult().findings,
          persisting: [finding({ templateKey: 't1' }), finding({ templateKey: 't1', fingerprint: 'f2' }), finding({ templateKey: 't2', fingerprint: 'f3' })],
        },
      }),
      headReportWithPages([]),
    );
    expect(md).toContain('Persisting: 3 instances across 2 templates (unchanged, not listed individually).');
  });

  it('breaks down unknown findings by reason', () => {
    const md = renderDiffStepSummary(
      diffResult({
        findings: {
          ...diffResult().findings,
          unknown: [
            { reason: 'page-removed', finding: finding() },
            { reason: 'page-removed', finding: finding({ fingerprint: 'f2' }) },
            { reason: 'page-error', finding: finding({ fingerprint: 'f3' }) },
          ],
        },
      }),
      headReportWithPages([]),
    );
    expect(md).toContain('Unknown: 3 findings');
    expect(md).toContain('2 page-removed');
    expect(md).toContain('1 page-error');
  });

  it('reports "no finding changes" when every bucket is empty', () => {
    const md = renderDiffStepSummary(diffResult(), headReportWithPages([page()]));
    expect(md).toContain('No finding changes between these two runs.');
  });

  it('lists only pages carrying a flag, not the full page table', () => {
    const clean = page({ url: 'https://example.com/clean' });
    const errored = page({ url: 'https://example.com/broken', error: { kind: 'navigation-timeout', message: 'timed out after 30s' } });
    const degraded = page({ url: 'https://example.com/degraded', settleDegraded: true });
    const blind = page({
      url: 'https://example.com/shadow',
      probeBlindRegions: [{ selector: '#host', reason: 'closed-shadow-root', unevaluatedCriteria: ['2.4.11', '2.1.2'] }],
    });

    const md = renderDiffStepSummary(diffResult(), headReportWithPages([clean, errored, degraded, blind]));

    expect(md).toContain('3 of 4 pages in this run carry a flag');
    expect(md).not.toContain('https://example.com/clean');
    expect(md).toContain('https://example.com/broken');
    expect(md).toContain('navigation-timeout');
    expect(md).toContain('https://example.com/degraded');
    expect(md).toContain('settle degraded');
    expect(md).toContain('https://example.com/shadow');
    expect(md).toContain('1 probe-blind region');
  });

  it('omits the pages section entirely when no page carries a flag', () => {
    const md = renderDiffStepSummary(diffResult(), headReportWithPages([page(), page({ url: 'https://example.com/other' })]));
    expect(md).not.toContain('Pages needing a look');
  });
});
