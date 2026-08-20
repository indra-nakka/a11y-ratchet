/**
 * Shared between `report/html/render.ts` (the scan report) and
 * `report/html/renderDiff.ts` (the diff view, Day 11) - escaping, sort
 * order, criteria formatting, and the inlined CSS, so the two self-
 * contained documents stay visually and behaviourally consistent without
 * copy-pasting ~90 lines of each other.
 */

import type { Impact, SuccessCriterion } from '../../types.js';

/** Every dynamic value that reaches the page goes through this - a raw `<`/`&`/`"` from real page content must never break the report's own markup. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Short alias - both renderers interpolate escaped values constantly. */
export function e(value: string | number): string {
  return escapeHtml(String(value));
}

export const IMPACT_ORDER: Record<Impact, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

export function sortByImpactDesc<T>(items: readonly T[], impactOf: (item: T) => Impact): T[] {
  return [...items].sort((a, b) => IMPACT_ORDER[impactOf(a)] - IMPACT_ORDER[impactOf(b)]);
}

export function criteriaLabel(finding: { criteria: readonly SuccessCriterion[]; bestPractice: boolean }): string {
  if (finding.criteria.length === 0) {
    return finding.bestPractice ? 'best practice — not a WCAG failure' : 'no SC mapped';
  }
  return finding.criteria.map((c) => `${c.id} ${c.title} [${c.level}]`).join(', ');
}

export function plural(n: number): string {
  return n === 1 ? '' : 's';
}

export const STYLE = `
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

  .gate-banner { padding: 1rem; border-radius: 4px; margin: 1rem 0; font-size: 1.1rem; }
  .gate-passed { background: #e6f4ea; color: #0f5a25; border: 1px solid #a9d9b8; }
  .gate-failed { background: #fbdada; color: #7a0d1a; border: 1px solid #f0aaaa; }
  .diff-section { margin-bottom: 1.5rem; }
  .pair-arrow { color: #6b6b6b; }
  details.pair { margin: 0.4rem 0; padding: 0.4rem 0.6rem; background: #f7f7f7; border-radius: 4px; }
  .persisting-note { color: #3f3f3f; font-style: italic; }
`;
