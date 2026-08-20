import { describe, expect, it } from 'vitest';

import { computeGate } from '../../src/diff/gate.js';
import type { DiffFindings, Finding, UnknownFinding } from '../../src/types.js';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    fingerprint: 'aaaaaaaaaaaaaaaa',
    groupKey: 'bbbbbbbbbbbbbbbb',
    templateKey: 'cccccccccccccccc',
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

  it('reason counts at TEMPLATE level with an instance count alongside, naming the gating criteria (01 §8)', () => {
    const gate = computeGate(
      emptyFindings({ new: [finding({ criteria: [{ id: '1.4.3', title: 'Contrast (Minimum)', level: 'AA', since: '2.0', url: 'https://example.com' }] })] }),
      { newPagePolicy: 'warn' },
    );
    // Never "1 new violation" - the whole point of Day 10's rewrite.
    expect(gate.reason).not.toContain('new violation');
    expect(gate.reason).toContain('1 new template defect (1 instance)');
    expect(gate.reason).toContain('1.4.3');
  });

  it('many instances of ONE template read as one template defect with an instance count, never N violations', () => {
    const findings = Array.from({ length: 43 }, (_, i) => finding({ fingerprint: `fp-${i}`, templateKey: 'the-template' }));
    const gate = computeGate(emptyFindings({ new: findings }), { newPagePolicy: 'warn' });
    expect(gate.passed).toBe(false);
    expect(gate.countedAgainstGate).toBe(43); // the gate itself still counts and blocks on every instance
    expect(gate.reason).toContain('1 new template defect (43 instances)');
    expect(gate.reason).not.toContain('43 new');
  });

  it('two distinct templates are counted as two templates, not collapsed into one', () => {
    const findings = [finding({ fingerprint: 'fp-1', templateKey: 'template-a' }), finding({ fingerprint: 'fp-2', templateKey: 'template-b' })];
    const gate = computeGate(emptyFindings({ new: findings }), { newPagePolicy: 'warn' });
    expect(gate.reason).toContain('2 new template defects (2 instances)');
  });

  it('passing reason counts moved/fixed at template level too', () => {
    const gate = computeGate(
      emptyFindings({
        fixed: [finding({ fingerprint: 'fp-1' }), finding({ fingerprint: 'fp-2' })], // same default templateKey - 1 template, 2 instances
        moved: [{ from: finding(), to: finding() }],
      }),
      { newPagePolicy: 'warn' },
    );
    expect(gate.passed).toBe(true);
    expect(gate.reason).toContain('1 fixed template (2 instances)');
    expect(gate.reason).toContain('1 moved template (1 instance)');
  });
});
