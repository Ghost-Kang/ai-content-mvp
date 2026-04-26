// W3-04-V3 — Export bundle builder.
//
// Takes the W3-01/W3-02 in-memory artifacts (script.txt + project.fcpxml +
// downloadHints[]) and produces a single zip file (Uint8Array) ready to drop
// on Storage.
//
// Layout inside the zip (kept flat — JianYing/CapCut Pro 的 FCPXML import
// flow resolves <media-rep src> relative to the .fcpxml file's directory):
//
//     export-{topicSlug}-{yyyymmdd}/
//       script.txt
//       project.fcpxml          ← path-rewritten so <media-rep src> → ./clips/frame-NN.mp4
//       README.md
//       clips/
//         frame-01.mp4
//         frame-02.mp4
//         ...
//
// Path rewriting matters: the W3-02 fcpxml has Seedance HTTPS URLs as
// <media-rep src>. After bundling local clips, we rewrite those to
// `./clips/{localFilename}` so NLEs that resolve the relative path find
// the clips without the user manually re-linking.
//
// Network: every clip is fetched via the injected `fetcher` (default
// = global fetch). Tests pass a Map-backed mock so the suite is fully
// offline + deterministic.
//
// Failure mode: any clip fetch failure → throw `BundleError` (caller decides
// whether to retry, partial-bundle, or fall back to URL-in-fcpxml mode).

import JSZip from 'jszip';
import {
  buildFcpxmlProject,
  buildScriptText,
  type ExportInput,
} from './';
import { buildExportReadmeFromInput } from './readme';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Minimal contract the bundler needs to GET clips. Mirrors
 * `(input: string) => Promise<Response>` so global `fetch` is a drop-in.
 */
export type ClipFetcher = (url: string) => Promise<Response>;

export interface BundleOptions {
  /** Clip downloader. Default = global fetch. */
  fetcher?: ClipFetcher;
  /** Inject for deterministic timestamps in readme. */
  now?: Date;
  /**
   * Per-clip fetch timeout (ms). Seedance CDN rarely > 5s; default 30s
   * gives generous slack for slow networks while still catching dead URLs.
   */
  fetchTimeoutMs?: number;
  /**
   * If true, clip fetches that fail are logged + skipped (the zip still
   * lands but missing clips are listed in the readme). Default false —
   * MVP-1 prefers hard-fail so callers don't ship broken bundles silently.
   */
  allowPartial?: boolean;
}

export interface BundleResult {
  /** Zip bytes (UTF-8 inside, DEFLATE compression). */
  bytes:           Uint8Array;
  /** Suggested object name (e.g. `export-saas-trial-20260424.zip`). */
  suggestedName:   string;
  /** Final per-clip filename map — useful for the orchestrator log. */
  clipFilenames:   ReadonlyArray<string>;
  /** Frames that failed to download (empty unless allowPartial=true). */
  missingFrames:   ReadonlyArray<{ index: number; videoUrl: string; reason: string }>;
  /** Total uncompressed bytes — for cost/quota observability. */
  uncompressedBytes: number;
  /** Compressed (final) bytes — same as bytes.length, returned for clarity. */
  compressedBytes:   number;
}

export class BundleError extends Error {
  constructor(public code: 'FETCH_FAILED' | 'INPUT_INVALID', message: string, public cause?: unknown) {
    super(message);
    this.name = 'BundleError';
  }
}

// ─── Internals ────────────────────────────────────────────────────────────────

/**
 * Slugify a topic for filenames — pinyin-free best effort: keep ASCII
 * alphanumerics, replace anything else with '-', collapse runs, trim, cap.
 * For Chinese-only topics we fall back to a hash-based stub so the filename
 * stays predictable even when no ASCII survives.
 */
function topicSlug(topic: string): string {
  const cleaned = topic
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 32);
  if (cleaned.length >= 4) return cleaned;
  // Hash fallback — deterministic, 8 hex chars.
  let h = 0;
  for (let i = 0; i < topic.length; i++) {
    h = (h * 31 + topic.charCodeAt(i)) | 0;
  }
  return `topic-${(h >>> 0).toString(16).padStart(8, '0').slice(0, 8)}`;
}

function dateStamp(d: Date): string {
  const y  = d.getUTCFullYear();
  const m  = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

async function fetchWithTimeout(
  url:        string,
  fetcher:    ClipFetcher,
  timeoutMs:  number,
): Promise<Response> {
  // AbortController is supported in tsx/Node ≥ 20 + we constrain Node 25.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Note: not all Response shapes support the signal at call site (mocks
    // in tests don't), so we wrap the fetcher in a Promise.race as a
    // belt-and-braces guard.
    return await Promise.race([
      fetcher(url),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error(`fetch timeout after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rewrite each `<media-rep src="...">` URL in the FCPXML to the local
 * relative path inside the bundle (`./clips/frame-NN.mp4`). The match is
 * by frame index — we use the asset's `name="frame-NN"` attribute as the
 * stable join key (set by buildFcpxmlProject), NOT the URL itself (URLs
 * may differ after the user retries individual clips).
 *
 * String-rewrite (not full XML parse) — FCPXML structure is well-known and
 * the `<asset name="frame-NN" ... format="..."><media-rep .../>` pattern is
 * deterministic. A full XML parser would be ~30KB extra dep for no benefit.
 */
function rewriteFcpxmlPaths(
  fcpxml: string,
  hints:  ReadonlyArray<{ frameIndex: number; localFilename: string }>,
): string {
  const byFrameLabel = new Map(
    hints.map((h) => [`frame-${String(h.frameIndex).padStart(2, '0')}`, h.localFilename]),
  );
  // Match each <asset name="frame-NN" ...><media-rep ... src="OLD" .../>...</asset>
  // and rewrite the src. Anchor on the `name="frame-NN"` token to avoid
  // accidentally rewriting any unrelated asset.
  return fcpxml.replace(
    /<asset\b([^>]*?)\bname="(frame-\d+)"([^>]*)>([\s\S]*?)<\/asset>/g,
    (whole, preName, frameLabel, postName, inner) => {
      const local = byFrameLabel.get(frameLabel);
      if (!local) return whole;
      const newInner = inner.replace(
        /(<media-rep\b[^/>]*?\bsrc=")([^"]*)(")/,
        (_m: string, p1: string, _p2: string, p3: string) => `${p1}./clips/${local}${p3}`,
      );
      return `<asset${preName} name="${frameLabel}"${postName}>${newInner}</asset>`;
    },
  );
}

// ─── Public builder ───────────────────────────────────────────────────────────

const SCRIPT_TEXT_NAME = 'script.txt';
const FCPXML_NAME      = 'project.fcpxml';
const README_NAME      = 'README.md';

export async function buildExportBundle(
  input:   ExportInput,
  opts:    BundleOptions = {},
): Promise<BundleResult> {
  if (input.frames.length === 0) {
    throw new BundleError('INPUT_INVALID', 'buildExportBundle: input.frames is empty');
  }

  const fetcher        = opts.fetcher        ?? globalThis.fetch.bind(globalThis);
  const now            = opts.now            ?? new Date();
  const fetchTimeoutMs = opts.fetchTimeoutMs ?? 30_000;
  const allowPartial   = opts.allowPartial   ?? false;

  // 1. Build the in-memory artifacts.
  const scriptText = buildScriptText(input, now);
  const fcpxmlArt  = buildFcpxmlProject(input, { now });

  // 2. Fetch each clip — sequential to keep CDN concurrency + memory bounded.
  // (Storyboards are typically 5-15 frames; parallel would barely save time
  //  and would mask 429s.)
  const clipFilenames: string[] = [];
  const clipBuffers:   Array<{ name: string; bytes: Uint8Array }> = [];
  const missingFrames: BundleResult['missingFrames'][number][] = [];
  let uncompressed = 0;

  for (const hint of fcpxmlArt.downloadHints) {
    try {
      const res = await fetchWithTimeout(hint.videoUrl, fetcher, fetchTimeoutMs);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim());
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      clipBuffers.push({ name: hint.localFilename, bytes: buf });
      clipFilenames.push(hint.localFilename);
      uncompressed += buf.byteLength;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      if (!allowPartial) {
        throw new BundleError(
          'FETCH_FAILED',
          `frame ${hint.frameIndex} download failed (${hint.videoUrl}): ${reason}`,
          e,
        );
      }
      missingFrames.push({ index: hint.frameIndex, videoUrl: hint.videoUrl, reason });
      // Don't add a placeholder — readme will list missing frames.
    }
  }

  // 3. Rewrite fcpxml paths so NLEs find the local clips we just packed.
  const rewrittenFcpxml = rewriteFcpxmlPaths(fcpxmlArt.fcpxml, fcpxmlArt.downloadHints);

  // 4. Generate the README using the actual clip filenames included.
  const readme = buildExportReadmeFromInput({
    input,
    generatedAt:    now,
    scriptTextName: SCRIPT_TEXT_NAME,
    fcpxmlName:     FCPXML_NAME,
    clipFilenames,
  });

  // 5. Assemble the zip.
  const zip = new JSZip();
  zip.file(SCRIPT_TEXT_NAME, scriptText);
  zip.file(FCPXML_NAME,      rewrittenFcpxml);
  zip.file(README_NAME,      readme);
  uncompressed +=
      Buffer.byteLength(scriptText, 'utf8')
    + Buffer.byteLength(rewrittenFcpxml, 'utf8')
    + Buffer.byteLength(readme, 'utf8');

  const clipsFolder = zip.folder('clips');
  if (!clipsFolder) {
    // Belt-and-braces: JSZip returns null only when the parent is invalid.
    throw new BundleError('INPUT_INVALID', 'failed to create clips/ folder');
  }
  for (const c of clipBuffers) {
    clipsFolder.file(c.name, c.bytes);
  }

  const bytes = await zip.generateAsync({
    type:               'uint8array',
    compression:        'DEFLATE',
    compressionOptions: { level: 6 }, // mid — mp4 already compressed, level=9 wastes CPU
  });

  return {
    bytes,
    suggestedName:     `export-${topicSlug(input.topic)}-${dateStamp(now)}.zip`,
    clipFilenames,
    missingFrames,
    uncompressedBytes: uncompressed,
    compressedBytes:   bytes.byteLength,
  };
}
