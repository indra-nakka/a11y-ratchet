#!/usr/bin/env node
/**
 * CLI entry point.
 *
 * Argument parsing and formatting only - every command is
 * `parse args -> call library -> format`. If logic appears in this directory,
 * the "CLI + library" claim has stopped being true.
 */

import { Command } from 'commander';

import { TOOL_NAME, TOOL_VERSION } from '../meta.js';
import { baselineCommand } from './commands/baseline.js';
import { checkConfigCommand } from './commands/checkConfig.js';
import { diffCommand } from './commands/diff.js';
import { manualCommand } from './commands/manual.js';
import { reportCommand } from './commands/report.js';
import { scanCommand } from './commands/scan.js';
import { EXIT_CODE_HELP } from './runtime.js';

export function buildProgram(): Command {
  const program = new Command();

  program
    .name(TOOL_NAME)
    .version(TOOL_VERSION, '-v, --version')
    .description(
      'Accessibility regression testing. Crawls a site, runs axe-core plus keyboard-interaction ' +
        'probes, maps findings to WCAG 2.2 success criteria, and diffs two runs so CI can fail a ' +
        'PR on new violations.\n\n' +
        'This tool detects a minority of accessibility defects and certifies none of them.',
    )
    .option('--no-color', 'disable coloured output')
    .showHelpAfterError();

  program.addCommand(scanCommand());
  program.addCommand(diffCommand());
  program.addCommand(reportCommand());
  program.addCommand(checkConfigCommand());
  program.addCommand(manualCommand());
  program.addCommand(baselineCommand());

  program.addHelpText('after', `\n${EXIT_CODE_HELP}\n`);

  return program;
}

await buildProgram().parseAsync(process.argv);
