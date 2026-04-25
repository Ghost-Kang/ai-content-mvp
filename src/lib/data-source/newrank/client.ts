// D31 (2026-04-25) — 新榜 file-list client.
//
// Single endpoint:  POST {baseUrl}/htkj/file/list
// Auth header:      key: <apiKey>   (note: lowercase, NOT Authorization)
// Body:             { platform, date }
// Response:         { requestId, code, msg, data: [{ url, md5, name }] }
//
// `fetchImpl` is injectable so unit tests can stay 100% offline.

import {
  ALL_PLATFORMS,
  DataSourceError,
  NewrankFile,
  NewrankListRequest,
  NewrankListResult,
  NewrankPlatform,
  classifyServerCode,
} from './types';
import type { NewrankConfig } from './config';

type FetchLike = typeof fetch;

export interface NewrankClientOptions {
  config:     NewrankConfig;
  fetchImpl?: FetchLike;
  /** Override request timeout (default 20s — file-list is fast). */
  timeoutMs?: number;
}

export class NewrankClient {
  private readonly config:    NewrankConfig;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(opts: NewrankClientOptions) {
    this.config    = opts.config;
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  /** POST /htkj/file/list — list trending-data files for one platform-day. */
  async listFiles(req: NewrankListRequest): Promise<NewrankListResult> {
    if (!ALL_PLATFORMS.includes(req.platform)) {
      throw new DataSourceError(
        'BAD_REQUEST',
        'newrank',
        `Unknown platform "${req.platform}". Expected one of dy/ks/xhs/bz.`,
        false,
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.date)) {
      throw new DataSourceError(
        'BAD_REQUEST',
        'newrank',
        `Invalid date "${req.date}". Expected YYYY-MM-DD.`,
        false,
      );
    }

    const url  = `${this.config.baseUrl}/htkj/file/list`;
    const body = JSON.stringify({ platform: req.platform, date: req.date });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'key':          this.config.apiKey,
        },
        body,
        signal: controller.signal,
      });
    } catch (e) {
      const cause = e as { name?: string; message?: string; cause?: unknown };
      if (cause?.name === 'AbortError') {
        throw new DataSourceError(
          'PROVIDER_UNAVAILABLE', 'newrank',
          `Request timed out after ${this.timeoutMs}ms`,
          true, undefined, e,
        );
      }
      throw new DataSourceError(
        'PROVIDER_UNAVAILABLE', 'newrank',
        `Network error: ${cause?.message ?? 'unknown'}`,
        true, undefined, e,
      );
    } finally {
      clearTimeout(timer);
    }

    // Some upstreams 200 with error body; others use HTTP status. Handle both.
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch (e) {
      throw new DataSourceError(
        'PARSE_FAILED', 'newrank',
        `Response was not valid JSON (HTTP ${res.status})`,
        false, res.status, e,
      );
    }

    const envelope = parsed as Partial<{
      requestId: string;
      code:      number;
      msg:       string;       // success path
      message:   string;       // error path (observed empirically 2026-04-25)
      path:      string;       // present on errors
      method:    string;       // present on errors
      data:      unknown;
    }>;

    // If HTTP non-2xx and we couldn't even parse a server-side code, fall
    // back to HTTP status for classification.
    const serverCode = typeof envelope.code === 'number' ? envelope.code : res.status;
    const serverMsg  = envelope.msg ?? envelope.message ?? `code=${serverCode}`;

    if (serverCode !== 200) {
      const { errorCode, retryable } = classifyServerCode(serverCode);
      throw new DataSourceError(
        errorCode, 'newrank',
        `${serverMsg}` +
          (envelope.requestId ? ` [requestId=${envelope.requestId}]` : ''),
        retryable, serverCode,
      );
    }

    if (!Array.isArray(envelope.data)) {
      throw new DataSourceError(
        'PARSE_FAILED', 'newrank',
        `Response.data is not an array; got ${typeof envelope.data}`,
        false, serverCode,
      );
    }

    const files: NewrankFile[] = [];
    for (const [i, item] of envelope.data.entries()) {
      const f = item as Partial<NewrankFile>;
      if (typeof f.url !== 'string' || typeof f.md5 !== 'string' || typeof f.name !== 'string') {
        throw new DataSourceError(
          'PARSE_FAILED', 'newrank',
          `Response.data[${i}] missing url/md5/name`,
          false, serverCode,
        );
      }
      files.push({ url: f.url, md5: f.md5, name: f.name });
    }

    // T+2 contract: data may legitimately not exist yet — empty array is
    // not an error per se, but bubble it up as NOT_READY for the caller
    // to decide whether to retry tomorrow vs treat as fatal. We only flag
    // this when the response is clearly empty (vs the server might
    // legitimately publish 0 files some days; we trust the server here).
    return {
      provider:  'newrank',
      platform:  req.platform,
      date:      req.date,
      requestId: envelope.requestId ?? '',
      files,
      msg:       envelope.msg ?? '',
    };
  }

  /**
   * Convenience: list all 4 platforms for the same date in parallel.
   * Failures per-platform are NOT aggregated — one platform failing
   * shouldn't poison the others. Caller gets `Result<...> | DataSourceError`
   * per platform.
   */
  async listFilesAllPlatforms(date: string): Promise<
    Array<{ platform: NewrankPlatform; result: NewrankListResult | DataSourceError }>
  > {
    return Promise.all(
      ALL_PLATFORMS.map(async (platform) => {
        try {
          const result = await this.listFiles({ platform, date });
          return { platform, result };
        } catch (e) {
          if (e instanceof DataSourceError) return { platform, result: e };
          return {
            platform,
            result: new DataSourceError(
              'UNKNOWN', 'newrank',
              (e as Error)?.message ?? String(e),
              false, undefined, e,
            ),
          };
        }
      }),
    );
  }
}

/** Factory using env-loaded config. Throws if NEWRANK_API_KEY missing. */
export function getDefaultNewrankClient(): NewrankClient {
  // Imported lazily to keep config loading off the hot path of test files
  // that mock the constructor.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadNewrankConfig } = require('./config') as typeof import('./config');
  return new NewrankClient({ config: loadNewrankConfig() });
}
