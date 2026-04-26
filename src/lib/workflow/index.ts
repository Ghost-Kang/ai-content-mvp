// Public API for the v3.0 Workflow Engine.
// All application code imports exclusively from this file.

export { NodeRunner } from './node-runner';
export { WorkflowOrchestrator, type RunResult } from './orchestrator';
export { ScriptNodeRunner, type ScriptInput, type ScriptOutput } from './nodes/script';
export {
  StoryboardNodeRunner,
  type StoryboardInput,
  type StoryboardNodeOutput,
} from './nodes/storyboard';
export {
  VideoGenNodeRunner,
  type VideoFrameInput,
  type VideoFrameOutput,
  type VideoNodeOutput,
} from './nodes/video';
export { ExportNodeRunner } from './nodes/export';

export type {
  NodeContext,
  NodeDescriptor,
  NodeResult,
  NodeType,
  StepStatus,
  WorkflowStatus,
  NodeErrorCode,
} from './types';
export { NodeError } from './types';

export {
  readMonthlyUsage,
  checkMonthlyCap,
  projectedCapCheck,
  assertCapAllows,
  SpendCapError,
  type MonthlyUsageSnapshot,
  type SpendCheckResult,
  type SpendCapReason,
} from './spend-cap';

// W3-06 — Cascade engine (edit / retry / skip mutations + downstream marking)
export {
  markDownstreamDirty,
  resetRunForResume,
  applyStepEdit,
  applyStepRetry,
  applyStepSkip,
  evaluateStepAction,
  snapshotRunSteps,
  stepIndexOf,
  EDITABLE_NODES,
  EDITABLE_STEP_STATUSES,
  RETRYABLE_STEP_STATUSES,
  SKIPPABLE_STEP_STATUSES,
  type CascadeAction,
  type StepActionGuardInput,
  type StepActionGuardResult,
} from './cascade';

// ─── Default node registry for MVP-1 ──────────────────────────────────────────
// Add nodes in step_index order as each week ships:
//   W1 → script        (step_index 1)  ✅
//   W2 → storyboard    (step_index 2)  ✅ W2-02
//   W2 → video         (step_index 3)  ✅ W2-05 (gated on SEEDANCE_API_KEY)
//   W3 → export        (step_index 4)  ✅ W3-01
//   W4 → topic         (prepended to step_index 0)
//
// The orchestrator validates step_index ordering at construction.
//
// `buildDefaultOrchestrator()` ships the LLM-only chain so dev probes
// (wf:probe) keep working without a Seedance key. Once W2-04 PoC validates
// the pipeline AND the user provides SEEDANCE_API_KEY, switch callers to
// `buildFullOrchestrator()`.

import { ScriptNodeRunner } from './nodes/script';
import { StoryboardNodeRunner } from './nodes/storyboard';
import { VideoGenNodeRunner } from './nodes/video';
import { ExportNodeRunner } from './nodes/export';
import { WorkflowOrchestrator } from './orchestrator';

export function buildDefaultOrchestrator(): WorkflowOrchestrator {
  return new WorkflowOrchestrator([
    new ScriptNodeRunner(),
    new StoryboardNodeRunner(),
  ]);
}

/**
 * Full 4-node chain (topic → script → storyboard → video → export will be
 * 5-node once W4 lands the topic node). Requires SEEDANCE_API_KEY because
 * the video node will call the real Seedance API. Use this for end-to-end
 * demos (W2-04 PoC, internal-test runs) where you want both rendered clips
 * AND the JianYing draft / script.txt deliverables.
 */
export function buildFullOrchestrator(): WorkflowOrchestrator {
  return new WorkflowOrchestrator([
    new ScriptNodeRunner(),
    new StoryboardNodeRunner(),
    new VideoGenNodeRunner(),
    new ExportNodeRunner(),
  ]);
}
