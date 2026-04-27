// D31 (2026-04-25) — 新榜 data source provider barrel.

export type {
  NewrankPlatform,
  NewrankFile,
  NewrankListRequest,
  NewrankListResult,
  DataSourceErrorCode,
  NewrankProviderName,
} from './types';
export {
  PLATFORM_LABEL,
  ALL_PLATFORMS,
  DataSourceError,
  classifyServerCode,
} from './types';
export { NewrankClient, getDefaultNewrankClient } from './client';
export type { NewrankConfig } from './config';
export { loadNewrankConfig, isNewrankConfigured } from './config';
export type { NewrankAvroRecord, DecodeResult } from './avro-reader';
export { decodeNewrankAvroBuffer } from './avro-reader';
export type { NormalizedTrendingItem } from './normalize';
export { normalizeTrendingRecord, normalizeTrendingRecords } from './normalize';
