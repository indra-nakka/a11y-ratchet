/**
 * Library smoke test.
 *
 * Imports `src/index.ts` directly rather than shelling out to the binary. The
 * project claims to be a library with a CLI on top; a test that spawns the
 * binary would pass just as well if the library surface did not exist
 * (`01 §2`, `03 §2.3`).
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import * as lib from '../../src/index.js';
import { NotImplementedError } from '../../src/errors.js';

const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { name: string; version: string; dependencies: Record<string, string> };

describe('public library API', () => {
  it('exposes every entry point the CLI calls', () => {
    const expected = [
      'scan',
      'diff',
      'exitCodeForDiff',
      'exitCodeForScan',
      'renderReport',
      'renderDiff',
      'readReport',
      'writeReport',
      'checkConfig',
      'updateBaseline',
      'regenerateBaseline',
      'checkBaseline',
      'coverage',
      'coverageCounts',
      'manualChecklist',
    ];

    for (const name of expected) {
      expect(lib, `missing export: ${name}`).toHaveProperty(name);
      expect(typeof (lib as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('has no default export', () => {
    expect(lib).not.toHaveProperty('default');
  });

  it('reports its own identity from package.json rather than a hardcoded string', () => {
    expect(lib.TOOL_NAME).toBe(packageJson.name);
    expect(lib.TOOL_VERSION).toBe(packageJson.version);
  });

  it('pins axe-core to an exact version and records it', () => {
    // A caret range here would let a minor bump change fixture expectations
    // silently, and would make the engine-drift guard meaningless.
    const pinned = packageJson.dependencies['axe-core'];
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
    expect(lib.AXE_CORE_VERSION).toBe(pinned);
  });
});

describe('unimplemented entry points', () => {
  it('throw rather than returning an empty result', () => {
    // A scanner that reports zero violations because it did nothing is the
    // worst possible failure mode for this tool. Stubs must be loud.
    expect(() => lib.coverage()).toThrow(NotImplementedError);
    expect(() => lib.coverageCounts()).toThrow(NotImplementedError);
  });

  it('carry exit code 3, so CI reads them as a tool error and not a pass', () => {
    try {
      lib.coverage();
      expect.unreachable('coverage() should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(NotImplementedError);
      expect((error as NotImplementedError).exitCode).toBe(3);
    }
  });
});
