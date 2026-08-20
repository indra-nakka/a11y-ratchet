/**
 * Playwright lifecycle: browser launch, context pool, and the fixed rendering
 * context (`01 §5`).
 *
 * "One `BrowserContext` per worker, reused; fresh `Page` per URL. Recycle
 * contexts every ~25 pages to bound memory" (`01 §9`). The crawler that feeds
 * this pool many URLs across several workers is Day 7; this module only
 * needs to support that shape, not implement the frontier.
 */

import { chromium, type Browser, type BrowserContext } from 'playwright';

import type { Viewport } from '../types.js';

/** `01 §9`: above ~8, results destabilise on modest hardware. */
export const DEFAULT_CONCURRENCY = 3;

/** `01 §5` context settings, the parts exposed as CLI options. */
export const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
export const DEFAULT_LOCALE = 'en-US';
export const DEFAULT_COLOR_SCHEME: 'light' | 'dark' | 'no-preference' = 'light';

/**
 * `01 §5` context settings that are not configurable in v1 — `ScanOptions`
 * has no field for them (`DECISIONS.md` D5 added them to `RunInfo` for
 * recording, not for configuration).
 */
export const FIXED_TIMEZONE_ID = 'UTC';
export const FIXED_REDUCED_MOTION: 'reduce' | 'no-preference' = 'reduce';
export const FIXED_DEVICE_SCALE_FACTOR = 1;

/** Recycle a worker's context after this many pages, to bound memory (`01 §9`). */
export const DEFAULT_RECYCLE_AFTER_PAGES = 25;

/** Injected stylesheet zeroing all animation and transition durations and delays (`01 §5`). */
const ZERO_MOTION_CSS =
  '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; ' +
  'transition-duration: 0s !important; transition-delay: 0s !important; }';

export interface RenderContextOptions {
  viewport?: Viewport;
  locale?: string;
  colorScheme?: 'light' | 'dark' | 'no-preference';
  /** Playwright `storageState` path, for scanning behind auth (`00 §4`). */
  storageState?: string;
}

export interface BrowserPoolOptions extends RenderContextOptions {
  /** How many worker contexts the pool will hand out concurrently. */
  concurrency?: number;
  recycleAfterPages?: number;
}

/**
 * One worker's context, plus how many pages it has scanned since it was
 * created — the recycling counter (`01 §9`).
 */
interface WorkerSlot {
  context: BrowserContext;
  pagesScanned: number;
}

/**
 * A pool of `BrowserContext`s, one per worker slot, recycled on a page-count
 * threshold. `acquire`/`release` model exactly one page-scan per call so the
 * counter and the recycling decision live in one place.
 */
interface ResolvedBrowserPoolOptions {
  viewport: Viewport;
  locale: string;
  colorScheme: 'light' | 'dark' | 'no-preference';
  storageState?: string;
  concurrency: number;
  recycleAfterPages: number;
}

export class BrowserPool {
  private readonly browser: Browser;
  private readonly options: ResolvedBrowserPoolOptions;
  private readonly slots = new Map<number, WorkerSlot>();

  private constructor(browser: Browser, options: BrowserPoolOptions) {
    this.browser = browser;
    this.options = {
      viewport: options.viewport ?? DEFAULT_VIEWPORT,
      locale: options.locale ?? DEFAULT_LOCALE,
      colorScheme: options.colorScheme ?? DEFAULT_COLOR_SCHEME,
      concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
      recycleAfterPages: options.recycleAfterPages ?? DEFAULT_RECYCLE_AFTER_PAGES,
      ...(options.storageState !== undefined ? { storageState: options.storageState } : {}),
    };
  }

  static async launch(options: BrowserPoolOptions = {}): Promise<BrowserPool> {
    const browser = await chromium.launch();
    return new BrowserPool(browser, options);
  }

  get browserVersion(): string {
    return this.browser.version();
  }

  /**
   * Get the context for a worker slot. Creates one on first use, and again
   * whenever the slot's context has scanned `recycleAfterPages` pages.
   */
  async acquire(workerId: number): Promise<BrowserContext> {
    const existing = this.slots.get(workerId);
    if (existing && existing.pagesScanned < this.options.recycleAfterPages) {
      return existing.context;
    }
    if (existing) {
      await existing.context.close();
    }
    const context = await this.newContext();
    this.slots.set(workerId, { context, pagesScanned: 0 });
    return context;
  }

  /** Record that the worker's current context just scanned one more page. */
  release(workerId: number): void {
    const slot = this.slots.get(workerId);
    if (!slot) {
      throw new Error(`released worker ${workerId} with no acquired context`);
    }
    slot.pagesScanned += 1;
  }

  async close(): Promise<void> {
    await Promise.all([...this.slots.values()].map((slot) => slot.context.close()));
    this.slots.clear();
    await this.browser.close();
  }

  private async newContext(): Promise<BrowserContext> {
    const context = await this.browser.newContext({
      viewport: this.options.viewport,
      locale: this.options.locale,
      colorScheme: this.options.colorScheme,
      timezoneId: FIXED_TIMEZONE_ID,
      reducedMotion: FIXED_REDUCED_MOTION,
      deviceScaleFactor: FIXED_DEVICE_SCALE_FACTOR,
      ...(this.options.storageState ? { storageState: this.options.storageState } : {}),
    });
    await context.addInitScript(injectZeroMotionStyle, ZERO_MOTION_CSS);
    return context;
  }
}

/**
 * Runs in the page, not in Node — creates the zero-motion `<style>` element as
 * early as possible so it applies before the page's own scripts run.
 */
function injectZeroMotionStyle(css: string): void {
  const inject = (): void => {
    const style = document.createElement('style');
    style.textContent = css;
    (document.head ?? document.documentElement).appendChild(style);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject, { once: true });
  } else {
    inject();
  }
}
