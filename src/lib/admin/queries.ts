// W4-07-V3 — Admin dashboard SQL aggregates.
//
// All queries scan ACROSS tenants (admin = global view). They run with the
// service-role connection (`db` in @/db, no per-request JWT bound) so RLS
// is intentionally bypassed. The auth gate is the page-level `isAdminUser`
// check — never call these from a tenant-scoped route.
//
// Design notes:
//   - All windows are computed in SQL (NOW() - INTERVAL '...') so the
//     server clock is the source of truth — no JS Date drift.
//   - Currency stays in fen (整数 cents). Page layer formats to ¥X.YY.
//   - Every aggregate returns a deterministic shape even when its source
//     table is empty (zeros / empty arrays) so the dashboard never throws.
//   - We compute month spend via SUM on monthly_usage rather than
//     re-aggregating workflow_runs to match what the spend-cap check sees
//     (consistency > minor staleness).
//
// Performance: 4 queries hit indexed columns (created_at, tenant_id+status,
// node_type+status, month_key). On a fresh DB the whole bundle runs ≪ 50ms.
// At 10k runs / month it's still < 200ms — no need for a PG materialized view
// until we have multiple admins hammering the page. We still wrap
// `fetchAdminSummary` in Next.js `unstable_cache` (60s) so rapid refreshes do
// not multiply identical aggregate queries (W4-07 后续 #3 "cache" 路径).

import { unstable_cache } from 'next/cache';
import { sql, desc, eq } from 'drizzle-orm';
import { db, complianceAuditLogs, users } from '@/db';
import { ADMIN_SUMMARY_CACHE_TAG } from './cache-tags';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type WorkflowStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
export type NodeType = 'topic' | 'script' | 'storyboard' | 'video' | 'export';

export interface RunStats7d {
  /** Total runs created in the last 7 days. */
  total:        number;
  /** Per-status counts. Missing statuses are 0. */
  byStatus:     Record<WorkflowStatus, number>;
  /** done / (done + failed + cancelled). NaN-safe → 0 when terminalCount = 0. */
  successRate:  number;
  /** Sum of done + failed + cancelled (the denominator for successRate). */
  terminalCount: number;
}

export interface NodeLatencyRow {
  nodeType:  NodeType;
  count:     number;
  avgMs:     number;
  p50Ms:     number;
  p95Ms:     number;
}

export interface ActiveUsers {
  d7:  number;
  d30: number;
}

export interface MonthSpend {
  /** YYYY-MM (UTC, matches workflow spend-cap convention). */
  monthKey:    string;
  totalFen:    number;
  videoCount:  number;
  /** Distinct users who triggered a billable action this month. */
  userCount:   number;
}

export interface ComplianceAuditRow {
  id:         string;
  createdAt:  string;
  action:     string;
  runId:      string;
  tenantId:   string;
  userId:     string;
  userEmail:  string;
  detail:     Record<string, unknown>;
}

export interface AdminSummary {
  runs:            RunStats7d;
  latencyByNode:   NodeLatencyRow[];
  activeUsers:     ActiveUsers;
  monthSpend:      MonthSpend;
  complianceLog:  ComplianceAuditRow[];
  /** ISO timestamp the snapshot was assembled (server clock). */
  generatedAt:     string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const ALL_STATUSES: WorkflowStatus[] = ['pending', 'running', 'done', 'failed', 'cancelled'];
const NODE_ORDER: NodeType[] = ['topic', 'script', 'storyboard', 'video', 'export'];

/** YYYY-MM in UTC. Mirrors `currentMonthKey` in spend-cap.ts. */
export function currentMonthKeyUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

// ─── Queries ───────────────────────────────────────────────────────────────────

/**
 * Last-7-day run aggregates. One scan over workflow_runs filtered on
 * `created_at >= NOW() - INTERVAL '7 days'`. Result shape is deterministic
 * (every status key present, even if 0).
 */
export async function fetchRunStats7d(): Promise<RunStats7d> {
  const rows = await db.execute<{ status: WorkflowStatus; cnt: string }>(sql`
    SELECT status::text AS status, COUNT(*)::bigint AS cnt
    FROM workflow_runs
    WHERE created_at >= NOW() - INTERVAL '7 days'
    GROUP BY status
  `);

  const byStatus = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {} as Record<WorkflowStatus, number>);

  let total = 0;
  for (const row of rows as unknown as Array<{ status: WorkflowStatus; cnt: string }>) {
    const n = Number(row.cnt) || 0;
    if (ALL_STATUSES.includes(row.status)) byStatus[row.status] = n;
    total += n;
  }

  const terminalCount = byStatus.done + byStatus.failed + byStatus.cancelled;
  const successRate = terminalCount > 0 ? byStatus.done / terminalCount : 0;

  return { total, byStatus, successRate, terminalCount };
}

/**
 * Per-node-type latency over the last 7 days. Only counts steps that REACHED
 * `done` (failed steps may have wildly skewed timings or null completed_at).
 * PERCENTILE_CONT is exact in PG (vs the approximate variant) — fine for the
 * volumes we're talking about.
 */
export async function fetchNodeLatency7d(): Promise<NodeLatencyRow[]> {
  const rows = await db.execute<{
    node_type: NodeType;
    cnt:       string;
    avg_ms:    string | null;
    p50_ms:    string | null;
    p95_ms:    string | null;
  }>(sql`
    SELECT
      node_type::text AS node_type,
      COUNT(*)::bigint AS cnt,
      AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::float AS avg_ms,
      PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::float AS p50_ms,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::float AS p95_ms
    FROM workflow_steps
    WHERE status = 'done'
      AND started_at IS NOT NULL
      AND completed_at IS NOT NULL
      AND completed_at >= NOW() - INTERVAL '7 days'
    GROUP BY node_type
  `);

  const byNode = new Map<NodeType, NodeLatencyRow>();
  for (const row of rows as unknown as Array<{
    node_type: NodeType;
    cnt:       string;
    avg_ms:    string | null;
    p50_ms:    string | null;
    p95_ms:    string | null;
  }>) {
    byNode.set(row.node_type, {
      nodeType: row.node_type,
      count:    Number(row.cnt) || 0,
      avgMs:    Number(row.avg_ms ?? 0) || 0,
      p50Ms:    Number(row.p50_ms ?? 0) || 0,
      p95Ms:    Number(row.p95_ms ?? 0) || 0,
    });
  }

  // Render in canonical pipeline order with zero-fill for missing nodes so
  // the UI grid stays aligned (4 columns even when 1 hasn't run this week).
  return NODE_ORDER.map((nodeType) =>
    byNode.get(nodeType) ?? {
      nodeType,
      count: 0,
      avgMs: 0,
      p50Ms: 0,
      p95Ms: 0,
    },
  );
}

/**
 * Distinct active users in the last 7 / 30 days. "Active" = created at
 * least one workflow_run. We scan workflow_runs once and use FILTER to
 * pull both windows from the same pass.
 */
export async function fetchActiveUsers(): Promise<ActiveUsers> {
  const rows = await db.execute<{ d7: string; d30: string }>(sql`
    SELECT
      COUNT(DISTINCT created_by) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::bigint  AS d7,
      COUNT(DISTINCT created_by) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::bigint AS d30
    FROM workflow_runs
  `);

  const r = (rows as unknown as Array<{ d7: string; d30: string }>)[0];
  return {
    d7:  Number(r?.d7  ?? 0) || 0,
    d30: Number(r?.d30 ?? 0) || 0,
  };
}

/**
 * Current-month spend rollup. Uses monthly_usage so it matches what the
 * spend-cap check sees (single source of truth for billing).
 */
export async function fetchMonthSpend(now: Date = new Date()): Promise<MonthSpend> {
  const monthKey = currentMonthKeyUtc(now);
  const rows = await db.execute<{
    total_fen:    string | null;
    video_count:  string | null;
    user_count:   string | null;
  }>(sql`
    SELECT
      COALESCE(SUM(total_cost_fen), 0)::bigint AS total_fen,
      COALESCE(SUM(video_count), 0)::bigint    AS video_count,
      COUNT(DISTINCT user_id)::bigint          AS user_count
    FROM monthly_usage
    WHERE month_key = ${monthKey}
  `);

  const r = (rows as unknown as Array<{
    total_fen:   string | null;
    video_count: string | null;
    user_count:  string | null;
  }>)[0];
  return {
    monthKey,
    totalFen:   Number(r?.total_fen   ?? 0) || 0,
    videoCount: Number(r?.video_count ?? 0) || 0,
    userCount:  Number(r?.user_count  ?? 0) || 0,
  };
}

const COMPLIANCE_LOG_LIMIT = 30;

/**
 * Recent compliance events (export disclosure off, future admin actions).
 * Joins users for email. Empty when no rows or table not migrated yet.
 */
export async function fetchRecentComplianceLog(): Promise<ComplianceAuditRow[]> {
  try {
    const rows = await db
      .select({
        id:        complianceAuditLogs.id,
        createdAt: complianceAuditLogs.createdAt,
        action:    complianceAuditLogs.action,
        runId:     complianceAuditLogs.runId,
        tenantId:  complianceAuditLogs.tenantId,
        userId:    complianceAuditLogs.userId,
        detail:    complianceAuditLogs.detail,
        userEmail: users.email,
      })
      .from(complianceAuditLogs)
      .innerJoin(users, eq(complianceAuditLogs.userId, users.id))
      .orderBy(desc(complianceAuditLogs.createdAt))
      .limit(COMPLIANCE_LOG_LIMIT);
    return rows.map((r) => ({
      id:        r.id,
      createdAt: r.createdAt.toISOString(),
      action:    r.action,
      runId:     r.runId,
      tenantId:  r.tenantId,
      userId:    r.userId,
      userEmail: r.userEmail,
      detail:    (r.detail as Record<string, unknown>) ?? {},
    }));
  } catch (e) {
    console.warn('[admin] compliance log query failed (migration 003 run yet?)', e);
    return [];
  }
}

const ADMIN_SUMMARY_REVALIDATE_SEC = 60;
const ADMIN_SUMMARY_CACHE_KEY = 'admin-summary-v1';

/**
 * Single entry point — runs all four queries in parallel and stamps a
 * generated-at timestamp. Total wall time = max(individual query) ≈ 50ms
 * on a healthy DB.
 *
 * Result is wrapped in `unstable_cache` (stale-while 60s) to dedupe
 * concurrent/rapid dashboard reloads. Invalidate via `revalidateTag('admin-summary')`
 * if a future admin mutation should force-fresh numbers on next load.
 */
async function fetchAdminSummaryUncached(): Promise<AdminSummary> {
  const now = new Date();
  const [runs, latencyByNode, activeUsers, monthSpend, complianceLog] = await Promise.all([
    fetchRunStats7d(),
    fetchNodeLatency7d(),
    fetchActiveUsers(),
    fetchMonthSpend(now),
    fetchRecentComplianceLog(),
  ]);

  return {
    runs,
    latencyByNode,
    activeUsers,
    monthSpend,
    complianceLog,
    generatedAt: now.toISOString(),
  };
}

export const fetchAdminSummary = unstable_cache(
  fetchAdminSummaryUncached,
  [ADMIN_SUMMARY_CACHE_KEY],
  {
    revalidate: ADMIN_SUMMARY_REVALIDATE_SEC,
    tags:       [ADMIN_SUMMARY_CACHE_TAG], // re-exported via ./cache-tags
  },
);

// ─── Pure formatters (used by page + tests) ───────────────────────────────────

/** Format fen → "¥123.45". Negative-safe (renders as -¥123.45). */
export function formatFen(fen: number): string {
  if (!Number.isFinite(fen)) return '¥0.00';
  const yuan = fen / 100;
  return `${yuan < 0 ? '-' : ''}¥${Math.abs(yuan).toFixed(2)}`;
}

/** Format ms → "1.23s" if ≥1000, else "456ms". 0/NaN → "—". */
export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

/** 0..1 → "97.5%". NaN/empty → "—". */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(1)}%`;
}
