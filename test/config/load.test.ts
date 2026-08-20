/**
 * `config/load.ts`: discovery of `a11y-ratchet.config.{ts,js,json}` (`.ts`
 * tried first, `.json` last), an explicit path used exactly, no config file
 * at all resolving to defaults rather than an error, and each format's
 * loading path - including `.ts`'s honest failure under plain Node.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { A11yRatchetError } from '../../src/errors.js';
import { discoverConfigPath, loadConfig } from '../../src/config/load.js';
import { DEFAULT_CONFIG } from '../../src/config/schema.js';

describe('config/load.ts', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'a11y-ratchet-config-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns defaults with path: null when no config file exists', async () => {
    const result = await loadConfig(undefined, dir);
    expect(result).toEqual({ config: DEFAULT_CONFIG, path: null });
  });

  it('discovers a11y-ratchet.config.json', async () => {
    const path = join(dir, 'a11y-ratchet.config.json');
    await writeFile(path, JSON.stringify({ suppressions: [] }));
    expect(await discoverConfigPath(dir)).toBe(path);

    const result = await loadConfig(undefined, dir);
    expect(result.path).toBe(path);
    expect(result.config.suppressions).toEqual([]);
  });

  it('discovers a11y-ratchet.config.js and loads its default export', async () => {
    const path = join(dir, 'a11y-ratchet.config.js');
    await writeFile(path, "export default { mode: 'audit', suppressions: [] };\n");
    expect(await discoverConfigPath(dir)).toBe(path);

    const result = await loadConfig(undefined, dir);
    expect(result.config.mode).toBe('audit');
  });

  it('prefers .ts over .js over .json when more than one is present', async () => {
    await writeFile(join(dir, 'a11y-ratchet.config.json'), '{}');
    await writeFile(join(dir, 'a11y-ratchet.config.js'), 'export default {};\n');
    await writeFile(join(dir, 'a11y-ratchet.config.ts'), 'export default {};\n');
    expect(await discoverConfigPath(dir)).toBe(join(dir, 'a11y-ratchet.config.ts'));
  });

  // NOT tested here: loading a .ts config under a process with no TS loader
  // registered. Vitest's own Vite-powered environment transparently
  // transforms any .ts file it dynamically imports - including one outside
  // the project tree, dynamically imported at an arbitrary path - so this
  // suite cannot observe plain Node's behaviour; it would only prove
  // Vitest can load TypeScript, which was never in question. Verified
  // manually instead against the built CLI (`node dist/cli/index.js`) and
  // reported in `DECISIONS.md` D55.

  it('uses an explicit path exactly, without discovery, even if a discoverable file also exists', async () => {
    await writeFile(join(dir, 'a11y-ratchet.config.json'), JSON.stringify({ suppressions: [] }));
    const explicitPath = join(dir, 'elsewhere.config.json');
    await writeFile(explicitPath, JSON.stringify({ mode: 'audit', suppressions: [] }));

    const result = await loadConfig(explicitPath, dir);
    expect(result.path).toBe(explicitPath);
    expect(result.config.mode).toBe('audit');
  });

  it('rejects malformed JSON with exit code 2 (config invalid), naming the file', async () => {
    const path = join(dir, 'a11y-ratchet.config.json');
    await writeFile(path, '{ not valid json');

    await expect(loadConfig(undefined, dir)).rejects.toMatchObject({ exitCode: 2 });
    await expect(loadConfig(undefined, dir)).rejects.toThrow(path);
  });

  it('rejects a schema-invalid config with exit code 2, listing the specific problem', async () => {
    const path = join(dir, 'a11y-ratchet.config.json');
    await writeFile(path, JSON.stringify({ suppressions: [{ id: 'x', rule: 'color-contrast' }] }));

    let error: unknown;
    try {
      await loadConfig(undefined, dir);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(A11yRatchetError);
    expect((error as A11yRatchetError).exitCode).toBe(2);
    expect((error as A11yRatchetError).message).toContain('reason');
  });

  it('rejects an explicit path that does not exist with exit code 3 (unreadable, not invalid)', async () => {
    await expect(loadConfig(join(dir, 'nope.json'), dir)).rejects.toMatchObject({ exitCode: 3 });
  });
});
