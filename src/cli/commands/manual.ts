import { writeFile } from 'node:fs/promises';
import { Command } from 'commander';

import { manualChecklist, readReport } from '../../index.js';
import { run } from '../runtime.js';
import type { ManualOptions } from '../../types.js';

interface ManualCliOptions {
  criteria?: string[];
  format: 'markdown' | 'json';
  out?: string;
}

/**
 * `manual` — generate the checklist for criteria no automated tool can evaluate.
 *
 * This command is the honest half of the coverage matrix: the criteria the
 * scanner cannot reach, phrased as checks a person can actually perform.
 */
export function manualCommand(): Command {
  return new Command('manual')
    .description('Generate the manual-testing checklist for criteria automation cannot evaluate')
    .argument('[report]', 'report JSON, to also route needs-review findings and probe-blind regions into the checklist')

    .option('--criteria <id...>', 'restrict to these success criteria, e.g. 1.4.1 2.4.3')
    .option('--format <format>', 'markdown or json', 'markdown')
    .option('--out <path>', 'output path (defaults to stdout)')

    .addHelpText(
      'after',
      `
Notes:
  These are the criteria this tool does not claim to test. Working through the
  checklist is not a conformance evaluation either - it is a structured pass by
  a person, which is the only thing that reaches most of WCAG.

  Passing a report also routes that run's needs-review findings and
  probe-blind regions into the checklist, grouped by page.
`,
    )

    .action((reportPath: string | undefined, options: ManualCliOptions) =>
      run(async () => {
        const report = reportPath ? await readReport(reportPath) : undefined;
        const manualOptions: ManualOptions = {
          format: options.format,
          ...(options.criteria ? { criteria: options.criteria } : {}),
        };
        const checklist = await manualChecklist(manualOptions, report);

        if (options.out) {
          await writeFile(options.out, checklist, 'utf8');
        } else {
          console.log(checklist);
        }
      }),
    );
}
