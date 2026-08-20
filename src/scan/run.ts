/**
 * Orchestrates a scan: frontier/sitemap/url-list seeding → worker pool →
 * mode policy → settle → axe → normalise → `Report` (`01 §4`).
 *
 * Sitemap and URL-list seeds hand the frontier an exact page set at depth 0
 * and are never followed for further links — that exactness is the whole
 * point of using them (`00 §4`). Only a `url` seed runs BFS: each page's
 * same-origin links are discovered and enqueued at depth+1.
 */

import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { BrowserContext, Page } from 'playwright';

import { injectAxeIntoAllFrames, runAxe } from './axe.js';
import {
  BrowserPool,
  DEFAULT_COLOR_SCHEME,
  DEFAULT_CONCURRENCY,
  DEFAULT_LOCALE,
  DEFAULT_VIEWPORT,
  FIXED_DEVICE_SCALE_FACTOR,
  FIXED_REDUCED_MOTION,
  FIXED_TIMEZONE_ID,
} from './browser.js';
import { installThirdPartyBlock, resolveModePolicy } from './modes.js';
import { normaliseRawFindings } from './normalise.js';
import { settle } from './settle.js';
import { Frontier, resolveSameOriginLinks, type FrontierEntry } from '../crawl/frontier.js';
import { fetchRobotsRules, type RobotsRules } from '../crawl/filters.js';
import { fetchSitemapUrls } from '../crawl/sitemap.js';
import { loadConfig } from '../config/load.js';
import { applySuppressions } from '../config/suppress.js';
import type { SuppressionEntry } from '../config/schema.js';
import { urlTemplateFor } from '../identity/fingerprint.js';
import { A11yRatchetError, NotImplementedError } from '../errors.js';
import { AXE_CORE_VERSION, TOOL_NAME, TOOL_VERSION } from '../meta.js';
import type {
  Finding,
  IdentityTier,
  Impact,
  Level,
  PageErrorKind,
  PageResult,
  Report,
  RunInfo,
  ScanOptions,
  SettleSettings,
  Source,
  Summary,
  ToolInfo,
} from '../types.js';

const require = createRequire(import.meta.url);
const PLAYWRIGHT_VERSION = (require('playwright/package.json') as { version: string }).version;

const DEFAULT_SETTLE: SettleSettings = {
  strategy: 'default',
  quietMs: 150,
  quietCapMs: 2000,
  fontsReadyCapMs: 3000,
  imageDecodeCapMs: 1500,
};

/** `01 §2`: politeness delay between requests to one origin. */
const DEFAULT_DELAY_MS = 250;

export async function runScan(options: ScanOptions): Promise<Report> {
  const { seed } = options;
  const seedKindCount = [seed.url, seed.sitemap, seed.urlList].filter((value) => value !== undefined).length;
  if (seedKindCount !== 1) {
    throw new A11yRatchetError('scan() requires exactly one of seed.url, seed.sitemap, seed.urlList', 3);
  }
  if (options.probes && options.probes.length > 0) {
    throw new NotImplementedError('interaction probes', 'Day 9');
  }

  const runStartedAt = new Date();
  const { config } = await loadConfig(options.configPath);
  const mode = options.mode ?? config.mode ?? 'ci';
  const viewport = options.viewport ?? DEFAULT_VIEWPORT;
  const locale = options.locale ?? DEFAULT_LOCALE;
  const colorScheme = options.colorScheme ?? DEFAULT_COLOR_SCHEME;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const settleSettings: SettleSettings = { ...DEFAULT_SETTLE, ...options.settle };
  const includeBestPractice = options.includeBestPractice ?? false;

  const crawl = options.crawl ?? {};
  const respectRobots = crawl.respectRobots ?? true;
  const delayMs = crawl.delayMs ?? DEFAULT_DELAY_MS;

  // Seeding: sitemap/urlList give an exact page set at depth 0, never
  // followed further. Only a `url` seed discovers links as it goes (BFS).
  let seedEntries: FrontierEntry[];
  let discoverLinks: boolean;
  let baseUrl: string;
  if (seed.url) {
    seedEntries = [{ url: seed.url, depth: 0 }];
    discoverLinks = true;
    baseUrl = seed.url;
  } else if (seed.sitemap) {
    const urls = await fetchSitemapUrls(seed.sitemap);
    if (urls.length === 0) {
      throw new A11yRatchetError(`Sitemap ${seed.sitemap} named no page URLs`, 3);
    }
    seedEntries = urls.map((url) => ({ url, depth: 0 }));
    discoverLinks = false;
    baseUrl = urls[0]!;
  } else {
    const urls = await readUrlListFile(seed.urlList!);
    if (urls.length === 0) {
      throw new A11yRatchetError(`URL list ${seed.urlList} named no URLs`, 3);
    }
    seedEntries = urls.map((url) => ({ url, depth: 0 }));
    discoverLinks = false;
    baseUrl = urls[0]!;
  }

  const baseOrigin = new URL(baseUrl).origin;
  let robots: RobotsRules | undefined;
  if (respectRobots) {
    robots = await fetchRobotsRules(baseOrigin);
  }

  const frontier = new Frontier({
    ...(crawl.include ? { include: crawl.include } : {}),
    ...(crawl.exclude ? { exclude: crawl.exclude } : {}),
    ...(crawl.maxDepth !== undefined ? { maxDepth: crawl.maxDepth } : {}),
    ...(crawl.maxPages !== undefined ? { maxPages: crawl.maxPages } : {}),
    ...(robots ? { robots } : {}),
  });
  for (const entry of seedEntries) {
    frontier.tryEnqueue(entry);
  }

  const pool = await BrowserPool.launch({
    viewport,
    locale,
    colorScheme,
    concurrency,
    ...(options.storageState !== undefined ? { storageState: options.storageState } : {}),
  });

  const pages: PageResult[] = [];
  const findings: Finding[] = [];
  const blockedOrigins = new Set<string>();

  try {
    const modePolicy = resolveModePolicy(mode);
    const hostLimiter = new HostRateLimiter(delayMs);
    const workerContexts = new Map<number, BrowserContext>();

    async function processEntry(entry: FrontierEntry, workerId: number): Promise<void> {
      await hostLimiter.wait(new URL(entry.url).host);

      const context = await pool.acquire(workerId);
      if (workerContexts.get(workerId) !== context) {
        workerContexts.set(workerId, context);
        if (modePolicy.blockThirdParty) {
          const block = await installThirdPartyBlock(context, baseOrigin);
          for (const origin of block.blockedOrigins) blockedOrigins.add(origin);
        }
      }

      const page = await context.newPage();
      const result = await scanOnePage(
        page,
        entry.url,
        entry.depth,
        settleSettings,
        includeBestPractice,
        config.suppressions,
        runStartedAt,
      );

      if (discoverLinks && !result.page.error && !frontier.atPageCap) {
        try {
          const hrefs = await page.$$eval('a[href]', (anchors) =>
            anchors.map((anchor) => anchor.getAttribute('href') ?? ''),
          );
          const links = resolveSameOriginLinks(page.url(), hrefs);
          for (const link of links) {
            frontier.tryEnqueue({ url: link, depth: entry.depth + 1 });
          }
        } catch {
          // Link discovery is best-effort on top of an already-successful
          // scan; a page whose DOM changed under us mid-extraction still
          // keeps its findings.
        }
      }

      pool.release(workerId);
      await page.close();
      pages.push(result.page);
      findings.push(...result.findings);
    }

    await runWorkerPool(concurrency, frontier, processEntry);

    const run: RunInfo = {
      id: randomUUID(),
      startedAt: runStartedAt.toISOString(),
      durationMs: Date.now() - runStartedAt.getTime(),
      configHash: hashScanConfig({ viewport, locale, colorScheme, mode, concurrency, settleSettings, config }),
      baseUrl,
      mode,
      viewport,
      deviceScaleFactor: FIXED_DEVICE_SCALE_FACTOR,
      locale,
      timezoneId: FIXED_TIMEZONE_ID,
      colorScheme,
      reducedMotion: FIXED_REDUCED_MOTION,
      blockedOrigins: [...blockedOrigins],
      concurrency,
      settle: settleSettings,
      // Day 9: focus-path probe ids, once probes exist to enable.
      probesEnabled: [],
    };

    const tool: ToolInfo = {
      name: TOOL_NAME,
      version: TOOL_VERSION,
      axeCoreVersion: AXE_CORE_VERSION,
      playwrightVersion: PLAYWRIGHT_VERSION,
      browser: 'chromium',
      browserVersion: pool.browserVersion,
    };

    return {
      schemaVersion: '1.2',
      tool,
      run,
      pages,
      findings,
      // Day 4/6 (identity/group.ts) builds the real grouped index.
      groups: {},
      summary: buildSummary(findings, pages),
    };
  } finally {
    await pool.close();
  }
}

/**
 * Runs `task` over every entry the frontier admits, across `concurrency`
 * worker "slots". `workerId` is the slot index (stable across a worker's
 * whole run, so `BrowserPool`'s per-slot context recycling lines up with
 * it) - not a page count or a queue position.
 *
 * BFS mode can leave the queue transiently empty while another in-flight
 * page is about to discover more links, so an idle worker polls rather than
 * exiting outright, and only stops once nothing is in flight anywhere.
 * Plain, not clever, per Day 7's scope.
 */
async function runWorkerPool(
  concurrency: number,
  frontier: Frontier,
  task: (entry: FrontierEntry, workerId: number) => Promise<void>,
): Promise<void> {
  let inFlight = 0;

  async function worker(workerId: number): Promise<void> {
    for (;;) {
      const entry = frontier.dequeue();
      if (entry) {
        inFlight += 1;
        try {
          await task(entry, workerId);
        } finally {
          inFlight -= 1;
        }
        continue;
      }
      if (inFlight === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_unused, workerId) => worker(workerId)));
}

/** Serialises requests to the same host `delayMs` apart; different hosts never wait on each other. */
class HostRateLimiter {
  private readonly nextAvailableAt = new Map<string, number>();

  constructor(private readonly delayMs: number) {}

  async wait(host: string): Promise<void> {
    const now = Date.now();
    const earliest = this.nextAvailableAt.get(host) ?? 0;
    const start = Math.max(now, earliest);
    this.nextAvailableAt.set(host, start + this.delayMs);
    const waitMs = start - now;
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

/** Newline-delimited file of URLs; blank lines and `#`-comments are skipped. */
async function readUrlListFile(path: string): Promise<string[]> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    throw new A11yRatchetError(
      `Could not read URL list ${path}: ${error instanceof Error ? error.message : String(error)}`,
      3,
    );
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

const TIMEOUT_MESSAGE = /timeout/i;

function classifyNavigationError(error: unknown): PageErrorKind {
  const message = error instanceof Error ? error.message : String(error);
  return TIMEOUT_MESSAGE.test(message) ? 'navigation-timeout' : 'navigation-failed';
}

async function scanOnePage(
  page: Page,
  url: string,
  depth: number,
  settleSettings: SettleSettings,
  includeBestPractice: boolean,
  suppressions: readonly SuppressionEntry[],
  runStartedAt: Date,
): Promise<{ page: PageResult; findings: Finding[] }> {
  const startedAt = new Date();
  const urlTemplate = urlTemplateFor(url);

  try {
    const settleResult = await settle(page, url, settleSettings);
    await injectAxeIntoAllFrames(page);
    const raw = await runAxe(page, { includeBestPractice });
    const findings = applySuppressions(normaliseRawFindings(raw, { url, urlTemplate }), suppressions, runStartedAt);
    const title = await page.title();

    const pageResult: PageResult = {
      url,
      urlTemplate,
      depth,
      ...(settleResult.httpStatus !== undefined ? { httpStatus: settleResult.httpStatus } : {}),
      ...(title ? { title } : {}),
      startedAt: startedAt.toISOString(),
      durationMs: settleResult.durationMs,
      probesRun: false,
      probeBlindRegions: [],
      counts: tallyBucketCounts(findings),
      settleDegraded: settleResult.fontsReadyCapHit || settleResult.imageDecodeCapHit || settleResult.quietCapHit,
    };
    return { page: pageResult, findings };
  } catch (error) {
    // A page that failed to load is recorded as an error, not silently
    // skipped or reported as a zero-violation page (`CLAUDE.md` invariant 2).
    const pageResult: PageResult = {
      url,
      urlTemplate,
      depth,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      probesRun: false,
      probeBlindRegions: [],
      counts: { violation: 0, needsReview: 0, bestPractice: 0, suppressed: 0 },
      settleDegraded: false,
      error: {
        kind: classifyNavigationError(error),
        message: error instanceof Error ? error.message : String(error),
      },
    };
    return { page: pageResult, findings: [] };
  }
}

function tallyBucketCounts(findings: Finding[]): PageResult['counts'] {
  const counts = { violation: 0, needsReview: 0, bestPractice: 0, suppressed: 0 };
  for (const finding of findings) {
    // Suppressed findings are counted once, here — never also under
    // violation/needsReview/bestPractice (01-ARCHITECTURE.md §3, Report).
    if (finding.suppressed) {
      counts.suppressed += 1;
    } else if (finding.bestPractice) {
      counts.bestPractice += 1;
    } else if (finding.bucket === 'violation') {
      counts.violation += 1;
    } else {
      counts.needsReview += 1;
    }
  }
  return counts;
}

function buildSummary(findings: Finding[], pages: PageResult[]): Summary {
  const bucketCounts = tallyBucketCounts(findings);
  const bySource: Record<Source, number> = { axe: 0, probe: 0 };
  const byImpact: Record<Impact, number> = { minor: 0, moderate: 0, serious: 0, critical: 0 };
  const byLevel: Record<Level, number> = { A: 0, AA: 0, AAA: 0 };
  const byCriterion: Record<string, number> = {};
  const byRule: Record<string, number> = {};
  const byTier: Record<IdentityTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (const finding of findings) {
    bySource[finding.source] += 1;
    byImpact[finding.impact] += 1;
    byRule[finding.ruleId] = (byRule[finding.ruleId] ?? 0) + 1;
    byTier[finding.identityTier] += 1;
    // Best-practice findings carry no SC (criteria: []), so they correctly
    // contribute to neither tally below.
    for (const criterion of finding.criteria) {
      byLevel[criterion.level] += 1;
      byCriterion[criterion.id] = (byCriterion[criterion.id] ?? 0) + 1;
    }
  }

  return {
    pages: {
      total: pages.length,
      scanned: pages.filter((page) => !page.error).length,
      errored: pages.filter((page) => page.error).length,
    },
    findings: {
      total: findings.length,
      ...bucketCounts,
      bySource,
      byImpact,
      byCriterion,
      byLevel,
      byRule,
      byTier,
    },
    groups: 0,
    probeBlindRegions: pages.reduce((sum, page) => sum + page.probeBlindRegions.length, 0),
  };
}

/**
 * Provisional: hashes the rendering-relevant scan options. Day 8's
 * `config/schema.ts` will fold in suppression config and ignore rules too.
 */
function hashScanConfig(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16);
}
