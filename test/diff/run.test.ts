import { describe, expect, it } from 'vitest';

import { A11yRatchetError } from '../../src/errors.js';
import { runDiff } from '../../src/diff/run.js';
import type { Finding, PageResult, Report, RunInfo, ToolInfo } from '../../src/types.js';

const TOOL: ToolInfo = {
  name: 'a11y-ratchet',
  version: '0.1.0',
  axeCoreVersion: '4.13.0',
  playwrightVersion: '1.62.1',
  browser: 'chromium',
  browserVersion: '140.0',
};

const RUN: RunInfo = {
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
};

function page(url: string, overrides: Partial<PageResult> = {}): PageResult {
  return {
    url,
    urlTemplate: url,
    depth: 0,
    startedAt: '2026-08-20T00:00:00.000Z',
    durationMs: 100,
    probesRun: false,
    probeBlindRegions: [],
    counts: { violation: 0, needsReview: 0, bestPractice: 0, suppressed: 0 },
    settleDegraded: false,
    ...overrides,
  };
}

function finding(url: string, overrides: Partial<Finding> = {}): Finding {
  return {
    fingerprint: 'aaaaaaaaaaaaaaaa',
    groupKey: 'bbbbbbbbbbbbbbbb',
    identityTier: 1,
    identity: { value: 'x', ordinal: 0, context: { nearestLandmark: 'main', headingContext: 'none', inFrame: [] }, domDepth: 5 },
    source: 'axe',
    ruleId: 'image-alt',
    bucket: 'violation',
    bestPractice: false,
    impact: 'serious',
    criteria: [],
    tags: [],
    url,
    urlTemplate: url,
    selector: '#x',
    html: '<img id="x">',
    remediation: '',
    ...overrides,
  };
}

function report(overrides: {
  pages: PageResult[];
  findings: Finding[];
  tool?: Partial<ToolInfo>;
  run?: Partial<RunInfo>;
}): Report {
  return {
    schemaVersion: '1.2',
    tool: { ...TOOL, ...overrides.tool },
    run: { ...RUN, ...overrides.run },
    pages: overrides.pages,
    findings: overrides.findings,
    groups: {},
    summary: {
      pages: { total: overrides.pages.length, scanned: overrides.pages.length, errored: 0 },
      findings: {
        total: overrides.findings.length,
        violation: overrides.findings.length,
        needsReview: 0,
        bestPractice: 0,
        suppressed: 0,
        bySource: { axe: overrides.findings.length, probe: 0 },
        byImpact: { minor: 0, moderate: 0, serious: overrides.findings.length, critical: 0 },
        byCriterion: {},
        byLevel: { A: 0, AA: 0, AAA: 0 },
        byRule: {},
        byTier: { 1: overrides.findings.length, 2: 0, 3: 0, 4: 0, 5: 0 },
      },
      groups: 0,
      probeBlindRegions: 0,
    },
  };
}

describe('runDiff — engine drift and incompatible run config', () => {
  it('refuses (exit 4) on axe-core version drift by default', () => {
    const base = report({ pages: [], findings: [], tool: { axeCoreVersion: '4.12.0' } });
    const head = report({ pages: [], findings: [] });
    try {
      runDiff(base, head);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(A11yRatchetError);
      expect((error as A11yRatchetError).exitCode).toBe(4);
    }
  });

  it('proceeds on engine drift when allowEngineDrift is set, and reports it', () => {
    const base = report({ pages: [], findings: [], tool: { axeCoreVersion: '4.12.0' } });
    const head = report({ pages: [], findings: [] });
    const result = runDiff(base, head, { allowEngineDrift: true });
    expect(result.engineDrift).toBe(true);
  });

  it('refuses (exit 6) on mode mismatch, with no override', () => {
    const base = report({ pages: [], findings: [], run: { mode: 'ci' } });
    const head = report({ pages: [], findings: [], run: { mode: 'audit' } });
    try {
      runDiff(base, head, { allowEngineDrift: true });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(A11yRatchetError);
      expect((error as A11yRatchetError).exitCode).toBe(6);
    }
  });

  it('refuses (exit 6) on viewport/locale/colorScheme mismatch', () => {
    const base = report({ pages: [], findings: [], run: { colorScheme: 'light' } });
    const head = report({ pages: [], findings: [], run: { colorScheme: 'dark' } });
    expect(() => runDiff(base, head)).toThrow(A11yRatchetError);
  });
});

describe('runDiff — page-set partitioning (§7)', () => {
  it('a page missing from head classifies its findings as unknown page-removed, never fixed', () => {
    const base = report({ pages: [page('https://example.com/pricing')], findings: [finding('https://example.com/pricing')] });
    const head = report({ pages: [], findings: [] });
    const result = runDiff(base, head);
    expect(result.findings.fixed).toHaveLength(0);
    expect(result.findings.unknown).toHaveLength(1);
    expect(result.findings.unknown[0]!.reason).toBe('page-removed');
    expect(result.pages.onlyInBase).toEqual(['https://example.com/pricing']);
  });

  it('a page only in head classifies its findings as unknown page-added, never new', () => {
    const base = report({ pages: [], findings: [] });
    const head = report({ pages: [page('https://example.com/new-page')], findings: [finding('https://example.com/new-page')] });
    const result = runDiff(base, head);
    expect(result.findings.new).toHaveLength(0);
    expect(result.findings.unknown).toHaveLength(1);
    expect(result.findings.unknown[0]!.reason).toBe('page-added');
    expect(result.pages.onlyInHead).toEqual(['https://example.com/new-page']);
  });

  it('a page that errored in one run routes the other side\'s findings to unknown page-error', () => {
    const url = 'https://example.com/flaky';
    const base = report({ pages: [page(url, { error: { kind: 'navigation-timeout', message: 'timed out' } })], findings: [] });
    const head = report({ pages: [page(url)], findings: [finding(url)] });
    const result = runDiff(base, head);
    expect(result.findings.new).toHaveLength(0);
    expect(result.findings.fixed).toHaveLength(0);
    expect(result.findings.unknown).toHaveLength(1);
    expect(result.findings.unknown[0]!.reason).toBe('page-error');
    expect(result.pages.errored).toEqual([url]);
  });

  it('a page in both, unerrored, is diffed normally', () => {
    const url = 'https://example.com/page';
    const base = report({ pages: [page(url)], findings: [finding(url, { fingerprint: 'same' })] });
    const head = report({ pages: [page(url)], findings: [finding(url, { fingerprint: 'same' })] });
    const result = runDiff(base, head);
    expect(result.pages.inBoth).toBe(1);
    expect(result.findings.persisting).toHaveLength(1);
  });
});

describe('runDiff — new/fixed/persisting end to end', () => {
  const url = 'https://example.com/page';

  it('an unmatched head finding is new; an unmatched base finding is fixed', () => {
    const base = report({ pages: [page(url)], findings: [finding(url, { fingerprint: 'base-only', ruleId: 'image-alt' })] });
    const head = report({ pages: [page(url)], findings: [finding(url, { fingerprint: 'head-only', ruleId: 'link-name' })] });
    const result = runDiff(base, head);
    expect(result.findings.new).toHaveLength(1);
    expect(result.findings.fixed).toHaveLength(1);
    expect(result.gate.passed).toBe(false);
  });

  it('exactOnly degrades an unmatched head finding to unclassified, never new (00 §9 safe degradation)', () => {
    const base = report({
      pages: [page(url)],
      findings: [finding(url, { fingerprint: 'base-fp', accessibleName: 'Contact', identity: { value: 'a', ordinal: 0, context: { nearestLandmark: 'main', headingContext: 'none', inFrame: [] }, domDepth: 3 } })],
    });
    const head = report({
      pages: [page(url)],
      findings: [finding(url, { fingerprint: 'head-fp', accessibleName: 'Contact', identity: { value: 'b', ordinal: 0, context: { nearestLandmark: 'main', headingContext: 'none', inFrame: [] }, domDepth: 3 } })],
    });
    const result = runDiff(base, head, { exactOnly: true });
    expect(result.findings.new).toHaveLength(0);
    expect(result.findings.unclassified).toHaveLength(1);
    // Fuzzy matching WOULD have paired these (same rule/name/context) - the
    // point of the test is that exactOnly suppresses that entirely.
    expect(result.findings.moved).toHaveLength(0);
  });
});
