/**
 * CSP-blocked axe-core injection (`DECISIONS.md` D65, fixed for real Day
 * 13): without `--bypass-csp`, a strict `script-src` blocks the injected
 * `<script>` tag on the main frame, previously misclassified as a generic
 * `navigation-failed`. Now `axe-injection-failed`, with a message pointing
 * at the fix.
 */

import { describe, expect, it } from 'vitest';

import { scan } from '../../src/index.js';
import { pageUrl, start, stop } from '../fixtures/server.js';

describe('a strict script-src CSP blocking axe-core injection', () => {
  it('is classified as axe-injection-failed, not navigation-failed, with a --bypass-csp pointer', async () => {
    await start();
    try {
      const report = await scan({ seed: { url: pageUrl('11-strict-csp') } });
      const error = report.pages[0]?.error;
      expect(error?.kind).toBe('axe-injection-failed');
      expect(error?.message).toContain('--bypass-csp');
      expect(report.findings).toEqual([]);
    } finally {
      await stop();
    }
  }, 30_000);

  it('scans cleanly with --bypass-csp set, no page error', async () => {
    await start();
    try {
      const report = await scan({ seed: { url: pageUrl('11-strict-csp') }, bypassCSP: true });
      expect(report.pages[0]?.error).toBeUndefined();
      expect(report.run.bypassCSP).toBe(true);
    } finally {
      await stop();
    }
  }, 30_000);
});
