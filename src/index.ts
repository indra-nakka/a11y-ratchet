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
import { checkBaseline as checkBaselineImpl, regenerateBaseline as regenerateBaselineImpl, updateBaseline as updateBaselineImpl } from './baseline/lifecycle.js';
import { runCheckConfig } from './config/check.js';
import { runDiff } from './diff/run.js';
import { renderDiffSummary } from './report/diffSummary.js';
import { renderReportHtml } from './report/html/render.js';
import { renderDiffHtml } from './report/html/renderDiff.js';
import { readReport as readReportFromDisk, toStableJson, writeReport as writeReportToDisk } from './report/json.js';
import { renderDiffStepSummary as renderDiffStepSummaryImpl } from './report/stepSummary.js';
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
  CONFIG_BASENAME,
  DEFAULT_BASELINE_PATH,
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
 * Days 2, 7 and 9. As of Day 7: `seed.url` (BFS), `seed.sitemap` and
 * `seed.urlList` are all implemented. Interaction probes are still Day 9 —
 * `PageResult.probesRun` is `false` and a non-empty `options.probes` throws.
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
 * Pulled forward from Day 13 (`DECISIONS.md` D76): `--fail-on` was a CLI
 * flag that silently did nothing without this, which is worse than either
 * working or refusing to run. `failOn` omitted means no threshold is
 * configured, never a silent pass disguised as one — every other Day 13
 * concern (the manual checklist) stays deferred.
 *
 * Counts `report.summary.findings.violation` — the same count already
 * excludes best-practice and suppressed findings (`report/summary.ts`,
 * `identity/group.ts`), so this never gates on either.
 */
export function exitCodeForScan(report: Report, failOn?: number): ExitCode {
  if (failOn === undefined) return 0;
  return report.summary.findings.violation > failOn ? 5 : 0;
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Render a report as HTML, JSON, or a terminal summary. The HTML output is
 * self-contained (`report/html/render.ts`) and must pass its own scan with
 * zero violations — that self-test shipped Day 10.
 *
 * `format: 'summary'` as of Day 3 (`report/summary.ts`), grouped by
 * template unless `options.ungrouped`; `'html'` as of Day 10; `'json'` as
 * of Day 11, sharing `report/json.ts`'s `toStableJson` with `writeReport`
 * so the two never quietly diverge on formatting.
 */
export function renderReport(report: Report, options: ReportOptions): Promise<string> {
  if (options.format === 'summary') {
    return Promise.resolve(renderSummary(report, options.ungrouped !== undefined ? { ungrouped: options.ungrouped } : {}));
  }
  if (options.format === 'html') {
    return Promise.resolve(renderReportHtml(report));
  }
  if (options.format === 'json') {
    return Promise.resolve(toStableJson(report));
  }
  // Exhaustive over `ReportFormat`; a future format lands as a type error here, not a silent throw.
  const unreachable: never = options.format;
  throw new NotImplementedError(`renderReport() format "${String(unreachable)}"`, 'Day 11');
}

/**
 * Render a diff as HTML or a terminal summary.
 *
 * `format: 'summary'` as of Day 6 (`report/diffSummary.ts`); `'html'` as of
 * Day 11 (`report/html/renderDiff.ts` — dropped from the Day 10 plan row by
 * a bullet-list error, restored here). `'json'` is not implemented here —
 * `DiffResult` isn't a committed artefact the way a baseline `Report` is,
 * so there's no stable-key-ordering requirement pulling it in for free;
 * `JSON.stringify(result, null, 2)` is sufficient and is what `diff
 * --format json` already does directly. The CI job-summary markdown is
 * `renderDiffStepSummary()` below, not a format of this function — it
 * needs the HEAD run's `Report`, not just the `DiffResult`, so it does
 * not fit this function's two-argument shape.
 */
export function renderDiff(result: DiffResult, options: ReportOptions): Promise<string> {
  if (options.format === 'summary') {
    return Promise.resolve(renderDiffSummary(result));
  }
  if (options.format === 'html') {
    return Promise.resolve(renderDiffHtml(result));
  }
  throw new NotImplementedError(`renderDiff() format "${options.format}"`, 'Day 12');
}

/**
 * Render a diff as `$GITHUB_STEP_SUMMARY` markdown (`01 §11`, `03 Part 3.8`,
 * Day 12) — `gate.reason` first, then template-tier counts, then the HEAD
 * run's per-page error/settleDegraded/probeBlindRegions flags. Takes the
 * HEAD `Report` alongside the `DiffResult` because that per-page detail
 * lives on the report, not the diff. Wired to `diff --format markdown`.
 */
export function renderDiffStepSummary(result: DiffResult, headReport: Report): string {
  return renderDiffStepSummaryImpl(result, headReport);
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
 * staleness against a report. `configPath` omitted discovers
 * `a11y-ratchet.config.{ts,js,json}`; no file found is not an error
 * (suppressions are opt-in). Staleness needs `report` — omitted, that check
 * is skipped and noted in `warnings`, not silently passed.
 */
export function checkConfig(configPath?: string, report?: Report): Promise<ConfigCheckResult> {
  return runCheckConfig(configPath, report, new Date());
}

/**
 * Map a config check to a process exit code (`01 §10`). Exit 2 for either
 * an invalid config or any expired suppression — two distinct triggers for
 * the one code the table assigns them, so CI can tell "your config is
 * broken" from "your gate passed" without a third code neither doc asks for.
 */
export function exitCodeForConfigCheck(result: ConfigCheckResult): ExitCode {
  return !result.valid || result.expired.length > 0 ? 2 : 0;
}

/* -------------------------------------------------------------------------- */
/* Baseline                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Drop entries from the baseline that no longer appear in `report`, keeping the
 * rest. Run locally and committed alongside the fix (`01 §11`).
 *
 * The library writes baselines. The GitHub Action never does — it fails the gate
 * and prints the command to run. Refuses under the same conditions `diff()`
 * does (engine drift, incompatible run config) — silently absorbing an
 * axe-core bump is `regenerateBaseline()`'s job, not this one's.
 */
export function updateBaseline(report: Report, baselinePath: string): Promise<Report> {
  return updateBaselineImpl(report, baselinePath);
}

/**
 * Replace the baseline wholesale from a fresh report, unconditionally — no
 * comparison against what's there now, no refusal. The path for an
 * axe-core bump (reviewers see the churn as a diff on the committed file)
 * and for creating the first baseline a project ever has.
 */
export function regenerateBaseline(report: Report, baselinePath: string): Promise<Report> {
  return regenerateBaselineImpl(report, baselinePath);
}

/**
 * Compare a committed baseline against a fresh report and report the drift.
 * Run on a schedule so a stale baseline surfaces as an issue, not a surprise.
 * Never writes anything — CI never writes to the repo; a caller whose gate
 * fails here should print the local `baseline update` command, not run it.
 */
export function checkBaseline(report: Report, baselinePath: string): Promise<DiffResult> {
  return checkBaselineImpl(report, baselinePath);
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
