// W4-P0 — Dry-run video provider (probe stub).
//
// Purpose: let `pnpm wf:probe:full` run the full 5-node workflow end-to-end
// without spending real Seedance tokens. Stand-in for `SeedanceProvider`
// when the env var `WORKFLOW_VIDEO_DRY_RUN=1` is set.
//
// What it does:
//   - submit() returns instantly with a deterministic-looking job id
//   - pollJob() returns `succeeded` on first poll with a tiny `data:`
//     video URL (4-byte placeholder MP4 — Node's fetch handles data:
//     URLs natively, so the export bundler's downloader works without
//     a code change)
//   - tokenCount / actualDurationSec mirror what Seedance would have
//     reported, so the cost-cap path + analytics events stay realistic
//
// What it does NOT do:
//   - Generate a playable video. The placeholder bytes are 4 zero bytes;
//     trying to play them in JianYing will fail. That's intentional —
//     dry-run validates orchestration + state-machine + DB + zip
//     packaging. Visual fidelity is the job of the real-Seedance probe.
//   - Bypass the spend cap. The cap math runs against `costPerMTokensFen`
//     × estimated tokens; we set the same costPerMTokensFen as the real
//     provider so cap-trip behavior is observable in dry-run mode.
//
// Why a separate provider (instead of mocking fetch in seedance.ts):
//   - The real provider has retry / poll-loop / error-class branches we
//     don't want to exercise here — those have their own unit tests.
//     This stub gives a single deterministic happy path.
//   - The `provider` field in workflow_steps.outputJson then honestly
//     says `'dry-run'`, not `'seedance'`. Audit log integrity matters.

import { BaseVideoProvider } from './base';
import { VideoGenError } from '../types';
import type {
  VideoProviderName,
  VideoGenRequest,
  VideoGenSubmitResult,
  VideoGenJobSnapshot,
  VideoResolution,
} from '../types';

/**
 * 4-byte placeholder MP4 returned by every successful poll. Tiny enough
 * to keep zips small; valid enough that fetch() / Buffer.from() succeed.
 * Real video playback is out of scope for dry-run.
 */
const DRY_RUN_VIDEO_DATA_URL = 'data:video/mp4;base64,AAAAAA==';

/** Same per-second token estimate as Seedance so cap math stays realistic. */
const DRY_RUN_TOKENS_PER_SEC: Record<VideoResolution, number> = {
  '480p':  10_500,
  '720p':  22_000,
  '1080p': 50_000,
};

let _jobCounter = 0;

export class DryRunVideoProvider extends BaseVideoProvider {
  readonly name:               VideoProviderName = 'dry-run';
  readonly model:              string            = 'dry-run-stub-v1';
  /** Match real Seedance so dry-run cost numbers are comparable. */
  readonly costPerMTokensFen:  number            = 1500;

  estimateTokensForFrame(durationSec: number, resolution: VideoResolution): number {
    const perSec = DRY_RUN_TOKENS_PER_SEC[resolution] ?? DRY_RUN_TOKENS_PER_SEC['720p'];
    return Math.ceil(durationSec * perSec);
  }

  validateConfig(): void {
    // No env requirements — dry-run is precisely the path you take when
    // you don't have a Seedance key (or don't want to spend on it).
  }

  async submit(request: VideoGenRequest): Promise<VideoGenSubmitResult> {
    if (!request.prompt || request.prompt.length === 0) {
      // Mirror the contract real providers enforce — empty prompt is a
      // hard-fail upstream bug, not a transient issue.
      throw new VideoGenError(
        'BAD_REQUEST',
        'dry-run',
        'dry-run video stub: empty prompt is rejected (matches real-provider contract)',
        false,
      );
    }
    _jobCounter += 1;
    const jobId = `cgt-dry-${Date.now().toString(36)}-${_jobCounter.toString(36)}`;
    return {
      jobId,
      provider:   'dry-run',
      model:      this.model,
      acceptedAt: new Date().toISOString(),
    };
  }

  async pollJob(jobId: string): Promise<VideoGenJobSnapshot> {
    // First poll = success. Caller still goes through the poll loop, so
    // the per-frame timing is whatever POLL_INTERVAL_MS dictates (default
    // 2s). Setting a low override (`WORKFLOW_VIDEO_POLL_INTERVAL_MS=50`)
    // makes the dry-run probe finish in seconds.
    return {
      jobId,
      provider:          'dry-run',
      model:             this.model,
      status:            'succeeded',
      videoUrl:          DRY_RUN_VIDEO_DATA_URL,
      // Estimate "billable tokens" from the request. We don't know
      // request shape from jobId alone, so use a 5s @ 480p baseline —
      // matches the typical storyboard frame and keeps cap math sane.
      tokenCount:        Math.ceil(5 * DRY_RUN_TOKENS_PER_SEC['480p']),
      actualDurationSec: 5,
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  protected normalizeError(raw: unknown): VideoGenError {
    return new VideoGenError(
      'UNKNOWN',
      'dry-run',
      `dry-run stub should not normalize errors (got ${String(raw)})`,
      false,
    );
  }
}
