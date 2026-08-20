/**
 * `src/cli/parse.ts` (Day 13) - CLI-string parsing shared across commands,
 * and `unreachableBaseUrlError()`, the `01 §10` exit-3 "unreachable base
 * URL" check.
 */

import { describe, expect, it } from 'vitest';

import { A11yRatchetError } from '../../src/errors.js';
import { parseColorScheme, parseSettleStrategy, parseViewport, unreachableBaseUrlError } from '../../src/cli/parse.js';
import type { PageResult, Report } from '../../src/types.js';

describe('parseViewport', () => {
  it('parses "WxH" into a structured Viewport', () => {
    expect(parseViewport('1280x800')).toEqual({ width: 1280, height: 800 });
  });

  it('throws exit 3 on a malformed value', () => {
    expect(() => parseViewport('not-a-viewport')).toThrow(A11yRatchetError);
    try {
      parseViewport('1280');
    } catch (error) {
      expect((error as A11yRatchetError).exitCode).toBe(3);
    }
  });
});

describe('parseColorScheme / parseSettleStrategy', () => {
  it('accept only their known enum values', () => {
    expect(parseColorScheme('dark')).toBe('dark');
    expect(() => parseColorScheme('rainbow')).toThrow(A11yRatchetError);
    expect(parseSettleStrategy('networkidle')).toBe('networkidle');
    expect(() => parseSettleStrategy('never')).toThrow(A11yRatchetError);
  });
});

function page(overrides: Partial<PageResult> = {}): PageResult {
  return {
    url: 'https://example.com/',
    urlTemplate: '/',
    depth: 0,
    startedAt: '2026-08-21T00:00:00.000Z',
    durationMs: 100,
    probesRun: true,
    probeBlindRegions: [],
    counts: { violation: 0, needsReview: 0, bestPractice: 0, suppressed: 0 },
    settleDegraded: false,
    ...overrides,
  };
}

// Only `pages`/`summary.pages` are read by unreachableBaseUrlError(); the
// rest of `Report` would add nothing here, same reasoning as
// `test/exitCodeForScan.test.ts`.
function reportWith(pages: PageResult[], scanned: number): Report {
  return { pages, summary: { pages: { total: pages.length, scanned, errored: pages.length - scanned } } } as unknown as Report;
}

describe('unreachableBaseUrlError', () => {
  it('returns undefined when at least one page scanned successfully', () => {
    const report = reportWith([page(), page({ url: 'https://example.com/broken', error: { kind: 'navigation-failed', message: 'timeout' } })], 1);
    expect(unreachableBaseUrlError(report)).toBeUndefined();
  });

  it('returns undefined when there were no pages to attempt at all', () => {
    expect(unreachableBaseUrlError(reportWith([], 0))).toBeUndefined();
  });

  it('returns an exit-3 error naming the attempted count and the first error, when every page failed', () => {
    const errored = page({ error: { kind: 'navigation-failed', message: 'net::ERR_CONNECTION_REFUSED' } });
    const error = unreachableBaseUrlError(reportWith([errored], 0));
    expect(error).toBeInstanceOf(A11yRatchetError);
    expect(error?.exitCode).toBe(3);
    expect(error?.message).toContain('1 attempted');
    expect(error?.message).toContain('navigation-failed');
    expect(error?.message).toContain('net::ERR_CONNECTION_REFUSED');
  });
});
