/**
 * `--fail-on` (D76) and the `report`/`manual` commands (found while building
 * this test) all shipped the same failure shape: a flag Commander parses
 * happily, that the action body never reads - accepted silently, does
 * nothing. Caught three times now, so it gets a standing test instead of a
 * fourth manual re-discovery.
 *
 * For every command, every declared `.option()` must appear as
 * `options.<attributeName>` somewhere in that command's own action body.
 * `src/cli/` is plumbing-only by design (`CLAUDE.md` invariant 8) and every
 * wired option in this codebase already reads through `options.<name>` dot
 * access, never destructuring - checking the source text for that pattern
 * is cheap, and catching a real bug this way three times over is better
 * evidence for the approach than a purer AST-based check would be for a
 * codebase this size.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Command } from 'commander';

import { baselineCommand } from '../../src/cli/commands/baseline.js';
import { checkConfigCommand } from '../../src/cli/commands/checkConfig.js';
import { diffCommand } from '../../src/cli/commands/diff.js';
import { manualCommand } from '../../src/cli/commands/manual.js';
import { reportCommand } from '../../src/cli/commands/report.js';
import { scanCommand } from '../../src/cli/commands/scan.js';

interface CommandUnderTest {
  name: string;
  factory: () => Command;
  sourcePath: string;
}

const COMMANDS: CommandUnderTest[] = [
  { name: 'scan', factory: scanCommand, sourcePath: 'src/cli/commands/scan.ts' },
  { name: 'diff', factory: diffCommand, sourcePath: 'src/cli/commands/diff.ts' },
  { name: 'report', factory: reportCommand, sourcePath: 'src/cli/commands/report.ts' },
  { name: 'check-config', factory: checkConfigCommand, sourcePath: 'src/cli/commands/checkConfig.ts' },
  { name: 'manual', factory: manualCommand, sourcePath: 'src/cli/commands/manual.ts' },
  // `baseline` is a Command with three subcommands, each with its own
  // action body - handled separately below, not through this list.
];

/** `baseline update|regenerate|check` each declare and consume their own options independently. */
const BASELINE_SUBCOMMANDS: CommandUnderTest[] = ['update', 'regenerate', 'check', 'check-run-config'].map((sub) => ({
  name: `baseline ${sub}`,
  factory: () => {
    const found = baselineCommand().commands.find((c) => c.name() === sub);
    if (!found) throw new Error(`baseline subcommand "${sub}" not found`);
    return found;
  },
  sourcePath: 'src/cli/commands/baseline.ts',
}));

function actionBodySource(sourcePath: string): string {
  const source = readFileSync(new URL(`../../${sourcePath}`, import.meta.url), 'utf8');
  const actionIndex = source.indexOf('.action(');
  if (actionIndex === -1) {
    throw new Error(`${sourcePath}: no .action( call found - is this command actually wired up?`);
  }
  return source.slice(actionIndex);
}

describe('every CLI flag is read by its own action body', () => {
  for (const { name, factory, sourcePath } of [...COMMANDS, ...BASELINE_SUBCOMMANDS]) {
    it(`${name}: every declared option is referenced as options.<name>`, () => {
      const command = factory();
      const body = actionBodySource(sourcePath);

      for (const option of command.options) {
        const attr = option.attributeName();
        const pattern = new RegExp(`\\boptions\\.${attr}\\b`);
        expect(
          body,
          `${sourcePath}: "${option.flags}" (options.${attr}) is declared but never read in the action body - the same silent-no-op --fail-on shipped with on Day 11.`,
        ).toMatch(pattern);
      }
    });
  }
});
