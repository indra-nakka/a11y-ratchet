/**
 * Static file server over `test/fixtures/pages/`.
 *
 * No test in this project touches the network (`03 §2.3`). A suite that depends
 * on a third party's website fails on someone else's deploy, and an
 * accessibility scanner whose test suite is red for reasons outside the repo
 * gets ignored within a week.
 *
 * Binds an ephemeral port (`listen(0, ...)`), not a fixed one. A fixed port
 * was the Day 7 fix for `EADDRINUSE` races between test files (`DECISIONS.md`
 * D51) — the wrong fix: the race is that two files can both try to bind ONE
 * port, and it holds regardless of whether that port is fixed or ephemeral.
 * `vitest.config.ts`'s `fileParallelism: false` was the actual fix; a fixed
 * port bought nothing but the false comfort of byte-identical fixture URLs
 * across runs, which nothing actually depends on — `urlTemplate` (the
 * fingerprint input the comment worried about) is path-only, deliberately
 * excluding origin and port (`02 §5`).
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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
let origin: string | null = null;

/**
 * Start the fixture server, or join an already-running one, and return its
 * origin. The port is assigned by the OS (`listen(0, ...)`) and only known
 * once `start()` resolves — callers must use the returned origin (or
 * `currentOrigin()`/`pageUrl()` afterwards), never assume a fixed value.
 *
 * Reference-counted so several suites in the same worker can each call
 * `start()`/`stop()` without fighting over the server.
 */
export async function start(): Promise<string> {
  refCount += 1;
  if (server && origin) return origin;

  const instance = createServer((req, res) => {
    // Never responds. Exists so a fixture can request a resource (a font,
    // via `@font-face`) that never finishes loading, for the settle
    // fonts-ready cap test (`DECISIONS.md` D54) - the browser's connection
    // closes on its own once the page/context closes, so this never blocks
    // stop().
    if (req.url === '/settle-degraded/hang.font') return;

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
    instance.listen(0, '127.0.0.1', () => {
      instance.removeListener('error', rejectPromise);
      resolvePromise();
    });
  });

  const address = instance.address() as AddressInfo | null;
  if (!address) {
    throw new Error('fixture server did not resolve a listening address');
  }

  server = instance;
  origin = `http://127.0.0.1:${address.port}`;
  return origin;
}

/** Release one reference; the server closes when the last one goes. */
export async function stop(): Promise<void> {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0 || !server) return;

  const instance = server;
  server = null;
  origin = null;
  await new Promise<void>((resolvePromise, rejectPromise) => {
    instance.close((error) => (error ? rejectPromise(error) : resolvePromise()));
  });
}

/** The running server's origin. Throws if `start()` hasn't resolved yet. */
export function currentOrigin(): string {
  if (!origin) {
    throw new Error('fixture server not started - call start() before pageUrl()/currentOrigin()');
  }
  return origin;
}

/** URL of a fixture page directory, e.g. `pageUrl('10-clean')`. */
export function pageUrl(dir: string): string {
  return `${currentOrigin()}/${dir}/`;
}

/** Absolute path of the fixture manifest. */
export const MANIFEST_PATH = join(PAGES_ROOT, 'manifest.json');
