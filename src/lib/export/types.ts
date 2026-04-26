// W3-01-V3 / W3-02-V3 — Export layer shared types.
//
// The export layer turns a finished workflow run into deliverables the user
// can hand to a human editor (剪映 / CapCut Pro for Chinese desktop) or run
// through their own publish flow. D25 (c) lock means MVP-1 hands users files,
// NOT auto-publishes.
//
// Deliverables (1 run → 3 artifacts):
//   1. script.txt        — voiceover + on-screen text + AI watermark
//   2. project.fcpxml    — Apple FCPXML 1.13 project (剪映/CapCut/FCPX/DaVinci
//                          all import natively; supersedes the prior JSON
//                          draft path which JianYing does not officially
//                          import)
//   3. clips/frame-NN.mp4 (× N) — pre-fetched Seedance clips referenced by
//                          the FCPXML's <media-rep src> after path rewrite
//
// W3-04 zips these + a README.md, uploads to Supabase Storage, returns a
// signed URL. This module just builds the in-memory structures.

/**
 * Minimal frame contract the exporters need.
 *   videoUrl     ← VideoNodeOutput.frames[i].videoUrl
 *   durationSec  ← VideoNodeOutput.frames[i].actualDurationSec
 *   voiceover    ← StoryboardNodeOutput.frames[i].voiceover
 *   onScreenText ← StoryboardNodeOutput.frames[i].onScreenText
 */
export interface ExportFrame {
  index:        number;
  videoUrl:     string;
  durationSec:  number;
  voiceover:    string;
  onScreenText?: string;
}

/**
 * W3-03 — overrides for the CAC AI-disclosure label that we bake into the
 * FCPXML as a full-duration top-lane title. **Default = enabled** with the
 * wording in `CAC_AI_DISCLOSURE_LABEL`. Disabling is supported only for
 * compliance dry-runs / contractual carve-outs and is logged to PostHog
 * (orchestrator side) — UI never exposes a toggle.
 *
 * `position` is preserved for API compatibility but currently a no-op in
 * FCPXML output (positioning is left to NLE default — most place titles at
 * canvas center, the user can drag them).
 */
export interface AiDisclosureLabelOptions {
  /** Set true to NOT emit the disclosure title. Defaults to false. */
  disabled?: boolean;
  /** Override the rendered text (must be non-empty after trim, else default). */
  text?:     string;
  /** Reserved for future per-position styling. Currently no-op in FCPXML. */
  position?: 'top' | 'bottom';
}

export interface ExportInput {
  topic:        string;
  /** Frame count must equal storyboard frames; orchestrator enforces this. */
  frames:       ReadonlyArray<ExportFrame>;
  /** Drives the FCPXML <format> width/height. */
  resolution:   '480p' | '720p' | '1080p';
  /** Optional override for the script.txt watermark; default in script-text.ts. */
  watermarkOverride?: string;
  /** W3-03 — AI disclosure title controls. Defaults to enabled. */
  aiDisclosureLabel?: AiDisclosureLabelOptions;
}

/**
 * Result of building the FCPXML project file. The XML is a single string
 * suitable for direct file write or zip insertion. `downloadHints` tells
 * downstream code (and users in the readme) what local filenames to map
 * each Seedance URL to so the bundle's relative <media-rep src> paths
 * resolve cleanly inside the NLE.
 */
export interface FcpxmlArtifact {
  /** UTF-8 XML — Apple FCPXML 1.13. */
  fcpxml:        string;
  downloadHints: ReadonlyArray<{
    frameIndex:    number;
    videoUrl:      string;
    localFilename: string;
  }>;
  /** Schema version stamp — helps the bundler pick the right path-rewriter. */
  schemaVersion: 'fcpxml-1.13';
}

/**
 * The full export node output. Persisted to workflow_steps.output_json so the
 * UI can show download buttons immediately + the export node can be reproduced
 * idempotently (same run id → same artifacts).
 */
export interface ExportNodeOutput {
  scriptText:       string;
  fcpxml:           FcpxmlArtifact;
  /** Convenience metadata: total duration in seconds (sum of frame durations). */
  totalDurationSec: number;
  /** YYYY-MM-DDTHH:mm:ssZ — when this export was generated. */
  generatedAt:      string;

  // ─── W3-04 bundle fields ────────────────────────────────────────────────────
  // `bundle` is null when storage isn't configured (dev) OR when the upload
  // was deliberately skipped (`skipBundle: true`). The XML artifact above is
  // always present so the run is never a total loss.
  bundle: {
    /** Pre-signed Supabase Storage URL for the zip. */
    signedUrl:         string;
    /** When the signed URL expires (ISO). */
    expiresAt:         string;
    /** `exports/{tenantId}/{runId}/{filename}` — useful for ops re-signing. */
    objectPath:        string;
    /** Filename inside the bucket — same as suggested zip name. */
    filename:          string;
    /** Size of the zip in bytes. */
    bytes:             number;
    /** Frame indices that failed to download (empty when complete bundle). */
    missingFrames:     ReadonlyArray<number>;
  } | null;
}

// ─── Resolution helpers (FCPXML <format> width/height) ────────────────────────

export interface ResolutionPx { width: number; height: number; ratio: string }

export function resolutionToPx(resolution: ExportInput['resolution']): ResolutionPx {
  // Vertical short-form video — 9:16 throughout MVP-1 (抖音 default).
  switch (resolution) {
    case '480p':  return { width:  720, height: 1280, ratio: '9:16' };
    case '720p':  return { width: 1080, height: 1920, ratio: '9:16' };
    case '1080p': return { width: 1080, height: 1920, ratio: '9:16' };
  }
}
