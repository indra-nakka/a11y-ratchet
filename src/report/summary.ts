/**
 * The terminal summary (`01 §2`: `report/summary.ts`).
 *
 * Defaults to the TEMPLATE tier (`01 §8`, Day 10's `Report.templateGroups`)
 * - one line per templated defect, with an instance count alongside, same
 * phrasing as `gate.reason` ("1 new template defect (43 instances)" never
 * "43 violations"). `--ungrouped` (`ReportOptions.ungrouped`) falls back to
 * the original flat, one-block-per-finding view, worst impact first.
 */

import type { Finding, Impact, Report, TemplateGroup } from '../types.js';

const IMPACT_ORDER: Record<Impact, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const BUCKET_ORDER = { violation: 0, 'needs-review': 1 } as const;

function findingSortKey(finding: Finding): [number, number, string] {
  // Best-practice findings sort after their bucket-mates - they never gate,
  // so they belong at the bottom of the same bucket rather than mixed in.
  const bucketRank = BUCKET_ORDER[finding.bucket] + (finding.bestPractice ? 0.5 : 0);
  return [bucketRank, IMPACT_ORDER[finding.impact], finding.ruleId];
}

function compareFindings(a: Finding, b: Finding): number {
  const keyA = findingSortKey(a);
  const keyB = findingSortKey(b);
  for (let i = 0; i < keyA.length; i += 1) {
    if (keyA[i]! < keyB[i]!) return -1;
    if (keyA[i]! > keyB[i]!) return 1;
  }
  return 0;
}

function findingLabel(finding: Finding): string {
  const tag = finding.bestPractice ? 'best-practice' : finding.bucket;
  return `[${finding.impact}/${tag}]`;
}

function criteriaLabel(finding: { criteria: Finding['criteria']; bestPractice: boolean }): string {
  if (finding.criteria.length === 0) {
    return finding.bestPractice ? 'best practice — not a WCAG failure' : 'no SC mapped';
  }
  return finding.criteria.map((criterion) => `${criterion.id} ${criterion.title} [${criterion.level}]`).join(', ');
}

function renderFinding(finding: Finding): string {
  const lines = [
    `${findingLabel(finding)} ${finding.ruleId} — ${criteriaLabel(finding)}`,
    `  ${finding.url}  ·  ${finding.selector}`,
    `  ${finding.remediation}`,
  ];
  return lines.join('\n');
}

const MAX_EXAMPLE_URLS = 3;

function exampleUrlsLine(urls: readonly string[]): string {
  const shown = urls.slice(0, MAX_EXAMPLE_URLS);
  const rest = urls.length - shown.length;
  return `  Examples: ${shown.join(', ')}${rest > 0 ? `  (+${rest} more)` : ''}`;
}

function templateLabel(template: TemplateGroup): string {
  const tag = template.bestPractice ? 'best-practice' : template.bucket;
  return `[${template.impact}/${tag}]`;
}

function renderTemplate(template: TemplateGroup): string {
  const plural = (n: number): string => (n === 1 ? '' : 's');
  const lines = [
    `${templateLabel(template)} ${template.ruleId} — ${criteriaLabel(template)}`,
    `  ${template.groupKeys.length} template defect${plural(template.groupKeys.length)} ` +
      `(${template.instanceCount} instance${plural(template.instanceCount)}) on ${template.pageCount} page${plural(template.pageCount)}`,
    `  ${template.exampleSelector}`,
    exampleUrlsLine(template.urls),
  ];
  return lines.join('\n');
}

function templateSortKey(template: TemplateGroup): [number, number, string] {
  const bucketRank = BUCKET_ORDER[template.bucket] + (template.bestPractice ? 0.5 : 0);
  return [bucketRank, IMPACT_ORDER[template.impact], template.ruleId];
}

function compareTemplates(a: TemplateGroup, b: TemplateGroup): number {
  const keyA = templateSortKey(a);
  const keyB = templateSortKey(b);
  for (let i = 0; i < keyA.length; i += 1) {
    if (keyA[i]! < keyB[i]!) return -1;
    if (keyA[i]! > keyB[i]!) return 1;
  }
  return 0;
}

/**
 * `tier: N (pct%)` for each of the 5 tiers, worst (5) first. A standing
 * output (`DECISIONS.md` D38), not a one-off investigation artefact — a run
 * landing mostly at tiers 4-5 is exactly the signal that should be visible
 * every time, not only when someone remembers to go looking for it.
 */
function tierDistributionLine(byTier: Record<number, number>, total: number): string {
  const parts = [5, 4, 3, 2, 1].map((tier) => {
    const count = byTier[tier] ?? 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return `${tier}:${count} (${pct}%)`;
  });
  return `  identity tiers (5→1): ${parts.join(' · ')}`;
}

export interface SummaryOptions {
  /** Flat, one-block-per-finding view instead of the default template-tier grouping (`01 §8`). */
  ungrouped?: boolean;
}

/** Renders a full `Report` as a plain-text terminal summary. */
export function renderSummary(report: Report, options: SummaryOptions = {}): string {
  const { tool, run, pages, findings, summary } = report;

  const header = [
    `${tool.name} ${tool.version} — scan summary`,
    `  tool: axe-core ${tool.axeCoreVersion} · ${tool.browser} ${tool.browserVersion} · mode ${run.mode}`,
    `  pages: ${summary.pages.scanned} scanned, ${summary.pages.errored} errored, ${summary.pages.total} total`,
    `  findings: ${summary.findings.violation} violation · ${summary.findings.needsReview} needs-review · ` +
      `${summary.findings.bestPractice} best-practice (${summary.findings.suppressed} suppressed)`,
    tierDistributionLine(summary.findings.byTier, summary.findings.total),
  ].join('\n');

  const erroredPages = pages.filter((page) => page.error);
  const errorLines = erroredPages.map((page) => `  ! ${page.url} — ${page.error?.kind}: ${page.error?.message}`);

  if (findings.length === 0) {
    return [header, ...errorLines, '', 'No findings.'].join('\n');
  }

  if (options.ungrouped) {
    const body = [...findings].sort(compareFindings).map(renderFinding).join('\n\n');
    return [header, ...errorLines, '', body].join('\n');
  }

  const templates = Object.values(report.templateGroups).sort(compareTemplates);
  if (templates.length === 0) {
    // Every finding is suppressed - templateGroups excludes them (identity/
    // group.ts), so "no findings to act on" is accurate even though
    // `findings` itself is non-empty (CLAUDE.md invariant 2: still counted
    // above, in `summary.findings.suppressed`, never silently absent).
    return [header, ...errorLines, '', 'No findings (all suppressed).'].join('\n');
  }
  const body = templates.map(renderTemplate).join('\n\n');
  return [header, ...errorLines, '', `Grouped by template (${templates.length} distinct; --ungrouped for the flat list):`, '', body].join('\n');
}
