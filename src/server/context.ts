// tRPC context factory — called per request
// Extracts tenant + user info from Clerk session; first-time users are
// auto-provisioned into a solo tenant.
//
// Tenant isolation model (W1-04):
// - App-level: every router WHERE clause filters by ctx.tenantId. This is
//   the real security boundary.
// - DB-level: migration 001 enabled Supabase RLS policies that gate rows by
//   current_setting('app.tenant_id'). These DO NOT currently enforce because
//   Drizzle connects as the `postgres` role (superuser bypasses RLS). True
//   enforcement requires moving to a non-superuser role — tracked as W4
//   hardening. Policies are still worth keeping: they document intent and
//   activate the moment we flip roles.

import { auth, currentUser } from '@clerk/nextjs/server';
import { db, users, tenants } from '@/db';
import { eq } from 'drizzle-orm';
import type { Context } from './trpc';
import { isAuthBypassed, SEED_CLERK_USER_ID } from '@/lib/auth/bypass';

const EMPTY_CONTEXT: Context = {
  tenantId:    '',
  userId:      '',
  region:      'INTL',
  plan:        'solo',
  clerkUserId: '',
};

export async function createContext(): Promise<Context> {
  const { userId: clerkUserId } = await auth();
  // Seed 内测旁路: 没有真实 Clerk session 时 fall back 到共享 seed 用户.
  // 真实 session 优先, operator 仍可正常登入测试 Clerk 链路.
  const effectiveClerkUserId = clerkUserId ?? (isAuthBypassed() ? SEED_CLERK_USER_ID : null);
  if (!effectiveClerkUserId) return EMPTY_CONTEXT;

  const existing = await lookupUser(effectiveClerkUserId);
  if (existing) return existing;

  // First sign-in — provision a solo tenant + user
  return await provisionUser(effectiveClerkUserId);
}

async function lookupUser(clerkUserId: string): Promise<Context | null> {
  const [row] = await db
    .select({
      userId:     users.id,
      tenantId:   users.tenantId,
      region:     tenants.region,
      plan:       tenants.plan,
    })
    .from(users)
    .innerJoin(tenants, eq(users.tenantId, tenants.id))
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (!row) return null;
  return {
    tenantId:    row.tenantId,
    userId:      row.userId,
    region:      row.region as 'CN' | 'INTL',
    plan:        row.plan as 'solo' | 'team',
    clerkUserId,
  };
}

async function provisionUser(clerkUserId: string): Promise<Context> {
  const clerkUser = await currentUser();
  const email =
    clerkUser?.emailAddresses[0]?.emailAddress ?? `${clerkUserId}@unknown`;
  const workspaceName = email.split('@')[0] + "'s workspace";

  try {
    return await db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({ name: workspaceName, region: 'CN', plan: 'solo' })
        .returning();

      const [user] = await tx
        .insert(users)
        .values({ tenantId: tenant.id, clerkUserId, email, role: 'owner' })
        .returning();

      return {
        tenantId:    tenant.id,
        userId:      user.id,
        region:      tenant.region as 'CN' | 'INTL',
        plan:        tenant.plan as 'solo' | 'team',
        clerkUserId,
      };
    });
  } catch {
    // Race lost (another request inserted first) — re-select.
    const refetched = await lookupUser(clerkUserId);
    if (refetched) return refetched;
    // If lookup still fails, surface empty — tenantProcedure will reject.
    return { ...EMPTY_CONTEXT, clerkUserId };
  }
}
