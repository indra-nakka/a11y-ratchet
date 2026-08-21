#!/usr/bin/env node
/**
 * Generates the coverage figures from `src/wcag/coverage.ts` — the ONLY
 * place these numbers may come from (`03-EVIDENCE.md §1.7`: an earlier
 * draft hardcoded plausible-looking counts that didn't match the table they
 * summarised; that must never happen again).
 *
 * Imports the built library rather than the TS source directly, so this
 * script needs no TS loader of its own - `npm run docs:coverage` builds
 * first. Writes into the `<!-- GENERATED:* -->` marker blocks in
 * `README.md` and `docs/03-EVIDENCE.md` in place — those markers used to be
 * decorative (B1); this closes that gap so a stale number can't survive a
 * regenerate.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { coverage, coverageCounts } from '../dist/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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
const detectableIds = criterionIdsByStatus('detectable');
const probeIds = criterionIdsByStatus('probe');

// --- console summary (kept for local/manual use, and for R0.4-style checks) ---

console.log(`Level A + AA:        ${counts.total}`);
for (const status of ['detectable', 'probe', 'partial', 'manual']) {
  const ids = criterionIdsByStatus(status);
  const label = STATUS_LABELS[status].padEnd(11);
  const list = status === 'detectable' || status === 'probe' ? `    ${ids.join(' · ')}` : '';
  console.log(`  ${label}${String(counts.byStatus[status]).padStart(3)}${list}`);
}
console.log(`  ${'Any signal'.padEnd(11)}${String(counts.anySignal).padStart(3)}  (${percent}%)`);
console.log(`  ${'Certifiable'.padEnd(11)}${String(counts.certifiable).padStart(3)}`);

// --- file targets ---

function replaceMarkerBlock(content, name, body) {
  const re = new RegExp(`(<!-- GENERATED:${name}[^\\r\\n]*-->\\r?\\n)[\\s\\S]*?(<!-- /GENERATED:${name} -->)`);
  if (re.test(content)) {
    return { content: content.replace(re, (_m, open, close) => `${open}${body}\n${close}`), found: true };
  }
  return { content, found: false };
}

// README.md — coverage table
{
  const path = join(ROOT, 'README.md');
  let content = readFileSync(path, 'utf8');

  const tableBody = [
    ``,
    `WCAG 2.2 has 86 success criteria; an AA conformance claim covers the ${counts.total} at Level A and AA.[^1]`,
    ``,
    `| | Criteria | |`,
    `|---|---:|---|`,
    `| Detectable | ${counts.byStatus.detectable} | ${detectableIds.join(' · ')} |`,
    `| Probe (this tool, not axe) | ${counts.byStatus.probe} | ${probeIds.join(' · ')} |`,
    `| Partial | ${counts.byStatus.partial} | narrow subclass caught; most real failures invisible |`,
    `| Manual only | ${counts.byStatus.manual} | no meaningful automated signal |`,
    `| **Any automated signal** | **${counts.anySignal}** | **${percent}% of A/AA** |`,
    `| **Certifiable** | **${counts.certifiable}** | — |`,
    ``,
  ].join('\n');

  const sentenceBody = [
    `This tool produces evidence for ${counts.anySignal} of the 55 A/AA criteria and can certify none of them.`,
    `${counts.byStatus.probe} of those ${counts.anySignal} come from interaction probes a static DOM scanner cannot perform. The`,
    `remaining ${counts.byStatus.manual} require a human — \`a11y-ratchet manual\` will generate you a checklist.`,
  ].join('\n');

  const table = replaceMarkerBlock(content, 'coverage', tableBody);
  if (!table.found) {
    console.error(`README.md: <!-- GENERATED:coverage --> markers not found — not writing.`);
    process.exitCode = 1;
  } else {
    content = table.content;
  }

  if (content.includes('<!-- GENERATED:coverage-sentence -->')) {
    const sentence = replaceMarkerBlock(content, 'coverage-sentence', sentenceBody);
    content = sentence.content;
  } else {
    // Markers don't exist yet — replace the known hand-typed sentence and add markers around it.
    const looseSentence = /This tool produces evidence for \d+ of the 55[\s\S]*?generate you a checklist\.\r?\n/;
    if (looseSentence.test(content)) {
      content = content.replace(
        looseSentence,
        `<!-- GENERATED:coverage-sentence -->\n${sentenceBody}\n<!-- /GENERATED:coverage-sentence -->\n`,
      );
    } else {
      console.error('README.md: coverage sentence not found — not writing coverage-sentence markers.');
      process.exitCode = 1;
    }
  }

  writeFileSync(path, content);
}

// docs/03-EVIDENCE.md — §1.7 counts block
{
  const path = join(ROOT, 'docs', '03-EVIDENCE.md');
  let content = readFileSync(path, 'utf8');

  const codeBlockBody = [
    '```',
    `Level A + AA:        ${counts.total}`,
    `  Detectable          ${String(counts.byStatus.detectable).padStart(1)}    ${detectableIds.join(' · ')}`,
    `  Probe               ${String(counts.byStatus.probe).padStart(1)}    ${probeIds.join(' · ')}        (3rd cut: 2.4.3 -> roadmap)`,
    `  Partial            ${String(counts.byStatus.partial).padStart(2)}`,
    `  Manual             ${String(counts.byStatus.manual).padStart(2)}`,
    `  Any signal         ${String(counts.anySignal).padStart(2)}  (${percent}%)`,
    `  Certifiable         ${String(counts.certifiable).padStart(1)}`,
    '```',
  ].join('\n');

  const result = replaceMarkerBlock(content, 'counts', codeBlockBody);
  if (!result.found) {
    console.error('docs/03-EVIDENCE.md: <!-- GENERATED:counts --> markers not found — not writing.');
    process.exitCode = 1;
  } else {
    writeFileSync(path, result.content);
  }
}
