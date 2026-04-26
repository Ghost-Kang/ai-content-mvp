// W2-05-V3 / W2-06-V3 — Video Generation Node Runner.
//
// Iterates over storyboard frames and renders each via the video-gen
// provider abstraction (default: Seedance). Per-frame: submit → poll loop
// → retry (W2-06: 2 attempts, exponential backoff) → cap preflight before
// every clip → cost & video-count aggregation for monthly_usage.
//
// Upstream contract: requires `storyboard` node output (StoryboardNodeOutput).
// Downstream: ExportNodeRunner (W3) joins on `output.frames[i].videoUrl`.
//
// Cost accounting (W1-07 spend-cap): each successful frame contributes
// `tokenCount × provider.costPerMTokensFen / 1M` to the run's costFen
// (D32 token-based billing, 2026-04-26) AND increments videoCount by 1.
// Both are aggregated by the orchestrator into monthly_usage on terminal
// state (success OR failure — partial spend must NOT leak past the cap).
// For preflight (before submit) we use `provider.estimateTokensForFrame()`
// which keys off the configured resolution.
//
// Failure policy: hard-fail the entire node if any frame ultimately fails
// after retries. Half-rendered storyboards are useless to ExportNode (would
// produce videos with gaps / black frames). Mid-run cap trip propagates
// SpendCapError up to the orchestrator, which finalizes the run as failed
// AND bumps monthly_usage with whatever was burned so far.

import { NodeRunner } from '../node-runner';
import { assertCapAllows, SpendCapError } from '../spend-cap';
import {
  NodeError,
  type NodeContext,
  type NodeDescriptor,
  type NodeResult,
} from '../types';
import {
  getDefaultVideoProvider,
  VideoGenError,
  type BaseVideoProvider,
  type VideoResolution,
  type VideoGenJobSnapshot,
} from '@/lib/video-gen';
import type { StoryboardNodeOutput } from './storyboard';

// ─── IO shapes ────────────────────────────────────────────────────────────────

export interface VideoFrameInput {
  index:       number;
  prompt:      string;
  durationSec: number;
}

export interface VideoFrameOutput {
  index:             number;
  jobId:             string;
  videoUrl:          string;
  provider:          string;
  model:             string;
  costFen:           number;
  actualDurationSec: number;
  /** How many submit/poll attempts it took to land this clip (1 = first try). */
  attemptCount:      number;
}

export interface VideoNodeOutput {
  frames:           ReadonlyArray<VideoFrameOutput>;
  totalCostFen:     number;
  totalDurationSec: number;
  provider:         string;
  model:            string;
  resolution:       VideoResolution;
}

// ─── Tunables ─────────────────────────────────────────────────────────────────

/**
 * Per-frame internal retry budget (W2-06). Outer NodeRunner.maxRetries=0
 * (we don't want to re-render every frame on a single tail-end failure).
 * 2 attempts = original + 1 retry. Aligns with v2 LLM retry posture.
 */
const PER_FRAME_MAX_ATTEMPTS = 2;

/** Exponential backoff for retryable errors (rate-limit / 5xx / network). */
const RETRY_BACKOFF_BASE_MS = 500;
const RETRY_BACKOFF_CAP_MS  = 4_000;

/** Polling cadence + total wait per frame. */
const POLL_INTERVAL_MS = Number(process.env.WORKFLOW_VIDEO_POLL_INTERVAL_MS ?? 2_000);
const POLL_MAX_WAIT_MS = Number(process.env.WORKFLOW_VIDEO_POLL_MAX_WAIT_MS ?? 300_000); // 5 min

/**
 * Demo / cost guard: cap how many frames a single run will render. Default
 * unset = render every storyboard frame. For W2-05 dev demos we set this to
 * 3 via env so a stuck retry loop doesn't burn ¥100. Production internal-test
 * should leave it unset (trust the monthly cap to bound spend).
 */
function maxFramesPerRun(): number | null {
  const raw = process.env.WORKFLOW_VIDEO_MAX_FRAMES_PER_RUN;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

// D33 (2026-04-26): default 480p (was 720p). At ¥15/M tokens, 60s @ 720p
// workflow ~= ¥18.7 → -8% margin vs ¥1000 ARPU × 60条/月. 480p ~= ¥8.8 →
// 47% margin, hits §3 target. Override per tenant via env if quality demands.
const DEFAULT_RESOLUTION: VideoResolution =
  (process.env.WORKFLOW_VIDEO_RESOLUTION as VideoResolution) || '480p';

// ─── Runner ───────────────────────────────────────────────────────────────────

export class VideoGenNodeRunner extends NodeRunner<VideoFrameInput[], VideoNodeOutput> {
  readonly descriptor: NodeDescriptor = {
    nodeType:         'video',
    stepIndex:        3,
    // Outer retries 0 — per-frame retries live inside execute() so we don't
    // re-render the entire storyboard on a single late failure.
    maxRetries:       0,
    upstreamRequired: ['storyboard'],
  };

  /**
   * Provider seam — production constructs Seedance via env config; tests
   * inject a fake `BaseVideoProvider` to avoid the network. Mirrors the
   * pattern `StoryboardNodeRunner.callLLM` uses for the LLM seam.
   */
  protected readonly provider: BaseVideoProvider;

  constructor(provider?: BaseVideoProvider) {
    super();
    this.provider = provider ?? getDefaultVideoProvider();
  }

  protected buildInput(ctx: NodeContext): VideoFrameInput[] {
    const upstream = ctx.upstreamOutputs.storyboard as StoryboardNodeOutput | undefined;
    if (!upstream || !Array.isArray(upstream.frames) || upstream.frames.length === 0) {
      throw new NodeError(
        'UPSTREAM_MISSING',
        'video node requires storyboard.frames upstream output (got missing or empty)',
        false,
      );
    }
    const frames = upstream.frames.map((f) => ({
      index:       f.index,
      prompt:      f.imagePrompt,
      durationSec: f.durationSec,
    }));

    const cap = maxFramesPerRun();
    return cap !== null ? frames.slice(0, cap) : frames;
  }

  protected async execute(
    frames: VideoFrameInput[],
    ctx: NodeContext,
  ): Promise<NodeResult<VideoNodeOutput>> {
    if (frames.length === 0) {
      throw new NodeError('INVALID_INPUT', 'video node received zero frames', false);
    }

    const rendered: VideoFrameOutput[] = [];
    let runningCostFen = 0;

    for (const frame of frames) {
      const estimatedTokens     = this.provider.estimateTokensForFrame(frame.durationSec, DEFAULT_RESOLUTION);
      const estimatedFrameCostFen = Math.ceil((estimatedTokens * this.provider.costPerMTokensFen) / 1_000_000);

      // Cap preflight per frame — IMPORTANT: assertCapAllows reads ONLY the
      // DB-persisted snapshot, but the orchestrator only bumps monthly_usage
      // AFTER the entire run finishes. So we have to project both the cost
      // the previous frames in THIS run already burned (`runningCostFen`,
      // `rendered.length`) AND the estimated cost of the frame we're about
      // to render. Otherwise mid-run cap halt fires one or two frames late.
      try {
        await assertCapAllows(ctx.tenantId, ctx.userId, {
          addCostFen: runningCostFen + estimatedFrameCostFen,
          addVideos:  rendered.length + 1,
        });
      } catch (e) {
        if (e instanceof SpendCapError) {
          // Surface partial progress in the error so the orchestrator can log
          // it. Cost already accumulated in `runningCostFen` is reported via
          // the SpendCapError path; orchestrator bumps monthly_usage.
          throw e;
        }
        throw e;
      }

      const outcome = await this.renderOneFrameWithRetry(frame, ctx);
      rendered.push(outcome);
      runningCostFen += outcome.costFen;
    }

    const totalDurationSec = rendered.reduce((s, f) => s + f.actualDurationSec, 0);

    const output: VideoNodeOutput = {
      frames:           rendered,
      totalCostFen:     runningCostFen,
      totalDurationSec,
      provider:         this.provider.name,
      model:            this.provider.model,
      resolution:       DEFAULT_RESOLUTION,
    };

    return {
      output,
      costFen:    runningCostFen,
      videoCount: rendered.length,
      qualityIssue: null,
      meta: {
        provider:           this.provider.name,
        model:              this.provider.model,
        frameCount:         rendered.length,
        totalAttempts:      rendered.reduce((s, f) => s + f.attemptCount, 0),
        framesWithRetry:    rendered.filter((f) => f.attemptCount > 1).length,
      },
    };
  }

  // ─── Per-frame loop ─────────────────────────────────────────────────────────

  /**
   * Submit + poll one frame, retrying on retryable VideoGenErrors.
   * Returns the rendered frame output OR throws NodeError on terminal failure.
   */
  private async renderOneFrameWithRetry(
    frame: VideoFrameInput,
    ctx:   NodeContext,
  ): Promise<VideoFrameOutput> {
    let lastErr: VideoGenError | NodeError | undefined;

    for (let attempt = 1; attempt <= PER_FRAME_MAX_ATTEMPTS; attempt++) {
      try {
        const submit = await this.provider.submit({
          prompt:      frame.prompt,
          durationSec: frame.durationSec,
          resolution:  DEFAULT_RESOLUTION,
          tenantId:    ctx.tenantId,
        });

        const final = await this.pollUntilTerminal(submit.jobId);

        if (final.status === 'failed') {
          // Provider-side generation failure (e.g. the model couldn't render
          // the prompt). Treat as non-retryable — same prompt would fail again.
          throw new NodeError(
            'PROVIDER_FAILED',
            `video frame ${frame.index} failed: ${final.errorMessage ?? 'unknown'}`,
            false,
          );
        }

        if (!final.videoUrl) {
          throw new NodeError(
            'PROVIDER_FAILED',
            `video frame ${frame.index} succeeded but no videoUrl returned`,
            false,
          );
        }

        const actualSec = final.actualDurationSec ?? frame.durationSec;
        // Prefer provider-reported costFen (computed from real completion_tokens).
        // Fall back to a conservative estimate using the same resolution model
        // the cap preflight uses.
        const fallbackTokens = this.provider.estimateTokensForFrame(actualSec, DEFAULT_RESOLUTION);
        const costFen        = final.costFen
          ?? Math.ceil((fallbackTokens * this.provider.costPerMTokensFen) / 1_000_000);

        return {
          index:             frame.index,
          jobId:             submit.jobId,
          videoUrl:          final.videoUrl,
          provider:          this.provider.name,
          model:             this.provider.model,
          costFen,
          actualDurationSec: actualSec,
          attemptCount:      attempt,
        };
      } catch (e) {
        // Hard NodeError from the inner block (PROVIDER_FAILED above) — surface
        // immediately, don't retry.
        if (e instanceof NodeError) throw e;

        // VideoGenError — branch on retryable.
        if (e instanceof VideoGenError) {
          lastErr = e;
          const isLast = attempt >= PER_FRAME_MAX_ATTEMPTS;
          if (!e.retryable || isLast) {
            throw new NodeError(
              this.mapVideoErrorToNodeCode(e),
              `video frame ${frame.index} ${e.code}: ${e.message}`,
              false,
              e,
            );
          }
          await sleep(backoffMs(attempt));
          continue;
        }

        // Unknown — wrap and surface (don't retry; we don't know what it was).
        throw new NodeError(
          'UNKNOWN',
          `video frame ${frame.index} unknown error: ${e instanceof Error ? e.message : String(e)}`,
          false,
          e,
        );
      }
    }

    // Loop fell through without returning AND without throwing — defensive.
    throw lastErr instanceof NodeError
      ? lastErr
      : new NodeError(
          'UNKNOWN',
          `video frame ${frame.index} exhausted retries with no resolution`,
          false,
        );
  }

  /**
   * Poll a submitted job until it hits a terminal state OR we exceed the
   * per-frame wait budget. Retryable poll errors (rate-limit / 5xx / network)
   * back off and continue; non-retryable polls bubble out.
   */
  private async pollUntilTerminal(jobId: string): Promise<VideoGenJobSnapshot> {
    const deadline = Date.now() + POLL_MAX_WAIT_MS;

    while (Date.now() < deadline) {
      let snap: VideoGenJobSnapshot;
      try {
        snap = await this.provider.pollJob(jobId);
      } catch (e) {
        if (e instanceof VideoGenError && e.retryable) {
          await sleep(POLL_INTERVAL_MS);
          continue;
        }
        throw e;
      }

      if (snap.status === 'succeeded' || snap.status === 'failed') {
        return snap;
      }
      // queued | running — wait & repeat.
      await sleep(POLL_INTERVAL_MS);
    }

    throw new VideoGenError(
      'POLL_TIMEOUT',
      this.provider.name,
      `job ${jobId} did not reach terminal state within ${POLL_MAX_WAIT_MS}ms`,
      false,
    );
  }

  private mapVideoErrorToNodeCode(e: VideoGenError): NodeError['code'] {
    switch (e.code) {
      case 'AUTH_FAILED':         return 'LLM_FATAL'; // closest existing taxonomy slot
      case 'RATE_LIMITED':        return 'PROVIDER_FAILED';
      case 'BAD_REQUEST':         return 'INVALID_INPUT';
      case 'CONTENT_FILTERED':    return 'VALIDATION_FAILED';
      case 'PROVIDER_UNAVAILABLE':return 'PROVIDER_FAILED';
      case 'GENERATION_FAILED':   return 'PROVIDER_FAILED';
      case 'POLL_TIMEOUT':        return 'PROVIDER_FAILED';
      default:                    return 'UNKNOWN';
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function backoffMs(attempt: number): number {
  // attempt is 1-based; 1st retry waits BASE × 2^0 = BASE.
  return Math.min(RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt - 1), RETRY_BACKOFF_CAP_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
