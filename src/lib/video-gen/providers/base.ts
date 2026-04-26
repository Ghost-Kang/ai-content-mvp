// W2-03-V3 — Abstract provider contract for video generation.
//
// Every concrete provider lives in `./<name>.ts` and extends this. Outside
// `src/lib/video-gen` callers only see `getDefaultVideoProvider()` from the
// package index — the abstraction lets us hot-swap providers (Seedance ↔
// Liblibtv ↔ Kling) when one of them rate-limits us mid-week.

import type {
  VideoProviderName,
  VideoGenRequest,
  VideoGenSubmitResult,
  VideoGenJobSnapshot,
  VideoGenError,
  VideoResolution,
} from '../types';

/**
 * Hook the test harness uses to inject a fake `fetch`. Providers store this
 * privately and call it instead of the global `fetch` so unit tests stay
 * fully offline. Production passes `globalThis.fetch`.
 */
export type FetchImpl = typeof fetch;

export abstract class BaseVideoProvider {
  abstract readonly name:  VideoProviderName;
  abstract readonly model: string;

  /**
   * Per-million-tokens cost in 分 (fen). D32 (2026-04-26) replaced the
   * earlier per-second basis after observing Volcengine Ark bills by
   * `usage.completion_tokens`, not seconds. For 1.0-pro: ¥15/M tokens
   * = 1500 分/M tokens = 0.0015 分/token.
   */
  abstract readonly costPerMTokensFen: number;

  /**
   * Worst-case token estimate for a frame given duration + resolution.
   * Used by NodeRunner spend-cap preflight (we don't know real token count
   * until the job completes). Implementations should err HIGH so the cap
   * fires a frame early, not a frame late.
   */
  abstract estimateTokensForFrame(durationSec: number, resolution: VideoResolution): number;

  /** Submit a generation job; returns the polling key. */
  abstract submit(request: VideoGenRequest): Promise<VideoGenSubmitResult>;

  /** One poll tick. Caller decides cadence + total wait. */
  abstract pollJob(jobId: string): Promise<VideoGenJobSnapshot>;

  /** Throws if env / credentials are missing. Called once at startup. */
  abstract validateConfig(): void;

  /** Lightweight ping used by /api/healthz. */
  abstract healthCheck(): Promise<boolean>;

  /** Maps provider-native errors to the unified taxonomy. */
  protected abstract normalizeError(raw: unknown): VideoGenError;
}
