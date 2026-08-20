/**
 * `settle()`'s fonts-ready cap (`DECISIONS.md` D54): `document.fonts.ready`
 * was unbounded until Day 8 - a page whose one `@font-face` source never
 * responds hung it forever, and everything after it. Bounded the same way
 * the image-decode and mutation-quiet steps already were.
 */

import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { scan } from '../../src/index.js';
import { settle } from '../../src/scan/settle.js';
import { pageUrl, start, stop } from '../fixtures/server.js';
import type { SettleSettings } from '../../src/types.js';

const BASE_SETTLE: SettleSettings = {
  strategy: 'default',
  quietMs: 150,
  quietCapMs: 2000,
  fontsReadyCapMs: 300,
  imageDecodeCapMs: 1500,
};

describe('settle() fonts-ready cap', () => {
  let browser: Browser;

  beforeAll(async () => {
    await start();
    browser = await chromium.launch();
  }, 30_000);

  afterAll(async () => {
    await browser.close();
    await stop();
  });

  it('reports fontsReadyCapHit when the one @font-face source never responds', async () => {
    const page = await browser.newPage();
    try {
      const result = await settle(page, pageUrl('settle-degraded'), BASE_SETTLE);
      expect(result.fontsReadyCapHit).toBe(true);
      // The cap firing must not have blocked the rest of the contract.
      expect(result.durationMs).toBeLessThan(5000);
    } finally {
      await page.close();
    }
  }, 20_000);

  it('does not report fontsReadyCapHit on an ordinary page', async () => {
    const page = await browser.newPage();
    try {
      const result = await settle(page, pageUrl('10-clean'), BASE_SETTLE);
      expect(result.fontsReadyCapHit).toBe(false);
    } finally {
      await page.close();
    }
  }, 20_000);

  it('surfaces as Report.pages[].settleDegraded through a full scan()', async () => {
    const degraded = await scan({
      seed: { url: pageUrl('settle-degraded') },
      settle: { fontsReadyCapMs: 300 },
    });
    expect(degraded.pages).toHaveLength(1);
    expect(degraded.pages[0]?.settleDegraded).toBe(true);

    const clean = await scan({ seed: { url: pageUrl('10-clean') } });
    expect(clean.pages[0]?.settleDegraded).toBe(false);
  }, 30_000);
});
