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
 * Thrown when a code path is deliberately unsupported — a format value that
 * reaches a branch no output implementation handles, whether by bypassing
 * the type system or by hitting a case documented as intentionally out of
 * scope for that function. Carries exit code 3 (tool error), never 0 — an
 * unsupported case must not read as a pass. `guidance` names what to do
 * instead; it's read by a library consumer, not by someone with this
 * project's own history in mind, so it must stand on its own.
 */
export class NotImplementedError extends A11yRatchetError {
  constructor(what: string, guidance: string) {
    super(`${what} is not supported. ${guidance}`, 3);
    this.name = 'NotImplementedError';
  }
}
