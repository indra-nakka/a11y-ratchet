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

const SUPPORTED_SCHEMA_VERSION = '1.3';

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

  const missing = REQUIRED_TOP_LEVEL_FIELDS.filter((field) => !(field in (parsed as object)));
  if (missing.length > 0) {
    throw new A11yRatchetError(
      `Report at ${path} claims schemaVersion "${SUPPORTED_SCHEMA_VERSION}" but is missing ` +
        `required field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}. It is likely ` +
        `truncated or hand-edited - regenerate it with a fresh scan rather than repairing it by hand.`,
      3,
    );
  }

  return parsed as Report;
}

/**
 * A shallow "does this look like a real Report" gate, not full structural
 * validation - `Report` has no runtime (Zod) schema the way `Config` does,
 * and building one is a bigger lift than today's scope. This exists
 * because `schemaVersion` alone lets a truncated or hand-edited file (e.g.
 * `{"schemaVersion": "1.3", "findings": []}`) through as "valid", which
 * then fails deep inside `diff()`/`renderDiff()` with a raw
 * `TypeError: Cannot read properties of undefined` instead of a message
 * that says what's wrong - the exit code was already correct (any thrown
 * `Error` becomes exit 3 via the CLI's catch-all), only the message
 * quality was missing. Every top-level `Report` field, so the common
 * "half the file got cut off" case is caught, without validating each
 * field's own shape.
 */
const REQUIRED_TOP_LEVEL_FIELDS = ['tool', 'run', 'pages', 'findings', 'groups', 'templateGroups', 'summary'] as const;

/**
 * Renders a report (or any JSON-shaped value) with stable (alphabetised)
 * object key ordering, so a committed baseline diffs cleanly in a PR
 * (`01 §11`) — array order is left untouched, since it's meaningful
 * (document order, crawl order). Shared by `writeReport` and
 * `renderReport({format: 'json'})` (`index.ts`) so the two never quietly
 * diverge on formatting.
 */
export function toStableJson(report: Report): string {
  return JSON.stringify(sortKeysStably(report), null, 2);
}

/** Writes a report to disk using `toStableJson`. */
export async function writeReport(report: Report, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${toStableJson(report)}\n`, 'utf8');
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
