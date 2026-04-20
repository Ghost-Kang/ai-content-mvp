// tRPC server initialization
// All routers import from this file — never instantiate TRPCError or initTRPC elsewhere.

import { initTRPC, TRPCError } from '@trpc/server';
import { type NextRequest } from 'next/server';
import superjson from 'superjson';

// ─── Context ──────────────────────────────────────────────────────────────────

export interface Context {
  tenantId: string;
  userId: string;
  region: 'CN' | 'INTL';
  plan: 'solo' | 'team';
  clerkUserId: string;
  req?: NextRequest;
}

// ─── tRPC init ────────────────────────────────────────────────────────────────

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Tenant-authenticated procedure — requires valid context (set by middleware)
export const tenantProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.tenantId || !ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx });
});
