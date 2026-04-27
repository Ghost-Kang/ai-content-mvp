// D31 (2026-04-25) — 新榜 data source provider types.
//
// Mirrors the shape of `src/lib/video-gen/types.ts` so the same engineers
// can navigate both layers.
//
// Single endpoint:
//   POST https://api.newrank.cn/api/v2/custom/hub/htkj/file/list
//   Header: key: <NEWRANK_API_KEY>
//   Body:   { platform: "dy"|"ks"|"xhs"|"bz", date: "YYYY-MM-DD" }
//
// Response is a list of FILE URLs (not trending JSON). Callers must
// download each file separately to obtain the actual ranking data.

export type NewrankProviderName = 'newrank';

/** Platform code as expected by the API. */
export type NewrankPlatform = 'dy' | 'ks' | 'xhs' | 'bz';

export const PLATFORM_LABEL: Record<NewrankPlatform, string> = {
  dy:  '抖音',
  ks:  '快手',
  xhs: '小红书',
  bz:  'B站',
};

/** Single file entry returned by the list endpoint. */
export interface NewrankFile {
  /** Download URL — likely signed / time-limited; do not cache long-term. */
  url:  string;
  /** MD5 of the file body, for integrity verification after download. */
  md5:  string;
  /** Friendly file name (e.g., "douyin-daily-2026-04-23.csv"). */
  name: string;
}

/** Inputs for `listFiles()`. */
export interface NewrankListRequest {
  platform: NewrankPlatform;
  /** YYYY-MM-DD; T+2 lag — today can fetch up to 2 days ago. */
  date: string;
}

/** Successful list response, normalized for caller convenience. */
export interface NewrankListResult {
  provider:  NewrankProviderName;
  platform:  NewrankPlatform;
  date:      string;
  requestId: string;
  files:     NewrankFile[];
  /** Server-side message — usually 'success' on 200. */
  msg: string;
}

/**
 * Error taxonomy. Mirrors VideoGenErrorCode shape so the same retry
 * policy (NodeRunner / spend cap) can be reused.
 *
 * Source codes:
 *   200      → success (no error)
 *   401      → AUTH_FAILED (key invalid / expired)
 *   403      → AUTH_FAILED (endpoint disabled for this account)
 *   404      → BAD_REQUEST (typo in endpoint path; should never happen
 *               in production code, only during integration)
 *   405      → BAD_REQUEST (wrong HTTP method; client bug)
 *   429      → RATE_LIMITED (throttled — 200/min ceiling)
 *   502/503  → PROVIDER_UNAVAILABLE (transient backend issue)
 *   10001    → BAD_REQUEST (missing required param)
 *   10002    → BAD_REQUEST (invalid param value)
 *   network  → PROVIDER_UNAVAILABLE (DNS / TCP / TLS)
 */
export type DataSourceErrorCode =
  | 'AUTH_FAILED'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'NOT_READY'         // valid request but data not yet available for that date
  | 'PARSE_FAILED'      // response shape didn't match contract
  | 'UNKNOWN';

export class DataSourceError extends Error {
  constructor(
    public code:      DataSourceErrorCode,
    public provider:  NewrankProviderName,
    message:          string,
    public retryable: boolean,
    /** Underlying server-side code if any (401/403/429/...). */
    public serverCode?: number,
    public cause?:    unknown,
  ) {
    super(message);
    this.name = 'DataSourceError';
  }
}

/** Map server-side numeric code → our taxonomy + retry decision. */
export function classifyServerCode(code: number): {
  errorCode: DataSourceErrorCode;
  retryable: boolean;
} {
  switch (code) {
    case 401:
    case 403:   return { errorCode: 'AUTH_FAILED',          retryable: false };
    case 404:
    case 405:
    case 10001:
    case 10002: return { errorCode: 'BAD_REQUEST',          retryable: false };
    case 429:   return { errorCode: 'RATE_LIMITED',         retryable: true  };
    case 502:
    case 503:   return { errorCode: 'PROVIDER_UNAVAILABLE', retryable: true  };
    default:    return { errorCode: 'UNKNOWN',              retryable: false };
  }
}

export const ALL_PLATFORMS: NewrankPlatform[] = ['dy', 'ks', 'xhs', 'bz'];
