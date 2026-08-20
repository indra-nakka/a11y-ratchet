/**
 * Orchestrates `diff()`: refuse on engine drift / incompatible run config →
 * partition pages (`02 §7`) → match + classify findings per page (`02 §6`)
 * → gate (`02 §8`) → assemble `DiffResult`.
 */

import { classifyMatchedPair } from './classify.js';
import { computeGate } from './gate.js';
import { DEFAULT_MATCH_THRESHOLD, matchFindings } from './match.js';
import { A11yRatchetError } from '../errors.js';
import type {
  DiffFindings,
  DiffOptions,
  DiffPages,
  DiffResult,
  Finding,
  PageResult,
  Report,
  RunIncompatibility,
  RunRef,
  UnknownFinding,
} from '../types.js';

export function runDiff(base: Report, head: Report, options: DiffOptions = {}): DiffResult {
  const engineDrift = base.tool.axeCoreVersion !== head.tool.axeCoreVersion;
  if (engineDrift && !options.allowEngineDrift) {
    throw new A11yRatchetError(
      `Refusing to diff across axe-core versions (base ${base.tool.axeCoreVersion}, head ` +
        `${head.tool.axeCoreVersion}) — a rule tightening between versions would read as phantom ` +
        `regressions. Pass --allow-engine-drift to diff anyway (the output is banner-flagged), or ` +
        `run "baseline regenerate" in the same PR that bumps axe-core.`,
      4,
    );
  }

  const incompatibleRunConfig = findIncompatibleRunConfig(base, head);
  if (incompatibleRunConfig.length > 0) {
    const detail = incompatibleRunConfig.map((i) => `${i.reason} (base=${i.base}, head=${i.head})`).join(', ');
    throw new A11yRatchetError(
      `Refusing to diff — incompatible run configuration: ${detail}. There is no override flag for ` +
        `this one: a light-mode baseline diffed against a dark-mode head (for example) produces ` +
        `phantom regressions the same way engine drift does.`,
      6,
    );
  }

  const partition = partitionPages(base, head);

  const matchThreshold = options.matchThreshold ?? DEFAULT_MATCH_THRESHOLD;
  const exactOnly = options.exactOnly ?? false;

  const findings: DiffFindings = {
    new: [],
    fixed: [],
    persisting: [],
    unclassified: [],
    moved: [],
    impactChanged: [],
    unknown: partition.unknownFindings,
  };

  for (const pair of partition.inBothPairs) {
    const baseFindings = base.findings.filter((finding) => finding.url === pair.url);
    const headFindings = head.findings.filter((finding) => finding.url === pair.url);
    const matchResult = matchFindings(baseFindings, headFindings, { matchThreshold, exactOnly });

    for (const { base: baseFinding, head: headFinding } of matchResult.matched) {
      const classification = classifyMatchedPair(baseFinding, headFinding);
      if (classification === 'persisting') {
        findings.persisting.push(headFinding);
      } else if (classification === 'impact-changed') {
        findings.impactChanged.push({ from: baseFinding, to: headFinding });
      } else {
        findings.moved.push({ from: baseFinding, to: headFinding });
      }
    }

    // §6: "exactOnly... unmatched findings become unclassified, never new."
    // Degrades safely - less information, not a false regression. Unmatched
    // base findings still classify as fixed either way; nothing about
    // exactOnly changes whether a base finding's absence is legible.
    if (exactOnly) {
      findings.unclassified.push(...matchResult.unmatchedHead);
    } else {
      findings.new.push(...matchResult.unmatchedHead);
    }
    findings.fixed.push(...matchResult.unmatchedBase);
  }

  const newPagePolicy = options.newPagePolicy ?? 'warn';
  const gate = computeGate(findings, { newPagePolicy });

  return {
    schemaVersion: '1.0',
    base: toRunRef(base),
    head: toRunRef(head),
    engineDrift,
    incompatibleRunConfig,
    pages: partition.pages,
    findings,
    gate,
  };
}

function toRunRef(report: Report): RunRef {
  return {
    runId: report.run.id,
    startedAt: report.run.startedAt,
    toolVersion: report.tool.version,
    axeCoreVersion: report.tool.axeCoreVersion,
    mode: report.run.mode,
  };
}

function findIncompatibleRunConfig(base: Report, head: Report): RunIncompatibility[] {
  const incompatibilities: RunIncompatibility[] = [];

  if (base.run.mode !== head.run.mode) {
    incompatibilities.push({ reason: 'mode', base: base.run.mode, head: head.run.mode });
  }
  if (base.run.viewport.width !== head.run.viewport.width || base.run.viewport.height !== head.run.viewport.height) {
    incompatibilities.push({
      reason: 'viewport',
      base: `${base.run.viewport.width}x${base.run.viewport.height}`,
      head: `${head.run.viewport.width}x${head.run.viewport.height}`,
    });
  }
  if (base.run.locale !== head.run.locale) {
    incompatibilities.push({ reason: 'locale', base: base.run.locale, head: head.run.locale });
  }
  if (base.run.colorScheme !== head.run.colorScheme) {
    incompatibilities.push({ reason: 'colorScheme', base: base.run.colorScheme, head: head.run.colorScheme });
  }

  return incompatibilities;
}

/* -------------------------------------------------------------------------- */
/* Page-set partitioning (`02 §7`)                                            */
/* -------------------------------------------------------------------------- */

interface PagePairing {
  url: string;
  base?: PageResult;
  head?: PageResult;
}

function pairPagesByUrl(basePages: readonly PageResult[], headPages: readonly PageResult[]): PagePairing[] {
  const byUrl = new Map<string, PagePairing>();
  for (const page of basePages) byUrl.set(page.url, { url: page.url, base: page });
  for (const page of headPages) {
    const existing = byUrl.get(page.url);
    if (existing) existing.head = page;
    else byUrl.set(page.url, { url: page.url, head: page });
  }
  return [...byUrl.values()];
}

interface PartitionResult {
  pages: DiffPages;
  inBothPairs: Array<{ url: string; base: PageResult; head: PageResult }>;
  unknownFindings: UnknownFinding[];
}

function findingsForUrl(report: Report, url: string): Finding[] {
  return report.findings.filter((finding) => finding.url === url);
}

/**
 * `§7`: partition pages BEFORE diffing findings, or a 404'd page reads as
 * twelve fixes and the report celebrates a regression.
 */
function partitionPages(base: Report, head: Report): PartitionResult {
  const pairings = pairPagesByUrl(base.pages, head.pages);

  const onlyInBase: string[] = [];
  const onlyInHead: string[] = [];
  const errored: string[] = [];
  const inBothPairs: Array<{ url: string; base: PageResult; head: PageResult }> = [];
  const unknownFindings: UnknownFinding[] = [];

  for (const pairing of pairings) {
    if (pairing.base && pairing.head) {
      const baseErrored = Boolean(pairing.base.error);
      const headErrored = Boolean(pairing.head.error);
      if (baseErrored || headErrored) {
        // "The highest-value warning the diff emits — it usually means the
        // crawl is broken, not the site" (§7). Whichever side DID load
        // still has findings; those are surfaced as unknown, never diffed
        // against a run that never actually saw the page.
        errored.push(pairing.url);
        if (!baseErrored) {
          for (const finding of findingsForUrl(base, pairing.url)) {
            unknownFindings.push({ reason: 'page-error', finding });
          }
        }
        if (!headErrored) {
          for (const finding of findingsForUrl(head, pairing.url)) {
            unknownFindings.push({ reason: 'page-error', finding });
          }
        }
      } else {
        inBothPairs.push({ url: pairing.url, base: pairing.base, head: pairing.head });
      }
    } else if (pairing.base) {
      onlyInBase.push(pairing.url);
      for (const finding of findingsForUrl(base, pairing.url)) {
        unknownFindings.push({ reason: 'page-removed', finding });
      }
    } else if (pairing.head) {
      onlyInHead.push(pairing.url);
      for (const finding of findingsForUrl(head, pairing.url)) {
        unknownFindings.push({ reason: 'page-added', finding });
      }
    }
  }

  return {
    pages: { inBoth: inBothPairs.length, onlyInBase, onlyInHead, errored },
    inBothPairs,
    unknownFindings,
  };
}
