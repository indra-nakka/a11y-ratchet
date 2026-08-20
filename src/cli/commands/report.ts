import { readFile, writeFile } from 'node:fs/promises';
import { Command } from 'commander';

import { readReport, renderDiff, renderReport } from '../../index.js';
import { run } from '../runtime.js';
import type { DiffResult, ReportFormat } from '../../types.js';

interface ReportCliOptions {
  format: ReportFormat;
  out?: string;
  ungrouped?: boolean;
  diff?: string;
}

/**
 * `report` — render an existing report JSON as HTML or a terminal summary.
 *
 * Separate from `scan` so a report can be re-rendered without re-crawling, and
 * so CI can render an artefact produced by an earlier job.
 */
export function reportCommand(): Command {
  return new Command('report')
    .description('Render a report as a self-contained HTML page, JSON, or a terminal summary')
    .argument('<report>', 'report JSON produced by scan')

    .option('--format <format>', 'html, json or summary', 'html')
    .option('--out <path>', 'output path (defaults to stdout for json and summary)')
    .option('--ungrouped', 'flat finding list instead of the grouped view')
    .option('--diff <path>', 'also render the diff view from this diff result')

    .addHelpText(
      'after',
      `
Notes:
  The HTML report is self-contained and is itself scanned in this project's
  test suite; it is expected to produce zero violations.

  The default view groups findings across pages, so one site-wide nav defect
  reads as one row rather than one row per page.
`,
    )

    .action((reportPath: string, options: ReportCliOptions) =>
      run(async () => {
        const report = await readReport(reportPath);
        const output = await renderReport(report, {
          format: options.format,
          ...(options.ungrouped !== undefined ? { ungrouped: options.ungrouped } : {}),
        });

        if (options.out) {
          await writeFile(options.out, output, 'utf8');
        } else {
          console.log(output);
        }

        if (options.diff) {
          // A DiffResult, not a Report - readReport() validates the Report
          // schemaVersion specifically, so this reads the file directly
          // rather than reusing it for a shape it doesn't fit.
          const diffResult = JSON.parse(await readFile(options.diff, 'utf8')) as DiffResult;
          const diffOutput = await renderDiff(diffResult, { format: options.format === 'json' ? 'summary' : options.format });

          if (options.out) {
            const diffPath = options.out.replace(/(\.[^./\\]+)?$/, (ext) => `.diff${ext}`);
            await writeFile(diffPath, diffOutput, 'utf8');
          } else {
            console.log('\n--- diff ---\n');
            console.log(diffOutput);
          }
        }
      }),
    );
}
