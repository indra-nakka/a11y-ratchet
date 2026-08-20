/**
 * `report/html/renderDiff.ts` (`01 §2`/`§7`, Day 11): the diff HTML view.
 * `gate.reason` at the top, template-tier counts, one section each for
 * new/fixed/moved/impact-changed/persisting, plus unclassified/unknown
 * whenever non-empty - the categories `CLAUDE.md` invariant 4 exists to
 * keep visible rather than silently folding into "new".
 */

import { describe, expect, it } from 'vitest';

import { renderDiffHtml } from '../../../src/report/html/renderDiff.js';
import type { DiffResult, Finding, FindingPair, RunRef } from '../../../src/types.js';

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

function pair(fromOverrides: Partial<Finding>, toOverrides: Partial<Finding>): FindingPair {
  return { from: finding(fromOverrides), to: finding(toOverrides) };
}

function runRef(overrides: Partial<RunRef> = {}): RunRef {
  return { runId: 'run-1', startedAt: '2026-08-20T00:00:00.000Z', toolVersion: '0.1.0', axeCoreVersion: '4.13.0', mode: 'ci', ...overrides };
}

function diffResult(overrides: Partial<DiffResult> = {}): DiffResult {
  return {
    schemaVersion: '1.0',
    base: runRef({ runId: 'base-1' }),
    head: runRef({ runId: 'head-1' }),
    engineDrift: false,
    incompatibleRunConfig: [],
    pages: { inBoth: 1, onlyInBase: [], onlyInHead: [], errored: [] },
    findings: {
      new: [],
      fixed: [],
      persisting: [],
      unclassified: [],
      moved: [],
      impactChanged: [],
      unknown: [],
    },
    gate: { passed: true, reason: 'No new violations.', countedAgainstGate: 0, warnings: [] },
    ...overrides,
  };
}

describe('renderDiffHtml', () => {
  it('is a single self-contained document: no external script/CDN references', () => {
    const html = renderDiffHtml(diffResult());
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\/(?!example\.com)/);
    expect(html).toContain('<style>');
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });

  it('puts gate.reason at the top, in a passed banner, before any findings section', () => {
    const html = renderDiffHtml(
      diffResult({
        gate: { passed: true, reason: '1 new template defect (43 instances)', countedAgainstGate: 43, warnings: [] },
        findings: { ...diffResult().findings, new: [finding()] },
      }),
    );
    expect(html).toContain('gate-passed');
    expect(html).toContain('Gate: PASSED');
    expect(html).toContain('1 new template defect (43 instances)');
    expect(html.indexOf('gate-banner')).toBeLessThan(html.indexOf('diff-section'));
  });

  it('renders a failed gate with its reason and warnings', () => {
    const html = renderDiffHtml(
      diffResult({ gate: { passed: false, reason: '2 new serious violations on 1 page (1.4.3)', countedAgainstGate: 2, warnings: ['1 page removed since base'] } }),
    );
    expect(html).toContain('gate-failed');
    expect(html).toContain('Gate: FAILED');
    expect(html).toContain('2 new serious violations on 1 page (1.4.3)');
    expect(html).toContain('1 page removed since base');
  });

  it('groups new findings by templateKey with an instance count, never a raw list', () => {
    const findings = [
      finding({ fingerprint: 'f1', groupKey: 'g1', templateKey: 't1', selector: '.card:nth-child(1) a' }),
      finding({ fingerprint: 'f2', groupKey: 'g2', templateKey: 't1', selector: '.card:nth-child(2) a' }),
    ];
    const html = renderDiffHtml(diffResult({ findings: { ...diffResult().findings, new: findings } }));
    expect(html).toContain('New (1 template, 2 instances)');
    expect(html).toContain('.card:nth-child(1) a');
    expect(html).toContain('.card:nth-child(2) a');
  });

  it('renders fixed findings in their own section', () => {
    const html = renderDiffHtml(diffResult({ findings: { ...diffResult().findings, fixed: [finding({ ruleId: 'image-alt' })] } }));
    expect(html).toContain('Fixed (1 template, 1 instance)');
    expect(html).toContain('image-alt');
  });

  it('renders moved pairs, showing the context change from -> to', () => {
    const p = pair(
      { identity: { value: 'x', ordinal: 0, context: { nearestLandmark: 'navigation', headingContext: 'none', inFrame: [] }, domDepth: 3 } },
      { identity: { value: 'x', ordinal: 0, context: { nearestLandmark: 'main', headingContext: 'none', inFrame: [] }, domDepth: 3 } },
    );
    const html = renderDiffHtml(diffResult({ findings: { ...diffResult().findings, moved: [p] } }));
    expect(html).toContain('Moved (1 template, 1 instance)');
    expect(html).toContain('navigation');
    expect(html).toContain('main');
  });

  it('renders impact-changed pairs, showing the impact change from -> to', () => {
    const p = pair({ impact: 'moderate' }, { impact: 'critical' });
    const html = renderDiffHtml(diffResult({ findings: { ...diffResult().findings, impactChanged: [p] } }));
    expect(html).toContain('Impact changed (1 template, 1 instance)');
    expect(html).toContain('impact moderate');
    expect(html).toContain('critical');
  });

  it('summarises persisting findings as a count, not an expandable list', () => {
    const html = renderDiffHtml(
      diffResult({ findings: { ...diffResult().findings, persisting: [finding({ templateKey: 't1' }), finding({ templateKey: 't1', fingerprint: 'f2' })] } }),
    );
    expect(html).toContain('2 instances across 1 template');
    expect(html).not.toContain('class="template"');
  });

  it('never folds unclassified findings into "new"', () => {
    const html = renderDiffHtml(diffResult({ findings: { ...diffResult().findings, unclassified: [finding({ ruleId: 'link-name' })] } }));
    expect(html).toContain('Unclassified (1)');
    expect(html).toContain('link-name');
    expect(html).not.toContain('New (');
  });

  it('surfaces unknown findings (page added/removed/errored) rather than dropping them', () => {
    const html = renderDiffHtml(
      diffResult({
        findings: {
          ...diffResult().findings,
          unknown: [{ reason: 'page-removed', finding: finding({ ruleId: 'color-contrast' }) }],
        },
      }),
    );
    expect(html).toContain('Unknown (1)');
    expect(html).toContain('page-removed');
    expect(html).toContain('color-contrast');
  });

  it('escapes dynamic content from the underlying findings', () => {
    const html = renderDiffHtml(
      diffResult({ findings: { ...diffResult().findings, new: [finding({ selector: '<img>', accessibleName: '<script>alert(1)</script>' })] } }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('reports no changes cleanly when every bucket is empty', () => {
    const html = renderDiffHtml(diffResult());
    expect(html).toContain('No page-set or finding changes between these two runs.');
  });
});
