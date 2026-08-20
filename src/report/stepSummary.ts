/**
 * `$GITHUB_STEP_SUMMARY` markdown for a diff (`01 §11`, `03 §Part 3.8`,
 * Day 12) — wired to the CLI's `diff --format markdown`, not to the
 * generic `renderDiff()`/`ReportFormat` surface (`index.ts`), because it
 * needs the HEAD run's per-page detail (`error`/`settleDegraded`/
 * `probeBlindRegions`) that a bare `DiffResult` does not carry - only the
 * URLs that changed page-set, not per-page flags for pages present in
 * both runs. `diff`'s CLI handler already has the parsed `head` `Report`
 * in scope from reading it off disk, so threading it through here is
 * free; forcing it through `ReportOptions` would distort the uniform
 * shape `renderReport()`/`renderDiff()` share for every other format.
 *
 * Order, fixed: `gate.reason` first (the one sentence most people will
 * ever read of a CI run), then template-tier counts with instance counts
 * (never a raw instance count standing in for "N violations" -
 * `report/diffTemplateGroups.ts`, shared with the HTML diff view), then
 * the per-page section - only pages carrying a flag, not a full page
 * table, so a summary for a 30-page crawl doesn't bury the two pages that
 * actually need a look under twenty-eight clean ones.
 */

import { groupFindingsByTemplate, groupPairsByTemplate } from './diffTemplateGroups.js';
import type { DiffResult, PageResult, Report } from '../types.js';

function plural(n: number): string {
  return n === 1 ? '' : 's';
}

function gateSection(result: DiffResult): string[] {
  const { gate, engineDrift, incompatibleRunConfig } = result;
  const lines = [`## Gate: ${gate.passed ? 'PASSED' : 'FAILED'}`, '', gate.reason];

  if (engineDrift) {
    lines.push('', '> ⚠ axe-core version drift (`--allow-engine-drift` was set).');
  }
  for (const incompatibility of incompatibleRunConfig) {
    lines.push('', `> ⚠ Incompatible run configuration: **${incompatibility.reason}** — base \`${incompatibility.base}\`, head \`${incompatibility.head}\`.`);
  }
  for (const warning of gate.warnings) {
    lines.push('', `> ⚠ ${warning}`);
  }
  return lines;
}

interface TemplateRow {
  label: string;
  templates: number;
  instances: number;
}

function templateRows(result: DiffResult): TemplateRow[] {
  const { findings } = result;
  return [
    { label: 'New', templates: groupFindingsByTemplate(findings.new).length, instances: findings.new.length },
    { label: 'Fixed', templates: groupFindingsByTemplate(findings.fixed).length, instances: findings.fixed.length },
    { label: 'Moved', templates: groupPairsByTemplate(findings.moved).length, instances: findings.moved.length },
    {
      label: 'Impact changed',
      templates: groupPairsByTemplate(findings.impactChanged).length,
      instances: findings.impactChanged.length,
    },
    {
      label: 'Unclassified',
      templates: groupFindingsByTemplate(findings.unclassified).length,
      instances: findings.unclassified.length,
    },
  ];
}

function templateTierSection(result: DiffResult): string[] {
  const rows = templateRows(result).filter((row) => row.instances > 0);
  const lines = ['', '## Template-tier changes'];

  const { persisting, unknown } = result.findings;
  if (rows.length === 0 && persisting.length === 0 && unknown.length === 0) {
    lines.push('', 'No finding changes between these two runs.');
    return lines;
  }

  if (rows.length > 0) {
    lines.push('', '| | Templates | Instances |', '|---|---:|---:|');
    for (const row of rows) {
      lines.push(`| ${row.label} | ${row.templates} | ${row.instances} |`);
    }
  }

  if (persisting.length > 0) {
    const templates = groupFindingsByTemplate(persisting).length;
    lines.push('', `Persisting: ${persisting.length} instance${plural(persisting.length)} across ${templates} template${plural(templates)} (unchanged, not listed individually).`);
  }
  if (unknown.length > 0) {
    const byReason = new Map<string, number>();
    for (const u of unknown) byReason.set(u.reason, (byReason.get(u.reason) ?? 0) + 1);
    const parts = [...byReason.entries()].map(([reason, count]) => `${count} ${reason}`).join(', ');
    lines.push('', `Unknown: ${unknown.length} finding${plural(unknown.length)} on pages that changed page-set or errored (${parts}).`);
  }

  return lines;
}

function pageFlags(page: PageResult): string[] {
  const flags: string[] = [];
  if (page.error) flags.push(`error: ${page.error.kind} — ${page.error.message}`);
  if (page.settleDegraded) flags.push('settle degraded (scanned before the page fully settled)');
  if (page.probeBlindRegions.length > 0) {
    flags.push(`${page.probeBlindRegions.length} probe-blind region${plural(page.probeBlindRegions.length)}`);
  }
  return flags;
}

function pagesSection(headReport: Report): string[] {
  const flagged = headReport.pages
    .map((page) => ({ page, flags: pageFlags(page) }))
    .filter((entry) => entry.flags.length > 0);

  if (flagged.length === 0) return [];

  const lines = ['', '## Pages needing a look', '', `${flagged.length} of ${headReport.pages.length} pages in this run carry a flag:`, '', '| URL | Flags |', '|---|---|'];
  for (const { page, flags } of flagged) {
    lines.push(`| ${page.url} | ${flags.join('; ')} |`);
  }
  return lines;
}

/** Renders a `DiffResult` (plus the HEAD run's own `Report`) as `$GITHUB_STEP_SUMMARY` markdown. */
export function renderDiffStepSummary(result: DiffResult, headReport: Report): string {
  return [...gateSection(result), ...templateTierSection(result), ...pagesSection(headReport)].join('\n');
}
