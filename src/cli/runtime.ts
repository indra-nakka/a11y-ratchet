/**
 * Shared CLI plumbing: error-to-exit-code translation and shared help text.
 *
 * No logic beyond formatting and process control. Exit codes are decided by the
 * library (`src/errors.ts`, `exitCodeForDiff`), not here.
 */

import { A11yRatchetError } from '../errors.js';

/** Exit-code reference, appended to `--help` so the gate is documented where it is used. */
export const EXIT_CODE_HELP = `Exit codes:
  0  pass
  1  diff gate failed - new violations vs baseline
  2  config invalid, or expired suppressions
  3  tool error - browser launch, unreachable URL, unreadable baseline
  4  engine drift - axe-core version differs; pass --allow-engine-drift
  5  scan threshold exceeded - absolute violation count, no baseline involved
  6  mode mismatch - cannot diff a ci run against an audit run`;

/**
 * Run a command handler, translating a thrown error into a message and an exit
 * code. Unknown errors exit 3 (tool error) rather than 1, so CI can always tell
 * "the site regressed" from "the tool broke".
 */
export async function run(handler: () => void | Promise<void>): Promise<void> {
  try {
    await handler();
  } catch (error) {
    if (error instanceof A11yRatchetError) {
      console.error(`error: ${error.message}`);
      process.exit(error.exitCode);
    }
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(3);
  }
}
