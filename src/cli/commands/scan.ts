import { writeFile } from 'node:fs/promises';
import { Command } from 'commander';

import { renderReport, scan, writeReport } from '../../index.js';
import { run } from '../runtime.js';
import type { CrawlSeed, ScanMode } from '../../types.js';

/**
 * `scan` — crawl a site and produce a report.
 *
 * Parse args, call the library, format the result. Nothing else belongs here.
 */
export function scanCommand(): Command {
  return new Command('scan')
    .description('Crawl a site, run axe-core and the interaction probes, and write a report')
    .argument('[url]', 'base URL to crawl (omit when using --sitemap or --url-list)')

    .option('--sitemap <path>', 'seed from a sitemap.xml URL or file (sitemap indexes are followed)')
    .option('--url-list <path>', 'seed from a file of newline-delimited URLs')
    .option('--include <glob...>', 'only crawl URLs matching these globs')
    .option('--exclude <glob...>', 'never crawl URLs matching these globs')
    .option('--max-depth <n>', 'BFS crawl depth', '2')
    .option('--max-pages <n>', 'stop after this many pages', '50')
    .option('--no-robots', 'ignore robots.txt (respected by default)')
    .option('--delay <ms>', 'politeness delay between requests to one origin', '250')
    .option('--concurrency <n>', 'parallel pages; above 8 results destabilise and diffs suffer', '3')

    .option(
      '--mode <mode>',
      'ci blocks third-party requests for diff stability; audit allows them so the focus probe sees real overlays',
      'ci',
    )
    .option(
      '--config <path>',
      'config file (default: discover a11y-ratchet.config.{ts,js,json} in the working directory)',
    )
    .option('--storage-state <path>', 'Playwright storageState file, for scanning behind auth')
    .option('--bypass-csp', 'ignore the page\'s own CSP - needed when a strict script-src blocks axe injection')

    .option('--viewport <WxH>', 'viewport size, recorded in the report', '1280x800')
    .option('--locale <locale>', 'browser locale, recorded in the report', 'en-US')
    .option('--color-scheme <scheme>', 'light, dark or no-preference', 'light')
    .option('--settle-strategy <strategy>', 'default, domcontentloaded, load or networkidle', 'default')
    .option('--settle-quiet-ms <ms>', 'mutation quiet period before scanning', '150')

    .option('--probes <id...>', 'probes to run (default: all)')
    .option('--no-probes', 'skip the interaction probes')
    .option('--include-best-practice', 'include axe best-practice rules; they are never WCAG failures and never gate')

    .option('--out <path>', 'write the JSON report here')
    .option('--html <path>', 'write a self-contained HTML report here')
    .option('--ungrouped', 'print the flat finding list instead of the grouped view')
    .option('--fail-on <n>', 'exit 5 if violations exceed this count (no baseline involved)')
    .option('--quiet', 'suppress the terminal summary')

    .addHelpText(
      'after',
      `
Notes:
  This tool detects a minority of accessibility defects. Automated tools catch
  roughly 30-40% of WCAG failures; the rest need a human with a keyboard and a
  screen reader. Run 'a11y-ratchet manual' for the checklist covering the rest.

  Probe findings are bucketed needs-review and never affect the exit code.
`,
    )

    .action((url: string | undefined, options: RawScanCliOptions) =>
      run(async () => {
        const seed: CrawlSeed = {
          ...(url ? { url } : {}),
          ...(options.sitemap ? { sitemap: options.sitemap } : {}),
          ...(options.urlList ? { urlList: options.urlList } : {}),
        };
        const report = await scan({
          seed,
          crawl: {
            ...(options.include ? { include: options.include } : {}),
            ...(options.exclude ? { exclude: options.exclude } : {}),
            maxDepth: Number(options.maxDepth),
            maxPages: Number(options.maxPages),
            respectRobots: options.robots,
            delayMs: Number(options.delay),
          },
          mode: options.mode as ScanMode,
          concurrency: Number(options.concurrency),
          ...(options.storageState ? { storageState: options.storageState } : {}),
          ...(options.config ? { configPath: options.config } : {}),
          ...(options.bypassCsp !== undefined ? { bypassCSP: options.bypassCsp } : {}),
        });

        if (options.out) {
          await writeReport(report, options.out);
        }
        if (options.html) {
          await writeFile(options.html, await renderReport(report, { format: 'html' }), 'utf8');
        }
        if (!options.quiet) {
          console.log(await renderReport(report, { format: 'summary' }));
        }
      }),
    );
}

/** Shape of `.opts()` for the flags this command currently wires through to `ScanOptions`. */
interface RawScanCliOptions {
  sitemap?: string;
  urlList?: string;
  include?: string[];
  exclude?: string[];
  maxDepth: string;
  maxPages: string;
  robots: boolean;
  delay: string;
  concurrency: string;
  mode: string;
  storageState?: string;
  config?: string;
  bypassCsp?: boolean;
  out?: string;
  html?: string;
  quiet?: boolean;
}
