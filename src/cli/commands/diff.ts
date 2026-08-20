import { Command } from 'commander';

import { diff, readReport } from '../../index.js';
import { run } from '../runtime.js';

/**
 * `diff` — compare two reports and decide whether the gate passes.
 *
 * The interesting behaviour is in the library: page-set partitioning, the two
 * matching passes, and the refusal to diff across engine versions or scan modes.
 */
export function diffCommand(): Command {
  return new Command('diff')
    .description('Compare two reports and report new, fixed, persisting, moved and impact-changed findings')
    .argument('<base>', 'baseline report JSON (usually .a11y/baseline.json)')
    .argument('<head>', 'report JSON from this run')

    .option('--allow-engine-drift', 'permit diffing across axe-core versions; banners the output')
    .option('--match-threshold <n>', 'fuzzy-match acceptance score', '0.65')
    .option('--exact-only', 'skip fuzzy matching; unmatched findings become unclassified, never new')
    .option('--new-page-policy <policy>', 'fail, warn or ignore findings on pages only in head', 'warn')

    .option('--format <format>', 'text, json or markdown (markdown suits a CI job summary)', 'text')
    .option('--out <path>', 'write the diff result here')
    .option('--quiet', 'print only the gate reason')

    .addHelpText(
      'after',
      `
Notes:
  A finding whose identity is uncertain is reported as unclassified or moved,
  never as new. A false regression blocks a PR for no reason.

  Pages present in only one run produce unknown-page-* findings, which are
  surfaced but do not fail the gate by default.

  Diffing across axe-core versions is refused (exit 4). A PR that bumps
  axe-core should regenerate the baseline in the same PR rather than passing
  --allow-engine-drift permanently.
`,
    )

    .action((basePath: string, headPath: string) =>
      run(async () => {
        const base = await readReport(basePath);
        const head = await readReport(headPath);
        diff(base, head);
      }),
    );
}
