/**
 * Day 8's explicit verification: that a suppressed finding still appears in
 * `Report.findings` tagged `suppressed` (`DECISIONS.md` D13), that the
 * matcher pools suppressed findings in with everything else, and — the
 * property D13 exists to guarantee and that had never been tested
 * end-to-end before today — that adding a suppression between two runs
 * does NOT classify the finding as `fixed`.
 *
 * Real `scan()` against the local fixture server, twice: once with no
 * config, once with a config that suppresses one of that page's real
 * findings. Not a synthetic `Finding` object - the actual scan pipeline,
 * the actual config loader, the actual diff.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { diff, scan } from '../../src/index.js';
import { pageUrl, start, stop } from '../fixtures/server.js';

describe('suppression end-to-end (D13)', () => {
  let dir: string;
  let configPath: string;

  beforeAll(async () => {
    await start();
    dir = await mkdtemp(join(tmpdir(), 'a11y-ratchet-suppress-e2e-'));
    configPath = join(dir, 'a11y-ratchet.config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        suppressions: [
          {
            id: 'day8-image-alt-verification',
            rule: 'image-alt',
            reason: 'Verifying D13 end-to-end: a suppression must not read as a fixed finding.',
            category: 'accepted-risk',
            owner: '@day8-test',
            expires: '2099-01-01',
          },
        ],
      }),
    );
  }, 30_000);

  afterAll(async () => {
    await stop();
    await rm(dir, { recursive: true, force: true });
  });

  it('the same finding is suppressed in one run and not the other, and diffing them never classifies it as fixed', async () => {
    const unsuppressed = await scan({ seed: { url: pageUrl('01-images') } });
    const suppressed = await scan({ seed: { url: pageUrl('01-images') }, configPath });

    const before = unsuppressed.findings.find((f) => f.ruleId === 'image-alt');
    const after = suppressed.findings.find((f) => f.ruleId === 'image-alt');
    expect(before, 'fixture must actually produce an image-alt finding for this test to mean anything').toBeDefined();
    expect(after).toBeDefined();

    // Not suppressed without the config.
    expect(before?.suppressed).toBeUndefined();

    // Suppressed WITH the config - tagged, not dropped (CLAUDE.md invariant 2).
    expect(after?.suppressed).toEqual({
      ruleRef: 'day8-image-alt-verification',
      justification: 'Verifying D13 end-to-end: a suppression must not read as a fixed finding.',
      owner: '@day8-test',
      expires: '2099-01-01',
      category: 'accepted-risk',
      expired: false,
    });
    expect(suppressed.findings.some((f) => f.ruleId === 'image-alt')).toBe(true); // still in the pool
    expect(suppressed.pages[0]?.counts.suppressed).toBeGreaterThan(0);

    // THE claim under test: diff(unsuppressed AS base, suppressed AS head).
    const result = diff(unsuppressed, suppressed);

    expect(result.findings.fixed.map((f) => f.ruleId)).not.toContain('image-alt');
    expect(result.findings.new.map((f) => f.ruleId)).not.toContain('image-alt');
    // The matcher pooled it (matched base<->head despite the suppressed tag
    // difference) and classified it as persisting, not moved or unclassified.
    expect(result.findings.persisting.map((f) => f.ruleId)).toContain('image-alt');

    // A previously-gating violation that's now suppressed must not gate.
    expect(result.gate.countedAgainstGate).toBe(0);
    expect(result.gate.passed).toBe(true);
  }, 60_000);
});
