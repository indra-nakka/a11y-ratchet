/**
 * The self-contained diff HTML view (`01 §2`/`§7`: `report/html/`, Day 11 —
 * dropped from the Day 10 plan row by a bullet-list error, restored here).
 *
 * The Action's value IS the diff (README §7), so `gate.reason` — the one
 * sentence most people will ever read — sits at the very top, in a banner
 * whose colour repeats the pass/fail state redundantly for colour-blind
 * readers. Below it, findings are grouped at the TEMPLATE tier (`01 §8`),
 * same phrasing discipline as the terminal summary and the scan HTML
 * report: "N template defects (M instances)", never a raw instance count
 * standing in for "N violations". Five sections in a fixed order — new,
 * fixed, moved, impact-changed, persisting — plus unclassified and unknown
 * whenever non-empty, since those are exactly the categories `CLAUDE.md`
 * invariant 4 exists to keep visible rather than silently folded into
 * "new".
 */

import type {
  DiffFindings,
  DiffResult,
  Finding,
  FindingChange,
  FindingPair,
  UnknownFinding,
} from '../../types.js';
import { criteriaLabel, e, plural, sortByImpactDesc, STYLE } from './shared.js';

/* -------------------------------------------------------------------------- */
/* Template-tier grouping of one diff bucket                                  */
/* -------------------------------------------------------------------------- */

interface DiffTemplateGroup {
  templateKey: string;
  ruleId: string;
  bucket: Finding['bucket'];
  bestPractice: boolean;
  impact: Finding['impact'];
  criteria: Finding['criteria'];
  exampleSelector: string;
  findings: Finding[];
  pairs: FindingPair[];
}

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

function groupByTemplate(findings: readonly Finding[]): DiffTemplateGroup[] {
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

function groupPairsByTemplate(pairs: readonly FindingPair[]): DiffTemplateGroup[] {
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

const IMPACT_RANK: Record<Finding['impact'], number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

function instanceCount(group: DiffTemplateGroup): number {
  return group.findings.length + group.pairs.length;
}

/* -------------------------------------------------------------------------- */
/* Rendering one template group, either as flat findings or as pairs         */
/* -------------------------------------------------------------------------- */

function renderFindingInstance(finding: Finding): string {
  return `
    <li class="instance">
      <span class="badge badge-${e(finding.impact)}">${e(finding.impact)}</span>
      <code>${e(finding.ruleId)}</code>
      <code class="selector">${e(finding.selector)}</code>
      <a href="${e(finding.url)}">${e(finding.url)}</a>
      ${finding.accessibleName ? `<span class="muted">"${e(finding.accessibleName)}"</span>` : ''}
    </li>`;
}

function renderPairInstance(pair: FindingPair): string {
  const contextChanged = pair.from.identity.context.nearestLandmark !== pair.to.identity.context.nearestLandmark;
  const impactChanged = pair.from.impact !== pair.to.impact;
  return `
    <li class="instance">
      <span class="badge badge-${e(pair.to.impact)}">${e(pair.to.impact)}</span>
      <code>${e(pair.to.ruleId)}</code>
      <code class="selector">${e(pair.to.selector)}</code>
      <a href="${e(pair.to.url)}">${e(pair.to.url)}</a>
      ${
        contextChanged
          ? `<br /><span class="muted">${e(pair.from.identity.context.nearestLandmark)} <span class="pair-arrow">→</span> ${e(pair.to.identity.context.nearestLandmark)}</span>`
          : ''
      }
      ${
        impactChanged
          ? `<br /><span class="muted">impact ${e(pair.from.impact)} <span class="pair-arrow">→</span> ${e(pair.to.impact)}</span>`
          : ''
      }
    </li>`;
}

function renderTemplateGroup(group: DiffTemplateGroup, label: string): string {
  const count = instanceCount(group);
  const items =
    group.pairs.length > 0
      ? group.pairs.map(renderPairInstance).join('')
      : group.findings.map(renderFindingInstance).join('');
  return `
  <details class="template">
    <summary>
      <span class="badge badge-${e(group.impact)}">${e(group.impact)}</span>
      <strong>${e(group.ruleId)}</strong>
      — ${e(criteriaLabel(group))}
      <br />
      ${e(count)} ${e(label)} instance${plural(count)}
      <code class="selector">${e(group.exampleSelector)}</code>
    </summary>
    <ul class="instances">${items}</ul>
  </details>`;
}

function renderBucketSection(
  id: string,
  title: string,
  groups: DiffTemplateGroup[],
  label: string,
  description: string,
): string {
  if (groups.length === 0) return '';
  const ordered = sortByImpactDesc(groups, (g) => g.impact);
  const totalInstances = ordered.reduce((sum, g) => sum + instanceCount(g), 0);
  return `
  <section class="diff-section" aria-labelledby="${e(id)}-heading">
    <h2 id="${e(id)}-heading">${e(title)} (${e(ordered.length)} template${plural(ordered.length)}, ${e(totalInstances)} instance${plural(totalInstances)})</h2>
    <p class="muted">${e(description)}</p>
    ${ordered.map((g) => renderTemplateGroup(g, label)).join('')}
  </section>`;
}

/* -------------------------------------------------------------------------- */
/* Flat sections — unclassified, unknown: never folded into a template count */
/* -------------------------------------------------------------------------- */

function renderUnclassifiedSection(findings: readonly Finding[]): string {
  if (findings.length === 0) return '';
  const items = sortByImpactDesc([...findings], (f) => f.impact)
    .map(renderFindingInstance)
    .join('');
  return `
  <section class="diff-section" aria-labelledby="unclassified-heading">
    <h2 id="unclassified-heading">Unclassified (${e(findings.length)})</h2>
    <p class="muted">
      Could not be confidently matched to a base finding or classified as new
      (identity §7). Reported here rather than as "new" — a false regression is
      the failure this tool exists to avoid.
    </p>
    <ul class="instances">${items}</ul>
  </section>`;
}

function renderUnknownSection(unknown: readonly UnknownFinding[]): string {
  if (unknown.length === 0) return '';
  const items = unknown
    .map(
      (u) => `
    <li class="instance">
      <span class="flag flag-warn">${e(u.reason)}</span>
      <strong>${e(u.finding.ruleId)}</strong>
      <a href="${e(u.finding.url)}">${e(u.finding.url)}</a>
    </li>`,
    )
    .join('');
  return `
  <section class="diff-section" aria-labelledby="unknown-heading">
    <h2 id="unknown-heading">Unknown (${e(unknown.length)})</h2>
    <p class="muted">Findings on pages that only exist in one run, or that errored in one run and not the other.</p>
    <ul class="instances">${items}</ul>
  </section>`;
}

function renderPersistingNote(findings: readonly Finding[]): string {
  if (findings.length === 0) return '';
  const templates = new Set(findings.map((f) => f.templateKey)).size;
  return `
  <section class="diff-section" aria-labelledby="persisting-heading">
    <h2 id="persisting-heading">Persisting</h2>
    <p class="persisting-note">${e(findings.length)} instance${plural(findings.length)} across ${e(templates)} template${plural(templates)} unchanged since base — not listed individually.</p>
  </section>`;
}

/* -------------------------------------------------------------------------- */
/* Header: gate banner, run identity, page-set and config warnings           */
/* -------------------------------------------------------------------------- */

function renderGateBanner(gate: DiffResult['gate']): string {
  const cls = gate.passed ? 'gate-passed' : 'gate-failed';
  const status = gate.passed ? 'PASSED' : 'FAILED';
  const warnings = gate.warnings.map((w) => `<li>${e(w)}</li>`).join('');
  return `
  <div class="gate-banner ${cls}" role="status">
    <strong>Gate: ${e(status)}</strong> — ${e(gate.reason)}
    ${warnings ? `<ul>${warnings}</ul>` : ''}
  </div>`;
}

function renderRunHeader(result: DiffResult): string {
  const { base, head, engineDrift, incompatibleRunConfig, pages } = result;
  const incompatibilities = incompatibleRunConfig
    .map((i) => `<li>${e(i.reason)}: base=${e(i.base)} head=${e(i.head)}</li>`)
    .join('');
  return `
  <header>
    <h1>a11y-ratchet diff</h1>
    <p class="muted">
      base ${e(base.runId)} (${e(base.startedAt)}) · axe-core ${e(base.axeCoreVersion)} · mode ${e(base.mode)}
      <span class="pair-arrow">→</span>
      head ${e(head.runId)} (${e(head.startedAt)}) · axe-core ${e(head.axeCoreVersion)} · mode ${e(head.mode)}
    </p>
    <p class="muted">
      pages: ${e(pages.inBoth)} in both, ${e(pages.onlyInBase.length)} only in base,
      ${e(pages.onlyInHead.length)} only in head, ${e(pages.errored.length)} errored
    </p>
    ${engineDrift ? '<p class="flag flag-warn">axe-core version drift (--allow-engine-drift was set).</p>' : ''}
    ${incompatibilities ? `<ul class="blind-regions">${incompatibilities}</ul>` : ''}
    ${renderGateBanner(result.gate)}
  </header>`;
}

/* -------------------------------------------------------------------------- */
/* Top level                                                                  */
/* -------------------------------------------------------------------------- */

const SECTION_DESCRIPTIONS: Record<Exclude<FindingChange, 'persisting'>, string> = {
  new: 'Present in head, not matched to anything in base.',
  fixed: 'Present in base, not matched to anything in head.',
  moved: 'Matched across runs by fuzzy signal, not exact identity — the element likely moved or was restructured, not newly broken.',
  'impact-changed': 'The same element, matched across runs, with a different impact rating.',
  unclassified: 'Could not be confidently matched or classified.',
};

/**
 * Renders a full `DiffResult` as one self-contained HTML string, in the
 * same no-JavaScript, inlined-CSS style as the scan report (`render.ts`).
 */
export function renderDiffHtml(result: DiffResult): string {
  const findings: DiffFindings = result.findings;

  const sections = [
    renderBucketSection('new', 'New', groupByTemplate(findings.new), 'new', SECTION_DESCRIPTIONS.new),
    renderBucketSection('fixed', 'Fixed', groupByTemplate(findings.fixed), 'fixed', SECTION_DESCRIPTIONS.fixed),
    renderBucketSection('moved', 'Moved', groupPairsByTemplate(findings.moved), 'moved', SECTION_DESCRIPTIONS.moved),
    renderBucketSection(
      'impact-changed',
      'Impact changed',
      groupPairsByTemplate(findings.impactChanged),
      'impact-changed',
      SECTION_DESCRIPTIONS['impact-changed'],
    ),
    renderUnclassifiedSection(findings.unclassified),
    renderUnknownSection(findings.unknown),
    renderPersistingNote(findings.persisting),
  ].join('');

  const allEmpty =
    findings.new.length === 0 &&
    findings.fixed.length === 0 &&
    findings.moved.length === 0 &&
    findings.impactChanged.length === 0 &&
    findings.unclassified.length === 0 &&
    findings.unknown.length === 0 &&
    findings.persisting.length === 0;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>a11y-ratchet diff — ${e(result.head.runId)}</title>
<style>${STYLE}</style>
</head>
<body>
${renderRunHeader(result)}
<main>
${allEmpty ? '<p>No page-set or finding changes between these two runs.</p>' : sections}
</main>
<footer>
<p>Generated by a11y-ratchet. Automated results only — not a conformance claim, not a VPAT, not a legal defence.</p>
</footer>
</body>
</html>
`;
}
