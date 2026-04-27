// ENG-056 — PostHog server-side client
// tenantId and region are set on every event for segmentation.

import { PostHog } from 'posthog-node';

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

let _posthog: PostHog | null = null;

function analyticsDisabled(): boolean {
  const raw = (process.env.ANALYTICS_DISABLED ?? process.env.POSTHOG_DISABLED ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

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

function captureEvent(
  userId: string,
  event: string,
  properties: object,
): void {
  if (analyticsDisabled()) return;
  try {
    getPostHog().capture({
      distinctId: userId,
      event,
      properties,
    });
  } catch (e) {
    console.warn('[analytics] capture failed', { event, e });
  }
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
  captureEvent(userId, 'session_started', props);
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
  captureEvent(userId, 'script_generated', props);
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
  captureEvent(userId, 'script_approved', props);
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
  captureEvent(userId, 'script_exported', props);
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
  captureEvent(userId, 'workflow_run_started', props);
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
  captureEvent(userId, 'workflow_run_completed', props);
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
  captureEvent(userId, 'workflow_run_failed', props);
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
  captureEvent(userId, 'workflow_node_completed', props);
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
  captureEvent(userId, 'workflow_node_failed', props);
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
  captureEvent(userId, 'workflow_node_retried', props);
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
  captureEvent(userId, 'monthly_cap_blocked', props);
}

export function shutdown() {
  if (analyticsDisabled()) return Promise.resolve();
  return _posthog?.shutdown();
}
