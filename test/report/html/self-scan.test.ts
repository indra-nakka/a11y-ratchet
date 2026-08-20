/**
 * The Self-test layer (`03-EVIDENCE.md §2.3`): scan the generated HTML
 * report, assert zero violations. "The report's own accessibility" is
 * never cut (`00 §7`) - checked here against a real, non-trivial report
 * (real findings, a real suppression, a real probe-blind region), not a
 * synthetic empty one that would pass by having nothing to render.
 *
 * Full self-test enforcement (a CI gate on every release) is Day 11's job;
 * this is Day 10 verifying honestly, not deferring the check itself.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { renderReport, scan } from '../../../src/index.js';
import { pageUrl, start, stop } from '../../fixtures/server.js';

describe('the generated HTML report passes its own scan', () => {
  let tmpDir: string;
  let reportPath: string;

  beforeAll(async () => {
    await start();

    // A real scan with real findings (01-images has planted defects) and a
    // real suppression, so the report actually renders every section this
    // test needs to check - the suppressed table, the findings tree, not
    // just an empty-report shell that would trivially pass.
    tmpDir = await mkdtemp(join(tmpdir(), 'a11y-ratchet-self-scan-'));
    const configPath = join(tmpDir, 'a11y-ratchet.config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        suppressions: [
          {
            id: 'self-scan-demo-suppression',
            rule: 'image-alt',
            reason: 'Demonstrating the suppressed section for the report self-test.',
            category: 'accepted-risk',
            owner: '@self-scan-test',
            expires: '2099-01-01',
          },
        ],
      }),
    );

    const report = await scan({ seed: { url: pageUrl('01-images') }, configPath });
    expect(report.findings.length, 'fixture must produce findings for this test to mean anything').toBeGreaterThan(0);
    expect(report.findings.some((f) => f.suppressed), 'the suppression must actually match something').toBe(true);

    const html = await renderReport(report, { format: 'html' });
    reportPath = join(tmpDir, 'report.html');
    await writeFile(reportPath, html, 'utf8');
  }, 30_000);

  afterAll(async () => {
    await stop();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('scans clean: zero violations, zero best-practice findings', async () => {
    const fileUrl = pathToFileURL(reportPath).href;
    const selfScan = await scan({ seed: { url: fileUrl }, probes: [] });

    expect(selfScan.pages[0]?.error, 'the report file itself must load without error').toBeUndefined();

    const violations = selfScan.findings.filter((f) => f.bucket === 'violation' && !f.bestPractice);
    if (violations.length > 0) {
      const detail = violations.map((f) => `${f.ruleId} — ${f.selector} — ${f.remediation}`).join('\n');
      expect(violations, `report/html/render.ts produced inaccessible markup:\n${detail}`).toEqual([]);
    }

    const bestPractice = selfScan.findings.filter((f) => f.bestPractice);
    expect(bestPractice, 'best-practice findings too, even though they never gate').toEqual([]);
  }, 30_000);
});
