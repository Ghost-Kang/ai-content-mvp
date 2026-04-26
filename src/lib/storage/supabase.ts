// W3-04-V3 — Supabase Storage server-side adapter.
//
// SERVER-ONLY. Uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS — never
// import this from client code. We isolate it in `lib/storage/` so the lint
// surface is small enough to audit by eye.
//
// API surface kept tiny on purpose:
//   - `getStorage()`        → singleton client OR null (if service role not set)
//   - `uploadExportBundle`  → PUT bundle bytes + return signed URL
//   - `EXPORT_BUNDLE_BUCKET` → bucket name constant
//
// The bucket itself is created by the operator (see scripts/probe-storage.ts).
// Auto-creation requires a separate "Service > Storage > buckets" RPC and we
// don't want code paths that mutate org-level config implicitly.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const EXPORT_BUNDLE_BUCKET = 'workflow-exports';

/**
 * Default signed-URL TTL in seconds. 7 days = long enough for users to
 * forget about the run and come back, short enough that signed URLs don't
 * become quasi-permanent. Tune via `WORKFLOW_EXPORT_SIGNED_URL_TTL_SEC`.
 */
const DEFAULT_SIGNED_URL_TTL_SEC = 7 * 24 * 60 * 60;

let _cached: SupabaseClient | null | undefined; // undefined = not yet checked

/**
 * Returns the service-role client, or null if the necessary env vars are
 * missing. The export node uses this to gracefully degrade in dev (no
 * upload, output.bundleUrl=null) instead of crashing the run.
 */
export function getStorage(): SupabaseClient | null {
  if (_cached !== undefined) return _cached;

  const url     = process.env.SUPABASE_URL;
  const srvKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !srvKey) {
    _cached = null;
    return null;
  }

  _cached = createClient(url, srvKey, {
    auth: {
      // Server-side: no session persistence, no auto-refresh. The service
      // role key is its own auth.
      persistSession:   false,
      autoRefreshToken: false,
    },
  });
  return _cached;
}

/** Test seam — clears the cached client so unit tests can flip env vars. */
export function _resetStorageForTests(): void {
  _cached = undefined;
}

// ─── Upload + sign ────────────────────────────────────────────────────────────

export interface UploadBundleArgs {
  tenantId:       string;
  runId:          string;
  bundle:         Uint8Array;
  /** Object name (from BundleResult.suggestedName) — kept inside the runId folder. */
  filename:       string;
  /** Override TTL in seconds. Default 7 days. */
  signedUrlTtlSec?: number;
}

export interface UploadBundleResult {
  /** `exports/{tenantId}/{runId}/{filename}` */
  objectPath:    string;
  /** Pre-signed download URL — directly usable from a browser. */
  signedUrl:     string;
  /** ISO timestamp when the signed URL expires. */
  expiresAt:     string;
  /** Size in bytes (echoed back so callers can persist for ops). */
  bytes:         number;
}

export class StorageError extends Error {
  constructor(
    public code: 'NO_CLIENT' | 'UPLOAD_FAILED' | 'SIGN_FAILED',
    message:    string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Idempotent: existing object is overwritten via `upsert: true`. The server
 * does NOT delete prior bundles — old runId/filename combos stay until
 * manual cleanup or a future TTL job. (Storage costs ~$0.021/GB/mo on
 * Supabase free; a 30 MB bundle ≈ $0.0006/mo, negligible.)
 */
export async function uploadExportBundle(args: UploadBundleArgs): Promise<UploadBundleResult> {
  const sb = getStorage();
  if (!sb) {
    throw new StorageError(
      'NO_CLIENT',
      'Supabase storage is not configured (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing). ' +
      'ExportNodeRunner will skip the upload and leave bundleUrl=null.',
    );
  }

  const objectPath = `exports/${args.tenantId}/${args.runId}/${args.filename}`;
  const envTtl = Number(process.env.WORKFLOW_EXPORT_SIGNED_URL_TTL_SEC);
  const ttl = args.signedUrlTtlSec
    ?? (Number.isFinite(envTtl) && envTtl > 0 ? envTtl : DEFAULT_SIGNED_URL_TTL_SEC);

  const upRes = await sb.storage
    .from(EXPORT_BUNDLE_BUCKET)
    .upload(objectPath, args.bundle, {
      contentType: 'application/zip',
      upsert:      true,
    });
  if (upRes.error) {
    throw new StorageError(
      'UPLOAD_FAILED',
      `upload failed: ${upRes.error.message}`,
      upRes.error,
    );
  }

  const signRes = await sb.storage
    .from(EXPORT_BUNDLE_BUCKET)
    .createSignedUrl(objectPath, ttl);
  if (signRes.error || !signRes.data?.signedUrl) {
    throw new StorageError(
      'SIGN_FAILED',
      `sign failed: ${signRes.error?.message ?? 'no signedUrl returned'}`,
      signRes.error,
    );
  }

  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  return {
    objectPath,
    signedUrl: signRes.data.signedUrl,
    expiresAt,
    bytes:     args.bundle.byteLength,
  };
}
