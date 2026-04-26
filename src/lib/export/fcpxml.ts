// W3-02-V3 — Final Cut Pro X / Apple FCPXML 1.13 project serializer.
//
// Replaces the earlier `jianying.ts` JSON-draft path. Per JianYing's official
// import documentation the supported interchange formats are FCPXML and
// `.prproj` only — the JSON path was an undocumented hack that broke on
// JianYing ≥ 5.x (encrypted drafts).
//
// FCPXML 1.13 reference:
//   https://developer.apple.com/documentation/professional_video_applications/fcpxml_reference
//
// MVP-1 fidelity cuts (documented):
//   - Single fixed frame rate: 30fps progressive (frameDuration=100/3000s).
//     Seedance returns variable-second clips; we round each to the nearest
//     30fps frame. Per-clip rounding error ≤ 1/30s, acceptable.
//   - Title effect ref points at Apple stock "Basic Title". Third-party NLEs
//     (剪映 / CapCut Pro / DaVinci) typically substitute their own title
//     implementation but preserve the inner text + style payload.
//   - <media-rep src> is set to the Seedance HTTPS URL. The bundle builder
//     rewrites it to ./clips/frame-NN.mp4 after pre-fetching the clips.
//
// PURE BUILDER — no IO, no clock side effects (except optional `now` param).
// All randomness is supplied via the injected `idMaker` so tests are stable.

import { CAC_AI_DISCLOSURE_LABEL } from '../cac-label';
import { resolutionToPx, type ExportInput } from './types';

// Marker on disclosure-related elements (effect names + title `name` attr) so
// audit tools / future transcoders / tests can locate them without parsing
// content. NEVER change — it's part of the compliance audit trail.
export const AI_DISCLOSURE_TAG = 'cac-disclosure';

// Apple stock Basic Title effect UID. Most NLEs accept it; if not, the inner
// <text> + <text-style-def> survives import and the user can re-skin it.
const BASIC_TITLE_EFFECT_UID =
  '.../Titles.localized/Basic Text.localized/Basic Title.localized/Basic Title.moti';

// 30fps progressive — frameDuration = 1/30s in canonical FCPX form.
const FRAME_RATE        = 30;
const FRAME_NUMERATOR   = 100;
const FRAME_DENOMINATOR = 3000;

// ─── Stable id generator ──────────────────────────────────────────────────────

export interface IdMaker { next(prefix: string): string }

function defaultIdMaker(): IdMaker {
  // FCPXML ids are scoped to the document; a counter is sufficient.
  let n = 0;
  return { next: (prefix) => `${prefix}${++n}` };
}

// ─── Time conversion ──────────────────────────────────────────────────────────

/** Round seconds to nearest 30fps frame count. Always ≥ 1 to keep clips visible. */
export function secondsToFrames(sec: number): number {
  return Math.max(1, Math.round(sec * FRAME_RATE));
}

/** Convert frame count → FCPXML rational time string (`<num>/3000s`). */
export function framesToFcpxmlTime(frames: number): string {
  if (frames === 0) return '0s';
  return `${frames * FRAME_NUMERATOR}/${FRAME_DENOMINATOR}s`;
}

// ─── XML escape ───────────────────────────────────────────────────────────────

function escapeAttr(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeText(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface FcpxmlArtifact {
  /** UTF-8 XML string. Suitable for direct file write or zip insertion. */
  fcpxml:        string;
  /**
   * Per-frame instructions: download `videoUrl` to `localFilename` next to
   * the .fcpxml, then NLEs that resolve relative `media-rep src` paths
   * (剪映 / FCPX both do) will pick up the clips automatically.
   */
  downloadHints: ReadonlyArray<{
    frameIndex:    number;
    videoUrl:      string;
    localFilename: string;
  }>;
  schemaVersion: 'fcpxml-1.13';
}

export interface BuildFcpxmlOptions {
  /** Inject for deterministic tests. Default = counter-backed. */
  idMaker?: IdMaker;
  /** Inject the "now" clock. Currently unused by the serializer (no embedded
   *  timestamps in FCPXML body) but kept for future audit metadata. */
  now?:     Date;
}

// ─── Public builder ───────────────────────────────────────────────────────────

export function buildFcpxmlProject(
  input: ExportInput,
  opts:  BuildFcpxmlOptions = {},
): FcpxmlArtifact {
  if (input.frames.length === 0) {
    throw new Error('buildFcpxmlProject: input.frames is empty');
  }

  const ids    = opts.idMaker ?? defaultIdMaker();
  const canvas = resolutionToPx(input.resolution);

  // ── 1. Frame-align each clip duration + build cumulative offsets ───────────
  const frameCounts = input.frames.map((f) => secondsToFrames(f.durationSec));
  const totalFrames = frameCounts.reduce((s, n) => s + n, 0);
  const offsets:    number[] = [];
  {
    let acc = 0;
    for (const fc of frameCounts) {
      offsets.push(acc);
      acc += fc;
    }
  }

  // ── 2. Allocate stable resource ids ────────────────────────────────────────
  const formatId      = ids.next('r');
  const titleEffectId = ids.next('r');
  const assetIds      = input.frames.map(() => ids.next('r'));

  // ── 3. <resources> block ───────────────────────────────────────────────────
  const formatXml =
    `    <format id="${formatId}" name="FFVideoFormatVertical${canvas.height}p${FRAME_RATE}" ` +
    `frameDuration="${FRAME_NUMERATOR}/${FRAME_DENOMINATOR}s" ` +
    `width="${canvas.width}" height="${canvas.height}" colorSpace="1-1-1 (Rec. 709)"/>`;

  const effectXml =
    `    <effect id="${titleEffectId}" name="Basic Title" uid="${escapeAttr(BASIC_TITLE_EFFECT_UID)}"/>`;

  const assetXmls = input.frames.map((f, i) => {
    const dur  = framesToFcpxmlTime(frameCounts[i]);
    const name = `frame-${String(f.index).padStart(2, '0')}`;
    return [
      `    <asset id="${assetIds[i]}" name="${escapeAttr(name)}" start="0s" duration="${dur}" ` +
        `hasVideo="1" format="${formatId}" videoSources="1">`,
      `      <media-rep kind="original-media" src="${escapeAttr(f.videoUrl)}"/>`,
      `    </asset>`,
    ].join('\n');
  });

  const resourcesXml = ['  <resources>', formatXml, effectXml, ...assetXmls, '  </resources>'].join('\n');

  // ── 4. <spine> + per-clip overlays ─────────────────────────────────────────
  // User on-screen text → lane 1 attached to the matching asset-clip.
  // AI disclosure (W3-03) → lane 2 attached to the FIRST asset-clip with
  // duration spanning the whole sequence (FCPXML allows connected clips on a
  // lane to extend beyond their parent's duration).
  const disclosureCfg = input.aiDisclosureLabel ?? {};
  const totalDurStr   = framesToFcpxmlTime(totalFrames);

  const spineEntries: string[] = input.frames.map((f, i) => {
    const offset   = framesToFcpxmlTime(offsets[i]);
    const duration = framesToFcpxmlTime(frameCounts[i]);
    const name     = `frame-${String(f.index).padStart(2, '0')}`;

    const overlays: string[] = [];

    // (a) User on-screen text — only if non-empty
    const userText = (f.onScreenText ?? '').trim();
    if (userText.length > 0) {
      const styleId = ids.next('ts');
      overlays.push(
        [
          `        <title ref="${titleEffectId}" lane="1" offset="0s" duration="${duration}" ` +
            `name="${escapeAttr(`字幕 ${f.index}`)}">`,
          `          <text>`,
          `            <text-style ref="${styleId}">${escapeText(userText)}</text-style>`,
          `          </text>`,
          `          <text-style-def id="${styleId}">`,
          `            <text-style font="PingFang SC" fontSize="60" fontColor="1 1 1 1" alignment="center"/>`,
          `          </text-style-def>`,
          `        </title>`,
        ].join('\n'),
      );
    }

    // (b) AI disclosure — once, on the FIRST clip, full sequence duration
    if (i === 0 && disclosureCfg.disabled !== true) {
      const text     = ((disclosureCfg.text ?? '').trim() || CAC_AI_DISCLOSURE_LABEL);
      const styleId  = ids.next('ts');
      overlays.push(
        [
          `        <title ref="${titleEffectId}" lane="2" offset="0s" duration="${totalDurStr}" ` +
            `name="${escapeAttr(AI_DISCLOSURE_TAG)}">`,
          `          <text>`,
          `            <text-style ref="${styleId}">${escapeText(text)}</text-style>`,
          `          </text>`,
          `          <text-style-def id="${styleId}">`,
          `            <text-style font="PingFang SC" fontSize="40" fontColor="1 1 1 1" ` +
            `alignment="center" backgroundColor="0 0 0 0.63"/>`,
          `          </text-style-def>`,
          `        </title>`,
        ].join('\n'),
      );
    }

    if (overlays.length === 0) {
      return `      <asset-clip ref="${assetIds[i]}" offset="${offset}" duration="${duration}" ` +
        `name="${escapeAttr(name)}" format="${formatId}"/>`;
    }
    return [
      `      <asset-clip ref="${assetIds[i]}" offset="${offset}" duration="${duration}" ` +
        `name="${escapeAttr(name)}" format="${formatId}">`,
      ...overlays,
      `      </asset-clip>`,
    ].join('\n');
  });

  // ── 5. Assemble full document ──────────────────────────────────────────────
  const projectName = (input.topic.trim() || 'Untitled');
  const eventName   = `AI 短视频 — ${projectName}`;

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE fcpxml>`,
    `<fcpxml version="1.13">`,
    resourcesXml,
    `  <library>`,
    `    <event name="${escapeAttr(eventName)}">`,
    `      <project name="${escapeAttr(projectName)}">`,
    `        <sequence format="${formatId}" duration="${totalDurStr}" tcStart="0s" tcFormat="NDF" ` +
      `audioLayout="stereo" audioRate="48k">`,
    `          <spine>`,
    ...spineEntries,
    `          </spine>`,
    `        </sequence>`,
    `      </project>`,
    `    </event>`,
    `  </library>`,
    `</fcpxml>`,
    '',
  ].join('\n');

  // ── 6. Per-clip download hints (paired with bundle.ts path rewrite) ────────
  const downloadHints = input.frames.map((f) => ({
    frameIndex:    f.index,
    videoUrl:      f.videoUrl,
    localFilename: `frame-${String(f.index).padStart(2, '0')}.mp4`,
  }));

  return {
    fcpxml:        xml,
    downloadHints,
    schemaVersion: 'fcpxml-1.13',
  };
}
