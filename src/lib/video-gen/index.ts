// W2-03-V3 — Public API for the video-generation layer.
// Application code imports exclusively from this file.

export type {
  VideoProviderName,
  VideoResolution,
  VideoGenRequest,
  VideoGenSubmitResult,
  VideoGenJobStatus,
  VideoGenJobSnapshot,
  VideoGenErrorCode,
} from './types';
export { VideoGenError } from './types';

export type { FetchImpl } from './providers/base';
export { BaseVideoProvider } from './providers/base';
export { SeedanceProvider } from './providers/seedance';

import { SeedanceProvider } from './providers/seedance';
import type { BaseVideoProvider, FetchImpl } from './providers/base';
import type { VideoProviderName } from './types';

/**
 * Default provider for MVP-1. Today there's only Seedance — when W4 introduces
 * a fallback (Liblibtv, Kling), this becomes a router similar to
 * `executeWithFallback` in `lib/llm`.
 *
 * `fetchImpl` is for tests; production callers omit it.
 */
export function getDefaultVideoProvider(fetchImpl?: FetchImpl): BaseVideoProvider {
  return new SeedanceProvider(fetchImpl);
}

/** Explicit provider getter (for future multi-provider routing). */
export function getVideoProvider(
  name: VideoProviderName,
  fetchImpl?: FetchImpl,
): BaseVideoProvider {
  switch (name) {
    case 'seedance':
      return new SeedanceProvider(fetchImpl);
    default:
      throw new Error(`Unknown video provider: ${String(name)}`);
  }
}
