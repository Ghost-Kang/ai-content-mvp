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

export function shutdown() {
  return _posthog?.shutdown();
}
