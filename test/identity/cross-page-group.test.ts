/**
 * Day 4, question 2: does `groupKey` actually collapse a repeated element
 * across pages? The checked-in Day 1 fixtures don't have a shared broken
 * nav/footer to test this against — each page's header/nav is either unique
 * or clean (checked directly against the fixture HTML before writing this).
 * A real answer needs a real cross-page scenario, so this spins up its own
 * tiny two-page server rather than assuming the mechanism works from the
 * unit-level `computeGroupKey` tests alone.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';

import { scan } from '../../src/index.js';

const PORT = 4174;
const ORIGIN = `http://127.0.0.1:${PORT}`;

// Identical broken nav (icon-only link, no accessible name) on both pages -
// same rule, same landmark, same missing name. Everything else differs:
// different heading, different page-specific content, different path.
const sharedNav = `
  <nav aria-label="Primary">
    <a href="/"><svg width="16" height="16"><circle cx="8" cy="8" r="6" /></svg></a>
  </nav>`;

// The h1 precedes the shared nav on both pages (unlike a typical
// header-first layout) specifically so headingContext differs meaningfully
// between them - the scenario 02 §4's rationale is actually about.
const PAGES: Record<string, string> = {
  '/page-one/': `<!doctype html><html lang="en"><head><title>Page One</title></head>
    <body><h1>Welcome</h1><header>${sharedNav}</header><main><p>First page content.</p></main></body></html>`,
  '/page-two/': `<!doctype html><html lang="en"><head><title>Page Two</title></head>
    <body><h1>About us</h1><header>${sharedNav}</header><main><p>Second, unrelated page content.</p></main></body></html>`,
};

let server: Server;

beforeAll(async () => {
  server = createServer((req, res) => {
    const body = PAGES[req.url ?? ''];
    if (!body) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve));
}, 30_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('groupKey collapses a repeated element across pages', () => {
  it('gives the shared broken nav link the same groupKey on both pages, despite different fingerprints', async () => {
    const [reportOne, reportTwo] = await Promise.all([
      scan({ seed: { url: `${ORIGIN}/page-one/` } }),
      scan({ seed: { url: `${ORIGIN}/page-two/` } }),
    ]);

    const findingOne = reportOne.findings.find((f) => f.ruleId === 'link-name');
    const findingTwo = reportTwo.findings.find((f) => f.ruleId === 'link-name');

    expect(findingOne, 'expected link-name to fire on page one').toBeDefined();
    expect(findingTwo, 'expected link-name to fire on page two').toBeDefined();

    // The whole point of groupKey: identical defect, different page ->
    // same group.
    expect(findingTwo!.groupKey).toBe(findingOne!.groupKey);

    // And it's NOT because the fingerprint also collapsed - headingContext
    // ("welcome" vs "about us") and urlTemplate (/page-one/ vs /page-two/)
    // both feed the fingerprint but neither feeds groupKey (02 §4) - this is
    // the exact bug the doc's §4 rationale describes fixing in the first
    // draft (groupKey inheriting headingContext, varying per page).
    expect(findingTwo!.fingerprint).not.toBe(findingOne!.fingerprint);
    expect(findingOne!.identity.context.headingContext).not.toBe(findingTwo!.identity.context.headingContext);
    expect(findingOne!.urlTemplate).not.toBe(findingTwo!.urlTemplate);
  }, 30_000);
});
