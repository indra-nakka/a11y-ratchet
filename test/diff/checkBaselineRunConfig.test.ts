/**
 * `checkBaselineRunConfig()` (`01 §11`, Day 13) - the same comparison
 * `runDiff()` makes unconditionally after a real head scan (exit 6, no
 * override), exposed as a pre-scan fast path. Wired to
 * `baseline check-run-config` (`src/cli/commands/baseline.ts`) and to the
 * Action's pre-flight step.
 */

import { describe, expect, it } from 'vitest';

import { checkBaselineRunConfig } from '../../src/diff/run.js';
import type { PageResult, Report, RunInfo, ToolInfo } from '../../src/types.js';

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
  bypassCSP: false,
};

function baseline(runOverrides: Partial<RunInfo> = {}, pages: PageResult[] = []): Report {
  return {
    schemaVersion: '1.3',
    tool: TOOL,
    run: { ...RUN, ...runOverrides },
    pages,
    findings: [],
    groups: {},
    templateGroups: {},
    summary: {
      pages: { total: pages.length, scanned: pages.length, errored: 0 },
      findings: {
        total: 0,
        violation: 0,
        needsReview: 0,
        bestPractice: 0,
        suppressed: 0,
        bySource: { axe: 0, probe: 0 },
        byImpact: { minor: 0, moderate: 0, serious: 0, critical: 0 },
        byCriterion: {},
        byLevel: { A: 0, AA: 0, AAA: 0 },
        byRule: {},
        byTier: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      },
      groups: 0,
      templateGroups: 0,
      probeBlindRegions: 0,
    },
  };
}

describe('checkBaselineRunConfig', () => {
  it('reports no mismatches when the candidate matches the baseline exactly', () => {
    const result = checkBaselineRunConfig(baseline(), { mode: 'ci', viewport: { width: 1280, height: 800 }, locale: 'en-US', colorScheme: 'light', bypassCSP: false });
    expect(result).toEqual([]);
  });

  it('defaults omitted candidate fields to this project\'s own scan defaults, not to whatever the baseline happens to be', () => {
    // Baseline generated at the default settings; candidate specifies only
    // mode - viewport/locale/colorScheme/bypassCSP should default to the
    // same scan defaults the baseline itself used, so no mismatch appears.
    const result = checkBaselineRunConfig(baseline(), { mode: 'ci' });
    expect(result).toEqual([]);
  });

  it('flags a mode mismatch', () => {
    const result = checkBaselineRunConfig(baseline({ mode: 'ci' }), { mode: 'audit' });
    expect(result).toEqual([{ reason: 'mode', base: 'ci', head: 'audit' }]);
  });

  it('flags a viewport mismatch, formatted as WxH', () => {
    const result = checkBaselineRunConfig(baseline({ viewport: { width: 1280, height: 800 } }), {
      mode: 'ci',
      viewport: { width: 375, height: 812 },
    });
    expect(result).toEqual([{ reason: 'viewport', base: '1280x800', head: '375x812' }]);
  });

  it('flags a colorScheme mismatch - the exact scenario D5 exists to catch', () => {
    const result = checkBaselineRunConfig(baseline({ colorScheme: 'light' }), { mode: 'ci', colorScheme: 'dark' });
    expect(result).toEqual([{ reason: 'colorScheme', base: 'light', head: 'dark' }]);
  });

  it('flags a bypassCSP mismatch', () => {
    const result = checkBaselineRunConfig(baseline({ bypassCSP: false }), { mode: 'ci', bypassCSP: true });
    expect(result).toEqual([{ reason: 'bypassCSP', base: 'false', head: 'true' }]);
  });

  it('reports every mismatch at once, not just the first', () => {
    const result = checkBaselineRunConfig(baseline({ mode: 'ci', colorScheme: 'light' }), { mode: 'audit', colorScheme: 'dark' });
    expect(result.map((r) => r.reason).sort()).toEqual(['colorScheme', 'mode']);
  });
});
