import { writeFile } from 'node:fs/promises';
import { Command } from 'commander';

import { diff, exitCodeForDiff, readReport, renderDiff } from '../../index.js';
import { run } from '../runtime.js';
import type { NewPagePolicy } from '../../types.js';

interface DiffCommandOptions {
  allowEngineDrift?: boolean;
  matchThreshold: string;
  exactOnly?: boolean;
  newPagePolicy: NewPagePolicy;
  format: 'summary' | 'json';
  out?: string;
  quiet?: boolean;
}

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

    .option('--format <format>', 'summary or json (the CI job-summary markdown is a later day)', 'summary')
    .option('--out <path>', 'write the diff result JSON here')
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

  Diffing across incompatible run configuration (mode, viewport, locale,
  colour scheme) is always refused (exit 6) - there is no override flag.
`,
    )

    .action((basePath: string, headPath: string, options: DiffCommandOptions) =>
      run(async () => {
        const base = await readReport(basePath);
        const head = await readReport(headPath);

        const result = diff(base, head, {
          ...(options.allowEngineDrift !== undefined ? { allowEngineDrift: options.allowEngineDrift } : {}),
          matchThreshold: Number(options.matchThreshold),
          ...(options.exactOnly !== undefined ? { exactOnly: options.exactOnly } : {}),
          newPagePolicy: options.newPagePolicy,
        });

        // A DiffResult, not a Report - writeReport() is Report-shaped
        // specifically (it's also the baseline format), so this writes the
        // JSON directly rather than reusing it for a shape it doesn't fit.
        if (options.out) {
          await writeFile(options.out, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
        }

        if (options.quiet) {
          console.log(result.gate.reason);
        } else if (options.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(await renderDiff(result, { format: 'summary' }));
        }

        const exitCode = exitCodeForDiff(result);
        if (exitCode !== 0) {
          process.exitCode = exitCode;
        }
      }),
    );
}
