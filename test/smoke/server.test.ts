/**
 * Fixture server smoke test.
 *
 * No test in this project touches the network. This one proves the local
 * substitute actually serves the fixture pages, because every integration test
 * from Day 2 onwards depends on it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FIXTURE_ORIGIN, pageUrl, start, stop } from '../fixtures/server.js';

describe('fixture server', () => {
  beforeAll(async () => {
    await start();
  });

  afterAll(async () => {
    await stop();
  });

  it('serves the clean page over a deterministic origin', async () => {
    expect(pageUrl('10-clean')).toBe(`${FIXTURE_ORIGIN}/10-clean/`);

    const response = await fetch(pageUrl('10-clean'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');

    const html = await response.text();
    expect(html).toContain('<title>Clean page');
    expect(html).toContain('id="main-content"');
  });

  it('serves each of the first-pass fixture directories', async () => {
    for (const dir of ['01-images', '02-structure', '03-contrast', '10-clean']) {
      const response = await fetch(pageUrl(dir));
      expect(response.status, `${dir} did not serve`).toBe(200);
    }
  });

  it('serves the manifest', async () => {
    const response = await fetch(`${FIXTURE_ORIGIN}/manifest.json`);
    expect(response.status).toBe(200);

    const manifest = (await response.json()) as { pages: { path: string }[] };
    expect(manifest.pages.map((page) => page.path)).toContain('10-clean/index.html');
  });

  it('404s for unknown paths', async () => {
    const response = await fetch(`${FIXTURE_ORIGIN}/no-such-page/`);
    expect(response.status).toBe(404);
  });

  it('refuses to serve files outside the fixture root', async () => {
    // Percent-encoded so the URL parser does not normalise the traversal away
    // before it reaches the server's own guard.
    const response = await fetch(`${FIXTURE_ORIGIN}/%2e%2e/%2e%2e/package.json`);
    expect(response.status).toBe(404);
  });
});
