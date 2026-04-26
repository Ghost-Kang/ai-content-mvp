// W4-07-V3 — Admin module barrel.
// Page + tests import from this single entrypoint.

export {
  isAdminUser,
  parseAdminUserIds,
  adminUserCount,
} from './is-admin';

export { ADMIN_SUMMARY_CACHE_TAG } from './cache-tags';

export {
  fetchAdminSummary,
  fetchRunStats7d,
  fetchNodeLatency7d,
  fetchActiveUsers,
  fetchMonthSpend,
  fetchRecentComplianceLog,
  currentMonthKeyUtc,
  formatFen,
  formatLatency,
  formatPercent,
  type AdminSummary,
  type RunStats7d,
  type NodeLatencyRow,
  type ActiveUsers,
  type MonthSpend,
  type ComplianceAuditRow,
  type WorkflowStatus,
  type NodeType,
} from './queries';
