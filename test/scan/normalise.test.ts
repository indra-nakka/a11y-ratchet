/**
 * Unit tests for the pure `02 §3.3` normalisation rules. Kept separate from
 * the browser-dependent integration test so these run without Playwright.
 */

import { describe, expect, it } from 'vitest';

import { normaliseText } from '../../src/scan/normalise.js';

describe('normaliseText', () => {
  it('collapses whitespace, trims and lowercases', () => {
    expect(normaliseText('  Search   the   Report  ')).toBe('search the report');
  });

  it('strips zero-width and directional marks', () => {
    expect(normaliseText('sa\u200Ble\u200Cs')).toBe('sales');
  });

  it('masks embedded digit runs of length 2+ but leaves single digits alone', () => {
    expect(normaliseText('page 5 of 10')).toBe('page 5 of #');
  });

  it('masks ISO dates', () => {
    expect(normaliseText('Filed on 2026-08-20')).toBe('filed on #date');
  });

  it('masks currency amounts', () => {
    expect(normaliseText('Total: $12.34')).toBe('total: #money');
  });

  it('does not mask a string that is entirely digits (the pagination exception)', () => {
    // 02 §3.3: masking a bare "12" would collapse a pagination bar
    // ("10 11 12 13 14") into one fingerprint - the exact 1-to-1 pairing
    // the masking rule exists to protect (02 §9 case 20).
    expect(normaliseText('12')).toBe('12');
    expect(normaliseText('10 11 12 13 14')).toBe('10 11 12 13 14');
  });

  it('truncates to 80 characters', () => {
    const long = 'a'.repeat(120);
    expect(normaliseText(long)).toHaveLength(80);
  });
});
