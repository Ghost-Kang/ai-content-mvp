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
  const errors: Record<string, string> = {};

  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('missing SUPABASE_URL or SUPABASE_ANON_KEY');
    const res = await fetch(`${url}/rest/v1/?apikey=${key}`, {
      method: 'GET',
      headers: { apikey: key },
    });
    if (res.status >= 200 && res.status < 500) checks.supabase = 'ok';
    else throw new Error(`http ${res.status}`);
  } catch (e) {
    errors.supabase = (e as Error).message;
  }

  try {
    const redis = Redis.fromEnv();
    const pong = await redis.ping();
    if (pong === 'PONG') checks.redis = 'ok';
    else throw new Error(`unexpected: ${pong}`);
  } catch (e) {
    errors.redis = (e as Error).message;
  }

  if (process.env.QSTASH_CURRENT_SIGNING_KEY) checks.qstash = 'ok';
  else errors.qstash = 'missing QSTASH_CURRENT_SIGNING_KEY';

  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) checks.posthog = 'ok';
  else errors.posthog = 'missing NEXT_PUBLIC_POSTHOG_KEY';

  const allOk = Object.values(checks).every((v) => v === 'ok');
  return Response.json(
    { status: allOk ? 'ok' : 'degraded', checks, errors },
    { status: allOk ? 200 : 503 },
  );
}
