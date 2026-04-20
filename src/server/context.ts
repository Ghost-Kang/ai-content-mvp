// tRPC context factory — called per request
// Extracts tenant + user info from Clerk JWT

import { auth } from '@clerk/nextjs/server';
import { db, users, tenants } from '@/db';
import { eq } from 'drizzle-orm';
import type { Context } from './trpc';

export async function createContext(): Promise<Context> {
  const { userId: clerkUserId, orgId: _orgId } = await auth();

  if (!clerkUserId) {
    // Unauthenticated — return minimal context; tenantProcedure will reject
    return {
      tenantId:    '',
      userId:      '',
      region:      'INTL',
      plan:        'solo',
      clerkUserId: '',
    };
  }

  // Look up our internal user + tenant from the Clerk user ID
  const [user] = await db
    .select({
      id:         users.id,
      tenantId:   users.tenantId,
      tenantRegion: tenants.region,
      tenantPlan:   tenants.plan,
    })
    .from(users)
    .innerJoin(tenants, eq(users.tenantId, tenants.id))
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  if (!user) {
    return {
      tenantId:    '',
      userId:      '',
      region:      'INTL',
      plan:        'solo',
      clerkUserId,
    };
  }

  return {
    tenantId:    user.tenantId,
    userId:      user.id,
    region:      user.tenantRegion as 'CN' | 'INTL',
    plan:        user.tenantPlan as 'solo' | 'team',
    clerkUserId,
  };
}
