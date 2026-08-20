/**
 * Orchestrates one scan: browser lifecycle → mode policy → settle → axe →
 * normalise → `Report` (`01 §4`).
 *
 * No frontier yet (`crawl/` is Day 7) — `options.seed.url` is scanned as the
 * single page in the run, at depth 0. `sitemap`/`urlList` seeds and the
 * focus-path probe (Day 9) both throw `NotImplementedError` rather than
 * silently doing nothing.
 */

import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { Page } from 'playwright';

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
import { urlTemplateFor } from '../identity/fingerprint.js';
import { A11yRatchetError, NotImplementedError } from '../errors.js';
import { AXE_CORE_VERSION, TOOL_NAME, TOOL_VERSION } from '../meta.js';
import type {
  Finding,
  Impact,
  Level,
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
  imageDecodeCapMs: 1500,
};

const WORKER_ID = 0;

export async function runScan(options: ScanOptions): Promise<Report> {
  if (options.seed.sitemap ?? options.seed.urlList) {
    throw new NotImplementedError('scan() with a sitemap or url-list seed (crawling)', 'Day 7');
  }
  const seedUrl = options.seed.url;
  if (!seedUrl) {
    throw new A11yRatchetError(
      'scan() requires seed.url — sitemap and url-list seeds are not implemented yet (Day 7)',
      3,
    );
  }
  if (options.probes && options.probes.length > 0) {
    throw new NotImplementedError('interaction probes', 'Day 9');
  }

  const runStartedAt = new Date();
  const mode = options.mode ?? 'ci';
  const viewport = options.viewport ?? DEFAULT_VIEWPORT;
  const locale = options.locale ?? DEFAULT_LOCALE;
  const colorScheme = options.colorScheme ?? DEFAULT_COLOR_SCHEME;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const settleSettings: SettleSettings = { ...DEFAULT_SETTLE, ...options.settle };
  const includeBestPractice = options.includeBestPractice ?? false;

  const pool = await BrowserPool.launch({
    viewport,
    locale,
    colorScheme,
    concurrency,
    ...(options.storageState !== undefined ? { storageState: options.storageState } : {}),
  });

  try {
    const modePolicy = resolveModePolicy(mode);
    const context = await pool.acquire(WORKER_ID);

    let blockedOrigins: string[] = [];
    if (modePolicy.blockThirdParty) {
      const block = await installThirdPartyBlock(context, new URL(seedUrl).origin);
      blockedOrigins = [...block.blockedOrigins];
    }

    const page = await context.newPage();
    const pageResult = await scanOnePage(page, seedUrl, settleSettings, includeBestPractice);
    pool.release(WORKER_ID);
    await page.close();

    const run: RunInfo = {
      id: randomUUID(),
      startedAt: runStartedAt.toISOString(),
      durationMs: Date.now() - runStartedAt.getTime(),
      configHash: hashScanConfig({ viewport, locale, colorScheme, mode, concurrency, settleSettings }),
      baseUrl: seedUrl,
      mode,
      viewport,
      deviceScaleFactor: FIXED_DEVICE_SCALE_FACTOR,
      locale,
      timezoneId: FIXED_TIMEZONE_ID,
      colorScheme,
      reducedMotion: FIXED_REDUCED_MOTION,
      blockedOrigins,
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
      schemaVersion: '1.0',
      tool,
      run,
      pages: [pageResult.page],
      findings: pageResult.findings,
      // Day 4/6 (identity/group.ts) builds the real grouped index.
      groups: {},
      summary: buildSummary(pageResult.findings, [pageResult.page]),
    };
  } finally {
    await pool.close();
  }
}

async function scanOnePage(
  page: Page,
  url: string,
  settleSettings: SettleSettings,
  includeBestPractice: boolean,
): Promise<{ page: PageResult; findings: Finding[] }> {
  const startedAt = new Date();
  const urlTemplate = urlTemplateFor(url);

  try {
    const settleResult = await settle(page, url, settleSettings);
    await injectAxeIntoAllFrames(page);
    const raw = await runAxe(page, { includeBestPractice });
    const findings = normaliseRawFindings(raw, { url, urlTemplate });
    const title = await page.title();

    const pageResult: PageResult = {
      url,
      urlTemplate,
      depth: 0,
      ...(settleResult.httpStatus !== undefined ? { httpStatus: settleResult.httpStatus } : {}),
      ...(title ? { title } : {}),
      startedAt: startedAt.toISOString(),
      durationMs: settleResult.durationMs,
      probesRun: false,
      probeBlindRegions: [],
      counts: tallyBucketCounts(findings),
    };
    return { page: pageResult, findings };
  } catch (error) {
    const pageResult: PageResult = {
      url,
      urlTemplate,
      depth: 0,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      probesRun: false,
      probeBlindRegions: [],
      counts: { violation: 0, needsReview: 0, bestPractice: 0, suppressed: 0 },
      error: {
        kind: 'navigation-failed',
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

  for (const finding of findings) {
    bySource[finding.source] += 1;
    byImpact[finding.impact] += 1;
    byRule[finding.ruleId] = (byRule[finding.ruleId] ?? 0) + 1;
    // Day 3 (wcag/criteria.ts) populates Finding.criteria; empty until then,
    // so these two tallies are all zero for now — correctly, not fabricated.
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
