/**
 * The self-contained HTML report (`01 §2`: `report/html/`).
 *
 * Report polish is cut line #1 (`00 §7`) — a plain, readable, correct
 * grouped table beats a filterable one that ships late. One file, inlined
 * CSS, no CDN, no client-side script, no build step: every interactive
 * bit (expand a template to its groups, a group to its instances,
 * suppressed findings) is a native `<details>`/`<summary>` disclosure
 * widget, which is also why this needs no JavaScript to be keyboard- and
 * screen-reader-operable in the first place (`00 §7` never cuts "the
 * report's own accessibility").
 *
 * Defaults to the TEMPLATE tier (`01 §8`) — one row per `templateKey`,
 * expandable to its `groupKey`s, each expandable to its individual
 * instances. Suppressed findings never appear in that tree (they do not
 * gate and are not "defects to look at" in the same sense); they get their
 * own collapsed section instead, with `reason`/`category`/`owner`/`expires`
 * always visible once opened - tagged and retained, never dropped
 * (`CLAUDE.md` invariant 2).
 */

import type {
  Finding,
  FindingGroup,
  PageResult,
  Report,
  TemplateGroup,
} from '../../types.js';

/** Every dynamic value that reaches the page goes through this - a raw `<`/`&`/`"` from real page content must never break the report's own markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function e(value: string | number): string {
  return escapeHtml(String(value));
}

const IMPACT_ORDER: Record<Finding['impact'], number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

function sortByImpactDesc<T>(items: readonly T[], impactOf: (item: T) => Finding['impact']): T[] {
  return [...items].sort((a, b) => IMPACT_ORDER[impactOf(a)] - IMPACT_ORDER[impactOf(b)]);
}

function criteriaLabel(finding: { criteria: Finding['criteria']; bestPractice: boolean }): string {
  if (finding.criteria.length === 0) {
    return finding.bestPractice ? 'best practice — not a WCAG failure' : 'no SC mapped';
  }
  return finding.criteria.map((c) => `${c.id} ${c.title} [${c.level}]`).join(', ');
}

/* -------------------------------------------------------------------------- */
/* Findings tree: template -> group -> instance                              */
/* -------------------------------------------------------------------------- */

function renderInstance(finding: Finding): string {
  return `
    <li class="instance">
      <span class="badge badge-${e(finding.impact)}">${e(finding.impact)}</span>
      <code class="selector">${e(finding.selector)}</code>
      <a href="${e(finding.url)}">${e(finding.url)}</a>
      ${finding.accessibleName ? `<span class="muted">"${e(finding.accessibleName)}"</span>` : ''}
      <pre class="html-snippet">${e(finding.html)}</pre>
      <p class="remediation">${e(finding.remediation)}</p>
    </li>`;
}

function renderGroup(group: FindingGroup, instances: readonly Finding[]): string {
  const name = group.accessibleName ?? group.exampleSelector;
  return `
  <details class="group">
    <summary>
      <code class="selector">${e(group.exampleSelector)}</code>
      ${group.accessibleName ? `"${e(group.accessibleName)}"` : ''}
      — ${e(group.pageCount)} page${group.pageCount === 1 ? '' : 's'},
      ${e(group.uniqueElementCount)} distinct shape${group.uniqueElementCount === 1 ? '' : 's'}
    </summary>
    <ul class="instances" aria-label="Instances of ${e(name)}">
      ${instances.map(renderInstance).join('')}
    </ul>
  </details>`;
}

function renderTemplate(template: TemplateGroup, report: Report): string {
  const groups = template.groupKeys
    .map((key) => report.groups[key])
    .filter((g): g is FindingGroup => g !== undefined);
  const findingsByGroup = new Map<string, Finding[]>();
  for (const finding of report.findings) {
    if (finding.templateKey !== template.templateKey || finding.suppressed) continue;
    const bucket = findingsByGroup.get(finding.groupKey) ?? [];
    bucket.push(finding);
    findingsByGroup.set(finding.groupKey, bucket);
  }

  return `
  <details class="template" open>
    <summary>
      <span class="badge badge-${e(template.impact)}">${e(template.impact)}</span>
      <strong>${e(template.ruleId)}</strong>
      — ${e(criteriaLabel(template))}
      <br />
      ${e(template.groupKeys.length)} template defect${template.groupKeys.length === 1 ? '' : 's'}
      (${e(template.instanceCount)} instance${template.instanceCount === 1 ? '' : 's'})
      on ${e(template.pageCount)} page${template.pageCount === 1 ? '' : 's'}
    </summary>
    <div class="template-body">
      ${groups.map((g) => renderGroup(g, findingsByGroup.get(g.groupKey) ?? [])).join('')}
    </div>
  </details>`;
}

function renderFindingsSection(report: Report): string {
  const templates = Object.values(report.templateGroups);
  if (templates.length === 0) {
    return `<section aria-labelledby="findings-heading"><h2 id="findings-heading">Findings</h2><p>No findings.</p></section>`;
  }
  const ordered = sortByImpactDesc(templates, (t) => t.impact);
  return `
  <section aria-labelledby="findings-heading">
    <h2 id="findings-heading">Findings</h2>
    <p class="muted">Grouped by template (${e(ordered.length)} distinct). Expand a template for its groups, a group for its individual instances.</p>
    ${ordered.map((t) => renderTemplate(t, report)).join('')}
  </section>`;
}

/* -------------------------------------------------------------------------- */
/* Suppressed findings — visible, never dropped                              */
/* -------------------------------------------------------------------------- */

function renderSuppressedRow(finding: Finding): string {
  const s = finding.suppressed!;
  return `
    <tr class="${s.expired ? 'expired' : ''}">
      <td>${e(finding.ruleId)}</td>
      <td><code class="selector">${e(finding.selector)}</code></td>
      <td><a href="${e(finding.url)}">${e(finding.url)}</a></td>
      <td>${e(s.category)}</td>
      <td>${e(s.justification)}</td>
      <td>${e(s.owner)}</td>
      <td>${e(s.expires)}${s.expired ? ' <strong>(expired)</strong>' : ''}</td>
      <td>${e(s.ruleRef)}</td>
    </tr>`;
}

function renderSuppressedSection(report: Report): string {
  const suppressed = report.findings.filter((f) => f.suppressed);
  if (suppressed.length === 0) return '';
  return `
  <section aria-labelledby="suppressed-heading">
    <details class="suppressed">
      <summary><h2 id="suppressed-heading" class="inline-heading">Suppressed (${e(suppressed.length)})</h2></summary>
      <table>
        <caption class="visually-hidden">Suppressed findings, with reason, category, owner and expiry</caption>
        <thead>
          <tr><th scope="col">Rule</th><th scope="col">Selector</th><th scope="col">Page</th><th scope="col">Category</th><th scope="col">Reason</th><th scope="col">Owner</th><th scope="col">Expires</th><th scope="col">Config id</th></tr>
        </thead>
        <tbody>
          ${suppressed.map(renderSuppressedRow).join('')}
        </tbody>
      </table>
    </details>
  </section>`;
}

/* -------------------------------------------------------------------------- */
/* Pages — settleDegraded and probeBlindRegions surfaced, never silent       */
/* -------------------------------------------------------------------------- */

function renderBlindRegions(page: PageResult): string {
  if (page.probeBlindRegions.length === 0) return '';
  const items = page.probeBlindRegions
    .map(
      (region) =>
        `<li><code class="selector">${e(region.selector)}</code> — ${e(region.reason)} (unevaluated: ${e(region.unevaluatedCriteria.join(', '))})</li>`,
    )
    .join('');
  return `<ul class="blind-regions" aria-label="Probe-blind regions on this page">${items}</ul>`;
}

function renderPageRow(page: PageResult): string {
  const flags: string[] = [];
  if (page.settleDegraded) {
    flags.push('<span class="flag flag-warn">settle degraded — may have been scanned before it fully settled (e.g. before fonts rendered)</span>');
  }
  if (page.probeBlindRegions.length > 0) {
    flags.push(
      `<span class="flag flag-warn">${e(page.probeBlindRegions.length)} probe-blind region${page.probeBlindRegions.length === 1 ? '' : 's'} (closed shadow root)</span>`,
    );
  }
  if (page.error) {
    flags.push(`<span class="flag flag-error">${e(page.error.kind)}: ${e(page.error.message)}</span>`);
  }

  return `
    <tr>
      <td><a href="${e(page.url)}">${e(page.url)}</a></td>
      <td>${e(page.depth)}</td>
      <td>${page.error ? '—' : `${e(page.counts.violation)} / ${e(page.counts.needsReview)} / ${e(page.counts.bestPractice)}`}</td>
      <td>${flags.join('<br />') || '—'}${renderBlindRegions(page)}</td>
    </tr>`;
}

function renderPagesSection(report: Report): string {
  return `
  <section aria-labelledby="pages-heading">
    <h2 id="pages-heading">Pages (${e(report.pages.length)})</h2>
    <table>
      <caption class="visually-hidden">Every page attempted, including errored ones, with per-page counts and flags</caption>
      <thead>
        <tr><th scope="col">URL</th><th scope="col">Depth</th><th scope="col">Violation / needs-review / best-practice</th><th scope="col">Flags</th></tr>
      </thead>
      <tbody>
        ${report.pages.map(renderPageRow).join('')}
      </tbody>
    </table>
  </section>`;
}

/* -------------------------------------------------------------------------- */
/* Summary — including tier distribution, a confidence signal (D38)          */
/* -------------------------------------------------------------------------- */

function renderTierRow(tier: number, count: number, total: number): string {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return `<tr><th scope="row">Tier ${e(tier)}</th><td>${e(count)}</td><td>${e(pct)}%</td></tr>`;
}

function renderSummarySection(report: Report): string {
  const { summary, run } = report;
  return `
  <section aria-labelledby="summary-heading">
    <h2 id="summary-heading">Summary</h2>
    <dl class="summary-grid">
      <div><dt>Pages</dt><dd>${e(summary.pages.scanned)} scanned, ${e(summary.pages.errored)} errored, ${e(summary.pages.total)} total</dd></div>
      <div><dt>Violations</dt><dd>${e(summary.findings.violation)}</dd></div>
      <div><dt>Needs review</dt><dd>${e(summary.findings.needsReview)}</dd></div>
      <div><dt>Best practice</dt><dd>${e(summary.findings.bestPractice)}</dd></div>
      <div><dt>Suppressed</dt><dd>${e(summary.findings.suppressed)}</dd></div>
      <div><dt>Groups</dt><dd>${e(summary.groups)}</dd></div>
      <div><dt>Template groups</dt><dd>${e(summary.templateGroups)}</dd></div>
      <div><dt>Probe-blind regions</dt><dd>${e(summary.probeBlindRegions)}</dd></div>
      <div><dt>Mode</dt><dd>${e(run.mode)}</dd></div>
    </dl>
    <h3>Identity tier distribution</h3>
    <p class="muted">Which tier each finding's identity resolved to (02 §3.1) — a confidence signal, not just a diagnostic. A run landing mostly at tiers 4-5 means most identity is structural position, not a name or an id, and is worth a second look.</p>
    <table>
      <caption class="visually-hidden">Count and percentage of findings at each identity tier, 1 (strongest) to 5 (weakest)</caption>
      <thead><tr><th scope="col">Tier</th><th scope="col">Count</th><th scope="col">Share</th></tr></thead>
      <tbody>
        ${[1, 2, 3, 4, 5].map((tier) => renderTierRow(tier, summary.findings.byTier[tier as 1 | 2 | 3 | 4 | 5] ?? 0, summary.findings.total)).join('')}
      </tbody>
    </table>
  </section>`;
}

function renderHeader(report: Report): string {
  const { tool, run } = report;
  return `
  <header>
    <h1>${e(tool.name)} report</h1>
    <p class="muted">
      ${e(tool.version)} · axe-core ${e(tool.axeCoreVersion)} · ${e(tool.browser)} ${e(tool.browserVersion)} ·
      mode <strong>${e(run.mode)}</strong> · started ${e(run.startedAt)} · ${e(Math.round(run.durationMs / 1000))}s
    </p>
    <p class="muted">${e(run.baseUrl)}</p>
    ${
      run.bypassCSP
        ? '<p class="flag flag-warn">This run ignored the scanned pages\' own Content-Security-Policy (--bypass-csp).</p>'
        : ''
    }
    <p class="disclaimer">
      This tool detects a minority of accessibility defects (automated tools catch roughly
      30-40% of WCAG failures). A page with no findings here is not a conformance claim.
    </p>
  </header>`;
}

const STYLE = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 1.5rem; max-width: 64rem; margin-inline: auto;
    background: #ffffff; color: #1a1a1a;
    font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
    font-size: 16px; line-height: 1.6;
  }
  h1, h2, h3 { line-height: 1.25; }
  a { color: #0b4f9e; }
  a:focus-visible, summary:focus-visible, details:focus-visible {
    outline: 3px solid #0b4f9e; outline-offset: 2px;
  }
  .muted { color: #3f3f3f; }
  .disclaimer { border-left: 4px solid #6b6b6b; padding-left: 0.75rem; }
  .inline-heading { display: inline; }
  table { border-collapse: collapse; width: 100%; margin: 0.75rem 0 1.5rem; }
  caption { text-align: left; }
  th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #d6d6d6; }
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 0.5rem 1.5rem; }
  .summary-grid dt { font-weight: bold; }
  .summary-grid dd { margin: 0; }
  details.template { border: 1px solid #d6d6d6; border-radius: 4px; margin-bottom: 0.75rem; padding: 0.5rem 0.75rem; }
  details.template > summary { cursor: pointer; font-size: 1.05rem; }
  .template-body { margin-top: 0.5rem; padding-left: 1rem; border-left: 2px solid #e2e2e2; }
  details.group { margin: 0.5rem 0; padding: 0.4rem 0.6rem; background: #f7f7f7; border-radius: 4px; }
  details.group > summary { cursor: pointer; }
  ul.instances { list-style: none; padding-left: 0; }
  li.instance { padding: 0.5rem; border-top: 1px solid #e2e2e2; }
  li.instance:first-child { border-top: none; }
  .selector { background: #eef1f5; padding: 0.1rem 0.3rem; border-radius: 3px; }
  .html-snippet { white-space: pre-wrap; word-break: break-word; background: #f4f4f4; padding: 0.5rem; border-radius: 4px; font-size: 0.85rem; }
  .remediation { margin: 0.3rem 0 0; }
  .badge { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 999px; font-size: 0.8rem; font-weight: bold; color: #ffffff; }
  .badge-critical { background: #7a0d1a; }
  .badge-serious { background: #a33b00; }
  .badge-moderate { background: #6b5300; }
  .badge-minor { background: #4d4d4d; }
  .flag { display: inline-block; font-size: 0.85rem; padding: 0.1rem 0.4rem; border-radius: 3px; }
  .flag-warn { background: #fff3cd; color: #6b5300; }
  .flag-error { background: #fbdada; color: #7a0d1a; }
  .expired td { background: #fbdada; }
  .blind-regions { margin: 0.3rem 0 0; padding-left: 1.25rem; font-size: 0.9rem; }
  .visually-hidden {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
  footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #d6d6d6; color: #3f3f3f; font-size: 0.9rem; }
`;

/**
 * Renders a full `Report` as one self-contained HTML string - inlined CSS,
 * no external requests, no client-side script, no build step.
 */
export function renderReportHtml(report: Report): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${e(report.tool.name)} report — ${e(report.run.baseUrl)}</title>
<style>${STYLE}</style>
</head>
<body>
${renderHeader(report)}
<main>
${renderSummarySection(report)}
${renderFindingsSection(report)}
${renderSuppressedSection(report)}
${renderPagesSection(report)}
</main>
<footer>
<p>Generated by ${e(report.tool.name)} ${e(report.tool.version)}. Automated results only — not a conformance claim, not a VPAT, not a legal defence.</p>
</footer>
</body>
</html>
`;
}
