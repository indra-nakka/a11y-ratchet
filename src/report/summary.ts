/**
 * The terminal summary (`01 §2`: `report/summary.ts`).
 *
 * No grouped view yet — `Report.groups` is the Day 4/6 placeholder `{}`
 * (`scan/run.ts`), and a grouped renderer over an empty index would just be
 * a flat list with extra steps. This renders the flat list directly: one
 * block per finding, bucket then impact then rule id, so the worst findings
 * lead. `--ungrouped`'s flat view (`01 §8`) becomes this same renderer once
 * grouping exists — nothing here needs to change for that.
 */

import type { Finding, Impact, Report } from '../types.js';

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

function criteriaLabel(finding: Finding): string {
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

/** Renders a full `Report` as a plain-text terminal summary. */
export function renderSummary(report: Report): string {
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

  const body = [...findings].sort(compareFindings).map(renderFinding).join('\n\n');

  return [header, ...errorLines, '', body].join('\n');
}
