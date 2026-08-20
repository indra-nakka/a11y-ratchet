/**
 * The shared type contract. See `docs/01-ARCHITECTURE.md §3` and
 * `docs/02-IDENTITY-AND-DIFF.md §10`.
 *
 * Two rules govern this file:
 *
 *   1. Zero logic. Types, interfaces and unions only — no constants, no functions.
 *   2. No sibling imports. Every other module depends on this one; it depends on
 *      nothing.
 *
 * This is the contract the scanner, the matcher, the report, the Action and any
 * external consumer of the JSON all negotiate with. Changing a field here is a
 * schema change: bump `schemaVersion` and record it in `docs/DECISIONS.md`.
 */

/* -------------------------------------------------------------------------- */
/* Enumerations                                                               */
/* -------------------------------------------------------------------------- */

/** WCAG conformance level. The tool targets A + AA; AAA is recorded, never gated. */
export type Level = 'A' | 'AA' | 'AAA';

/**
 * Severity, using axe-core's vocabulary so probe findings and axe findings sort
 * together. Deliberately excluded from finding identity (`02 §3.5`) because it
 * shifts between axe versions — it is tracked as a *change*, not an identity.
 */
export type Impact = 'minor' | 'moderate' | 'serious' | 'critical';

/**
 * Which axe result array a finding came from: `violation` from `violations`,
 * `needs-review` from `incomplete`. Probe findings default to `needs-review`
 * and never gate (`01 §6`).
 *
 * Note this is orthogonal to `Finding.bestPractice`: an axe best-practice rule
 * can land in either array, so "is this a WCAG failure" is a separate axis.
 */
export type Bucket = 'violation' | 'needs-review';

/** What produced a finding. */
export type Source = 'axe' | 'probe';

/**
 * Scan mode (`01 §5`). `ci` blocks third-party requests for diff stability;
 * `audit` allows them so the focus probe can see real overlays. Recorded on
 * every report; mixed-mode diffs are refused with exit code 6.
 */
export type ScanMode = 'ci' | 'audit';

/**
 * Identity tier, first available wins (`02 §3.1`). Recorded per finding so the
 * report can flag tier-5 fragility and the matcher can be more generous with it.
 *
 *   1 authored id · 2 test hook · 3 accessible name · 4 semantic path · 5 structural path
 */
export type IdentityTier = 1 | 2 | 3 | 4 | 5;

/**
 * Process exit codes (`01 §10`). Never overloaded: CI must be able to tell
 * "the site regressed" from "the tool broke".
 */
export type ExitCode =
  /** Pass. */
  | 0
  /** Diff gate failed — new violations vs baseline. */
  | 1
  /** Config invalid, or expired suppressions. */
  | 2
  /** Tool error — browser launch, unreachable base URL, unreadable baseline. */
  | 3
  /** Engine drift without `--allow-engine-drift`. */
  | 4
  /** Scan threshold exceeded — absolute violation count, no baseline involved. */
  | 5
  /** Incompatible run configuration — mode, viewport, locale or colour scheme differs. */
  | 6;

/* -------------------------------------------------------------------------- */
/* WCAG                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A WCAG success criterion. WCAG 2.2 has 86 of them (31 A, 24 AA, 31 AAA); an AA
 * claim covers the 55 at A + AA. See `03-EVIDENCE.md §1.1` — checklists claiming
 * 87 are double-counting the removed 4.1.1 Parsing.
 *
 * Embedded whole on each finding (per `01 §3`) rather than referenced by id, so
 * a report JSON is readable without the criteria table beside it.
 */
export interface SuccessCriterion {
  /** Dotted number, e.g. `"1.4.3"`. The canonical key throughout the tool. */
  id: string;
  /** Official title, e.g. `"Contrast (Minimum)"`. */
  title: string;
  level: Level;
  /** WCAG version that introduced it. Six of 2.2's nine additions are A or AA. */
  since: '2.0' | '2.1' | '2.2';
  /** URL of the W3C Understanding document. */
  url: string;
}

/** How much automated signal exists for a criterion (`03 §1.2`). Never "full". */
export type CoverageStatus =
  /** A common, important failure class is reliably caught. Still not conformance. */
  | 'detectable'
  /** A narrow subclass is caught; most real failures are invisible. */
  | 'partial'
  /** Not covered by axe; covered by this tool's interaction probes. */
  | 'probe'
  /** No meaningful automated signal. Goes to the manual checklist. */
  | 'manual';

/** How a human would carry out a manual check. */
export type ManualMethod = 'keyboard' | 'screen-reader' | 'visual' | 'zoom' | 'flow';

/**
 * Page-shape signals used to decide whether a manual check applies.
 *
 * Context-derived `--manual` items were CUT from v1 (`00 §4`) — v1 ships the
 * criterion-keyed checklist unfiltered. This type and `ManualCheck.appliesWhen`
 * exist so the data shape need not change when it lands. Do not build the
 * derivation before Day 13, and only then if there is slack.
 */
export interface PageFeatures {
  hasForms: boolean;
  hasVideo: boolean;
  hasAudio: boolean;
  hasIframes: boolean;
  hasTables: boolean;
  hasCanvas: boolean;
  hasSvg: boolean;
  hasCustomElements: boolean;
  hasLiveRegions: boolean;
  hasPasswordFields: boolean;
  linkCount: number;
  headingLevels: number[];
  lang?: string;
}

/** One item on the `--manual` checklist (`03 §1.8`). */
export interface ManualCheck {
  /** Stable id, e.g. `"1.4.1-colour-only-status"`. */
  id: string;
  /** Imperative, and testable in under a minute. */
  prompt: string;
  method: ManualMethod;
  /** See `PageFeatures` — roadmap-gated, unused in v1. */
  appliesWhen?: (page: PageFeatures) => boolean;
}

/**
 * One row of the coverage matrix (`03 §1.8`). Ships as data in
 * `src/wcag/coverage.ts`, renders into the report, drives `--manual`, and
 * generates the README table.
 *
 * Every count derived from this data is GENERATED. Never hardcode a coverage
 * count, recall figure or percentage anywhere in the codebase or the docs.
 */
export interface CoverageEntry {
  /** Success criterion id, e.g. `"2.4.11"`. */
  criterion: string;
  status: CoverageStatus;
  /** axe-core rule ids that produce evidence for this criterion. */
  axeRules: string[];
  /** This tool's probe ids, e.g. `"probe/focus-obscured"`. */
  probeIds: string[];
  /** Why the coverage is limited. This is the substance of the matrix. */
  note: string;
  manualChecks: ManualCheck[];
  /**
   * True when the entry's coverage depends on an axe-core rule tagged
   * `experimental` — its detection logic is more likely to change or be
   * withdrawn between axe-core versions than a stable rule's (`DECISIONS.md`
   * D17).
   */
  experimental: boolean;
}

/** Coverage totals, generated from `CoverageEntry[]` — never written by hand. */
export interface CoverageCounts {
  /** Levels included in the tally, e.g. `['A', 'AA']`. */
  levels: Level[];
  total: number;
  byStatus: Record<CoverageStatus, number>;
  /** `detectable + partial + probe` — criteria the tool produces any evidence for. */
  anySignal: number;
  /** Always 0. The tool certifies nothing. */
  certifiable: 0;
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Context signal (`02 §3.4`) — distinguishes "unlabelled button in the nav" from
 * "unlabelled button in the cookie banner".
 *
 * `headingContext` is per-page by nature, which is exactly why it must NOT
 * appear in `groupKey` (`02 §4`).
 */
export interface ContextSignal {
  /** Role of the nearest landmark ancestor, or `"none"`. */
  nearestLandmark: string;
  /** Normalised text of the nearest preceding heading, or `"none"`. */
  headingContext: string;
  /** Frame path; empty at top level. Mirrors `Finding.frameSelector`. */
  inFrame: string[];
}

/**
 * The identity evidence behind `fingerprint`, serialised onto the finding.
 *
 * This is not decoration. A baseline is a `Report` on disk, and the fuzzy pass
 * (`02 §6`) scores candidates on accessible name, context signal, normalised
 * text content, url template and DOM depth distance. If those are not written
 * into the JSON, Day 6 cannot match a head run against a baseline at all.
 */
export interface FindingIdentity {
  /**
   * The normalised value for the winning tier — the id, test hook, accessible
   * name, semantic path or structural path. Hashed into `fingerprint`.
   */
  value: string;
  /**
   * Collision ordinal in document order (`02 §3.5`). `0` unless several findings
   * on the page share a fingerprint, in which case the fingerprint is suffixed
   * `#0`, `#1`, … Without this, N-to-1 collapse silently loses findings.
   */
  ordinal: number;
  context: ContextSignal;
  /** Depth from the document root. Fuzzy weight 0.10, and it survives class renames. */
  domDepth: number;
  /** Normalised text content of the element. Fuzzy weight 0.20. */
  textContent?: string;
}

/* -------------------------------------------------------------------------- */
/* Suppression                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Why a finding was deliberately accepted. `false-positive` is the honest label
 * for a rule that cannot evaluate an exception (e.g. `target-size` on inline
 * content); it is not the same as accepting a real defect.
 */
export type SuppressionCategory =
  | 'false-positive'
  | 'accepted-risk'
  | 'third-party'
  | 'deferred';

/**
 * A suppression that matched this finding. All four data fields are mandatory in
 * config (`03 Part 3 §11`); `check-config` exits 2 on an expired one (`01 §10`).
 *
 * A suppression is a decision, recorded in config. A baseline records reality.
 * Keeping those separate is the whole point of `01 §11`.
 */
export interface SuppressionRef {
  /** Id of the config entry that matched, so the report can point at it. */
  ruleRef: string;
  justification: string;
  /** Who accepted it. A person or team, not "the team". */
  owner: string;
  /** ISO 8601 date. Suppressions expire; that is what stops them accreting. */
  expires: string;
  category: SuppressionCategory;
  /** Whether `expires` had already passed when this run happened. */
  expired: boolean;
}

/* -------------------------------------------------------------------------- */
/* Finding                                                                    */
/* -------------------------------------------------------------------------- */

/** One accessibility finding on one element of one page (`01 §3`). */
export interface Finding {
  /**
   * Stable across RUNS (`02 §3`). A hash over tiered element identity plus
   * context and url template, deliberately excluding the raw CSS selector,
   * `outerHTML`, absolute sibling indices and `impact`.
   */
  fingerprint: string;
  /**
   * Stable across PAGES (`02 §4`). A strictly weaker signal than `fingerprint`:
   * no heading context, no url template, no structural path, no ordinal — so a
   * site-wide nav defect collapses to one group instead of one per page.
   */
  groupKey: string;
  identityTier: IdentityTier;
  identity: FindingIdentity;
  source: Source;
  /** axe rule id, or a probe id such as `"probe/focus-obscured"`. */
  ruleId: string;
  bucket: Bucket;
  /**
   * True for axe rules tagged `best-practice` with no WCAG tag (`01 §7`).
   *
   * Set from the rule's tags, NOT derived from `criteria.length === 0`. A gap in
   * the rule map would otherwise silently relabel a real WCAG failure as "not a
   * WCAG failure", which is the behaviour that makes practitioners distrust
   * scanners in the first place.
   *
   * Best-practice findings never gate: the gate predicate is
   * `bucket === 'violation' && source === 'axe' && !bestPractice`.
   */
  bestPractice: boolean;
  impact: Impact;
  /** Empty for best-practice rules. `link-name` maps to both 2.4.4 and 4.1.2. */
  criteria: SuccessCriterion[];
  /** Raw axe tags (`wcag143`, `wcag22aa`, `cat.*`, `best-practice`), kept verbatim. */
  tags: string[];
  /** The exact page URL this was found on. */
  url: string;
  /** Templated URL (`02 §5`), e.g. `/product/:id`. Part of the fingerprint. */
  urlTemplate: string;
  /**
   * DISPLAY ONLY. Never part of finding identity, never an input to the
   * fingerprint, never used for matching. A selector-based diff reports sixty
   * regressions the first time someone refactors a component.
   */
  selector: string;
  /** Frame path from the top document, when the element is inside an iframe. */
  frameSelector?: string[];
  /** Shadow host chain, when the element is inside an open shadow root (`01 §6.1`). */
  shadowPath?: string[];
  /** Truncated `outerHTML`, for display. */
  html: string;
  /** Computed accessible name, normalised. Tier 3 identity and fuzzy weight 0.35. */
  accessibleName?: string;
  /** This project's remediation note, not axe's help text. */
  remediation: string;
  /** Rule documentation, when the source provides one. */
  helpUrl?: string;
  /** Present iff a config suppression matched. Tagged, never dropped. */
  suppressed?: SuppressionRef;
}

/* -------------------------------------------------------------------------- */
/* Grouping                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One row of the default (grouped) report view (`01 §8`):
 *
 *   [serious] color-contrast — 1.4.3 Contrast (Minimum) [AA]
 *     Affects 43 pages · 1 unique element
 */
export interface FindingGroup {
  groupKey: string;
  ruleId: string;
  source: Source;
  bucket: Bucket;
  bestPractice: boolean;
  /** Highest impact among members. Grouping must never hide a critical. */
  impact: Impact;
  criteria: SuccessCriterion[];
  accessibleName?: string;
  /** Display selector taken from the first member in document order. */
  exampleSelector: string;
  /** Distinct member fingerprints. */
  fingerprints: string[];
  /** Distinct page URLs, in crawl order. */
  urls: string[];
  pageCount: number;
  uniqueElementCount: number;
}

/**
 * Grouped index keyed by `groupKey`, carried in the report so consumers do not
 * re-derive grouping and then disagree about it.
 */
export type GroupIndex = Record<string, FindingGroup>;

/* -------------------------------------------------------------------------- */
/* Pages                                                                      */
/* -------------------------------------------------------------------------- */

/** Why a page failed. Typed, so the diff can report it and exit codes stay distinct. */
export type PageErrorKind =
  | 'navigation-failed'
  | 'navigation-timeout'
  | 'http-error'
  | 'settle-timeout'
  | 'axe-injection-failed'
  | 'probe-failed'
  | 'page-crashed';

export interface PageError {
  kind: PageErrorKind;
  message: string;
  httpStatus?: number;
}

/**
 * A region the probes could not see into (`01 §6.1`). Saying "I could not look
 * inside this component" is more useful than silently reporting zero findings.
 */
export interface ProbeBlindRegion {
  /** Display-only selector for the host or frame element. */
  selector: string;
  reason: 'closed-shadow-root' | 'cross-origin-frame';
  /** Criterion ids that could not be evaluated inside it. Routed to `--manual`. */
  unevaluatedCriteria: string[];
}

/**
 * One crawled page.
 *
 * Pages that errored appear here WITH their error. A page that failed to load is
 * not a page with zero violations, and the diff must be able to tell the
 * difference (`01 §9`, `02 §7`).
 */
export interface PageResult {
  url: string;
  urlTemplate: string;
  /** Crawl depth; 0 for seed URLs. */
  depth: number;
  httpStatus?: number;
  title?: string;
  startedAt: string;
  durationMs: number;
  /**
   * Whether the probes ran on this page. A page with no probe findings because
   * probes were disabled is not a page that passed them.
   */
  probesRun: boolean;
  probeBlindRegions: ProbeBlindRegion[];
  /** Per-page counts. `suppressed` is counted separately, not inside the others. */
  counts: {
    violation: number;
    needsReview: number;
    bestPractice: number;
    suppressed: number;
  };
  /**
   * True if any of the `default` settle strategy's bounded waits (fonts
   * ready, image decode, mutation quiet — `01 §5`) hit its cap instead of
   * resolving naturally. The page was still scanned, not skipped, but its
   * timing (and possibly its rendered state) may not reflect a fully
   * settled page — `false` for a page that never used the `default`
   * strategy. Not an error: recorded so a reader can tell "scanned, but
   * possibly early" from "scanned cleanly" (`DECISIONS.md` D55).
   */
  settleDegraded: boolean;
  /** Present iff the page failed. */
  error?: PageError;
}

/* -------------------------------------------------------------------------- */
/* Run envelope                                                               */
/* -------------------------------------------------------------------------- */

export interface ToolInfo {
  name: string;
  version: string;
  /** Pinned exactly. Recorded in every report — the engine-drift guard reads it. */
  axeCoreVersion: string;
  playwrightVersion: string;
  browser: 'chromium';
  browserVersion: string;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Readiness strategy (`01 §5`). `networkidle` is offered but never the default. */
export type SettleStrategy = 'default' | 'domcontentloaded' | 'load' | 'networkidle';

export interface SettleSettings {
  strategy: SettleStrategy;
  /** Mutation quiet period. 150ms by default; raise to 500ms for determinism fixtures. */
  quietMs: number;
  /** Hard cap on the quiet period. */
  quietCapMs: number;
  /** Cap on waiting for `document.fonts.ready` (`DECISIONS.md` D55). */
  fontsReadyCapMs: number;
  /** Cap on waiting for in-viewport images to decode. */
  imageDecodeCapMs: number;
}

/**
 * Everything about the run that could change a finding without the site changing.
 *
 * `01 §5` requires viewport, locale and colour scheme to be configurable and
 * recorded; the rest are here for the same reason. Diffing a light-mode baseline
 * against a dark-mode head produces phantom contrast regressions of exactly the
 * same class as engine drift, and the report has to make that visible.
 */
export interface RunInfo {
  id: string;
  startedAt: string;
  durationMs: number;
  configHash: string;
  baseUrl: string;
  mode: ScanMode;
  viewport: Viewport;
  deviceScaleFactor: number;
  locale: string;
  timezoneId: string;
  colorScheme: 'light' | 'dark' | 'no-preference';
  reducedMotion: 'reduce' | 'no-preference';
  /** Origins suppressed at network level. Empty in `audit` mode. */
  blockedOrigins: string[];
  /** Above ~8, results destabilise on modest hardware, which corrupts diffs (`01 §9`). */
  concurrency: number;
  settle: SettleSettings;
  /** Probe ids that ran, e.g. `["probe/focus-obscured", "probe/keyboard-trap"]`. */
  probesEnabled: string[];
}

/** Run totals. Every field is generated; none is ever written by hand. */
export interface Summary {
  pages: {
    total: number;
    scanned: number;
    errored: number;
  };
  findings: {
    total: number;
    violation: number;
    needsReview: number;
    bestPractice: number;
    /** Suppressed findings, retained and tagged — counted here, not deleted. */
    suppressed: number;
    bySource: Record<Source, number>;
    byImpact: Record<Impact, number>;
    /** Keyed by criterion id, e.g. `"1.4.3"`. Best-practice findings contribute to none. */
    byCriterion: Record<string, number>;
    byLevel: Record<Level, number>;
    /** Keyed by rule id. */
    byRule: Record<string, number>;
    /**
     * Which identity tier each finding resolved to (`02 §3.1`). A standing
     * output, not just a Day 5 investigation artefact (`DECISIONS.md` D38) —
     * a run landing mostly at tiers 4-5 is a signal the matcher (Day 6)
     * needs to know about, not something to notice only when someone thinks
     * to check.
     */
    byTier: Record<IdentityTier, number>;
  };
  groups: number;
  probeBlindRegions: number;
}

/**
 * The report envelope — also the on-disk baseline format (`01 §11`).
 *
 * SUPPRESSION AND THE DIFF. `findings` is the single complete array: every
 * finding the run produced, suppressed or not. A suppressed finding stays in
 * place and carries `suppressed: SuppressionRef` — it is never moved to a
 * second array. Findings are never silently dropped.
 *
 * This corrects `DECISIONS.md` D8. A partitioned second array requires every
 * consumer — the matcher, the summary, the report renderer, any external
 * reader of the JSON — to remember to pool both arrays back together, and
 * forgetting once is exactly how an added suppression starts reading as a
 * `fixed` finding, a false fix (goal 2 in `02 §2`). A single array with an
 * inline tag cannot be forgotten that way. Suppression is applied at the
 * GATE, never at match time: the gate filters `findings` by `!suppressed`
 * before applying `bucket` and `bestPractice`.
 */
export interface Report {
  /** Bumped to `'1.2'` for `PageResult.settleDegraded` (`DECISIONS.md` D55). */
  schemaVersion: '1.2';
  tool: ToolInfo;
  run: RunInfo;
  /** Every page attempted, including ones that errored. */
  pages: PageResult[];
  /** The single complete set. Suppressed findings stay here, tagged, not deleted. */
  findings: Finding[];
  groups: GroupIndex;
  summary: Summary;
}

/* -------------------------------------------------------------------------- */
/* Diff                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * How a finding changed between two runs (`02 §6`).
 *
 * `unclassified` is the safe degradation: if the fuzzy pass is disabled or
 * uncertain, unmatched findings are reported as `unclassified` rather than
 * `new`. A false "new violation" blocks a PR for no reason and is the one
 * failure that kills the tool.
 */
export type FindingChange =
  | 'new'
  | 'fixed'
  | 'persisting'
  | 'moved'
  | 'impact-changed'
  | 'unclassified';

/** A finding matched across runs, where something about it changed. */
export interface FindingPair {
  from: Finding;
  to: Finding;
}

/**
 * Why a finding could not be classified as new or fixed (`02 §7`). Page-set
 * changes must be partitioned out BEFORE diffing findings, or a 404'd page reads
 * as twelve fixes and the report celebrates a regression.
 */
export type UnknownReason =
  /** Page exists only in head. Governed by `newPagePolicy`. */
  | 'page-added'
  /** Page exists only in base. Never `fixed`. */
  | 'page-removed'
  /** Page errored in one run and not the other — the highest-value warning here. */
  | 'page-error';

export interface UnknownFinding {
  reason: UnknownReason;
  finding: Finding;
}

/** What `unknown-page-added` does to the gate. Default `warn`. */
export type NewPagePolicy = 'fail' | 'warn' | 'ignore';

/** Identifying details of one side of a diff. */
export interface RunRef {
  runId: string;
  startedAt: string;
  toolVersion: string;
  axeCoreVersion: string;
  mode: ScanMode;
}

/**
 * Which part of the rendering context differs between base and head. Any
 * entry here refuses the diff (exit code 6, "incompatible run
 * configuration") — a light-mode baseline diffed against a dark-mode head
 * produces phantom contrast regressions of the same class as engine drift
 * (`01 §3` D5). `concurrency` and `settle` differences are deliberately
 * excluded: `01 §9` treats those as a stability concern, not a correctness
 * one, so they land in `gate.warnings` instead of refusing the diff.
 */
export type RunIncompatibilityReason = 'mode' | 'viewport' | 'locale' | 'colorScheme';

export interface RunIncompatibility {
  reason: RunIncompatibilityReason;
  base: string;
  head: string;
}

export interface DiffPages {
  inBoth: number;
  onlyInBase: string[];
  onlyInHead: string[];
  errored: string[];
}

export interface DiffFindings {
  new: Finding[];
  fixed: Finding[];
  persisting: Finding[];
  unclassified: Finding[];
  moved: FindingPair[];
  impactChanged: FindingPair[];
  unknown: UnknownFinding[];
}

/** Gate outcome (`02 §8`). */
export interface DiffGate {
  passed: boolean;
  /**
   * A sentence a person would write:
   * "3 new serious violations on 2 pages (1.4.3, 4.1.2); 1 moved; 2 fixed."
   * This string is what most people will ever see of this tool.
   */
  reason: string;
  countedAgainstGate: number;
  /** Non-gating but noteworthy — removed pages, errored pages, `newPagePolicy: 'warn'`. */
  warnings: string[];
}

/** The output of `diff` (`02 §10`). A written artefact, so it carries a schema version. */
export interface DiffResult {
  schemaVersion: '1.0';
  base: RunRef;
  head: RunRef;
  /** Base and head ran different axe-core versions. Refused unless explicitly allowed. */
  engineDrift: boolean;
  /**
   * Non-empty when mode, viewport, locale or colour scheme differ between
   * base and head. Any entry refuses the diff (exit code 6) — always, with
   * no override flag, unlike `engineDrift`.
   */
  incompatibleRunConfig: RunIncompatibility[];
  pages: DiffPages;
  findings: DiffFindings;
  gate: DiffGate;
}

/* -------------------------------------------------------------------------- */
/* Library options                                                            */
/* -------------------------------------------------------------------------- */
/*
 * Thin on purpose. The full config schema is Day 8 (`src/config/schema.ts`);
 * these cover only the options the design docs already fix, and are the surface
 * `src/cli/` translates its flags into.
 */

/** How the frontier is seeded (`01 §2`, `00 §4`). Exactly one is used per run. */
export interface CrawlSeed {
  /** Base URL for a BFS crawl. */
  url?: string;
  /** Path or URL of a sitemap.xml. Sitemap index files are followed. */
  sitemap?: string;
  /** Path to a newline-delimited file of URLs. */
  urlList?: string;
}

export interface CrawlOptions {
  include?: string[];
  exclude?: string[];
  maxDepth?: number;
  maxPages?: number;
  /** Default true. Respecting robots is the default for a tool that crawls other people's sites. */
  respectRobots?: boolean;
  /** Politeness delay between requests to one origin, in ms. */
  delayMs?: number;
}

export interface ScanOptions {
  seed: CrawlSeed;
  crawl?: CrawlOptions;
  mode?: ScanMode;
  configPath?: string;
  viewport?: Viewport;
  locale?: string;
  colorScheme?: 'light' | 'dark' | 'no-preference';
  concurrency?: number;
  settle?: Partial<SettleSettings>;
  /** Playwright `storageState` path, for scanning behind auth. */
  storageState?: string;
  /** Probe ids to run. Omit for the default set; `[]` disables probes. */
  probes?: string[];
  /** Include axe best-practice rules. Off by default (`01 §7`). */
  includeBestPractice?: boolean;
  /** Exit 5 when violations exceed this. No baseline involved (`01 §10`). */
  failOn?: number;
}

export interface DiffOptions {
  /** Required to diff across axe-core versions; banners the report (`01 §3`). */
  allowEngineDrift?: boolean;
  /** Fuzzy-match acceptance score. Tuned against the goldens (`02 §6`). */
  matchThreshold?: number;
  /** Disable pass 2; unmatched findings become `unclassified`, never `new`. */
  exactOnly?: boolean;
  newPagePolicy?: NewPagePolicy;
}

export type ReportFormat = 'html' | 'json' | 'summary';

export interface ReportOptions {
  format: ReportFormat;
  /** Flat list instead of the default grouped view (`01 §8`). */
  ungrouped?: boolean;
  outputPath?: string;
}

export interface ManualOptions {
  /** Restrict the checklist to these criterion ids. */
  criteria?: string[];
  format?: 'markdown' | 'json';
}

/** Result of validating a config file (`01 §10` — invalid or expired exits 2). */
export interface ConfigCheckResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Suppressions past their `expires` date. Any entry here fails the check. */
  expired: SuppressionRef[];
  /**
   * Suppressions whose finding no longer appears in the latest report — stale
   * decisions accreting in config. Reported, not failed.
   */
  stale: SuppressionRef[];
}
