/**
 * Config file discovery and loading (`01 §2`: `config/load.ts`).
 *
 * Discovers `a11y-ratchet.config.{ts,js,json}` in that order - the first one
 * present wins, the rest are never even opened. No config file at all is not
 * an error: suppressions are opt-in, and a11y-ratchet works with zero config.
 */

import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ConfigSchema, DEFAULT_CONFIG, type Config } from './schema.js';
import { A11yRatchetError } from '../errors.js';
import { CONFIG_BASENAME } from '../meta.js';

const DISCOVERY_EXTENSIONS = ['ts', 'js', 'json'] as const;

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Finds `a11y-ratchet.config.{ts,js,json}` in `cwd`, or `null` if none exists. */
export async function discoverConfigPath(cwd: string = process.cwd()): Promise<string | null> {
  for (const ext of DISCOVERY_EXTENSIONS) {
    const candidate = join(cwd, `${CONFIG_BASENAME}.${ext}`);
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reads and parses the raw config value out of `path`, without validating
 * it against `ConfigSchema` yet. `.json` is read and `JSON.parse`d; `.js`
 * and `.ts` are imported as ESM and their default export is used.
 *
 * A `.ts` file that fails to import is reported as what it almost certainly
 * is: this process has no TypeScript loader registered (Node has no native
 * `.ts` support without one) - not a generic "could not load" error, since
 * that would send someone chasing the wrong problem.
 */
async function readConfigSource(path: string): Promise<unknown> {
  if (path.endsWith('.json')) {
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch (error) {
      throw new A11yRatchetError(`Could not read config file ${path}: ${errorMessage(error)}`, 3);
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new A11yRatchetError(`Config file ${path} is not valid JSON: ${errorMessage(error)}`, 2);
    }
  }

  try {
    const imported = (await import(pathToFileURL(path).href)) as { default?: unknown };
    return imported.default ?? imported;
  } catch (error) {
    if (path.endsWith('.ts')) {
      throw new A11yRatchetError(
        `Could not load ${path}: this process has no TypeScript loader registered, so it cannot ` +
          `import a .ts config file directly. Run under tsx/ts-node, or use a .js or .json config. ` +
          `(${errorMessage(error)})`,
        3,
      );
    }
    throw new A11yRatchetError(`Could not load config file ${path}: ${errorMessage(error)}`, 3);
  }
}

export interface LoadedConfig {
  config: Config;
  /** The file actually loaded, or `null` when none was found and defaults applied. */
  path: string | null;
}

/**
 * Loads and validates the config.
 *
 * `explicitPath`, if given, is used exactly - no discovery, and no falling
 * back to defaults if it is missing or invalid; the caller asked for that
 * file specifically. Otherwise, discovers in `cwd`; if nothing is found,
 * returns `DEFAULT_CONFIG` with `path: null` rather than erroring.
 */
export async function loadConfig(explicitPath?: string, cwd: string = process.cwd()): Promise<LoadedConfig> {
  const path = explicitPath ?? (await discoverConfigPath(cwd));
  if (!path) {
    return { config: DEFAULT_CONFIG, path: null };
  }

  const source = await readConfigSource(path);
  const result = ConfigSchema.safeParse(source);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => issue.message);
    throw new A11yRatchetError(`Config file ${path} is invalid:\n  - ${messages.join('\n  - ')}`, 2);
  }

  return { config: result.data, path };
}
