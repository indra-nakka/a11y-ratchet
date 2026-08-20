import { Command } from 'commander';

import { readReport, renderReport } from '../../index.js';
import { run } from '../runtime.js';

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

    .action((reportPath: string) =>
      run(async () => {
        const report = await readReport(reportPath);
        await renderReport(report, { format: 'html' });
      }),
    );
}
