/**
 * The terminal diff summary — `renderDiff({format: 'summary'})`. Same
 * relationship to `DiffResult` as `report/summary.ts` has to `Report`: a
 * flat, readable rendering, not the CI job-summary markdown (`01 §12`, Day
 * 12 — a distinct deliverable, not built here).
 */

import type { DiffResult, Finding, FindingPair } from '../types.js';

function findingLine(finding: Finding, label: string): string {
  return `  [${label}] ${finding.ruleId} — ${finding.url}  ·  ${finding.selector}`;
}

function pairLine(pair: FindingPair, label: string): string {
  return (
    `  [${label}] ${pair.to.ruleId} — ${pair.to.url}\n` +
    `      ${pair.from.identity.context.nearestLandmark} → ${pair.to.identity.context.nearestLandmark}` +
    (pair.from.impact !== pair.to.impact ? ` · impact ${pair.from.impact} → ${pair.to.impact}` : '')
  );
}

/** Renders a `DiffResult` as a plain-text terminal summary. */
export function renderDiffSummary(result: DiffResult): string {
  const { base, head, findings, gate, pages, engineDrift, incompatibleRunConfig } = result;

  const lines: string[] = [
    `a11y-ratchet — diff summary`,
    `  base: ${base.runId} (${base.startedAt}) · axe-core ${base.axeCoreVersion} · mode ${base.mode}`,
    `  head: ${head.runId} (${head.startedAt}) · axe-core ${head.axeCoreVersion} · mode ${head.mode}`,
    `  pages: ${pages.inBoth} in both, ${pages.onlyInBase.length} only in base, ` +
      `${pages.onlyInHead.length} only in head, ${pages.errored.length} errored`,
  ];

  if (engineDrift) lines.push('  ⚠ axe-core version drift (--allow-engine-drift was set)');
  for (const incompatibility of incompatibleRunConfig) {
    lines.push(`  ⚠ ${incompatibility.reason}: base=${incompatibility.base} head=${incompatibility.head}`);
  }

  lines.push('');
  lines.push(`Gate: ${gate.passed ? 'PASSED' : 'FAILED'} — ${gate.reason}`);
  for (const warning of gate.warnings) lines.push(`  ⚠ ${warning}`);

  const sections: Array<[string, string[]]> = [
    ['new', findings.new.map((f) => findingLine(f, 'new'))],
    ['fixed', findings.fixed.map((f) => findingLine(f, 'fixed'))],
    ['moved', findings.moved.map((p) => pairLine(p, 'moved'))],
    ['impact-changed', findings.impactChanged.map((p) => pairLine(p, 'impact-changed'))],
    ['unclassified', findings.unclassified.map((f) => findingLine(f, 'unclassified'))],
    [
      'unknown',
      findings.unknown.map((u) => `  [${u.reason}] ${u.finding.ruleId} — ${u.finding.url}`),
    ],
  ];

  for (const [title, entries] of sections) {
    if (entries.length === 0) continue;
    lines.push('', `${title} (${entries.length}):`, ...entries);
  }

  if (findings.persisting.length > 0) {
    lines.push('', `persisting: ${findings.persisting.length} (unchanged, not listed individually)`);
  }

  return lines.join('\n');
}
