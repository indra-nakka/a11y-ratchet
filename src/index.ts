/**
 * PUBLIC LIBRARY API.
 *
 * The only module external consumers import, and the only module `src/cli/`
 * calls. Named exports only — no default export. Everything the CLI does goes
 * through a function declared here, which is what makes the "CLI + library"
 * claim true rather than decorative (`01 §2`).
 *
 * Every implementation is stubbed as of Day 1; each stub names the day in the
 * plan that fills it in. Stubs throw rather than returning empty results: a
 * scanner that reports zero violations because it did nothing is the worst
 * possible failure mode for this particular tool.
 */

import { NotImplementedError } from './errors.js';
import type {
  ConfigCheckResult,
  CoverageCounts,
  CoverageEntry,
  DiffOptions,
  DiffResult,
  ExitCode,
  Level,
  ManualOptions,
  Report,
  ReportOptions,
  ScanOptions,
} from './types.js';

/* -------------------------------------------------------------------------- */
/* Types and metadata                                                         */
/* -------------------------------------------------------------------------- */

export type * from './types.js';
export { A11yRatchetError, NotImplementedError } from './errors.js';
export {
  AXE_CORE_VERSION,
  DEFAULT_BASELINE_PATH,
  DEFAULT_CONFIG_PATH,
  TOOL_NAME,
  TOOL_VERSION,
} from './meta.js';

/* -------------------------------------------------------------------------- */
/* Scanning                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Crawl and scan a site, returning the full report envelope.
 *
 * Pages that fail are recorded in `Report.pages` with their error, never
 * omitted. Suppressed findings are tagged and returned in `Report.suppressed`,
 * never dropped.
 *
 * Days 2, 7 and 9.
 */
export function scan(_options: ScanOptions): Promise<Report> {
  throw new NotImplementedError('scan()', 'Days 2, 7 and 9');
}

/* -------------------------------------------------------------------------- */
/* Diff                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Diff two reports.
 *
 * Refuses mismatched scan modes, and refuses differing axe-core versions unless
 * `allowEngineDrift` is set. When identity is uncertain, findings are
 * classified `unclassified` or `moved` — never `new`.
 *
 * Days 4–6.
 */
export function diff(_base: Report, _head: Report, _options?: DiffOptions): DiffResult {
  throw new NotImplementedError('diff()', 'Days 4–6');
}

/**
 * Map a diff result to a process exit code (`01 §10`).
 *
 * Lives in the library, not the CLI, so the GitHub Action and any programmatic
 * consumer agree with the binary about what the codes mean.
 *
 * Day 6.
 */
export function exitCodeForDiff(_result: DiffResult): ExitCode {
  throw new NotImplementedError('exitCodeForDiff()', 'Day 6');
}

/**
 * Map a scan result to a process exit code. Only ever 0 or 5 — the absolute
 * threshold gate, with no baseline involved.
 *
 * Day 13.
 */
export function exitCodeForScan(_report: Report, _failOn?: number): ExitCode {
  throw new NotImplementedError('exitCodeForScan()', 'Day 13');
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Render a report as HTML, JSON, or a terminal summary. The HTML output is
 * self-contained and must pass its own scan with zero violations (Day 11).
 *
 * Days 3, 10 and 11.
 */
export function renderReport(_report: Report, _options: ReportOptions): Promise<string> {
  throw new NotImplementedError('renderReport()', 'Days 3, 10 and 11');
}

/**
 * Render a diff as HTML, JSON, or a terminal summary.
 *
 * Day 10.
 */
export function renderDiff(_result: DiffResult, _options: ReportOptions): Promise<string> {
  throw new NotImplementedError('renderDiff()', 'Day 10');
}

/** Read a report or baseline from disk, validating its `schemaVersion`. Day 2. */
export function readReport(_path: string): Promise<Report> {
  throw new NotImplementedError('readReport()', 'Day 2');
}

/** Write a report to disk with stable key ordering, so baselines diff cleanly. Day 2. */
export function writeReport(_report: Report, _path: string): Promise<void> {
  throw new NotImplementedError('writeReport()', 'Day 2');
}

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Validate a config file: schema, mandatory suppression fields, expiry, and
 * staleness against a report. Expired suppressions fail the check (exit 2).
 *
 * Day 8.
 */
export function checkConfig(_configPath: string, _report?: Report): Promise<ConfigCheckResult> {
  throw new NotImplementedError('checkConfig()', 'Day 8');
}

/* -------------------------------------------------------------------------- */
/* Baseline                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Drop entries from the baseline that no longer appear in `report`, keeping the
 * rest. Run locally and committed alongside the fix (`01 §11`).
 *
 * The library writes baselines. The GitHub Action never does — it fails the gate
 * and prints the command to run.
 *
 * Day 12.
 */
export function updateBaseline(_report: Report, _baselinePath: string): Promise<Report> {
  throw new NotImplementedError('updateBaseline()', 'Day 12');
}

/**
 * Replace the baseline wholesale from a fresh report. The path for an axe-core
 * bump, where reviewers should see the churn as a diff.
 *
 * Day 12.
 */
export function regenerateBaseline(_report: Report, _baselinePath: string): Promise<Report> {
  throw new NotImplementedError('regenerateBaseline()', 'Day 12');
}

/**
 * Compare a committed baseline against a fresh report and report the drift.
 * Run on a schedule so a stale baseline surfaces as an issue, not a surprise.
 *
 * Day 12.
 */
export function checkBaseline(_report: Report, _baselinePath: string): Promise<DiffResult> {
  throw new NotImplementedError('checkBaseline()', 'Day 12');
}

/* -------------------------------------------------------------------------- */
/* WCAG coverage and manual checklist                                         */
/* -------------------------------------------------------------------------- */

/**
 * The coverage matrix as data — all 86 WCAG 2.2 success criteria, each with what
 * the tool can and cannot detect (`03 Part 1`).
 *
 * Day 3.
 */
export function coverage(): CoverageEntry[] {
  throw new NotImplementedError('coverage()', 'Day 3');
}

/**
 * Coverage totals, computed from `coverage()`.
 *
 * Every published count comes from here. Never hardcode a coverage count, a
 * recall figure or a percentage — an earlier draft of the design docs did, and
 * the numbers did not match the table they summarised.
 *
 * Day 3.
 */
export function coverageCounts(_levels?: Level[]): CoverageCounts {
  throw new NotImplementedError('coverageCounts()', 'Day 3');
}

/**
 * Generate the manual-testing checklist for criteria the tool cannot evaluate,
 * plus routing for anything bucketed `needs-review`.
 *
 * Day 13.
 */
export function manualChecklist(_options: ManualOptions, _report?: Report): Promise<string> {
  throw new NotImplementedError('manualChecklist()', 'Day 13');
}
