import { Command } from 'commander';

import { checkConfig } from '../../index.js';
import { run } from '../runtime.js';

/**
 * `check-config` — validate the config file, including suppression expiry.
 *
 * Exits 2 on an invalid config or an expired suppression, which is what stops
 * suppressions accreting silently.
 */
export function checkConfigCommand(): Command {
  return new Command('check-config')
    .description('Validate the config file: schema, mandatory suppression fields, expiry and staleness')
    .argument('[config]', 'config file', '.a11y/config.json')

    .option('--report <path>', 'report JSON to check suppressions against, for staleness')
    .option('--json', 'emit the check result as JSON')

    .addHelpText(
      'after',
      `
Notes:
  Every suppression requires a justification, an owner, an expiry date and a
  category. Expired suppressions fail the check (exit 2).

  A suppression records a decision. A baseline records reality. Accepting a
  known violation is a suppression, not a baseline update.
`,
    )

    .action((configPath: string) =>
      run(async () => {
        await checkConfig(configPath);
      }),
    );
}
