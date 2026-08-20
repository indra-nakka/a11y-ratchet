/**
 * `check-config` (`01 §10`, `03 Part 3 §11`): validates the config, then
 * reports three distinct things about its suppressions - expired (gates,
 * exit 2), expiring within 30 days (warns), and stale, i.e. matching
 * nothing in a given report (warns, needs `--against <report.json>` since
 * staleness is meaningless without something to compare against).
 *
 * A schema-validation failure is reported the same way as the others -
 * `valid: false` plus a message - rather than thrown, so `--json` output and
 * programmatic callers get a structured result even when the config itself
 * is broken. `exitCodeForConfigCheck()` (`index.ts`) is what turns this into
 * a process exit code; this module only ever returns data.
 */

import { A11yRatchetError } from '../errors.js';
import type { ConfigCheckResult, Report, SuppressionRef } from '../types.js';
import { loadConfig } from './load.js';
import { findMatchingSuppression, toSuppressionRef } from './suppress.js';

/** `01 §11`: a suppression is a dated decision, not a mute button — flag it before it lapses unnoticed. */
const EXPIRING_SOON_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export async function runCheckConfig(configPath: string | undefined, report: Report | undefined, now: Date): Promise<ConfigCheckResult> {
  let config;
  try {
    ({ config } = await loadConfig(configPath));
  } catch (error) {
    if (error instanceof A11yRatchetError) {
      return { valid: false, errors: [error.message], warnings: [], expired: [], stale: [] };
    }
    throw error;
  }

  const warnings: string[] = [];
  const expired: SuppressionRef[] = [];
  const entries = config.suppressions.map((entry) => ({ entry, ref: toSuppressionRef(entry, now) }));

  for (const { entry, ref } of entries) {
    if (ref.expired) {
      expired.push(ref);
      continue;
    }
    const expiresAtMs = new Date(`${entry.expires}T00:00:00Z`).getTime();
    const daysUntilExpiry = Math.floor((expiresAtMs - now.getTime()) / MS_PER_DAY);
    if (daysUntilExpiry <= EXPIRING_SOON_DAYS) {
      warnings.push(
        `Suppression "${entry.id}" (owner: ${entry.owner}) expires ${entry.expires}, in ${daysUntilExpiry} day(s).`,
      );
    }
  }

  const stale: SuppressionRef[] = [];
  if (report) {
    for (const { entry, ref } of entries) {
      const stillMatches = report.findings.some((finding) => findMatchingSuppression([entry], finding) !== undefined);
      if (!stillMatches) stale.push(ref);
    }
  } else if (config.suppressions.length > 0) {
    warnings.push('No --against <report.json> given: stale-suppression check skipped.');
  }

  return { valid: true, errors: [], warnings, expired, stale };
}
