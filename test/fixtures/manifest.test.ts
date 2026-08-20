/**
 * Manifest consistency.
 *
 * The manifest is the contract the Day 2 integration tests assert against, so a
 * selector that does not exist in its page, or a defect with no rationale for
 * its miss, would silently weaken the coverage-regression metric rather than
 * failing anything.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MANIFEST_PATH, PAGES_ROOT } from './server.js';

interface Defect {
  id: string;
  selector: string;
  criterion: string;
  level: 'A' | 'AA' | 'AAA';
  description: string;
  expectation: 'detected' | 'needs-review' | 'missed';
  expectedRules: string[];
  rationale?: string;
  missReason?: 'unautomatable' | 'out-of-scope';
}

interface ManifestPage {
  path: string;
  criteria: string[];
  defects: Defect[];
  expectZeroFindings?: boolean;
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
  axeCoreVersion: string;
  pages: ManifestPage[];
};

const pages = manifest.pages;
const defects = pages.flatMap((page) => page.defects);

describe('fixture manifest', () => {
  it('records the axe-core version its expectations were written against', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { dependencies: Record<string, string> };

    // When these diverge, a rule may have tightened and an expectation may now
    // be wrong. That is a prompt to re-verify the fixtures, not to edit this
    // string.
    expect(manifest.axeCoreVersion).toBe(packageJson.dependencies['axe-core']);
  });

  it('gives every defect a unique id', () => {
    const ids = defects.map((defect) => defect.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('anchors every defect to an element that exists in its page', () => {
    for (const page of pages) {
      const html = readFileSync(join(PAGES_ROOT, page.path), 'utf8');
      for (const defect of page.defects) {
        expect(defect.selector.startsWith('#'), `${defect.id}: expected an id selector`).toBe(true);
        expect(html, `${defect.id}: ${defect.selector} is not in ${page.path}`).toContain(
          `id="${defect.selector.slice(1)}"`,
        );
      }
    }
  });

  it('explains every miss', () => {
    // A miss without a rationale is an untested claim about the coverage
    // boundary. These rationales are what the coverage matrix and the README's
    // "what this cannot catch" section are built from.
    for (const defect of defects.filter((entry) => entry.expectation !== 'detected')) {
      expect(defect.rationale, `${defect.id} has no rationale`).toBeTruthy();
      expect((defect.rationale ?? '').length, `${defect.id}: rationale is too thin`)
        .toBeGreaterThan(40);
    }
  });

  it('names expected rules for everything it claims is detectable, and none for misses', () => {
    for (const defect of defects) {
      if (defect.expectation === 'missed') {
        expect(defect.expectedRules, `${defect.id} is missed but names rules`).toEqual([]);
      } else {
        expect(defect.expectedRules.length, `${defect.id} names no rule`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the clean page free of planted defects', () => {
    const clean = pages.find((page) => page.path.startsWith('10-clean/'));
    expect(clean).toBeDefined();
    expect(clean?.expectZeroFindings).toBe(true);
    expect(clean?.defects).toEqual([]);
  });

  it('distinguishes unautomatable misses from deliberate out-of-scope exclusions', () => {
    // A miss without this distinction can't tell "no rule could ever catch
    // this" from "a rule exists but this tool doesn't enable it" - and the
    // coverage matrix would silently count a scope decision as a gap.
    for (const defect of defects.filter((entry) => entry.expectation === 'missed')) {
      expect(defect.missReason, `${defect.id} is missed but has no missReason`).toMatch(
        /^(unautomatable|out-of-scope)$/,
      );
    }
    for (const defect of defects.filter((entry) => entry.expectation !== 'missed')) {
      expect(defect.missReason, `${defect.id} is not missed but sets missReason`).toBeUndefined();
    }
  });

  it('plants defects the tool cannot find, not only ones it can', () => {
    // If every planted defect were detected, the fixtures would prove only that
    // axe works (03-EVIDENCE.md §2.1). The misses are the evidence.
    const missed = defects.filter((defect) => defect.expectation === 'missed');
    expect(missed.length).toBeGreaterThan(0);
  });
});
