// W4-07 — Append-only compliance events (export-level high-risk choices).

import { revalidateTag } from 'next/cache';
import { db, complianceAuditLogs } from '@/db';
import { ADMIN_SUMMARY_CACHE_TAG } from '@/lib/admin/cache-tags';

export const COMPLIANCE_ACTION_EXPORT_DISCLOSURE_OFF =
  'export_ai_disclosure_disabled' as const;

/**
 * FCPXML 未输出 CAC disclosure 时记一条。失败不抛（避免用户丢导出）；
 * `revalidateTag` 在无 Next 静态存储的进程里会 catch 掉。
 */
export async function recordExportAiDisclosureDisabled(args: {
  tenantId: string;
  runId:    string;
  userId:   string;
  topic:    string;
}): Promise<void> {
  try {
    await db.insert(complianceAuditLogs).values({
      tenantId: args.tenantId,
      runId:    args.runId,
      userId:   args.userId,
      action:   COMPLIANCE_ACTION_EXPORT_DISCLOSURE_OFF,
      detail:   { topic: args.topic, source: 'workflow_runs.export_overrides' },
    });
  } catch (e) {
    console.error('[compliance-audit] insert failed', e);
  }
  try {
    revalidateTag(ADMIN_SUMMARY_CACHE_TAG);
  } catch {
    // next/cache only in App Router / route context
  }
}
