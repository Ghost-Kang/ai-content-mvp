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
export { DryRunVideoProvider } from './providers/dry-run';

import { SeedanceProvider } from './providers/seedance';
import { DryRunVideoProvider } from './providers/dry-run';
import type { BaseVideoProvider, FetchImpl } from './providers/base';
import type { VideoProviderName } from './types';

/**
 * `WORKFLOW_VIDEO_DRY_RUN=1` swaps the default provider to the offline stub.
 * Used by `pnpm wf:probe:full` and any local probe that wants to exercise
 * the full 5-node chain without spending real Seedance tokens. **Never set
 * this in preview / prod env vars** — every run becomes a placeholder zip.
 */
function dryRunRequested(): boolean {
  const raw = (process.env.WORKFLOW_VIDEO_DRY_RUN ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/**
 * Default provider for MVP-1. Today there's only Seedance — when W4 introduces
 * a fallback (Liblibtv, Kling), this becomes a router similar to
 * `executeWithFallback` in `lib/llm`.
 *
 * `fetchImpl` is for tests; production callers omit it.
 */
export function getDefaultVideoProvider(fetchImpl?: FetchImpl): BaseVideoProvider {
  if (dryRunRequested()) return new DryRunVideoProvider();
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
    case 'dry-run':
      return new DryRunVideoProvider();
    default:
      throw new Error(`Unknown video provider: ${String(name)}`);
  }
}
