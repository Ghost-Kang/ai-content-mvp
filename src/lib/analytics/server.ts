// ENG-056 — PostHog server-side client
// tenantId and region are set on every event for segmentation.

import { PostHog } from 'posthog-node';

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

let _posthog: PostHog | null = null;

function getPostHog(): PostHog {
  if (!_posthog) {
    _posthog = new PostHog(requireEnv('NEXT_PUBLIC_POSTHOG_KEY'), {
      host: process.env.POSTHOG_HOST ?? 'https://app.posthog.com',
      flushAt: 20,
      flushInterval: 10_000,
    });
  }
  return _posthog;
}

interface BaseProperties {
  tenantId: string;
  region: 'CN' | 'INTL';
  plan: 'solo' | 'team';
}

// ENG-057
export function fireSessionStarted(
  userId: string,
  props: BaseProperties & {
    sessionId: string;
    entryPoint: 'quick_create' | 'strategy_first';
  },
) {
  getPostHog().capture({
    distinctId: userId,
    event: 'session_started',
    properties: props,
  });
}

// ENG-059
export function fireScriptGenerated(
  userId: string,
  props: BaseProperties & {
    sessionId: string;
    scriptId:  string;
    formula:   'provocation' | 'insight';
    lengthMode: 'short' | 'long';
    charCount:  number;
    frameCount: number;
    provider:   string;
    latencyMs:  number;
    retryCount: number;
    suppressionFlagCount: number;
  },
) {
  getPostHog().capture({
    distinctId: userId,
    event: 'script_generated',
    properties: props,
  });
}

// W3-08
export function fireScriptApproved(
  userId: string,
  props: BaseProperties & {
    sessionId: string;
    scriptId:  string;
    formula:   'provocation' | 'insight';
    lengthMode: 'short' | 'long';
    hadQualityIssue: boolean;
  },
) {
  getPostHog().capture({
    distinctId: userId,
    event: 'script_approved',
    properties: props,
  });
}

// W3-08
export function fireScriptExported(
  userId: string,
  props: BaseProperties & {
    sessionId: string;
    format:    'storyboard' | 'plain';
    action:    'copy' | 'download';
    charCount: number;
  },
) {
  getPostHog().capture({
    distinctId: userId,
    event: 'script_exported',
    properties: props,
  });
}

// ─── v3.0 Workflow events (W1-09-V3) ─────────────────────────────────────────
//
// Event taxonomy:
//   workflow_run_started   — run created + orchestrator dispatch
//   workflow_run_completed — orchestrator finished all nodes successfully
//   workflow_run_failed    — orchestrator halted (node fail or spend cap)
//   workflow_node_completed — single node finished ok
//   workflow_node_failed    — single node terminal fail (post all retries)
//   workflow_node_retried   — single retry attempt inside a node
//   monthly_cap_blocked     — preflight refused to start a run
//
// All events ride the BaseProperties block (tenantId / region / plan) so
// PostHog dashboards can segment internal-test users from public users.

type V3Base = BaseProperties & { runId: string };

export function fireWorkflowRunStarted(
  userId: string,
  props: V3Base & { topic: string },
) {
  getPostHog().capture({
    distinctId: userId,
    event: 'workflow_run_started',
    properties: props,
  });
}

export function fireWorkflowRunCompleted(
  userId: string,
  props: V3Base & {
    totalCostFen:    number;
    totalVideoCount: number;
    durationMs:      number;
    nodeCount:       number;
  },
) {
  getPostHog().capture({
    distinctId: userId,
    event: 'workflow_run_completed',
    properties: props,
  });
}

export function fireWorkflowRunFailed(
  userId: string,
  props: V3Base & {
    failedNode:      string;
    errorCode:       string;
    errorMsg:        string;
    totalCostFen:    number;
    totalVideoCount: number;
    durationMs:      number;
  },
) {
  getPostHog().capture({
    distinctId: userId,
    event: 'workflow_run_failed',
    properties: props,
  });
}

export function fireWorkflowNodeCompleted(
  userId: string,
  props: V3Base & {
    nodeType:    string;
    stepIndex:   number;
    costFen:     number;
    videoCount:  number;
    retryCount:  number;
    durationMs:  number;
    qualityIssue?: string | null;
  },
) {
  getPostHog().capture({
    distinctId: userId,
    event: 'workflow_node_completed',
    properties: props,
  });
}

export function fireWorkflowNodeFailed(
  userId: string,
  props: V3Base & {
    nodeType:   string;
    stepIndex:  number;
    errorCode:  string;
    errorMsg:   string;
    retryCount: number;
    durationMs: number;
  },
) {
  getPostHog().capture({
    distinctId: userId,
    event: 'workflow_node_failed',
    properties: props,
  });
}

export function fireWorkflowNodeRetried(
  userId: string,
  props: V3Base & {
    nodeType:   string;
    stepIndex:  number;
    attempt:    number;
    errorCode:  string;
    errorMsg:   string;
    backoffMs:  number;
  },
) {
  getPostHog().capture({
    distinctId: userId,
    event: 'workflow_node_retried',
    properties: props,
  });
}

export function fireMonthlyCapBlocked(
  userId: string,
  props: BaseProperties & {
    runId?:        string;
    reason:        'cost_cap_exceeded' | 'video_cap_exceeded';
    totalCostFen:  number;
    costCapFen:    number;
    videoCount:    number;
    videoCapCount: number;
    monthKey:      string;
  },
) {
  getPostHog().capture({
    distinctId: userId,
    event: 'monthly_cap_blocked',
    properties: props,
  });
}

export function shutdown() {
  return _posthog?.shutdown();
}
