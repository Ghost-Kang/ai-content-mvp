// W4-07-V3 — Admin allowlist gate.
//
// Admin in MVP-1 = "the operator running this instance" (single solo founder
// or a tiny ops team). We DO NOT lift admin-ness from Clerk roles because:
//   - Clerk Free tier doesn't have org/role primitives we trust
//   - Anyone with a Clerk login already passes regular auth — admin is a
//     SEPARATE allowlist (env-controlled, redeploy to change) so a leaked
//     user account can't promote itself
//   - Audit trail for "who is admin" lives in env config + git history, not
//     in a database row that requires DBA queries to inspect
//
// Env contract:
//   ADMIN_USER_IDS=user_2abc...,user_2xyz...   (comma-separated Clerk userIds)
//   - whitespace + empty entries tolerated, deduped
//   - if unset OR empty → NO admin exists (page returns 404)
//   - leading/trailing whitespace AND quoting are stripped
//
// This module is pure (zero DB / IO) so it can be unit-tested without
// spinning up Clerk or Supabase.

/**
 * Parses the ADMIN_USER_IDS env value into a normalized Set. Exported only
 * for tests — runtime callers should use `isAdminUser()` which reads
 * process.env directly so changes propagate without restart in dev.
 */
export function parseAdminUserIds(raw: string | undefined | null): Set<string> {
  if (!raw) return new Set();
  const trimmed = raw.trim();
  if (!trimmed) return new Set();

  // Strip surrounding quotes a Vercel env var or shell paste sometimes adds.
  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;

  const parts = unquoted
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return new Set(parts);
}

/**
 * Returns true iff `clerkUserId` is in the ADMIN_USER_IDS allowlist.
 * Defaults to false on every error path (fail-closed).
 */
export function isAdminUser(
  clerkUserId: string | null | undefined,
  adminIdsRaw: string | undefined | null = process.env.ADMIN_USER_IDS,
): boolean {
  if (!clerkUserId) return false;
  const ids = parseAdminUserIds(adminIdsRaw);
  return ids.has(clerkUserId);
}

/**
 * Returns the count of configured admins. Used by the admin page to render
 * a config-warning banner when the allowlist is empty (so the operator
 * notices their dashboard is open by accident).
 */
export function adminUserCount(
  adminIdsRaw: string | undefined | null = process.env.ADMIN_USER_IDS,
): number {
  return parseAdminUserIds(adminIdsRaw).size;
}
