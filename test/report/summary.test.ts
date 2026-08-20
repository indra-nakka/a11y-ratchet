import { describe, expect, it } from 'vitest';

import { renderSummary } from '../../src/report/summary.js';
import type { Finding, Report, TemplateGroup } from '../../src/types.js';

function finding(overrides: Partial<Finding>): Finding {
  return {
    fingerprint: 'unset:day-4-fingerprint',
    groupKey: 'unset:day-4-groupkey',
    templateKey: 'unset:day-10-templatekey',
    identityTier: 1,
    identity: { value: 'x', ordinal: 0, context: { nearestLandmark: 'none', headingContext: 'none', inFrame: [] }, domDepth: 1 },
    source: 'axe',
    ruleId: 'color-contrast',
    bucket: 'violation',
    bestPractice: false,
    impact: 'serious',
    criteria: [{ id: '1.4.3', title: 'Contrast (Minimum)', level: 'AA', since: '2.0', url: 'https://example.com' }],
    tags: ['wcag2aa', 'wcag143'],
    url: 'https://example.com/page',
    urlTemplate: 'https://example.com/page',
    selector: '#foo',
    html: '<div id="foo"></div>',
    remediation: 'Darken the text.',
    ...overrides,
  };
}

function templateGroup(finding: Finding, overrides: Partial<TemplateGroup> = {}): TemplateGroup {
  return {
    templateKey: finding.templateKey,
    ruleId: finding.ruleId,
    source: finding.source,
    bucket: finding.bucket,
    bestPractice: finding.bestPractice,
    impact: finding.impact,
    criteria: finding.criteria,
    exampleSelector: finding.selector,
    groupKeys: [finding.groupKey],
    fingerprints: [finding.fingerprint],
    urls: [finding.url],
    pageCount: 1,
    instanceCount: 1,
    ...overrides,
  };
}

function report(findings: Finding[], templateGroups: Record<string, TemplateGroup> = {}): Report {
  const violation = findings.filter((f) => f.bucket === 'violation' && !f.bestPractice).length;
  const needsReview = findings.filter((f) => f.bucket === 'needs-review' && !f.bestPractice).length;
  const bestPractice = findings.filter((f) => f.bestPractice).length;
  return {
    schemaVersion: '1.3',
    tool: { name: 'a11y-ratchet', version: '0.1.0', axeCoreVersion: '4.13.0', playwrightVersion: '1.62.1', browser: 'chromium', browserVersion: '140.0' },
    run: {
      id: 'run-1',
      startedAt: '2026-08-20T00:00:00.000Z',
      durationMs: 100,
      configHash: 'abc123',
      baseUrl: 'https://example.com',
      mode: 'ci',
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'UTC',
      colorScheme: 'light',
      reducedMotion: 'reduce',
      blockedOrigins: [],
      concurrency: 3,
      settle: { strategy: 'default', quietMs: 150, quietCapMs: 2000, fontsReadyCapMs: 3000, imageDecodeCapMs: 1500 },
      probesEnabled: [],
      bypassCSP: false,
    },
    pages: [
      {
        url: 'https://example.com/page',
        urlTemplate: 'https://example.com/page',
        depth: 0,
        startedAt: '2026-08-20T00:00:00.000Z',
        durationMs: 100,
        probesRun: false,
        probeBlindRegions: [],
        counts: { violation, needsReview, bestPractice, suppressed: 0 },
        settleDegraded: false,
      },
    ],
    findings,
    groups: {},
    templateGroups,
    summary: {
      pages: { total: 1, scanned: 1, errored: 0 },
      findings: {
        total: findings.length,
        violation,
        needsReview,
        bestPractice,
        suppressed: 0,
        bySource: { axe: findings.length, probe: 0 },
        byImpact: { minor: 0, moderate: 0, serious: findings.length, critical: 0 },
        byCriterion: {},
        byLevel: { A: 0, AA: findings.length, AAA: 0 },
        byRule: {},
        byTier: findings.reduce(
          (tally, f) => ({ ...tally, [f.identityTier]: (tally[f.identityTier] ?? 0) + 1 }),
          { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>,
        ),
      },
      groups: 0,
      templateGroups: 0,
      probeBlindRegions: 0,
    },
  };
}

describe('renderSummary', () => {
  it('reports zero findings clearly', () => {
    const text = renderSummary(report([]));
    expect(text).toContain('0 violation');
    expect(text).toContain('No findings.');
  });

  it('--ungrouped lists a finding with its rule, SC, level, url, selector and remediation', () => {
    const text = renderSummary(report([finding({})]), { ungrouped: true });
    expect(text).toContain('color-contrast');
    expect(text).toContain('1.4.3 Contrast (Minimum) [AA]');
    expect(text).toContain('https://example.com/page');
    expect(text).toContain('#foo');
    expect(text).toContain('Darken the text.');
  });

  it('--ungrouped sorts violations before needs-review, and critical before minor within a bucket', () => {
    const text = renderSummary(
      report([
        finding({ ruleId: 'minor-violation', bucket: 'violation', impact: 'minor' }),
        finding({ ruleId: 'critical-violation', bucket: 'violation', impact: 'critical' }),
        finding({ ruleId: 'needs-review-finding', bucket: 'needs-review', impact: 'critical' }),
      ]),
      { ungrouped: true },
    );
    const order = ['critical-violation', 'minor-violation', 'needs-review-finding'].map((id) => text.indexOf(id));
    expect(order[0]).toBeLessThan(order[1]!);
    expect(order[1]).toBeLessThan(order[2]!);
  });

  it('--ungrouped labels a best-practice finding distinctly and sorts it after WCAG findings in its bucket', () => {
    const text = renderSummary(
      report([
        finding({ ruleId: 'region', bucket: 'violation', bestPractice: true, criteria: [] }),
        finding({ ruleId: 'color-contrast', bucket: 'violation', bestPractice: false }),
      ]),
      { ungrouped: true },
    );
    expect(text).toContain('[serious/best-practice] region — best practice — not a WCAG failure');
    expect(text.indexOf('color-contrast')).toBeLessThan(text.indexOf('region'));
  });

  it('surfaces a page error', () => {
    const withError = report([]);
    withError.pages[0]!.error = { kind: 'navigation-timeout', message: 'timed out after 30s' };
    const text = renderSummary(withError);
    expect(text).toContain('navigation-timeout');
    expect(text).toContain('timed out after 30s');
  });

  it('defaults to the template-tier grouped view, with instance counts, never a raw finding count', () => {
    const colorContrast = finding({ ruleId: 'color-contrast', templateKey: 'tk-color-contrast' });
    const text = renderSummary(
      report([colorContrast], { 'tk-color-contrast': templateGroup(colorContrast, { instanceCount: 43, pageCount: 12, groupKeys: Array.from({ length: 3 }, (_, i) => `g${i}`) }) }),
    );
    expect(text).toContain('Grouped by template');
    expect(text).toContain('color-contrast');
    expect(text).toContain('3 template defects (43 instances) on 12 pages');
  });

  it('a template group with zero groupKeys (all suppressed) is excluded, reporting "no findings" rather than an empty tree', () => {
    const text = renderSummary(report([finding({})]));
    expect(text).toContain('No findings (all suppressed)');
  });
});
