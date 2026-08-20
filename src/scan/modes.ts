/**
 * Scan modes (`01 §5`). `ci` blocks third-party requests for diff stability;
 * `audit` allows them so the focus probe can see real overlays like cookie
 * banners and chat widgets — the single most common cause of obscured focus
 * in the wild. Every report records which mode produced it.
 */

import type { BrowserContext } from 'playwright';

import type { ScanMode } from '../types.js';

export interface ModePolicy {
  mode: ScanMode;
  /** `ci` blocks every request whose origin differs from the page's own. */
  blockThirdParty: boolean;
}

export function resolveModePolicy(mode: ScanMode): ModePolicy {
  return { mode, blockThirdParty: mode === 'ci' };
}

/** Tracks which origins were actually blocked during a run, for `RunInfo.blockedOrigins`. */
export interface ThirdPartyBlock {
  blockedOrigins: Set<string>;
}

/**
 * Install third-party request blocking on a context. `allowedOrigin` is the
 * scan's base origin; every other origin is aborted.
 *
 * No config-driven allowlist yet — `config/` (suppression, ignore rules) is
 * Day 8. Every non-matching origin is blocked for now.
 */
export async function installThirdPartyBlock(
  context: BrowserContext,
  allowedOrigin: string,
): Promise<ThirdPartyBlock> {
  const blockedOrigins = new Set<string>();

  await context.route('**/*', (route) => {
    const requestOrigin = new URL(route.request().url()).origin;
    if (requestOrigin === allowedOrigin) {
      return route.continue();
    }
    blockedOrigins.add(requestOrigin);
    return route.abort();
  });

  return { blockedOrigins };
}
