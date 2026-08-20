/**
 * `report/html/render.ts` (`01 §2`, Day 10): a single self-contained HTML
 * string - default TEMPLATE tier, expandable to group then instance,
 * suppressed findings visible in their own section, settleDegraded and
 * probeBlindRegions surfaced per page, tier distribution shown.
 */

import { describe, expect, it } from 'vitest';

import { buildGroupIndex, buildTemplateIndex } from '../../../src/identity/group.js';
import { renderReportHtml } from '../../../src/report/html/render.js';
import type { Finding, PageResult, Report, Summary } from '../../../src/types.js';

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

function page(overrides: Partial<PageResult> = {}): PageResult {
  return {
    url: 'https://example.com/page',
    urlTemplate: '/page',
    depth: 0,
    startedAt: '2026-08-20T00:00:00.000Z',
    durationMs: 100,
    probesRun: true,
    probeBlindRegions: [],
    counts: { violation: 0, needsReview: 0, bestPractice: 0, suppressed: 0 },
    settleDegraded: false,
    ...overrides,
  };
}

function summaryFor(findings: Finding[], pages: PageResult[]): Summary {
  const byTier: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const f of findings) byTier[f.identityTier] = (byTier[f.identityTier] ?? 0) + 1;
  return {
    pages: { total: pages.length, scanned: pages.filter((p) => !p.error).length, errored: pages.filter((p) => p.error).length },
    findings: {
      total: findings.length,
      violation: findings.filter((f) => f.bucket === 'violation' && !f.bestPractice && !f.suppressed).length,
      needsReview: findings.filter((f) => f.bucket === 'needs-review' && !f.bestPractice && !f.suppressed).length,
      bestPractice: findings.filter((f) => f.bestPractice).length,
      suppressed: findings.filter((f) => f.suppressed).length,
      bySource: { axe: findings.filter((f) => f.source === 'axe').length, probe: findings.filter((f) => f.source === 'probe').length },
      byImpact: { minor: 0, moderate: 0, serious: 0, critical: 0 },
      byCriterion: {},
      byLevel: { A: 0, AA: 0, AAA: 0 },
      byRule: {},
      byTier,
    },
    groups: new Set(findings.map((f) => f.groupKey)).size,
    templateGroups: new Set(findings.map((f) => f.templateKey)).size,
    probeBlindRegions: pages.reduce((sum, p) => sum + p.probeBlindRegions.length, 0),
  };
}

function reportFor(findings: Finding[], pages: PageResult[]): Report {
  return {
    schemaVersion: '1.3',
    tool: { name: 'a11y-ratchet', version: '0.1.0', axeCoreVersion: '4.13.0', playwrightVersion: '1.62.1', browser: 'chromium', browserVersion: '140.0' },
    run: {
      id: 'run-1', startedAt: '2026-08-20T00:00:00.000Z', durationMs: 5000, configHash: 'abc', baseUrl: 'https://example.com',
      mode: 'ci', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC',
      colorScheme: 'light', reducedMotion: 'reduce', blockedOrigins: [], concurrency: 3,
      settle: { strategy: 'default', quietMs: 150, quietCapMs: 2000, fontsReadyCapMs: 3000, imageDecodeCapMs: 1500 },
      probesEnabled: [], bypassCSP: false,
    },
    pages,
    findings,
    groups: buildGroupIndex(findings),
    templateGroups: buildTemplateIndex(findings),
    summary: summaryFor(findings, pages),
  };
}

describe('renderReportHtml', () => {
  it('is a single self-contained document: no external script/style/CDN references', () => {
    const html = renderReportHtml(reportFor([finding()], [page()]));
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\/(?!example\.com)/); // only our own fixture URLs appear
    expect(html).toContain('<style>');
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });

  it('renders zero findings cleanly', () => {
    const html = renderReportHtml(reportFor([], [page()]));
    expect(html).toContain('No findings.');
  });

  it('defaults to the template tier, expandable to group then instance', () => {
    const findings = [
      finding({ fingerprint: 'f1', groupKey: 'g1', templateKey: 't1', accessibleName: 'The Great Gatsby', selector: '.card:nth-child(1) a' }),
      finding({ fingerprint: 'f2', groupKey: 'g2', templateKey: 't1', accessibleName: 'Brave New World', selector: '.card:nth-child(2) a' }),
    ];
    const html = renderReportHtml(reportFor(findings, [page()]));

    // One <details class="template"> for the shared templateKey.
    expect((html.match(/class="template"/g) ?? []).length).toBe(1);
    // Two nested <details class="group"> - one per distinct groupKey/accessible name.
    expect((html.match(/class="group"/g) ?? []).length).toBe(2);
    expect(html).toContain('The Great Gatsby');
    expect(html).toContain('Brave New World');
    // Each group's instance list contains its own finding's selector.
    expect(html).toContain('.card:nth-child(1) a');
    expect(html).toContain('.card:nth-child(2) a');
    // The template-level summary states counts as "N template defects (M instances)", never "M violations".
    expect(html).toMatch(/2 template defects?\s*\n?\s*\(2 instances?\)/s);
  });

  it('shows a suppressed finding in its own collapsed section, with reason, category, owner and expiry', () => {
    const suppressed = finding({
      fingerprint: 'f-suppressed',
      suppressed: {
        ruleRef: 'known-issue-1',
        justification: 'Inside a third-party iframe we do not control.',
        owner: '@alice',
        expires: '2099-01-01',
        category: 'third-party',
        expired: false,
      },
    });
    const html = renderReportHtml(reportFor([suppressed], [page()]));

    expect(html).toContain('class="suppressed"');
    expect(html).toContain('Inside a third-party iframe we do not control.');
    expect(html).toContain('third-party');
    expect(html).toContain('@alice');
    expect(html).toContain('2099-01-01');
    expect(html).toContain('known-issue-1');
    // Suppressed findings never appear in the main template/group tree.
    expect(html).not.toContain('class="template"');
  });

  it('flags an expired suppression distinctly', () => {
    const expired = finding({
      suppressed: {
        ruleRef: 'stale-issue', justification: 'no longer relevant', owner: '@bob',
        expires: '2020-01-01', category: 'accepted-risk', expired: true,
      },
    });
    const html = renderReportHtml(reportFor([expired], [page()]));
    expect(html).toContain('expired');
  });

  it('surfaces settleDegraded on a page, not silently', () => {
    const html = renderReportHtml(reportFor([], [page({ settleDegraded: true })]));
    expect(html).toContain('settle degraded');
  });

  it('surfaces probeBlindRegions on a page, not silently', () => {
    const html = renderReportHtml(
      reportFor(
        [],
        [
          page({
            probeBlindRegions: [{ selector: 'closed-widget#w1', reason: 'closed-shadow-root', unevaluatedCriteria: ['2.4.11', '2.1.2'] }],
          }),
        ],
      ),
    );
    expect(html).toContain('probe-blind region');
    expect(html).toContain('closed-widget#w1');
    expect(html).toContain('closed-shadow-root');
  });

  it('surfaces a page error, not as a zero-violation page', () => {
    const html = renderReportHtml(
      reportFor([], [page({ error: { kind: 'navigation-timeout', message: 'timed out after 30s' } })]),
    );
    expect(html).toContain('navigation-timeout');
    expect(html).toContain('timed out after 30s');
  });

  it('shows the identity tier distribution', () => {
    const findings = [finding({ identityTier: 1 }), finding({ identityTier: 5, fingerprint: 'f2' })];
    const html = renderReportHtml(reportFor(findings, [page()]));
    expect(html).toContain('Identity tier distribution');
    expect(html).toContain('Tier 1');
    expect(html).toContain('Tier 5');
  });

  it('flags a bypassCSP run so a reader knows the page\'s own CSP was ignored', () => {
    const report = reportFor([], [page()]);
    report.run.bypassCSP = true;
    const html = renderReportHtml(report);
    expect(html).toContain('ignored the scanned pages');
  });

  it('escapes finding content that could otherwise break the report\'s own markup', () => {
    const dangerous = finding({ html: '<img src=x onerror="alert(1)">', selector: '.a<b>' });
    const html = renderReportHtml(reportFor([dangerous], [page()]));
    expect(html).not.toContain('<img src=x onerror');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });
});
