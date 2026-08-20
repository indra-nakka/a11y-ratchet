/**
 * `config/schema.ts` (`01 §2`, `03 Part 3 §11`): `reason`, `category`,
 * `owner` and `expires` are ALL required at the schema level, and a missing
 * one must fail with a message naming the field and saying why it exists -
 * not a generic "invalid_type" error someone has to go decode.
 */

import { describe, expect, it } from 'vitest';

import { ConfigSchema, SuppressionEntrySchema, SUPPRESSION_CATEGORIES } from '../../src/config/schema.js';

const VALID_ENTRY = {
  id: 'stripe-iframe-contrast',
  rule: 'color-contrast',
  reason: 'Inside a third-party iframe we do not control.',
  category: 'third-party' as const,
  owner: '@alice',
  expires: '2099-01-01',
};

function firstIssueMessage(result: { success: false; error: { issues: { message: string }[] } }): string {
  return result.error.issues[0]!.message;
}

describe('SuppressionEntrySchema', () => {
  it('accepts a fully-specified valid entry', () => {
    const result = SuppressionEntrySchema.safeParse(VALID_ENTRY);
    expect(result.success).toBe(true);
  });

  for (const field of ['reason', 'category', 'owner', 'expires', 'id'] as const) {
    it(`fails with a message naming "${field}" when it is missing entirely`, () => {
      const { [field]: _omit, ...rest } = VALID_ENTRY;
      const result = SuppressionEntrySchema.safeParse(rest);
      expect(result.success).toBe(false);
      if (result.success) return;
      const message = firstIssueMessage(result);
      expect(message).toContain(field);
      // Not just naming the field - saying why it exists, so a reader
      // doesn't have to go look it up.
      expect(message.length).toBeGreaterThan(30);
    });

    it(`fails with a message naming "${field}" when it is an empty string`, () => {
      if (field === 'category') return; // category is an enum, not a free string - covered separately below.
      const result = SuppressionEntrySchema.safeParse({ ...VALID_ENTRY, [field]: '' });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(firstIssueMessage(result)).toContain(field);
    });
  }

  it('rejects a category outside the four known values, naming them', () => {
    const result = SuppressionEntrySchema.safeParse({ ...VALID_ENTRY, category: 'nope' });
    expect(result.success).toBe(false);
    if (result.success) return;
    const message = firstIssueMessage(result);
    for (const category of SUPPRESSION_CATEGORIES) expect(message).toContain(category);
  });

  it('accepts every one of the four documented categories', () => {
    for (const category of SUPPRESSION_CATEGORIES) {
      const result = SuppressionEntrySchema.safeParse({ ...VALID_ENTRY, category });
      expect(result.success, `category "${category}" should be valid`).toBe(true);
    }
  });

  it('rejects an entry with no matcher field at all', () => {
    const { rule: _rule, ...withoutMatcher } = VALID_ENTRY;
    const result = SuppressionEntrySchema.safeParse(withoutMatcher);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(firstIssueMessage(result)).toMatch(/at least one/i);
  });

  for (const matcherField of ['rule', 'criterion', 'selector', 'urlPattern', 'fingerprint'] as const) {
    it(`accepts a matcher using only "${matcherField}"`, () => {
      const { rule: _rule, ...base } = VALID_ENTRY;
      const result = SuppressionEntrySchema.safeParse({ ...base, [matcherField]: 'some-value' });
      expect(result.success, `matcher field "${matcherField}" should be sufficient alone`).toBe(true);
    });
  }

  it('rejects an unknown top-level field (typo guard)', () => {
    const result = SuppressionEntrySchema.safeParse({ ...VALID_ENTRY, reeason: 'typo' });
    expect(result.success).toBe(false);
  });
});

describe('ConfigSchema', () => {
  it('defaults suppressions to an empty array when omitted', () => {
    const result = ConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.suppressions).toEqual([]);
  });

  it('accepts the documented README example verbatim', () => {
    const result = ConfigSchema.safeParse({
      mode: 'ci',
      suppressions: [
        {
          id: 'stripe-iframe-contrast',
          rule: 'color-contrast',
          urlPattern: '/checkout*',
          category: 'third-party',
          reason: 'Inside Stripe Elements iframe; not ours to fix. Raised as Stripe #12345.',
          owner: '@you',
          expires: '2026-12-01',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown top-level field (typo guard)', () => {
    const result = ConfigSchema.safeParse({ suppresions: [] });
    expect(result.success).toBe(false);
  });
});
