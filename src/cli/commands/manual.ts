import { Command } from 'commander';

import { manualChecklist } from '../../index.js';
import { run } from '../runtime.js';

/**
 * `manual` — generate the checklist for criteria no automated tool can evaluate.
 *
 * This command is the honest half of the coverage matrix: the criteria the
 * scanner cannot reach, phrased as checks a person can actually perform.
 */
export function manualCommand(): Command {
  return new Command('manual')
    .description('Generate the manual-testing checklist for criteria automation cannot evaluate')
    .argument('[report]', 'report JSON, to also route needs-review findings into the checklist')

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
`,
    )

    .action(() =>
      run(async () => {
        await manualChecklist({ format: 'markdown' });
      }),
    );
}
