/**
 * Include/exclude URL globs, and `robots.txt` (`01 §2`: `crawl/filters.ts`).
 * Respecting `robots.txt` is the default for a tool that crawls other
 * people's sites (`types.ts`'s `CrawlOptions.respectRobots` comment,
 * `00 §11`).
 *
 * No exploration heuristics here on purpose (Day 7's explicit instruction)
 * — glob matching and robots.txt group-selection are both intentionally
 * the plainest correct algorithm, not the cleverest one.
 */

/* -------------------------------------------------------------------------- */
/* Glob matching                                                              */
/* -------------------------------------------------------------------------- */

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

export interface UrlGlobOptions {
  include?: string[];
  exclude?: string[];
}

/**
 * Matched against the full URL string. `exclude` wins over `include` when a
 * URL matches both. With no `include` list, every URL is included unless
 * excluded.
 */
export function isUrlAllowedByGlobs(url: string, options: UrlGlobOptions): boolean {
  if (options.exclude?.some((pattern) => globToRegExp(pattern).test(url))) {
    return false;
  }
  if (options.include && options.include.length > 0) {
    return options.include.some((pattern) => globToRegExp(pattern).test(url));
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/* robots.txt                                                                 */
/* -------------------------------------------------------------------------- */

interface RobotsRule {
  /** Path prefix, e.g. `/admin` or `/search/all` (already percent-decoded). */
  prefix: string;
  allow: boolean;
}

export interface RobotsRules {
  rules: RobotsRule[];
}

/** No rules at all — used when `robots.txt` doesn't exist or fails to fetch (fail open, not closed). */
export const NO_ROBOTS_RULES: RobotsRules = { rules: [] };

/**
 * Parses `robots.txt` for the `*` (wildcard) user-agent group — this tool
 * doesn't send a distinctive User-Agent string, so a name-specific group
 * would never match it anyway. Only `Disallow`/`Allow` are read;
 * `Crawl-delay` is deliberately not applied dynamically (`--delay` is the
 * one knob for that, per Day 7's scope — no exploration heuristics).
 */
export function parseRobotsTxt(text: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  const rules: RobotsRule[] = [];

  let inWildcardGroup = false;
  let groupHasWildcard = false;
  let sawAnyDirectiveSinceAgent = true;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const field = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (field === 'user-agent') {
      if (sawAnyDirectiveSinceAgent) {
        // A new block of consecutive User-agent lines starts a new group.
        groupHasWildcard = false;
        sawAnyDirectiveSinceAgent = false;
      }
      if (value === '*') groupHasWildcard = true;
      inWildcardGroup = groupHasWildcard;
      continue;
    }

    sawAnyDirectiveSinceAgent = true;
    if (!inWildcardGroup) continue;

    if (field === 'disallow' && value) {
      rules.push({ prefix: value, allow: false });
    } else if (field === 'allow' && value) {
      rules.push({ prefix: value, allow: true });
    }
  }

  return { rules };
}

/**
 * Longest matching rule wins (the de facto standard robots.txt algorithm);
 * an `Allow` and a `Disallow` of equal length both matching resolves to
 * `Allow`. No matching rule at all means allowed.
 */
export function isAllowedByRobots(pathAndQuery: string, robots: RobotsRules): boolean {
  let best: RobotsRule | undefined;
  for (const rule of robots.rules) {
    if (!pathAndQuery.startsWith(rule.prefix)) continue;
    if (!best || rule.prefix.length > best.prefix.length) {
      best = rule;
    } else if (rule.prefix.length === best.prefix.length && rule.allow) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

/**
 * Fetches and parses `origin`'s `robots.txt`. A missing or unreachable
 * `robots.txt` is treated as "everything allowed" (`NO_ROBOTS_RULES`) - the
 * standard robots.txt convention, and the honest reading of "no rules were
 * published."
 */
export async function fetchRobotsRules(origin: string): Promise<RobotsRules> {
  try {
    const response = await fetch(new URL('/robots.txt', origin));
    if (!response.ok) return NO_ROBOTS_RULES;
    return parseRobotsTxt(await response.text());
  } catch {
    return NO_ROBOTS_RULES;
  }
}
