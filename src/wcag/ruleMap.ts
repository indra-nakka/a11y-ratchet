/**
 * axe tag → WCAG success criterion mapping (`01 §7`).
 *
 * axe encodes an SC as `wcag` + principle digit + guideline digit + the
 * criterion's own number with no separators — `wcag143` → 1.4.3, `wcag1412`
 * → 1.4.12 (principle 1, guideline 4, criterion "12"; the split is
 * unambiguous because principle and guideline are always single digits).
 * `link-name` carries both `wcag244` and `wcag412`, so multi-SC rules
 * resolve to both entries automatically — no per-rule special-casing needed.
 *
 * Three cases handled explicitly, matching `01 §7`:
 *   1. No WCAG tag (`best-practice` only) → `criteria: []`, and
 *      `bestPractice` comes from the tag, never from `criteria.length === 0`
 *      (`DECISIONS.md` D4) — a gap in `criteria.ts` must not silently read as
 *      "not a WCAG failure".
 *   2. Multiple SC tags → keep the array.
 *   3. A tag that matches the `wcagXYZ` shape but names a criterion this
 *      table doesn't have (`wcag411` → the obsolete 4.1.1) is dropped, not
 *      thrown — axe still tags some deprecated rules with it.
 */

import { criterionById } from './criteria.js';
import type { SuccessCriterion } from '../types.js';

const WCAG_TAG_PATTERN = /^wcag(\d)(\d)(\d{1,2})$/;
const BEST_PRACTICE_TAG = 'best-practice';

/** Every WCAG success criterion an axe rule's tags name, sorted, deduplicated. */
export function criteriaForTags(tags: string[]): SuccessCriterion[] {
  const ids = new Set<string>();

  for (const tag of tags) {
    const match = WCAG_TAG_PATTERN.exec(tag);
    if (!match) continue;
    const [, principle, guideline, number] = match;
    ids.add(`${principle}.${guideline}.${number}`);
  }

  const criteria: SuccessCriterion[] = [];
  for (const id of ids) {
    const criterion = criterionById(id);
    // wcag411 (obsolete 4.1.1) and similar: the tag shape matches but no
    // current criterion has that id. Not an error - axe still emits it on a
    // few deprecated rules (DECISIONS.md D22 tracks whether this ever fires
    // on a rule with no OTHER usable tag, which would be a real mapping gap).
    if (criterion) criteria.push(criterion);
  }

  return criteria.sort((a, b) => compareCriterionIds(a.id, b.id));
}

/** `01 §7`, `DECISIONS.md` D4: set from the tag, never inferred. */
export function isBestPractice(tags: string[]): boolean {
  return tags.includes(BEST_PRACTICE_TAG);
}

function compareCriterionIds(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i += 1) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/* -------------------------------------------------------------------------- */
/* Rule equivalence (Day 6, `diff/match.ts`)                                  */
/* -------------------------------------------------------------------------- */

/**
 * Rule ids axe-core reports as genuinely different rules but which express
 * the same underlying defect on structurally equivalent elements. Found via
 * golden case 7 (`DECISIONS.md` D35): `<div role="button">` with no name and
 * a native `<button>` with no name fire `aria-command-name` and `button-name`
 * respectively — same defect, different rule id, because `ruleId` is a
 * fingerprint input and correctly can't unify them at the identity layer.
 *
 * Pass 2 (`diff/match.ts`) treats two findings as fuzzy-match CANDIDATES when
 * their rule ids are equivalent, not just when they're identical — this is
 * what turns case 7 from `new` + `fixed` into `moved` (`02 §9`).
 */
const RULE_EQUIVALENCE_CLASSES: readonly (readonly string[])[] = [
  // ARIA-role-emulated control vs its native HTML equivalent, both "no accessible name".
  ['button-name', 'aria-command-name'],
  // Same defect (non-text content with no text alternative), different element shape.
  ['image-alt', 'role-img-alt', 'svg-img-alt'],
];

const RULE_EQUIVALENCE_CLASS_BY_RULE = new Map<string, number>();
RULE_EQUIVALENCE_CLASSES.forEach((ruleClass, index) => {
  for (const ruleId of ruleClass) RULE_EQUIVALENCE_CLASS_BY_RULE.set(ruleId, index);
});

/** True for the same rule id, or for two rule ids in the same equivalence class. */
export function areRulesEquivalent(a: string, b: string): boolean {
  if (a === b) return true;
  const classA = RULE_EQUIVALENCE_CLASS_BY_RULE.get(a);
  const classB = RULE_EQUIVALENCE_CLASS_BY_RULE.get(b);
  return classA !== undefined && classA === classB;
}
