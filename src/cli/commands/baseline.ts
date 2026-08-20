import { Command } from 'commander';

import { checkBaseline, exitCodeForDiff, readReport, regenerateBaseline, renderDiff, updateBaseline } from '../../index.js';
import { run } from '../runtime.js';

/**
 * `baseline` — the committed-baseline lifecycle (`01 §11`).
 *
 * The baseline is a committed file, not a CI artefact: artefacts expire, are not
 * reviewable, and cannot be diffed in a PR. Every subcommand here runs locally.
 * The GitHub Action never writes to the repository - it fails the gate and
 * prints the command to run.
 */
export function baselineCommand(): Command {
  const command = new Command('baseline').description(
    'Manage the committed baseline at .a11y/baseline.json',
  );

  command
    .command('update')
    .description('Drop findings that no longer occur, keep the rest. Commit this alongside the fix')
    .argument('<report>', 'report JSON from a fresh scan')
    .option('--baseline <path>', 'baseline file', '.a11y/baseline.json')
    .action((reportPath: string, options: { baseline: string }) =>
      run(async () => {
        const report = await readReport(reportPath);
        await updateBaseline(report, options.baseline);
        console.log(`Updated ${options.baseline}.`);
      }),
    );

  command
    .command('regenerate')
    .description('Replace the baseline wholesale. The path for an axe-core bump, so reviewers see the churn')
    .argument('<report>', 'report JSON from a fresh scan')
    .option('--baseline <path>', 'baseline file', '.a11y/baseline.json')
    .action((reportPath: string, options: { baseline: string }) =>
      run(async () => {
        const report = await readReport(reportPath);
        await regenerateBaseline(report, options.baseline);
        console.log(`Regenerated ${options.baseline}.`);
      }),
    );

  command
    .command('check')
    .description('Report drift between the committed baseline and a fresh scan')
    .argument('<report>', 'report JSON from a fresh scan')
    .option('--baseline <path>', 'baseline file', '.a11y/baseline.json')
    .action((reportPath: string, options: { baseline: string }) =>
      run(async () => {
        const report = await readReport(reportPath);
        const result = await checkBaseline(report, options.baseline);
        console.log(await renderDiff(result, { format: 'summary' }));

        const exitCode = exitCodeForDiff(result);
        if (exitCode !== 0) {
          console.log(
            `\nThe committed baseline at ${options.baseline} no longer matches. This never writes to the ` +
              `repository - run this locally and commit the result:\n\n  a11y-ratchet baseline update ${reportPath} --baseline ${options.baseline}\n`,
          );
          process.exitCode = exitCode;
        }
      }),
    );

  command.addHelpText(
    'after',
    `
Notes:
  Accepting a known violation is not a baseline update - it is a suppression,
  with a reason, an owner and an expiry date. The baseline records what
  is true; the config records what was decided.
`,
  );

  return command;
}
