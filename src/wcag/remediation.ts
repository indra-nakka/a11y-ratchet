/**
 * One-line, hand-written remediation notes for the axe rules most likely to
 * fire on a real site — this project's own advice, not axe's help text
 * pasted in. `01 §7`, `Finding.remediation`: "yours, not axe's help text."
 *
 * This is a credibility signal more than a technical one: it's the
 * difference between a report that says "here's a rule id, go look it up"
 * and one that tells a developer what to actually change. Rules with no
 * entry here fall back to a generic pointer at `helpUrl` rather than
 * fabricating advice this project hasn't actually reviewed.
 */

const REMEDIATION: Record<string, string> = {
  // 1.1.1 — Non-text Content
  'image-alt': 'Add an alt attribute describing what the image conveys, or alt="" if it is purely decorative.',
  'input-image-alt': 'Give the image-type submit button an alt attribute describing the action it performs.',
  'area-alt': 'Add an alt attribute to this image-map area describing where the link goes.',
  'role-img-alt': 'This role="img" element needs an accessible name — add aria-label or aria-labelledby.',
  'svg-img-alt': 'Add a <title> element as the SVG\'s first child, or aria-label, so role="img" has a name.',
  'object-alt': 'Give the <object> element a text alternative via alt, aria-label, or fallback content.',
  'aria-meter-name': 'This meter needs an accessible name — add aria-label or aria-labelledby.',
  'aria-progressbar-name': 'This progressbar needs an accessible name — add aria-label or aria-labelledby.',

  // 1.2.2 — Captions
  'video-caption': 'Add a <track kind="captions"> element pointing at a caption file for this video.',

  // 1.3.1 — Info and Relationships
  'list': 'Only <li>, <script> or <template> may be direct children of <ul>/<ol> — move other content inside an <li>.',
  'listitem': 'Wrap this <li> in a <ul> or <ol> — a list item outside a list isn\'t exposed as one.',
  'dlitem': 'Wrap <dt>/<dd> pairs in a <dl> — they only form a definition list inside one.',
  'td-headers-attr': 'This cell\'s headers attribute references an id that doesn\'t exist in the table — fix the id or drop the attribute.',
  'th-has-data-cells': 'This header describes no data cells — check the table for a row that\'s short a column, or drop the unused header.',
  'aria-required-children': 'This element\'s ARIA role requires specific child roles that are missing — add them or drop the role.',
  'aria-required-parent': 'This role only makes sense inside a specific parent role — wrap it accordingly or drop the role.',
  'aria-hidden-body': 'Remove aria-hidden="true" from <body> — it hides the entire page from assistive technology.',
  'definition-list': '<dl> may only directly contain <dt>/<dd> (optionally grouped in <div>) — move other children out.',

  // 1.3.4 — Orientation
  'css-orientation-lock': 'Remove the CSS that locks this page to one orientation, or provide an in-page control to unlock it.',

  // 1.3.5 — Identify Input Purpose
  'autocomplete-valid': 'This autocomplete value isn\'t one of the HTML spec\'s recognised tokens — check the exact spelling.',

  // 1.4.1 — Use of Color
  'link-in-text-block': 'This inline link is distinguished from surrounding text by colour alone — add an underline or other non-colour cue.',

  // 1.4.2 / 2.2.2 — Audio Control / Pause, Stop, Hide
  'no-autoplay-audio': 'Audio that plays automatically for more than 3 seconds needs a visible pause/stop control, or shouldn\'t autoplay at all.',
  'blink': 'Remove the deprecated <blink> element — animate with CSS if the emphasis is still needed, respecting prefers-reduced-motion.',
  'marquee': 'Remove the deprecated <marquee> element — use CSS animation with a pause control if scrolling content is still needed.',

  // 1.4.3 — Contrast
  'color-contrast': 'Darken the text or lighten the background until the ratio reaches 4.5:1 (3:1 for large/bold text) — check against the actual rendered colours, not the design file.',

  // 1.4.4 — Resize Text
  'meta-viewport': 'Remove user-scalable=no and any maximum-scale below 2 from the viewport meta tag — both block pinch-zoom.',

  // 1.4.12 — Text Spacing
  'avoid-inline-spacing': 'Replace this !important inline spacing style with a regular CSS rule, so a user stylesheet can override it.',

  // 2.1.1 — Keyboard
  'scrollable-region-focusable': 'Add tabindex="0" to this scrollable region so keyboard users can scroll it without a pointer.',
  'frame-focusable-content': 'This frame contains focusable content but the frame itself can\'t be reached by keyboard — check its tabindex and visibility.',
  'server-side-image-map': 'Replace the server-side image map (ismap) with a client-side <map> with real <area> elements — server-side maps are pointer-only.',

  // 2.2.1 — Timing Adjustable
  'meta-refresh': 'Remove the timed meta-refresh, or replace it with a mechanism the user can pause, extend or turn off.',

  // 2.4.1 — Bypass Blocks
  'bypass': 'Add a working skip-to-content link, or landmark regions, so keyboard users can bypass repeated navigation.',

  // 2.4.2 — Page Titled
  'document-title': 'Add a <title> that actually describes this specific page — not just the site name repeated everywhere.',

  // 2.4.4 / 4.1.2 — Link Purpose / Name Role Value
  'link-name': 'This link has no accessible text — check it isn\'t an icon-only link missing aria-label, or an image link with empty alt.',
  'button-name': 'This button has no accessible text — icon-only buttons need aria-label naming the action.',
  'select-name': 'This <select> has no accessible name — associate a <label>, or add aria-label.',
  'frame-title': 'Add a title attribute to this <iframe> describing its content, for someone navigating by frame.',
  'frame-title-unique': 'Two frames on this page share a title — make each one distinct so they can be told apart by frame name alone.',
  'input-button-name': 'This button-type input has no accessible text — set its value attribute or add aria-label.',
  'label': 'Associate a <label for="..."> with this form control\'s id, or wrap the control in the label.',
  'nested-interactive': 'An interactive element (button, link, etc.) sits inside another interactive element — flatten the structure, most screen readers can only reach one.',
  'summary-name': 'This <details>/<summary> has no accessible text — give the <summary> element real text content.',
  'duplicate-id-aria': 'This id is referenced by an ARIA attribute (aria-labelledby, aria-describedby, etc.) but duplicated elsewhere in the page — ids must be unique for the reference to resolve.',
  'aria-allowed-attr': 'This ARIA attribute isn\'t valid on this role — check the ARIA spec\'s allowed-attributes table for the role in use.',
  'aria-required-attr': 'This role requires an ARIA attribute (e.g. aria-checked on role="checkbox") that\'s missing — add it.',
  'aria-valid-attr': 'This aria-* attribute name doesn\'t exist — check for a typo against the ARIA spec.',
  'aria-valid-attr-value': 'This ARIA attribute has a value the spec doesn\'t allow for it — check the expected value type (boolean, id reference, token list, etc.).',

  // 2.5.3 — Label in Name
  'label-content-name-mismatch': 'The visible text on this control isn\'t contained in its accessible name — speech-input users saying what they see won\'t activate it. Make the accessible name start with the visible text.',

  // 2.5.8 — Target Size
  'target-size': 'Increase this control\'s hit area to at least 24×24 CSS pixels, or add spacing so its centre is 24px from the nearest other target — unless it\'s inline text, has an equivalent larger control elsewhere, or the small size is essential.',

  // 3.1.1 / 3.1.2 — Language
  'html-has-lang': 'Add a lang attribute to the <html> element — screen readers use it to choose a pronunciation engine.',
  'html-lang-valid': 'This lang attribute value isn\'t a valid BCP 47 language tag — check the spelling against the IANA subtag registry.',
  'html-xml-lang-mismatch': 'The lang and xml:lang attributes on <html> disagree — make them match.',
  'valid-lang': 'This lang attribute (not on <html>) isn\'t a valid BCP 47 language tag — check the spelling.',

  // 3.3.2 — Labels or Instructions
  'form-field-multiple-labels': 'This form field has more than one <label>, which most screen readers concatenate confusingly — keep exactly one.',
  'aria-input-field-name': 'This ARIA-role input field has no accessible name — add aria-label, aria-labelledby, or an associated <label>.',
};

const FALLBACK_PREFIX = 'No authored remediation note yet for this rule';

/**
 * A one-line fix for a rule, or a generic pointer at the rule's own
 * documentation. `helpUrl` (already on the `Finding`) is where that
 * documentation lives — repeated here only in the fallback sentence.
 */
export function remediationFor(ruleId: string): string {
  return REMEDIATION[ruleId] ?? `${FALLBACK_PREFIX} — see the finding's helpUrl.`;
}

/** Rule ids this project has actually written a remediation note for. */
export function hasAuthoredRemediation(ruleId: string): boolean {
  return ruleId in REMEDIATION;
}
