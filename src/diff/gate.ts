/**
 * Gate semantics (`02 §8`), implemented exactly against the table:
 *
 * | Category | Gates | Rationale |
 * |---|---|---|
 * | `new` (violation, source=axe, !bestPractice) | yes | the core contract |
 * | `new` (needs-review) | no | inconclusive by definition |
 * | `new` (source=probe) | no | heuristic |
 * | `impact-changed`, severity increased | yes | e.g. moderate -> critical |
 * | `impact-changed`, severity decreased | no | improvement |
 * | `moved` | no | same defect, different place |
 * | `unknown-page-added` | per `newPagePolicy` (default warn) | |
 * | `unknown-page-removed` / `-error` | no | surfaced prominently |
 *
 * Suppression is applied here, at the gate, never at match time
 * (`DECISIONS.md` D13) — `diff/match.ts` pools suppressed findings in with
 * everything else, so a finding that was suppressed between runs still
 * matches correctly instead of reading as `fixed`. This is the one place
 * that filters them back out of what counts against the gate.
 */

import type { DiffFindings, DiffGate, Finding, Impact, NewPagePolicy } from '../types.js';

const IMPACT_SEVERITY: Record<Impact, number> = { minor: 0, moderate: 1, serious: 2, critical: 3 };

export interface GateOptions {
  newPagePolicy: NewPagePolicy;
}

function gates(finding: Finding): boolean {
  return finding.bucket === 'violation' && finding.source === 'axe' && !finding.bestPractice && !finding.suppressed;
}

export function computeGate(findings: DiffFindings, options: GateOptions): DiffGate {
  const warnings: string[] = [];

  const gatingNew = findings.new.filter(gates);

  const impactIncreased = findings.impactChanged.filter(
    (pair) => !pair.to.suppressed && IMPACT_SEVERITY[pair.to.impact] > IMPACT_SEVERITY[pair.from.impact],
  );

  const unknownPageAdded = findings.unknown.filter((u) => u.reason === 'page-added');
  const unknownPageOther = findings.unknown.filter((u) => u.reason !== 'page-added');

  let unknownAddedGates = false;
  if (unknownPageAdded.length > 0) {
    const pageCount = new Set(unknownPageAdded.map((u) => u.finding.url)).size;
    if (options.newPagePolicy === 'fail') {
      unknownAddedGates = true;
    } else if (options.newPagePolicy === 'warn') {
      warnings.push(
        `${unknownPageAdded.length} finding(s) on ${pageCount} page(s) present only in this run (newPagePolicy: warn)`,
      );
    }
    // 'ignore': neither gates nor warns.
  }

  if (unknownPageOther.length > 0) {
    const pageCount = new Set(unknownPageOther.map((u) => u.finding.url)).size;
    warnings.push(`${unknownPageOther.length} finding(s) on ${pageCount} page(s) removed or errored between runs`);
  }

  const passed = gatingNew.length === 0 && impactIncreased.length === 0 && !unknownAddedGates;
  const countedAgainstGate = gatingNew.length + impactIncreased.length + (unknownAddedGates ? unknownPageAdded.length : 0);

  const reason = buildReasonSentence({
    passed,
    gatingNew,
    impactIncreased,
    moved: findings.moved,
    fixed: findings.fixed,
  });

  return { passed, reason, countedAgainstGate, warnings };
}

interface ReasonInput {
  passed: boolean;
  gatingNew: Finding[];
  impactIncreased: { from: Finding; to: Finding }[];
  moved: { from: Finding; to: Finding }[];
  fixed: Finding[];
}

/**
 * `gate.reason` counts at TEMPLATE level, with instance counts alongside
 * (`01 §8`, Day 10) - "1 new template defect (43 instances)", never "43 new
 * violations". A gate that reports raw finding counts for a page whose
 * catalogue template regressed once reads as a 43-violation catastrophe;
 * it is one bug, still one bug at 43 pages. `countedAgainstGate` (above) is
 * unaffected by this - the gate still counts and blocks on every individual
 * finding, this only changes what the SENTENCE says about that count.
 */
function buildReasonSentence(input: ReasonInput): string {
  if (input.passed) {
    // No "Gate passed" prefix - `reason` is a standalone factual sentence,
    // same as the failing case below; callers (the CLI, a report) already
    // say pass/fail alongside it and shouldn't have to see it twice.
    const parts = [
      describeTemplateCount('moved template', input.moved.map((pair) => pair.to.templateKey)),
      describeTemplateCount('fixed template', input.fixed.map((f) => f.templateKey)),
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? `${parts.join('; ')}.` : 'No new violations.';
  }

  const criteria = new Set<string>();
  for (const finding of input.gatingNew) {
    for (const criterion of finding.criteria) criteria.add(criterion.id);
  }
  const pageCount = new Set([
    ...input.gatingNew.map((f) => f.url),
    ...input.impactIncreased.map((pair) => pair.to.url),
  ]).size;

  const parts: string[] = [];
  if (input.gatingNew.length > 0) {
    const criteriaSuffix = criteria.size > 0 ? ` (${[...criteria].sort().join(', ')})` : '';
    const plural = (n: number): string => (n === 1 ? '' : 's');
    parts.push(
      `${describeTemplateCount('new template defect', input.gatingNew.map((f) => f.templateKey))} on ` +
        `${pageCount} page${plural(pageCount)}${criteriaSuffix}`,
    );
  }
  const impactPart = describeTemplateCount(
    'template impact increase',
    input.impactIncreased.map((pair) => pair.to.templateKey),
  );
  if (impactPart) parts.push(impactPart);
  const movedPart = describeTemplateCount('moved template', input.moved.map((pair) => pair.to.templateKey));
  if (movedPart) parts.push(movedPart);
  const fixedPart = describeTemplateCount('fixed template', input.fixed.map((f) => f.templateKey));
  if (fixedPart) parts.push(fixedPart);

  return `${parts.join('; ')}.`;
}

/**
 * `"1 new template defect (43 instances)"` - `label` is already the
 * singular noun phrase ("new template defect", "fixed template"); this
 * pluralises it and appends the instance count. `null` when `templateKeys`
 * is empty, so callers can `.filter(Boolean)` without an empty `"0 ..."`
 * clause ever reaching the sentence.
 */
function describeTemplateCount(label: string, templateKeys: readonly string[]): string | null {
  if (templateKeys.length === 0) return null;
  const plural = (n: number): string => (n === 1 ? '' : 's');
  const templateCount = new Set(templateKeys).size;
  const instanceCount = templateKeys.length;
  return `${templateCount} ${label}${plural(templateCount)} (${instanceCount} instance${plural(instanceCount)})`;
}
