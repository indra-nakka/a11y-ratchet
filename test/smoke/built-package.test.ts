/**
 * The library public API, exercised through the BUILT package (`00 §7` cut
 * line 5) - `import()`s `dist/index.js` and reads `dist/index.d.ts`
 * directly, not `src/index.js` and not a CLI subprocess. Every other test
 * in this suite imports source, which proves the library's *logic* works
 * but says nothing about whether `tsup`'s bundling, externals
 * (`playwright`/`axe-core` are excluded from the bundle - `tsup.config.ts`)
 * or declaration-file generation actually produce an importable package.
 * That gap is exactly what an external consumer would hit first.
 *
 * `npm run build` runs in `beforeAll` rather than assuming a prior build
 * step, so this test is correct regardless of script ordering or a stale
 * `dist/` left over from a previous run.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pageUrl, start, stop } from '../fixtures/server.js';
import type * as LibraryModule from '../../src/index.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIST_INDEX_URL = pathToFileURL(fileURLToPath(new URL('../../dist/index.js', import.meta.url))).href;

/**
 * Loaded via a runtime-computed URL, not a literal `import('../../dist/...')`
 * specifier - a literal path is exactly what `tsc` resolves module types
 * against, which would make `npm run typecheck` fail on a fresh checkout
 * before the first build. The cast is the only place this file assumes
 * `dist/index.js`'s runtime shape matches `src/index.ts`'s types, which is
 * the thing these tests exist to actually verify at runtime.
 */
async function importBuiltPackage(): Promise<typeof LibraryModule> {
  return import(/* @vite-ignore */ DIST_INDEX_URL) as Promise<typeof LibraryModule>;
}

const EXPECTED_EXPORTS = [
  'scan',
  'diff',
  'exitCodeForDiff',
  'exitCodeForScan',
  'renderReport',
  'renderDiff',
  'readReport',
  'writeReport',
  'checkConfig',
  'exitCodeForConfigCheck',
  'updateBaseline',
  'regenerateBaseline',
  'checkBaseline',
  'coverage',
  'coverageCounts',
  'manualChecklist',
  'A11yRatchetError',
  'NotImplementedError',
  'TOOL_NAME',
  'TOOL_VERSION',
  'AXE_CORE_VERSION',
  'CONFIG_BASENAME',
  'DEFAULT_BASELINE_PATH',
];

describe('the built package (dist/index.js, dist/index.d.ts)', () => {
  // A real build, not a mock - the whole point is to catch tsup/bundling
  // problems source-only tests cannot see.
  beforeAll(() => {
    // `npm` resolves to `npm.cmd` on Windows, which `execFileSync` cannot
    // run without a shell (`EINVAL`) - `shell: true` is required here. No
    // user input reaches this command (the whole invocation is one static
    // string, no separate argument array to concatenate unescaped), so the
    // usual shell-injection risk `shell: true` normally carries doesn't apply.
    execFileSync('npm run build', [], { cwd: REPO_ROOT, stdio: 'pipe', shell: true });
  }, 120_000);

  it('emits a declaration file with every public export, not just the compiled JS', () => {
    const dts = readFileSync(new URL('../../dist/index.d.ts', import.meta.url), 'utf8');
    for (const name of EXPECTED_EXPORTS) {
      expect(dts, `dist/index.d.ts is missing a declaration for "${name}"`).toMatch(
        new RegExp(`\\b${name}\\b`),
      );
    }
  });

  it('imports cleanly from dist/index.js and exposes every public export as a live binding', async () => {
    const lib = await importBuiltPackage();
    for (const name of EXPECTED_EXPORTS) {
      expect(lib as Record<string, unknown>, `dist/index.js is missing an export: ${name}`).toHaveProperty(name);
    }
    expect(lib).not.toHaveProperty('default');
  });

  it('reports its identity from the built package, matching package.json', async () => {
    const lib = await importBuiltPackage();
    const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      name: string;
      version: string;
    };
    expect(lib.TOOL_NAME).toBe(packageJson.name);
    expect(lib.TOOL_VERSION).toBe(packageJson.version);
  });

  describe('an end-to-end scan through the built package', () => {
    beforeAll(async () => {
      await start();
    });
    afterAll(async () => {
      await stop();
    });

    it('scans a fixture page and renders every report format, all through dist/index.js', async () => {
      const lib = await importBuiltPackage();
      const report = await lib.scan({ seed: { url: pageUrl('01-images') } });
      expect(report.findings.length, 'fixture must produce findings for this test to mean anything').toBeGreaterThan(0);

      const summary = await lib.renderReport(report, { format: 'summary' });
      expect(summary).toContain('scan summary');

      const html = await lib.renderReport(report, { format: 'html' });
      expect(html.startsWith('<!doctype html>')).toBe(true);

      const json = await lib.renderReport(report, { format: 'json' });
      expect(() => {
        JSON.parse(json);
      }).not.toThrow();

      const selfDiff = lib.diff(report, report);
      expect(selfDiff.gate.passed).toBe(true);
      expect(lib.exitCodeForDiff(selfDiff)).toBe(0);

      const diffHtml = await lib.renderDiff(selfDiff, { format: 'html' });
      expect(diffHtml.startsWith('<!doctype html>')).toBe(true);
    }, 30_000);
  });
});
