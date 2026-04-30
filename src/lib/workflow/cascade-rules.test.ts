import { describe, it, expect } from 'vitest';
import { evaluateStepAction, stepIndexOf } from './cascade-rules';
import type { NodeType, StepStatus } from './types';

describe('evaluateStepAction — runStatus running', () => {
  it('blocks every action while a run is in flight', () => {
    const actions = ['edit', 'retry', 'skip'] as const;
    for (const action of actions) {
      const r = evaluateStepAction({
        nodeType:   'script',
        stepStatus: 'failed',
        runStatus:  'running',
        action,
      });
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('RUN_RUNNING');
    }
  });
});

describe('evaluateStepAction — edit', () => {
  it('allows editing script in done state', () => {
    const r = evaluateStepAction({
      nodeType: 'script', stepStatus: 'done', runStatus: 'done', action: 'edit',
    });
    expect(r).toEqual({ allowed: true });
  });

  it('allows editing storyboard in done state', () => {
    const r = evaluateStepAction({
      nodeType: 'storyboard', stepStatus: 'done', runStatus: 'failed', action: 'edit',
    });
    expect(r).toEqual({ allowed: true });
  });

  it('rejects editing video / export / topic (not editable nodes)', () => {
    const nodes: NodeType[] = ['video', 'export', 'topic'];
    for (const nodeType of nodes) {
      const r = evaluateStepAction({
        nodeType, stepStatus: 'done', runStatus: 'done', action: 'edit',
      });
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('NODE_NOT_EDITABLE');
    }
  });

  it('rejects editing a step that is not done (failed / dirty / pending / running)', () => {
    const statuses: StepStatus[] = ['failed', 'dirty', 'pending', 'running', 'skipped'];
    for (const stepStatus of statuses) {
      const r = evaluateStepAction({
        nodeType: 'script', stepStatus, runStatus: 'failed', action: 'edit',
      });
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('STATUS_NOT_EDITABLE');
    }
  });
});

describe('evaluateStepAction — retry', () => {
  it('allows retry on failed and dirty', () => {
    const statuses: StepStatus[] = ['failed', 'dirty'];
    for (const stepStatus of statuses) {
      const r = evaluateStepAction({
        nodeType: 'video', stepStatus, runStatus: 'failed', action: 'retry',
      });
      expect(r.allowed).toBe(true);
    }
  });

  it('rejects retry on done / pending / skipped (no useful side effect)', () => {
    const statuses: StepStatus[] = ['done', 'pending', 'skipped'];
    for (const stepStatus of statuses) {
      const r = evaluateStepAction({
        nodeType: 'video', stepStatus, runStatus: 'done', action: 'retry',
      });
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('STATUS_NOT_RETRYABLE');
    }
  });
});

describe('evaluateStepAction — skip', () => {
  it('allows skip on failed and dirty', () => {
    const r1 = evaluateStepAction({
      nodeType: 'export', stepStatus: 'failed', runStatus: 'failed', action: 'skip',
    });
    expect(r1.allowed).toBe(true);

    const r2 = evaluateStepAction({
      nodeType: 'export', stepStatus: 'dirty', runStatus: 'failed', action: 'skip',
    });
    expect(r2.allowed).toBe(true);
  });

  it('rejects skip on terminal-success / pending', () => {
    const r = evaluateStepAction({
      nodeType: 'export', stepStatus: 'done', runStatus: 'done', action: 'skip',
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('STATUS_NOT_SKIPPABLE');
  });
});

describe('stepIndexOf', () => {
  it('returns sequential indices for the canonical pipeline', () => {
    expect(stepIndexOf('topic')).toBe(0);
    expect(stepIndexOf('script')).toBe(1);
    expect(stepIndexOf('storyboard')).toBe(2);
    expect(stepIndexOf('video')).toBe(3);
    expect(stepIndexOf('export')).toBe(4);
  });
});
