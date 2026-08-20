/**
 * BFS queue and visited-set (`01 §2`: `crawl/frontier.ts`). The fallback seed
 * strategy, not the flagship (`00 §4`) — a plain FIFO queue with a visited
 * set, depth cap and page cap. No clever exploration heuristics (Day 7's
 * explicit scope).
 */

import { isUrlAllowedByGlobs, isAllowedByRobots, type RobotsRules, type UrlGlobOptions } from './filters.js';
import { canonicaliseUrlForCrawling } from '../identity/fingerprint.js';

export interface FrontierEntry {
  url: string;
  depth: number;
}

export interface FrontierOptions extends UrlGlobOptions {
  maxDepth?: number;
  maxPages?: number;
  robots?: RobotsRules;
}

/**
 * The queue owns admission: every URL that will ever be crawled passes
 * through `tryEnqueue`, so depth cap, page cap, glob filters and robots.txt
 * are all enforced in exactly one place rather than re-checked by callers.
 */
export class Frontier {
  private readonly queue: FrontierEntry[] = [];
  private readonly visited = new Set<string>();
  private readonly maxDepth: number;
  private readonly maxPages: number | undefined;
  private readonly globOptions: UrlGlobOptions;
  private readonly robots: RobotsRules | undefined;
  private admitted = 0;

  constructor(options: FrontierOptions = {}) {
    this.maxDepth = options.maxDepth ?? Infinity;
    this.maxPages = options.maxPages;
    this.globOptions = { ...(options.include ? { include: options.include } : {}), ...(options.exclude ? { exclude: options.exclude } : {}) };
    this.robots = options.robots;
  }

  /** Number of pages this frontier has admitted so far (queued + dequeued). */
  get admittedCount(): number {
    return this.admitted;
  }

  get pending(): number {
    return this.queue.length;
  }

  /**
   * Attempts to add `entry` to the queue. Returns whether it was admitted —
   * false covers every rejection reason (already visited, over depth, over
   * the page cap, excluded by a glob, or disallowed by robots.txt) alike,
   * since none of them are errors.
   */
  tryEnqueue(entry: FrontierEntry): boolean {
    if (entry.depth > this.maxDepth) return false;
    if (this.maxPages !== undefined && this.admitted >= this.maxPages) return false;

    const key = canonicaliseUrlForCrawling(entry.url);
    if (this.visited.has(key)) return false;

    if (!isUrlAllowedByGlobs(entry.url, this.globOptions)) return false;

    if (this.robots) {
      const parsed = new URL(entry.url);
      if (!isAllowedByRobots(parsed.pathname + parsed.search, this.robots)) return false;
    }

    this.visited.add(key);
    this.admitted += 1;
    this.queue.push(entry);
    return true;
  }

  dequeue(): FrontierEntry | undefined {
    return this.queue.shift();
  }

  /** Whether the page cap has already been reached — callers should stop enqueueing new links. */
  get atPageCap(): boolean {
    return this.maxPages !== undefined && this.admitted >= this.maxPages;
  }
}

/**
 * Resolves a page's raw `<a href>` values against the page's own URL, and
 * keeps only the ones that stay on that page's origin. Must run before the
 * page closes; the caller owns that ordering. Not a `Frontier` method — it
 * depends on a live Playwright `Page`'s DOM, which the frontier itself never
 * touches.
 */
export function resolveSameOriginLinks(pageUrl: string, hrefs: readonly string[]): string[] {
  const origin = new URL(pageUrl).origin;
  const result: string[] = [];
  for (const href of hrefs) {
    let resolved: URL;
    try {
      resolved = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (resolved.origin !== origin) continue;
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
    resolved.hash = '';
    result.push(resolved.toString());
  }
  return result;
}
