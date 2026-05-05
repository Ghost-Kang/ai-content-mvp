import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateSets: Array<Record<string, unknown>> = [];

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
}));

vi.mock('@/db', () => ({
  workflowSteps: {
    id:       'workflow_steps.id',
    runId:    'workflow_steps.run_id',
    nodeType: 'workflow_steps.node_type',
  },
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => [{ id: 'step-1', nodeType: 'script' }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        updateSets.push(values);
        return {
          where: vi.fn(async () => undefined),
        };
      }),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [{ id: 'step-1' }]),
      })),
    })),
  },
}));

vi.mock('@/lib/analytics/server', () => ({
  fireWorkflowNodeCompleted: vi.fn(),
  fireWorkflowNodeFailed:    vi.fn(),
  fireWorkflowNodeRetried:   vi.fn(),
}));

import { NodeRunner } from './node-runner';
import { NodeError, type NodeContext, type NodeDescriptor, type NodeResult } from './types';

class NeverFinishesNodeRunner extends NodeRunner<unknown, unknown> {
  readonly descriptor: NodeDescriptor = {
    nodeType:         'script',
    stepIndex:        1,
    maxRetries:       0,
    upstreamRequired: [],
  };

  protected async execute(): Promise<NodeResult<unknown>> {
    return new Promise(() => undefined);
  }
}

// Video runs its own per-invocation time budget (continuation-marker based).
// withTimeout would race the marker throw — we intentionally exempt video.
class SlowVideoNodeRunner extends NodeRunner<unknown, unknown> {
  readonly descriptor: NodeDescriptor = {
    nodeType:         'video',
    stepIndex:        3,
    maxRetries:       0,
    upstreamRequired: [],
  };

  protected async execute(): Promise<NodeResult<unknown>> {
    // Resolves after 30ms — well past the 5ms env-configured timeout that
    // would have killed a script node.
    await new Promise((r) => setTimeout(r, 30));
    return { output: { ok: true }, costFen: 0 };
  }
}

const baseCtx: NodeContext = {
  runId:           'run-1',
  tenantId:        'tenant-1',
  userId:          'user-1',
  region:          'CN',
  plan:            'solo',
  topic:           'test topic',
  upstreamOutputs: {},
};

describe('NodeRunner timeout guard', () => {
  beforeEach(() => {
    updateSets.length = 0;
    process.env.WORKFLOW_SCRIPT_NODE_TIMEOUT_MS = '5';
    process.env.WORKFLOW_VIDEO_NODE_TIMEOUT_MS  = '5';
  });

  it('marks a hung script node as failed instead of leaving it running forever', async () => {
    const runner = new NeverFinishesNodeRunner();

    await expect(runner.run(baseCtx)).rejects.toMatchObject({
      code:      'PROVIDER_FAILED',
      retryable: true,
    } satisfies Partial<NodeError>);

    expect(updateSets).toContainEqual(expect.objectContaining({ status: 'running' }));
    expect(updateSets).toContainEqual(expect.objectContaining({
      status:   'failed',
      errorMsg: expect.stringContaining('timed out'),
    }));
  });

  it('does NOT apply withTimeout to the video node — even if execute outlives the env timeout, the node completes successfully', async () => {
    const runner = new SlowVideoNodeRunner();

    // Despite WORKFLOW_VIDEO_NODE_TIMEOUT_MS=5, the 30ms execute must
    // complete. Wrapping video in withTimeout would race its own
    // continuation-marker mechanism and turn the marker into a fake
    // PROVIDER_FAILED, breaking the chain.
    const result = await runner.run(baseCtx);
    expect(result.output).toEqual({ ok: true });

    // Video uses insert (not update) on first execution because the mock's
    // findExistingStep only matches the script nodeType, so we don't assert
    // a 'running' update — the successful 'done' write is the strong proof.
    expect(updateSets).toContainEqual(expect.objectContaining({ status: 'done' }));
    // No 'failed' / 'timed out' write should appear — withTimeout is bypassed.
    for (const set of updateSets) {
      expect(set.status).not.toBe('failed');
    }
  });
});
