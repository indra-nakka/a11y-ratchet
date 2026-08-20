/**
 * The 20 golden identity pairs (`02-IDENTITY-AND-DIFF.md §9`) — the
 * false-regression guards for cases 1-12 (zero tolerance), plus the
 * new/fixed/moved/impact-changed/pairing cases. "Table-driven, built before
 * the matcher": Day 6 hasn't written the matcher yet, so these tests check
 * the identity layer directly - fingerprint equality for `persisting`,
 * absence/presence in one side's finding set for `new`/`fixed`, and for
 * `moved` and pagination-pairing (case 18, 20), the underlying signals a
 * future matcher needs (identity value, distinctness) rather than the
 * classification itself, which the matcher alone can produce.
 *
 * Written and run BEFORE `identity/fingerprint.ts` was touched for D28 -
 * case 5 in particular exposed a real gap: `§3.3`'s literal "digit runs of
 * length >= 2" left single-digit counts ("3 results" vs "17 results")
 * unmasked and therefore non-persisting, contradicting both this golden
 * case and the doc's own worked example ("page # of #"). Fixed in
 * `identity/fingerprint.ts`, recorded in `DECISIONS.md` D33.
 *
 * Real files under `test/fixtures/diff-pairs/`, per `03-EVIDENCE.md §2.2`'s
 * documented layout, were considered and deliberately not used - 40 files
 * for content this small would be pure authoring overhead for zero
 * additional review value over inline strings in one place next to their
 * expectations. Recorded as a layout deviation in `DECISIONS.md` D34.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';

import { scan } from '../../src/index.js';
import type { Finding, Report } from '../../src/types.js';

const BEFORE_PORT = 4180;
const AFTER_PORT = 4181;
const BEFORE_ORIGIN = `http://127.0.0.1:${BEFORE_PORT}`;
const AFTER_ORIGIN = `http://127.0.0.1:${AFTER_PORT}`;

function page(body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>golden</title></head><body>${body}</body></html>`;
}

const ICON = '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /></svg>';

/** path -> html, served by whichever of the two servers owns it. */
const beforeRoutes = new Map<string, string>();
const afterRoutes = new Map<string, string>();

/** Registers the same path on both servers - the common case (everything but case 8). */
function pair(path: string, before: string, after: string): void {
  beforeRoutes.set(path, page(before));
  afterRoutes.set(path, page(after));
}

/* -------------------------------------------------------------------------- */
/* Must be `persisting` (cases 1-12) - zero tolerance                         */
/* -------------------------------------------------------------------------- */

pair(
  '/01-wrapper/',
  '<main id="m"><h1>Report</h1><img id="chart" src="./a.svg"></main>',
  '<main id="m"><h1>Report</h1><div class="wrapper"><img id="chart" src="./a.svg"></div></main>',
);

pair(
  '/02-siblings/',
  '<main id="m"><h1>Report</h1><img id="chart" src="./a.svg"></main>',
  '<main id="m"><h1>Report</h1><p>Sibling one</p><p>Sibling two</p><p>Sibling three</p><img id="chart" src="./a.svg"></main>',
);

pair(
  '/03-css-modules/',
  '<main id="m"><h1>Report</h1><img id="chart" class="chart_a1b2c3" src="./a.svg"></main>',
  '<main id="m"><h1>Report</h1><img id="chart" class="chart_x9y8z7" src="./a.svg"></main>',
);

pair(
  '/04-use-id-churn/',
  '<main id="m"><h1>Report</h1><img id=":r1:" data-testid="chart" src="./a.svg"></main>',
  '<main id="m"><h1>Report</h1><img id=":r7:" data-testid="chart" src="./a.svg"></main>',
);

// Digit masking of an embedded count on the element's own accessible name
// (02 §3.3) - the case that exposed the length->=2 gap (see file header).
pair(
  '/05-digit-count/',
  '<main id="m"><h1>Report</h1><button style="color:#949494;background:#ffffff">3 results</button></main>',
  '<main id="m"><h1>Report</h1><button style="color:#949494;background:#ffffff">17 results</button></main>',
);

pair(
  '/06-reorder-sections/',
  '<main id="m"><section id="s1"><h2>A</h2><p>Alpha content.</p></section><section id="s2"><h2>B</h2><img id="chart" src="./a.svg"></section></main>',
  '<main id="m"><section id="s2"><h2>B</h2><img id="chart" src="./a.svg"></section><section id="s1"><h2>A</h2><p>Alpha content.</p></section></main>',
);

// role="button" -> native <button>, same missing-name defect. Whether this
// is genuinely persisting depends on axe mapping both to the SAME rule id
// (button-name covers ARIA-equivalent roles too) - verified by running this
// case, not assumed; see DECISIONS.md if it turned out otherwise.
pair(
  '/07-role-to-native/',
  `<main id="m"><h1>Report</h1><div id="submit-order" role="button" tabindex="0">${ICON}</div></main>`,
  `<main id="m"><h1>Report</h1><button id="submit-order">${ICON}</button></main>`,
);

// Case 8 is the one exception to `pair()` - the URL itself changes.
// urlTemplateFor() is path-only, so /product/1 and /product/2 both template
// to /product/:id despite being served from different origins here.
beforeRoutes.set('/product/1/', page('<main id="m"><h1>Product</h1><img id="hero" src="./a.svg"></main>'));
afterRoutes.set('/product/2/', page('<main id="m"><h1>Product</h1><img id="hero" src="./a.svg"></main>'));

pair(
  '/09-whitespace-reflow/',
  '<main id="m"><h1>Report</h1>\n  <img id="chart" src="./a.svg">\n</main>',
  '<main id="m">\n\n  <h1>Report</h1>\n\n\n      <img id="chart" src="./a.svg">\n\n</main>',
);

pair(
  '/10-unrelated-new-violation/',
  '<main id="m"><h1>Report</h1><img id="chart" src="./a.svg"></main>',
  `<main id="m"><h1>Report</h1><img id="chart" src="./a.svg"><button id="new-button">${ICON}</button></main>`,
);

// Case 11 needs the id-bearing element to physically move inside an open
// shadow root - built with a tiny custom element, same as 09-shadow/.
pair(
  '/11-into-shadow/',
  '<main id="m"><h1>Report</h1><img id="chart" src="./a.svg"></main>',
  `<main id="m"><h1>Report</h1><shadow-host id="shadow-host"></shadow-host></main>
   <script>
     class ShadowHost extends HTMLElement {
       connectedCallback() {
         const root = this.attachShadow({ mode: 'open' });
         const img = document.createElement('img');
         img.id = 'chart';
         img.src = './a.svg';
         root.appendChild(img);
       }
     }
     customElements.define('shadow-host', ShadowHost);
   </script>`,
);

pair(
  '/12-scroll-margin/',
  '<main id="m"><h1>Report</h1><img id="chart" src="./a.svg"><div id="other" style="position:sticky;top:0">Sticky</div></main>',
  '<main id="m"><h1>Report</h1><img id="chart" src="./a.svg"><div id="other" style="position:sticky;top:0;scroll-margin-top:60px">Sticky</div></main>',
);

/* -------------------------------------------------------------------------- */
/* Must be `new` (13-15)                                                      */
/* -------------------------------------------------------------------------- */

pair(
  '/13-new-different-landmark/',
  `<header><nav aria-label="Primary"><button id="menu-toggle">${ICON}</button></nav></header><main id="m"><h1>Report</h1></main><footer></footer>`,
  `<header><nav aria-label="Primary"><button id="menu-toggle">${ICON}</button></nav></header><main id="m"><h1>Report</h1></main><footer><button id="footer-toggle">${ICON}</button></footer>`,
);

// Same landmark, a second unlabelled button distinguished from the first by
// DOM position (nav > div > button, vs nav > button) - both unlabelled, so
// Tier 3 can't distinguish them; Tier 4's structural position must.
pair(
  '/14-new-same-landmark/',
  `<header><nav aria-label="Primary"><button id="menu-toggle">${ICON}</button></nav></header><main id="m"><h1>Report</h1></main>`,
  `<header><nav aria-label="Primary"><button id="menu-toggle">${ICON}</button><div class="submenu"><button>${ICON}</button></div></nav></header><main id="m"><h1>Report</h1></main>`,
);

pair(
  '/15-passing-loses-alt/',
  '<main id="m"><h1>Report</h1><img id="hero" src="./a.svg" alt="A description"></main>',
  '<main id="m"><h1>Report</h1><img id="hero" src="./a.svg"></main>',
);

/* -------------------------------------------------------------------------- */
/* Must be `fixed` (16-17)                                                    */
/* -------------------------------------------------------------------------- */

pair(
  '/16-label-added/',
  '<main id="m"><h1>Report</h1><img id="hero" src="./a.svg"></main>',
  '<main id="m"><h1>Report</h1><img id="hero" src="./a.svg" alt="A description"></main>',
);

pair(
  '/17-element-removed/',
  '<main id="m"><h1>Report</h1><img id="hero" src="./a.svg"></main>',
  '<main id="m"><h1>Report</h1></main>',
);

/* -------------------------------------------------------------------------- */
/* Must be `moved` (18)                                                       */
/* -------------------------------------------------------------------------- */

pair(
  '/18-moved-footer-to-header/',
  `<header><nav aria-label="Primary"></nav></header><main id="m"><h1>Report</h1></main><footer><button id="contact-btn">${ICON}</button></footer>`,
  `<header><nav aria-label="Primary"></nav><button id="contact-btn">${ICON}</button></header><main id="m"><h1>Report</h1></main><footer></footer>`,
);

/* -------------------------------------------------------------------------- */
/* Must be `impact-changed` (19)                                              */
/* -------------------------------------------------------------------------- */

pair(
  '/19-impact-changed/',
  '<main id="m"><h1>Report</h1><button id="tariff-btn" style="color:#949494;background:#ffffff">Download tariff</button></main>',
  '<main id="m"><h1>Report</h1><button id="tariff-btn" style="color:#dddddd;background:#ffffff">Download tariff</button></main>',
);

/* -------------------------------------------------------------------------- */
/* Must pair 1-to-1, not collapse (20)                                        */
/* -------------------------------------------------------------------------- */

function paginationLinks(numbers: number[]): string {
  return numbers
    .map((n) => `<a href="#page-${n}" style="color:#dddddd;background:#ffffff">${n}</a>`)
    .join('');
}

pair(
  '/20-pagination/',
  `<main id="m"><h1>Report</h1><nav aria-label="Pagination">${paginationLinks([10, 11, 12, 13, 14])}</nav></main>`,
  `<main id="m"><h1>Report</h1><nav aria-label="Pagination">${paginationLinks([20, 21, 22, 23, 24])}</nav></main>`,
);

/* -------------------------------------------------------------------------- */
/* Test harness                                                               */
/* -------------------------------------------------------------------------- */

let beforeServer: Server;
let afterServer: Server;

function makeServer(routes: Map<string, string>): Server {
  return createServer((req, res) => {
    const html = routes.get(req.url ?? '');
    if (!html) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
}

beforeAll(async () => {
  beforeServer = makeServer(beforeRoutes);
  afterServer = makeServer(afterRoutes);
  await Promise.all([
    new Promise<void>((r) => beforeServer.listen(BEFORE_PORT, '127.0.0.1', r)),
    new Promise<void>((r) => afterServer.listen(AFTER_PORT, '127.0.0.1', r)),
  ]);
}, 30_000);

afterAll(async () => {
  await Promise.all([
    new Promise<void>((r) => beforeServer.close(() => r())),
    new Promise<void>((r) => afterServer.close(() => r())),
  ]);
});

async function scanPair(beforePath: string, afterPath = beforePath): Promise<{ before: Report; after: Report }> {
  const [before, after] = await Promise.all([
    scan({ seed: { url: `${BEFORE_ORIGIN}${beforePath}` } }),
    scan({ seed: { url: `${AFTER_ORIGIN}${afterPath}` } }),
  ]);
  return { before, after };
}

function byRule(report: Report, ruleId: string): Finding[] {
  return report.findings.filter((f) => f.ruleId === ruleId);
}

function fingerprints(findings: Finding[]): string[] {
  return findings.map((f) => f.fingerprint);
}

/* -------------------------------------------------------------------------- */
/* Cases 1-12: persisting, zero tolerance                                     */
/* -------------------------------------------------------------------------- */

describe('golden pairs: must be persisting (zero tolerance)', () => {
  it('1. wrapping the element in a div', async () => {
    const { before, after } = await scanPair('/01-wrapper/');
    expect(fingerprints(byRule(after, 'image-alt'))).toEqual(fingerprints(byRule(before, 'image-alt')));
  }, 30_000);

  it('2. three unrelated siblings added before it', async () => {
    const { before, after } = await scanPair('/02-siblings/');
    expect(fingerprints(byRule(after, 'image-alt'))).toEqual(fingerprints(byRule(before, 'image-alt')));
  }, 30_000);

  it('3. all CSS classes renamed (CSS-modules hash change)', async () => {
    const { before, after } = await scanPair('/03-css-modules/');
    expect(fingerprints(byRule(after, 'image-alt'))).toEqual(fingerprints(byRule(before, 'image-alt')));
  }, 30_000);

  it('4. a React useId changes (:r1: -> :r7:)', async () => {
    const { before, after } = await scanPair('/04-use-id-churn/');
    const beforeFinding = byRule(before, 'image-alt')[0];
    const afterFinding = byRule(after, 'image-alt')[0];
    expect(beforeFinding?.identityTier, 'the generated id must be filtered out').toBe(2);
    expect(afterFinding?.fingerprint).toBe(beforeFinding?.fingerprint);
  }, 30_000);

  it('5. "3 results" changes to "17 results" (embedded digit masking)', async () => {
    const { before, after } = await scanPair('/05-digit-count/');
    const beforeFinding = byRule(before, 'color-contrast')[0];
    const afterFinding = byRule(after, 'color-contrast')[0];
    expect(beforeFinding, 'expected a color-contrast finding before').toBeDefined();
    expect(afterFinding?.fingerprint).toBe(beforeFinding?.fingerprint);
  }, 30_000);

  it('6. two unrelated sections reordered', async () => {
    const { before, after } = await scanPair('/06-reorder-sections/');
    expect(fingerprints(byRule(after, 'image-alt'))).toEqual(fingerprints(byRule(before, 'image-alt')));
  }, 30_000);

  it('7. div[role=button] becomes a native button, same defect - a real limitation, not a pass (DECISIONS.md D35)', async () => {
    const { before, after } = await scanPair('/07-role-to-native/');
    // Run first, assumed nothing: axe-core 4.13.0 uses a DIFFERENT rule for
    // an unnamed ARIA-role control (aria-command-name) than for an unnamed
    // native one (button-name). ruleId is a fingerprint input by design
    // (02 §3.5) - correctly, changing the rule a defect is reported under
    // IS an identity change, not noise. This means the doc's case 7, taken
    // literally, cannot be satisfied at the fingerprint layer: no amount of
    // identity-layer cleverness makes two different ruleIds hash the same
    // without breaking the far more important guarantee that different
    // rules on the same element stay distinct.
    const beforeFinding = before.findings[0];
    const afterFinding = after.findings[0];
    expect(beforeFinding?.ruleId).toBe('aria-command-name');
    expect(afterFinding?.ruleId).toBe('button-name');
    expect(afterFinding?.fingerprint).not.toBe(beforeFinding?.fingerprint);

    // What Day 6's matcher would need to bridge this, and currently can't:
    // §6 restricts fuzzy-match candidates to pairs sharing ruleId AND
    // source. A role -> native migration produces a pair sharing neither
    // ruleId's exact string nor an obvious equivalence table axe exposes.
    // The identity VALUE still survives, for what it's worth:
    expect(afterFinding?.identity.value).toBe(beforeFinding?.identity.value);
  }, 30_000);

  it('8. the page moves /product/1 -> /product/2', async () => {
    const { before, after } = await scanPair('/product/1/', '/product/2/');
    expect(before.pages[0]?.urlTemplate).toBe(after.pages[0]?.urlTemplate);
    expect(fingerprints(byRule(after, 'image-alt'))).toEqual(fingerprints(byRule(before, 'image-alt')));
  }, 30_000);

  it('9. whitespace-only reflow of the document', async () => {
    const { before, after } = await scanPair('/09-whitespace-reflow/');
    expect(fingerprints(byRule(after, 'image-alt'))).toEqual(fingerprints(byRule(before, 'image-alt')));
  }, 30_000);

  it('10. an unrelated new violation is added elsewhere on the page (the one people get wrong)', async () => {
    const { before, after } = await scanPair('/10-unrelated-new-violation/');
    const beforeChart = byRule(before, 'image-alt')[0];
    const afterChart = byRule(after, 'image-alt')[0];
    expect(afterChart?.fingerprint, "the existing finding's identity must not shift").toBe(beforeChart?.fingerprint);
    expect(byRule(after, 'button-name').length, 'the new unrelated violation should also be present').toBe(1);
  }, 30_000);

  it('11. the element moves into an open shadow root', async () => {
    const { before, after } = await scanPair('/11-into-shadow/');
    const beforeFinding = byRule(before, 'image-alt')[0];
    const afterFinding = byRule(after, 'image-alt')[0];
    expect(afterFinding?.shadowPath, 'expected the after finding to report a shadow host chain').toBeDefined();
    expect(afterFinding?.fingerprint).toBe(beforeFinding?.fingerprint);
  }, 30_000);

  it('12. scroll-margin-top added to an unrelated element (identity-only today; the probe consumes this Day 9)', async () => {
    const { before, after } = await scanPair('/12-scroll-margin/');
    expect(fingerprints(byRule(after, 'image-alt'))).toEqual(fingerprints(byRule(before, 'image-alt')));
  }, 30_000);
});

/* -------------------------------------------------------------------------- */
/* Cases 13-15: must be new                                                   */
/* -------------------------------------------------------------------------- */

describe('golden pairs: must be new', () => {
  it('13. a second unlabelled button appears in a different landmark', async () => {
    const { before, after } = await scanPair('/13-new-different-landmark/');
    const beforeFps = new Set(fingerprints(byRule(before, 'button-name')));
    const afterFps = fingerprints(byRule(after, 'button-name'));
    expect(afterFps.length).toBe(beforeFps.size + 1);
    expect(afterFps.some((fp) => !beforeFps.has(fp)), 'expected at least one genuinely new fingerprint').toBe(true);
  }, 30_000);

  it('14. a second unlabelled button appears in the same landmark, distinguishable by position', async () => {
    const { before, after } = await scanPair('/14-new-same-landmark/');
    const beforeFps = new Set(fingerprints(byRule(before, 'button-name')));
    const afterFps = fingerprints(byRule(after, 'button-name'));
    expect(afterFps.length).toBe(beforeFps.size + 1);
    const newOnes = afterFps.filter((fp) => !beforeFps.has(fp));
    expect(newOnes.length, 'the new button must not collide with the existing one').toBe(1);
  }, 30_000);

  it('15. a passing image loses its alt', async () => {
    const { before, after } = await scanPair('/15-passing-loses-alt/');
    expect(byRule(before, 'image-alt')).toHaveLength(0);
    expect(byRule(after, 'image-alt')).toHaveLength(1);
  }, 30_000);
});

/* -------------------------------------------------------------------------- */
/* Cases 16-17: must be fixed                                                 */
/* -------------------------------------------------------------------------- */

describe('golden pairs: must be fixed', () => {
  it('16. a label is added', async () => {
    const { before, after } = await scanPair('/16-label-added/');
    expect(byRule(before, 'image-alt')).toHaveLength(1);
    expect(byRule(after, 'image-alt')).toHaveLength(0);
  }, 30_000);

  it('17. the element is removed', async () => {
    const { before, after } = await scanPair('/17-element-removed/');
    expect(byRule(before, 'image-alt')).toHaveLength(1);
    expect(byRule(after, 'image-alt')).toHaveLength(0);
  }, 30_000);
});

/* -------------------------------------------------------------------------- */
/* Case 18: must be moved                                                     */
/* -------------------------------------------------------------------------- */

describe('golden pairs: must be moved', () => {
  it('18. the same control relocates footer -> header (no matcher yet, so this verifies what Day 6 will need)', async () => {
    const { before, after } = await scanPair('/18-moved-footer-to-header/');
    const beforeFinding = byRule(before, 'button-name')[0];
    const afterFinding = byRule(after, 'button-name')[0];
    expect(beforeFinding, 'expected the button-name finding before').toBeDefined();
    expect(afterFinding, 'expected the button-name finding after').toBeDefined();

    // What actually changed: landmark context (contentinfo -> banner), so
    // both fingerprint AND groupKey differ - groupKey includes landmarkRole
    // specifically to distinguish "same defect, different landmark" (02
    // §3.4), which means groupKey can't be what recognises a move either.
    expect(afterFinding?.fingerprint).not.toBe(beforeFinding?.fingerprint);
    expect(afterFinding?.groupKey).not.toBe(beforeFinding?.groupKey);
    expect(beforeFinding?.identity.context.nearestLandmark).toBe('contentinfo');
    expect(afterFinding?.identity.context.nearestLandmark).toBe('banner');

    // What Day 6's matcher will have to use instead: identity.value survives
    // the move untouched (Tier 1, id-based) even though nothing else does.
    expect(afterFinding?.identity.value).toBe(beforeFinding?.identity.value);
    expect(afterFinding?.identityTier).toBe(beforeFinding?.identityTier);
  }, 30_000);
});

/* -------------------------------------------------------------------------- */
/* Case 19: must be impact-changed                                            */
/* -------------------------------------------------------------------------- */

describe('golden pairs: must be impact-changed', () => {
  it('19. contrast worsens on the same element (impact is excluded from the fingerprint by design, 02 §3.5)', async () => {
    const { before, after } = await scanPair('/19-impact-changed/');
    const beforeFinding = byRule(before, 'color-contrast')[0];
    const afterFinding = byRule(after, 'color-contrast')[0];
    expect(beforeFinding, 'expected a color-contrast violation before').toBeDefined();
    expect(afterFinding, 'expected a color-contrast violation after').toBeDefined();
    expect(afterFinding?.fingerprint, 'identity must be stable regardless of impact').toBe(beforeFinding?.fingerprint);
    // Whether axe's reported impact actually differs between these two
    // ratios is reported, not assumed - see DECISIONS.md for what this run
    // found. Either way, fingerprint stability is the property this case
    // exists to protect, and it's asserted above unconditionally.
  }, 30_000);
});

/* -------------------------------------------------------------------------- */
/* Case 20: must pair 1-to-1, not collapse                                    */
/* -------------------------------------------------------------------------- */

describe('golden pairs: must pair 1-to-1 (not collapse)', () => {
  it('20. pagination "10 11 12 13 14" -> "20 21 22 23 24" - five in, five out, no collapse', async () => {
    const { before, after } = await scanPair('/20-pagination/');
    const beforeFindings = byRule(before, 'color-contrast');
    const afterFindings = byRule(after, 'color-contrast');
    expect(beforeFindings).toHaveLength(5);
    expect(afterFindings).toHaveLength(5);
    // The masking exception (02 §3.3) is what's under test: without it,
    // every one of these ten findings would mask to the same "#" identity
    // value and collapse into one shared fingerprint.
    expect(new Set(fingerprints(beforeFindings)).size, 'the 5 before findings must stay distinct').toBe(5);
    expect(new Set(fingerprints(afterFindings)).size, 'the 5 after findings must stay distinct').toBe(5);
    expect(beforeFindings.map((f) => f.identity.value).sort()).toEqual(['10', '11', '12', '13', '14']);
    expect(afterFindings.map((f) => f.identity.value).sort()).toEqual(['20', '21', '22', '23', '24']);
  }, 30_000);
});
