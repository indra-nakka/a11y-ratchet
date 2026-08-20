#!/usr/bin/env node
/**
 * Generates the coverage figures from `src/wcag/coverage.ts` — the ONLY
 * place these numbers may come from (`03-EVIDENCE.md §1.7`: an earlier
 * draft hardcoded plausible-looking counts that didn't match the table they
 * summarised; that must never happen again).
 *
 * Imports the built library rather than the TS source directly, so this
 * script needs no TS loader of its own - `npm run docs:coverage` builds
 * first. Output matches `03-EVIDENCE.md §1.7`'s shape so it can be pasted
 * straight into the README once that's written (Day 15).
 */

import { coverage, coverageCounts } from '../dist/index.js';

const STATUS_LABELS = {
  detectable: 'Detectable',
  probe: 'Probe',
  partial: 'Partial',
  manual: 'Manual',
};

function criterionIdsByStatus(status) {
  return coverage()
    .filter((entry) => entry.status === status)
    .map((entry) => entry.criterion)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

const counts = coverageCounts(['A', 'AA']);
const percent = counts.total > 0 ? Math.round((counts.anySignal / counts.total) * 100) : 0;

console.log(`Level A + AA:        ${counts.total}`);
for (const status of ['detectable', 'probe', 'partial', 'manual']) {
  const ids = criterionIdsByStatus(status);
  const label = STATUS_LABELS[status].padEnd(11);
  const list = status === 'detectable' || status === 'probe' ? `    ${ids.join(' · ')}` : '';
  console.log(`  ${label}${String(counts.byStatus[status]).padStart(3)}${list}`);
}
console.log(`  ${'Any signal'.padEnd(11)}${String(counts.anySignal).padStart(3)}  (${percent}%)`);
console.log(`  ${'Certifiable'.padEnd(11)}${String(counts.certifiable).padStart(3)}`);
