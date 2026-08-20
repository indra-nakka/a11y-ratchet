/**
 * All 86 WCAG 2.2 success criteria — 31 A, 24 AA, 31 AAA (`03-EVIDENCE.md
 * §1.1`). Deliberately not just the 55 at A/AA: an axe rule tagged with an
 * AAA criterion (e.g. `color-contrast-enhanced` → `wcag146` → 1.4.6) must
 * still resolve to a real `SuccessCriterion`, or `wcag/ruleMap.ts` has
 * nowhere to put it and the criterion silently disappears from the finding.
 *
 * `03-EVIDENCE.md` Part 1 enumerates the 55 A/AA rows directly; it does not
 * enumerate the 31 AAA criteria (out of the coverage matrix's scope — see
 * `coverage.ts`). Those 31, and the 2.0/2.1/2.2 `since` split for all 86,
 * come from the WCAG 2.2 Recommendation itself, cross-checked against the
 * arithmetic `03-EVIDENCE.md §1.1` states: 31+24+31=86; 61 (2.0) + 17 (2.1) +
 * 9 (2.2) − 1 (4.1.1, removed) = 86.
 *
 * Zero logic beyond the lookup map. Verify rule IDs and `since` against the
 * spec before publishing (`03-EVIDENCE.md` epigraph) — `since` in particular
 * was reconstructed from general WCAG 2.1/2.2 knowledge, not transcribed
 * from a table in this repo's docs, and is worth an independent spot-check
 * (`DECISIONS.md` D22).
 */

import type { Level, SuccessCriterion } from '../types.js';

const UNDERSTANDING_BASE = 'https://www.w3.org/WAI/WCAG22/Understanding';

function sc(id: string, title: string, level: Level, since: SuccessCriterion['since'], slug: string): SuccessCriterion {
  return { id, title, level, since, url: `${UNDERSTANDING_BASE}/${slug}.html` };
}

/** All 86 success criteria, in spec order. */
export const WCAG_CRITERIA: SuccessCriterion[] = [
  // 1.1 Text Alternatives
  sc('1.1.1', 'Non-text Content', 'A', '2.0', 'non-text-content'),

  // 1.2 Time-based Media
  sc('1.2.1', 'Audio-only and Video-only (Prerecorded)', 'A', '2.0', 'audio-only-and-video-only-prerecorded'),
  sc('1.2.2', 'Captions (Prerecorded)', 'A', '2.0', 'captions-prerecorded'),
  sc('1.2.3', 'Audio Description or Media Alternative (Prerecorded)', 'A', '2.0', 'audio-description-or-media-alternative-prerecorded'),
  sc('1.2.4', 'Captions (Live)', 'AA', '2.0', 'captions-live'),
  sc('1.2.5', 'Audio Description (Prerecorded)', 'AA', '2.0', 'audio-description-prerecorded'),
  sc('1.2.6', 'Sign Language (Prerecorded)', 'AAA', '2.0', 'sign-language-prerecorded'),
  sc('1.2.7', 'Extended Audio Description (Prerecorded)', 'AAA', '2.0', 'extended-audio-description-prerecorded'),
  sc('1.2.8', 'Media Alternative (Prerecorded)', 'AAA', '2.0', 'media-alternative-prerecorded'),
  sc('1.2.9', 'Audio-only (Live)', 'AAA', '2.0', 'audio-only-live'),

  // 1.3 Adaptable
  sc('1.3.1', 'Info and Relationships', 'A', '2.0', 'info-and-relationships'),
  sc('1.3.2', 'Meaningful Sequence', 'A', '2.0', 'meaningful-sequence'),
  sc('1.3.3', 'Sensory Characteristics', 'A', '2.0', 'sensory-characteristics'),
  sc('1.3.4', 'Orientation', 'AA', '2.1', 'orientation'),
  sc('1.3.5', 'Identify Input Purpose', 'AA', '2.1', 'identify-input-purpose'),
  sc('1.3.6', 'Identify Purpose', 'AAA', '2.1', 'identify-purpose'),

  // 1.4 Distinguishable
  sc('1.4.1', 'Use of Color', 'A', '2.0', 'use-of-color'),
  sc('1.4.2', 'Audio Control', 'A', '2.0', 'audio-control'),
  sc('1.4.3', 'Contrast (Minimum)', 'AA', '2.0', 'contrast-minimum'),
  sc('1.4.4', 'Resize Text', 'AA', '2.0', 'resize-text'),
  sc('1.4.5', 'Images of Text', 'AA', '2.0', 'images-of-text'),
  sc('1.4.6', 'Contrast (Enhanced)', 'AAA', '2.0', 'contrast-enhanced'),
  sc('1.4.7', 'Low or No Background Audio', 'AAA', '2.0', 'low-or-no-background-audio'),
  sc('1.4.8', 'Visual Presentation', 'AAA', '2.0', 'visual-presentation'),
  sc('1.4.9', 'Images of Text (No Exception)', 'AAA', '2.0', 'images-of-text-no-exception'),
  sc('1.4.10', 'Reflow', 'AA', '2.1', 'reflow'),
  sc('1.4.11', 'Non-text Contrast', 'AA', '2.1', 'non-text-contrast'),
  sc('1.4.12', 'Text Spacing', 'AA', '2.1', 'text-spacing'),
  sc('1.4.13', 'Content on Hover or Focus', 'AA', '2.1', 'content-on-hover-or-focus'),

  // 2.1 Keyboard Accessible
  sc('2.1.1', 'Keyboard', 'A', '2.0', 'keyboard'),
  sc('2.1.2', 'No Keyboard Trap', 'A', '2.0', 'no-keyboard-trap'),
  sc('2.1.3', 'Keyboard (No Exception)', 'AAA', '2.0', 'keyboard-no-exception'),
  sc('2.1.4', 'Character Key Shortcuts', 'A', '2.1', 'character-key-shortcuts'),

  // 2.2 Enough Time
  sc('2.2.1', 'Timing Adjustable', 'A', '2.0', 'timing-adjustable'),
  sc('2.2.2', 'Pause, Stop, Hide', 'A', '2.0', 'pause-stop-hide'),
  sc('2.2.3', 'No Timing', 'AAA', '2.0', 'no-timing'),
  sc('2.2.4', 'Interruptions', 'AAA', '2.0', 'interruptions'),
  sc('2.2.5', 'Re-authenticating', 'AAA', '2.0', 're-authenticating'),
  sc('2.2.6', 'Timeouts', 'AAA', '2.1', 'timeouts'),

  // 2.3 Seizures and Physical Reactions
  sc('2.3.1', 'Three Flashes or Below Threshold', 'A', '2.0', 'three-flashes-or-below-threshold'),
  sc('2.3.2', 'Three Flashes', 'AAA', '2.0', 'three-flashes'),
  sc('2.3.3', 'Animation from Interactions', 'AAA', '2.1', 'animation-from-interactions'),

  // 2.4 Navigable
  sc('2.4.1', 'Bypass Blocks', 'A', '2.0', 'bypass-blocks'),
  sc('2.4.2', 'Page Titled', 'A', '2.0', 'page-titled'),
  sc('2.4.3', 'Focus Order', 'A', '2.0', 'focus-order'),
  sc('2.4.4', 'Link Purpose (In Context)', 'A', '2.0', 'link-purpose-in-context'),
  sc('2.4.5', 'Multiple Ways', 'AA', '2.0', 'multiple-ways'),
  sc('2.4.6', 'Headings and Labels', 'AA', '2.0', 'headings-and-labels'),
  sc('2.4.7', 'Focus Visible', 'AA', '2.0', 'focus-visible'),
  sc('2.4.8', 'Location', 'AAA', '2.0', 'location'),
  sc('2.4.9', 'Link Purpose (Link Only)', 'AAA', '2.0', 'link-purpose-link-only'),
  sc('2.4.10', 'Section Headings', 'AAA', '2.0', 'section-headings'),
  sc('2.4.11', 'Focus Not Obscured (Minimum)', 'AA', '2.2', 'focus-not-obscured-minimum'),
  sc('2.4.12', 'Focus Not Obscured (Enhanced)', 'AAA', '2.2', 'focus-not-obscured-enhanced'),
  sc('2.4.13', 'Focus Appearance', 'AAA', '2.2', 'focus-appearance'),

  // 2.5 Input Modalities
  sc('2.5.1', 'Pointer Gestures', 'A', '2.1', 'pointer-gestures'),
  sc('2.5.2', 'Pointer Cancellation', 'A', '2.1', 'pointer-cancellation'),
  sc('2.5.3', 'Label in Name', 'A', '2.1', 'label-in-name'),
  sc('2.5.4', 'Motion Actuation', 'A', '2.1', 'motion-actuation'),
  sc('2.5.5', 'Target Size (Enhanced)', 'AAA', '2.1', 'target-size-enhanced'),
  sc('2.5.6', 'Concurrent Input Mechanisms', 'AAA', '2.1', 'concurrent-input-mechanisms'),
  sc('2.5.7', 'Dragging Movements', 'AA', '2.2', 'dragging-movements'),
  sc('2.5.8', 'Target Size (Minimum)', 'AA', '2.2', 'target-size-minimum'),

  // 3.1 Readable
  sc('3.1.1', 'Language of Page', 'A', '2.0', 'language-of-page'),
  sc('3.1.2', 'Language of Parts', 'AA', '2.0', 'language-of-parts'),
  sc('3.1.3', 'Unusual Words', 'AAA', '2.0', 'unusual-words'),
  sc('3.1.4', 'Abbreviations', 'AAA', '2.0', 'abbreviations'),
  sc('3.1.5', 'Reading Level', 'AAA', '2.0', 'reading-level'),
  sc('3.1.6', 'Pronunciation', 'AAA', '2.0', 'pronunciation'),

  // 3.2 Predictable
  sc('3.2.1', 'On Focus', 'A', '2.0', 'on-focus'),
  sc('3.2.2', 'On Input', 'A', '2.0', 'on-input'),
  sc('3.2.3', 'Consistent Navigation', 'AA', '2.0', 'consistent-navigation'),
  sc('3.2.4', 'Consistent Identification', 'AA', '2.0', 'consistent-identification'),
  sc('3.2.5', 'Change on Request', 'AAA', '2.0', 'change-on-request'),
  sc('3.2.6', 'Consistent Help', 'A', '2.2', 'consistent-help'),

  // 3.3 Input Assistance
  sc('3.3.1', 'Error Identification', 'A', '2.0', 'error-identification'),
  sc('3.3.2', 'Labels or Instructions', 'A', '2.0', 'labels-or-instructions'),
  sc('3.3.3', 'Error Suggestion', 'AA', '2.0', 'error-suggestion'),
  sc('3.3.4', 'Error Prevention (Legal, Financial, Data)', 'AA', '2.0', 'error-prevention-legal-financial-data'),
  sc('3.3.5', 'Help', 'AAA', '2.0', 'help'),
  sc('3.3.6', 'Error Prevention (All)', 'AAA', '2.0', 'error-prevention-all'),
  sc('3.3.7', 'Redundant Entry', 'A', '2.2', 'redundant-entry'),
  sc('3.3.8', 'Accessible Authentication (Minimum)', 'AA', '2.2', 'accessible-authentication-minimum'),
  sc('3.3.9', 'Accessible Authentication (Enhanced)', 'AAA', '2.2', 'accessible-authentication-enhanced'),

  // 4.1 Compatible — 4.1.1 Parsing was removed in 2.2, deliberately absent.
  sc('4.1.2', 'Name, Role, Value', 'A', '2.0', 'name-role-value'),
  sc('4.1.3', 'Status Messages', 'AA', '2.1', 'status-messages'),
];

const CRITERIA_BY_ID = new Map(WCAG_CRITERIA.map((criterion) => [criterion.id, criterion]));

/** Look up one criterion by dotted id, e.g. `"1.4.3"`. */
export function criterionById(id: string): SuccessCriterion | undefined {
  return CRITERIA_BY_ID.get(id);
}
