/**
 * `exitCodeForScan()` (`index.ts`, `DECISIONS.md` D76) - the absolute
 * threshold gate, no baseline involved. Only ever 0 or 5 (`01 §10`).
 */

import { describe, expect, it } from 'vitest';

import { exitCodeForScan } from '../src/index.js';
import type { Report } from '../src/types.js';

// Only `summary.findings.violation` is read by exitCodeForScan(); the rest
// of `Report` is irrelevant to this pure function, so a real Report
// wouldn't add signal here - the cast keeps the fixture to the one field
// that matters instead of a 90-line builder duplicated from another test file.
function reportWithViolations(violation: number): Report {
  return { summary: { findings: { violation } } } as unknown as Report;
}

describe('exitCodeForScan', () => {
  it('is 0 when --fail-on is not set, regardless of violation count', () => {
    expect(exitCodeForScan(reportWithViolations(0))).toBe(0);
    expect(exitCodeForScan(reportWithViolations(100))).toBe(0);
  });

  it('is 0 when violations are at or under the threshold', () => {
    expect(exitCodeForScan(reportWithViolations(5), 5)).toBe(0);
    expect(exitCodeForScan(reportWithViolations(3), 5)).toBe(0);
  });

  it('is 5 when violations exceed the threshold', () => {
    expect(exitCodeForScan(reportWithViolations(6), 5)).toBe(5);
  });

  it('--fail-on 0 fails on any violation at all', () => {
    expect(exitCodeForScan(reportWithViolations(1), 0)).toBe(5);
    expect(exitCodeForScan(reportWithViolations(0), 0)).toBe(0);
  });
});
