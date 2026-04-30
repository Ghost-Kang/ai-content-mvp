// ENG-056 — PostHog server-side client
// tenantId and region are set on every event for segmentation.
//
// CN compliance — 《数据安全法》/《个人信息保护法》(audit #3, 2026-04-30):
// Free-form user content (`topic`, `errorMsg`) MUST NOT egress to a
// foreign analytics endpoint. The default PostHog cloud is US-hosted, so
// CN events are routed through `assertCnAnalyticsCompliance` which:
//   1. requires POSTHOG_HOST to be in the CN-approved allowlist when any
//      event is fired with region: 'CN'
//   2. redacts PII-laden text fields to length+sha256 prefix on CN events
//
// Mirrors the pattern used by lib/llm/router.ts → never let "small refactor"
// pull foreign-region content through here.

import { createHash } from 'node:crypto';
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

// CN-approved analytics endpoints. Self-hosted PostHog inside CN, or a
// mainland CDN-fronted relay. Keep this list tiny — adding a host means
// the operator confirmed it stays inside CN data borders.
const CN_APPROVED_ANALYTICS_HOST_SUFFIXES: ReadonlyArray<string> = [
  '.cn',                  // any .cn TLD
  '.aliyuncs.com',        // Aliyun CDN/PostHog self-host
  'tencentcs.com',        // Tencent Cloud
];

function isCnApprovedHost(host: string): boolean {
  let normalized: string;
  try {
    normalized = new URL(host).hostname.toLowerCase();
  } catch {
    return false;
  }
  return CN_APPROVED_ANALYTICS_HOST_SUFFIXES.some((suffix) =>
    normalized === suffix.replace(/^\./, '') || normalized.endsWith(suffix),
  );
}

/**
 * Throws if a CN-region event is about to land on a non-CN host.
 * Cheap insurance against the "small refactor" that would silently
 * exfiltrate user content. Called per-event because the host is read
 * lazily — first event that hits CN compliance gate gets blocked, not
 * module load (which would break all-INTL deployments).
 */
function assertCnAnalyticsCompliance(region: 'CN' | 'INTL'): void {
  if (region !== 'CN') return;
  const host = process.env.POSTHOG_HOST ?? 'https://app.posthog.com';
  if (!isCnApprovedHost(host)) {
    throw new Error(
      `[analytics] CN-region event rejected: POSTHOG_HOST=${host} is not in the CN allowlist. ` +
      `Set POSTHOG_HOST to a domestic endpoint (self-hosted on Aliyun/Tencent/.cn) or disable ` +
      `analytics for CN tenants via ANALYTICS_DISABLED=1. ` +
      `Re: 数据安全法 / 个人信息保护法 — never route raw user content to app.posthog.com.`,
    );
  }
}

/**
 * Replace free-form user content with a redacted form (length + sha256 prefix).
 * Lets PostHog dashboards still segment by "did the topic change between runs"
 * (hash equality) without exposing the actual text. Used for CN-region events.
 */
export function redactUserContent(text: string | null | undefined, maxLen = 64): string {
  if (!text) return '';
  const truncated = text.length > maxLen ? text.slice(0, maxLen) : text;
  const sha = createHash('sha256').update(truncated).digest('hex').slice(0, 12);
  return `redacted:${truncated.length}:${sha}`;
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
  properties: { region: 'CN' | 'INTL' },
): void {
  if (analyticsDisabled()) return;
  try {
    assertCnAnalyticsCompliance(properties.region);
    getPostHog().capture({
      distinctId: userId,
      event,
      properties: properties as unknown as Record<string, unknown>,
    });
  } catch (e) {
    // Never break the user flow on analytics failures — log and move on.
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
  // CN: never send raw topic text. Hash + length is enough for funnels.
  const safe = props.region === 'CN'
    ? { ...props, topic: redactUserContent(props.topic) }
    : props;
  captureEvent(userId, 'workflow_run_started', safe);
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
  // CN: errorMsg often contains LLM output fragments / user input. Redact.
  // errorCode (UPPER_SNAKE) is fine — it's an enum, no user content.
  const safe = props.region === 'CN'
    ? { ...props, errorMsg: redactUserContent(props.errorMsg, 200) }
    : props;
  captureEvent(userId, 'workflow_run_failed', safe);
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
  const safe = props.region === 'CN'
    ? { ...props, errorMsg: redactUserContent(props.errorMsg, 200) }
    : props;
  captureEvent(userId, 'workflow_node_failed', safe);
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
  const safe = props.region === 'CN'
    ? { ...props, errorMsg: redactUserContent(props.errorMsg, 200) }
    : props;
  captureEvent(userId, 'workflow_node_retried', safe);
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
