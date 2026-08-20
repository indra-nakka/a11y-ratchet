/**
 * Report JSON read/write (`01 §2`: `report/json.ts`). A written artefact —
 * `Report` is also the on-disk baseline format (`01 §11`) — so this exists
 * as soon as anything (the diff CLI, baseline commands) needs to read one
 * back off disk, not just when the report-rendering days land.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { A11yRatchetError } from '../errors.js';
import type { Report } from '../types.js';

const SUPPORTED_SCHEMA_VERSION = '1.2';

/** Reads a report or baseline from disk, validating its `schemaVersion`. */
export async function readReport(path: string): Promise<Report> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    throw new A11yRatchetError(
      `Could not read report at ${path}: ${error instanceof Error ? error.message : String(error)}`,
      3,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new A11yRatchetError(
      `Report at ${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      3,
    );
  }

  const schemaVersion = (parsed as { schemaVersion?: unknown }).schemaVersion;
  if (schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new A11yRatchetError(
      `Report at ${path} has schemaVersion ${JSON.stringify(schemaVersion)}, expected ` +
        `"${SUPPORTED_SCHEMA_VERSION}". Regenerate it with the current tool version.`,
      3,
    );
  }

  return parsed as Report;
}

/**
 * Writes a report to disk with stable (alphabetised) object key ordering,
 * so a committed baseline diffs cleanly in a PR (`01 §11`) — array order is
 * left untouched, since it's meaningful (document order, crawl order).
 */
export async function writeReport(report: Report, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const stable = JSON.stringify(sortKeysStably(report), null, 2);
  await writeFile(path, `${stable}\n`, 'utf8');
}

function sortKeysStably(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysStably);
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortKeysStably(source[key]);
    }
    return sorted;
  }
  return value;
}
