import { Command } from 'commander';

import { checkConfig, exitCodeForConfigCheck, readReport } from '../../index.js';
import { run } from '../runtime.js';
import type { ConfigCheckResult } from '../../types.js';

interface CheckConfigCliOptions {
  against?: string;
  json?: boolean;
}

/**
 * `check-config` — validate the config file, including suppression expiry.
 *
 * Exits 2 on an invalid config or an expired suppression, which is what stops
 * suppressions accreting silently.
 */
export function checkConfigCommand(): Command {
  return new Command('check-config')
    .description('Validate the config file: schema, mandatory suppression fields, expiry and staleness')
    .argument('[config]', 'config file (default: discover a11y-ratchet.config.{ts,js,json} in the working directory)')

    .option('--against <report.json>', 'report JSON to check suppressions against, for staleness')
    .option('--json', 'emit the check result as JSON')

    .addHelpText(
      'after',
      `
Notes:
  Every suppression requires a reason, an owner, an expiry date and a
  category. Expired suppressions fail the check (exit 2).

  A suppression records a decision. A baseline records reality. Accepting a
  known violation is a suppression, not a baseline update.

  Staleness (a suppression that no longer matches any finding) can only be
  checked against a report - pass --against, or it's skipped and noted in
  the warnings rather than silently passed.
`,
    )

    .action((configPath: string | undefined, options: CheckConfigCliOptions) =>
      run(async () => {
        const report = options.against ? await readReport(options.against) : undefined;
        const result = await checkConfig(configPath, report);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printHumanReadable(result);
        }

        const exitCode = exitCodeForConfigCheck(result);
        if (exitCode !== 0) {
          process.exitCode = exitCode;
        }
      }),
    );
}

function printHumanReadable(result: ConfigCheckResult): void {
  console.log(result.valid ? 'Config is valid.' : 'Config is INVALID.');
  for (const error of result.errors) console.log(`  error: ${error}`);
  for (const warning of result.warnings) console.log(`  warning: ${warning}`);

  if (result.expired.length > 0) {
    console.log(`${result.expired.length} expired suppression(s):`);
    for (const ref of result.expired) {
      console.log(`  - ${ref.ruleRef} (owner: ${ref.owner}, expired ${ref.expires})`);
    }
  }
  if (result.stale.length > 0) {
    console.log(`${result.stale.length} stale suppression(s) (matched nothing in --against):`);
    for (const ref of result.stale) {
      console.log(`  - ${ref.ruleRef} (owner: ${ref.owner})`);
    }
  }
}
