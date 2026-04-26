// W3-01-V3 + W3-04-V3 — Export Node Runner.
//
// Final node in the 5-node chain. Consumes:
//   - storyboard (for voiceover + on-screen text)
//   - video      (for videoUrl + actualDurationSec)
//
// Produces in `output_jsonb`:
//   - scriptText  — human-readable .txt script with AI watermark           (W3-01)
//   - fcpxml      — { fcpxml, downloadHints, schemaVersion }               (W3-02)
//   - totalDurationSec / generatedAt for the UI                            (W3-01)
//   - bundle      — { signedUrl, expiresAt, objectPath, filename, bytes }  (W3-04)
//                   or null when storage is not configured
//
// Bundling (W3-04) downloads each Seedance clip + zips them with the FCPXML
// project + a user-facing readme.md, then uploads to Supabase Storage and
// returns a 7-day signed URL. The whole step is GUARDED:
//
//   - if SUPABASE_SERVICE_ROLE_KEY is missing → log warn, skip bundle, set
//     output.bundle = null. The fcpxml artifact in output_jsonb still lets
//     the UI render the script / project preview.
//   - if `WORKFLOW_EXPORT_SKIP_BUNDLE=1` → same skip behaviour (lets devs
//     iterate fast without burning Storage quota).
//   - if bundling fails (network, fetch 404, Storage 5xx) we retry ONCE
//     internally with a 2s backoff; second failure throws PROVIDER_FAILED.
//
// Cost: 0 (no LLM, no video gen). videoCount: 0. Outer NodeRunner retries: 0
// — all retries live inside this node (bundle retry above; everything else
// is deterministic so re-running the whole node won't help).

import { NodeRunner } from '../node-runner';
import {
  NodeError,
  type NodeContext,
  type NodeDescriptor,
  type NodeResult,
} from '../types';
import {
  buildExportBundle,
  buildFcpxmlProject,
  buildScriptText,
  BundleError,
  type BundleResult,
  type ClipFetcher,
  type ExportFrame,
  type ExportInput,
  type ExportNodeOutput,
} from '@/lib/export';
import { recordExportAiDisclosureDisabled } from '@/lib/compliance/record-audit';
import {
  uploadExportBundle,
  StorageError,
  type UploadBundleResult,
} from '@/lib/storage';
import type { StoryboardNodeOutput } from './storyboard';
import type { VideoNodeOutput } from './video';

// ─── Tunables ─────────────────────────────────────────────────────────────────

/** Backoff between bundle attempts (ms). Single retry. */
const BUNDLE_RETRY_BACKOFF_MS = 2_000;

// ─── Provider injection (test seam) ───────────────────────────────────────────

export interface ExportRunnerDeps {
  /** Override for clip downloads (default = global fetch). */
  fetcher?:  ClipFetcher;
  /** Override for the upload step (default = real Supabase). */
  uploader?: (args: {
    tenantId: string;
    runId:    string;
    bundle:   Uint8Array;
    filename: string;
  }) => Promise<UploadBundleResult>;
  /**
   * Override the "is storage configured" check. Default reads
   * SUPABASE_SERVICE_ROLE_KEY from process.env. Tests use this to fake
   * configured/unconfigured states without mucking with env vars.
   */
  storageConfiguredFn?: () => boolean;
}

function defaultStorageConfigured(): boolean {
  if (process.env.WORKFLOW_EXPORT_SKIP_BUNDLE === '1') return false;
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// ─── Runner ───────────────────────────────────────────────────────────────────

export class ExportNodeRunner extends NodeRunner<ExportInput, ExportNodeOutput> {
  readonly descriptor: NodeDescriptor = {
    nodeType:         'export',
    stepIndex:        4,
    maxRetries:       0,
    upstreamRequired: ['storyboard', 'video'],
  };

  constructor(private readonly deps: ExportRunnerDeps = {}) {
    super();
  }

  protected buildInput(ctx: NodeContext): ExportInput {
    const storyboard = ctx.upstreamOutputs.storyboard as StoryboardNodeOutput | undefined;
    const video      = ctx.upstreamOutputs.video      as VideoNodeOutput | undefined;

    if (!storyboard || !Array.isArray(storyboard.frames) || storyboard.frames.length === 0) {
      throw new NodeError(
        'UPSTREAM_MISSING',
        'export node requires storyboard.frames upstream output',
        false,
      );
    }
    if (!video || !Array.isArray(video.frames) || video.frames.length === 0) {
      throw new NodeError(
        'UPSTREAM_MISSING',
        'export node requires video.frames upstream output',
        false,
      );
    }

    // Join storyboard ↔ video on `index`. Storyboard is the source of truth
    // for total frame count + voiceover; video supplies videoUrl + actual
    // duration. If a video frame is missing for any storyboard frame, fail
    // hard — partial deliverables are useless.
    const videoByIndex = new Map(video.frames.map((vf) => [vf.index, vf]));

    const frames: ExportFrame[] = storyboard.frames.map((sf) => {
      const vf = videoByIndex.get(sf.index);
      if (!vf) {
        throw new NodeError(
          'VALIDATION_FAILED',
          `export node: storyboard frame ${sf.index} has no matching video frame ` +
          `(video produced ${video.frames.length}/${storyboard.frames.length} frames). ` +
          `Re-run video node before exporting.`,
          false,
        );
      }
      return {
        index:        sf.index,
        videoUrl:     vf.videoUrl,
        // Trust the video provider's reported duration over the storyboard's
        // intent — the actual clip length is what JianYing will render.
        durationSec:  vf.actualDurationSec,
        voiceover:    sf.voiceover,
        onScreenText: sf.onScreenText,
      };
    });

    const input: ExportInput = {
      topic:      ctx.topic,
      frames,
      resolution: video.resolution,
    };
    if (ctx.exportOverrides?.watermarkOverride) {
      input.watermarkOverride = ctx.exportOverrides.watermarkOverride;
    }
    if (ctx.exportOverrides?.aiDisclosureLabel) {
      input.aiDisclosureLabel = ctx.exportOverrides.aiDisclosureLabel;
    }
    return input;
  }

  protected async execute(
    input: ExportInput,
    ctx:   NodeContext,
  ): Promise<NodeResult<ExportNodeOutput>> {
    if (input.aiDisclosureLabel?.disabled === true) {
      await recordExportAiDisclosureDisabled({
        tenantId: ctx.tenantId,
        runId:    ctx.runId,
        userId:   ctx.userId,
        topic:    ctx.topic,
      });
    }

    const generatedAt = new Date();

    // ─── Phase 1: build deterministic artifacts (cannot fail except on bad input) ─
    let scriptText: string;
    let fcpxml:     ExportNodeOutput['fcpxml'];
    try {
      scriptText = buildScriptText(input, generatedAt);
      fcpxml     = buildFcpxmlProject(input, { now: generatedAt });
    } catch (e) {
      throw new NodeError(
        'VALIDATION_FAILED',
        `export build failed: ${e instanceof Error ? e.message : String(e)}`,
        false,
        e,
      );
    }

    const totalDurationSec = input.frames.reduce((s, f) => s + f.durationSec, 0);

    // ─── Phase 2: bundle + upload (skippable) ─────────────────────────────────
    const storageConfigured = (this.deps.storageConfiguredFn ?? defaultStorageConfigured)();
    let bundle: ExportNodeOutput['bundle'] = null;
    let bundleMeta: { uncompressedBytes: number; compressedBytes: number; missing: number } | null = null;

    if (!storageConfigured) {
      console.warn(
        '[export] storage not configured (SUPABASE_SERVICE_ROLE_KEY missing or ' +
        'WORKFLOW_EXPORT_SKIP_BUNDLE=1). Skipping bundle upload — JSON artifacts ' +
        'still persisted in workflow_steps.output_json.',
      );
    } else {
      const built = await this.buildBundleWithRetry(input, generatedAt);
      const uploaded = await (this.deps.uploader ?? uploadExportBundle)({
        tenantId: ctx.tenantId,
        runId:    ctx.runId,
        bundle:   built.bytes,
        filename: built.suggestedName,
      }).catch((e) => {
        if (e instanceof StorageError) {
          throw new NodeError(
            'PROVIDER_FAILED',
            `export upload failed: ${e.code}: ${e.message}`,
            false,
            e,
          );
        }
        throw e;
      });

      bundle = {
        signedUrl:     uploaded.signedUrl,
        expiresAt:     uploaded.expiresAt,
        objectPath:    uploaded.objectPath,
        filename:      built.suggestedName,
        bytes:         uploaded.bytes,
        missingFrames: built.missingFrames.map((m) => m.index),
      };
      bundleMeta = {
        uncompressedBytes: built.uncompressedBytes,
        compressedBytes:   built.compressedBytes,
        missing:           built.missingFrames.length,
      };
    }

    const output: ExportNodeOutput = {
      scriptText,
      fcpxml,
      totalDurationSec,
      generatedAt: generatedAt.toISOString(),
      bundle,
    };

    return {
      output,
      costFen:      0,
      videoCount:   0,
      qualityIssue: null,
      meta: {
        frameCount:        input.frames.length,
        scriptTextChars:   scriptText.length,
        fcpxmlBytes:       fcpxml.fcpxml.length,
        downloadHintCount: fcpxml.downloadHints.length,
        schemaVersion:     fcpxml.schemaVersion,
        bundleSkipped:     !storageConfigured,
        bundleBytes:       bundleMeta?.compressedBytes,
        bundleUncompressed: bundleMeta?.uncompressedBytes,
        bundleMissing:     bundleMeta?.missing ?? 0,
      },
    };
  }

  /**
   * Build the bundle with a single retry on transient failures. We classify
   * BundleError(FETCH_FAILED) as retryable (Seedance CDN occasionally 502s);
   * BundleError(INPUT_INVALID) as fatal (no point re-trying bad input).
   */
  private async buildBundleWithRetry(
    input:        ExportInput,
    generatedAt:  Date,
  ): Promise<BundleResult> {
    const attempt = async (): Promise<BundleResult> =>
      buildExportBundle(input, {
        fetcher: this.deps.fetcher,
        now:     generatedAt,
      });

    try {
      return await attempt();
    } catch (e) {
      if (e instanceof BundleError && e.code === 'INPUT_INVALID') {
        throw new NodeError(
          'VALIDATION_FAILED',
          `export bundle build failed (non-retryable): ${e.message}`,
          false,
          e,
        );
      }
      // Retryable transient — wait + try once more.
      await sleep(BUNDLE_RETRY_BACKOFF_MS);
      try {
        return await attempt();
      } catch (e2) {
        const code = e2 instanceof BundleError ? e2.code : 'UNKNOWN';
        throw new NodeError(
          'PROVIDER_FAILED',
          `export bundle build failed after retry (${code}): ` +
          `${e2 instanceof Error ? e2.message : String(e2)}`,
          false,
          e2,
        );
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
