import { describe, expect, it } from 'vitest';

import { computeGate } from '../../src/diff/gate.js';
import type { DiffFindings, Finding, UnknownFinding } from '../../src/types.js';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    fingerprint: 'aaaaaaaaaaaaaaaa',
    groupKey: 'bbbbbbbbbbbbbbbb',
    identityTier: 1,
    identity: { value: 'x', ordinal: 0, context: { nearestLandmark: 'main', headingContext: 'none', inFrame: [] }, domDepth: 5 },
    source: 'axe',
    ruleId: 'image-alt',
    bucket: 'violation',
    bestPractice: false,
    impact: 'serious',
    criteria: [],
    tags: [],
    url: 'https://example.com/page',
    urlTemplate: '/page',
    selector: '#x',
    html: '<img id="x">',
    remediation: '',
    ...overrides,
  };
}

function emptyFindings(overrides: Partial<DiffFindings> = {}): DiffFindings {
  return { new: [], fixed: [], persisting: [], unclassified: [], moved: [], impactChanged: [], unknown: [], ...overrides };
}

describe('computeGate', () => {
  it('passes with no findings', () => {
    const gate = computeGate(emptyFindings(), { newPagePolicy: 'warn' });
    expect(gate.passed).toBe(true);
    expect(gate.countedAgainstGate).toBe(0);
  });

  it('fails on a new violation (axe, not best-practice)', () => {
    const gate = computeGate(emptyFindings({ new: [finding()] }), { newPagePolicy: 'warn' });
    expect(gate.passed).toBe(false);
    expect(gate.countedAgainstGate).toBe(1);
  });

  it('does not fail on a new needs-review finding', () => {
    const gate = computeGate(emptyFindings({ new: [finding({ bucket: 'needs-review' })] }), { newPagePolicy: 'warn' });
    expect(gate.passed).toBe(true);
  });

  it('does not fail on a new probe finding', () => {
    const gate = computeGate(emptyFindings({ new: [finding({ source: 'probe' })] }), { newPagePolicy: 'warn' });
    expect(gate.passed).toBe(true);
  });

  it('does not fail on a new best-practice finding', () => {
    const gate = computeGate(emptyFindings({ new: [finding({ bestPractice: true })] }), { newPagePolicy: 'warn' });
    expect(gate.passed).toBe(true);
  });

  it('does not fail on a new SUPPRESSED violation - suppression applies at the gate (D13)', () => {
    const suppressed = finding({
      suppressed: { ruleRef: 'r1', justification: 'j', owner: 'me', expires: '2099-01-01', category: 'accepted-risk', expired: false },
    });
    const gate = computeGate(emptyFindings({ new: [suppressed] }), { newPagePolicy: 'warn' });
    expect(gate.passed).toBe(true);
    expect(gate.countedAgainstGate).toBe(0);
  });

  it('fails on impact-changed severity increase', () => {
    const pair = { from: finding({ impact: 'moderate' }), to: finding({ impact: 'critical' }) };
    const gate = computeGate(emptyFindings({ impactChanged: [pair] }), { newPagePolicy: 'warn' });
    expect(gate.passed).toBe(false);
  });

  it('does not fail on impact-changed severity decrease', () => {
    const pair = { from: finding({ impact: 'critical' }), to: finding({ impact: 'moderate' }) };
    const gate = computeGate(emptyFindings({ impactChanged: [pair] }), { newPagePolicy: 'warn' });
    expect(gate.passed).toBe(true);
  });

  it('does not fail on moved', () => {
    const pair = { from: finding(), to: finding() };
    const gate = computeGate(emptyFindings({ moved: [pair] }), { newPagePolicy: 'warn' });
    expect(gate.passed).toBe(true);
  });

  describe('newPagePolicy', () => {
    const unknownAdded: UnknownFinding[] = [{ reason: 'page-added', finding: finding() }];

    it('warn (default): does not fail, but warns', () => {
      const gate = computeGate(emptyFindings({ unknown: unknownAdded }), { newPagePolicy: 'warn' });
      expect(gate.passed).toBe(true);
      expect(gate.warnings.length).toBeGreaterThan(0);
    });

    it('fail: fails the gate', () => {
      const gate = computeGate(emptyFindings({ unknown: unknownAdded }), { newPagePolicy: 'fail' });
      expect(gate.passed).toBe(false);
    });

    it('ignore: neither fails nor warns', () => {
      const gate = computeGate(emptyFindings({ unknown: unknownAdded }), { newPagePolicy: 'ignore' });
      expect(gate.passed).toBe(true);
      expect(gate.warnings).toEqual([]);
    });
  });

  it('page-removed / page-error never gate, but are surfaced as warnings', () => {
    const unknown: UnknownFinding[] = [
      { reason: 'page-removed', finding: finding() },
      { reason: 'page-error', finding: finding() },
    ];
    const gate = computeGate(emptyFindings({ unknown }), { newPagePolicy: 'fail' });
    expect(gate.passed).toBe(true);
    expect(gate.warnings.length).toBeGreaterThan(0);
  });

  it('reason reads like a sentence, naming the gating criteria', () => {
    const gate = computeGate(
      emptyFindings({ new: [finding({ criteria: [{ id: '1.4.3', title: 'Contrast (Minimum)', level: 'AA', since: '2.0', url: 'https://example.com' }] })] }),
      { newPagePolicy: 'warn' },
    );
    expect(gate.reason).toContain('1 new violation');
    expect(gate.reason).toContain('1.4.3');
  });

  it('passing reason mentions moved/fixed counts', () => {
    const gate = computeGate(emptyFindings({ fixed: [finding(), finding()], moved: [{ from: finding(), to: finding() }] }), {
      newPagePolicy: 'warn',
    });
    expect(gate.passed).toBe(true);
    expect(gate.reason).toContain('2 fixed');
    expect(gate.reason).toContain('1 moved');
  });
});
