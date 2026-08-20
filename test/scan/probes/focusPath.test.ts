/**
 * The focus-path probe's done-when (`01 §6`): finds the planted defects,
 * and produces NOTHING on the clean page or on either must-not-flag
 * fixture. Per the task: "the negative cases matter more than the positive
 * ones" - each `it` below pairs a positive assertion with an explicit
 * negative one on the SAME page, not just a positive-only check.
 */

import { describe, expect, it } from 'vitest';

import { scan } from '../../../src/index.js';
import { pageUrl, start, stop } from '../../fixtures/server.js';
import { FOCUS_OBSCURED_RULE_ID, KEYBOARD_TRAP_RULE_ID } from '../../../src/scan/probes/focusPath.js';

describe('focus-path probe', () => {
  it('flags a control genuinely obscured by a sticky header, and does not flag the one with correct scroll-margin-top', async () => {
    await start();
    try {
      const report = await scan({ seed: { url: pageUrl('07-focus-sticky') } });
      expect(report.pages[0]?.error).toBeUndefined();
      expect(report.pages[0]?.probesRun).toBe(true);

      const obscured = report.findings.filter(
        (f) => f.ruleId === FOCUS_OBSCURED_RULE_ID && f.selector.includes('obscured-link'),
      );
      expect(obscured, 'the unmitigated link must be flagged').toHaveLength(1);
      expect(obscured[0]?.bucket).toBe('needs-review');
      expect(obscured[0]?.source).toBe('probe');
      expect(obscured[0]?.bestPractice).toBe(false);
      expect(obscured[0]?.criteria.map((c) => c.id)).toEqual(['2.4.11']);

      const clear = report.findings.filter((f) => f.selector.includes('clear-link'));
      expect(clear, 'scroll-margin-top is the correct fix and must not be flagged').toHaveLength(0);

      // Every probe finding on this page, of any kind, must be exactly the one expected one.
      const probeFindings = report.findings.filter((f) => f.source === 'probe');
      expect(probeFindings).toHaveLength(1);
    } finally {
      await stop();
    }
  }, 30_000);

  it('flags an escape-less modal trap, and does not flag a correctly-implemented roving-tabindex toolbar', async () => {
    await start();
    try {
      const report = await scan({ seed: { url: pageUrl('08-focus-trap') } });
      expect(report.pages[0]?.error).toBeUndefined();

      const traps = report.findings.filter((f) => f.ruleId === KEYBOARD_TRAP_RULE_ID);
      expect(traps.length, 'the escape-less modal must produce at least one trap finding').toBeGreaterThan(0);
      expect(traps[0]?.bucket).toBe('needs-review');
      expect(traps[0]?.criteria.map((c) => c.id)).toEqual(['2.1.2']);
      // The trap is inside #modal - whichever of its two elements the
      // traversal happened to land the finding on, it must be one of them
      // (id "modal-input" or "modal-save"), never the toolbar's buttons
      // (which carry no id, only a data-align attribute) or the link after it.
      expect(traps.every((f) => f.selector.includes('modal-'))).toBe(true);
      expect(traps.every((f) => !f.html.includes('data-align'))).toBe(true);

      // No probe finding of ANY kind should be attributable to the toolbar
      // or the link after it - the whole point of a correct roving-tabindex
      // implementation is that plain Tab passes straight through.
      const probeFindings = report.findings.filter((f) => f.source === 'probe');
      expect(probeFindings.every((f) => f.ruleId === KEYBOARD_TRAP_RULE_ID)).toBe(true);
      expect(probeFindings.every((f) => !f.html.includes('data-align'))).toBe(true);
    } finally {
      await stop();
    }
  }, 30_000);

  it('produces zero probe findings on the clean page', async () => {
    await start();
    try {
      const report = await scan({ seed: { url: pageUrl('10-clean') } });
      expect(report.pages[0]?.error).toBeUndefined();
      expect(report.pages[0]?.probesRun).toBe(true);
      expect(report.findings.filter((f) => f.source === 'probe')).toEqual([]);
      expect(report.pages[0]?.probeBlindRegions).toEqual([]);
    } finally {
      await stop();
    }
  }, 30_000);

  it('records the closed shadow root as a probe-blind region, not a silent zero-finding page', async () => {
    await start();
    try {
      const report = await scan({ seed: { url: pageUrl('09-shadow') } });
      expect(report.pages[0]?.error).toBeUndefined();

      const blind = report.pages[0]?.probeBlindRegions ?? [];
      expect(blind.length, 'the closed shadow host must be recorded as probe-blind').toBeGreaterThan(0);
      expect(blind.some((region) => region.reason === 'closed-shadow-root')).toBe(true);
      expect(blind.every((region) => region.unevaluatedCriteria.includes('2.4.11'))).toBe(true);
      expect(blind.every((region) => region.unevaluatedCriteria.includes('2.1.2'))).toBe(true);

      // The probe must not have crashed or falsely flagged anything on this page.
      expect(report.findings.filter((f) => f.source === 'probe')).toEqual([]);
    } finally {
      await stop();
    }
  }, 30_000);

  it('--probes [] disables both detections; the default set runs both', async () => {
    await start();
    try {
      const disabled = await scan({ seed: { url: pageUrl('07-focus-sticky') }, probes: [] });
      expect(disabled.pages[0]?.probesRun).toBe(false);
      expect(disabled.findings.filter((f) => f.source === 'probe')).toEqual([]);
      expect(disabled.run.probesEnabled).toEqual([]);

      const enabled = await scan({ seed: { url: pageUrl('07-focus-sticky') } });
      expect(enabled.pages[0]?.probesRun).toBe(true);
      expect(enabled.run.probesEnabled).toEqual([FOCUS_OBSCURED_RULE_ID, KEYBOARD_TRAP_RULE_ID]);
      expect(enabled.findings.some((f) => f.source === 'probe')).toBe(true);
    } finally {
      await stop();
    }
  }, 30_000);
});
