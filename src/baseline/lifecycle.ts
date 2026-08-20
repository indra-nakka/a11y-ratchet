/**
 * The committed-baseline lifecycle (`01 §11`). Storage is a plain `Report`
 * JSON file (`report/json.ts` already reads/writes that shape - the
 * baseline is not a separate format).
 *
 * Suppressions are not baseline updates and this module never touches them:
 * a suppression is a *decision*, recorded in config, with a reason and an
 * expiry; a baseline just records *reality*, whatever it currently is. Keep
 * the two paths visibly separate (`CLAUDE.md`, `01 §11`) — nothing here
 * reads `config/`, and nothing in `config/` writes a baseline.
 */

import { access } from 'node:fs/promises';

import { readReport, writeReport } from '../report/json.js';
import { runDiff } from '../diff/run.js';
import { A11yRatchetError } from '../errors.js';
import type { DiffResult, Report } from '../types.js';

/**
 * `null` iff no file exists at `baselinePath` — checked directly rather than
 * inferred from `readReport`'s error, so a baseline that exists but is
 * corrupt or wrong-schema still throws a real error instead of quietly
 * reading as "no baseline yet."
 */
async function readBaseline(baselinePath: string): Promise<Report | null> {
  try {
    await access(baselinePath);
  } catch {
    return null;
  }
  return readReport(baselinePath);
}

/**
 * Drop findings that no longer occur, keep the rest. Diffs the existing
 * baseline against `report` first — refusing on engine drift or
 * incompatible run config exactly like `diff` does, since silently
 * absorbing an axe-core bump into the baseline is `regenerate`'s job, not
 * this one's — then writes `report` as the new baseline in full: whatever
 * still occurs is, by construction, everything `report` contains.
 */
export async function updateBaseline(report: Report, baselinePath: string): Promise<Report> {
  const existing = await readBaseline(baselinePath);
  if (!existing) {
    throw new A11yRatchetError(
      `No baseline at ${baselinePath} to update. Run "baseline regenerate" to create the first one.`,
      3,
    );
  }

  // Only run for its refusals (engine drift, incompatible config) and as a
  // sanity check that these two reports are comparable at all — the result
  // itself isn't used to filter anything; `report` already IS "whatever
  // currently occurs."
  runDiff(existing, report, {});

  await writeReport(report, baselinePath);
  return report;
}

/**
 * Replace the baseline wholesale, unconditionally — no read of the existing
 * file, no diff, no engine-drift refusal. The path for an axe-core bump
 * (reviewers see the churn as a diff on the committed file) and for
 * creating the very first baseline.
 */
export async function regenerateBaseline(report: Report, baselinePath: string): Promise<Report> {
  await writeReport(report, baselinePath);
  return report;
}

/**
 * Compare the committed baseline against a fresh report and return the
 * drift, unchanged from `diff`'s own semantics (page-set partitioning,
 * matching, classification, gate). The caller decides what "drift" means
 * for exit codes and messaging — this never writes anything (`01 §11`: CI
 * never writes to the repo).
 */
export async function checkBaseline(report: Report, baselinePath: string): Promise<DiffResult> {
  const existing = await readBaseline(baselinePath);
  if (!existing) {
    throw new A11yRatchetError(
      `No baseline at ${baselinePath} to check against. Run "baseline regenerate" locally to create one.`,
      3,
    );
  }
  return runDiff(existing, report, {});
}
