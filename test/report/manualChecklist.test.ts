/**
 * `report/manualChecklist.ts` (`00 §7` cut line 2, `03 §1.8`, Day 13):
 * the static criterion-keyed checklist, `--criteria` filtering, and
 * per-page routing of needs-review findings and probe-blind regions when
 * a `Report` is supplied.
 */

import { describe, expect, it } from 'vitest';

import { renderManualChecklist } from '../../src/report/manualChecklist.js';
import { WCAG_COVERAGE } from '../../src/wcag/coverage.js';
import type { Finding, PageResult, Report } from '../../src/types.js';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    fingerprint: 'aaaaaaaaaaaaaaaa',
    groupKey: 'group-a',
    templateKey: 'template-a',
    identityTier: 3,
    identity: { value: 'x', ordinal: 0, context: { nearestLandmark: 'main', headingContext: 'none', inFrame: [] }, domDepth: 3 },
    source: 'probe',
    ruleId: 'probe/focus-obscured',
    bucket: 'needs-review',
    bestPractice: false,
    impact: 'moderate',
    criteria: [{ id: '2.4.11', title: 'Focus Not Obscured (Minimum)', level: 'AA', since: '2.2', url: 'https://example.com' }],
    tags: [],
    url: 'https://example.com/page',
    urlTemplate: '/page',
    selector: '#x',
    html: '<a id="x"></a>',
    remediation: 'Add scroll-margin-top so the sticky header never covers this control.',
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

// Only `findings` and `pages` are read by renderManualChecklist(); the
// rest of `Report` would add nothing here, same reasoning as
// `test/exitCodeForScan.test.ts`.
function reportWith(findings: Finding[], pages: PageResult[]): Report {
  return { findings, pages } as unknown as Report;
}

describe('renderManualChecklist', () => {
  it('lists every WCAG_COVERAGE criterion, unfiltered, when no report is given', () => {
    const md = renderManualChecklist({ format: 'markdown' });
    for (const entry of WCAG_COVERAGE) {
      expect(md, entry.criterion).toContain(`### ${entry.criterion}`);
    }
    expect(md).not.toContain('## Findings and blind regions, by page');
  });

  it('--criteria restricts the checklist to the given ids', () => {
    const md = renderManualChecklist({ format: 'markdown', criteria: ['1.2.1', '2.4.11'] });
    expect(md).toContain('### 1.2.1');
    expect(md).toContain('### 2.4.11');
    expect(md).not.toContain('### 1.1.1');
    expect(md.match(/^### /gm)).toHaveLength(2);
  });

  it('format: json returns parseable, structured data with no pages key when no report is given', () => {
    const json = renderManualChecklist({ format: 'json' });
    const data = JSON.parse(json) as { criteria: unknown[]; pages?: unknown[] };
    expect(data.criteria).toHaveLength(WCAG_COVERAGE.length);
    expect(data.pages).toBeUndefined();
  });

  it('routes a needs-review finding into its page, with the ruleId, selector and remediation', () => {
    const report = reportWith([finding()], [page()]);
    const md = renderManualChecklist({ format: 'markdown' }, report);
    expect(md).toContain('## Findings and blind regions, by page');
    expect(md).toContain('### https://example.com/page');
    expect(md).toContain('**Needs-review — verify these:**');
    expect(md).toContain('[probe/focus-obscured] `#x` (2.4.11) — Add scroll-margin-top so the sticky header never covers this control.');
  });

  it('never routes a violation or a suppressed needs-review finding, only bucket: needs-review and unsuppressed', () => {
    const violation = finding({ fingerprint: 'f1', bucket: 'violation', ruleId: 'image-alt' });
    const suppressed = finding({
      fingerprint: 'f2',
      ruleId: 'suppressed-rule',
      suppressed: { ruleRef: 'r1', justification: 'known issue', owner: '@alice', expires: '2099-01-01', category: 'accepted-risk', expired: false },
    });
    const report = reportWith([violation, suppressed], [page()]);
    const md = renderManualChecklist({ format: 'markdown' }, report);
    expect(md).toContain('No needs-review findings or probe-blind regions in this report.');
    expect(md).not.toContain('image-alt');
    expect(md).not.toContain('suppressed-rule');
  });

  it('routes a probe-blind region into its page as "could not evaluate"', () => {
    const blindPage = page({
      url: 'https://example.com/shadow',
      probeBlindRegions: [{ selector: '#host', reason: 'closed-shadow-root', unevaluatedCriteria: ['2.4.11', '2.1.2'] }],
    });
    const report = reportWith([], [blindPage]);
    const md = renderManualChecklist({ format: 'markdown' }, report);
    expect(md).toContain('### https://example.com/shadow');
    expect(md).toContain('**Could not evaluate — check by hand:**');
    expect(md).toContain('`#host` — closed-shadow-root (unevaluated: 2.4.11, 2.1.2)');
  });

  it('omits a page from the routed section entirely when it has nothing to route', () => {
    const report = reportWith([], [page(), page({ url: 'https://example.com/clean' })]);
    const md = renderManualChecklist({ format: 'markdown' }, report);
    expect(md).toContain('No needs-review findings or probe-blind regions in this report.');
    expect(md).not.toContain('https://example.com/clean');
  });

  it('--criteria also filters routed findings and blind regions to overlapping criterion ids', () => {
    const matching = finding({ fingerprint: 'f1', criteria: [{ id: '2.4.11', title: 'Focus Not Obscured (Minimum)', level: 'AA', since: '2.2', url: 'x' }] });
    const nonMatching = finding({ fingerprint: 'f2', ruleId: 'other-rule', criteria: [{ id: '1.4.3', title: 'Contrast (Minimum)', level: 'AA', since: '2.0', url: 'x' }] });
    const report = reportWith([matching, nonMatching], [page()]);
    const md = renderManualChecklist({ format: 'markdown', criteria: ['2.4.11'] }, report);
    expect(md).toContain('probe/focus-obscured');
    expect(md).not.toContain('other-rule');
  });
});
