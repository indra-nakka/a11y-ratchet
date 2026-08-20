import { Command } from 'commander';

import { A11yRatchetError } from '../../errors.js';
import { checkBaseline, checkBaselineRunConfig, exitCodeForDiff, readReport, regenerateBaseline, renderDiff, updateBaseline } from '../../index.js';
import { parseColorScheme, parseViewport } from '../parse.js';
import { run } from '../runtime.js';
import type { ScanMode } from '../../types.js';

interface CheckRunConfigCliOptions {
  mode: string;
  viewport?: string;
  locale?: string;
  colorScheme?: string;
  bypassCsp?: boolean;
}

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

  command
    .command('check-run-config')
    .description('Compare a candidate scan config against the baseline BEFORE scanning - fails fast, no browser launched')
    .argument('<baseline>', 'baseline file')
    .option('--mode <mode>', 'ci or audit', 'ci')
    .option('--viewport <WxH>', 'viewport size, e.g. 1280x800 (default: the scan default, 1280x800)')
    .option('--locale <locale>', 'browser locale (default: the scan default, en-US)')
    .option('--color-scheme <scheme>', 'light, dark or no-preference (default: the scan default, light)')
    .option('--bypass-csp', 'whether the candidate run ignores the page\'s own CSP (default: false)')
    .addHelpText(
      'after',
      `
Notes:
  Same refusal diff() itself makes after a real scan (exit 6, no override -
  mode/viewport/locale/colour-scheme/CSP differences produce phantom
  regressions the same way engine drift does), surfaced before the scan
  runs at all. This is a fast path, not the source of truth: diff() still
  re-checks the real head run's config unconditionally once you have one.
`,
    )
    .action((baselinePath: string, options: CheckRunConfigCliOptions) =>
      run(async () => {
        const baseline = await readReport(baselinePath);
        const mismatches = checkBaselineRunConfig(baseline, {
          mode: options.mode as ScanMode,
          ...(options.viewport ? { viewport: parseViewport(options.viewport) } : {}),
          ...(options.locale ? { locale: options.locale } : {}),
          ...(options.colorScheme ? { colorScheme: parseColorScheme(options.colorScheme) } : {}),
          ...(options.bypassCsp !== undefined ? { bypassCSP: options.bypassCsp } : {}),
        });

        if (mismatches.length === 0) {
          console.log('Run configuration matches the baseline.');
          return;
        }

        const detail = mismatches.map((m) => `${m.reason} (baseline=${m.base}, this run=${m.head})`).join(', ');
        throw new A11yRatchetError(
          `Refusing early — incompatible run configuration: ${detail}. There is no override for this. ` +
            `Regenerate the baseline under the current settings once you have a fresh scan:\n\n` +
            `  a11y-ratchet baseline regenerate <report.json> --baseline ${baselinePath}`,
          6,
        );
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
