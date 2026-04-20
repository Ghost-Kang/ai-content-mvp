import { Redis } from '@upstash/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Check = 'ok' | 'fail';

export async function GET() {
  const checks: Record<string, Check> = {
    supabase: 'fail',
    redis: 'fail',
    qstash: 'fail',
    posthog: 'fail',
  };

  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error();
    const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key } });
    if (res.status >= 200 && res.status < 500) checks.supabase = 'ok';
  } catch {
    // intentionally swallow — never echo config back to response
  }

  try {
    const redis = Redis.fromEnv();
    if ((await redis.ping()) === 'PONG') checks.redis = 'ok';
  } catch {
    // intentionally swallow
  }

  if (process.env.QSTASH_CURRENT_SIGNING_KEY) checks.qstash = 'ok';
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) checks.posthog = 'ok';

  const allOk = Object.values(checks).every((v) => v === 'ok');
  return Response.json(
    { status: allOk ? 'ok' : 'degraded', checks },
    { status: allOk ? 200 : 503 },
  );
}
