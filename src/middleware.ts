import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/',              // landing page
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/trpc(.*)',  // tRPC handles its own auth; context returns empty for unauthed calls
  '/api/healthz',   // readiness probe, no auth
  // W2-07a — QStash worker webhook. NEVER add Clerk auth here:
  // QStash is a server-to-server caller with its own signature
  // verification (verifySignatureAppRouter wraps the handler). Adding
  // Clerk middleware would 307 → /sign-in and QStash treats that as
  // delivery failure → retries 3x → all fail → run stuck pending.
  // Auth model: QStash signature is the AuthN; CAS lock on
  // workflow_runs.status is the AuthZ (only pending/failed runs can
  // be picked up).
  '/api/workflow/run',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const { userId } = await auth();
  if (!userId) {
    const signInUrl = new URL('/sign-in', req.url);
    signInUrl.searchParams.set('redirect_url', req.url);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
