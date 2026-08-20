/**
 * Shared CLI-string parsing (`scan`'s and `baseline check-run-config`'s
 * `--viewport`/`--color-scheme`/`--settle-strategy` all take the same
 * shape) — "parse args" plumbing (`CLAUDE.md` invariant 8), not library
 * logic: `ScanOptions.viewport` is already a structured `Viewport`, this
 * only turns a CLI-convenience string like `"1280x800"` into one.
 */

import { A11yRatchetError } from '../errors.js';
import type { Report, ScanOptions, SettleStrategy, Viewport } from '../types.js';

export type ColorScheme = NonNullable<ScanOptions['colorScheme']>;

export const COLOR_SCHEMES: readonly ColorScheme[] = ['light', 'dark', 'no-preference'];
export const SETTLE_STRATEGIES: readonly SettleStrategy[] = ['default', 'domcontentloaded', 'load', 'networkidle'];

/** `"1280x800"` -> `{ width: 1280, height: 800 }`. */
export function parseViewport(raw: string): Viewport {
  const match = /^(\d+)x(\d+)$/.exec(raw);
  if (!match) {
    throw new A11yRatchetError(`--viewport must look like "1280x800", got "${raw}".`, 3);
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function parseColorScheme(raw: string): ColorScheme {
  if (!COLOR_SCHEMES.includes(raw as ColorScheme)) {
    throw new A11yRatchetError(`--color-scheme must be one of ${COLOR_SCHEMES.join(', ')}, got "${raw}".`, 3);
  }
  return raw as ColorScheme;
}

export function parseSettleStrategy(raw: string): SettleStrategy {
  if (!SETTLE_STRATEGIES.includes(raw as SettleStrategy)) {
    throw new A11yRatchetError(`--settle-strategy must be one of ${SETTLE_STRATEGIES.join(', ')}, got "${raw}".`, 3);
  }
  return raw as SettleStrategy;
}

/**
 * `01 §10` lists "unreachable base URL" under exit 3. Every attempted page
 * failing to load is that scenario for the `scan` CLI command specifically
 * - a Report otherwise records page errors rather than throwing
 * (`CLAUDE.md` invariant 2), which is right for a partial-failure crawl but
 * reads as a silent pass ("0 violations!") when NOTHING was reachable at
 * all, the exact "reports zero violations because it did nothing" failure
 * mode this project treats as the worst one a scanner can have.
 */
export function unreachableBaseUrlError(report: Report): A11yRatchetError | undefined {
  if (report.summary.pages.total === 0 || report.summary.pages.scanned > 0) return undefined;

  const firstError = report.pages.find((page) => page.error)?.error;
  return new A11yRatchetError(
    `Every page failed to load (${report.summary.pages.total} attempted) - the base URL is likely ` +
      `unreachable.${firstError ? ` First error: ${firstError.kind} — ${firstError.message}` : ''}`,
    3,
  );
}
