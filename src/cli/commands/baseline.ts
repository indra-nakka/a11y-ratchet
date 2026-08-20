import { Command } from 'commander';

import { checkBaseline, readReport, regenerateBaseline, updateBaseline } from '../../index.js';
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
        await checkBaseline(report, options.baseline);
      }),
    );

  command.addHelpText(
    'after',
    `
Notes:
  Accepting a known violation is not a baseline update - it is a suppression,
  with a justification, an owner and an expiry date. The baseline records what
  is true; the config records what was decided.
`,
  );

  return command;
}
