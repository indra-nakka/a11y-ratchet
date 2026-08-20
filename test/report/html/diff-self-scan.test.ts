/**
 * The diff HTML view's own accessibility (`renderDiff.ts`, Day 11) - same
 * discipline as `self-scan.test.ts` for the scan report: generate a real,
 * non-trivial `DiffResult` (real new/fixed/persisting findings from two
 * real scans, not synthetic `DiffResult` objects), render it, and scan the
 * rendered page itself for zero violations. `00 §7` never cuts "the
 * report's own accessibility", and that applies to every self-contained
 * document this tool emits, not only the scan report.
 */

import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { diff, renderDiff, renderReport, scan } from '../../../src/index.js';

const PORT = 4190;
const ORIGIN = `http://127.0.0.1:${PORT}`;

function page(body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>diff-self-scan</title></head><body>${body}</body></html>`;
}

// One page persists unchanged (a violation present in both runs), one
// page's violation is fixed in head, one page gains a new violation in
// head - enough for the new/fixed/persisting sections to all render real
// content, not an empty-shell page that would trivially pass its own scan.
const BASE_ROUTES: Record<string, string> = {
  '/persist/': page('<main><h1>Persist</h1><img id="chart" src="./a.svg"></main>'),
  '/fixed/': page('<main><h1>Fixed</h1><img id="hero" src="./a.svg"></main>'),
  '/new/': page('<main><h1>New</h1><img id="logo" src="./a.svg" alt="Logo"></main>'),
};

const HEAD_ROUTES: Record<string, string> = {
  '/persist/': page('<main><h1>Persist</h1><img id="chart" src="./a.svg"></main>'),
  '/fixed/': page('<main><h1>Fixed</h1><img id="hero" src="./a.svg" alt="Hero banner"></main>'),
  '/new/': page('<main><h1>New</h1><img id="logo" src="./a.svg"></main>'),
};

let routes: Record<string, string> = BASE_ROUTES;
let server: Server;

async function startServer(): Promise<void> {
  server = createServer((req, res) => {
    const body = routes[req.url ?? ''];
    if (body === undefined) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve));
}

async function stopServer(): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

describe('the generated diff HTML view passes its own scan', () => {
  let tmpDir: string;
  let diffReportPath: string;

  beforeAll(async () => {
    await startServer();

    tmpDir = await mkdtemp(join(tmpdir(), 'a11y-ratchet-diff-self-scan-'));
    const urlListPath = join(tmpDir, 'urls.txt');
    await writeFile(urlListPath, Object.keys(BASE_ROUTES).map((path) => `${ORIGIN}${path}`).join('\n'), 'utf8');

    routes = BASE_ROUTES;
    const base = await scan({ seed: { urlList: urlListPath } });
    expect(base.findings.length, 'base fixture must produce findings for this test to mean anything').toBeGreaterThan(0);

    routes = HEAD_ROUTES;
    const head = await scan({ seed: { urlList: urlListPath } });

    const result = diff(base, head);
    expect(result.findings.new.length, 'the /new/ page must produce a real new finding').toBeGreaterThan(0);
    expect(result.findings.fixed.length, 'the /fixed/ page must produce a real fixed finding').toBeGreaterThan(0);
    expect(result.findings.persisting.length, 'the /persist/ page must produce a real persisting finding').toBeGreaterThan(0);

    const html = await renderDiff(result, { format: 'html' });
    diffReportPath = join(tmpDir, 'diff.html');
    await writeFile(diffReportPath, html, 'utf8');

    // The report's own toString isn't exercised elsewhere in this suite -
    // confirm renderReport({format: 'json'}) round-trips too, since both
    // shipped together today.
    const json = await renderReport(base, { format: 'json' });
    expect(() => {
      JSON.parse(json);
    }).not.toThrow();
  }, 60_000);

  afterAll(async () => {
    await stopServer();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('scans clean: zero violations, zero best-practice findings', async () => {
    const fileUrl = pathToFileURL(diffReportPath).href;
    const selfScan = await scan({ seed: { url: fileUrl }, probes: [] });

    expect(selfScan.pages[0]?.error, 'the diff report file itself must load without error').toBeUndefined();

    const violations = selfScan.findings.filter((f) => f.bucket === 'violation' && !f.bestPractice);
    if (violations.length > 0) {
      const detail = violations.map((f) => `${f.ruleId} — ${f.selector} — ${f.remediation}`).join('\n');
      expect(violations, `report/html/renderDiff.ts produced inaccessible markup:\n${detail}`).toEqual([]);
    }

    const bestPractice = selfScan.findings.filter((f) => f.bestPractice);
    expect(bestPractice, 'best-practice findings too, even though they never gate').toEqual([]);
  }, 30_000);
});
