/**
 * The config file's shape (`01 §2`: `config/schema.ts`). Zod, not hand-rolled
 * validation — a suppression with a missing field must fail with a message
 * that names the field and says why it exists, and zod's per-field `error`
 * customisation is the direct way to guarantee that rather than reconstruct
 * it from a generic validation failure.
 *
 * `reason`, `category`, `owner` and `expires` are ALL required at the schema
 * level (`03 Part 3 §11`, `01 §11`) — a suppression is a decision, not a
 * silent mute button, and a decision nobody can review is not a decision.
 */

import { z } from 'zod';

import type { SuppressionCategory } from '../types.js';

/**
 * Matches `types.ts`'s `SuppressionCategory` exactly. Kept as a literal
 * tuple (not derived from the type) because zod needs runtime values, not
 * just a type - if the two drift, `satisfies` below catches it at compile
 * time rather than at some later runtime surprise.
 */
export const SUPPRESSION_CATEGORIES = ['false-positive', 'accepted-risk', 'third-party', 'deferred'] as const;
SUPPRESSION_CATEGORIES satisfies readonly SuppressionCategory[];

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MATCHER_KEYS = ['rule', 'criterion', 'selector', 'urlPattern', 'fingerprint'] as const;

/**
 * One suppression entry. Matches by whichever of `rule` / `criterion` /
 * `selector` / `urlPattern` / `fingerprint` are present - ALL of the ones
 * given must match (AND), and at least one must be given, or the entry
 * would silently suppress every finding in the report.
 */
export const SuppressionEntrySchema = z
  .object({
    /**
     * Stable, human-chosen id. Becomes `SuppressionRef.ruleRef` - the only
     * way a report reader can trace a suppressed finding back to the exact
     * config entry that suppressed it.
     */
    id: z
      .string({ error: 'suppressions[].id is required: it becomes SuppressionRef.ruleRef, the only way a report reader can trace a suppressed finding back to the config entry that suppressed it.' })
      .min(1, { error: 'suppressions[].id must not be empty: it becomes SuppressionRef.ruleRef, the only way a report reader can trace a suppressed finding back to the config entry that suppressed it.' }),

    /** Matches `Finding.ruleId` exactly. */
    rule: z.string().min(1).optional(),
    /** Matches any of `Finding.criteria[].id` exactly, e.g. `"1.4.3"`. */
    criterion: z.string().min(1).optional(),
    /** Glob against `Finding.selector` (display-only elsewhere; suppression matching is not identity). */
    selector: z.string().min(1).optional(),
    /** Glob against `Finding.url`. */
    urlPattern: z.string().min(1).optional(),
    /** Matches `Finding.fingerprint` exactly - the narrowest, most durable handle. */
    fingerprint: z.string().min(1).optional(),

    reason: z
      .string({ error: 'suppressions[].reason is required: a suppression is a recorded decision, not a silent mute - this is why the finding is accepted (CLAUDE.md invariant 2, 01 §11).' })
      .min(1, { error: 'suppressions[].reason must not be empty: a suppression is a recorded decision, not a silent mute - this is why the finding is accepted (CLAUDE.md invariant 2, 01 §11).' }),

    category: z.enum(SUPPRESSION_CATEGORIES, {
      error: `suppressions[].category is required and must be one of ${SUPPRESSION_CATEGORIES.join(', ')}: it distinguishes a genuine false positive from a real defect someone chose to accept (03 Part 3 §6) - conflating them is how a scanner loses practitioners' trust.`,
    }),

    owner: z
      .string({ error: 'suppressions[].owner is required: "the team" is not an owner - a suppression with no accountable person is the one that never gets revisited (01 §11).' })
      .min(1, { error: 'suppressions[].owner must not be empty: "the team" is not an owner - a suppression with no accountable person is the one that never gets revisited (01 §11).' }),

    expires: z
      .string({ error: 'suppressions[].expires is required and must be an ISO 8601 date (YYYY-MM-DD): an undated suppression never comes back for review, which is the exact failure mode this field exists to prevent (01 §11).' })
      .regex(ISO_DATE_PATTERN, { error: 'suppressions[].expires must be an ISO 8601 date (YYYY-MM-DD): an undated suppression never comes back for review, which is the exact failure mode this field exists to prevent (01 §11).' }),
  })
  .strict()
  .refine((entry) => MATCHER_KEYS.some((key) => entry[key] !== undefined), {
    error:
      'suppressions[] must set at least one of rule, criterion, selector, urlPattern or fingerprint: with none set, the entry would silently suppress every finding in the report.',
  });

export type SuppressionEntry = z.infer<typeof SuppressionEntrySchema>;

/**
 * `mode` mirrors `ScanOptions.mode` (`01 §5`) so a team can commit a default
 * without repeating `--mode` on every invocation. Nothing beyond
 * suppressions and this default is in scope for Day 8 - the rest of
 * `ScanOptions` stays CLI-flag-only until a day that needs it.
 */
export const ConfigSchema = z
  .object({
    mode: z.enum(['ci', 'audit']).optional(),
    suppressions: z.array(SuppressionEntrySchema).default([]),
  })
  .strict();

export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = { suppressions: [] };
