/**
 * Tool identity, resolved at runtime rather than hardcoded.
 *
 * Versions are recorded in every report and read by the engine-drift guard, so a
 * stale hardcoded string here would make a diff lie about what produced it.
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface PackageManifest {
  name: string;
  version: string;
}

function readManifest(startDir: string, expectedName?: string): PackageManifest {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as PackageManifest;
      if (!expectedName || parsed.name === expectedName) return parsed;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate package.json for ${expectedName ?? 'this package'}`);
    }
    dir = parent;
  }
}

const require = createRequire(import.meta.url);

const self = readManifest(dirname(fileURLToPath(import.meta.url)), 'a11y-ratchet');
const axe = JSON.parse(
  readFileSync(require.resolve('axe-core/package.json'), 'utf8'),
) as PackageManifest;

export const TOOL_NAME = self.name;
export const TOOL_VERSION = self.version;

/** Pinned exactly in package.json; recorded in every report (`00 §9` risk register). */
export const AXE_CORE_VERSION = axe.version;

/** Default location of the committed baseline (`01 §11`). */
export const DEFAULT_BASELINE_PATH = '.a11y/baseline.json';

/** Default location of the config file. */
export const DEFAULT_CONFIG_PATH = '.a11y/config.json';
