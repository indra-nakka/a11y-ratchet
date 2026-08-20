/**
 * Groups one diff bucket (a flat `Finding[]` for new/fixed/unclassified, a
 * `FindingPair[]` for moved/impact-changed) by `templateKey` (`01 §8`).
 *
 * Shared by every diff renderer that needs "N templates, M instances"
 * counts instead of a raw per-instance list: the HTML diff view
 * (`report/html/renderDiff.ts`, Day 11) and the CI job-summary markdown
 * (`report/stepSummary.ts`, Day 12). Kept format-agnostic (no HTML, no
 * markdown) so neither renderer re-derives the same grouping with its own
 * subtly different rounding of "highest impact wins."
 */

import type { Finding, FindingPair } from '../types.js';

export interface DiffTemplateGroup {
  templateKey: string;
  ruleId: string;
  bucket: Finding['bucket'];
  bestPractice: boolean;
  /** Highest impact among members - grouping must never hide a critical. */
  impact: Finding['impact'];
  criteria: Finding['criteria'];
  /** Display selector taken from the first member encountered. */
  exampleSelector: string;
  findings: Finding[];
  pairs: FindingPair[];
}

const IMPACT_RANK: Record<Finding['impact'], number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

function templateOf(finding: Finding): Pick<DiffTemplateGroup, 'templateKey' | 'ruleId' | 'bucket' | 'bestPractice' | 'impact' | 'criteria' | 'exampleSelector'> {
  return {
    templateKey: finding.templateKey,
    ruleId: finding.ruleId,
    bucket: finding.bucket,
    bestPractice: finding.bestPractice,
    impact: finding.impact,
    criteria: finding.criteria,
    exampleSelector: finding.selector,
  };
}

/** Groups a flat finding bucket (new / fixed / unclassified) by `templateKey`. */
export function groupFindingsByTemplate(findings: readonly Finding[]): DiffTemplateGroup[] {
  const byKey = new Map<string, DiffTemplateGroup>();
  for (const finding of findings) {
    const existing = byKey.get(finding.templateKey);
    if (existing) {
      existing.findings.push(finding);
      if (IMPACT_RANK[finding.impact] < IMPACT_RANK[existing.impact]) existing.impact = finding.impact;
    } else {
      byKey.set(finding.templateKey, { ...templateOf(finding), findings: [finding], pairs: [] });
    }
  }
  return [...byKey.values()];
}

/** Groups a pair bucket (moved / impact-changed) by the HEAD side's `templateKey`. */
export function groupPairsByTemplate(pairs: readonly FindingPair[]): DiffTemplateGroup[] {
  const byKey = new Map<string, DiffTemplateGroup>();
  for (const pair of pairs) {
    const existing = byKey.get(pair.to.templateKey);
    if (existing) {
      existing.pairs.push(pair);
      if (IMPACT_RANK[pair.to.impact] < IMPACT_RANK[existing.impact]) existing.impact = pair.to.impact;
    } else {
      byKey.set(pair.to.templateKey, { ...templateOf(pair.to), findings: [], pairs: [pair] });
    }
  }
  return [...byKey.values()];
}

export function diffGroupInstanceCount(group: DiffTemplateGroup): number {
  return group.findings.length + group.pairs.length;
}

export const DIFF_IMPACT_RANK = IMPACT_RANK;
