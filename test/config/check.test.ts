/**
 * `config/check.ts` (`runCheckConfig`, exposed as `checkConfig()` in
 * `index.ts`): expired suppressions (fail the check), suppressions expiring
 * within 30 days (warn), stale suppressions that match nothing in a given
 * `--against` report (warn), and staleness being explicitly skipped-and-
 * noted rather than silently passed when no report is given.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runCheckConfig } from '../../src/config/check.js';
import { exitCodeForConfigCheck } from '../../src/index.js';
import type { Finding, Report } from '../../src/types.js';

const NOW = new Date('2026-08-20T00:00:00Z');

function suppressionConfig(entries: Record<string, unknown>[]): string {
  return JSON.stringify({ suppressions: entries });
}

function baseEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'entry-1',
    rule: 'color-contrast',
    reason: 'test reason',
    category: 'accepted-risk',
    owner: '@owner',
    expires: '2099-01-01',
    ...overrides,
  };
}

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

function reportWith(findings: Finding[]): Report {
  return {
    schemaVersion: '1.3',
    tool: { name: 'a11y-ratchet', version: '0.1.0', axeCoreVersion: '4.13.0', playwrightVersion: '1.62.1', browser: 'chromium', browserVersion: '140.0' },
    run: {
      id: 'run-1', startedAt: NOW.toISOString(), durationMs: 100, configHash: 'abc', baseUrl: 'https://example.com',
      mode: 'ci', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC',
      colorScheme: 'light', reducedMotion: 'reduce', blockedOrigins: [], concurrency: 3,
      settle: { strategy: 'default', quietMs: 150, quietCapMs: 2000, fontsReadyCapMs: 3000, imageDecodeCapMs: 1500 },
      probesEnabled: [],
      bypassCSP: false,
    },
    pages: [],
    findings,
    groups: {},
    templateGroups: {},
    summary: {
      pages: { total: 0, scanned: 0, errored: 0 },
      findings: { total: findings.length, violation: findings.length, needsReview: 0, bestPractice: 0, suppressed: 0, bySource: { axe: findings.length, probe: 0 }, byImpact: { minor: 0, moderate: 0, serious: findings.length, critical: 0 }, byCriterion: {}, byLevel: { A: 0, AA: 0, AAA: 0 }, byRule: {}, byTier: { 1: findings.length, 2: 0, 3: 0, 4: 0, 5: 0 } },
      groups: 0,
      templateGroups: 0,
      probeBlindRegions: 0,
    },
  };
}

describe('runCheckConfig', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'a11y-ratchet-check-config-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeConfig(entries: Record<string, unknown>[]): Promise<string> {
    const path = join(dir, 'config.json');
    await writeFile(path, suppressionConfig(entries));
    return path;
  }

  it('is valid with no expired/stale/warnings for a config with no suppressions', async () => {
    const path = await writeConfig([]);
    const result = await runCheckConfig(path, undefined, NOW);
    expect(result).toEqual({ valid: true, errors: [], warnings: [], expired: [], stale: [] });
    expect(exitCodeForConfigCheck(result)).toBe(0);
  });

  it('reports an expired suppression and fails the check (exit 2)', async () => {
    const path = await writeConfig([baseEntry({ id: 'expired-one', expires: '2020-01-01' })]);
    const result = await runCheckConfig(path, undefined, NOW);
    expect(result.valid).toBe(true); // schema was fine - "invalid" is a distinct concept from "expired"
    expect(result.expired).toHaveLength(1);
    expect(result.expired[0]?.ruleRef).toBe('expired-one');
    expect(exitCodeForConfigCheck(result)).toBe(2);
  });

  it('warns (does not fail) on a suppression expiring within 30 days', async () => {
    const path = await writeConfig([baseEntry({ id: 'expiring-soon', expires: '2026-09-01' })]); // 12 days out
    const result = await runCheckConfig(path, undefined, NOW);
    expect(result.expired).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('expiring-soon'))).toBe(true);
    expect(exitCodeForConfigCheck(result)).toBe(0);
  });

  it('does not warn about a suppression expiring more than 30 days out', async () => {
    const path = await writeConfig([baseEntry({ id: 'far-out', expires: '2027-01-01' })]);
    const report = reportWith([finding({ ruleId: 'color-contrast' })]); // matches, so no stale warning either
    const result = await runCheckConfig(path, report, NOW);
    expect(result.warnings).toEqual([]);
  });

  it('reports a stale suppression (matches nothing in --against) as a warning, not expired', async () => {
    const path = await writeConfig([baseEntry({ id: 'stale-one', rule: 'image-alt' })]);
    const report = reportWith([finding({ ruleId: 'color-contrast' })]); // no image-alt finding anywhere
    const result = await runCheckConfig(path, report, NOW);
    expect(result.stale).toHaveLength(1);
    expect(result.stale[0]?.ruleRef).toBe('stale-one');
    expect(result.expired).toEqual([]);
    expect(exitCodeForConfigCheck(result)).toBe(0); // stale warns, never gates
  });

  it('does not report a suppression as stale when it matches a finding in --against', async () => {
    const path = await writeConfig([baseEntry({ id: 'still-matches', rule: 'color-contrast' })]);
    const report = reportWith([finding({ ruleId: 'color-contrast' })]);
    const result = await runCheckConfig(path, report, NOW);
    expect(result.stale).toEqual([]);
  });

  it('skips staleness and warns about it when suppressions exist but no --against report is given', async () => {
    const path = await writeConfig([baseEntry()]);
    const result = await runCheckConfig(path, undefined, NOW);
    expect(result.stale).toEqual([]);
    expect(result.warnings.some((w) => w.includes('--against'))).toBe(true);
  });

  it('does not warn about missing --against when there are no suppressions to check', async () => {
    const path = await writeConfig([]);
    const result = await runCheckConfig(path, undefined, NOW);
    expect(result.warnings).toEqual([]);
  });

  it('reports valid: false with a useful message for a schema-invalid config, without throwing', async () => {
    const path = join(dir, 'bad.json');
    await writeFile(path, suppressionConfig([{ id: 'x', rule: 'color-contrast' }])); // missing reason/category/owner/expires
    const result = await runCheckConfig(path, undefined, NOW);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('reason');
    expect(exitCodeForConfigCheck(result)).toBe(2);
  });
});
