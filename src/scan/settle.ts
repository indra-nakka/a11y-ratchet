/**
 * The readiness contract (`01 §5`). One place, no exceptions.
 *
 * Not `waitForLoadState('networkidle')` — it never fires on sites with
 * polling, websockets, or analytics beacons, and costs seconds per page even
 * when it does fire. Instead:
 *
 *   1. goto(url, { waitUntil: 'domcontentloaded' })
 *   2. await document.fonts.ready               — contrast depends on rendered text
 *   3. await 2 × requestAnimationFrame           — layout + paint settled
 *   4. await in-viewport images decoded          — bounded, 1.5s cap
 *   5. mutation quiet period                     — 150ms quiet, 2s hard cap
 *   6. proceed
 *
 * `--settle-strategy` is the escape hatch for sites where this contract is
 * wrong: any non-`default` strategy replaces the whole thing with a single
 * Playwright `waitUntil` and skips steps 2–5 entirely.
 */

import type { Page } from 'playwright';

import type { SettleSettings } from '../types.js';

export interface SettleResult {
  strategy: SettleSettings['strategy'];
  durationMs: number;
  httpStatus?: number;
  /** True if in-viewport image decoding hit `imageDecodeCapMs` rather than finishing naturally. */
  imageDecodeCapHit: boolean;
  /** True if the mutation-quiet period hit `quietCapMs` rather than settling naturally. */
  quietCapHit: boolean;
}

export async function settle(page: Page, url: string, settings: SettleSettings): Promise<SettleResult> {
  const startedAt = Date.now();

  const response = await page.goto(url, {
    waitUntil: settings.strategy === 'default' ? 'domcontentloaded' : settings.strategy,
  });
  const httpStatus = response?.status();

  if (settings.strategy !== 'default') {
    return {
      strategy: settings.strategy,
      durationMs: Date.now() - startedAt,
      ...(httpStatus !== undefined ? { httpStatus } : {}),
      imageDecodeCapHit: false,
      quietCapHit: false,
    };
  }

  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );

  const imageDecodeCapHit = await page.evaluate(waitForViewportImagesDecoded, settings.imageDecodeCapMs);
  const quietCapHit = await page.evaluate(waitForMutationQuiet, {
    quietMs: settings.quietMs,
    quietCapMs: settings.quietCapMs,
  });

  return {
    strategy: 'default',
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    durationMs: Date.now() - startedAt,
    imageDecodeCapHit,
    quietCapHit,
  };
}

/**
 * Runs in the page. Waits for every `<img>` intersecting the viewport to
 * decode, bounded by `capMs`. Returns whether the cap was hit.
 */
function waitForViewportImagesDecoded(capMs: number): Promise<boolean> {
  const images = Array.from(document.querySelectorAll('img')).filter((img) => {
    const rect = img.getBoundingClientRect();
    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  });

  if (images.length === 0) {
    return Promise.resolve(false);
  }

  const decodeAll = Promise.all(
    images.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))),
  ).then(() => false);

  const cap = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(true), capMs);
  });

  return Promise.race([decodeAll, cap]);
}

/**
 * Runs in the page. Resolves once `quietMs` has passed with no DOM
 * mutations, or after `quietCapMs` regardless. Returns whether the hard cap
 * was hit.
 */
function waitForMutationQuiet({ quietMs, quietCapMs }: { quietMs: number; quietCapMs: number }): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let quietTimer: ReturnType<typeof setTimeout>;
    let settled = false;

    const finish = (capHit: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(quietTimer);
      clearTimeout(hardCapTimer);
      observer.disconnect();
      resolve(capHit);
    };

    const observer = new MutationObserver(() => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => finish(false), quietMs);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    quietTimer = setTimeout(() => finish(false), quietMs);
    const hardCapTimer = setTimeout(() => finish(true), quietCapMs);
  });
}
