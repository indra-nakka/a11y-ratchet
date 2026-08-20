/**
 * `report/json.ts` - no dedicated test existed before Day 13, despite
 * being the load-bearing baseline read/write path (`01 §11`). Added while
 * fixing the "malformed baseline" error path: `readReport` validated
 * `schemaVersion` but not the rest of the shape, so a truncated or
 * hand-edited file that still claimed `schemaVersion: "1.3"` passed
 * through and failed later with a raw `TypeError`, not a clear message.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { A11yRatchetError } from '../../src/errors.js';
import { readReport, toStableJson, writeReport } from '../../src/report/json.js';
import type { Report } from '../../src/types.js';

function minimalReport(overrides: Partial<Report> = {}): Report {
  return {
    schemaVersion: '1.3',
    tool: { name: 'a11y-ratchet', version: '0.1.0', axeCoreVersion: '4.13.0', playwrightVersion: '1.62.1', browser: 'chromium', browserVersion: '140.0' },
    run: {
      id: 'run-1', startedAt: '2026-08-21T00:00:00.000Z', durationMs: 100, configHash: 'abc', baseUrl: 'https://example.com',
      mode: 'ci', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC',
      colorScheme: 'light', reducedMotion: 'reduce', blockedOrigins: [], concurrency: 3,
      settle: { strategy: 'default', quietMs: 150, quietCapMs: 2000, fontsReadyCapMs: 3000, imageDecodeCapMs: 1500 },
      probesEnabled: [], bypassCSP: false,
    },
    pages: [],
    findings: [],
    groups: {},
    templateGroups: {},
    summary: {
      pages: { total: 0, scanned: 0, errored: 0 },
      findings: {
        total: 0, violation: 0, needsReview: 0, bestPractice: 0, suppressed: 0,
        bySource: { axe: 0, probe: 0 }, byImpact: { minor: 0, moderate: 0, serious: 0, critical: 0 },
        byCriterion: {}, byLevel: { A: 0, AA: 0, AAA: 0 }, byRule: {}, byTier: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      },
      groups: 0, templateGroups: 0, probeBlindRegions: 0,
    },
    ...overrides,
  };
}

describe('readReport / writeReport / toStableJson', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'a11y-ratchet-json-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('round-trips a report through writeReport/readReport unchanged', async () => {
    const path = join(dir, 'report.json');
    const report = minimalReport();
    await writeReport(report, path);
    const read = await readReport(path);
    expect(read).toEqual(report);
  });

  async function expectA11yRatchetError(promise: Promise<unknown>, exitCode: number, messageContains: string): Promise<void> {
    try {
      await promise;
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(A11yRatchetError);
      expect((error as A11yRatchetError).exitCode).toBe(exitCode);
      expect((error as A11yRatchetError).message).toContain(messageContains);
    }
  }

  it('exit 3 with a clear message when the file does not exist', async () => {
    await expectA11yRatchetError(readReport(join(dir, 'missing.json')), 3, 'Could not read report');
  });

  it('exit 3 with a clear message when the file is not valid JSON', async () => {
    const path = join(dir, 'bad.json');
    await writeFile(path, 'not json', 'utf8');
    await expectA11yRatchetError(readReport(path), 3, 'not valid JSON');
  });

  it('exit 3 with a clear message when schemaVersion is missing or wrong', async () => {
    const path = join(dir, 'wrong-version.json');
    await writeFile(path, JSON.stringify({ schemaVersion: '1.0' }), 'utf8');
    await expectA11yRatchetError(readReport(path), 3, 'schemaVersion');
  });

  it('exit 3 naming the missing fields when schemaVersion is right but the report is truncated', async () => {
    const path = join(dir, 'truncated.json');
    await writeFile(path, JSON.stringify({ schemaVersion: '1.3', findings: [] }), 'utf8');
    try {
      await readReport(path);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(A11yRatchetError);
      expect((error as A11yRatchetError).exitCode).toBe(3);
      expect((error as A11yRatchetError).message).toContain('tool');
      expect((error as A11yRatchetError).message).toContain('run');
      expect((error as A11yRatchetError).message).toContain('truncated or hand-edited');
    }
  });

  it('accepts a structurally complete report even with unfamiliar extra fields', async () => {
    const path = join(dir, 'extra-fields.json');
    await writeFile(path, JSON.stringify({ ...minimalReport(), somethingFutureVersionAdded: true }), 'utf8');
    await expect(readReport(path)).resolves.toMatchObject({ schemaVersion: '1.3' });
  });

  it('toStableJson sorts object keys alphabetically so a committed baseline diffs cleanly', () => {
    const json = toStableJson(minimalReport());
    const toolIndex = json.indexOf('"tool"');
    const schemaVersionIndex = json.indexOf('"schemaVersion"');
    const runIndex = json.indexOf('"run"');
    // Alphabetical: pages < run < schemaVersion < tool (top level).
    expect(schemaVersionIndex).toBeLessThan(toolIndex);
    expect(runIndex).toBeLessThan(schemaVersionIndex);
  });

  it('toStableJson leaves array order untouched - it is meaningful (crawl/document order)', () => {
    const report = minimalReport({ pages: [] });
    const findingsOrder = ['z-finding', 'a-finding'];
    // Array order must survive even though it's not alphabetical.
    const json = toStableJson({ ...report, run: { ...report.run, probesEnabled: findingsOrder } });
    const zIndex = json.indexOf('"z-finding"');
    const aIndex = json.indexOf('"a-finding"');
    expect(zIndex).toBeLessThan(aIndex);
  });
});
