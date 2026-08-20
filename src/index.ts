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
import { runDiff } from './diff/run.js';
import { renderDiffSummary } from './report/diffSummary.js';
import { readReport as readReportFromDisk, writeReport as writeReportToDisk } from './report/json.js';
import { renderSummary } from './report/summary.js';
import { runScan } from './scan/run.js';
import { computeCoverageCounts, WCAG_COVERAGE } from './wcag/coverage.js';
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
 * omitted. Suppressed findings stay in `Report.findings`, tagged with
 * `suppressed`, never dropped or moved to a second array.
 *
 * Days 2, 7 and 9. As of Day 2: a single `seed.url` page, no crawl frontier
 * (`seed.sitemap`/`seed.urlList` throw) and no interaction probes yet —
 * `PageResult.probesRun` is `false` until Day 9.
 */
export function scan(options: ScanOptions): Promise<Report> {
  return runScan(options);
}

/* -------------------------------------------------------------------------- */
/* Diff                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Diff two reports.
 *
 * Refuses mismatched scan modes and other incompatible run configuration
 * (`incompatibleRunConfig`, exit 6, no override), and refuses differing
 * axe-core versions (exit 4) unless `allowEngineDrift` is set. When
 * identity is uncertain, findings are classified `unclassified` or `moved`
 * — never `new`.
 */
export function diff(base: Report, head: Report, options?: DiffOptions): DiffResult {
  return runDiff(base, head, options ?? {});
}

/**
 * Map a diff result to a process exit code (`01 §10`).
 *
 * Lives in the library, not the CLI, so the GitHub Action and any programmatic
 * consumer agree with the binary about what the codes mean. Only ever 0 or 1
 * — `diff()` itself throws for exit codes 4 and 6 (engine drift, incompatible
 * run config), since those refuse to produce a `DiffResult` at all.
 */
export function exitCodeForDiff(result: DiffResult): ExitCode {
  return result.gate.passed ? 0 : 1;
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
 * `format: 'summary'` as of Day 3 (`report/summary.ts`); `'html'` and
 * `'json'` are Days 10 and 11.
 */
export function renderReport(report: Report, options: ReportOptions): Promise<string> {
  if (options.format === 'summary') {
    return Promise.resolve(renderSummary(report));
  }
  throw new NotImplementedError(`renderReport() format "${options.format}"`, 'Days 10 and 11');
}

/**
 * Render a diff as HTML, JSON, or a terminal summary.
 *
 * `format: 'summary'` as of Day 6 (`report/diffSummary.ts`); the CI
 * job-summary markdown and `'html'` are Day 12 and Day 10 respectively.
 */
export function renderDiff(result: DiffResult, options: ReportOptions): Promise<string> {
  if (options.format === 'summary') {
    return Promise.resolve(renderDiffSummary(result));
  }
  throw new NotImplementedError(`renderDiff() format "${options.format}"`, 'Days 10 and 12');
}

/** Read a report or baseline from disk, validating its `schemaVersion`. */
export function readReport(path: string): Promise<Report> {
  return readReportFromDisk(path);
}

/** Write a report to disk with stable key ordering, so baselines diff cleanly. */
export function writeReport(report: Report, path: string): Promise<void> {
  return writeReportToDisk(report, path);
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
 * The coverage matrix as data — the 55 WCAG 2.2 A/AA success criteria (an AA
 * conformance claim's scope, `03-EVIDENCE.md §1.1`), each with what the tool
 * can and cannot detect (`03 Part 1`). AAA criteria aren't in this matrix;
 * `wcag/criteria.ts` still resolves them by id when a rule tags one.
 */
export function coverage(): CoverageEntry[] {
  return WCAG_COVERAGE;
}

/**
 * Coverage totals, computed from `coverage()`.
 *
 * Every published count comes from here. Never hardcode a coverage count, a
 * recall figure or a percentage — an earlier draft of the design docs did, and
 * the numbers did not match the table they summarised.
 */
export function coverageCounts(levels?: Level[]): CoverageCounts {
  return computeCoverageCounts(levels);
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
