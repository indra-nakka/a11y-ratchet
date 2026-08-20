/**
 * `baseline/lifecycle.ts` (`01 §11`): `update` prunes fixed entries and
 * refuses without a prior baseline (that's `regenerate`'s job) and on
 * engine drift (same as `diff`); `regenerate` overwrites unconditionally,
 * even with nothing there yet; `check` never writes and returns the same
 * `DiffResult` shape `diff` does.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkBaseline, regenerateBaseline, updateBaseline } from '../../src/baseline/lifecycle.js';
import { readReport, writeReport } from '../../src/report/json.js';
import { A11yRatchetError } from '../../src/errors.js';
import type { Finding, Report } from '../../src/types.js';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    fingerprint: 'aaaaaaaaaaaaaaaa',
    groupKey: 'bbbbbbbbbbbbbbbb',
    templateKey: 'cccccccccccccccc',
    identityTier: 1,
    identity: { value: 'x', ordinal: 0, context: { nearestLandmark: 'main', headingContext: 'none', inFrame: [] }, domDepth: 3 },
    source: 'axe',
    ruleId: 'color-contrast',
    bucket: 'violation',
    bestPractice: false,
    impact: 'serious',
    criteria: [],
    tags: [],
    url: 'https://example.com/page',
    urlTemplate: '/page',
    selector: '#x',
    html: '<div id="x"></div>',
    remediation: '',
    ...overrides,
  };
}

function reportWith(findings: Finding[], overrides: { axeCoreVersion?: string } = {}): Report {
  return {
    schemaVersion: '1.3',
    tool: {
      name: 'a11y-ratchet', version: '0.1.0', axeCoreVersion: overrides.axeCoreVersion ?? '4.13.0',
      playwrightVersion: '1.62.1', browser: 'chromium', browserVersion: '140.0',
    },
    run: {
      id: 'run-1', startedAt: '2026-08-20T00:00:00.000Z', durationMs: 100, configHash: 'abc', baseUrl: 'https://example.com',
      mode: 'ci', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC',
      colorScheme: 'light', reducedMotion: 'reduce', blockedOrigins: [], concurrency: 3,
      settle: { strategy: 'default', quietMs: 150, quietCapMs: 2000, fontsReadyCapMs: 3000, imageDecodeCapMs: 1500 },
      probesEnabled: [],
      bypassCSP: false,
    },
    pages: [
      { url: 'https://example.com/page', urlTemplate: '/page', depth: 0, startedAt: '2026-08-20T00:00:00.000Z', durationMs: 100, probesRun: false, probeBlindRegions: [], counts: { violation: findings.length, needsReview: 0, bestPractice: 0, suppressed: 0 }, settleDegraded: false },
    ],
    findings,
    groups: {},
    templateGroups: {},
    summary: {
      pages: { total: 1, scanned: 1, errored: 0 },
      findings: { total: findings.length, violation: findings.length, needsReview: 0, bestPractice: 0, suppressed: 0, bySource: { axe: findings.length, probe: 0 }, byImpact: { minor: 0, moderate: 0, serious: findings.length, critical: 0 }, byCriterion: {}, byLevel: { A: 0, AA: 0, AAA: 0 }, byRule: {}, byTier: { 1: findings.length, 2: 0, 3: 0, 4: 0, 5: 0 } },
      groups: 0,
      templateGroups: 0,
      probeBlindRegions: 0,
    },
  };
}

describe('baseline lifecycle', () => {
  let dir: string;
  let baselinePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'a11y-ratchet-baseline-test-'));
    baselinePath = join(dir, 'baseline.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('regenerateBaseline', () => {
    it('writes the report as the baseline even when nothing existed before', async () => {
      const report = reportWith([finding()]);
      await regenerateBaseline(report, baselinePath);
      const written = await readReport(baselinePath);
      expect(written.findings).toHaveLength(1);
    });

    it('overwrites unconditionally, even across an axe-core version bump', async () => {
      await writeReport(reportWith([finding({ fingerprint: 'old00000000000' })], { axeCoreVersion: '4.12.0' }), baselinePath);
      const bumped = reportWith([finding({ fingerprint: 'new00000000000' })], { axeCoreVersion: '4.13.0' });
      await regenerateBaseline(bumped, baselinePath);
      const written = await readReport(baselinePath);
      expect(written.findings[0]?.fingerprint).toBe('new00000000000');
      expect(written.tool.axeCoreVersion).toBe('4.13.0');
    });
  });

  describe('updateBaseline', () => {
    it('refuses when there is no existing baseline, naming regenerate as the fix', async () => {
      await expect(updateBaseline(reportWith([finding()]), baselinePath)).rejects.toMatchObject({ exitCode: 3 });
      await expect(updateBaseline(reportWith([finding()]), baselinePath)).rejects.toThrow('regenerate');
    });

    it('prunes a fixed finding: the new baseline reflects only what the fresh report still has', async () => {
      const existing = reportWith([finding({ fingerprint: 'still-here00000' }), finding({ fingerprint: 'now-fixed000000' })]);
      await writeReport(existing, baselinePath);

      const fresh = reportWith([finding({ fingerprint: 'still-here00000' })]); // "now-fixed" no longer occurs
      await updateBaseline(fresh, baselinePath);

      const written = await readReport(baselinePath);
      expect(written.findings.map((f) => f.fingerprint)).toEqual(['still-here00000']);
    });

    it('refuses on engine drift, same as diff()', async () => {
      await writeReport(reportWith([finding()], { axeCoreVersion: '4.12.0' }), baselinePath);
      const bumped = reportWith([finding()], { axeCoreVersion: '4.13.0' });
      await expect(updateBaseline(bumped, baselinePath)).rejects.toBeInstanceOf(A11yRatchetError);
      await expect(updateBaseline(bumped, baselinePath)).rejects.toMatchObject({ exitCode: 4 });
    });
  });

  describe('checkBaseline', () => {
    it('refuses when there is no existing baseline, naming regenerate as the fix', async () => {
      await expect(checkBaseline(reportWith([finding()]), baselinePath)).rejects.toMatchObject({ exitCode: 3 });
      await expect(checkBaseline(reportWith([finding()]), baselinePath)).rejects.toThrow('regenerate');
    });

    it('never writes to the baseline file', async () => {
      await writeReport(reportWith([finding({ fingerprint: 'baseline-side00' })]), baselinePath);
      const before = await readReport(baselinePath);

      await checkBaseline(reportWith([finding({ fingerprint: 'different-one00' })]), baselinePath);

      const after = await readReport(baselinePath);
      expect(after).toEqual(before);
    });

    it('reports drift as a failing gate when a new violation appears', async () => {
      await writeReport(reportWith([]), baselinePath);
      const result = await checkBaseline(reportWith([finding()]), baselinePath);
      expect(result.gate.passed).toBe(false);
      expect(result.findings.new).toHaveLength(1);
    });

    it('passes when the fresh report matches the baseline', async () => {
      const report = reportWith([finding()]);
      await writeReport(report, baselinePath);
      const result = await checkBaseline(report, baselinePath);
      expect(result.gate.passed).toBe(true);
    });
  });
});
