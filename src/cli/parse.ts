/**
 * Shared CLI-string parsing (`scan`'s and `baseline check-run-config`'s
 * `--viewport`/`--color-scheme`/`--settle-strategy` all take the same
 * shape) — "parse args" plumbing (`CLAUDE.md` invariant 8), not library
 * logic: `ScanOptions.viewport` is already a structured `Viewport`, this
 * only turns a CLI-convenience string like `"1280x800"` into one.
 */

import { A11yRatchetError } from '../errors.js';
import type { ScanOptions, SettleStrategy, Viewport } from '../types.js';

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
