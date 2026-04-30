import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema';

// Connection string must include ?sslmode=require for Supabase
function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

// Singleton for server-side use (Next.js hot-reload safe)
declare global {
  // eslint-disable-next-line no-var
  var __db: ReturnType<typeof drizzle> | undefined;
}

// Audit #6 (2026-04-30): cap the per-instance pool. Vercel serverless
// hands each lambda its own pool, so the multiplier across cold instances
// can blow Supabase max_connections fast. `max: 1` is the recommended
// shape for serverless + pgbouncer transaction pooling. Override via
// DB_POOL_MAX for long-running scripts (probes, migrations).
function poolMax(): number {
  const raw = Number(process.env.DB_POOL_MAX);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function createDb() {
  const connectionString = requireEnv('DATABASE_URL');
  const client = postgres(connectionString, {
    prepare: false,
    max: poolMax(),
  });
  return drizzle(client, { schema });
}

export const db = globalThis.__db ?? createDb();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__db = db;
}

// ─── Tenant-scoped transaction helper (audit #1, 2026-04-30) ─────────────────
//
// Opt-in helper for the RLS cutover. Once Supabase is migrated to a non-
// superuser DB role (see docs/RLS-CUTOVER.md), call this around every
// tenant-scoped read/write so RLS policies see the right tenant_id:
//
//   await withTenant(ctx.tenantId, async (tx) => {
//     return tx.select().from(workflowRuns).where(...);
//   });
//
// Today (still on `postgres` superuser), the SET LOCAL is a no-op for
// authorization but cheap (~0.1 ms) and the wrapper is shape-stable, so
// adopting it incrementally is safe. The day we flip the role, every
// caller already wrapped becomes RLS-enforced for free.
//
// IMPORTANT: only use uuid for tenantId — quoted directly into SET LOCAL
// (postgres-js parameterizes within a SELECT, but SET LOCAL doesn't take
// $1 params reliably across pool drivers). The `validateTenantId` guard
// rejects anything that isn't a UUIDv4-shaped string so injection isn't
// possible even if a caller passes user input by mistake.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateTenantId(tenantId: string): string {
  if (!UUID_RE.test(tenantId)) {
    throw new Error(`Invalid tenantId for SET LOCAL: ${tenantId.slice(0, 8)}…`);
  }
  return tenantId;
}

export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  const safeId = validateTenantId(tenantId);
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.tenant_id = '${safeId}'`));
    return fn(tx);
  });
}

export * from './schema';
