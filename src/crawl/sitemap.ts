/**
 * `sitemap.xml` and sitemap index files (`01 §2`: `crawl/sitemap.ts`).
 * Sitemap and URL-list seeding are first-class, not BFS's poor relation
 * (`00 §4`) — they give an exact, site-published page set, no discovery
 * heuristics needed.
 *
 * Extracts `<loc>` text via a plain regex rather than a full XML parser.
 * Sitemaps are simple, well-defined XML with no meaningful namespace
 * variation in the one element this needs — adding an XML dependency for
 * that would be exactly the kind of unneeded complexity the project avoids
 * (`tsup` is the only build tool; no framework).
 */

import { readFile } from 'node:fs/promises';

import { A11yRatchetError } from '../errors.js';

const LOC_PATTERN = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
const SITEMAP_INDEX_TAG = /<sitemapindex[\s>]/i;

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

async function loadText(pathOrUrl: string): Promise<string> {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    const response = await fetch(pathOrUrl);
    if (!response.ok) {
      throw new A11yRatchetError(`Failed to fetch sitemap ${pathOrUrl}: HTTP ${response.status}`, 3);
    }
    return response.text();
  }
  try {
    return await readFile(pathOrUrl, 'utf8');
  } catch (error) {
    throw new A11yRatchetError(
      `Could not read sitemap file ${pathOrUrl}: ${error instanceof Error ? error.message : String(error)}`,
      3,
    );
  }
}

function extractLocs(xml: string): string[] {
  const locs: string[] = [];
  for (const match of xml.matchAll(LOC_PATTERN)) {
    const loc = decodeXmlEntities(match[1]!.trim());
    if (loc) locs.push(loc);
  }
  return locs;
}

/**
 * Fetches (or reads, for a local path) `sitemapPathOrUrl`, and returns every
 * page URL it names. Sitemap INDEX files (`<sitemapindex>`) are followed
 * recursively - each nested sitemap's own `<loc>`s are concatenated in.
 */
export async function fetchSitemapUrls(sitemapPathOrUrl: string, seen: Set<string> = new Set()): Promise<string[]> {
  if (seen.has(sitemapPathOrUrl)) return []; // guards against a malformed index citing itself
  seen.add(sitemapPathOrUrl);

  const xml = await loadText(sitemapPathOrUrl);
  const locs = extractLocs(xml);

  if (!SITEMAP_INDEX_TAG.test(xml)) {
    return locs;
  }

  const nested = await Promise.all(locs.map((nestedSitemap) => fetchSitemapUrls(nestedSitemap, seen)));
  return nested.flat();
}
