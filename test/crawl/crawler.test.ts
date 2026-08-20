/**
 * Day 7's done-when: a depth-2 crawl of the fixture site finds exactly the
 * expected page set, and `--max-pages 3` stops at 3. Plus the `--exclude`
 * glob and `robots.txt` filters, both exercised against the same fixture
 * site so the expected page set stays easy to reason about.
 *
 * `test/fixtures/pages/crawl-site/` link graph (`00 §4`, `01 §2`):
 *   index (depth 0) -> page-a, page-b, excluded (depth 1), off-site (cross-origin, dropped)
 *   page-a (depth 1) -> index (revisit, deduped), page-c (depth 2)
 *   page-b (depth 1) -> page-e (depth 2)
 *   page-c (depth 2) -> page-d (depth 3, must be excluded by the depth cap)
 *
 * The sitemap/url-list seed tests need absolute URLs at the fixture server's
 * *actual* origin — since Day 8 (`DECISIONS.md` D53) that origin is an
 * ephemeral port assigned per run, not a fixed one, so those files can't be
 * static fixtures on disk. Generated into a temp dir in `beforeAll` instead.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { scan } from '../../src/index.js';
import { pageUrl, start, stop } from '../fixtures/server.js';

function pageNames(urls: string[]): string[] {
  return urls
    .map((url) => {
      const path = new URL(url).pathname;
      return path.endsWith('/') ? 'index' : (path.split('/').pop() ?? 'index');
    })
    .sort();
}

describe('crawl frontier against the crawl-site fixture', () => {
  let tmpDir: string;
  let sitemapPath: string;
  let urlListPath: string;
  let urlListWithMissingPath: string;

  beforeAll(async () => {
    await start();
    const crawlSite = pageUrl('crawl-site');

    tmpDir = await mkdtemp(join(tmpdir(), 'a11y-ratchet-crawl-test-'));

    sitemapPath = join(tmpDir, 'sitemap.xml');
    await writeFile(
      sitemapPath,
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${crawlSite}</loc></url>
  <url><loc>${crawlSite}page-d.html</loc></url>
</urlset>
`,
    );

    urlListPath = join(tmpDir, 'urls.txt');
    await writeFile(urlListPath, `${crawlSite}page-b.html\n${crawlSite}page-e.html\n`);

    urlListWithMissingPath = join(tmpDir, 'urls-with-missing.txt');
    await writeFile(urlListWithMissingPath, `${crawlSite}index.html\n${crawlSite}does-not-exist.html\n`);
  }, 30_000);

  afterAll(async () => {
    await stop();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('a depth-2 crawl finds exactly the expected page set', async () => {
    const report = await scan({
      seed: { url: pageUrl('crawl-site') },
      crawl: { maxDepth: 2, respectRobots: false },
    });

    expect(report.pages.every((page) => !page.error)).toBe(true);
    expect(pageNames(report.pages.map((page) => page.url))).toEqual(
      ['excluded.html', 'index', 'page-a.html', 'page-b.html', 'page-c.html', 'page-e.html'].sort(),
    );
    // page-d.html only exists at depth 3 - the depth cap must keep it out entirely.
    expect(report.pages.some((page) => page.url.includes('page-d'))).toBe(false);
    // The off-site link is a different origin and must never be requested.
    expect(report.pages.some((page) => page.url.includes('example.com'))).toBe(false);

    const byName = new Map(report.pages.map((page) => [new URL(page.url).pathname, page.depth]));
    expect(byName.get('/crawl-site/')).toBe(0);
    expect(byName.get('/crawl-site/page-a.html')).toBe(1);
    expect(byName.get('/crawl-site/page-b.html')).toBe(1);
    expect(byName.get('/crawl-site/excluded.html')).toBe(1);
    expect(byName.get('/crawl-site/page-c.html')).toBe(2);
    expect(byName.get('/crawl-site/page-e.html')).toBe(2);
  }, 30_000);

  it('--max-pages 3 stops at exactly 3 pages', async () => {
    const report = await scan({
      seed: { url: pageUrl('crawl-site') },
      // concurrency: 1 makes admission order deterministic - BFS pulls the
      // queue strictly in enqueue order with a single worker.
      concurrency: 1,
      crawl: { maxDepth: 2, maxPages: 3, respectRobots: false },
    });

    expect(report.pages).toHaveLength(3);
    // index's own links are discovered in document order (page-a, page-b,
    // excluded, off-site) - the cap is hit after page-b, before excluded.
    expect(pageNames(report.pages.map((page) => page.url))).toEqual(
      ['index', 'page-a.html', 'page-b.html'].sort(),
    );
  }, 30_000);

  it('--exclude drops the matched page from the crawl', async () => {
    const report = await scan({
      seed: { url: pageUrl('crawl-site') },
      crawl: { maxDepth: 2, exclude: ['**/excluded*'], respectRobots: false },
    });

    expect(pageNames(report.pages.map((page) => page.url))).toEqual(
      ['index', 'page-a.html', 'page-b.html', 'page-c.html', 'page-e.html'].sort(),
    );
  }, 30_000);

  it('respects robots.txt by default, and --no-robots (respectRobots: false) opts back in', async () => {
    const withRobots = await scan({
      seed: { url: pageUrl('crawl-site') },
      crawl: { maxDepth: 2 }, // respectRobots defaults to true
    });
    expect(pageNames(withRobots.pages.map((page) => page.url))).toEqual(
      ['index', 'page-a.html', 'page-b.html', 'page-c.html', 'page-e.html'].sort(),
    );

    const withoutRobots = await scan({
      seed: { url: pageUrl('crawl-site') },
      crawl: { maxDepth: 2, respectRobots: false },
    });
    expect(pageNames(withoutRobots.pages.map((page) => page.url))).toEqual(
      ['excluded.html', 'index', 'page-a.html', 'page-b.html', 'page-c.html', 'page-e.html'].sort(),
    );
  }, 30_000);

  it('seeds from an explicit sitemap.xml, scanning exactly the listed URLs with no further crawling', async () => {
    // page-d.html is depth 3 in the link graph and would never be reached by
    // BFS from a depth-2 cap - the sitemap names it directly, so a sitemap
    // seed must be able to reach it. It links nowhere, so this also proves
    // sitemap seeds never crawl beyond their own list.
    const report = await scan({ seed: { sitemap: sitemapPath } });

    expect(pageNames(report.pages.map((page) => page.url))).toEqual(['index', 'page-d.html'].sort());
    expect(report.pages.every((page) => page.depth === 0)).toBe(true);
  }, 30_000);

  it('seeds from an explicit URL list file, scanning exactly the listed URLs', async () => {
    const report = await scan({ seed: { urlList: urlListPath } });

    expect(pageNames(report.pages.map((page) => page.url))).toEqual(['page-b.html', 'page-e.html'].sort());
  }, 30_000);

  it('a 404 still navigates and settles - it is an httpStatus, not a PageError', async () => {
    const report = await scan({ seed: { urlList: urlListWithMissingPath } });

    const missing = report.pages.find((page) => page.url.includes('does-not-exist'));
    expect(missing?.error).toBeUndefined();
    expect(missing?.httpStatus).toBe(404);
  }, 30_000);

  it('records a genuinely unreachable page as a typed navigation-failed error, not a silent skip', async () => {
    // Port 1 refuses the connection outright - no server there, no DNS
    // lookup delay, so this fails fast instead of waiting out a timeout.
    const report = await scan({ seed: { url: 'http://127.0.0.1:1/unreachable' } });

    expect(report.pages).toHaveLength(1);
    expect(report.pages[0]?.error?.kind).toBe('navigation-failed');
    expect(report.pages[0]?.counts).toEqual({ violation: 0, needsReview: 0, bestPractice: 0, suppressed: 0 });
    // A page that failed to load is recorded as an error, never a
    // zero-violation page (CLAUDE.md invariant 2).
    expect(report.summary.pages.errored).toBe(1);
    expect(report.summary.pages.scanned).toBe(0);
  }, 30_000);
});
