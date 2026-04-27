// Public API for the v3.0 export layer.
// Application code imports exclusively from this file.

export type {
  AiDisclosureLabelOptions,
  ExportFrame,
  ExportInput,
  ExportNodeOutput,
  FcpxmlArtifact,
  ResolutionPx,
} from './types';
export { resolutionToPx } from './types';

export { buildScriptText, DEFAULT_WATERMARK } from './script-text';
export {
  buildFcpxmlProject,
  framesToFcpxmlTime,
  secondsToFrames,
  AI_DISCLOSURE_TAG,
  type BuildFcpxmlOptions,
  type IdMaker,
} from './fcpxml';
export { buildExportReadme, buildExportReadmeFromInput } from './readme';
export { buildDisclosureSrt, buildNarrationSrt, srtTimestamp } from './srt';
export {
  buildExportBundle,
  BundleError,
  type BundleOptions,
  type BundleResult,
  type ClipFetcher,
} from './bundle';
