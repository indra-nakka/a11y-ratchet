/**
 * Error types carrying the exit code they should produce (`01 §10`).
 *
 * The exit code lives on the error rather than being decided in `src/cli/`,
 * because `cli/` contains no logic — it catches, prints and exits.
 */

import type { ExitCode } from './types.js';

export class A11yRatchetError extends Error {
  readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode) {
    super(message);
    this.name = 'A11yRatchetError';
    this.exitCode = exitCode;
  }
}

/**
 * Thrown by every stubbed entry point until its day in the plan lands. Carries
 * exit code 3 (tool error), never 0 — a stub must not read as a pass.
 */
export class NotImplementedError extends A11yRatchetError {
  constructor(what: string, plannedDay: string) {
    super(`${what} is not implemented yet (planned: ${plannedDay}).`, 3);
    this.name = 'NotImplementedError';
  }
}
