/**
 * Static file server over `test/fixtures/pages/`.
 *
 * No test in this project touches the network (`03 §2.3`). A suite that depends
 * on a third party's website fails on someone else's deploy, and an
 * accessibility scanner whose test suite is red for reasons outside the repo
 * gets ignored within a week.
 *
 * The port is fixed rather than ephemeral so fixture URLs are byte-identical
 * between runs — the determinism tests compare fingerprint sets across scans,
 * and `urlTemplate` is an input to the fingerprint.
 */

import { createServer, type Server } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Fixed so fixture URLs are stable across runs. */
export const FIXTURE_PORT = 4173;

export const FIXTURE_ORIGIN = `http://127.0.0.1:${FIXTURE_PORT}`;

/** Absolute path to the served root. */
export const PAGES_ROOT = fileURLToPath(new URL('./pages/', import.meta.url));

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/**
 * Resolve a request path to a file inside `PAGES_ROOT`, or `null` if it escapes.
 * Directories resolve to their `index.html`.
 */
async function resolveFile(urlPath: string): Promise<string | null> {
  const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const root = resolve(PAGES_ROOT);
  const candidate = resolve(join(root, normalize(decoded)));

  // Path traversal guard: the resolved path must stay under the served root.
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    return null;
  }

  try {
    const info = await stat(candidate);
    if (info.isDirectory()) {
      const index = join(candidate, 'index.html');
      await stat(index);
      return index;
    }
    return candidate;
  } catch {
    return null;
  }
}

let server: Server | null = null;
let refCount = 0;

/**
 * Start the fixture server, or join an already-running one.
 *
 * Reference-counted so several suites in the same worker can each call
 * `start()`/`stop()` without fighting over the port.
 */
export async function start(): Promise<string> {
  refCount += 1;
  if (server) return FIXTURE_ORIGIN;

  const instance = createServer((req, res) => {
    void (async () => {
      const file = await resolveFile(req.url ?? '/');
      if (!file) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        // Fixtures change between runs of the suite; never let a proxy or the
        // browser under test serve a stale copy.
        'cache-control': 'no-store',
      });
      createReadStream(file).pipe(res);
    })();
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    instance.once('error', rejectPromise);
    instance.listen(FIXTURE_PORT, '127.0.0.1', () => {
      instance.removeListener('error', rejectPromise);
      resolvePromise();
    });
  });

  server = instance;
  return FIXTURE_ORIGIN;
}

/** Release one reference; the server closes when the last one goes. */
export async function stop(): Promise<void> {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0 || !server) return;

  const instance = server;
  server = null;
  await new Promise<void>((resolvePromise, rejectPromise) => {
    instance.close((error) => (error ? rejectPromise(error) : resolvePromise()));
  });
}

/** URL of a fixture page directory, e.g. `pageUrl('10-clean')`. */
export function pageUrl(dir: string): string {
  return `${FIXTURE_ORIGIN}/${dir}/`;
}

/** Absolute path of the fixture manifest. */
export const MANIFEST_PATH = join(PAGES_ROOT, 'manifest.json');
