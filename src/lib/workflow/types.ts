// W1-02-V3 — Workflow engine shared types
// Public API: import from `@/lib/workflow`, not from this file directly.

import type { LLMRegion } from '@/lib/llm';
import type { AiDisclosureLabelOptions } from '@/lib/export/types';

// ─── Node taxonomy (mirrors DB enum) ──────────────────────────────────────────

export type NodeType = 'topic' | 'script' | 'storyboard' | 'video' | 'export';

export type StepStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'skipped'
  | 'dirty';

export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled';

// ─── Runtime context passed to every node ─────────────────────────────────────

export interface NodeContext {
  runId:    string;
  tenantId: string;
  userId:   string;
  region:   LLMRegion;
  plan:     'solo' | 'team';

  /** The user-supplied root topic for this run (workflow_runs.topic). */
  topic: string;

  /**
   * Optional per-run export tuning (from workflow_runs.export_overrides, ops-only).
   * Merged by ExportNodeRunner into ExportInput. UI does not set this in MVP-1.
   */
  exportOverrides?: {
    aiDisclosureLabel?: AiDisclosureLabelOptions;
    watermarkOverride?: string;
  };

  /**
   * Outputs from earlier nodes in the run, keyed by NodeType.
   * Populated by the orchestrator before each node executes.
   */
  upstreamOutputs: Partial<Record<NodeType, unknown>>;
}

// ─── Per-node result envelope ─────────────────────────────────────────────────

export interface NodeResult<O = unknown> {
  /** Node-specific structured output. Persisted to workflow_steps.output_json. */
  output: O;

  /** Cumulative cost for this attempt (stored as 分 = 0.01 元). */
  costFen: number;

  /** Number of video clips generated (only the video node sets this; bumps monthly_usage cap). */
  videoCount?: number;

  /** Soft warning surfaced to UI (matches v2 contentScripts.qualityIssue). */
  qualityIssue?: string | null;

  /** Free-form metadata (provider, model, latency, etc.) for observability. */
  meta?: Record<string, unknown>;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

/** Unified error code taxonomy across nodes (extensions of LLMErrorCode). */
export type NodeErrorCode =
  | 'INVALID_INPUT'
  | 'UPSTREAM_MISSING'
  | 'LLM_RETRYABLE'
  | 'LLM_FATAL'
  | 'SPEND_CAP_EXCEEDED'
  | 'PROVIDER_FAILED'
  | 'PARSE_FAILED'
  | 'VALIDATION_FAILED'
  | 'UNKNOWN';

export class NodeError extends Error {
  constructor(
    public code: NodeErrorCode,
    message: string,
    public retryable: boolean,
    public cause?: unknown,
  ) {
    super(message);
    this.name = 'NodeError';
  }
}

// ─── Per-node static metadata (registered by each NodeRunner subclass) ────────

export interface NodeDescriptor {
  nodeType: NodeType;
  /** Position in the canonical 5-node pipeline (0-indexed). */
  stepIndex: number;
  /** Max retries inside a single .run() call. */
  maxRetries: number;
  /** Inputs needed from upstream nodes (orchestrator validates before calling). */
  upstreamRequired: ReadonlyArray<NodeType>;
}
