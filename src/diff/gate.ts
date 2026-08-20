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
    movedCount: findings.moved.length,
    fixedCount: findings.fixed.length,
  });

  return { passed, reason, countedAgainstGate, warnings };
}

interface ReasonInput {
  passed: boolean;
  gatingNew: Finding[];
  impactIncreased: { from: Finding; to: Finding }[];
  movedCount: number;
  fixedCount: number;
}

/** `gate.reason` must read like a sentence a person wrote (`§8`) - this is what most people will ever see of the tool. */
function buildReasonSentence(input: ReasonInput): string {
  const plural = (n: number): string => (n === 1 ? '' : 's');

  if (input.passed) {
    // No "Gate passed" prefix - `reason` is a standalone factual sentence,
    // same as the failing case below; callers (the CLI, a report) already
    // say pass/fail alongside it and shouldn't have to see it twice.
    const parts: string[] = [];
    if (input.movedCount > 0) parts.push(`${input.movedCount} moved`);
    if (input.fixedCount > 0) parts.push(`${input.fixedCount} fixed`);
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
    parts.push(
      `${input.gatingNew.length} new violation${plural(input.gatingNew.length)} on ${pageCount} page${plural(pageCount)}${criteriaSuffix}`,
    );
  }
  if (input.impactIncreased.length > 0) {
    parts.push(`${input.impactIncreased.length} impact increase${plural(input.impactIncreased.length)}`);
  }
  if (input.movedCount > 0) parts.push(`${input.movedCount} moved`);
  if (input.fixedCount > 0) parts.push(`${input.fixedCount} fixed`);

  return `${parts.join('; ')}.`;
}
